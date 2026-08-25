import { getSupabaseAdminClient, throwSupabaseError } from "./supabaseClient.js";
import { isUuid, serializeQuestion } from "./questionBankService.js";

const DIFFICULTY_MODES = new Set(["easy", "medium", "hard", "mixed"]);
const FINAL_STATUSES = new Set(["submitted", "expired", "cancelled"]);

export function normalizeSelfExamConfig(body = {}) {
  const durationMinutes = Number(body.durationMinutes || body.duration_minutes || 10);
  const questionCount = Number(body.questionCount || body.question_count || 10);
  const config = {
    class_id: requiredUuid(body.classId || body.class_id, "Class is required."),
    subject_id: requiredUuid(body.subjectId || body.subject_id, "Subject is required."),
    chapter_id: optionalUuid(body.chapterId || body.chapter_id, "Invalid chapter."),
    duration_minutes: integerInRange(durationMinutes, 1, 180, "Duration must be between 1 and 180 minutes."),
    question_count: integerInRange(questionCount, 1, 100, "Question count must be between 1 and 100."),
    difficulty_mode: normalizeDifficultyMode(body.difficultyMode || body.difficulty_mode || "mixed"),
  };
  return config;
}

export function pickQuestionIds(questions, count, difficultyMode = "mixed", random = Math.random) {
  if (questions.length < count) {
    const error = new Error("Not enough active questions are available for this exam configuration.");
    error.status = 409;
    error.code = "INSUFFICIENT_QUESTIONS";
    throw error;
  }

  if (difficultyMode !== "mixed") {
    const matchingDifficulty = questions.filter((question) => question.difficulty === difficultyMode);
    if (matchingDifficulty.length < count) {
      const error = new Error("Not enough active questions are available for this exam configuration.");
      error.status = 409;
      error.code = "INSUFFICIENT_QUESTIONS";
      throw error;
    }
    return shuffle(matchingDifficulty, random).slice(0, count);
  }

  const targets = {
    easy: Math.floor(count * 0.3),
    medium: Math.floor(count * 0.5),
    hard: Math.floor(count * 0.2),
  };
  while (targets.easy + targets.medium + targets.hard < count) targets.medium += 1;

  const buckets = {
    easy: shuffle(questions.filter((question) => question.difficulty === "easy"), random),
    medium: shuffle(questions.filter((question) => question.difficulty === "medium"), random),
    hard: shuffle(questions.filter((question) => question.difficulty === "hard"), random),
  };

  const selected = [];
  for (const difficulty of ["easy", "medium", "hard"]) {
    selected.push(...buckets[difficulty].splice(0, targets[difficulty]));
  }

  const selectedIds = new Set(selected.map((question) => question.id));
  const remaining = shuffle(questions.filter((question) => !selectedIds.has(question.id)), random);
  while (selected.length < count && remaining.length > 0) selected.push(remaining.shift());
  return shuffle(selected, random).slice(0, count);
}

export async function createSelfExamSession(studentId, body) {
  const config = normalizeSelfExamConfig(body);
  await assertHierarchy(config);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .insert([{ ...config, student_id: studentId, status: "created" }])
    .select("*")
    .single();
  throwSupabaseError(error);
  return serializeSession(data);
}

export async function getActiveSelfExamSession(studentId) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwSupabaseError(error);
  return data ? serializeSession(data) : null;
}

export async function startSelfExamSession(studentId, sessionId) {
  requiredUuid(sessionId, "Invalid session.");
  const client = getSupabaseAdminClient();
  const session = await findOwnedSession(studentId, sessionId);
  if (FINAL_STATUSES.has(session.status)) throwConflict("This self exam is already finalized.");
  if (session.status === "in_progress") return getSelfExamSession(studentId, sessionId);

  const eligibleQuestions = await fetchEligibleQuestions(session);
  const selectedQuestions = pickQuestionIds(eligibleQuestions, session.question_count, session.difficulty_mode || "mixed");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(session.duration_minutes) * 60_000);

  const { error: mappingError } = await client.from("question_bank_self_exam_session_questions").insert(
    selectedQuestions.map((question, index) => ({
      session_id: session.id,
      question_id: question.id,
      display_order: index + 1,
      marks: question.marks,
    }))
  );
  throwSupabaseError(mappingError);

  const { error: updateError } = await client
    .from("question_bank_self_exam_sessions")
    .update({
      status: "in_progress",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", session.id)
    .eq("student_id", studentId);
  throwSupabaseError(updateError);
  return getSelfExamSession(studentId, sessionId);
}

export async function getSelfExamSession(studentId, sessionId, { includeResult = false } = {}) {
  const session = await findOwnedSession(studentId, sessionId);
  await expireIfNeeded(session);
  const refreshed = await findOwnedSession(studentId, sessionId);
  const [questions, answers] = await Promise.all([
    fetchSessionQuestions(refreshed.id, { includeAnswers: includeResult && refreshed.status === "submitted" }),
    fetchSessionAnswers(refreshed.id, { includeResult: includeResult && refreshed.status === "submitted" }),
  ]);
  return {
    session: serializeSession(refreshed),
    questions,
    answers,
    serverTime: new Date().toISOString(),
  };
}

export async function saveSelfExamAnswer(studentId, sessionId, body = {}) {
  const session = await findOwnedSession(studentId, sessionId);
  await assertAcceptingAnswers(session);
  const questionId = requiredUuid(body.questionId || body.question_id, "Question is required.");
  const selectedOptionId = optionalUuid(body.selectedOptionId || body.selected_option_id, "Invalid option.");
  const answerText = String(body.answerText || body.answer_text || "").trim().slice(0, 20_000) || null;
  await assertQuestionInSession(session.id, questionId);
  if (selectedOptionId) await assertOptionBelongsToQuestion(selectedOptionId, questionId);

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_answers")
    .upsert({
      session_id: session.id,
      question_id: questionId,
      selected_option_id: selectedOptionId,
      answer_text: answerText,
      answered_at: now,
      updated_at: now,
    }, { onConflict: "session_id,question_id" })
    .select("*")
    .single();
  throwSupabaseError(error);
  return serializeAnswer(data);
}

export async function submitSelfExam(studentId, sessionId) {
  const session = await findOwnedSession(studentId, sessionId);
  if (session.status === "submitted") return getSelfExamResult(studentId, sessionId);
  await assertAcceptingAnswers(session, { allowExpiredSubmit: true });

  const [questions, answers] = await Promise.all([
    fetchSessionQuestionsForScoring(session.id),
    fetchSessionAnswers(session.id),
  ]);
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  let score = 0;
  let totalMarks = 0;
  const scoredAnswers = [];

  for (const question of questions) {
    totalMarks += Number(question.marks || 0);
    const answer = answersByQuestion.get(question.id);
    const correctOption = (question.options || []).find((option) => option.isCorrect);
    const isCorrect = Boolean(answer?.selectedOptionId && correctOption?.id === answer.selectedOptionId);
    const marksAwarded = isCorrect ? Number(question.marks || 0) : 0;
    score += marksAwarded;
    if (answer) {
      scoredAnswers.push({
        id: answer.id,
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const scoreUpdates = await Promise.all(scoredAnswers.map((answer) =>
    getSupabaseAdminClient().from("question_bank_self_exam_answers").update(answer).eq("id", answer.id)
  ));
  for (const update of scoreUpdates) throwSupabaseError(update.error);

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .update({ status: "submitted", submitted_at: now, score, total_marks: totalMarks, updated_at: now })
    .eq("id", session.id)
    .eq("student_id", studentId);
  throwSupabaseError(error);
  return getSelfExamResult(studentId, sessionId);
}

export async function getSelfExamResult(studentId, sessionId) {
  const payload = await getSelfExamSession(studentId, sessionId, { includeResult: true });
  if (payload.session.status !== "submitted") {
    const error = new Error("Result is available only after submission.");
    error.status = 409;
    error.code = "RESULT_NOT_READY";
    throw error;
  }

  const answered = payload.answers.length;
  const correct = payload.answers.filter((answer) => answer.isCorrect).length;
  return {
    ...payload,
    result: {
      score: payload.session.score,
      totalMarks: payload.session.totalMarks,
      percentage: payload.session.totalMarks > 0 ? Math.round((payload.session.score / payload.session.totalMarks) * 100) : 0,
      correctCount: correct,
      incorrectCount: answered - correct,
      unansweredCount: Math.max(0, payload.questions.length - answered),
    },
  };
}

async function assertHierarchy(config) {
  const client = getSupabaseAdminClient();
  const { data: subject, error: subjectError } = await client
    .from("question_bank_subjects")
    .select("id,class_id,is_active")
    .eq("id", config.subject_id)
    .single();
  throwSupabaseError(subjectError);
  if (subject.class_id !== config.class_id || !subject.is_active) throwRequest("Subject does not belong to the selected class.");
  if (config.chapter_id) {
    const { data: chapter, error: chapterError } = await client
      .from("question_bank_chapters")
      .select("id,subject_id,is_active")
      .eq("id", config.chapter_id)
      .single();
    throwSupabaseError(chapterError);
    if (chapter.subject_id !== config.subject_id || !chapter.is_active) throwRequest("Chapter does not belong to the selected subject.");
  }
}

async function fetchEligibleQuestions(session) {
  let query = getSupabaseAdminClient()
    .from("question_bank_questions")
    .select("id,difficulty,marks")
    .eq("class_id", session.class_id)
    .eq("subject_id", session.subject_id)
    .eq("status", "active")
    .eq("question_type", "mcq")
    .limit(500);
  if (session.chapter_id) query = query.eq("chapter_id", session.chapter_id);
  if (session.difficulty_mode && session.difficulty_mode !== "mixed") query = query.eq("difficulty", session.difficulty_mode);
  const { data, error } = await query;
  throwSupabaseError(error);
  return data || [];
}

async function fetchSessionQuestions(sessionId, { includeAnswers = false } = {}) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_session_questions")
    .select("display_order,marks,question_bank_questions(id,class_id,subject_id,chapter_id,question_type,question_text,difficulty,marks,explanation,status,question_bank_question_options(id,option_text,is_correct,display_order))")
    .eq("session_id", sessionId)
    .order("display_order", { ascending: true });
  throwSupabaseError(error);
  return (data || []).map((row) => ({
    ...serializeQuestion(row.question_bank_questions || row.questions, { includeAnswers }),
    displayOrder: row.display_order,
    marks: Number(row.marks),
    ...(includeAnswers ? {} : { explanation: "", source: "" }),
  }));
}

async function fetchSessionQuestionsForScoring(sessionId) {
  return fetchSessionQuestions(sessionId, { includeAnswers: true });
}

async function fetchSessionAnswers(sessionId, { includeResult = true } = {}) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_answers")
    .select("*")
    .eq("session_id", sessionId);
  throwSupabaseError(error);
  return (data || []).map((answer) => serializeAnswer(answer, { includeResult }));
}

async function findOwnedSession(studentId, sessionId) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("student_id", studentId)
    .single();
  throwSupabaseError(error);
  return data;
}

async function assertQuestionInSession(sessionId, questionId) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_session_questions")
    .select("id")
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .maybeSingle();
  throwSupabaseError(error);
  if (!data) throwRequest("Question does not belong to this self exam session.");
}

async function assertOptionBelongsToQuestion(optionId, questionId) {
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_question_options")
    .select("id")
    .eq("id", optionId)
    .eq("question_id", questionId)
    .maybeSingle();
  throwSupabaseError(error);
  if (!data) throwRequest("Selected option does not belong to this question.");
}

async function assertAcceptingAnswers(session, { allowExpiredSubmit = false } = {}) {
  await expireIfNeeded(session);
  if (session.status !== "in_progress" && !(allowExpiredSubmit && session.status === "expired")) {
    const error = new Error("This self exam is not accepting answers.");
    error.status = session.status === "submitted" ? 410 : 409;
    error.code = "SESSION_NOT_ACTIVE";
    throw error;
  }
}

async function expireIfNeeded(session) {
  if (session.status !== "in_progress" || !session.expires_at) return;
  if (new Date(session.expires_at).getTime() > Date.now()) return;
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .update({ status: "expired", updated_at: now })
    .eq("id", session.id)
    .eq("status", "in_progress");
  throwSupabaseError(error);
  session.status = "expired";
}

export function serializeSession(session) {
  return {
    id: session.id,
    studentId: session.student_id,
    classId: session.class_id,
    subjectId: session.subject_id,
    chapterId: session.chapter_id,
    durationMinutes: session.duration_minutes,
    questionCount: session.question_count,
    difficultyMode: session.difficulty_mode,
    status: session.status,
    startedAt: session.started_at,
    expiresAt: session.expires_at,
    submittedAt: session.submitted_at,
    score: Number(session.score || 0),
    totalMarks: Number(session.total_marks || 0),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

function serializeAnswer(answer, { includeResult = false } = {}) {
  return {
    id: answer.id,
    sessionId: answer.session_id,
    questionId: answer.question_id,
    selectedOptionId: answer.selected_option_id,
    answerText: answer.answer_text || "",
    ...(includeResult ? {
      isCorrect: answer.is_correct,
      marksAwarded: answer.marks_awarded == null ? null : Number(answer.marks_awarded),
    } : {}),
    answeredAt: answer.answered_at,
    updatedAt: answer.updated_at,
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function requiredUuid(value, message) {
  const normalized = String(value || "").trim();
  if (!isUuid(normalized)) throwRequest(message);
  return normalized;
}

function optionalUuid(value, message) {
  if (!value) return null;
  return requiredUuid(value, message);
}

function integerInRange(value, min, max, message) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throwRequest(message);
  return value;
}

function normalizeDifficultyMode(value) {
  const normalized = String(value || "mixed").trim().toLowerCase();
  if (!DIFFICULTY_MODES.has(normalized)) throwRequest("Invalid difficulty mode.");
  return normalized;
}

function throwRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "VALIDATION_ERROR";
  throw error;
}

function throwConflict(message) {
  const error = new Error(message);
  error.status = 409;
  error.code = "SESSION_CONFLICT";
  throw error;
}
