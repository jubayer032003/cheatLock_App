import {
  AlignJustify,
  Binary,
  Braces,
  CheckSquare,
  Code2,
  FileUp,
  FunctionSquare,
  Image,
  ListChecks,
  ListOrdered,
  Rows3,
  SplitSquareVertical,
  ToggleLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ExamQuestion, QuestionType } from "../../types";

export type QuestionCategory = "Popular" | "Interactive" | "Advanced";
export type CompletionStatus = "complete" | "draft" | "missing";

export type BuilderQuestion = ExamQuestion & {
  id: string;
  type: QuestionType;
  text: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  required: boolean;
  tags: string[];
  data: Record<string, unknown>;
};

export type QuestionTypeDefinition = {
  type: QuestionType;
  label: string;
  shortLabel: string;
  category: QuestionCategory;
  description: string;
  icon: LucideIcon;
  defaultQuestion: () => BuilderQuestion;
};

function id() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function baseQuestion(type: QuestionType, text = ""): BuilderQuestion {
  return {
    id: id(),
    type,
    text,
    options: [],
    correctAnswer: "",
    marks: 1,
    difficulty: "medium",
    subject: "",
    chapter: "",
    estimatedMinutes: 2,
    required: true,
    negativeMarking: 0,
    shuffleOptions: false,
    tags: [],
    teacherNotes: "",
    explanation: "",
    mediaUrl: "",
    data: {},
  };
}

export const questionRegistry: QuestionTypeDefinition[] = [
  {
    type: "MCQ",
    label: "MCQ",
    shortLabel: "MCQ",
    category: "Popular",
    description: "Single correct answer from multiple options.",
    icon: ListChecks,
    defaultQuestion: () => ({ ...baseQuestion("MCQ"), options: ["", ""], data: { optionExplanations: ["", ""] } }),
  },
  {
    type: "MULTI_SELECT",
    label: "Multiple-select MCQ",
    shortLabel: "Multi",
    category: "Popular",
    description: "One or more correct choices.",
    icon: CheckSquare,
    defaultQuestion: () => ({ ...baseQuestion("MULTI_SELECT"), options: ["", ""], data: { correctAnswers: [], optionExplanations: ["", ""] } }),
  },
  {
    type: "CQ",
    label: "Written / CQ",
    shortLabel: "CQ",
    category: "Popular",
    description: "Long-form manual grading question.",
    icon: AlignJustify,
    defaultQuestion: () => ({
      ...baseQuestion("CQ"),
      data: { suggestedAnswer: "", rubric: [{ criterion: "", marks: 1 }], minWords: 0, maxWords: 500, manualGrading: true, sampleAnswer: "" },
    }),
  },
  {
    type: "MATH",
    label: "Math",
    shortLabel: "Math",
    category: "Popular",
    description: "LaTeX, accepted answers, tolerance and units.",
    icon: FunctionSquare,
    defaultQuestion: () => ({ ...baseQuestion("MATH"), data: { latex: "", acceptedAnswers: [""], tolerance: "", unit: "", stepSolution: "", partialMarking: true, autoGrading: false } }),
  },
  {
    type: "CODE",
    label: "Code",
    shortLabel: "Code",
    category: "Popular",
    description: "Programming prompt, starter code and test cases.",
    icon: Code2,
    defaultQuestion: () => ({
      ...baseQuestion("CODE"),
      estimatedMinutes: 10,
      data: { language: "javascript", problemStatement: "", starterCode: "", functionSignature: "", publicTests: [{ input: "", expectedOutput: "" }], hiddenTests: [], timeLimitMs: 2000, memoryLimitMb: 128, gradingMode: "manual", referenceSolution: "" },
    }),
  },
  {
    type: "TRUE_FALSE",
    label: "True / False",
    shortLabel: "T/F",
    category: "Popular",
    description: "Binary answer with optional explanation.",
    icon: ToggleLeft,
    defaultQuestion: () => ({ ...baseQuestion("TRUE_FALSE"), data: { correct: true, studentMustExplain: false } }),
  },
  {
    type: "FILL_BLANK",
    label: "Fill in the blanks",
    shortLabel: "Blanks",
    category: "Interactive",
    description: "Multiple blanks, accepted answers and word bank.",
    icon: Rows3,
    defaultQuestion: () => ({ ...baseQuestion("FILL_BLANK"), data: { blanks: [{ label: "Blank 1", answers: [""] }], caseSensitive: false, wordBank: false, partialMarks: true } }),
  },
  {
    type: "MATCHING",
    label: "Matching",
    shortLabel: "Match",
    category: "Interactive",
    description: "Pair left and right items.",
    icon: SplitSquareVertical,
    defaultQuestion: () => ({ ...baseQuestion("MATCHING"), data: { pairs: [{ left: "", right: "" }, { left: "", right: "" }], shuffle: true, partialMarks: true } }),
  },
  {
    type: "ORDERING",
    label: "Ordering",
    shortLabel: "Order",
    category: "Interactive",
    description: "Arrange items into the correct sequence.",
    icon: ListOrdered,
    defaultQuestion: () => ({ ...baseQuestion("ORDERING"), data: { items: ["", ""], shuffle: true, partialMarks: true } }),
  },
  {
    type: "IMAGE",
    label: "Image-based question",
    shortLabel: "Image",
    category: "Interactive",
    description: "Image, alt text, caption and answer prompt.",
    icon: Image,
    defaultQuestion: () => ({ ...baseQuestion("IMAGE"), data: { imageUrl: "", caption: "", altText: "", answerMode: "written" } }),
  },
  {
    type: "CASE_STUDY",
    label: "Case study",
    shortLabel: "Case",
    category: "Advanced",
    description: "Shared passage with collapsible child questions.",
    icon: Braces,
    defaultQuestion: () => ({ ...baseQuestion("CASE_STUDY"), marks: 5, data: { passage: "", contextImageUrl: "", childQuestions: [{ prompt: "", type: "CQ", marks: 1 }] } }),
  },
  {
    type: "FILE_UPLOAD",
    label: "File upload",
    shortLabel: "File",
    category: "Advanced",
    description: "Student uploads files for manual grading.",
    icon: FileUp,
    defaultQuestion: () => ({ ...baseQuestion("FILE_UPLOAD"), data: { instructions: "", acceptedFileTypes: [".pdf"], maxFileSizeMb: 10, maxFiles: 1, manualGrading: true, rubric: [{ criterion: "", marks: 1 }] } }),
  },
];

export function definitionFor(type: QuestionType | undefined) {
  return questionRegistry.find((item) => item.type === type) || questionRegistry[2];
}

export function fromExamQuestion(question: ExamQuestion, index: number): BuilderQuestion {
  const type = question.type || "CQ";
  const defaults = definitionFor(type).defaultQuestion();
  return {
    ...defaults,
    ...question,
    id: question.id || `legacy_${index}_${Date.now().toString(36)}`,
    type,
    text: question.text || "",
    marks: Number(question.marks || defaults.marks || 1),
    difficulty: question.difficulty || defaults.difficulty,
    required: question.required ?? defaults.required,
    tags: Array.isArray(question.tags) ? question.tags : [],
    data: { ...defaults.data, ...(question.data || {}) },
  };
}

export function toExamQuestion(question: BuilderQuestion): ExamQuestion {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options || [],
    correctAnswer: question.correctAnswer || "",
    marks: question.marks,
    difficulty: question.difficulty,
    subject: question.subject,
    chapter: question.chapter,
    estimatedMinutes: question.estimatedMinutes,
    required: question.required,
    negativeMarking: question.negativeMarking,
    shuffleOptions: question.shuffleOptions,
    tags: question.tags,
    teacherNotes: question.teacherNotes,
    explanation: question.explanation,
    mediaUrl: question.mediaUrl,
    data: question.data,
  };
}

export function duplicateQuestion(question: BuilderQuestion): BuilderQuestion {
  return { ...question, id: id(), text: `${question.text || definitionFor(question.type).label} copy` };
}

export function validateQuestion(question: BuilderQuestion) {
  const errors: Record<string, string> = {};
  if (!question.text.trim()) errors.text = "Question prompt is required.";
  if (question.marks <= 0) errors.marks = "Marks must be greater than zero.";
  const options = (question.options || []).map((option) => option.trim()).filter(Boolean);
  if (question.type === "MCQ") {
    if (options.length < 2) errors.options = "MCQ needs at least two options.";
    if (!question.correctAnswer) errors.correctAnswer = "Select one correct answer.";
  }
  if (question.type === "MULTI_SELECT") {
    const correctAnswers = getStringArray(question.data.correctAnswers);
    if (options.length < 2) errors.options = "Multiple-select questions need at least two options.";
    if (correctAnswers.length === 0) errors.correctAnswer = "Select at least one correct answer.";
  }
  if (question.type === "MATH" && question.data.autoGrading && getStringArray(question.data.acceptedAnswers).filter(Boolean).length === 0) {
    errors.acceptedAnswers = "Add at least one accepted answer for auto-grading.";
  }
  if (question.type === "CODE") {
    if (!String(question.data.language || "").trim()) errors.language = "Choose a programming language.";
    if (question.data.gradingMode === "automatic" && getRecords(question.data.publicTests).length === 0) errors.publicTests = "Automatic grading needs at least one public test.";
  }
  if (question.type === "MATCHING" && getRecords(question.data.pairs).length < 2) errors.pairs = "Matching needs at least two pairs.";
  if (question.type === "ORDERING" && getStringArray(question.data.items).filter(Boolean).length < 2) errors.items = "Ordering needs at least two items.";
  if (question.type === "CASE_STUDY" && getRecords(question.data.childQuestions).length === 0) errors.childQuestions = "Case studies need at least one child question.";
  if (question.type === "FILE_UPLOAD" && getStringArray(question.data.acceptedFileTypes).filter(Boolean).length === 0) errors.acceptedFileTypes = "Add at least one accepted file type.";
  return errors;
}

export function completionStatus(question: BuilderQuestion): CompletionStatus {
  const errors = validateQuestion(question);
  if (Object.keys(errors).length > 0) return question.text.trim() ? "missing" : "draft";
  return "complete";
}

export function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")) : [];
}

export function getRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)) : [];
}
