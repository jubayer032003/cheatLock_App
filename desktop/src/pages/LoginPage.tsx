import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { ShieldCheck, Settings, Server, Eye, EyeOff, UserPlus, LogIn, Lock } from "lucide-react";
import { invoke, isTauriAvailable } from "../utils/tauri";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants } from "../motion/variants";

type AuthTab = "login" | "signup";

export function LoginPage() {
  const { login, signup, serverUrl, updateServerUrl } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  // Login form state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupIdentifier, setSignupIdentifier] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Shared state
  const [showSettings, setShowSettings] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(serverUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError("Roll ID / Email and password are required.");
      showToast("Roll ID and password are required.", "warning");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      await login(identifier, password, rememberMe);
      showToast("Session initialized successfully.", "success");
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err.message || "Invalid credentials.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!signupIdentifier.trim()) {
      setError("Student Roll ID is required.");
      return;
    }
    if (!signupPassword) {
      setError("Password is required.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      await signup(signupName.trim(), signupIdentifier.trim(), signupPassword);
      showToast("Account created successfully! Welcome to CheatLock.", "success");
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err.message || "Signup failed.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsLoading(true);
    try {
      if (isTauriAvailable()) {
        const ping = await invoke<number>("check_network_latency", { url: tempServerUrl });
        updateServerUrl(tempServerUrl);
        showToast(`Server online. Ping: ${ping}ms`, "success");
      } else {
        updateServerUrl(tempServerUrl);
        showToast("Server URL updated successfully.", "success");
      }
      setShowSettings(false);
    } catch (err) {
      showToast("Specified host could not be verified.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError(null);
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-screen w-screen flex flex-col items-center justify-center bg-surface-base px-4 select-none relative overflow-hidden"
    >
      <div className="w-full max-w-[400px] flex flex-col gap-6 z-10">
        {/* Hero Branding */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
            <ShieldCheck size={28} strokeWidth={2} />
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50 font-sans">
              CheatLock
            </h1>
            <p className="text-sm text-zinc-500 mt-1 font-sans">
              Secure assessment platform
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="relative overflow-hidden bg-surface-raised border border-border p-6 rounded-xl">
          {/* Settings button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 z-10"
            title="Server Connection Configuration"
          >
            <Settings size={16} className={`transition-transform duration-150 ${showSettings ? "rotate-90" : ""}`} />
          </button>

          <AnimatePresence mode="wait">
            {showSettings ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-4 py-1"
              >
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Server size={14} className="text-accent" />
                  Connection Settings
                </h3>

                <Input
                  label="Backend Server URL"
                  value={tempServerUrl}
                  onChange={(e) => setTempServerUrl(e.target.value)}
                  placeholder="e.g. http://localhost:3000"
                  disabled={isLoading}
                />

                <div className="flex gap-2.5 mt-2">
                  <Button className="flex-1" onClick={handleSaveSettings} isLoading={isLoading}>
                    Save Settings
                  </Button>
                  <Button className="flex-1" variant="secondary" onClick={() => setShowSettings(false)} disabled={isLoading}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="auth"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-4"
              >
                {/* Tab Switcher */}
                <div className="flex rounded-lg bg-surface-base border border-border p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => switchTab("login")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all duration-150 ${
                      activeTab === "login"
                        ? "bg-surface-overlay text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <LogIn size={13} />
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab("signup")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all duration-150 ${
                      activeTab === "signup"
                        ? "bg-surface-overlay text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <UserPlus size={13} />
                    Sign Up
                  </button>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="px-3.5 py-2 bg-danger/10 border border-danger/20 text-danger rounded-md text-xs font-sans">
                    {error}
                  </div>
                )}

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                  {activeTab === "login" ? (
                    <motion.form
                      key="loginForm"
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -2 }}
                      transition={{ duration: 0.12 }}
                      onSubmit={handleLogin}
                      className="flex flex-col gap-4"
                    >
                      <Input
                        label="Student Roll ID or Email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. student-001"
                        disabled={isLoading}
                      />

                      <div className="relative">
                        <Input
                          label="Password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 bottom-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-zinc-400 select-none">
                        <input
                          type="checkbox"
                          id="rememberMe"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="accent-accent rounded border-border bg-surface-base cursor-pointer h-3.5 w-3.5"
                          disabled={isLoading}
                        />
                        <label htmlFor="rememberMe" className="cursor-pointer hover:text-zinc-200">
                          Remember my session on this device
                        </label>
                      </div>

                      <Button type="submit" isLoading={isLoading} className="w-full mt-1 gap-2">
                        <Lock size={14} />
                        Initialize Secure Session
                      </Button>

                      <p className="text-center text-xs text-zinc-500">
                        Don't have an account?{" "}
                        <button type="button" onClick={() => switchTab("signup")} className="text-accent hover:text-accent/80 underline underline-offset-2">
                          Create one here
                        </button>
                      </p>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="signupForm"
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -2 }}
                      transition={{ duration: 0.12 }}
                      onSubmit={handleSignup}
                      className="flex flex-col gap-3.5"
                    >
                      <Input
                        label="Full Name"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        placeholder="e.g. John Doe"
                        disabled={isLoading}
                      />

                      <Input
                        label="Student Roll ID or Email"
                        value={signupIdentifier}
                        onChange={(e) => setSignupIdentifier(e.target.value)}
                        placeholder="e.g. student-001"
                        disabled={isLoading}
                      />

                      <div className="relative">
                        <Input
                          label="Password"
                          type={showSignupPassword ? "text" : "password"}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Min. 6 characters"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute right-3.5 bottom-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      <Input
                        label="Confirm Password"
                        type="password"
                        value={signupConfirm}
                        onChange={(e) => setSignupConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        disabled={isLoading}
                      />

                      <Button type="submit" isLoading={isLoading} className="w-full mt-1 gap-2">
                        <UserPlus size={14} />
                        Create Student Account
                      </Button>

                      <p className="text-center text-xs text-zinc-500">
                        Already have an account?{" "}
                        <button type="button" onClick={() => switchTab("login")} className="text-accent hover:text-accent/80 underline underline-offset-2">
                          Sign in here
                        </button>
                      </p>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Footer */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-center font-mono text-[10px] text-zinc-600">
            CheatLock Desktop Client v1.0.0 &bull; Secure Environment Enabled
          </div>
          <div className="flex items-center gap-4 text-[10px] font-sans text-zinc-500">
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              AES-256 Encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              AI Proctored
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Kiosk Protected
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
