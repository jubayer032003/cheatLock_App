import test from "node:test";
import assert from "node:assert/strict";
import { authoritativeSuspicionScore } from "../backend/src/services/scoreContract.js";

test("integrity report uses ExamSession.suspicionScore without event bonuses", () => {
  assert.equal(authoritativeSuspicionScore({ suspicionScore: 20 }), 20);
});

test("authoritative report score is safely normalized", () => {
  assert.equal(authoritativeSuspicionScore({ suspicionScore: 120 }), 100);
  assert.equal(authoritativeSuspicionScore({ suspicionScore: -5 }), 0);
  assert.equal(authoritativeSuspicionScore(null), 0);
});
