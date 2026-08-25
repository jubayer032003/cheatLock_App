import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  Eye,
  FileQuestion,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  createQuestionBankChapter,
  createQuestionBankClass,
  createQuestionBankQuestion,
  createQuestionBankSubject,
  fetchAdminQuestionBankChapters,
  fetchAdminQuestionBankClasses,
  fetchAdminQuestionBankSubjects,
  fetchQuestionBankQuestion,
  fetchQuestionBankQuestions,
  setQuestionBankChapterStatus,
  setQuestionBankClassStatus,
  setQuestionBankQuestionStatus,
  setQuestionBankSubjectStatus,
  updateQuestionBankChapter,
  updateQuestionBankClass,
  updateQuestionBankQuestion,
  updateQuestionBankSubject,
} from "../lib/api";
import { Badge, Card, Dialog, EmptyState, ErrorState, PageHeader, SkeletonBlock, cn } from "../components/ui";
import type {
  QuestionBankChapter,
  QuestionBankClass,
  QuestionBankOption,
  QuestionBankQuestion,
  QuestionBankSubject,
} from "../types";

type Tab = "questions" | "structure";
type Difficulty = "easy" | "medium" | "hard";
type QuestionStatus = "draft" | "active" | "inactive";

type ClassForm = {
  id?: string;
  name: string;
  slug: string;
  displayOrder: string;
  isActive: boolean;
};

type SubjectForm = {
  id?: string;
  classId: string;
  name: string;
  slug: string;
  code: string;
  displayOrder: string;
  isActive: boolean;
};

type ChapterForm = {
  id?: string;
  subjectId: string;
  name: string;
  slug: string;
  chapterNumber: string;
  displayOrder: string;
  isActive: boolean;
};

type QuestionForm = {
  id?: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  questionText: string;
  difficulty: Difficulty;
  marks: string;
  explanation: string;
  status: QuestionStatus;
  options: Array<{ text: string; isCorrect: boolean }>;
};

const emptyClassForm: ClassForm = { name: "", slug: "", displayOrder: "0", isActive: true };
const emptySubjectForm: SubjectForm = { classId: "", name: "", slug: "", code: "", displayOrder: "0", isActive: true };
const emptyChapterForm: ChapterForm = { subjectId: "", name: "", slug: "", chapterNumber: "", displayOrder: "0", isActive: true };
const emptyQuestionForm: QuestionForm = {
  classId: "",
  subjectId: "",
  chapterId: "",
  questionText: "",
  difficulty: "medium",
  marks: "1",
  explanation: "",
  status: "draft",
  options: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ],
};

export function QuestionBankAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("questions");
  const [classes, setClasses] = useState<QuestionBankClass[]>([]);
  const [subjects, setSubjects] = useState<QuestionBankSubject[]>([]);
  const [chapters, setChapters] = useState<QuestionBankChapter[]>([]);
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [classForm, setClassForm] = useState<ClassForm>(emptyClassForm);
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(emptySubjectForm);
  const [chapterForm, setChapterForm] = useState<ChapterForm>(emptyChapterForm);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(emptyQuestionForm);
  const [previewQuestion, setPreviewQuestion] = useState<QuestionBankQuestion | null>(null);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeClasses = useMemo(() => classes.filter((item) => item.isActive), [classes]);
  const currentSubjects = useMemo(
    () => subjects.filter((item) => item.classId === selectedClassId),
    [selectedClassId, subjects]
  );
  const activeSubjects = useMemo(() => currentSubjects.filter((item) => item.isActive), [currentSubjects]);
  const currentChapters = useMemo(
    () => chapters.filter((item) => item.subjectId === selectedSubjectId),
    [chapters, selectedSubjectId]
  );
  const activeChapters = useMemo(() => currentChapters.filter((item) => item.isActive), [currentChapters]);
  const totalPages = Math.max(1, Math.ceil(total / 10));

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }
    loadSubjects(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setChapters([]);
      return;
    }
    loadChapters(selectedSubjectId);
  }, [selectedSubjectId]);

  useEffect(() => {
    loadQuestions();
  }, [selectedClassId, selectedSubjectId, difficultyFilter, statusFilter, page]);

  async function loadClasses() {
    setLoading(true);
    setErrorMessage("");
    try {
      const loadedClasses = await fetchAdminQuestionBankClasses();
      setClasses(loadedClasses);
      setSelectedClassId((current) => current || loadedClasses.find((item) => item.isActive)?.id || loadedClasses[0]?.id || "");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load Question Bank classes."));
    } finally {
      setLoading(false);
    }
  }

  async function loadSubjects(classId = selectedClassId) {
    if (!classId) return;
    try {
      const loadedSubjects = await fetchAdminQuestionBankSubjects(classId);
      setSubjects(loadedSubjects);
      setSelectedSubjectId((current) => {
        if (current && loadedSubjects.some((subject) => subject.id === current)) return current;
        return loadedSubjects.find((subject) => subject.isActive)?.id || loadedSubjects[0]?.id || "";
      });
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load subjects."));
    }
  }

  async function loadChapters(subjectId = selectedSubjectId) {
    if (!subjectId) return;
    try {
      setChapters(await fetchAdminQuestionBankChapters(subjectId));
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load chapters."));
    }
  }

  async function loadQuestions() {
    setQuestionLoading(true);
    setErrorMessage("");
    try {
      const result = await fetchQuestionBankQuestions({
        classId: selectedClassId || undefined,
        subjectId: selectedSubjectId || undefined,
        difficulty: difficultyFilter || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        questionType: "mcq",
        page,
        limit: 10,
      });
      setQuestions(result.questions);
      setTotal(result.total);
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load questions."));
    } finally {
      setQuestionLoading(false);
    }
  }

  async function handleSaveClass() {
    if (!classForm.name.trim()) return setErrorMessage("Class name is required.");
    await runSave(async () => {
      const payload = {
        name: classForm.name.trim(),
        slug: classForm.slug.trim() || undefined,
        displayOrder: Number(classForm.displayOrder) || 0,
        isActive: classForm.isActive,
      };
      if (classForm.id) await updateQuestionBankClass(classForm.id, payload);
      else await createQuestionBankClass(payload);
      setClassForm(emptyClassForm);
      await loadClasses();
      setMessage(classForm.id ? "Class updated." : "Class created.");
    });
  }

  async function handleSaveSubject() {
    const classId = subjectForm.classId || selectedClassId;
    if (!classId) return setErrorMessage("Select a class before creating a subject.");
    if (!subjectForm.name.trim()) return setErrorMessage("Subject name is required.");
    await runSave(async () => {
      const payload = {
        classId,
        name: subjectForm.name.trim(),
        slug: subjectForm.slug.trim() || undefined,
        code: subjectForm.code.trim() || undefined,
        displayOrder: Number(subjectForm.displayOrder) || 0,
        isActive: subjectForm.isActive,
      };
      if (subjectForm.id) await updateQuestionBankSubject(subjectForm.id, payload);
      else await createQuestionBankSubject(payload);
      setSubjectForm({ ...emptySubjectForm, classId });
      await loadSubjects(classId);
      setMessage(subjectForm.id ? "Subject updated." : "Subject created.");
    });
  }

  async function handleSaveChapter() {
    const subjectId = chapterForm.subjectId || selectedSubjectId;
    if (!subjectId) return setErrorMessage("Select a subject before creating a chapter.");
    if (!chapterForm.name.trim()) return setErrorMessage("Chapter name is required.");
    await runSave(async () => {
      const payload = {
        subjectId,
        name: chapterForm.name.trim(),
        slug: chapterForm.slug.trim() || undefined,
        chapterNumber: chapterForm.chapterNumber.trim() ? Number(chapterForm.chapterNumber) : null,
        displayOrder: Number(chapterForm.displayOrder) || 0,
        isActive: chapterForm.isActive,
      };
      if (chapterForm.id) await updateQuestionBankChapter(chapterForm.id, payload);
      else await createQuestionBankChapter(payload);
      setChapterForm({ ...emptyChapterForm, subjectId });
      await loadChapters(subjectId);
      setMessage(chapterForm.id ? "Chapter updated." : "Chapter created.");
    });
  }

  async function handleSaveQuestion() {
    const validation = validateQuestionForm(questionForm);
    if (validation) return setErrorMessage(validation);
    await runSave(async () => {
      const payload: Partial<QuestionBankQuestion> = {
        classId: questionForm.classId,
        subjectId: questionForm.subjectId,
        chapterId: questionForm.chapterId || undefined,
        questionType: "mcq",
        questionText: questionForm.questionText.trim(),
        difficulty: questionForm.difficulty,
        marks: Number(questionForm.marks),
        explanation: questionForm.explanation.trim() || undefined,
        status: questionForm.status,
        options: questionForm.options.map((option, index) => ({
          text: option.text.trim(),
          isCorrect: option.isCorrect,
          displayOrder: index,
        })),
      };
      if (questionForm.id) await updateQuestionBankQuestion(questionForm.id, payload);
      else await createQuestionBankQuestion(payload);
      setQuestionForm({ ...emptyQuestionForm, classId: questionForm.classId, subjectId: questionForm.subjectId, chapterId: questionForm.chapterId });
      await loadQuestions();
      setMessage(questionForm.id ? "Question updated." : "Question created.");
    });
  }

  async function handlePreview(questionId: string) {
    setErrorMessage("");
    try {
      setPreviewQuestion(await fetchQuestionBankQuestion(questionId));
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load question preview."));
    }
  }

  async function handleQuestionStatus(question: QuestionBankQuestion) {
    const nextStatus: QuestionStatus = question.status === "active" ? "inactive" : "active";
    await runSave(async () => {
      await setQuestionBankQuestionStatus(question.id, nextStatus);
      await loadQuestions();
      setMessage(nextStatus === "active" ? "Question activated." : "Question deactivated.");
    });
  }

  async function runSave(action: () => Promise<void>) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      await action();
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "The request failed."));
    } finally {
      setSaving(false);
    }
  }

  function applySearch() {
    setPage(1);
    loadQuestions();
  }

  function editQuestion(question: QuestionBankQuestion) {
    setQuestionForm({
      id: question.id,
      classId: question.classId,
      subjectId: question.subjectId,
      chapterId: question.chapterId || "",
      questionText: question.questionText,
      difficulty: question.difficulty,
      marks: String(question.marks),
      explanation: question.explanation || "",
      status: question.status,
      options: normalizeQuestionOptions(question.options),
    });
    setSelectedClassId(question.classId);
    setSelectedSubjectId(question.subjectId);
    setActiveTab("questions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Question Bank"
        title="Central Question Bank"
        description="Manage curriculum hierarchy and MCQ content used by Self Exam and teacher exam building."
        actions={
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-command-950/70">
            <button className={cn("rounded px-3 py-1.5 text-sm font-semibold", activeTab === "questions" && "bg-cyan-500 text-slate-950")} type="button" onClick={() => setActiveTab("questions")}>
              Questions
            </button>
            <button className={cn("rounded px-3 py-1.5 text-sm font-semibold", activeTab === "structure" && "bg-cyan-500 text-slate-950")} type="button" onClick={() => setActiveTab("structure")}>
              Structure
            </button>
          </div>
        }
      />

      {message && (
        <Card className="flex items-center gap-2 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
          <CheckCircle size={17} /> {message}
        </Card>
      )}
      {errorMessage && <ErrorState message={errorMessage} onRetry={activeTab === "questions" ? loadQuestions : loadClasses} />}

      {loading ? (
        <div className="grid gap-4">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-72" />
        </div>
      ) : activeTab === "structure" ? (
        <StructurePanel
          classes={classes}
          subjects={currentSubjects}
          chapters={currentChapters}
          selectedClassId={selectedClassId}
          selectedSubjectId={selectedSubjectId}
          classForm={classForm}
          subjectForm={subjectForm}
          chapterForm={chapterForm}
          saving={saving}
          setSelectedClassId={setSelectedClassId}
          setSelectedSubjectId={setSelectedSubjectId}
          setClassForm={setClassForm}
          setSubjectForm={setSubjectForm}
          setChapterForm={setChapterForm}
          onSaveClass={handleSaveClass}
          onSaveSubject={handleSaveSubject}
          onSaveChapter={handleSaveChapter}
          onSetClassStatus={(item) => runSave(async () => { await setQuestionBankClassStatus(item.id, !item.isActive); await loadClasses(); setMessage(item.isActive ? "Class deactivated." : "Class activated."); })}
          onSetSubjectStatus={(item) => runSave(async () => { await setQuestionBankSubjectStatus(item.id, !item.isActive); await loadSubjects(item.classId); setMessage(item.isActive ? "Subject deactivated." : "Subject activated."); })}
          onSetChapterStatus={(item) => runSave(async () => { await setQuestionBankChapterStatus(item.id, !item.isActive); await loadChapters(item.subjectId); setMessage(item.isActive ? "Chapter deactivated." : "Chapter activated."); })}
        />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <QuestionFormPanel
            form={questionForm}
            classes={activeClasses}
            subjects={activeSubjects}
            chapters={activeChapters}
            saving={saving}
            setForm={setQuestionForm}
            onSave={handleSaveQuestion}
            onCancel={() => setQuestionForm({ ...emptyQuestionForm, classId: selectedClassId, subjectId: selectedSubjectId })}
          />
          <QuestionListPanel
            questions={questions}
            classes={classes}
            subjects={subjects}
            chapters={chapters}
            search={search}
            difficultyFilter={difficultyFilter}
            statusFilter={statusFilter}
            questionLoading={questionLoading}
            page={page}
            totalPages={totalPages}
            total={total}
            saving={saving}
            setSearch={setSearch}
            setDifficultyFilter={(value) => { setDifficultyFilter(value); setPage(1); }}
            setStatusFilter={(value) => { setStatusFilter(value); setPage(1); }}
            setPage={setPage}
            onApplySearch={applySearch}
            onEdit={editQuestion}
            onPreview={handlePreview}
            onToggleStatus={handleQuestionStatus}
          />
        </section>
      )}

      <Dialog open={Boolean(previewQuestion)} onClose={() => setPreviewQuestion(null)} title="Question preview">
        {previewQuestion && <QuestionPreview question={previewQuestion} />}
      </Dialog>
    </div>
  );
}

function StructurePanel(props: {
  classes: QuestionBankClass[];
  subjects: QuestionBankSubject[];
  chapters: QuestionBankChapter[];
  selectedClassId: string;
  selectedSubjectId: string;
  classForm: ClassForm;
  subjectForm: SubjectForm;
  chapterForm: ChapterForm;
  saving: boolean;
  setSelectedClassId: (id: string) => void;
  setSelectedSubjectId: (id: string) => void;
  setClassForm: (form: ClassForm) => void;
  setSubjectForm: (form: SubjectForm) => void;
  setChapterForm: (form: ChapterForm) => void;
  onSaveClass: () => void;
  onSaveSubject: () => void;
  onSaveChapter: () => void;
  onSetClassStatus: (item: QuestionBankClass) => void;
  onSetSubjectStatus: (item: QuestionBankSubject) => void;
  onSetChapterStatus: (item: QuestionBankChapter) => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-3">
      <HierarchyColumn
        title="Classes"
        icon={BookOpen}
        items={props.classes}
        selectedId={props.selectedClassId}
        onSelect={(id) => {
          props.setSelectedClassId(id);
          props.setSubjectForm({ ...emptySubjectForm, classId: id });
        }}
        onToggle={props.onSetClassStatus}
        onEdit={(item) => props.setClassForm({
          id: item.id,
          name: item.name,
          slug: item.slug,
          displayOrder: String(item.displayOrder || 0),
          isActive: item.isActive,
        })}
        emptyTitle="No classes"
      />
      <HierarchyColumn
        title="Subjects"
        icon={Layers}
        items={props.subjects}
        selectedId={props.selectedSubjectId}
        onSelect={(id) => {
          props.setSelectedSubjectId(id);
          props.setChapterForm({ ...emptyChapterForm, subjectId: id });
        }}
        onToggle={props.onSetSubjectStatus}
        onEdit={(item) => props.setSubjectForm({
          id: item.id,
          classId: item.classId,
          name: item.name,
          slug: item.slug,
          code: item.code || "",
          displayOrder: String(item.displayOrder || 0),
          isActive: item.isActive,
        })}
        emptyTitle="No subjects"
      />
      <HierarchyColumn
        title="Chapters"
        icon={ListChecks}
        items={props.chapters}
        selectedId=""
        onSelect={() => undefined}
        onToggle={props.onSetChapterStatus}
        onEdit={(item) => props.setChapterForm({
          id: item.id,
          subjectId: item.subjectId,
          name: item.name,
          slug: item.slug,
          chapterNumber: item.chapterNumber == null ? "" : String(item.chapterNumber),
          displayOrder: String(item.displayOrder || 0),
          isActive: item.isActive,
        })}
        emptyTitle="No chapters"
      />

      <ClassFormCard form={props.classForm} saving={props.saving} setForm={props.setClassForm} onSave={props.onSaveClass} />
      <SubjectFormCard
        form={{ ...props.subjectForm, classId: props.subjectForm.classId || props.selectedClassId }}
        saving={props.saving}
        classes={props.classes}
        setForm={props.setSubjectForm}
        onSave={props.onSaveSubject}
      />
      <ChapterFormCard
        form={{ ...props.chapterForm, subjectId: props.chapterForm.subjectId || props.selectedSubjectId }}
        saving={props.saving}
        subjects={props.subjects}
        setForm={props.setChapterForm}
        onSave={props.onSaveChapter}
      />
    </section>
  );
}

function HierarchyColumn<T extends { id: string; name: string; slug: string; isActive: boolean }>(props: {
  title: string;
  icon: typeof BookOpen;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  onEdit: (item: T) => void;
  onToggle: (item: T) => void;
  emptyTitle: string;
}) {
  const Icon = props.icon;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-white/10">
        <Icon className="text-cyan-700 dark:text-cyan-200" size={18} />
        <h2 className="font-bold text-slate-950 dark:text-white">{props.title}</h2>
      </div>
      <div className="max-h-80 space-y-2 overflow-auto p-3">
        {props.items.length === 0 ? (
          <EmptyState icon={Icon} title={props.emptyTitle} description="Create one below to continue." />
        ) : props.items.map((item) => (
          <article className={cn("rounded-md border p-3", props.selectedId === item.id ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]")} key={item.id}>
            <button className="w-full text-left" type="button" onClick={() => props.onSelect(item.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{item.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.slug}</p>
                </div>
                <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </button>
            <div className="mt-3 flex justify-end gap-2">
              <button className="icon-button" type="button" title="Edit" onClick={() => props.onEdit(item)}><Pencil size={15} /></button>
              <button className="icon-button" type="button" title={item.isActive ? "Deactivate" : "Activate"} onClick={() => props.onToggle(item)}>
                {item.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ClassFormCard({ form, saving, setForm, onSave }: { form: ClassForm; saving: boolean; setForm: (form: ClassForm) => void; onSave: () => void }) {
  return (
    <Card className="p-4">
      <h3 className="font-bold text-slate-950 dark:text-white">{form.id ? "Edit class" : "Create class"}</h3>
      <div className="mt-4 grid gap-3">
        <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <TextField label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} placeholder="Auto-generated when blank" />
        <TextField label="Display order" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
        <ActiveToggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
        <FormActions saving={saving} editing={Boolean(form.id)} onSave={onSave} onCancel={() => setForm(emptyClassForm)} />
      </div>
    </Card>
  );
}

function SubjectFormCard(props: { form: SubjectForm; saving: boolean; classes: QuestionBankClass[]; setForm: (form: SubjectForm) => void; onSave: () => void }) {
  return (
    <Card className="p-4">
      <h3 className="font-bold text-slate-950 dark:text-white">{props.form.id ? "Edit subject" : "Create subject"}</h3>
      <div className="mt-4 grid gap-3">
        <SelectField label="Class" value={props.form.classId} onChange={(classId) => props.setForm({ ...props.form, classId })} options={props.classes.map((item) => ({ value: item.id, label: item.name }))} />
        <TextField label="Name" value={props.form.name} onChange={(name) => props.setForm({ ...props.form, name })} />
        <TextField label="Code" value={props.form.code} onChange={(code) => props.setForm({ ...props.form, code })} />
        <TextField label="Slug" value={props.form.slug} onChange={(slug) => props.setForm({ ...props.form, slug })} placeholder="Auto-generated when blank" />
        <TextField label="Display order" value={props.form.displayOrder} onChange={(displayOrder) => props.setForm({ ...props.form, displayOrder })} />
        <ActiveToggle checked={props.form.isActive} onChange={(isActive) => props.setForm({ ...props.form, isActive })} />
        <FormActions saving={props.saving} editing={Boolean(props.form.id)} onSave={props.onSave} onCancel={() => props.setForm({ ...emptySubjectForm, classId: props.form.classId })} />
      </div>
    </Card>
  );
}

function ChapterFormCard(props: { form: ChapterForm; saving: boolean; subjects: QuestionBankSubject[]; setForm: (form: ChapterForm) => void; onSave: () => void }) {
  return (
    <Card className="p-4">
      <h3 className="font-bold text-slate-950 dark:text-white">{props.form.id ? "Edit chapter" : "Create chapter"}</h3>
      <div className="mt-4 grid gap-3">
        <SelectField label="Subject" value={props.form.subjectId} onChange={(subjectId) => props.setForm({ ...props.form, subjectId })} options={props.subjects.map((item) => ({ value: item.id, label: item.name }))} />
        <TextField label="Name" value={props.form.name} onChange={(name) => props.setForm({ ...props.form, name })} />
        <TextField label="Chapter number" value={props.form.chapterNumber} onChange={(chapterNumber) => props.setForm({ ...props.form, chapterNumber })} />
        <TextField label="Slug" value={props.form.slug} onChange={(slug) => props.setForm({ ...props.form, slug })} placeholder="Auto-generated when blank" />
        <TextField label="Display order" value={props.form.displayOrder} onChange={(displayOrder) => props.setForm({ ...props.form, displayOrder })} />
        <ActiveToggle checked={props.form.isActive} onChange={(isActive) => props.setForm({ ...props.form, isActive })} />
        <FormActions saving={props.saving} editing={Boolean(props.form.id)} onSave={props.onSave} onCancel={() => props.setForm({ ...emptyChapterForm, subjectId: props.form.subjectId })} />
      </div>
    </Card>
  );
}

function QuestionFormPanel(props: {
  form: QuestionForm;
  classes: QuestionBankClass[];
  subjects: QuestionBankSubject[];
  chapters: QuestionBankChapter[];
  saving: boolean;
  setForm: (form: QuestionForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { form, setForm } = props;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200">
          <FileQuestion size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">{form.id ? "Edit MCQ" : "Create MCQ"}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Correct answers remain admin-only.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <SelectField label="Class" value={form.classId} onChange={(classId) => setForm({ ...form, classId, subjectId: "", chapterId: "" })} options={props.classes.map((item) => ({ value: item.id, label: item.name }))} />
        <SelectField label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, chapterId: "" })} options={props.subjects.map((item) => ({ value: item.id, label: item.name }))} />
        <SelectField label="Chapter" value={form.chapterId} onChange={(chapterId) => setForm({ ...form, chapterId })} options={[{ value: "", label: "No chapter" }, ...props.chapters.map((item) => ({ value: item.id, label: item.name }))]} />
        <label className="block">
          <span className="field-label">Question text</span>
          <textarea className="field-input min-h-28 py-3" value={form.questionText} onChange={(event) => setForm({ ...form, questionText: event.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Difficulty" value={form.difficulty} onChange={(difficulty) => setForm({ ...form, difficulty: difficulty as Difficulty })} options={["easy", "medium", "hard"].map((item) => ({ value: item, label: item }))} />
          <TextField label="Marks" value={form.marks} onChange={(marks) => setForm({ ...form, marks })} />
          <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status: status as QuestionStatus })} options={["draft", "active", "inactive"].map((item) => ({ value: item, label: item }))} />
        </div>
        <label className="block">
          <span className="field-label">Explanation</span>
          <textarea className="field-input min-h-20 py-3" value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} />
        </label>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label">Options</span>
            <button className="secondary-button" type="button" onClick={() => setForm({ ...form, options: [...form.options, { text: "", isCorrect: false }] })}>
              <Plus size={15} /> Add option
            </button>
          </div>
          <div className="space-y-2">
            {form.options.map((option, index) => (
              <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.025] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center" key={index}>
                <input
                  aria-label={`Correct option ${index + 1}`}
                  className="h-4 w-4 accent-cyan-500"
                  type="radio"
                  checked={option.isCorrect}
                  onChange={() => setForm({ ...form, options: form.options.map((item, optionIndex) => ({ ...item, isCorrect: optionIndex === index })) })}
                />
                <input
                  className="field-input"
                  value={option.text}
                  onChange={(event) => setForm({ ...form, options: form.options.map((item, optionIndex) => optionIndex === index ? { ...item, text: event.target.value } : item) })}
                  placeholder={`Option ${index + 1}`}
                />
              </div>
            ))}
          </div>
        </div>
        <FormActions saving={props.saving} editing={Boolean(form.id)} onSave={props.onSave} onCancel={props.onCancel} />
      </div>
    </Card>
  );
}

function QuestionListPanel(props: {
  questions: QuestionBankQuestion[];
  classes: QuestionBankClass[];
  subjects: QuestionBankSubject[];
  chapters: QuestionBankChapter[];
  search: string;
  difficultyFilter: string;
  statusFilter: string;
  questionLoading: boolean;
  page: number;
  totalPages: number;
  total: number;
  saving: boolean;
  setSearch: (value: string) => void;
  setDifficultyFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setPage: (page: number) => void;
  onApplySearch: () => void;
  onEdit: (question: QuestionBankQuestion) => void;
  onPreview: (questionId: string) => void;
  onToggleStatus: (question: QuestionBankQuestion) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5 dark:border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Questions</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{props.total} total records</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input className="field-input pl-9" value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search prompt" onKeyDown={(event) => { if (event.key === "Enter") props.onApplySearch(); }} />
            </div>
            <select className="field-input" value={props.difficultyFilter} onChange={(event) => props.setDifficultyFilter(event.target.value)}>
              <option value="">Any difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select className="field-input" value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value)}>
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="primary-button" type="button" onClick={props.onApplySearch}>
              <Search size={16} /> Search
            </button>
          </div>
        </div>
      </div>
      {props.questionLoading ? (
        <div className="space-y-3 p-5">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : props.questions.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={FileQuestion} title="No questions found" description="Adjust filters or create a new MCQ." />
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {props.questions.map((question) => (
            <article className="p-5" key={question.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge tone={question.status === "active" ? "success" : question.status === "draft" ? "warning" : "neutral"}>{question.status}</Badge>
                    <Badge tone="primary">{question.difficulty}</Badge>
                    <Badge tone="neutral">{question.marks} mark{question.marks === 1 ? "" : "s"}</Badge>
                  </div>
                  <p className="line-clamp-2 font-semibold text-slate-950 dark:text-white">{question.questionText}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {labelFor(props.classes, question.classId)} / {labelFor(props.subjects, question.subjectId)}{question.chapterId ? ` / ${labelFor(props.chapters, question.chapterId)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="secondary-button" type="button" onClick={() => props.onPreview(question.id)}><Eye size={16} />Preview</button>
                  <button className="secondary-button" type="button" onClick={() => props.onEdit(question)}><Pencil size={16} />Edit</button>
                  <button className="secondary-button" disabled={props.saving} type="button" onClick={() => props.onToggleStatus(question)}>
                    {question.status === "active" ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    {question.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm dark:border-white/10">
        <button className="secondary-button" disabled={props.page <= 1} type="button" onClick={() => props.setPage(props.page - 1)}>Previous</button>
        <span className="font-semibold text-slate-600 dark:text-slate-300">Page {props.page} of {props.totalPages}</span>
        <button className="secondary-button" disabled={props.page >= props.totalPages} type="button" onClick={() => props.setPage(props.page + 1)}>Next</button>
      </div>
    </Card>
  );
}

function QuestionPreview({ question }: { question: QuestionBankQuestion }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone={question.status === "active" ? "success" : "warning"}>{question.status}</Badge>
        <Badge tone="primary">{question.difficulty}</Badge>
        <Badge tone="neutral">{question.marks} marks</Badge>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prompt</p>
        <p className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{question.questionText}</p>
      </div>
      <div className="grid gap-2">
        {question.options.map((option, index) => (
          <div className={cn("rounded-md border p-3", option.isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]")} key={option.id || index}>
            <span className="font-semibold">{String.fromCharCode(65 + index)}.</span> {option.text}
            {option.isCorrect && <span className="ml-2 text-xs font-bold uppercase">Correct</span>}
          </div>
        ))}
      </div>
      {question.explanation && (
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Explanation</p>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{question.explanation}</p>
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="field-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-white/[0.035]">
      <span>Active</span>
      <input className="h-4 w-4 accent-cyan-500" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function FormActions({ saving, editing, onSave, onCancel }: { saving: boolean; editing: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="primary-button" disabled={saving} type="button" onClick={onSave}>
        {saving ? "Saving..." : editing ? "Update" : "Create"}
      </button>
      {editing && <button className="secondary-button" disabled={saving} type="button" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

function validateQuestionForm(form: QuestionForm) {
  if (!form.classId) return "Class is required.";
  if (!form.subjectId) return "Subject is required.";
  if (!form.questionText.trim()) return "Question text is required.";
  if (!Number.isFinite(Number(form.marks)) || Number(form.marks) <= 0) return "Marks must be greater than zero.";
  const validOptions = form.options.filter((option) => option.text.trim());
  if (validOptions.length < 2) return "At least two options are required.";
  if (form.options.filter((option) => option.isCorrect && option.text.trim()).length !== 1) return "Choose exactly one correct answer.";
  return "";
}

function normalizeQuestionOptions(options: QuestionBankOption[]) {
  const normalized = options.map((option) => ({ text: option.text, isCorrect: Boolean(option.isCorrect) }));
  while (normalized.length < 2) normalized.push({ text: "", isCorrect: normalized.length === 0 });
  return normalized;
}

function labelFor(items: Array<{ id: string; name: string }>, id?: string | null) {
  return items.find((item) => item.id === id)?.name || "Unassigned";
}

function readErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
