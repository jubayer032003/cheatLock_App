import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { ShieldCheck, LogOut, Server } from "lucide-react";
import { Button } from "../components/Button";

export function AppLayout() {
  const { user, logout, serverUrl } = useAuth();
  const { status: socketStatus } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getSocketStatusColor = () => {
    switch (socketStatus) {
      case "Connected":
        return "bg-success";
      case "Connecting":
        return "bg-warning animate-pulse";
      case "Reconnect pending":
        return "bg-warning animate-bounce";
      default:
        return "bg-danger";
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-base overflow-hidden text-zinc-100 font-sans">
      {/* Premium Compact Header */}
      <header className="h-14 px-5 border-b border-border bg-surface-base flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-zinc-50">
              CheatLock
            </h1>
            <p className="text-[10px] font-mono tracking-wider text-accent/80 uppercase">
              Secure Desktop
            </p>
          </div>
        </div>

        {/* System Stats / Diagnostics */}
        <div className="flex items-center gap-4 text-xs text-zinc-400 font-sans">
          {/* Server Base URL */}
          <div className="hidden sm:flex items-center gap-1.5 bg-surface-raised px-2.5 py-1 rounded-md border border-border">
            <Server size={12} className="text-zinc-500" />
            <span className="max-w-[150px] truncate text-[11px] font-mono text-zinc-400" title={serverUrl}>
              {serverUrl.replace(/^https?:\/\//, "")}
            </span>
          </div>

          {/* WebSocket Status Dot */}
          <div className="flex items-center gap-2 bg-surface-raised px-2.5 py-1 rounded-md border border-border">
            <span className={`h-2 w-2 rounded-full ${getSocketStatusColor()}`} />
            <span className="text-[11px] font-mono uppercase font-medium text-zinc-400">
              {socketStatus}
            </span>
          </div>

          {/* Current Profile */}
          {user && (
            <div className="flex items-center gap-3 border-l border-border pl-4">
              <div className="flex flex-col items-end">
                <span className="text-zinc-300 font-medium text-sm leading-tight">{user.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {user.identifier}
                </span>
              </div>
              <Button
                variant="ghost"
                className="p-1.5 hover:text-danger rounded-md transition-all duration-150"
                onClick={handleLogout}
                title="Terminate Session"
              >
                <LogOut size={15} />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Primary Page Canvas */}
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
