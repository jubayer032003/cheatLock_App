import React, { createContext, useContext, useState, useEffect } from "react";
import { User, Exam, ExamSession } from "../types";
import { getServerUrl, setServerUrl } from "../api/client";
import { TokenManager } from "../services/TokenManager";
import { AuthenticationService } from "../services/AuthenticationService";
import { SessionService } from "../services/SessionService";
import { SocketService } from "../socket/service";

interface AuthContextType {
  user: User | null;
  token: string | null;
  serverUrl: string;
  isAuthenticated: boolean;
  loading: boolean;
  activeExam: Exam | null;
  activeSession: ExamSession | null;
  hasRestoredSession: boolean;
  setActiveExam: (exam: Exam | null) => void;
  setActiveSession: (session: ExamSession | null) => void;
  setHasRestoredSession: (val: boolean) => void;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<User>;
  signup: (name: string, identifier: string, password: string) => Promise<User>;
  logout: () => void;
  updateServerUrl: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Purge temporary tokens on fresh application startup if rememberMe is false
TokenManager.initializeOnStart();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>(getServerUrl());
  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeSession, setActiveSession] = useState<ExamSession | null>(null);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);

  useEffect(() => {
    async function initSession() {
      const savedToken = TokenManager.getToken();
      const savedUser = TokenManager.getUser();

      if (savedToken && savedUser) {
        try {
          setToken(savedToken);
          setUser(savedUser);

          // Connect WebSockets in background
          SocketService.getInstance().connect(savedToken).catch((err) => {
            console.warn("[Auth] Background socket connection failed on startup:", err);
          });

          // Validate token with server to check if it's still alive
          const validatedUser = await AuthenticationService.getCurrentUser();
          setUser(validatedUser);
          TokenManager.saveUser(validatedUser);

          // Check if there is an active session in progress (crash recovery check)
          const session = await SessionService.getActiveSession();
          if (session && session.status === "IN_PROGRESS") {
            const exam = await SessionService.getAssignedExam();
            setActiveExam(exam);
            setActiveSession(session);
            setHasRestoredSession(true);
          }
        } catch (err) {
          console.warn("[Auth] Auto-login or session recovery failed:", err);
          logout();
        }
      }
      setLoading(false);
    }
    initSession();

    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener("cheatlock_unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("cheatlock_unauthorized", handleUnauthorized);
    };
  }, []);

  const login = async (identifier: string, password: string, rememberMe: boolean): Promise<User> => {
    setLoading(true);
    try {
      const data = await AuthenticationService.login(identifier, password);
      
      setToken(data.token);
      setUser(data.user);
      TokenManager.saveToken(data.token, rememberMe);
      TokenManager.saveUser(data.user);

      // Connect Socket.IO in background
      SocketService.getInstance().connect(data.token).catch((err) => {
        console.warn("[Auth] Background socket connection failed on login:", err);
      });
      
      // Check for active session recovery immediately after login
      try {
        const session = await SessionService.getActiveSession();
        if (session && session.status === "IN_PROGRESS") {
          const exam = await SessionService.getAssignedExam();
          setActiveExam(exam);
          setActiveSession(session);
          setHasRestoredSession(true);
        }
      } catch (err) {
        console.warn("[Auth] Session recovery check after login skipped:", err);
      }

      setLoading(false);
      return data.user;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signup = async (name: string, identifier: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const data = await AuthenticationService.signup(name, identifier, password);

      setToken(data.token);
      setUser(data.user);
      TokenManager.saveToken(data.token, true);
      TokenManager.saveUser(data.user);

      // Connect Socket.IO in background
      SocketService.getInstance().connect(data.token).catch((err) => {
        console.warn("[Auth] Background socket connection failed on signup:", err);
      });

      setLoading(false);
      return data.user;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setActiveExam(null);
    setActiveSession(null);
    setHasRestoredSession(false);
    TokenManager.clear();
    SocketService.getInstance().disconnect();
  };

  const updateServerUrl = (url: string) => {
    setServerUrl(url);
    setServerUrlState(getServerUrl());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        serverUrl,
        isAuthenticated: !!token,
        loading,
        activeExam,
        activeSession,
        hasRestoredSession,
        setActiveExam,
        setActiveSession,
        setHasRestoredSession,
        login,
        signup,
        logout,
        updateServerUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
