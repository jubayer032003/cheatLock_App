import type {
  AttemptStatus,
  Exam,
  ExamAvailabilityStatus,
  ExamMonitoringPolicy,
  ExamSession,
  PermissionCapability,
} from "../../types";
import {
  studentExamReadinessRoute,
  studentExamRoute,
  studentExamSessionRoute,
  studentExamSubmittedRoute,
  studentExamVerificationRoute,
} from "../../routes/studentRoutes";
import { deriveExamAvailability, type StudentExamActionLabel } from "./examCards";

export interface StudentExamDetailsViewModel {
  id: string;
  title: string;
  course: string;
  instructor: string;
  startTime: string;
  endTime: string;
  duration: string;
  attemptStatus: AttemptStatus;
  availabilityStatus: ExamAvailabilityStatus;
  availabilityLabel: string;
  allowedResources: string[];
  prohibitedResources: string[];
  monitoringPolicy: ExamMonitoringPolicy;
  requiredCapabilities: PermissionCapability[];
  monitoringRequirements: string[];
  instructions: string[];
  supportInformation: string;
  action: {
    label: StudentExamActionLabel;
    to: string;
    disabled: boolean;
    explanation?: string;
  };
}

const defaultMonitoringPolicy: ExamMonitoringPolicy = {
  requireCamera: true,
  requireMicrophone: true,
  requireScreenCapture: true,
  requireIdentityVerification: true,
  requireLivenessChecks: true,
  allowOfflineDrafts: true,
  allowMultipleDisplays: false,
  telemetryIntervalMs: 5000,
  screenSnapshotIntervalMs: 15000,
};

export function buildStudentExamDetailsViewModel(
  exam: Exam,
  session: ExamSession | null = null
): StudentExamDetailsViewModel {
  const raw = exam as unknown as Record<string, unknown>;
  const availabilityStatus = deriveExamAvailability(exam, session);
  const monitoringPolicy = readMonitoringPolicy(raw.monitoringPolicy);

  return {
    id: readString(raw.id, "Unknown exam"),
    title: readString(raw.title, "Untitled exam"),
    course: readString(raw.course, "Not provided"),
    instructor: readString(raw.instructor, readString(raw.createdBy, "Not provided")),
    startTime: formatDate(readString(raw.scheduledStartAt, "")),
    endTime: formatDate(readString(raw.scheduledEndAt, "")),
    duration: `${readNumber(raw.durationMinutes, 0)} minutes`,
    attemptStatus: mapAttemptStatus(session),
    availabilityStatus,
    availabilityLabel: availabilityLabelByStatus[availabilityStatus],
    allowedResources: readStringList(raw.allowedResources, ["No allowed resources configured."]),
    prohibitedResources: readStringList(raw.prohibitedResources, ["No prohibited resources configured."]),
    monitoringPolicy,
    requiredCapabilities: requiredCapabilitiesForPolicy(monitoringPolicy),
    monitoringRequirements: monitoringRequirementsForPolicy(monitoringPolicy),
    instructions: readStringList(raw.instructions, ["No exam instructions configured yet."]),
    supportInformation: readString(raw.supportInformation, "Contact your instructor or exam support team."),
    action: actionForAvailability(exam.id, availabilityStatus),
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const list = value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
    if (list.length > 0) return list;
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readMonitoringPolicy(value: unknown): ExamMonitoringPolicy {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    requireCamera: readBoolean(raw.requireCamera, defaultMonitoringPolicy.requireCamera),
    requireMicrophone: readBoolean(raw.requireMicrophone, defaultMonitoringPolicy.requireMicrophone),
    requireScreenCapture: readBoolean(raw.requireScreenCapture, defaultMonitoringPolicy.requireScreenCapture),
    requireIdentityVerification: readBoolean(raw.requireIdentityVerification, defaultMonitoringPolicy.requireIdentityVerification),
    requireLivenessChecks: readBoolean(raw.requireLivenessChecks, defaultMonitoringPolicy.requireLivenessChecks),
    allowOfflineDrafts: readBoolean(raw.allowOfflineDrafts, defaultMonitoringPolicy.allowOfflineDrafts),
    allowMultipleDisplays: readBoolean(raw.allowMultipleDisplays, defaultMonitoringPolicy.allowMultipleDisplays),
    telemetryIntervalMs: readNumber(raw.telemetryIntervalMs, defaultMonitoringPolicy.telemetryIntervalMs),
    screenSnapshotIntervalMs: readNumber(raw.screenSnapshotIntervalMs, defaultMonitoringPolicy.screenSnapshotIntervalMs),
  };
}

function mapAttemptStatus(session: ExamSession | null): AttemptStatus {
  if (!session) return "not_started";
  if (session.status === "IN_PROGRESS") return "in_progress";
  if (session.status === "SUBMITTED") return "submitted";
  if (session.status === "LOCKED") return "locked";
  if (session.status === "RESET_BY_TEACHER") return "reset_by_teacher";
  return "not_started";
}

function formatDate(value: string) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not scheduled"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function monitoringRequirementsForPolicy(policy: ExamMonitoringPolicy) {
  const labels: Record<PermissionCapability, string> = {
    camera: "Camera access",
    microphone: "Microphone access",
    screen_capture: "Screen recording",
    face_verification: "Face verification",
    application_security: "Application-security monitoring",
    network_telemetry: "Network telemetry",
    ai_assisted_monitoring: "AI-assisted monitoring",
  };
  const requirements = requiredCapabilitiesForPolicy(policy).map((capability) => labels[capability]);

  return requirements.length > 0 ? requirements : ["No monitoring requirements configured."];
}

export function requiredCapabilitiesForPolicy(policy: ExamMonitoringPolicy): PermissionCapability[] {
  return [
    policy.requireCamera ? "camera" : null,
    policy.requireMicrophone ? "microphone" : null,
    policy.requireScreenCapture ? "screen_capture" : null,
    policy.requireIdentityVerification ? "face_verification" : null,
    "application_security",
    "network_telemetry",
    policy.requireLivenessChecks ? "ai_assisted_monitoring" : null,
  ].filter((item): item is PermissionCapability => Boolean(item));
}

function actionForAvailability(examId: string, status: ExamAvailabilityStatus): StudentExamDetailsViewModel["action"] {
  if (status === "ready") {
    return { label: "Prepare for Exam", to: studentExamReadinessRoute(examId), disabled: false };
  }
  if (status === "verification_required") {
    return { label: "Continue Verification", to: studentExamVerificationRoute(examId), disabled: false };
  }
  if (status === "in_progress") {
    return { label: "Resume Exam", to: studentExamSessionRoute(examId), disabled: false };
  }
  if (status === "submitted") {
    return { label: "View Submission", to: studentExamSubmittedRoute(examId), disabled: false };
  }
  if (status === "upcoming") {
    return {
      label: "Prepare for Exam",
      to: studentExamRoute(examId),
      disabled: true,
      explanation: "This exam is not open yet.",
    };
  }
  if (status === "expired") {
    return {
      label: "Prepare for Exam",
      to: studentExamRoute(examId),
      disabled: true,
      explanation: "This exam has expired.",
    };
  }
  if (status === "blocked") {
    return {
      label: "Resume Exam",
      to: studentExamRoute(examId),
      disabled: true,
      explanation: "This attempt is blocked. Contact support before continuing.",
    };
  }
  return {
    label: "Prepare for Exam",
    to: studentExamRoute(examId),
    disabled: true,
    explanation: "This exam is not currently available.",
  };
}

const availabilityLabelByStatus: Record<ExamAvailabilityStatus, string> = {
  upcoming: "Upcoming",
  ready: "Ready to Join",
  verification_required: "Verification Required",
  in_progress: "In Progress",
  submitted: "Submitted",
  unavailable: "Unavailable",
  expired: "Expired",
  blocked: "Blocked",
};
