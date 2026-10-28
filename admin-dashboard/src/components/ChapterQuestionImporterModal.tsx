import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileCode, Import, Upload, XCircle } from "lucide-react";
import { Badge, Button, Dialog, SkeletonBlock, cn } from "./ui";
import {
  fetchAdminQuestionBankChapters,
  fetchAdminQuestionBankSubjects,
  fetchQuestionBankQuestions,
  importQuestionBankChapterQuestions,
} from "../lib/api";
import type { QuestionBankChapter, QuestionBankClass, QuestionBankSubject } from "../types";

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

type Step = "upload" | "validate" | "preview" | "import";

function normalizeText(text: string) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJsonQuestions(content: string): Array<any> {
  const parsed = JSON.parse(content);
  const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [parsed];
  if (!rawList.length) throw new Error("No questions found in JSON file.");
  return rawList.map(normalizeRawQuestion);
}

function normalizeRawQuestion(item: any) {
  const rawOptions = item?.options || {};
  const options = { A: "", B: "", C: "", D: "" };
  let detectedAnswer = "";

  if (Array.isArray(rawOptions)) {
    rawOptions.slice(0, 4).forEach((option, index) => {
      const key = String.fromCharCode(65 + index) as "A" | "B" | "C" | "D";
      options[key] = typeof option === "string" ? option.trim() : String(option?.text || option?.optionText || option?.option_text || "").trim();
      if (option?.isCorrect || option?.is_correct) detectedAnswer = key;
    });
  } else {
    options.A = String(rawOptions.A || rawOptions.a || rawOptions.option_a || rawOptions.optionA || "").trim();
    options.B = String(rawOptions.B || rawOptions.b || rawOptions.option_b || rawOptions.optionB || "").trim();
    options.C = String(rawOptions.C || rawOptions.c || rawOptions.option_c || rawOptions.optionC || "").trim();
    options.D = String(rawOptions.D || rawOptions.d || rawOptions.option_d || rawOptions.optionD || "").trim();
  }

  return {
    questionText: String(item?.question || item?.question_text || item?.questionText || "").trim(),
    options,
    answer: String(item?.answer || item?.correct_answer || item?.correctAnswer || detectedAnswer || "").trim().toUpperCase(),
    difficulty: String(item?.difficulty || "medium").trim().toLowerCase(),
    marks: Number(item?.marks || 1) || 1,
    explanation: String(item?.explanation || "").trim(),
    status: String(item?.status || "active").trim().toLowerCase(),
  };
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseCsvQuestions(content: string): Array<any> {
  const rows = parseCsvRows(content).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) throw new Error("CSV requires a header row and at least one question.");
  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const find = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    question: find(["question", "question_text", "questiontext"]),
    a: find(["option_a", "optiona", "a"]),
    b: find(["option_b", "optionb", "b"]),
    c: find(["option_c", "optionc", "c"]),
    d: find(["option_d", "optiond", "d"]),
    answer: find(["answer", "correct_answer", "correctanswer", "correct"]),
    difficulty: find(["difficulty"]),
    marks: find(["marks"]),
  };
  if (indexes.question === -1) throw new Error("CSV header missing required column: question.");
  return rows.slice(1).map((row) => ({
    questionText: String(row[indexes.question] || "").trim(),
    options: {
      A: indexes.a === -1 ? "" : String(row[indexes.a] || "").trim(),
      B: indexes.b === -1 ? "" : String(row[indexes.b] || "").trim(),
      C: indexes.c === -1 ? "" : String(row[indexes.c] || "").trim(),
      D: indexes.d === -1 ? "" : String(row[indexes.d] || "").trim(),
    },
    answer: indexes.answer === -1 ? "" : String(row[indexes.answer] || "").trim().toUpperCase(),
    difficulty: indexes.difficulty === -1 ? "medium" : String(row[indexes.difficulty] || "medium").trim().toLowerCase(),
    marks: indexes.marks === -1 ? 1 : Number(row[indexes.marks] || 1) || 1,
    explanation: "",
    status: "active",
  }));
}

function parseMarkdownQuestions(content: string): Array<any> {
  const blocks = String(content || "").split(/(?:^|\n)\s*(?:##|---)\s*/).map((item) => item.trim()).filter(Boolean);
  const questions = blocks.map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const options = { A: "", B: "", C: "", D: "" };
    const questionLines: string[] = [];
    let answer = "";
    lines.forEach((line) => {
      const option = line.match(/^(?:Option\s*)?([A-Da-d])[.:)]\s*(.+)$/);
      const answerMatch = line.match(/^(?:Correct\s*)?Answer\s*[:=]\s*([A-Da-d])/i);
      if (/^Q\d+/i.test(line) || /^Question\s*\d+/i.test(line)) return;
      if (answerMatch) answer = answerMatch[1].toUpperCase();
      else if (option) options[option[1].toUpperCase() as "A" | "B" | "C" | "D"] = option[2].trim();
      else questionLines.push(line);
    });
    return { questionText: questionLines.join(" "), options, answer, difficulty: "medium", marks: 1, explanation: "", status: "active" };
  }).filter((item) => item.questionText || item.answer || item.options.A);
  if (!questions.length) throw new Error("No valid question blocks found in Markdown file.");
  return questions;
}

function validateImportedQuestion(item: any) {
  const errors: string[] = [];
  if (!item.questionText?.trim()) errors.push("Missing question text.");
  ["A", "B", "C", "D"].forEach((label) => {
    if (!item.options?.[label]?.trim()) errors.push(`Missing Option ${label}.`);
  });
  if (!["A", "B", "C", "D"].includes(String(item.answer || "").toUpperCase())) errors.push("Answer must be A, B, C, or D.");
  return errors;
}

export function ChapterQuestionImporterModal({
  open,
  classes = [],
  subjects = [],
  chapters = [],
  initialClassId = "",
  initialSubjectId = "",
  initialChapterId = "",
  onClose,
  onSuccess,
}: ChapterQuestionImporterModalProps) {
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjectId);
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);
  const [loadedSubjects, setLoadedSubjects] = useState<QuestionBankSubject[]>(subjects);
  const [loadedChapters, setLoadedChapters] = useState<QuestionBankChapter[]>(chapters);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [filter, setFilter] = useState<"all" | "valid" | "duplicate" | "invalid">("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedClassId(initialClassId);
    setSelectedSubjectId(initialSubjectId);
    setSelectedChapterId(initialChapterId);
    setLoadedSubjects(subjects);
    setLoadedChapters(chapters);
    setItems([]);
    setFileName("");
    setStep("upload");
    setFilter("all");
    setErrorMessage("");
  }, [open, initialClassId, initialSubjectId, initialChapterId, subjects, chapters]);

  useEffect(() => {
    if (!open || !selectedClassId) return;
    fetchAdminQuestionBankSubjects(selectedClassId).then(setLoadedSubjects).catch(() => undefined);
  }, [open, selectedClassId]);

  useEffect(() => {
    if (!open || !selectedSubjectId) return;
    fetchAdminQuestionBankChapters(selectedSubjectId).then(setLoadedChapters).catch(() => undefined);
  }, [open, selectedSubjectId]);

  const filteredSubjects = loadedSubjects.filter((item) => item.classId === selectedClassId);
  const filteredChapters = loadedChapters.filter((item) => item.subjectId === selectedSubjectId);
  const selectedChapter = loadedChapters.find((item) => item.id === selectedChapterId);
  const selectedSubject = loadedSubjects.find((item) => item.id === selectedSubjectId);
  const selectedClass = classes.find((item) => item.id === selectedClassId);

  const counts = useMemo(() => ({
    total: items.length,
    valid: items.filter((item) => item.isValid && !item.isDuplicate).length,
    duplicate: items.filter((item) => item.isDuplicate).length,
    invalid: items.filter((item) => !item.isValid).length,
  }), [items]);

  const visibleItems = items.filter((item) => {
    if (filter === "valid") return item.isValid && !item.isDuplicate;
    if (filter === "duplicate") return item.isDuplicate;
    if (filter === "invalid") return !item.isValid;
    return true;
  });

  async function processFile(file: File) {
    if (!selectedChapterId) {
      setErrorMessage("Select a target chapter before uploading questions.");
      return;
    }
    const lower = file.name.toLowerCase();
    const fileType = lower.endsWith(".json") ? "json" : lower.endsWith(".csv") ? "csv" : lower.endsWith(".md") || lower.endsWith(".markdown") ? "md" : null;
    if (!fileType) {
      setErrorMessage("Unsupported file format. Upload JSON, CSV, or Markdown.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("File size exceeds 5MB.");
      return;
    }
    setBusy(true);
    setStep("validate");
    setErrorMessage("");
    setFileName(file.name);
    try {
      const content = await file.text();
      const parsed = fileType === "json" ? parseJsonQuestions(content) : fileType === "csv" ? parseCsvQuestions(content) : parseMarkdownQuestions(content);
      const existing = await fetchQuestionBankQuestions({ chapterId: selectedChapterId, limit: 1000 }).catch(() => ({ questions: [] }));
      const existingTexts = new Set((existing.questions || []).map((question) => normalizeText(question.questionText)));
      const seen = new Set<string>();
      const next = parsed.map((question, index) => {
        const errors = validateImportedQuestion(question);
        const key = normalizeText(question.questionText);
        const duplicate = Boolean(key && (existingTexts.has(key) || seen.has(key)));
        if (key) seen.add(key);
        return {
          index: index + 1,
          questionText: question.questionText || "",
          options: question.options || { A: "", B: "", C: "", D: "" },
          answer: question.answer || "",
          difficulty: ["easy", "medium", "hard"].includes(question.difficulty) ? question.difficulty : "medium",
          marks: Number(question.marks) || 1,
          explanation: question.explanation || "",
          status: ["draft", "active", "inactive"].includes(question.status) ? question.status : "active",
          isValid: errors.length === 0,
          isDuplicate: duplicate,
          errors: duplicate ? [...errors, "Duplicate question."] : errors,
        } as ImportItem;
      });
      setItems(next);
      setStep("preview");
    } catch (error) {
      setItems([]);
      setStep("upload");
      setErrorMessage(error instanceof Error ? error.message : "Could not parse file.");
    } finally {
      setBusy(false);
    }
  }

  async function executeImport() {
    const importable = items.filter((item) => item.isValid && !item.isDuplicate);
    if (!selectedClassId || !selectedSubjectId || !selectedChapterId) {
      setErrorMessage("Class, subject, and chapter are required.");
      return;
    }
    if (!importable.length) {
      setErrorMessage("No valid non-duplicate questions are available to import.");
      return;
    }
    setBusy(true);
    setStep("import");
    setErrorMessage("");
    try {
      const result = await importQuestionBankChapterQuestions(selectedChapterId, importable);
      onSuccess(result.importedCount);
      onClose();
    } catch (error) {
      setStep("preview");
      setErrorMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import Questions">
      <div className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-4">
          {(["upload", "validate", "preview", "import"] as Step[]).map((item, index) => (
            <div key={item} className={cn("rounded-lg border p-3 text-xs font-bold capitalize", step === item ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400")}>
              {index + 1}. {item}
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Class" value={selectedClassId} onChange={(value) => { setSelectedClassId(value); setSelectedSubjectId(""); setSelectedChapterId(""); }} options={classes.map((item) => ({ value: item.id, label: item.name }))} />
          <Select label="Subject" value={selectedSubjectId} onChange={(value) => { setSelectedSubjectId(value); setSelectedChapterId(""); }} options={filteredSubjects.map((item) => ({ value: item.id, label: item.name }))} />
          <Select label="Chapter" value={selectedChapterId} onChange={setSelectedChapterId} options={filteredChapters.map((item) => ({ value: item.id, label: formatChapter(item) }))} />
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {step === "validate" ? (
          <div className="space-y-3">
            <SkeletonBlock className="h-20" />
            <SkeletonBlock className="h-28" />
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-56 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-sky-400 hover:bg-sky-50/50 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10"
            >
              <input ref={fileInputRef} type="file" accept=".json,.csv,.md,.markdown" className="hidden" onChange={(event) => event.target.files?.[0] && processFile(event.target.files[0])} />
              <Upload size={32} className="mb-4 text-sky-600 dark:text-sky-300" />
              <span className="text-base font-bold text-slate-950 dark:text-white">Upload questions file</span>
              <span className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Supports JSON, CSV, and Markdown up to 5MB. Include question text, four options, a correct answer, difficulty, marks, status, and optional explanation.</span>
            </button>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
              <p className="font-bold text-slate-950 dark:text-white">Format requirements</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">Every imported MCQ needs question text, options A-D, and one correct answer marked A, B, C, or D.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div>
                <p className="text-sm font-bold text-slate-950 dark:text-white">{fileName}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{[selectedClass?.name, selectedSubject?.name, selectedChapter && formatChapter(selectedChapter)].filter(Boolean).join(" / ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{counts.total} total</Badge>
                <Badge tone="success">{counts.valid} valid</Badge>
                <Badge tone="warning">{counts.duplicate} duplicate</Badge>
                <Badge tone="danger">{counts.invalid} invalid</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "valid", "duplicate", "invalid"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-lg px-3 py-2 text-xs font-bold capitalize transition", filter === item ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.1]")}>{item}</button>
              ))}
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Question</th>
                    <th className="p-3">Answer</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {visibleItems.map((item) => (
                    <tr key={item.index} className={item.isValid && !item.isDuplicate ? "" : "bg-amber-50/50 dark:bg-amber-500/5"}>
                      <td className="p-3 font-bold">{item.index}</td>
                      <td className="max-w-lg p-3">
                        <p className="truncate font-semibold text-slate-950 dark:text-white">{item.questionText || "Missing question"}</p>
                        {item.errors.length > 0 && <p className="mt-1 text-rose-600 dark:text-rose-300">{item.errors.join(" ")}</p>}
                      </td>
                      <td className="p-3 font-bold">{item.answer || "-"}</td>
                      <td className="p-3">{item.isValid && !item.isDuplicate ? <Badge tone="success"><Check size={12} /> Ready</Badge> : <Badge tone={item.isDuplicate ? "warning" : "danger"}><XCircle size={12} /> Hold</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
              <Button variant="secondary" onClick={() => { setItems([]); setFileName(""); setStep("upload"); }}>Upload another file</Button>
              <Button disabled={busy || counts.valid === 0} onClick={executeImport}>
                <Import size={16} /> {busy ? "Importing..." : `Import ${counts.valid} Questions`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function formatChapter(chapter: QuestionBankChapter) {
  return chapter.chapterNumber ? `${String(chapter.chapterNumber).padStart(2, "0")} - ${chapter.name}` : chapter.name;
}
