import { Link, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EXAM_CONSENT_POLICY_VERSION } from "../../config/consentPolicy";
import { useAuth } from "../../contexts/AuthContext";
import { ExamPreparationStateService } from "../../services/ExamPreparationStateService";
import { SubmissionReceiptService } from "../../services/SubmissionReceiptService";
import { parseStudentExamRouteParams, STUDENT_HOME_ROUTE, studentExamSessionRoute } from "../../routes/studentRoutes";
import type {
  AttemptStatus,
  ExamAvailabilityStatus,
  IdentityVerificationStatus,
  MonitoringStatus,
  ReadinessStatus,
  SubmissionStatus,
} from "../../types";

type ShellKind =
  | "exam"
  | "readiness"
  | "verification"
  | "rules"
  | "submitted"
  | "history"
  | "profile"
  | "support";

const shellLabels: Record<ShellKind, string> = {
  exam: "Exam overview",
  readiness: "Readiness checks",
  verification: "Identity verification",
  rules: "Exam rules",
  submitted: "Submission receipt",
  history: "Student history",
  profile: "Student profile",
  support: "Support",
};

const shellStates: {
  availability: ExamAvailabilityStatus;
  attempt: AttemptStatus;
  readiness: ReadinessStatus;
  identity: IdentityVerificationStatus;
  monitoring: MonitoringStatus;
  submission: SubmissionStatus;
} = {
  availability: "unavailable",
  attempt: "not_started",
  readiness: "not_checked",
  identity: "not_started",
  monitoring: "inactive",
  submission: "not_started",
};

export function StudentExamOverviewPage() {
  return <StudentExamShell kind="exam" />;
}

export function StudentExamReadinessPage() {
  return <StudentExamShell kind="readiness" />;
}

export function StudentExamVerificationPage() {
  return <StudentExamShell kind="verification" />;
}

export function StudentExamRulesPage() {
  const { user } = useAuth();
  const parsed = parseStudentExamRouteParams(useParams<{ examId: string }>());

  if (!parsed.ok) return <StudentExamShell kind="rules" />;

  const state = user
    ? ExamPreparationStateService.getState({
        studentId: user.identifier,
        examId: parsed.examId,
        consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
      })
    : null;

  const acknowledge = () => {
    if (!user) return;
    ExamPreparationStateService.acknowledgeRules({
      studentId: user.identifier,
      examId: parsed.examId,
      attemptId: state?.attemptId,
      deviceId: state?.deviceId,
      consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
    });
  };

  return (
    <StudentShellFrame title={shellLabels.rules}>
      <p className="text-sm leading-6 text-zinc-400">
        This exam rules page is still a reserved shell. Acknowledging confirms only that the student accepted the rules
        step; it does not start monitoring or request hardware permissions.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={acknowledge}>
          <CheckCircle2 size={16} />
          Acknowledge Rules
        </Button>
        <Link
          to={studentExamSessionRoute(parsed.examId)}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#343438] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
        >
          Continue to Session
        </Link>
      </div>
    </StudentShellFrame>
  );
}

export function StudentExamSubmittedPage() {
  const { user } = useAuth();
  const parsed = parseStudentExamRouteParams(useParams<{ examId: string }>());
  const receipt = parsed.ok && user ? SubmissionReceiptService.get(parsed.examId, user.identifier) : null;

  return (
    <StudentShellFrame title={shellLabels.submitted}>
      {receipt ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-success/20 bg-success/10 p-4 text-green-100">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Confirmed submission</p>
              <p className="mt-1 text-sm text-green-100/80">Your answers were received by the server.</p>
            </div>
          </div>
          <dl className="grid gap-3 text-xs text-zinc-500 sm:grid-cols-2">
            <ShellDatum label="Exam" value={receipt.examTitle} />
            <ShellDatum label="Status" value={receipt.status} />
            <ShellDatum label="Submitted" value={new Date(receipt.submittedAt).toLocaleString()} />
            <ShellDatum label="Reference" value={receipt.receiptReference} />
          </dl>
          <Link
            to={STUDENT_HOME_ROUTE}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#343438] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
          >
            Return to Home
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-zinc-400">
            No confirmed submission receipt is available on this device for this student and exam.
          </p>
          <Link
            to={STUDENT_HOME_ROUTE}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#343438] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
          >
            Return to Home
          </Link>
        </div>
      )}
    </StudentShellFrame>
  );
}

export function StudentHistoryPage() {
  return <StudentStandaloneShell kind="history" />;
}

export function StudentProfilePage() {
  return <StudentStandaloneShell kind="profile" />;
}

export function StudentSupportPage() {
  return <StudentStandaloneShell kind="support" />;
}

function StudentExamShell({ kind }: { kind: ShellKind }) {
  const parsed = parseStudentExamRouteParams(useParams<{ examId: string }>());

  return (
    <StudentShellFrame title={shellLabels[kind]}>
      <p className="text-sm leading-6 text-zinc-400">
        This student exam page is not yet implemented. No readiness, identity, monitoring, or submission checks have
        been run from this shell.
      </p>
      <dl className="mt-5 grid gap-3 text-xs text-zinc-500 sm:grid-cols-2">
        <ShellDatum label="Exam ID" value={parsed.ok ? parsed.examId : "Invalid route parameter"} />
        <ShellDatum label="Availability" value={shellStates.availability} />
        <ShellDatum label="Attempt" value={shellStates.attempt} />
        <ShellDatum label="Readiness" value={shellStates.readiness} />
        <ShellDatum label="Identity" value={shellStates.identity} />
        <ShellDatum label="Monitoring" value={shellStates.monitoring} />
        <ShellDatum label="Submission" value={shellStates.submission} />
      </dl>
    </StudentShellFrame>
  );
}

function StudentStandaloneShell({ kind }: { kind: ShellKind }) {
  return (
    <StudentShellFrame title={shellLabels[kind]}>
      <p className="text-sm leading-6 text-zinc-400">
        This student page is not yet implemented. It is present only to reserve the route and enforce student-only
        navigation.
      </p>
    </StudentShellFrame>
  );
}

function StudentShellFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base p-6">
      <Card className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Student route shell</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{title}</h2>
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  );
}

function ShellDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-base px-3 py-2">
      <dt className="font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</dt>
      <dd className="mt-1 font-mono text-zinc-300">{value}</dd>
    </div>
  );
}
