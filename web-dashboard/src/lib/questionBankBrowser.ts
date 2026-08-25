import type { ExamQuestion, QuestionBankSearchFilters } from "../types";

export function questionBankSourceId(question: ExamQuestion) {
  const sourceId = question.data?.sourceQuestionId;
  return typeof sourceId === "string" && sourceId.trim() ? sourceId.trim() : "";
}

export function questionBankSourceIds(questions: ExamQuestion[]) {
  return new Set(questions.map(questionBankSourceId).filter(Boolean));
}

export function buildTeacherQuestionBankParams(filters: QuestionBankSearchFilters) {
  return {
    classId: filters.classId || undefined,
    subjectId: filters.subjectId || undefined,
    chapterId: filters.chapterId || undefined,
    difficulty: filters.difficulty || undefined,
    questionType: filters.questionType || undefined,
    search: filters.search?.trim() || undefined,
    page: filters.page || 1,
    limit: filters.limit || 10,
  };
}

export function nextFiltersAfterClassChange(filters: QuestionBankSearchFilters, classId: string) {
  return {
    ...filters,
    classId: classId || undefined,
    subjectId: undefined,
    chapterId: undefined,
    page: 1,
  };
}

export function nextFiltersAfterSubjectChange(filters: QuestionBankSearchFilters, subjectId: string) {
  return {
    ...filters,
    subjectId: subjectId || undefined,
    chapterId: undefined,
    page: 1,
  };
}
