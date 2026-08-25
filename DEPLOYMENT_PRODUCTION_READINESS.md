# CheatLock Repository, Deployment, and Production Readiness

This document records the Milestone 5 production-readiness audit. It is operational guidance, not a certification, penetration test, legal retention policy, or disaster-recovery guarantee.

## Source Of Truth

| Area | Canonical path | Evidence |
| --- | --- | --- |
| Backend source | `backend/src` | CI installs `backend` and syntax-checks `backend/src`; Docker Compose builds `context: ./backend`; backend Dockerfile runs `src/server.js` inside that context; Milestone 0, 1, 3, and 5 tests import `backend/src`. |
| Dashboard | `web-dashboard` | CI runs `npm ci` and `npm run build` in `web-dashboard`; Compose builds `./web-dashboard`; Vite production build emits dashboard assets. |
| Desktop client | `desktop` | CI runs typecheck, tests, and build in `desktop`; desktop package owns Tauri/frontend source. |
| Android client | `app` | CI and local validation run Gradle `assembleDebug`; Android package owns Kotlin source. |
| Backend tests | `tests/*.test.js` | Root `npm test` runs Node test files; tests now reference canonical backend source. |
| Deployment templates | `backend/Dockerfile`, `web-dashboard/Dockerfile`, `docker-compose.yml`, `k8s/cheatlock-deployment.yaml`, `nginx/nginx.conf` | Compose and Kubernetes reference backend/dashboard services; CI validates paths. |

## Duplicate Backend Tree Decision

The repository still contains a root-level `src` tree from the earlier backend layout. Active references were moved away from it:

- Root `package.json` delegates `start` and `dev` to `backend`.
- Tests that referenced `../src` now reference `../backend/src`.
- CI validates `backend/src`.
- Docker and Compose build from `./backend`.

Physical deletion of root `src` was deferred because the local worktree contains modified/uncommitted files in that tree and equivalence could not be fully proven without risking loss of work. Treat root `src` as deprecated and noncanonical. Future cleanup should remove it only after a clean diff confirms no unique required behavior remains.

## Environment Inventory

| Variable | Component | Required | Development default | Production requirement | Secret | Validation/documentation |
| --- | --- | --- | --- | --- | --- | --- |
| `PORT` | Backend | Optional | `3000` | Set service port if not `3000` | No | `backend/src/config.js`, `.env.example` |
| `NODE_ENV` | Backend/containers | Optional | `development` | `production` | No | Enables production CORS/JWT defaults |
| `MONGODB_URI` | Backend | Yes | `mongodb://localhost:27017/cheatlock` | Managed MongoDB URI | Yes | Startup validation rejects missing |
| `MONGODB_DB_NAME` | Backend | Optional | `cheatlock` | Explicit DB name if URI omits it | No | `backend/src/config.js` |
| `JWT_SECRET` | Backend | Yes | Placeholder only | Long random secret from secret manager | Yes | Startup validation rejects missing |
| `JWT_EXPIRES_IN` | Backend | Optional | `7d` in dev | Default `1h` when omitted in production | No | `backend/src/config.js` |
| `RESET_TOKEN_EXPIRES_MINUTES` | Backend | Optional | `30` | Set policy-approved expiry | No | `backend/src/config.js` |
| `LOG_LEVEL` | Backend | Optional | `INFO` | `INFO` or stricter unless debugging | No | `backend/src/services/logger.js` |
| `ALLOWED_ORIGINS` | Backend CORS | Production required | Local dashboard origins | Exact browser origins, no wildcard | No | Startup validation rejects missing/wildcard/malformed production values |
| `CLIENT_ORIGIN` | Backend CORS | Alternative to `ALLOWED_ORIGINS` | Local dashboard origin | Exact dashboard origin | No | Same CORS validation |
| `REDIS_URL` | Backend rate limits | Optional | `redis://127.0.0.1:6379` | Production Redis recommended | Secret if credentialed | Redis outage falls back to memory limiter |
| `S3_ENDPOINT` | Evidence storage | Optional group | Blank or MinIO URL | Required only when object storage enabled | No | Partial S3 config rejected |
| `S3_BUCKET` | Evidence storage | Optional group | Blank/local bucket | Required when S3 enabled | No | Partial S3 config rejected |
| `S3_ACCESS_KEY` | Evidence storage | Optional group | Placeholder | Secret manager value | Yes | Partial S3 config rejected |
| `S3_SECRET_KEY` | Evidence storage | Optional group | Placeholder | Secret manager value | Yes | Partial S3 config rejected |
| `S3_REGION` | Evidence storage | Optional | `us-east-1` | Provider region | No | `backend/src/config.js` |
| `VITE_API_BASE_URL` | Dashboard | Optional | `http://localhost:3000` | Public backend HTTPS origin | No | `web-dashboard/.env.example` |
| `VITE_ENABLE_PROCTORING_TEST_TOOLS` | Dashboard | Optional | `false` | Must remain unset/false | No | Simulator rendering gated in source/tests |
| `VITE_CHEATLOCK_API_ORIGIN` | Desktop | Optional | Production default unless configured | HTTPS backend origin | No | Desktop production validation rejects unsafe origins |
| `VITE_CHEATLOCK_WS_ORIGIN` | Desktop | Optional | Derived from API origin | Matching WSS origin | No | Desktop production validation checks match |
| `VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS` | Desktop | Optional | `false` | Must remain false | No | Production validation rejects true |
| `VITE_CHEATLOCK_ENABLE_MONITORING_SIMULATION` | Desktop | Optional | `false` | Must remain false | No | Production validation rejects true |
| Android API base | Android | Build-config/project dependent | Current Kotlin client config | Must point to backend HTTPS origin | No | Verify before release build |

Native clients and server-side scripts may send no browser `Origin` header. Backend CORS allows no-origin requests while still rejecting unapproved browser origins in production.

## Docker And Compose

Backend image:

- Uses `node:20-alpine`, matching CI Node 20.
- Runs `npm ci --omit=dev`.
- Copies only backend context, with `.dockerignore` excluding local env, dependencies, logs, and build output.
- Runs as the `node` user.
- Exposes `3000` and healthchecks `/health/ready`.

Dashboard image:

- Uses Node 20 builder and nginx runtime.
- Builds static assets with `npm ci` and `npm run build`.
- Simulator tools are disabled unless the explicit Vite flag is set at build time.
- Uses nginx on port 80; non-root nginx would require a separate listen-port/config change.

Compose is intended for local/development integration, not as a production Compose file. It defines MongoDB, Redis, MinIO, backend, dashboard, and nginx with health checks and development defaults. Secrets are interpolated from `.env`.

## Kubernetes Template

The Kubernetes manifest is a starting template:

- Backend image tag is a release-tag placeholder, not `latest`.
- Backend has readiness `/health/ready` and liveness `/health/live`.
- Backend has resource requests/limits, rolling update, non-root security context, dropped capabilities, and graceful termination.
- Dashboard image tag is a release-tag placeholder and has HTTP probes.
- Secrets are placeholder-only in `stringData`; real values must be injected by a secret manager or deployment tooling.
- MongoDB, Redis, and S3/MinIO are assumed external or separately provisioned for production.

Do not apply the manifest directly to production without replacing image tags, hosts, origins, secrets, ingress class, storage dependencies, and organizational security requirements.

## Health And Diagnostics

Endpoints:

- `GET /health/live`: process liveness only; no dependency checks.
- `GET /health/ready`: checks startup configuration and MongoDB connection state.
- `GET /health`: readiness alias for existing operational integrations.

Responses are small machine-readable JSON and do not include connection strings, secrets, stack traces, or topology. Health routes are mounted before the general API rate limiter and do not require authentication.

Operational logging:

- Structured JSON logger redacts token/password/secret/base64/descriptor/answer-like fields.
- Startup logs include environment, port, CORS configured flag, S3 enabled flag, and Redis configured flag without secrets.
- Request errors include method, path, code, status, and request ID.
- Shutdown, uncaught exception, and unhandled rejection handlers emit structured events.

External monitoring should watch backend process restarts, `/health/ready`, 5xx rate, auth 401/403/429 spikes, Socket.IO connection errors, evidence-storage errors, autosave failures, submission failures, and Redis fallback warnings.

## Persistence, Backup, And Retention

| Data | Store | Current behavior | Backup/retention notes |
| --- | --- | --- | --- |
| Users, roles, tenant links | MongoDB `users` | Password hashes, reset-token hash metadata, token versions | Back up before releases; reset-token fields are sensitive and short-lived. |
| Exams and assignments | MongoDB `exams` | Teacher-owned exams with access codes and assigned students | Authoritative exam source; backup required. |
| Sessions and answer drafts | MongoDB `examsessions`; local encrypted drafts on desktop | Server draft revisions plus offline local drafts | High-value operational data during live exams; restore depends on MongoDB and client local storage. |
| Submissions | MongoDB `submissions` | Final answers and warning counts | Authoritative grading/submission record; define retention by institutional policy. |
| Proctoring events | MongoDB `proctoringevents`; optional object storage references | TTL currently deletes events after 30 days | High-growth collection; 30-day TTL is product behavior, not a legal policy. |
| Evidence screenshots/previews | MongoDB fields and/or S3/MinIO depending event path | S3 can be disabled; partial S3 config rejected | If S3 disabled, evidence persistence may be limited to MongoDB payload/reference behavior. |
| Audit logs | MongoDB `auditlogs` | Tenant admin actions and security-relevant events | Back up with MongoDB; retention policy requires organizational approval. |
| Tenant configuration | MongoDB `tenants` and user tenant fields | Tenant-scoped administration | Back up with MongoDB. |

Recommended deployment policy decisions requiring owner approval: retention duration by data class, evidence storage encryption policy, backup frequency, restore testing cadence, and legal deletion workflow.

## Database Indexes

Existing indexes already cover many access patterns. Milestone 5 adds:

- `User { tenantId, role, status }` for tenant admin user management and last-admin checks.
- `User { passwordResetTokenHash, passwordResetExpiresAt }` partial index for reset-token completion.
- `Exam { createdBy, status, createdAt }` for teacher-owned exam lookup.
- `Submission { examId, submittedAt }` for scoped submission review.
- `ProctoringEvent { examId, occurredAt }` for exam timeline/replay.

These indexes improve high-frequency and security-sensitive queries. They add write/storage cost on corresponding collections; monitor index size as tenants and proctoring event volume grow.

## Local Development

1. Install Node.js 20, JDK 17, Android Studio/SDK, MongoDB, and Redis.
2. Copy `.env.example` to `.env` or `backend/.env` and replace placeholders.
3. Backend: `npm --prefix backend install`, then `npm --prefix backend run dev`.
4. Dashboard: `npm --prefix web-dashboard install`, then `npm --prefix web-dashboard run dev`.
5. Desktop: `npm --prefix desktop install`, then `npm --prefix desktop run dev`.
6. Android debug build: `./gradlew assembleDebug --console=plain --stacktrace --no-daemon`.
7. Tests: root `npm test`, desktop `npm --prefix desktop test`, dashboard production build `npm --prefix web-dashboard run build`.

## Production Build And Deployment

Backend:

- Install with `npm ci --omit=dev` in `backend`.
- Set `NODE_ENV=production`, MongoDB, JWT, exact CORS origins, and optional Redis/S3 values.
- Start with `npm start` in `backend` or container CMD.

Dashboard:

- Set `VITE_API_BASE_URL` to the backend HTTPS origin.
- Keep `VITE_ENABLE_PROCTORING_TEST_TOOLS` unset or `false`.
- Run `npm ci && npm run build`.
- Serve `dist` with a production static server.

Desktop:

- Production desktop builds require safe API/WS origins and Tauri release-signing decisions outside this milestone.

Android:

- Debug build is validated by CI. Release signing, Play distribution, and signing-key custody are intentionally separate release operations.

Rollback:

- Keep previous backend/dashboard image tags.
- Back up MongoDB before schema/index-affecting releases.
- Deploy backend first, verify health, then dashboard.
- Roll back image tags if health or smoke checks fail.

## Release Checklist

- CI green for backend, dashboard, desktop, and Android.
- Dependency risk reviewed against `SECURITY_DEPENDENCY_RISK.md`.
- Production env validated: no wildcard CORS, no missing secrets, simulator disabled.
- MongoDB backup completed.
- Index/migration impact reviewed.
- Backend `/health/live` and `/health/ready` pass.
- Dashboard loads and lazy routes work.
- Teacher login works.
- Teacher authorization and tenant isolation tests pass.
- Student exam entry works.
- Autosave, offline local-only state, conflict handling, and final submission tested.
- Live proctoring connects and teacher command authorization holds.
- Password reset completion invalidates older JWTs.
- Rate limiting returns stable 429s.
- Logging redaction verified with no JWT/reset/evidence/answer payloads.
- Rollback artifact and previous image tags available.

## Production Smoke-Test Plan

Automated where existing tests cover behavior:

1. Backend startup with valid production configuration: manual/container.
2. Startup rejection with invalid CORS configuration: automated config tests.
3. Liveness and readiness: automated health tests plus deployed curl.
4. Teacher login: automated auth/login tests plus manual UI.
5. Student login: manual or API test.
6. Exam creation: manual/API.
7. Exam assignment or access-code entry: manual/API.
8. Session start: manual/API.
9. Desktop answer autosave: automated service tests plus manual desktop.
10. Offline/local-only behavior: automated service tests plus manual desktop.
11. Revision-conflict handling: automated autosave tests.
12. Final submission: automated lifecycle tests plus manual desktop.
13. Teacher submission visibility: automated Milestone 0 tests.
14. Tenant isolation: automated Milestone 0 tests.
15. Live-proctoring connection: manual deployed Socket.IO.
16. Teacher command authorization: automated socket tests plus manual.
17. Password-reset token completion: automated Milestone 3 tests.
18. JWT invalidation after reset: automated Milestone 3 tests.
19. Rate limiting: automated Milestone 3 tests.
20. Simulator absence in production: automated static/build check plus manual dashboard.
21. Dashboard lazy route loading: automated static check plus browser devtools.
22. Android debug connectivity: manual environment-dependent check.

