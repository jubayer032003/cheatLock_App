import { BookOpen, ClipboardList, LayoutDashboard, LogOut, ShieldCheck, Users, BrainCircuit, Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getAuthUser } from "../lib/auth";
import { API_BASE_URL } from "../lib/api";

const navItems = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/exams", label: "Exams", icon: BookOpen },
  { to: "/classes", label: "Classes", icon: Users },
  { to: "/community", label: "Community", icon: Users },
  { to: "/reports", label: "Reports", icon: ClipboardList },
  { to: "/model-card", label: "Model & Data", icon: BrainCircuit },
  { to: "/institution", label: "Institution", icon: Building2 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/audit-logs", label: "Audit Logs", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: ShieldCheck },
];

export function AppShell() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cheatlock.theme") !== "light");
  const lastSynced = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("cheatlock.theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-background relative overflow-hidden">
      {/* ---------- Animated Background Blobs ---------- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 print:hidden">
        <div className="absolute top-[10%] left-[5%] w-80 h-80 rounded-full bg-purple-300/15 blur-[90px] dark:bg-purple-900/10 animate-blob" />
        <div className="absolute top-[50%] right-[10%] w-96 h-96 rounded-full bg-blue-300/15 blur-[100px] dark:bg-indigo-950/10 animate-blob animation-delay-2000" />
        <div className="absolute bottom-[5%] left-[25%] w-72 h-72 rounded-full bg-pink-300/10 blur-[80px] dark:bg-violet-900/5 animate-blob animation-delay-4000" />
      </div>

      {/* ---------- Static Professional Header ---------- */}
      <header className="z-30 relative border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-command-950/80 print:hidden">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="logo-animate grid h-11 w-11 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-400/15 text-cyan-700 dark:text-cyan-200">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">CheatLock</p>
              <h1 className="text-lg font-semibold text-slate-950 dark:text-white">AI Command Center</h1>
            </div>
          </div>

          {/* Right side tools */}
          <div className="flex items-center gap-3">
            {/* API status badge */}
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 md:flex">
              <span className="font-semibold text-slate-700 dark:text-slate-200">API</span>
              <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
              <span className="truncate max-w-[150px]">{API_BASE_URL}</span>
              <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
              <span>Synced {lastSynced}</span>
            </div>

            {/* User info */}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-950 dark:text-white">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.identifier}</p>
            </div>

            {/* Theme toggle — clean text icons */}
            <button
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            {/* Logout */}
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
              type="button"
              onClick={handleLogout}
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Layout: sidebar + main */}
      <div className="relative z-10 mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8 print:block print:p-0 print:m-0 print:max-w-none">
        <nav className="surface-card flex gap-2 overflow-x-auto p-2 lg:sticky lg:top-6 lg:h-fit lg:flex-col lg:overflow-visible print:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""}`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}