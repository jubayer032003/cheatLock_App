export type UserRole =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "TEACHER"
  | "PROCTOR"
  | "STUDENT"
  | "OBSERVER"
  | "AUDITOR";
export type QuestionType =
  | "MCQ"
  | "MULTI_SELECT"
  | "CQ"
  | "MATH"
  | "CODE"
  | "TRUE_FALSE"
  | "FILL_BLANK"
  | "MATCHING"
  | "ORDERING"
  | "CASE_STUDY"
  | "FILE_UPLOAD"
  | "IMAGE";
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

export interface QuestionBankClass {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
}

export interface QuestionBankSubject {
  id: string;
  classId: string;
  name: string;
  slug: string;
  code?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface QuestionBankChapter {
  id: string;
  subjectId: string;
  name: string;
  slug: string;
  chapterNumber?: number | null;
  displayOrder: number;
  isActive: boolean;
}

export interface QuestionBankOption {
  id?: string;
  text: string;
  displayOrder?: number;
  isCorrect?: boolean;
}

export interface QuestionBankQuestion {
  id: string;
  classId: string;
  subjectId: string;
  chapterId?: string | null;
  questionType: "mcq" | "true_false" | "short_answer";
  questionText: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  explanation?: string;
  source?: string;
  status: "draft" | "active" | "inactive";
  options: QuestionBankOption[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QuestionBankSearchResult {
  questions: QuestionBankQuestion[];
  page: number;
  limit: number;
  total: number;
}

export interface QuestionBankSearchFilters {
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  difficulty?: "easy" | "medium" | "hard";
  questionType?: "mcq" | "true_false" | "short_answer";
  search?: string;
  page?: number;
  limit?: number;
}

export interface ExamQuestion {
  id?: string;
  type?: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: string;
  marks?: number;
  difficulty?: "easy" | "medium" | "hard";
  subject?: string;
  chapter?: string;
  estimatedMinutes?: number;
  required?: boolean;
  negativeMarking?: number;
  shuffleOptions?: boolean;
  tags?: string[];
  teacherNotes?: string;
  explanation?: string;
  mediaUrl?: string;
  data?: Record<string, unknown>;
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
  sessionId?: string;
  studentId: string;
  studentName: string;
  rollId: string;
  status: StudentStatus;
  suspicionScore: number;
  eventId?: string;
  mutationId?: string;
  scoreDelta?: number;
  scoreMetrics?: ScoreMetrics;
  latestAlert: string;
  onlineStatus: OnlineStatus;
  previewUrl?: string;
  previewBase64?: string;
  screenPreviewUrl?: string;
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

export interface ScoreMetrics {
  rawScore: number;
  maximumScore: number;
  percentage: number;
  trustScore: number;
  suspiciousActivityCount: number;
  capturedFrameCount: number;
  processedFrameCount: number;
  updatedAt: string;
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
  | "screen_telemetry_uploaded"
  | "student_heartbeat";

export interface ProctoringTestEventRequest {
  eventName: ProctoringTestEventName;
  studentId: string;
  studentName?: string;
  suspicionScore?: number;
  scoreDelta?: number;
  totalSuspicionScore?: number;
  ruleId?: string;
  occurredAt?: string;
  evidenceReference?: string;
  mutationId?: string;
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
  scoreMetrics?: ScoreMetrics;
  scoreDelta?: number;
  totalSuspicionScore?: number;
  ruleId?: string;
  occurredAt?: string;
  evidenceReference?: string;
  severity: ReplaySeverity;
  previewUrl?: string;
  previewBase64?: string;
  confidence?: number | null;
  evidenceId?: string;
  evidenceIds?: string[];
  sequenceNumber?: number;
  sessionId?: string;
  captureTiming?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
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
  scoreMetrics?: ScoreMetrics;
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
  evidenceSamples?: Array<{
    id: string;
    eventType: string;
    captureKind?: "camera" | "screen";
    captureLabel?: string;
    severity: ReplaySeverity;
    alertMessage: string;
    suspicionScore: number;
    capturedAt: string;
    imageUrl?: string;
    inlineImage?: string;
  }>;
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
    highRiskCount?: number;
    suspiciousAlertsTotal?: number;
    averageSuspicionScore?: number;
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
