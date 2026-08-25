import type { ActiveExamAnswerService, ActiveExamAnswerSnapshot } from "./ActiveExamAnswerService";
import { SubmissionReceiptService, type SubmissionReceipt } from "./SubmissionReceiptService";
import { telemetryUploadQueue } from "./TelemetryUploadQueue";
import { SocketService } from "../socket/service";
import type { Exam, ExamSubmission, StudentAnswer } from "../types";

export interface ExamSubmissionLifecycleContext {
  exam: Exam;
  studentId: string;
  attemptId: string;
  snapshot: ActiveExamAnswerSnapshot;
  answerService: ActiveExamAnswerService | null;
  warnings: {
    appSwitch: number;
    faceMissing: number;
    audio: number;
    phone: number;
  };
}

export interface ExamSubmissionLifecycleDependencies {
  saveSubmission: (submission: ExamSubmission) => Promise<void>;
  submitSession: (examId: string) => Promise<unknown>;
  stopMonitoring: () => Promise<void> | void;
  clearSessionCredentials: () => Promise<void> | void;
  navigateSubmitted: (examId: string) => void;
  flushTelemetry?: (required: boolean) => Promise<void>;
  disconnectSocket?: () => void;
  now?: () => Date;
}

export type CleanupReason =
  | "normal_submission"
  | "duplicate_submission"
  | "logout"
  | "session_expiration"
  | "backend_revocation"
  | "route_exit"
  | "app_close"
  | "monitor_failure"
  | "failed_startup"
  | "recoverable_restart"
  | "unrecoverable_error";

export class ExamSubmissionLifecycleService {
  private submissionPromise: Promise<SubmissionReceipt> | null = null;
  private cleanupComplete = false;

  public constructor(private readonly dependencies: ExamSubmissionLifecycleDependencies) {}

  public getUnansweredQuestionIndexes(exam: Exam, answers: Record<number, string>): number[] {
    return exam.questions
      .map((_, index) => index)
      .filter((index) => !answers[index]?.trim());
  }

  public submit(context: ExamSubmissionLifecycleContext): Promise<SubmissionReceipt> {
    if (this.submissionPromise) return this.submissionPromise;
    this.submissionPromise = this.runSubmission(context);
    return this.submissionPromise;
  }

  public async cleanup(reason: CleanupReason): Promise<void> {
    if (this.cleanupComplete) return;
    this.cleanupComplete = true;
    try {
      telemetryUploadQueue.stop();
      this.dependencies.disconnectSocket?.();
      await this.dependencies.stopMonitoring();
      await this.dependencies.clearSessionCredentials();
    } catch (error) {
      if (reason === "normal_submission") throw error;
    }
  }

  private async runSubmission(context: ExamSubmissionLifecycleContext): Promise<SubmissionReceipt> {
    await context.answerService?.save(context.snapshot);
    await context.answerService?.flush();
    await (this.dependencies.flushTelemetry ?? ((required) => telemetryUploadQueue.flushPending(required)))(true);

    const submittedAt = (this.dependencies.now ?? (() => new Date()))();
    await this.dependencies.saveSubmission(this.createSubmission(context, submittedAt));
    const serverResponse = await this.dependencies.submitSession(context.exam.id);

    const receipt = this.createReceipt(context, submittedAt, serverResponse);
    SubmissionReceiptService.save(receipt);

    await this.cleanup("normal_submission");
    await context.answerService?.clear();
    this.dependencies.navigateSubmitted(context.exam.id);
    return receipt;
  }

  private createSubmission(context: ExamSubmissionLifecycleContext, submittedAt: Date): ExamSubmission {
    const totalWarnings = Object.values(context.warnings).reduce((total, count) => total + count, 0);
    const riskLevel = totalWarnings >= 4 ? "High Risk" : totalWarnings >= 2 ? "Medium Risk" : "Low Risk";
    return {
      examId: context.exam.id,
      studentId: context.studentId,
      answers: formatAnswers(context.exam, context.snapshot.answers),
      appSwitchWarnings: context.warnings.appSwitch,
      faceMissingWarnings: context.warnings.faceMissing,
      audioWarnings: context.warnings.audio,
      phoneWarnings: context.warnings.phone,
      totalWarnings,
      riskLevel,
      submittedAt: submittedAt.getTime(),
    };
  }

  private createReceipt(
    context: ExamSubmissionLifecycleContext,
    submittedAt: Date,
    serverResponse: unknown
  ): SubmissionReceipt {
    const raw = typeof serverResponse === "object" && serverResponse !== null ? (serverResponse as Record<string, unknown>) : {};
    return {
      examId: context.exam.id,
      examTitle: context.exam.title,
      studentId: context.studentId,
      attemptId: context.attemptId,
      status: "confirmed",
      submittedAt: submittedAt.toISOString(),
      receiptReference:
        readString(raw.receiptReference) ||
        readString(raw.submissionId) ||
        readString(raw.id) ||
        `${context.exam.id}:${context.attemptId}:${submittedAt.getTime()}`,
    };
  }
}

function formatAnswers(exam: Exam, answers: Record<number, string>): StudentAnswer[] {
  return Object.entries(answers).map(([idx, text]) => {
    const questionIndex = Number(idx);
    return {
      questionIndex,
      questionText: exam.questions[questionIndex]?.text || "",
      answerText: text,
    };
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function createDefaultSubmissionLifecycle(dependencies: Omit<ExamSubmissionLifecycleDependencies, "disconnectSocket">) {
  return new ExamSubmissionLifecycleService({
    ...dependencies,
    disconnectSocket: () => SocketService.getInstance().disconnect(),
  });
}
