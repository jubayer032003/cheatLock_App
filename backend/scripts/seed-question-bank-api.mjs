const API_BASE_URL = process.env.CHEATLOCK_SEED_API_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_IDENTIFIER = process.env.CHEATLOCK_SEED_ADMIN_IDENTIFIER;
const ADMIN_PASSWORD = process.env.CHEATLOCK_SEED_ADMIN_PASSWORD;
const ADMIN_ROLE = process.env.CHEATLOCK_SEED_ADMIN_ROLE || "SUPER_ADMIN";

if (!ADMIN_IDENTIFIER || !ADMIN_PASSWORD) {
  console.error("Set CHEATLOCK_SEED_ADMIN_IDENTIFIER and CHEATLOCK_SEED_ADMIN_PASSWORD before running this script.");
  process.exit(1);
}

const token = await login();
const class9 = await upsertClass({ name: "Class 9", slug: "class-9", displayOrder: 9, isActive: true });
const mathematics = await upsertSubject({
  classId: class9.id,
  name: "Mathematics",
  slug: "mathematics",
  code: "MATH",
  displayOrder: 1,
  isActive: true,
});
const algebra = await upsertChapter({
  subjectId: mathematics.id,
  name: "Algebra",
  slug: "algebra",
  chapterNumber: 1,
  displayOrder: 1,
  isActive: true,
});

const questions = [
  {
    questionText: "If x + 5 = 12, what is the value of x?",
    difficulty: "easy",
    marks: 1,
    explanation: "Subtract 5 from both sides: x = 7.",
    options: ["5", "7", "12", "17"],
    correctIndex: 1,
  },
  {
    questionText: "Which expression is equivalent to 2(a + 3)?",
    difficulty: "easy",
    marks: 1,
    explanation: "Use the distributive property: 2a + 6.",
    options: ["2a + 3", "2a + 6", "a + 6", "5a"],
    correctIndex: 1,
  },
  {
    questionText: "What is the factorized form of x^2 - 9?",
    difficulty: "medium",
    marks: 1,
    explanation: "This is a difference of squares: (x - 3)(x + 3).",
    options: ["(x - 9)(x + 1)", "(x - 3)(x + 3)", "(x - 3)^2", "(x + 9)(x - 1)"],
    correctIndex: 1,
  },
  {
    questionText: "If 3x - 4 = 11, what is x?",
    difficulty: "medium",
    marks: 1,
    explanation: "Add 4 to both sides, then divide by 3: x = 5.",
    options: ["3", "4", "5", "7"],
    correctIndex: 2,
  },
  {
    questionText: "Which value of k makes x^2 + kx + 16 a perfect square trinomial?",
    difficulty: "hard",
    marks: 1,
    explanation: "x^2 + 8x + 16 = (x + 4)^2.",
    options: ["4", "6", "8", "16"],
    correctIndex: 2,
  },
];

for (const item of questions) {
  await upsertQuestion({
    classId: class9.id,
    subjectId: mathematics.id,
    chapterId: algebra.id,
    questionType: "mcq",
    questionText: item.questionText,
    difficulty: item.difficulty,
    marks: item.marks,
    explanation: item.explanation,
    status: "active",
    options: item.options.map((text, index) => ({
      text,
      isCorrect: index === item.correctIndex,
      displayOrder: index,
    })),
  });
}

console.log(`Seeded/updated ${questions.length} Class 9 Mathematics Algebra questions through ${API_BASE_URL}.`);

async function login() {
  const response = await request("/auth/login", {
    method: "POST",
    body: {
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
      role: ADMIN_ROLE,
    },
    auth: false,
  });
  return response.token;
}

async function upsertClass(body) {
  const existing = (await request("/question-bank/admin/classes")).classes
    .find((item) => item.slug === body.slug);
  if (existing) return (await request(`/question-bank/admin/classes/${existing.id}`, { method: "PUT", body })).class;
  return (await request("/question-bank/admin/classes", { method: "POST", body })).class;
}

async function upsertSubject(body) {
  const existing = (await request(`/question-bank/admin/classes/${body.classId}/subjects`)).subjects
    .find((item) => item.slug === body.slug);
  if (existing) return (await request(`/question-bank/admin/subjects/${existing.id}`, { method: "PUT", body })).subject;
  return (await request("/question-bank/admin/subjects", { method: "POST", body })).subject;
}

async function upsertChapter(body) {
  const existing = (await request(`/question-bank/admin/subjects/${body.subjectId}/chapters`)).chapters
    .find((item) => item.slug === body.slug);
  if (existing) return (await request(`/question-bank/admin/chapters/${existing.id}`, { method: "PUT", body })).chapter;
  return (await request("/question-bank/admin/chapters", { method: "POST", body })).chapter;
}

async function upsertQuestion(body) {
  const existing = (await request(`/question-bank/questions?classId=${encodeURIComponent(body.classId)}&subjectId=${encodeURIComponent(body.subjectId)}&chapterId=${encodeURIComponent(body.chapterId)}&search=${encodeURIComponent(body.questionText)}&limit=50`)).questions
    .find((item) => item.questionText === body.questionText);
  if (existing) return (await request(`/question-bank/questions/${existing.id}`, { method: "PUT", body })).question;
  return (await request("/question-bank/questions", { method: "POST", body })).question;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `${method} ${path} failed with ${response.status}`);
  }
  return data;
}
