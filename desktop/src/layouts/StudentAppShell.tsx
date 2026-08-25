import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpenCheck, ChevronDown, HelpCircle, History, Home, LogOut, UserCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/Button";
import { STUDENT_HISTORY_ROUTE, STUDENT_HOME_ROUTE, STUDENT_PROFILE_ROUTE, STUDENT_SUPPORT_ROUTE } from "../routes/studentRoutes";
import cheatLockLogo from "../assets/cheatlock-logo.png";

const studentNavItems = [
  { to: STUDENT_HOME_ROUTE, label: "Home", icon: Home },
  { to: STUDENT_HISTORY_ROUTE, label: "History", icon: History },
  { to: STUDENT_SUPPORT_ROUTE, label: "Support", icon: HelpCircle },
];

export function StudentAppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-base">
      <header className="shrink-0 border-b border-border bg-surface-raised/95 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-accent/25 bg-surface-base">
              <img src={cheatLockLogo} alt="CheatLock logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight text-zinc-50">CheatLock</h1>
                <span className="rounded-md border border-border bg-surface-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Student
                </span>
              </div>
              <p className="truncate text-xs text-zinc-500">Secure desktop exam workspace</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Student navigation">
            {studentNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base ${
                      isActive
                        ? "border-accent/35 bg-accent/10 text-zinc-50"
                        : "border-border bg-surface-base text-zinc-400 hover:text-zinc-100"
                    }`
                  }
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="relative flex justify-end">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="flex h-10 max-w-full items-center gap-2 rounded-md border border-border bg-surface-base px-3 text-left text-sm text-zinc-200 transition-colors hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
            >
              <UserCircle size={18} className="shrink-0 text-zinc-500" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{user?.name || "Student"}</span>
                <span className="block truncate font-mono text-[10px] text-zinc-500">{user?.identifier || "unknown"}</span>
              </span>
              <ChevronDown size={15} className={`shrink-0 text-zinc-500 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 w-64 rounded-lg border border-border bg-surface-raised p-2 shadow-2xl"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-semibold text-zinc-100">{user?.name || "Student"}</p>
                  <p className="truncate font-mono text-xs text-zinc-500">{user?.identifier || "unknown"}</p>
                </div>
                <NavLink
                  role="menuitem"
                  to={STUDENT_PROFILE_ROUTE}
                  onClick={() => setProfileOpen(false)}
                  className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-surface-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <BookOpenCheck size={15} />
                  Profile
                </NavLink>
                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  onClick={handleLogout}
                  className="mt-1 w-full justify-start px-3 py-2 text-sm"
                >
                  <LogOut size={15} />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
