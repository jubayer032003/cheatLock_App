import assert from 'node:assert/strict';
import test from 'node:test';

let sequence = 0;
async function withConfig(path, overrides, check) {
  const values = {
    CHEATLOCK_SKIP_DOTENV: 'true', NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/offline_test',
    JWT_SECRET: 'test'.repeat(16), CLIENT_ORIGIN: '', ALLOWED_ORIGINS: '',
    S3_ENDPOINT: '', S3_BUCKET: '', S3_ACCESS_KEY: '', S3_SECRET_KEY: '',
    ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    const module = await import(new URL(`../${path}/config.js?cors-test=${sequence++}`, import.meta.url));
    await check(module);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
function permits(cors, origin) {
  let allowed;
  cors.origin(origin, (error, result) => { assert.equal(error, null); allowed = result; });
  return allowed;
}

for (const path of ['backend/src']) {
  for (const variable of ['ALLOWED_ORIGINS', 'CLIENT_ORIGIN']) {
    test(`${path}: production rejects ${variable} wildcard without concrete origins`, async () => {
      await withConfig(path, { [variable]: '*' }, ({ validateStartupConfig, buildCorsOptions }) => {
        assert.throws(validateStartupConfig, /Wildcard CORS/);
        assert.throws(buildCorsOptions, /Wildcard CORS/);
      });
    });
  }
  for (const overrides of [
    { ALLOWED_ORIGINS: '*', CLIENT_ORIGIN: 'https://teacher.example.invalid' },
    { CLIENT_ORIGIN: '*', ALLOWED_ORIGINS: 'https://teacher.example.invalid' },
    { ALLOWED_ORIGINS: '*,https://teacher.example.invalid' },
  ]) {
    test(`${path}: legacy wildcard with concrete origins ${JSON.stringify(overrides)}`, async () => {
      await withConfig(path, overrides, ({ validateStartupConfig, buildCorsOptions }) => {
        assert.doesNotThrow(validateStartupConfig);
        const cors = buildCorsOptions();
        assert.equal(cors.credentials, false);
        assert.equal(permits(cors, 'https://teacher.example.invalid'), true);
        assert.equal(permits(cors, 'https://unrelated.example.invalid'), false);
        assert.equal(permits(cors, undefined), true);
      });
    });
  }
  test(`${path}: exact allowlists reject unrelated origins`, async () => {
    await withConfig(path, { ALLOWED_ORIGINS: 'https://teacher.example.invalid' }, ({ validateStartupConfig, buildCorsOptions }) => {
      assert.doesNotThrow(validateStartupConfig);
      const cors = buildCorsOptions();
      assert.equal(permits(cors, 'https://teacher.example.invalid'), true);
      assert.equal(permits(cors, 'https://other.example.invalid'), false);
    });
  });
  test(`${path}: Render accepts the configured localhost dashboard ports`, async () => {
    const origins = ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'];
    await withConfig(path, { CLIENT_ORIGIN: origins[0], ALLOWED_ORIGINS: origins.join(',') }, ({ validateStartupConfig, buildCorsOptions }) => {
      assert.doesNotThrow(validateStartupConfig);
      const cors = buildCorsOptions();
      for (const origin of origins) assert.equal(permits(cors, origin), true);
      assert.equal(permits(cors, 'https://other.example.invalid'), false);
      assert.equal(permits(cors, undefined), true);
    });
  });
  test(`${path}: blank entries in an explicit comma-separated list remain invalid`, async () => {
    await withConfig(path, { ALLOWED_ORIGINS: 'https://teacher.example.invalid,' }, ({ validateStartupConfig }) => assert.throws(validateStartupConfig, /Invalid CORS/));
  });
  test(`${path}: missing and malformed origins still fail`, async () => {
    await withConfig(path, {}, ({ validateStartupConfig }) => assert.throws(validateStartupConfig, /Production CORS/));
    await withConfig(path, { ALLOWED_ORIGINS: 'invalid-origin' }, ({ validateStartupConfig }) => assert.throws(validateStartupConfig, /Invalid CORS/));
  });
  test(`${path}: mixed origins do not bypass required JWT configuration`, async () => {
    await withConfig(path, { CLIENT_ORIGIN: 'https://teacher.example.invalid', ALLOWED_ORIGINS: '*', JWT_SECRET: '' }, ({ validateStartupConfig }) => assert.throws(validateStartupConfig, /JWT_SECRET/));
  });
}
