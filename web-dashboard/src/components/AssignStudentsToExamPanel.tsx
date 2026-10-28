import { Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { assignStudentsToExam, fetchClasses, fetchCommunity } from "../lib/api";
import type { Exam, TeacherClass } from "../types";
import { Badge, Card, cn } from "./ui";

export type AssignmentRoster = {
  communityStudents: string[];
  classes: TeacherClass[];
};

type AssignStudentsToExamPanelProps = {
  exam: Exam;
  onExamUpdated: (exam: Exam) => void;
  className?: string;
  roster?: AssignmentRoster;
};

export function AssignStudentsToExamPanel({
  exam,
  onExamUpdated,
  className,
  roster,
}: AssignStudentsToExamPanelProps) {
  const [studentInput, setStudentInput] = useState("");
  const [message, setMessage] = useState("");
  const [errorTone, setErrorTone] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);
  const [communityStudents, setCommunityStudents] = useState<string[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);

  const canAssign =
    exam.status === "LIVE" || exam.status === "SCHEDULED" || exam.status === "DRAFT";

  useEffect(() => {
    if (roster || !canAssign || !exam.id) return;
    let active = true;
    fetchCommunity()
      .then((community) => { if (active) setCommunityStudents(community.students || []); })
      .catch(() => { if (active) setCommunityStudents([]); });
    fetchClasses()
      .then((items) => { if (active) setClasses(items); })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, [roster, canAssign, exam.id]);

  const rosterCandidates = useMemo(() => {
    const assigned = new Set(exam.assignedStudents.map((student) => student.toLowerCase()));
    const candidates = new Set<string>();
    (roster?.communityStudents ?? communityStudents).forEach((student) => candidates.add(student.toLowerCase()));
    (roster?.classes ?? classes).forEach((classRecord) => {
      classRecord.students.forEach((student) => candidates.add(student.toLowerCase()));
    });
    return [...candidates].filter((student) => student && !assigned.has(student)).sort();
  }, [roster, classes, communityStudents, exam.assignedStudents]);

  async function handleAssign(studentIds: string[]) {
    if (!exam.id) return;
    if (studentIds.length === 0) {
      setErrorTone("error");
      setMessage("Enter at least one student ID or email.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const result = await assignStudentsToExam(exam.id, studentIds);
      onExamUpdated(result.exam);
      const addedCount = result.addedStudents?.length ?? studentIds.length;
      setErrorTone("success");
      setMessage(
        addedCount > 0
          ? `Added ${addedCount} student(s). They can join immediately with the exam code.`
          : "Those students were already assigned to this exam."
      );
      setStudentInput("");
    } catch (error) {
      setErrorTone("error");
      setMessage(readErrorMessage(error, "Could not assign students."));
    } finally {
      setSaving(false);
    }
  }

  function parseStudentInput(raw: string) {
    return [...new Set(raw.split(/[,\n]+/).map((item) => item.trim().toLowerCase().replace(/\s+/g, "")).filter(Boolean))];
  }

  if (!canAssign || !exam.id) {
    return null;
  }

  const title =
    exam.status === "LIVE" ? "Add students to live exam" : "Add more students to exam";

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">{title}</h3>
          <Badge tone={exam.status === "LIVE" ? "success" : "neutral"}>{exam.status}</Badge>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Newly added students can open the exam with the same code or link. Use the exact student ID or email they registered with.
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Currently assigned ({exam.assignedStudents.length})
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {exam.assignedStudents.length === 0 ? (
            <span className="text-sm text-slate-500 dark:text-slate-400">No students assigned yet.</span>
          ) : (
            exam.assignedStudents.map((student) => (
              <span
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"
                key={student}
              >
                {student}
              </span>
            ))
          )}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="field-label">Student IDs or emails</span>
        <textarea
          className="field-input min-h-24 py-3"
          value={studentInput}
          onChange={(event) => setStudentInput(event.target.value)}
          placeholder="student01, student02@school.edu"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Separate multiple students with commas or new lines.
        </span>
      </label>

      {rosterCandidates.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quick add from roster
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rosterCandidates.slice(0, 12).map((studentId) => (
              <button
                className="secondary-button"
                disabled={saving}
                key={studentId}
                type="button"
                onClick={() => {
                  setStudentInput((current) =>
                    current.trim() ? `${current.trim()}, ${studentId}` : studentId
                  );
                }}
              >
                <Users size={15} />
                {studentId}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className="primary-button mt-4"
        disabled={saving}
        type="button"
        onClick={() => handleAssign(parseStudentInput(studentInput))}
      >
        <Users size={17} />
        {saving ? "Adding students…" : "Add to exam"}
      </button>

      {message && (
        <p
          className={cn(
            "mt-3 text-sm",
            errorTone === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
          )}
        >
          {message}
        </p>
      )}
    </Card>
  );
}

function readErrorMessage(error: unknown, fallback = "Something went wrong.") {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
