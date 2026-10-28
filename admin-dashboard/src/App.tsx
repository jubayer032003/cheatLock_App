import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminShell } from "./components/AdminShell";
import { AccessDeniedPage } from "./pages/AccessDeniedPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { canEnterAdminDashboard } from "./lib/adminAccess";
import { getAuthUser, isAdminAuthenticated } from "./lib/auth";

const QuestionBankAdminPage = lazy(() => import("./pages/QuestionBankAdminPage").then((module) => ({ default: module.QuestionBankAdminPage })));

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const user = getAuthUser();

  if (user && !canEnterAdminDashboard(user)) {
    return <Navigate to="/access-denied" replace />;
  }

  if (!user || !isAdminAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        path="/"
        element={
          <ProtectedAdminRoute>
            <AdminShell />
          </ProtectedAdminRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="academic" element={<RouteFallback><QuestionBankAdminPage initialTrack="academic" /></RouteFallback>} />
        <Route path="admission" element={<RouteFallback><QuestionBankAdminPage initialTrack="admission" /></RouteFallback>} />
        <Route path="questions" element={<RouteFallback><QuestionBankAdminPage mode="questions" /></RouteFallback>} />
        <Route path="import" element={<RouteFallback><QuestionBankAdminPage mode="import" /></RouteFallback>} />
        <Route path="profile" element={<DashboardPage />} />
        <Route path="settings" element={<DashboardPage />} />
        <Route path="question-bank" element={<Navigate to="/questions" replace />} />
        <Route path="question-bank/hierarchy" element={<Navigate to="/academic" replace />} />
        <Route path="question-bank/questions/new" element={<RouteFallback><QuestionBankAdminPage mode="new" /></RouteFallback>} />
        <Route path="question-bank/questions/:questionId/edit" element={<RouteFallback><QuestionBankAdminPage mode="edit" /></RouteFallback>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function RouteFallback({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="surface-card grid min-h-72 place-items-center p-6 text-center" role="status" aria-live="polite">
          <div>
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent motion-safe:animate-spin" />
            <p className="font-semibold text-slate-900 dark:text-white">Loading admin workspace</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Preparing central operations.</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
