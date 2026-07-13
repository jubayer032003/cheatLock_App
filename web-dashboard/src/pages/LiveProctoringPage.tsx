import {
  Activity,
  AlertTriangle,
  FileText,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  Eye,
  UserRound,
  ShieldX
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssignStudentsToExamPanel } from "../components/AssignStudentsToExamPanel";
import { fetchLiveProctoring, fetchTeacherExam, sendProctoringTestEvent, updateIntegrityReview } from "../lib/api";
import { createProctoringSocket } from "../lib/socket";
import { statusFromScore } from "../components/StatusBadge";
import { StudentTile } from "../components/StudentTile";
import { StudentDetail } from "../components/StudentDetail";
import { FullscreenStudent } from "../components/FullscreenStudent";
import { VirtualGrid } from "../components/VirtualGrid";
import {
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SkeletonBlock,
  cn,
} from "../components/ui";
import type {
  Exam,
  LiveProctoringResponse,
  LiveStudent,
  LiveStudentListEvent,
  ProctoringTestEventName,
  StudentStatus,
  IntegrityDecision,
} from "../types";
import { Socket } from "socket.io-client";

type FilterState = "ALL" | StudentStatus;

export function LiveProctoringPage() {
  const { examId = "" } = useParams();
  const [data, setData] = useState<LiveProctoringResponse | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<LiveStudent | null>(null);
  const [fullscreenStudent, setFullscreenStudent] = useState<LiveStudent | null>(null);
  const [socketState, setSocketState] = useState("Connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterState>("ALL");
  const [search, setSearch] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [activeAlert, setActiveAlert] = useState<{ student: string; msg: string; score: number } | null>(null);
  const [alertFeed, setAlertFeed] = useState<Array<{ id: string; studentId: string; student: string; alert: string; score: number; severity: "low" | "medium" | "high"; time: Date }>>([]);
  const [timelineStudentFilter, setTimelineStudentFilter] = useState("ALL");
  const [timelineSeverityFilter, setTimelineSeverityFilter] = useState("ALL");
  const [warningMsg, setWarningMsg] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [integrityDecision, setIntegrityDecision] = useState<IntegrityDecision>("PENDING");
  const socketRef = useRef<Socket | null>(null);
  const [testStudentId, setTestStudentId] = useState("");
  const [testStudentName, setTestStudentName] = useState("");
  const [testScore, setTestScore] = useState(0);
  const [testAlert, setTestAlert] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [detailTab, setDetailTab] = useState<"camera" | "screen">("camera");

  const loadLiveData = useCallback(async () => {
    if (!examId) return;
    setError("");
    try {
      const [liveData, examDetails] = await Promise.all([
        fetchLiveProctoring(examId),
        fetchTeacherExam(examId),
      ]);
      setData(liveData);
      setExam(examDetails);
      setLastSyncedAt(new Date());
      setSelectedStudent((current) => {
        if (!current) return liveData.activeStudents[0] || null;
        return liveData.activeStudents.find((student) => student.studentId === current.studentId) || current;
      });
    } catch (err: any) {
      setError(readErrorMessage(err, "Could not load live proctoring."));
    }
  }, [examId]);

  useEffect(() => {
    setLoading(true);
    loadLiveData().finally(() => setLoading(false));
  }, [loadLiveData]);

  useEffect(() => {
    if (!examId) return;

    const socket = createProctoringSocket();
    socketRef.current = socket;

    const syncStudentList = (event: LiveStudentListEvent) => {
      setData((current) => {
        if (!current) return current;
        const mergedStudents = event.students.map((newStudent) => {
          const prev = current.activeStudents.find((s) => s.studentId === newStudent.studentId);
          return {
            ...newStudent,
            screenBase64: prev?.screenBase64,
            faceStatus: prev?.faceStatus,
            audioStatus: prev?.audioStatus,
            focusStatus: prev?.focusStatus,
            multiMonitorStatus: prev?.multiMonitorStatus,
            clipboardStatus: prev?.clipboardStatus,
            violationsList: prev?.violationsList || [],
          };
        });
        return { ...current, activeStudents: mergedStudents };
      });
      setLastSyncedAt(new Date());
    };

    const mergeStudentUpdate = (student: LiveStudent, eventName?: string) => {
      const alertMsg = student.latestAlert || "";

      if (student.suspicionScore >= 75 && eventName === "ai_alert_created") {
        setActiveAlert({
          student: student.studentName || student.studentId,
          msg: alertMsg,
          score: student.suspicionScore
        });
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          osc.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.18);
        } catch {}
      }

      let faceStatus = student.faceStatus;
      let audioStatus = student.audioStatus;
      let focusStatus = student.focusStatus;
      let multiMonitorStatus = student.multiMonitorStatus;
      let clipboardStatus = student.clipboardStatus;

      if (alertMsg.includes("FACE_MISSING") || alertMsg.includes("missing")) {
        faceStatus = "Missing";
      } else if (alertMsg.includes("MULTIPLE_FACES") || alertMsg.includes("multiple")) {
        faceStatus = "Multiple detected";
      } else if (alertMsg.includes("FACE_MATCH") || alertMsg.includes("matching")) {
        faceStatus = "Matching";
      }

      if (alertMsg.includes("VOICE_DETECTED") || alertMsg.includes("speech") || alertMsg.includes("sound")) {
        audioStatus = "Speech detected";
      } else if (alertMsg.includes("NO_SPEECH") || alertMsg.includes("quiet")) {
        audioStatus = "Quiet";
      } else if (alertMsg.includes("mic") || alertMsg.includes("microphone")) {
        audioStatus = "Mic issue";
      }

      if (alertMsg.includes("WINDOW_BLURRED") || alertMsg.includes("focus") || alertMsg.includes("tab")) {
        focusStatus = "Blurred";
      } else if (alertMsg.includes("WINDOW_FOCUSED") || alertMsg.includes("focused")) {
        focusStatus = "Focused";
      }

      if (alertMsg.includes("MONITOR") || alertMsg.includes("display")) {
        multiMonitorStatus = "Multi-monitor alert";
      }

      if (alertMsg.includes("clipboard") || alertMsg.includes("copy") || alertMsg.includes("paste")) {
        clipboardStatus = "Clipboard alert";
      }

      const severity: "low" | "medium" | "high" = student.suspicionScore >= 70 ? "high" : student.suspicionScore >= 40 ? "medium" : "low";

      setData((current) => {
        if (!current) return current;
        const exists = current.activeStudents.some((item) => item.studentId === student.studentId);
        const prev = current.activeStudents.find((item) => item.studentId === student.studentId);

        let violationsList = prev?.violationsList || [];
        if (student.latestAlert && prev?.latestAlert !== student.latestAlert) {
          violationsList = [
            { type: eventName || "ALERT", message: student.latestAlert, timestamp: Date.now() },
            ...violationsList
          ].slice(0, 55);
        }

        const merged: LiveStudent = {
          ...prev,
          ...student,
          faceStatus: faceStatus || prev?.faceStatus || "Matching",
          audioStatus: audioStatus || prev?.audioStatus || "Quiet",
          focusStatus: focusStatus || prev?.focusStatus || "Focused",
          multiMonitorStatus: multiMonitorStatus || prev?.multiMonitorStatus || "Normal",
          clipboardStatus: clipboardStatus || prev?.clipboardStatus || "Normal",
          violationsList,
        };

        return {
          ...current,
          activeStudents: exists
            ? current.activeStudents.map((item) => (item.studentId === student.studentId ? merged : item))
            : [merged, ...current.activeStudents],
        };
      });

      setSelectedStudent((current) => {
        if (current?.studentId !== student.studentId) return current;
        const violationsList = student.latestAlert && current.latestAlert !== student.latestAlert
          ? [{ type: eventName || "ALERT", message: student.latestAlert, timestamp: Date.now() }, ...(current.violationsList || [])].slice(0, 55)
          : (current.violationsList || []);

        return {
          ...current,
          ...student,
          faceStatus: faceStatus || current.faceStatus || "Matching",
          audioStatus: audioStatus || current.audioStatus || "Quiet",
          focusStatus: focusStatus || current.focusStatus || "Focused",
          multiMonitorStatus: multiMonitorStatus || current.multiMonitorStatus || "Normal",
          clipboardStatus: clipboardStatus || current.clipboardStatus || "Normal",
          violationsList,
        };
      });

      setFullscreenStudent((current) => {
        if (current?.studentId !== student.studentId) return current;
        return {
          ...current,
          ...student,
          faceStatus: faceStatus || current.faceStatus || "Matching",
          audioStatus: audioStatus || current.audioStatus || "Quiet",
          focusStatus: focusStatus || current.focusStatus || "Focused",
          multiMonitorStatus: multiMonitorStatus || current.multiMonitorStatus || "Normal",
          clipboardStatus: clipboardStatus || current.clipboardStatus || "Normal",
        };
      });

      if (student.latestAlert) {
        setAlertFeed((current) => [
          {
            id: `${student.studentId}-${Date.now()}`,
            studentId: student.studentId,
            student: student.studentName || student.studentId,
            alert: student.latestAlert,
            score: student.suspicionScore,
            severity,
            time: new Date(),
          },
          ...current,
        ].slice(0, 50));
      }
      setLastSyncedAt(new Date());
    };

    socket.on("connect", () => {
      setSocketState("Live");
      socket.emit("join_exam_room", { examId });
    });
    socket.on("disconnect", () => setSocketState("Disconnected"));
    socket.on("connect_error", () => setSocketState("Reconnect pending"));
    
    socket.on("live_student_list", syncStudentList);
    socket.on("student_joined_exam", (payload) => mergeStudentUpdate(payload, "JOINED"));
    socket.on("student_left_exam", (payload) => mergeStudentUpdate(payload, "LEFT"));
    socket.on("suspicion_score_updated", (payload) => mergeStudentUpdate(payload, "SUSPICION_SCORE_UPDATED"));
    socket.on("ai_alert_created", (payload) => mergeStudentUpdate(payload, "AI_ALERT"));
    socket.on("camera_preview_updated", (payload) => mergeStudentUpdate(payload, "CAMERA_PREVIEW_UPDATED"));

    socket.on("screen_telemetry_uploaded", (payload: any) => {
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          activeStudents: current.activeStudents.map((item) =>
            item.studentId === payload.studentId
              ? { ...item, screenBase64: payload.base64, lastScreenUpdatedAt: Date.now() }
              : item
          ),
        };
      });
      setSelectedStudent((current) => {
        if (current && current.studentId === payload.studentId) {
          return { ...current, screenBase64: payload.base64, lastScreenUpdatedAt: Date.now() };
        }
        return current;
      });
      setFullscreenStudent((current) => {
        if (current && current.studentId === payload.studentId) {
          return { ...current, screenBase64: payload.base64, lastScreenUpdatedAt: Date.now() };
        }
        return current;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [examId]);

  const sendCommand = (studentId: string, command: string, message?: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("teacher_command", {
      examId,
      studentId,
      command,
      message,
    }, (ack: any) => {
      if (!ack?.ok) {
        setError(ack?.message || "Failed to transmit proctoring command.");
      }
    });
  };

  const handleSaveReview = async (studentId: string) => {
    try {
      await updateIntegrityReview(examId, studentId, integrityDecision, privateNote);
      setPrivateNote("");
      loadLiveData();
    } catch (err: any) {
      setError(err.message || "Failed to commit integrity review.");
    }
  };

  const students = data?.activeStudents || [];
  const analytics = useMemo(() => {
    const suspicious = students.filter((student) => statusFromScore(student.suspicionScore) === "SUSPICIOUS").length;
    const warning = students.filter((student) => statusFromScore(student.suspicionScore) === "WARNING").length;
    const average = students.length ? Math.round(students.reduce((sum, student) => sum + student.suspicionScore, 0) / students.length) : 0;
    const online = students.filter((student) => student.onlineStatus === "ONLINE").length;
    const integrity = Math.max(0, Math.round(100 - average * 0.55 - suspicious * 4));
    return { suspicious, warning, average, online, integrity, alertsPerMinute: alertFeed.slice(0, 8).length };
  }, [alertFeed, students]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...students]
      .sort((first, second) => second.suspicionScore - first.suspicionScore)
      .filter((student) => filter === "ALL" || statusFromScore(student.suspicionScore) === filter)
      .filter((student) => {
        if (!term) return true;
        return [student.studentName, student.rollId, student.studentId].some((value) => value?.toLowerCase().includes(term));
      });
  }, [filter, search, students]);

  const filteredTimelineAlerts = useMemo(() => {
    return alertFeed.filter((item) => {
      const matchStudent = timelineStudentFilter === "ALL" || item.studentId === timelineStudentFilter;
      const matchSeverity = timelineSeverityFilter === "ALL" || item.severity.toUpperCase() === timelineSeverityFilter.toUpperCase();
      return matchStudent && matchSeverity;
    });
  }, [alertFeed, timelineStudentFilter, timelineSeverityFilter]);

  const chartData = useMemo(
    () =>
      students
        .slice()
        .sort((first, second) => second.suspicionScore - first.suspicionScore)
        .slice(0, 10)
        .map((student) => ({ name: shortName(student.studentName || student.studentId), score: student.suspicionScore })),
    [students]
  );

  async function runTestEvent(eventName: ProctoringTestEventName) {
    if (!examId) return;
    setTestBusy(true);
    setError("");
    try {
      await sendProctoringTestEvent(examId, {
        eventName,
        studentId: testStudentId,
        studentName: testStudentName,
        suspicionScore: testScore,
        latestAlert: testAlert,
      });
    } catch (err) {
      setError(readErrorMessage(err, "Could not send test event."));
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2 text-violet-400 font-mono"><Radio size={14} className="animate-pulse" /> {socketState}</span>}
        title={data?.exam.title || "Live Proctoring Dashboard"}
        description={`AI aggregated suspicion scores and proctor controls. Last sync: ${lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "Pending"}.`}
        actions={<button className="secondary-button hover:bg-slate-800 transition" type="button" onClick={() => loadLiveData()}><RefreshCw size={17} />Refresh</button>}
      />

      {activeAlert && (
        <div className="bg-red-955/40 border border-red-500/30 rounded-lg p-4 flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/20 p-2 rounded-full text-red-400">
              <ShieldX size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-white uppercase tracking-wider">Critical Suspect Warning Raised</p>
              <p className="text-xs text-red-300 font-mono">
                Student <span className="font-bold underline">{activeAlert.student}</span> reached score of <span className="font-bold underline">{activeAlert.score}</span>: "{activeAlert.msg}"
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setActiveAlert(null)}
            className="text-xs font-mono text-red-400 hover:text-white uppercase font-bold tracking-wider"
          >
            Acknowledge
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadLiveData} />}

      {exam && <AssignStudentsToExamPanel exam={exam} onExamUpdated={setExam} />}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={Users} label="Active students" value={students.length} helper={`${analytics.online} online`} tone="primary" />
        <MetricCard icon={AlertTriangle} label="Suspicious" value={analytics.suspicious} helper={`${analytics.warning} warnings`} tone="danger" />
        <MetricCard icon={Activity} label="Avg suspicion" value={`${analytics.average}/100`} tone={analytics.average >= 70 ? "danger" : analytics.average >= 40 ? "warning" : "success"} />
        <MetricCard icon={Radio} label="Alerts/min" value={analytics.alertsPerMinute} tone="warning" />
        <MetricCard icon={ShieldCheck} label="Integrity Score" value={`${analytics.integrity}%`} tone="success" />
        <MetricCard icon={ShieldX} label="Offline" value={students.length - analytics.online} tone="neutral" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_390px]">
        <Card className="overflow-hidden bg-slate-900 border-slate-800">
          <div className="border-b border-slate-800 p-4 bg-slate-900/50">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wider flex items-center gap-2">
                  <Eye size={18} className="text-violet-400" />
                  Student Stream Grid
                </h2>
                <p className="text-xs text-slate-400">Sorts suspicious students with highest scores first.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Eye className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input className="field-input bg-slate-955 border-slate-800 text-slate-202 text-xs pl-9 sm:w-64 focus:border-violet-505" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or ID..." />
                </div>
                <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 p-1">
                  {(["ALL", "SAFE", "WARNING", "SUSPICIOUS"] as FilterState[]).map((item) => (
                    <button
                      className={cn("rounded px-3 py-1.5 text-xs font-semibold tracking-wider uppercase transition", filter === item ? "bg-violet-600 text-white shadow-md" : "text-slate-400 hover:text-slate-202 hover:bg-slate-800")}
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                    >
                      {item === "ALL" ? "All" : item.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 overflow-hidden min-h-[600px] border border-slate-800 rounded-b-lg">
            {loading && Array.from({ length: 6 }).map((_, index) => <SkeletonBlock className="h-44 bg-slate-800 m-4" key={index} />)}
            {!loading && visibleStudents.length > 0 && (
              <VirtualGrid
                items={visibleStudents}
                itemHeight={260}
                renderItem={(student) => (
                  <StudentTile
                    student={student}
                    selected={selectedStudent?.studentId === student.studentId}
                    onSelect={setSelectedStudent}
                    onOpen={setFullscreenStudent}
                  />
                )}
              />
            )}
            {!loading && visibleStudents.length === 0 && (
              <div className="p-8">
                <EmptyState icon={UserRound} title="No students match filters" description="No student sessions matched active status logs." />
              </div>
            )}
          </div>
        </Card>

        <aside className="space-y-6">
          <StudentDetail 
            student={selectedStudent} 
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            warningMsg={warningMsg}
            setWarningMsg={setWarningMsg}
            privateNote={privateNote}
            setPrivateNote={setPrivateNote}
            integrityDecision={integrityDecision}
            setIntegrityDecision={setIntegrityDecision}
            onSendCommand={sendCommand}
            onSaveReview={handleSaveReview}
            onOpen={setFullscreenStudent} 
          />
        </aside>
      </section>

      <section className="grid gap-6 md:grid-cols-[380px_1fr]">
        <Card className="p-5 bg-slate-900 border-slate-800">
          <h2 className="text-base font-bold text-white tracking-wider flex items-center gap-2">
            <Activity size={16} className="text-violet-400" />
            Risk Distribution
          </h2>
          <p className="text-xs text-slate-400 mt-1">Live active student risk curve.</p>
          <div className="mt-6 h-48">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="risk" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} style={{ fontSize: "10px" }} />
                  <YAxis domain={[0, 100]} stroke="#64748b" tickLine={false} axisLine={false} width={25} style={{ fontSize: "10px" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#f8fafc" }} />
                  <Area dataKey="score" stroke="#ef4444" fill="url(#risk)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Activity} title="No score data yet" description="Telemetry curve is pending student registrations." />
            )}
          </div>
        </Card>

        <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-wider flex items-center gap-2">
                <FileText size={16} className="text-violet-400" />
                Filterable Violation Timeline Log
              </h2>
              <p className="text-xs text-slate-400">Search proctoring timeline entries in real-time.</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <select 
                value={timelineStudentFilter} 
                onChange={(e) => setTimelineStudentFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2.5 py-1.5 focus:border-violet-505"
              >
                <option value="ALL">All Students</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentName}
                  </option>
                ))}
              </select>
              <select 
                value={timelineSeverityFilter} 
                onChange={(e) => setTimelineSeverityFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2.5 py-1.5 focus:border-violet-505"
              >
                <option value="ALL">All Severities</option>
                <option value="HIGH">High Severity</option>
                <option value="MEDIUM">Medium Severity</option>
                <option value="LOW">Low Severity</option>
              </select>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {filteredTimelineAlerts.map((item) => (
              <div 
                className={cn(
                  "p-3 rounded border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition",
                  item.severity === "high" 
                    ? "bg-red-955/20 border-red-500/20" 
                    : item.severity === "medium" 
                      ? "bg-amber-955/20 border-amber-500/20" 
                      : "bg-slate-950 border-slate-800 text-slate-300"
                )} 
                key={item.id}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{item.student}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                      Score: {item.score}
                    </span>
                  </div>
                  <p className="text-slate-303 font-mono text-[11px]">{item.alert}</p>
                </div>
                <div className="text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                  <span className="text-[10px] text-slate-400">{item.time.toLocaleTimeString()}</span>
                  <span className={cn("text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded border", item.severity === "high" ? "bg-red-950/30 border-red-500/30 text-red-400" : item.severity === "medium" ? "bg-amber-950/30 border-amber-500/30 text-amber-400" : "bg-emerald-950/30 border-emerald-500/30 text-emerald-400")}>
                    {item.severity}
                  </span>
                </div>
              </div>
            ))}
            {filteredTimelineAlerts.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500 font-mono">No matching timeline alerts found in active session cache.</p>
            )}
          </div>
        </Card>
      </section>

      <Card className="p-5 bg-slate-900 border-slate-800">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-sm font-bold text-white tracking-widest uppercase font-mono flex items-center gap-2">
            <Radio size={14} className="text-amber-400" />
            Live proctor event simulator
          </h2>
          <p className="text-xs text-slate-400">Trigger test alerts and suspicion states in the Socket.IO room.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block"><span className="field-label text-slate-400 font-mono text-xs">Student ID</span><input className="field-input bg-slate-955 border-slate-800 text-slate-202" value={testStudentId} onChange={(event) => setTestStudentId(event.target.value)} /></label>
          <label className="block"><span className="field-label text-slate-400 font-mono text-xs">Student name</span><input className="field-input bg-slate-955 border-slate-800 text-slate-202" value={testStudentName} onChange={(event) => setTestStudentName(event.target.value)} /></label>
          <label className="block"><span className="field-label text-slate-400 font-mono text-xs">Suspicion score</span><input className="field-input bg-slate-955 border-slate-800 text-slate-202" max={100} min={0} type="number" value={testScore} onChange={(event) => setTestScore(Number(event.target.value))} /></label>
          <label className="block"><span className="field-label text-slate-400 font-mono text-xs">Alert</span><input className="field-input bg-slate-955 border-slate-800 text-slate-202" value={testAlert} onChange={(event) => setTestAlert(event.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="secondary-button bg-slate-950 border-slate-800 hover:bg-slate-800 transition" disabled={testBusy} type="button" onClick={() => runTestEvent("student_joined_exam")}>Simulate joined</button>
          <button className="secondary-button bg-slate-950 border-slate-800 hover:bg-slate-800 transition" disabled={testBusy} type="button" onClick={() => runTestEvent("suspicion_score_updated")}>Set score</button>
          <button className="secondary-button bg-slate-950 border-slate-800 hover:bg-slate-800 transition" disabled={testBusy} type="button" onClick={() => runTestEvent("ai_alert_created")}>Create alert</button>
          <button className="secondary-button bg-slate-950 border-slate-800 hover:bg-slate-800 transition" disabled={testBusy} type="button" onClick={() => runTestEvent("student_left_exam")}>Set offline</button>
        </div>
      </Card>

      <Dialog open={Boolean(fullscreenStudent)} onClose={() => setFullscreenStudent(null)} title={fullscreenStudent?.studentName || "Student Monitor"}>
        {fullscreenStudent && (
          <FullscreenStudent 
            student={fullscreenStudent} 
            detailTab={detailTab}
            setDetailTab={setDetailTab}
          />
        )}
      </Dialog>
    </div>
  );
}

function shortName(value: string) {
  return value.split(" ").map((part) => part[0]).join("").slice(0, 3).toUpperCase() || "ST";
}

function readErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : fallback);
}
