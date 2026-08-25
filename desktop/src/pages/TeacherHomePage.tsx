import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BookOpenCheck, Play, RefreshCw, Send, Square, Users } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { pageVariants } from "../motion/variants";
import { SessionService } from "../services/SessionService";
import type { Exam } from "../types";

export function TeacherHomePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [studentsText, setStudentsText] = useState("");
  const [questionText, setQuestionText] = useState("");

  const loadExams = async () => {
    setLoading(true);
    try {
      setExams(await SessionService.getTeacherExams());
    } catch (err: any) {
      showToast(err.message || "Failed to load teacher exams.", "error");
      setExams([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const stats = useMemo(() => {
    const live = exams.filter((exam) => exam.status === "LIVE").length;
    const assigned = exams.reduce((sum, exam) => sum + (exam.assignedStudents?.length || 0), 0);
    return { live, assigned };
  }, [exams]);

  const createExam = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedQuestion = questionText.trim();
    const assignedStudents = studentsText
      .split(/[\n,]+/)
      .map((student) => student.trim().toLowerCase().replace(/\s+/g, ""))
      .filter(Boolean);

    if (!normalizedTitle || !normalizedQuestion) {
      showToast("Exam title and first question are required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const exam = await SessionService.createTeacherExam({
        title: normalizedTitle,
        durationMinutes,
        assignedStudents,
        questions: [
          {
            type: "CQ",
            text: normalizedQuestion,
            options: [],
            correctAnswer: "",
          },
        ],
      });
      setExams((current) => [exam, ...current]);
      setTitle("");
      setStudentsText("");
      setQuestionText("");
      showToast(
        assignedStudents.length > 0
          ? "Exam created and student notifications queued."
          : "Exam created. Add students to notify them.",
        "success"
      );
    } catch (err: any) {
      showToast(err.message || "Failed to create exam.", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateLifecycle = async (exam: Exam, action: "START" | "END") => {
    try {
      const updated = await SessionService.updateTeacherExamLifecycle(exam.id, action);
      setExams((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast(
        action === "START"
          ? "Exam started. Assigned students will be notified automatically."
          : "Exam ended.",
        action === "START" ? "success" : "info"
      );
    } catch (err: any) {
      showToast(err.message || "Failed to update exam.", "error");
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full w-full overflow-y-auto bg-surface-base"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="grid min-h-[168px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-zinc-950 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative flex flex-col justify-between border-b border-border p-6 lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Teacher home</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
                {user?.name || "Teacher"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Create exams, assign students, and start live sessions from the desktop client.
              </p>
            </div>
            <div className="relative mt-6">
              <Button variant="secondary" className="h-10 px-4" onClick={loadExams} disabled={loading}>
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-surface-raised p-6">
            <Metric icon={BookOpenCheck} label="Exams" value={String(exams.length)} />
            <Metric icon={Activity} label="Live" value={String(stats.live)} />
            <Metric icon={Users} label="Assigned" value={String(stats.assigned)} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Card className="min-h-[420px]">
            <form onSubmit={createExam} className="flex h-full flex-col gap-4">
              <div className="border-b border-border pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  <Send size={15} className="text-cyan-400" />
                  Create Exam
                </div>
              </div>

              <Input
                label="Exam title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Midterm assessment"
                disabled={saving}
              />
              <Input
                label="Duration minutes"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value) || 1))}
                disabled={saving}
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Assigned students</span>
                <textarea
                  value={studentsText}
                  onChange={(event) => setStudentsText(event.target.value)}
                  placeholder="student-001, student-002"
                  disabled={saving}
                  className="min-h-[88px] w-full rounded-md border border-border bg-surface-base px-3.5 py-2 text-sm text-zinc-50 outline-none transition-all duration-150 placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">First question</span>
                <textarea
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  placeholder="Write the first exam question"
                  disabled={saving}
                  className="min-h-[108px] w-full rounded-md border border-border bg-surface-base px-3.5 py-2 text-sm text-zinc-50 outline-none transition-all duration-150 placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>

              <Button type="submit" className="mt-auto h-10" isLoading={saving}>
                <Send size={16} /> Create and Notify
              </Button>
            </form>
          </Card>

          <Card className="min-h-[420px]">
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  <BookOpenCheck size={15} className="text-accent" />
                  Exam Dashboard
                </div>
                <span className="text-xs text-zinc-500">{loading ? "Loading" : `${exams.length} exams`}</span>
              </div>

              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading exams...</div>
              ) : exams.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <BookOpenCheck size={30} className="text-zinc-600" />
                  <p className="text-sm font-semibold text-zinc-300">No exams yet</p>
                  <p className="max-w-sm text-xs leading-5 text-zinc-500">Create an exam and assign students to queue their desktop notifications.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                  {exams.map((exam) => (
                    <article
                      key={exam.id}
                      className="flex min-h-[92px] items-center justify-between gap-4 rounded-lg border border-border bg-surface-base px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-zinc-100">{exam.title}</h3>
                          <ExamStatus status={exam.status} />
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          {exam.durationMinutes} min | {exam.questions.length} questions | {(exam.assignedStudents || []).length} students | code {exam.accessCode}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {exam.status === "LIVE" ? (
                          <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => updateLifecycle(exam, "END")}>
                            <Square size={14} /> End
                          </Button>
                        ) : (
                          <Button className="h-9 px-3 text-xs" onClick={() => updateLifecycle(exam, "START")}>
                            <Play size={14} /> Start
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </motion.div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpenCheck; label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-surface-base p-4">
      <Icon size={18} className="text-zinc-500" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

function ExamStatus({ status }: { status: Exam["status"] }) {
  const styles = status === "LIVE"
    ? "border-success/25 bg-success/10 text-green-200"
    : status === "SCHEDULED"
      ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-200"
      : status === "ENDED" || status === "ARCHIVED"
        ? "border-zinc-700 bg-zinc-800 text-zinc-400"
        : "border-warning/25 bg-warning/10 text-yellow-200";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${styles}`}>
      {status}
    </span>
  );
}
