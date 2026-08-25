import React from "react";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./ToastContext";
import { SocketProvider } from "./SocketContext";
import { SuspicionProvider } from "./SuspicionContext";
import { CameraProvider } from "./CameraContext";
import { FaceProvider } from "./FaceContext";
import { LivenessProvider } from "./LivenessContext";
import { AudioProvider } from "./AudioContext";
import { ScreenProvider } from "./ScreenContext";
import { ObjectProvider } from "./ObjectContext";
import { SecurityProvider } from "./SecurityContext";

interface ProctoringCoreProviderProps {
  children: React.ReactNode;
}

/**
 * Lightweight app-wide providers. Exam monitoring providers are mounted only
 * around exam routes so the home page never initializes media/proctoring state.
 */
export function ProctoringCoreProvider({ children }: ProctoringCoreProviderProps) {
  return (
    <AuthProvider>
      <ToastProvider>
        <SocketProvider>{children}</SocketProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export function ExamMonitoringProvider({ children }: ProctoringCoreProviderProps) {
  return (
    <SuspicionProvider>
      <CameraProvider>
        <FaceProvider>
          <LivenessProvider>
            <AudioProvider>
              <ScreenProvider>
                <ObjectProvider>
                  <SecurityProvider>{children}</SecurityProvider>
                </ObjectProvider>
              </ScreenProvider>
            </AudioProvider>
          </LivenessProvider>
        </FaceProvider>
      </CameraProvider>
    </SuspicionProvider>
  );
}
