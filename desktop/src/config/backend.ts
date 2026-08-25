export const PRODUCTION_BACKEND_ORIGIN = "https://cheatlock-backend.onrender.com";
export const DEVELOPMENT_BACKEND_ORIGIN = "http://127.0.0.1:3000";

export function defaultBackendOrigin() {
  return resolveBackendOrigin(import.meta.env.VITE_CHEATLOCK_API_ORIGIN);
}

export function resolveBackendOrigin(configured?: string) {
  if (configured?.trim()) return normalizeBackendOrigin(configured);
  return PRODUCTION_BACKEND_ORIGIN;
}

export function normalizeBackendOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

export function isLegacyDevelopmentOrigin(origin: string) {
  const normalized = normalizeBackendOrigin(origin);
  return normalized === DEVELOPMENT_BACKEND_ORIGIN || normalized === "http://localhost:3000";
}
