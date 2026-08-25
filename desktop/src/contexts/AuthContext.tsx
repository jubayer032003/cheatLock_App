import React, { createContext, useContext, useState, useEffect } from "react";
import { User, Exam, ExamSession, UserRole } from "../types";
import { getServerUrl, setApiAuthToken, setServerUrl } from "../api/client";
import { TokenManager } from "../services/TokenManager";
import { AuthenticationService } from "../services/AuthenticationService";
import { SessionService } from "../services/SessionService";
import { SocketService } from "../socket/service";
import { SecureStorageService } from "../services/SecureStorageService";

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
  login: (identifier: string, password: string, rememberMe: boolean, role: UserRole) => Promise<User>;
  signup: (name: string, identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateServerUrl: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      await TokenManager.initializeOnStart();
      const savedToken = await TokenManager.getToken();
      const savedUser = await TokenManager.getUser();

      if (savedToken && savedUser) {
        try {
          setApiAuthToken(savedToken);
          setToken(savedToken);
          setUser(savedUser);

          // Connect WebSockets in background
          SocketService.getInstance().connect(savedToken).catch((err) => {
            console.warn("[Auth] Background socket connection failed on startup:", err);
          });

          // Validate token with server to check if it's still alive
          const validatedUser = await AuthenticationService.getCurrentUser();
          setUser(validatedUser);
          await TokenManager.saveUser(validatedUser);

          if (validatedUser.role === "STUDENT") {
            // Check if there is an active session in progress (crash recovery check)
            const session = await SessionService.getActiveSession();
            if (session && session.status === "IN_PROGRESS") {
              const exam = await SessionService.getAssignedExam();
              setActiveExam(exam);
              setActiveSession(session);
              setHasRestoredSession(true);
            }
          }
        } catch (err) {
          console.warn("[Auth] Auto-login or session recovery failed:", err);
          await logout();
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

  const login = async (identifier: string, password: string, rememberMe: boolean, role: UserRole): Promise<User> => {
    setLoading(true);
    try {
      const data = await AuthenticationService.login(identifier, password, role);
      
      setToken(data.token);
      setApiAuthToken(data.token);
      setUser(data.user);
      await TokenManager.saveToken(data.token, rememberMe);
      await TokenManager.saveUser(data.user);

      // Connect Socket.IO in background
      SocketService.getInstance().connect(data.token).catch((err) => {
        console.warn("[Auth] Background socket connection failed on login:", err);
      });
      
      // Check for active session recovery immediately after login
      try {
        if (data.user.role === "STUDENT") {
          const session = await SessionService.getActiveSession();
          if (session && session.status === "IN_PROGRESS") {
            const exam = await SessionService.getAssignedExam();
            setActiveExam(exam);
            setActiveSession(session);
            setHasRestoredSession(true);
          }
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
      setApiAuthToken(data.token);
      setUser(data.user);
      await TokenManager.saveToken(data.token, true);
      await TokenManager.saveUser(data.user);

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

  const logout = async () => {
    const currentUser = user;
    setUser(null);
    setToken(null);
    setApiAuthToken(null);
    setActiveExam(null);
    setActiveSession(null);
    setHasRestoredSession(false);
    await TokenManager.clear();
    if (currentUser?.identifier) {
      await SecureStorageService.delete(`cheatlock.face_descriptor.${currentUser.identifier.trim().toLowerCase()}`);
      localStorage.removeItem(`cheatlock_face_descriptor_${currentUser.identifier}`);
    }
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
