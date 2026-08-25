import { FormEvent, useState } from "react";
import { Activity, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginAdmin } from "../lib/api";
import { canEnterAdminDashboard, ADMIN_ROLES } from "../lib/adminAccess";
import { clearAuth, saveAuth } from "../lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(ADMIN_ROLES[0]);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginAdmin(identifier, password, role);
      if (!canEnterAdminDashboard(data.user)) {
        clearAuth();
        navigate("/access-denied", { replace: true });
        return;
      }
      saveAuth(data.token, data.user);
      const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/dashboard";
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(readErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <main className="app-background grid min-h-screen place-items-center px-4 py-8">
      <section className="surface-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[4fr_5fr]">
        <div className="hidden border-r border-white/10 bg-command-950 p-8 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-cyan-300/40 bg-command-950">
              <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">CheatLock</p>
              <p className="font-bold">Central Admin</p>
            </div>
          </div>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">Question bank operations for authorized administrators.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Sign in with an existing CheatLock administrator account. Teacher and student accounts are not allowed in this application.
          </p>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-7">
            <h2 className="text-3xl font-extrabold text-slate-950 dark:text-white">Admin Sign In</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Use your assigned central administration credentials.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="field-label">Email Address</span>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input className="field-input pl-10" type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="admin@cheatlock.com" required />
              </div>
            </label>

            <label className="block">
              <span className="field-label">Admin Role</span>
              <select className="field-input" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
                {ADMIN_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="field-label">Password</span>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input className="field-input pl-10 pr-12" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••••" required />
                <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10" type="button" onClick={() => setShowPassword((current) => !current)} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</div>}

            <button className="primary-button relative h-12 w-full" disabled={loading} type="submit">
              {loading ? <><Activity size={18} className="animate-spin" /> Verifying</> : "Enter Admin Dashboard"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function readErrorMessage(error: unknown) {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (response?.data && typeof response.data === "object") {
    const dataObj = response.data as { message?: string; error?: string };
    return dataObj.message || dataObj.error || "Admin login failed.";
  }
  const axiosErr = error as { message?: string };
  if (axiosErr.message === "Network Error") return "Network connection failed. Confirm the backend is running.";
  if (axiosErr.message?.includes("timeout")) return "Connection timeout. Please try again.";
  return "Admin credentials could not be verified.";
}
