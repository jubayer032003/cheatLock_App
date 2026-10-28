import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileQuestion, GraduationCap, Layers3, LibraryBig, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, ErrorState, MetricCard, PageHeader, SkeletonBlock } from "../components/ui";
import {
  fetchAdminQuestionBankChapters,
  fetchAdminQuestionBankClasses,
  fetchAdminQuestionBankSubjects,
  fetchQuestionBankQuestions,
} from "../lib/api";
import type { QuestionBankClass } from "../types";

type DashboardMetrics = {
  totalClasses: number;
  totalSubjects: number;
  totalChapters: number;
  totalQuestions: number;
};

function isAdmissionClass(item: QuestionBankClass) {
  const text = `${item.name} ${item.slug}`.toLowerCase();
  return text.includes("admission") || text.includes("varsity") || text.includes("medical") || text.includes("engineering");
}

export function DashboardPage() {
  const [classes, setClasses] = useState<QuestionBankClass[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalClasses: 0,
    totalSubjects: 0,
    totalChapters: 0,
    totalQuestions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const classList = await fetchAdminQuestionBankClasses();
      const subjectLists = await Promise.all(classList.map((item) => fetchAdminQuestionBankSubjects(item.id).catch(() => [])));
      const subjects = subjectLists.flat();
      const chapterLists = await Promise.all(subjects.map((item) => fetchAdminQuestionBankChapters(item.id).catch(() => [])));
      const questionData = await fetchQuestionBankQuestions({ page: 1, limit: 1 }).catch(() => ({ questions: [], page: 1, limit: 1, total: 0 }));

      setClasses(classList);
      setMetrics({
        totalClasses: classList.length,
        totalSubjects: subjects.length,
        totalChapters: chapterLists.flat().length,
        totalQuestions: questionData.total || 0,
      });
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || err?.message || "Failed to load admin workspace.");
    } finally {
      setLoading(false);
    }
  }

  const academicCount = useMemo(() => classes.filter((item) => !isAdmissionClass(item)).length, [classes]);
  const admissionCount = useMemo(() => classes.filter(isAdmissionClass).length, [classes]);

  return (
    <div className="space-y-6 motion-safe:animate-page-in">
      <PageHeader
        eyebrow="Welcome back"
        title="Build your question bank"
        description="Create your curriculum structure and add questions step by step."
        actions={
          <Link className="primary-button" to="/academic">
            <Plus size={16} /> Start building
          </Link>
        }
      />

      {errorMessage && <ErrorState message={errorMessage} onRetry={loadDashboardData} />}

      <section className="grid gap-4 lg:grid-cols-2">
        <WorkspaceCard
          to="/academic"
          icon={BookOpen}
          title="Academic"
          subtitle="School & College curriculum"
          helper={`${academicCount} class${academicCount === 1 ? "" : "es"} configured`}
          tone="sky"
        />
        <WorkspaceCard
          to="/admission"
          icon={GraduationCap}
          title="Admission"
          subtitle="University & professional admission preparation"
          helper={`${admissionCount} track${admissionCount === 1 ? "" : "s"} configured`}
          tone="indigo"
        />
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={LibraryBig} label="Total Classes" value={metrics.totalClasses} helper="Across both workspaces" tone="primary" />
          <MetricCard icon={BookOpen} label="Total Subjects" value={metrics.totalSubjects} helper="Created manually" tone="success" />
          <MetricCard icon={Layers3} label="Total Chapters" value={metrics.totalChapters} helper="Structured content" tone="info" />
          <MetricCard icon={FileQuestion} label="Total Questions" value={metrics.totalQuestions} helper="Question bank items" tone="warning" />
        </div>
      )}

      {!loading && classes.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Your admin workspace is ready"
          description="Choose Academic or Admission, create the first class, then continue into subjects, chapters, and questions."
          action={
            <Link className="primary-button" to="/academic">
              <Plus size={16} /> Create first class
            </Link>
          }
        />
      )}
    </div>
  );
}

function WorkspaceCard({
  to,
  icon: Icon,
  title,
  subtitle,
  helper,
  tone,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  subtitle: string;
  helper: string;
  tone: "sky" | "indigo";
}) {
  const toneClass =
    tone === "sky"
      ? "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20"
      : "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20";

  return (
    <Link to={to} className="group block focus:outline-none focus:ring-2 focus:ring-sky-500/30">
      <Card className="min-h-64 overflow-hidden p-7 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl dark:hover:border-white/20">
        <div className="flex h-full flex-col justify-between gap-8">
          <div className="space-y-5">
            <div className={`grid h-12 w-12 place-items-center rounded-xl ring-1 ${toneClass}`}>
              <Icon size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Badge tone={tone === "sky" ? "primary" : "info"}>{helper}</Badge>
            <span className="text-sm font-semibold text-sky-700 transition group-hover:translate-x-1 dark:text-sky-300">Manage -&gt;</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
