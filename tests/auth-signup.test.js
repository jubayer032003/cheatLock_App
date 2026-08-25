import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { authRouter } from "../backend/src/routes/auth.js";
import { clearRateLimiterStateForTests } from "../backend/src/middleware/rateLimiter.js";
import { User } from "../backend/src/models/User.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-signup-secret";
process.env.CHEATLOCK_SKIP_DOTENV = "true";

const users = new Map();
let nextId = 1;

User.findOne = (criteria = {}) => queryResult(findUser(criteria));
User.create = async (payload) => {
  const user = {
    _id: { toString: () => `user-${nextId++}` },
    ...payload,
  };
  users.set(userKey(user.identifier, user.role), user);
  return user;
};
User.findById = (id) => queryResult([...users.values()].find((user) => user._id.toString() === String(id)) || null);

beforeEach(() => {
  clearRateLimiterStateForTests();
  users.clear();
  nextId = 1;
});

test("public signup with no role creates a student and returns a student token", async () => {
  const response = await post("/auth/signup", {
    name: "Student One",
    identifier: "Student.One@Example.edu",
    password: "pass1234",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "STUDENT");
  assert.equal(response.body.user.identifier, "student.one@example.edu");

  const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
  assert.equal(decoded.role, "STUDENT");
});

test("public signup requesting STUDENT creates a student", async () => {
  const response = await post("/auth/signup", {
    name: "Student Two",
    identifier: "student-two",
    password: "pass1234",
    role: "STUDENT",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "STUDENT");
});

test("public signup requesting TEACHER is rejected and does not create a teacher", async () => {
  const response = await post("/auth/signup", {
    name: "Teacher One",
    identifier: "teacher-one",
    password: "pass1234",
    role: "TEACHER",
  });

  assert.equal(response.status, 403);
  assert.equal(users.has(userKey("teacher-one", "TEACHER")), false);
});

test("public signup requesting ADMIN is rejected and does not create an admin", async () => {
  const response = await post("/auth/signup", {
    name: "Admin One",
    identifier: "admin-one",
    password: "pass1234",
    role: "ADMIN",
  });

  assert.equal(response.status, 403);
  assert.equal([...users.values()].some((user) => user.role.includes("ADMIN")), false);
});

test("role capitalization cannot bypass student-only signup", async () => {
  const response = await post("/auth/signup", {
    name: "Teacher Mixed",
    identifier: "teacher-mixed",
    password: "pass1234",
    role: "tEaChEr",
  });

  assert.equal(response.status, 403);
  assert.equal(users.has(userKey("teacher-mixed", "TEACHER")), false);
});

test("unknown roles cannot create privileged accounts", async () => {
  const response = await post("/auth/signup", {
    name: "Unknown Role",
    identifier: "unknown-role",
    password: "pass1234",
    role: "DEPARTMENT_ADMIN",
  });

  assert.equal(response.status, 403);
  assert.equal(users.size, 0);
});

test("duplicate student signup remains rejected", async () => {
  await post("/auth/signup", {
    name: "Duplicate",
    identifier: "duplicate@example.edu",
    password: "pass1234",
  });

  const response = await post("/auth/signup", {
    name: "Duplicate Again",
    identifier: " duplicate@example.edu ",
    password: "pass1234",
    role: "STUDENT",
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.message, "Account already exists for this role.");
});

test("existing teacher login still works", async () => {
  const passwordHash = await bcrypt.hash("teacher-pass", 4);
  users.set(userKey("teacher-login", "TEACHER"), {
    _id: { toString: () => "teacher-1" },
    name: "Existing Teacher",
    identifier: "teacher-login",
    passwordHash,
    role: "TEACHER",
  });

  const response = await post("/auth/login", {
    identifier: "teacher-login",
    password: "teacher-pass",
    role: "TEACHER",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, "TEACHER");

  const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
  assert.equal(decoded.role, "TEACHER");
});

test("teacher dashboard no longer offers public teacher registration", async () => {
  const [loginPage, api] = await Promise.all([
    readFile(new URL("../web-dashboard/src/pages/LoginPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web-dashboard/src/lib/api.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(loginPage.includes("signupTeacher"), false);
  assert.equal(loginPage.includes("Create Teacher Account"), false);
  assert.equal(api.includes("signupTeacher"), false);
  assert.equal(api.includes('role: "TEACHER",'), true, "teacher login should still request TEACHER");
  assert.equal(api.includes("/auth/signup"), false);
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  });
  return app;
}

async function post(path, body) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json();
    return {
      status: response.status,
      body: responseBody,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function findUser(criteria) {
  const identifier = criteria.identifier;
  const role = criteria.role;
  if (!identifier) return null;

  if (role && typeof role === "object" && Array.isArray(role.$in)) {
    return role.$in
      .map((candidateRole) => users.get(userKey(identifier, candidateRole)))
      .find(Boolean) || null;
  }

  return users.get(userKey(identifier, role)) || null;
}

function queryResult(value) {
  return {
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(value).catch(reject);
    },
  };
}

function userKey(identifier, role) {
  return `${String(identifier).trim().toLowerCase().replace(/\s+/g, "")}:${role}`;
}
