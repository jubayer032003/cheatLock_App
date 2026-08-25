# Exam Preparation Backend Work

The desktop preparation flow currently records consent in memory only. This avoids writing sensitive consent/session data to plain `localStorage`, but it is not durable across app restarts.

Required backend endpoint:

- `POST /exam-preparation/consent`
- Auth: student only
- Body: `studentId`, `examId`, optional `attemptId`, optional `deviceId`, `consentPolicyVersion`, `consentTimestamp`, `status`
- Server must verify the authenticated student matches `studentId` and is assigned to `examId`.
- Server must bind consent to the exact exam, attempt when available, device when available, and policy version.
- Server must reject stale consent when the policy version changes or an attempt changes.

Useful companion endpoint:

- `GET /exam-preparation/consent?examId=...&attemptId=...`
- Returns whether consent is valid for the current student, exam, attempt, device, and policy version.
