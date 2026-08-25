import { BookOpen, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClass, decideClassEnrollment, deleteClass, fetchClasses, updateClass } from "../lib/api";
import { Card, EmptyState, ErrorState, PageHeader } from "../components/ui";
import type { TeacherClass } from "../types";

type ClassFormState = {
  id?: string;
  name: string;
  section: string;
  subject: string;
  students: string;
};

const emptyForm: ClassFormState = {
  name: "",
  section: "",
  subject: "",
  students: "",
};

export function ClassesPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [form, setForm] = useState<ClassFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadClasses() {
    setMessage("");
    setLoading(true);
    try {
      setClasses(await fetchClasses());
    } catch {
      setMessage("Could not load classes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  const stats = useMemo(() => {
    const students = new Set(classes.flatMap((item) => item.students));
    const pending = classes.reduce(
      (sum, item) => sum + (item.enrollmentRequests || []).filter((request) => request.status === "PENDING").length,
      0
    );
    return { classes: classes.length, students: students.size, pending };
  }, [classes]);

  async function handleSave() {
    const payload = {
      name: form.name.trim(),
      section: form.section.trim(),
      subject: form.subject.trim(),
      students: normalizeStudents(form.students),
    };
    if (!payload.name) {
      setMessage("Class name is required.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (form.id) {
        await updateClass(form.id, payload);
        setMessage("Class updated.");
      } else {
        await createClass(payload);
        setMessage("Class created.");
      }
      setForm(emptyForm);
      setClasses(await fetchClasses());
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not save class."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(classId: string) {
    const className = classes.find((item) => item.id === classId)?.name || "this class";
    if (!window.confirm(`Delete ${className}? This removes the saved roster and cannot be undone.`)) return;
    setSaving(true);
    setMessage("");
    try {
      await deleteClass(classId);
      setClasses(await fetchClasses());
      if (form.id === classId) setForm(emptyForm);
      setMessage("Class deleted.");
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not delete class."));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnrollmentDecision(
    classId: string,
    studentId: string,
    decision: "APPROVED" | "REJECTED"
  ) {
    setSaving(true);
    setMessage("");
    try {
      await decideClassEnrollment(classId, studentId, decision);
      setClasses(await fetchClasses());
      setMessage(decision === "APPROVED" ? "Student approved." : "Student rejected.");
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not update enrollment request."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Institution setup"
        title="Classes & Sections"
        description="Create reusable class rosters, then assign whole classes while creating exams."
        actions={<a className="primary-button" href="#class-form"><Plus size={17} />New class</a>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Classes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{stats.classes}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unique students</p>
          <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{stats.students}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending requests</p>
          <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{stats.pending}</p>
        </Card>
      </section>

      {message && (
        message.includes("Could not")
          ? <ErrorState message={message} onRetry={loadClasses} />
          : <Card className="p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</Card>
      )}

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-5" id="class-form">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                {form.id ? "Edit Class" : "Create Class"}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Keep rosters clean and reusable.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="field-label">Class name</span>
              <input className="field-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Exam preparation class" />
            </label>
            <label className="block">
              <span className="field-label">Section</span>
              <input className="field-input" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} placeholder="01" />
            </label>
            <label className="block">
              <span className="field-label">Subject</span>
              <input className="field-input" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Computer Science" />
            </label>
            <label className="block">
              <span className="field-label">Students</span>
              <textarea
                className="field-input min-h-36 py-3"
                value={form.students}
                onChange={(event) => setForm({ ...form, students: event.target.value })}
                placeholder="student.id@school.edu, student.id2@school.edu"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="primary-button" disabled={saving} type="button" onClick={handleSave}>
              {saving ? "Saving..." : form.id ? "Update Class" : "Create Class"}
            </button>
            {form.id && (
              <button className="secondary-button" disabled={saving} type="button" onClick={() => setForm(emptyForm)}>
                Cancel
              </button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Class Roster</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Classes are scoped to the logged-in teacher.</p>
          </div>

          {loading ? (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">Loading classes...</p>
          ) : classes.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Users} title="No classes yet" description="Create a class to assign full rosters to exams." />
            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {classes.map((item) => (
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035]" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-slate-950 dark:text-white">{item.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {[item.section && `Section ${item.section}`, item.subject].filter(Boolean).join(" / ") || "No section"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="icon-button" title="Edit class" type="button" onClick={() => setForm({
                        id: item.id,
                        name: item.name,
                        section: item.section,
                        subject: item.subject,
                        students: item.students.join(", "),
                      })}>
                        <BookOpen size={16} />
                      </button>
                      <button className="icon-button" title="Delete class" type="button" onClick={() => handleDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.students.length} students</p>
                  <div className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm dark:border-cyan-400/20 dark:bg-cyan-400/10">
                    <span className="font-semibold text-cyan-800 dark:text-cyan-100">Invite code:</span>{" "}
                    <span className="font-mono font-bold text-cyan-900 dark:text-cyan-50">{item.inviteCode || "Pending"}</span>
                  </div>
                  <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-auto">
                    {item.students.slice(0, 12).map((student) => (
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300" key={student}>
                        {student}
                      </span>
                    ))}
                    {item.students.length > 12 && <span className="text-xs text-slate-500">+{item.students.length - 12} more</span>}
                  </div>
                  {(item.enrollmentRequests || []).filter((request) => request.status === "PENDING").length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-400/20 dark:bg-amber-400/10">
                      <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Pending enrollment</p>
                      <div className="mt-2 space-y-2">
                        {item.enrollmentRequests
                          .filter((request) => request.status === "PENDING")
                          .map((request) => (
                            <div className="flex flex-col gap-2 rounded-md bg-white p-3 dark:bg-command-950/50 sm:flex-row sm:items-center sm:justify-between" key={request.studentId}>
                              <div>
                                <p className="text-sm font-semibold text-slate-950 dark:text-white">{request.studentName}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{request.studentId}</p>
                              </div>
                              <div className="flex gap-2">
                                <button className="primary-button" disabled={saving} type="button" onClick={() => handleEnrollmentDecision(item.id, request.studentId, "APPROVED")}>
                                  Approve
                                </button>
                                <button className="secondary-button" disabled={saving} type="button" onClick={() => handleEnrollmentDecision(item.id, request.studentId, "REJECTED")}>
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function normalizeStudents(value: string) {
  return [...new Set(
    value
      .split(",")
      .map((student) => student.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function readErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
