import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("dashboard routes lazy-load heavy pages behind an accessible fallback", () => {
  const app = read("web-dashboard/src/App.tsx");
  assert.match(app, /const LiveProctoringPage = lazy/);
  assert.match(app, /const ReportsPage = lazy/);
  assert.match(app, /const ReplayTimelinePage = lazy/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.doesNotMatch(app, /import \{ LiveProctoringPage \}/);
});

test("production proctoring simulator remains disabled unless explicit flag is enabled", () => {
  const live = read("web-dashboard/src/pages/LiveProctoringPage.tsx");
  assert.match(live, /VITE_ENABLE_PROCTORING_TEST_TOOLS === "true"/);
  assert.match(live, /ENABLE_PROCTORING_TEST_TOOLS &&/);
});

test("dashboard critical controls expose accessible names and labels", () => {
  const shell = read("web-dashboard/src/components/AppShell.tsx");
  const tile = read("web-dashboard/src/components/StudentTile.tsx");
  const detail = read("web-dashboard/src/components/StudentDetail.tsx");
  const live = read("web-dashboard/src/pages/LiveProctoringPage.tsx");

  assert.match(shell, /aria-label="Log out"/);
  assert.match(shell, /aria-label="Primary dashboard navigation"/);
  assert.match(tile, /aria-label=\{`Open fullscreen monitor/);
  assert.match(detail, /htmlFor="proctor-warning-message"/);
  assert.match(detail, /role="alertdialog"/);
  assert.match(live, /htmlFor="student-search"/);
  assert.match(live, /aria-pressed=\{filter === item\}/);
});

test("motion-sensitive users are protected from major decorative animation", () => {
  const webStyles = read("web-dashboard/src/styles.css");
  const login = read("web-dashboard/src/pages/LoginPage.tsx");
  const desktopStyles = read("desktop/src/styles.css");
  const button = read("desktop/src/components/Button.tsx");

  assert.match(webStyles, /prefers-reduced-motion: reduce/);
  assert.match(login, /prefers-reduced-motion: reduce/);
  assert.match(desktopStyles, /prefers-reduced-motion: reduce/);
  assert.match(button, /useReducedMotion/);
});

test("desktop save and submission states expose truthful accessible text", () => {
  const exam = read("desktop/src/pages/ExamSessionPage.tsx");
  assert.match(exam, /Answers are saved locally and synchronized to the server/);
  assert.match(exam, /Offline\. Answers are saved locally only/);
  assert.match(exam, /Sync needs attention\. Your local answers were not discarded/);
  assert.match(exam, /role="status" aria-live="polite"/);
  assert.match(exam, /if \(!activeExam \|\| !user \|\| !activeSession \|\| submitting\) return/);
});

test("unsupported security and monitoring claims are removed from reviewed user-facing files", () => {
  const login = read("web-dashboard/src/pages/LoginPage.tsx");
  const readme = read("README.md");

  assert.doesNotMatch(login, /bank-grade end-to-end encryption/i);
  assert.doesNotMatch(login, /100% secure/i);
  assert.doesNotMatch(readme, /cryptographically linked/i);
});
