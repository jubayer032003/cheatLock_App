import axios from "axios";
import { clearAuth, getAuthToken } from "./auth";
import type {
  LoginResponse,
  ExamTreeCategory,
  ExamTreeNode,
  QuestionBankChapter,
  QuestionBankClass,
  QuestionBankQuestion,
  QuestionBankSubject,
} from "../types";

const PRODUCTION_API_BASE_URL = "https://cheatlock-backend.onrender.com";
const DEVELOPMENT_API_BASE_URL = "http://localhost:3000";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? DEVELOPMENT_API_BASE_URL : PRODUCTION_API_BASE_URL);
const USE_NATIVE_EXAM_TREE_API = import.meta.env.VITE_USE_NATIVE_EXAM_TREE_API !== "false";

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
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers?.["retry-after"];
      const retrySuffix = retryAfter ? ` Try again in about ${retryAfter} seconds.` : "";
      error.message = `Too many requests.${retrySuffix}`;
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

export async function fetchAdminExamTree() {
  if (!USE_NATIVE_EXAM_TREE_API) return fetchLegacyExamTree();
  try {
    const { data } = await api.get<{ tree: ExamTreeCategory[] }>("/question-bank/admin/tree");
    return data.tree;
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
    return fetchLegacyExamTree();
  }
}

async function fetchLegacyExamTree(): Promise<ExamTreeCategory[]> {
  const classes = await fetchAdminQuestionBankClasses();
  return Promise.all(
    classes.map(async (item) => {
      const subjects = await fetchAdminQuestionBankSubjects(item.id).catch(() => []);
      const children = await Promise.all(
        subjects.map(async (subject) => {
          const chapters = await fetchAdminQuestionBankChapters(subject.id).catch(() => []);
          return {
            id: subject.id,
            categoryId: item.id,
            parentId: null,
            name: subject.name,
            slug: subject.slug,
            type: "subject" as const,
            color: "#10b981",
            displayOrder: subject.displayOrder,
            isActive: subject.isActive,
            metadata: { code: subject.code || "" },
            children: chapters.map((chapter) => ({
              id: chapter.id,
              categoryId: item.id,
              parentId: subject.id,
              name: chapter.name,
              slug: chapter.slug,
              type: "chapter" as const,
              color: "#2563eb",
              displayOrder: chapter.displayOrder,
              isActive: chapter.isActive,
              metadata: { chapterNumber: chapter.chapterNumber ?? null },
              children: [],
            })),
          };
        })
      );
      return { ...item, color: item.color || "#2563eb", children };
    })
  );
}

export async function createExamTreeNode(payload: Partial<ExamTreeNode> & { categoryId: string; name: string; type: ExamTreeNode["type"] }) {
  if (!USE_NATIVE_EXAM_TREE_API) return createLegacyExamTreeNode(payload);
  try {
    const { data } = await api.post<{ node: ExamTreeNode }>("/question-bank/admin/nodes", payload);
    return data.node;
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
    return createLegacyExamTreeNode(payload);
  }
}

export async function updateExamTreeNode(nodeId: string, payload: Partial<ExamTreeNode> & { categoryId: string; name: string; type: ExamTreeNode["type"] }) {
  if (!USE_NATIVE_EXAM_TREE_API) return updateLegacyExamTreeNode(nodeId, payload);
  try {
    const { data } = await api.put<{ node: ExamTreeNode }>(`/question-bank/admin/nodes/${nodeId}`, payload);
    return data.node;
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
    return updateLegacyExamTreeNode(nodeId, payload);
  }
}

export async function setExamTreeNodeStatus(nodeId: string, isActive: boolean) {
  if (!USE_NATIVE_EXAM_TREE_API) return setLegacyExamTreeNodeStatus(nodeId, isActive);
  try {
    const { data } = await api.patch<{ node: ExamTreeNode }>(`/question-bank/admin/nodes/${nodeId}/status`, { isActive });
    return data.node;
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
    return setLegacyExamTreeNodeStatus(nodeId, isActive);
  }
}

export async function deleteExamTreeNode(nodeId: string) {
  const { data } = await api.delete<{ deleted: { id: string } }>(`/question-bank/admin/nodes/${nodeId}`);
  return data.deleted;
}

async function createLegacyExamTreeNode(payload: Partial<ExamTreeNode> & { categoryId: string; name: string; type: ExamTreeNode["type"] }): Promise<ExamTreeNode> {
  if (!payload.parentId) {
    const subject = await createQuestionBankSubject({
      classId: payload.categoryId,
      name: payload.name,
      slug: payload.slug,
      code: payload.type,
      displayOrder: payload.displayOrder,
      isActive: payload.isActive,
    });
    return {
      id: subject.id,
      categoryId: payload.categoryId,
      parentId: null,
      name: subject.name,
      slug: subject.slug,
      type: "subject",
      color: "#10b981",
      displayOrder: subject.displayOrder,
      isActive: subject.isActive,
      metadata: { code: subject.code || "" },
      children: [],
    };
  }

  const chapter = await createQuestionBankChapter({
    subjectId: payload.parentId,
    name: payload.name,
    slug: payload.slug,
    displayOrder: payload.displayOrder,
    isActive: payload.isActive,
  });
  return {
    id: chapter.id,
    categoryId: payload.categoryId,
    parentId: payload.parentId,
    name: chapter.name,
    slug: chapter.slug,
    type: payload.type === "topic" ? "topic" : "chapter",
    color: "#2563eb",
    displayOrder: chapter.displayOrder,
    isActive: chapter.isActive,
    metadata: { chapterNumber: chapter.chapterNumber ?? null },
    children: [],
  };
}

async function updateLegacyExamTreeNode(nodeId: string, payload: Partial<ExamTreeNode> & { categoryId: string; name: string; type: ExamTreeNode["type"] }): Promise<ExamTreeNode> {
  if (!payload.parentId) {
    const subject = await updateQuestionBankSubject(nodeId, {
      classId: payload.categoryId,
      name: payload.name,
      slug: payload.slug,
      code: payload.type,
      displayOrder: payload.displayOrder,
      isActive: payload.isActive,
    });
    return {
      id: subject.id,
      categoryId: payload.categoryId,
      parentId: null,
      name: subject.name,
      slug: subject.slug,
      type: "subject",
      color: "#10b981",
      displayOrder: subject.displayOrder,
      isActive: subject.isActive,
      metadata: { code: subject.code || "" },
      children: [],
    };
  }

  const chapter = await updateQuestionBankChapter(nodeId, {
    subjectId: payload.parentId,
    name: payload.name,
    slug: payload.slug,
    displayOrder: payload.displayOrder,
    isActive: payload.isActive,
  });
  return {
    id: chapter.id,
    categoryId: payload.categoryId,
    parentId: payload.parentId,
    name: chapter.name,
    slug: chapter.slug,
    type: payload.type === "topic" ? "topic" : "chapter",
    color: "#2563eb",
    displayOrder: chapter.displayOrder,
    isActive: chapter.isActive,
    metadata: { chapterNumber: chapter.chapterNumber ?? null },
    children: [],
  };
}

async function setLegacyExamTreeNodeStatus(nodeId: string, isActive: boolean): Promise<ExamTreeNode> {
  try {
    const subject = await setQuestionBankSubjectStatus(nodeId, isActive);
    return {
      id: subject.id,
      categoryId: subject.classId,
      parentId: null,
      name: subject.name,
      slug: subject.slug,
      type: "subject",
      color: "#10b981",
      displayOrder: subject.displayOrder,
      isActive: subject.isActive,
      metadata: { code: subject.code || "" },
      children: [],
    };
  } catch (subjectError: any) {
    if (![404, 500].includes(Number(subjectError?.response?.status))) throw subjectError;
    const chapter = await setQuestionBankChapterStatus(nodeId, isActive);
    return {
      id: chapter.id,
      categoryId: chapter.subjectId,
      parentId: chapter.subjectId,
      name: chapter.name,
      slug: chapter.slug,
      type: "chapter",
      color: "#2563eb",
      displayOrder: chapter.displayOrder,
      isActive: chapter.isActive,
      metadata: { chapterNumber: chapter.chapterNumber ?? null },
      children: [],
    };
  }
}

export async function createQuestionBankClass(payload: {
  name: string;
  slug?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const { data } = await api.post<{ class: QuestionBankClass }>("/question-bank/admin/classes", payload);
  return data.class;
}

export async function updateQuestionBankClass(classId: string, payload: {
  name: string;
  slug?: string;
  description?: string;
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

export async function deleteQuestionBankClass(classId: string) {
  const { data } = await api.delete<{ deleted: { id: string } }>(`/question-bank/admin/classes/${classId}`);
  return data.deleted;
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
  description?: string;
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
  description?: string;
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

export async function deleteQuestionBankSubject(subjectId: string) {
  const { data } = await api.delete<{ deleted: { id: string } }>(`/question-bank/admin/subjects/${subjectId}`);
  return data.deleted;
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
  description?: string;
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
  description?: string;
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

export async function deleteQuestionBankChapter(chapterId: string) {
  const { data } = await api.delete<{ deleted: { id: string } }>(`/question-bank/admin/chapters/${chapterId}`);
  return data.deleted;
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

export async function importQuestionBankChapterQuestions(
  chapterId: string,
  questions: Array<{
    questionText: string;
    options: { A: string; B: string; C: string; D: string };
    answer: string;
    difficulty: "easy" | "medium" | "hard";
    marks: number;
    explanation?: string;
    status?: "draft" | "active" | "inactive";
  }>
) {
  const { data } = await api.post<{ importedCount: number }>(
    `/question-bank/admin/chapters/${chapterId}/import`,
    { questions }
  );
  return data;
}

export async function updateQuestionBankQuestion(questionId: string, payload: Partial<QuestionBankQuestion>) {
  const { data } = await api.put<{ question: QuestionBankQuestion }>(`/question-bank/questions/${questionId}`, payload);
  return data.question;
}

export async function setQuestionBankQuestionStatus(questionId: string, status: "draft" | "active" | "inactive") {
  const { data } = await api.patch<{ question: QuestionBankQuestion }>(`/question-bank/questions/${questionId}/status`, { status });
  return data.question;
}

export async function deleteQuestionBankQuestion(questionId: string) {
  const { data } = await api.delete<{ deleted: { id: string } }>(`/question-bank/questions/${questionId}`);
  return data.deleted;
}
