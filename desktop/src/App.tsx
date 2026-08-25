import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { TeacherHomePage } from "./pages/TeacherHomePage";
import { FaceVerificationPage } from "./pages/FaceVerificationPage";
import { ExamSessionPage } from "./pages/ExamSessionPage";
import { ExamMonitoringProvider, ProctoringCoreProvider } from "./contexts/ProctoringCoreProvider";
import { StudentAppShell } from "./layouts/StudentAppShell";
import {
  LOGIN_ROUTE,
  STUDENT_HOME_ROUTE,
  getDefaultRouteForRole,
  resolveAuthenticatedRouteAccess,
  resolveStudentExamRouteAccess,
  resolveStudentConsentRouteAccess,
  resolveStudentRouteAccess,
  resolveStudentSessionRouteAccess,
  resolveTeacherRouteAccess,
  studentExamReadinessRoute,
  studentExamSessionRoute,
  studentExamVerificationRoute,
} from "./routes/studentRoutes";
import type { RouteAuthState } from "./types";
import {
  StudentExamRulesPage,
  StudentExamSubmittedPage,
  StudentHistoryPage,
  StudentProfilePage,
  StudentSupportPage,
} from "./pages/student/StudentShellPages";
import { StudentHomePage } from "./pages/student/StudentHomePage";
import { StudentExamDetailsPage } from "./pages/student/StudentExamDetailsPage";
import { StudentExamPreparationPage } from "./pages/student/StudentExamPreparationPage";
import { EXAM_CONSENT_POLICY_VERSION } from "./config/consentPolicy";
import { ExamPreparationStateService } from "./services/ExamPreparationStateService";
import { IdentityVerificationService } from "./services/IdentityVerificationService";
import { IDENTITY_VERIFICATION_POLICY_VERSION } from "./config/identityVerification";
import { attemptIdFromSession } from "./services/ExamPreparationStateService";
import { ENABLE_DEV_SCREEN_DIAGNOSTICS } from "./config/devFeatures";
import { NativeScreenDiagnosticsPage } from "./pages/NativeScreenDiagnosticsPage";

function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05080e]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
      <p className="mt-4 text-slate-400 font-mono tracking-widest text-xs">SECURE CHANNEL INITIALIZING...</p>
    </div>
  );
}

function useRouteAuthState(): RouteAuthState {
  const { isAuthenticated, loading, user, activeExam } = useAuth();
  if (loading) return { status: "loading" };
  if (!isAuthenticated || !user) return { status: "anonymous" };
  return { status: "authenticated", role: user.role, studentId: user.identifier, activeExamId: activeExam?.id ?? null };
}

function RouteDecisionBoundary({
  decision,
  children,
}: {
  decision: ReturnType<typeof resolveAuthenticatedRouteAccess>;
  children: React.ReactNode;
}) {
  if (decision.type === "loading") return <LoadingScreen />;
  if (decision.type === "redirect") return <Navigate to={decision.to} replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { hasRestoredSession, user } = useAuth();
  const location = useLocation();
  const auth = useRouteAuthState();
  
  const decision = resolveAuthenticatedRouteAccess(auth);
  if (decision.type !== "allow") return <RouteDecisionBoundary decision={decision}>{children}</RouteDecisionBoundary>;

  // Crash recovery check: force redirect back to active exam if session is in progress
  if (user?.role === "STUDENT" && hasRestoredSession) {
    const activeExamId = auth.status === "authenticated" ? auth.activeExamId : null;
    const restoredReadinessRoute = activeExamId ? studentExamReadinessRoute(activeExamId) : STUDENT_HOME_ROUTE;
    if (activeExamId && location.pathname !== restoredReadinessRoute) {
      return <Navigate to={restoredReadinessRoute} replace />;
    }
  }
  
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={getDefaultRouteForRole(user?.role)} replace />;
}

function StudentRoute({ children }: { children: React.ReactNode }) {
  return (
    <RouteDecisionBoundary decision={resolveStudentRouteAccess(useRouteAuthState())}>
      {children}
    </RouteDecisionBoundary>
  );
}

function TeacherRoute({ children }: { children: React.ReactNode }) {
  return (
    <RouteDecisionBoundary decision={resolveTeacherRouteAccess(useRouteAuthState())}>
      {children}
    </RouteDecisionBoundary>
  );
}

function StudentExamRoute({ children }: { children: React.ReactNode }) {
  const params = useParams<"examId">();
  return (
    <RouteDecisionBoundary decision={resolveStudentExamRouteAccess(useRouteAuthState(), params)}>
      {children}
    </RouteDecisionBoundary>
  );
}

function StudentExamSessionRoute({ children }: { children: React.ReactNode }) {
  const params = useParams<"examId">();
  const { user, activeExam, activeSession } = useAuth();
  const auth = useRouteAuthState();
  const examDecision = resolveStudentSessionRouteAccess(auth, params);
  if (examDecision.type !== "allow") {
    return <RouteDecisionBoundary decision={examDecision}>{children}</RouteDecisionBoundary>;
  }
  const examId = params.examId!;
  const rawPolicy = activeExam as unknown as { monitoringPolicy?: { requireIdentityVerification?: boolean } } | null;
  const requiresIdentity = rawPolicy?.monitoringPolicy?.requireIdentityVerification ?? true;
  if (requiresIdentity && user && activeSession?.deviceId) {
    const attemptId = attemptIdFromSession(activeSession);
    const valid = attemptId && IdentityVerificationService.hasValidVerification({
      studentId: user.identifier,
      examId,
      attemptId,
      deviceId: activeSession.deviceId,
      verificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
    });
    if (!valid) return <Navigate to={studentExamVerificationRoute(examId)} replace />;
  } else if (requiresIdentity) {
    return <Navigate to={studentExamVerificationRoute(examId)} replace />;
  }
  return (
    <>{children}</>
  );
}

function StudentConsentProtectedRoute({ children }: { children: React.ReactNode }) {
  const params = useParams<"examId">();
  return (
    <RouteDecisionBoundary
      decision={resolveStudentConsentRouteAccess(useRouteAuthState(), params, ({ studentId, examId }) =>
        ExamPreparationStateService.hasValidConsent({
          studentId,
          examId,
          consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
        })
      )}
    >
      {children}
    </RouteDecisionBoundary>
  );
}

function LegacyStudentExamRedirect({ target }: { target: "verification" | "session" }) {
  const { activeExam } = useAuth();
  if (!activeExam?.id) {
    return <Navigate to={STUDENT_HOME_ROUTE} replace />;
  }

  return (
    <Navigate
      to={target === "verification" ? studentExamVerificationRoute(activeExam.id) : studentExamSessionRoute(activeExam.id)}
      replace
    />
  );
}

export default function App() {
  return (
    <ProctoringCoreProvider>
      <Routes>
        <Route path={LOGIN_ROUTE} element={<LoginPage />} />
        
        <Route
          path="/"
          element = {
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<Navigate to={STUDENT_HOME_ROUTE} replace />} />
          <Route path="face-verification" element={<StudentRoute><LegacyStudentExamRedirect target="verification" /></StudentRoute>} />
          <Route path="exam" element={<StudentRoute><LegacyStudentExamRedirect target="session" /></StudentRoute>} />

          <Route path="student" element={<StudentRoute><StudentAppShell /></StudentRoute>}>
            <Route index element={<Navigate to={STUDENT_HOME_ROUTE} replace />} />
            <Route path="home" element={<StudentHomePage />} />
            <Route path="history" element={<StudentHistoryPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="support" element={<StudentSupportPage />} />
            <Route path="exams/:examId" element={<StudentExamRoute><StudentExamDetailsPage /></StudentExamRoute>} />
            <Route path="exams/:examId/readiness" element={<StudentExamRoute><StudentExamPreparationPage /></StudentExamRoute>} />
            <Route
              path="exams/:examId/verification"
              element={<StudentConsentProtectedRoute><ExamMonitoringProvider><FaceVerificationPage /></ExamMonitoringProvider></StudentConsentProtectedRoute>}
            />
            <Route path="exams/:examId/rules" element={<StudentConsentProtectedRoute><StudentExamRulesPage /></StudentConsentProtectedRoute>} />
            <Route
              path="exams/:examId/session"
              element={<StudentConsentProtectedRoute><StudentExamSessionRoute><ExamMonitoringProvider><ExamSessionPage /></ExamMonitoringProvider></StudentExamSessionRoute></StudentConsentProtectedRoute>}
            />
            <Route path="exams/:examId/submitted" element={<StudentExamRoute><StudentExamSubmittedPage /></StudentExamRoute>} />
          </Route>

          <Route path="teacher" element={<TeacherRoute><TeacherHomePage /></TeacherRoute>} />
          {ENABLE_DEV_SCREEN_DIAGNOSTICS && (
            <Route path="dev/screen-capture-diagnostics" element={<NativeScreenDiagnosticsPage />} />
          )}
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProctoringCoreProvider>
  );
}
