import { describe, expect, it } from "vitest";
import { evaluateLivenessBypassConfig, evaluateScreenDiagnosticsConfig } from "./devFeatures";

describe("evaluateLivenessBypassConfig", () => {
  it("enables development bypass only with an explicit local flag", () => {
    expect(evaluateLivenessBypassConfig({ DEV: true, VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS: "true" })).toBe(true);
    expect(evaluateLivenessBypassConfig({ DEV: true })).toBe(false);
  });

  it("rejects bypass configuration in production", () => {
    expect(() =>
      evaluateLivenessBypassConfig({ PROD: true, VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS: "true" })
    ).toThrow(/cannot be enabled in production/i);
  });
});

describe("evaluateScreenDiagnosticsConfig", () => {
  it("enables screen diagnostics only with an explicit local flag", () => {
    expect(evaluateScreenDiagnosticsConfig({ DEV: true, VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS: "true" })).toBe(true);
    expect(evaluateScreenDiagnosticsConfig({ DEV: true })).toBe(false);
  });

  it("rejects screen diagnostics in production", () => {
    expect(() =>
      evaluateScreenDiagnosticsConfig({ PROD: true, VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS: "true" })
    ).toThrow(/cannot be enabled in production/i);
  });
});
