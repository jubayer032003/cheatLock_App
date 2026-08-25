# CheatLock Play Store release handoff

This is an engineering evidence sheet, not legal advice or a completed Play Console declaration.

## Data dependency and deletion graph

Authenticated public self-deletion is limited to `STUDENT` accounts and resolves the target exclusively from the verified JWT subject. The current password is rechecked before deletion.

```text
User (identifier)
|- faceProfile descriptor and preview: DELETE with User
|- ExamSession, answer draft, device ID, live preview: DELETE
|- Submission and answers/grades: DELETE
|- ProctoringEvent and embedded evidence: DELETE
|- object-storage keys referenced by events/sessions: DELETE before DB transaction
|- IntegrityReview: DELETE
|- StudentNotification: DELETE
|- Exam assignedStudents/communityStudents: REMOVE REFERENCE
|- TeacherCommunity students: REMOVE REFERENCE
|- TeacherClass students/enrollmentRequests: REMOVE REFERENCE
`- AuditLog userId/details: RETAIN CURRENTLY; HUMAN POLICY DECISION REQUIRED
```

Teacher and managed staff deletion is deliberately rejected by the self-service endpoint because ownership transfer or deletion of exams, classes, institutional records, and audit records needs a product/retention decision.

## Data lifecycle inventory

| Data | Storage | Created | Existing deletion/retention |
|---|---|---|---|
| Account name, identifier, password hash | MongoDB `User` | Signup/admin provisioning | Student self-deletion; managed accounts require administrator policy |
| Auth token and cached user | Android encrypted preferences | Login/signup | Logout, successful deletion, invalid session; never falls back to plaintext preferences |
| Face descriptor and enrollment preview | MongoDB `User.faceProfile` | Student enrollment | Student self-deletion; no time-based rule |
| Device identifier | MongoDB `ExamSession.deviceId` | Exam session start | Student self-deletion; no time-based rule |
| Answer drafts/session state/live previews | MongoDB `ExamSession` | Exam activity | Student self-deletion; no time-based rule |
| Submitted answers, grades, warnings | MongoDB `Submission` | Submission | Student self-deletion; no time-based rule |
| Camera/screen evidence and suspicious events | MongoDB `ProctoringEvent`; optionally configured S3-compatible storage | Proctored exam | Routine 30 days; incident 180 days; application cleanup deletes storage objects before rows |
| Critical/investigation evidence | Same | Explicit promotion | No expiry: HUMAN POLICY DECISION REQUIRED |
| Integrity decisions/reviewer notes | MongoDB `IntegrityReview` | Instructor review | Student self-deletion; no time-based rule otherwise |
| Student notifications | MongoDB `StudentNotification` | Assignment/status/grade events | Student self-deletion; no time-based rule otherwise |
| Audit logs | MongoDB `AuditLog` | Administrative actions | HUMAN POLICY DECISION REQUIRED |
| Android local exam cache | ordinary private SharedPreferences | Exam use | Cleared on logout/deletion for active exam; broader cache lifecycle requires product review |
| Raw microphone samples | Process memory (`AudioRecord`) | Voice-activity detection | Ephemeral; current Android path does not intentionally persist or upload raw audio |

## Permissions and disclosures

| Permission | Purpose | Runtime | FGS relationship | Disclosure |
|---|---|---:|---|---|
| CAMERA | Identity, face-presence/object checks, camera evidence | Yes | No | Student pre-exam monitoring dialog |
| RECORD_AUDIO | In-memory voice-activity detection | Yes | No | Student pre-exam monitoring dialog |
| POST_NOTIFICATIONS | Visible monitoring notification | Yes on API 33+ | MediaProjection notification | Student pre-exam monitoring dialog/system prompt |
| FOREGROUND_SERVICE | Run authorized capture service | No | Base FGS permission | Screen disclosure |
| FOREGROUND_SERVICE_MEDIA_PROJECTION | Authorized screen capture | No | `ScreenCaptureService` | Immediate screen disclosure then Android consent |
| DETECT_SCREEN_CAPTURE | Detect user screenshots during a secure exam | No | No | Exam monitoring disclosure |
| HIDE_OVERLAY_WINDOWS | Reduce third-party overlays | No | No | Exam monitoring/rules |
| USE_BIOMETRIC / USE_FINGERPRINT | Local biometric authentication | System flow | No | Android biometric prompt |
| INTERNET / ACCESS_NETWORK_STATE | HTTPS backend/connectivity | No | Uploads from monitoring service | Privacy policy/data safety |

## Data Safety draft evidence

| Category | Collected/stored | Shared | Required | Purpose and code evidence |
|---|---|---|---|---|
| Personal information | Yes, backend | No third-party sharing confirmed; infrastructure processor review required | Account required | `User.js`, `auth.js` |
| Photos/images | Yes, face preview and camera/screen evidence | Authorized instructors/proctors; processor verification required | Required for proctored exams | `User.faceProfile`, `ProctoringEvent`, `ScreenCaptureManager.kt` |
| Biometric-derived information | Yes, face descriptor | No third-party sharing confirmed | Required for identity verification | `User.faceProfile.descriptor`, `FaceEmbeddingModel.kt` |
| App activity | Yes, answers, sessions, warnings, events | Authorized institution reviewers | Required for exam use | `Submission.js`, `ExamSession.js`, `ProctoringEvent.js` |
| Device identifiers | Yes | No third-party sharing confirmed | Required for session/device binding | `ExamSession.deviceId`, `MainActivity.kt` |
| Diagnostics/security | Yes, monitoring and integrity metadata | Authorized institution reviewers | Required for proctored exams | `ProctoringEvent.js`, `IntegrityReview.js` |
| Audio | Raw samples ephemeral; warning/activity results stored | Raw audio not intentionally shared | Required for configured proctored exams | Android audio analyzer and submission warning fields |

`MANUAL VERIFICATION REQUIRED`: production infrastructure subprocessors, their diagnostic collection, contractual service-provider status, backup retention, and actual Play Data Safety answers.

## MediaProjection foreground-service declaration inputs

- Service: `com.jubayer.cheatlock.proctoring.ScreenCaptureService`
- Type: `mediaProjection`
- Start: after the student selects Start Secure Session, accepts CheatLock's disclosure, and grants Android MediaProjection consent.
- Purpose: periodic screen evidence for authorized proctoring review during an active exam.
- User visibility: Android system consent followed by a persistent “CheatLock Monitoring Active” notification.
- Stop: exam completion, logout/deletion, activity teardown, explicit capture stop, or service termination.

Demonstration video script:

1. Sign in with the supplied student reviewer account.
2. Open the supplied live test exam.
3. Show the camera/microphone disclosure and Android permission prompts.
4. Complete identity/liveness preparation.
5. Tap Start Secure Session and show the CheatLock screen disclosure.
6. Continue to and accept Android's screen-capture prompt.
7. Show the persistent monitoring notification and active exam.
8. Submit/exit and show that monitoring and its notification stop.

## Reviewer access template

```text
STUDENT ACCOUNT
Email/ID: PUBLISHER REQUIRED
Password: PUBLISHER REQUIRED

TEACHER ACCOUNT
Email/ID: PUBLISHER REQUIRED
Password: PUBLISHER REQUIRED

TEST EXAM
Name: PUBLISHER REQUIRED
Code: PUBLISHER REQUIRED
Availability: PUBLISHER REQUIRED

REVIEWER INSTRUCTIONS
1. Sign in as the student.
2. Enter the test exam code.
3. Review and continue through monitoring disclosures.
4. Grant the required Android permissions.
5. Complete identity verification and start the exam.
6. Submit the exam, then sign in as the teacher to review the session.
```

## Store listing draft

- App name: CheatLock
- Category: Education
- Short description: Secure exam delivery with identity checks and proctoring assistance.
- Feature summary: assigned digital exams, identity verification, live monitoring indicators, evidence-assisted instructor review, and submission/grade workflows.
- Avoid claims that the app proves or completely prevents cheating.

## Human Play Console checklist

- [ ] Confirm permanent `com.jubayer.cheatlock` application ID
- [ ] Create/verify developer account and Play Console app
- [ ] Create and back up upload key; enroll in Play App Signing
- [ ] Supply Privacy Policy, Terms, and account-deletion HTTPS URLs
- [ ] Complete Data Safety and App Access declarations
- [ ] Complete MediaProjection foreground-service declaration and video
- [ ] Complete content rating and target audience declarations
- [ ] Supply reviewer accounts and live test exam
- [ ] Upload signed AAB to Internal Testing
- [ ] Review pre-launch and 16 KB compatibility reports
- [ ] Test Play-delivered build on physical devices
- [ ] Complete any account-specific closed-test/production-access requirement
