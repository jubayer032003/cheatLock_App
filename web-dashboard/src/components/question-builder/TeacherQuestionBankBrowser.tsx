import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Eye, Filter, Loader2, RefreshCw, Search, X } from "lucide-react";
import {
  createQuestionBankSnapshots,
  fetchQuestionBankChapters,
  fetchQuestionBankClasses,
  fetchQuestionBankQuestion,
  fetchQuestionBankSubjects,
  importQuestionBankQuestionsIntoExam,
  searchTeacherQuestionBank,
} from "../../lib/api";
import {
  buildTeacherQuestionBankParams,
  nextFiltersAfterClassChange,
  nextFiltersAfterSubjectChange,
} from "../../lib/questionBankBrowser";
import type {
  Exam,
  ExamQuestion,
  QuestionBankChapter,
  QuestionBankClass,
  QuestionBankQuestion,
  QuestionBankSearchFilters,
  QuestionBankSubject,
} from "../../types";
import { Badge, Card, Dialog, EmptyState, ErrorState, SkeletonBlock, cn } from "../ui";

type Props = {
  open: boolean;
  examId?: string;
  existingSourceIds: Set<string>;
  onClose: () => void;
  onImported: (questions: ExamQuestion[], exam?: Pick<Exam, "id" | "title" | "questions">) => void;
};

const LIMIT = 10;

export function TeacherQuestionBankBrowser({ open, examId, existingSourceIds, onClose, onImported }: Props) {
  const [classes, setClasses] = useState<QuestionBankClass[]>([]);
  const [subjects, setSubjects] = useState<QuestionBankSubject[]>([]);
  const [chapters, setChapters] = useState<QuestionBankChapter[]>([]);
  const [filters, setFilters] = useState<QuestionBankSearchFilters>({ page: 1, limit: LIMIT });
  const [searchInput, setSearchInput] = useState("");
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState("");
  const [preview, setPreview] = useState<QuestionBankQuestion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState("");

  const debouncedSearch = useDebouncedValue(searchInput, 350);
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const chapterMap = useMemo(() => new Map(chapters.map((item) => [item.id, item])), [chapters]);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  useEffect(() => {
    if (!open) return;
    setHierarchyLoading(true);
    setError("");
    fetchQuestionBankClasses()
      .then(setClasses)
      .catch((error) => setError(readErrorMessage(error, "Could not load Question Bank classes.")))
      .finally(() => setHierarchyLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFilters((current) => ({ ...current, search: debouncedSearch, page: 1 }));
  }, [debouncedSearch, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    searchTeacherQuestionBank(buildTeacherQuestionBankParams(filters))
      .then((result) => {
        if (cancelled) return;
        setQuestions(result.questions);
        setTotal(result.total);
      })
      .catch((error) => {
        if (!cancelled) setError(readErrorMessage(error, "Could not load Question Bank questions."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, open]);

  useEffect(() => {
    if (!previewId) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError("");
    fetchQuestionBankQuestion(previewId)
      .then(setPreview)
      .catch((error) => setPreviewError(readErrorMessage(error, "Could not load question preview.")))
      .finally(() => setPreviewLoading(false));
  }, [previewId]);

  function retrySearch() {
    setFilters((current) => ({ ...current }));
  }

  function selectClass(classId: string) {
    setFilters((current) => nextFiltersAfterClassChange(current, classId));
    setSubjects([]);
    setChapters([]);
    if (!classId) return;
    setHierarchyLoading(true);
    fetchQuestionBankSubjects(classId)
      .then(setSubjects)
      .catch((error) => setError(readErrorMessage(error, "Could not load subjects for this class.")))
      .finally(() => setHierarchyLoading(false));
  }

  function selectSubject(subjectId: string) {
    setFilters((current) => nextFiltersAfterSubjectChange(current, subjectId));
    setChapters([]);
    if (!subjectId) return;
    setHierarchyLoading(true);
    fetchQuestionBankChapters(subjectId)
      .then(setChapters)
      .catch((error) => setError(readErrorMessage(error, "Could not load chapters for this subject.")))
      .finally(() => setHierarchyLoading(false));
  }

  function toggleSelection(question: QuestionBankQuestion) {
    if (existingSourceIds.has(question.id)) return;
    setSuccess("");
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  }

  async function importSelected() {
    const questionIds = [...selectedIds].filter((id) => !existingSourceIds.has(id));
    if (questionIds.length === 0 || importing) return;
    setImporting(true);
    setError("");
    setSuccess("");
    try {
      if (examId) {
        const result = await importQuestionBankQuestionsIntoExam(examId, questionIds);
        onImported(result.exam.questions, result.exam);
        setSuccess(`${result.added} question${result.added === 1 ? "" : "s"} added to this exam.`);
      } else {
        const result = await createQuestionBankSnapshots(questionIds);
        onImported(result.questions);
        setSuccess(`${result.added} question${result.added === 1 ? "" : "s"} added to the exam draft.`);
      }
      setSelectedIds(new Set());
    } catch (error) {
      setError(readErrorMessage(error, "Could not add selected Question Bank questions."));
    } finally {
      setImporting(false);
    }
  }

  function resetFilters() {
    setFilters({ page: 1, limit: LIMIT });
    setSearchInput("");
    setSubjects([]);
    setChapters([]);
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Use Question Bank">
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                aria-label="Search Question Bank"
                className="field-input h-12 pl-9"
                placeholder="Search question text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button" type="button" onClick={resetFilters}>
                <X size={15} />
                Clear filters
              </button>
              <button className="secondary-button" type="button" onClick={retrySearch}>
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Filter size={16} className="text-cyan-600 dark:text-cyan-300" />
              <p className="font-bold text-slate-950 dark:text-white">Filters</p>
              {hierarchyLoading && <Loader2 className="animate-spin text-slate-400" size={15} />}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SelectField label="Class" value={filters.classId || ""} onChange={selectClass} options={classes.map((item) => ({ value: item.id, label: item.name }))} />
              <SelectField label="Subject" value={filters.subjectId || ""} onChange={selectSubject} disabled={!filters.classId} options={subjects.map((item) => ({ value: item.id, label: item.name }))} />
              <SelectField label="Chapter" value={filters.chapterId || ""} onChange={(chapterId) => setFilters((current) => ({ ...current, chapterId: chapterId || undefined, page: 1 }))} disabled={!filters.subjectId} options={chapters.map((item) => ({ value: item.id, label: item.name }))} />
              <SelectField label="Difficulty" value={filters.difficulty || ""} onChange={(difficulty) => setFilters((current) => ({ ...current, difficulty: difficulty as QuestionBankSearchFilters["difficulty"] || undefined, page: 1 }))} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
              <SelectField label="Type" value={filters.questionType || ""} onChange={(questionType) => setFilters((current) => ({ ...current, questionType: questionType as QuestionBankSearchFilters["questionType"] || undefined, page: 1 }))} options={[{ value: "mcq", label: "MCQ" }, { value: "true_false", label: "True/False" }, { value: "short_answer", label: "Short answer" }]} />
            </div>
          </Card>

          {error && <ErrorState message={error} onRetry={retrySearch} />}
          {success && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" role="status">{success}</p>}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="min-h-[520px] p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950 dark:text-white">Question results</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{total} active question{total === 1 ? "" : "s"} found</p>
                </div>
                <Badge tone={selectedIds.size > 0 ? "primary" : "neutral"}>{selectedIds.size} selected</Badge>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock className="h-28" key={index} />)}
                </div>
              ) : questions.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title={hasAnyFilter(filters, searchInput) ? "No matching questions" : "No active questions"}
                  description={hasAnyFilter(filters, searchInput) ? "Adjust filters or clear the search." : "Ask an administrator to activate Question Bank questions."}
                />
              ) : (
                <div className="space-y-3">
                  {questions.map((question) => {
                    const selected = selectedIds.has(question.id);
                    const alreadyAdded = existingSourceIds.has(question.id);
                    return (
                      <article className={cn("rounded-xl border p-3 transition", selected ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]", alreadyAdded && "opacity-70")} key={question.id}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start">
                          <button
                            className={cn("flex min-h-10 w-full rounded-md border px-3 py-2 text-left focus:outline-none focus:ring-4 focus:ring-cyan-200 md:w-32 md:justify-center", selected ? "border-cyan-300 bg-cyan-100 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-100" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200")}
                            type="button"
                            aria-pressed={selected}
                            disabled={alreadyAdded}
                            onClick={() => toggleSelection(question)}
                          >
                            {alreadyAdded ? "Already Added" : selected ? <span className="inline-flex items-center gap-1"><Check size={15} />Selected</span> : "Select"}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold leading-6 text-slate-950 dark:text-white">{question.questionText}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <Meta label={classMap.get(question.classId)?.name || question.classId} />
                              <Meta label={subjectMap.get(question.subjectId)?.name || question.subjectId} />
                              {question.chapterId && <Meta label={chapterMap.get(question.chapterId)?.name || question.chapterId} />}
                              <Meta label={question.difficulty} />
                              <Meta label={question.questionType} />
                              <Meta label={`${question.marks} mark${question.marks === 1 ? "" : "s"}`} />
                            </div>
                          </div>
                          <button className="secondary-button shrink-0" type="button" onClick={() => setPreviewId(question.id)}>
                            <Eye size={15} />
                            Preview
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">Page {filters.page || 1} of {totalPages}</p>
                <div className="flex gap-2">
                  <button className="secondary-button" type="button" disabled={(filters.page || 1) <= 1 || loading} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, (current.page || 1) - 1) }))}>Previous</button>
                  <button className="secondary-button" type="button" disabled={(filters.page || 1) >= totalPages || loading} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) + 1 }))}>Next</button>
                </div>
              </div>
            </Card>

            <Card className="h-fit p-4">
              <p className="font-bold text-slate-950 dark:text-white">Add selected</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                The server creates exam-safe snapshots. Central Question Bank edits later will not change imported exam questions.
              </p>
              <button className="primary-button mt-4 w-full" type="button" disabled={selectedIds.size === 0 || importing} onClick={importSelected}>
                {importing ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                {importing ? "Adding..." : `Add ${selectedIds.size || ""} to exam`}
              </button>
              <button className="secondary-button mt-2 w-full" type="button" onClick={onClose}>Continue builder</button>
            </Card>
          </div>
        </div>
      </Dialog>

      <QuestionPreviewDialog question={preview} loading={previewLoading} error={previewError} onClose={() => setPreviewId("")} />
    </>
  );
}

function QuestionPreviewDialog({ question, loading, error, onClose }: { question: QuestionBankQuestion | null; loading: boolean; error: string; onClose: () => void }) {
  return (
    <Dialog open={Boolean(question) || loading || Boolean(error)} onClose={onClose} title="Question preview">
      {loading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-32" />
        </div>
      ) : error ? (
        <ErrorState message={error} />
      ) : question ? (
        <div className="space-y-4">
          <div>
            <Badge tone="primary">{question.questionType}</Badge>
            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950 dark:text-white">{question.questionText}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Meta label={question.difficulty} />
              <Meta label={`${question.marks} mark${question.marks === 1 ? "" : "s"}`} />
              <Meta label={question.status} />
            </div>
          </div>
          {question.options.length > 0 && (
            <div className="space-y-2">
              <p className="font-bold text-slate-950 dark:text-white">Options</p>
              {question.options.map((option, index) => (
                <div className={cn("rounded-lg border p-3 text-sm", option.isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035]")} key={option.id || index}>
                  {index + 1}. {option.text} {option.isCorrect ? "(Correct)" : ""}
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="font-bold text-slate-950 dark:text-white">Explanation</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-500 dark:text-slate-400">{question.explanation || "No explanation provided."}</p>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function SelectField({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Meta({ label }: { label: string }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300">{label}</span>;
}

function hasAnyFilter(filters: QuestionBankSearchFilters, search: string) {
  return Boolean(filters.classId || filters.subjectId || filters.chapterId || filters.difficulty || filters.questionType || search.trim());
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function readErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string; error?: string } } }).response;
    return response?.data?.message || response?.data?.error || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
