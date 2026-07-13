import React, { createContext, useContext, useState, useEffect } from "react";
import { SocketService } from "../socket/service";
import { useAuth } from "./AuthContext";

type SocketStatus = "Connected" | "Disconnected" | "Connecting" | "Reconnect pending";

interface SocketContextType {
  status: SocketStatus;
  emit: (event: string, payload: any) => Promise<any>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SocketStatus>("Disconnected");
  const socketService = SocketService.getInstance();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setStatus("Disconnected");
      socketService.disconnect();
      return;
    }

    const timer = setTimeout(() => {
      setStatus("Connecting");
      socketService
        .connect(token)
        .then((socket) => {
          setStatus("Connected");

          socket.on("disconnect", (reason) => {
            if (reason === "io server disconnect") {
              // Reconnection must be manual
              setStatus("Disconnected");
            } else {
              setStatus("Reconnect pending");
            }
          });

          socket.on("connect", () => {
            setStatus("Connected");
          });
        })
        .catch(() => {
          setStatus("Reconnect pending");
        });
    }, 50);

    return () => {
      clearTimeout(timer);
      socketService.disconnect();
    };
  }, [token, isAuthenticated]);

  const emit = (event: string, payload: any) => {
    return socketService.emit(event, payload);
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    socketService.on(event, callback);
  };

  const off = (event: string, callback: (...args: any[]) => void) => {
    socketService.off(event, callback);
  };

  return (
    <SocketContext.Provider value={{ status, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used inside a SocketProvider");
  }
  return context;
}
