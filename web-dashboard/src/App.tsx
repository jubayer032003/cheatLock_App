import { useState, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ExamDetailsPage } from "./pages/ExamDetailsPage";
import { ExamListPage } from "./pages/ExamListPage";
import { AttendancePage } from "./pages/AttendancePage";
import { CommunityPage } from "./pages/CommunityPage";
import { ClassesPage } from "./pages/ClassesPage";
import { LiveProctoringPage } from "./pages/LiveProctoringPage";
import { LoginPage } from "./pages/LoginPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReplayTimelinePage } from "./pages/ReplayTimelinePage";
import { SettingsPage } from "./pages/SettingsPage";
import { TeacherHomePage } from "./pages/TeacherHomePage";
import { ModelDataCardPage } from "./pages/ModelDataCardPage";
import { InstitutionManagementPage } from "./pages/InstitutionManagementPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ShieldCheck } from "lucide-react";

export default function App() {
  const [transitionState, setTransitionState] = useState<"IDLE" | "SWEEPING" | "OPENING">("IDLE");
  const navigate = useNavigate();

  useEffect(() => {
    const handleLoginSuccess = (e: Event) => {
      const customEvent = e as CustomEvent<{ nextPath: string }>;
      const nextPath = customEvent.detail?.nextPath || "/";

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
          <Route index element={<TeacherHomePage />} />
          <Route path="exams" element={<ExamListPage />} />
          <Route path="exams/:examId" element={<ExamDetailsPage />} />
          <Route path="exams/:examId/attendance" element={<AttendancePage />} />
          <Route path="exams/:examId/live" element={<LiveProctoringPage />} />
          <Route path="exams/:examId/replay" element={<ReplayTimelinePage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="model-card" element={<ModelDataCardPage />} />
          <Route path="institution" element={<InstitutionManagementPage />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
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
            
            {/* Shield Icon */}
            <div className="h-16 w-16 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/30 mb-6 shadow-[0_0_20px_rgba(139,92,246,0.3)] animate-pulse">
              <ShieldCheck size={36} />
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

