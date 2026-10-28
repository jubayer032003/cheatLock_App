export type UserRole =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "TEACHER"
  | "PROCTOR"
  | "STUDENT"
  | "OBSERVER"
  | "AUDITOR";

export interface AuthUser {
  name: string;
  identifier: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface QuestionBankClass {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ExamTreeNode {
  id: string;
  categoryId: string;
  parentId?: string | null;
  name: string;
  slug: string;
  type: "level" | "class" | "group" | "admission_type" | "unit" | "subject" | "chapter" | "topic";
  icon?: string;
  color?: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  children?: ExamTreeNode[];
}

export interface ExamTreeCategory extends QuestionBankClass {
  children: ExamTreeNode[];
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
  nodeId?: string;
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
