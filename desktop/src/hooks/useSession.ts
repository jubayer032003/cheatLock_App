import { useState } from "react";
import { apiClient } from "../api/client";
import { Exam, ExamSession, ExamSubmission } from "../types";

export function useSession() {
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [sessionState, setSessionState] = useState<ExamSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignedExam = async (): Promise<Exam> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{ exam: Exam }>("/exams/assigned");
      setActiveExam(data.exam);
      setIsLoading(false);
      return data.exam;
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to load assigned exam.";
      setError(msg);
      setIsLoading(false);
      throw new Error(msg);
    }
  };

  const joinExamByCode = async (code: string): Promise<Exam> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{ exam: Exam }>(`/exams/access/${code}`);
      setActiveExam(data.exam);
      setIsLoading(false);
      return data.exam;
    } catch (err: any) {
      const msg = err.response?.data?.message || "Invalid access code.";
      setError(msg);
      setIsLoading(false);
      throw new Error(msg);
    }
  };

  const startSession = async (examId: string, deviceId: string): Promise<ExamSession> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/start", {
        examId,
        deviceId,
      });
      setSessionState(data.session);
      setIsLoading(false);
      return data.session;
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to start exam session.";
      setError(msg);
      setIsLoading(false);
      throw new Error(msg);
    }
  };

  const sendTelemetryEvent = async (
    examId: string,
    eventName: string,
    alertMessage?: string,
    suspicionScore?: number,
    previewBase64?: string
  ) => {
    try {
      await apiClient.post("/proctoring/events", {
        eventName,
        examId,
        latestAlert: alertMessage,
        suspicionScore,
        previewBase64,
      });
    } catch (err) {
      console.error("[Telemetry] Failed to post proctoring event:", err);
    }
  };

  const lockSession = async (examId: string, reason: string): Promise<ExamSession> => {
    setIsLoading(true);
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/lock", {
        examId,
        reason,
      });
      setSessionState(data.session);
      setIsLoading(false);
      return data.session;
    } catch (err: any) {
      setIsLoading(false);
      throw err;
    }
  };

  const submitSession = async (examId: string): Promise<ExamSession> => {
    setIsLoading(true);
    try {
      const { data } = await apiClient.post<{ session: ExamSession }>("/sessions/submit", {
        examId,
      });
      setSessionState(data.session);
      setIsLoading(false);
      return data.session;
    } catch (err: any) {
      setIsLoading(false);
      throw err;
    }
  };

  const saveSubmission = async (submission: ExamSubmission) => {
    setIsLoading(true);
    try {
      await apiClient.post("/submissions", submission);
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      throw err;
    }
  };

  return {
    activeExam,
    sessionState,
    isLoading,
    error,
    fetchAssignedExam,
    joinExamByCode,
    startSession,
    sendTelemetryEvent,
    lockSession,
    submitSession,
    saveSubmission,
    setActiveExam,
  };
}
