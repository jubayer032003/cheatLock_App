import test from "node:test";
import assert from "node:assert/strict";
import { RequestGate } from "./requestGate.ts";
import { androidUnsupportedQuestions } from "./androidCompatibility.ts";
import { monitoringAlertId, shouldAcceptMonitoringUpdate } from "./monitoringState.ts";
import type { LiveStudent } from "../types.ts";
const student = (overrides: Partial<LiveStudent> = {}): LiveStudent => ({ studentId: "student-a", studentName: "Synthetic", rollId: "1", status: "SAFE", suspicionScore: 0, latestAlert: "Test", onlineStatus: "ONLINE", ...overrides });

test("late refreshes and requests for a previous exam cannot update the current screen", () => {
  const gate = new RequestGate("exam-a");
  const old = gate.begin("exam-a")!;
  const current = gate.begin("exam-a")!;
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.isCurrent(current), true);
  gate.selectScope("exam-b");
  assert.equal(gate.isCurrent(current), false);
  assert.equal(gate.begin("exam-a"), null);
  const next = gate.begin("exam-b")!;
  gate.invalidate();
  assert.equal(gate.isCurrent(next), false);
});
test("compatibility warnings identify every unsupported Android question without dropping formats", () => {
  const questions = ["MCQ", "TRUE_FALSE", "CQ", "MULTI_SELECT", "MATH"].map((type) => ({ type }));
  assert.deepEqual(androidUnsupportedQuestions(questions), [2, 4, 5]);
  assert.equal(questions.length, 5);
  assert.deepEqual(androidUnsupportedQuestions([{ type: "MCQ" }, { type: "CQ" }]), []);
});
test("alert deduplication does not hide another student's identical alert", () => {
  const a = student({ attemptStartedAt: 100, eventId: "event-1" });
  assert.notEqual(monitoringAlertId(a), monitoringAlertId({ ...a, studentId: "student-b" }));
  assert.equal(monitoringAlertId(a), monitoringAlertId({ ...a }));
});
test("stale events cannot trigger alerts after a reset or newer telemetry", () => {
  const current = student({ attemptStartedAt: 200, lastUpdatedAt: 5000 });
  assert.equal(shouldAcceptMonitoringUpdate(current, student({ attemptStartedAt: 100, lastUpdatedAt: 6000 })), false);
  assert.equal(shouldAcceptMonitoringUpdate(current, student({ attemptStartedAt: 200, lastUpdatedAt: 4000 })), false);
  assert.equal(shouldAcceptMonitoringUpdate(current, student({ attemptStartedAt: 300, lastUpdatedAt: 1000 })), true);
  assert.equal(shouldAcceptMonitoringUpdate(undefined, current), true);
});