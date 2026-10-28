# Student Android ↔ Teacher Web Integration Audit
Date: 2026-10-28 (Asia/Dhaka)
Repository: E:\CheatLock

## Outcome and scope

Audited the normal teacher-assigned exam path across Android, the teacher web dashboard, canonical Node backend, session/admission APIs, monitoring, submission and results. Implemented source-backed reliability and security fixes with regression tests. Existing dirty-tree edits were preserved using pre-audit copies of every edited existing file.

This is an integration audit with verified local fixes, not proof that every possible bug has been eliminated. No production deployment, database migration, Desktop feature work or Self Exam redesign was performed. Real-device and browser end-to-end acceptance remains necessary. The previous physical crash code CL-APP-NPE-2 is not a unique stack trace; this audit does not invent a definitive new physical-device exception from it.

## Fixed findings

| ID | Priority | Confirmed problem | Fix and evidence |
|---|---|---|---|
| F01 | High | Answers were stored as answer_N, shared by students, exams and teacher-reset attempts | SHA-256 keys now include a length-delimited student/exam/server-start identity; tests prove isolation and same-attempt recovery |
| F02 | High | Cleanup removed only the first 20 answers; the autosave helper skipped blank values | Cleanup enumerates answer keys, supports a single attempt scope, and autosave also writes blank answers |
| F03 | High | Re-entering an active normal exam restarted the full duration | TeacherExamTiming derives the remaining duration from the existing server-issued startedAt |
| F04 | High | Counting one second per delayed coroutine could extend time after backgrounding; device wall-clock changes were not accounted for | Normal timing uses elapsedRealtime plus a server-time anchor; scheduled end caps the deadline; fallback behavior for older backends is tested |
| F05 | High | A malformed session response could reach exam composition | Start response must match student, exam, IN_PROGRESS and a positive server start timestamp before navigation |
| F06 | Medium | Android presence depended on camera/screen snapshots | An authenticated, attempt-bound 10-second HTTP heartbeat continues independently of images and resumes after failed submission |
| F07 | Medium | Heartbeats replaced the last alert with Student heartbeat | Heartbeat updates presence without erasing historical security evidence; local HTTP/socket regression covers it |
| F08 | High | Monitoring calls bypassed saved-session access-token refresh | Monitoring now uses the existing synchronized refresh logic on 401, retries the same immutable request once after renewal, and preserves bounded transport retries |
| F09 | High | Teacher End/reset/locked state was not handled by Android's HTTP monitoring path | Backend returns typed 409/410 lifecycle errors; Android handles these on heartbeat. End submits through the normal flow; reset/lock returns to preparation, retains scoped drafts and shows a localized notice. Network/auth/rate-limit failures are not interpreted as misconduct or teacher actions |
| F10 | High | Android redundantly called submit-session after the submission endpoint had already finalized it | Removed the redundant normal finalization call; it could otherwise affect a reset/new attempt between requests |
| F11 | High | Submission/warning creation lacked student-role, assignment and active-attempt admission checks | Both routes require STUDENT and assigned-exam admission, and reject inactive/reset/locked attempts as appropriate |
| F12 | High | New submission and lock requests were not bound to the active attempt/device | New Android requests include server attempt timestamp and device identity; backend rejects mismatches. Legacy omissions remain a documented compatibility limitation |
| F13 | High | A response-loss retry could overwrite final answers and an existing grade | Same finalized attempt returns its existing submission without rewriting it |
| F14 | High | Arbitrary question indexes, duplicate indexes and forged question text were accepted | Submission validation checks indexes/duplicates/text size and derives question text from the server exam |
| F15 | Medium | Negative/invalid warning increments and inconsistent totals/risk labels were accepted | Validate safe nonnegative counts, derive totals, and restrict risk labels to the existing enum |
| F16 | High | Legacy submit/lock could finalize not-started/reset sessions or overwrite a concurrently changed attempt | State/start/device checks and conditional session updates; no upsert on finalization. Tests reject stale/reset/foreign-device operations and retain authoritative score on lock |
| F17 | Medium | The generic teacher grading endpoint accepted out-of-range numbers | All grading paths now use the dashboard's 0–100 contract |
| F18 | High | Late HTTP refreshes/old exam responses could update a different exam screen | Request generations and route guards; old loads, assignment callbacks and lifecycle responses are discarded; duplicate lifecycle submissions are blocked |
| F19 | Medium | Stale socket alerts could still open popups/feed entries, and alert IDs could collide between students | Reject old attempt/time updates before alert side effects; deduplicate by student, attempt and event; feed keys use the same stable identity |
| F20 | Medium | Incoming sensor fields were discarded, and historical alert text was inferred as current sensor health | Preserve actual incoming sensor fields, retain Unknown for absent evidence, and stop treating historical alert wording as a current sensor reading; fullscreen refresh is synchronized |
| F21 | High | Teacher builder offered formats Android cannot render without a compatibility notice | Builder and exam-details warnings identify incompatible question numbers. Formats are not silently changed, and other clients' options are retained |
| F22 | High | Screen startup resumed after a fixed 300 ms delay even if capture service initialization failed; denial could continue camera-only | Consent and capture failures now fail startup; success waits for the service's virtual-display-ready callback, with a startup timeout after consent. Camera/microphone permission is checked before normal admission |
| F23 | High | Capture cleanup started a service merely to stop it; a partially initialized manager was not owned for cleanup | stopService is idempotent; manager ownership is assigned before start; canceled consent cannot start a stale service; failure callbacks return an actionable preparation error |
| F24 | High | Projection fallback retried a one-use token, service restart could replay consent, frame acquisition raced cleanup, and RGBA pixels were copied into RGB_565 storage | One virtual-display creation per consent; NOT_STICKY service; serialized release/start and guarded acquisition/close; ARGB_8888 matches the RGBA reader |
| F25 | Critical | Student exam APIs included correctAnswer, teacher notes, known nested grading fields and other students/community identifiers | Student-only response sanitization removes known private fields and limits the roster to the authenticated student; teacher responses, public prompts/options and dates are preserved by HTTP tests |

Capture policy checks are source-contract tests plus successful Android compilation; they are not substitutes for executing MediaProjection on Android hardware. No Android consent or protected-content restriction was bypassed.

## Verification

### Backend / cross-client contracts

Final full suite:

```powershell
node --test --test-reporter=spec (Get-ChildItem tests -Filter '*.test.js' | Select-Object -ExpandProperty FullName)
```

249 tests: **248 passed, 0 failed, 1 skipped**. The skipped test requires optional Android-exported monitoring fixtures via CHEATLOCK_MONITORING_FIXTURES_PATH. Tests use isolated local HTTP/socket servers and synthetic model fixtures. Full output: audit_outputs/integration-audit-2026-10-28/backend-tests.log.

The baseline had one stale source-only assertion expecting the older student room/user-field implementation. Updated that assertion to the current student-attempt room and socket.data identity. The real HTTP/socket authorization, isolation and lifecycle tests also pass; this was not a change weakening room authorization.

### Teacher web

`npm test`: **24 passed**, 0 failed.
`npm run build`: **passed**, TypeScript plus Vite production build.

New tests cover late responses, navigation/unmount invalidation, stale alerts, cross-student deduplication and Android question-format compatibility. These are local state/contract tests; an actual browser session with a physical Android student was not run.

### Android

**BUILD SUCCESSFUL** for :app:assembleDebug :app:testDebugUnitTest :app:androidTestClasses, offline against installed dependencies. Final Android run: **108 passed, 0 failures/errors/skips**. Instrumented-test sources compiled; no physical-device/instrumented execution was performed. Delivered development APK: app/build/outputs/apk/debug/app-debug-student-teacher-audit.apk. SHA-256: 5B64E0D6BAB1985B6ED1D31C3153CF792C4962BB4E34C4E095B09B3790BE4D3A.

New JVM tests cover attempt-key isolation, resumed/scheduled/expired timing, server clock anchoring, and lifecycle control mapping including the requirement that network/auth/rate-limit errors do not end an exam or imply misconduct. Existing question-ID, question validation, scoring, Self Exam and monitoring regressions remain in the suite.

## Remaining confirmed gaps and release blockers

| ID | Priority | Remaining gap | What is needed |
|---|---|---|---|
| R01 | High | Android has no Socket.IO teacher_command receiver. The server can dispatch commands, but Android cannot execute WARN_STUDENT, arbitrary messages, LOCK_EXAM/END_EXAM socket commands or refresh commands | Implement a client receiver/acknowledgement protocol with attempt binding and expiry. The new heartbeat handles actual backend lifecycle End/reset/locked state; that is distinct from a dispatched socket command. Keep dispatch/execution labels unconfirmed |
| R02 | High | Android only renders MCQ/CQ. TRUE_FALSE, MULTI_SELECT, math/code/matching/file-upload and other rich formats remain unsupported | Implement each format with correct answer/scoring semantics and an explicit public-data whitelist, or create compatible exams for Android students. Known private field names are sanitized; arbitrary future rich-format grading structures still need per-format contracts. Current changes warn/reject rather than silently converting or dropping questions |
| R03 | High | Submission document persistence and session finalization are separate database operations | A concurrent reset can leave a stored submission when finalization rejects. Session state is guarded, but this is not a multi-document transaction. Add an atomic/transactional submission protocol or durable per-attempt commit identity with recovery, without discarding existing grades/history |
| R04 | High | Legacy clients can omit attempt/device bindings | The new Android client sends both. Enforce bindings universally only with a coordinated client/API version rollout; omission compatibility is not equivalent to full stale-attempt protection |
| R05 | High | Android uses local drafts and does not call the existing revisioned normal-exam answer-draft API | Implement a durable revisioned Android queue, conflict recovery and server draft hydration. Local scopes prevent contamination but do not provide server-side draft durability |
| R06 | High | Ordinary final submission does not strictly enforce a per-student duration deadline on the server | Define offline/late-submission and grace-period policy, then enforce it consistently server-side. The client timer fix is not protection against a modified client |
| R07 | High | Existing sockets validate token/account state at connection, but already joined staff rooms/commands are not continuously revalidated after suspension, role/token revocation or token expiry | Reauthorize/revoke active room membership and commands, including multi-replica disconnect propagation. HTTP authorization and cross-tenant checks already pass; they do not prove live revocation |
| R08 | High | Capture runtime revocation, camera/model first-ready gating, microphone loss and auth-refresh failure during an already running attempt need complete operational-recovery behavior | Startup consent/service readiness is now gated. Device test the ongoing lifecycle; keep sensor failures separate from misconduct and preserve answers when reauthentication/recovery is needed |
| R09 | Medium | Screen evidence uses device wall-clock capture timestamps, while start identity and the new timer use server/monotonic time | Test clock skew and normalize capture-time evidence with an explicit timing model before using it to infer freshness or pre-attempt capture |
| R10 | Medium | Protected FLAG_SECURE content may be blank in MediaProjection captures, depending on Android/OEM behavior | Verify the affected Vivo/API-36 device and other supported versions. Do not bypass protected content or interpret a blank protected frame as misconduct |
| R11 | Medium | Freshness, load and offline behavior are not measured against production-scale data/Redis/MongoDB or an actual crowded school network | Run NAT/rate-limit, reconnect, long-exam expiry, media failures and replica acceptance tests. Synthetic tests cover logic, not production capacity |
| R12 | High | Open-code enrollment is inferred from an empty assignedStudents list; the first student is pushed into that list, so a later unassigned student can be rejected | Define an explicit persistent open-enrollment policy and test two sequential/concurrent synthetic students. Do not bypass assignment checks merely to work around this source-level defect |

No claim is made that all implementation bugs or security issues have been found. These gaps are visible source findings or explicit verification limits, not hypothetical claims that a device failure occurred.

## Coordinated rollout and compatibility

- Changes are local. Backend and web have **not been deployed**.
- Release the reviewed backend, Android and teacher-web changes together. Older backends lack typed lifecycle errors and server-time metadata. Timing has a legacy wall-clock fallback; new lifecycle handling requires the updated backend.
- Roll out between active exams. Previous answer_N drafts contain no trustworthy student/exam/attempt identity, so they are deliberately not imported into a new scoped attempt. Completed submissions/results are not removed.
- Install the delivered debug APK as an update on the same device for development acceptance. Do not clear app data or uninstall merely to retest.
- No database migrations or new package dependencies were introduced. New serverTime response metadata is computed at serialization, not stored as a new database field.

## Required real-device + teacher-browser acceptance

Use synthetic accounts and an isolated development backend, not real student data:

1. Create a compatible MCQ/CQ exam, assign the student, verify unauthorized/unassigned access fails, and start it as the teacher.
2. Complete face verification and camera/microphone permissions, accept screen disclosure and Android consent, and verify questions appear only after service readiness and successful admission.
3. Deny consent, cancel preparation, deny either mandatory permission, inject service/camera failures, tap Start repeatedly, rotate/background/reopen the app. Verify no ghost service, duplicate attempt, false misconduct or raw diagnostic exposure.
4. Answer question 0 and a question beyond index 20. Switch synthetic student/exam/reset attempt. Confirm isolation; resume the same attempt and verify its answers/time continue. Clear an answer and reopen to verify it remains cleared.
5. Advance server time or background the app. Verify normal and scheduled-end deadlines; change device wall clock and inspect timer versus capture timestamps separately.
6. Expire a renewable access token mid-exam, interrupt transport, and restore it. Verify the same attempt resumes monitoring and pending submission retries do not alter final answers/grades.
7. Use actual teacher End, reset and lock state changes. Verify the online Android client reacts on the heartbeat interval, keeps drafts on reset/lock and never treats a network error as a teacher action. Offline immediate delivery is not guaranteed.
8. Verify camera/screen separation, Unknown sensor labels, stale telemetry, reconnect/reset snapshots, and alert deduplication. Switch rapidly between two exams while requests are delayed; verify no stale roster/modal or old lifecycle message replaces the new exam.
9. Submit, retry after a deliberately lost response, grade within 0–100, reject out-of-range grades, and verify the student sees the same authoritative result. Exercise a concurrent teacher reset and final submission as a known remaining transaction-recovery case.
10. Verify staff/tenant isolation, revoked-account sockets, unsupported question formats and unimplemented Android teacher commands explicitly. Passing build/unit tests does not establish those missing features.

## Files, backups and rollback

- Pre-audit copies of modified existing files: audit_outputs/integration-audit-2026-10-28/before/.
- Hash-guarded source manifest: audit_outputs/integration-audit-2026-10-28/changes.json. It covers 21 edited existing files and 17 new files. All current and backup checksums were verified. Rollback helper: audit_outputs/integration-audit-2026-10-28/rollback.ps1. It validates every path/checksum before changing any source, refuses later edits, and restores pre-audit content rather than HEAD. Its syntax was checked; it was **not executed**. Review it before running .\audit_outputs\integration-audit-2026-10-28\rollback.ps1, then rebuild.
- New production files: model/ExamAttemptKey.kt, model/TeacherExamTiming.kt, model/MonitoringControl.kt; backend/services/submissionAdmission.js and studentExamPayload.js; web lib/requestGate.ts and lib/androidCompatibility.ts; localized teacher_exam_control.xml and teacher_exam_capture.xml.
- New regressions: ExamAttemptKeyTest.kt, TeacherExamTimingTest.kt, MonitoringControlTest.kt, student-teacher-integration.test.js, capture-startup-contract.test.js and web lib/integrationState.test.ts. Existing source-contract assertions were adjusted for the added heartbeat/current socket identity.
- Avoid repository-wide reset, checkout, stash, clean or whole-file restoration from HEAD: the working tree already contained extensive unrelated changes.

## Verdict

**Confirmed integration fixes implemented and local builds/regressions passed.** Production readiness remains blocked by the outstanding high-priority items and physical/browser acceptance above. This audit provides tested source changes and a prioritized remaining backlog, not a blanket guarantee that the system is bug-free.