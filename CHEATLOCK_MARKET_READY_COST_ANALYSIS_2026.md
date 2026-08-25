# CheatLock Market-Ready Cost Analysis 2026

Date: 2026-08-04  
Currency basis: USD, with BDT conversion using 1 USD = 123.6777 BDT from Bangladesh Bank published exchange-rate data found during this audit. Actual invoices will vary with provider region, tax, FX spread, reserved commitments, and payment processor fees.

## Executive Summary

CheatLock is not a lightweight SaaS dashboard. The repository contains a full exam-proctoring platform: Android app, Tauri desktop app, React teacher dashboard, React landing page, Node/Express backend, MongoDB/Mongoose data model, Redis-backed rate limiting, Socket.IO live proctoring, S3-compatible evidence storage, Docker, Kubernetes, Nginx, and GitHub Actions CI.

The main cost driver is evidence capture and replay media, not normal API traffic. Current implementation evidence shows:

- Desktop capture policy: 2-second cadence, 1280 px maximum frame dimension, WebP preferred, JPEG fallback, 500 KiB maximum frame bytes, queue capped at 150 items and 100 MiB, 2 concurrent uploads in `desktop/src/config/capturePolicy.ts`.
- Android screen evidence: 2-second interval, 1280 px maximum preview side, JPEG quality 80, ImageReader max image queue 1 in `app/src/main/java/com/jubayer/cheatlock/proctoring/ScreenCaptureManager.kt`.
- Backend evidence storage is S3-compatible, with MongoDB storing metadata and signed URLs used for replay/live proctoring in `backend/src/services/s3.js` and `backend/src/socket/proctoring.js`.
- Deployment manifests target 3 backend replicas with HPA up to 10, 2 dashboard replicas, MongoDB, Redis, S3-compatible object storage, and Nginx/Kubernetes ingress.

At the configured 500 KiB cap, one frame every 2 seconds equals 1,800 frames per hour per stream. If both camera and screen evidence are uploaded, the hard upper bound is:

```text
1,800 frames/hour * 2 streams * 500 KiB = about 1.84 GB per student-hour
```

That means a 100,000-student platform with only one 60-minute exam per student per month can generate up to about 184 TB/month of new evidence. Four such exams per month can generate up to about 737 TB/month. Object storage remains affordable on cheaper providers, but replay egress, retention policy, support staffing, device QA, and compliance become the real scale risks.

Verdict: CheatLock can be launched commercially, but it should not enter broad paid production until media-size telemetry, retention enforcement, device QA, migration safety, incident response, privacy/legal documents, and monitoring budgets are finalized.

## 1. Complete Repository Audit

Inspected top-level repository folders and product surfaces:

- `app`: Android student app using Kotlin, Compose, CameraX, ML Kit, TensorFlow Lite, Retrofit, secure crypto, biometric APIs.
- `desktop`: Tauri desktop student app using React 19, TypeScript, Vite, Socket.IO, local capture/upload services, Rust/Tauri native modules.
- `web-dashboard`: React 18 teacher/admin dashboard with Vite, Tailwind, Socket.IO client, Recharts, API client.
- `CheatLock_LandingPage`: React landing page with Vite/Tailwind and Google GenAI dependency.
- `backend`: Node 20, Express, Mongoose/MongoDB, Socket.IO, Redis/ioredis, JWT auth, Helmet, S3-compatible storage.
- `k8s`: Kubernetes deployment, service, HPA, ingress, network policy templates.
- `nginx`: reverse proxy, TLS, rate limits, Socket.IO proxying.
- `.github`: CI/security workflow.
- `docker-compose.yml`: local MongoDB, Redis, MinIO, backend, dashboard, Nginx.

Current repository scale: `rg --files` found 436 tracked/discoverable files in the working tree, excluding ignored dependency trees.

## 2. Dependency Analysis

Runtime dependencies that affect commercial readiness:

- Backend: Express, Mongoose, MongoDB, Socket.IO, AWS SDK S3 client, ioredis, JWT, bcryptjs, Helmet, CORS, Zod.
- Android: CameraX, ML Kit face/image/barcode/text APIs, TensorFlow Lite, Retrofit/Gson, biometric, security-crypto, ZXing.
- Desktop: Tauri 2, React 19, Vite, Socket.IO client, Axios, TanStack Query, keyring, reqwest.
- Dashboard: React 18, Vite, Socket.IO client, Axios, Recharts, Tailwind, lucide-react.
- Landing page: React 19, Vite, Tailwind, Google GenAI dependency.

Commercial risk:

- The product spans mobile, desktop, backend, real-time sockets, media capture, cloud storage, and AI-like monitoring. This requires more QA and support than a typical CRUD SaaS.
- AI costs are currently mostly on-device/local from the repo. The Google GenAI dependency appears in the landing page, not in the core proctoring path. If cloud vision scoring is added later, this cost model changes materially.
- The Android build already has a known lint blocker from prior validation: missing `android.permission.HIDE_OVERLAY_WINDOWS` declaration. That is release-readiness work, not a hosting cost, but it affects app-store readiness.

## 3. Cloud Infrastructure Cost

The repo supports two practical hosting models.

### Lean Launch Model

Use managed PaaS for backend/dashboard plus managed MongoDB, Redis, and S3-compatible object storage.

Good for: pilot, first schools, low DevOps overhead.  
Bad for: high media volume, expensive egress, less control over Socket.IO scaling.

Approximate monthly baseline:

| Component | Low launch choice | USD/mo | BDT/mo |
|---|---:|---:|---:|
| Backend web service | Render/Railway/Fly small production instance | 25-100 | 3,092-12,368 |
| Dashboard hosting | Static hosting or small Nginx service | 0-25 | 0-3,092 |
| Redis | managed small instance | 10-30 | 1,237-3,710 |
| MongoDB | Atlas M10/M20 equivalent | 60-300 | 7,421-37,103 |
| Object storage | usage-based, see media table | variable | variable |
| Monitoring/logs | Sentry/Better Stack/Grafana starter | 0-150 | 0-18,552 |
| Total excluding evidence media | | 95-605 | 11,754-74,825 |

### Kubernetes Production Model

The repo already contains Kubernetes manifests:

- Backend replicas: 3.
- Backend request: 500m CPU and 512 MiB each.
- Backend limits: 1 CPU and 1 GiB each.
- Backend HPA: min 3, max 10.
- Dashboard replicas: 2.
- Dashboard requests: 250m CPU and 256 MiB each.
- Dashboard limits: 500m CPU and 512 MiB each.

Minimum requested compute from manifests:

```text
Backend requests: 3 * 0.5 vCPU = 1.5 vCPU, 1.5 GiB RAM
Dashboard requests: 2 * 0.25 vCPU = 0.5 vCPU, 0.5 GiB RAM
Total requested baseline: 2 vCPU, 2 GiB RAM
Practical node pool minimum: 3 nodes for availability
```

Approximate managed Kubernetes node costs before DB/storage:

| Provider class | Practical launch cluster | USD/mo | BDT/mo |
|---|---:|---:|---:|
| Hetzner/DigitalOcean/Vultr small 3-node cluster | 3 x 2 vCPU / 4 GiB nodes | 36-90 | 4,452-11,131 |
| AWS/GCP/Azure managed cluster | 3 small nodes plus control-plane/LB/NAT overhead | 150-600+ | 18,552-74,207+ |

Recommendation: use a managed PaaS or small Kubernetes cluster for pilots. Move to Kubernetes when concurrent exam load, Socket.IO routing, and media upload concurrency are measured.

## 4. Database Cost

CheatLock uses MongoDB/Mongoose. Models include users, tenants, exams, sessions, submissions, proctoring events, integrity reviews, teacher classes, notifications, and audit logs.

Database growth comes from:

- Proctoring event metadata.
- Submission data.
- Session state.
- Audit logs.
- Evidence replay metadata.

Large binary frames should not be stored in MongoDB. The current backend is already designed to move large evidence payloads to S3-compatible object storage.

Recommended options:

| Tier | Provider | Suitable for | USD/mo | BDT/mo |
|---|---|---|---:|---:|
| Dev/Pilot | MongoDB Atlas free/flex/small dedicated | pilots and QA | 0-60 | 0-7,421 |
| Launch | MongoDB Atlas M10/M20 or DigitalOcean Managed MongoDB | early paid schools | 60-300 | 7,421-37,103 |
| Growth | Atlas M30+ multi-region backups | 5k-50k users | 300-2,500+ | 37,103-309,194+ |
| Enterprise | Atlas dedicated with backups, private networking, multi-region | 50k-100k+ users | 2,500-15,000+ | 309,194-1,855,166+ |

Do not select the final cluster from this report alone. Required before purchase:

- Expected concurrent active exams.
- Average exam duration.
- Retention period for routine and suspicious evidence metadata.
- Query volume from teacher dashboards and replay.
- Whether MongoDB change streams, analytics, or BI export are required.

## 5. Object Storage Cost

Object storage is the dominant cost category.

Official/public pricing basis used:

- AWS S3 Standard: around $0.023/GB-month for first 50 TB, with request and egress charges.
- Cloudflare R2: around $0.015/GB-month, Class A operation charges, and no provider egress fee for typical internet egress.
- Backblaze B2: around $6/TB-month storage, with provider-specific transaction and download terms.
- DigitalOcean Spaces: base bundle around $5/month including storage/transfer, then usage-based overages.

Implementation-derived media upper bound:

```text
capture interval = 2 seconds
frames/hour/stream = 1,800
max frame size = 500 KiB
streams = 1 or 2 depending camera/screen evidence
1 stream upper bound = about 0.92 GB/student-hour
2 streams upper bound = about 1.84 GB/student-hour
```

### Evidence Media Upper-Bound Scenarios

Assumption for this table: 2 evidence streams, 60-minute exams, 500 KiB/frame cap, no duplicate-frame suppression, no compression improvement below cap, no deletion before month end. This is a worst-case configured upper bound, not a measured average.

| Monthly active students | 1 exam/student/mo storage | 4 exams/student/mo storage |
|---:|---:|---:|
| 100 | 184 GB | 737 GB |
| 500 | 922 GB | 3.7 TB |
| 1,000 | 1.8 TB | 7.4 TB |
| 5,000 | 9.2 TB | 36.9 TB |
| 10,000 | 18.4 TB | 73.7 TB |
| 50,000 | 92.2 TB | 368.6 TB |
| 100,000 | 184.3 TB | 737.3 TB |

Approximate storage/request cost using Cloudflare R2-style pricing at the configured upper bound:

| Students | 1 exam/mo USD | 1 exam/mo BDT | 4 exams/mo USD | 4 exams/mo BDT |
|---:|---:|---:|---:|---:|
| 100 | 4 | 542 | 18 | 2,169 |
| 500 | 22 | 2,712 | 88 | 10,846 |
| 1,000 | 44 | 5,423 | 175 | 21,692 |
| 5,000 | 219 | 27,115 | 877 | 108,460 |
| 10,000 | 438 | 54,230 | 1,754 | 216,921 |
| 50,000 | 2,192 | 271,151 | 8,770 | 1,084,604 |
| 100,000 | 4,385 | 542,302 | 17,539 | 2,169,208 |

AWS S3 Standard storage-only at the same upper bound is similar for storage, but replay egress can become expensive. If teachers replay 10% of a 184 TB/month corpus from AWS to the public internet, first-order egress can be roughly:

```text
18.4 TB replayed * 1,024 GB/TB * $0.09/GB = about $1,696
```

That is why R2/B2-style egress economics matter for this product.

## 6. Hosting Cost

Recommended hosting path:

1. Pilot: Render/Railway/Fly plus Atlas plus R2/B2-compatible storage.
2. Early production: managed Kubernetes or container platform with Redis and MongoDB managed separately.
3. Large production: Kubernetes with private networking, CDN/object-store origin, multi-region backup, formal observability.

Hosting cannot be priced only by registered users. It must be priced by:

- Concurrent exams.
- Concurrent Socket.IO sessions.
- Evidence uploads per second.
- Replay traffic.
- Teacher dashboard fanout.
- Object-storage request volume.

Rule of thumb from current capture policy:

```text
100 active students * 2 streams * one frame per 2s = 100 uploads/second
1,000 active students = 1,000 uploads/second
10,000 active students = 10,000 uploads/second
```

At high concurrency, direct-to-object-storage uploads using signed URLs should be preferred over base64 media through Socket.IO/backend.

## 7. Security Cost

Minimum commercial security stack:

| Area | Tooling | USD/mo | BDT/mo |
|---|---|---:|---:|
| Secret scanning | GitHub secret scanning/gitleaks in CI | 0-50 | 0-6,184 |
| SAST/dependency scanning | GitHub, npm audit, OSV/Snyk optional | 0-300 | 0-37,103 |
| WAF/CDN/DDoS | Cloudflare Pro/Business or cloud WAF | 20-250+ | 2,474-30,919+ |
| Error tracking | Sentry team/growth | 0-200+ | 0-24,736+ |
| Log monitoring | Better Stack/Datadog/New Relic/Grafana | 30-1,000+ | 3,710-123,678+ |
| Annual penetration test | third-party | 5,000-25,000/year | 618,389-3,091,943/year |

For a proctoring product, budget for privacy/security review is not optional. The system handles student identity, camera/screen evidence, exam behavior, and potentially minors.

## 8. DevOps Cost

Current repo has CI but no complete production deployment automation.

Required commercial DevOps work:

- Container registry.
- Production secret manager.
- Environment promotion: dev/staging/prod.
- Automated database migration and index rollout checks.
- Backup and restore drills.
- Object-storage lifecycle policies.
- Monitoring and alerts.
- Incident runbooks.
- Release signing for Android and desktop.

Cost:

| Stage | DevOps spend |
|---|---:|
| Pilot | $100-$500/mo tooling plus part-time engineer |
| Early production | $500-$2,500/mo tooling plus 0.5-1 DevOps/SRE |
| Enterprise | $2,500-$15,000+/mo tooling plus dedicated SRE/security |

## 9. AI Cost

Current core implementation uses on-device/local components:

- Android ML Kit and TensorFlow Lite.
- Desktop local/browser/Rust-side proctoring services.

Therefore, core AI inference cloud cost is currently near zero, excluding model development, QA, and device CPU/battery impact.

Potential future AI costs:

- Cloud vision models for evidence review.
- LLM-generated incident summaries.
- Teacher-facing review assistant.
- Fraud-risk analytics.

Do not enable cloud AI review by default without consent and cost controls. At 2-second evidence cadence, sending every frame to a paid vision model would be financially unsafe.

## 10. App Store Cost

Required public developer account costs:

| Item | USD | BDT |
|---|---:|---:|
| Google Play Console registration | 25 one-time | 3,092 |
| Apple Developer Program | 99/year if iOS/macOS App Store distribution is needed | 12,244/year |
| Code signing certificates | varies by platform/distribution | varies |

The repo currently contains Android and Tauri desktop. It does not contain an iOS app.

## 11. Domain, Email, and Transactional Messaging

Required:

- Domain: usually $10-$20/year for a `.com`, provider dependent.
- DNS/CDN: Cloudflare free to Business tier depending WAF/SLA needs.
- Business email: Google Workspace or Microsoft 365 roughly $6-$12/user/month entry tiers.
- Transactional email: SendGrid/Mailgun/Postmark/AWS SES depending volume.
- SMS/WhatsApp, if used for OTP: not currently required by inspected core code, but should be budgeted if added.

## 12. Legal and Compliance Cost

Required before commercial launch:

- Privacy policy.
- Terms of service.
- Data-processing agreement.
- Student data retention policy.
- School/tenant admin agreement.
- Consent language for webcam/screen capture.
- Incident response policy.
- Data deletion/export policy.
- Child/minor student handling if applicable.

Likely budget:

| Stage | Legal/compliance estimate |
|---|---:|
| Local pilot | $1,000-$3,000 |
| Paid launch | $3,000-$10,000 |
| Enterprise/school procurement | $10,000-$50,000+ |

## 13. Marketing and Sales Cost

CheatLock is B2B/B2B2C education software. Sales cycles can be slow.

Launch budget options:

| Stage | Cost |
|---|---:|
| Founder-led pilot outreach | $0-$500/mo |
| Small paid launch | $500-$3,000/mo |
| Institutional sales | $3,000-$20,000+/mo plus sales staff |

Higher-cost but useful channels:

- School/university pilot programs.
- Exam center partnerships.
- LMS integration content.
- Education conferences.
- Case studies and security/privacy documentation.

## 14. Team Cost

Minimum credible commercial team:

| Role | Needed for launch? | Monthly market cost range |
|---|---|---:|
| Full-stack/backend engineer | yes | $2,000-$12,000 |
| Android engineer | yes | $2,000-$10,000 |
| Desktop/Tauri engineer | yes | $2,000-$10,000 |
| QA/test engineer | yes | $1,000-$6,000 |
| DevOps/SRE | part-time early, full-time later | $2,000-$12,000 |
| Security/privacy advisor | part-time or contract | $1,000-$10,000 |
| Product/support | yes for schools | $1,000-$8,000 |

Lean launch with founder engineering can reduce cash spend, but not actual workload.

## 15. Funding Requirement

Minimum cash runway estimates:

| Stage | Duration | Estimated cash need |
|---|---:|---:|
| Technical pilot | 3 months | $5,000-$25,000 |
| Paid launch | 6 months | $30,000-$150,000 |
| Enterprise-ready launch | 12 months | $250,000-$1,000,000+ |

Reason: proctoring requires high trust, privacy/security posture, device compatibility, evidence retention, and support. It is not enough to host the app.

## 16. Competitor Cost and Positioning

Public competitor pricing is often not transparent:

- Honorlock, Proctorio, Examity/Meazure, Respondus, ProctorU often require sales contact or institution contracts.
- Safe Exam Browser is open source/free but is not equivalent to live evidence capture and teacher replay.

CheatLock's possible positioning:

- Lower-cost, self-hostable or regional-market proctoring.
- On-device detection to reduce cloud AI cost.
- Continuous 2-second evidence timeline for teacher review.
- Tenant-based school management.

Commercial risk:

- Competitors sell trust, support, procurement readiness, legal posture, and integrations, not just capture technology.
- CheatLock needs LMS integration and compliance proof to compete in larger schools.

## 17. Final Financial Report

### Scenario A: 100 Active Students

Assumption: 1 hour/student/month, 2 evidence streams, configured upper-bound 500 KiB/frame.

| Category | USD/mo | BDT/mo |
|---|---:|---:|
| Hosting/API/dashboard | 95-300 | 11,754-37,103 |
| MongoDB/Redis | included above to 300 | included |
| Evidence storage/R2-like | about 4 | about 542 |
| Monitoring/security basics | 20-150 | 2,474-18,552 |
| Total infra/tooling | 119-454 | 14,770-56,157 |

### Scenario B: 1,000 Active Students

| Category | USD/mo | BDT/mo |
|---|---:|---:|
| Hosting/API/dashboard | 300-1,500 | 37,103-185,517 |
| MongoDB/Redis | 100-600 | 12,368-74,207 |
| Evidence storage/R2-like | about 44 | about 5,423 |
| Monitoring/logs | 100-750 | 12,368-92,758 |
| Total infra/tooling | 544-2,894 | 67,262-357,905 |

### Scenario C: 10,000 Active Students

| Category | USD/mo | BDT/mo |
|---|---:|---:|
| Compute/API/socket platform | 1,500-8,000 | 185,517-989,422 |
| MongoDB/Redis | 500-3,000 | 61,839-371,033 |
| Evidence storage/R2-like | about 438 | about 54,230 |
| Monitoring/logs/security | 500-5,000 | 61,839-618,389 |
| Total infra/tooling | 2,938-16,438 | 363,425-2,033,074 |

### Scenario D: 100,000 Active Students

| Category | USD/mo | BDT/mo |
|---|---:|---:|
| Compute/API/socket platform | 10,000-75,000+ | 1,236,777-9,275,828+ |
| MongoDB/Redis | 3,000-25,000+ | 371,033-3,091,943+ |
| Evidence storage/R2-like, 1 exam/mo | about 4,385 | about 542,302 |
| Evidence storage/R2-like, 4 exams/mo | about 17,539 | about 2,169,208 |
| Monitoring/security/logs | 5,000-50,000+ | 618,389-6,183,885+ |
| Total infra/tooling | 22,385-167,539+ | 2,768,501-20,720,864+ |

## 18. Recommended Market-Ready Plan

Safest launch plan:

1. Run a 50-100 student real-device pilot.
2. Measure actual average frame size by device, browser, OS, lighting, and screen resolution.
3. Enforce lifecycle rules: routine evidence short retention, suspicious evidence longer retention.
4. Use Cloudflare R2 or Backblaze B2 economics for media-heavy evidence storage.
5. Keep MongoDB for metadata only.
6. Use signed direct uploads for high-scale evidence to avoid backend media bottlenecks.
7. Add observability for upload queue length, dropped routine frames, suspicious frame preservation, replay egress, and storage growth.
8. Finalize legal consent and school data-processing documents before paid production.

## Required Unknowns Before Final Vendor Purchase

The repo cannot determine:

- Average exams per student per month.
- Average exam duration in production.
- Whether both camera and screen evidence are always enabled.
- Actual compressed frame size distribution on target devices.
- Replay frequency per teacher.
- Required retention periods by market/school contract.
- Whether data must stay inside Bangladesh or a specific jurisdiction.
- Support SLA.
- Required LMS integrations.
- Payment processing model.

These are product/business inputs. They must be measured or decided before final production budget approval.

## Pricing Sources

Primary public sources used or referenced:

- AWS S3 pricing: https://aws.amazon.com/s3/pricing/
- AWS data transfer pricing: https://aws.amazon.com/ec2/pricing/on-demand/ and https://aws.amazon.com/ec2/pricing/on-demand/#Data_Transfer
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Backblaze B2 pricing: https://www.backblaze.com/cloud-storage/pricing
- DigitalOcean pricing: https://www.digitalocean.com/pricing
- DigitalOcean Spaces pricing: https://www.digitalocean.com/products/spaces
- MongoDB Atlas pricing: https://www.mongodb.com/pricing
- Render pricing: https://render.com/pricing
- Railway pricing: https://railway.com/pricing
- Fly.io pricing: https://fly.io/pricing/
- Hetzner Cloud pricing: https://www.hetzner.com/cloud/
- Vultr pricing: https://www.vultr.com/pricing/
- GitHub Actions billing: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
- Sentry pricing: https://sentry.io/pricing/
- Better Stack pricing: https://betterstack.com/pricing
- Grafana Cloud pricing: https://grafana.com/pricing/
- Datadog pricing: https://www.datadoghq.com/pricing/
- New Relic pricing: https://newrelic.com/pricing
- OpenAI pricing: https://openai.com/api/pricing/
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google Play Console registration fee: https://support.google.com/googleplay/android-developer/answer/6112435
- Apple Developer Program enrollment: https://developer.apple.com/programs/
- Google Workspace pricing: https://workspace.google.com/pricing.html
- Bangladesh Bank exchange rates: https://www.bb.org.bd/en/index.php/econdata/exchangerate
