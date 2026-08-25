import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "../lib/auth";

export function AccessDeniedPage() {
  const navigate = useNavigate();

  function returnToLogin() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <main className="app-background grid min-h-screen place-items-center px-4">
      <section className="surface-card w-full max-w-lg p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
          <ShieldAlert size={26} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          This dashboard is available only to authorized administrators.
        </p>
        <button className="primary-button mt-6 w-full" type="button" onClick={returnToLogin}>
          Return to login
        </button>
      </section>
    </main>
  );
}
