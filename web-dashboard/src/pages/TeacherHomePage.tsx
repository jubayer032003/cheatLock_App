import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  PlayCircle,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchTeacherExams } from "../lib/api";
import { getAuthUser } from "../lib/auth";
import type { Exam, ExamStatus } from "../types";
import { Badge, Card, SkeletonBlock, cn } from "../components/ui";

type MetricTone = "cyan" | "emerald" | "indigo" | "amber" | "slate";

interface MetricDefinition {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  tone: MetricTone;
  emphasized?: boolean;
}

interface QuickAction {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: Exclude<MetricTone, "slate">;
}

const quickActions: QuickAction[] = [
  { to: "/exams", label: "Manage exams", description: "Create or edit exam details.", icon: BookOpen, tone: "cyan" },
  { to: "/reports", label: "Review reports", description: "Inspect integrity and student risk.", icon: FileText, tone: "indigo" },
  { to: "/classes", label: "Manage classes", description: "Keep class rosters up to date.", icon: Users, tone: "emerald" },
  { to: "/community", label: "Community roster", description: "Update shared student groups.", icon: GraduationCap, tone: "amber" },
];

const toneStyles: Record<MetricTone, { tile: string; icon: string; ring: string; chart?: string }> = {
  cyan: {
    tile: "border-cyan-200/80 bg-cyan-50/70 dark:border-cyan-400/20 dark:bg-cyan-400/10",
    icon: "bg-cyan-500 text-white shadow-cyan-500/20 dark:bg-cyan-400 dark:text-slate-950",
    ring: "group-hover:border-cyan-300 group-hover:shadow-cyan-500/10 dark:group-hover:border-cyan-400/35",
    chart: "#06b6d4",
  },
  emerald: {
    tile: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/10",
    icon: "bg-emerald-500 text-white shadow-emerald-500/20 dark:bg-emerald-400 dark:text-slate-950",
    ring: "group-hover:border-emerald-300 group-hover:shadow-emerald-500/10 dark:group-hover:border-emerald-400/35",
  },
  indigo: {
    tile: "border-indigo-200/80 bg-indigo-50/70 dark:border-indigo-400/20 dark:bg-indigo-400/10",
    icon: "bg-indigo-500 text-white shadow-indigo-500/20 dark:bg-indigo-400 dark:text-slate-950",
    ring: "group-hover:border-indigo-300 group-hover:shadow-indigo-500/10 dark:group-hover:border-indigo-400/35",
    chart: "#6366f1",
  },
  amber: {
    tile: "border-amber-200/80 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10",
    icon: "bg-amber-500 text-white shadow-amber-500/20 dark:bg-amber-300 dark:text-slate-950",
    ring: "group-hover:border-amber-300 group-hover:shadow-amber-500/10 dark:group-hover:border-amber-400/35",
    chart: "#f59e0b",
  },
  slate: {
    tile: "border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.04]",
    icon: "bg-slate-900 text-white shadow-slate-900/15 dark:bg-slate-100 dark:text-slate-950",
    ring: "group-hover:border-slate-300 group-hover:shadow-slate-500/10 dark:group-hover:border-white/20",
  },
};

export function TeacherHomePage() {
  const user = getAuthUser();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadExams() {
    setLoading(true);
    setError("");
    try {
      setExams(await fetchTeacherExams());
    } catch {
      setError("Could not load dashboard metrics and recent exams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExams();
  }, []);

  const assignedCount = useMemo(() => exams.reduce((sum, exam) => sum + exam.assignedStudents.length, 0), [exams]);
  const liveCount = useMemo(() => exams.filter((exam) => exam.status === "LIVE").length, [exams]);
  const scheduledCount = useMemo(() => exams.filter((exam) => exam.status === "SCHEDULED").length, [exams]);
  const questionCount = useMemo(() => exams.reduce((sum, exam) => sum + exam.questions.length, 0), [exams]);
  const chartData = useMemo(
    () => exams.slice(0, 8).map((exam, index) => ({
      name: exam.title.length > 12 ? `Exam ${index + 1}` : exam.title,
      students: exam.assignedStudents.length + (exam.communityStudents?.length || 0),
      questions: exam.questions.length,
    })),
    [exams]
  );

  const metrics: MetricDefinition[] = useMemo(
    () => [
      { label: "Exams", value: exams.length, helper: "All owned exams", icon: BookOpen, tone: "cyan" },
      {
        label: "Live now",
        value: liveCount,
        helper: "Active proctoring sessions",
        icon: Radio,
        tone: liveCount ? "emerald" : "slate",
        emphasized: liveCount > 0,
      },
      { label: "Assigned students", value: assignedCount, helper: "Students linked to exams", icon: Users, tone: "indigo" },
      { label: "Scheduled", value: scheduledCount, helper: "Upcoming exams", icon: CalendarClock, tone: "amber" },
      { label: "Questions", value: questionCount, helper: "Across owned exams", icon: ClipboardList, tone: "emerald" },
    ],
    [assignedCount, exams.length, liveCount, questionCount, scheduledCount]
  );

  const hasExams = exams.length > 0;

  return (
    <div className="space-y-6 motion-safe:animate-[dashboard-enter_260ms_ease-out]">
      <DashboardHero teacherName={user?.name || "Teacher"} liveCount={liveCount} loading={loading} hasExams={hasExams} />

      {error && <DashboardError message={error} onRetry={loadExams} />}

      <DashboardMetrics metrics={metrics} loading={loading} />

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.38fr)_minmax(320px,0.62fr)]">
        <div className="space-y-6">
          <RecentExams exams={exams.slice(0, 6)} loading={loading} />
          <ExamDistributionChart chartData={chartData} loading={loading} />
        </div>

        <aside className="space-y-6">
          <QuickActionsPanel />
          <DashboardGettingStarted hasExams={hasExams} />
        </aside>
      </section>
    </div>
  );
}

function DashboardHero({
  teacherName,
  liveCount,
  loading,
  hasExams,
}: {
  teacherName: string;
  liveCount: number;
  loading: boolean;
  hasExams: boolean;
}) {
  const statusCopy = loading
    ? "Syncing your exam workspace."
    : liveCount > 0
      ? `${liveCount} live exam${liveCount === 1 ? "" : "s"} need operational attention.`
      : hasExams
        ? "Your exam workspace is ready."
        : "Start by creating your first exam workspace.";

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.07] sm:p-6 lg:p-7">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/0 via-cyan-400/60 to-indigo-400/0" aria-hidden="true" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
              <Activity size={14} />
              Teacher command center
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                liveCount > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100"
                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", liveCount > 0 ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-slate-400")} />
              {statusCopy}
            </span>
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Hello, {teacherName}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            Manage exams, attendance, grading, reports, and rosters from one focused operating surface.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:items-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Workspace state</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{loading ? "Loading exams" : hasExams ? "Exam data loaded" : "No exams yet"}</p>
          </div>
          <Link className="primary-button h-12 px-5" to="/exams">
            <Activity size={18} />
            Create exam
          </Link>
        </div>
      </div>
    </section>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm dark:border-rose-400/25 dark:bg-rose-400/10" role="alert">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-100">
            <RefreshCw size={17} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-rose-950 dark:text-rose-50">Dashboard data could not be loaded</h2>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-100/80">{message}</p>
          </div>
        </div>
        <button className="secondary-button w-fit border-rose-200 text-rose-800 hover:bg-rose-100 dark:border-rose-400/25 dark:text-rose-50 dark:hover:bg-rose-400/15" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    </section>
  );
}

function DashboardMetrics({ metrics, loading }: { metrics: MetricDefinition[]; loading: boolean }) {
  return (
    <section aria-label="Dashboard metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric, index) => (
        <MetricTile key={metric.label} metric={metric} loading={loading} index={index} />
      ))}
    </section>
  );
}

function MetricTile({ metric, loading, index }: { metric: MetricDefinition; loading: boolean; index: number }) {
  const Icon = metric.icon;
  const tone = toneStyles[metric.tone];

  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-4 transition duration-200 motion-safe:animate-[dashboard-enter_240ms_ease-out_both] hover:-translate-y-0.5 hover:shadow-lg",
        tone.ring,
        metric.emphasized && "ring-1 ring-emerald-300/70 dark:ring-emerald-400/30"
      )}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 opacity-80", metric.emphasized ? "bg-emerald-400" : "bg-slate-200 dark:bg-white/10")} aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
          {loading ? (
            <SkeletonBlock className="mt-3 h-9 w-20" />
          ) : (
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{metric.value}</p>
          )}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{metric.helper}</p>
        </div>
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg shadow-lg", tone.icon)}>
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}

function QuickActionsPanel() {
  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader icon={ArrowRight} title="Quick commands" description="Direct paths into common teacher workflows." />
      <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-1">
        {quickActions.map((action) => {
          const Icon = action.icon;
          const tone = toneStyles[action.tone];
          return (
            <Link
              key={action.to}
              to={action.to}
              className={cn(
                "group flex min-h-24 items-center gap-4 rounded-lg border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-cyan-300/30",
                tone.tile,
                tone.ring
              )}
            >
              <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg shadow-lg", tone.icon)}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-950 dark:text-white">{action.label}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{action.description}</p>
              </div>
              <ArrowRight className="shrink-0 text-slate-400 transition duration-200 group-hover:translate-x-0.5 group-hover:text-slate-700 dark:group-hover:text-white" size={18} />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function RecentExams({ exams, loading }: { exams: Exam[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader icon={Activity} title="Recent exam activity" description="Newest owned exams, capped at six for this home view." badge="Most recent" />
      {loading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="rounded-lg border border-slate-200/80 p-4 dark:border-white/10" key={index}>
              <SkeletonBlock className="h-5 w-2/5" />
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
              </div>
            </div>
          ))}
        </div>
      ) : exams.length === 0 ? (
        <EmptyDashboardState />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {exams.map((exam) => (
            <ExamActivityRow exam={exam} key={exam.id} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ExamActivityRow({ exam }: { exam: Exam }) {
  const status = exam.status || "DRAFT";
  const statusTone = getStatusTone(status);

  return (
    <article className="group/exam grid gap-4 p-4 transition duration-200 hover:bg-slate-50/80 dark:hover:bg-white/[0.035] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 gap-4">
        <div className="relative shrink-0">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition duration-200 group-hover/exam:border-cyan-200 group-hover/exam:text-cyan-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:group-hover/exam:border-cyan-400/30 dark:group-hover/exam:text-cyan-200">
            <BookOpen size={20} />
          </div>
          {status === "LIVE" && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4" aria-label="Live exam">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950 dark:text-white">{exam.title}</h3>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", getStatusDot(status))} />
              {status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={14} />
              {exam.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList size={14} />
              {exam.questions.length} questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users size={14} />
              {exam.assignedStudents.length} students
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={14} />
              {examTimeLabel(exam)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
        <ExamActionLink icon={ClipboardList} label="Attendance" to={`/exams/${exam.id}/attendance`} />
        <ExamActionLink icon={PlayCircle} label="Live" to={`/exams/${exam.id}/live`} live={status === "LIVE"} />
        <ExamActionLink icon={Radio} label="Replay" to={`/exams/${exam.id}/replay`} />
      </div>
    </article>
  );
}

function ExamActionLink({ icon: Icon, label, to, live = false }: { icon: LucideIcon; label: string; to: string; live?: boolean }) {
  return (
    <Link
      aria-label={label}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition duration-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30",
        live
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/15"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
      )}
      title={label}
      to={to}
    >
      <Icon size={15} />
      <span>{label}</span>
    </Link>
  );
}

function ExamDistributionChart({ chartData, loading }: { chartData: Array<{ name: string; students: number; questions: number }>; loading: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader icon={BarChart3} title="Exam distribution" description="Students and questions across the latest eight exams." />
      <div className="p-4">
        {loading ? (
          <div className="grid h-[240px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.025]">
            <div className="w-full max-w-xl space-y-4 px-6">
              <SkeletonBlock className="h-5 w-44" />
              <SkeletonBlock className="h-36 w-full" />
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-white/10 dark:bg-white/[0.025]">
            <div>
              <BarChart3 className="mx-auto text-slate-400" size={32} />
              <p className="mt-3 font-semibold text-slate-950 dark:text-white">No distribution yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create an exam to populate this chart.</p>
            </div>
          </div>
        ) : (
          <div className="h-[260px] motion-safe:animate-[dashboard-enter_260ms_ease-out]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="studentsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={toneStyles.cyan.chart} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={toneStyles.cyan.chart} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="questionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={toneStyles.amber.chart} stopOpacity={0.26} />
                    <stop offset="95%" stopColor={toneStyles.amber.chart} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.96)",
                    border: "1px solid rgba(148,163,184,0.25)",
                    borderRadius: "10px",
                    boxShadow: "0 16px 40px rgba(15,23,42,0.14)",
                    fontSize: "13px",
                  }}
                />
                <Area type="monotone" dataKey="students" stroke={toneStyles.cyan.chart} strokeWidth={2.5} fill="url(#studentsGradient)" name="Students" />
                <Area type="monotone" dataKey="questions" stroke={toneStyles.amber.chart} strokeWidth={2.5} fill="url(#questionsGradient)" name="Questions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function DashboardGettingStarted({ hasExams }: { hasExams: boolean }) {
  const steps = [
    { title: "Create and assign exams", description: "Build exams and assign students from the Exams section.", icon: BookOpen },
    { title: "Review attendance", description: "Open Attendance to see who is present and inspect answers.", icon: ClipboardList },
    { title: "Grade and send feedback", description: "Grade submissions and send feedback directly to students.", icon: CheckCircle2 },
  ];

  return (
    <Card className={cn("overflow-hidden p-0", hasExams && "opacity-95")}>
      <SectionHeader icon={CheckCircle2} title="Getting started" description={hasExams ? "Keep the core workflow close at hand." : "Follow the first workflow to begin."} />
      <ol className="space-y-3 p-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li className="flex gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.035]" key={step.title}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-200 dark:ring-white/10">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">0{index + 1}</span>
                  <p className="font-semibold text-slate-950 dark:text-white">{step.title}</p>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-slate-100 p-4 dark:border-white/10">
        <p className="rounded-lg bg-cyan-50 p-3 text-sm font-medium leading-5 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-100">
          Pro tip: Use <strong>Live</strong> mode to monitor exams in real time and ensure academic integrity.
        </p>
      </div>
    </Card>
  );
}

function EmptyDashboardState() {
  return (
    <div className="grid min-h-[280px] place-items-center p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-100 dark:ring-cyan-400/20">
          <BookOpen size={26} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">No exams yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Create an exam to unlock recent activity, attendance shortcuts, live monitoring, replay, and distribution data.
        </p>
        <Link className="primary-button mt-5" to="/exams">
          <Activity size={17} />
          Create exam
        </Link>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, badge }: { icon: LucideIcon; title: string; description: string; badge?: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-200">
          <Icon size={19} />
        </div>
        <div>
          <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {badge && <Badge tone="primary">{badge}</Badge>}
    </div>
  );
}

function getStatusTone(status: ExamStatus | "DRAFT") {
  if (status === "LIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100";
  if (status === "SCHEDULED") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100";
  if (status === "ENDED") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300";
}

function getStatusDot(status: ExamStatus | "DRAFT") {
  if (status === "LIVE") return "bg-emerald-500";
  if (status === "SCHEDULED") return "bg-amber-500";
  if (status === "ENDED") return "bg-rose-500";
  return "bg-slate-400";
}

function examTimeLabel(exam: Exam) {
  if (exam.status === "SCHEDULED" && exam.scheduledStartAt) return `Starts ${formatDateTime(exam.scheduledStartAt)}`;
  if (exam.status === "LIVE" && exam.startedAt) return `Started ${formatDateTime(exam.startedAt)}`;
  if (exam.status === "ENDED" && exam.endedAt) return `Ended ${formatDateTime(exam.endedAt)}`;
  if (exam.scheduledStartAt) return `Scheduled ${formatDateTime(exam.scheduledStartAt)}`;
  return "No schedule";
}

function formatDateTime(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
