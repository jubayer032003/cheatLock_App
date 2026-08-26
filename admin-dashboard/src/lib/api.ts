import axios from "axios";
import { clearAuth, getAuthToken } from "./auth";
import type {
  LoginResponse,
  QuestionBankChapter,
  QuestionBankClass,
  QuestionBankQuestion,
  QuestionBankSubject,
} from "../types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://cheatlock-backend.onrender.com";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export async function loginAdmin(identifier: string, password: string, role: string) {
  const { data } = await api.post<LoginResponse>("/auth/admin-login", {
    identifier: identifier.trim(),
    password,
    role,
  });
  return data;
}

export async function fetchAdminQuestionBankClasses() {
  const { data } = await api.get<{ classes: QuestionBankClass[] }>("/question-bank/admin/classes");
  return data.classes;
}

export async function createQuestionBankClass(payload: {
  name: string;
  slug?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.post<{ class: QuestionBankClass }>("/question-bank/admin/classes", payload);
  return data.class;
}

export async function updateQuestionBankClass(classId: string, payload: {
  name: string;
  slug?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.put<{ class: QuestionBankClass }>(`/question-bank/admin/classes/${classId}`, payload);
  return data.class;
}

export async function setQuestionBankClassStatus(classId: string, isActive: boolean) {
  const { data } = await api.patch<{ class: QuestionBankClass }>(`/question-bank/admin/classes/${classId}/status`, { isActive });
  return data.class;
}

export async function fetchAdminQuestionBankSubjects(classId: string) {
  const { data } = await api.get<{ subjects: QuestionBankSubject[] }>(`/question-bank/admin/classes/${classId}/subjects`);
  return data.subjects;
}

export async function createQuestionBankSubject(payload: {
  classId: string;
  name: string;
  slug?: string;
  code?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.post<{ subject: QuestionBankSubject }>("/question-bank/admin/subjects", payload);
  return data.subject;
}

export async function updateQuestionBankSubject(subjectId: string, payload: {
  classId: string;
  name: string;
  slug?: string;
  code?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.put<{ subject: QuestionBankSubject }>(`/question-bank/admin/subjects/${subjectId}`, payload);
  return data.subject;
}

export async function setQuestionBankSubjectStatus(subjectId: string, isActive: boolean) {
  const { data } = await api.patch<{ subject: QuestionBankSubject }>(`/question-bank/admin/subjects/${subjectId}/status`, { isActive });
  return data.subject;
}

export async function fetchAdminQuestionBankChapters(subjectId: string) {
  const { data } = await api.get<{ chapters: QuestionBankChapter[] }>(`/question-bank/admin/subjects/${subjectId}/chapters`);
  return data.chapters;
}

export async function createQuestionBankChapter(payload: {
  subjectId: string;
  name: string;
  slug?: string;
  chapterNumber?: number | null;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.post<{ chapter: QuestionBankChapter }>("/question-bank/admin/chapters", payload);
  return data.chapter;
}

export async function updateQuestionBankChapter(chapterId: string, payload: {
  subjectId: string;
  name: string;
  slug?: string;
  chapterNumber?: number | null;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.put<{ chapter: QuestionBankChapter }>(`/question-bank/admin/chapters/${chapterId}`, payload);
  return data.chapter;
}

export async function setQuestionBankChapterStatus(chapterId: string, isActive: boolean) {
  const { data } = await api.patch<{ chapter: QuestionBankChapter }>(`/question-bank/admin/chapters/${chapterId}/status`, { isActive });
  return data.chapter;
}

export async function fetchQuestionBankQuestions(params: Record<string, string | number | undefined>) {
  const { data } = await api.get<{ questions: QuestionBankQuestion[]; page: number; limit: number; total: number }>("/question-bank/questions", { params });
  return data;
}

export async function fetchQuestionBankQuestion(questionId: string) {
  const { data } = await api.get<{ question: QuestionBankQuestion }>(`/question-bank/questions/${questionId}`);
  return data.question;
}

export async function createQuestionBankQuestion(payload: Partial<QuestionBankQuestion>) {
  const { data } = await api.post<{ question: QuestionBankQuestion }>("/question-bank/questions", payload);
  return data.question;
}

export async function updateQuestionBankQuestion(questionId: string, payload: Partial<QuestionBankQuestion>) {
  const { data } = await api.put<{ question: QuestionBankQuestion }>(`/question-bank/questions/${questionId}`, payload);
  return data.question;
}

export async function setQuestionBankQuestionStatus(questionId: string, status: "draft" | "active" | "inactive") {
  const { data } = await api.patch<{ question: QuestionBankQuestion }>(`/question-bank/questions/${questionId}/status`, { status });
  return data.question;
}
