import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAttemptMatches, incrementStudentScore, normalizeScoreMetrics, resolveScoreMutation, resolveSuspicionScore, validateStudentEventPayload } from '../backend/src/socket/proctoring.js';
import { ExamSession } from '../backend/src/models/ExamSession.js';

test('prefers the live client score for suspicion_score_updated events', () => {
  const score = resolveSuspicionScore({
    existingScore: 20,
    lastSeenAt: Date.now() - 10_000,
    now: Date.now(),
    thresholds: { decayRate: 0.4 },
    eventName: 'suspicion_score_updated',
    payloadScore: 85,
  });

  assert.equal(score, 85);
});

test('adds exactly one alert weight when no client score is provided', () => {
  const score = resolveSuspicionScore({
    existingScore: 30,
    lastSeenAt: Date.now() - 1000,
    now: Date.now(),
    thresholds: { decayRate: 0.4 },
    eventName: 'ai_alert_created',
    payloadScore: undefined,
    alertText: 'face missing',
  });

  assert.equal(score, 50);
});

test('uses the client-provided score for alert events to avoid double counting', () => {
  const score = resolveSuspicionScore({
    existingScore: 15,
    lastSeenAt: Date.now() - 1000,
    now: Date.now(),
    thresholds: { decayRate: 0.4 },
    eventName: 'ai_alert_created',
    payloadScore: 40,
    alertText: 'face missing',
  });

  assert.equal(score, 40);
});

test('does not score routine screen evidence without an explicit score', () => {
  const score = resolveSuspicionScore({
    existingScore: 15,
    lastSeenAt: Date.now() - 1000,
    now: Date.now(),
    thresholds: { decayRate: 0.4 },
    eventName: 'screen_telemetry_uploaded',
    payloadScore: undefined,
  });

  assert.equal(score, 15);
});

test('applies five rapid +1 score mutations as exactly +5', () => {
  let score = 20;
  let mutationIds = [];

  for (let index = 0; index < 5; index += 1) {
    const result = resolveScoreMutation({
      existingScore: score,
      scoreDelta: 1,
      mutationId: `rapid-${index}`,
      appliedMutationIds: mutationIds,
    });
    score = result.score;
    mutationIds = result.mutationIds;
  }

  assert.equal(score, 25);
  assert.equal(mutationIds.length, 5);
});

test('applies the requested sequential score scenario as exactly 40', () => {
  let score = 0;
  let mutationIds = [];

  for (const [index, scoreDelta] of [10, 5, 15, 10].entries()) {
    const result = resolveScoreMutation({
      existingScore: score,
      scoreDelta,
      mutationId: `scenario-${index}`,
      appliedMutationIds: mutationIds,
    });
    score = result.score;
    mutationIds = result.mutationIds;
  }

  assert.equal(score, 40);
  assert.equal(mutationIds.length, 4);
});

test('applies 0 +20 +40 +20 as authoritative totals 20, 60, and 80', () => {
  let score = 0;
  let mutationIds = [];
  const totals = [];
  for (const [index, scoreDelta] of [20, 40, 20].entries()) {
    const result = resolveScoreMutation({
      existingScore: score,
      scoreDelta,
      mutationId: `sequence-${index}`,
      appliedMutationIds: mutationIds,
    });
    score = result.score;
    mutationIds = result.mutationIds;
    totals.push(score);
  }
  assert.deepEqual(totals, [20, 60, 80]);
});

test('applies the required rapid sequence as exactly 60', () => {
  let score = 0;
  let mutationIds = [];
  for (const [index, scoreDelta] of [5, 10, 20, 5, 20].entries()) {
    const result = resolveScoreMutation({ existingScore: score, scoreDelta, mutationId: `rapid-required-${index}`, appliedMutationIds: mutationIds });
    score = result.score;
    mutationIds = result.mutationIds;
  }
  assert.equal(score, 60);
});

test('applies four distinct concurrent-intent mutations as exactly 60', () => {
  let score = 0;
  let mutationIds = [];
  for (const [index, scoreDelta] of [20, 20, 10, 10].entries()) {
    const result = resolveScoreMutation({ existingScore: score, scoreDelta, mutationId: `concurrent-required-${index}`, appliedMutationIds: mutationIds });
    score = result.score;
    mutationIds = result.mutationIds;
  }
  assert.equal(score, 60);
});

test('applies ten distinct rapid mutations without dropping an increment', () => {
  let score = 0;
  let mutationIds = [];

  for (let index = 0; index < 10; index += 1) {
    const result = resolveScoreMutation({
      existingScore: score,
      scoreDelta: 4,
      mutationId: `concurrent-${index}`,
      appliedMutationIds: mutationIds,
    });
    score = result.score;
    mutationIds = result.mutationIds;
  }

  assert.equal(score, 40);
  assert.equal(mutationIds.length, 10);
});

test('does not apply the same score mutation twice', () => {
  const first = resolveScoreMutation({
    existingScore: 20,
    scoreDelta: 5,
    mutationId: 'retry-safe-1',
    appliedMutationIds: [],
  });
  const retry = resolveScoreMutation({
    existingScore: first.score,
    scoreDelta: 5,
    mutationId: 'retry-safe-1',
    appliedMutationIds: first.mutationIds,
  });

  assert.equal(first.score, 25);
  assert.equal(retry.score, 25);
  assert.equal(retry.duplicate, true);
});

test('does not let an older absolute score lower a newer backend score', () => {
  const result = resolveScoreMutation({
    existingScore: 60,
    authoritativeScore: 35,
    appliedMutationIds: [],
  });

  assert.equal(result.score, 60);
});

test('applies five alert score mutations as exactly 100', () => {
  let score = 0;
  let mutationIds = [];

  for (let index = 0; index < 5; index += 1) {
    const result = resolveScoreMutation({
      existingScore: score,
      scoreDelta: 20,
      mutationId: `alert-${index}`,
      appliedMutationIds: mutationIds,
    });
    score = result.score;
    mutationIds = result.mutationIds;
  }

  assert.equal(score, 100);
  assert.equal(mutationIds.length, 5);
});

test('normalizes canonical score metrics into a safe 0-100 range', () => {
  assert.deepEqual(
    normalizeScoreMetrics({
      score: Number.POSITIVE_INFINITY,
      suspiciousActivityCount: -1,
      capturedFrameCount: "bad",
      processedFrameCount: 2.7,
      updatedAt: "2026-08-04T00:00:00.000Z",
    }),
    {
      rawScore: 0,
      maximumScore: 100,
      percentage: 0,
      trustScore: 100,
      suspiciousActivityCount: 0,
      capturedFrameCount: 0,
      processedFrameCount: 2,
      updatedAt: "2026-08-04T00:00:00.000Z",
    }
  );

  assert.equal(normalizeScoreMetrics({ score: 150 }).percentage, 100);
  assert.equal(normalizeScoreMetrics({ score: -20 }).percentage, 0);
});

test('atomic update is scoped to one exam and student and increments inside MongoDB', async () => {
  const original = ExamSession.findOneAndUpdate;
  let captured;
  ExamSession.findOneAndUpdate = (filter, update, options) => {
    captured = { filter, update, options };
    return { lean: async () => ({ suspicionScore: 20 }) };
  };
  try {
    await incrementStudentScore({
      exam: { _id: 'exam-a' },
      studentId: 'student-a',
      amount: 20,
      mutationId: 'mutation-a',
      now: Date.parse('2026-08-15T00:00:00Z'),
    });
  } finally {
    ExamSession.findOneAndUpdate = original;
  }

  assert.deepEqual(captured.filter, { examId: 'exam-a', studentId: 'student-a' });
  assert.equal(captured.options.upsert, true);
  assert.equal(captured.options.new, true);
  assert.deepEqual(captured.update[0].$set.suspicionScore.$cond[2].$min[1].$max[1].$add[1], 20);
});

test('ExamSession enforces unique exam and student identity', () => {
  const indexes = ExamSession.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.studentId === 1 && keys.examId === 1 && options.unique === true));
});

test('stale Android attempt score events are rejected', () => {
  assert.throws(
    () => assertAttemptMatches('suspicion_score_updated', { attemptStartedAt: 100 }, { startedAt: 200 }),
    (error) => error.code === 'STALE_EXAM_ATTEMPT' && error.status === 409,
  );
  assert.doesNotThrow(() => assertAttemptMatches('suspicion_score_updated', { attemptStartedAt: 200 }, { startedAt: 200 }));
});

test('score deltas require a stable mutation identifier', () => {
  assert.throws(
    () => validateStudentEventPayload('suspicion_score_updated', { scoreDelta: 20 }),
    (error) => error.code === 'SCORE_MUTATION_ID_REQUIRED' && error.status === 400,
  );
  assert.doesNotThrow(() => validateStudentEventPayload('suspicion_score_updated', { scoreDelta: 20, eventId: 'stable-event-a' }));
});
