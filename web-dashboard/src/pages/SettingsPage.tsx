import { Activity, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { API_BASE_URL } from "../lib/api";
import { getAuthUser } from "../lib/auth";
import { Card, MetricCard, PageHeader } from "../components/ui";

export function SettingsPage() {
  const user = getAuthUser();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profile and security"
        title="Settings"
        description="Teacher identity, backend connection, and trust controls used by the web command center."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={UserRound} label="Teacher" value={user?.name || "Teacher"} helper={user?.identifier || "No identifier"} tone="primary" />
        <MetricCard icon={LockKeyhole} label="Session storage" value="JWT" helper="Browser session scoped" tone="success" />
        <MetricCard icon={Activity} label="Backend endpoint" value="Configured" helper={API_BASE_URL} tone="info" />
      </section>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200">
            <ShieldCheck size={19} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Security posture</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              CheatLock keeps web dashboard actions on the existing authenticated backend. Exam IDs, teacher ownership,
              live proctoring rooms, replay timelines, and integrity reviews continue to use the same API surface.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
