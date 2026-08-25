import {
  DEVELOPMENT_BACKEND_ORIGIN,
  PRODUCTION_BACKEND_ORIGIN,
  normalizeBackendOrigin,
} from "./backend";

export interface RuntimeSecurityEnv {
  DEV?: boolean;
  PROD?: boolean;
  VITE_CHEATLOCK_API_ORIGIN?: string;
  VITE_CHEATLOCK_WS_ORIGIN?: string;
  VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS?: string;
  VITE_CHEATLOCK_ENABLE_MONITORING_SIMULATION?: string;
  VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS?: string;
}

export interface ProductionSecurityValidation {
  apiOrigin: string;
  websocketOrigin: string;
  csp: string;
  allowedConnectOrigins: string[];
}

const REQUIRED_ASSET_ORIGINS = ["asset:", "https://asset.localhost", "data:", "blob:"];
const TAURI_PROTOCOL_ORIGINS = ["ipc:", "http://ipc.localhost"];

export function validateProductionSecurityConfig(env: RuntimeSecurityEnv): ProductionSecurityValidation {
  const apiOrigin =
    env.VITE_CHEATLOCK_API_ORIGIN === undefined
      ? PRODUCTION_BACKEND_ORIGIN
      : normalizeBackendOrigin(env.VITE_CHEATLOCK_API_ORIGIN);
  const websocketOrigin =
    env.VITE_CHEATLOCK_WS_ORIGIN === undefined
      ? apiOrigin
        ? websocketOriginForApi(apiOrigin)
        : ""
      : normalizeBackendOrigin(env.VITE_CHEATLOCK_WS_ORIGIN);

  if (env.PROD) {
    rejectUnsafeFlag(env.VITE_CHEATLOCK_ENABLE_LIVENESS_BYPASS, "liveness bypass");
    rejectUnsafeFlag(env.VITE_CHEATLOCK_ENABLE_MONITORING_SIMULATION, "monitoring simulation");
    rejectUnsafeFlag(env.VITE_CHEATLOCK_ENABLE_SCREEN_DIAGNOSTICS, "screen diagnostics");
    validateProductionOrigin(apiOrigin, "CheatLock API origin");
    validateProductionOrigin(websocketOrigin, "CheatLock WebSocket origin", ["wss:"]);
    if (websocketOriginForApi(apiOrigin) !== websocketOrigin) {
      throw new Error("Unsafe CheatLock configuration: WebSocket origin must match the configured API host in production.");
    }
  } else {
    validateDevelopmentOrigin(apiOrigin, "CheatLock API origin");
    validateDevelopmentOrigin(websocketOrigin, "CheatLock WebSocket origin");
  }

  const allowedConnectOrigins = ["'self'", apiOrigin, websocketOrigin, ...TAURI_PROTOCOL_ORIGINS];
  return {
    apiOrigin,
    websocketOrigin,
    allowedConnectOrigins,
    csp: buildCsp({ apiOrigin, websocketOrigin }),
  };
}

export function buildCsp({ apiOrigin, websocketOrigin }: { apiOrigin: string; websocketOrigin: string }) {
  const directives = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${REQUIRED_ASSET_ORIGINS.join(" ")}`,
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    `connect-src 'self' ${apiOrigin} ${websocketOrigin} ${TAURI_PROTOCOL_ORIGINS.join(" ")}`,
  ];
  return directives.join("; ") + ";";
}

export function websocketOriginForApi(apiOrigin: string) {
  const parsed = new URL(apiOrigin);
  if (parsed.protocol === "https:") return `wss://${parsed.host}`;
  if (parsed.protocol === "http:") return `ws://${parsed.host}`;
  throw new Error("Unsafe CheatLock configuration: API origin must be HTTP or HTTPS.");
}

function validateProductionOrigin(origin: string, label: string, allowedProtocols = ["https:"]) {
  if (!origin) throw new Error(`Unsafe CheatLock configuration: missing ${label}.`);
  if (hasWildcard(origin)) throw new Error(`Unsafe CheatLock configuration: wildcard ${label} is not allowed.`);
  const parsed = new URL(origin);
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Unsafe CheatLock configuration: ${label} must use ${allowedProtocols.join(" or ")} in production.`);
  }
  if (isDevelopmentHost(parsed.hostname)) {
    throw new Error(`Unsafe CheatLock configuration: development ${label} is not allowed in production.`);
  }
}

function validateDevelopmentOrigin(origin: string, label: string) {
  if (!origin) throw new Error(`Missing ${label}.`);
  if (hasWildcard(origin)) throw new Error(`Wildcard ${label} is not allowed.`);
  const parsed = new URL(origin);
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
    throw new Error(`${label} must be an HTTP(S) or WS(S) origin.`);
  }
}

function rejectUnsafeFlag(value: string | undefined, label: string) {
  if (value === "true") {
    throw new Error(`Unsafe CheatLock configuration: ${label} cannot be enabled in production.`);
  }
}

function hasWildcard(origin: string) {
  return origin.includes("*");
}

function isDevelopmentHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

export const EFFECTIVE_SECURITY_CONFIG = validateProductionSecurityConfig(import.meta.env);
export const EFFECTIVE_CSP = EFFECTIVE_SECURITY_CONFIG.csp;
export const DEVELOPMENT_SECURITY_CONFIG = validateProductionSecurityConfig({
  DEV: true,
  VITE_CHEATLOCK_API_ORIGIN: DEVELOPMENT_BACKEND_ORIGIN,
  VITE_CHEATLOCK_WS_ORIGIN: websocketOriginForApi(DEVELOPMENT_BACKEND_ORIGIN),
});
