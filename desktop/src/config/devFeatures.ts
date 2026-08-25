export interface DevBypassEnv {
  DEV?: boolean;
  PROD?: boolean;
  VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS?: string;
  VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS?: string;
}

export function evaluateLivenessBypassConfig(env: DevBypassEnv) {
  const requested = env.VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS === "true";
  if (env.PROD && requested) {
    throw new Error("Unsafe CheatLock configuration: liveness bypass cannot be enabled in production.");
  }
  return Boolean(env.DEV && requested);
}

export function evaluateScreenDiagnosticsConfig(env: DevBypassEnv) {
  const requested = env.VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS === "true";
  if (env.PROD && requested) {
    throw new Error("Unsafe CheatLock configuration: screen diagnostics cannot be enabled in production.");
  }
  return Boolean(env.DEV && requested);
}

export const ENABLE_DEV_LIVENESS_BYPASS = evaluateLivenessBypassConfig(import.meta.env);
export const ENABLE_DEV_SCREEN_DIAGNOSTICS = evaluateScreenDiagnosticsConfig(import.meta.env);
