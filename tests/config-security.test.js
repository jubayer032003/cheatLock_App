import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REPO_ROOT = new URL("../", import.meta.url);

test("production startup validation fails when JWT_SECRET is missing without leaking values", async () => {
  const error = await withEnv(
    {
      CHEATLOCK_SKIP_DOTENV: "true",
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://user:password@example.invalid:27017/cheatlock",
      JWT_SECRET: undefined,
    },
    async () => {
      const { validateStartupConfig } = await freshConfigImport();
      assert.throws(() => validateStartupConfig(), /JWT_SECRET/);
      try {
        validateStartupConfig();
      } catch (err) {
        return err;
      }
    }
  );

  assert.equal(String(error.message).includes("password"), false);
  assert.equal(String(error.message).includes("example.invalid"), false);
});

test("production startup validation fails when MONGODB_URI is missing without leaking values", async () => {
  const error = await withEnv(
    {
      CHEATLOCK_SKIP_DOTENV: "true",
      NODE_ENV: "production",
      MONGODB_URI: undefined,
      JWT_SECRET: "replace-with-test-only-long-random-value",
    },
    async () => {
      const { validateStartupConfig } = await freshConfigImport();
      try {
        validateStartupConfig();
      } catch (err) {
        return err;
      }
    }
  );

  assert.match(error.message, /MONGODB_URI/);
  assert.equal(error.message.includes("mongodb://"), false);
});

test("local development can validate with user-provided env and S3 disabled", async () => {
  await withEnv(
    {
      CHEATLOCK_SKIP_DOTENV: "true",
      NODE_ENV: "development",
      MONGODB_URI: "mongodb://localhost:27017/cheatlock",
      JWT_SECRET: "replace-with-test-only-long-random-value",
      S3_ENDPOINT: undefined,
      S3_BUCKET: undefined,
      S3_ACCESS_KEY: undefined,
      S3_SECRET_KEY: undefined,
    },
    async () => {
      const { config, validateStartupConfig } = await freshConfigImport();
      assert.doesNotThrow(() => validateStartupConfig());
      assert.equal(config.s3().enabled, false);
    }
  );
});

test("partial S3 configuration fails clearly without exposing supplied values", async () => {
  const error = await withEnv(
    {
      CHEATLOCK_SKIP_DOTENV: "true",
      MONGODB_URI: "mongodb://localhost:27017/cheatlock",
      JWT_SECRET: "replace-with-test-only-long-random-value",
      S3_ENDPOINT: "https://storage.example.invalid",
      S3_BUCKET: undefined,
      S3_ACCESS_KEY: undefined,
      S3_SECRET_KEY: undefined,
    },
    async () => {
      const { validateStartupConfig } = await freshConfigImport();
      try {
        validateStartupConfig();
      } catch (err) {
        return err;
      }
    }
  );

  assert.match(error.message, /Incomplete S3 configuration/);
  assert.equal(error.message.includes("storage.example.invalid"), false);
});

test("Docker Compose contains no committed credential literals", async () => {
  const compose = await readRepoFile("docker-compose.yml");
  assert.match(compose, /\$\{JWT_SECRET:\?/);
  assert.match(compose, /\$\{S3_SECRET_KEY:\?/);
  assert.match(compose, /\$\{MINIO_ROOT_PASSWORD:\?/);
  assertNoCommittedSecretAssignments(compose);
});

test("Kubernetes manifest contains no embedded base64 secret data", async () => {
  const manifest = await readRepoFile("k8s/cheatlock-deployment.yaml");
  assert.equal(/^\s{2}(JWT_SECRET|S3_ACCESS_KEY|S3_SECRET_KEY):\s*[A-Za-z0-9+/=]{16,}/m.test(manifest), false);
  assert.match(manifest, /stringData:/);
  assert.match(manifest, /replace-with-a-long-random-value/);
});

test(".env.example contains placeholders only for secret variables", async () => {
  const envExample = await readRepoFile(".env.example");
  const backendEnvExample = await readRepoFile("backend/.env.example");
  for (const text of [envExample, backendEnvExample]) {
    assert.match(text, /JWT_SECRET=replace-with-a-long-random-value/);
    assert.match(text, /S3_SECRET_KEY=replace-with-s3-secret-key|S3_SECRET_KEY=/);
    assert.equal(/JWT_SECRET=(?!replace-with)/.test(text), false);
  }
});

test(".gitignore excludes real environment and credential files", async () => {
  const gitignore = await readRepoFile(".gitignore");
  for (const pattern of [".env", ".env.local", ".env.production", "*.pem", "*credentials*.json", "*secret*.yaml"]) {
    assert.match(gitignore, new RegExp(escapeRegExp(pattern)));
  }
  assert.match(gitignore, /!\.env\.example/);
});

test("canonical backend source avoids S3 secret defaults", async () => {
  const files = [
    await readRepoFile("backend/src/services/s3.js"),
    await readRepoFile("backend/src/config.js"),
  ];

  for (const file of files) {
    assert.equal(/S3_(ACCESS_KEY|SECRET_KEY)[\s\S]{0,80}\|\|/.test(file), false);
  }
});

test("root backend source tree is not referenced by active entrypoints", async () => {
  const packageJson = await readRepoFile("package.json");
  const workflow = await readRepoFile(".github/workflows/ci-cd.yml");
  assert.doesNotMatch(packageJson, /node\s+(--watch\s+)?src\/server\.js/);
  assert.match(workflow, /backend\/src/);
});

async function freshConfigImport() {
  return import(`../backend/src/config.js?test=${Date.now()}-${Math.random()}`);
}

async function readRepoFile(path) {
  return readFile(new URL(path, REPO_ROOT), "utf8");
}

async function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function assertNoCommittedSecretAssignments(text) {
  const sensitiveNames = new Set([
    "JWT_SECRET",
    "S3_SECRET_KEY",
    "S3_ACCESS_KEY",
    "MINIO_ROOT_PASSWORD",
    "MINIO_ROOT_USER",
  ]);

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*([A-Z0-9_]+)\s*[:=]\s*(.+?)\s*$/);
    if (!match || !sensitiveNames.has(match[1])) continue;

    const value = match[2].trim();
    assert.equal(
      value.startsWith("${") || value.startsWith("replace-with") || value === '""' || value === "''",
      true,
      `${match[1]} must use environment interpolation or a placeholder`
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
