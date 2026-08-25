import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  Fingerprint,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  downloadIntegrityReportPdf,
  fetchIntegrityReport,
  fetchTeacherExams,
  resetSession,
  updateIntegrityReview,
} from "../lib/api";
import type {
  Exam,
  IntegrityDecision,
  IntegrityReportResponse,
  IntegrityStudentReport,
} from "../types";
import { Card, EmptyState, SkeletonBlock, cn } from "../components/ui";
import { IntegrityStudentCard, decisionLabel, recommendationLabel } from "../components/IntegrityStudentCard";

type RiskFilter = "ALL" | "SAFE" | "WARNING" | "SUSPICIOUS";
type DownloadState = "idle" | "pdf" | "print";
type ReportSignature = {
  reportId: string;
  timestamp: string;
};

export function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [report, setReport] = useState<IntegrityReportResponse | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingStudentId, setSavingStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [studentSearch, setStudentSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetchTeacherExams()
      .then((items) => {
        setExams(items);
        setSelectedExamId((current) => current || items[0]?.id || "");
      })
      .catch(() => setMessage("Could not load exams."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    loadReport(selectedExamId).catch(() => setMessage("Could not load integrity report."));
  }, [selectedExamId]);

  async function loadReport(examId: string) {
    setMessage("");
    setReportLoading(true);
    try {
      const nextReport = await fetchIntegrityReport(examId);
      setReport(nextReport);
      setNotesDraft(
        Object.fromEntries(nextReport.students.map((student) => [student.studentId, student.review.notes || ""]))
      );
    } finally {
      setReportLoading(false);
    }
  }

  async function saveDecision(student: IntegrityStudentReport, decision: IntegrityDecision) {
    if (!report) return;
    setSavingStudentId(student.studentId);
    setMessage("");
    try {
      await updateIntegrityReview(report.exam.id, student.studentId, decision, notesDraft[student.studentId] || "");
      await loadReport(report.exam.id);
      setMessage("Integrity decision saved.");
    } catch {
      setMessage("Could not save integrity decision.");
    } finally {
      setSavingStudentId("");
    }
  }

  async function handleReset(student: IntegrityStudentReport) {
    if (!report) return;
    if (!window.confirm(`Reset the active attempt for ${student.studentName || student.studentId}? The suspicious score will return to zero.`)) return;
    setSavingStudentId(student.studentId);
    setMessage("");
    try {
      await resetSession(student.studentId, report.exam.id);
      await loadReport(report.exam.id);
      setMessage("Student attempt reset.");
    } catch {
      setMessage("Could not reset this student attempt.");
    } finally {
      setSavingStudentId("");
    }
  }

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId),
    [exams, selectedExamId]
  );

  const reportSignature = useMemo(() => {
    if (!report) return null;
    const reportId = `REP-${report.exam.id.slice(-6)}-${new Date(report.generatedAt).getTime().toString().slice(-6)}`;
    return {
      reportId,
      timestamp: new Date(report.generatedAt).toISOString(),
    };
  }, [report]);

  const reportStats = useMemo(() => {
    if (!report) {
      return {
        averageScore: 0,
        suspiciousAlerts: 0,
        highRiskCount: 0,
        reviewedCount: 0,
      };
    }
    const totalScore = report.students.reduce((sum, student) => sum + student.finalRiskScore, 0);
    const suspiciousAlerts = report.students.reduce(
      (sum, student) => sum + (student.breakdown?.suspiciousAlertCount || 0),
      0
    );
    return {
      averageScore: report.students.length ? Math.round(totalScore / report.students.length) : 0,
      suspiciousAlerts,
      highRiskCount: report.summary.highRiskCount ?? report.summary.suspiciousStudents,
      reviewedCount: report.students.filter((student) => student.review.decision !== "PENDING").length,
    };
  }, [report]);

  const filteredStudents = useMemo(() => {
    if (!report) return [];
    const term = studentSearch.trim().toLowerCase();
    return report.students.filter((student) => {
      const nameMatch = !term ||
        (student.studentName || "").toLowerCase().includes(term) ||
        student.studentId.toLowerCase().includes(term);
      const riskMatch = riskFilter === "ALL" || student.riskLevel === riskFilter;
      return nameMatch && riskMatch;
    });
  }, [report, riskFilter, studentSearch]);

  async function downloadPdfReport() {
    if (!report) return;
    setDownloadState("pdf");
    setMessage("");
    try {
      const blob = await downloadIntegrityReportPdf(report.exam.id);
      triggerBlobDownload(blob, `${safeFileName(report.exam.title)}_Integrity_Report.pdf`);
      setMessage("PDF report downloaded.");
    } catch {
      setMessage("PDF download failed. Check the backend PDF service and try again.");
    } finally {
      setDownloadState("idle");
    }
  }

  function openPrintPreview() {
    if (!report || !reportSignature) return;
    setPreviewOpen(true);
  }

  function printReport() {
    if (!report || !reportSignature) return;
    setDownloadState("print");
    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      setMessage("Print preview was blocked by the browser. Allow popups and try again.");
      setDownloadState("idle");
      return;
    }

    printWindow.document.write(buildPrintableReportHtml(report, reportSignature, reportStats));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      setDownloadState("idle");
    }, 300);
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-5 text-slate-100 font-sans">
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 bg-slate-900/70 p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
            <div className="min-w-0">
              <p className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-[0.2em]">Reporting Center</p>
              <h1 className="mt-2 truncate text-3xl font-black tracking-tight text-white">
                {report?.exam.title || selectedExam?.title || "Select an exam"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Review integrity outcomes, preview the final report, and download a complete student analysis PDF.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block min-w-0 text-xs">
                <span className="mb-1 block font-mono uppercase tracking-wider text-slate-500">Exam</span>
                <select
                  className="h-10 w-full rounded border border-slate-800 bg-slate-950 px-3 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
                  value={selectedExamId}
                  onChange={(event) => setSelectedExamId(event.target.value)}
                >
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button mt-5 h-10 justify-center border-cyan-400/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
                type="button"
                disabled={!selectedExamId || reportLoading}
                onClick={() => selectedExamId && loadReport(selectedExamId)}
              >
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>
        </div>

        {report && (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <ReportKpi icon={Users} label="Students" value={report.summary.totalStudents} helper={`${report.summary.safeStudents} safe`} tone="cyan" />
            <ReportKpi icon={AlertTriangle} label="High Risk" value={reportStats.highRiskCount} helper={`${report.summary.warningStudents} warning`} tone="rose" />
            <ReportKpi icon={ShieldCheck} label="Avg Score" value={`${reportStats.averageScore}/100`} helper="cohort risk" tone={reportStats.averageScore >= 70 ? "rose" : reportStats.averageScore >= 40 ? "amber" : "emerald"} />
            <ReportKpi icon={FileText} label="Alerts" value={reportStats.suspiciousAlerts} helper="suspicious events" tone="amber" />
            <ReportKpi icon={Fingerprint} label="Reviewed" value={`${reportStats.reviewedCount}/${report.students.length}`} helper="teacher verdicts" tone="emerald" />
          </div>
        )}
      </section>

      {message && (
        <div className={cn(
          "rounded-lg border p-3 text-sm",
          message.toLowerCase().includes("fail") || message.toLowerCase().includes("could not")
            ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
            : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
        )}>
          {message}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonBlock className="h-32 bg-slate-800" />
          <SkeletonBlock className="h-32 bg-slate-800" />
          <SkeletonBlock className="h-32 bg-slate-800" />
        </div>
      )}

      {!loading && exams.length === 0 && (
        <EmptyState icon={FileText} title="No exams available" description="Create an exam first, then return here to generate reports." />
      )}

      {report && reportSignature && (
        <>
          <Card className="overflow-hidden rounded-lg border-slate-800 bg-slate-950">
            <div className="grid gap-4 border-b border-slate-800 bg-slate-900/70 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div>
                <h2 className="text-lg font-black text-white">Preview and Download</h2>
                <p className="mt-1 text-xs text-slate-400">Preview the complete student analysis before printing or downloading the PDF.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <ExportButton icon={Eye} label="Preview" onClick={openPrintPreview} />
                <ExportButton icon={Printer} label={downloadState === "print" ? "Opening..." : "Print"} onClick={printReport} disabled={downloadState !== "idle"} />
                <ExportButton icon={Download} label={downloadState === "pdf" ? "Preparing..." : "Download PDF"} onClick={downloadPdfReport} disabled={downloadState !== "idle"} primary />
              </div>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-black text-white">
                  <Fingerprint size={16} className="text-cyan-300" />
                  Report Reference
                </h3>
                <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                  <SignatureField label="Report ID" value={reportSignature.reportId} />
                  <SignatureField label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
                </div>
                <p className="mt-3 text-xs text-slate-500">Reference metadata is informational and is not a digital signature.</p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="text-sm font-black text-white">Risk Split</h3>
                <div className="mt-4 space-y-3">
                  <RiskBar label="Safe" value={percentage(report.summary.safeStudents, report.summary.totalStudents)} tone="emerald" />
                  <RiskBar label="Warning" value={percentage(report.summary.warningStudents, report.summary.totalStudents)} tone="amber" />
                  <RiskBar label="Suspicious" value={percentage(report.summary.suspiciousStudents, report.summary.totalStudents)} tone="rose" />
                </div>
              </div>
            </div>
          </Card>

          <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="rounded-lg border-slate-800 bg-slate-950 p-4">
              <h2 className="text-base font-black text-white">Highest Risk Moments</h2>
              <p className="mt-1 text-xs text-slate-400">Top moments requiring teacher review.</p>
              <div className="mt-4 space-y-2">
                {report.summary.highestRiskMoments.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                    No suspicious moments recorded.
                  </div>
                ) : report.summary.highestRiskMoments.map((moment) => (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3" key={`${moment.studentId}-${moment.alert}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-white">{moment.studentName || moment.studentId}</p>
                      <span className="shrink-0 rounded bg-rose-400/10 px-2 py-1 text-xs font-black text-rose-300">{moment.score}/100</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-400">{moment.alert}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden rounded-lg border-slate-800 bg-slate-950">
              <div className="grid gap-3 border-b border-slate-800 bg-slate-900/70 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <h2 className="text-base font-black text-white">Student Reports</h2>
                  <p className="mt-1 text-xs text-slate-400">{filteredStudents.length} students shown from this report.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(220px,280px)_150px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                      className="h-9 w-full rounded border border-slate-800 bg-slate-950 pl-9 pr-3 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                      type="text"
                      placeholder="Search student"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                    />
                  </div>
                  <select
                    className="h-9 rounded border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    value={riskFilter}
                    onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
                  >
                    <option value="ALL">All risks</option>
                    <option value="SAFE">Safe</option>
                    <option value="WARNING">Warning</option>
                    <option value="SUSPICIOUS">Suspicious</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 p-4">
                {filteredStudents.map((student) => (
                  <IntegrityStudentCard
                    key={student.studentId}
                    student={student}
                    notes={notesDraft[student.studentId] || ""}
                    saving={savingStudentId === student.studentId}
                    onNotesChange={(notes) => setNotesDraft((current) => ({ ...current, [student.studentId]: notes }))}
                    onSaveDecision={(decision) => saveDecision(student, decision)}
                    onReset={() => handleReset(student)}
                  />
                ))}
                {filteredStudents.length === 0 && (
                  <EmptyState icon={Search} title="No matching students" description="Clear search or risk filters to show report rows." />
                )}
              </div>
            </Card>
          </section>
        </>
      )}

      {previewOpen && report && reportSignature && (
        <ReportPreviewDialog
          report={report}
          signature={reportSignature}
          stats={reportStats}
          onClose={() => setPreviewOpen(false)}
          onPrint={printReport}
          onDownloadPdf={downloadPdfReport}
          downloadState={downloadState}
        />
      )}
    </div>
  );
}

function ExportButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-cyan-400/25 bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          : "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
      )}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function ReportKpi({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  tone: "cyan" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className={cn("grid h-10 w-10 place-items-center rounded border", toneClass)}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function SignatureField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-slate-200">{value}</p>
    </div>
  );
}

function RiskBar({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" }) {
  const color = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
  }[tone];
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-slate-200">{value}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-slate-800">
        <div className={cn("h-full rounded", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReportPreviewDialog({
  report,
  signature,
  stats,
  onClose,
  onPrint,
  onDownloadPdf,
  downloadState,
}: {
  report: IntegrityReportResponse;
  signature: ReportSignature;
  stats: { averageScore: number; suspiciousAlerts: number; highRiskCount: number; reviewedCount: number };
  onClose: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  downloadState: DownloadState;
}) {
  const previewHtml = buildPrintableReportHtml(report, signature, stats);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Advanced Report Preview</h2>
            <p className="text-xs text-slate-400">Isolated document preview for the browser print/export layout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton icon={Printer} label="Print / Save" onClick={onPrint} disabled={downloadState !== "idle"} primary />
            <ExportButton icon={Download} label="Download PDF" onClick={onDownloadPdf} disabled={downloadState !== "idle"} />
            <button className="secondary-button h-10 border-slate-700 bg-slate-950 text-slate-200" type="button" onClick={onClose}>
              <X size={15} /> Close
            </button>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-auto bg-slate-200 p-3 sm:p-5">
          <iframe
            className="mx-auto h-[76vh] w-full max-w-[980px] rounded border border-slate-300 bg-white shadow-2xl"
            title={`${report.exam.title} integrity report preview`}
            srcDoc={previewHtml}
          />
        </div>
      </div>
    </div>
  );
}

function buildPrintableReportHtml(
  report: IntegrityReportResponse,
  signature: ReportSignature,
  stats: { averageScore: number; suspiciousAlerts: number; highRiskCount: number; reviewedCount: number }
) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.exam.title)} Integrity Report</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { margin: 0; background: #e2e8f0; font-family: Arial, sans-serif; color: #0f172a; }
    .page { max-width: 980px; margin: 24px auto; background: white; padding: 42px; box-shadow: 0 24px 80px rgba(15,23,42,.18); }
    @media print { body { background: white; } .page { margin: 0; max-width: none; padding: 0; box-shadow: none; } }
  </style>
</head>
<body><main class="page">${buildPrintableReportBody(report, signature, stats)}</main></body>
</html>`;
}

function buildPrintableReportBody(
  report: IntegrityReportResponse,
  signature: ReportSignature,
  stats: { averageScore: number; suspiciousAlerts: number; highRiskCount: number; reviewedCount: number }
) {
  const totalStudents = report.summary.totalStudents || report.students.length;
  const studentCards = report.students.map((student, index) => {
    const riskClassName = student.riskLevel.toLowerCase();
    const breakdown = student.breakdown;
    const teacherNotes = student.review.notes?.trim();
    const alertText = student.latestAlert || "No suspicious alert recorded.";
    const evidenceSamples = student.evidenceSamples || [];
    const evidenceGallery = evidenceSamples.length
      ? evidenceSamples.map((sample) => {
          const imageSource = sample.inlineImage || sample.imageUrl || "";
          return `
            <figure class="evidence-frame">
              <img src="${escapeHtml(imageSource)}" alt="Captured evidence for ${escapeHtml(student.studentName || student.studentId)}" />
              <figcaption>
                <strong>${escapeHtml(sample.captureLabel || captureLabel(sample.eventType))}</strong>
                <span>${escapeHtml(sample.capturedAt ? new Date(sample.capturedAt).toLocaleString() : "Time not recorded")}</span>
                <em>${escapeHtml(sample.severity.toUpperCase())} · ${Number(sample.suspicionScore || 0)}/100</em>
                <p>${escapeHtml(sample.alertMessage || sample.eventType)}</p>
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
            <p class="muted">${escapeHtml(student.studentId)} · ${escapeHtml(student.status)} · ${escapeHtml(student.onlineStatus)}</p>
          </div>
          <div class="score-block ${riskClassName}">
            <span>${student.finalRiskScore}</span>
            <small>/100</small>
          </div>
        </div>

        <div class="student-meta-grid">
          <div><span>Risk Level</span><strong class="badge ${riskClassName}">${escapeHtml(student.riskLevel)}</strong></div>
          <div><span>Recommendation</span><strong>${escapeHtml(recommendationLabel(student.recommendation))}</strong></div>
          <div><span>Teacher Verdict</span><strong>${escapeHtml(decisionLabel(student.review.decision))}</strong></div>
          <div><span>Last Updated</span><strong>${escapeHtml(student.lastUpdatedAt ? new Date(student.lastUpdatedAt).toLocaleString() : "Not recorded")}</strong></div>
        </div>

        <div class="analysis-grid">
          <div class="metric"><span>Face Missing</span><strong>${breakdown.faceMissingCount}</strong></div>
          <div class="metric"><span>App Switches</span><strong>${breakdown.appSwitchCount}</strong></div>
          <div class="metric"><span>Suspicious Alerts</span><strong>${breakdown.suspiciousAlertCount}</strong></div>
          <div class="metric"><span>High Severity</span><strong>${breakdown.highSeverityCount}</strong></div>
          <div class="metric"><span>Evidence Frames</span><strong>${breakdown.previewEventCount}</strong></div>
          <div class="metric"><span>Offline Events</span><strong>${breakdown.offlineEventCount}</strong></div>
        </div>

        <div class="student-narrative">
          <div>
            <span>Latest Evidence Signal</span>
            <p>${escapeHtml(alertText)}</p>
          </div>
          <div>
            <span>Teacher Notes</span>
            <p>${escapeHtml(teacherNotes || "No teacher notes recorded.")}</p>
          </div>
        </div>

        <div class="evidence-section">
          <div class="evidence-title">Capture Evidence</div>
          <div class="evidence-grid">${evidenceGallery}</div>
        </div>
      </article>
    `;
  }).join("");

  const riskMoments = report.summary.highestRiskMoments.length
    ? report.summary.highestRiskMoments.map((moment) => `
        <div class="moment-row">
          <div>
            <strong>${escapeHtml(moment.studentName || moment.studentId)}</strong>
            <p>${escapeHtml(moment.alert)}</p>
          </div>
          <span>${moment.score}/100</span>
        </div>
      `).join("")
    : `<div class="empty-note">No suspicious moments recorded for this exam.</div>`;

  return `
    <style>
      * { box-sizing: border-box; }
      .cover { border-radius: 16px; background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); color: white; padding: 30px; }
      .report-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
      .brand { font-size: 24px; font-weight: 900; color: #67e8f9; }
      h1 { margin: 10px 0 0; font-size: 30px; line-height: 1.08; letter-spacing: 0; }
      h2 { margin: 28px 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #334155; }
      h3 { margin: 3px 0; font-size: 18px; line-height: 1.15; color: #0f172a; }
      .muted { color: #64748b; font-size: 12px; line-height: 1.5; }
      .cover .muted { color: #cbd5e1; }
      .signature-panel { min-width: 210px; border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 14px; background: rgba(15,23,42,.36); font-size: 11px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 24px; }
      .summary-card { border: 1px solid rgba(255,255,255,.16); border-radius: 12px; padding: 14px; background: rgba(255,255,255,.08); }
      .summary-card span, .metric span, .student-meta-grid span, .student-narrative span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
      .cover .summary-card span { color: #bae6fd; }
      .summary-card strong { display: block; margin-top: 6px; color: white; font-size: 26px; line-height: 1; }
      .risk-distribution { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
      .distribution-card { border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 14px; }
      .distribution-card span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
      .distribution-card strong { display: block; margin-top: 6px; color: #0f172a; font-size: 20px; }
      .bar { height: 8px; overflow: hidden; border-radius: 999px; background: #e2e8f0; margin-top: 10px; }
      .bar div { height: 100%; border-radius: 999px; }
      .safe-fill { background: #10b981; }
      .warning-fill { background: #f59e0b; }
      .suspicious-fill { background: #ef4444; }
      .moment-row { display: flex; justify-content: space-between; gap: 14px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 8px; background: #fff; }
      .moment-row p { margin: 4px 0 0; color: #64748b; font-size: 11px; line-height: 1.35; }
      .moment-row span { color: #be123c; font-size: 14px; font-weight: 900; white-space: nowrap; }
      .student-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #dbe4ee; border-radius: 14px; margin: 14px 0; overflow: hidden; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, .06); }
      .student-card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 18px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
      .student-number { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: #0891b2; font-weight: 900; }
      .score-block { min-width: 86px; border-radius: 12px; padding: 10px; text-align: center; border: 1px solid #e2e8f0; background: white; }
      .score-block span { font-size: 30px; line-height: 1; font-weight: 900; }
      .score-block small { color: #64748b; font-weight: 800; }
      .score-block.safe span { color: #059669; }
      .score-block.warning span { color: #d97706; }
      .score-block.suspicious span { color: #dc2626; }
      .student-meta-grid, .analysis-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 14px 18px 0; }
      .student-meta-grid div, .metric { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
      .student-meta-grid strong { display: block; margin-top: 6px; color: #0f172a; font-size: 12px; line-height: 1.35; }
      .analysis-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .metric { text-align: left; min-height: 70px; }
      .metric strong { display: block; margin-top: 5px; font-size: 18px; color: #0f172a; }
      .badge { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 10px; font-weight: 900; }
      .badge.safe { background: #dcfce7; color: #166534; }
      .badge.warning { background: #fef3c7; color: #92400e; }
      .badge.suspicious { background: #fee2e2; color: #991b1b; }
      .student-narrative { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px 18px 18px; }
      .student-narrative div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #fff; }
      .student-narrative p { margin: 7px 0 0; color: #334155; font-size: 12px; line-height: 1.45; }
      .evidence-section { padding: 0 18px 18px; }
      .evidence-title { margin-bottom: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 900; }
      .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .evidence-frame { margin: 0; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
      .evidence-frame img { display: block; width: 100%; height: 150px; object-fit: cover; background: #e2e8f0; }
      .evidence-frame figcaption { padding: 8px; }
      .evidence-frame figcaption strong { display: block; color: #0f766e; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
      .evidence-frame figcaption span, .evidence-frame figcaption em { display: block; margin-top: 3px; color: #64748b; font-size: 9px; font-style: normal; }
      .evidence-frame figcaption p { margin: 5px 0 0; color: #334155; font-size: 10px; line-height: 1.3; }
      .evidence-empty { grid-column: 1 / -1; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px; color: #64748b; font-size: 11px; text-align: center; }
      .audit-signature { margin-top: 22px; border: 1px solid #dbe4ee; border-radius: 12px; padding: 14px; background: #f8fafc; font-size: 11px; color: #334155; }
      .empty-note { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; color: #64748b; font-size: 12px; }
      .footer { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 12px; color: #94a3b8; font-size: 10px; text-align: center; }
      @media print {
        .student-card { box-shadow: none; }
      }
      @media (max-width: 760px) {
        .report-header,
        .student-card-head,
        .student-narrative { display: block; }
        .summary-grid,
        .risk-distribution,
        .student-meta-grid,
        .analysis-grid,
        .evidence-grid { grid-template-columns: 1fr; }
        .signature-panel,
        .score-block { margin-top: 14px; min-width: 0; }
      }
    </style>
    <section class="cover">
      <div class="report-header">
        <div>
          <div class="brand">CheatLock</div>
          <h1>${escapeHtml(report.exam.title)}</h1>
          <p class="muted">
            Complete academic integrity report generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}.
            Includes cohort summary, high-risk moments, and full student-by-student analysis.
          </p>
        </div>
        <div class="signature-panel">
          <strong>Report ID</strong><br />${escapeHtml(signature.reportId)}<br /><br />
          <strong>Generated</strong><br />${escapeHtml(new Date(signature.timestamp).toLocaleString())}
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><span>Total Students</span><strong>${totalStudents}</strong></div>
        <div class="summary-card"><span>High Risk</span><strong>${stats.highRiskCount}</strong></div>
        <div class="summary-card"><span>Suspicious Alerts</span><strong>${stats.suspiciousAlerts}</strong></div>
        <div class="summary-card"><span>Average Score</span><strong>${stats.averageScore}</strong></div>
      </div>
    </section>

    <h2>Risk Distribution</h2>
    <section class="risk-distribution">
      <div class="distribution-card">
        <span>Safe Students</span><strong>${report.summary.safeStudents}</strong>
        <div class="bar"><div class="safe-fill" style="width:${percentage(report.summary.safeStudents, totalStudents)}%"></div></div>
      </div>
      <div class="distribution-card">
        <span>Warning Students</span><strong>${report.summary.warningStudents}</strong>
        <div class="bar"><div class="warning-fill" style="width:${percentage(report.summary.warningStudents, totalStudents)}%"></div></div>
      </div>
      <div class="distribution-card">
        <span>Suspicious Students</span><strong>${report.summary.suspiciousStudents}</strong>
        <div class="bar"><div class="suspicious-fill" style="width:${percentage(report.summary.suspiciousStudents, totalStudents)}%"></div></div>
      </div>
    </section>

    <h2>Highest Risk Moments</h2>
    <section>${riskMoments}</section>

    <h2>Full Student Analysis</h2>
    <section>${studentCards || `<div class="empty-note">No student records are available for this report.</div>`}</section>

    <div class="audit-signature">
      <strong>Report Reference:</strong> ${escapeHtml(signature.reportId)}<br />
      <strong>Reviewed Students:</strong> ${stats.reviewedCount}/${report.students.length}<br />
      <strong>Reference Notice:</strong> Informational metadata; not a digital signature.
    </div>
    <div class="footer">Confidential academic integrity report. Exported from CheatLock teacher dashboard.</div>
  `;
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "CheatLock_Report";
}

function captureLabel(eventType: string) {
  return eventType === "screen_telemetry_uploaded" ? "Screen capture" : "Camera capture";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
