# CheatLock Native Monitoring Audit

This document records the current native monitoring capability status.

## Screen Capture

Status: unsupported in Rust, partially implemented in the frontend.

The Rust `ScreenManager` does not own a native screen-capture resource or frame pipeline. It now returns `not_implemented` instead of reporting active. The active implementation is the frontend `ScreenCaptureManager`, which uses browser/Tauri WebView media capture and can confirm capture only when the browser pipeline reports frames.

Remaining native work:
- Implement platform screen capture APIs.
- Store only short-lived frame buffers.
- Expose start, stop, status, and health from the native capture handle.
- Detect revoked permission or stopped capture.

## Microphone / Audio Capture

Status: unsupported in Rust, partially implemented in the frontend.

The Rust `AudioManager` does not own a native microphone stream. It now returns `not_implemented`. The frontend audio path uses `MediaStream`, `AudioManager`, VAD, and health state.

Remaining native work:
- Implement native microphone capture per supported platform.
- Confirm capture from an opened stream, not a boolean.
- Detect disconnected, muted, or stalled streams.
- Release devices on stop.

## Camera Integration

Status: unsupported in Rust, partially implemented in the frontend.

The Rust `CameraManager` only stores a selected device lock and does not open a native camera resource. It now returns `not_implemented` for preview start. The frontend camera pipeline owns the actual `MediaStream`.

Remaining native work:
- Implement native camera discovery and capture handle ownership.
- Bind camera lock to the actual opened device.
- Expose frame/health status from the native pipeline.
- Detect unplugged or stalled camera.

## AI Model Loading

Status: unsupported in Rust, partially implemented in frontend readiness.

The Rust `AiPipeline` has no model asset, checksum validation, inference runtime, shape validation, or test inference. It now returns `not_implemented`. The frontend `ModelLoader` no longer simulates loading; it requires an explicit manifest and reports ready only after version, checksum, runtime metadata, input/output shapes, and test inference metadata validate.

Remaining native work:
- Bundle or download verified model assets.
- Validate expected version and checksum.
- Initialize ONNX or another approved runtime.
- Validate input and output shapes.
- Run a deterministic smoke inference before reporting ready.

## Application-Security Monitoring

Status: partially implemented.

`SecurityManager` provides transparent exam-client controls such as kiosk state, fullscreen/window behavior, display count, window capture affinity where supported, VM heuristics, debugger checks, and blacklisted-process checks. These controls are limited to authorized exam-client behavior and should not be expanded into invasive OS bypasses.

Remaining native work:
- Convert security checks to structured status/health results.
- Avoid process-name-only conclusions where stronger platform APIs are available.
- Keep capture-affinity and kiosk controls scoped to active exam sessions.
