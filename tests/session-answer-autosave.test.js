import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { sessionsRouter } from "../backend/src/routes/sessions.js";
import { Exam } from "../backend/src/models/Exam.js";
import { ExamSession } from "../backend/src/models/ExamSession.js";
import { User } from "../backend/src/models/User.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "session-answer-autosave-secret";

const studentAUserId = "64a100000000000000000101";
const studentBUserId = "64b100000000000000000101";
const teacherUserId = "64c100000000000000000101";
const examAId = "64a100000000000000000201";
const examBId = "64b100000000000000000201";
const sessionAId = "64a100000000000000000301";
const sessionBId = "64b100000000000000000301";

let users = [];
let exams = [];
let sessions = [];

beforeEach(() => {
  users = [
    user({ _id: studentAUserId, identifier: "student-a@example.edu", role: "STUDENT" }),
    user({ _id: studentBUserId, identifier: "student-b@example.edu", role: "STUDENT" }),
    user({ _id: teacherUserId, identifier: "teacher@example.edu", role: "TEACHER" }),
  ];
  exams = [
    exam({ _id: examAId, assignedStudents: ["student-a@example.edu"] }),
    exam({ _id: examBId, assignedStudents: ["student-b@example.edu"] }),
  ];
  sessions = [
    session({
      _id: sessionAId,
      studentId: "student-a@example.edu",
      examId: examAId,
      status: "IN_PROGRESS",
      deviceId: "device-a",
      answerDraft: { answers: {}, currentIndex: 0, markedQuestions: [], revision: 0 },
    }),
    session({
      _id: sessionBId,
      studentId: "student-b@example.edu",
      examId: examBId,
      status: "IN_PROGRESS",
      deviceId: "device-b",
      answerDraft: { answers: { 0: "other" }, currentIndex: 0, markedQuestions: [], revision: 3 },
    }),
  ];
});

test("student answer drafts are scoped to the authenticated student session", async () => {
  installModelMocks();
  const response = await request(createApp(), {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAUserId),
    body: draftPayload({ examId: examBId, attemptId: sessionBId, deviceId: "device-b", revision: 3 }),
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "SESSION_NOT_FOUND");
  assert.deepEqual(sessions.find((item) => item._id === sessionBId).answerDraft.answers, { 0: "other" });
});

test("student answer drafts reject teachers and unauthenticated callers", async () => {
  installModelMocks();
  const app = createApp();

  const teacher = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(teacherUserId),
    body: draftPayload(),
  });
  assert.equal(teacher.status, 403);

  const unauthenticated = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    body: draftPayload(),
  });
  assert.equal(unauthenticated.status, 401);
});

test("student answer drafts reject stale attempts and wrong devices", async () => {
  installModelMocks();
  const app = createApp();
  const token = tokenFor(studentAUserId);

  const staleAttempt = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload({ attemptId: sessionBId }),
  });
  assert.equal(staleAttempt.status, 409);
  assert.equal(staleAttempt.body.code, "ATTEMPT_MISMATCH");

  const wrongDevice = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload({ deviceId: "other-device" }),
  });
  assert.equal(wrongDevice.status, 409);
  assert.equal(wrongDevice.body.code, "DEVICE_MISMATCH");
});

test("student answer drafts save valid revisions and increment the server revision", async () => {
  installModelMocks();
  const response = await request(createApp(), {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAUserId),
    body: draftPayload({ answers: { 0: "A", 1: "B" }, currentIndex: 1, markedQuestions: [1] }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.revision, 1);
  const updated = sessions.find((item) => item._id === sessionAId);
  assert.deepEqual(updated.answerDraft.answers, { 0: "A", 1: "B" });
  assert.deepEqual(updated.answerDraft.markedQuestions, [1]);
});

test("student answer drafts support existing sessions without draft fields", async () => {
  delete sessions[0].answerDraft;
  installModelMocks();

  const response = await request(createApp(), {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAUserId),
    body: draftPayload(),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.revision, 1);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "answer" });
});

test("student answer drafts reject stale server revisions without overwriting latest answers", async () => {
  sessions[0].answerDraft = { answers: { 0: "server latest" }, currentIndex: 0, markedQuestions: [], revision: 2 };
  installModelMocks();

  const response = await request(createApp(), {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAUserId),
    body: draftPayload({ revision: 1, answers: { 0: "old client" } }),
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "ANSWER_REVISION_CONFLICT");
  assert.equal(response.body.currentRevision, 2);
  assert.deepEqual(sessions[0].answerDraft.answers, { 0: "server latest" });
});

test("student answer drafts reject invalid question references and oversized payloads", async () => {
  installModelMocks();
  const app = createApp();
  const token = tokenFor(studentAUserId);

  const invalidQuestion = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload({ answers: { 99: "outside exam" } }),
  });
  assert.equal(invalidQuestion.status, 400);
  assert.equal(invalidQuestion.body.code, "INVALID_QUESTION_REFERENCE");

  const oversized = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload({ answers: { 0: "x".repeat(140 * 1024) } }),
  });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.body.code, "ANSWER_PAYLOAD_TOO_LARGE");
});

test("student answer drafts are rejected after the session is finalized", async () => {
  sessions[0].status = "SUBMITTED";
  installModelMocks();

  const response = await request(createApp(), {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAUserId),
    body: draftPayload(),
  });

  assert.equal(response.status, 410);
  assert.equal(response.body.code, "SESSION_FINALIZED");
});

test("student answer drafts are rejected for expired or inactive sessions", async () => {
  installModelMocks();
  const app = createApp();
  const token = tokenFor(studentAUserId);

  exams[0].scheduledEndAt = "2020-01-01T00:00:00.000Z";
  const expired = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload(),
  });
  assert.equal(expired.status, 410);
  assert.equal(expired.body.code, "EXAM_EXPIRED");

  exams[0].scheduledEndAt = null;
  sessions[0].status = "LOCKED";
  const inactive = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token,
    body: draftPayload(),
  });
  assert.equal(inactive.status, 409);
  assert.equal(inactive.body.code, "SESSION_NOT_ACTIVE");
});

function installModelMocks() {
  User.findById = (id) => queryResult(users.find((item) => item._id === String(id)) || null);
  Exam.findOne = (criteria = {}) => queryResult(findOne(exams, criteria));
  ExamSession.findOne = (criteria = {}) => queryResult(findOne(sessions, criteria));
  ExamSession.findOneAndUpdate = (criteria = {}, update = {}) => {
    const found = findOne(sessions, criteria);
    if (!found) return queryResult(null);
    applyUpdate(found, update);
    return queryResult(found);
  };
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/sessions", sessionsRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ code: err.code, message: err.message || "Server error" });
  });
  return app;
}

async function request(app, { method = "GET", path, token, body }) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function tokenFor(userId) {
  const actor = users.find((item) => item._id === userId);
  return jwt.sign(
    {
      sub: actor._id,
      identifier: actor.identifier,
      role: actor.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function draftPayload(overrides = {}) {
  return {
    examId: examAId,
    attemptId: sessionAId,
    deviceId: "device-a",
    revision: 0,
    answers: { 0: "answer" },
    currentIndex: 0,
    markedQuestions: [],
    ...overrides,
  };
}

function user(record) {
  return {
    name: record.identifier,
    passwordHash: "hash",
    status: "ACTIVE",
    ...record,
  };
}

function exam(record) {
  return {
    _id: record._id,
    title: "Exam",
    durationMinutes: 10,
    status: "LIVE",
    scheduledStartAt: null,
    scheduledEndAt: null,
    questions: [
      { text: "First?", type: "CQ", options: [] },
      { text: "Second?", type: "CQ", options: [] },
    ],
    assignedStudents: record.assignedStudents,
  };
}

function session(record) {
  return {
    studentName: "",
    suspicionScore: 0,
    onlineStatus: "ONLINE",
    lastSeenAt: Date.now(),
    ...record,
  };
}

function queryResult(value) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean() {
      return Promise.resolve(clone(value));
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(value).catch(reject);
    },
  };
}

function findOne(items, criteria = {}) {
  return items.find((item) => matches(item, criteria)) || null;
}

function matches(item, criteria = {}) {
  return Object.entries(criteria).every(([key, expected]) => {
    if (key === "$or") {
      return expected.some((candidate) => matches(item, candidate));
    }
    const actual = readPath(item, key);
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.map(String).includes(String(actual ?? ""));
    }
    if (expected && typeof expected === "object" && "$exists" in expected) {
      return expected.$exists ? actual !== undefined : actual === undefined;
    }
    return String(actual ?? "") === String(expected);
  });
}

function applyUpdate(target, update = {}) {
  for (const [key, value] of Object.entries(update.$set || update)) {
    writePath(target, key, value);
  }
}

function readPath(target, path) {
  return path.split(".").reduce((current, part) => current?.[part], target);
}

function writePath(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current[part] = current[part] || {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
