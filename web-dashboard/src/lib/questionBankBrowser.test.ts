import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeacherQuestionBankParams,
  nextFiltersAfterClassChange,
  nextFiltersAfterSubjectChange,
  questionBankSourceIds,
} from "./questionBankBrowser.ts";

test("teacher question bank params trim search and omit empty filters", () => {
  assert.deepEqual(
    buildTeacherQuestionBankParams({ classId: "", subjectId: "subject-1", search: " algebra ", page: 2, limit: 20 }),
    { classId: undefined, subjectId: "subject-1", chapterId: undefined, difficulty: undefined, questionType: undefined, search: "algebra", page: 2, limit: 20 }
  );
});

test("class and subject changes reset dependent hierarchy filters", () => {
  const filters = { classId: "old-class", subjectId: "old-subject", chapterId: "old-chapter", page: 4 };
  assert.deepEqual(nextFiltersAfterClassChange(filters, "new-class"), {
    classId: "new-class",
    subjectId: undefined,
    chapterId: undefined,
    page: 1,
  });
  assert.deepEqual(nextFiltersAfterSubjectChange(filters, "new-subject"), {
    classId: "old-class",
    subjectId: "new-subject",
    chapterId: undefined,
    page: 1,
  });
});

test("question bank duplicate detection uses snapshot source metadata", () => {
  const ids = questionBankSourceIds([
    { text: "Manual" },
    { text: "Imported", data: { sourceQuestionId: "qb-1", source: "central_question_bank" } },
    { text: "Imported again", data: { sourceQuestionId: "qb-1" } },
  ]);

  assert.deepEqual([...ids], ["qb-1"]);
});
