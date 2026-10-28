import { getSupabaseAdminClient, throwSupabaseError } from "./supabaseClient.js";
import { isMissingExamHierarchyError } from "./supabaseErrors.js";
import {
  detectDuplicatesForChapter,
  parseCsvQuestions,
  parseJsonQuestions,
  parseMarkdownQuestions,
  validateImportedQuestion,
} from "./questionBankImportService.js";

const QUESTION_TYPES = new Set(["mcq", "true_false", "short_answer"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const STATUSES = new Set(["draft", "active", "inactive"]);
const NODE_TYPES = new Set(["level", "class", "group", "admission_type", "unit", "subject", "chapter", "topic"]);
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

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function getExamCategories({ includeInactive = false } = {}) {
  let query = getSupabaseAdminClient()
    .from("exam_categories")
    .select("id,name,slug,icon,color,description,display_order,is_active,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeCategory);
}

export async function getExamNodes({ categoryId, parentId = null, includeInactive = false } = {}) {
  let query = getSupabaseAdminClient()
    .from("exam_nodes")
    .select("id,category_id,parent_id,name,slug,type,icon,color,description,display_order,is_active,metadata,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (categoryId) query = query.eq("category_id", requiredUuid(categoryId, "Invalid category."));
  query = parentId ? query.eq("parent_id", requiredUuid(parentId, "Invalid parent.")) : query.is("parent_id", null);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeNode);
}

export async function getExamTree({ includeInactive = false } = {}) {
  try {
    const [categories, nodes] = await Promise.all([
      getExamCategories({ includeInactive }),
      getAllExamNodes({ includeInactive }),
    ]);
    const childrenByParent = new Map();
    for (const node of nodes) {
      const key = node.parentId || `category:${node.categoryId}`;
      childrenByParent.set(key, [...(childrenByParent.get(key) || []), node]);
    }
    const hydrate = (node) => ({ ...node, children: (childrenByParent.get(node.id) || []).map(hydrate) });
    return categories.map((category) => ({
      ...category,
      children: (childrenByParent.get(`category:${category.id}`) || []).map(hydrate),
    }));
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return getLegacyExamTree({ includeInactive });
  }
}

export async function createExamNode(body, adminId) {
  try {
    const payload = await assertNodePayload(body);
    const { data, error } = await getSupabaseAdminClient()
      .from("exam_nodes")
      .insert([payload])
      .select("*")
      .single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "create", "exam_node", data.id, { name: data.name, type: data.type });
    return serializeNode(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return serializeLegacyNode(await createLegacyNode(body, adminId));
  }
}

export async function updateExamNode(nodeId, body, adminId) {
  try {
    requiredUuid(nodeId, "Invalid node.");
    const payload = await assertNodePayload(body, { existingNodeId: nodeId });
    const { data, error } = await getSupabaseAdminClient()
      .from("exam_nodes")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", nodeId)
      .select("*")
      .single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "update", "exam_node", nodeId, { name: data.name, type: data.type });
    return serializeNode(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return serializeLegacyNode(await updateLegacyNode(nodeId, body, adminId));
  }
}

export async function deleteExamNode(nodeId, adminId) {
  try {
    requiredUuid(nodeId, "Invalid item.");
    const ids = await collectNodeAndDescendantIds(nodeId);
    await assertNoSelfExamSessionsForNodes(ids);
    await deleteQuestionsForNodes(ids, adminId);
    const { error } = await getSupabaseAdminClient()
      .from("exam_nodes")
      .delete()
      .eq("id", nodeId);
    throwSupabaseError(error);
    await writeAuditLog(adminId, "delete", "exam_node", nodeId, { descendantCount: ids.length - 1 });
    return { id: nodeId };
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return deleteLegacyNode(nodeId, adminId);
  }
}

export async function setExamNodeStatus(nodeId, isActive, adminId) {
  try {
    requiredUuid(nodeId, "Invalid node.");
    const { data, error } = await getSupabaseAdminClient()
      .from("exam_nodes")
      .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
      .eq("id", nodeId)
      .select("*")
      .single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "set_status", "exam_node", nodeId, { isActive: data.is_active });
    return serializeNode(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return serializeLegacyNode(await setLegacyNodeStatus(nodeId, isActive, adminId));
  }
}

export async function getNodePath(nodeId) {
  requiredUuid(nodeId, "Invalid node.");
  const nodes = await getAllExamNodes({ includeInactive: true });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = [];
  const visited = new Set();
  let current = byId.get(nodeId);
  while (current) {
    if (visited.has(current.id)) throwHierarchyCycle();
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return path;
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
    chapter_number: body.chapterNumber !== undefined && body.chapterNumber !== null && body.chapterNumber !== ""
      ? integerValue(body.chapterNumber, "Chapter number must be a whole number.")
      : null,
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

export function assertAdminQuestionPayload(body) {
  const nodeId = body?.nodeId || body?.node_id || body?.chapterId || body?.chapter_id || body?.subjectId || body?.subject_id || body?.classId || body?.class_id;
  const payload = {
    node_id: requiredUuid(nodeId, "Question bank node is required."),
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
    if (options.length < 2) throwRequest("MCQ questions require at least two options.");
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

export async function getClasses({ includeInactive = false } = {}) {
  try {
    const categories = await getExamCategories({ includeInactive });
    return categories.map((category) => {
      const slug = (category.slug || "").toLowerCase();
      const name = (category.name || "").toLowerCase();
      const isAdmission = slug.includes("admission") || slug.includes("varsity") || slug.includes("medical") || slug.includes("engineering") || name.includes("admission");
      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        icon: category.icon || "",
        color: category.color || "",
        description: category.description || "",
        track: isAdmission ? "admission" : "academic",
        displayOrder: category.displayOrder,
        isActive: category.isActive,
        kind: "category",
      };
    });
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return getLegacyClasses({ includeInactive });
  }
}

export async function getSubjectsByClass(classId, { includeInactive = false } = {}) {
  try {
    const category = await findCategory(classId);
    const nodes = category
      ? await getExamNodes({ categoryId: classId, includeInactive })
      : await getExamNodes({ parentId: classId, includeInactive });
    return nodes.map((node) => serializeSubjectCompat(node, classId));
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return getLegacySubjectsByClass(classId, { includeInactive });
  }
}

export async function getChaptersBySubject(subjectId, { includeInactive = false } = {}) {
  try {
    const nodes = await getExamNodes({ parentId: subjectId, includeInactive });
    return nodes.map((node) => serializeChapterCompat(node, subjectId));
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return getLegacyChaptersBySubject(subjectId, { includeInactive });
  }
}

export async function createClass(body, adminId) {
  try {
    const payload = await assertCategoryPayload(body);
    const { data, error } = await getSupabaseAdminClient().from("exam_categories").insert([payload]).select("*").single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "create", "exam_category", data.id, { name: data.name });
    return serializeCategoryAsClass(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return createLegacyClass(body, adminId);
  }
}

export async function updateClass(classId, body, adminId) {
  try {
    requiredUuid(classId, "Invalid category.");
    const payload = await assertCategoryPayload(body);
    const { data, error } = await getSupabaseAdminClient()
      .from("exam_categories")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", classId)
      .select("*")
      .single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "update", "exam_category", classId, { name: data.name });
    return serializeCategoryAsClass(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return updateLegacyClass(classId, body, adminId);
  }
}

export async function setClassStatus(classId, isActive, adminId) {
  try {
    requiredUuid(classId, "Invalid category.");
    const { data, error } = await getSupabaseAdminClient()
      .from("exam_categories")
      .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
      .eq("id", classId)
      .select("*")
      .single();
    throwSupabaseError(error);
    await writeAuditLog(adminId, "set_status", "exam_category", classId, { isActive: data.is_active });
    return serializeCategoryAsClass(data);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return setLegacyClassStatus(classId, isActive, adminId);
  }
}

export async function deleteClass(classId, adminId) {
  try {
    requiredUuid(classId, "Invalid category.");
    const nodeIds = (await getAllExamNodes({ includeInactive: true }))
      .filter((node) => node.categoryId === classId)
      .map((node) => node.id);
    await assertNoSelfExamSessionsForNodes(nodeIds);
    await deleteQuestionsForNodes(nodeIds, adminId);
    const { error } = await getSupabaseAdminClient()
      .from("exam_categories")
      .delete()
      .eq("id", classId);
    throwSupabaseError(error);
    await writeAuditLog(adminId, "delete", "exam_category", classId, { nodeCount: nodeIds.length });
    return { id: classId };
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return deleteLegacyClass(classId, adminId);
  }
}

export async function createSubject(body, adminId) {
  try {
    const node = await createExamNode({ ...body, categoryId: body.classId || body.class_id, parentId: null, type: inferTopLevelType(body.name) }, adminId);
    return serializeSubjectCompat(node, body.classId || body.class_id);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return createLegacySubject(body, adminId);
  }
}

export async function updateSubject(subjectId, body, adminId) {
  try {
    const node = await updateExamNode(subjectId, { ...body, categoryId: body.classId || body.class_id, parentId: null, type: inferTopLevelType(body.name) }, adminId);
    return serializeSubjectCompat(node, body.classId || body.class_id);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return updateLegacySubject(subjectId, body, adminId);
  }
}

export async function setSubjectStatus(subjectId, isActive, adminId) {
  try {
    return serializeSubjectCompat(await setExamNodeStatus(subjectId, isActive, adminId));
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return setLegacySubjectStatus(subjectId, isActive, adminId);
  }
}

export async function createChapter(body, adminId) {
  try {
    const parent = await findNode(body.subjectId || body.subject_id);
    const node = await createExamNode({ ...body, categoryId: parent.categoryId, parentId: parent.id, type: "topic" }, adminId);
    return serializeChapterCompat(node, parent.id);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return createLegacyChapter(body, adminId);
  }
}

export async function updateChapter(chapterId, body, adminId) {
  try {
    const parent = await findNode(body.subjectId || body.subject_id);
    const node = await updateExamNode(chapterId, { ...body, categoryId: parent.categoryId, parentId: parent.id, type: "topic" }, adminId);
    return serializeChapterCompat(node, parent.id);
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return updateLegacyChapter(chapterId, body, adminId);
  }
}

export async function setChapterStatus(chapterId, isActive, adminId) {
  try {
    return serializeChapterCompat(await setExamNodeStatus(chapterId, isActive, adminId));
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return setLegacyChapterStatus(chapterId, isActive, adminId);
  }
}

export async function searchQuestions(filters = {}, { includeAnswers = false, studentSafe = false } = {}) {
  try {
    return await searchExamNodeQuestions(filters, { includeAnswers, studentSafe });
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return searchLegacyQuestions(filters, { includeAnswers, studentSafe });
  }
}

async function searchExamNodeQuestions(filters = {}, { includeAnswers = false, studentSafe = false } = {}) {
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const optionColumns = includeAnswers ? "id,option_text,is_correct,display_order" : "id,option_text,display_order";
  const questionColumns = [
    "id",
    "node_id",
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

  const filterNodeId = filters.nodeId || filters.node_id || filters.chapterId || filters.subjectId || filters.classId;
  if (filterNodeId) query = query.in("node_id", await collectNodeAndDescendantIds(filterNodeId));
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
  try {
    requiredUuid(questionId, "Invalid question.");
    const optionColumns = includeAnswers ? "id,option_text,is_correct,display_order" : "id,option_text,display_order";
    const { data, error } = await getSupabaseAdminClient()
      .from("question_bank_questions")
      .select(`*,question_bank_question_options(${optionColumns})`)
      .eq("id", questionId)
      .single();
    throwSupabaseError(error);
    return serializeQuestion(data, { includeAnswers });
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return getLegacyQuestionPreview(questionId, { includeAnswers });
  }
}

export async function createQuestion(body, adminId) {
  try {
    const payload = assertAdminQuestionPayload(body);
    await assertQuestionHierarchy(payload.question);
    await assertQuestionNode(payload.question.node_id);
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
    await writeAuditLog(adminId, "create", "question_bank_question", question.id, { text: question.question_text });
    return serializeQuestion(question, { includeAnswers: true });
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return createLegacyQuestion(body, adminId);
  }
}

export async function updateQuestion(questionId, body, adminId) {
  try {
    requiredUuid(questionId, "Invalid question.");
    const payload = assertAdminQuestionPayload(body);
    await assertQuestionHierarchy(payload.question);
    await assertQuestionNode(payload.question.node_id);
    const client = getSupabaseAdminClient();
    const { data: question, error } = await client
      .from("question_bank_questions")
      .update({ ...payload.question, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", questionId)
      .select("*")
      .single();
    throwSupabaseError(error);

    const { error: deleteError } = await client.from("question_bank_question_options").delete().eq("question_id", questionId);
    throwSupabaseError(deleteError);
    if (payload.options.length > 0) {
      const { error: insertError } = await client
        .from("question_bank_question_options")
        .insert(payload.options.map((option) => ({ ...option, question_id: questionId })));
      throwSupabaseError(insertError);
    }

    await writeAuditLog(adminId, "update", "question", questionId, { status: payload.question.status, nodeId: payload.question.node_id });
    return getQuestionPreview(questionId, { includeAnswers: true });
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return updateLegacyQuestion(questionId, body, adminId);
  }
}

export async function setQuestionStatus(questionId, status, adminId) {
  try {
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
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return setLegacyQuestionStatus(questionId, status, adminId);
  }
}

export async function deleteQuestion(questionId, adminId) {
  try {
    requiredUuid(questionId, "Invalid question.");
    const client = getSupabaseAdminClient();
    const { data: question, error: findError } = await client
      .from("question_bank_questions")
      .select("id,node_id,question_text")
      .eq("id", questionId)
      .single();
    throwSupabaseError(findError);

    await deleteQuestionRows([questionId]);
    await writeAuditLog(adminId, "delete", "question", questionId, {
      nodeId: question.node_id,
      text: String(question.question_text || "").slice(0, 160),
    });
    return { id: questionId };
  } catch (error) {
    if (!isMissingExamHierarchyError(error)) throw error;
    return deleteLegacyQuestion(questionId, adminId);
  }
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
    nodeId: question.node_id,
    classId: question.class_id || question.node_id,
    subjectId: question.subject_id || question.node_id,
    chapterId: question.chapter_id || question.node_id,
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

export async function previewChapterQuestionImport({ chapterId, fileContent, fileType }) {
  const node = await findNode(chapterId);
  if (!fileContent || typeof fileContent !== "string" || !fileContent.trim()) throwRequest("File content is empty.");
  const rawParsedList = parseQuestionImport(fileContent, fileType);
  const itemsWithDuplicates = await detectDuplicatesForChapter(chapterId, rawParsedList);
  const items = itemsWithDuplicates.map((item, index) => {
    const { isValid, errors } = validateImportedQuestion(item);
    return {
      index: index + 1,
      questionText: item.questionText,
      options: item.options,
      answer: item.answer,
      difficulty: item.difficulty || "medium",
      marks: item.marks || 1,
      explanation: item.explanation || "",
      status: item.status || "active",
      isValid,
      isDuplicate: item.isDuplicate || false,
      errors: [...errors, ...(item.dupReasons || [])],
    };
  });

  return {
    chapter: { id: node.id, name: node.name, subjectId: node.parentId || node.id, subjectName: "", classId: node.categoryId },
    totalCount: items.length,
    validCount: items.filter((i) => i.isValid).length,
    invalidCount: items.filter((i) => !i.isValid).length,
    duplicateCount: items.filter((i) => i.isDuplicate).length,
    items,
  };
}

export async function importChapterQuestions({ chapterId, questions, adminId }) {
  const node = await findNode(chapterId);
  if (!Array.isArray(questions) || questions.length === 0) throwRequest("No questions provided for import.");
  if (questions.length > 500) throwRequest("Bulk import is limited to 500 questions per batch.");

  const validPayloads = questions.map((raw, index) => {
    const validation = validateImportedQuestion(raw);
    if (!validation.isValid) throwRequest(`Question #${index + 1} is invalid: ${validation.errors.join(", ")}`);
    const labels = ["A", "B", "C", "D"];
    const correctLetter = String(raw.answer).trim().toUpperCase();
    return {
      question: {
        node_id: node.id,
        question_type: "mcq",
        question_text: String(raw.questionText).trim(),
        difficulty: ["easy", "medium", "hard"].includes(String(raw.difficulty).toLowerCase()) ? String(raw.difficulty).toLowerCase() : "medium",
        marks: Number(raw.marks) || 1,
        explanation: raw.explanation ? String(raw.explanation).trim() : null,
        source: "bulk_import",
        status: ["draft", "active", "inactive"].includes(String(raw.status).toLowerCase()) ? String(raw.status).toLowerCase() : "active",
        created_by: adminId,
        updated_by: adminId,
      },
      options: labels.map((label, idx) => ({
        option_text: String(raw.options[label]).trim(),
        is_correct: label === correctLetter,
        display_order: idx,
      })),
    };
  });

  const client = getSupabaseAdminClient();
  const { data: insertedQuestions, error: insertQuestionsErr } = await client
    .from("question_bank_questions")
    .insert(validPayloads.map((payload) => payload.question))
    .select("id");
  throwSupabaseError(insertQuestionsErr);

  const allOptionRecords = [];
  insertedQuestions.forEach((insertedQ, idx) => {
    validPayloads[idx].options.forEach((option) => allOptionRecords.push({ ...option, question_id: insertedQ.id }));
  });
  if (allOptionRecords.length > 0) {
    const { error: insertOptionsErr } = await client.from("question_bank_question_options").insert(allOptionRecords);
    throwSupabaseError(insertOptionsErr);
  }

  await writeAuditLog(adminId, "bulk_import", "node_questions", node.id, { count: insertedQuestions.length });
  return { importedCount: insertedQuestions.length, chapterId: node.id, subjectId: node.parentId || node.id, classId: node.categoryId, nodeId: node.id };
}

export async function collectNodeAndDescendantIds(nodeId) {
  requiredUuid(nodeId, "Invalid node.");
  const nodes = await getAllExamNodes({ includeInactive: true });
  return collectDescendantIds(nodes, nodeId);
}

export function collectDescendantIds(nodes, nodeId) {
  const childrenByParent = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    childrenByParent.set(node.parentId, [...(childrenByParent.get(node.parentId) || []), node.id]);
  }
  const ids = [nodeId];
  const visited = new Set(ids);
  for (let index = 0; index < ids.length; index += 1) {
    for (const childId of childrenByParent.get(ids[index]) || []) {
      if (visited.has(childId)) throwHierarchyCycle();
      visited.add(childId);
      ids.push(childId);
    }
  }
  return ids;
}

function throwHierarchyCycle() {
  const error = new Error("Question bank hierarchy contains a cycle or duplicate node.");
  error.status = 409;
  error.code = "QUESTION_BANK_HIERARCHY_INVALID";
  throw error;
}

function throwReferencedContent() {
  const error = new Error("This content is referenced by self exam attempts. Deactivate it instead of deleting it.");
  error.status = 409;
  error.code = "QUESTION_BANK_CONTENT_IN_USE";
  throw error;
}

async function deleteQuestionsForNodes(nodeIds, adminId) {
  const uniqueNodeIds = [...new Set((nodeIds || []).filter(Boolean))];
  if (uniqueNodeIds.length === 0) return 0;
  const client = getSupabaseAdminClient();
  const { data: questions, error: questionError } = await client
    .from("question_bank_questions")
    .select("id")
    .in("node_id", uniqueNodeIds);
  throwSupabaseError(questionError);

  const questionIds = (questions || []).map((question) => question.id);
  if (questionIds.length === 0) return 0;

  await deleteQuestionRows(questionIds);
  await writeAuditLog(adminId, "delete_many", "question_bank_questions", null, {
    questionCount: questionIds.length,
    nodeCount: uniqueNodeIds.length,
  });
  return questionIds.length;
}

async function deleteQuestionRows(questionIds) {
  const uniqueQuestionIds = [...new Set((questionIds || []).filter(Boolean))];
  if (uniqueQuestionIds.length === 0) return;
  // A single PostgreSQL statement preserves RESTRICT protections for attempts.
  // Options/tags cascade only when the entire parent deletion succeeds.
  const { error } = await getSupabaseAdminClient()
    .from("question_bank_questions")
    .delete()
    .in("id", uniqueQuestionIds);
  if (error?.code === "23503") throwReferencedContent();
  throwSupabaseError(error);
}

async function assertNoSelfExamSessionsForNodes(nodeIds) {
  const uniqueNodeIds = [...new Set((nodeIds || []).filter(Boolean))];
  if (uniqueNodeIds.length === 0) return;
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_self_exam_sessions")
    .select("id")
    .in("node_id", uniqueNodeIds)
    .limit(1);
  throwSupabaseError(error);
  if (data?.length) throwReferencedContent();
}

async function getAllExamNodes({ includeInactive = false } = {}) {
  let query = getSupabaseAdminClient()
    .from("exam_nodes")
    .select("id,category_id,parent_id,name,slug,type,icon,color,description,display_order,is_active,metadata,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeNode);
}

async function assertCategoryPayload(body = {}) {
  const name = requiredText(body.name, "Category name is required.");
  return {
    name,
    slug: optionalText(body.slug) || slugify(name),
    icon: optionalText(body.icon),
    color: optionalText(body.color),
    description: optionalText(body.description),
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

async function assertNodePayload(body = {}, { existingNodeId = null } = {}) {
  const name = requiredText(body.name, "Node name is required.");
  const categoryId = requiredUuid(body.categoryId || body.category_id || body.classId || body.class_id, "Category is required.");
  const parentId = optionalUuid(body.parentId || body.parent_id, "Invalid parent.");
  if (parentId) {
    const parent = await findNode(parentId);
    if (parent.categoryId !== categoryId) throwRequest("Parent node must belong to the same category.");
    if (existingNodeId && parent.id === existingNodeId) throwRequest("A node cannot be its own parent.");
    if (existingNodeId && (await collectNodeAndDescendantIds(existingNodeId)).includes(parentId)) {
      throwRequest("A node cannot be moved under its descendant.");
    }
  } else {
    await assertCategoryExists(categoryId);
  }
  return {
    category_id: categoryId,
    parent_id: parentId,
    name,
    slug: optionalText(body.slug) || slugify(name),
    type: normalizeEnum(body.type || "topic", NODE_TYPES, "Invalid node type."),
    icon: optionalText(body.icon),
    color: optionalText(body.color),
    description: optionalText(body.description),
    display_order: integerValue(body.displayOrder ?? body.display_order ?? 0, "Display order must be a whole number."),
    is_active: body.isActive ?? body.is_active ?? true,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };
}

async function assertQuestionHierarchy(question = {}) {
  if (question.class_id && question.subject_id) {
    const subject = await findNode(question.subject_id).catch(() => null);
    if (subject && subject.categoryId && subject.categoryId !== question.class_id) {
      throwRequest("Subject does not belong to the selected class.");
    }
  }
  if (question.subject_id && question.chapter_id) {
    const chapter = await findNode(question.chapter_id).catch(() => null);
    if (chapter && chapter.parentId && chapter.parentId !== question.subject_id) {
      throwRequest("Chapter does not belong to the selected subject.");
    }
  }
}

async function assertCategoryExists(categoryId) {
  const { data, error } = await getSupabaseAdminClient().from("exam_categories").select("id").eq("id", categoryId).single();
  throwSupabaseError(error);
  if (!data) throwRequest("Category not found.");
}

async function assertQuestionNode(nodeId) {
  const node = await findNode(nodeId);
  if (!node.isActive) throwRequest("Questions can only be attached to an active exam node.");
}

async function findCategory(categoryId) {
  if (!isUuid(categoryId)) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("exam_categories")
    .select("id,name,slug,icon,color,description,display_order,is_active,created_at,updated_at")
    .eq("id", categoryId)
    .maybeSingle();
  throwSupabaseError(error);
  return data ? serializeCategory(data) : null;
}

async function findNode(nodeId) {
  requiredUuid(nodeId, "Invalid node.");
  const { data, error } = await getSupabaseAdminClient()
    .from("exam_nodes")
    .select("id,category_id,parent_id,name,slug,type,icon,color,description,display_order,is_active,metadata,created_at,updated_at")
    .eq("id", nodeId)
    .single();
  throwSupabaseError(error);
  return serializeNode(data);
}

function parseQuestionImport(fileContent, fileType) {
  const normalizedFileType = String(fileType || "").trim().toLowerCase();
  if (normalizedFileType === "json") return parseJsonQuestions(fileContent);
  if (normalizedFileType === "csv") return parseCsvQuestions(fileContent);
  if (normalizedFileType === "md" || normalizedFileType === "markdown") return parseMarkdownQuestions(fileContent);
  throwRequest("Unsupported file format. Please upload JSON, CSV, or Markdown (.md).");
}

function inferTopLevelType(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("ssc") || normalized.includes("hsc")) return "level";
  if (normalized.includes("medical") || normalized.includes("engineering") || normalized.includes("versity") || normalized.includes("varsity")) return "admission_type";
  if (normalized.includes("class")) return "class";
  return "level";
}

function serializeCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon || "",
    color: row.color || "",
    description: row.description || "",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeCategoryAsClass(row) {
  const category = serializeCategory(row);
  return { ...category, kind: "category" };
}

function serializeNode(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    icon: row.icon || "",
    color: row.color || "",
    description: row.description || "",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeSubjectCompat(node, classId = null) {
  return {
    id: node.id,
    classId: classId || node.categoryId,
    categoryId: node.categoryId,
    parentId: node.parentId,
    name: node.name,
    slug: node.slug,
    code: node.metadata?.code || node.type,
    type: node.type,
    displayOrder: node.displayOrder,
    isActive: node.isActive,
  };
}

function serializeChapterCompat(node, subjectId = null) {
  return {
    id: node.id,
    subjectId: subjectId || node.parentId || node.categoryId,
    categoryId: node.categoryId,
    parentId: node.parentId,
    name: node.name,
    slug: node.slug,
    chapterNumber: node.metadata?.chapterNumber ?? null,
    type: node.type,
    displayOrder: node.displayOrder,
    isActive: node.isActive,
  };
}

async function getLegacyExamTree({ includeInactive = false } = {}) {
  const classes = await getLegacyClasses({ includeInactive });
  const tree = [];
  for (const item of classes) {
    const subjects = await getLegacySubjectsByClass(item.id, { includeInactive });
    const children = [];
    for (const subject of subjects) {
      const chapters = await getLegacyChaptersBySubject(subject.id, { includeInactive });
      children.push({
        id: subject.id,
        categoryId: item.id,
        parentId: null,
        name: subject.name,
        slug: subject.slug,
        type: "subject",
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
          type: "chapter",
          color: "#2563eb",
          displayOrder: chapter.displayOrder,
          isActive: chapter.isActive,
          metadata: { chapterNumber: chapter.chapterNumber ?? null },
          children: [],
        })),
      });
    }
    tree.push({ ...item, color: item.color || "#2563eb", children });
  }
  return tree;
}

async function getLegacyClasses({ includeInactive = false } = {}) {
  let query = getSupabaseAdminClient()
    .from("question_bank_classes")
    .select("id,name,slug,display_order,is_active,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map((row) => ({ ...serializeLegacyClass(row), kind: "category" }));
}

async function getLegacySubjectsByClass(classId, { includeInactive = false } = {}) {
  requiredUuid(classId, "Invalid class.");
  let query = getSupabaseAdminClient()
    .from("question_bank_subjects")
    .select("id,class_id,name,slug,code,display_order,is_active,created_at,updated_at")
    .eq("class_id", classId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeLegacySubject);
}

async function getLegacyChaptersBySubject(subjectId, { includeInactive = false } = {}) {
  requiredUuid(subjectId, "Invalid subject.");
  let query = getSupabaseAdminClient()
    .from("question_bank_chapters")
    .select("id,subject_id,name,slug,chapter_number,display_order,is_active,created_at,updated_at")
    .eq("subject_id", subjectId)
    .order("display_order", { ascending: true })
    .order("chapter_number", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map(serializeLegacyChapter);
}

async function createLegacyClass(body, adminId) {
  const payload = assertClassPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "question_bank_class", data.id, { name: data.name });
  return { ...serializeLegacyClass(data), kind: "category" };
}

async function updateLegacyClass(classId, body, adminId) {
  requiredUuid(classId, "Invalid class.");
  const payload = assertClassPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", classId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "question_bank_class", classId, { name: data.name });
  return { ...serializeLegacyClass(data), kind: "category" };
}

async function setLegacyClassStatus(classId, isActive, adminId) {
  requiredUuid(classId, "Invalid class.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_classes")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", classId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "question_bank_class", classId, { isActive: data.is_active });
  return { ...serializeLegacyClass(data), kind: "category" };
}

async function createLegacySubject(body, adminId) {
  const payload = assertSubjectPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "question_bank_subject", data.id, { name: data.name });
  return serializeLegacySubject(data);
}

async function updateLegacySubject(subjectId, body, adminId) {
  requiredUuid(subjectId, "Invalid subject.");
  const payload = assertSubjectPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", subjectId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "question_bank_subject", subjectId, { name: data.name });
  return serializeLegacySubject(data);
}

async function setLegacySubjectStatus(subjectId, isActive, adminId) {
  requiredUuid(subjectId, "Invalid subject.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", subjectId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "question_bank_subject", subjectId, { isActive: data.is_active });
  return serializeLegacySubject(data);
}

async function createLegacyChapter(body, adminId) {
  const payload = assertChapterPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .insert([payload])
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "create", "question_bank_chapter", data.id, { name: data.name });
  return serializeLegacyChapter(data);
}

async function updateLegacyChapter(chapterId, body, adminId) {
  requiredUuid(chapterId, "Invalid chapter.");
  const payload = assertChapterPayload(body);
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", chapterId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "update", "question_bank_chapter", chapterId, { name: data.name });
  return serializeLegacyChapter(data);
}

async function setLegacyChapterStatus(chapterId, isActive, adminId) {
  requiredUuid(chapterId, "Invalid chapter.");
  const { data, error } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", chapterId)
    .select("*")
    .single();
  throwSupabaseError(error);
  await writeAuditLog(adminId, "set_status", "question_bank_chapter", chapterId, { isActive: data.is_active });
  return serializeLegacyChapter(data);
}

async function createLegacyNode(body, adminId) {
  if (body.parentId || body.parent_id) {
    return createLegacyChapter({
      ...body,
      subjectId: body.parentId || body.parent_id,
    }, adminId);
  }
  return createLegacySubject({
    ...body,
    classId: body.categoryId || body.category_id || body.classId || body.class_id,
  }, adminId);
}

async function updateLegacyNode(nodeId, body, adminId) {
  const kind = await getLegacyNodeKind(nodeId);
  if (kind === "chapter") {
    return updateLegacyChapter(nodeId, {
      ...body,
      subjectId: body.parentId || body.parent_id || body.subjectId || body.subject_id,
    }, adminId);
  }
  return updateLegacySubject(nodeId, {
    ...body,
    classId: body.categoryId || body.category_id || body.classId || body.class_id,
  }, adminId);
}

async function setLegacyNodeStatus(nodeId, isActive, adminId) {
  const kind = await getLegacyNodeKind(nodeId);
  return kind === "chapter"
    ? setLegacyChapterStatus(nodeId, isActive, adminId)
    : setLegacySubjectStatus(nodeId, isActive, adminId);
}

async function searchLegacyQuestions(filters = {}, { includeAnswers = false, studentSafe = false } = {}) {
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const optionColumns = includeAnswers ? "id,option_text,is_correct,display_order" : "id,option_text,display_order";
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

  if (filters.chapterId || filters.chapter_id) query = query.eq("chapter_id", requiredUuid(filters.chapterId || filters.chapter_id, "Invalid chapter."));
  else if (filters.subjectId || filters.subject_id) query = query.eq("subject_id", requiredUuid(filters.subjectId || filters.subject_id, "Invalid subject."));
  else if (filters.classId || filters.class_id) query = query.eq("class_id", requiredUuid(filters.classId || filters.class_id, "Invalid class."));
  else if (filters.nodeId || filters.node_id) {
    const filter = await getLegacyQuestionScope(filters.nodeId || filters.node_id);
    query = query.eq(filter.column, filter.id);
  }
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

async function getLegacyQuestionPreview(questionId, { includeAnswers = false } = {}) {
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

async function createLegacyQuestion(body, adminId) {
  const payload = assertLegacyQuestionPayload(body);
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
  await writeAuditLog(adminId, "create", "question_bank_question", question.id, { text: question.question_text });
  return getLegacyQuestionPreview(question.id, { includeAnswers: true });
}

async function updateLegacyQuestion(questionId, body, adminId) {
  requiredUuid(questionId, "Invalid question.");
  const payload = assertLegacyQuestionPayload(body);
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
  return getLegacyQuestionPreview(questionId, { includeAnswers: true });
}

async function setLegacyQuestionStatus(questionId, status, adminId) {
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

async function deleteLegacyNode(nodeId, adminId) {
  requiredUuid(nodeId, "Invalid item.");
  const { data: subject, error: subjectError } = await getSupabaseAdminClient()
    .from("question_bank_subjects")
    .select("id")
    .eq("id", nodeId)
    .maybeSingle();
  throwSupabaseError(subjectError);
  if (subject) return deleteLegacySubject(nodeId, adminId);

  const { data: chapter, error: chapterError } = await getSupabaseAdminClient()
    .from("question_bank_chapters")
    .select("id")
    .eq("id", nodeId)
    .maybeSingle();
  throwSupabaseError(chapterError);
  if (chapter) return deleteLegacyChapter(nodeId, adminId);
  throwRequest("Item not found.");
}

async function deleteLegacyClass(classId, adminId) {
  requiredUuid(classId, "Invalid class.");
  await deleteLegacyRows({ classId });
  const { error } = await getSupabaseAdminClient().from("question_bank_classes").delete().eq("id", classId);
  throwSupabaseError(error);
  await writeAuditLog(adminId, "delete", "question_bank_class", classId);
  return { id: classId };
}

async function deleteLegacySubject(subjectId, adminId) {
  requiredUuid(subjectId, "Invalid subject.");
  await deleteLegacyRows({ subjectId });
  const { error } = await getSupabaseAdminClient().from("question_bank_subjects").delete().eq("id", subjectId);
  throwSupabaseError(error);
  await writeAuditLog(adminId, "delete", "question_bank_subject", subjectId);
  return { id: subjectId };
}

async function deleteLegacyChapter(chapterId, adminId) {
  requiredUuid(chapterId, "Invalid chapter.");
  await deleteLegacyRows({ chapterId });
  const { error } = await getSupabaseAdminClient().from("question_bank_chapters").delete().eq("id", chapterId);
  throwSupabaseError(error);
  await writeAuditLog(adminId, "delete", "question_bank_chapter", chapterId);
  return { id: chapterId };
}

async function deleteLegacyQuestion(questionId, adminId) {
  requiredUuid(questionId, "Invalid question.");
  const { data: question, error: findError } = await getSupabaseAdminClient()
    .from("question_bank_questions")
    .select("id,question_text")
    .eq("id", questionId)
    .single();
  throwSupabaseError(findError);
  await deleteQuestionRows([questionId]);
  await writeAuditLog(adminId, "delete", "question", questionId, {
    text: String(question.question_text || "").slice(0, 160),
  });
  return { id: questionId };
}

async function deleteLegacyRows({ classId = null, subjectId = null, chapterId = null } = {}) {
  const client = getSupabaseAdminClient();
  let questionQuery = client.from("question_bank_questions").select("id");
  let sessionQuery = client.from("question_bank_self_exam_sessions").select("id");
  if (chapterId) {
    questionQuery = questionQuery.eq("chapter_id", chapterId);
    sessionQuery = sessionQuery.eq("chapter_id", chapterId);
  } else if (subjectId) {
    questionQuery = questionQuery.eq("subject_id", subjectId);
    sessionQuery = sessionQuery.eq("subject_id", subjectId);
  } else if (classId) {
    questionQuery = questionQuery.eq("class_id", classId);
    sessionQuery = sessionQuery.eq("class_id", classId);
  }

  const [{ data: questions, error: questionError }, { data: sessions, error: sessionError }] = await Promise.all([questionQuery, sessionQuery]);
  throwSupabaseError(questionError);
  throwSupabaseError(sessionError);
  const questionIds = (questions || []).map((question) => question.id);
  const sessionIds = (sessions || []).map((session) => session.id);

  await deleteSessionsByIds(sessionIds);
  await deleteQuestionRows(questionIds);

  if (subjectId) {
    const { error } = await client.from("question_bank_chapters").delete().eq("subject_id", subjectId);
    throwSupabaseError(error);
  }
  if (classId) {
    const { data: subjects, error: subjectError } = await client.from("question_bank_subjects").select("id").eq("class_id", classId);
    throwSupabaseError(subjectError);
    const subjectIds = (subjects || []).map((subject) => subject.id);
    if (subjectIds.length > 0) {
      const { error: chapterError } = await client.from("question_bank_chapters").delete().in("subject_id", subjectIds);
      throwSupabaseError(chapterError);
    }
    const { error } = await client.from("question_bank_subjects").delete().eq("class_id", classId);
    throwSupabaseError(error);
  }
}

async function deleteSessionsByIds(sessionIds) {
  // Preserve legacy attempts rather than deleting their answers and results.
  if ((sessionIds || []).filter(Boolean).length > 0) throwReferencedContent();
}

async function getLegacyQuestionScope(id) {
  requiredUuid(id, "Invalid selection.");
  const client = getSupabaseAdminClient();
  const tables = [
    ["question_bank_chapters", "chapter_id"],
    ["question_bank_subjects", "subject_id"],
    ["question_bank_classes", "class_id"],
  ];
  for (const [table, column] of tables) {
    const { data, error } = await client.from(table).select("id").eq("id", id).maybeSingle();
    throwSupabaseError(error);
    if (data) return { column, id };
  }
  throwRequest("Question bank selection not found.");
}

async function getLegacyNodeKind(id) {
  requiredUuid(id, "Invalid item.");
  const client = getSupabaseAdminClient();
  const { data: chapter, error: chapterError } = await client.from("question_bank_chapters").select("id").eq("id", id).maybeSingle();
  throwSupabaseError(chapterError);
  if (chapter) return "chapter";
  const { data: subject, error: subjectError } = await client.from("question_bank_subjects").select("id").eq("id", id).maybeSingle();
  throwSupabaseError(subjectError);
  if (subject) return "subject";
  throwRequest("Item not found.");
}

function assertLegacyQuestionPayload(body = {}) {
  const payload = {
    class_id: requiredUuid(body.classId || body.class_id, "Class is required."),
    subject_id: requiredUuid(body.subjectId || body.subject_id, "Subject is required."),
    chapter_id: optionalUuid(body.chapterId || body.chapter_id, "Invalid chapter."),
    question_type: normalizeEnum(body.questionType || body.question_type, QUESTION_TYPES, "Invalid question type."),
    question_text: requiredText(body.questionText || body.question_text, "Question text is required."),
    difficulty: normalizeEnum(body.difficulty, DIFFICULTIES, "Invalid difficulty."),
    marks: positiveNumber(body.marks, "Marks must be greater than zero."),
    explanation: optionalText(body.explanation),
    source: optionalText(body.source),
    status: normalizeEnum(body.status || "draft", STATUSES, "Invalid status."),
  };
  const options = Array.isArray(body.options) ? body.options : [];
  if (payload.question_type !== "mcq") return { question: payload, options: [] };
  if (options.length < 2) throwRequest("MCQ questions require at least two options.");
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

function serializeLegacyClass(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: "",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLegacySubject(row) {
  return {
    id: row.id,
    classId: row.class_id,
    categoryId: row.class_id,
    parentId: null,
    name: row.name,
    slug: row.slug,
    code: row.code || "",
    type: "subject",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLegacyChapter(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    categoryId: "",
    parentId: row.subject_id,
    name: row.name,
    slug: row.slug,
    chapterNumber: row.chapter_number,
    type: "chapter",
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLegacyNode(row) {
  if (row.subjectId) {
    return {
      id: row.id,
      categoryId: row.categoryId || "",
      parentId: row.parentId,
      name: row.name,
      slug: row.slug,
      type: "chapter",
      icon: "",
      color: "#2563eb",
      description: "",
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      metadata: { chapterNumber: row.chapterNumber ?? null },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  return {
    id: row.id,
    categoryId: row.categoryId || row.classId,
    parentId: null,
    name: row.name,
    slug: row.slug,
    type: "subject",
    icon: "",
    color: "#10b981",
    description: "",
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    metadata: { code: row.code || "" },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}



async function writeAuditLog(adminId, action, entityType, entityId, metadata = {}) {
  const { error } = await getSupabaseAdminClient()
    .from("question_bank_admin_audit_logs")
    .insert([{ admin_id: adminId, action, entity_type: entityType, entity_id: entityId, metadata }]);
  throwSupabaseError(error);
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
