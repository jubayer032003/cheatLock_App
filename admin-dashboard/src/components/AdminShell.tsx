import { BookOpen, ChevronRight, FileQuestion, LayoutDashboard, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getAuthUser } from "../lib/auth";
import { API_BASE_URL } from "../lib/api";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Central",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/question-bank", label: "Questions", icon: FileQuestion },
      { to: "/question-bank/hierarchy", label: "Classes & Subjects", icon: BookOpen },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "", label: "Coming later", icon: ChevronRight, disabled: true },
    ],
  },
];

export function AdminShell() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cheatlock.admin.theme") !== "light");
  const lastSynced = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("cheatlock.admin.theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-background relative overflow-hidden">
      <header className="relative z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-command-950/85">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-cyan-300/40 bg-command-950">
              <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">CheatLock</p>
              <h1 className="text-lg font-semibold text-slate-950 dark:text-white">Central Admin</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 md:flex">
              <span className="font-semibold text-slate-700 dark:text-slate-200">API</span>
              <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
              <span className="max-w-[150px] truncate">{API_BASE_URL}</span>
              <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
              <span>Synced {lastSynced}</span>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-950 dark:text-white">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role}</p>
            </div>
            <button
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/40 dark:text-slate-400 dark:hover:bg-white/10"
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? "L" : "D"}
            </button>
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

      <div className="relative z-10 mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
        <nav className="surface-card flex gap-2 overflow-x-auto p-2 lg:sticky lg:top-6 lg:h-fit lg:flex-col lg:overflow-visible" aria-label="Central admin navigation">
          {navGroups.map((group) => (
            <div className="contents lg:block" key={group.label}>
              <p className="hidden px-3 pb-2 pt-3 text-xs font-bold uppercase tracking-wide text-slate-400 lg:block">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                if (item.disabled) {
                  return (
                    <div className="nav-link cursor-not-allowed opacity-50" key={item.label}>
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </div>
                  );
                }
                return (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
