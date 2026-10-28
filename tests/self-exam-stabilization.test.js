import assert from "node:assert/strict";
import test, { beforeEach, after } from "node:test";
process.env.CHEATLOCK_SKIP_DOTENV = "true";
process.env.SUPABASE_URL = "https://offline-self-exam.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-key";
const bank = await import("../backend/src/services/questionBankService.js");
const service = await import("../backend/src/services/selfExamService.js");
const { getSupabaseAdminClient } = await import("../backend/src/services/supabaseClient.js");
const client = getSupabaseAdminClient();
const originalFrom = client.from;
after(() => { client.from = originalFrom; });
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
let calls;
let respond;
beforeEach(() => {
  calls = [];
  respond = () => { throw new Error("Unexpected database operation"); };
  // Every query terminates in this mock; no database HTTP calls are made.
  client.from = (table) => {
    const op = { table, steps: [] };
    const query = new Proxy({}, { get(_target, key) {
      if (key === "then") return (resolve, reject) => Promise.resolve().then(() => {
        calls.push(op);
        return respond(op);
      }).then(resolve, reject);
      return (...args) => { op.steps.push([key, ...args]); return query; };
    } });
    return query;
  };
});
test("explicit zero settings are rejected rather than silently defaulted", () => {
  for (const field of ["durationMinutes", "duration_minutes", "questionCount", "question_count"]) {
    assert.throws(() => service.normalizeSelfExamConfig({ nodeId: A, [field]: 0 }), /must be between/);
  }
  const config = service.normalizeSelfExamConfig({ nodeId: A });
  assert.equal(config.duration_minutes, 10);
  assert.equal(config.question_count, 10);
  for (const value of [-1, 1.5, "bad", Infinity, 181]) {
    assert.throws(() => service.normalizeSelfExamConfig({ nodeId: A, durationMinutes: value }));
  }
  assert.throws(() => service.normalizeSelfExamConfig({ nodeId: A, questionCount: 101 }));
  assert.throws(() => service.normalizeSelfExamConfig({ nodeId: A, difficultyMode: "other" }));
});
test("question deletion never deletes student answers or mappings", async () => {
  respond = (op) => {
    if (op.table === "question_bank_questions" && op.steps[0][0] === "select") return { data: { id: A } };
    if (op.table === "question_bank_questions" && op.steps[0][0] === "delete") return { error: { code: "23503", message: "referenced question" } };
    throw new Error(`Unexpected mutation of ${op.table}`);
  };
  await assert.rejects(bank.deleteQuestion(A, "admin"), (error) => error.status === 409);
  assert.deepEqual(calls.map((op) => op.table), ["question_bank_questions", "question_bank_questions"]);
});
test("node deletion refuses existing attempts before deleting content", async () => {
  respond = (op) => {
    if (op.table === "exam_nodes") return { data: [{ id: A, parent_id: null, category_id: C }] };
    if (op.table === "question_bank_self_exam_sessions" && op.steps[0][0] === "select") return { data: [{ id: B }] };
    throw new Error(`Unexpected mutation of ${op.table}`);
  };
  await assert.rejects(bank.deleteExamNode(A, "admin"), (error) => error.status === 409);
  assert.equal(calls.some((op) => op.steps.some(([step]) => step === "delete")), false);
});
test("unreferenced question uses one parent delete then an audit write", async () => {
  respond = (op) => {
    if (op.table === "question_bank_questions" && op.steps[0][0] === "select") return { data: { id: A } };
    if (op.table === "question_bank_questions" && op.steps[0][0] === "delete") return { error: null };
    if (op.table === "question_bank_admin_audit_logs") return { error: null };
    throw new Error(`Unexpected mutation of ${op.table}`);
  };
  assert.deepEqual(await bank.deleteQuestion(A, "admin"), { id: A });
  assert.equal(calls.filter((op) => op.steps[0][0] === "delete").length, 1);
});
test("ownership is required for read, answer, start, submit and result", async () => {
  respond = (op) => {
    assert.equal(op.table, "question_bank_self_exam_sessions");
    assert.ok(op.steps.some(([key, field, value]) => key === "eq" && field === "student_id" && value === "student-a"));
    return { error: { code: "PGRST116", message: "No owned session" } };
  };
  for (const action of [service.getSelfExamSession, service.startSelfExamSession, service.saveSelfExamAnswer, service.submitSelfExam, service.getSelfExamResult]) {
    await assert.rejects(action("student-a", A, {}), (error) => error.code === "PGRST116" && error.message === "Question Bank request failed.");
  }
  assert.equal(calls.length, 5);
});

test("bound sessions require the immutable account even with the same mutable identifier", async () => {
  respond = (op) => {
    if (op.table === "question_bank_self_exam_sessions") return { data: {
      id:A,student_id:"student-a",bulk_owner_account_id:"aaaaaaaaaaaaaaaaaaaaaaaa",status:"in_progress",expires_at:"2999-01-01T00:00:00Z"
    } };
    return { data: [] };
  };
  await assert.rejects(service.getSelfExamSession({sub:"bbbbbbbbbbbbbbbbbbbbbbbb",identifier:"student-a"},A), error=>error.status===404);
  const payload=await service.getSelfExamSession({sub:"aaaaaaaaaaaaaaaaaaaaaaaa",identifier:"student-a"},A);
  assert.equal(payload.session.bulkSubmissionVersion,1);
});

test("new-session immutable ownership is captured only behind the backend flag", async () => {
  const previous=process.env.SELF_EXAM_BULK_V1_ENABLED;
  const principal={sub:"aaaaaaaaaaaaaaaaaaaaaaaa",identifier:"student-a"};
  try {
    for (const enabled of [false,true]) {
      process.env.SELF_EXAM_BULK_V1_ENABLED=String(enabled);
      respond=op=>{
        if(op.table==="exam_nodes")return {data:{id:A,is_active:true}};
        const insert=op.steps.find(([key])=>key==="insert")[1][0];
        assert.equal(insert.student_id,principal.identifier);
        assert.equal(insert.bulk_owner_account_id,enabled?principal.sub:undefined);
        return {data:{id:B,...insert}};
      };
      const session=await service.createSelfExamSession(principal,{nodeId:A});
      assert.equal(session.bulkSubmissionVersion,enabled?1:null);
    }
  } finally {if(previous===undefined)delete process.env.SELF_EXAM_BULK_V1_ENABLED;else process.env.SELF_EXAM_BULK_V1_ENABLED=previous;}
});
test("expired session rejects answer changes before answer mutation", async () => {
  respond = (op) => {
    if (op.steps[0][0] === "select") return { data: { id: A, status: "in_progress", expires_at: "2000-01-01T00:00:00Z" } };
    if (op.table === "question_bank_self_exam_sessions" && op.steps[0][0] === "update") return { error: null };
    throw new Error(`Unexpected write to ${op.table}`);
  };
  await assert.rejects(service.saveSelfExamAnswer("student-a", A, { questionId: B, selectedOptionId: C }), (error) => error.code === "SESSION_NOT_ACTIVE");
  assert.equal(calls.some((op) => op.table === "question_bank_self_exam_answers"), false);
});
test("active payload hides keys, explanations and answer scoring fields", async () => {
  respond = (op) => {
    if (op.table === "question_bank_self_exam_sessions") return { data: { id: A, status: "in_progress", expires_at: "2999-01-01T00:00:00Z" } };
    if (op.table === "question_bank_self_exam_session_questions") return { data: [{ display_order: 1, marks: 2, question_bank_questions: {
      id: B, question_text: "Question", explanation: "secret explanation", question_bank_question_options: [{ id: C, option_text: "Answer", is_correct: true }],
    } }] };
    if (op.table === "question_bank_self_exam_answers") return { data: [{ id: C, question_id: B, is_correct: true, marks_awarded: 2 }] };
    throw new Error("Unexpected operation");
  };
  const payload = await service.getSelfExamSession("student-a", A);
  assert.equal(payload.questions[0].explanation, "");
  assert.doesNotMatch(JSON.stringify(payload), /secret explanation|is_correct|isCorrect|marksAwarded/);
});
test("descendant traversal is bounded, ordered and rejects cycles", () => {
  const nodes = [{ id: A, parentId: null }, { id: B, parentId: A }, { id: C, parentId: B }];
  assert.deepEqual(bank.collectDescendantIds(nodes, A), [A, B, C]);
  assert.throws(() => bank.collectDescendantIds([{ id: A, parentId: B }, { id: B, parentId: A }], A), (error) => error.code === "QUESTION_BANK_HIERARCHY_INVALID");
  assert.throws(() => bank.collectDescendantIds([{ id: A, parentId: A }], A));
  const large = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), parentId: index ? String(index - 1) : null }));
  assert.equal(bank.collectDescendantIds(large, "0").length, 5000);
});
test("node path rejects cyclic stored ancestry", async () => {
  respond = () => ({ data: [{ id: A, parent_id: B }, { id: B, parent_id: A }] });
  await assert.rejects(bank.getNodePath(A), (error) => error.code === "QUESTION_BANK_HIERARCHY_INVALID");
});
test("active answers cannot select another question's option", async () => {
  respond = (op) => {
    if (op.table === "question_bank_self_exam_sessions") return { data: { id: A, status: "in_progress", expires_at: "2999-01-01T00:00:00Z" } };
    if (op.table === "question_bank_self_exam_session_questions") return { data: { id: B } };
    if (op.table === "question_bank_question_options") {
      assert.ok(op.steps.some(([key, field, value]) => key === "eq" && field === "question_id" && value === B));
      return { data: null };
    }
    throw new Error("Unexpected write");
  };
  await assert.rejects(service.saveSelfExamAnswer("student-a", A, { questionId: B, selectedOptionId: C }), /does not belong/);
});
test("repeated start of a running session does not initialize another timer", async () => {
  respond = (op) => {
    assert.equal(op.steps[0][0], "select");
    if (op.table === "question_bank_self_exam_sessions") return { data: { id: A, status: "in_progress", expires_at: "2999-01-01T00:00:00Z" } };
    return { data: [] };
  };
  const payload = await service.startSelfExamSession("student-a", A);
  assert.equal(payload.session.expiresAt, "2999-01-01T00:00:00Z");
});
test("scoring uses allocated marks, returns counts and repeated submit is idempotent", async () => {
  const rows = [
    { display_order: 1, marks: 2, question_bank_questions: { id: A, question_bank_question_options: [{ id: A, is_correct: true }] } },
    { display_order: 2, marks: 3, question_bank_questions: { id: B, question_bank_question_options: [{ id: B, is_correct: true }] } },
    { display_order: 3, marks: 5, question_bank_questions: { id: C, question_bank_question_options: [{ id: C, is_correct: true }] } },
  ];
  const session = { id: A, status: "in_progress", expires_at: "2999-01-01T00:00:00Z" };
  const answers = [{ id: A, question_id: A, selected_option_id: A }, { id: B, question_id: B, selected_option_id: A }];
  respond = (op) => {
    if (op.table === "question_bank_self_exam_sessions") {
      if (op.steps[0][0] === "update") Object.assign(session, op.steps[0][1]);
      return { data: { ...session } };
    }
    if (op.table === "question_bank_self_exam_session_questions") return { data: rows };
    if (op.table === "question_bank_self_exam_answers") {
      if (op.steps[0][0] === "update") {
        const patch = op.steps[0][1];
        Object.assign(answers.find((a) => a.id === patch.id), patch);
      }
      return { data: answers };
    }
    throw new Error("Unexpected query");
  };
  const first = await service.submitSelfExam("student-a", A);
  assert.deepEqual(first.result, { score: 2, totalMarks: 10, percentage: 20, correctCount: 1, incorrectCount: 1, unansweredCount: 1 });
  const writes = calls.filter((op) => op.steps[0][0] === "update").length;
  const repeated = await service.submitSelfExam("student-a", A);
  assert.deepEqual(repeated.result, first.result);
  assert.equal(calls.filter((op) => op.steps[0][0] === "update").length, writes);
  await assert.rejects(service.saveSelfExamAnswer("student-a", A, { questionId: B }), (error) => error.status === 410);
});
test("legacy result counts stored blank rows as unanswered during mixed-client recovery", async () => {
  const rows=[A,B,C].map((id,index)=>({display_order:index+1,marks:1,question_bank_questions:{id,question_bank_question_options:[{id,is_correct:true}]}}));
  const answers=[{id:A,question_id:A,selected_option_id:A,is_correct:true},{id:B,question_id:B,selected_option_id:A,is_correct:false},{id:C,question_id:C,selected_option_id:null,is_correct:false}];
  respond=op=>{
    assert.equal(op.steps[0][0],"select");
    if(op.table==="question_bank_self_exam_sessions")return {data:{id:A,status:"submitted",score:1,total_marks:3}};
    if(op.table==="question_bank_self_exam_session_questions")return {data:rows};
    if(op.table==="question_bank_self_exam_answers")return {data:answers};
    throw Error("Unexpected query");
  };
  const result=await service.getSelfExamResult("student-a",A);
  assert.deepEqual(result.result,{score:1,totalMarks:3,percentage:33,correctCount:1,incorrectCount:1,unansweredCount:1});
});

test("authentication rejects missing, invalid, revoked and non-student tokens", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const { requireAuth, requireRole } = await import("../backend/src/middleware/auth.js");
  const { User } = await import("../backend/src/models/User.js");
  process.env.JWT_SECRET = "offline-stabilization-test-secret";
  const originalFind = User.findById;
  const invoke = (middleware, req) => new Promise((resolve) => middleware(req, {}, resolve));
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ identifier: "student-a", role: "STUDENT", status: "ACTIVE", tokenVersion: 2 }) }) });
    assert.equal((await invoke(requireAuth, { headers: {} })).status, 401);
    assert.equal((await invoke(requireAuth, { headers: { authorization: "Bearer invalid" } })).status, 401);
    const revoked = jwt.sign({ sub: "offline-user", tokenVersion: 1 }, process.env.JWT_SECRET);
    assert.equal((await invoke(requireAuth, { headers: { authorization: `Bearer ${revoked}` } })).status, 401);
    assert.equal((await invoke(requireRole("STUDENT"), { user: { role: "TEACHER" } })).status, 403);
    const token = jwt.sign({ sub: "offline-user", tokenVersion: 2 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` }, body: { studentId: "student-b" } };
    assert.equal(await invoke(requireAuth, req), undefined);
    assert.equal(req.user.identifier, "student-a");
    assert.equal(await invoke(requireRole("STUDENT"), req), undefined);
    // Existing global admin bypass is deliberately preserved and documented.
    assert.equal(await invoke(requireRole("STUDENT"), { user: { role: "SUPER_ADMIN" } }), undefined);
  } finally { User.findById = originalFind; }
});
test("legacy category deletion preserves existing attempts", async () => {
  respond = (op) => {
    if (op.table === "exam_nodes") return { error: { code: "PGRST205", message: "Missing exam_nodes" } };
    if (op.table === "question_bank_questions") return { data: [] };
    if (op.table === "question_bank_self_exam_sessions") return { data: [{ id: B }] };
    throw new Error(`Unexpected mutation of ${op.table}`);
  };
  await assert.rejects(bank.deleteClass(A, "admin"), (error) => error.code === "QUESTION_BANK_CONTENT_IN_USE");
  assert.equal(calls.some((op) => op.steps[0][0] === "delete"), false);
});
test("moving a node under its descendant is rejected before mutation", async () => {
  respond = (op) => {
    assert.equal(op.table, "exam_nodes");
    assert.equal(op.steps[0][0], "select");
    if (op.steps.some(([key]) => key === "single")) return { data: { id: B, parent_id: A, category_id: C } };
    return { data: [{ id: A, category_id: C }, { id: B, parent_id: A, category_id: C }] };
  };
  await assert.rejects(bank.updateExamNode(A, { name: "A", categoryId: C, parentId: B, type: "topic" }, "admin"), /descendant/);
});
