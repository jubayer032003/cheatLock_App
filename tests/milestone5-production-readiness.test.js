import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import express from "express";
import { createHealthRouter } from "../backend/src/routes/health.js";

const repoRoot = new URL("../", import.meta.url);

test("health liveness succeeds without dependency checks or authentication", async () => {
  const app = express();
  app.use("/health", createHealthRouter({
    connection: { readyState: 0 },
    validateConfig: () => {
      throw new Error("secret mongodb://user:password@example.invalid");
    },
  }));

  const response = await request(app, "/health/live");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "live");
});

test("health readiness succeeds when config and MongoDB are healthy", async () => {
  const app = express();
  app.use("/health", createHealthRouter({
    connection: { readyState: 1 },
    validateConfig: () => undefined,
  }));

  const response = await request(app, "/health/ready");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.checks, { config: "ok", mongodb: "ok" });
});

test("health readiness returns 503 when MongoDB or config is unavailable without leaking secrets", async () => {
  const app = express();
  app.use("/health", createHealthRouter({
    connection: { readyState: 0 },
    validateConfig: () => {
      throw new Error("Missing JWT_SECRET with mongodb://user:password@example.invalid");
    },
  }));

  const response = await request(app, "/health/ready");
  const serialized = JSON.stringify(response.body);
  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.checks.config, "invalid");
  assert.equal(response.body.checks.mongodb, "unavailable");
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("JWT_SECRET"), false);
  assert.equal(serialized.includes("mongodb://"), false);
});

test("deployment files reference canonical backend and readiness endpoints", async () => {
  const workflow = await read(" .github/workflows/ci-cd.yml");
  const compose = await read("docker-compose.yml");
  const backendDockerfile = await read("backend/Dockerfile");
  const manifest = await read("k8s/cheatlock-deployment.yaml");

  assert.match(workflow, /backend\/src/);
  assert.match(compose, /context:\s+\.\/backend/);
  assert.match(backendDockerfile, /CMD \["node", "src\/server\.js"\]/);
  assert.match(backendDockerfile, /USER node/);
  assert.match(backendDockerfile, /\/health\/ready/);
  assert.match(manifest, /path: \/health\/ready/);
  assert.match(manifest, /path: \/health\/live/);
  assert.doesNotMatch(manifest, /image: cheatlock\/backend:latest/);
  assert.doesNotMatch(manifest, /image: cheatlock\/dashboard:latest/);
});

test("repository hygiene ignores generated local artifacts while preserving examples", async () => {
  const gitignore = await read(".gitignore");
  const backendDockerignore = await read("backend/.dockerignore");
  const dashboardDockerignore = await read("web-dashboard/.dockerignore");

  for (const text of [gitignore, backendDockerignore, dashboardDockerignore]) {
    assert.match(text, /node_modules/);
    assert.match(text, /\.env/);
    assert.match(text, /\*\.log/);
  }
  assert.match(gitignore, /!\.env\.example/);
  assert.match(backendDockerignore, /!\.env\.example/);
  assert.match(dashboardDockerignore, /!\.env\.example/);
});

async function read(path) {
  return readFile(new URL(path.trim(), repoRoot), "utf8");
}

async function request(app, path) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
