import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FaceVerificationPage } from "./pages/FaceVerificationPage";
import { ExamSessionPage } from "./pages/ExamSessionPage";
import { ProctoringCoreProvider } from "./contexts/ProctoringCoreProvider";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, hasRestoredSession } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05080e]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
        <p className="mt-4 text-slate-400 font-mono tracking-widest text-xs">SECURE CHANNEL INITIALIZING...</p>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Crash recovery check: force redirect back to active exam if session is in progress
  if (hasRestoredSession && location.pathname !== "/exam") {
    return <Navigate to="/exam" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <ProctoringCoreProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route
          path="/"
          element = {
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="face-verification" element={<FaceVerificationPage />} />
          <Route path="exam" element={<ExamSessionPage />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProctoringCoreProvider>
  );
}
