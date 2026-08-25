import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EXAM_CONSENT_POLICY_VERSION } from "../../config/consentPolicy";
import { useAuth } from "../../contexts/AuthContext";
import { studentExamRulesRoute } from "../../routes/studentRoutes";
import {
  attemptIdFromSession,
  capabilityLabels,
  ExamPreparationStateService,
} from "../../services/ExamPreparationStateService";
import { DeviceReadinessOrchestrator } from "../../services/readiness/DeviceReadinessOrchestrator";
import { SessionService } from "../../services/SessionService";
import { NativeDeviceService } from "../../services/NativeDeviceService";
import type { DeviceReadinessReport, Exam, ExamSession, ReadinessCheckResult } from "../../types";
import { buildStudentExamDetailsViewModel } from "./examDetailsViewModel";

interface PreparationRecord {
  exam: Exam;
  session?: ExamSession | null;
}

interface StudentExamPreparationPageProps {
  loadPreparationRecord?: (examId: string) => Promise<PreparationRecord>;
}

export function StudentExamPreparationPage({
  loadPreparationRecord = loadPreparationRecordFromApi,
}: StudentExamPreparationPageProps) {
  const { user } = useAuth();
  const { examId = "" } = useParams<{ examId: string }>();
  const [record, setRecord] = useState<PreparationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [readinessReport, setReadinessReport] = useState<DeviceReadinessReport | null>(null);
  const [readinessRunning, setReadinessRunning] = useState(false);
  const [installationDeviceId, setInstallationDeviceId] = useState<string | null>(null);

  const studentId = user?.identifier || "";
  const attemptId = attemptIdFromSession(record?.session);
  const deviceId = record?.session?.deviceId ?? installationDeviceId;
  const scope = useMemo(
    () => ({
      studentId,
      examId,
      attemptId,
      deviceId,
      consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
    }),
    [studentId, examId, attemptId, deviceId]
  );
  const hasConsent = studentId ? ExamPreparationStateService.hasValidConsent(scope) : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecord(await loadPreparationRecord(examId));
    } catch (err: any) {
      setRecord(null);
      setError(err.message || "Unable to load preparation details.");
    } finally {
      setLoading(false);
    }
  }, [examId, loadPreparationRecord]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    NativeDeviceService.getInstallationDeviceIdentity()
      .then((identity) => setInstallationDeviceId(identity.deviceId))
      .catch(() => setInstallationDeviceId(null));
  }, []);

  const viewModel = record ? buildStudentExamDetailsViewModel(record.exam, record.session ?? null) : null;

  const acceptConsent = () => {
    if (!studentId || !viewModel) return;
    ExamPreparationStateService.acceptConsent(scope);
    setRejected(false);
    setAcknowledged(true);
  };

  const rejectConsent = () => {
    if (!studentId || !viewModel) return;
    ExamPreparationStateService.rejectConsent(scope);
    setAcknowledged(false);
    setRejected(true);
  };

  const runReadiness = async () => {
    if (!studentId || !viewModel) return;
    setReadinessRunning(true);
    try {
      const report = await new DeviceReadinessOrchestrator().run(
        {
          studentId,
          examId,
          attemptId,
          deviceId,
          policyVersion: EXAM_CONSENT_POLICY_VERSION,
          policy: viewModel.monitoringPolicy,
        },
        ({ report: nextReport }) => setReadinessReport(nextReport)
      );
      setReadinessReport(report);
      ExamPreparationStateService.recordReadinessReport(scope, report);
    } finally {
      setReadinessRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full overflow-y-auto bg-surface-base p-6" aria-label="Loading preparation">
        <Card className="mx-auto min-h-[320px] max-w-4xl animate-pulse">
          <div className="h-5 w-48 rounded bg-zinc-800" />
          <div className="mt-6 h-9 w-3/4 rounded bg-zinc-800" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-14 rounded bg-zinc-800" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error || !viewModel) {
    return (
      <div className="h-full w-full overflow-y-auto bg-surface-base p-6">
        <Card className="mx-auto flex min-h-[260px] max-w-3xl flex-col items-center justify-center gap-4 text-center" glow="threat">
          <AlertTriangle size={34} className="text-danger" />
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Unable to Load Preparation</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
              {error || "This exam preparation record could not be loaded."}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={load}>
            <RefreshCw size={16} />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-surface-base">
      <main className="mx-auto w-full max-w-5xl px-5 py-6 lg:px-6">
        <Card glow="accent">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-semibold uppercase text-violet-200">
              Consent and Privacy
            </span>
            <span className="rounded-md border border-border bg-surface-base px-2.5 py-1 text-xs font-semibold uppercase text-zinc-500">
              Policy {EXAM_CONSENT_POLICY_VERSION}
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50">{viewModel.title}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Review and acknowledge the exact capabilities required for this exam. Accepting this notice does not start
            monitoring and does not request operating-system permissions.
          </p>

          <section className="mt-6" aria-labelledby="required-capabilities">
            <h3 id="required-capabilities" className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Required Capabilities
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {capabilityLabels(viewModel.requiredCapabilities).map((capability) => (
                <div key={capability} className="flex items-center gap-3 rounded-md border border-border bg-surface-base px-3 py-3">
                  <ShieldCheck size={17} className="shrink-0 text-accent" />
                  <span className="text-sm font-semibold text-zinc-100">{capability}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-border bg-surface-base p-4" aria-labelledby="consent-record">
            <h3 id="consent-record" className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Consent Record Scope
            </h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <ScopeDatum label="Student ID" value={studentId || "Unknown"} />
              <ScopeDatum label="Exam ID" value={examId} />
              <ScopeDatum label="Attempt ID" value={attemptId || "Not created yet"} />
              <ScopeDatum label="Device ID" value={deviceId || "Not selected yet"} />
            </dl>
          </section>

          {rejected && (
            <div className="mt-5 flex gap-3 rounded-lg border border-danger/25 bg-danger/10 p-4 text-sm text-red-100">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <p>You rejected the consent notice. You cannot continue preparation for this exam until you accept it.</p>
            </div>
          )}

          {(acknowledged || hasConsent) && (
            <div className="mt-5 flex gap-3 rounded-lg border border-success/25 bg-success/10 p-4 text-sm text-green-100">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <p>Consent recorded for this student, exam, attempt scope, and policy version.</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={acceptConsent}>
              <CheckCircle2 size={16} />
              I Acknowledge and Consent
            </Button>
            <Button type="button" variant="secondary" onClick={rejectConsent}>
              <XCircle size={16} />
              I Do Not Consent
            </Button>
            {(acknowledged || hasConsent) && (
              <Link
                to={studentExamRulesRoute(examId)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#343438] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
              >
                Continue
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </Card>

        {(acknowledged || hasConsent) && (
          <ReadinessReportPanel
            report={readinessReport}
            running={readinessRunning}
            onRun={runReadiness}
          />
        )}
      </main>
    </div>
  );
}

async function loadPreparationRecordFromApi(examId: string): Promise<PreparationRecord> {
  const exam = await SessionService.getAssignedExamById(examId);
  return { exam, session: null };
}

function ScopeDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-raised px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</dt>
      <dd className="mt-1 truncate font-mono text-zinc-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ReadinessReportPanel({
  report,
  running,
  onRun,
}: {
  report: DeviceReadinessReport | null;
  running: boolean;
  onRun: () => void;
}) {
  const completed = report?.results.filter((result) => result.state !== "pending" && result.state !== "checking").length ?? 0;
  const total = report?.results.length ?? 13;
  return (
    <Card className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">Device Readiness</h3>
          <p className="mt-1 text-sm text-zinc-400">
            {report ? `${completed} of ${total} checks completed. Status: ${report.status}.` : "Run checks before entering later preparation steps."}
          </p>
          {report && (
            <p className="mt-1 font-mono text-xs text-zinc-600">
              {report.policyVersion} | {report.configurationFingerprint}
            </p>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={onRun} isLoading={running}>
          <RefreshCw size={16} />
          {report ? "Retry Checks" : "Run Checks"}
        </Button>
      </div>

      {report && (
        <div className="mt-5 grid gap-3">
          {report.results.map((result) => (
            <ReadinessResultRow key={result.checkId} result={result} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ReadinessResultRow({ result }: { result: ReadinessCheckResult }) {
  const stateClass = {
    pending: "border-border bg-surface-base text-zinc-500",
    checking: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    passed: "border-success/25 bg-success/10 text-green-200",
    warning: "border-warning/25 bg-warning/10 text-yellow-200",
    failed: "border-danger/25 bg-danger/10 text-red-200",
    unsupported: "border-border bg-zinc-900 text-zinc-300",
  }[result.state];

  return (
    <div className="rounded-md border border-border bg-surface-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-100">{result.label}</p>
          <p className="mt-1 text-sm text-zinc-400">{result.message}</p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase ${stateClass}`}>
          {result.required ? "Required" : "Optional"} | {result.state}
        </span>
      </div>
      {result.remediation && <p className="mt-2 text-sm text-zinc-500">{result.remediation}</p>}
    </div>
  );
}
