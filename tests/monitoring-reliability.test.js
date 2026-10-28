import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSnapshot, snapshotObjectKey, snapshotSource, serializeStudentSnapshots } from "../backend/src/services/monitoringMedia.js";
import { uploadFrame } from "../backend/src/services/s3.js";
import { validateStudentEventPayload, broadcastSessionState, resolveScoreMutation, monitoringEventKey } from "../backend/src/socket/proctoring.js";
import { rateLimiter, monitoringIngressLimiter, monitoringUserLimiter, loginRateLimiter, clearRateLimiterStateForTests, consumeStudentMonitoringRateLimit } from "../backend/src/middleware/rateLimiter.js";

beforeEach(clearRateLimiterStateForTests);
const jpeg = "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 0]).toString("base64");
const webp = "data:image/webp;base64," + Buffer.from("RIFF1234WEBP").toString("base64");
const read = (path) => fs.readFileSync(path, "utf8");

test("typed snapshot sources reject crossed payload fields and MIME mismatches", () => {
  assert.equal(snapshotSource("camera_preview_updated"), "camera");
  assert.equal(snapshotSource("screen_telemetry_uploaded"), "screen");
  assert.doesNotThrow(() => validateStudentEventPayload("screen_telemetry_uploaded", { captureSource: "screen", base64: jpeg }));
  assert.throws(() => validateStudentEventPayload("camera_preview_updated", { captureSource: "screen", previewBase64: jpeg }), /source/i);
  assert.throws(() => validateStudentEventPayload("screen_telemetry_uploaded", { previewBase64: jpeg }), /payload/i);
  assert.throws(() => validateStudentEventPayload("screen_telemetry_uploaded", { base64: jpeg, previewBase64: jpeg }), /Conflicting/);
  assert.throws(() => parseSnapshot("data:image/jpeg;base64," + Buffer.from("bad image").toString("base64")), /media type/);
  assert.throws(() => parseSnapshot("data:image/webp;base64,%%%%"), /encoding/);
});

test("immutable object keys distinguish attempt, source, content and real media extension", () => {
  const input = { examId: "exam-1", studentId: "private-account@example.test", attemptStartedAt: 123, source: "camera", dataUrl: jpeg };
  const key = snapshotObjectKey(input);
  assert.equal(snapshotObjectKey(input), key);
  assert.notEqual(snapshotObjectKey({ ...input, source: "screen" }), key);
  assert.notEqual(snapshotObjectKey({ ...input, attemptStartedAt: 456 }), key);
  assert.match(snapshotObjectKey({ ...input, dataUrl: webp }), /\.webp$/);
  assert.match(key, /\.jpg$/);
  assert.equal(key.includes(input.studentId), false);
});

test("bootstrap and broadcast snapshot serializer signs camera and screen independently", async () => {
  const requested = [];
  const result = await serializeStudentSnapshots({ previewBase64: "camera/key.jpg", screenBase64: "screen/key.webp" }, async (key) => { requested.push(key); return `https://local.invalid/${key}?signed`; });
  assert.deepEqual(requested.sort(), ["camera/key.jpg", "screen/key.webp"]);
  assert.equal(result.previewBase64, "");
  assert.match(result.previewUrl, /camera/);
  assert.match(result.screenPreviewUrl, /screen/);
  assert.equal(result.screenBase64, result.screenPreviewUrl);
});

test("signing failure hides raw object keys while retaining independent inline fallback", async () => {
  const result = await serializeStudentSnapshots({ previewBase64: jpeg, screenBase64: "private/key" }, async () => { throw new Error("offline"); });
  assert.equal(result.previewBase64, jpeg);
  assert.equal(result.screenBase64, "");
  assert.equal(JSON.stringify(result).includes("private/key"), false);
});

test("S3 upload sends binary bytes without false base64 Content-Encoding", async () => {
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
  const previous = names.map((name) => process.env[name]);
  let command;
  try {
    ["https://local.invalid", "local-test", "local-dummy", "local-dummy"].forEach((value, index) => { process.env[names[index]] = value; });
    await uploadFrame("synthetic.webp", webp, "image/webp", { send: async (input) => { command = input; return {}; } });
    assert.equal(command.input.ContentType, "image/webp");
    assert.equal(command.input.ContentEncoding, undefined);
    assert.deepEqual(command.input.Body, Buffer.from("RIFF1234WEBP"));
  } finally {
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});

test("ordinary broadcasts send one student and never rebuild the full roster", async () => {
  const events = [];
  await broadcastSessionState({ to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }) }, "screen_telemetry_uploaded", { _id: "exam" }, { _id: "session", studentId: "student", startedAt: 123, screenBase64: jpeg });
  assert.equal(events.length, 1);
  assert.equal(events[0].room, "exam:staff:exam");
  assert.equal(events[0].event, "screen_telemetry_uploaded");
  assert.equal(events[0].data.screenBase64, jpeg);
});

test("default alert deltas require an ID and repeat delivery changes score once", () => {
  assert.throws(() => validateStudentEventPayload("ai_alert_created", {}), { code: "SCORE_MUTATION_ID_REQUIRED" });
  assert.doesNotThrow(() => validateStudentEventPayload("ai_alert_created", { eventId: "alert-a" }));
  const first = resolveScoreMutation({ existingScore: 20, scoreDelta: 20, mutationId: "123:alert-a" });
  const second = resolveScoreMutation({ existingScore: first.score, scoreDelta: 20, mutationId: "123:alert-a", appliedMutationIds: first.mutationIds });
  assert.equal(first.score, 40);
  assert.equal(second.score, 40);
});

test("persistent event identity distinguishes attempts, sources and event IDs", () => {
  const session = { _id: "session", startedAt: 123 };
  const key = monitoringEventKey(session, "ai_alert_created", { eventId: "one" });
  assert.equal(monitoringEventKey(session, "ai_alert_created", { eventId: "one" }), key);
  assert.notEqual(monitoringEventKey({ ...session, startedAt: 456 }, "ai_alert_created", { eventId: "one" }), key);
  assert.notEqual(monitoringEventKey(session, "suspicion_score_updated", { eventId: "one" }), key);
  assert.notEqual(monitoringEventKey(session, "ai_alert_created", { eventId: "two" }), key);
});

async function consume(middleware, req) {
  let result = { status: 200 };
  const res = { setHeader(name, value) { result[name] = value; }, status(status) { result.status = status; return this; }, json(body) { result.body = body; } };
  await middleware(req, res, () => {});
  return result;
}
const studentRequest = (sub = "student-a") => ({ ip: "192.0.2.1", headers: {}, user: { sub, identifier: sub, role: "STUDENT" }, body: { examId: "exam", attemptStartedAt: 123 } });

test("150 students behind one NAT can each send 60 events/minute without a shared 120 limit", async () => {
  for (let event = 0; event < 60; event++) for (let student = 0; student < 150; student++) {
    const req = studentRequest(`student-${student}`);
    assert.equal((await consume(monitoringIngressLimiter, req)).status, 200);
    assert.equal((await consume(monitoringUserLimiter, req)).status, 200);
  }
});

test("one abusive student's 429 does not consume peer budgets and changing attempt cannot bypass it", async () => {
  for (let n = 0; n < 120; n++) assert.equal((await consume(monitoringUserLimiter, studentRequest())).status, 200);
  const req = studentRequest(); req.body.attemptStartedAt = 999;
  const limited = await consume(monitoringUserLimiter, req);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited["Retry-After"]) > 0);
  assert.equal((await consume(monitoringUserLimiter, studentRequest("student-b"))).status, 200);
});

test("socket monitoring cannot bypass the authenticated HTTP monitoring budget", async () => {
  const req = studentRequest();
  for (let n = 0; n < 120; n++) await consume(monitoringUserLimiter, req);
  assert.equal((await consumeStudentMonitoringRateLimit(req.user)).allowed, false);
  assert.equal((await consumeStudentMonitoringRateLimit(studentRequest("student-b").user)).allowed, true);
});

test("ordinary API and login budgets remain bounded and spoofed forwarding headers cannot evade them", async () => {
  for (let n = 0; n < 121; n++) {
    const req = studentRequest(); req.headers["x-forwarded-for"] = `192.0.2.${n}`;
    assert.equal((await consume(rateLimiter, req)).status, n < 120 ? 200 : 429);
  }
  for (let n = 0; n < 9; n++) {
    const req = studentRequest(); req.body = { identifier: "account" }; req.headers["x-forwarded-for"] = `203.0.113.${n}`;
    assert.equal((await consume(loginRateLimiter, req)).status, n < 8 ? 200 : 429);
  }
});

test("server places authenticated monitoring before the ordinary shared-IP limiter", () => {
  const server = read("backend/src/server.js");
  assert.ok(server.indexOf('app.use("/proctoring", proctoringRouter)') < server.indexOf("app.use(rateLimiter)"));
  const route = read("backend/src/routes/proctoring.js");
  assert.match(route, /requireAuth,\s+requireRole\("STUDENT"\),\s+monitoringUserLimiter/);
});

test("every Android monitoring request producer binds a numeric server attempt before dispatch", () => {
  const main = read("app/src/main/java/com/jubayer/cheatlock/MainActivity.kt");
  const producers = [...main.matchAll(/ProctoringEventRequest\(([\s\S]*?)\n\s*\)/g)];
  assert.equal(producers.length, 4, "Update the audit matrix when adding a producer");
  for (const producer of producers) assert.match(producer[1], /attemptStartedAt\s*=/);
  assert.match(read("app/src/main/java/com/jubayer/cheatlock/data/BackendApi.kt"), /val attemptStartedAt: Long\?/);
  assert.match(main, /val scoreAttempt = activeScoreAttempt[\s\S]*?scope.launch/);
  assert.match(main, /snapshotAttempt != activeScoreAttempt/);
  assert.match(main, /sendPreviewSnapshot\(snapshot, renderedAttempt\)/);
  assert.match(main, /sendPreviewSnapshot\(snapshot, screenAttempt, MonitoringSnapshotSource.SCREEN, capturedAt\)/);
  const startFlow = main.slice(main.indexOf("// 4. Start Session"), main.indexOf("examStorage.saveSession(startedSession)"));
  assert.ok(startFlow.length > 100);
  assert.doesNotMatch(startFlow, /getMySession\(examId\)/);
});

test("Android source contracts separate camera/screen, retain real screen timing and bound retries", () => {
  const source = read("app/src/main/java/com/jubayer/cheatlock/proctoring/MonitoringSnapshotSource.kt");
  assert.match(source, /CAMERA\("camera_preview_updated", "camera"\)/);
  assert.match(source, /SCREEN\("screen_telemetry_uploaded", "screen"\)/);
  const main = read("app/src/main/java/com/jubayer/cheatlock/MainActivity.kt");
  assert.match(main, /previewBase64 = if \(source == MonitoringSnapshotSource.CAMERA\) snapshot else null/);
  assert.match(main, /base64 = if \(source == MonitoringSnapshotSource.SCREEN\) snapshot else null/);
  assert.match(read("app/src/main/java/com/jubayer/cheatlock/proctoring/ScreenCaptureManager.kt"), /onSnapshot\(snapshot, now\)/);
  const repo = read("app/src/main/java/com/jubayer/cheatlock/data/MongoBackendRepository.kt");
  assert.match(repo, /retries >= 2/);
  assert.match(repo, /CancellationException\) throw error/);
  assert.match(repo, /retryAfter > 5_000L/);
  assert.match(repo, /Semaphore\(2\)/);
  assert.match(repo, /snapshotLock\.tryLock\(\)/);
  assert.match(repo, /api.sendProctoringEvent\(bearerToken\(\), request\)/);
});
