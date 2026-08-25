import type { QuestionBankOption, QuestionBankQuestion } from "../types";

export type QuestionForm = {
  id?: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  questionText: string;
  difficulty: "easy" | "medium" | "hard";
  marks: string;
  explanation: string;
  status: "draft" | "active" | "inactive";
  options: Array<{ text: string; isCorrect: boolean }>;
};

export const emptyQuestionForm: QuestionForm = {
  classId: "",
  subjectId: "",
  chapterId: "",
  questionText: "",
  difficulty: "medium",
  marks: "1",
  explanation: "",
  status: "draft",
  options: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ],
};

export function nextQuestionFormAfterClassChange(form: QuestionForm, classId: string): QuestionForm {
  return { ...form, classId, subjectId: "", chapterId: "" };
}

export function nextQuestionFormAfterSubjectChange(form: QuestionForm, subjectId: string): QuestionForm {
  return { ...form, subjectId, chapterId: "" };
}

export function validateQuestionForm(form: QuestionForm) {
  if (!form.classId) return "Class is required.";
  if (!form.subjectId) return "Subject is required.";
  if (!form.questionText.trim()) return "Question text is required.";
  if (!Number.isFinite(Number(form.marks)) || Number(form.marks) <= 0) return "Marks must be greater than zero.";
  const validOptions = form.options.filter((option) => option.text.trim());
  if (validOptions.length < 2) return "At least two options are required.";
  if (form.options.filter((option) => option.isCorrect && option.text.trim()).length !== 1) return "Choose exactly one correct answer.";
  return "";
}

export function normalizeQuestionOptions(options: QuestionBankOption[]) {
  const normalized = options.map((option) => ({ text: option.text, isCorrect: Boolean(option.isCorrect) }));
  while (normalized.length < 2) normalized.push({ text: "", isCorrect: normalized.length === 0 });
  return normalized;
}

export function buildQuestionPayload(form: QuestionForm): Partial<QuestionBankQuestion> {
  return {
    classId: form.classId,
    subjectId: form.subjectId,
    chapterId: form.chapterId || undefined,
    questionType: "mcq",
    questionText: form.questionText.trim(),
    difficulty: form.difficulty,
    marks: Number(form.marks),
    explanation: form.explanation.trim() || undefined,
    status: form.status,
    options: form.options.map((option, index) => ({
      text: option.text.trim(),
      isCorrect: option.isCorrect,
      displayOrder: index,
    })),
  };
}
