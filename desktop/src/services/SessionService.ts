import { apiClient } from "../api/client";
import { Exam, ExamSession, ExamSubmission } from "../types";

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

  public static async lockSession(examId: string, reason: string): Promise<ExamSession> {
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/lock", {
        examId,
        reason,
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
}
