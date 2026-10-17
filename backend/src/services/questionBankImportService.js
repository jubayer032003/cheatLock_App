import { getSupabaseAdminClient, throwSupabaseError } from "./supabaseClient.js";

/**
 * Normalizes question text for duplicate detection (trim, collapse whitespace, lowercase).
 */
export function normalizeQuestionTextForDupCheck(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Parses JSON question payload. Accepts array or object with questions property.
 */
export function parseJsonQuestions(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const error = new Error("Invalid JSON file format: " + err.message);
    error.status = 400;
    throw error;
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
    ? parsed.questions
    : [parsed];

  if (!rawList || rawList.length === 0) {
    const error = new Error("No questions found in JSON file.");
    error.status = 400;
    throw error;
  }

  return rawList.map(rawToJsonNormalized);
}

function rawToJsonNormalized(item) {
  if (!item || typeof item !== "object") return {};
  const questionText = String(item.question || item.question_text || item.questionText || "").trim();
  const rawOptions = item.options || {};
  let optionsObj = { A: "", B: "", C: "", D: "" };

  if (Array.isArray(rawOptions)) {
    // If options array [ "m/s", "m/s²", "km", "N" ] or [ { text: "...", isCorrect: true }, ... ]
    const labels = ["A", "B", "C", "D"];
    let correctKey = "";
    rawOptions.forEach((opt, idx) => {
      const key = labels[idx] || String.fromCharCode(65 + idx);
      if (typeof opt === "string") {
        optionsObj[key] = opt.trim();
      } else if (opt && typeof opt === "object") {
        optionsObj[key] = String(opt.text || opt.option_text || opt.optionText || "").trim();
        if (opt.isCorrect || opt.is_correct) {
          correctKey = key;
        }
      }
    });
    if (correctKey && !item.answer && !item.correct_answer && !item.correctAnswer) {
      item.answer = correctKey;
    }
  } else if (typeof rawOptions === "object") {
    optionsObj = {
      A: String(rawOptions.A || rawOptions.a || rawOptions.option_a || rawOptions.optionA || "").trim(),
      B: String(rawOptions.B || rawOptions.b || rawOptions.option_b || rawOptions.optionB || "").trim(),
      C: String(rawOptions.C || rawOptions.c || rawOptions.option_c || rawOptions.optionC || "").trim(),
      D: String(rawOptions.D || rawOptions.d || rawOptions.option_d || rawOptions.optionD || "").trim(),
    };
  }

  const answer = String(item.answer || item.correct_answer || item.correctAnswer || "").trim().toUpperCase();

  return {
    questionText,
    options: optionsObj,
    answer,
    difficulty: String(item.difficulty || "medium").trim().toLowerCase(),
    marks: Number(item.marks || 1) || 1,
    explanation: String(item.explanation || "").trim(),
    status: String(item.status || "active").trim().toLowerCase(),
  };
}

/**
 * Parses CSV string content.
 * Expected headers: question, option_a, option_b, option_c, option_d, answer
 */
export function parseCsvQuestions(content) {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    const error = new Error("CSV file must contain a header row and at least one data row.");
    error.status = 400;
    throw error;
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const findCol = (names) => headers.findIndex((h) => names.includes(h));

  const qIdx = findCol(["question", "question_text", "questiontext"]);
  const aIdx = findCol(["option_a", "optiona", "op_a", "a"]);
  const bIdx = findCol(["option_b", "optionb", "op_b", "b"]);
  const cIdx = findCol(["option_c", "optionc", "op_c", "c"]);
  const dIdx = findCol(["option_d", "optiond", "op_d", "d"]);
  const ansIdx = findCol(["answer", "correct_answer", "correctanswer", "correct"]);

  if (qIdx === -1) {
    const error = new Error("CSV header missing required column 'question'.");
    error.status = 400;
    throw error;
  }

  const questions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const questionText = String(row[qIdx] || "").trim();
    const optionsObj = {
      A: String(aIdx !== -1 ? row[aIdx] : "").trim(),
      B: String(bIdx !== -1 ? row[bIdx] : "").trim(),
      C: String(cIdx !== -1 ? row[cIdx] : "").trim(),
      D: String(dIdx !== -1 ? row[dIdx] : "").trim(),
    };
    const answer = String(ansIdx !== -1 ? row[ansIdx] : "").trim().toUpperCase();

    questions.push({
      questionText,
      options: optionsObj,
      answer,
      difficulty: "medium",
      marks: 1,
      explanation: "",
      status: "active",
    });
  }

  if (questions.length === 0) {
    const error = new Error("No data rows found in CSV file.");
    error.status = 400;
    throw error;
  }

  return questions;
}

/**
 * RFC 4180-compliant simple CSV line parser supporting quoted fields and embedded quotes/newlines.
 */
function parseCsvRows(text) {
  const result = [];
  let row = [];
  let curr = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        curr += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        curr += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(curr);
        curr = "";
      } else if (char === "\r" && nextChar === "\n") {
        row.push(curr);
        result.push(row);
        row = [];
        curr = "";
        i++;
      } else if (char === "\n" || char === "\r") {
        row.push(curr);
        result.push(row);
        row = [];
        curr = "";
      } else {
        curr += char;
      }
    }
  }

  if (curr || row.length > 0) {
    row.push(curr);
    result.push(row);
  }

  return result;
}

/**
 * Parses Markdown questions formatted as:
 * ## Q1
 * Question text here?
 * A. option 1
 * B. option 2
 * C. option 3
 * D. option 4
 * Answer: A
 * ---
 */
export function parseMarkdownQuestions(content) {
  const blocks = String(content || "")
    .split(/(?:^|\n)\s*(?:##|---)\s*/)
    .map((b) => b.trim())
    .filter(Boolean);

  const questions = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let questionTextLines = [];
    const optionsObj = { A: "", B: "", C: "", D: "" };
    let answer = "";

    lines.forEach((line) => {
      // Ignore section header lines like "Q1" or "Question 1"
      if (/^Q\d+/i.test(line) || /^Question\s*\d+/i.test(line)) {
        return;
      }

      // Check Option matching (e.g. A. m/s or A) m/s or Option A: m/s)
      const optMatch = line.match(/^(?:Option\s*)?([A-Da-d])[\.\:\)]\s*(.+)$/i);
      // Check Answer matching (e.g. Answer: A or Correct Answer: A)
      const ansMatch = line.match(/^(?:Correct\s*)?Answer\s*[\:\=]\s*([A-Da-d])/i);

      if (ansMatch) {
        answer = ansMatch[1].toUpperCase();
      } else if (optMatch) {
        const key = optMatch[1].toUpperCase();
        optionsObj[key] = optMatch[2].trim();
      } else {
        questionTextLines.push(line);
      }
    });

    const questionText = questionTextLines.join(" ").trim();
    if (questionText || optionsObj.A || answer) {
      questions.push({
        questionText,
        options: optionsObj,
        answer,
        difficulty: "medium",
        marks: 1,
        explanation: "",
        status: "active",
      });
    }
  }

  if (questions.length === 0) {
    const error = new Error("No valid question blocks found in Markdown file.");
    error.status = 400;
    throw error;
  }

  return questions;
}

/**
 * Validates a single normalized question object.
 * Returns { isValid: boolean, errors: string[] }
 */
export function validateImportedQuestion(item) {
  const errors = [];

  if (!item.questionText || !item.questionText.trim()) {
    errors.push("Missing question text.");
  }

  const options = item.options || {};
  ["A", "B", "C", "D"].forEach((label) => {
    if (!options[label] || !String(options[label]).trim()) {
      errors.push(`Missing Option ${label}.`);
    }
  });

  const answer = String(item.answer || "").trim().toUpperCase();
  if (!answer || !["A", "B", "C", "D"].includes(answer)) {
    errors.push("Answer must be A, B, C, or D.");
  } else if (!options[answer] || !String(options[answer]).trim()) {
    errors.push(`Answer '${answer}' refers to an empty option.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Fetches existing question texts for a chapter from database
 * and marks duplicate questions.
 */
export async function detectDuplicatesForChapter(chapterId, normalizedQuestions) {
  const client = getSupabaseAdminClient();
  let existingTexts = new Set();

  if (chapterId) {
    const { data, error } = await client
      .from("question_bank_questions")
      .select("question_text")
      .eq("node_id", chapterId);

    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        if (row.question_text) {
          existingTexts.add(normalizeQuestionTextForDupCheck(row.question_text));
        }
      });
    }
  }

  const seenInBatch = new Set();

  return normalizedQuestions.map((q) => {
    const normalizedKey = normalizeQuestionTextForDupCheck(q.questionText);
    let isDuplicate = false;
    const dupReasons = [];

    if (normalizedKey && existingTexts.has(normalizedKey)) {
      isDuplicate = true;
      dupReasons.push("Duplicate of existing question in this chapter.");
    }

    if (normalizedKey && seenInBatch.has(normalizedKey)) {
      isDuplicate = true;
      dupReasons.push("Duplicate within uploaded file.");
    } else if (normalizedKey) {
      seenInBatch.add(normalizedKey);
    }

    return {
      ...q,
      isDuplicate,
      dupReasons,
    };
  });
}
