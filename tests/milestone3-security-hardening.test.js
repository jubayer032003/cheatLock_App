import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { authRouter } from "../backend/src/routes/auth.js";
import { tenantsRouter } from "../backend/src/routes/tenants.js";
import { sessionsRouter } from "../backend/src/routes/sessions.js";
import { examsRouter } from "../backend/src/routes/exams.js";
import { clearRateLimiterStateForTests } from "../backend/src/middleware/rateLimiter.js";
import { User } from "../backend/src/models/User.js";
import { Tenant } from "../backend/src/models/Tenant.js";
import { AuditLog } from "../backend/src/models/AuditLog.js";
import { Exam } from "../backend/src/models/Exam.js";
import { ExamSession } from "../backend/src/models/ExamSession.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "milestone3-security-test-secret";
process.env.CHEATLOCK_SKIP_DOTENV = "true";

const tenantAId = "64a300000000000000000001";
const tenantBId = "64b300000000000000000001";
const adminAId = "64a300000000000000000101";
const studentAId = "64a300000000000000000201";
const studentBId = "64b300000000000000000201";
const superAdminId = "64c300000000000000000101";
const examAId = "64a300000000000000000301";
const sessionAId = "64a300000000000000000401";

let users = [];
let exams = [];
let sessions = [];
let auditLogs = [];

beforeEach(async () => {
  clearRateLimiterStateForTests();
  auditLogs = [];
  users = [
    user({ _id: adminAId, identifier: "admin-a@example.edu", role: "INSTITUTION_ADMIN", tenantId: tenantAId }),
    user({ _id: superAdminId, identifier: "root@example.edu", role: "SUPER_ADMIN", tenantId: tenantAId }),
    user({ _id: studentAId, identifier: "student-a@example.edu", role: "STUDENT", tenantId: tenantAId }),
    user({ _id: studentBId, identifier: "student-b@example.edu", role: "STUDENT", tenantId: tenantBId }),
  ];
  users.find((item) => item._id === studentAId).passwordHash = await bcrypt.hash("old-password", 4);
  exams = [exam({ _id: examAId, assignedStudents: ["student-a@example.edu"] })];
  sessions = [session({ _id: sessionAId, studentId: "student-a@example.edu", examId: examAId })];
  installModelMocks();
});

test("production CORS fails closed and development CORS remains usable", async () => {
  await withEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "secret", ALLOWED_ORIGINS: undefined, CLIENT_ORIGIN: undefined }, async () => {
    const { validateStartupConfig } = await freshBackendConfig();
    assert.throws(() => validateStartupConfig(), /CORS/);
  });
  await withEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "secret", ALLOWED_ORIGINS: "*" }, async () => {
    const { validateStartupConfig } = await freshBackendConfig();
    assert.throws(() => validateStartupConfig(), /Wildcard/);
  });
  await withEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "secret", ALLOWED_ORIGINS: "not a url" }, async () => {
    const { validateStartupConfig } = await freshBackendConfig();
    assert.throws(() => validateStartupConfig(), /Invalid CORS/);
  });
  await withEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "secret", ALLOWED_ORIGINS: "https://dashboard.example.com/" }, async () => {
    const { buildCorsOptions } = await freshBackendConfig();
    const options = buildCorsOptions();
    assert.equal(options.credentials, false);
    assert.equal(await corsAllows(options, "https://dashboard.example.com"), true);
    assert.equal(await corsAllows(options, "https://evil.example.com"), false);
    assert.equal(await corsAllows(options, undefined), true);
  });
  await withEnv({ NODE_ENV: "development", MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "secret", ALLOWED_ORIGINS: undefined }, async () => {
    const { buildCorsOptions } = await freshBackendConfig();
    assert.equal(await corsAllows(buildCorsOptions(), "http://localhost:5173"), true);
  });
});

test("tenant admin reset issues a single-use hashed reset token scoped to their tenant", async () => {
  const app = createApp();
  const reset = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${studentAId}/reset-password`,
    token: tokenFor(adminAId),
  });

  assert.equal(reset.status, 200);
  assert.equal(typeof reset.body.resetToken, "string");
  assert.ok(reset.body.resetToken.length >= 32);
  assert.notEqual(users.find((item) => item._id === studentAId).passwordResetTokenHash, reset.body.resetToken);
  assert.equal(auditLogs.some((item) => JSON.stringify(item).includes(reset.body.resetToken)), false);

  const crossTenant = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${studentBId}/reset-password`,
    token: tokenFor(adminAId),
  });
  assert.equal(crossTenant.status, 404);
});

test("reset token completion changes password, rejects reuse, and invalidates old tokens", async () => {
  const app = createApp();
  const oldJwt = tokenFor(studentAId);
  const reset = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${studentAId}/reset-password`,
    token: tokenFor(adminAId),
  });

  const complete = await request(app, {
    method: "POST",
    path: "/auth/password-reset/complete",
    body: { token: reset.body.resetToken, password: "new-password-1" },
  });
  assert.equal(complete.status, 200);
  assert.equal(await bcrypt.compare("new-password-1", users.find((item) => item._id === studentAId).passwordHash), true);
  assert.equal(await bcrypt.compare("old-password", users.find((item) => item._id === studentAId).passwordHash), false);

  const reuse = await request(app, {
    method: "POST",
    path: "/auth/password-reset/complete",
    body: { token: reset.body.resetToken, password: "another-password" },
  });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.code, "INVALID_RESET_TOKEN");

  const oldTokenUse = await request(app, {
    path: "/auth/me",
    token: oldJwt,
  });
  assert.equal(oldTokenUse.status, 401);
});

test("expired and invalid reset secrets are rejected without exposing account existence", async () => {
  const app = createApp();
  const reset = await request(app, {
    method: "PUT",
    path: `/tenants/my-tenant/users/${studentAId}/reset-password`,
    token: tokenFor(adminAId),
  });
  users.find((item) => item._id === studentAId).passwordResetExpiresAt = new Date(Date.now() - 1000);

  for (const token of [reset.body.resetToken, "not-a-real-token-but-long-enough-to-test"]) {
    const response = await request(app, {
      method: "POST",
      path: "/auth/password-reset/complete",
      body: { token, password: "new-password-2" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_RESET_TOKEN");
  }
});

test("authentication-specific rate limits return stable 429 errors without blocking autosave", async () => {
  const app = createApp();
  let limited;
  for (let index = 0; index < 9; index += 1) {
    limited = await request(app, {
      method: "POST",
      path: "/auth/login",
      body: { identifier: "student-a@example.edu", password: "wrong-password", role: "STUDENT" },
    });
  }

  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "RATE_LIMITED");

  const autosave = await request(app, {
    method: "PATCH",
    path: "/sessions/answers",
    token: tokenFor(studentAId),
    body: {
      examId: examAId,
      attemptId: sessionAId,
      deviceId: "device-a",
      revision: 0,
      answers: { 0: "still works" },
      currentIndex: 0,
      markedQuestions: [],
    },
  });
  assert.equal(autosave.status, 200);
});

test("password reset and access-code guessing use separate limiter groups", async () => {
  const app = createApp();
  let resetLimited;
  for (let index = 0; index < 6; index += 1) {
    resetLimited = await request(app, {
      method: "PUT",
      path: `/tenants/my-tenant/users/${studentAId}/reset-password`,
      token: tokenFor(adminAId),
    });
  }
  assert.equal(resetLimited.status, 429);
  assert.equal(resetLimited.body.code, "RATE_LIMITED");

  let accessLimited;
  for (let index = 0; index < 21; index += 1) {
    accessLimited = await request(app, {
      path: "/exams/access/NOPE",
      token: tokenFor(studentAId),
    });
  }
  assert.equal(accessLimited.status, 429);
  assert.equal(accessLimited.body.code, "RATE_LIMITED");
});

test("active backend source no longer contains sensitive auth or proctoring console logging", async () => {
  const [authMiddleware, authRoute, proctoringSocket, proctoringRoute] = await Promise.all([
    readFile(new URL("../backend/src/middleware/auth.js", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/routes/auth.js", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/socket/proctoring.js", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/routes/proctoring.js", import.meta.url), "utf8"),
  ]);

  assert.equal(authMiddleware.includes("authorization") && authMiddleware.includes("console."), false);
  assert.equal(authMiddleware.includes("token header"), false);
  assert.equal(authRoute.includes("console.debug"), false);
  assert.equal(proctoringSocket.includes("console.log"), false);
  assert.equal(proctoringRoute.includes("console.log"), false);
  assert.equal(proctoringSocket.includes("JSON.stringify(payload).length"), false);
});

async function freshBackendConfig() {
  return import(`../backend/src/config.js?m3=${Date.now()}-${Math.random()}`);
}

async function corsAllows(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(Boolean(allowed)));
  });
}

async function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/auth", authRouter);
  app.use("/tenants", tenantsRouter);
  app.use("/sessions", sessionsRouter);
  app.use("/exams", examsRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      code: err.code || (err.status === 429 ? "RATE_LIMITED" : "REQUEST_FAILED"),
      message: err.message || "Server error",
    });
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
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function tokenFor(userId) {
  const actor = users.find((item) => item._id === userId);
  return jwt.sign({
    sub: actor._id,
    identifier: actor.identifier,
    role: actor.role,
    tenantId: actor.tenantId,
    tokenVersion: actor.tokenVersion || 0,
  }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function installModelMocks() {
  User.findById = (id) => queryResult(users.find((item) => item._id === String(id)) || null);
  User.findByIdAndUpdate = async (id, update) => {
    const found = users.find((item) => item._id === String(id));
    if (found) applyUpdate(found, update);
    return found || null;
  };
  User.findOne = (criteria = {}) => queryResult(findOne(users, criteria));
  User.findOneAndUpdate = (criteria, update) => {
    const found = findOne(users, criteria);
    if (!found) return queryResult(null);
    applyUpdate(found, update);
    return queryResult(found);
  };
  User.findOneAndDelete = (criteria) => queryResult(findOne(users, criteria));
  User.countDocuments = async (criteria = {}) => users.filter((item) => matches(item, criteria)).length;
  Tenant.findOne = () => queryResult({ _id: tenantAId, slug: "default" });
  Tenant.findById = () => queryResult({ _id: tenantAId, slug: "default" });
  AuditLog.create = async (payload) => {
    auditLogs.push(payload);
    return payload;
  };
  Exam.findOne = (criteria = {}) => queryResult(findOne(exams, criteria));
  Exam.exists = async () => false;
  ExamSession.findOne = (criteria = {}) => queryResult(findOne(sessions, criteria));
  ExamSession.findOneAndUpdate = (criteria, update) => {
    const found = findOne(sessions, criteria);
    if (!found) return queryResult(null);
    applyUpdate(found, update);
    return queryResult(found);
  };
}

function user(record) {
  return {
    name: record.identifier,
    passwordHash: "hash",
    status: "ACTIVE",
    tokenVersion: 0,
    mustChangePassword: false,
    ...record,
  };
}

function exam(record) {
  return {
    _id: record._id,
    title: "Exam",
    durationMinutes: 10,
    status: "LIVE",
    questions: [{ text: "First?", type: "CQ", options: [] }],
    assignedStudents: record.assignedStudents,
  };
}

function session(record) {
  return {
    _id: record._id,
    status: "IN_PROGRESS",
    deviceId: "device-a",
    answerDraft: { revision: 0, answers: {}, currentIndex: 0, markedQuestions: [] },
    ...record,
  };
}

function queryResult(value) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean() { return Promise.resolve(clone(value)); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
    catch(reject) { return Promise.resolve(value).catch(reject); },
  };
}

function findOne(items, criteria = {}) {
  return items.find((item) => matches(item, criteria)) || null;
}

function matches(item, criteria = {}) {
  return Object.entries(criteria).every(([key, expected]) => {
    if (key === "$or") return expected.some((candidate) => matches(item, candidate));
    const actual = readPath(item, key);
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.map(String).includes(String(actual ?? ""));
    }
    if (expected && typeof expected === "object" && "$ne" in expected) {
      return String(actual ?? "") !== String(expected.$ne);
    }
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return new Date(actual).getTime() > new Date(expected.$gt).getTime();
    }
    if (expected && typeof expected === "object" && "$exists" in expected) {
      return expected.$exists ? actual !== undefined : actual === undefined;
    }
    return String(actual ?? "") === String(expected);
  });
}

function applyUpdate(target, update = {}) {
  for (const [key, value] of Object.entries(update.$set || {})) writePath(target, key, value);
  for (const key of Object.keys(update.$unset || {})) writePath(target, key, undefined);
  for (const [key, value] of Object.entries(update.$inc || {})) writePath(target, key, Number(readPath(target, key) || 0) + value);
  if (!update.$set && !update.$unset && !update.$inc) {
    for (const [key, value] of Object.entries(update)) writePath(target, key, value);
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
  if (value === undefined) delete current[parts[parts.length - 1]];
  else current[parts[parts.length - 1]] = value;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
