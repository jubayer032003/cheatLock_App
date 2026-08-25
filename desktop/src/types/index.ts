export type UserRole =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "TEACHER"
  | "PROCTOR"
  | "STUDENT"
  | "OBSERVER"
  | "AUDITOR";

export interface User {
  name: string;
  identifier: string;
  role: UserRole;
  institutionName?: string;
  faceProfile?: {
    descriptor: number[];
    previewBase64: string;
    updatedAt: string | null;
  };
}

export type QuestionType = "MCQ" | "CQ";

export interface ExamQuestion {
  type: QuestionType;
  text: string;
  options: string[];
  correctAnswer?: string;
}

export type ExamStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "ARCHIVED";

export interface Exam {
  id: string;
  title: string;
  durationMinutes: number;
  lockAnswers: boolean;
  status: ExamStatus;
  questions: ExamQuestion[];
  accessCode: string;
  accessLink: string;
  createdBy: string;
  assignedStudents?: string[];
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}

export type StudentNotificationType =
  | "EXAM_CREATED"
  | "EXAM_LIVE"
  | "EXAM_ASSIGNED"
  | "GRADE_ASSIGNED";

export interface StudentNotification {
  id: string;
  studentId: string;
  examId: string;
  type: StudentNotificationType;
  payload: {
    title?: string;
    accessCode?: string;
    message?: string;
    grade?: string | number;
    feedback?: string;
    [key: string]: unknown;
  };
  notified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "LOCKED"
  | "RESET_BY_TEACHER";

export type OnlineStatus = "ONLINE" | "OFFLINE";

export interface ExamSession {
  studentId: string;
  studentName: string;
  examId?: string;
  status: SessionStatus;
  startedAt?: number;
  submittedAt?: number;
  lockedAt?: number;
  deviceId: string;
  suspicionScore: number;
  latestAlert: string;
  onlineStatus: OnlineStatus;
  previewBase64?: string;
  lastSeenAt?: number;
}

export interface StudentAnswer {
  questionIndex: number;
  questionText: string;
  answerText: string;
}

export interface ExamSubmission {
  examId: string;
  studentId: string;
  answers: StudentAnswer[];
  appSwitchWarnings: number;
  faceMissingWarnings: number;
  audioWarnings: number;
  phoneWarnings: number;
  totalWarnings: number;
  riskLevel: "Low Risk" | "Medium Risk" | "High Risk";
  submittedAt: number;
}

export type Severity = "low" | "medium" | "high";

export interface ProctoringEvent {
  examId: string;
  studentId: string;
  studentName: string;
  eventType: string;
  scoreDelta?: number;
  totalSuspicionScore?: number;
  suspicionScore: number;
  alertMessage: string;
  severity: Severity;
  ruleId?: string;
  occurredAt?: string;
  evidenceReference?: string;
  previewBase64?: string;
}

export interface ClientSettings {
  serverUrl: string;
}

export type {
  ApiErrorCode,
  ApiErrorResult,
  AttemptStatus,
  ConsentStatus,
  DeviceReadinessReport,
  ExamPreparationConsentRecord,
  ExamPreparationPermissionStatus,
  ExamPreparationReadinessReport,
  ExamPreparationState,
  ExamAvailabilityStatus,
  ExamMonitoringPolicy,
  IdentityVerificationStatus,
  IdentityVerificationCode,
  IdentityVerificationMethod,
  IdentityVerificationResultRecord,
  ExamMonitorErrorCode,
  ExamMonitorName,
  MonitoringStartupStatus,
  MonitoringStatus,
  MonitorState,
  MonitorStatus,
  HealthCheckResult,
  NetworkProbeErrorCode,
  NetworkProbeResult,
  PermissionCapability,
  PermissionCapabilityStatus,
  ReadinessCheckId,
  ReadinessCheckResult,
  ReadinessCheckState,
  ReadinessErrorCode,
  ReadinessReportStatus,
  ReadinessStatus,
  RouteAuthState,
  StudentExamRouteParams,
  SuspicionEvent,
  SubmissionStatus,
} from "./examDomain";
