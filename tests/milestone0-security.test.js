import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { submissionsRouter } from "../backend/src/routes/submissions.js";
import { tenantsRouter } from "../backend/src/routes/tenants.js";
import { emitTeacherCommand } from "../backend/src/socket/proctoring.js";
import { Exam } from "../backend/src/models/Exam.js";
import { Submission } from "../backend/src/models/Submission.js";
import { User } from "../backend/src/models/User.js";
import { AuditLog } from "../backend/src/models/AuditLog.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "milestone0-security-test-secret";

const teacherAId = "teacher-a@example.edu";
const teacherBId = "teacher-b@example.edu";
const tenantAId = "64a000000000000000000001";
const tenantBId = "64b000000000000000000001";
const teacherAUserId = "64a000000000000000000101";
const tenantAdminAUserId = "64a000000000000000000201";
const tenantAStudentId = "64a000000000000000000301";
const tenantBStudentId = "64b000000000000000000301";
const examAId = "64a000000000000000000401";
const examBId = "64b000000000000000000401";
const submissionAId = "64a000000000000000000501";
const submissionBId = "64b000000000000000000501";

let users = [];
let exams = [];
let submissions = [];
let emitted = [];

beforeEach(() => {
  users = [
    user({ _id: teacherAUserId, identifier: teacherAId, role: "TEACHER", tenantId: tenantAId }),
    user({ _id: "64b000000000000000000101", identifier: teacherBId, role: "TEACHER", tenantId: tenantBId }),
    user({ _id: tenantAdminAUserId, identifier: "admin-a@example.edu", role: "INSTITUTION_ADMIN", tenantId: tenantAId }),
    user({ _id: tenantAStudentId, identifier: "student-a@example.edu", role: "STUDENT", tenantId: tenantAId }),
    user({ _id: tenantBStudentId, identifier: "student-b@example.edu", role: "STUDENT", tenantId: tenantBId }),
  ];
  exams = [
    exam({ _id: examAId, createdBy: teacherAId, title: "Teacher A Exam" }),
    exam({ _id: examBId, createdBy: teacherBId, title: "Teacher B Exam" }),
  ];
  submissions = [
    submission({ _id: submissionAId, examId: examAId, studentId: "student-a@example.edu", grade: null }),
    submission({ _id: submissionBId, examId: examBId, studentId: "student-b@example.edu", grade: null }),
  ];
  emitted = [];
});

test("teacher A cannot list teacher B's submissions", async () => {
  installModelMocks();
  const response = await request(createApp("/submissions", submissionsRouter), {
    path: "/submissions",
    token: tokenFor(teacherAUserId),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.submissions.map((item) => item._id), [submissionAId]);
});

test("teacher A cannot retrieve, update, or delete teacher B's submission", async () => {
  installModelMocks();
  const app = createApp("/submissions", submissionsRouter);

  const retrieve = await request(app, {
    path: `/submissions/${submissionBId}`,
    token: tokenFor(teacherAUserId),
  });
  assert.equal(retrieve.status, 404);

  const update = await request(app, {
    method: "PATCH",
    path: `/submissions/${submissionBId}`,
    token: tokenFor(teacherAUserId),
    body: { grade: 95 },
  });
  assert.equal(update.status, 404);

  const remove = await request(app, {
    method: "DELETE",
    path: `/submissions/${submissionBId}`,
    token: tokenFor(teacherAUserId),
  });
  assert.equal(remove.status, 404);

  assert.equal(submissions.some((item) => item._id === submissionBId), true);
  assert.equal(submissions.find((item) => item._id === submissionBId).grade, null);
});

test("teacher A can retrieve, update, and delete their own submission", async () => {
  installModelMocks();
  const app = createApp("/submissions", submissionsRouter);

  const retrieve = await request(app, {
    path: `/submissions/${submissionAId}`,
    token: tokenFor(teacherAUserId),
  });
  assert.equal(retrieve.status, 200);
  assert.equal(retrieve.body.submission._id, submissionAId);

  const update = await request(app, {
    method: "PATCH",
    path: `/submissions/${submissionAId}`,
    token: tokenFor(teacherAUserId),
    body: { grade: 88, feedback: "Reviewed" },
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.submission.grade, 88);
  assert.equal(update.body.submission.feedback, "Reviewed");

  const remove = await request(app, {
    method: "DELETE",
    path: `/submissions/${submissionAId}`,
    token: tokenFor(teacherAUserId),
  });
  assert.equal(remove.status, 204);
  assert.equal(submissions.some((item) => item._id === submissionAId), false);
  assert.equal(submissions.some((item) => item._id === submissionBId), true);
});

test("global submission deletion is disabled", async () => {
  installModelMocks();
  const response = await request(createApp("/submissions", submissionsRouter), {
    method: "DELETE",
    path: "/submissions",
    token: tokenFor(teacherAUserId),
  });

  assert.equal(response.status, 403);
  assert.equal(submissions.length, 2);
});

test("tenant administrator cannot update, suspend, reset, or delete another tenant's user", async () => {
  installModelMocks();
  const app = createApp("/tenants", tenantsRouter);
  const token = tokenFor(tenantAdminAUserId);

  for (const action of [
    { method: "PUT", path: `/tenants/my-tenant/users/${tenantBStudentId}/status`, body: { status: "SUSPENDED" } },
    { method: "PUT", path: `/tenants/my-tenant/users/${tenantBStudentId}/reset-password`, body: {} },
    { method: "DELETE", path: `/tenants/my-tenant/users/${tenantBStudentId}`, body: undefined },
  ]) {
    const response = await request(app, { ...action, token });
    assert.equal(response.status, 404);
  }

  assert.equal(users.some((item) => item._id === tenantBStudentId), true);
  assert.equal(users.find((item) => item._id === tenantBStudentId).status, "ACTIVE");
});

test("tenant administrator can suspend, reset, and delete a same-tenant student", async () => {
  installModelMocks();
  const app = createApp("/tenants", tenantsRouter);
  const token = tokenFor(tenantAdminAUserId);

  const suspend = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${tenantAStudentId}/status`,
    token,
    body: { status: "SUSPENDED" },
  });
  assert.equal(suspend.status, 200);
  assert.equal(users.find((item) => item._id === tenantAStudentId).status, "SUSPENDED");

  const reset = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${tenantAStudentId}/reset-password`,
    token,
    body: {},
  });
  assert.equal(reset.status, 200);
  assert.ok(users.find((item) => item._id === tenantAStudentId).passwordHash);

  const remove = await request(app, {
    method: "DELETE",
    path: `/tenants/my-tenant/users/${tenantAStudentId}`,
    token,
  });
  assert.equal(remove.status, 200);
  assert.equal(users.some((item) => item._id === tenantAStudentId), false);
});

test("a teacher cannot send Socket.IO commands to an exam they do not own", async () => {
  installModelMocks();
  await assert.rejects(
    () => emitTeacherCommand(fakeIo(), users.find((item) => item._id === teacherAUserId), {
      examId: examBId,
      studentId: "student-b@example.edu",
      command: "WARN_STUDENT",
      message: "Focus on the exam window.",
    }),
    /not accessible/
  );
  assert.equal(emitted.length, 0);
});

test("authorized teacher commands still work", async () => {
  installModelMocks();
  await emitTeacherCommand(fakeIo(), users.find((item) => item._id === teacherAUserId), {
    examId: examAId,
    studentId: "student-a@example.edu",
    command: "WARN_STUDENT",
    message: "Focus on the exam window.",
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, `exam:${examAId}`);
  assert.equal(emitted[0].event, "teacher_command");
  assert.equal(emitted[0].payload.command, "WARN_STUDENT");
});

test("unknown or oversized Socket.IO teacher commands are rejected before emit", async () => {
  installModelMocks();
  const actor = users.find((item) => item._id === teacherAUserId);

  await assert.rejects(
    () => emitTeacherCommand(fakeIo(), actor, {
      examId: examAId,
      studentId: "student-a@example.edu",
      command: "UNKNOWN_COMMAND",
    }),
    /Unsupported/
  );
  await assert.rejects(
    () => emitTeacherCommand(fakeIo(), actor, {
      examId: examAId,
      studentId: "student-a@example.edu",
      command: "WARN_STUDENT",
      message: "x".repeat(1001),
    }),
    /too large/
  );
  assert.equal(emitted.length, 0);
});

test("the proctoring simulator is disabled by default and gated by explicit env flag", async () => {
  const [page, envExample] = await Promise.all([
    readFile(new URL("../web-dashboard/src/pages/LiveProctoringPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web-dashboard/.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /VITE_ENABLE_PROCTORING_TEST_TOOLS === "true"/);
  assert.match(page, /\{ENABLE_PROCTORING_TEST_TOOLS && \(/);
  assert.match(envExample, /VITE_ENABLE_PROCTORING_TEST_TOOLS=false/);
});

function installModelMocks() {
  User.findById = (id) => queryResult(users.find((item) => item._id === String(id)) || null);
  User.findOne = (criteria = {}) => queryResult(findOne(users, criteria));
  User.findOneAndUpdate = (criteria, update) => {
    const found = findOne(users, criteria);
    if (!found) return null;
    applyUpdate(found, update);
    return withLean(found);
  };
  User.findOneAndDelete = (criteria) => {
    const found = findOne(users, criteria);
    if (found) users = users.filter((item) => item !== found);
    return queryResult(found || null);
  };
  User.countDocuments = async (criteria = {}) => users.filter((item) => matches(item, criteria)).length;
  AuditLog.create = async () => ({});

  Exam.find = (criteria = {}) => queryResult(exams.filter((item) => matches(item, criteria)));
  Exam.findById = (id) => queryResult(exams.find((item) => item._id === String(id)) || null);

  Submission.find = (criteria = {}) => queryResult(submissions.filter((item) => matches(item, criteria)));
  Submission.findOne = (criteria = {}) => queryResult(findOne(submissions, criteria));
  Submission.findOneAndUpdate = (criteria, update) => {
    const found = findOne(submissions, criteria);
    if (!found) return queryResult(null);
    applyUpdate(found, update);
    return queryResult(found);
  };
  Submission.deleteOne = async (criteria = {}) => {
    const before = submissions.length;
    submissions = submissions.filter((item) => !matches(item, criteria));
    return { deletedCount: before - submissions.length };
  };
}

function createApp(prefix, router) {
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
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
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
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
      tenantId: actor.tenantId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
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
    durationMinutes: 10,
    assignedStudents: [],
    _id: record._id,
    title: record.title,
    createdBy: record.createdBy,
  };
}

function submission(record) {
  return {
    answers: [],
    feedback: "",
    submittedAt: Date.now(),
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
    limit() {
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

function withLean(value) {
  return {
    lean() {
      return Promise.resolve(clone(value));
    },
  };
}

function findOne(items, criteria) {
  return items.find((item) => matches(item, criteria)) || null;
}

function matches(item, criteria = {}) {
  return Object.entries(criteria).every(([key, expected]) => {
    const actual = String(item[key] ?? "");
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.map(String).includes(actual);
    }
    if (expected && typeof expected === "object" && "$ne" in expected) {
      return actual !== String(expected.$ne);
    }
    return actual === String(expected);
  });
}

function applyUpdate(target, update = {}) {
  const set = update.$set || update;
  for (const [key, value] of Object.entries(set)) {
    target[key] = value;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function fakeIo() {
  return {
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}
