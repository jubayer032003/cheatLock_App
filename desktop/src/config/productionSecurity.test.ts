import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRODUCTION_BACKEND_ORIGIN } from "./backend";
import {
  buildCsp,
  validateProductionSecurityConfig,
  websocketOriginForApi,
} from "./productionSecurity";

describe("production security configuration", () => {
  it("accepts the allowed production origin", () => {
    const result = validateProductionSecurityConfig({
      PROD: true,
      VITE_CHEATLOCK_API_ORIGIN: "https://api.cheatlock.example",
      VITE_CHEATLOCK_WS_ORIGIN: "wss://api.cheatlock.example",
    });

    expect(result.apiOrigin).toBe("https://api.cheatlock.example");
    expect(result.websocketOrigin).toBe("wss://api.cheatlock.example");
    expect(result.csp).toContain("https://api.cheatlock.example");
    expect(result.csp).toContain("wss://api.cheatlock.example");
  });

  it("rejects wildcard origins", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_API_ORIGIN: "https://*.example.com",
        VITE_CHEATLOCK_WS_ORIGIN: "wss://api.cheatlock.example",
      })
    ).toThrow(/wildcard/i);
  });

  it("allows explicit development origins outside production", () => {
    const result = validateProductionSecurityConfig({
      DEV: true,
      VITE_CHEATLOCK_API_ORIGIN: "http://127.0.0.1:3000",
      VITE_CHEATLOCK_WS_ORIGIN: "ws://127.0.0.1:3000",
    });

    expect(result.apiOrigin).toBe("http://127.0.0.1:3000");
    expect(result.websocketOrigin).toBe("ws://127.0.0.1:3000");
  });

  it("rejects unsafe liveness bypass in production", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS: "true",
      })
    ).toThrow(/liveness bypass/i);
  });

  it("rejects monitoring simulation in production", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_ENABLE_MONITORING_SIMULATION: "true",
      })
    ).toThrow(/monitoring simulation/i);
  });

  it("rejects screen diagnostics in production", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS: "true",
      })
    ).toThrow(/screen diagnostics/i);
  });

  it("rejects a missing API origin when explicitly blank", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_API_ORIGIN: " ",
      })
    ).toThrow(/missing/i);
  });

  it("rejects insecure HTTP origin in production", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_API_ORIGIN: "http://api.cheatlock.example",
        VITE_CHEATLOCK_WS_ORIGIN: "ws://api.cheatlock.example",
      })
    ).toThrow(/https/i);
  });

  it("rejects WebSocket origin mismatch in production", () => {
    expect(() =>
      validateProductionSecurityConfig({
        PROD: true,
        VITE_CHEATLOCK_API_ORIGIN: "https://api.cheatlock.example",
        VITE_CHEATLOCK_WS_ORIGIN: "wss://other.cheatlock.example",
      })
    ).toThrow(/must match/i);
  });

  it("builds CSP without network wildcards or unsafe inline scripts", () => {
    const csp = buildCsp({
      apiOrigin: "https://api.cheatlock.example",
      websocketOrigin: websocketOriginForApi("https://api.cheatlock.example"),
    });

    expect(csp).not.toContain("http://*");
    expect(csp).not.toContain("https://*");
    expect(csp).not.toContain("ws://*");
    expect(csp).not.toContain("wss://*");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("keeps the Tauri production CSP aligned with the validated production config", () => {
    const tauriConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
    );
    const expected = buildCsp({
      apiOrigin: PRODUCTION_BACKEND_ORIGIN,
      websocketOrigin: websocketOriginForApi(PRODUCTION_BACKEND_ORIGIN),
    });

    expect(tauriConfig.app.security.csp).toBe(expected);
  });
});
