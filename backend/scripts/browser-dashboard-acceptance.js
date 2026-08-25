import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import dns from "node:dns";
import dotenv from "dotenv";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(fileURLToPath(new URL("../.env", import.meta.url))), override: false });

const DATABASE = process.env.MONGODB_DB_NAME || "";
if (!DATABASE.startsWith("cheatlock_runtime_verify_")) {
  throw new Error("Refusing browser acceptance writes outside the isolated runtime-verification database.");
}

if (process.env.MONGODB_DNS_SERVERS) {
  dns.setServers(process.env.MONGODB_DNS_SERVERS.split(",").map((value) => value.trim()).filter(Boolean));
}

const API = process.env.RUNTIME_API_URL || "http://127.0.0.1:3100";
const DASHBOARD = process.env.RUNTIME_DASHBOARD_URL || "http://127.0.0.1:5174";
const CHROME = process.env.RUNTIME_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const requireFromDashboard = createRequire(new URL("../../web-dashboard/package.json", import.meta.url));
const { io } = requireFromDashboard("socket.io-client");
const [{ User }, { Exam }, { ExamSession }] = await Promise.all([
  import("../src/models/User.js"),
  import("../src/models/Exam.js"),
  import("../src/models/ExamSession.js"),
]);

const runId = crypto.randomUUID().slice(0, 8);
const password = `Acceptance-${crypto.randomUUID()}-Aa9!`;
const teacherId = `browser-teacher-${runId}@cheatlock.test`;
const studentId = `browser-student-${runId}@cheatlock.test`;
const proctorId = `browser-proctor-${runId}@cheatlock.test`;
const observations = { browser: {}, auth: {}, qr: {}, scores: {}, commands: {}, liveList: {}, evidence: {}, responsive: {} };
const pageErrors = [];
const sockets = [];
let browser;

function assert(name, condition, actual = null) {
  if (!condition) throw new Error(`${name} failed${actual == null ? "" : `: ${JSON.stringify(actual)}`}`);
  return true;
}

async function request(path, { token, method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expected) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function loginApi(identifier, role) {
  return request("/auth/login", { method: "POST", body: { identifier, password, role } });
}

function connect(token) {
  return new Promise((resolveSocket, reject) => {
    const socket = io(API, { auth: { token }, transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    const timer = setTimeout(() => reject(new Error("Student socket connection timed out.")), 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolveSocket(socket);
    });
    socket.once("connect_error", reject);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolveAck, reject) => {
    socket.timeout(10_000).emit(event, payload, (error, ack) => error ? reject(error) : resolveAck(ack));
  });
}

async function clickText(page, text, selector = "button, a") {
  const clicked = await page.evaluate(({ text, selector }) => {
    const element = [...document.querySelectorAll(selector)].find((candidate) => candidate.textContent?.trim() === text && candidate.getClientRects().length > 0);
    if (!element) return false;
    element.click();
    return true;
  }, { text, selector });
  assert(`click ${text}`, clicked);
}

async function typeVisible(page, selector, value, index = 0) {
  const elements = await page.$$(selector);
  const visible = [];
  for (const element of elements) {
    if (await element.evaluate((node) => node.getClientRects().length > 0)) visible.push(element);
  }
  const target = visible[index];
  assert(`visible input ${selector}`, Boolean(target), { count: visible.length, index });
  await target.click({ clickCount: 3 });
  await target.type(value);
}

async function waitBody(page, text, timeout = 15_000) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout }, text);
}

async function renderedStudentText(page) {
  return page.evaluate((id) => {
    const tile = [...document.querySelectorAll('[role="button"]')].find((element) => element.textContent?.includes(id));
    return tile?.textContent || "";
  }, studentId);
}

async function waitRenderedScore(page, score) {
  await page.waitForFunction(({ id, score }) => {
    const tile = [...document.querySelectorAll('[role="button"]')].find((element) => element.textContent?.includes(id));
    return Boolean(tile?.textContent?.includes(`${score}%`));
  }, { timeout: 15_000 }, { id: studentId, score });
  return renderedStudentText(page);
}

async function scoreEvent(socket, examId, delta, mutationId) {
  const before = await ExamSession.findOne({ examId, studentId }).lean();
  const ack = await emitAck(socket, "suspicion_score_updated", {
    examId: String(examId), studentId, scoreDelta: delta, mutationId, attemptStartedAt: before.startedAt,
  });
  assert(`score ack ${mutationId}`, ack?.ok === true, ack);
  return { before: before.suspicionScore, protocol: ack.student.suspicionScore };
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DATABASE });
  const passwordHash = await bcrypt.hash(password, 10);
  await User.create([
    { name: "Browser Acceptance Teacher", identifier: teacherId, passwordHash, role: "TEACHER", status: "ACTIVE" },
    { name: "Browser Acceptance Student", identifier: studentId, passwordHash, role: "STUDENT", status: "ACTIVE" },
    { name: "Browser Acceptance Proctor", identifier: proctorId, passwordHash, role: "PROCTOR", status: "ACTIVE" },
  ]);
  const exam = await Exam.create({
    title: `Browser Acceptance ${runId}`,
    durationMinutes: 60,
    lockAnswers: true,
    status: "LIVE",
    startedAt: new Date(),
    scheduledStartAt: new Date(),
    scheduledEndAt: new Date(Date.now() + 3_600_000),
    questions: [{ id: "browser-q1", type: "CQ", text: "Browser acceptance question", marks: 1 }],
    assignedStudents: [studentId],
    accessCode: `B${runId}`.slice(0, 8).toUpperCase(),
    accessLink: `${DASHBOARD}/student/exam/${runId}`,
    createdBy: teacherId,
  });
  const teacherAuth = await loginApi(teacherId, "TEACHER");
  const studentAuth = await loginApi(studentId, "STUDENT");

  browser = await puppeteer.launch({ headless: "new", executablePath: CHROME, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${DASHBOARD}/exams/${exam._id}/live`, { waitUntil: "networkidle0" });
  assert("protected route redirects", page.url().endsWith("/login"), page.url());

  await typeVisible(page, 'input[type="email"]', teacherId);
  await typeVisible(page, 'input[type="password"]', "incorrect-password");
  await clickText(page, "Sign In");
  await waitBody(page, "Invalid credentials");
  observations.auth.invalidLogin = "PASS";

  await typeVisible(page, 'input[type="email"]', teacherId);
  await typeVisible(page, 'input[type="password"]', password);
  await clickText(page, "Sign In");
  await page.waitForFunction(() => location.pathname.includes("/exams/") && location.pathname.endsWith("/live"), { timeout: 15_000 });
  await waitBody(page, exam.title);
  observations.auth.validLogin = "PASS";
  observations.auth.directProtectedRoute = "PASS";

  for (const route of ["users", "institution", "audit-logs", "settings", "model-card"]) {
    await page.goto(`${DASHBOARD}/${route}`, { waitUntil: "networkidle0" });
    assert(`hidden route ${route}`, new URL(page.url()).pathname === "/", page.url());
  }
  observations.auth.teacherAdminSeparation = "PASS";
  observations.auth.hiddenFeatures = "PASS";

  await page.goto(`${DASHBOARD}/exams/${exam._id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction((label) => {
    const image = [...document.querySelectorAll("img")].find((element) => element.alt === label);
    return Boolean(image?.getAttribute("src")?.startsWith("data:image/png;base64,"));
  }, { timeout: 15_000 }, `QR code for ${exam.title}`);
  const qrResult = await page.evaluate((label) => {
    const image = [...document.querySelectorAll("img")].find((element) => element.alt === label);
    const download = [...document.querySelectorAll("a")].find((element) => element.textContent?.trim() === "Download QR code");
    return {
      rendered: Boolean(image),
      localDataUrl: Boolean(image?.getAttribute("src")?.startsWith("data:image/png;base64,")),
      downloadable: download?.getAttribute("download") === "cheatlock-exam-qr.png",
    };
  }, `QR code for ${exam.title}`);
  assert("local exam QR code", qrResult.rendered && qrResult.localDataUrl && qrResult.downloadable, qrResult);
  observations.qr = { ...qrResult, result: "PASS" };

  await page.goto(`${DASHBOARD}/exams/${exam._id}/live`, { waitUntil: "networkidle0" });
  await waitBody(page, exam.title);
  const studentSocket = await connect(studentAuth.token);
  await request("/sessions/start", { token: studentAuth.token, method: "POST", body: { examId: String(exam._id), deviceId: `browser-${runId}` } });
  const joinAck = await emitAck(studentSocket, "student_joined_exam", { examId: String(exam._id), studentId });
  assert("student joins", joinAck?.ok === true, joinAck);
  await waitBody(page, studentId);
  await waitRenderedScore(page, 0);
  observations.liveList.joinAfterTeacher = "PASS";

  for (const [name, delta, expected] of [["0_to_20", 20, 20], ["20_to_60", 40, 60]]) {
    const mutationId = `${runId}-${name}`;
    const protocol = await scoreEvent(studentSocket, exam._id, delta, mutationId);
    const rendered = await waitRenderedScore(page, expected);
    const db = await ExamSession.findOne({ examId: exam._id, studentId }).lean();
    observations.scores[name] = { mutationId, scoreDelta: delta, dbBefore: protocol.before, dbAfter: db.suspicionScore, mobileProtocol: protocol.protocol, dashboardRendered: rendered.includes(`${expected}%`) ? expected : null };
    assert(name, db.suspicionScore === expected && protocol.protocol === expected && rendered.includes(`${expected}%`), observations.scores[name]);
  }

  await page.reload({ waitUntil: "networkidle0" });
  await waitRenderedScore(page, 60);
  observations.scores.browserRefresh = { db: 60, dashboardRendered: 60 };

  await page.setOfflineMode(true);
  await waitBody(page, "Disconnected");
  const reconnectProtocol = await scoreEvent(studentSocket, exam._id, 20, `${runId}-60-to-80`);
  await page.setOfflineMode(false);
  const reconnectRendered = await waitRenderedScore(page, 80);
  const reconnectDb = await ExamSession.findOne({ examId: exam._id, studentId }).lean();
  observations.scores["60_to_80"] = { dbBefore: 60, dbAfter: reconnectDb.suspicionScore, mobileProtocol: reconnectProtocol.protocol, dashboardRendered: reconnectRendered.includes("80%") ? 80 : null };
  observations.scores.socketReconnect = { db: 80, dashboardRendered: 80 };
  assert("socket reconnect rendered", reconnectDb.suspicionScore === 80 && reconnectRendered.includes("80%"));

  await page.evaluate((id) => {
    const tile = [...document.querySelectorAll('[role="button"]')].find((element) => element.textContent?.includes(id));
    tile?.click();
  }, studentId);
  await waitBody(page, "Liveness Challenge");
  const receivedCommands = [];
  studentSocket.on("teacher_command", (payload) => {
    if (payload.studentId === studentId) receivedCommands.push(payload.command);
  });
  const commandButtons = [
    ["REQUEST_LIVENESS", "Liveness Challenge", false],
    ["REQUEST_ROOM_SCAN", "Room Scan", false],
    ["PAUSE_EXAM", "Pause Exam", true],
    ["RESUME_EXAM", "Resume Exam", false],
    ["LOCK_EXAM", "Lock Student", true],
    ["END_EXAM", "Force End Exam", true],
  ];
  await typeVisible(page, '#proctor-warning-message', "Browser acceptance warning");
  const warnBefore = receivedCommands.length;
  await page.click(`[aria-label="Send warning to Browser Acceptance Student"]`);
  await page.waitForFunction(() => document.body.innerText.includes("Warn Student sent to selected student"), { timeout: 15_000 });
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  assert("warn received", receivedCommands.slice(warnBefore).includes("WARN_STUDENT"), receivedCommands);
  observations.commands.WARN_STUDENT = "PASS";

  for (const [command, label, confirmation] of commandButtons) {
    const before = receivedCommands.length;
    await clickText(page, label);
    if (confirmation) await clickText(page, "Confirm");
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
    assert(`${command} received`, receivedCommands.slice(before).includes(command), receivedCommands.slice(before));
    await waitBody(page, "sent to selected student");
    observations.commands[command] = "PASS";
  }

  const duplicateBefore = receivedCommands.filter((command) => command === "REQUEST_LIVENESS").length;
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Liveness Challenge");
    button?.click();
    button?.click();
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  const duplicateAfter = receivedCommands.filter((command) => command === "REQUEST_LIVENESS").length;
  observations.commands.duplicateLivenessCount = duplicateAfter - duplicateBefore;
  assert("teacher command duplicate guard", duplicateAfter - duplicateBefore === 1, observations.commands);

  const evidence = "data:image/jpeg;base64,/9j/2Q==";
  await emitAck(studentSocket, "camera_preview_updated", { examId: String(exam._id), studentId, previewBase64: evidence, evidenceId: `${runId}-camera` });
  await page.waitForFunction(() => Boolean(document.querySelector('img[alt="Browser Acceptance Student feed"]')), { timeout: 15_000 });
  await emitAck(studentSocket, "screen_telemetry_uploaded", { examId: String(exam._id), studentId, base64: evidence, evidenceId: `${runId}-screen` });
  await clickText(page, "Screen Snapshot");
  await page.waitForFunction(() => Boolean(document.querySelector('img[alt="Screen Feed"]')), { timeout: 15_000 });
  observations.evidence.inlineCameraRendered = "PASS";
  observations.evidence.inlineScreenRendered = "PASS";

  studentSocket.disconnect();
  await page.waitForFunction((id) => {
    const tile = [...document.querySelectorAll('[role="button"]')].find((element) => element.textContent?.includes(id));
    return Boolean(tile?.textContent?.includes("Offline"));
  }, { timeout: 15_000 }, studentId);
  observations.liveList.unexpectedDisconnect = "PASS";

  const studentSocket2 = await connect(studentAuth.token);
  const currentSession = await ExamSession.findOne({ examId: exam._id, studentId }).lean();
  const rejoinAck = await emitAck(studentSocket2, "student_joined_exam", { examId: String(exam._id), studentId, attemptStartedAt: currentSession.startedAt });
  assert("student reconnect", rejoinAck?.ok === true, rejoinAck);
  await page.waitForFunction((id) => {
    const tile = [...document.querySelectorAll('[role="button"]')].find((element) => element.textContent?.includes(id));
    return Boolean(tile?.textContent?.includes("Live"));
  }, { timeout: 15_000 }, studentId);
  observations.liveList.reconnect = "PASS";

  for (const [width, label] of [[1920, "desktop"], [1366, "laptop"], [768, "tablet"]]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      navVisible: Boolean(document.querySelector('nav[aria-label="Primary dashboard navigation"]')?.getClientRects().length),
      liveHeadingVisible: [...document.querySelectorAll("h1,h2")].some((element) => element.textContent?.includes("Browser Acceptance") && element.getClientRects().length > 0),
    }));
    observations.responsive[label] = layout;
    assert(`responsive ${label}`, layout.navVisible && layout.liveHeadingVisible && layout.bodyWidth <= layout.viewportWidth + 2, layout);
  }

  await User.updateOne({ identifier: teacherId }, { $inc: { tokenVersion: 1 } });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });
  observations.auth.revokedTokenRedirect = "PASS";

  await typeVisible(page, 'input[type="email"]', proctorId);
  await typeVisible(page, 'input[type="password"]', password);
  await clickText(page, "Sign In");
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });
  observations.auth.unsupportedProctorEntry = "PASS";

  observations.browser = {
    automation: "AVAILABLE",
    product: await browser.version(),
    dashboard: DASHBOARD,
    pageErrors,
  };
  assert("no browser page errors", pageErrors.length === 0, pageErrors);
  console.log(JSON.stringify({ ok: true, database: DATABASE, examId: String(exam._id), observations }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
  if (browser) await browser.close();
  await mongoose.disconnect();
}
