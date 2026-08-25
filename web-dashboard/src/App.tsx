import { Suspense, lazy, useState, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { getAuthUser, hasPermission } from "./lib/auth";

const TeacherHomePage = lazy(() => import("./pages/TeacherHomePage").then((module) => ({ default: module.TeacherHomePage })));
const ExamListPage = lazy(() => import("./pages/ExamListPage").then((module) => ({ default: module.ExamListPage })));
const ExamDetailsPage = lazy(() => import("./pages/ExamDetailsPage").then((module) => ({ default: module.ExamDetailsPage })));
const AttendancePage = lazy(() => import("./pages/AttendancePage").then((module) => ({ default: module.AttendancePage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((module) => ({ default: module.CommunityPage })));
const ClassesPage = lazy(() => import("./pages/ClassesPage").then((module) => ({ default: module.ClassesPage })));
const LiveProctoringPage = lazy(() => import("./pages/LiveProctoringPage").then((module) => ({ default: module.LiveProctoringPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const ReplayTimelinePage = lazy(() => import("./pages/ReplayTimelinePage").then((module) => ({ default: module.ReplayTimelinePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ModelDataCardPage = lazy(() => import("./pages/ModelDataCardPage").then((module) => ({ default: module.ModelDataCardPage })));
const InstitutionManagementPage = lazy(() => import("./pages/InstitutionManagementPage").then((module) => ({ default: module.InstitutionManagementPage })));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage").then((module) => ({ default: module.UserManagementPage })));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage").then((module) => ({ default: module.AuditLogsPage })));
const ENABLE_MODEL_DATA_PAGE = import.meta.env.VITE_ENABLE_MODEL_DATA_PAGE === "true";
const ENABLE_SETTINGS_PAGE = import.meta.env.VITE_ENABLE_SETTINGS_PAGE === "true";

interface PermissionRouteProps {
  children: React.ReactNode;
  permission: string;
}

function PermissionRoute({ children, permission }: PermissionRouteProps) {
  const user = getAuthUser();
  if (!user || !hasPermission(user.role, permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [transitionState, setTransitionState] = useState<"IDLE" | "SWEEPING" | "OPENING">("IDLE");
  const navigate = useNavigate();

  useEffect(() => {
    const handleLoginSuccess = (e: Event) => {
      const customEvent = e as CustomEvent<{ nextPath: string }>;
      const nextPath = customEvent.detail?.nextPath || "/";
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      if (reduceMotion) {
        navigate(nextPath, { replace: true });
        setTransitionState("IDLE");
        return;
      }

      // Instantly close doors and play welcome text/laser sweep
      setTransitionState("SWEEPING");

      // Instantly change route behind the closed doors.
      // Since the doors are fixed at z-[9999], the user doesn't see the unmounting of LoginPage
      navigate(nextPath, { replace: true });

      // After 2 seconds, trigger the door-opening state
      const openTimeout = setTimeout(() => {
        setTransitionState("OPENING");
      }, 2000);

      // After 3.2 seconds total, clean up transitionState
      const idleTimeout = setTimeout(() => {
        setTransitionState("IDLE");
      }, 3200);

      return () => {
        clearTimeout(openTimeout);
        clearTimeout(idleTimeout);
      };
    };

    window.addEventListener("cheatlock-login-success", handleLoginSuccess);
    return () => {
      window.removeEventListener("cheatlock-login-success", handleLoginSuccess);
    };
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
            </ProtectedRoute>
            }
          >
          <Route index element={<RouteFallback><TeacherHomePage /></RouteFallback>} />
          <Route path="exams" element={<RouteFallback><ExamListPage /></RouteFallback>} />
          <Route path="exams/:examId" element={<RouteFallback><ExamDetailsPage /></RouteFallback>} />
          <Route path="exams/:examId/attendance" element={<RouteFallback><AttendancePage /></RouteFallback>} />
          <Route path="exams/:examId/live" element={<RouteFallback><LiveProctoringPage /></RouteFallback>} />
          <Route path="exams/:examId/replay" element={<RouteFallback><ReplayTimelinePage /></RouteFallback>} />
          <Route path="community" element={<RouteFallback><CommunityPage /></RouteFallback>} />
          <Route path="classes" element={<RouteFallback><ClassesPage /></RouteFallback>} />
          <Route path="reports" element={<RouteFallback><ReportsPage /></RouteFallback>} />
          <Route path="settings" element={ENABLE_SETTINGS_PAGE ? <RouteFallback><SettingsPage /></RouteFallback> : <Navigate to="/" replace />} />
          <Route path="model-card" element={ENABLE_MODEL_DATA_PAGE ? <RouteFallback><ModelDataCardPage /></RouteFallback> : <Navigate to="/" replace />} />
          <Route path="institution" element={
            <PermissionRoute permission="manage_settings">
              <RouteFallback><InstitutionManagementPage /></RouteFallback>
            </PermissionRoute>
          } />
          <Route path="users" element={
            <PermissionRoute permission="manage_users">
              <RouteFallback><UserManagementPage /></RouteFallback>
            </PermissionRoute>
          } />
          <Route path="audit-logs" element={
            <PermissionRoute permission="view_audit_logs">
              <RouteFallback><AuditLogsPage /></RouteFallback>
            </PermissionRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global 3D Door Transition Overlay */}
      {transitionState !== "IDLE" && (
        <div className="fixed inset-0 z-[9999] flex overflow-hidden bg-black/10 perspective-1500 preserve-3d">
          <style>{`
            .door-left {
              transition: transform 1.2s cubic-bezier(0.7, 0, 0.3, 1);
              transform-origin: left center;
            }
            .door-right {
              transition: transform 1.2s cubic-bezier(0.7, 0, 0.3, 1);
              transform-origin: right center;
            }
            .door-left-open {
              transform: perspective(1500px) rotateY(-85deg) translateX(-100%);
            }
            .door-right-open {
              transform: perspective(1500px) rotateY(85deg) translateX(100%);
            }
            .animate-sweep {
              animation: sweep 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
            @keyframes sweep {
              0% { left: -50%; }
              100% { left: 150%; }
            }
            .animate-reveal-text {
              animation: reveal-text 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes reveal-text {
              0% { opacity: 0; transform: scale(0.9); filter: blur(8px); }
              50% { opacity: 1; transform: scale(1.03); filter: blur(0); }
              100% { opacity: 1; transform: scale(1); filter: blur(0); }
            }
            .animate-reveal-sub {
              animation: reveal-sub 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes reveal-sub {
              0% { opacity: 0; transform: translateY(10px); }
              40% { opacity: 0; }
              100% { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .door-left,
              .door-right,
              .animate-sweep,
              .animate-reveal-text,
              .animate-reveal-sub {
                animation: none !important;
                transition: none !important;
                transform: none !important;
              }
            }
          `}</style>

          {/* Left Door */}
          <div 
            className={`w-1/2 h-full bg-[#080d16] flex items-center justify-end border-r border-violet-500/10 door-left ${
              transitionState === "OPENING" ? "door-left-open" : ""
            }`}
          />
          
          {/* Right Door */}
          <div 
            className={`w-1/2 h-full bg-[#080d16] flex items-center justify-start border-l border-violet-500/10 door-right ${
              transitionState === "OPENING" ? "door-right-open" : ""
            }`}
          />

          {/* Torch Light & Welcome Text Overlay */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center text-center z-[110] px-4 transition-opacity duration-500 ${
            transitionState === "OPENING" ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}>
            {/* Sweeping searchlight torch beam */}
            <div className="absolute top-0 bottom-0 w-[450px] bg-gradient-to-r from-transparent via-violet-500/25 to-transparent blur-3xl transform -skew-x-[25deg] animate-sweep pointer-events-none" />
            
            {/* Brand mark */}
            <div className="h-16 w-16 overflow-hidden rounded-2xl bg-[#020617] flex items-center justify-center border border-violet-500/30 mb-6 shadow-[0_0_20px_rgba(139,92,246,0.3)] animate-pulse">
              <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
            </div>
            
            {/* Welcome Text */}
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-wider uppercase animate-reveal-text drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]">
              Welcome to CheatLock
            </h2>
            <p className="mt-3 text-violet-300 font-semibold tracking-widest text-xs uppercase animate-reveal-sub">
              AI monitoring system initialized
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function RouteFallback({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="surface-card grid min-h-72 place-items-center p-6 text-center" role="status" aria-live="polite">
          <div>
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent motion-safe:animate-spin" />
            <p className="font-semibold text-slate-900 dark:text-white">Loading workspace</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Preparing this dashboard view.</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
