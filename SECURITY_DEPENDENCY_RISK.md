# CheatLock Dependency Risk Baseline

Milestone: 2 - CI, Validation, and Dependency Health
Date: 2026-08-03

## Audit Scope

Production-focused npm audits were run separately for:

- Root package
- `backend`
- `web-dashboard`
- `desktop`

The repository uses separate npm lockfiles for these scopes. The root package currently mirrors backend runtime dependencies and is still needed by the root-level Node test harness.

## Baseline Before Milestone 2 Updates

| Scope | Total | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: | ---: |
| Root | 9 | 0 | 7 | 1 | 1 |
| Backend | 9 | 0 | 7 | 1 | 1 |
| Web dashboard | 8 | 0 | 6 | 2 | 0 |
| Desktop | 2 | 0 | 0 | 2 | 0 |

## Updates Applied

| Scope | Package | Change | Reason |
| --- | --- | --- | --- |
| Root, backend | `express` | `^4.21.2` to `^4.22.2` | Stay on Express 4 while refreshing transitive parser dependencies. |
| Root, backend | `mongoose` | `^8.9.5` to `^8.24.1` | Fix direct Mongoose prototype-pollution advisory without taking Mongoose 9. |
| Root, backend | `socket.io` | `^4.8.1` to `^4.8.3` | Pull latest Socket.IO 4 patch line. |
| Root, backend | `body-parser` override | `1.20.6` | Resolve low-severity Express transitive advisory without Express 5 migration. |
| Root, backend, web dashboard | `ws` override | `8.21.1` | Resolve Socket.IO / Engine.IO `ws` denial-of-service advisories. |
| Web dashboard | `axios` | `^1.7.9` to `^1.19.0` | Resolve direct Axios and transitive `form-data` advisories on the 1.x line. |
| Web dashboard | `socket.io-client` | `^4.8.1` to `^4.8.3` | Pull latest Socket.IO client 4 patch line. |
| Web dashboard | `postcss` | `^8.4.49` to `^8.5.25` | Resolve PostCSS source-map path traversal advisory. |
| Web dashboard | `vite` | `^6.0.5` to `^6.4.3` | Resolve Vite 6.x advisories without taking Vite 8. |

## Post-Update Audit Status

| Scope | Total | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: | ---: |
| Root | 4 | 0 | 4 | 0 | 0 |
| Backend | 4 | 0 | 4 | 0 | 0 |
| Web dashboard | 2 | 0 | 0 | 2 | 0 |
| Desktop | 2 | 0 | 0 | 2 | 0 |

## Unresolved Advisories

### Puppeteer Cluster - Root and Backend

- Packages: `puppeteer`, `puppeteer-core`, `@puppeteer/browsers`, `tar-fs`
- Severity: high
- Direct or transitive: `puppeteer` is direct; the others are transitive.
- Dependency chain: `puppeteer -> puppeteer-core -> @puppeteer/browsers -> tar-fs`
- Runtime exposure: production-reachable if backend PDF generation is exposed, because `backend/src/services/pdfGenerator.js` launches Puppeteer.
- Available fix: `puppeteer@25.4.0`
- Breaking: yes, npm reports the fix as a SemVer-major upgrade from the current 21.x line.
- Why unresolved now: the major install path triggered Puppeteer's browser install process and locked `node_modules` locally; forcing the major upgrade in this milestone would risk CI install behavior and PDF runtime behavior without a focused PDF regression harness.
- Existing mitigation: the vulnerable extraction path is tied to Puppeteer browser package handling, not arbitrary user-uploaded tar extraction in CheatLock request handling.
- Recommended next action: create a focused follow-up to upgrade Puppeteer to 25.x, run PDF-generation smoke tests, and decide whether CI should use `PUPPETEER_SKIP_DOWNLOAD` plus a system browser or keep Puppeteer's managed browser download.

### React Router - Web Dashboard and Desktop

- Packages: `react-router-dom`, `react-router`
- Severity: moderate
- Direct or transitive: `react-router-dom` is direct; `react-router` is transitive.
- Dependency chain: `react-router-dom -> react-router`
- Runtime exposure: route navigation and links in dashboard and desktop shells.
- Available fix: React Router 7.18.x.
- Breaking: yes, this is a major upgrade from 6.x.
- Why unresolved now: the advisories are moderate, and a React Router 7 migration can affect route configuration, navigation behavior, and tests across both frontends.
- Existing mitigation: CheatLock uses mostly internal routes and authenticated app navigation; avoid passing untrusted external URLs to `Link` or `navigate`.
- Recommended next action: plan a focused frontend routing upgrade with route regression tests for login redirects, protected routes, student routes, and dashboard links.
