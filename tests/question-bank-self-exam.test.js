import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  toTeacherExamQuestionSnapshot,
} from "../backend/src/routes/questionBank.js";
import {
  assertAdminQuestionPayload,
  assertChapterPayload,
  assertClassPayload,
  assertSubjectPayload,
  serializeQuestion,
  slugify,
} from "../backend/src/services/questionBankService.js";
import { normalizeSelfExamConfig, pickQuestionIds } from "../backend/src/services/selfExamService.js";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";
const uuidC = "33333333-3333-4333-8333-333333333333";

test("admin MCQ validation requires exactly one correct option", () => {
  assert.throws(
    () => assertAdminQuestionPayload({
      classId: uuidA,
      subjectId: uuidB,
      questionType: "mcq",
      questionText: "What is 2 + 2?",
      difficulty: "easy",
      marks: 1,
      options: [
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: true },
      ],
    }),
    /exactly one correct option/
  );

  const payload = assertAdminQuestionPayload({
    classId: uuidA,
    subjectId: uuidB,
    chapterId: uuidC,
    questionType: "mcq",
    questionText: "What is 2 + 2?",
    difficulty: "easy",
    marks: 1,
    status: "active",
    options: [
      { text: "3", isCorrect: false },
      { text: "4", isCorrect: true },
    ],
  });

  assert.equal(payload.question.status, "active");
  assert.equal(payload.options.filter((option) => option.is_correct).length, 1);
});

test("admin hierarchy payloads normalize slugs and preserve parent references", () => {
  assert.equal(slugify("Class 9: Science!"), "class-9-science");
  assert.deepEqual(assertClassPayload({ name: "Class 9", displayOrder: "2" }), {
    name: "Class 9",
    slug: "class-9",
    display_order: 2,
    is_active: true,
  });
  assert.equal(assertSubjectPayload({ classId: uuidA, name: "Mathematics", code: "MATH" }).class_id, uuidA);
  assert.equal(assertChapterPayload({ subjectId: uuidB, name: "Algebra", chapterNumber: "1" }).chapter_number, 1);
});

test("question bank routes enforce backend authorization before service-role access", () => {
  const source = readFileSync(new URL("../backend/src/routes/questionBank.js", import.meta.url), "utf8");
  for (const path of [
    '"/admin/classes"',
    '"/admin/subjects"',
    '"/admin/chapters"',
    '"/questions"',
    '"/questions/:questionId/status"',
  ]) {
    const index = source.indexOf(path);
    assert.notEqual(index, -1, `${path} route should exist`);
    const routeLine = source.slice(index, source.indexOf("async", index));
    assert.match(routeLine, /requireAuth/);
    assert.match(routeLine, /requireRole/);
  }
  assert.match(source, /post\("\/questions", requireAuth, requireRole\(ADMIN_ROLES\)/);
  assert.match(source, /put\("\/questions\/:questionId", requireAuth, requireRole\(ADMIN_ROLES\)/);
  assert.match(source, /patch\("\/questions\/:questionId\/status", requireAuth, requireRole\(ADMIN_ROLES\)/);
  assert.match(source, /post\("\/teacher\/questions\/snapshots", requireAuth, requireRole\("TEACHER"\)/);
  assert.match(source, /post\("\/teacher\/exams\/:examId\/questions", requireAuth, requireRole\("TEACHER"\)/);
  assert.match(source, /req\.user\.role === "TEACHER" \? \{ \.\.\.req\.query, status: "active" \}/);
});

test("self exam routes require authenticated student role before service access", () => {
  const source = readFileSync(new URL("../backend/src/routes/selfExam.js", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("../backend/src/server.js", import.meta.url), "utf8");
  const rootServerSource = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const rootRouteSource = readFileSync(new URL("../src/routes/selfExam.js", import.meta.url), "utf8");
  for (const path of [
    '"/classes"',
    '"/classes/:classId/subjects"',
    '"/subjects/:subjectId/chapters"',
    '"/sessions/active"',
    '"/sessions"',
    '"/sessions/:sessionId/start"',
    '"/sessions/:sessionId"',
    '"/sessions/:sessionId/answers"',
    '"/sessions/:sessionId/submit"',
    '"/sessions/:sessionId/result"',
  ]) {
    const index = source.indexOf(path);
    assert.notEqual(index, -1, `${path} route should exist`);
    const routeLine = source.slice(index, source.indexOf("async", index));
    assert.match(routeLine, /requireAuth/);
    assert.match(routeLine, /requireRole\("STUDENT"\)/);
  }
  assert.match(source, /req\.user\.identifier/);
  assert.doesNotMatch(source, /req\.body\.studentId|req\.query\.studentId/);
  assert.match(rootRouteSource, /requireAuth/);
  assert.match(rootRouteSource, /requireRole\("STUDENT"\)/);
  assert.match(rootRouteSource, /req\.user\.identifier/);
  assert.doesNotMatch(rootRouteSource, /req\.body\.studentId|req\.query\.studentId/);
  assert.match(serverSource, /app\.use\("\/self-exam", selfExamRouter\)/);
  assert.match(serverSource, /app\.use\("\/self-exams", selfExamRouter\)/);
  assert.match(serverSource, /app\.use\("\/seft-exam", selfExamRouter\)/);
  assert.match(rootServerSource, /app\.use\("\/self-exam", selfExamRouter\)/);
  assert.match(rootServerSource, /app\.use\("\/self-exams", selfExamRouter\)/);
  assert.match(rootServerSource, /app\.use\("\/seft-exam", selfExamRouter\)/);
  assert.match(serverSource, /ROUTE_NOT_FOUND/);
  assert.match(serverSource, /Route not found: \$\{req\.method\} \$\{req\.originalUrl\}/);
});

test("teacher question bank import route protects ownership, draft status, and duplicate source ids", () => {
  const source = readFileSync(new URL("../backend/src/routes/questionBank.js", import.meta.url), "utf8");
  assert.match(source, /findOne\(\{ _id: req\.params\.examId, createdBy: req\.user\.identifier \}\)/);
  assert.match(source, /exam\.status \|\| "DRAFT"\) !== "DRAFT"/);
  assert.match(source, /QUESTION_BANK_DUPLICATE_IMPORT/);
  assert.match(source, /sourceQuestionId/);
});

test("teacher question bank snapshot preserves content and source traceability", () => {
  const snapshot = toTeacherExamQuestionSnapshot({
    id: uuidA,
    questionType: "mcq",
    questionText: "What is 2 + 2?",
    difficulty: "easy",
    marks: 2,
    subjectId: uuidB,
    chapterId: uuidC,
    explanation: "Addition",
    options: [
      { text: "3", isCorrect: false },
      { text: "4", isCorrect: true },
    ],
  });

  assert.equal(snapshot.id, `qb:${uuidA}`);
  assert.equal(snapshot.type, "MCQ");
  assert.deepEqual(snapshot.options, ["3", "4"]);
  assert.equal(snapshot.correctAnswer, "1");
  assert.equal(snapshot.data.source, "central_question_bank");
  assert.equal(snapshot.data.sourceQuestionId, uuidA);
  snapshot.text = "Local exam snapshot";
  assert.equal(snapshot.data.sourceQuestionId, uuidA);
});

test("student-safe question serialization hides correct options unless requested", () => {
  const question = {
    id: uuidA,
    class_id: uuidB,
    subject_id: uuidC,
    chapter_id: null,
    question_type: "mcq",
    question_text: "Safe?",
    difficulty: "medium",
    marks: 1,
    explanation: "Only later",
    status: "active",
    question_options: [
      { id: uuidB, option_text: "No", is_correct: false, display_order: 1 },
      { id: uuidC, option_text: "Yes", is_correct: true, display_order: 0 },
    ],
  };

  const hidden = serializeQuestion(question);
  assert.equal("isCorrect" in hidden.options[0], false);
  const revealed = serializeQuestion(question, { includeAnswers: true });
  assert.equal(revealed.options[0].isCorrect, true);
});

test("active self exam serialization does not expose answer keys or scoring fields", () => {
  const service = readFileSync(new URL("../backend/src/services/selfExamService.js", import.meta.url), "utf8");
  assert.match(service, /includeAnswers: includeResult && refreshed\.status === "submitted"/);
  assert.match(service, /fetchSessionAnswers\(refreshed\.id, \{ includeResult: includeResult && refreshed\.status === "submitted" \}\)/);
  assert.match(service, /\.\.\.\(includeResult \? \{/);
  assert.match(service, /isCorrect: answer\.is_correct/);
  assert.match(service, /marksAwarded:/);
});

test("admin question writes validate hierarchy before Supabase mutation", () => {
  const service = readFileSync(new URL("../backend/src/services/questionBankService.js", import.meta.url), "utf8");
  assert.match(service, /await assertQuestionHierarchy\(payload\.question\)/);
  assert.match(service, /Subject does not belong to the selected class/);
  assert.match(service, /Chapter does not belong to the selected subject/);
});

test("Supabase backend config requires only URL and service-role key", () => {
  const config = readFileSync(new URL("../backend/src/config.js", import.meta.url), "utf8");
  const envExample = readFileSync(new URL("../backend/.env.example", import.meta.url), "utf8");
  assert.match(config, /SUPABASE_URL/);
  assert.match(config, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(config, /SUPABASE_ANON_KEY|anonKey/);
  assert.doesNotMatch(envExample, /SUPABASE_ANON_KEY/);
});

test("Question Bank API seed uses admin role and idempotent upserts", () => {
  const seed = readFileSync(new URL("../backend/scripts/seed-question-bank-api.mjs", import.meta.url), "utf8");
  assert.match(seed, /CHEATLOCK_SEED_ADMIN_ROLE \|\| "SUPER_ADMIN"/);
  assert.match(seed, /async function upsertClass/);
  assert.match(seed, /async function upsertSubject/);
  assert.match(seed, /async function upsertChapter/);
  assert.match(seed, /async function upsertQuestion/);
  assert.doesNotMatch(seed, /role: "TEACHER"/);
});

test("self exam config rejects invalid ownership-independent identifiers", () => {
  assert.throws(
    () => normalizeSelfExamConfig({
      classId: "class-9",
      subjectId: uuidB,
      durationMinutes: 10,
      questionCount: 5,
    }),
    /Class is required/
  );
});

test("mixed question picker redistributes when a difficulty bucket is short", () => {
  const questions = [
    { id: "e1", difficulty: "easy", marks: 1 },
    { id: "m1", difficulty: "medium", marks: 1 },
    { id: "m2", difficulty: "medium", marks: 1 },
    { id: "m3", difficulty: "medium", marks: 1 },
    { id: "h1", difficulty: "hard", marks: 1 },
  ];

  const selected = pickQuestionIds(questions, 4, "mixed", () => 0.42);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map((question) => question.id)).size, 4);
});

test("difficulty-specific self exam selection rejects insufficient matching questions", () => {
  const questions = [
    { id: "e1", difficulty: "easy", marks: 1 },
    { id: "m1", difficulty: "medium", marks: 1 },
    { id: "m2", difficulty: "medium", marks: 1 },
  ];

  assert.throws(
    () => pickQuestionIds(questions, 2, "easy", () => 0.42),
    /Not enough active questions/
  );
});
