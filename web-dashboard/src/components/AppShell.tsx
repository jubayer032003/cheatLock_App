import { BookOpen, ClipboardList, LayoutDashboard, LogOut, ShieldCheck, Users, BrainCircuit, Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getAuthUser, hasPermission } from "../lib/auth";
import { API_BASE_URL } from "../lib/api";

const navItems = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/exams", label: "Exams", icon: BookOpen, permission: "manage_exams" },
  { to: "/classes", label: "Classes", icon: Users, permission: "manage_courses" },
  { to: "/community", label: "Community", icon: Users },
  { to: "/reports", label: "Reports", icon: ClipboardList, permission: "view_reports" },
  ...(import.meta.env.VITE_ENABLE_MODEL_DATA_PAGE === "true"
    ? [{ to: "/model-card", label: "Model & Data", icon: BrainCircuit }]
    : []),
  { to: "/institution", label: "Institution", icon: Building2, permission: "manage_settings" },
  { to: "/users", label: "Users", icon: Users, permission: "manage_users" },
  { to: "/audit-logs", label: "Audit Logs", icon: ClipboardList, permission: "view_audit_logs" },
  ...(import.meta.env.VITE_ENABLE_SETTINGS_PAGE === "true"
    ? [{ to: "/settings", label: "Settings", icon: ShieldCheck }]
    : []),
];

export function AppShell() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cheatlock.theme") !== "light");
  const lastSynced = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  const filteredNavItems = useMemo(() => {
    if (!user) return [];
    return navItems.filter((item) => {
      if (!item.permission) return true;
      return hasPermission(user.role, item.permission);
    });
  }, [user]);

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

      {/* ---------- Static Professional Header ---------- */}
      <header className="z-30 relative border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-command-950/80 print:hidden">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="logo-animate grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-cyan-300/40 bg-command-950">
              <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/40 dark:text-slate-400 dark:hover:bg-white/10"
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            {/* Logout */}
            <button
              aria-label="Log out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/40 dark:text-slate-400 dark:hover:bg-white/10"
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
        <nav className="surface-card flex gap-2 overflow-x-auto p-2 lg:sticky lg:top-6 lg:h-fit lg:flex-col lg:overflow-visible print:hidden" aria-label="Primary dashboard navigation">
          {filteredNavItems.map((item) => {
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
