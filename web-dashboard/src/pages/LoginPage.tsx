import { FormEvent, useState } from "react";
import { Activity, Eye, EyeOff, LockKeyhole, ShieldCheck, Mail, User, Building } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginTeacher } from "../lib/api";
import { saveAuth } from "../lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSignupMode, setIsSignupMode] = useState(false);
  
  // Input fields state
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Signup-specific fields state
  const [institutionName, setInstitutionName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Transition overlay state
  const [isNavigating, setIsNavigating] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>, isSignupForm: boolean) {
    event.preventDefault();
    setError("");

    if (isSignupForm) {
      setError("Teacher accounts must be created by an administrator. Please sign in with an assigned account.");
      return;
    }

    setLoading(true);

    try {
      const data = await loginTeacher(identifier, password);
      saveAuth(data.token, data.user);
      const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
      
      setIsNavigating(true);
      // Dispatch custom event to trigger transition globally
      const event = new CustomEvent("cheatlock-login-success", {
        detail: { nextPath }
      });
      window.dispatchEvent(event);

    } catch (err) {
      setError(readErrorMessage(err, isSignupForm));
      setLoading(false);
    }
  }

  return (
    <>
      {/* ---------- Custom 3D animations and styles ---------- */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 5px rgba(139, 92, 246, 0.3); }
          50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.7); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes particle {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .stagger-1 { animation-delay: 0.1s; opacity: 0; }
        .stagger-2 { animation-delay: 0.2s; opacity: 0; }
        .stagger-3 { animation-delay: 0.3s; opacity: 0; }
        .stagger-4 { animation-delay: 0.4s; opacity: 0; }
        .stagger-5 { animation-delay: 0.5s; opacity: 0; }
        .particle {
          position: absolute;
          width: 6px;
          height: 6px;
          background: rgba(139, 92, 246, 0.45);
          border-radius: 50%;
          animation: particle linear infinite;
        }

        /* Perspective and 3D flip wrappers */
        .perspective-1500 {
          perspective: 1500px;
          perspective-origin: center;
        }
        .preserve-3d {
          transform-style: preserve-3d;
          -webkit-transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }

        /* 3D floating layers */
        .translate-z-lg { transform: translateZ(45px); }
        .translate-z-md { transform: translateZ(30px); }
        .translate-z-sm { transform: translateZ(15px); }

        /* 3D Scrolling Grid Background */
        .grid-3d-container {
          position: absolute;
          inset: 0;
          overflow: hidden;
          perspective: 800px;
          perspective-origin: 50% 60%;
          z-index: 0;
          pointer-events: none;
        }
        .grid-3d-surface {
          position: absolute;
          width: 300vw;
          height: 300vh;
          top: -100vh;
          left: -100vw;
          background-image: 
            linear-gradient(to right, rgba(139, 92, 246, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(139, 92, 246, 0.08) 1px, transparent 1px);
          background-size: 60px 60px;
          transform: rotateX(75deg) translateZ(-60px);
          animation: grid-advance 15s linear infinite;
          transform-origin: center center;
        }
        .grid-fade-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, transparent 20%, #f5f6fa 85%);
          z-index: 1;
        }
        html.dark .grid-fade-overlay {
          background: radial-gradient(circle at 50% 50%, transparent 20%, #0b0f19 85%);
        }
        
        @keyframes grid-advance {
          0% {
            transform: rotateX(75deg) translateZ(-60px) translateY(0);
          }
          100% {
            transform: rotateX(75deg) translateZ(-60px) translateY(60px);
          }
        }

        /* 3D split doors animations */
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

        /* Torch scanner light sweep */
        .animate-sweep {
          animation: sweep 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes sweep {
          0% {
            left: -50%;
          }
          100% {
            left: 150%;
          }
        }

        /* Text reveal details */
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
        @media (prefers-reduced-motion: reduce) {
          .animate-float,
          .animate-pulse-glow,
          .animate-fade-in-up,
          .animate-fade-in,
          .animate-sweep,
          .animate-reveal-text,
          .animate-reveal-sub,
          .particle,
          .grid-3d-surface,
          .logo-animate {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <main className="app-background relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 perspective-1500">
        {/* ---------- Advanced 3D Cyber Grid Background ---------- */}
        <div className="grid-3d-container">
          <div className="grid-3d-surface" />
          <div className="grid-fade-overlay" />
        </div>


        {/* ---------- Animated background particles ---------- */}
        <div className="pointer-events-none absolute inset-0 z-0">
          {[...Array(25)].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDuration: `${10 + Math.random() * 15}s`,
                animationDelay: `${Math.random() * 5}s`,
                width: `${3 + Math.random() * 6}px`,
                height: `${3 + Math.random() * 6}px`,
              }}
            />
          ))}
        </div>

        {/* ---------- Flip Container (Static under Mouse) ---------- */}
        <div 
          className="relative w-full max-w-6xl z-10 preserve-3d transition-all duration-500 ease-in-out"
          style={{
            transform: isSignupMode ? "rotateY(180deg)" : "rotateY(0deg)",
            transformStyle: "preserve-3d",
            opacity: isNavigating ? 0 : 1,
            pointerEvents: isNavigating ? "none" : "auto",
          }}
        >
          {/* ==================== FRONT CARD: LOGIN FORM ==================== */}
          <div 
            className="backface-hidden w-full preserve-3d"
            style={{
              transform: "rotateY(0deg)",
              position: isSignupMode ? "absolute" : "relative",
              top: 0,
              left: 0,
              opacity: isSignupMode ? 0 : 1,
              pointerEvents: isSignupMode ? "none" : "auto",
              transition: "opacity 0.6s ease",
              transformStyle: "preserve-3d",
            }}
          >
            <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/[0.08] dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_64px_-16px_rgba(15,23,42,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)] dark:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.06)] backdrop-blur-3xl lg:grid lg:grid-cols-[4fr_6fr] preserve-3d">
              {/* Left Panel */}
              <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b0f19]/80 via-[#1e1b4b]/70 to-[#3b0764]/70 p-8 text-white lg:p-10 preserve-3d border-r border-white/10">
                <div className="absolute inset-0 opacity-20">
                  <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_20%,black_40%,transparent_100%)]" />
                </div>
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-indigo-600/20 blur-3xl" />

                <div className="relative z-10 preserve-3d">
                  <div className="flex items-center gap-3.5 animate-fade-in-up translate-z-md">
                    <div className="logo-animate flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#020617] ring-1 ring-white/20 backdrop-blur shadow-md">
                      <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-violet-300 leading-none">CheatLock</p>
                      <p className="mt-1.5 text-sm font-bold text-white leading-none">Security Suite</p>
                    </div>
                  </div>

                  <h1 className="mt-8 max-w-xl animate-fade-in-up stagger-1 text-3xl font-bold leading-tight tracking-tight lg:text-4xl translate-z-sm">
                    Manage Exams
                    <span className="block text-violet-300">Securely</span>
                  </h1>
                  <p className="mt-4 max-w-xl animate-fade-in-up stagger-2 text-sm leading-relaxed text-slate-300 translate-z-sm">
                    Monitor, supervise and protect your online examinations with AI-powered proctoring.
                  </p>

                  {/* 3D Holographic AI Scanner Graphic */}
                  <div 
                    className="relative mt-8 flex h-60 w-full items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md"
                    style={{ transform: "perspective(800px) rotateX(20deg) rotateY(-10deg) translateZ(40px)", transformStyle: "preserve-3d" }}
                  >
                    <div className="absolute w-full h-[1px] bg-white/5" />
                    <div className="absolute h-full w-[1px] bg-white/5" />
                    <div className="absolute h-[220px] w-[220px] rounded-full border border-white/5" />
                    <div className="absolute h-[160px] w-[160px] rounded-full border border-violet-500/20" />
                    <div className="absolute h-[100px] w-[100px] rounded-full border border-indigo-500/20" />

                    <div className="absolute h-[160px] w-[160px] rounded-full overflow-hidden">
                      <div className="h-full w-full rounded-full bg-gradient-to-tr from-transparent via-transparent to-violet-500/20 animate-spin [animation-duration:4s]" />
                    </div>

                    <div className="absolute h-2 w-2 rounded-full bg-violet-400/80 blur-[0.5px] animate-ping" style={{ top: '35%', left: '28%', transform: 'translateZ(10px)' }} />
                    <div className="absolute h-1.5 w-1.5 rounded-full bg-indigo-400/80" style={{ top: '65%', right: '25%', transform: 'translateZ(10px)' }} />
                    <div className="absolute h-1 w-1 rounded-full bg-violet-300/60" style={{ bottom: '20%', left: '45%', transform: 'translateZ(10px)' }} />

                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.12)_0%,transparent_70%)] animate-pulse" />
                    <div className="absolute h-[160px] w-[160px] rounded-full border border-dashed border-violet-500/30 animate-spin [animation-duration:25s]" />
                    <div className="absolute h-[100px] w-[100px] rounded-full border border-double border-indigo-500/30 animate-spin [animation-duration:12s] [animation-direction:reverse]" />

                    <div className="absolute flex flex-col items-center justify-center text-center z-10 translate-z-md">
                      <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 border border-violet-500/40 logo-animate">
                        <ShieldCheck size={20} />
                      </div>
                      <span className="mt-2 text-[9px] font-bold tracking-widest text-violet-300 uppercase">AI SCANNING ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-8 animate-fade-in-up stagger-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur translate-z-sm">
                  <p className="text-xs font-semibold text-violet-200">CheatLock Security Protocol</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    This dashboard uses authenticated access and encrypted transport. Proctoring logs and session evidence may be collected for instructor review.
                  </p>
                </div>
              </div>

              {/* Right Panel */}
              <div className="flex items-center p-6 sm:p-10 z-10 preserve-3d">
                <div className="w-full preserve-3d">
                  {/* Mobile Logo Header */}
                  <div className="flex flex-col items-center mb-6 lg:hidden animate-fade-in-up stagger-1 translate-z-md">
                    <div className="logo-animate flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-cyan-300/40 bg-[#020617]">
                      <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
                    </div>
                    <h1 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">CheatLock</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">AI Exam Monitoring Platform</p>
                  </div>

                  {/* Form Title */}
                  <div className="mb-6 animate-fade-in-up stagger-1 translate-z-md">
                    <h2 className="text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                      Teacher Sign In
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                      Sign in to continue supervising live assessments.
                    </p>
                  </div>

                  <form className="space-y-4 preserve-3d" onSubmit={(e) => handleSubmit(e, false)}>
                    {/* Email */}
                    <div className="animate-fade-in-up stagger-2 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Email Address</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <Mail size={16} />
                          </span>
                          <input
                            type="email"
                            className="field-input pl-10 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            placeholder="examiner@institution.edu"
                            required
                          />
                        </div>
                      </label>
                    </div>

                    {/* Password */}
                    <div className="animate-fade-in-up stagger-3 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Password</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <LockKeyhole size={16} />
                          </span>
                          <input
                            className="field-input pl-10 pr-12 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••••••"
                            required
                          />
                          <button
                            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            title={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </div>

                    {/* Account recovery is administrator-managed in V1. */}
                    <div className="animate-fade-in-up stagger-3 text-sm text-slate-500 dark:text-slate-400 translate-z-sm">
                      Contact your institution administrator if you cannot access your account.
                    </div>

                    {error && !isSignupMode && (
                      <div className="animate-fade-in rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                        {error}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      className={`animate-fade-in-up stagger-4 primary-button relative h-12 w-full overflow-hidden transition-all duration-300 translate-z-md ${
                        loading ? "cursor-wait opacity-90" : "hover:shadow-lg hover:shadow-violet-500/25"
                      }`}
                      disabled={loading}
                      type="submit"
                    >
                      <span className={`flex items-center justify-center gap-2 transition-opacity ${loading ? "opacity-0" : "opacity-100"}`}>
                        Sign In
                      </span>
                      {loading && (
                        <span className="absolute inset-0 flex items-center justify-center bg-violet-600">
                          <Activity size={18} className="animate-spin text-white" />
                          <span className="ml-2 text-sm font-medium">Verifying Credentials...</span>
                        </span>
                      )}
                    </button>
                  </form>

                  {/* Toggle Link */}
                  <div className="mt-6 text-center animate-fade-in-up stagger-4 text-sm text-slate-600 dark:text-slate-400 translate-z-sm">
                    <span>
                      Need a teacher account? Ask your institution administrator to create one.
                    </span>
                  </div>

                  {/* Bottom footer tag */}
                  <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 animate-fade-in-up stagger-5 uppercase tracking-widest font-semibold translate-z-sm">
                    Secure Exam Monitoring Platform
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ==================== BACK CARD: SIGNUP FORM ==================== */}
          <div 
            className="backface-hidden w-full preserve-3d rotate-y-180"
            style={{
              transform: "rotateY(180deg)",
              position: isSignupMode ? "relative" : "absolute",
              top: 0,
              left: 0,
              opacity: isSignupMode ? 1 : 0,
              pointerEvents: isSignupMode ? "auto" : "none",
              transition: "opacity 0.6s ease",
              transformStyle: "preserve-3d",
            }}
          >
            <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/[0.08] dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_64px_-16px_rgba(15,23,42,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)] dark:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.06)] backdrop-blur-3xl lg:grid lg:grid-cols-[4fr_6fr] preserve-3d">
              {/* Left Panel */}
              <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b0f19]/80 via-[#1e1b4b]/70 to-[#3b0764]/70 p-8 text-white lg:p-10 preserve-3d border-r border-white/10">
                <div className="absolute inset-0 opacity-20">
                  <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_20%,black_40%,transparent_100%)]" />
                </div>
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-indigo-600/20 blur-3xl" />

                <div className="relative z-10 preserve-3d">
                  <div className="flex items-center gap-3.5 animate-fade-in-up translate-z-md">
                    <div className="logo-animate flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#020617] ring-1 ring-white/20 backdrop-blur shadow-md">
                      <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-violet-300 leading-none">CheatLock</p>
                      <p className="mt-1.5 text-sm font-bold text-white leading-none">Security Suite</p>
                    </div>
                  </div>

                  <h1 className="mt-8 max-w-xl animate-fade-in-up stagger-1 text-3xl font-bold leading-tight tracking-tight lg:text-4xl translate-z-sm">
                    Manage Exams
                    <span className="block text-violet-300">Securely</span>
                  </h1>
                  <p className="mt-4 max-w-xl animate-fade-in-up stagger-2 text-sm leading-relaxed text-slate-300 translate-z-sm">
                    Monitor, supervise and protect your online examinations with AI-powered proctoring.
                  </p>

                  {/* 3D Holographic AI Scanner Graphic */}
                  <div 
                    className="relative mt-8 flex h-60 w-full items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md"
                    style={{ transform: "perspective(800px) rotateX(20deg) rotateY(-10deg) translateZ(40px)", transformStyle: "preserve-3d" }}
                  >
                    <div className="absolute w-full h-[1px] bg-white/5" />
                    <div className="absolute h-full w-[1px] bg-white/5" />
                    <div className="absolute h-[220px] w-[220px] rounded-full border border-white/5" />
                    <div className="absolute h-[160px] w-[160px] rounded-full border border-violet-500/20" />
                    <div className="absolute h-[100px] w-[100px] rounded-full border border-indigo-500/20" />

                    <div className="absolute h-[160px] w-[160px] rounded-full overflow-hidden">
                      <div className="h-full w-full rounded-full bg-gradient-to-tr from-transparent via-transparent to-violet-500/20 animate-spin [animation-duration:4s]" />
                    </div>

                    <div className="absolute h-2 w-2 rounded-full bg-violet-400/80 blur-[0.5px] animate-ping" style={{ top: '35%', left: '28%', transform: 'translateZ(10px)' }} />
                    <div className="absolute h-1.5 w-1.5 rounded-full bg-indigo-400/80" style={{ top: '65%', right: '25%', transform: 'translateZ(10px)' }} />
                    <div className="absolute h-1 w-1 rounded-full bg-violet-300/60" style={{ bottom: '20%', left: '45%', transform: 'translateZ(10px)' }} />

                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.12)_0%,transparent_70%)] animate-pulse" />
                    <div className="absolute h-[160px] w-[160px] rounded-full border border-dashed border-violet-500/30 animate-spin [animation-duration:25s]" />
                    <div className="absolute h-[100px] w-[100px] rounded-full border border-double border-indigo-500/30 animate-spin [animation-duration:12s] [animation-direction:reverse]" />

                    <div className="absolute flex flex-col items-center justify-center text-center z-10 translate-z-md">
                      <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 border border-violet-500/40 logo-animate">
                        <ShieldCheck size={20} />
                      </div>
                      <span className="mt-2 text-[9px] font-bold tracking-widest text-violet-300 uppercase">AI SCANNING ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-8 animate-fade-in-up stagger-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur translate-z-sm">
                  <p className="text-xs font-semibold text-violet-200">CheatLock Security Protocol</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    This dashboard uses authenticated access and encrypted transport. Proctoring logs and session evidence may be collected for instructor review.
                  </p>
                </div>
              </div>

              {/* Right Panel */}
              <div className="flex items-center p-6 sm:p-10 z-10 preserve-3d">
                <div className="w-full preserve-3d">
                  {/* Mobile Logo Header */}
                  <div className="flex flex-col items-center mb-6 lg:hidden animate-fade-in-up stagger-1 translate-z-md">
                    <div className="logo-animate flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-cyan-300/40 bg-[#020617]">
                      <img src="/cheatlock-logo.png" alt="CheatLock logo" className="h-full w-full object-cover" />
                    </div>
                    <h1 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">CheatLock</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">AI Exam Monitoring Platform</p>
                  </div>

                  {/* Form Title */}
                  <div className="mb-6 animate-fade-in-up stagger-1 translate-z-md">
                    <h2 className="text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                      Teacher Account Access
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                      Teacher accounts are created by an administrator.
                    </p>
                  </div>

                  <form className="space-y-4 preserve-3d" onSubmit={(e) => handleSubmit(e, true)}>
                    {/* Full Name */}
                    <div className="animate-fade-in-up stagger-1 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Full Name</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <User size={16} />
                          </span>
                          <input
                            type="text"
                            className="field-input pl-10 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Dr. Eleanor Vance"
                            required
                          />
                        </div>
                      </label>
                    </div>

                    {/* Institution Name */}
                    <div className="animate-fade-in-up stagger-2 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Institution Name</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <Building size={16} />
                          </span>
                          <input
                            type="text"
                            className="field-input pl-10 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            value={institutionName}
                            onChange={(event) => setInstitutionName(event.target.value)}
                            placeholder="Summit Science University"
                            required
                          />
                        </div>
                      </label>
                    </div>

                    {/* Email */}
                    <div className="animate-fade-in-up stagger-2 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Email Address</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <Mail size={16} />
                          </span>
                          <input
                            type="email"
                            className="field-input pl-10 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            placeholder="examiner@institution.edu"
                            required
                          />
                        </div>
                      </label>
                    </div>

                    {/* Password */}
                    <div className="animate-fade-in-up stagger-3 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Password</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <LockKeyhole size={16} />
                          </span>
                          <input
                            className="field-input pl-10 pr-12 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••••••"
                            required
                          />
                          <button
                            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            title={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </div>

                    {/* Confirm Password */}
                    <div className="animate-fade-in-up stagger-3 translate-z-sm">
                      <label className="block">
                        <span className="field-label">Confirm Password</span>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <LockKeyhole size={16} />
                          </span>
                          <input
                            className="field-input pl-10 pr-12 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="••••••••••••"
                            required
                          />
                          <button
                            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                            type="button"
                            onClick={() => setShowConfirmPassword((current) => !current)}
                            title={showConfirmPassword ? "Hide password" : "Show password"}
                          >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </div>

                    {/* Checkbox Terms */}
                    <div className="flex items-center gap-2 cursor-pointer text-sm animate-fade-in-up stagger-3 translate-z-sm">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                          checked={agreeToTerms}
                          onChange={(event) => setAgreeToTerms(event.target.checked)}
                        />
                        <span>I agree to the <span className="text-violet-600 hover:underline">Terms & Privacy Policy</span></span>
                      </label>
                    </div>

                    {error && isSignupMode && (
                      <div className="animate-fade-in rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                        {error}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      className={`animate-fade-in-up stagger-4 primary-button relative h-12 w-full overflow-hidden transition-all duration-300 translate-z-md ${
                        loading ? "cursor-wait opacity-90" : "hover:shadow-lg hover:shadow-violet-500/25"
                      }`}
                      disabled={loading}
                      type="submit"
                    >
                      <span className={`flex items-center justify-center gap-2 transition-opacity ${loading ? "opacity-0" : "opacity-100"}`}>
                        Contact Administrator
                      </span>
                      {loading && (
                        <span className="absolute inset-0 flex items-center justify-center bg-violet-600">
                          <Activity size={18} className="animate-spin text-white" />
                          <span className="ml-2 text-sm font-medium">Verifying Credentials...</span>
                        </span>
                      )}
                    </button>
                  </form>

                  {/* Toggle Link */}
                  <div className="mt-6 text-center animate-fade-in-up stagger-4 text-sm text-slate-600 dark:text-slate-400 translate-z-sm">
                    <span>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="font-bold text-violet-600 hover:underline focus:outline-none"
                        onClick={() => {
                          setIsSignupMode(false);
                          setError("");
                        }}
                      >
                        Sign In
                      </button>
                    </span>
                  </div>

                  {/* Bottom footer tag */}
                  <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 animate-fade-in-up stagger-5 uppercase tracking-widest font-semibold translate-z-sm">
                    Secure Exam Monitoring Platform
                  </div>
                </div>
              </div>
            </section>
          </div>

        </div>
      </main>
    </>
  );
}

function readErrorMessage(error: unknown, isSignupMode: boolean) {
  const response = (error as { response?: { data?: unknown } })?.response;
  
  if (response?.data) {
    if (typeof response.data === "string") {
      return response.data;
    }
    const dataObj = response.data as { message?: string; error?: string };
    if (dataObj.message) return dataObj.message;
    if (dataObj.error) return dataObj.error;
  }
  
  const axiosErr = error as { message?: string };
  if (axiosErr.message === "Network Error") {
    return "Network connection failed. The backend server might be offline or waking up from sleep mode (Render cold start). Please try again in 30 seconds.";
  }
  if (axiosErr.message?.includes("timeout")) {
    return "Connection timeout. The backend server took too long to respond. Please try again.";
  }

  return isSignupMode
    ? "Teacher accounts must be created by an administrator."
    : "Teacher account was not found in the backend, or the password is wrong.";
}
