# CheatLock Desktop Roadmap

## Phase 2 - Native Windows Screen Capture

Status legend:

- [ ] not started
- [-] partial
- [x] complete

### Native Proctoring Roadmap

- [x] Native display enumeration
- [x] Multiple-display preflight enforcement
- [x] Development-only in-app native screen capture diagnostic flow
- [-] Native Windows screen capture
- [ ] Native camera capture pipeline
- [ ] Native microphone monitoring pipeline
- [ ] Local face detection inference
- [ ] Local identity verification inference
- [ ] Local object detection inference
- [ ] Centralized native proctoring event pipeline
- [ ] Native shortcut/security enforcement lifecycle

### Current Native Screen Capture Notes

Native Windows screen capture now uses Rust and the Windows GDI API to acquire display pixels into a bounded latest-frame buffer on a background worker. Frame sizing, stride validation, PNG sample compression, stale-frame health, worker cleanup, duplicate-start prevention, and Tauri bridge serialization are covered by tests. A development-only in-app diagnostic route is available at `/dev/screen-capture-diagnostics` when `VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS=true` in a non-production Tauri run.

It remains partial because the explicit live native smoke test reached the real GDI `BitBlt` call but failed in this execution environment. Development diagnostics verified `GetDC(NULL)`, `GetWindowDC(GetDesktopWindow())`, and `CreateDC(display)` all acquire non-null source DCs with `RC_BITBLT`, create a memory DC, create/select the DIB section, then fail at `BitBlt` (`CAPTUREBLT` returns Win32 error 5; plain `SRCCOPY` returns Win32 error 6). The new in-app diagnostic flow must still be exercised from an interactive Tauri window before deciding whether GDI is viable on the user's real desktop session. The release app binary builds successfully, but MSI bundling fails because Tauri cannot download WiX under the current socket/network restrictions.

### Updated Completion Scores

- Screen monitoring: 75%
- Windows security: 50%
- Tests: 87%
- Production readiness: 55%
