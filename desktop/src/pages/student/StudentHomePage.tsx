import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DESKTOP_APP_VERSION } from "../../config/appInfo";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import { SessionService } from "../../services/SessionService";
import type { Exam, ExamSession } from "../../types";
import { buildStudentExamCard, groupStudentExamCards, type StudentExamCardModel } from "./examCards";

interface StudentHomeExamRecord {
  exam: Exam;
  session: ExamSession | null;
}

interface StudentHomePageProps {
  loadExamRecords?: () => Promise<StudentHomeExamRecord[]>;
}

export function StudentHomePage({ loadExamRecords = loadStudentHomeExamRecords }: StudentHomePageProps) {
  const { user, serverUrl } = useAuth();
  const { status: socketStatus } = useSocket();
  const [records, setRecords] = useState<StudentHomeExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await loadExamRecords());
    } catch (err: any) {
      setRecords([]);
      setError(err.message || "Unable to load student exams.");
    } finally {
      setLoading(false);
    }
  }, [loadExamRecords]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const cards = useMemo(
    () => records.map((record) => buildStudentExamCard(record.exam, record.session)),
    [records]
  );
  const groups = useMemo(() => groupStudentExamCards(cards), [cards]);

  return (
    <StudentHomeView
      studentName={user?.name || "Student"}
      studentId={user?.identifier || "unknown"}
      institutionName={user?.institutionName}
      serverUrl={serverUrl}
      connectionStatus={socketStatus}
      appVersion={DESKTOP_APP_VERSION}
      loading={loading}
      error={error}
      groups={groups}
      onRetry={loadHome}
    />
  );
}

export function StudentHomeView({
  studentName,
  studentId,
  institutionName,
  serverUrl,
  connectionStatus,
  appVersion,
  loading,
  error,
  groups,
  onRetry,
}: {
  studentName: string;
  studentId: string;
  institutionName?: string;
  serverUrl: string;
  connectionStatus: string;
  appVersion: string;
  loading: boolean;
  error: string | null;
  groups: ReturnType<typeof groupStudentExamCards>;
  onRetry: () => void;
}) {
  const totalExams = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  const connected = connectionStatus === "Connected";

  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-6">
        <section className="grid gap-4 rounded-lg border border-border bg-zinc-950 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label="CheatLock Desktop" tone="accent" />
              <StatusChip label={`v${appVersion}`} tone="neutral" />
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50">Welcome, {studentName}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-zinc-400">
              <span className="rounded-md border border-border bg-surface-base px-3 py-1 font-mono">{studentId}</span>
              {institutionName && (
                <span className="rounded-md border border-border bg-surface-base px-3 py-1">{institutionName}</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile
              icon={connected ? Wifi : WifiOff}
              label="Connection"
              value={connectionStatus}
              tone={connected ? "success" : "danger"}
            />
            <InfoTile icon={ShieldCheck} label="Server" value={serverUrl.replace(/^https?:\/\//, "")} tone="neutral" />
          </div>
        </section>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <FailureState message={error} onRetry={onRetry} />
        ) : totalExams === 0 ? (
          <EmptyState onRetry={onRetry} />
        ) : (
          <div className="grid gap-5">
            <ExamSection title="Upcoming Exams" cards={groups.upcoming} emptyText="No upcoming exams." />
            <ExamSection title="Available Exams" cards={groups.available} emptyText="No exams are ready to prepare." />
            <ExamSection title="In-Progress Exams" cards={groups.inProgress} emptyText="No exams are currently in progress." />
            <ExamSection title="Completed Exams" cards={groups.completed} emptyText="No completed exams yet." />
            {groups.unavailable.length > 0 && (
              <ExamSection title="Unavailable Exams" cards={groups.unavailable} emptyText="No unavailable exams." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function loadStudentHomeExamRecords(): Promise<StudentHomeExamRecord[]> {
  try {
    const exam = await SessionService.getAssignedExam();
    let session: ExamSession | null = null;
    try {
      session = await SessionService.getActiveSession(exam.id);
    } catch {
      session = null;
    }
    return [{ exam, session }];
  } catch (err: any) {
    const message = String(err.message || "");
    if (message.toLowerCase().includes("no active") || message.toLowerCase().includes("no exam assigned")) {
      return [];
    }
    throw err;
  }
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Loading exams">
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className="min-h-[164px] animate-pulse">
          <div className="h-4 w-24 rounded bg-zinc-800" />
          <div className="mt-5 h-6 w-3/4 rounded bg-zinc-800" />
          <div className="mt-4 h-4 w-full rounded bg-zinc-800" />
          <div className="mt-2 h-4 w-2/3 rounded bg-zinc-800" />
        </Card>
      ))}
    </div>
  );
}

function FailureState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center" glow="threat">
      <AlertTriangle size={34} className="text-danger" />
      <div>
        <h3 className="text-lg font-semibold text-zinc-50">Unable to Load Exams</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">{message}</p>
      </div>
      <Button type="button" onClick={onRetry}>
        <RefreshCw size={16} />
        Retry
      </Button>
    </Card>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
      <CalendarClock size={34} className="text-zinc-500" />
      <div>
        <h3 className="text-lg font-semibold text-zinc-50">No Exams Assigned</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">
          There are no exams available for this student account yet.
        </p>
      </div>
      <Button type="button" variant="secondary" onClick={onRetry}>
        <RefreshCw size={16} />
        Refresh
      </Button>
    </Card>
  );
}

function ExamSection({ title, cards, emptyText }: { title: string; cards: StudentExamCardModel[]; emptyText: string }) {
  return (
    <section aria-labelledby={sectionId(title)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={sectionId(title)} className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </h3>
        <span className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-semibold text-zinc-500">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-raised px-4 py-5 text-sm text-zinc-500">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <StudentExamCard key={`${card.exam.id}-${card.availability}`} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

export function StudentExamCard({ card }: { card: StudentExamCardModel }) {
  return (
    <Card className="flex min-h-[188px] flex-col justify-between gap-5">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge label={card.badgeLabel} tone={card.badgeTone} />
          <Clock3 size={16} className="shrink-0 text-zinc-600" />
        </div>
        <h4 className="mt-4 text-lg font-semibold tracking-tight text-zinc-50">{card.exam.title}</h4>
        <p className="mt-2 text-sm text-zinc-500">
          {card.exam.durationMinutes} min | {card.exam.questions.length} questions
        </p>
      </div>
      <Link
        to={card.actionTo}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#343438] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
      >
        <CheckCircle2 size={16} />
        {card.actionLabel}
      </Link>
    </Card>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  tone: "neutral" | "success" | "danger";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-zinc-400";
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-base p-4">
      <Icon size={18} className={toneClass} />
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-100" title={value}>{value}</p>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "accent" | "neutral" }) {
  return (
    <span
      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
        tone === "accent"
          ? "border-accent/25 bg-accent/10 text-violet-200"
          : "border-border bg-surface-base text-zinc-400"
      }`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: StudentExamCardModel["badgeTone"] }) {
  const classes = {
    neutral: "border-border bg-surface-base text-zinc-400",
    info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    success: "border-success/25 bg-success/10 text-green-200",
    warning: "border-warning/25 bg-warning/10 text-yellow-200",
    danger: "border-danger/25 bg-danger/10 text-red-200",
  };
  return (
    <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase ${classes[tone]}`}>
      {label}
    </span>
  );
}

function sectionId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
