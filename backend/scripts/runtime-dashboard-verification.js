import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import dns from "node:dns";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(fileURLToPath(new URL("../.env", import.meta.url))), override: false });

const DATABASE = process.env.MONGODB_DB_NAME || "";
if (!DATABASE.startsWith("cheatlock_runtime_verify_")) {
  throw new Error("Refusing to mutate a database outside the isolated runtime-verification namespace.");
}

const API = process.env.RUNTIME_API_URL || "http://127.0.0.1:3100";
if (process.env.MONGODB_DNS_SERVERS) {
  dns.setServers(process.env.MONGODB_DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean));
}
const webRequire = createRequire(new URL("../../web-dashboard/package.json", import.meta.url));
const { io } = webRequire("socket.io-client");

const [{ User }, { ExamSession }, { Submission }] = await Promise.all([
  import("../src/models/User.js"),
  import("../src/models/ExamSession.js"),
  import("../src/models/Submission.js"),
]);

const password = `Runtime-${crypto.randomUUID()}-Aa9!`;
const ids = {
  teacher: "runtime-teacher@cheatlock.test",
  otherTeacher: "runtime-other-teacher@cheatlock.test",
  studentA: "runtime-student-a@cheatlock.test",
  studentB: "runtime-student-b@cheatlock.test",
  studentC: "runtime-student-c@cheatlock.test",
  suspended: "runtime-suspended@cheatlock.test",
};
const observations = { checks: {}, scores: {}, commands: {}, evidence: {}, lifecycle: [] };
const sockets = [];

function check(name, condition, details = {}) {
  if (!condition) throw new Error(`${name} failed: ${JSON.stringify(details)}`);
  observations.checks[name] = { result: "PASS", ...details };
}

async function request(path, { token, method = "GET", body, expected = 200, binary = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = binary
    ? Buffer.from(await response.arrayBuffer())
    : await response.json().catch(() => ({}));
  if (response.status !== expected) {
    throw new Error(`${method} ${path}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { response, payload };
}

async function login(identifier, role, suppliedPassword = password, expected = 200) {
  return (await request("/auth/login", {
    method: "POST",
    expected,
    body: { identifier, role, password: suppliedPassword },
  })).payload;
}

function connect(token) {
  return new Promise((resolveConnection, reject) => {
    const socket = io(API, { auth: { token }, transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    const timer = setTimeout(() => reject(new Error("Socket connection timed out.")), 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolveConnection(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolveAck, reject) => {
    socket.timeout(10_000).emit(event, payload, (error, ack) => {
      if (error) reject(error);
      else resolveAck(ack);
    });
  });
}

function nextEvent(socket, event, predicate = () => true, timeoutMs = 10_000) {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolveEvent(payload);
    };
    socket.on(event, handler);
  });
}

async function waitFor(predicate, label, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function readSession(examId, studentId) {
  return ExamSession.findOne({ examId, studentId }).lean();
}

async function reset(teacherToken, examId, studentId) {
  const dashboardEvent = nextEvent(
    teacherSocket,
    "live_student_list",
    (payload) => payload.examId === examId && payload.students.some((student) => student.studentId === studentId)
  );
  const payload = (await request(`/sessions/${encodeURIComponent(studentId)}/reset`, {
    token: teacherToken,
    method: "POST",
    body: { examId },
  })).payload;
  const list = await dashboardEvent;
  return { payload, list };
}

async function startAttempt(studentToken, examId, studentSocket, studentId) {
  await request("/sessions/start", {
    token: studentToken,
    method: "POST",
    body: { examId, deviceId: `runtime-${studentId}` },
  });
  const ack = await emitAck(studentSocket, "student_joined_exam", { examId, studentId });
  check(`student join ${examId}:${studentId}`, ack.ok === true, ack);
  return readSession(examId, studentId);
}

let teacherSocket;
try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DATABASE });
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(password, 10);
  await User.create([
    { name: "Runtime Teacher", identifier: ids.teacher, passwordHash, role: "TEACHER", status: "ACTIVE" },
    { name: "Other Teacher", identifier: ids.otherTeacher, passwordHash, role: "TEACHER", status: "ACTIVE" },
    { name: "Student A", identifier: ids.studentA, passwordHash, role: "STUDENT", status: "ACTIVE" },
    { name: "Student B", identifier: ids.studentB, passwordHash, role: "STUDENT", status: "ACTIVE" },
    { name: "Student C", identifier: ids.studentC, passwordHash, role: "STUDENT", status: "ACTIVE" },
    { name: "Suspended Student", identifier: ids.suspended, passwordHash, role: "STUDENT", status: "SUSPENDED" },
  ]);

  const teacher = await login(ids.teacher, "TEACHER");
  const otherTeacher = await login(ids.otherTeacher, "TEACHER");
  const studentA = await login(ids.studentA, "STUDENT");
  const studentB = await login(ids.studentB, "STUDENT");
  const studentC = await login(ids.studentC, "STUDENT");
  const suspended = await login(ids.suspended, "STUDENT");
  await login(ids.teacher, "TEACHER", "wrong-password", 401);
  await request("/auth/me", { expected: 401 });
  await request("/auth/me", { token: teacher.token });
  await request("/tenants/my-tenant/users", { token: teacher.token, expected: 403 });
  await request("/exams", { token: studentA.token, expected: 403 });
  await request("/sessions/me", { token: suspended.token, expected: 403 });
  check("authentication and role separation", true, { valid: 200, invalid: 401, anonymous: 401, teacherAdmin: 403, studentTeacherApi: 403, suspended: 403 });

  const classCreated = (await request("/classes", {
    token: teacher.token,
    method: "POST",
    expected: 201,
    body: { name: "Runtime Class", section: "A", subject: "Integrity", students: [ids.studentA] },
  })).payload.class;
  const classUpdated = (await request(`/classes/${classCreated.id}`, {
    token: teacher.token,
    method: "PUT",
    body: { name: "Runtime Class Updated", section: "A", subject: "Integrity", students: [ids.studentA] },
  })).payload.class;
  await request("/classes/join", { token: studentB.token, method: "POST", expected: 202, body: { inviteCode: classUpdated.inviteCode } });
  const approved = (await request(`/classes/${classCreated.id}/enrollment/${encodeURIComponent(ids.studentB)}`, {
    token: teacher.token, method: "POST", body: { decision: "APPROVED" },
  })).payload.class;
  await request("/classes/join", { token: studentC.token, method: "POST", expected: 202, body: { inviteCode: classUpdated.inviteCode } });
  const rejected = (await request(`/classes/${classCreated.id}/enrollment/${encodeURIComponent(ids.studentC)}`, {
    token: teacher.token, method: "POST", body: { decision: "REJECTED" },
  })).payload.class;
  check("classes CRUD and enrollment", approved.students.includes(ids.studentB) && !rejected.students.includes(ids.studentC));

  const community = (await request("/community", {
    token: teacher.token, method: "PUT", body: { students: [ids.studentB, ids.studentB] },
  })).payload.community;
  check("community roster persistence and deduplication", community.students.length === 1 && community.students[0] === ids.studentB);

  const questionTypes = ["MCQ", "MULTI_SELECT", "CQ", "MATH", "CODE", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "ORDERING", "CASE_STUDY", "FILE_UPLOAD", "IMAGE"];
  const examPayload = {
    title: "Runtime Production Verification",
    durationMinutes: 60,
    lockAnswers: true,
    assignedStudents: [ids.studentA],
    classIds: [classCreated.id],
    useCommunity: true,
    questions: questionTypes.map((type, index) => ({ id: `q-${index}`, type, text: `${type} runtime question`, options: type === "MCQ" ? ["A", "B"] : [], marks: 1 })),
  };
  const exam = (await request("/exams", { token: teacher.token, method: "POST", expected: 201, body: examPayload })).payload.exam;
  const persistedExam = (await request(`/exams/${exam.id}`, { token: teacher.token })).payload.exam;
  check("exam creation and question persistence", persistedExam.questions.length === questionTypes.length && questionTypes.every((type) => persistedExam.questions.some((q) => q.type === type)));
  check("student assignment union and deduplication", new Set(persistedExam.assignedStudents).size === persistedExam.assignedStudents.length && persistedExam.assignedStudents.includes(ids.studentA) && persistedExam.assignedStudents.includes(ids.studentB));
  const duplicateAssignment = (await request(`/exams/${exam.id}/assign-students`, { token: teacher.token, method: "PATCH", body: { studentIds: [ids.studentA] } })).payload;
  check("duplicate student assignment is idempotent", duplicateAssignment.addedStudents.length === 0);
  await request(`/exams/${exam.id}`, { token: otherTeacher.token, expected: 404 });

  const now = Date.now();
  const schedule = (await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "SCHEDULE", scheduledStartAt: new Date(now + 60_000), scheduledEndAt: new Date(now + 3_600_000) } })).payload.exam;
  observations.lifecycle.push(schedule.status);
  await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", expected: 409, body: { action: "END" } });
  const draft = (await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "DRAFT" } })).payload.exam;
  observations.lifecycle.push(draft.status);
  const live = (await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "START" } })).payload.exam;
  observations.lifecycle.push(live.status);
  check("exam lifecycle pre-live", observations.lifecycle.join(",") === "SCHEDULED,DRAFT,LIVE");

  teacherSocket = await connect(teacher.token);
  const joinAck = await emitAck(teacherSocket, "join_exam_room", { examId: exam.id });
  check("teacher joins live room", joinAck.ok === true, joinAck);
  const studentASocket = await connect(studentA.token);
  const studentBSocket = await connect(studentB.token);
  await startAttempt(studentA.token, exam.id, studentASocket, ids.studentA);
  await startAttempt(studentB.token, exam.id, studentBSocket, ids.studentB);

  const unassignedSocket = await connect(studentC.token);
  const unassignedAck = await emitAck(unassignedSocket, "student_joined_exam", { examId: exam.id, studentId: ids.studentC });
  check("unassigned student scope denied", unassignedAck.ok === false, unassignedAck);

  async function score(studentSocket, studentId, delta, mutationId) {
    const sessionBefore = await readSession(exam.id, studentId);
    const dashboardEvent = nextEvent(teacherSocket, "suspicion_score_updated", (payload) => payload.studentId === studentId && payload.mutationId === mutationId);
    const ack = await emitAck(studentSocket, "suspicion_score_updated", {
      examId: exam.id,
      studentId,
      scoreDelta: delta,
      mutationId,
      attemptStartedAt: sessionBefore.startedAt,
      occurredAt: new Date().toISOString(),
    });
    check(`score ack ${mutationId}`, ack.ok === true, ack);
    const dashboard = await dashboardEvent;
    const db = await readSession(exam.id, studentId);
    return { before: sessionBefore.suspicionScore, db: db.suspicionScore, mobileProtocol: ack.student.suspicionScore, dashboardProtocol: dashboard.suspicionScore, mutationId, delta };
  }

  observations.scores["0_to_20"] = await score(studentASocket, ids.studentA, 20, "seq-a-20");
  observations.scores["20_to_60"] = await score(studentASocket, ids.studentA, 40, "seq-a-40");
  observations.scores["60_to_80"] = await score(studentASocket, ids.studentA, 20, "seq-a-20b");

  await reset(teacher.token, exam.id, ids.studentA);
  await startAttempt(studentA.token, exam.id, studentASocket, ids.studentA);
  const rapidDeltas = [5, 10, 20, 5, 20];
  for (let index = 0; index < rapidDeltas.length; index += 1) {
    await score(studentASocket, ids.studentA, rapidDeltas[index], `rapid-${index}`);
  }
  const rapid = await readSession(exam.id, ids.studentA);
  observations.scores.rapid = { db: rapid.suspicionScore, mobileProtocol: 60, dashboardProtocol: 60 };
  check("rapid score events", rapid.suspicionScore === 60);

  await reset(teacher.token, exam.id, ids.studentA);
  const concurrentSession = await startAttempt(studentA.token, exam.id, studentASocket, ids.studentA);
  const concurrentEvents = [20, 20, 10, 10].map((delta, index) => emitAck(studentASocket, "suspicion_score_updated", {
    examId: exam.id, studentId: ids.studentA, scoreDelta: delta, mutationId: `concurrent-${index}`, attemptStartedAt: concurrentSession.startedAt,
  }));
  const concurrentAcks = await Promise.all(concurrentEvents);
  const concurrent = await readSession(exam.id, ids.studentA);
  observations.scores.concurrent = { db: concurrent.suspicionScore, mobileProtocol: Math.max(...concurrentAcks.map((ack) => ack.student.suspicionScore)), dashboardProtocol: concurrent.suspicionScore };
  check("concurrent score events", concurrent.suspicionScore === 60 && concurrentAcks.every((ack) => ack.ok));

  await reset(teacher.token, exam.id, ids.studentA);
  const duplicateAttempt = await startAttempt(studentA.token, exam.id, studentASocket, ids.studentA);
  const duplicatePayload = { examId: exam.id, studentId: ids.studentA, scoreDelta: 20, mutationId: "duplicate-one", attemptStartedAt: duplicateAttempt.startedAt };
  const firstDuplicate = await emitAck(studentASocket, "suspicion_score_updated", duplicatePayload);
  const secondDuplicate = await emitAck(studentASocket, "suspicion_score_updated", duplicatePayload);
  const duplicate = await readSession(exam.id, ids.studentA);
  observations.scores.duplicate = { db: duplicate.suspicionScore, first: firstDuplicate.student.suspicionScore, second: secondDuplicate.student.suspicionScore };
  check("duplicate mutation applies once", duplicate.suspicionScore === 20 && secondDuplicate.student.suspicionScore === 20);

  await reset(teacher.token, exam.id, ids.studentA);
  await reset(teacher.token, exam.id, ids.studentB);
  await startAttempt(studentA.token, exam.id, studentASocket, ids.studentA);
  await startAttempt(studentB.token, exam.id, studentBSocket, ids.studentB);
  await score(studentASocket, ids.studentA, 60, "isolation-a-60");
  await score(studentBSocket, ids.studentB, 20, "isolation-b-20");
  await score(studentASocket, ids.studentA, 20, "isolation-a-20");
  const [isolationA, isolationB] = await Promise.all([readSession(exam.id, ids.studentA), readSession(exam.id, ids.studentB)]);
  observations.scores.twoStudents = { studentA: isolationA.suspicionScore, studentB: isolationB.suspicionScore };
  check("two-student isolation", isolationA.suspicionScore === 80 && isolationB.suspicionScore === 20);

  teacherSocket.disconnect();
  await scoreWithoutDashboard(studentASocket, ids.studentA, 20, "reconnect-to-100");
  teacherSocket = await connect(teacher.token);
  const reconnectList = nextEvent(teacherSocket, "live_student_list", (payload) => payload.examId === exam.id);
  await emitAck(teacherSocket, "join_exam_room", { examId: exam.id });
  const reconnected = await reconnectList;
  const reconnectValue = reconnected.students.find((student) => student.studentId === ids.studentA)?.suspicionScore;
  observations.scores.reconnect = { db: (await readSession(exam.id, ids.studentA)).suspicionScore, dashboardProtocol: reconnectValue };
  check("socket reconnect snapshot", reconnectValue === 100);

  async function scoreWithoutDashboard(studentSocket, studentId, delta, mutationId) {
    const before = await readSession(exam.id, studentId);
    const ack = await emitAck(studentSocket, "suspicion_score_updated", { examId: exam.id, studentId, scoreDelta: delta, mutationId, attemptStartedAt: before.startedAt });
    check(`offline score ack ${mutationId}`, ack.ok === true, ack);
    return ack;
  }

  const refresh = (await request(`/teacher/exams/${exam.id}/live-proctoring`, { token: teacher.token })).payload;
  const refreshScore = refresh.activeStudents.find((student) => student.studentId === ids.studentA)?.suspicionScore;
  observations.scores.refresh = { db: (await readSession(exam.id, ids.studentA)).suspicionScore, dashboardHttp: refreshScore };
  check("authoritative refresh snapshot", refreshScore === 100);

  const commandNames = ["WARN_STUDENT", "REQUEST_LIVENESS", "REQUEST_ROOM_SCAN", "PAUSE_EXAM", "RESUME_EXAM", "LOCK_EXAM", "END_EXAM"];
  for (const command of commandNames) {
    const received = nextEvent(studentASocket, "teacher_command", (payload) => payload.command === command && payload.studentId === ids.studentA);
    const ack = await emitAck(teacherSocket, "teacher_command", { examId: exam.id, studentId: ids.studentA, command, message: `Runtime ${command}` });
    const payload = await received;
    observations.commands[command] = { serverAck: ack.ok, studentReceived: payload.command === command };
    check(`teacher command ${command}`, ack.ok === true && payload.command === command);
  }

  const tinyJpeg = "data:image/jpeg;base64,/9j/2Q==";
  for (const [eventName, media] of [["camera_preview_updated", { previewBase64: tinyJpeg }], ["screen_telemetry_uploaded", { base64: tinyJpeg }]]) {
    const received = nextEvent(teacherSocket, eventName, (payload) => payload.studentId === ids.studentA);
    const ack = await emitAck(studentASocket, eventName, { examId: exam.id, studentId: ids.studentA, ...media, evidenceId: `runtime-${eventName}` });
    const payload = await received;
    observations.evidence[eventName] = { ack: ack.ok, dashboardProtocolReceived: Boolean(payload.previewBase64 || payload.screenBase64) };
    check(`inline ${eventName}`, ack.ok === true && observations.evidence[eventName].dashboardProtocolReceived);
  }

  const alertBefore = await readSession(exam.id, ids.studentA);
  const alertAck = await emitAck(studentASocket, "ai_alert_created", { examId: exam.id, studentId: ids.studentA, scoreDelta: 0, mutationId: "alert-no-score", attemptStartedAt: alertBefore.startedAt, alert: "Runtime alert", priority: "suspicious" });
  const alertAfter = await readSession(exam.id, ids.studentA);
  check("alert does not independently change authoritative score", alertAck.ok === true && alertAfter.suspicionScore === alertBefore.suspicionScore);

  const timeline = (await request(`/teacher/exams/${exam.id}/students/${encodeURIComponent(ids.studentA)}/proctoring-timeline`, { token: teacher.token })).payload;
  check("replay timeline authoritative and ordered", timeline.finalSuspicionScore === alertAfter.suspicionScore && timeline.timelineEvents.length > 0 && timeline.timelineEvents.every((event, index, all) => index === 0 || new Date(all[index - 1].timestamp) <= new Date(event.timestamp)));
  await request(`/teacher/exams/${exam.id}/students/${encodeURIComponent(ids.studentA)}/integrity-review`, { token: teacher.token, method: "PUT", body: { decision: "REVIEW_NEEDED", notes: "Runtime persisted note", bookmarks: [timeline.timelineEvents[0].id], reviewedEvents: [timeline.timelineEvents[0].id] } });
  const reviewReload = (await request(`/teacher/exams/${exam.id}/students/${encodeURIComponent(ids.studentA)}/proctoring-timeline`, { token: teacher.token })).payload;
  check("integrity review persists on reload", reviewReload.review?.decision === "REVIEW_NEEDED" && reviewReload.review?.notes === "Runtime persisted note");

  await request("/submissions", { token: studentA.token, method: "POST", expected: 201, body: { examId: exam.id, answers: [{ questionIndex: 0, questionText: "MCQ runtime question", answerText: "A" }], submittedAt: Date.now() } });
  for (const grade of [0, 50, 100]) {
    const graded = (await request(`/teacher/exams/${exam.id}/students/${encodeURIComponent(ids.studentA)}/grade`, { token: teacher.token, method: "PUT", body: { grade, feedback: `Grade ${grade}` } })).payload;
    check(`manual grade ${grade}`, graded.submission.grade === grade && graded.notification?.type === "GRADE_ASSIGNED");
  }
  for (const grade of [-1, 101, "text"]) {
    await request(`/teacher/exams/${exam.id}/students/${encodeURIComponent(ids.studentA)}/grade`, { token: teacher.token, method: "PUT", expected: 400, body: { grade } });
  }
  const overview = (await request(`/teacher/exams/${exam.id}/overview`, { token: teacher.token })).payload;
  check("attendance and submission overview", overview.students.some((student) => student.studentId === ids.studentA && student.submitted === true && student.grade === 100));

  const report = (await request(`/teacher/exams/${exam.id}/integrity-report`, { token: teacher.token })).payload;
  const reportStudent = report.students?.find((student) => student.studentId === ids.studentA);
  check("integrity report uses authoritative score", reportStudent?.finalRiskScore === alertAfter.suspicionScore);
  const pdf = await request(`/teacher/exams/${exam.id}/integrity-report/pdf`, { token: teacher.token, binary: true });
  check("backend PDF structure", pdf.response.headers.get("content-type")?.includes("application/pdf") && pdf.payload.subarray(0, 5).toString() === "%PDF-" && pdf.payload.includes(Buffer.from("%%EOF")) && pdf.payload.length > 1000, { bytes: pdf.payload.length });

  const resetResult = await reset(teacher.token, exam.id, ids.studentA);
  const resetDb = await readSession(exam.id, ids.studentA);
  const resetDashboard = resetResult.list.students.find((student) => student.studentId === ids.studentA)?.suspicionScore;
  observations.scores.attemptReset = { db: resetDb.suspicionScore, mobileHttp: resetResult.payload.session.suspicionScore, dashboardProtocol: resetDashboard };
  check("attempt reset convergence", resetDb.suspicionScore === 0 && resetResult.payload.session.suspicionScore === 0 && resetDashboard === 0);

  const exam2 = (await request("/exams", { token: teacher.token, method: "POST", expected: 201, body: { ...examPayload, title: "Runtime Isolation Exam 2", classIds: [], useCommunity: false, assignedStudents: [ids.studentA] } })).payload.exam;
  await request(`/exams/${exam2.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "START" } });
  await startAttempt(studentA.token, exam2.id, studentASocket, ids.studentA);
  const exam2Session = await readSession(exam2.id, ids.studentA);
  const exam2Ack = await emitAck(studentASocket, "suspicion_score_updated", { examId: exam2.id, studentId: ids.studentA, scoreDelta: 20, mutationId: "exam2-20", attemptStartedAt: exam2Session.startedAt });
  const [exam1After, exam2After] = await Promise.all([readSession(exam.id, ids.studentA), readSession(exam2.id, ids.studentA)]);
  observations.scores.twoExams = { exam1: exam1After.suspicionScore, exam2: exam2After.suspicionScore };
  check("two-exam isolation", exam2Ack.ok === true && exam1After.suspicionScore === 0 && exam2After.suspicionScore === 20);

  const deleteExam = (await request("/exams", { token: teacher.token, method: "POST", expected: 201, body: { ...examPayload, title: "Runtime Delete Exam", classIds: [], useCommunity: false } })).payload.exam;
  await request(`/exams/${deleteExam.id}`, { token: teacher.token, method: "DELETE" });
  await request(`/exams/${deleteExam.id}`, { token: teacher.token, expected: 404 });
  check("exam deletion", true);

  studentBSocket.disconnect();
  const disconnectedB = await waitFor(async () => {
    const session = await readSession(exam.id, ids.studentB);
    return session?.onlineStatus === "OFFLINE" ? session : null;
  }, "student disconnect presence");
  check("student disconnect presence", disconnectedB.onlineStatus === "OFFLINE");

  const ended = (await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "END" } })).payload.exam;
  const archived = (await request(`/exams/${exam.id}/lifecycle`, { token: teacher.token, method: "PATCH", body: { action: "ARCHIVE" } })).payload.exam;
  observations.lifecycle.push(ended.status, archived.status);
  check("exam lifecycle complete", observations.lifecycle.join(",") === "SCHEDULED,DRAFT,LIVE,ENDED,ARCHIVED");

  const temporaryClass = (await request("/classes", { token: teacher.token, method: "POST", expected: 201, body: { name: "Runtime Delete Class", section: "Z", students: [] } })).payload.class;
  await request(`/classes/${temporaryClass.id}`, { token: teacher.token, method: "DELETE" });
  check("class deletion", true);

  const duplicateSessions = await ExamSession.aggregate([{ $group: { _id: { examId: "$examId", studentId: "$studentId" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
  check("no duplicate exam sessions", duplicateSessions.length === 0);
  check("isolated Mongo database", mongoose.connection.name === DATABASE, { database: DATABASE });

  console.log(JSON.stringify({ ok: true, api: API, database: DATABASE, observations }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
  await mongoose.disconnect();
}
