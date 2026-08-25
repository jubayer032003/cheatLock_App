import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  Lock,
  Plus,
  QrCode as QrCodeIcon,
  Radio,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AssignStudentsToExamPanel } from "../components/AssignStudentsToExamPanel";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QuestionBuilder } from "../components/question-builder/QuestionBuilder";
import { QrCode } from "../components/QrCode";
import { Badge, Card, EmptyState, ErrorState, SkeletonBlock, cn } from "../components/ui";
import { createExam, deleteExam, fetchClasses, fetchTeacherExams } from "../lib/api";
import type { Exam, ExamQuestion, ExamStatus, TeacherClass } from "../types";

export function ExamListPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [createdExam, setCreatedExam] = useState<Exam | null>(null);
  const [error, setError] = useState("");
  const [deletingExamId, setDeletingExamId] = useState("");

  async function loadExams() {
    setError("");
    setLoading(true);
    try {
      setExams(await fetchTeacherExams());
    } catch (err) {
      setError(readErrorMessage(err, "Could not load exams."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExams();
  }, []);

  async function handleCreate(exam: Exam) {
    const created = await createExam(exam);
    setCreatedExam(created);
    setExams(await fetchTeacherExams());
  }

  async function handleDelete(examId: string, examTitle: string) {
    if (deletingExamId) return;
    if (!window.confirm(`Delete exam "${examTitle}"? This cannot be undone.`)) {
      return;
    }
    try {
      setDeletingExamId(examId);
      await deleteExam(examId);
      setExams((prev) => prev.filter((exam) => exam.id !== examId));
    } catch (err) {
      setError(readErrorMessage(err, "Could not delete exam."));
    } finally {
      setDeletingExamId("");
    }
  }

  const stats = useMemo(() => {
    const live = exams.filter((exam) => exam.status === "LIVE").length;
    const scheduled = exams.filter((exam) => exam.status === "SCHEDULED").length;
    const students = exams.reduce((sum, exam) => sum + exam.assignedStudents.length, 0);
    return { live, scheduled, students };
  }, [exams]);

  const liveExams = useMemo(() => exams.filter((exam) => exam.status === "LIVE"), [exams]);

  return (
    <div className="exam-workspace space-y-6">
      <section className="exam-hero exam-enter">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
              <ShieldCheck size={14} />
              Exam operations workspace
            </div>
            <h1 className="text-balance text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Create, prepare, and launch secure assessments.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Build questions, assign the right audience, and hand students a server-generated access code, link, or QR without leaving the exam workspace.
            </p>
          </div>
          <a className="primary-button w-full sm:w-fit" href="#exam-creator">
            <Plus size={18} />
            New exam
          </a>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={loadExams} />}

      <section aria-label="Exam workspace metrics" className="grid gap-4 md:grid-cols-3">
        <WorkspaceMetric icon={BookOpen} label="Total exams" value={loading ? null : exams.length} helper="All owned exam records" tone="cyan" index={0} />
        <WorkspaceMetric
          icon={Radio}
          label="Live / Scheduled"
          value={loading ? null : `${stats.live} / ${stats.scheduled}`}
          helper={stats.live > 0 ? "Live exams need attention now" : "Upcoming exams stay in view"}
          tone={stats.live > 0 ? "emerald" : "amber"}
          live={stats.live > 0}
          index={1}
        />
        <WorkspaceMetric icon={Users} label="Assigned students" value={loading ? null : stats.students} helper="Across the loaded exams" tone="indigo" index={2} />
      </section>

      {liveExams.length > 0 && (
        <Card className="exam-live-strip p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-100">
                {liveExams.length} exam{liveExams.length === 1 ? "" : "s"} currently live
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Live monitoring is available from each exam card.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {liveExams.slice(0, 3).map((exam) => (
                <Link className="secondary-button" key={exam.id || exam.title} to={`/exams/${exam.id}/live`}>
                  <Activity size={16} />
                  {exam.title}
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}

      <ExamCreator onCreated={handleCreate} createdExam={createdExam} />

      <section className="exam-enter exam-enter-delay-2">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Exam fleet</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Operational exam list</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Only exams owned by the logged-in teacher are shown.</p>
          </div>
          <Badge tone="neutral">{loading ? "Loading" : `${exams.length} total`}</Badge>
        </div>

        {loading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock className="h-72" key={index} />
            ))}
          </div>
        ) : exams.length === 0 ? (
          <Card className="p-5">
            <EmptyState icon={BookOpen} title="No exams found" description="Create your first exam to generate an access code, link, and QR." />
            <div className="mt-4 flex justify-center">
              <a className="primary-button" href="#exam-creator">
                <Plus size={17} />
                Start with a new exam
              </a>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {exams.map((exam, index) => (
              <ExamListCard
                exam={exam}
                key={exam.id || exam.title}
                onDelete={handleDelete}
                deleting={deletingExamId === exam.id}
                onExamUpdated={(updatedExam) => {
                  setExams((current) =>
                    current.map((item) => (item.id === updatedExam.id ? updatedExam : item))
                  );
                }}
                index={index}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WorkspaceMetric({
  icon: Icon,
  label,
  value,
  helper,
  tone,
  live = false,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  helper: string;
  tone: "cyan" | "emerald" | "amber" | "indigo";
  live?: boolean;
  index: number;
}) {
  return (
    <Card className="exam-metric exam-enter p-4" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          {value === null ? <SkeletonBlock className="mt-3 h-8 w-24" /> : <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className={cn("exam-icon-box", `exam-icon-${tone}`, live && "exam-live-pulse")}>
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}

function ExamListCard({
  exam,
  onDelete,
  deleting,
  onExamUpdated,
  index,
}: {
  exam: Exam;
  onDelete: (examId: string, examTitle: string) => void;
  deleting: boolean;
  onExamUpdated: (exam: Exam) => void;
  index: number;
}) {
  const status = exam.status || "DRAFT";

  return (
    <article className="exam-card exam-enter" style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <ExamStatusBadge status={status} />
          <h3 className="mt-3 line-clamp-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{exam.title}</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{describeSchedule(exam)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-52">
          <MiniStat icon={Clock3} label="Duration" value={`${exam.durationMinutes}m`} />
          <MiniStat icon={Users} label="Students" value={exam.assignedStudents.length} />
          <MiniStat icon={BookOpen} label="Questions" value={exam.questions.length} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoChip label="Exam code" value={exam.accessCode || "Pending"} mono />
        <InfoChip label="Audience source" value={exam.useCommunity ? "Community enabled" : "Manual / classes"} />
      </div>

      {exam.id && (
        <>
          <AssignStudentsToExamPanel
            className="mt-4 border-slate-200/80 bg-slate-50/80 p-4 shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            exam={exam}
            onExamUpdated={onExamUpdated}
          />
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Primary path: details first, live when active</div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              <Link className="primary-button" to={`/exams/${exam.id}`}>
                <Eye size={17} />
                Details
              </Link>
              <Link className={cn("secondary-button", status === "LIVE" && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100")} to={`/exams/${exam.id}/live`}>
                <Activity size={17} />
                Live
              </Link>
              <button
                className="secondary-button border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-400/20 dark:text-rose-300 dark:hover:bg-rose-400/10"
                type="button"
                disabled={deleting}
                onClick={() => onDelete(exam.id!, exam.title)}
                title="Delete exam"
              >
                <Trash2 size={17} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-2.5 text-center dark:border-white/10 dark:bg-white/[0.035]">
      <Icon className="mx-auto text-slate-400 dark:text-slate-500" size={16} />
      <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function InfoChip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-bold text-slate-900 dark:text-white", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function ExamCreator({ onCreated, createdExam }: { onCreated: (exam: Exam) => Promise<void>; createdExam: Exam | null }) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("10");
  const [assignedStudents, setAssignedStudents] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [lockAnswers, setLockAnswers] = useState(true);
  const [useCommunity, setUseCommunity] = useState(true);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  const manualStudents = useMemo(
    () => assignedStudents.split(",").map((student) => student.trim().toLowerCase()).filter(Boolean),
    [assignedStudents]
  );
  const durationMinutes = Number(duration) || 10;
  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const selectedClasses = classes.filter((item) => selectedClassIds.includes(item.id));
  const selectedClassStudents = selectedClasses.reduce((sum, item) => sum + item.students.length, 0);
  const hasAudience = manualStudents.length > 0 || useCommunity || selectedClassIds.length > 0;

  async function handleSubmit() {
    const students = assignedStudents.split(",").map((student) => student.trim().toLowerCase()).filter(Boolean);
    const nextDurationMinutes = Number(duration) || 10;

    if (!title.trim()) return setMessage("Add an exam title.");
    if (nextDurationMinutes <= 0) return setMessage("Duration must be at least 1 minute.");
    if (questions.length === 0) return setMessage("Add at least one question.");
    if (students.length === 0 && !useCommunity && selectedClassIds.length === 0) {
      return setMessage("Assign at least one student, class, or teacher community.");
    }

    setCreating(true);
    setMessage("");
    try {
      await onCreated({ title: title.trim(), durationMinutes: nextDurationMinutes, lockAnswers, questions, assignedStudents: students, useCommunity, classIds: selectedClassIds });
      setTitle("");
      setAssignedStudents("");
      setSelectedClassIds([]);
      setQuestions([]);
      setMessage("Exam created successfully.");
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not create exam."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="exam-enter exam-enter-delay-1" id="exam-creator">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Creation workspace</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Assemble a secure exam</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything remains on this page: basics, audience, behavior, questions, and access handoff after creation.</p>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="exam-section p-5" id="exam-basics">
            <SectionHeading icon={FileCheck2} eyebrow="Step 1" title="Exam basics" description="Name the assessment and choose the existing duration field." />
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_260px]">
              <label className="block">
                <span className="field-label">Exam title</span>
                <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Midterm ICT secure assessment" />
              </label>
              <label className="block">
                <span className="field-label">Duration minutes</span>
                <input className="field-input" value={duration} onChange={(event) => setDuration(event.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick duration presets">
              {["10", "20", "30"].map((minute) => (
                <button className={cn("secondary-button", duration === minute && "border-cyan-300 bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200")} key={minute} type="button" onClick={() => setDuration(minute)}>
                  {minute} min
                </button>
              ))}
            </div>
          </Card>

          <Card className="exam-section p-5" id="exam-audience">
            <SectionHeading icon={Users} eyebrow="Step 2" title="Audience" description="Assign specific students, selected class rosters, or the teacher community." />
            <label className="mt-5 block">
              <span className="field-label">Specific student IDs or emails</span>
              <input className="field-input" value={assignedStudents} onChange={(event) => setAssignedStudents(event.target.value)} placeholder="student.id@school.edu, cadet.id@school.edu" />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Separate multiple students with commas.</span>
            </label>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.025]">
              <div className="flex flex-col gap-1">
                <h3 className="font-bold tracking-tight text-slate-950 dark:text-white">Assign classes</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Selected class rosters are added to this exam automatically.</p>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {classes.map((item) => (
                  <label className="exam-choice" key={item.id}>
                    <input
                      className="mt-1 h-4 w-4 accent-cyan-500"
                      type="checkbox"
                      checked={selectedClassIds.includes(item.id)}
                      onChange={(event) => {
                        setSelectedClassIds((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((classId) => classId !== item.id)
                        );
                      }}
                    />
                    <span>
                      <span className="block font-semibold text-slate-900 dark:text-white">{item.name}{item.section ? ` / ${item.section}` : ""}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{item.subject || "No subject"} / {item.students.length} students</span>
                    </span>
                  </label>
                ))}
                {classes.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No classes yet. Create classes from the Classes page.</p>}
              </div>
            </div>
          </Card>

          <Card className="exam-section p-5" id="exam-behavior">
            <SectionHeading icon={Lock} eyebrow="Step 3" title="Exam behavior" description="Use the existing answer-locking and teacher community switches." />
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <ToggleCard title="Lock answer after save" checked={lockAnswers} onChange={setLockAnswers} description="Preserves the current lockAnswers value sent to the API." />
              <ToggleCard title="Assign teacher community" checked={useCommunity} onChange={setUseCommunity} description="Includes the current teacher community as an assignment source." />
            </div>
          </Card>

          <div className="exam-section" id="exam-questions">
            <QuestionBuilder questions={questions} onChange={setQuestions} />
          </div>
        </div>

        <aside className="space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <Card className="exam-summary-panel p-5">
            <SectionHeading icon={CheckCircle2} eyebrow="Creation summary" title="Ready check" description="A live summary of the same values that will be submitted." compact />
            <div className="mt-5 space-y-3">
              <SummaryRow label="Title" value={title.trim() || "Missing"} ready={Boolean(title.trim())} />
              <SummaryRow label="Duration" value={`${durationMinutes} min`} ready={durationMinutes > 0} />
              <SummaryRow label="Questions" value={`${questions.length} / ${totalMarks} marks`} ready={questions.length > 0} />
              <SummaryRow label="Manual students" value={manualStudents.length} ready={manualStudents.length > 0} optional />
              <SummaryRow label="Classes" value={`${selectedClassIds.length} selected (${selectedClassStudents} roster students)`} ready={selectedClassIds.length > 0} optional />
              <SummaryRow label="Community" value={useCommunity ? "Included" : "Not included"} ready={useCommunity} optional />
              <SummaryRow label="Audience source" value={hasAudience ? "Configured" : "Missing"} ready={hasAudience} />
              <SummaryRow label="Answer locking" value={lockAnswers ? "Enabled" : "Disabled"} ready />
            </div>
            <button className="primary-button mt-5 w-full" disabled={creating} type="button" onClick={handleSubmit}>
              <Plus size={17} />
              {creating ? "Creating..." : "Create Exam"}
            </button>
            {message && (
              <p className={cn("mt-3 text-sm", message.includes("success") ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")} role="status">
                {message}
              </p>
            )}
          </Card>

          {createdExam && <CreatedExamAccessPanel exam={createdExam} />}
        </aside>
      </div>
    </section>
  );
}

function SectionHeading({ icon: Icon, eyebrow, title, description, compact = false }: { icon: LucideIcon; eyebrow: string; title: string; description: string; compact?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="exam-icon-box exam-icon-cyan">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">{eyebrow}</p>
        <h3 className={cn("font-black tracking-tight text-slate-950 dark:text-white", compact ? "text-lg" : "text-xl")}>{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function ToggleCard({ title, checked, onChange, description }: { title: string; checked: boolean; onChange: (value: boolean) => void; description: string }) {
  return (
    <label className="exam-toggle">
      <span className="flex items-start gap-3">
        <span className={cn("mt-1 h-3 w-3 rounded-full", checked ? "bg-emerald-500" : "bg-slate-400")} />
        <span>
          <span className="block font-bold text-slate-900 dark:text-white">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
        </span>
      </span>
      <input className="h-5 w-5 accent-cyan-500" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function SummaryRow({ label, value, ready, optional = false }: { label: string; value: string | number; ready: boolean; optional?: boolean }) {
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

function CreatedExamAccessPanel({ exam }: { exam: Exam }) {
  return (
    <Card className="exam-success-panel p-5">
      <div className="flex items-start gap-3">
        <div className="exam-icon-box exam-icon-emerald">
          <QrCodeIcon size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Exam created successfully</p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">Student access handoff</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{exam.title}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <InfoChip label="Access code" value={exam.accessCode || "Pending"} mono />
        <InfoChip label="Direct link" value={exam.accessLink || "Pending"} />
      </div>
      {exam.accessLink && (
        <div className="mt-4">
          <QrCode value={exam.accessLink} label={`QR code for ${exam.title}`} />
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">Generated privately in this browser. The exam link is not sent to a QR service.</p>
        </div>
      )}
    </Card>
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
  if (status === "ARCHIVED") return { label: "Archived", icon: FileCheck2, className: "exam-status-archived" };
  return { label: "Draft", icon: Clock3, className: "exam-status-draft" };
}

function describeSchedule(exam: Exam) {
  if (exam.status === "SCHEDULED" && exam.scheduledStartAt) return `Scheduled for ${formatDateTime(exam.scheduledStartAt)}`;
  if (exam.status === "LIVE") return exam.scheduledEndAt ? `Live until ${formatDateTime(exam.scheduledEndAt)}` : "Live now";
  if (exam.status === "ENDED" && exam.endedAt) return `Ended ${formatDateTime(exam.endedAt)}`;
  if (exam.status === "ARCHIVED" && exam.archivedAt) return `Archived ${formatDateTime(exam.archivedAt)}`;
  return "Draft exam awaiting schedule or start";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function readErrorMessage(error: unknown, fallback = "Something went wrong.") {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
