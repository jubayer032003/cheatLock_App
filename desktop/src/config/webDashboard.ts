import { invoke, isTauriAvailable } from "../utils/tauri";

export const DEVELOPMENT_WEB_DASHBOARD_ORIGIN = "http://127.0.0.1:5174";

export interface TeacherWebDashboardEnv {
  DEV?: boolean;
  VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN?: string;
  VITE_WEB_DASHBOARD_URL?: string;
}

export function normalizeWebDashboardOrigin(origin: string) {
  const trimmed = origin.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Teacher web dashboard URL must use http or https.");
  }

  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

export function resolveTeacherWebDashboardOrigin(env: TeacherWebDashboardEnv = import.meta.env) {
  const configured = env.VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN?.trim() || env.VITE_WEB_DASHBOARD_URL?.trim();
  if (configured) return normalizeWebDashboardOrigin(configured);
  if (env.DEV) return DEVELOPMENT_WEB_DASHBOARD_ORIGIN;

  throw new Error("Teacher web dashboard URL is not configured. Set VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN.");
}

export function teacherWebDashboardUrl(path = "", env?: TeacherWebDashboardEnv) {
  const base = resolveTeacherWebDashboardOrigin(env);
  const normalizedPath = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${base}${normalizedPath}`;
}

export async function redirectToTeacherWebDashboard(
  target: Pick<Location, "assign"> = window.location,
  env?: TeacherWebDashboardEnv
) {
  const url = teacherWebDashboardUrl("", env);

  if (isTauriAvailable()) {
    try {
      await invoke("open_teacher_web_dashboard", { url });
      return;
    } catch {
      target.assign(url);
      return;
    }
  }

  target.assign(url);
}
