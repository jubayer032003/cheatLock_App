# CheatLock Production CSP Origins

The production Tauri CSP intentionally avoids wildcard network access.

Allowed production origins:

- `'self'`: loads the packaged CheatLock desktop application assets.
- `asset:` and `https://asset.localhost`: required by Tauri asset handling for local packaged resources.
- `data:` and `blob:` for `img-src` and `media-src`: required for short-lived local previews and media streams produced inside an active exam session.
- `https://cheatlock-backend.onrender.com`: the configured CheatLock API origin.
- `wss://cheatlock-backend.onrender.com`: the WebSocket origin derived from the configured CheatLock API host.
- `ipc:` and `http://ipc.localhost`: required Tauri IPC transport origins.

Development origins such as `http://127.0.0.1:3000`, `http://localhost:5173`, and local WebSocket origins are allowed only by development runtime configuration and must not be added to the production CSP.
