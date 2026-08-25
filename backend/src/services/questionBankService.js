import { getSupabaseAdminClient, throwSupabaseError } from "./supabaseClient.js";

const QUESTION_TYPES = new Set(["mcq", "true_false", "short_answer"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const STATUSES = new Set(["draft", "active", "inactive"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function normalizePage(value) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function normalizeLimit(value, max = 50) {
  const limit = Number(value || 20);
  if (!Number.isSafeInteger(limit) || limit < 1) return 20;
  return Math.min(limit, max);
}

export function assertAdminQuestionPayload(body) {
  const payload = {
    class_id: requiredUuid(body?.classId || body?.class_id, "Class is required."),
    subject_id: requiredUuid(body?.subjectId || body?.subject_id, "Subject is required."),
    chapter_id: optionalUuid(body?.chapterId || body?.chapter_id, "Invalid chapter."),
    question_type: normalizeEnum(body?.questionType || body?.question_type, QUESTION_TYPES, "Invalid question type."),
    question_text: requiredText(body?.questionText || body?.question_text, "Question text is required."),
    difficulty: normalizeEnum(body?.difficulty, DIFFICULTIES, "Invalid difficulty."),
    marks: positiveNumber(body?.marks, "Marks must be greater than zero."),
    explanation: optionalText(body?.explanation),
    source: optionalText(body?.source),
    status: normalizeEnum(body?.status || "draft", STATUSES, "Invalid status."),
  };

  const options = Array.isArray(body?.options) ? body.options : [];
  if (payload.question_type === "mcq") {
    if (options.length < 2) {
      throwRequest("MCQ questions require at least two options.");
    }
    const normalizedOptions = options.map((option, index) => ({
      option_text: requiredText(option?.text || option?.optionText || option?.option_text, "Option text is required."),
      is_correct: Boolean(option?.isCorrect || option?.is_correct),
      display_order: Number.isSafeInteger(Number(option?.displayOrder ?? option?.display_order))
        ? Number(option?.displayOrder ?? option?.display_order)
        : index,
    }));
    if (normalizedOptions.filter((option) => option.is_correct).length !== 1) {
      throwRequest("MCQ questions require exactly one correct option.");
    }
    return { question: payload, options: normalizedOptions };
  }

  return { question: payload, options: [] };
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function assertClassPayload(body = {}) {
  const name = requiredText(body.name, "Class name is required.");
  return {
    name,
    slug: optionalText(body.slug) || slugify(name),
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

export function assertSubjectPayload(body = {}) {
  const name = requiredText(body.name, "Subject name is required.");
  return {
    class_id: requiredUuid(body.classId || body.class_id, "Class is required."),
    name,
    slug: optionalText(body.slug) || slugify(name),
    code: optionalText(body.code),
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

export function assertChapterPayload(body = {}) {
  const name = requiredText(body.name, "Chapter name is required.");
  return {
    subject_id: requiredUuid(body.subjectId || body.subject_id, "Subject is required."),
    name,
    slug: optionalText(body.slug) || slugify(name),
    chapter_number: optionalInteger(body.chapterNumber ?? body.chapter_number, "Chapter number must be a whole number."),
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

export async function getClasses({ includeInactive = false } = {}) {
  let query = getSupabaseAdminClient()
    .from("question_bank_classes")
    .select("id,name,slug,display_order,is_active")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeClass);
}

export async function getSubjectsByClass(classId, { includeInactive = false } = {}) {
  requiredUuid(classId, "Invalid class.");
  let query = getSupabaseAdminClient()
    .from("question_bank_subjects")
    .select("id,class_id,name,slug,code,display_order,is_active")
    .eq("class_id", classId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeSubject);
}

export async function getChaptersBySubject(subjectId, { includeInactive = false } = {}) {
  requiredUuid(subjectId, "Invalid subject.");
  let query = getSupabaseAdminClient()
    .from("question_bank_chapters")
    .select("id,subject_id,name,slug,chapter_number,display_order,is_active")
    .eq("subject_id", subjectId)
    .order("display_order", { ascending: true })
    .order("chapter_number", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeChapter);
}

export async function createClass(body, adminId) {
  const payload = assertClassPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "class", data.id, { name: data.name });
  return serializeClass(data);
}

export async function updateClass(classId, body, adminId) {
  requiredUuid(classId, "Invalid class.");
  const payload = assertClassPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", classId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "class", classId, { name: data.name });
  return serializeClass(data);
}

export async function setClassStatus(classId, isActive, adminId) {
  requiredUuid(classId, "Invalid class.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", classId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "class", classId, { isActive: data.is_active });
  return serializeClass(data);
}

export async function createSubject(body, adminId) {
  const payload = assertSubjectPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "subject", data.id, { classId: data.class_id, name: data.name });
  return serializeSubject(data);
}

export async function updateSubject(subjectId, body, adminId) {
  requiredUuid(subjectId, "Invalid subject.");
  const payload = assertSubjectPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", subjectId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "subject", subjectId, { classId: data.class_id, name: data.name });
  return serializeSubject(data);
}

export async function setSubjectStatus(subjectId, isActive, adminId) {
  requiredUuid(subjectId, "Invalid subject.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", subjectId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "subject", subjectId, { isActive: data.is_active });
  return serializeSubject(data);
}

export async function createChapter(body, adminId) {
  const payload = assertChapterPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "chapter", data.id, { subjectId: data.subject_id, name: data.name });
  return serializeChapter(data);
}

export async function updateChapter(chapterId, body, adminId) {
  requiredUuid(chapterId, "Invalid chapter.");
  const payload = assertChapterPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", chapterId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "chapter", chapterId, { subjectId: data.subject_id, name: data.name });
  return serializeChapter(data);
}

export async function setChapterStatus(chapterId, isActive, adminId) {
  requiredUuid(chapterId, "Invalid chapter.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", chapterId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "chapter", chapterId, { isActive: data.is_active });
  return serializeChapter(data);
}

export async function searchQuestions(filters = {}, { includeAnswers = false, studentSafe = false } = {}) {
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const optionColumns = includeAnswers
    ? "id,option_text,is_correct,display_order"
    : "id,option_text,display_order";

  const questionColumns = [
    "id",
    "class_id",
    "subject_id",
    "chapter_id",
    "question_type",
    "question_text",
    "difficulty",
    "marks",
    ...(!studentSafe ? ["explanation", "source"] : []),
    "status",
    "created_at",
    "updated_at",
  ].join(",");

  let query = getSupabaseAdminClient()
    .from("question_bank_questions")
    .select(`${questionColumns},question_bank_question_options(${optionColumns})`, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (filters.classId) query = query.eq("class_id", requiredUuid(filters.classId, "Invalid class."));
  if (filters.subjectId) query = query.eq("subject_id", requiredUuid(filters.subjectId, "Invalid subject."));
  if (filters.chapterId) query = query.eq("chapter_id", requiredUuid(filters.chapterId, "Invalid chapter."));
  if (filters.difficulty) query = query.eq("difficulty", normalizeEnum(filters.difficulty, DIFFICULTIES, "Invalid difficulty."));
  if (filters.questionType) query = query.eq("question_type", normalizeEnum(filters.questionType, QUESTION_TYPES, "Invalid question type."));
  if (filters.status) query = query.eq("status", normalizeEnum(filters.status, STATUSES, "Invalid status."));
  if (studentSafe) query = query.eq("status", "active");
  if (filters.search) query = query.ilike("question_text", `%${String(filters.search).trim().slice(0, 100)}%`);

  const { data, error, count } = await query;
  throwSupabaseError(error);
  return {
    questions: (data || []).map((question) => serializeQuestion(question, { includeAnswers })),
    page,
    limit,
    total: count || 0,
  };
}

export async function getQuestionPreview(questionId, { includeAnswers = false } = {}) {
  requiredUuid(questionId, "Invalid question.");
  const optionColumns = includeAnswers ? "id,option_text,is_correct,display_order" : "id,option_text,display_order";
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_questions")
    .select(`*,question_bank_question_options(${optionColumns})`)
    .eq("id", questionId)
    .single();
  throwSupabaseError(error);
  return serializeQuestion(data, { includeAnswers });
}

export async function createQuestion(body, adminId) {
  const payload = assertAdminQuestionPayload(body);
  await assertQuestionHierarchy(payload.question);
  const client = getSupabaseAdminClient();
  const { data: question, error } = await client
    .from("question_bank_questions")
    .insert([{ ...payload.question, created_by: adminId, updated_by: adminId }])
    .select("*")
    .single();
  throwSupabaseError(error);

  if (payload.options.length > 0) {
    const { error: optionsError } = await client
      .from("question_bank_question_options")
      .insert(payload.options.map((option) => ({ ...option, question_id: question.id })));
    throwSupabaseError(optionsError);
  }

  await writeAuditLog(adminId, "create", "question", question.id, { status: question.status });
  return getQuestionPreview(question.id, { includeAnswers: true });
}

export async function updateQuestion(questionId, body, adminId) {
  requiredUuid(questionId, "Invalid question.");
  const payload = assertAdminQuestionPayload(body);
  await assertQuestionHierarchy(payload.question);
  const client = getSupabaseAdminClient();
  const { error } = await client
    .from("question_bank_questions")
    .update({ ...payload.question, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq("id", questionId);
  throwSupabaseError(error);

  const { error: deleteError } = await client.from("question_bank_question_options").delete().eq("question_id", questionId);
  throwSupabaseError(deleteError);
  if (payload.options.length > 0) {
    const { error: insertError } = await client
      .from("question_bank_question_options")
      .insert(payload.options.map((option) => ({ ...option, question_id: questionId })));
    throwSupabaseError(insertError);
  }

  await writeAuditLog(adminId, "update", "question", questionId, { status: payload.question.status });
  return getQuestionPreview(questionId, { includeAnswers: true });
}

export async function setQuestionStatus(questionId, status, adminId) {
  requiredUuid(questionId, "Invalid question.");
  const normalizedStatus = normalizeEnum(status, STATUSES, "Invalid status.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_questions")
    .update({ status: normalizedStatus, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "question", questionId, { status: normalizedStatus });
  return serializeQuestion(data, { includeAnswers: true });
}

export function serializeQuestion(question, { includeAnswers = false } = {}) {
  const options = [...(question?.question_bank_question_options || question?.question_options || [])]
    .sort((first, second) => Number(first.display_order || 0) - Number(second.display_order || 0))
    .map((option) => ({
      id: option.id,
      text: option.option_text,
      displayOrder: option.display_order,
      ...(includeAnswers ? { isCorrect: Boolean(option.is_correct) } : {}),
    }));

  return {
    id: question.id,
    classId: question.class_id,
    subjectId: question.subject_id,
    chapterId: question.chapter_id,
    questionType: question.question_type,
    questionText: question.question_text,
    difficulty: question.difficulty,
    marks: Number(question.marks),
    explanation: question.explanation || "",
    source: question.source || "",
    status: question.status,
    options,
    createdAt: question.created_at,
    updatedAt: question.updated_at,
  };
}

function serializeClass(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

function serializeSubject(row) {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    slug: row.slug,
    code: row.code || "",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

function serializeChapter(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    slug: row.slug,
    chapterNumber: row.chapter_number,
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

async function writeAuditLog(adminId, action, entityType, entityId, metadata = {}) {
  const { error } = await getSupabaseAdminClient()
    .from("question_bank_admin_audit_logs")
    .insert([{ admin_id: adminId, action, entity_type: entityType, entity_id: entityId, metadata }]);
  throwSupabaseError(error);
}

async function assertQuestionHierarchy(question) {
  const client = getSupabaseAdminClient();
  const { data: subject, error: subjectError } = await client
    .from("question_bank_subjects")
    .select("id,class_id")
    .eq("id", question.subject_id)
    .single();
  throwSupabaseError(subjectError);
  if (subject.class_id !== question.class_id) throwRequest("Subject does not belong to the selected class.");

  if (question.chapter_id) {
    const { data: chapter, error: chapterError } = await client
      .from("question_bank_chapters")
      .select("id,subject_id")
      .eq("id", question.chapter_id)
      .single();
    throwSupabaseError(chapterError);
    if (chapter.subject_id !== question.subject_id) throwRequest("Chapter does not belong to the selected subject.");
  }
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

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throwRequest(message);
  return text;
}

function optionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function positiveNumber(value, message) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throwRequest(message);
  return number;
}

function integerValue(value, message) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throwRequest(message);
  return number;
}

function optionalInteger(value, message) {
  if (value == null || value === "") return null;
  return integerValue(value, message);
}

function normalizeEnum(value, allowed, message) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!allowed.has(normalized)) throwRequest(message);
  return normalized;
}

function throwRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "VALIDATION_ERROR";
  throw error;
}
