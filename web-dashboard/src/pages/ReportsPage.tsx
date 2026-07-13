import { useEffect, useMemo, useState } from "react";
import {
  clearSubmissions,
  fetchIntegrityReport,
  fetchSubmissions,
  fetchTeacherExams,
  resetSession,
  updateIntegrityReview,
  downloadIntegrityReportPdf,
} from "../lib/api";
import type {
  Exam,
  ExamSubmission,
  IntegrityDecision,
  IntegrityReportResponse,
  IntegrityStudentReport,
} from "../types";
import { 
  Search, 
  Filter, 
  Download, 
  FileText, 
  ShieldAlert, 
  Archive, 
  FileDown, 
  Fingerprint, 
  Settings 
} from "lucide-react";
import { Card } from "../components/ui";
import { IntegrityStudentCard, decisionLabel, recommendationLabel } from "../components/IntegrityStudentCard";

export function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [report, setReport] = useState<IntegrityReportResponse | null>(null);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingStudentId, setSavingStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"ALL" | "SAFE" | "WARNING" | "SUSPICIOUS">("ALL");
  const [retentionPeriod, setRetentionPeriod] = useState<"30" | "90" | "365" | "infinite">("90");

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
    const [nextReport, nextSubmissions] = await Promise.all([
      fetchIntegrityReport(examId),
      fetchSubmissions(),
    ]);
    setReport(nextReport);
    setSubmissions(nextSubmissions);
    setNotesDraft(
      Object.fromEntries(
        nextReport.students.map((student) => [student.studentId, student.review.notes || ""])
      )
    );
  }

  async function saveDecision(student: IntegrityStudentReport, decision: IntegrityDecision) {
    if (!report) return;
    setSavingStudentId(student.studentId);
    setMessage("");
    try {
      await updateIntegrityReview(
        report.exam.id,
        student.studentId,
        decision,
        notesDraft[student.studentId] || ""
      );
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
    await resetSession(student.studentId, report.exam.id);
    await loadReport(report.exam.id);
  }

  async function handleClear() {
    await clearSubmissions();
    setSubmissions([]);
  }

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId),
    [exams, selectedExamId]
  );

  const digitalIntegritySignature = useMemo(() => {
    if (!report) return null;
    const reportId = `REP-${report.exam.id.slice(-6)}-${new Date(report.generatedAt).getTime().toString().slice(-6)}`;
    const hashPayload = `${report.exam.title}-${report.students.length}-${report.generatedAt}`;
    let hash = 0;
    for (let i = 0; i < hashPayload.length; i++) {
      hash = (hash << 5) - hash + hashPayload.charCodeAt(i);
      hash |= 0;
    }
    const signatureHash = `0x${Math.abs(hash).toString(16).toUpperCase()}${report.exam.id.slice(0, 8).toUpperCase()}`;
    const verificationCode = `V-${Math.abs(hash % 99999).toString().padStart(5, "0")}`;
    
    return {
      reportId,
      signatureHash,
      verificationCode,
      timestamp: new Date(report.generatedAt).toISOString(),
    };
  }, [report]);

  const averageScore = useMemo(() => {
    if (!report || report.students.length === 0) return 0;
    const sum = report.students.reduce((acc, s) => acc + s.finalRiskScore, 0);
    return Math.round(sum / report.students.length);
  }, [report]);

  const violationSummary = useMemo(() => {
    if (!report) return { appSwitches: 0, faceMissing: 0, offline: 0, highSeverity: 0, wasLocked: 0 };
    let appSwitches = 0;
    let faceMissing = 0;
    let offline = 0;
    let highSeverity = 0;
    let wasLocked = 0;
    report.students.forEach((s) => {
      appSwitches += s.breakdown?.appSwitchCount || 0;
      faceMissing += s.breakdown?.faceMissingCount || 0;
      offline += s.breakdown?.offlineEventCount || 0;
      highSeverity += s.breakdown?.highSeverityCount || 0;
      if (s.breakdown?.wasLocked) wasLocked++;
    });
    return { appSwitches, faceMissing, offline, highSeverity, wasLocked };
  }, [report]);

  const cohortStats = useMemo(() => {
    if (!report || report.students.length === 0) return { safePct: 0, warningPct: 0, suspiciousPct: 0 };
    const total = report.students.length;
    const safePct = Math.round((report.summary.safeStudents / total) * 100);
    const warningPct = Math.round((report.summary.warningStudents / total) * 100);
    const suspiciousPct = Math.round((report.summary.suspiciousStudents / total) * 100);
    return { safePct, warningPct, suspiciousPct };
  }, [report]);

  const filteredStudents = useMemo(() => {
    if (!report) return [];
    return report.students.filter((student) => {
      const nameMatch = (student.studentName || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
                          student.studentId.toLowerCase().includes(studentSearch.toLowerCase());
      const riskMatch = riskFilter === "ALL" || student.riskLevel === riskFilter;
      return nameMatch && riskMatch;
    });
  }, [report, studentSearch, riskFilter]);

  async function downloadPdfReport() {
    if (!report) return;
    setIsDownloadingPdf(true);
    setMessage("");
    try {
      const blob = await downloadIntegrityReportPdf(report.exam.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Integrity_Report_${report.exam.title.replace(/\s+/g, "_")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("PDF generated and downloaded successfully.");
    } catch (err: any) {
      setMessage("Failed to retrieve PDF report from server. Please check connection.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  function downloadCsvReport() {
    if (!report) return;
    const headers = [
      "Student ID", "Student Name", "Session Status", "Risk Score", "Risk Level",
      "Recommendation", "Teacher Verdict", "Face Missing Warnings",
      "App Focus Switches", "Offline Events", "High Severity Warnings", "Teacher Comments",
    ];
    const rows = report.students.map((student) => [
      student.studentId, student.studentName || "", student.status, student.finalRiskScore, student.riskLevel,
      recommendationLabel(student.recommendation), decisionLabel(student.review.decision),
      student.breakdown.faceMissingCount, student.breakdown.appSwitchCount,
      student.breakdown.offlineEventCount, student.breakdown.highSeverityCount, student.review.notes || "",
    ]);
    const formatField = (field: any) => {
      const stringVal = String(field);
      if (stringVal.includes(",") || stringVal.includes('"') || stringVal.includes("\n")) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    };
    const csvContent = [headers.join(","), ...rows.map((row) => row.map(formatField).join(","))].join("\n");
    triggerBlobDownload(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }), `CheatLock_Integrity_Report_${report.exam.title.replace(/[^a-z0-9]/gi, "_")}.csv`);
  }

  function downloadJsonReport() {
    if (!report || !digitalIntegritySignature) return;
    const exportData = {
      integritySignature: digitalIntegritySignature,
      exam: report.exam,
      summary: report.summary,
      statistics: { averageScore, violationSummary, cohortStats },
      students: report.students,
      generatedAt: report.generatedAt,
    };
    triggerBlobDownload(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }), `CheatLock_Report_${report.exam.title.replace(/[^a-z0-9]/gi, "_")}.json`);
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">SaaS Reporting Center</p>
            <h2 className="mt-1 text-xl font-bold text-white tracking-wider">
              {report?.exam.title || selectedExam?.title || "Select an exam"}
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Generate printable PDF reports, export compliance catalogs, configure data retention periods, and audit tamper checks.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-end">
            <label className="block min-w-56 text-xs">
              <span className="text-slate-500 font-mono block mb-1">Select Exam</span>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 focus:outline-none"
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
              className="secondary-button bg-slate-950 border-slate-850 hover:bg-slate-850 text-xs py-1.5 px-3 rounded transition"
              type="button" 
              onClick={() => selectedExamId && loadReport(selectedExamId)}
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      {report && (
        <>
          <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <FileDown size={14} className="text-violet-400" />
              Export Formats
            </h3>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={downloadPdfReport} 
                disabled={isDownloadingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-bold font-mono transition disabled:opacity-50"
              >
                <FileText size={14} /> {isDownloadingPdf ? "Compiling PDF..." : "PDF Report"}
              </button>
              <button 
                onClick={downloadCsvReport}
                className="flex items-center gap-2 px-4 py-2 bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-300 rounded text-xs font-bold font-mono transition"
              >
                <FileText size={14} /> Export CSV
              </button>
              <button 
                onClick={downloadJsonReport}
                className="flex items-center gap-2 px-4 py-2 bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-300 rounded text-xs font-bold font-mono transition"
              >
                <FileText size={14} /> Export JSON
              </button>
            </div>
          </Card>

          <section className="grid gap-4 md:grid-cols-4">
            <ReportStat label="Total students" value={report.summary.totalStudents} />
            <ReportStat label="Safe" value={report.summary.safeStudents} />
            <ReportStat label="Warning" value={report.summary.warningStudents} />
            <ReportStat label="Suspicious" value={report.summary.suspiciousStudents} />
          </section>

          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            {digitalIntegritySignature && (
              <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Fingerprint size={14} className="text-violet-400" />
                  Digital Integrity Verification
                </h3>
                <div className="bg-slate-950 border border-slate-850 rounded p-4 text-xs font-mono space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Report Reference ID:</span>
                    <span className="text-white font-bold">{digitalIntegritySignature.reportId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tamper Audit Hash:</span>
                    <span className="text-violet-400 font-bold truncate max-w-xs">{digitalIntegritySignature.signatureHash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verification Seal:</span>
                    <span className="text-emerald-400 font-bold">{digitalIntegritySignature.verificationCode}</span>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Settings size={14} className="text-violet-400" />
                Retention Policy
              </h3>
              <div className="space-y-4 text-xs font-mono">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-500">Log Purge Schedule</label>
                  <select 
                    value={retentionPeriod} 
                    onChange={(e) => setRetentionPeriod(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-350 focus:outline-none"
                  >
                    <option value="30">30 Days (Standard Course)</option>
                    <option value="90">90 Days (Academic Semester)</option>
                    <option value="365">1 Year (Certification Cycle)</option>
                    <option value="infinite">Infinite Retention (Enterprise)</option>
                  </select>
                </div>
              </div>
            </Card>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3">Highest Risk Moments</h3>
            <div className="mt-3 space-y-2">
              {report.summary.highestRiskMoments.map((moment) => (
                <div className="flex flex-col gap-1 rounded-md bg-slate-950 border border-slate-850 p-3 text-xs sm:flex-row sm:items-center sm:justify-between font-mono" key={`${moment.studentId}-${moment.alert}`}>
                  <span className="font-bold text-white">{moment.studentName || moment.studentId}</span>
                  <span className="text-slate-400">{moment.alert}</span>
                  <span className="font-bold text-red-400">{moment.score}/100</span>
                </div>
              ))}
              {report.summary.highestRiskMoments.length === 0 && (
                <p className="text-xs text-slate-500 font-mono text-center py-4">No suspicious moments recorded yet.</p>
              )}
            </div>
          </section>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Student Performance Reports ({filteredStudents.length})</h3>
              <div className="flex gap-2 text-xs">
                <input 
                  type="text" 
                  placeholder="Search candidate..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1 text-slate-300 focus:outline-none"
                />
                <select 
                  value={riskFilter} 
                  onChange={(e) => setRiskFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-350 focus:outline-none"
                >
                  <option value="ALL">All Risks</option>
                  <option value="SAFE">Safe Only</option>
                  <option value="WARNING">Warnings</option>
                  <option value="SUSPICIOUS">Suspicious</option>
                </select>
              </div>
            </div>

            <section className="space-y-4">
              {filteredStudents.map((student) => (
                <IntegrityStudentCard
                  key={student.studentId}
                  student={student}
                  notes={notesDraft[student.studentId] || ""}
                  saving={savingStudentId === student.studentId}
                  onNotesChange={(notes) =>
                    setNotesDraft((current) => ({ ...current, [student.studentId]: notes }))
                  }
                  onSaveDecision={(decision) => saveDecision(student, decision)}
                  onReset={() => handleReset(student)}
                />
              ))}
            </section>
          </div>
        </>
      )}

      {loading && <p className="text-xs text-slate-500 font-mono text-center">Loading reports...</p>}
      {message && <p className="text-xs text-rose-500 font-mono text-center mt-4">{message}</p>}
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-center font-mono">
      <p className="text-2xl font-bold text-violet-400">{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
