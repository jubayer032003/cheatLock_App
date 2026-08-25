import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileArchive,
  History,
  Link2,
  PlayCircle,
  QrCode as QrCodeIcon,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AssignStudentsToExamPanel } from "../components/AssignStudentsToExamPanel";
import { QrCode } from "../components/QrCode";
import { fetchTeacherExam, updateExamLifecycle } from "../lib/api";
import { Badge, Card, EmptyState, ErrorState, SkeletonBlock, cn } from "../components/ui";
import type { Exam, ExamStatus } from "../types";

type LifecycleAction = "DRAFT" | "SCHEDULE" | "START" | "END" | "ARCHIVE";

export function ExamDetailsPage() {
  const { examId } = useParams();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");
  const allowedActions = lifecycleActions(exam?.status || "DRAFT");

  useEffect(() => {
    if (!examId) return;
    setLoadError("");
    setLoading(true);
    fetchTeacherExam(examId)
      .then(setExam)
      .catch((error) => setLoadError(readErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [examId]);

  useEffect(() => {
    if (!exam) return;
    setScheduledStartAt(toLocalInputValue(exam.scheduledStartAt));
    setScheduledEndAt(toLocalInputValue(exam.scheduledEndAt));
  }, [exam]);

  async function refreshExams() {
    if (!examId) return;
    setExam(await fetchTeacherExam(examId));
  }

  async function runLifecycle(action: LifecycleAction) {
    if (!exam?.id) return;
    setSaving(true);
    setMessage("");
    try {
      await updateExamLifecycle(exam.id, {
        action,
        scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : undefined,
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : undefined,
      });
      await refreshExams();
      setMessage("Exam lifecycle updated.");
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="exam-workspace space-y-5">
        <SkeletonBlock className="h-44" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SkeletonBlock className="h-96" />
          <SkeletonBlock className="h-96" />
        </div>
      </div>
    );
  }

  if (!exam) {
    return <ErrorState message={loadError || "Exam not found."} />;
  }

  const status = exam.status || "DRAFT";

  return (
    <div className="exam-workspace space-y-6">
      <ControlRoomHeader exam={exam} />

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Exam facts">
        <FactCard icon={CalendarClock} label="Schedule" value={scheduleSummary(exam)} helper={lifecycleMessage(status)} />
        <FactCard icon={Users} label="Participants" value={`${exam.assignedStudents.length} assigned`} helper="Assignment can be extended while draft, scheduled, or live." />
        <FactCard icon={BookOpen} label="Question set" value={`${exam.questions.length} questions`} helper={`${exam.durationMinutes} minute duration`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <LifecyclePanel
            allowedActions={allowedActions}
            exam={exam}
            message={message}
            runLifecycle={runLifecycle}
            saving={saving}
            scheduledEndAt={scheduledEndAt}
            scheduledStartAt={scheduledStartAt}
            setScheduledEndAt={setScheduledEndAt}
            setScheduledStartAt={setScheduledStartAt}
          />

          <OperationsPanel exam={exam} />

          <AssignStudentsToExamPanel exam={exam} onExamUpdated={setExam} />

          <QuestionOverview exam={exam} />
        </div>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <AccessPanel exam={exam} />
          <ReadinessPanel exam={exam} allowedActions={allowedActions} />
        </aside>
      </section>
    </div>
  );
}

function ControlRoomHeader({ exam }: { exam: Exam }) {
  const status = exam.status || "DRAFT";

  return (
    <section className={cn("exam-hero exam-enter", status === "LIVE" && "exam-hero-live")}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExamStatusBadge status={status} />
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <ShieldCheck size={14} />
              Exam control room
            </span>
          </div>
          <h1 className="text-balance text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">{exam.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {exam.durationMinutes} minutes, {exam.questions.length} questions, {exam.assignedStudents.length} assigned students. {lifecycleMessage(status)}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
          <OperationLink icon={ClipboardList} label="Attendance" helper="Presence and grading" to={`/exams/${exam.id}/attendance`} />
          <OperationLink icon={Activity} label="Live" helper="Monitor now" to={`/exams/${exam.id}/live`} primary={status === "LIVE"} />
          <OperationLink icon={History} label="Replay" helper="Review timeline" to={`/exams/${exam.id}/replay`} />
        </div>
      </div>
    </section>
  );
}

function FactCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string; helper: string }) {
  return (
    <Card className="exam-enter p-4">
      <div className="flex items-start gap-3">
        <div className="exam-icon-box exam-icon-indigo">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </Card>
  );
}

function LifecyclePanel({
  exam,
  allowedActions,
  scheduledStartAt,
  scheduledEndAt,
  setScheduledStartAt,
  setScheduledEndAt,
  runLifecycle,
  saving,
  message,
}: {
  exam: Exam;
  allowedActions: LifecycleAction[];
  scheduledStartAt: string;
  scheduledEndAt: string;
  setScheduledStartAt: (value: string) => void;
  setScheduledEndAt: (value: string) => void;
  runLifecycle: (action: LifecycleAction) => void;
  saving: boolean;
  message: string;
}) {
  const status = exam.status || "DRAFT";

  return (
    <Card className="exam-section exam-enter p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="exam-icon-box exam-icon-cyan">
              <CalendarClock size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Lifecycle control</p>
              <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Schedule, start, end, or archive</h2>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Available actions are driven by the backend status returned for this exam. Scheduling keeps the existing local datetime to ISO conversion.
          </p>
        </div>
        <ExamStatusBadge status={status} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Scheduled start</span>
          <input className="field-input" type="datetime-local" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Scheduled end</span>
          <input className="field-input" type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {allowedActions.includes("SCHEDULE") && (
          <button className="secondary-button" disabled={saving} type="button" onClick={() => runLifecycle("SCHEDULE")}>
            <CalendarClock size={17} />
            Schedule
          </button>
        )}
        {allowedActions.includes("START") && (
          <button className="primary-button" disabled={saving} type="button" onClick={() => runLifecycle("START")}>
            <PlayCircle size={17} />
            Start Exam
          </button>
        )}
        {allowedActions.includes("END") && (
          <button className="secondary-button border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-400/30 dark:text-amber-200 dark:hover:bg-amber-400/10" disabled={saving} type="button" onClick={() => runLifecycle("END")}>
            <CheckCircle2 size={17} />
            End Exam
          </button>
        )}
        {allowedActions.includes("DRAFT") && (
          <button className="secondary-button" disabled={saving} type="button" onClick={() => runLifecycle("DRAFT")}>
            Back to Draft
          </button>
        )}
        {allowedActions.includes("ARCHIVE") && (
          <button className="secondary-button border-slate-400 text-slate-800 dark:border-white/20 dark:text-slate-200" disabled={saving} type="button" onClick={() => runLifecycle("ARCHIVE")}>
            <FileArchive size={17} />
            Archive
          </button>
        )}
        {allowedActions.length === 0 && <Badge tone="neutral">No lifecycle actions available</Badge>}
      </div>

      {(status === "LIVE" || status === "ENDED") && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {status === "LIVE" ? "Ending a live exam changes availability for students." : "Archiving keeps this exam as a historical record."}
        </div>
      )}
      {message && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">{message}</p>}
    </Card>
  );
}

function OperationsPanel({ exam }: { exam: Exam }) {
  const status = exam.status || "DRAFT";

  return (
    <Card className="exam-section exam-enter p-5">
      <div className="flex items-start gap-3">
        <div className="exam-icon-box exam-icon-emerald">
          <Radio size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Connected workspace</p>
          <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Operational routes</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Move into attendance, live monitoring, or replay without losing this control-room context.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <OperationLink icon={ClipboardList} label="Attendance" helper="Attendance, answers, grading" to={`/exams/${exam.id}/attendance`} />
        <OperationLink icon={Activity} label="Live Proctoring" helper={status === "LIVE" ? "Primary active exam surface" : "Ready when students are active"} to={`/exams/${exam.id}/live`} primary={status === "LIVE"} />
        <OperationLink icon={History} label="Replay Timeline" helper="Post-exam event review" to={`/exams/${exam.id}/replay`} primary={status === "ENDED"} />
      </div>
    </Card>
  );
}

function OperationLink({ icon: Icon, label, helper, to, primary = false }: { icon: LucideIcon; label: string; helper: string; to: string; primary?: boolean }) {
  return (
    <Link className={cn("exam-operation-link", primary && "exam-operation-link-primary")} to={to}>
      <Icon size={18} />
      <span>
        <span className="block font-black">{label}</span>
        <span className="mt-0.5 block text-xs opacity-80">{helper}</span>
      </span>
    </Link>
  );
}

function AccessPanel({ exam }: { exam: Exam }) {
  return (
    <Card className="exam-section exam-enter p-5">
      <div className="flex items-start gap-3">
        <div className="exam-icon-box exam-icon-cyan">
          <QrCodeIcon size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Access and distribution</p>
          <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Student entry package</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Server-generated access details for this exam.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        <InfoBlock label="Access code" value={exam.accessCode || "Pending"} icon={ShieldCheck} />
        <InfoBlock label="Direct link" value={exam.accessLink || "Pending"} icon={Link2} copyable />
      </div>
      {exam.accessLink && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
          <QrCode value={exam.accessLink} label={`QR code for ${exam.title}`} />
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">Generated locally in your browser without sharing the link with a third-party QR service.</p>
        </div>
      )}
    </Card>
  );
}

function ReadinessPanel({ exam, allowedActions }: { exam: Exam; allowedActions: LifecycleAction[] }) {
  const status = exam.status || "DRAFT";
  const hasSchedule = Boolean(exam.scheduledStartAt && exam.scheduledEndAt);

  return (
    <Card className="exam-section p-5">
      <div className="flex items-start gap-3">
        <div className="exam-icon-box exam-icon-indigo">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Readiness</p>
          <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">What can happen next</h2>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <ReadinessRow label="Current status" value={status} ready />
        <ReadinessRow label="Schedule window" value={hasSchedule ? "Set" : "Not set"} ready={hasSchedule} optional={status === "DRAFT"} />
        <ReadinessRow label="Assigned students" value={exam.assignedStudents.length} ready={exam.assignedStudents.length > 0} />
        <ReadinessRow label="Questions" value={exam.questions.length} ready={exam.questions.length > 0} />
        <ReadinessRow label="Available actions" value={allowedActions.length ? allowedActions.join(", ") : "None"} ready={allowedActions.length > 0} optional />
      </div>
    </Card>
  );
}

function ReadinessRow({ label, value, ready, optional = false }: { label: string; value: string | number; ready: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
      </div>
      <Badge tone={ready ? "success" : optional ? "neutral" : "warning"}>{ready ? "Ready" : optional ? "Optional" : "Needed"}</Badge>
    </div>
  );
}

function QuestionOverview({ exam }: { exam: Exam }) {
  const totalMarks = useMemo(() => exam.questions.reduce((sum, question) => sum + Number(question.marks || 0), 0), [exam.questions]);

  return (
    <Card className="exam-section exam-enter p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="exam-icon-box exam-icon-indigo">
            <BookOpen size={18} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Question review</p>
            <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Read-only question set</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">This page reviews the existing saved questions. Editing after creation is not implemented in the current workspace.</p>
          </div>
        </div>
        <Badge tone="neutral">{totalMarks} marks</Badge>
      </div>

      <div className="mt-5 space-y-3">
        {exam.questions.map((question, index) => (
          <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.035]" key={`${question.text}-${index}`}>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-sm font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">{index + 1}</span>
                <p className="text-sm font-bold text-slate-950 dark:text-white">Question {index + 1}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={question.type === "MCQ" ? "primary" : "neutral"}>{question.type || "CQ"}</Badge>
                <Badge tone="neutral">{question.marks ?? 1} marks</Badge>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-800 dark:text-slate-200">{question.text}</p>
            {question.options && question.options.length > 0 && (
              <ul className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                {question.options.map((option) => (
                  <li className="rounded-md bg-slate-50 px-3 py-2 dark:bg-white/10" key={option}>{option}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {exam.questions.length === 0 && <EmptyState icon={BookOpen} title="No questions" description="This exam has no questions yet." />}
      </div>
    </Card>
  );
}

function InfoBlock({ label, value, icon: Icon, copyable = false }: { label: string; value: string; icon: LucideIcon; copyable?: boolean }) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage("Copied.");
    } catch {
      setCopyMessage("Copy failed. Select and copy the link manually.");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 break-all font-mono text-sm font-bold text-slate-950 dark:text-white">{value}</p>
        </div>
        {copyable && (
          <button className="icon-button" type="button" title="Copy" onClick={copyValue} aria-label={`Copy ${label}`}>
            <Copy size={17} />
          </button>
        )}
      </div>
      {copyMessage && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" role="status">{copyMessage}</p>}
    </div>
  );
}

function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const config = statusConfig(status);
  const Icon = config.icon;
  return (
    <span className={cn("exam-status-badge", config.className)}>
      <Icon size={14} />
      {config.label}
      {status === "LIVE" && <span className="exam-live-dot" aria-hidden="true" />}
    </span>
  );
}

function statusConfig(status: ExamStatus): { label: string; icon: LucideIcon; className: string } {
  if (status === "LIVE") return { label: "Live", icon: Radio, className: "exam-status-live" };
  if (status === "SCHEDULED") return { label: "Scheduled", icon: CalendarClock, className: "exam-status-scheduled" };
  if (status === "ENDED") return { label: "Ended", icon: CheckCircle2, className: "exam-status-ended" };
  if (status === "ARCHIVED") return { label: "Archived", icon: FileArchive, className: "exam-status-archived" };
  return { label: "Draft", icon: CalendarClock, className: "exam-status-draft" };
}

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function lifecycleActions(status: Exam["status"]): LifecycleAction[] {
  if (status === "DRAFT") return ["SCHEDULE", "START"];
  if (status === "SCHEDULED") return ["DRAFT", "START"];
  if (status === "LIVE") return ["END"];
  if (status === "ENDED") return ["ARCHIVE"];
  return [];
}

function lifecycleMessage(status: ExamStatus) {
  if (status === "DRAFT") return "Prepare the audience and questions, then schedule or start.";
  if (status === "SCHEDULED") return "The exam has a planned window and can still return to draft or start.";
  if (status === "LIVE") return "Students can enter now; live monitoring and attendance are the primary surfaces.";
  if (status === "ENDED") return "Student entry is closed; replay and review become the next operational focus.";
  return "This exam is archived and has no lifecycle actions available.";
}

function scheduleSummary(exam: Exam) {
  if (exam.scheduledStartAt && exam.scheduledEndAt) return `${formatDateTime(exam.scheduledStartAt)} - ${formatDateTime(exam.scheduledEndAt)}`;
  if (exam.scheduledStartAt) return `Starts ${formatDateTime(exam.scheduledStartAt)}`;
  if (exam.scheduledEndAt) return `Ends ${formatDateTime(exam.scheduledEndAt)}`;
  return "No schedule set";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function readErrorMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : "Could not update exam lifecycle.");
}
