# CheatLock Project Audit Report

Audit date: 2026-07-25  
Scope: current working tree under `E:\CheatLock`, including backend, web dashboard, Android app, desktop client, deployment files, and tests.  
Note: this audit intentionally avoids printing secret values. Secret-like literals found in source/deployment files are referenced by file and line only.

## 1. Executive Summary

CheatLock has a broad product surface: Node/Express backend, React teacher dashboard, Android student/teacher app, Tauri desktop client, Docker/Kubernetes deployment files, and a landing page. The current implementation contains working pieces for live proctoring, replay timelines, score synchronization, and exam/session management, and the targeted backend/web checks run during this audit passed.

The highest risks are security and operational maturity risks rather than simple syntax failures. Public self-signup can create teacher accounts, proctoring telemetry is fundamentally client-trusted, infrastructure secrets/defaults are committed in deployment/config files, and the backend exists in two source trees that currently differ. These issues can directly affect exam integrity, production stability, and incident response.

The user-reported replay/CORS behavior is consistent with two confirmed areas: backend CORS is environment-sensitive and falls back broadly when not configured, and replay media depends on stored telemetry plus S3/signed URL handling. If the deployed backend does not return CORS headers on failing routes, the dashboard will see browser-level network errors even when the root cause is a backend 5xx.

## 2. Project Inventory

Primary components found:

| Component | Location | Observed stack |
|---|---|---|
| Backend copy A | `backend/` | Node.js, Express, Mongoose, Socket.IO, Redis, S3/MinIO |
| Backend copy B | `src/` plus root `package.json` | Duplicate Node backend source tree |
| Teacher dashboard | `web-dashboard/` | React 18, Vite, TypeScript, Tailwind, Socket.IO client |
| Android app | `app/` | Kotlin, Jetpack Compose, Retrofit, camera/audio/screen capture |
| Desktop client | `desktop/` | React 19, Vite, TypeScript, Tauri 2 |
| Landing/download page | `CheatLock_LandingPage/` | Vite/React static site and downloadable APK assets |
| Deployment | `docker-compose.yml`, `k8s/`, `nginx/`, `.github/workflows/` | Docker Compose, Kubernetes YAML, GitHub Actions |
| Tests | `tests/socket-proctoring.test.js`, Android template tests | Node test runner, Android default templates |

Large files increasing maintenance risk:

| File | Size |
|---|---:|
| `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt` | 1202 lines |
| `web-dashboard/src/pages/ReplayTimelinePage.tsx` | 1317 lines |
| `desktop/src/pages/ExamSessionPage.tsx` | 689 lines |
| `backend/src/socket/proctoring.js` | 514 lines |

## 3. Current Implementation Functionality Assessment

Working or partially verified:

| Area | Assessment |
|---|---|
| Backend startup syntax | `node --check backend/src/server.js` passed. |
| Proctoring socket syntax | `node --check backend/src/socket/proctoring.js` passed. |
| Score synchronization logic | `node --test tests/socket-proctoring.test.js` passed 6/6 tests, including rapid mutation and duplicate mutation cases. |
| Teacher dashboard TypeScript | `tsc --noEmit -p tsconfig.json` passed. |
| Teacher dashboard production build | Vite build passed, with a chunk-size warning for a 924.48 kB minified JS bundle. |
| Desktop TypeScript | `tsc --noEmit -p tsconfig.json` passed. |

Replay timeline path:

- Backend route exists at `backend/src/routes/teacher.js:48`.
- Dashboard requests the timeline via `web-dashboard/src/pages/ReplayTimelinePage.tsx` and renders camera/screen media around `web-dashboard/src/pages/ReplayTimelinePage.tsx:220`, `web-dashboard/src/pages/ReplayTimelinePage.tsx:232`, and report export media around `web-dashboard/src/pages/ReplayTimelinePage.tsx:1341`.
- Backend strips inline preview payloads above a max length and prefers signed URLs in `backend/src/routes/teacher.js:431` through `backend/src/routes/teacher.js:452`.

This means replay can show a student list but no replay media when no telemetry was recorded, the selected student ID does not match stored session identifiers, stored preview fields are empty, S3 upload/signing fails, or the deployed route returns an unhandled 5xx that the browser masks as CORS.

## 4. Architecture and Design Review

Key observations:

| Finding | Evidence | Impact |
|---|---|---|
| Duplicate backend source trees | `git diff --no-index --stat backend/src src` reports a difference in `socket/proctoring.js`. Root and backend `package.json` both start `node src/server.js`. | Fixes can pass locally but fail in the deployed copy, or vice versa. |
| Large UI/controller files | Line counts listed in section 2. | Harder review, harder regression testing, higher merge risk. |
| Client-trusted proctoring model | Android sends `scoreDelta`/`mutationId` at `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:288`; backend accepts event payload deltas at `backend/src/socket/proctoring.js:158`. | Integrity depends heavily on untrusted clients. |
| Replay media and live media share base64/S3 concerns | `previewBase64` and `screenBase64` in `backend/src/models/ExamSession.js:65`, `backend/src/models/ExamSession.js:69`; proctoring events store preview at `backend/src/models/ProctoringEvent.js:55`. | Large telemetry can stress DB/network and cause replay gaps. |
| Deployment definition is partly simulated | `.github/workflows/ci-cd.yml:68` through `.github/workflows/ci-cd.yml:71` echo deployment commands rather than applying them. | CI/CD does not prove production deployment health. |

Recommended direction:

- Collapse backend to one canonical source tree.
- Split replay/player rendering, event normalization, and report export out of `ReplayTimelinePage.tsx`.
- Split Android exam security, media capture, auth, teacher flows, and navigation out of `MainActivity.kt`.
- Treat proctoring clients as evidence collectors, not authority for scoring or integrity.

## 5. Security Review

### Findings

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-001 | Critical | Remediated in source | High | Secrets/config | Medium | Secret defaults were removed from backend S3/config paths, Compose and Kubernetes now use environment references or placeholders, and real local/mobile config files are ignored. Real credential exposure is not fully resolved until affected credentials are rotated and old values invalidated. Evidence: `backend/src/config.js`, `backend/src/services/s3.js`, `src/config.js`, `src/services/s3.js`, `.env.example`, `backend/.env.example`, `tests/config-security.test.js`, `SECURITY_SECRET_ROTATION.md`. |
| CL-002 | Critical | Resolved | High | Auth/RBAC | Medium | Public signup now creates only `STUDENT` accounts; explicit privileged or unknown roles are rejected server-side, and route-level tests prove `TEACHER`, `ADMIN`, mixed-case staff roles, and unknown privileged roles cannot create staff accounts. Evidence: `backend/src/routes/auth.js:11`, `backend/src/routes/auth.js:14`, `backend/src/routes/auth.js:23`, `src/routes/auth.js:11`, `src/routes/auth.js:14`, `src/routes/auth.js:23`, `tests/auth-signup.test.js`. |
| CL-003 | High | Confirmed | High | Auth/session | Medium | JWTs default to 7 days, with no observed token revocation, rotation, refresh token, or session invalidation model. Evidence: `backend/src/routes/auth.js:53`, `backend/src/routes/auth.js:160`, `backend/src/middleware/auth.js:15`, `backend/src/middleware/auth.js:27`. |
| CL-004 | High | Confirmed | High | Logging/privacy | Low | Authorization token prefix and full decoded user object are debug-logged during auth. Evidence: `backend/src/middleware/auth.js:25`, `backend/src/middleware/auth.js:47`. |
| CL-005 | High | Confirmed | High | CORS | Low | CORS falls back to all origins if `ALLOWED_ORIGINS` is unset. Evidence: `backend/src/server.js:50`, `backend/src/server.js:55`, `backend/src/server.js:59`, `backend/src/server.js:104`. |
| CL-006 | High | Confirmed | High | Exam integrity | High | Student clients provide scoring deltas and telemetry evidence; backend clamps/deduplicates but does not independently verify device state or media authenticity. Evidence: `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:288`, `app/src/main/java/com/jubayer/cheatlock/data/BackendApi.kt:401`, `backend/src/socket/proctoring.js:158`, `backend/src/socket/proctoring.js:270`, `backend/src/socket/proctoring.js:291`. |
| CL-007 | High | Confirmed | High | RBAC | Medium | The `TEACHER` role has broad admin-like permissions, including settings and user management. Evidence: `backend/src/middleware/auth.js:60`; tenant user routes require `manage_users` at `backend/src/routes/tenants.js:168` and `backend/src/routes/tenants.js:212`. |
| CL-008 | Medium | Confirmed | High | Rate limiting | Medium | Rate limiting is global IP based at 120/min and falls back to in-memory state if Redis is unavailable. Evidence: `backend/src/middleware/rateLimiter.js:5`, `backend/src/middleware/rateLimiter.js:7`, `backend/src/middleware/rateLimiter.js:40`, `backend/src/middleware/rateLimiter.js:76`. Auth endpoints do not have stricter credential-attack throttles. |
| CL-009 | Medium | Confirmed | High | Client storage | Medium | Dashboard stores teacher JWT in session storage; desktop stores token and server URL in local storage. Evidence: `web-dashboard/src/lib/auth.ts:7`, `web-dashboard/src/lib/auth.ts:12`, `desktop/src/api/client.ts:6`, `desktop/src/api/client.ts:21`, `desktop/src/contexts/AuthContext.tsx:94`. |
| CL-010 | Medium | Confirmed | High | Android app hardening | Low | Android manifest enables backup and app-level cleartext traffic. Evidence: `app/src/main/AndroidManifest.xml:14`, `app/src/main/AndroidManifest.xml:22`; local cleartext exceptions are in `app/src/main/res/xml/network_security_config.xml:10`. |
| CL-011 | Medium | Confirmed | Medium | Desktop CSP | Low | Desktop Tauri CSP allows wildcard HTTP/HTTPS/WebSocket connections. Evidence: `desktop/src-tauri/tauri.conf.json:27`. |
| CL-012 | Medium | Confirmed | Medium | Privacy/data retention | Medium | Proctoring event media is retained with TTL but still stores sensitive preview fields. Evidence: `backend/src/models/ProctoringEvent.js:55`, `backend/src/models/ProctoringEvent.js:65`. |

Top remediation priorities:

1. Disable public teacher signup. Require invite/admin approval for teacher/proctor/admin roles.
2. Rotate all committed secret-like values and move them to environment/secret manager only.
3. Remove token/header debug logging.
4. Require explicit production CORS origins and fail startup if unset in production.
5. Rework proctoring scoring so the backend controls scoring from verifiable event types and server-side rules.

## 6. Backend API and Database Review

Backend strengths:

- Express middleware uses `helmet()` at `backend/src/server.js:74`.
- Auth middleware re-fetches the user from the database and checks account status at `backend/src/middleware/auth.js:27` through `backend/src/middleware/auth.js:36`.
- Proctoring score updates now use mutation IDs and atomic update expressions at `backend/src/socket/proctoring.js:286` through `backend/src/socket/proctoring.js:317`.
- Proctoring events have a TTL index at `backend/src/models/ProctoringEvent.js:65`.

Backend concerns:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-013 | High | Confirmed | High | Deployment/maintainability | Medium | `backend/src` and root `src` duplicate the backend. A diff exists in `socket/proctoring.js`, so deployed/runtime behavior can diverge. |
| CL-014 | High | Confirmed | High | API auth | Medium | Public `/auth/signup` is doing privileged account creation. This should be separated from student self-registration and staff onboarding. |
| CL-015 | Medium | Confirmed | High | API reliability | Low | Backend startup logs a redacted MongoDB URI display at `backend/src/server.js:125` through `backend/src/server.js:129`; keep this redaction tested and avoid logging credentials in any error path. |
| CL-016 | Medium | Confirmed | High | Replay reliability | Medium | Timeline media is suppressed when inline previews exceed the threshold or signed URL generation fails. Evidence: `backend/src/routes/teacher.js:431` through `backend/src/routes/teacher.js:452`. |
| CL-017 | Medium | Confirmed | Medium | Test tooling | Low | Backend package scripts contain `dev` and `start` only, no `test`, `lint`, or `typecheck`. Evidence: root `package.json:6` through `package.json:8`, `backend/package.json:6` through `backend/package.json:8`. |

## 7. Frontend Web Dashboard Review

Strengths:

- TypeScript check passed.
- Production Vite build passed.
- Dashboard auth uses session storage instead of persistent local storage at `web-dashboard/src/lib/auth.ts:7`.

Concerns:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-018 | High | Confirmed | High | Auth UX/security | Medium | The dashboard exposes teacher signup through the normal login page. Evidence: `web-dashboard/src/pages/LoginPage.tsx:49`, `web-dashboard/src/lib/api.ts:56`, `web-dashboard/src/lib/api.ts:57`. Combined with CL-002, this is privilege self-service. |
| CL-019 | Medium | Confirmed | High | Config/reliability | Low | Dashboard defaults to the Render backend URL when `VITE_API_BASE_URL` is missing. Evidence: `web-dashboard/src/lib/api.ts:22`. Local dev, staging, and production can silently point to the wrong backend. |
| CL-020 | Medium | Confirmed | High | Performance | Medium | Production build emits a 924.48 kB minified JS chunk warning. `ReplayTimelinePage.tsx` is 1317 lines and includes report export rendering, increasing initial payload risk. |
| CL-021 | Medium | Confirmed | Medium | Replay UX | Medium | Replay player depends on event media fields and signed URLs. If the API returns timeline events without media, the UI can correctly show the candidate but no playable replay. Evidence: `web-dashboard/src/pages/ReplayTimelinePage.tsx:220` through `web-dashboard/src/pages/ReplayTimelinePage.tsx:242`. |

## 8. Android App Review

Strengths:

- Uses `FLAG_SECURE` during secure exam flows at `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:135`, `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:215`, and `app/src/main/java/com/jubayer/cheatlock/security/ExamSecurityController.kt:44`.
- Attempts lock task mode at `app/src/main/java/com/jubayer/cheatlock/security/ExamSecurityController.kt:59`.
- HTTPS is the base network policy at `app/src/main/res/xml/network_security_config.xml:4`.

Concerns:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-022 | High | Confirmed | High | Exam integrity | High | Lock task and overlay protections are best effort; failures are logged but not treated as blocking. Evidence: `app/src/main/java/com/jubayer/cheatlock/security/ExamSecurityController.kt:51`, `app/src/main/java/com/jubayer/cheatlock/security/ExamSecurityController.kt:59`, `app/src/main/java/com/jubayer/cheatlock/security/ExamSecurityController.kt:116`. |
| CL-023 | Medium | Confirmed | High | Privacy/logging | Low | Runtime logs include exam IDs, student IDs, payload sizes, device model, and flow details. Evidence: `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:144`, `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt:363`, `app/src/main/java/com/jubayer/cheatlock/data/MongoBackendRepository.kt:281`. |
| CL-024 | Medium | Confirmed | High | Mobile security | Low | `allowBackup=true` and `usesCleartextTraffic=true` are enabled in manifest. Evidence: `app/src/main/AndroidManifest.xml:14`, `app/src/main/AndroidManifest.xml:22`. |
| CL-025 | Medium | Confirmed | High | Architecture | High | `MainActivity.kt` is 1202 lines and owns permissions, crash handling, auth, proctoring, teacher flow, exam flow, and media capture orchestration. |
| CL-026 | Medium | Confirmed | Medium | Release config | Low | Release minification is disabled. Evidence: `app/build.gradle.kts:41`. |

## 9. Desktop App Review

Strengths:

- TypeScript check passed.
- Desktop has a Tauri CSP configured at `desktop/src-tauri/tauri.conf.json:27`.
- Desktop listens for teacher commands during exam sessions at `desktop/src/pages/ExamSessionPage.tsx:301`.

Concerns:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-027 | Medium | Confirmed | High | Client storage | Medium | Token and server URL are stored in browser local storage. Evidence: `desktop/src/api/client.ts:6`, `desktop/src/api/client.ts:21`. Use OS secure storage/keychain where possible. |
| CL-028 | Medium | Confirmed | High | Network policy | Low | CSP permits `http://*`, `https://*`, `ws://*`, and `wss://*`. Evidence: `desktop/src-tauri/tauri.conf.json:27`. |
| CL-029 | Medium | Confirmed | High | Auth | Medium | Desktop exposes student self-signup and saves signup tokens persistently. Evidence: `desktop/src/services/AuthenticationService.ts:19`, `desktop/src/services/AuthenticationService.ts:21`, `desktop/src/contexts/AuthContext.tsx:130`. |
| CL-030 | Medium | Confirmed | Medium | Exam integrity | High | Desktop exam telemetry posts to `/proctoring/events` from client code. Evidence: `desktop/src/hooks/useSession.ts:70`. Server-side validation limitations from CL-006 apply here too. |

## 10. DevOps and Deployment Review

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-031 | Critical | Remediated in source | High | Secrets/deployment | Medium | Docker Compose now requires secrets from environment/local `.env`, and Kubernetes no longer embeds base64 secret values; manifests contain placeholders and operator guidance only. Real credential exposure is not fully resolved until rotation and invalidation are complete. Evidence: `docker-compose.yml`, `k8s/cheatlock-deployment.yaml`, `k8s/README.md`, `SECURITY_SECRET_ROTATION.md`, `tests/config-security.test.js`. |
| CL-032 | High | Confirmed | High | CI | Low | GitHub Actions uses `node-value` instead of the standard `node-version`, likely making Node setup invalid or ineffective. Evidence: `.github/workflows/ci-cd.yml:20` through `.github/workflows/ci-cd.yml:23`. |
| CL-033 | Medium | Confirmed | High | CI | Medium | Backend CI only runs `npm ci`; it does not run backend tests, syntax checks, linting, or dependency audit. Evidence: `.github/workflows/ci-cd.yml:32` through `.github/workflows/ci-cd.yml:35`. |
| CL-034 | Medium | Confirmed | High | Release | Medium | Staging deploy job only echoes kubectl commands. Evidence: `.github/workflows/ci-cd.yml:68` through `.github/workflows/ci-cd.yml:71`. |
| CL-035 | Medium | Confirmed | High | Kubernetes | Low | Kubernetes deployment uses `latest` image tags. Evidence: `k8s/cheatlock-deployment.yaml:49`, `k8s/cheatlock-deployment.yaml:110`. |
| CL-036 | Medium | Confirmed | Medium | Supply chain | Medium | Dependency versions use broad caret ranges across backend/web/desktop package files; no lockfile audit result was produced during this audit. Evidence: package outputs in section 14. |

## 11. Testing and QA Review

Test inventory:

- `tests/socket-proctoring.test.js`
- `app/src/androidTest/java/com/jubayer/cheatlock/ExampleInstrumentedTest.kt`

Confirmed checks run during this audit:

| Command | Result |
|---|---|
| `node --test tests\socket-proctoring.test.js` | Pass: 6 tests, 0 failures. |
| `node --check backend\src\server.js` | Pass. |
| `node --check backend\src\socket\proctoring.js` | Pass. |
| `web-dashboard: .\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json` | Pass. |
| `web-dashboard: .\node_modules\.bin\vite.cmd build --configLoader runner --outDir $env:TEMP\cheatlock-web-dashboard-dist --emptyOutDir` | Pass, chunk-size warning. |
| `desktop: .\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json` | Pass. |

QA gaps:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-037 | High | Confirmed | High | Test coverage | High | No comprehensive backend route tests, auth/RBAC tests, replay API tests, web UI tests, desktop integration tests, Android unit tests, or end-to-end proctoring tests were found. |
| CL-038 | High | Confirmed | High | Replay regression | Medium | No automated test verifies that a teacher selecting a candidate opens that student's replay timeline with correct media/events. |
| CL-039 | Medium | Confirmed | High | CI quality gate | Medium | Existing CI does not run the one backend test file found in the repository. |

Recommended minimum test additions:

1. Backend route tests for `/auth/signup`, `/auth/login`, teacher timeline route, CORS preflight, and tenant RBAC.
2. Socket tests for all proctoring event types and teacher command authorization.
3. Dashboard Playwright test for exam replay candidate selection.
4. Android unit tests for repository payload construction and score mutation IDs.
5. Desktop tests for token handling and proctoring event submission.

## 12. Code Quality and Maintainability Review

Confirmed maintainability concerns:

| ID | Severity | Status | Confidence | Area | Effort | Finding |
|---|---|---|---|---|---|---|
| CL-040 | High | Confirmed | High | Source organization | Medium | Duplicate backend trees are present and already diverged in `socket/proctoring.js`. |
| CL-041 | Medium | Confirmed | High | Complexity | High | Key files exceed 500-1300 lines, mixing data fetching, state orchestration, rendering, security actions, and export logic. |
| CL-042 | Medium | Confirmed | High | Observability | Medium | Logs are inconsistent across frontend/mobile/backend and include debug data in security-sensitive flows. |
| CL-043 | Medium | Confirmed | Medium | Dependency hygiene | Medium | Puppeteer `^21.9.0` is present in backend dependencies, and backend has no audit/test script. Evidence: `package.json` and `backend/package.json` outputs. |

Refactoring targets:

- `backend/src/socket/proctoring.js`: event validation, scoring, media handling, and broadcasting should be separate modules.
- `web-dashboard/src/pages/ReplayTimelinePage.tsx`: split candidate list, event timeline, replay player, filters, and PDF/report export.
- `app/src/main/java/com/jubayer/cheatlock/MainActivity.kt`: move proctoring orchestration and teacher/student flows into separate controllers/view models.
- `desktop/src/pages/ExamSessionPage.tsx`: split exam UI, timer/session state, socket commands, and telemetry.

## 13. Prioritized Roadmap

### Immediate: 0-2 days

1. Disable public teacher signup in backend and dashboard. Keep only student signup public, or require invite/admin-created staff accounts.
2. Rotate all committed secret-like values and remove them from source-controlled Compose/Kubernetes files.
3. Set production `ALLOWED_ORIGINS` explicitly and fail startup in production if it is missing.
4. Remove token/user-object debug logging from auth middleware.
5. Merge backend duplicate source trees into one canonical backend and update scripts/deployment to use it.
6. Add replay regression test for selecting a candidate and loading that candidate's timeline.

### Short term: 1-2 weeks

1. Add backend tests for auth, CORS, RBAC, teacher timeline, proctoring events, and S3 fallback behavior.
2. Rework staff onboarding: invite tokens, admin approval, tenant scoping, audit logs.
3. Move S3/media storage to signed URLs with bounded retention and no large base64 DB fallback for production.
4. Harden desktop CSP and token storage.
5. Harden Android release config: backup off, cleartext off for release, minify/shrink on, logs gated by build type.
6. Fix CI Node setup and make backend tests/build mandatory.

### Medium term: 1-2 months

1. Redesign proctoring scoring so server policy computes integrity score from validated event types and trusted native attestations where possible.
2. Add end-to-end tests for live proctoring and replay timeline workflows.
3. Add deployment health checks, smoke tests, immutable image tags, and real staging deploy.
4. Introduce structured logging with PII redaction and correlation IDs.
5. Split large UI/controller files and define module ownership boundaries.

## 14. Commands Run and Results

Commands run:

```powershell
Get-Content C:\Users\scs\.codex\attachments\6907c183-2943-4c68-8ae0-8e5d1119a752\pasted-text.txt
git status --short
rg --files -g '!*node_modules*' -g '!**/build/**' -g '!**/dist/**' -g '!**/.gradle/**'
Get-Content README.md
Get-Content project_report.md
Get-Content .github\workflows\ci-cd.yml
Get-Content docker-compose.yml
rg -n "signup|login|jwt|expiresIn|role|JWT_SECRET|ALLOWED_ORIGINS|cors|helmet|rateLimit|S3_ACCESS|S3_SECRET|MINIO|MONGODB_URI|previewBase64|screenBase64|scoreDelta|mutationId|localStorage|allowBackup|usesCleartext|networkSecurityConfig|FLAG_SECURE|LOCK_TASK|DevicePolicy|CSP|Content-Security|teacher_command|proctoring" backend src web-dashboard app desktop docker-compose.yml k8s .github -S
Get-Content backend\src\routes\auth.js
Get-Content backend\src\middleware\auth.js
Get-Content backend\src\middleware\rateLimiter.js
git diff --no-index --stat backend\src src
node --test tests\socket-proctoring.test.js
node --check backend\src\server.js
node --check backend\src\socket\proctoring.js
web-dashboard: .\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
web-dashboard: .\node_modules\.bin\vite.cmd build --configLoader runner --outDir $env:TEMP\cheatlock-web-dashboard-dist --emptyOutDir
desktop: .\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
```

Results summary:

- Backend proctoring test: 6 passed, 0 failed.
- Backend syntax checks: passed for `server.js` and `socket/proctoring.js`.
- Web dashboard TypeScript: passed.
- Web dashboard Vite production build: passed with chunk-size warning.
- Desktop TypeScript: passed.
- Backend source tree diff: confirmed one changed file between `backend/src` and `src`.
- Secret/deployment scan: confirmed secret-like values in source-controlled deployment/config files, redacted in this report.
- Android Gradle build was not run during this audit window.
- `npm audit`/external vulnerability scans were not run because network access is restricted in this environment.

## 15. Appendix

### Severity Definitions

| Severity | Meaning |
|---|---|
| Critical | Can directly compromise production security, exam integrity, privileged access, or secrets. |
| High | Significant security, integrity, reliability, or deployment risk likely to affect users. |
| Medium | Important hardening, maintainability, QA, or operational issue with bounded blast radius. |
| Low | Cleanup or polish issue that improves quality but is unlikely to cause immediate failure. |

### Status Definitions

| Status | Meaning |
|---|---|
| Confirmed | Direct evidence observed in source, config, or command output. |
| Likely | Strong evidence exists but full runtime confirmation was not performed. |
| Needs verification | Plausible risk that requires runtime, credentialed, or production-environment validation. |

### Notes on User-Reported CORS and Replay Issue

The browser errors mention missing `Access-Control-Allow-Origin` on requests to the Render backend. In this codebase, CORS is configured in `backend/src/server.js:50` through `backend/src/server.js:68` and Socket.IO CORS at `backend/src/server.js:103` through `backend/src/server.js:104`. If Render is serving a different backend copy, missing environment values, crashing before middleware response, or returning an upstream 520, the browser can report CORS even when the deeper issue is route failure.

For replay specifically, the candidate list can load independently from actual replay media. The media path depends on proctoring events being recorded, event fields matching the selected student/exam, and preview data either being inline and under the limit or converted to a signed URL. Confirmed relevant locations are `backend/src/routes/teacher.js:431` through `backend/src/routes/teacher.js:452`, `backend/src/socket/proctoring.js:136` through `backend/src/socket/proctoring.js:149`, and `web-dashboard/src/pages/ReplayTimelinePage.tsx:220` through `web-dashboard/src/pages/ReplayTimelinePage.tsx:242`.
