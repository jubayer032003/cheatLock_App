import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Copy,
  GripVertical,
  Monitor,
  Plus,
  Search,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Card, EmptyState, cn } from "../ui";
import type { Exam, ExamQuestion, QuestionType } from "../../types";
import { questionBankSourceIds } from "../../lib/questionBankBrowser";
import {
  type BuilderQuestion,
  type CompletionStatus,
  completionStatus,
  definitionFor,
  duplicateQuestion,
  fromExamQuestion,
  getRecords,
  getStringArray,
  questionRegistry,
  toExamQuestion,
  validateQuestion,
} from "./questionRegistry";
import { TeacherQuestionBankBrowser } from "./TeacherQuestionBankBrowser";

type PreviewWidth = "desktop" | "tablet" | "mobile";

export function QuestionBuilder({
  questions,
  onChange,
  examId,
  onExamUpdated,
}: {
  questions: ExamQuestion[];
  onChange: (questions: ExamQuestion[]) => void;
  examId?: string;
  onExamUpdated?: (exam: Pick<Exam, "id" | "title" | "questions">) => void;
}) {
  const [builderQuestions, setBuilderQuestions] = useState<BuilderQuestion[]>(() => questions.map(fromExamQuestion));
  const [selectedId, setSelectedId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setBuilderQuestions(questions.map(fromExamQuestion));
  }, [questions]);

  useEffect(() => {
    if (!selectedId && builderQuestions[0]) setSelectedId(builderQuestions[0].id);
  }, [builderQuestions, selectedId]);

  function commit(next: BuilderQuestion[]) {
    isInternalChange.current = true;
    setBuilderQuestions(next);
    onChange(next.map(toExamQuestion));
  }

  const selectedQuestion = builderQuestions.find((question) => question.id === selectedId) || builderQuestions[0] || null;
  const selectedErrors = selectedQuestion ? validateQuestion(selectedQuestion) : {};
  const totalMarks = builderQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);

  function updateQuestion(id: string, patch: Partial<BuilderQuestion>) {
    commit(builderQuestions.map((question) => (question.id === id ? { ...question, ...patch } : question)));
  }

  function updateData(id: string, patch: Record<string, unknown>) {
    commit(builderQuestions.map((question) => (question.id === id ? { ...question, data: { ...question.data, ...patch } } : question)));
  }

  function addQuestion(type: QuestionType) {
    const next = definitionFor(type).defaultQuestion();
    commit([...builderQuestions, next]);
    setSelectedId(next.id);
    setModalOpen(false);
    setMobileNavOpen(false);
  }

  function addQuestionBankSnapshots(importedQuestions: ExamQuestion[], exam?: Pick<Exam, "id" | "title" | "questions">) {
    const sourceIds = questionBankSourceIds(builderQuestions);
    const deduped = importedQuestions.filter((question) => {
      const sourceId = typeof question.data?.sourceQuestionId === "string" ? question.data.sourceQuestionId : "";
      return sourceId && !sourceIds.has(sourceId);
    });
    if (deduped.length === 0) return;
    const next = [...builderQuestions, ...deduped.map(fromExamQuestion)];
    commit(next);
    setSelectedId(next[next.length - 1]?.id || "");
    onExamUpdated?.(exam || { id: examId || "", title: "", questions: next.map(toExamQuestion) });
    setMobileNavOpen(false);
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= builderQuestions.length) return;
    const next = [...builderQuestions];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  }

  function deleteQuestion(id: string) {
    const question = builderQuestions.find((item) => item.id === id);
    if (!question || !window.confirm(`Delete "${question.text || definitionFor(question.type).label}"?`)) return;
    const next = builderQuestions.filter((item) => item.id !== id);
    commit(next);
    setSelectedId(next[0]?.id || "");
  }

  function duplicate(id: string) {
    const index = builderQuestions.findIndex((item) => item.id === id);
    if (index < 0) return;
    const clone = duplicateQuestion(builderQuestions[index]);
    const next = [...builderQuestions];
    next.splice(index + 1, 0, clone);
    commit(next);
    setSelectedId(clone.id);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">Question Builder</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{builderQuestions.length} questions · {totalMarks} marks · Draft changes are saved when the exam is created.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button lg:hidden" type="button" onClick={() => setMobileNavOpen(true)}>Questions</button>
          <button className="secondary-button lg:hidden" type="button" onClick={() => setMobileSettingsOpen(true)}><Settings2 size={16} />Settings</button>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-command-950/70">
            <button className={cn("rounded px-3 py-1.5 text-sm font-semibold", !previewMode && "bg-cyan-500 text-slate-950")} type="button" onClick={() => setPreviewMode(false)}>Build</button>
            <button className={cn("rounded px-3 py-1.5 text-sm font-semibold", previewMode && "bg-cyan-500 text-slate-950")} type="button" onClick={() => setPreviewMode(true)}>Student Preview</button>
          </div>
        </div>
      </div>

      {previewMode ? (
        <StudentPreview questions={builderQuestions} previewWidth={previewWidth} setPreviewWidth={setPreviewWidth} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
          <QuestionNavigator questions={builderQuestions} selectedId={selectedQuestion?.id || ""} onSelect={setSelectedId} onAdd={() => setModalOpen(true)} onMove={moveQuestion} onDuplicate={duplicate} onDelete={deleteQuestion} />
          <Card className="min-h-[620px] p-4">
            {selectedQuestion ? (
              <QuestionEditor question={selectedQuestion} errors={selectedErrors} updateQuestion={updateQuestion} updateData={updateData} />
            ) : (
              <EmptyState icon={Plus} title="No question selected" description="Add a question type to start building this exam." />
            )}
          </Card>
          <aside className="hidden lg:block">
            {selectedQuestion && <QuestionSettings question={selectedQuestion} errors={selectedErrors} updateQuestion={updateQuestion} updateData={updateData} />}
          </aside>
        </div>
      )}

      {mobileNavOpen && (
        <Drawer title="Questions" onClose={() => setMobileNavOpen(false)}>
          <QuestionNavigator questions={builderQuestions} selectedId={selectedQuestion?.id || ""} onSelect={(id) => { setSelectedId(id); setMobileNavOpen(false); }} onAdd={() => setModalOpen(true)} onMove={moveQuestion} onDuplicate={duplicate} onDelete={deleteQuestion} />
        </Drawer>
      )}
      {mobileSettingsOpen && selectedQuestion && (
        <Drawer title="Question settings" onClose={() => setMobileSettingsOpen(false)}>
          <QuestionSettings question={selectedQuestion} errors={selectedErrors} updateQuestion={updateQuestion} updateData={updateData} />
        </Drawer>
      )}
      <AddQuestionModal
        open={modalOpen}
        examId={examId}
        questions={builderQuestions.map(toExamQuestion)}
        onClose={() => setModalOpen(false)}
        onAdd={addQuestion}
        onAddQuestionBank={addQuestionBankSnapshots}
      />
    </section>
  );
}

function QuestionNavigator({ questions, selectedId, onSelect, onAdd, onMove, onDuplicate, onDelete }: {
  questions: BuilderQuestion[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="hidden overflow-hidden lg:flex lg:min-h-[620px] lg:flex-col">
      <QuestionNavContent questions={questions} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} />
    </Card>
  );
}

function QuestionNavContent({ questions, selectedId, onSelect, onAdd, onMove, onDuplicate, onDelete }: {
  questions: BuilderQuestion[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="border-b border-slate-200 p-4 dark:border-white/10">
        <p className="text-sm font-bold text-slate-950 dark:text-white">Question navigator</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Select, reorder, duplicate or delete.</p>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {questions.map((question, index) => {
          const definition = definitionFor(question.type);
          const status = completionStatus(question);
          const Icon = definition.icon;
          return (
            <div className={cn("rounded-xl border p-2 transition", selectedId === question.id ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]")} key={question.id}>
              <button className="w-full text-left focus:outline-none focus:ring-4 focus:ring-cyan-200" type="button" onClick={() => onSelect(question.id)}>
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-0.5 text-slate-400" size={16} />
                  <Icon className="mt-0.5 text-cyan-600 dark:text-cyan-300" size={16} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">Q{index + 1}. {definition.shortLabel}</p>
                      <span className="text-xs font-semibold text-slate-500">{question.marks}m</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{question.text || "Untitled question"}</p>
                    <StatusPill status={status} />
                  </div>
                </div>
              </button>
              <div className="mt-2 flex justify-end gap-1">
                <button className="icon-button h-8 w-8" type="button" title="Move up" onClick={() => onMove(index, -1)}>↑</button>
                <button className="icon-button h-8 w-8" type="button" title="Move down" onClick={() => onMove(index, 1)}>↓</button>
                <button className="icon-button h-8 w-8" type="button" title="Duplicate" onClick={() => onDuplicate(question.id)}><Copy size={14} /></button>
                <button className="icon-button h-8 w-8 text-rose-600" type="button" title="Delete" onClick={() => onDelete(question.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {questions.length === 0 && <EmptyState icon={Plus} title="No questions yet" description="Add a question to begin." />}
      </div>
      <div className="border-t border-slate-200 p-3 dark:border-white/10">
        <button className="primary-button w-full" type="button" onClick={onAdd}><Plus size={16} />Add Question</button>
      </div>
    </>
  );
}

function QuestionEditor({ question, errors, updateQuestion, updateData }: {
  question: BuilderQuestion;
  errors: Record<string, string>;
  updateQuestion: (id: string, patch: Partial<BuilderQuestion>) => void;
  updateData: (id: string, patch: Record<string, unknown>) => void;
}) {
  const definition = definitionFor(question.type);
  const Icon = definition.icon;
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
        <div>
          <Badge tone="primary"><Icon size={14} />{definition.label}</Badge>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-950 dark:text-white">Question editor</h3>
        </div>
        {Object.keys(errors).length > 0 && <Badge tone="warning"><AlertCircle size={14} />Needs attention</Badge>}
      </div>
      <Field label="Question prompt" error={errors.text}>
        <textarea className="field-input min-h-28 py-3" value={question.text} onChange={(event) => updateQuestion(question.id, { text: event.target.value })} placeholder="Write the exact prompt students will see." />
      </Field>
      <Field label="Description / instructions">
        <textarea className="field-input mt-3 min-h-20 py-3" value={String(question.data.description || "")} onChange={(event) => updateData(question.id, { description: event.target.value })} placeholder="Optional supporting context, rich text can be added later." />
      </Field>
      <TypeSpecificEditor question={question} errors={errors} updateQuestion={updateQuestion} updateData={updateData} />
      <Field label="Explanation or solution">
        <textarea className="field-input mt-3 min-h-20 py-3" value={question.explanation || ""} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} placeholder="Teacher-facing explanation, marking guidance, or solution." />
      </Field>
      <Field label="Optional media attachment URL">
        <input className="field-input mt-3" value={question.mediaUrl || ""} onChange={(event) => updateQuestion(question.id, { mediaUrl: event.target.value })} placeholder="https://..." />
      </Field>
    </div>
  );
}

function TypeSpecificEditor(props: { question: BuilderQuestion; errors: Record<string, string>; updateQuestion: (id: string, patch: Partial<BuilderQuestion>) => void; updateData: (id: string, patch: Record<string, unknown>) => void }) {
  const { question } = props;
  if (question.type === "MCQ" || question.type === "MULTI_SELECT") return <McqEditor {...props} multiple={question.type === "MULTI_SELECT"} />;
  if (question.type === "CQ") return <WrittenEditor {...props} />;
  if (question.type === "MATH") return <MathEditor {...props} />;
  if (question.type === "CODE") return <CodeEditor {...props} />;
  if (question.type === "TRUE_FALSE") return <TrueFalseEditor {...props} />;
  if (question.type === "FILL_BLANK") return <FillBlankEditor {...props} />;
  if (question.type === "MATCHING") return <MatchingEditor {...props} />;
  if (question.type === "ORDERING") return <OrderingEditor {...props} />;
  if (question.type === "CASE_STUDY") return <CaseStudyEditor {...props} />;
  if (question.type === "FILE_UPLOAD") return <FileUploadEditor {...props} />;
  return <ImageQuestionEditor {...props} />;
}

function McqEditor({ question, errors, updateQuestion, updateData, multiple }: EditorProps & { multiple: boolean }) {
  const options = question.options || [];
  const correctAnswers = multiple ? getStringArray(question.data.correctAnswers) : [];
  const optionExplanations = getStringArray(question.data.optionExplanations);
  return (
    <Panel title="Answer options" error={errors.options || errors.correctAnswer}>
      <div className="space-y-3">
        {options.map((option, index) => {
          const key = String(index);
          const isChecked = multiple ? correctAnswers.includes(key) : question.correctAnswer === key;
          return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-command-950/40" key={index}>
              <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                <input aria-label={`Correct option ${index + 1}`} className="h-4 w-4 accent-cyan-500" type={multiple ? "checkbox" : "radio"} checked={isChecked} onChange={(event) => {
                  if (multiple) {
                    const next = event.target.checked ? [...correctAnswers, key] : correctAnswers.filter((item) => item !== key);
                    updateData(question.id, { correctAnswers: next });
                  } else {
                    updateQuestion(question.id, { correctAnswer: key });
                  }
                }} />
                <input className="field-input" value={option} onChange={(event) => updateQuestion(question.id, { options: options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder={`Option ${index + 1}`} />
                <button className="icon-button" type="button" title="Remove option" onClick={() => updateQuestion(question.id, { options: options.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>
              </div>
              <input className="field-input mt-2" value={optionExplanations[index] || ""} onChange={(event) => updateData(question.id, { optionExplanations: optionExplanations.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder="Optional explanation for this option" />
            </div>
          );
        })}
      </div>
      <button className="secondary-button mt-3" type="button" onClick={() => updateQuestion(question.id, { options: [...options, ""] })}><Plus size={16} />Add option</button>
    </Panel>
  );
}

type EditorProps = {
  question: BuilderQuestion;
  errors: Record<string, string>;
  updateQuestion: (id: string, patch: Partial<BuilderQuestion>) => void;
  updateData: (id: string, patch: Record<string, unknown>) => void;
};

function WrittenEditor({ question, updateData }: EditorProps) {
  const rubric = getRecords(question.data.rubric);
  return <Panel title="Written answer configuration">
    <TextArea label="Suggested answer" value={String(question.data.suggestedAnswer || "")} onChange={(value) => updateData(question.id, { suggestedAnswer: value })} />
    <ArrayInput label="Rubric criteria" items={rubric} addLabel="Add criterion" render={(item, index) => (
      <div className="grid gap-2 md:grid-cols-[1fr_120px]">
        <input className="field-input" value={String(item.criterion || "")} onChange={(event) => updateData(question.id, { rubric: rubric.map((row, rowIndex) => rowIndex === index ? { ...row, criterion: event.target.value } : row) })} placeholder="Criterion" />
        <input className="field-input" value={String(item.marks || "")} onChange={(event) => updateData(question.id, { rubric: rubric.map((row, rowIndex) => rowIndex === index ? { ...row, marks: Number(event.target.value) || 0 } : row) })} placeholder="Marks" />
      </div>
    )} onAdd={() => updateData(question.id, { rubric: [...rubric, { criterion: "", marks: 1 }] })} />
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <NumberInput label="Min words" value={Number(question.data.minWords || 0)} onChange={(value) => updateData(question.id, { minWords: value })} />
      <NumberInput label="Max words" value={Number(question.data.maxWords || 0)} onChange={(value) => updateData(question.id, { maxWords: value })} />
      <ToggleRow label="Manual grading" checked={Boolean(question.data.manualGrading)} onChange={(value) => updateData(question.id, { manualGrading: value })} />
    </div>
    <TextArea label="Sample answer" value={String(question.data.sampleAnswer || "")} onChange={(value) => updateData(question.id, { sampleAnswer: value })} />
  </Panel>;
}

function MathEditor({ question, errors, updateData }: EditorProps) {
  const answers = getStringArray(question.data.acceptedAnswers);
  return <Panel title="Math configuration" error={errors.acceptedAnswers}>
    <div className="mb-3 flex flex-wrap gap-2">
      {["π", "√", "±", "≤", "≥", "∑", "∞"].map((symbol) => <button className="secondary-button h-9" type="button" key={symbol} onClick={() => updateData(question.id, { latex: `${String(question.data.latex || "")}${symbol}` })}>{symbol}</button>)}
    </div>
    <TextArea label="LaTeX / equation input" value={String(question.data.latex || "")} onChange={(value) => updateData(question.id, { latex: value })} />
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm dark:border-white/10 dark:bg-white/[0.035]">{String(question.data.latex || "Equation preview")}</div>
    <StringList label="Accepted answers" values={answers} onChange={(values) => updateData(question.id, { acceptedAnswers: values })} />
    <div className="grid gap-3 md:grid-cols-3">
      <Input label="Numeric tolerance" value={String(question.data.tolerance || "")} onChange={(value) => updateData(question.id, { tolerance: value })} />
      <Input label="Unit" value={String(question.data.unit || "")} onChange={(value) => updateData(question.id, { unit: value })} />
      <ToggleRow label="Partial marking" checked={Boolean(question.data.partialMarking)} onChange={(value) => updateData(question.id, { partialMarking: value })} />
    </div>
    <TextArea label="Step-by-step solution" value={String(question.data.stepSolution || "")} onChange={(value) => updateData(question.id, { stepSolution: value })} />
  </Panel>;
}

function CodeEditor({ question, errors, updateData }: EditorProps) {
  const publicTests = getRecords(question.data.publicTests);
  return <Panel title="Code question configuration" error={errors.language || errors.publicTests}>
    <div className="grid gap-3 md:grid-cols-3">
      <Select label="Language" value={String(question.data.language || "javascript")} options={["javascript", "python", "java", "c", "cpp"]} onChange={(value) => updateData(question.id, { language: value })} />
      <NumberInput label="Time limit ms" value={Number(question.data.timeLimitMs || 2000)} onChange={(value) => updateData(question.id, { timeLimitMs: value })} />
      <NumberInput label="Memory MB" value={Number(question.data.memoryLimitMb || 128)} onChange={(value) => updateData(question.id, { memoryLimitMb: value })} />
    </div>
    <TextArea label="Problem statement" value={String(question.data.problemStatement || "")} onChange={(value) => updateData(question.id, { problemStatement: value })} />
    <Input label="Function signature" value={String(question.data.functionSignature || "")} onChange={(value) => updateData(question.id, { functionSignature: value })} />
    <TextArea label="Starter code" value={String(question.data.starterCode || "")} onChange={(value) => updateData(question.id, { starterCode: value })} code />
    <ArrayInput label="Public test cases" items={publicTests} addLabel="Add test" onAdd={() => updateData(question.id, { publicTests: [...publicTests, { input: "", expectedOutput: "" }] })} render={(item, index) => (
      <div className="grid gap-2 md:grid-cols-2">
        <input className="field-input" value={String(item.input || "")} onChange={(event) => updateData(question.id, { publicTests: publicTests.map((row, rowIndex) => rowIndex === index ? { ...row, input: event.target.value } : row) })} placeholder="Input" />
        <input className="field-input" value={String(item.expectedOutput || "")} onChange={(event) => updateData(question.id, { publicTests: publicTests.map((row, rowIndex) => rowIndex === index ? { ...row, expectedOutput: event.target.value } : row) })} placeholder="Expected output" />
      </div>
    )} />
    <Select label="Grading mode" value={String(question.data.gradingMode || "manual")} options={["manual", "automatic"]} onChange={(value) => updateData(question.id, { gradingMode: value })} />
    <TextArea label="Reference solution" value={String(question.data.referenceSolution || "")} onChange={(value) => updateData(question.id, { referenceSolution: value })} code />
  </Panel>;
}

function TrueFalseEditor({ question, updateData }: EditorProps) {
  return <Panel title="True / false configuration">
    <Select label="Correct answer" value={String(question.data.correct ?? true)} options={["true", "false"]} onChange={(value) => updateData(question.id, { correct: value === "true" })} />
    <ToggleRow label="Student must explain" checked={Boolean(question.data.studentMustExplain)} onChange={(value) => updateData(question.id, { studentMustExplain: value })} />
  </Panel>;
}

function FillBlankEditor({ question, updateData }: EditorProps) {
  const blanks = getRecords(question.data.blanks);
  return <Panel title="Blank configuration">
    <ArrayInput label="Blanks" items={blanks} addLabel="Add blank" onAdd={() => updateData(question.id, { blanks: [...blanks, { label: `Blank ${blanks.length + 1}`, answers: [""] }] })} render={(blank, index) => (
      <div className="grid gap-2 md:grid-cols-[180px_1fr]">
        <input className="field-input" value={String(blank.label || "")} onChange={(event) => updateData(question.id, { blanks: blanks.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) })} />
        <input className="field-input" value={getStringArray(blank.answers).join(", ")} onChange={(event) => updateData(question.id, { blanks: blanks.map((row, rowIndex) => rowIndex === index ? { ...row, answers: event.target.value.split(",").map((item) => item.trim()) } : row) })} placeholder="accepted, answers" />
      </div>
    )} />
    <div className="grid gap-3 md:grid-cols-3">
      <ToggleRow label="Case sensitive" checked={Boolean(question.data.caseSensitive)} onChange={(value) => updateData(question.id, { caseSensitive: value })} />
      <ToggleRow label="Word bank" checked={Boolean(question.data.wordBank)} onChange={(value) => updateData(question.id, { wordBank: value })} />
      <ToggleRow label="Partial marks" checked={Boolean(question.data.partialMarks)} onChange={(value) => updateData(question.id, { partialMarks: value })} />
    </div>
  </Panel>;
}

function MatchingEditor({ question, errors, updateData }: EditorProps) {
  const pairs = getRecords(question.data.pairs);
  return <Panel title="Matching pairs" error={errors.pairs}>
    <ArrayInput label="Pairs" items={pairs} addLabel="Add pair" onAdd={() => updateData(question.id, { pairs: [...pairs, { left: "", right: "" }] })} render={(pair, index) => (
      <div className="grid gap-2 md:grid-cols-2">
        <input className="field-input" value={String(pair.left || "")} onChange={(event) => updateData(question.id, { pairs: pairs.map((row, rowIndex) => rowIndex === index ? { ...row, left: event.target.value } : row) })} placeholder="Left item" />
        <input className="field-input" value={String(pair.right || "")} onChange={(event) => updateData(question.id, { pairs: pairs.map((row, rowIndex) => rowIndex === index ? { ...row, right: event.target.value } : row) })} placeholder="Right match" />
      </div>
    )} />
    <ToggleRow label="Shuffle choices" checked={Boolean(question.data.shuffle)} onChange={(value) => updateData(question.id, { shuffle: value })} />
  </Panel>;
}

function OrderingEditor({ question, errors, updateData }: EditorProps) {
  return <Panel title="Ordering items" error={errors.items}>
    <StringList label="Correct order" values={getStringArray(question.data.items)} onChange={(items) => updateData(question.id, { items })} />
    <div className="grid gap-3 md:grid-cols-2">
      <ToggleRow label="Shuffle for students" checked={Boolean(question.data.shuffle)} onChange={(value) => updateData(question.id, { shuffle: value })} />
      <ToggleRow label="Partial marking" checked={Boolean(question.data.partialMarks)} onChange={(value) => updateData(question.id, { partialMarks: value })} />
    </div>
  </Panel>;
}

function CaseStudyEditor({ question, errors, updateData }: EditorProps) {
  const childQuestions = getRecords(question.data.childQuestions);
  return <Panel title="Case study" error={errors.childQuestions}>
    <TextArea label="Shared passage or context" value={String(question.data.passage || "")} onChange={(value) => updateData(question.id, { passage: value })} />
    <Input label="Context image URL" value={String(question.data.contextImageUrl || "")} onChange={(value) => updateData(question.id, { contextImageUrl: value })} />
    <ArrayInput label="Child questions" items={childQuestions} addLabel="Add child question" onAdd={() => updateData(question.id, { childQuestions: [...childQuestions, { prompt: "", type: "CQ", marks: 1 }] })} render={(child, index) => (
      <div className="grid gap-2 md:grid-cols-[1fr_120px_100px]">
        <input className="field-input" value={String(child.prompt || "")} onChange={(event) => updateData(question.id, { childQuestions: childQuestions.map((row, rowIndex) => rowIndex === index ? { ...row, prompt: event.target.value } : row) })} placeholder="Child prompt" />
        <select className="field-input" value={String(child.type || "CQ")} onChange={(event) => updateData(question.id, { childQuestions: childQuestions.map((row, rowIndex) => rowIndex === index ? { ...row, type: event.target.value } : row) })}><option>CQ</option><option>MCQ</option><option>TRUE_FALSE</option></select>
        <input className="field-input" value={String(child.marks || 1)} onChange={(event) => updateData(question.id, { childQuestions: childQuestions.map((row, rowIndex) => rowIndex === index ? { ...row, marks: Number(event.target.value) || 1 } : row) })} />
      </div>
    )} />
  </Panel>;
}

function FileUploadEditor({ question, errors, updateData }: EditorProps) {
  return <Panel title="File upload rules" error={errors.acceptedFileTypes}>
    <TextArea label="Instructions" value={String(question.data.instructions || "")} onChange={(value) => updateData(question.id, { instructions: value })} />
    <StringList label="Accepted file types" values={getStringArray(question.data.acceptedFileTypes)} onChange={(acceptedFileTypes) => updateData(question.id, { acceptedFileTypes })} />
    <div className="grid gap-3 md:grid-cols-3">
      <NumberInput label="Max size MB" value={Number(question.data.maxFileSizeMb || 10)} onChange={(value) => updateData(question.id, { maxFileSizeMb: value })} />
      <NumberInput label="Max files" value={Number(question.data.maxFiles || 1)} onChange={(value) => updateData(question.id, { maxFiles: value })} />
      <ToggleRow label="Manual grading" checked={Boolean(question.data.manualGrading)} onChange={(value) => updateData(question.id, { manualGrading: value })} />
    </div>
  </Panel>;
}

function ImageQuestionEditor({ question, updateData }: EditorProps) {
  return <Panel title="Image question">
    <Input label="Image URL" value={String(question.data.imageUrl || "")} onChange={(value) => updateData(question.id, { imageUrl: value })} />
    <Input label="Caption" value={String(question.data.caption || "")} onChange={(value) => updateData(question.id, { caption: value })} />
    <Input label="Alt text" value={String(question.data.altText || "")} onChange={(value) => updateData(question.id, { altText: value })} />
    <Select label="Answer mode" value={String(question.data.answerMode || "written")} options={["written", "mcq", "true_false"]} onChange={(value) => updateData(question.id, { answerMode: value })} />
  </Panel>;
}

function QuestionSettings({ question, errors, updateQuestion, updateData }: EditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold text-slate-950 dark:text-white">Question settings</h3>
      <div className="mt-4 space-y-3">
        <NumberInput label="Marks" value={question.marks} error={errors.marks} onChange={(marks) => updateQuestion(question.id, { marks })} />
        <Select label="Difficulty" value={question.difficulty} options={["easy", "medium", "hard"]} onChange={(difficulty) => updateQuestion(question.id, { difficulty: difficulty as BuilderQuestion["difficulty"] })} />
        <Input label="Subject" value={question.subject || ""} onChange={(subject) => updateQuestion(question.id, { subject })} />
        <Input label="Chapter / topic" value={question.chapter || ""} onChange={(chapter) => updateQuestion(question.id, { chapter })} />
        <NumberInput label="Estimated minutes" value={Number(question.estimatedMinutes || 0)} onChange={(estimatedMinutes) => updateQuestion(question.id, { estimatedMinutes })} />
        <ToggleRow label="Required" checked={question.required} onChange={(required) => updateQuestion(question.id, { required })} />
        <button className="secondary-button w-full justify-between" type="button" onClick={() => setAdvancedOpen((open) => !open)}>Advanced settings <ChevronDown size={16} /></button>
        {advancedOpen && (
          <div className="space-y-3">
            <NumberInput label="Negative marking" value={Number(question.negativeMarking || 0)} onChange={(negativeMarking) => updateQuestion(question.id, { negativeMarking })} />
            <ToggleRow label="Shuffle options" checked={Boolean(question.shuffleOptions)} onChange={(shuffleOptions) => updateQuestion(question.id, { shuffleOptions })} />
            <Input label="Tags" value={(question.tags || []).join(", ")} onChange={(value) => updateQuestion(question.id, { tags: value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
            <TextArea label="Teacher notes" value={question.teacherNotes || ""} onChange={(teacherNotes) => updateQuestion(question.id, { teacherNotes })} />
            <ToggleRow label="Auto grading enabled" checked={Boolean(question.data.autoGrading)} onChange={(autoGrading) => updateData(question.id, { autoGrading })} />
          </div>
        )}
      </div>
    </Card>
  );
}

function AddQuestionModal({
  open,
  examId,
  questions,
  onClose,
  onAdd,
  onAddQuestionBank,
}: {
  open: boolean;
  examId?: string;
  questions: ExamQuestion[];
  onClose: () => void;
  onAdd: (type: QuestionType) => void;
  onAddQuestionBank: (questions: ExamQuestion[], exam?: Pick<Exam, "id" | "title" | "questions">) => void;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"manual" | "bank">("manual");
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open && source === "manual") window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, source]);
  useEffect(() => {
    if (!open) source !== "manual" && setSource("manual");
  }, [open, source]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return questionRegistry;
    return questionRegistry.filter((item) =>
      `${item.label} ${item.shortLabel} ${item.category} ${item.description}`.toLowerCase().includes(term)
    );
  }, [query]);
  const categoryCounts = useMemo(
    () =>
      (["Popular", "Interactive", "Advanced"] as const).map((category) => ({
        category,
        count: filtered.filter((item) => item.category === category).length,
      })),
    [filtered]
  );
  if (!open) return null;
  if (source === "bank") {
    return (
      <TeacherQuestionBankBrowser
        open={open}
        examId={examId}
        existingSourceIds={questionBankSourceIds(questions)}
        onClose={onClose}
        onImported={onAddQuestionBank}
      />
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-question-title">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
                <Plus size={14} />
                Question library
              </div>
              <h2 id="add-question-title" className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Add question</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Choose a question type for this exam. Each type keeps its existing advanced fields, validation, and student preview behavior.
              </p>
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close add question"><X size={17} /></button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-command-950/70" aria-label="Question source">
              <button className={cn("rounded px-3 py-2 text-sm font-semibold", source === "manual" && "bg-cyan-500 text-slate-950")} type="button" onClick={() => setSource("manual")}>Create Own Question</button>
              <button className="rounded px-3 py-2 text-sm font-semibold" type="button" onClick={() => setSource("bank")}>Use Question Bank</button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                ref={searchRef}
                className="field-input h-12 pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search question types, e.g. code, math, image"
                aria-label="Search question types"
              />
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Question type category counts">
              {categoryCounts.map(({ category, count }) => {
                const meta = questionCategoryMeta(category);
                return (
                  <span className={cn("rounded-full border px-3 py-2 text-xs font-bold", meta.pillClass)} key={category}>
                    {category}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-950 sm:p-5">
          <div className="mb-5 grid gap-3 lg:grid-cols-3">
            <ChooserHint title="Fast setup" description="Use Popular types for common exams and quick grading workflows." />
            <ChooserHint title="Interactive work" description="Use Interactive types when students arrange, match, upload images, or fill structured answers." />
            <ChooserHint title="Complex assessment" description="Use Advanced types for case studies and file-based manual review." />
          </div>

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/15 dark:bg-white/[0.035]">
              <Search className="mx-auto text-slate-400" size={28} />
              <p className="mt-3 font-bold text-slate-950 dark:text-white">No question types found</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try another search term or clear the search box.</p>
            </div>
          )}

          <div className="space-y-6">
          {(["Popular", "Interactive", "Advanced"] as const).map((category) => {
            const items = filtered.filter((item) => item.category === category);
            if (items.length === 0) return null;
            const categoryMeta = questionCategoryMeta(category);
            return (
              <section key={category}>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">{category}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{categoryMeta.description}</p>
                  </div>
                  <Badge tone="neutral">{items.length} type{items.length === 1 ? "" : "s"}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const typeMeta = questionTypeMeta(item.type);
                    return (
                      <button
                        className="group flex min-h-44 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/80 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-cyan-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-400/50 dark:hover:bg-slate-850 dark:focus:ring-cyan-400/20"
                        type="button"
                        key={item.type}
                        onClick={() => onAdd(item.type)}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl border", categoryMeta.iconClass)}>
                              <Icon size={19} />
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
                              {item.type}
                            </span>
                          </div>
                          <span className="mt-4 block text-base font-black tracking-tight text-slate-950 dark:text-white">{item.label}</span>
                          <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {typeMeta.map((tag) => (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChooserHint({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

function questionCategoryMeta(category: "Popular" | "Interactive" | "Advanced") {
  if (category === "Interactive") {
    return {
      description: "Structured answer formats that help students interact with the prompt.",
      iconClass: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200",
      pillClass: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200",
    };
  }
  if (category === "Advanced") {
    return {
      description: "Higher-complexity formats for evidence, files, and multi-part reasoning.",
      iconClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
      pillClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
    };
  }
  return {
    description: "Core assessment formats for most quizzes, written exams, and graded tasks.",
    iconClass: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
    pillClass: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
  };
}

function questionTypeMeta(type: QuestionType) {
  const tags: Record<QuestionType, string[]> = {
    MCQ: ["single answer", "auto-check"],
    MULTI_SELECT: ["multiple answers", "choice"],
    CQ: ["written", "manual grade"],
    MATH: ["formula", "tolerance"],
    CODE: ["programming", "tests"],
    TRUE_FALSE: ["binary", "quick"],
    FILL_BLANK: ["blanks", "word bank"],
    MATCHING: ["pairs", "structured"],
    ORDERING: ["sequence", "arrange"],
    IMAGE: ["media", "visual"],
    CASE_STUDY: ["passage", "multi-part"],
    FILE_UPLOAD: ["upload", "manual grade"],
  };
  return tags[type];
}

function StudentPreview({ questions, previewWidth, setPreviewWidth }: { questions: BuilderQuestion[]; previewWidth: PreviewWidth; setPreviewWidth: (width: PreviewWidth) => void }) {
  const widthClass = { desktop: "max-w-5xl", tablet: "max-w-2xl", mobile: "max-w-sm" }[previewWidth];
  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">Student preview</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Teacher settings and notes are hidden.</p>
        </div>
        <div className="flex gap-2">
          {([{ id: "desktop", icon: Monitor }, { id: "tablet", icon: Tablet }, { id: "mobile", icon: Smartphone }] as const).map(({ id, icon: Icon }) => (
            <button className={cn("icon-button", previewWidth === id && "border-cyan-300 bg-cyan-50 text-cyan-700")} type="button" key={id} onClick={() => setPreviewWidth(id)} aria-label={`${id} preview`}><Icon size={16} /></button>
          ))}
        </div>
      </div>
      <div className={cn("mx-auto space-y-3 transition-all", widthClass)}>
        {questions.map((question, index) => (
          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]" key={question.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {index + 1} · {definitionFor(question.type).label} · {question.marks} marks</p>
            <p className="mt-2 font-semibold text-slate-950 dark:text-white">{question.text || "Untitled question"}</p>
            {(question.options || []).length > 0 && <div className="mt-3 grid gap-2">{(question.options || []).map((option, optionIndex) => <label className="rounded-lg border border-slate-200 p-3 text-sm dark:border-white/10" key={optionIndex}><input className="mr-2 accent-cyan-500" type={question.type === "MULTI_SELECT" ? "checkbox" : "radio"} name={question.id} />{option || `Option ${optionIndex + 1}`}</label>)}</div>}
            {question.type === "TRUE_FALSE" && <div className="mt-3 flex gap-2"><button className="secondary-button">True</button><button className="secondary-button">False</button></div>}
            {!["MCQ", "MULTI_SELECT", "TRUE_FALSE"].includes(question.type) && <textarea className="field-input mt-3 min-h-24 py-3" placeholder="Student answer" />}
          </article>
        ))}
      </div>
    </Card>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 backdrop-blur-sm"><div className="ml-auto flex h-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-command-900"><div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10"><h2 className="font-bold">{title}</h2><button className="icon-button" type="button" onClick={onClose}><X size={16} /></button></div><div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div></div></div>;
}

function Panel({ title, error, children }: { title: string; error?: string; children: React.ReactNode }) {
  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.025]"><div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-bold text-slate-950 dark:text-white">{title}</h4>{error && <span className="text-xs font-semibold text-rose-600">{error}</span>}</div>{children}</section>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="mt-3 block"><span className="field-label">{label}</span>{children}{error && <span className="mt-1 block text-xs font-semibold text-rose-600">{error}</span>}</label>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="field-label">{label}</span><input className="field-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, code = false }: { label: string; value: string; onChange: (value: string) => void; code?: boolean }) {
  return <label className="mt-3 block"><span className="field-label">{label}</span><textarea className={cn("field-input min-h-24 py-3", code && "font-mono")} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberInput({ label, value, onChange, error }: { label: string; value: number; onChange: (value: number) => void; error?: string }) {
  return <label className="block"><span className="field-label">{label}</span><input className="field-input" value={String(value)} onChange={(event) => onChange(Number(event.target.value) || 0)} inputMode="numeric" />{error && <span className="mt-1 block text-xs font-semibold text-rose-600">{error}</span>}</label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block"><span className="field-label">{label}</span><select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-white/[0.035]"><span>{label}</span><input className="h-4 w-4 accent-cyan-500" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function StringList({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return <div className="mt-3"><span className="field-label">{label}</span><div className="space-y-2">{values.map((value, index) => <div className="flex gap-2" key={index}><input className="field-input" value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button className="icon-button" type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</div><button className="secondary-button mt-2" type="button" onClick={() => onChange([...values, ""])}><Plus size={15} />Add</button></div>;
}

function ArrayInput({ label, items, addLabel, render, onAdd }: { label: string; items: Record<string, unknown>[]; addLabel: string; render: (item: Record<string, unknown>, index: number) => React.ReactNode; onAdd: () => void }) {
  return <div className="mt-3"><span className="field-label">{label}</span><div className="space-y-2">{items.map((item, index) => <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.035]" key={index}>{render(item, index)}</div>)}</div><button className="secondary-button mt-2" type="button" onClick={onAdd}><Plus size={15} />{addLabel}</button></div>;
}

function StatusPill({ status }: { status: CompletionStatus }) {
  const label = status === "complete" ? "Complete" : status === "missing" ? "Missing required info" : "Draft";
  const tone = status === "complete" ? "success" : status === "missing" ? "warning" : "neutral";
  return <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700", tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800", tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600")}>{label}</span>;
}
