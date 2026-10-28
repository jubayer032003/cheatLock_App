import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import express from "express";
import bcrypt from "bcryptjs";
import { createRememberedSessionService, hashSessionToken } from "../backend/src/services/rememberedSessions.js";
import { RememberedSession } from "../backend/src/models/RememberedSession.js";
import { User } from "../backend/src/models/User.js";
import { authRouter } from "../backend/src/routes/auth.js";
import { clearRateLimiterStateForTests } from "../backend/src/middleware/rateLimiter.js";

process.env.JWT_SECRET = "remembered-session-test-secret";

function fixture() {
  let timestamp = new Date("2026-10-25T00:00:00Z");
  const user = { _id: "507f1f77bcf86cd799439011", identifier: "student", name: "Student", role: "STUDENT", status: "ACTIVE", tokenVersion: 0 };
  const records = new Map();
  let nextId = 1;
  let deleteBeforeRenew = false;
  let userExists = true;
  let unavailable = false;
  const query = (value) => ({ select() { return this; }, lean: async () => value });
  const lookup = (criteria) => [...records.values()].find((value) =>
    (!criteria.tokenHash || value.tokenHash === criteria.tokenHash) &&
    (!criteria._id || value._id === criteria._id) &&
    (!criteria.expiresAt || value.expiresAt > criteria.expiresAt.$gt));
  const sessions = {
    async create(value) {
      const record = { ...value, _id: String(nextId++) };
      records.set(record._id, record);
      return record;
    },
    findOne(criteria) {
      if (unavailable) throw new Error("Database unavailable");
      return query(lookup(criteria));
    },
    findOneAndUpdate(criteria, update) {
      if (deleteBeforeRenew) records.clear();
      const record = lookup(criteria);
      if (record) Object.assign(record, update.$set);
      return query(record);
    },
    async deleteOne(criteria) {
      const record = lookup(criteria);
      if (record) records.delete(record._id);
    },
  };
  const users = { findById: () => query(userExists ? user : null) };
  const service = createRememberedSessionService({
    sessions, users, now: () => timestamp,
    signAccessToken: (value) => jwt.sign({ sub: value._id, role: value.role, tokenVersion: value.tokenVersion }, process.env.JWT_SECRET, { expiresIn: "1h" }),
  });
  return {
    service, user, users, sessions, records,
    advance: (days) => { timestamp = new Date(timestamp.getTime() + days * 86_400_000); },
    concurrentLogout: () => { deleteBeforeRenew = true; },
    removeUser: () => { userExists = false; },
    disconnect: () => { unavailable = true; },
  };
}

test("device sessions store only a hash and renew an expired access token", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  assert.match(issued.refreshToken, /^[a-f0-9]{64}$/);
  const record = [...f.records.values()][0];
  assert.equal(record.tokenHash, hashSessionToken(issued.refreshToken));
  assert.equal(JSON.stringify(record).includes(issued.refreshToken), false);
  const oldAccessToken = jwt.sign({ sub: f.user._id }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.throws(() => jwt.verify(oldAccessToken, process.env.JWT_SECRET));
  const refreshed = await f.service.refresh(issued.refreshToken);
  assert.equal(jwt.verify(refreshed.token, process.env.JWT_SECRET).sub, f.user._id);
  assert.equal(refreshed.refreshToken, issued.refreshToken);
});

test("activity extends the idle lifetime and lost responses can be retried", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  f.advance(89);
  const refreshed = await f.service.refresh(issued.refreshToken);
  assert.ok(refreshed.refreshExpiresAt > issued.refreshExpiresAt);
  f.advance(89);
  await f.service.refresh(issued.refreshToken);
  assert.equal(f.records.size, 1);
});

test("idle expiry is checked even before Mongo TTL cleanup", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  f.advance(90);
  await assert.rejects(f.service.refresh(issued.refreshToken), { status: 401 });
});

test("logout revokes this device without signing out another device", async () => {
  const f = fixture();
  const first = await f.service.issue(f.user);
  const second = await f.service.issue(f.user);
  await f.service.revoke(first.refreshToken);
  await assert.rejects(f.service.refresh(first.refreshToken), { status: 401 });
  await f.service.refresh(second.refreshToken);
});

test("concurrent logout cannot be undone by an in-flight renewal", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  f.concurrentLogout();
  await assert.rejects(f.service.refresh(issued.refreshToken), { status: 401 });
  assert.equal(f.records.size, 0);
});

test("password reset and token-version revocation invalidate remembered devices", async () => {
  for (const change of [
    (user) => { user.tokenVersion++; },
    (user) => { user.passwordChangedAt = new Date("2026-10-25T00:00:01Z"); },
  ]) {
    const f = fixture();
    const issued = await f.service.issue(f.user);
    change(f.user);
    await assert.rejects(f.service.refresh(issued.refreshToken), { status: 401 });
    assert.equal(f.records.size, 0);
  }
});

test("deleted and suspended accounts cannot renew, and suspended accounts cannot enroll", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  f.user.status = "SUSPENDED";
  await assert.rejects(f.service.refresh(issued.refreshToken), { status: 403 });
  await assert.rejects(f.service.issue(f.user), { status: 403 });
  f.removeUser();
  await assert.rejects(f.service.refresh(issued.refreshToken), { status: 401 });
});

test("renewed tokens use current account role instead of stale client claims", async () => {
  const f = fixture();
  const issued = await f.service.issue(f.user);
  f.user.role = "TEACHER";
  const refreshed = await f.service.refresh(issued.refreshToken);
  assert.equal(jwt.verify(refreshed.token, process.env.JWT_SECRET).role, "TEACHER");
});

test("malformed secrets are rejected and temporary server failures do not revoke sessions", async () => {
  const f = fixture();
  for (const value of [null, {}, "", "a".repeat(65), { $ne: "" }]) {
    await assert.rejects(f.service.refresh(value), { status: 401 });
  }
  const issued = await f.service.issue(f.user);
  f.disconnect();
  await assert.rejects(f.service.refresh(issued.refreshToken), /Database unavailable/);
  assert.equal(f.records.size, 1);
});

test("Android login, expired-token renewal and device logout work through the HTTP routes", async () => {
  clearRateLimiterStateForTests();
  const f = fixture();
  f.user.passwordHash = await bcrypt.hash("test-password", 4);
  // Real routes/services, with only persistence replaced for this isolated test.
  const originals = new Map();
  for (const [model, methods] of [[RememberedSession, f.sessions], [User, { ...f.users, findOne: async () => f.user }]]) {
    for (const [key, method] of Object.entries(methods)) {
      originals.set([model, key], model[key]);
      model[key] = method;
    }
  }
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = (path) => `http://127.0.0.1:${server.address().port}/auth/${path}`;
  const post = async (path, body, token) => fetch(url(path), {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post("refresh", { refreshToken: { toString: "bad" } })).status, 401);
    const webLogin = await post("login", { identifier: "student", role: "STUDENT", password: "test-password" });
    const webCredentials = await webLogin.json();
    assert.equal(webCredentials.refreshToken, undefined);
    assert.equal(f.records.size, 0);
    const upgrade = await post("session", {}, webCredentials.token);
    assert.equal(upgrade.status, 200, JSON.stringify(await upgrade.clone().json()));
    assert.match((await upgrade.json()).refreshToken, /^[a-f0-9]{64}$/);
    const expired = jwt.sign({ sub: f.user._id, role: "STUDENT", tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await fetch(url("me"), { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
    const login = await post("login", { identifier: "student", role: "STUDENT", password: "test-password", rememberDevice: true });
    assert.equal(login.status, 200);
    const credentials = await login.json();
    assert.match(credentials.refreshToken, /^[a-f0-9]{64}$/);
    const refreshed = await post("refresh", { refreshToken: credentials.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers.get("cache-control"), "no-store");
    const body = await refreshed.json();
    assert.equal(body.user.passwordHash, undefined);
    assert.equal(jwt.verify(body.token, process.env.JWT_SECRET).sub, f.user._id);
    const me = await fetch(url("me"), { headers: { Authorization: `Bearer ${body.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await post("logout", { refreshToken: credentials.refreshToken })).status, 204);
    assert.equal((await post("refresh", { refreshToken: credentials.refreshToken })).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const [[model, key], method] of originals) model[key] = method;
  }
});
