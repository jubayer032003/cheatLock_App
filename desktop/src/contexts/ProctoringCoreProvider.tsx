import React from "react";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./ToastContext";
import { SuspicionProvider } from "./SuspicionContext";
import { CameraProvider } from "./CameraContext";
import { FaceProvider } from "./FaceContext";
import { LivenessProvider } from "./LivenessContext";
import { AudioProvider } from "./AudioContext";
import { ScreenProvider } from "./ScreenContext";
import { ObjectProvider } from "./ObjectContext";
import { SecurityProvider } from "./SecurityContext";
import { SocketProvider } from "./SocketContext";

interface ProctoringCoreProviderProps {
  children: React.ReactNode;
}

/**
 * Consolidates all 11 nested context providers into a single component wrapper,
 * eliminating the "Provider Nesting" anti-pattern in the main App entry point.
 */
export function ProctoringCoreProvider({ children }: ProctoringCoreProviderProps) {
  return (
    <AuthProvider>
      <ToastProvider>
        <SuspicionProvider>
          <CameraProvider>
            <FaceProvider>
              <LivenessProvider>
                <AudioProvider>
                  <ScreenProvider>
                    <ObjectProvider>
                      <SecurityProvider>
                        <SocketProvider>
                          {children}
                        </SocketProvider>
                      </SecurityProvider>
                    </ObjectProvider>
                  </ScreenProvider>
                </AudioProvider>
              </LivenessProvider>
            </FaceProvider>
          </CameraProvider>
        </SuspicionProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
