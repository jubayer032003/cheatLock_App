import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuestionPayload,
  emptyQuestionForm,
  nextQuestionFormAfterClassChange,
  nextQuestionFormAfterSubjectChange,
  validateQuestionForm,
} from "./questionForm.ts";

test("class changes clear dependent subject and chapter selections", () => {
  const form = { ...emptyQuestionForm, classId: "class-a", subjectId: "subject-a", chapterId: "chapter-a" };
  assert.deepEqual(nextQuestionFormAfterClassChange(form, "class-b"), {
    ...form,
    classId: "class-b",
    subjectId: "",
    chapterId: "",
  });
});

test("subject changes clear dependent chapter selection", () => {
  const form = { ...emptyQuestionForm, classId: "class-a", subjectId: "subject-a", chapterId: "chapter-a" };
  assert.deepEqual(nextQuestionFormAfterSubjectChange(form, "subject-b"), {
    ...form,
    subjectId: "subject-b",
    chapterId: "",
  });
});

test("MCQ validation requires hierarchy, prompt, marks, options, and one correct answer", () => {
  assert.equal(validateQuestionForm(emptyQuestionForm), "Class is required.");

  const validBase = {
    ...emptyQuestionForm,
    classId: "class-9",
    subjectId: "math",
    questionText: "What is 2 + 2?",
    options: [
      { text: "3", isCorrect: false },
      { text: "4", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };

  assert.equal(validateQuestionForm({ ...validBase, marks: "0" }), "Marks must be greater than zero.");
  assert.equal(validateQuestionForm({ ...validBase, options: [{ text: "4", isCorrect: true }] }), "At least two options are required.");
  assert.equal(validateQuestionForm({ ...validBase, options: validBase.options.map((option) => ({ ...option, isCorrect: false })) }), "Choose exactly one correct answer.");
  assert.equal(validateQuestionForm(validBase), "");
});

test("save request shape matches backend question-bank payload", () => {
  const payload = buildQuestionPayload({
    ...emptyQuestionForm,
    classId: "class-9",
    subjectId: "math",
    chapterId: "algebra",
    questionText: "  Solve x + 1 = 3.  ",
    difficulty: "easy",
    marks: "2",
    explanation: "x is 2",
    status: "active",
    options: [
      { text: "1", isCorrect: false },
      { text: "2", isCorrect: true },
      { text: "3", isCorrect: false },
      { text: "4", isCorrect: false },
    ],
  });

  assert.equal(payload.questionType, "mcq");
  assert.equal(payload.questionText, "Solve x + 1 = 3.");
  assert.equal(payload.marks, 2);
  assert.equal(payload.status, "active");
  assert.equal(payload.options?.[1].isCorrect, true);
  assert.equal(payload.options?.[1].displayOrder, 1);
});
