import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../backend/src/models/User.js";
import { Exam } from "../backend/src/models/Exam.js";
import { ExamSession } from "../backend/src/models/ExamSession.js";
import { Submission } from "../backend/src/models/Submission.js";
import { submissionsRouter } from "../backend/src/routes/submissions.js";
import { examsRouter } from "../backend/src/routes/exams.js";
import { submissionWarningCounts, submissionAnswers } from "../backend/src/services/submissionAdmission.js";
process.env.JWT_SECRET = "isolated-integration-regression-secret";
const examId = "64a100000000000000000201";
const submissionId = "64a100000000000000000401";
const users = [{ _id: "64a100000000000000000101", role: "STUDENT", identifier: "student-a" },
  { _id: "64a100000000000000000102", role: "TEACHER", identifier: "teacher" }];
const query = (value) => ({ select() { return this; }, sort() { return this; }, lean: async () => value, then: (a,b) => Promise.resolve(value).then(a,b) });
let exam, session, submission, writes, restores, conflict;
function mock(target, key, fn) { const previous = target[key]; restores.push(() => target[key] = previous); target[key] = fn; }
beforeEach(() => {
  restores = []; writes = 0; conflict = false; submission = null;
  exam = { _id: examId, assignedStudents: ["student-a"], createdBy: "teacher", questions: [{ type: "CQ", text: "Authoritative question" }] };
  session = { _id: "64a100000000000000000301", studentId: "student-a", examId, status: "IN_PROGRESS", startedAt: 123, deviceId: "device-a" };
  mock(User, "findById", (id) => query(users.find((user) => user._id === id)));
  mock(Exam, "findById", (id) => query(String(id) === examId ? exam : null));
  mock(Exam, "find", () => query([exam]));
  mock(Exam, "findOne", (filter) => query(Object.entries(filter).every(([key, value]) => Array.isArray(exam[key]) ? exam[key].includes(value) : exam[key] === value) ? exam : null));
  mock(ExamSession, "findOne", () => query(session));
  mock(ExamSession, "findOneAndUpdate", (filter, update, options) => {
    assert.notEqual(options?.upsert, true);
    if (conflict || filter.startedAt !== session.startedAt || filter.status !== session.status) return query(null);
    Object.assign(session, update.$set); return query(session);
  });
  mock(Submission, "findOne", () => query(submission));
  mock(Submission, "findOneAndUpdate", (_filter, update) => {
    writes++; submission ||= { _id: submissionId, studentId: "student-a", examId };
    Object.assign(submission, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) submission[key] = (submission[key] || 0) + value;
    return query(submission);
  });
});
afterEach(() => restores.reverse().forEach((restore) => restore()));
async function fixture(t) {
  const app = express(); app.use(express.json()); app.use("/submissions", submissionsRouter); app.use("/exams", examsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code, message: error.message }));
  const server = createServer(app); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  return async (body = {}, role = "STUDENT", path = "/submissions", method = "POST") => {
    const user = users.find((value) => value.role === role);
    const token = jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: method === "GET" ? undefined : JSON.stringify({ examId, ...body }) });
    return { status: response.status, body: await response.json() };
  };
}
const body = (extra = {}) => ({ attemptStartedAt: 123, deviceId: "device-a", answers: [{ questionIndex: 0, questionText: "forged", answerText: "Synthetic answer" }], ...extra });
test("unassigned students and staff cannot create submissions or warning records", async (t) => {
  const request = await fixture(t);
  assert.equal((await request(body(), "TEACHER")).status, 403);
  assert.equal((await request({}, "TEACHER", "/submissions/warnings")).status, 403);
  exam.assignedStudents = [];
  assert.equal((await request(body())).status, 403);
  assert.equal((await request({}, "STUDENT", "/submissions/warnings")).status, 403);
  assert.equal(writes, 0);
});
test("stale attempts, foreign devices, reset and locked sessions reject writes", async (t) => {
  const request = await fixture(t);
  for (const value of [body({ attemptStartedAt: 122 }), body({ deviceId: "other" }), body({ deviceId: "" })]) {
    assert.equal((await request(value)).status, 409);
  }
  for (const status of ["NOT_STARTED", "LOCKED", "RESET_BY_TEACHER"]) {
    session.status = status; assert.equal((await request(body())).status, 409);
  }
  assert.equal(writes, 0);
});
test("valid submission uses the authenticated student and server question text", async (t) => {
  const request = await fixture(t);
  const response = await request(body({ studentId: "other" }));
  assert.equal(response.status, 201);
  assert.equal(submission.studentId, "student-a");
  assert.equal(submission.answers[0].questionText, "Authoritative question");
  assert.equal(session.status, "SUBMITTED");
});
test("a lost-response retry cannot overwrite final answers or an existing grade", async (t) => {
  const request = await fixture(t); await request(body()); submission.grade = 88;
  const before = structuredClone(submission);
  assert.equal((await request(body({ answers: [] }))).status, 200);
  assert.deepEqual(submission, before); assert.equal(writes, 1);
});
test("malformed answer indexes, duplicate indexes and invalid counts are rejected before writes", async (t) => {
  const request = await fixture(t);
  for (const answers of [[{ questionIndex: 99, answerText: "x" }], [{ questionIndex: 0, answerText: "x" }, { questionIndex: 0, answerText: "y" }], {}]) {
    assert.equal((await request(body({ answers }))).status, 400);
  }
  assert.equal((await request(body({ appSwitchWarnings: -1 }))).status, 400);
  assert.equal((await request({ faceMissingWarnings: -2 }, "STUDENT", "/submissions/warnings")).status, 400);
  assert.equal(writes, 0);
});
test("finalized submissions cannot receive new warning increments", async (t) => {
  const request = await fixture(t); session.status = "SUBMITTED";
  assert.equal((await request({ faceMissingWarnings: 1 }, "STUDENT", "/submissions/warnings")).status, 409);
  assert.equal(writes, 0);
});
test("finalization conflicts cannot upsert or revive a newer session", async (t) => {
  const request = await fixture(t); conflict = true;
  assert.equal((await request(body())).status, 409);
  assert.equal(session.status, "IN_PROGRESS"); assert.equal(session.startedAt, 123);
});
test("all grading endpoints enforce the same zero-to-one-hundred range", async (t) => {
  const request = await fixture(t); submission = { _id: submissionId, examId, studentId: "student-a", grade: 50 };
  for (const grade of [-1, 101]) assert.equal((await request({ grade }, "TEACHER", `/submissions/${submissionId}`, "PATCH")).status, 400);
  assert.equal(submission.grade, 50);
});
test("warning totals are derived and answer copies preserve original question indexes", () => {
  assert.equal(submissionWarningCounts({ appSwitchWarnings: 1, faceMissingWarnings: 2, totalWarnings: 999 }).totalWarnings, 3);
  assert.throws(() => submissionWarningCounts({ phoneWarnings: Infinity }), { code: "INVALID_WARNING_COUNT" });
  assert.deepEqual(submissionAnswers(body().answers, exam), [{ questionIndex: 0, questionText: "Authoritative question", answerText: "Synthetic answer" }]);
});
test("student exam endpoints omit keys, private nested grading data and classmate identifiers", async (t) => {
  const request = await fixture(t);
  exam.accessCode = "SYNTHETIC";
  exam.scheduledEndAt = new Date("2027-01-01T00:00:00.000Z");
  exam.assignedStudents.push("student-b");
  exam.communityStudents = ["private-community-member"];
  exam.questions[0].correctAnswer = "private-answer";
  exam.questions[0].teacherNotes = "private-note";
  exam.questions[0].data = { passage: "Public prompt", children: [{ text: "Public child", correctAnswer: "private-child-key", explanation: "private-solution", options: [{ text: "Public option", isCorrect: true }] }] };
  for (const path of ["/exams/assigned", "/exams/access/SYNTHETIC"]) {
    const response = await request({}, "STUDENT", path, "GET");
    assert.equal(response.status, 200);
    const data = response.body.exam;
    assert.deepEqual(data.assignedStudents, ["student-a"]);
    assert.equal(data.scheduledEndAt, "2027-01-01T00:00:00.000Z");
    assert.deepEqual(data.communityStudents, []);
    assert.equal(data.questions[0].data.passage, "Public prompt");
    assert.equal(data.questions[0].data.children[0].options[0].text, "Public option");
    assert.equal(JSON.stringify(data).includes("private-"), false);
    assert.equal(data.questions[0].correctAnswer, undefined);
    assert.equal(data.questions[0].data.children[0].options[0].isCorrect, undefined);
  }
});
test("teacher-owned exam retrieval still retains answer keys and the full audience", async (t) => {
  const request = await fixture(t);
  exam.assignedStudents.push("student-b"); exam.questions[0].correctAnswer = "Teacher answer";
  const response = await request({}, "TEACHER", `/exams/${examId}`, "GET");
  assert.equal(response.status, 200);
  assert.equal(response.body.exam.questions[0].correctAnswer, "Teacher answer");
  assert.deepEqual(response.body.exam.assignedStudents, ["student-a", "student-b"]);
});