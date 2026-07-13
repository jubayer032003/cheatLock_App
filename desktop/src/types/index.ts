export type UserRole = "STUDENT" | "TEACHER";

export interface User {
  name: string;
  identifier: string;
  role: UserRole;
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
  suspicionScore: number;
  alertMessage: string;
  severity: Severity;
  previewBase64?: string;
}

export interface ClientSettings {
  serverUrl: string;
}
