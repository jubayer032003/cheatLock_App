import { describe, expect, it, vi } from "vitest";
import {
  DEVELOPMENT_WEB_DASHBOARD_ORIGIN,
  normalizeWebDashboardOrigin,
  redirectToTeacherWebDashboard,
  resolveTeacherWebDashboardOrigin,
  teacherWebDashboardUrl,
} from "./webDashboard";

describe("teacher web dashboard configuration", () => {
  it("uses the explicit CheatLock dashboard origin when configured", () => {
    expect(
      resolveTeacherWebDashboardOrigin({
        VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN: "https://dashboard.cheatlock.example/",
      })
    ).toBe("https://dashboard.cheatlock.example");
  });

  it("supports the legacy web dashboard env name", () => {
    expect(
      resolveTeacherWebDashboardOrigin({
        VITE_WEB_DASHBOARD_URL: "https://teacher.cheatlock.example/app/",
      })
    ).toBe("https://teacher.cheatlock.example/app");
  });

  it("falls back to the local web dashboard during development", () => {
    expect(resolveTeacherWebDashboardOrigin({ DEV: true })).toBe(DEVELOPMENT_WEB_DASHBOARD_ORIGIN);
  });

  it("fails closed in production when the dashboard URL is missing", () => {
    expect(() => resolveTeacherWebDashboardOrigin({ DEV: false })).toThrow(
      "Teacher web dashboard URL is not configured"
    );
  });

  it("rejects unsupported URL schemes", () => {
    expect(() => normalizeWebDashboardOrigin("javascript:alert(1)")).toThrow("must use http or https");
  });

  it("builds a dashboard URL without leaking credentials", () => {
    expect(
      teacherWebDashboardUrl("/exams", {
        VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN: "https://dashboard.cheatlock.example/",
      })
    ).toBe("https://dashboard.cheatlock.example/exams");
  });

  it("redirects teacher roles to the resolved dashboard root", async () => {
    const target = { assign: vi.fn() };

    await redirectToTeacherWebDashboard(target, {
      VITE_CHEATLOCK_WEB_DASHBOARD_ORIGIN: "https://dashboard.cheatlock.example/",
    });

    expect(target.assign).toHaveBeenCalledWith("https://dashboard.cheatlock.example");
  });
});
