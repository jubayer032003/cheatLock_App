import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { parseStudentExamRouteParams } from "../../routes/studentRoutes";
import { SessionService } from "../../services/SessionService";
import type { ApiErrorCode, Exam, ExamSession } from "../../types";
import {
  buildStudentExamDetailsViewModel,
  type StudentExamDetailsViewModel,
} from "./examDetailsViewModel";

export interface StudentExamDetailsRecord {
  exam: Exam;
  session?: ExamSession | null;
}

interface StudentExamDetailsPageProps {
  loadExamDetails?: (examId: string) => Promise<StudentExamDetailsRecord>;
}

interface PageError {
  code: ApiErrorCode;
  title: string;
  message: string;
}

export function StudentExamDetailsPage({
  loadExamDetails = loadStudentExamDetails,
}: StudentExamDetailsPageProps) {
  const params = useParams<{ examId: string }>();
  const parsed = useMemo(() => parseStudentExamRouteParams(params), [params.examId]);
  const [record, setRecord] = useState<StudentExamDetailsRecord | null>(null);
  const [loading, setLoading] = useState(parsed.ok);
  const [error, setError] = useState<PageError | null>(
    parsed.ok
      ? null
      : {
          code: "validation_error",
          title: "Invalid Exam Link",
          message: "The exam link is malformed. Return to your student home and open the exam again.",
        }
  );

  const loadDetails = useCallback(async () => {
    if (!parsed.ok) return;
    setLoading(true);
    setError(null);
    try {
      setRecord(await loadExamDetails(parsed.examId));
    } catch (err) {
      setRecord(null);
      setError(toPageError(err));
    } finally {
      setLoading(false);
    }
  }, [loadExamDetails, parsed]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const viewModel = useMemo(
    () => (record ? buildStudentExamDetailsViewModel(record.exam, record.session ?? null) : null),
    [record]
  );

  if (loading) return <ExamDetailsLoading />;
  if (error) return <ExamDetailsError error={error} onRetry={parsed.ok ? loadDetails : undefined} />;
  if (!viewModel) {
    return (
      <ExamDetailsError
        error={{
          code: "not_found",
          title: "Exam Not Found",
          message: "This exam could not be loaded for your student account.",
        }}
        onRetry={parsed.ok ? loadDetails : undefined}
      />
    );
  }

  return <StudentExamDetailsView exam={viewModel} />;
}

export function StudentExamDetailsView({ exam }: { exam: StudentExamDetailsViewModel }) {
  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base">
      <main className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <section className="min-w-0">
          <Card className="mb-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={exam.availabilityLabel} tone={toneForStatus(exam.availabilityStatus)} />
              <span className="rounded-md border border-border bg-surface-base px-2.5 py-1 text-xs font-semibold uppercase text-zinc-500">
                {labelize(exam.attemptStatus)}
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50">{exam.title}</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <InfoDatum icon={BookOpen} label="Course" value={exam.course} />
              <InfoDatum icon={UserRound} label="Instructor" value={exam.instructor} />
              <InfoDatum icon={CalendarClock} label="Start Time" value={exam.startTime} />
              <InfoDatum icon={CalendarClock} label="End Time" value={exam.endTime} />
              <InfoDatum icon={Clock3} label="Duration" value={exam.duration} />
              <InfoDatum icon={ShieldCheck} label="Availability" value={labelize(exam.availabilityStatus)} />
            </dl>
          </Card>

          <div className="grid gap-5">
            <DetailSection title="Instructions" items={exam.instructions} icon={CheckCircle2} />
            <DetailSection title="Allowed Resources" items={exam.allowedResources} icon={BookOpen} />
            <DetailSection title="Prohibited Resources" items={exam.prohibitedResources} icon={Ban} />
          </div>
        </section>

        <aside className="grid h-fit gap-5">
          <Card glow="accent">
            <div className="flex items-center gap-2 text-zinc-50">
              <ShieldCheck size={18} className="text-accent" />
              <h3 className="text-base font-semibold">Monitoring Requirements</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              These checks are shown before you proceed. This page does not request permissions or start monitoring.
            </p>
            <ul className="mt-4 grid gap-2 text-sm text-zinc-300">
              {exam.monitoringRequirements.map((item) => (
                <li key={item} className="flex gap-2 rounded-md border border-border bg-surface-base px-3 py-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-zinc-50">
              <HelpCircle size={18} className="text-zinc-400" />
              <h3 className="text-base font-semibold">Support</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{exam.supportInformation}</p>
          </Card>

          <Card>
            {exam.action.disabled ? (
              <div>
                <Button type="button" className="w-full" disabled>
                  {exam.action.label}
                </Button>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{exam.action.explanation}</p>
              </div>
            ) : (
              <Link
                to={exam.action.to}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
              >
                {exam.action.label}
                <ArrowRight size={16} />
              </Link>
            )}
          </Card>
        </aside>
      </main>
    </div>
  );
}

async function loadStudentExamDetails(examId: string): Promise<StudentExamDetailsRecord> {
  const exam = await SessionService.getAssignedExamById(examId);
  return { exam, session: null };
}

function ExamDetailsLoading() {
  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base p-6" aria-label="Loading exam details">
      <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-h-[360px] animate-pulse">
          <div className="h-5 w-32 rounded bg-zinc-800" />
          <div className="mt-5 h-9 w-3/4 rounded bg-zinc-800" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-16 rounded bg-zinc-800" />
            ))}
          </div>
        </Card>
        <Card className="min-h-[260px] animate-pulse">
          <div className="h-5 w-40 rounded bg-zinc-800" />
          <div className="mt-5 h-28 rounded bg-zinc-800" />
        </Card>
      </div>
    </div>
  );
}

function ExamDetailsError({ error, onRetry }: { error: PageError; onRetry?: () => void }) {
  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base p-6">
      <Card className="mx-auto flex min-h-[280px] max-w-3xl flex-col items-center justify-center gap-4 text-center" glow="threat">
        <AlertTriangle size={34} className="text-danger" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{error.code}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{error.title}</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">{error.message}</p>
        </div>
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            <RefreshCw size={16} />
            Retry
          </Button>
        )}
      </Card>
    </div>
  );
}

function DetailSection({ title, items, icon: Icon }: { title: string; items: string[]; icon: typeof BookOpen }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-zinc-50">
        <Icon size={18} className="text-zinc-400" />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <ul className="mt-4 grid gap-2 text-sm text-zinc-300">
        {items.map((item) => (
          <li key={item} className="rounded-md border border-border bg-surface-base px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InfoDatum({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-base px-3 py-3">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <Icon size={15} />
        {label}
      </dt>
      <dd className="mt-2 truncate font-semibold text-zinc-100" title={value}>
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }) {
  const classes = {
    neutral: "border-border bg-surface-base text-zinc-400",
    info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    success: "border-success/25 bg-success/10 text-green-200",
    warning: "border-warning/25 bg-warning/10 text-yellow-200",
    danger: "border-danger/25 bg-danger/10 text-red-200",
  };
  return <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase ${classes[tone]}`}>{label}</span>;
}

function toneForStatus(status: StudentExamDetailsViewModel["availabilityStatus"]) {
  if (status === "ready" || status === "submitted") return "success";
  if (status === "verification_required" || status === "in_progress") return "warning";
  if (status === "expired" || status === "blocked") return "danger";
  if (status === "upcoming") return "info";
  return "neutral";
}

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toPageError(error: unknown): PageError {
  const err = error as { status?: number; response?: { status?: number; data?: { message?: string } }; message?: string };
  const status = err.status ?? err.response?.status;
  const message = err.response?.data?.message || err.message || "Unable to load exam details.";

  if (status === 401 || status === 403) {
    return { code: "forbidden", title: "Exam Access Denied", message };
  }
  if (status === 404) {
    return { code: "not_found", title: "Exam Not Found", message };
  }
  if (status === 400) {
    return { code: "validation_error", title: "Invalid Exam Request", message };
  }
  if (status && status >= 500) {
    return { code: "server_error", title: "Backend Failure", message };
  }
  return { code: "network_error", title: "Unable to Load Exam", message };
}
