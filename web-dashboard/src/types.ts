export type UserRole = "STUDENT" | "TEACHER";
export type QuestionType = "MCQ" | "CQ";
export type StudentStatus = "SAFE" | "WARNING" | "SUSPICIOUS";
export type OnlineStatus = "ONLINE" | "OFFLINE";
export type ExamStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "ARCHIVED";

export interface AuthUser {
  name: string;
  identifier: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ExamQuestion {
  type?: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: string;
}

export interface Exam {
  id?: string;
  title: string;
  durationMinutes: number;
  lockAnswers: boolean;
  status?: ExamStatus;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  archivedAt?: string | null;
  questions: ExamQuestion[];
  assignedStudents: string[];
  communityStudents?: string[];
  classIds?: string[];
  accessCode?: string;
  accessLink?: string;
  useCommunity?: boolean;
}

export interface ExamsResponse {
  exams: Exam[];
}

export interface TeacherCommunity {
  teacherId: string;
  students: string[];
}

export interface CommunityResponse {
  community: TeacherCommunity;
}

export interface TeacherClass {
  id: string;
  teacherId: string;
  name: string;
  section: string;
  subject: string;
  students: string[];
  inviteCode: string;
  enrollmentRequests: EnrollmentRequest[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EnrollmentRequest {
  studentId: string;
  studentName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt?: string | null;
  decidedAt?: string | null;
}

export interface ClassesResponse {
  classes: TeacherClass[];
}

export type ExamSessionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "LOCKED"
  | "RESET_BY_TEACHER";

export interface ExamSession {
  studentId: string;
  studentName?: string;
  examId?: string;
  status: ExamSessionStatus;
  startedAt?: number;
  submittedAt?: number;
  lockedAt?: number;
  resetAt?: number;
  resetBy?: string;
  lockReason?: string;
  suspicionScore?: number;
  latestAlert?: string;
  onlineStatus?: OnlineStatus;
}

export interface SessionsResponse {
  sessions: ExamSession[];
}

export interface StudentAnswer {
  questionText: string;
  answerText: string;
}

export interface ExamSubmission {
  examId?: string;
  studentId: string;
  studentName?: string;
  answers: StudentAnswer[];
  appSwitchWarnings: number;
  faceMissingWarnings: number;
  totalWarnings: number;
  riskLevel: string;
  submittedAt: number | string;
  grade?: number | null;
  feedback?: string;
  gradedAt?: number | string | null;
}

export interface SubmissionsResponse {
  submissions: ExamSubmission[];
}

export interface ExamAttendanceStudent {
  studentId: string;
  studentName?: string;
  sessionStatus: ExamSessionStatus | string;
  onlineStatus?: OnlineStatus;
  attended: boolean;
  submitted: boolean;
  grade?: number | null;
  feedback?: string;
  gradedAt?: number | string | null;
  submittedAt?: number | string | null;
  totalWarnings?: number;
  riskLevel?: string;
}

export interface ExamAttendanceOverview {
  exam: {
    id: string;
    title: string;
    accessCode?: string;
    status?: string;
  };
  summary: {
    totalAssigned: number;
    attended: number;
    submitted: number;
    graded: number;
  };
  students: ExamAttendanceStudent[];
}

export interface LiveStudent {
  studentId: string;
  studentName: string;
  rollId: string;
  status: StudentStatus;
  suspicionScore: number;
  latestAlert: string;
  onlineStatus: OnlineStatus;
  previewUrl?: string;
  previewBase64?: string;
  lastUpdatedAt?: number | string | null;
  lastSeenAt?: number | string | null;
  screenBase64?: string;
  lastScreenUpdatedAt?: number;
  faceStatus?: string;
  audioStatus?: string;
  timeRemaining?: number;
  focusStatus?: string;
  clipboardStatus?: string;
  multiMonitorStatus?: string;
  violationsList?: Array<{ type: string; message: string; timestamp: number }>;
}

export interface LiveStudentListEvent {
  examId: string;
  students: LiveStudent[];
}

export type ProctoringTestEventName =
  | "student_joined_exam"
  | "student_left_exam"
  | "suspicion_score_updated"
  | "ai_alert_created"
  | "camera_preview_updated"
  | "screen_telemetry_uploaded";

export interface ProctoringTestEventRequest {
  eventName: ProctoringTestEventName;
  studentId: string;
  studentName?: string;
  suspicionScore?: number;
  latestAlert?: string;
  previewUrl?: string;
  previewBase64?: string;
}

export interface LiveProctoringResponse {
  exam: {
    id: string;
    title: string;
  };
  activeStudents: LiveStudent[];
}

export type ReplaySeverity = "low" | "medium" | "high";

export interface TimelineEvent {
  id: string;
  eventType: ProctoringTestEventName;
  timestamp: string;
  alertMessage: string;
  suspicionScore: number;
  severity: ReplaySeverity;
  previewUrl?: string;
  previewBase64?: string;
}

export interface ProctoringTimelineResponse {
  exam: {
    id: string;
    title: string;
  };
  student: {
    studentId: string;
    studentName: string;
    onlineStatus: OnlineStatus;
    status: ExamSessionStatus;
  };
  finalSuspicionScore: number;
  review?: {
    decision: IntegrityDecision;
    notes: string;
    bookmarks: string[];
    reviewedEvents: string[];
  } | null;
  timelineEvents: TimelineEvent[];
}

export type IntegrityDecision = "PENDING" | "CLEAN" | "REVIEW_NEEDED" | "DISQUALIFIED";
export type IntegrityRiskLevel = "SAFE" | "WARNING" | "SUSPICIOUS";

export interface IntegrityBreakdown {
  faceMissingCount: number;
  appSwitchCount: number;
  suspiciousAlertCount: number;
  highSeverityCount: number;
  previewEventCount: number;
  offlineEventCount: number;
  wasLocked: boolean;
}

export interface IntegrityReview {
  decision: IntegrityDecision;
  notes: string;
  reviewedBy?: string;
  reviewedAt?: string | null;
}

export interface IntegrityStudentReport {
  studentId: string;
  studentName: string;
  status: ExamSessionStatus;
  onlineStatus: OnlineStatus;
  finalRiskScore: number;
  riskLevel: IntegrityRiskLevel;
  recommendation: "CLEAN_RECOMMENDED" | "REVIEW_RECOMMENDED" | "DISQUALIFY_RECOMMENDED";
  latestAlert: string;
  lastUpdatedAt?: string | null;
  breakdown: IntegrityBreakdown;
  review: IntegrityReview;
}

export interface IntegrityReportResponse {
  exam: {
    id: string;
    title: string;
    durationMinutes: number;
    accessCode?: string;
  };
  summary: {
    totalStudents: number;
    safeStudents: number;
    warningStudents: number;
    suspiciousStudents: number;
    highestRiskMoments: Array<{
      studentId: string;
      studentName: string;
      score: number;
      alert: string;
    }>;
  };
  students: IntegrityStudentReport[];
  generatedAt: string;
}
