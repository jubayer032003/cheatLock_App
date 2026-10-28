import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { Exam } from "../backend/src/models/Exam.js";
import { ExamSession } from "../backend/src/models/ExamSession.js";
import { ProctoringEvent } from "../backend/src/models/ProctoringEvent.js";
import { User } from "../backend/src/models/User.js";
import { IntegrityReview } from "../backend/src/models/IntegrityReview.js";
import { sessionsRouter } from "../backend/src/routes/sessions.js";
import { proctoringRouter } from "../backend/src/routes/proctoring.js";
import { teacherRouter } from "../backend/src/routes/teacher.js";
import { configureProctoringSocket, assertAttemptMatches, emitTeacherCommand, incrementStudentScore, studentAttemptRoom } from "../backend/src/socket/proctoring.js";
import { assertStudentAdmission } from "../backend/src/services/examAdmission.js";
import { clearRateLimiterStateForTests } from "../backend/src/middleware/rateLimiter.js";

// Reuse the dashboard's installed client, without adding a production dependency.
const { io: connect } = createRequire(new URL("../web-dashboard/package.json", import.meta.url))("socket.io-client");
process.env.JWT_SECRET = "phase1-local-test-secret";
const examId = "64a100000000000000000201";
const sessionId = "64a100000000000000000301";
let exam, sessions, users, restores, cleanups;
const query = (value) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === "object" && "$exists" in value ? (row[key] !== undefined) === value.$exists : row[key] === value);
function mock(model, name, fn) { const original = model[name]; restores.push(() => { model[name] = original; }); model[name] = fn; }

beforeEach(() => {
  restores = [];
  cleanups = [];
  clearRateLimiterStateForTests();
  exam = { _id: examId, createdBy: "teacher", assignedStudents: ["student-a", "student-b"], status: "LIVE", durationMinutes: 10 };
  users = [
    { _id: "64a100000000000000000101", identifier: "student-a", role: "STUDENT" },
    { _id: "64a100000000000000000102", identifier: "student-b", role: "STUDENT" },
    { _id: "64a100000000000000000103", identifier: "teacher", role: "TEACHER", tenantId: "tenant-a" },
    { _id: "64a100000000000000000104", identifier: "outsider", role: "TEACHER", tenantId: "tenant-b" },
    { _id: "64a100000000000000000105", identifier: "admin", role: "INSTITUTION_ADMIN", tenantId: "tenant-b" },
  ];
  sessions = ["student-a", "student-b"].map((studentId, index) => ({ _id: index ? sessionId.replace(/1$/, "2") : sessionId, examId, studentId, startedAt: 123, status: "IN_PROGRESS", deviceId: "device-a", onlineStatus: "ONLINE", suspicionScore: 0, answerDraft: { answers: { 0: "preserved" }, revision: 2 } }));
  mock(User, "findById", (id) => query(users.find((user) => user._id === id)));
  mock(User, "findOne", (filter) => query(users.find((user) => matches(user, filter))));
  mock(Exam, "findById", (id) => query(id === examId ? exam : null));
  mock(Exam, "findOne", (filter = {}) => query(Object.entries(filter).every(([key, value]) => Array.isArray(exam[key]) ? exam[key].includes(value) : exam[key] === value) ? exam : null));
  mock(ExamSession, "find", () => query(sessions));
  mock(ExamSession, "findOne", (filter) => query(sessions.find((session) => matches(session, filter))));
  mock(ExamSession, "findOneAndUpdate", (filter, update) => {
    const session = sessions.find((row) => matches(row, filter));
    if (session) {
      const patch = Array.isArray(update) ? update[0].$set : update.$set;
      for (const [key, value] of Object.entries(patch || {})) {
        if (value && typeof value === "object" && "$literal" in value) session[key] = value.$literal;
        else if (value == null || typeof value !== "object" || value instanceof Date) session[key] = value;
      }
      for (const key of Object.keys(update.$unset || {})) delete session[key];
    }
    return query(session || null);
  });
  mock(ProctoringEvent, "findOneAndUpdate", (_filter, update) => query(update.$setOnInsert));
  mock(ProctoringEvent, "exists", () => query(null));
  mock(ProctoringEvent, "findOne", () => query(null));
  mock(ProctoringEvent, "find", () => query([]));
});
afterEach(async () => {
  for (const cleanup of cleanups) await cleanup();
  restores.reverse().forEach((restore) => restore());
});

async function fixture(t) {
  const app = express();
  app.use(express.json());
  app.use("/sessions", sessionsRouter);
  app.use("/proctoring", proctoringRouter);
  app.use("/teacher", teacherRouter);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code, message: err.message }));
  const server = createServer(app);
  const io = new Server(server);
  configureProctoringSocket(io);
  app.set("io", io);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  cleanups.push(async () => {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
    await new Promise(setImmediate);
  });
  const token = (identifier) => {
    const user = users.find((item) => item.identifier === identifier);
    return jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  };
  return {
    io,
    async client(identifier) {
      const socket = connect(base, { auth: { token: token(identifier) }, transports: ["websocket"], reconnection: false });
      clients.push(socket);
      await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
      return socket;
    },
    async request(identifier, path, body, method = body ? "POST" : "GET") {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token(identifier)}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    },
  };
}
const emit = (socket, event, body) => socket.timeout(2000).emitWithAck(event, body);
const event = (overrides = {}) => ({ examId, attemptStartedAt: 123, ...overrides });
const command = (overrides = {}) => event({ studentId: "student-a", command: "WARN_STUDENT", ...overrides });

test("HTTP session endpoints reject unassigned exam IDs before changing state", async (t) => {
  exam.assignedStudents = ["student-b"];
  const f = await fixture(t);
  const before = structuredClone(sessions);
  for (const path of ["/start", "/submit", "/lock"]) assert.equal((await f.request("student-a", "/sessions" + path, { examId })).status, 403);
  assert.equal((await f.request("student-a", `/sessions/me?examId=${examId}`)).status, 403);
  assert.deepEqual(sessions, before);
});

test("student endpoints reject staff bypass, malformed IDs and missing admissions", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("admin", "/sessions/start", { examId })).status, 403);
  assert.equal((await f.request("student-a", "/sessions/start", { examId: "invalid" })).status, 400);
  assert.equal((await f.request("student-a", "/sessions/start", { examId: examId.replace(/1$/, "9") })).status, 403);
});

test("assignment matching never aliases punctuation-separated accounts", () => {
  assert.throws(() => assertStudentAdmission({ role: "STUDENT", identifier: "a-b" }, { assignedStudents: ["ab"] }), /not assigned/);
});

test("start retries preserve attempt identity and answers; foreign or omitted bound device fails", async (t) => {
  const f = await fixture(t);
  for (let n = 0; n < 2; n++) {
    const result = await f.request("student-a", "/sessions/start", { examId, deviceId: "device-a" });
    assert.equal(result.status, 200);
    assert.equal(result.body.session.startedAt, 123);
  }
  for (const deviceId of ["other", ""]) assert.equal((await f.request("student-a", "/sessions/start", { examId, deviceId })).status, 409);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "preserved" });
});

test("concurrent session changes fail start without overwriting a newer attempt", async (t) => {
  const f = await fixture(t);
  const before = structuredClone(sessions[0]);
  const original = ExamSession.findOneAndUpdate;
  mock(ExamSession, "findOneAndUpdate", (filter, ...args) => filter.status ? query(null) : original(filter, ...args));
  const response = await f.request("student-a", "/sessions/start", { examId, deviceId: "device-a" });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "SESSION_START_CONFLICT");
  assert.deepEqual(sessions[0], before);
});

test("authorized monitoring join preserves the server start timestamp", async (t) => {
  const f = await fixture(t);
  const response = await f.request("student-a", "/proctoring/events", event({ eventName: "student_joined_exam" }));
  assert.equal(response.status, 200);
  assert.equal(response.body.student.attemptStartedAt, 123);
  assert.equal(sessions[0].startedAt, 123);
});

test("monitoring join cannot revive a submitted or reset attempt", async (t) => {
  const f = await fixture(t);
  for (const status of ["SUBMITTED", "LOCKED", "RESET_BY_TEACHER", "NOT_STARTED"]) {
    sessions[0].status = status;
    const response = await f.request("student-a", "/proctoring/events", event({ eventName: "student_joined_exam" }));
    assert.notEqual(response.status, 200);
    assert.equal(sessions[0].status, status);
  }
});

test("every monitoring event and command rejects absent or stale attempt binding", () => {
  for (const name of ["student_joined_exam", "student_left_exam", "suspicion_score_updated", "ai_alert_created", "camera_preview_updated", "screen_telemetry_uploaded", "student_heartbeat", "teacher_command"]) {
    for (const value of [undefined, null, 0, 122, "bad"]) assert.throws(() => assertAttemptMatches(name, { attemptStartedAt: value }, sessions[0]), { code: "STALE_EXAM_ATTEMPT" });
    assert.doesNotThrow(() => assertAttemptMatches(name, event(), sessions[0]));
  }
});

test("monitoring rejects peer impersonation and ended scheduled exams", async (t) => {
  const f = await fixture(t);
  const spoof = await f.request("student-a", "/proctoring/events", event({ eventName: "student_heartbeat", studentId: "student-b" }));
  assert.equal(spoof.status, 403);
  exam.scheduledEndAt = new Date(Date.now() - 1000);
  const ended = await f.request("student-a", "/proctoring/events", event({ eventName: "student_heartbeat" }));
  assert.equal(ended.status, 410);
  assert.equal(ended.body.code, "EXAM_NOT_LIVE");
  assert.equal(sessions[0].suspicionScore, 0);
});

test("atomic monitoring writes guard attempt and active state without upsert", async () => {
  let captured;
  mock(ExamSession, "findOneAndUpdate", (...args) => { captured = args; return query(null); });
  const result = await incrementStudentScore({ exam, studentId: "student-a", amount: 20, mutationId: "test", attemptSession: sessions[0] });
  assert.equal(result, null);
  assert.deepEqual(captured[0], { examId, studentId: "student-a", _id: sessionId, startedAt: 123, status: "IN_PROGRESS" });
  assert.equal(captured[2].upsert, false);
});

test("Socket.IO isolates student rooms, monitoring and targeted commands", async (t) => {
  const f = await fixture(t);
  const teacher = await f.client("teacher");
  const a = await f.client("student-a");
  const b = await f.client("student-b");
  let peerLeaks = 0;
  b.on("student_heartbeat", () => peerLeaks++);
  b.on("live_student_list", () => peerLeaks++);
  b.on("teacher_command", () => peerLeaks++);
  assert.equal((await emit(a, "join_exam_room", { examId })).ok, false);
  assert.equal((await emit(teacher, "join_exam_room", { examId })).ok, true);
  assert.equal((await emit(a, "student_heartbeat", event())).ok, true);
  assert.equal((await emit(b, "student_heartbeat", event())).ok, true);
  const roomsA = f.io.sockets.sockets.get(a.id).rooms;
  assert.equal(roomsA.has(`exam:staff:${examId}`), false);
  assert.equal(roomsA.has(studentAttemptRoom(examId, "student-a", 123)), true);
  const received = new Promise((resolve) => a.once("teacher_command", resolve));
  const ack = await emit(teacher, "teacher_command", command());
  const delivered = await received;
  assert.equal(ack.ok, true);
  assert.equal(ack.status, "DISPATCHED_UNCONFIRMED");
  assert.equal(delivered.commandId, ack.commandId);
  assert.equal(delivered.expiresAt - delivered.issuedAt, 30_000);
  assert.equal(delivered.attemptStartedAt, 123);
  assert.equal(peerLeaks, 0);
});

test("unauthorized teachers, cross-tenant staff and students cannot monitor or command", async (t) => {
  const f = await fixture(t);
  for (const identifier of ["outsider", "admin", "student-a"]) {
    const socket = await f.client(identifier);
    assert.equal((await emit(socket, "join_exam_room", { examId })).ok, false);
    assert.equal((await emit(socket, "teacher_command", command())).ok, false);
  }
});

test("commands reject stale, finalized and unassigned targets without broadcasting", async (t) => {
  const f = await fixture(t);
  let emitted = 0;
  const io = { to: () => ({ emit: () => emitted++ }) };
  const teacher = users[2];
  await assert.rejects(() => emitTeacherCommand(io, teacher, command({ attemptStartedAt: 122 })), { code: "STALE_EXAM_ATTEMPT" });
  await assert.rejects(() => emitTeacherCommand(io, teacher, command({ studentId: "outsider" })), /not assigned/);
  sessions[0].status = "SUBMITTED";
  await assert.rejects(() => emitTeacherCommand(io, teacher, command()), /not accepting/);
  assert.equal(emitted, 0);
});

test("reconnect changes rooms with the attempt; stale disconnect cannot mark new attempt offline", async (t) => {
  const f = await fixture(t);
  const a = await f.client("student-a");
  assert.equal((await emit(a, "student_heartbeat", event())).ok, true);
  sessions[0].startedAt = 456;
  a.disconnect();
  // A new attempt is not targeted by the old socket's disconnect filter.
  const next = await f.client("student-a");
  assert.equal((await emit(next, "student_heartbeat", event({ attemptStartedAt: 456 }))).ok, true);
  const rooms = f.io.sockets.sockets.get(next.id).rooms;
  assert.equal(rooms.has(studentAttemptRoom(examId, "student-a", 123)), false);
  assert.equal(rooms.has(studentAttemptRoom(examId, "student-a", 456)), true);
  assert.equal(sessions[0].onlineStatus, "ONLINE");
});

test("disconnect reconciles presence after the last student socket closes", async (t) => {
  const f = await fixture(t);
  const a = await f.client("student-a");
  assert.equal((await emit(a, "student_heartbeat", event())).ok, true);
  const serverSocket = f.io.sockets.sockets.get(a.id);
  const closed = new Promise((resolve) => serverSocket.once("disconnect", resolve));
  a.disconnect();
  await closed;
  await new Promise(setImmediate);
  assert.equal(sessions[0].onlineStatus, "OFFLINE");
  assert.equal(sessions[0].status, "IN_PROGRESS");
});

test("video payload failures preserve answers, score, submission ability and attempt time", async (t) => {
  const f = await fixture(t);
  const before = structuredClone(sessions[0]);
  const result = await f.request("student-a", "/proctoring/events", event({ eventName: "camera_preview_updated", previewBase64: "invalid" }));
  assert.notEqual(result.status, 200);
  assert.deepEqual(sessions[0], before);
  sessions[0].save = async () => {};
  const submitted = await f.request("student-a", "/sessions/submit", { examId });
  assert.equal(submitted.status, 200);
  assert.equal(sessions[0].status, "SUBMITTED");
  assert.equal(sessions[0].startedAt, 123);
  assert.deepEqual(sessions[0].answerDraft, before.answerDraft);
});

test("camera and screen events preserve separate preview state over HTTP", async (t) => {
  const f = await fixture(t);
  const camera = "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 1]).toString("base64");
  const screen = "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 2]).toString("base64");
  const first = await f.request("student-a", "/proctoring/events", event({ eventName: "camera_preview_updated", previewBase64: camera, captureSource: "camera", evidenceId: "camera-1" }));
  assert.equal(first.status, 200);
  const second = await f.request("student-a", "/proctoring/events", event({ eventName: "screen_telemetry_uploaded", base64: screen, captureSource: "screen", evidenceId: "screen-1" }));
  assert.equal(second.status, 200);
  assert.equal(second.body.student.previewBase64, camera);
  assert.equal(second.body.student.screenBase64, screen);
  assert.equal(sessions[0].suspicionScore, 0);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "preserved" });
});

test("a transport loss during monitoring does not block answer submission", async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => fetch("http://127.0.0.1:1/proctoring/events", { method: "POST" }));
  sessions[0].save = async () => {};
  const result = await f.request("student-a", "/sessions/submit", { examId });
  assert.equal(result.status, 200);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "preserved" });
});

test("initial HTTP monitoring bootstrap denies students and unrelated teachers", async (t) => {
  const f = await fixture(t);
  const path = `/teacher/exams/${examId}/live-proctoring`;
  assert.equal((await f.request("student-a", path)).status, 403);
  assert.equal((await f.request("outsider", path)).status, 404);
  const authorized = await f.request("teacher", path);
  assert.equal(authorized.status, 200);
  assert.deepEqual(authorized.body.activeStudents.map((item) => item.studentId), ["student-a", "student-b"]);
  const self = await f.request("student-a", `/sessions/me?examId=${examId}`);
  assert.equal(self.status, 200);
  assert.equal(self.body.session.studentId, "student-a");
  assert.equal(JSON.stringify(self.body).includes("student-b"), false);
});

test("a persisted score event cannot rescore after its hot mutation ID has aged out", async (t) => {
  const f = await fixture(t);
  sessions[0].suspicionScore = 20;
  sessions[0].scoreMutationIds = [];
  mock(ProctoringEvent, "exists", () => query({ _id: "persisted" }));
  mock(ProctoringEvent, "findOne", () => query({ _id: "persisted" }));
  const update = ExamSession.findOneAndUpdate;
  let scoreExpression;
  mock(ExamSession, "findOneAndUpdate", (filter, pipeline, options) => {
    scoreExpression = pipeline[0].$set.suspicionScore;
    return update(filter, pipeline, options);
  });
  const response = await f.request("student-a", "/proctoring/events", event({ eventName: "suspicion_score_updated", eventId: "old-delivery", scoreDelta: 20 }));
  assert.equal(response.status, 200);
  assert.equal(response.body.student.suspicionScore, 20);
  assert.equal(JSON.stringify(scoreExpression).includes("$add"), false);
});

test("Android Gson fixtures reach authorized teacher state and evidence through local HTTP/socket", { skip: !process.env.CHEATLOCK_MONITORING_FIXTURES_PATH }, async (t) => {
  const fixtures = JSON.parse(readFileSync(process.env.CHEATLOCK_MONITORING_FIXTURES_PATH, "utf8"));
  assert.equal(fixtures.length, 6);
  const attempt = fixtures[0].attemptStartedAt;
  assert.equal(typeof attempt, "number");
  sessions[0].startedAt = attempt;
  const f = await fixture(t);
  const records = new Map();
  // Evaluate only the documented aggregation operators used by the production
  // update against a local model fixture. This is not a real MongoDB execution.
  const evaluate = (value, row) => {
    if (typeof value === "string" && value.startsWith("$")) return row[value.slice(1)];
    if (Array.isArray(value)) return value.map((item) => evaluate(item, row));
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    if ("$literal" in value) return value.$literal;
    if ("$ifNull" in value) return evaluate(value.$ifNull[0], row) ?? evaluate(value.$ifNull[1], row);
    if ("$cond" in value) return evaluate(value.$cond[evaluate(value.$cond[0], row) ? 1 : 2], row);
    if ("$in" in value) return evaluate(value.$in[1], row).includes(evaluate(value.$in[0], row));
    if ("$min" in value) return Math.min(...evaluate(value.$min, row));
    if ("$max" in value) return Math.max(...evaluate(value.$max, row));
    if ("$add" in value) return evaluate(value.$add, row).reduce((a, b) => a + b, 0);
    if ("$concatArrays" in value) return evaluate(value.$concatArrays, row).flat();
    if ("$slice" in value) return evaluate(value.$slice[0], row).slice(value.$slice[1]);
    throw new Error(`Unsupported local aggregation operator: ${Object.keys(value)}`);
  };
  mock(ExamSession, "findOneAndUpdate", (filter, update) => {
    const row = sessions.find((item) => matches(item, filter));
    if (!row) return query(null);
    if (Array.isArray(update)) {
      const values = Object.fromEntries(Object.entries(update[0].$set).map(([key, value]) => [key, evaluate(value, row)]));
      Object.assign(row, values);
    }
    return query(row);
  });
  mock(ProctoringEvent, "exists", (filter) => query(filter.idempotencyKey ? records.get(filter.idempotencyKey) || null : null));
  mock(ProctoringEvent, "findOne", (filter) => query(records.get(filter.idempotencyKey) || null));
  mock(ProctoringEvent, "findOneAndUpdate", (filter, update) => {
    if (!records.has(filter.idempotencyKey)) records.set(filter.idempotencyKey, { ...update.$setOnInsert, _id: String(records.size + 1), createdAt: new Date() });
    return query(records.get(filter.idempotencyKey));
  });
  mock(ProctoringEvent, "updateMany", async () => ({ matchedCount: 0, modifiedCount: 0 }));
  mock(ProctoringEvent, "aggregate", async () => [...records.values()]);
  mock(IntegrityReview, "findOne", () => query(null));
  const teacher = await f.client("teacher");
  const peer = await f.client("student-b");
  assert.equal((await emit(teacher, "join_exam_room", { examId })).ok, true);
  assert.equal((await emit(peer, "student_heartbeat", event())).ok, true);
  let peerLeaks = 0;
  peer.onAny((_name, payload) => { if (payload?.studentId === "student-a") peerLeaks++; });
  const { mergeAuthoritativeStudent } = await import("../web-dashboard/src/lib/scoreMetrics.ts");
  const { snapshotFor, monitoringFreshness } = await import("../web-dashboard/src/lib/monitoringState.ts");
  let teacherState;
  for (const payload of fixtures) {
    const delivered = new Promise((resolve) => teacher.once(payload.eventName, resolve));
    const response = await f.request("student-a", "/proctoring/events", payload);
    assert.equal(response.status, 200, response.body.message);
    const update = await delivered;
    assert.equal(update.attemptStartedAt, attempt);
    teacherState = mergeAuthoritativeStudent(teacherState, update);
  }
  assert.equal(teacherState.suspicionScore, 60);
  assert.match(snapshotFor(teacherState, "camera"), /^data:image\/jpeg/);
  assert.match(snapshotFor(teacherState, "screen"), /^data:image\/jpeg/);
  assert.equal(monitoringFreshness(teacherState), "Receiving telemetry");
  const duplicate = await f.request("student-a", "/proctoring/events", fixtures[5]);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.student.suspicionScore, 60);
  assert.equal(records.size, 6);
  const timeline = await f.request("teacher", `/teacher/exams/${examId}/students/student-a/proctoring-timeline`);
  assert.equal(timeline.status, 200);
  assert.equal(timeline.body.timelineEvents.length, 6);
  assert.deepEqual(timeline.body.timelineEvents.filter((item) => item.eventType === "ai_alert_created").map((item) => item.totalSuspicionScore), [20, 40, 60]);
  assert.equal(peerLeaks, 0);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "preserved" });
});

test("heartbeat control errors distinguish locked/reset attempts without reviving or rescoring", async (t) => {
  const f = await fixture(t);
  for (const [status, code] of [["LOCKED", "SESSION_LOCKED"], ["RESET_BY_TEACHER", "SESSION_RESET"], ["SUBMITTED", "SESSION_FINALIZED"]]) {
    sessions[0].status = status;
    const response = await f.request("student-a", "/proctoring/events", event({ eventName: "student_heartbeat" }));
    assert.equal(response.status, 409);
    assert.equal(response.body.code, code);
    assert.equal(sessions[0].status, status);
    assert.equal(sessions[0].suspicionScore, 0);
  }
});
test("legacy finalization cannot close a not-started or teacher-reset attempt", async (t) => {
  const f = await fixture(t);
  for (const status of ["NOT_STARTED", "RESET_BY_TEACHER"]) {
    sessions[0].status = status;
    for (const path of ["submit", "lock"]) {
      const response = await f.request("student-a", `/sessions/${path}`, { examId, attemptStartedAt: 123, deviceId: "device-a" });
      assert.equal(response.status, 409);
      assert.equal(sessions[0].status, status);
    }
  }
});
test("lock is attempt/device bound and cannot lower an authoritative score", async (t) => {
  const f = await fixture(t);
  for (const body of [{ attemptStartedAt: 122, deviceId: "device-a" }, { attemptStartedAt: 123, deviceId: "other" }]) {
    assert.equal((await f.request("student-a", "/sessions/lock", { examId, ...body })).status, 409);
  }
  sessions[0].suspicionScore = 80;
  const response = await f.request("student-a", "/sessions/lock", { examId, attemptStartedAt: 123, deviceId: "device-a", suspicionScore: 10 });
  assert.equal(response.status, 200);
  assert.equal(response.body.session.status, "LOCKED");
  assert.equal(response.body.session.suspicionScore, 80);
});
test("heartbeats preserve the last security alert", async (t) => {
  const f = await fixture(t);
  sessions[0].latestAlert = "Existing security alert";
  const response = await f.request("student-a", "/proctoring/events", event({ eventName: "student_heartbeat" }));
  assert.equal(response.status, 200);
  assert.equal(response.body.student.latestAlert, "Existing security alert");
});