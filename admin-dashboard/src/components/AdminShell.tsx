import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FileQuestion,
  GraduationCap,
  Import,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  UserCircle,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getAuthUser } from "../lib/auth";
import { cn } from "./ui";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/academic", label: "Academic", icon: BookOpen },
      { to: "/admission", label: "Admission", icon: GraduationCap },
    ],
  },
  {
    label: "Question Bank",
    items: [
      { to: "/questions", label: "Questions", icon: FileQuestion },
      { to: "/import", label: "Import", icon: Import },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/profile", label: "Admin Profile", icon: UserCircle },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getAuthUser();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cheatlock.admin.theme") !== "light");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("cheatlock.admin.theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  const title = useMemo(() => {
    if (location.pathname.startsWith("/academic")) return "Academic";
    if (location.pathname.startsWith("/admission")) return "Admission";
    if (location.pathname.startsWith("/questions")) return "Questions";
    if (location.pathname.startsWith("/import")) return "Import";
    if (location.pathname.startsWith("/profile")) return "Admin Profile";
    if (location.pathname.startsWith("/settings")) return "Settings";
    return "Overview";
  }, [location.pathname]);

  return (
    <div className="app-background min-h-screen font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#090d16]/90">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button lg:hidden" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <Menu size={18} />
            </button>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <Shield size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-950 dark:text-white">CheatLock Admin</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 md:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Connected
            </span>
            <button className="icon-button" type="button" onClick={() => setDarkMode((value) => !value)} aria-label="Toggle theme">
              {darkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
            </button>
            <button className="icon-button text-rose-600 dark:text-rose-400" type="button" onClick={handleLogout} aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1500px] gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 space-y-5">
            <Navigation />
            <div className="surface-card p-4">
              <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{user?.name || "Administrator"}</p>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{user?.role || "Admin"}</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-white/10 dark:bg-[#090d16]/95 lg:hidden" aria-label="Mobile navigation">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {groups.slice(0, 2).flatMap((group) => group.items).slice(0, 5).map((item) => (
            <MobileLink key={item.to} item={item} />
          ))}
        </div>
      </nav>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/60" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />
          <div className="relative h-full w-80 max-w-[86vw] bg-white p-5 shadow-2xl dark:bg-[#0e1424]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-sky-600 dark:text-sky-300" />
                <span className="font-bold text-slate-950 dark:text-white">Admin Console</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={16} />
              </button>
            </div>
            <Navigation />
          </div>
        </div>
      )}
    </div>
  );
}

function Navigation() {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{group.label}</p>
          <nav className="space-y-1" aria-label={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}
                >
                  <Icon size={17} />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

function MobileLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold text-slate-500 transition dark:text-slate-400",
          isActive && "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
        )
      }
    >
      <Icon size={17} />
      <span className="max-w-full truncate">{item.label}</span>
    </NavLink>
  );
}
