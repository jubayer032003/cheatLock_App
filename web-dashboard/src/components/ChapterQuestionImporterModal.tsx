import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  FileCode,
  Layers,
} from "lucide-react";
import { Badge, Button, Card, Dialog } from "./ui";
import {
  fetchQuestionBankQuestions,
  createQuestionBankQuestion,
} from "../lib/api";
import type {
  QuestionBankChapter,
  QuestionBankClass,
  QuestionBankSubject,
} from "../types";

export interface ImportItem {
  index: number;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  explanation: string;
  status: "draft" | "active" | "inactive";
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
}

export interface PreviewData {
  chapter: {
    id: string;
    name: string;
    subjectId: string;
    subjectName: string;
    classId: string;
  };
  totalCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  items: ImportItem[];
}

interface ChapterQuestionImporterModalProps {
  open: boolean;
  classes?: QuestionBankClass[];
  subjects?: QuestionBankSubject[];
  chapters?: QuestionBankChapter[];
  initialClassId?: string;
  initialSubjectId?: string;
  initialChapterId?: string;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
}

const SAMPLE_JSON = `[
  {
    "question": "What is the SI unit of velocity?",
    "options": {
      "A": "m/s",
      "B": "m/s²",
      "C": "km",
      "D": "N"
    },
    "answer": "A",
    "difficulty": "easy",
    "marks": 1,
    "explanation": "Velocity is distance per unit time (m/s).",
    "status": "active"
  },
  {
    "question": "What is the SI unit of acceleration?",
    "options": {
      "A": "m/s",
      "B": "m/s²",
      "C": "kg",
      "D": "J"
    },
    "answer": "B",
    "difficulty": "medium",
    "marks": 1,
    "explanation": "Acceleration is rate of change of velocity (m/s²).",
    "status": "active"
  }
]`;

const SAMPLE_CSV = `question,option_a,option_b,option_c,option_d,answer,difficulty,marks
"What is the SI unit of velocity?","m/s","m/s²","km","N","A","easy",1
"What is the SI unit of acceleration?","m/s","m/s²","kg","J","B","medium",1`;

const SAMPLE_MARKDOWN = `## Q1

What is the SI unit of velocity?

A. m/s
B. m/s²
C. km
D. N

Answer: A

---

## Q2

What is the SI unit of acceleration?

A. m/s
B. m/s²
C. kg
D. J

Answer: B`;

/* Client-side parsing helpers */
function normalizeQuestionTextForDupCheck(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseJsonQuestions(content: string): Array<any> {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new Error("Invalid JSON file format: " + err.message);
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
    ? parsed.questions
    : [parsed];

  if (!rawList || rawList.length === 0) {
    throw new Error("No questions found in JSON file.");
  }

  return rawList.map(rawToJsonNormalized);
}

function rawToJsonNormalized(item: any) {
  if (!item || typeof item !== "object") return {};
  const questionText = String(item.question || item.question_text || item.questionText || "").trim();
  const rawOptions = item.options || {};
  let optionsObj = { A: "", B: "", C: "", D: "" };

  if (Array.isArray(rawOptions)) {
    const labels = ["A", "B", "C", "D"];
    let correctKey = "";
    rawOptions.forEach((opt, idx) => {
      const key = labels[idx] || String.fromCharCode(65 + idx);
      if (typeof opt === "string") {
        (optionsObj as any)[key] = opt.trim();
      } else if (opt && typeof opt === "object") {
        (optionsObj as any)[key] = String(opt.text || opt.option_text || opt.optionText || "").trim();
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

function parseCsvRows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
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

function parseCsvQuestions(content: string): Array<any> {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    throw new Error("CSV file must contain a header row and at least one data row.");
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const findCol = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const qIdx = findCol(["question", "question_text", "questiontext"]);
  const aIdx = findCol(["option_a", "optiona", "op_a", "a"]);
  const bIdx = findCol(["option_b", "optionb", "op_b", "b"]);
  const cIdx = findCol(["option_c", "optionc", "op_c", "c"]);
  const dIdx = findCol(["option_d", "optiond", "op_d", "d"]);
  const ansIdx = findCol(["answer", "correct_answer", "correctanswer", "correct"]);
  const diffIdx = findCol(["difficulty"]);
  const marksIdx = findCol(["marks"]);

  if (qIdx === -1) {
    throw new Error("CSV header missing required column 'question'.");
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
      difficulty: diffIdx !== -1 && row[diffIdx] ? String(row[diffIdx]).trim().toLowerCase() : "medium",
      marks: marksIdx !== -1 && row[marksIdx] ? Number(row[marksIdx]) || 1 : 1,
      explanation: "",
      status: "active",
    });
  }

  if (questions.length === 0) {
    throw new Error("No data rows found in CSV file.");
  }

  return questions;
}

function parseMarkdownQuestions(content: string): Array<any> {
  const blocks = String(content || "")
    .split(/(?:^|\n)\s*(?:##|---)\s*/)
    .map((b) => b.trim())
    .filter(Boolean);

  const questions: Array<any> = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let questionTextLines: string[] = [];
    const optionsObj = { A: "", B: "", C: "", D: "" };
    let answer = "";

    lines.forEach((line) => {
      if (/^Q\d+/i.test(line) || /^Question\s*\d+/i.test(line)) {
        return;
      }

      const optMatch = line.match(/^(?:Option\s*)?([A-Da-d])[\.\:\)]\s*(.+)$/i);
      const ansMatch = line.match(/^(?:Correct\s*)?Answer\s*[\:\=]\s*([A-Da-d])/i);

      if (ansMatch) {
        answer = ansMatch[1].toUpperCase();
      } else if (optMatch) {
        const key = optMatch[1].toUpperCase() as "A" | "B" | "C" | "D";
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
    throw new Error("No valid question blocks found in Markdown file.");
  }

  return questions;
}

function validateImportedQuestion(item: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

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

export const ChapterQuestionImporterModal: React.FC<ChapterQuestionImporterModalProps> = ({
  open,
  classes = [],
  subjects = [],
  chapters = [],
  initialClassId = "",
  initialSubjectId = "",
  initialChapterId = "",
  onClose,
  onSuccess,
}) => {
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjectId);
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);

  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showMarkdownGuide, setShowMarkdownGuide] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "valid" | "invalid" | "duplicate">("all");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedClassId(initialClassId);
      setSelectedSubjectId(initialSubjectId);
      setSelectedChapterId(initialChapterId);
    }
  }, [open, initialClassId, initialSubjectId, initialChapterId]);

  if (!open) return null;

  const filteredSubjects = subjects.filter((s) => !selectedClassId || s.classId === selectedClassId);
  const filteredChapters = chapters.filter((c) => !selectedSubjectId || c.subjectId === selectedSubjectId);

  const currentChapter = chapters.find((c) => c.id === selectedChapterId);
  const currentSubject = subjects.find((s) => s.id === (currentChapter?.subjectId || selectedSubjectId));
  const currentClass = classes.find((c) => c.id === (currentSubject?.classId || selectedClassId));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (selectedFile: File) => {
    setErrorMessage("");
    if (!selectedChapterId) {
      setErrorMessage("Please select a target Chapter before uploading questions.");
      return;
    }

    const name = selectedFile.name.toLowerCase();
    let fileType: "json" | "csv" | "md" | null = null;

    if (name.endsWith(".json")) fileType = "json";
    else if (name.endsWith(".csv")) fileType = "csv";
    else if (name.endsWith(".md") || name.endsWith(".markdown")) fileType = "md";

    if (!fileType) {
      setErrorMessage("Unsupported file format. Please upload a .json, .csv, or .md file.");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setErrorMessage("File size exceeds maximum limit of 5MB.");
      return;
    }

    setFile(selectedFile);
    setParsing(true);

    try {
      const content = await selectedFile.text();
      let rawParsedQuestions: Array<any> = [];

      if (fileType === "json") {
        rawParsedQuestions = parseJsonQuestions(content);
      } else if (fileType === "csv") {
        rawParsedQuestions = parseCsvQuestions(content);
      } else {
        rawParsedQuestions = parseMarkdownQuestions(content);
      }

      let existingTexts = new Set<string>();
      try {
        const existingData = await fetchQuestionBankQuestions({
          chapterId: selectedChapterId,
          limit: 1000,
        });
        (existingData.questions || []).forEach((q: any) => {
          if (q.questionText) {
            existingTexts.add(normalizeQuestionTextForDupCheck(q.questionText));
          }
        });
      } catch (err) {
        // Continue preview even if fetching existing questions fails
      }

      const seenInBatch = new Set<string>();
      const processedItems: ImportItem[] = rawParsedQuestions.map((q, idx) => {
        const { isValid, errors } = validateImportedQuestion(q);
        const normalizedKey = normalizeQuestionTextForDupCheck(q.questionText);

        let isDuplicate = false;
        const dupErrors = [...errors];

        if (normalizedKey && existingTexts.has(normalizedKey)) {
          isDuplicate = true;
          dupErrors.push("Duplicate of existing question in this chapter.");
        }

        if (normalizedKey && seenInBatch.has(normalizedKey)) {
          isDuplicate = true;
          dupErrors.push("Duplicate within uploaded file.");
        } else if (normalizedKey) {
          seenInBatch.add(normalizedKey);
        }

        return {
          index: idx + 1,
          questionText: q.questionText || "",
          options: q.options || { A: "", B: "", C: "", D: "" },
          answer: q.answer || "",
          difficulty: (["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium") as any,
          marks: Number(q.marks) || 1,
          explanation: q.explanation || "",
          status: (["draft", "active", "inactive"].includes(q.status) ? q.status : "active") as any,
          isValid,
          isDuplicate,
          errors: dupErrors,
        };
      });

      const previewObj: PreviewData = {
        chapter: {
          id: selectedChapterId,
          name: currentChapter?.name || "Selected Chapter",
          subjectId: currentSubject?.id || selectedSubjectId,
          subjectName: currentSubject?.name || "",
          classId: currentClass?.id || selectedClassId,
        },
        totalCount: processedItems.length,
        validCount: processedItems.filter((i) => i.isValid).length,
        invalidCount: processedItems.filter((i) => !i.isValid).length,
        duplicateCount: processedItems.filter((i) => i.isDuplicate).length,
        items: processedItems,
      };

      setPreview(previewObj);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to parse file.");
      setPreview(null);
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = (type: "json" | "csv") => {
    const content = type === "json" ? SAMPLE_JSON : SAMPLE_CSV;
    const filename = type === "json" ? "chapter-question-template.json" : "chapter-question-template.csv";
    const mime = type === "json" ? "application/json" : "text/csv";

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyMarkdownSample = () => {
    navigator.clipboard.writeText(SAMPLE_MARKDOWN);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const handleExecuteImport = async (importMode: "valid_non_duplicates" | "all_valid") => {
    if (!preview || !selectedChapterId) return;

    let targetQuestions = preview.items.filter((item) => item.isValid);
    if (importMode === "valid_non_duplicates") {
      targetQuestions = targetQuestions.filter((item) => !item.isDuplicate);
    }

    if (targetQuestions.length === 0) {
      setErrorMessage("No valid questions available to import.");
      return;
    }

    setImporting(true);
    setErrorMessage("");

    try {
      let importedCount = 0;
      for (const item of targetQuestions) {
        await createQuestionBankQuestion({
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          chapterId: selectedChapterId,
          questionType: "mcq",
          questionText: item.questionText,
          difficulty: item.difficulty,
          marks: item.marks,
          explanation: item.explanation,
          status: item.status,
          options: [
            { text: item.options.A, isCorrect: item.answer === "A", displayOrder: 0 },
            { text: item.options.B, isCorrect: item.answer === "B", displayOrder: 1 },
            { text: item.options.C, isCorrect: item.answer === "C", displayOrder: 2 },
            { text: item.options.D, isCorrect: item.answer === "D", displayOrder: 3 },
          ],
        });
        importedCount++;
      }

      onSuccess(importedCount);
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || err.message || "Bulk import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setErrorMessage("");
    setActiveFilter("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredItems = (preview?.items || []).filter((item) => {
    if (activeFilter === "valid") return item.isValid && !item.isDuplicate;
    if (activeFilter === "invalid") return !item.isValid;
    if (activeFilter === "duplicate") return item.isDuplicate;
    return true;
  });

  return (
    <Dialog open={open} onClose={onClose} title="Import Questions to Chapter">
      <div className="space-y-5">
        {/* Class / Subject / Chapter Selector Context */}
        <div className="grid gap-3 sm:grid-cols-3 rounded-xl bg-slate-100 p-3.5 dark:bg-white/5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Class
            </label>
            <select
              disabled={Boolean(preview)}
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedSubjectId("");
                setSelectedChapterId("");
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Select Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Subject
            </label>
            <select
              disabled={Boolean(preview)}
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedChapterId("");
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Select Subject</option>
              {filteredSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Chapter (Required)
            </label>
            <select
              disabled={Boolean(preview)}
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Select Chapter</option>
              {filteredChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Step 1: Upload & Templates */}
        {!preview ? (
          <div className="space-y-4">
            {/* File Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!selectedChapterId) {
                  setErrorMessage("Please select a target Chapter before uploading questions.");
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-300 hover:border-cyan-500/50 hover:bg-slate-50 dark:border-white/20 dark:hover:bg-white/[0.02]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.md,.markdown"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400">
                <Upload size={24} />
              </div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {parsing ? "Parsing questions..." : "Click or drag & drop questions file here"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Supports .json, .csv, and .md files (Up to 5MB)
              </p>
            </div>

            {/* Starter Templates Downloads */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Starter Templates & Formats
                </span>
                <button
                  type="button"
                  onClick={() => setShowMarkdownGuide(!showMarkdownGuide)}
                  className="text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                >
                  {showMarkdownGuide ? "Hide Markdown Syntax" : "View Markdown Syntax"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => downloadTemplate("json")}>
                  <Download size={14} /> Download Starter JSON
                </Button>
                <Button variant="secondary" size="sm" onClick={() => downloadTemplate("csv")}>
                  <Download size={14} /> Download Starter CSV
                </Button>
              </div>

              {showMarkdownGuide && (
                <div className="mt-4 rounded-lg bg-slate-950 p-3.5 text-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-semibold text-cyan-400">
                      Markdown (.md) Format Example
                    </span>
                    <button
                      type="button"
                      onClick={copyMarkdownSample}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      {copiedMd ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      {copiedMd ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-slate-300">
                    {SAMPLE_MARKDOWN}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Validation Preview Table */
          <div className="space-y-4">
            {/* Target Chapter Pill */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-xs dark:border-cyan-500/20 dark:bg-cyan-500/10">
              <div>
                <span className="font-semibold text-slate-600 dark:text-slate-400">Target Chapter: </span>
                <span className="font-bold text-cyan-900 dark:text-cyan-200">
                  {currentClass?.name ? `${currentClass.name} → ` : ""}
                  {currentSubject?.name ? `${currentSubject.name} → ` : ""}
                  {preview.chapter.name}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                Upload Different File
              </Button>
            </div>

            {/* Filter Tabs & Metric Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveFilter("all")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${
                    activeFilter === "all"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                  }`}
                >
                  All ({preview.totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("valid")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${
                    activeFilter === "valid"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  }`}
                >
                  Valid ({preview.validCount - preview.duplicateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("duplicate")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${
                    activeFilter === "duplicate"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  }`}
                >
                  Duplicates ({preview.duplicateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("invalid")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${
                    activeFilter === "invalid"
                      ? "bg-rose-600 text-white"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                  }`}
                >
                  Invalid ({preview.invalidCount})
                </button>
              </div>
            </div>

            {/* Items Table */}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Question Text</th>
                    <th className="p-2.5">Options</th>
                    <th className="p-2.5">Ans</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.index}
                      className={
                        !item.isValid
                          ? "bg-rose-50/50 dark:bg-rose-950/20"
                          : item.isDuplicate
                          ? "bg-amber-50/50 dark:bg-amber-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                      }
                    >
                      <td className="p-2.5 font-semibold text-slate-500">{item.index}</td>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-white max-w-xs truncate">
                        {item.questionText || <span className="italic text-rose-500">[Empty Question]</span>}
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-500 truncate max-w-xs">
                        A: {item.options.A} | B: {item.options.B}
                      </td>
                      <td className="p-2.5 font-bold">{item.answer || "-"}</td>
                      <td className="p-2.5">
                        {!item.isValid ? (
                          <Badge tone="danger">Invalid</Badge>
                        ) : item.isDuplicate ? (
                          <Badge tone="warning">Duplicate</Badge>
                        ) : (
                          <Badge tone="success" className="font-semibold">Valid</Badge>
                        )}
                        {item.errors.length > 0 && (
                          <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">
                            {item.errors.join(", ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
              <div className="text-xs text-slate-500">
                Ready to import:{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {preview.validCount - preview.duplicateCount} non-duplicate questions
                </strong>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={onClose} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  disabled={importing || preview.validCount - preview.duplicateCount === 0}
                  onClick={() => handleExecuteImport("valid_non_duplicates")}
                >
                  {importing ? "Importing..." : "Import Valid Non-Duplicates"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
