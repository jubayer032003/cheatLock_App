import { useState, useEffect } from "react";
import { ClipboardList, ShieldAlert, Clock, Info } from "lucide-react";
import { fetchTenantAuditLogs } from "../lib/api";
import { Card } from "../components/ui";

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTenantAuditLogs()
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load audit logs.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="p-8 text-center text-xs font-mono text-slate-500 font-bold">Loading system audit logs...</p>;
  }

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* Page Header */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">SaaS Command Panel</p>
        <h2 className="mt-1 text-xl font-bold text-white tracking-wider">Institution Audit Logs</h2>
        <p className="mt-2 text-xs text-slate-400">Review security access events, system settings updates, and administrator actions.</p>
      </section>

      {error && (
        <p className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 text-xs font-mono rounded text-center">
          {error}
        </p>
      )}

      {/* Logs Catalog */}
      <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex items-center gap-1.5">
          <ClipboardList size={14} className="text-violet-400" />
          SaaS Audit History ({logs.length})
        </h3>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {logs.map((log) => (
            <article 
              key={log._id}
              className="bg-slate-950 border border-slate-850 rounded p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4 font-mono text-xs hover:border-slate-800 transition"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-violet-400 font-bold">{log.action}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-300 font-bold">{log.userId}</span>
                  <span className="text-[8.5px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                    {log.userRole}
                  </span>
                </div>
                
                {log.details && Object.keys(log.details).length > 0 && (
                  <div className="bg-slate-900/60 rounded p-3 text-[10px] text-slate-400 border border-slate-900/40">
                    <span className="text-[9px] uppercase tracking-wider text-slate-650 font-bold block mb-1">Details:</span>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}

                {(log.ipAddress || log.userAgent) && (
                  <p className="text-[9px] text-slate-500 flex items-center gap-2">
                    <span>IP: {log.ipAddress || "N/A"}</span>
                    <span>•</span>
                    <span className="truncate max-w-xs" title={log.userAgent}>UA: {log.userAgent || "N/A"}</span>
                  </p>
                )}
              </div>

              <div className="text-slate-500 shrink-0 text-[10px] flex items-center gap-1">
                <Clock size={11} />
                {new Date(log.createdAt).toLocaleString()}
              </div>
            </article>
          ))}

          {logs.length === 0 && (
            <p className="py-12 text-xs text-slate-500 text-center font-mono">No system audit logs found.</p>
          )}
        </div>
      </Card>

    </div>
  );
}
