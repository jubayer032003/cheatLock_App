# CheatLock Suspicious Score Contract

## Authority and identity

- MongoDB `ExamSession.suspicionScore` is the only authoritative suspicious score.
- A logical session is uniquely identified by `(examId, studentId)`. MongoDB enforces this with a unique compound index.
- `ExamSession.startedAt` identifies the current attempt within that logical session. A reset followed by a new start creates a new attempt marker without creating a duplicate document.
- Scores are integers in the inclusive range `0..100`.

## Mutation semantics

- Clients report event deltas; they never set the authoritative total.
- The backend applies each delta with one atomic MongoDB update, clamps the result to `0..100`, writes `updatedAt`, and returns the committed total.
- Every score-changing event must carry a stable `mutationId` (or its accepted event/idempotency-key equivalent). The session retains processed mutation identifiers so a retry cannot apply the same logical event twice.
- A score event carrying an `attemptStartedAt` that does not match the current session attempt is rejected as stale.
- Resets are explicit server operations. A lower score is accepted by clients only when its newer backend timestamp represents the new reset attempt.

## Client behavior

- Android may calculate an event-local delta for immediate event reporting, but it updates its displayed permanent score only from session bootstrap data or the backend's committed response.
- Delayed Android responses are scoped to the attempt that issued them and cannot modify a newer attempt.
- The teacher dashboard does not calculate or supplement suspicious scores. HTTP snapshots and Socket.IO messages are merged using backend `updatedAt`; older snapshots cannot overwrite newer state.
- Reports use the persisted `ExamSession.suspicionScore` directly. Evidence/event counts are context, not hidden score additions.

## Realtime delivery

- Score and alert broadcasts include the authoritative total and backend `updatedAt`, plus safe correlation fields where available (`sessionId`, `eventId`, `mutationId`, `scoreDelta`).
- Production Socket.IO replicas use the Redis adapter. Production startup fails if that shared adapter cannot be configured, preventing silent per-replica event islands.
- Reconnects rejoin the exam room and receive a fresh authoritative student list.

## Required invariant

For the same current `(examId, studentId, startedAt)` attempt, after a committed update has propagated:

```text
MongoDB ExamSession.suspicionScore
  = Android displayed suspicious score
  = Teacher Dashboard displayed suspicious score
```

Temporary transport latency is allowed. Independent client arithmetic, older-state rollback, duplicate application, and cross-attempt leakage are not.
