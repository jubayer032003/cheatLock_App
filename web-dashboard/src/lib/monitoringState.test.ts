import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapshotFor, sensorStatus, isOlderAttempt, monitoringFreshness, sameMonitoringAttempt } from "./monitoringState.ts";
import { mergeAuthoritativeStudent } from "./scoreMetrics.ts";
import type { LiveStudent } from "../types.ts";

const student = (overrides: Partial<LiveStudent> = {}): LiveStudent => ({ studentId: "synthetic", studentName: "Test", rollId: "1", status: "SAFE", suspicionScore: 0, latestAlert: "", onlineStatus: "ONLINE", ...overrides });

test("screen snapshots cannot fall back to a camera image", () => {
  const value = student({ previewUrl: "camera", screenPreviewUrl: "screen" });
  assert.equal(snapshotFor(value, "camera"), "camera");
  assert.equal(snapshotFor(value, "screen"), "screen");
  assert.equal(snapshotFor(student({ previewUrl: "camera" }), "screen"), "");
});

test("absent sensor evidence is unknown", () => {
  for (const value of [undefined, "", "  "]) assert.equal(sensorStatus(value), "Unknown");
  assert.equal(sensorStatus("Missing"), "Missing");
});

test("online does not imply that telemetry is current", () => {
  assert.equal(monitoringFreshness(student(), 100_000), "Unknown");
  assert.equal(monitoringFreshness(student({ lastSeenAt: 1_000 }), 100_000), "Telemetry stale");
  assert.equal(monitoringFreshness(student({ lastSeenAt: 99_000 }), 100_000), "Receiving telemetry");
  assert.equal(monitoringFreshness(student({ onlineStatus: "OFFLINE", lastSeenAt: 99_000 }), 100_000), "Offline");
});

test("older attempts cannot overwrite current monitoring even with a later receive time", () => {
  const previous = student({ attemptStartedAt: 200, suspicionScore: 20, lastUpdatedAt: 1000 });
  const incoming = student({ attemptStartedAt: 100, suspicionScore: 80, lastUpdatedAt: 2000 });
  assert.equal(isOlderAttempt(previous, incoming), true);
  assert.equal(mergeAuthoritativeStudent(previous, incoming), previous);
});

test("a new attempt can reset its score and replace old media", () => {
  const previous = student({ attemptStartedAt: 100, suspicionScore: 80, previewBase64: "old", lastUpdatedAt: 2000 });
  const incoming = student({ attemptStartedAt: 200, suspicionScore: 0, previewBase64: "", lastUpdatedAt: 1000 });
  const result = mergeAuthoritativeStudent(previous, incoming);
  assert.equal(result.suspicionScore, 0);
  assert.equal(result.previewBase64, "");
  assert.equal(sameMonitoringAttempt(previous, incoming), false);
  assert.equal(sameMonitoringAttempt(previous, { ...previous }), true);
});

test("monitor components retain unknown sensor labels and unverified detector status", () => {
  for (const name of ["StudentTile", "StudentDetail", "FullscreenStudent"]) {
    const source = readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\|\|\s*"(?:Matching|Quiet|Focused|Normal)"/);
    assert.match(source, /snapshotFor/);
  }
  const detail = readFileSync(new URL("../components/StudentDetail.tsx", import.meta.url), "utf8");
  assert.match(detail, /Object detector.*Unverified/);
});

test("dashboard preserves virtualized grid and reports command execution as unconfirmed", () => {
  const source = readFileSync(new URL("../pages/LiveProctoringPage.tsx", import.meta.url), "utf8");
  assert.match(source, /<VirtualGrid/);
  assert.match(source, /Student receipt and execution are unconfirmed/);
  assert.doesNotMatch(source, /payload\.screenBase64.*\|\| payload\.previewBase64/);
  assert.match(source, /seenAlerts\.has\(alertId\)/);
});

test("monitor freshness timer has an unmount cleanup", () => {
  const source = readFileSync(new URL("../hooks/useMonitoringFreshness.ts", import.meta.url), "utf8");
  assert.match(source, /return \(\) => window.clearInterval\(timer\)/);
});
