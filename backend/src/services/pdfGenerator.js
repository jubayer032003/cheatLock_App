import puppeteer from "puppeteer";
import { logger } from "./logger.js";

const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

/**
 * Generates an enterprise-grade PDF report of exam integrity statistics and student risk profiles.
 * 
 * @param {object} exam Exam details
 * @param {object} reportData Comprehensive integrity report payload
 * @returns {Promise<Buffer>} PDF binary buffer
 */
export async function generateExamReportPdf(exam, reportData) {
  let browser = null;
  try {
    logger.info(`Starting PDF generation for exam report: ${exam.title} (${exam._id})`);
    const totalStudents = reportData.summary.totalStudents || reportData.students.length;
    const safePercent = percentage(reportData.summary.safeStudents, totalStudents);
    const warningPercent = percentage(reportData.summary.warningStudents, totalStudents);
    const suspiciousPercent = percentage(reportData.summary.suspiciousStudents, totalStudents);
    const studentCards = reportData.students.map((student, index) => buildStudentAnalysisCard(student, index)).join("");
    const riskMoments = reportData.summary.highestRiskMoments?.length
      ? reportData.summary.highestRiskMoments.map((moment) => `
          <div class="moment-row">
            <div>
              <strong>${escapeHtml(moment.studentName || moment.studentId)}</strong>
              <p>${escapeHtml(moment.alert)}</p>
            </div>
            <span>${Number(moment.score || 0)}/100</span>
          </div>
        `).join("")
      : `<div class="empty-note">No suspicious moments recorded for this exam.</div>`;
    
    // Launch headless Chromium
    const executablePath = await resolveChromeExecutablePath();
    browser = await puppeteer.launch({
      headless: "new",
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15_000);
    page.setDefaultTimeout(15_000);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #0f172a; background: #f1f5f9; margin: 0; padding: 28px; }
          .page { background: #ffffff; padding: 34px; }
          .cover { border-radius: 16px; background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); color: white; padding: 28px; }
          .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
          .brand { font-size: 24px; font-weight: 900; color: #67e8f9; }
          .title { margin: 10px 0 0; font-size: 30px; line-height: 1.08; letter-spacing: 0; color: white; }
          .subtitle { margin: 10px 0 0; color: #cbd5e1; font-size: 12px; line-height: 1.5; max-width: 470px; }
          .signature-panel { min-width: 210px; border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 14px; background: rgba(15,23,42,.36); font-size: 11px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 24px; }
          .summary-card { border: 1px solid rgba(255,255,255,.16); border-radius: 12px; padding: 14px; background: rgba(255,255,255,.08); }
          .summary-card span, .metric span, .meta span, .narrative span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
          .cover .summary-card span { color: #bae6fd; }
          .summary-card strong { display: block; margin-top: 6px; color: white; font-size: 26px; line-height: 1; }
          h2 { margin: 28px 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #334155; }
          h3 { margin: 3px 0; font-size: 18px; line-height: 1.15; color: #0f172a; }
          .muted { color: #64748b; font-size: 12px; line-height: 1.5; }
          .risk-distribution { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
          .distribution-card { border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 14px; }
          .distribution-card span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
          .distribution-card strong { display: block; margin-top: 6px; color: #0f172a; font-size: 18px; }
          .bar { height: 8px; overflow: hidden; border-radius: 999px; background: #e2e8f0; margin-top: 10px; }
          .bar div { height: 100%; border-radius: 999px; }
          .safe-fill { background: #10b981; }
          .warning-fill { background: #f59e0b; }
          .suspicious-fill { background: #ef4444; }
          .moment-row { display: flex; justify-content: space-between; gap: 14px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 8px; background: #fff; }
          .moment-row p { margin: 4px 0 0; color: #64748b; font-size: 11px; line-height: 1.35; }
          .moment-row span { color: #be123c; font-size: 14px; font-weight: 900; white-space: nowrap; }
          .student-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #dbe4ee; border-radius: 14px; margin: 14px 0; overflow: hidden; background: #ffffff; }
          .student-card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 18px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
          .student-number { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: #0891b2; font-weight: 900; }
          .score-block { min-width: 86px; border-radius: 12px; padding: 10px; text-align: center; border: 1px solid #e2e8f0; background: white; }
          .score-block span { font-size: 30px; line-height: 1; font-weight: 900; }
          .score-block small { color: #64748b; font-weight: 800; }
          .score-block.safe span { color: #059669; }
          .score-block.warning span { color: #d97706; }
          .score-block.suspicious span { color: #dc2626; }
          .meta, .analysis-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 14px 18px 0; }
          .meta div, .metric { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
          .meta strong { display: block; margin-top: 6px; color: #0f172a; font-size: 12px; line-height: 1.35; }
          .analysis-grid { grid-template-columns: repeat(6, 1fr); }
          .metric { text-align: center; }
          .metric strong { display: block; margin-top: 5px; font-size: 18px; color: #0f172a; }
          .badge { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 10px; font-weight: 900; }
          .badge.safe { background: #dcfce7; color: #166534; }
          .badge.warning { background: #fef3c7; color: #92400e; }
          .badge.suspicious { background: #fee2e2; color: #991b1b; }
          .narrative { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px 18px 18px; }
          .narrative div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #fff; }
          .narrative p { margin: 7px 0 0; color: #334155; font-size: 12px; line-height: 1.45; }
          .evidence-section { padding: 0 18px 18px; }
          .evidence-title { margin-bottom: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 900; }
          .evidence-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .evidence-frame { margin: 0; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
          .evidence-frame img { display: block; width: 100%; height: 96px; object-fit: cover; background: #e2e8f0; }
          .evidence-frame figcaption { padding: 8px; }
          .evidence-frame figcaption strong { display: block; color: #0f766e; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
          .evidence-frame figcaption span, .evidence-frame figcaption em { display: block; margin-top: 3px; color: #64748b; font-size: 9px; font-style: normal; }
          .evidence-frame figcaption p { margin: 5px 0 0; color: #334155; font-size: 10px; line-height: 1.3; }
          .evidence-empty { grid-column: 1 / -1; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px; color: #64748b; font-size: 11px; text-align: center; }
          .audit-signature { margin-top: 22px; border: 1px solid #dbe4ee; border-radius: 12px; padding: 14px; background: #f8fafc; font-size: 11px; color: #334155; }
          .empty-note { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; color: #64748b; font-size: 12px; }
          .footer { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 12px; color: #94a3b8; font-size: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="cover">
            <div class="header">
              <div>
                <div class="brand">CheatLock</div>
                <h1 class="title">${escapeHtml(exam.title)}</h1>
                <p class="subtitle">Complete academic integrity report generated ${escapeHtml(new Date().toLocaleString())}. Includes cohort summary, high-risk moments, and full student-by-student analysis.</p>
              </div>
              <div class="signature-panel">
                <strong>Exam ID</strong><br />${escapeHtml(String(exam._id))}<br /><br />
                <strong>Duration</strong><br />${Number(exam.durationMinutes || 0)} minutes
              </div>
            </div>
            <div class="summary-grid">
              <div class="summary-card"><span>Total Students</span><strong>${totalStudents}</strong></div>
              <div class="summary-card"><span>High Risk</span><strong>${reportData.summary.highRiskCount || reportData.summary.suspiciousStudents || 0}</strong></div>
              <div class="summary-card"><span>Suspicious Alerts</span><strong>${reportData.summary.suspiciousAlertsTotal || 0}</strong></div>
              <div class="summary-card"><span>Average Score</span><strong>${reportData.summary.averageSuspicionScore || 0}</strong></div>
            </div>
          </section>

          <h2>Risk Distribution</h2>
          <section class="risk-distribution">
            <div class="distribution-card"><span>Safe Students</span><strong>${reportData.summary.safeStudents || 0}</strong><div class="bar"><div class="safe-fill" style="width:${safePercent}%"></div></div></div>
            <div class="distribution-card"><span>Warning Students</span><strong>${reportData.summary.warningStudents || 0}</strong><div class="bar"><div class="warning-fill" style="width:${warningPercent}%"></div></div></div>
            <div class="distribution-card"><span>Suspicious Students</span><strong>${reportData.summary.suspiciousStudents || 0}</strong><div class="bar"><div class="suspicious-fill" style="width:${suspiciousPercent}%"></div></div></div>
          </section>

          <h2>Highest Risk Moments</h2>
          <section>${riskMoments}</section>

          <h2>Full Student Analysis</h2>
          <section>${studentCards || `<div class="empty-note">No student records are available for this report.</div>`}</section>

          <div class="audit-signature">
            <strong>Reviewed Students:</strong> ${reportData.students.filter((student) => student.review?.decision && student.review.decision !== "PENDING").length}/${reportData.students.length}<br />
            <strong>Report Source:</strong> CheatLock teacher dashboard integrity report
          </div>
          <div class="footer">Confidential academic integrity report. Exported from CheatLock teacher dashboard.</div>
        </main>
      </body>
      </html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => {
      logger.warn("PDF evidence assets did not fully settle before timeout; continuing with available captures.");
    });
    
    // Render PDF matching standard A4 dimensions
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        bottom: "20px",
        left: "20px",
        right: "20px",
      },
    });
    
    logger.info(`PDF generated successfully for exam: ${exam.title}`);
    return pdfBuffer;
  } catch (error) {
    logger.error(`Failed to generate exam PDF report: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function resolveChromeExecutablePath() {
  const fs = await import("node:fs");
  for (const candidate of CHROME_EXECUTABLE_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function buildStudentAnalysisCard(student, index) {
  const breakdown = student.breakdown || {};
  const riskLevel = String(student.riskLevel || riskLevelFromScore(student.finalRiskScore)).toLowerCase();
  const latestAlert = student.latestAlert || "No suspicious alert recorded.";
  const teacherNotes = student.review?.notes || "No teacher notes recorded.";
  const evidenceSamples = Array.isArray(student.evidenceSamples) ? student.evidenceSamples : [];
  const evidenceGallery = evidenceSamples.length
    ? evidenceSamples.map((sample) => {
        const imageSource = sample.inlineImage || sample.imageUrl || "";
        return `
          <figure class="evidence-frame">
            <img src="${escapeHtml(imageSource)}" alt="Captured evidence for ${escapeHtml(student.studentName || student.studentId)}" />
            <figcaption>
              <strong>${escapeHtml(sample.captureLabel || captureLabel(sample.eventType))}</strong>
              <span>${escapeHtml(sample.capturedAt ? new Date(sample.capturedAt).toLocaleString() : "Time not recorded")}</span>
              <em>${escapeHtml(String(sample.severity || "low").toUpperCase())} · ${Number(sample.suspicionScore || 0)}/100</em>
              <p>${escapeHtml(sample.alertMessage || sample.eventType || "Evidence capture")}</p>
            </figcaption>
          </figure>
        `;
      }).join("")
    : `<div class="evidence-empty">No capture thumbnails available in this report export.</div>`;

  return `
    <article class="student-card">
      <div class="student-card-head">
        <div>
          <div class="student-number">Student ${index + 1}</div>
          <h3>${escapeHtml(student.studentName || student.studentId)}</h3>
          <p class="muted">${escapeHtml(student.studentId)} · ${escapeHtml(student.status || "Unknown")} · ${escapeHtml(student.onlineStatus || "Unknown")}</p>
        </div>
        <div class="score-block ${riskLevel}">
          <span>${Number(student.finalRiskScore || 0)}</span>
          <small>/100</small>
        </div>
      </div>
      <div class="meta">
        <div><span>Risk Level</span><strong class="badge ${riskLevel}">${escapeHtml(String(student.riskLevel || riskLevelFromScore(student.finalRiskScore)))}</strong></div>
        <div><span>Recommendation</span><strong>${escapeHtml(recommendationLabel(student.recommendation))}</strong></div>
        <div><span>Teacher Verdict</span><strong>${escapeHtml(decisionLabel(student.review?.decision))}</strong></div>
        <div><span>Last Updated</span><strong>${escapeHtml(student.lastUpdatedAt ? new Date(student.lastUpdatedAt).toLocaleString() : "Not recorded")}</strong></div>
      </div>
      <div class="analysis-grid">
        <div class="metric"><span>Face Missing</span><strong>${Number(breakdown.faceMissingCount || 0)}</strong></div>
        <div class="metric"><span>App Switches</span><strong>${Number(breakdown.appSwitchCount || 0)}</strong></div>
        <div class="metric"><span>Suspicious Alerts</span><strong>${Number(breakdown.suspiciousAlertCount || 0)}</strong></div>
        <div class="metric"><span>High Severity</span><strong>${Number(breakdown.highSeverityCount || 0)}</strong></div>
        <div class="metric"><span>Evidence Frames</span><strong>${Number(breakdown.previewEventCount || 0)}</strong></div>
        <div class="metric"><span>Offline Events</span><strong>${Number(breakdown.offlineEventCount || 0)}</strong></div>
      </div>
      <div class="narrative">
        <div><span>Latest Evidence Signal</span><p>${escapeHtml(latestAlert)}</p></div>
        <div><span>Teacher Notes</span><p>${escapeHtml(teacherNotes)}</p></div>
      </div>
      <div class="evidence-section">
        <div class="evidence-title">Capture Evidence</div>
        <div class="evidence-grid">${evidenceGallery}</div>
      </div>
    </article>
  `;
}

function riskLevelFromScore(score = 0) {
  if (score >= 70) return "SUSPICIOUS";
  if (score >= 40) return "WARNING";
  return "SAFE";
}

function recommendationLabel(recommendation) {
  if (recommendation === "DISQUALIFY_RECOMMENDED") return "Disqualify recommended";
  if (recommendation === "REVIEW_RECOMMENDED") return "Review recommended";
  return "Clean recommended";
}

function decisionLabel(decision) {
  if (decision === "CLEAN") return "Clean";
  if (decision === "REVIEW_NEEDED") return "Review Needed";
  if (decision === "DISQUALIFIED") return "Disqualified";
  return "Pending";
}

function percentage(value = 0, total = 0) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / total) * 100);
}

function captureLabel(eventType) {
  return eventType === "screen_telemetry_uploaded" ? "Screen capture" : "Camera capture";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
