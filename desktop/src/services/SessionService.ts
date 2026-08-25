import { apiClient } from "../api/client";
import { Exam, ExamSession, ExamSubmission, StudentNotification } from "../types";

export class SessionService {
  public static async getAssignedExam(): Promise<Exam> {
    try {
      const { data } = await apiClient.get<{ exam: Exam }>("/exams/assigned");
      return data.exam;
    } catch (error: any) {
      const message = error.response?.data?.message || "No active exams are assigned to you.";
      throw new Error(message);
    }
  }

  public static async getAssignedExamById(examId: string): Promise<Exam> {
    try {
      const { data } = await apiClient.get<{ exam: Exam }>("/exams/assigned");
      if (data.exam?.id !== examId) {
        const error: Error & { status?: number } = new Error("Exam not found for this student account.");
        error.status = 404;
        throw error;
      }
      return data.exam;
    } catch (error: any) {
      if (error.status) {
        throw error;
      }
      const message = error.response?.data?.message || "Failed to retrieve exam details.";
      const wrapped: Error & { status?: number; details?: unknown } = new Error(message);
      wrapped.status = error.response?.status;
      wrapped.details = error.response?.data;
      throw wrapped;
    }
  }

  public static async getExamByCode(code: string): Promise<Exam> {
    try {
      const { data } = await apiClient.get<{ exam: Exam }>(`/exams/access/${code}`);
      return data.exam;
    } catch (error: any) {
      const message = error.response?.data?.message || "Invalid exam access code.";
      throw new Error(message);
    }
  }

  public static async getActiveSession(examId?: string): Promise<ExamSession> {
    try {
      const url = examId ? `/sessions/me?examId=${examId}` : "/sessions/me";
      const { data } = await apiClient.get<{ session: ExamSession }>(url);
      return data.session;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to retrieve student exam session status.";
      throw new Error(message);
    }
  }

  public static async startSession(examId: string, deviceId: string): Promise<ExamSession> {
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/start", {
        examId,
        deviceId,
      });
      return data.session;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to initiate exam session.";
      throw new Error(message);
    }
  }

  public static async submitSession(examId: string): Promise<ExamSession> {
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/submit", {
        examId,
      });
      return data.session;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to submit exam session.";
      throw new Error(message);
    }
  }

  public static async lockSession(examId: string, reason: string, suspicionScore?: number): Promise<ExamSession> {
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/lock", {
        examId,
        reason,
        suspicionScore,
      });
      return data.session;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to lock exam session.";
      throw new Error(message);
    }
  }

  public static async saveSubmission(submission: ExamSubmission): Promise<void> {
    try {
      await apiClient.post("/submissions", submission);
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to save exam paper submission.";
      throw new Error(message);
    }
  }

  public static async saveWarnings(warnings: Omit<ExamSubmission, "answers">): Promise<void> {
    try {
      await apiClient.post("/submissions/warnings", warnings);
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to save proctoring warnings.";
      throw new Error(message);
    }
  }

  public static async saveAnswerDraftRevision(payload: {
    examId: string;
    attemptId: string;
    deviceId: string;
    revision: number;
    answers: Record<number, string>;
    currentIndex: number;
    markedQuestions: number[];
  }): Promise<{ revision: number; serverTime?: string; sessionStatus?: string }> {
    try {
      const { data } = await apiClient.patch<{
        revision: number;
        serverTime?: string;
        sessionStatus?: string;
      }>("/sessions/answers", payload);
      return data;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to synchronize answers.";
      const wrapped: Error & { status?: number; code?: string; currentRevision?: number } = new Error(message);
      wrapped.status = error.response?.status;
      wrapped.code = error.response?.data?.code;
      wrapped.currentRevision = error.response?.data?.currentRevision;
      throw wrapped;
    }
  }

  public static async getStudentNotifications(studentId: string, pending = false): Promise<StudentNotification[]> {
    try {
      const { data } = await apiClient.get<{ notifications: StudentNotification[] }>(
        `/students/${encodeURIComponent(studentId)}/notifications${pending ? "?pending=true" : ""}`
      );
      return data.notifications;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to retrieve student notifications.";
      throw new Error(message);
    }
  }

  public static async markNotificationRead(studentId: string, notificationId: string): Promise<StudentNotification> {
    try {
      const { data } = await apiClient.patch<{ notification: StudentNotification }>(
        `/students/${encodeURIComponent(studentId)}/notifications/${notificationId}/read`
      );
      return data.notification;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to mark notification as read.";
      throw new Error(message);
    }
  }

  public static async getTeacherExams(): Promise<Exam[]> {
    try {
      const { data } = await apiClient.get<{ exams: Exam[] }>("/exams");
      return data.exams;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to retrieve teacher exams.";
      throw new Error(message);
    }
  }

  public static async createTeacherExam(payload: {
    title: string;
    durationMinutes: number;
    assignedStudents: string[];
    questions: { type: "CQ"; text: string; options: string[]; correctAnswer: string }[];
  }): Promise<Exam> {
    try {
      const { data } = await apiClient.post<{ exam: Exam }>("/exams", {
        ...payload,
        lockAnswers: true,
      });
      return data.exam;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to create exam.";
      throw new Error(message);
    }
  }

  public static async updateTeacherExamLifecycle(
    examId: string,
    action: "START" | "END" | "ARCHIVE" | "DRAFT"
  ): Promise<Exam> {
    try {
      const { data } = await apiClient.patch<{ exam: Exam }>(`/exams/${examId}/lifecycle`, { action });
      return data.exam;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to update exam lifecycle.";
      throw new Error(message);
    }
  }
}
