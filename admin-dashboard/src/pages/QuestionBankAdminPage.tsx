import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  Edit3,
  Eye,
  EyeOff,
  FileQuestion,
  GraduationCap,
  Import,
  Layers3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ChapterQuestionImporterModal } from "../components/ChapterQuestionImporterModal";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, IconButton, PageHeader, SkeletonBlock, cn } from "../components/ui";
import {
  createQuestionBankChapter,
  createQuestionBankClass,
  createQuestionBankQuestion,
  createQuestionBankSubject,
  deleteQuestionBankChapter,
  deleteQuestionBankClass,
  deleteQuestionBankQuestion,
  deleteQuestionBankSubject,
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
import {
  buildQuestionPayload,
  emptyQuestionForm,
  nextQuestionFormAfterClassChange,
  nextQuestionFormAfterSubjectChange,
  normalizeQuestionOptions,
  validateQuestionForm,
} from "../lib/questionForm";
import type { QuestionForm } from "../lib/questionForm";
import type { QuestionBankChapter, QuestionBankClass, QuestionBankQuestion, QuestionBankSubject } from "../types";

type Track = "academic" | "admission";
type EntityKind = "class" | "subject" | "chapter";
type Mode = "workspace" | "questions" | "import" | "new" | "edit";

type EntityForm = {
  id?: string;
  classId?: string;
  subjectId?: string;
  track?: Track;
  name: string;
  displayName: string;
  code: string;
  icon?: string;
  description: string;
  chapterNumber: string;
  isActive: boolean;
};

const emptyEntityForm: EntityForm = {
  name: "",
  displayName: "",
  code: "",
  icon: "",
  description: "",
  chapterNumber: "",
  isActive: true,
};

export function QuestionBankAdminPage({
  mode = "workspace",
  initialTrack = "academic",
}: {
  mode?: Mode;
  initialTrack?: Track;
}) {
  const navigate = useNavigate();
  const { questionId } = useParams();
  const [track, setTrack] = useState<Track>(initialTrack);
  const [classes, setClasses] = useState<QuestionBankClass[]>([]);
  const [subjects, setSubjects] = useState<QuestionBankSubject[]>([]);
  const [chapters, setChapters] = useState<QuestionBankChapter[]>([]);
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [entityKind, setEntityKind] = useState<EntityKind | null>(null);
  const [entityForm, setEntityForm] = useState<EntityForm>(emptyEntityForm);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(emptyQuestionForm);
  const [previewQuestion, setPreviewQuestion] = useState<QuestionBankQuestion | null>(null);
  const [showImporter, setShowImporter] = useState(mode === "import");
  const [showQuestionEditor, setShowQuestionEditor] = useState(mode === "new" || mode === "edit");
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

  useEffect(() => {
    setTrack(initialTrack);
  }, [initialTrack]);

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
      setSelectedChapterId("");
      return;
    }
    loadChapters(selectedSubjectId);
  }, [selectedSubjectId]);

  useEffect(() => {
    loadQuestions();
  }, [selectedClassId, selectedSubjectId, selectedChapterId, difficultyFilter, statusFilter, page]);

  useEffect(() => {
    if (mode === "edit" && questionId) {
      loadQuestionForEdit(questionId);
    }
    if (mode === "new") {
      startQuestionEditor();
    }
    if (mode === "import") {
      setShowImporter(true);
    }
  }, [mode, questionId]);

  const displayedClasses = useMemo(
    () => classes.filter((item) => (track === "admission" ? isAdmissionClass(item) : !isAdmissionClass(item))),
    [classes, track]
  );
  const selectedClass = useMemo(() => classes.find((item) => item.id === selectedClassId), [classes, selectedClassId]);
  const selectedSubject = useMemo(() => subjects.find((item) => item.id === selectedSubjectId), [subjects, selectedSubjectId]);
  const selectedChapter = useMemo(() => chapters.find((item) => item.id === selectedChapterId), [chapters, selectedChapterId]);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const isGlobalQuestionMode = mode === "questions";

  async function loadClasses() {
    setLoading(true);
    setErrorMessage("");
    try {
      const next = await fetchAdminQuestionBankClasses();
      setClasses(next);
      setSelectedClassId((current) => current || next.find((item) => (initialTrack === "admission" ? isAdmissionClass(item) : !isAdmissionClass(item)))?.id || "");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load classes."));
    } finally {
      setLoading(false);
    }
  }

  async function loadSubjects(classId: string) {
    try {
      const next = await fetchAdminQuestionBankSubjects(classId);
      setSubjects(next);
      setSelectedSubjectId((current) => (next.some((item) => item.id === current) ? current : ""));
      setSelectedChapterId("");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load subjects."));
    }
  }

  async function loadChapters(subjectId: string) {
    try {
      const next = await fetchAdminQuestionBankChapters(subjectId);
      setChapters(next);
      setSelectedChapterId((current) => (next.some((item) => item.id === current) ? current : ""));
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load chapters."));
    }
  }

  async function loadQuestions() {
    setQuestionLoading(true);
    try {
      const result = await fetchQuestionBankQuestions({
        classId: selectedClassId || undefined,
        subjectId: selectedSubjectId || undefined,
        chapterId: selectedChapterId || undefined,
        difficulty: difficultyFilter || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        questionType: "mcq",
        page,
        limit: 10,
      });
      setQuestions(result.questions || []);
      setTotal(result.total || 0);
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load questions."));
    } finally {
      setQuestionLoading(false);
    }
  }

  function openEntityModal(
    kind: EntityKind,
    current?: QuestionBankClass | QuestionBankSubject | QuestionBankChapter,
    defaultClassId?: string,
    defaultSubjectId?: string
  ) {
    setEntityKind(kind);
    const assignedClassId =
      kind === "subject"
        ? (current as QuestionBankSubject)?.classId || defaultClassId || selectedClassId || classes[0]?.id || ""
        : kind === "chapter"
        ? defaultClassId || selectedClassId || classes[0]?.id || ""
        : "";

    const assignedSubjectId =
      kind === "chapter"
        ? (current as QuestionBankChapter)?.subjectId || defaultSubjectId || selectedSubjectId || subjects[0]?.id || ""
        : "";

    setEntityForm({
      id: current?.id,
      classId: assignedClassId,
      subjectId: assignedSubjectId,
      track: kind === "class" ? (current ? (isAdmissionClass(current as QuestionBankClass) ? "admission" : "academic") : track) : track,
      name: current?.name || "",
      displayName: current?.name || "",
      code: kind === "subject" ? (current as QuestionBankSubject | undefined)?.code || "" : current?.slug || "",
      icon: (current as QuestionBankClass | undefined)?.icon || "",
      description: (current as QuestionBankClass | undefined)?.description || "",
      chapterNumber: kind === "chapter" ? String((current as QuestionBankChapter | undefined)?.chapterNumber || "") : "",
      isActive: current?.isActive ?? true,
    });
  }

  async function saveEntity() {
    if (!entityKind) return;
    if (!entityForm.name.trim() && !entityForm.displayName.trim()) {
      setErrorMessage(`${titleCase(entityKind)} name is required.`);
      return;
    }
    const name = (entityForm.displayName || entityForm.name).trim();
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      if (entityKind === "class") {
        const classTrack = entityForm.track || track;
        const payload = {
          name,
          slug: slugFor(classTrack, entityForm.code || name),
          icon: entityForm.icon?.trim() || undefined,
          description: entityForm.description.trim() || undefined,
          displayOrder: classes.length + 1,
          isActive: entityForm.isActive,
        };
        const saved = entityForm.id
          ? await updateQuestionBankClass(entityForm.id, payload)
          : await createQuestionBankClass(payload);
        await loadClasses();
        setTrack(classTrack);
        setSelectedClassId(saved.id);
        setSelectedSubjectId("");
        setSelectedChapterId("");
        setMessage(entityForm.id ? "Class updated." : `Class created. Now add subjects to ${saved.name}.`);
      }
      if (entityKind === "subject") {
        const targetClassId = entityForm.classId || selectedClassId;
        if (!targetClassId) throw new Error("Select a class first.");
        const payload = {
          classId: targetClassId,
          name,
          slug: entityForm.code.trim() || undefined,
          code: entityForm.code.trim() || undefined,
          description: entityForm.description.trim() || undefined,
          displayOrder: subjects.length + 1,
          isActive: entityForm.isActive,
        };
        const saved = entityForm.id
          ? await updateQuestionBankSubject(entityForm.id, payload)
          : await createQuestionBankSubject(payload);
        if (targetClassId !== selectedClassId) {
          setSelectedClassId(targetClassId);
        }
        await loadSubjects(targetClassId);
        setSelectedSubjectId(saved.id);
        setSelectedChapterId("");
        setMessage(entityForm.id ? "Subject updated." : `Subject created. Now add chapters to ${saved.name}.`);
      }
      if (entityKind === "chapter") {
        const targetSubjectId = entityForm.subjectId || selectedSubjectId;
        if (!targetSubjectId) throw new Error("Select a subject first.");
        const payload = {
          subjectId: targetSubjectId,
          name,
          slug: entityForm.code.trim() || undefined,
          chapterNumber: entityForm.chapterNumber.trim() ? Number(entityForm.chapterNumber) : null,
          description: entityForm.description.trim() || undefined,
          displayOrder: chapters.length + 1,
          isActive: entityForm.isActive,
        };
        const saved = entityForm.id
          ? await updateQuestionBankChapter(entityForm.id, payload)
          : await createQuestionBankChapter(payload);
        if (entityForm.classId && entityForm.classId !== selectedClassId) {
          setSelectedClassId(entityForm.classId);
          await loadSubjects(entityForm.classId);
        }
        if (targetSubjectId !== selectedSubjectId) {
          setSelectedSubjectId(targetSubjectId);
        }
        await loadChapters(targetSubjectId);
        setSelectedChapterId(saved.id);
        setMessage(entityForm.id ? "Chapter updated." : `Chapter created. Add questions to ${formatChapter(saved)}.`);
      }
      setEntityKind(null);
      setEntityForm(emptyEntityForm);
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not save item."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEntity(kind: EntityKind, item: QuestionBankClass | QuestionBankSubject | QuestionBankChapter) {
    setSaving(true);
    setErrorMessage("");
    try {
      if (kind === "class") {
        await setQuestionBankClassStatus(item.id, !item.isActive);
        await loadClasses();
      } else if (kind === "subject") {
        await setQuestionBankSubjectStatus(item.id, !item.isActive);
        await loadSubjects(selectedClassId);
      } else {
        await setQuestionBankChapterStatus(item.id, !item.isActive);
        await loadChapters(selectedSubjectId);
      }
      setMessage(item.isActive ? "Hidden from students." : "Visible to students.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not update visibility."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntity(kind: EntityKind, item: QuestionBankClass | QuestionBankSubject | QuestionBankChapter) {
    if (!window.confirm(`Delete ${item.name} permanently? Child items and questions under it may also be deleted. This cannot be undone.`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      if (kind === "class") {
        await deleteQuestionBankClass(item.id);
        setSelectedClassId("");
        await loadClasses();
      } else if (kind === "subject") {
        await deleteQuestionBankSubject(item.id);
        setSelectedSubjectId("");
        await loadSubjects(selectedClassId);
      } else {
        await deleteQuestionBankChapter(item.id);
        setSelectedChapterId("");
        await loadChapters(selectedSubjectId);
      }
      setMessage("Deleted permanently.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not delete item."));
    } finally {
      setSaving(false);
    }
  }

  function startQuestionEditor(question?: QuestionBankQuestion) {
    const fallbackClassId = selectedClassId || classes[0]?.id || "";
    const fallbackSubjectId = selectedSubjectId || subjects[0]?.id || "";
    const fallbackChapterId = selectedChapterId || "";

    setQuestionForm(
      question
        ? {
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
          }
        : {
            ...emptyQuestionForm,
            classId: fallbackClassId,
            subjectId: fallbackSubjectId,
            chapterId: fallbackChapterId,
            status: "draft",
          }
    );
    setShowQuestionEditor(true);
  }

  async function loadQuestionForEdit(id: string) {
    setQuestionLoading(true);
    setErrorMessage("");
    try {
      const question = await fetchQuestionBankQuestion(id);
      setSelectedClassId(question.classId);
      setSelectedSubjectId(question.subjectId);
      setSelectedChapterId(question.chapterId || "");
      startQuestionEditor(question);
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load question for editing."));
    } finally {
      setQuestionLoading(false);
    }
  }

  async function saveQuestion() {
    const error = validateQuestionForm(questionForm);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      if (questionForm.id) {
        await updateQuestionBankQuestion(questionForm.id, buildQuestionPayload(questionForm));
        setMessage("Question updated.");
      } else {
        await createQuestionBankQuestion(buildQuestionPayload(questionForm));
        setMessage("Question added.");
      }
      setShowQuestionEditor(false);
      await loadQuestions();
      if (mode === "edit" || mode === "new") navigate("/questions", { replace: true });
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not save question."));
    } finally {
      setSaving(false);
    }
  }

  async function preview(id: string) {
    setErrorMessage("");
    try {
      setPreviewQuestion(await fetchQuestionBankQuestion(id));
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not load preview."));
    }
  }

  async function toggleQuestion(question: QuestionBankQuestion) {
    const nextStatus = question.status === "active" ? "inactive" : "active";
    setSaving(true);
    setErrorMessage("");
    try {
      await setQuestionBankQuestionStatus(question.id, nextStatus);
      await loadQuestions();
      setMessage(nextStatus === "active" ? "Question activated." : "Question deactivated.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not change question status."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(question: QuestionBankQuestion) {
    if (!window.confirm(`Delete this question permanently?\n\n${question.questionText.slice(0, 120)}`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      await deleteQuestionBankQuestion(question.id);
      await loadQuestions();
      setMessage("Question deleted.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Could not delete question."));
    } finally {
      setSaving(false);
    }
  }

  function selectClass(item: QuestionBankClass) {
    setSelectedClassId(item.id);
    setSelectedSubjectId("");
    setSelectedChapterId("");
    setPage(1);
  }

  function selectSubject(item: QuestionBankSubject) {
    setSelectedSubjectId(item.id);
    setSelectedChapterId("");
    setPage(1);
  }

  function selectChapter(item: QuestionBankChapter) {
    setSelectedChapterId(item.id);
    setPage(1);
  }

  const headerTitle = isGlobalQuestionMode ? "All Questions" : track === "academic" ? "Academic Curriculum" : "Admission Test Prep";
  const headerDescription = isGlobalQuestionMode
    ? "Search and manage central question bank items across your entire syllabus."
    : track === "academic"
    ? "Class 1 to 12 School & College hierarchy, subjects, chapters, and practice MCQs."
    : "University, Medical, and Engineering admission prep content.";

  const showQuestionsSection = isGlobalQuestionMode || Boolean(selectedSubjectId) || Boolean(selectedChapterId);

  return (
    <div className="space-y-6 motion-safe:animate-page-in">
      <PageHeader
        eyebrow="Central Content Management"
        title={headerTitle}
        description={headerDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowImporter(true)}>
              <Import size={16} /> Import
            </Button>
            <Button onClick={() => openEntityModal("class")}>
              <Plus size={16} /> New Class
            </Button>
          </div>
        }
      />

      {/* QUICK ACTIONS TOOLBAR FOR HIERARCHY */}
      <Card className="flex flex-wrap items-center justify-between gap-3 border-sky-100 bg-gradient-to-r from-sky-50/70 via-white to-sky-50/40 p-4 shadow-sm dark:border-white/10 dark:from-[#0e172a] dark:via-[#0e1424] dark:to-[#0e172a]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/20 dark:bg-sky-500">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick Hierarchy & Content Builder</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quickly add classes, subjects, chapters, or questions without hunting through sub-menus.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openEntityModal("class")} title="Create Class or Admission Level">
            <Plus size={14} /> Class
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openEntityModal("subject", undefined, selectedClassId)} title="Add Subject to Class">
            <Plus size={14} /> Subject
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openEntityModal("chapter", undefined, selectedClassId, selectedSubjectId)} title="Add Chapter to Subject">
            <Plus size={14} /> Chapter
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20"
            onClick={() => startQuestionEditor()}
            title="Create Question"
          >
            <Plus size={14} /> Question
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowImporter(true)} title="Bulk Import Questions from CSV/JSON">
            <Import size={14} /> Import
          </Button>
        </div>
      </Card>

      {message && (
        <div className="motion-safe:animate-step-in rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
          {message}
        </div>
      )}
      {errorMessage && <ErrorState message={errorMessage} onRetry={loadClasses} />}

      {!isGlobalQuestionMode && (
        <section className="grid gap-3 sm:grid-cols-2">
          <AreaButton
            active={track === "academic"}
            icon={BookOpen}
            title="Academic"
            description="School & College curriculum (Class 1-12, SSC, HSC)"
            onClick={() => {
              setTrack("academic");
              setSelectedClassId("");
              setSelectedSubjectId("");
              setSelectedChapterId("");
            }}
          />
          <AreaButton
            active={track === "admission"}
            icon={GraduationCap}
            title="Admission"
            description="Varsity, Medical, & Engineering Admission preparation"
            onClick={() => {
              setTrack("admission");
              setSelectedClassId("");
              setSelectedSubjectId("");
              setSelectedChapterId("");
            }}
          />
        </section>
      )}

      {/* BREADCRUMBS */}
      <Breadcrumb
        track={track}
        selectedClass={selectedClass}
        selectedSubject={selectedSubject}
        selectedChapter={selectedChapter}
        onTrack={() => {
          setSelectedClassId("");
          setSelectedSubjectId("");
          setSelectedChapterId("");
        }}
        onClass={() => {
          setSelectedSubjectId("");
          setSelectedChapterId("");
        }}
        onSubject={() => setSelectedChapterId("")}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-64" />
        </div>
      ) : (
        <div className={cn("grid gap-4", showQuestionsSection ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "xl:grid-cols-3")}>
          {!isGlobalQuestionMode && (
            <div className="space-y-4">
              {/* CLASSES COLUMN */}
              <HierarchyColumn
                title={track === "academic" ? "Classes / Levels" : "Admission Tracks"}
                description={`${displayedClasses.length} active in ${titleCase(track)}`}
                items={displayedClasses}
                selectedId={selectedClassId}
                emptyTitle="No classes created yet"
                emptyDescription="Create your first class or admission track."
                actionLabel="New Class"
                onAction={() => openEntityModal("class")}
                onSelect={selectClass}
                onEdit={(item) => openEntityModal("class", item)}
                onToggle={(item) => toggleEntity("class", item)}
                onDelete={(item) => deleteEntity("class", item)}
              />

              {/* SUBJECTS COLUMN */}
              {selectedClass ? (
                <HierarchyColumn
                  title="Subjects"
                  description={`${subjects.length} subjects in ${selectedClass.name}`}
                  items={subjects}
                  selectedId={selectedSubjectId}
                  emptyTitle="No subjects yet"
                  emptyDescription={`Add the first subject to ${selectedClass.name}.`}
                  actionLabel="New Subject"
                  onAction={() => openEntityModal("subject", undefined, selectedClass.id)}
                  onSelect={selectSubject}
                  onEdit={(item) => openEntityModal("subject", item)}
                  onToggle={(item) => toggleEntity("subject", item)}
                  onDelete={(item) => deleteEntity("subject", item)}
                />
              ) : (
                <GuidanceCard
                  title="Step 1"
                  heading="Choose a Class"
                  description="Select a class to view and manage its subjects and question bank."
                  icon={Circle}
                />
              )}

              {/* CHAPTERS COLUMN */}
              {selectedSubject ? (
                <HierarchyColumn
                  title="Chapters"
                  description={`${chapters.length} chapters in ${selectedSubject.name}`}
                  items={chapters}
                  selectedId={selectedChapterId}
                  emptyTitle="No chapters yet"
                  emptyDescription={`Structure ${selectedSubject.name} with topic chapters.`}
                  actionLabel="New Chapter"
                  onAction={() => openEntityModal("chapter", undefined, selectedClassId, selectedSubject.id)}
                  onSelect={selectChapter}
                  onEdit={(item) => openEntityModal("chapter", item)}
                  onToggle={(item) => toggleEntity("chapter", item)}
                  onDelete={(item) => deleteEntity("chapter", item)}
                  renderTitle={(item) => formatChapter(item as QuestionBankChapter)}
                />
              ) : (
                selectedClass && (
                  <GuidanceCard
                    title="Step 2"
                    heading="Choose a Subject"
                    description="Select a subject to view its chapters and questions."
                    icon={Layers3}
                  />
                )
              )}
            </div>
          )}

          {/* QUESTIONS SECTION */}
          {showQuestionsSection && (
            <section className={cn("space-y-4 motion-safe:animate-step-in", isGlobalQuestionMode && "w-full")}>
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                        {isGlobalQuestionMode
                          ? "Global Question Bank"
                          : selectedChapter
                          ? "Chapter Questions"
                          : "Subject Questions"}
                      </p>
                      <Badge tone="neutral">{total} Question{total === 1 ? "" : "s"}</Badge>
                    </div>
                    <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
                      {isGlobalQuestionMode
                        ? "All Central Questions"
                        : selectedChapter
                        ? formatChapter(selectedChapter)
                        : selectedSubject
                        ? `${selectedSubject.name} (All Chapters)`
                        : "Questions"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Active questions here are directly delivered to student Self Exams and teacher exam builders.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => setShowImporter(true)}>
                      <Import size={16} /> Import MCQs
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => startQuestionEditor()}
                    >
                      <Plus size={16} /> Add Question
                    </Button>
                  </div>
                </div>
              </Card>

              <QuestionFilters
                search={search}
                setSearch={setSearch}
                difficultyFilter={difficultyFilter}
                setDifficultyFilter={setDifficultyFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                onSearch={() => {
                  setPage(1);
                  loadQuestions();
                }}
              />

              <QuestionList
                questions={questions}
                loading={questionLoading}
                page={page}
                totalPages={totalPages}
                total={total}
                onPage={setPage}
                onPreview={preview}
                onEdit={startQuestionEditor}
                onToggle={toggleQuestion}
                onDelete={deleteQuestion}
                onAdd={() => startQuestionEditor()}
                onImport={() => setShowImporter(true)}
              />
            </section>
          )}
        </div>
      )}

      {/* CREATE / EDIT CLASS, SUBJECT, CHAPTER MODAL */}
      <EntityModal
        kind={entityKind}
        form={entityForm}
        setForm={setEntityForm}
        classes={classes}
        subjects={subjects}
        saving={saving}
        onClose={() => setEntityKind(null)}
        onSave={saveEntity}
      />

      {/* CREATE / EDIT QUESTION MODAL */}
      <QuestionEditor
        open={showQuestionEditor}
        form={questionForm}
        setForm={setQuestionForm}
        classes={classes}
        saving={saving}
        onClose={() => {
          setShowQuestionEditor(false);
          if (mode === "edit" || mode === "new") navigate("/questions", { replace: true });
        }}
        onSave={saveQuestion}
      />

      {/* QUESTION PREVIEW DIALOG */}
      <Dialog open={Boolean(previewQuestion)} onClose={() => setPreviewQuestion(null)} title="Question Preview">
        {previewQuestion && <QuestionPreview question={previewQuestion} />}
      </Dialog>

      {/* BULK QUESTION IMPORTER MODAL */}
      <ChapterQuestionImporterModal
        open={showImporter}
        classes={classes}
        subjects={subjects}
        chapters={chapters}
        initialClassId={selectedClassId}
        initialSubjectId={selectedSubjectId}
        initialChapterId={selectedChapterId}
        onClose={() => {
          setShowImporter(false);
          if (mode === "import") navigate(track === "admission" ? "/admission" : "/academic", { replace: true });
        }}
        onSuccess={(count) => {
          setMessage(`${count} question${count === 1 ? "" : "s"} added.`);
          loadQuestions();
        }}
      />
    </div>
  );
}

function AreaButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof BookOpen;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-24 items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:bg-[#0e1424] dark:hover:border-white/20",
        active ? "border-sky-300 ring-2 ring-sky-500/15 dark:border-sky-500/40" : "border-slate-200 dark:border-white/10"
      )}
    >
      <span className={cn("grid h-12 w-12 place-items-center rounded-xl shrink-0", active ? "bg-sky-600 text-white dark:bg-sky-400 dark:text-slate-950" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300")}>
        <Icon size={24} />
      </span>
      <span>
        <span className="block text-base font-bold text-slate-950 dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      </span>
    </button>
  );
}

function Breadcrumb({
  track,
  selectedClass,
  selectedSubject,
  selectedChapter,
  onTrack,
  onClass,
  onSubject,
}: {
  track: Track;
  selectedClass?: QuestionBankClass;
  selectedSubject?: QuestionBankSubject;
  selectedChapter?: QuestionBankChapter;
  onTrack: () => void;
  onClass: () => void;
  onSubject: () => void;
}) {
  const items = [
    { label: titleCase(track), onClick: onTrack },
    selectedClass ? { label: selectedClass.name, onClick: onClass } : null,
    selectedSubject ? { label: selectedSubject.name, onClick: onSubject } : null,
    selectedChapter ? { label: formatChapter(selectedChapter) } : null,
  ].filter(Boolean) as Array<{ label: string; onClick?: () => void }>;

  return (
    <Card className="flex flex-wrap items-center gap-2 p-3 motion-safe:animate-step-in">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 && <ChevronRight size={14} className="text-slate-400" />}
          <button
            type="button"
            disabled={!item.onClick}
            onClick={item.onClick}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold transition",
              item.onClick
                ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                : "text-sky-700 font-bold dark:text-sky-300"
            )}
          >
            {item.label}
          </button>
        </span>
      ))}
    </Card>
  );
}

function HierarchyColumn<T extends { id: string; name: string; isActive: boolean }>({
  title,
  description,
  items,
  selectedId,
  emptyTitle,
  emptyDescription,
  actionLabel,
  onAction,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
  renderTitle,
}: {
  title: string;
  description: string;
  items: T[];
  selectedId: string;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  onAction: () => void;
  onSelect: (item: T) => void;
  onEdit: (item: T) => void;
  onToggle: (item: T) => void;
  onDelete: (item: T) => void;
  renderTitle?: (item: T) => string;
}) {
  return (
    <Card className="min-h-72 p-0 motion-safe:animate-step-in">
      <div className="border-b border-slate-200/80 p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <Button size="sm" onClick={onAction}>
            <Plus size={14} /> {actionLabel}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5 p-3 max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            icon={Plus}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <Button size="sm" onClick={onAction}>
                <Plus size={14} /> {actionLabel}
              </Button>
            }
          />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition duration-150 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-white/20 dark:hover:bg-white/[0.03]",
                selectedId === item.id
                  ? "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200 dark:border-sky-500/40 dark:bg-sky-500/10 dark:ring-sky-500/20"
                  : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">
                  {renderTitle ? renderTitle(item) : item.name}
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1.5">
                  <Badge tone={item.isActive ? "success" : "warning"}>{item.isActive ? "Visible" : "Hidden"}</Badge>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                <IconButton
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(item);
                  }}
                  title="Edit"
                >
                  <Edit3 size={13} />
                </IconButton>
                <IconButton
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(item);
                  }}
                  title={item.isActive ? "Hide" : "Show"}
                >
                  {item.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                </IconButton>
                <IconButton
                  className="text-rose-600 dark:text-rose-400"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(item);
                  }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </IconButton>
              </span>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

function GuidanceCard({
  title,
  heading,
  description,
  icon: Icon,
}: {
  title: string;
  heading: string;
  description: string;
  icon: typeof Circle;
}) {
  return (
    <Card className="grid min-h-64 place-items-center p-6 text-center text-slate-500 dark:text-slate-400">
      <div className="max-w-xs">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-white/5">
          <Icon size={20} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
        <h3 className="mt-1 text-base font-bold text-slate-950 dark:text-white">{heading}</h3>
        <p className="mt-1 text-xs leading-5">{description}</p>
      </div>
    </Card>
  );
}

function EntityModal({
  kind,
  form,
  setForm,
  classes,
  subjects,
  saving,
  onClose,
  onSave,
}: {
  kind: EntityKind | null;
  form: EntityForm;
  setForm: (form: EntityForm) => void;
  classes: QuestionBankClass[];
  subjects: QuestionBankSubject[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const title = kind ? `${form.id ? "Edit" : "Create"} ${titleCase(kind)}` : "";

  return (
    <Dialog open={Boolean(kind)} onClose={onClose} title={title}>
      {kind && (
        <div className="space-y-4">
          {/* TRACK SELECTOR FOR CLASS */}
          {kind === "class" && !form.id && (
            <div>
              <span className="field-label">Target Curriculum Track</span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, track: "academic" })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-bold transition",
                    form.track === "academic"
                      ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-500/10 dark:text-sky-200"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  )}
                >
                  <BookOpen size={14} /> Academic (Class 1-12)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, track: "admission" })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-bold transition",
                    form.track === "admission"
                      ? "border-purple-500 bg-purple-50 text-purple-900 dark:border-purple-400 dark:bg-purple-500/10 dark:text-purple-200"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  )}
                >
                  <GraduationCap size={14} /> Admission (Varsity/Med)
                </button>
              </div>
            </div>
          )}

          {/* PARENT CLASS SELECTOR FOR SUBJECT */}
          {kind === "subject" && (
            <label className="block">
              <span className="field-label">Belongs to Class / Track</span>
              <select
                className="field-input mt-1"
                value={form.classId}
                onChange={(event) => setForm({ ...form, classId: event.target.value })}
              >
                <option value="">-- Choose Class --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {isAdmissionClass(c) ? "(Admission)" : "(Academic)"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* PARENT SUBJECT SELECTOR FOR CHAPTER */}
          {kind === "chapter" && (
            <label className="block">
              <span className="field-label">Belongs to Subject</span>
              <select
                className="field-input mt-1"
                value={form.subjectId}
                onChange={(event) => setForm({ ...form, subjectId: event.target.value })}
              >
                <option value="">-- Choose Subject --</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={`${titleCase(kind)} Name`}
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value, displayName: value })}
              placeholder={kind === "class" ? "Class 10" : kind === "subject" ? "Physics" : "Dynamics"}
            />
            {kind !== "chapter" && (
              <TextField
                label="Short Code / Slug"
                value={form.code}
                onChange={(value) => setForm({ ...form, code: value })}
                placeholder={kind === "class" ? "class-10" : "PHY"}
              />
            )}
            {kind === "chapter" && (
              <TextField
                label="Chapter Number"
                value={form.chapterNumber}
                onChange={(value) => setForm({ ...form, chapterNumber: value.replace(/[^\d]/g, "") })}
                placeholder="01"
              />
            )}
            {kind === "class" && (
              <TextField
                label="Icon / Emoji (optional)"
                value={form.icon || ""}
                onChange={(value) => setForm({ ...form, icon: value })}
                placeholder="🎓 or 🔬 or 🏛️"
              />
            )}
          </div>

          <label className="block">
            <span className="field-label">Description (optional)</span>
            <textarea
              className="field-input min-h-20 py-2"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Add a brief description for this curriculum item."
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Available for Self Exam & Student Practice
            </label>
            <Badge tone={form.isActive ? "success" : "warning"}>{form.isActive ? "Active" : "Inactive"}</Badge>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={onSave}>
              {saving ? "Saving..." : form.id ? "Save Changes" : `Create ${titleCase(kind)}`}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function QuestionFilters({
  search,
  setSearch,
  difficultyFilter,
  setDifficultyFilter,
  statusFilter,
  setStatusFilter,
  onSearch,
}: {
  search: string;
  setSearch: (value: string) => void;
  difficultyFilter: string;
  setDifficultyFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          className="field-input pl-9 text-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="Search question text or explanations..."
        />
      </div>
      <select
        className="field-input text-xs lg:w-40"
        value={difficultyFilter}
        onChange={(event) => setDifficultyFilter(event.target.value)}
      >
        <option value="">All Difficulties</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <select
        className="field-input text-xs lg:w-40"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <Button size="sm" variant="secondary" onClick={onSearch}>
        Filter
      </Button>
    </Card>
  );
}

function QuestionList({
  questions,
  loading,
  page,
  totalPages,
  total,
  onPage,
  onPreview,
  onEdit,
  onToggle,
  onDelete,
  onAdd,
  onImport,
}: {
  questions: QuestionBankQuestion[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  onPreview: (id: string) => void;
  onEdit: (question: QuestionBankQuestion) => void;
  onToggle: (question: QuestionBankQuestion) => void;
  onDelete: (question: QuestionBankQuestion) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No questions created yet"
        description="Add your first multiple choice question or import a batch from CSV / JSON."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={onImport}>
              <Import size={15} /> Import Questions
            </Button>
            <Button onClick={onAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus size={15} /> Add Question
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {questions.map((question, index) => (
        <Card key={question.id} className="p-3.5 transition hover:border-slate-300 dark:hover:border-white/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">#{(page - 1) * 10 + index + 1}</Badge>
                <Badge tone={question.difficulty === "easy" ? "success" : question.difficulty === "hard" ? "danger" : "warning"}>
                  {question.difficulty}
                </Badge>
                <Badge tone={question.status === "active" ? "success" : question.status === "draft" ? "warning" : "neutral"}>
                  {question.status}
                </Badge>
                <span className="text-xs text-slate-400">{question.marks} mark{question.marks === 1 ? "" : "s"}</span>
                {question.createdAt && <span className="text-xs text-slate-400">Created {formatDate(question.createdAt)}</span>}
              </div>
              <p className="text-sm font-semibold leading-relaxed text-slate-950 dark:text-white">{question.questionText}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton onClick={() => onPreview(question.id)} title="Preview">
                <Eye size={14} />
              </IconButton>
              <IconButton onClick={() => onEdit(question)} title="Edit">
                <Edit3 size={14} />
              </IconButton>
              <IconButton
                onClick={() => onToggle(question)}
                title={question.status === "active" ? "Deactivate" : "Activate"}
              >
                {question.status === "active" ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
              <IconButton className="text-rose-600 dark:text-rose-400" onClick={() => onDelete(question)} title="Delete">
                <Trash2 size={14} />
              </IconButton>
            </div>
          </div>
        </Card>
      ))}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages} ({total} total questions)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({
  open,
  form,
  setForm,
  classes,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  form: QuestionForm;
  setForm: (form: QuestionForm) => void;
  classes: QuestionBankClass[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const [editorSubjects, setEditorSubjects] = useState<QuestionBankSubject[]>([]);
  const [editorChapters, setEditorChapters] = useState<QuestionBankChapter[]>([]);
  const optionLabels = ["A", "B", "C", "D"];

  useEffect(() => {
    if (!form.classId) {
      setEditorSubjects([]);
      return;
    }
    fetchAdminQuestionBankSubjects(form.classId)
      .then(setEditorSubjects)
      .catch(() => setEditorSubjects([]));
  }, [form.classId]);

  useEffect(() => {
    if (!form.subjectId) {
      setEditorChapters([]);
      return;
    }
    fetchAdminQuestionBankChapters(form.subjectId)
      .then(setEditorChapters)
      .catch(() => setEditorChapters([]));
  }, [form.subjectId]);

  return (
    <Dialog open={open} onClose={onClose} title={form.id ? "Edit Question" : "Create New Question"}>
      <div className="space-y-4">
        {/* HIERARCHY SELECTORS DIRECTLY INSIDE THE EDITOR */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Hierarchy Placement</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Class / Track</span>
              <select
                className="field-input mt-1 text-xs"
                value={form.classId}
                onChange={(event) => setForm(nextQuestionFormAfterClassChange(form, event.target.value))}
              >
                <option value="">-- Choose Class --</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Subject</span>
              <select
                className="field-input mt-1 text-xs"
                value={form.subjectId}
                onChange={(event) => setForm(nextQuestionFormAfterSubjectChange(form, event.target.value))}
                disabled={!form.classId}
              >
                <option value="">-- Choose Subject --</option>
                {editorSubjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Chapter (optional)</span>
              <select
                className="field-input mt-1 text-xs"
                value={form.chapterId}
                onChange={(event) => setForm({ ...form, chapterId: event.target.value })}
                disabled={!form.subjectId}
              >
                <option value="">(All / Whole Subject)</option>
                {editorChapters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatChapter(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* QUESTION TEXT */}
        <label className="block">
          <span className="field-label">Question Text</span>
          <textarea
            className="field-input min-h-28 py-2.5 text-sm leading-relaxed"
            value={form.questionText}
            onChange={(event) => setForm({ ...form, questionText: event.target.value })}
            placeholder="Write the MCQ question or problem description here..."
          />
        </label>

        {/* OPTIONS A, B, C, D */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="field-label">Options (click letter to set correct answer)</span>
            <span className="text-xs text-slate-400">Green = Correct Answer</span>
          </div>
          {optionLabels.map((label, index) => (
            <div key={label} className="grid gap-2 sm:grid-cols-[40px_minmax(0,1fr)] sm:items-center">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    options: form.options.map((option, optionIndex) => ({
                      ...option,
                      isCorrect: optionIndex === index,
                    })),
                  })
                }
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg border text-xs font-bold transition",
                  form.options[index]?.isCorrect
                    ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
                )}
                title={`Mark option ${label} as the correct answer`}
              >
                {form.options[index]?.isCorrect ? <Check size={16} /> : label}
              </button>
              <input
                className="field-input text-sm"
                value={form.options[index]?.text || ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    options: form.options.map((option, optionIndex) =>
                      optionIndex === index ? { ...option, text: event.target.value } : option
                    ),
                  })
                }
                placeholder={`Option ${label}`}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Segment
            label="Difficulty"
            value={form.difficulty}
            options={["easy", "medium", "hard"]}
            onChange={(value) => setForm({ ...form, difficulty: value as QuestionForm["difficulty"] })}
          />
          <TextField
            label="Marks"
            value={form.marks}
            onChange={(value) => setForm({ ...form, marks: value })}
            placeholder="1"
          />
          <Segment
            label="Status"
            value={form.status}
            options={["draft", "active", "inactive"]}
            onChange={(value) => setForm({ ...form, status: value as QuestionForm["status"] })}
          />
        </div>

        <label className="block">
          <span className="field-label">Explanation (optional)</span>
          <textarea
            className="field-input min-h-20 py-2 text-xs"
            value={form.explanation}
            onChange={(event) => setForm({ ...form, explanation: event.target.value })}
            placeholder="Shown to students on the Self Exam results & review screen after submission."
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={onSave} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving..." : form.id ? "Save Changes" : "Save Question"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function QuestionPreview({ question }: { question: QuestionBankQuestion }) {
  return (
    <div className="space-y-4">
      <p className="text-base font-semibold leading-relaxed text-slate-950 dark:text-white">{question.questionText}</p>
      <div className="grid gap-2">
        {question.options.map((option, index) => (
          <div
            key={option.id || index}
            className={cn(
              "flex items-center justify-between rounded-lg border p-3 text-sm",
              option.isCorrect
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
            )}
          >
            <span>
              <strong>{String.fromCharCode(65 + index)}.</strong> {option.text}
            </span>
            {option.isCorrect && <Badge tone="success">Correct Answer</Badge>}
          </div>
        ))}
      </div>
      {question.explanation && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-sm text-sky-950 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
          <p className="mb-1 font-bold">Explanation</p>
          <p className="text-xs leading-relaxed">{question.explanation}</p>
        </div>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="field-input mt-1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Segment({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[0.04] mt-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-bold capitalize transition",
              value === option
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function isAdmissionClass(item: QuestionBankClass) {
  const text = `${item.name} ${item.slug}`.toLowerCase();
  return text.includes("admission") || text.includes("varsity") || text.includes("medical") || text.includes("engineering");
}

function slugFor(track: Track, value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (track === "admission" && !slug.includes("admission") && !slug.includes("medical") && !slug.includes("engineering") && !slug.includes("varsity")) {
    return `admission-${slug || "class"}`;
  }
  return slug || undefined;
}

function formatChapter(chapter: QuestionBankChapter) {
  const number = chapter.chapterNumber ? String(chapter.chapterNumber).padStart(2, "0") : "";
  return number ? `${number} - ${chapter.name}` : chapter.name;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function readErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
