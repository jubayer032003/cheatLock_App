import { BookOpen, FileQuestion, Layers, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, MetricCard, PageHeader } from "../components/ui";
import { getAuthUser } from "../lib/auth";

export function DashboardPage() {
  const user = getAuthUser();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Central Admin"
        title="Platform operations"
        description="Manage central content and question-bank hierarchy for CheatLock administrators."
        actions={
          <Link className="primary-button" to="/question-bank/questions/new">
            <Plus size={16} /> Add Question
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={FileQuestion} label="Question Bank" value="Ready" helper="Questions, status, preview, edit" tone="primary" />
        <MetricCard icon={BookOpen} label="Hierarchy" value="Managed" helper="Classes, subjects, chapters" tone="success" />
        <MetricCard icon={Layers} label="Role" value={user?.role || "Admin"} helper={user?.identifier || "Authenticated administrator"} tone="info" />
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">Daily workflow</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link className="exam-operation-link exam-operation-link-primary" to="/question-bank/questions/new">
            <Plus size={18} />
            <span>
              <span className="block font-semibold">Add an MCQ</span>
              <span className="mt-1 block text-sm opacity-80">Select class, subject, chapter, answer, marks, and status.</span>
            </span>
          </Link>
          <Link className="exam-operation-link" to="/question-bank/hierarchy">
            <BookOpen size={18} />
            <span>
              <span className="block font-semibold">Manage hierarchy</span>
              <span className="mt-1 block text-sm opacity-80">Create or activate classes, subjects, and chapters.</span>
            </span>
          </Link>
        </div>
      </Card>
    </div>
  );
}
