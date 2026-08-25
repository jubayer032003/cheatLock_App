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
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssignStudentsToExamPanel } from "../components/AssignStudentsToExamPanel";
import { fetchLiveProctoring, fetchTeacherExam, sendProctoringTestEvent, updateIntegrityReview } from "../lib/api";
import { createProctoringSocket } from "../lib/socket";
import { mergeAuthoritativeStudent, scorePercentage, scoreUpdatedAt } from "../lib/scoreMetrics";
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
const ENABLE_PROCTORING_TEST_TOOLS = import.meta.env.VITE_ENABLE_PROCTORING_TEST_TOOLS === "true";
const SCORE_TRACE_ENABLED = import.meta.env.VITE_SUSPICIOUS_SCORE_TRACE === "true";
type SocketState = "Connecting" | "Live" | "Disconnected" | "Reconnect pending";
type CommandFeedback = { tone: "success" | "danger" | "info"; message: string };

export function LiveProctoringPage() {
  const { examId = "" } = useParams();
  const [data, setData] = useState<LiveProctoringResponse | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<LiveStudent | null>(null);
  const [fullscreenStudent, setFullscreenStudent] = useState<LiveStudent | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("Connecting");
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
  const [pendingCommandKey, setPendingCommandKey] = useState("");
  const pendingCommandKeyRef = useRef("");
  const [commandFeedback, setCommandFeedback] = useState<CommandFeedback | null>(null);

  const loadLiveData = useCallback(async () => {
    if (!examId) return;
    setError("");
    try {
      const [liveData, examDetails] = await Promise.all([
        fetchLiveProctoring(examId),
        fetchTeacherExam(examId),
      ]);
      setData((current) => {
        if (!current) return liveData;
        const mergedStudents = liveData.activeStudents.map((newStudent) => {
          const prev = current.activeStudents.find((student) => student.studentId === newStudent.studentId);
          const scoreSafeStudent = mergeAuthoritativeStudent(prev, newStudent);
          if (prev && scoreUpdatedAt(prev) > scoreUpdatedAt(scoreSafeStudent)) return prev;
          return {
            ...scoreSafeStudent,
            screenBase64: scoreSafeStudent.screenBase64 || prev?.screenBase64,
            faceStatus: scoreSafeStudent.faceStatus || prev?.faceStatus,
            audioStatus: scoreSafeStudent.audioStatus || prev?.audioStatus,
            focusStatus: scoreSafeStudent.focusStatus || prev?.focusStatus,
            multiMonitorStatus: scoreSafeStudent.multiMonitorStatus || prev?.multiMonitorStatus,
            clipboardStatus: scoreSafeStudent.clipboardStatus || prev?.clipboardStatus,
            violationsList: scoreSafeStudent.violationsList || prev?.violationsList || [],
          };
        });
        return { ...liveData, activeStudents: mergedStudents };
      });
      setExam(examDetails);
      setLastSyncedAt(new Date());
      setSelectedStudent((current) => {
        if (!current || !liveData.activeStudents.some((student) => student.studentId === current.studentId)) {
          return liveData.activeStudents[0] || null;
        }
        const incoming = liveData.activeStudents.find((student) => student.studentId === current.studentId);
        return incoming ? mergeAuthoritativeStudent(current, incoming) : current;
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
          const scoreSafeStudent = mergeAuthoritativeStudent(prev, newStudent);
          if (prev && scoreUpdatedAt(prev) > scoreUpdatedAt(scoreSafeStudent)) return prev;
          return {
            ...scoreSafeStudent,
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
      const percentage = scorePercentage(student);
      if (percentage >= 75 && eventName === "AI_ALERT") {
        setActiveAlert({
          student: student.studentName || student.studentId,
          msg: alertMsg,
          score: percentage
        });
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

      const severity: "low" | "medium" | "high" = percentage >= 70 ? "high" : percentage >= 40 ? "medium" : "low";

      setData((current) => {
        if (!current) return current;
        const exists = current.activeStudents.some((item) => item.studentId === student.studentId);
        const prev = current.activeStudents.find((item) => item.studentId === student.studentId);
        const scoreSafeStudent = mergeAuthoritativeStudent(prev, student);
        if (SCORE_TRACE_ENABLED) {
          console.debug("[DASHBOARD_SCORE_SOURCE]", {
            studentSession: student.sessionId || "unknown",
            source: eventName || "SOCKET",
            previousScore: prev ? scorePercentage(prev) : null,
            incomingScore: percentage,
            incomingDelta: student.scoreDelta ?? null,
            resultingScore: scorePercentage(scoreSafeStudent),
            eventId: student.eventId || student.mutationId || null,
          });
          console.debug("[DASHBOARD SCORE RECEIVED]", {
            eventId: student.eventId || student.mutationId || null,
            authoritativeScore: scorePercentage(scoreSafeStudent),
          });
        }
        if (prev && scoreUpdatedAt(prev) > scoreUpdatedAt(scoreSafeStudent)) return current;

        let violationsList = prev?.violationsList || [];
        if (scoreSafeStudent.latestAlert && prev?.latestAlert !== scoreSafeStudent.latestAlert) {
          violationsList = [
            { type: eventName || "ALERT", message: scoreSafeStudent.latestAlert, timestamp: Date.now() },
            ...violationsList
          ].slice(0, 55);
        }

        const merged: LiveStudent = {
          ...prev,
          ...scoreSafeStudent,
          suspicionScore: scorePercentage(scoreSafeStudent),
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
        const scoreSafeStudent = mergeAuthoritativeStudent(current, student);
        const violationsList = scoreSafeStudent.latestAlert && current.latestAlert !== scoreSafeStudent.latestAlert
          ? [{ type: eventName || "ALERT", message: scoreSafeStudent.latestAlert, timestamp: Date.now() }, ...(current.violationsList || [])].slice(0, 55)
          : (current.violationsList || []);

        return {
          ...current,
          ...scoreSafeStudent,
          suspicionScore: scorePercentage(scoreSafeStudent),
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
        const scoreSafeStudent = mergeAuthoritativeStudent(current, student);
        return {
          ...current,
          ...scoreSafeStudent,
          suspicionScore: scorePercentage(scoreSafeStudent),
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
            score: percentage,
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
      socket.emit("join_exam_room", { examId }, (acknowledgement: { ok: boolean; message?: string }) => {
        if (!acknowledgement?.ok) {
          setSocketState("Reconnect pending");
          setError(acknowledgement?.message || "Could not subscribe to the live exam room.");
        }
      });
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
      mergeStudentUpdate(payload, "SCREEN_TELEMETRY_UPLOADED");
      const screenSrc = payload.screenBase64 || payload.base64 || payload.screenPreviewUrl || payload.previewUrl || payload.previewBase64;
      const payloadUpdatedAt = scoreUpdatedAt(payload);
      const receivedAt = Date.now();
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          activeStudents: current.activeStudents.map((item) =>
            item.studentId === payload.studentId && scoreUpdatedAt(item) <= payloadUpdatedAt
              ? { ...item, screenBase64: screenSrc, lastScreenUpdatedAt: receivedAt }
              : item
          ),
        };
      });
      setSelectedStudent((current) => {
        if (current && current.studentId === payload.studentId && scoreUpdatedAt(current) <= payloadUpdatedAt) {
          return { ...current, screenBase64: screenSrc, lastScreenUpdatedAt: receivedAt };
        }
        return current;
      });
      setFullscreenStudent((current) => {
        if (current && current.studentId === payload.studentId && scoreUpdatedAt(current) <= payloadUpdatedAt) {
          return { ...current, screenBase64: screenSrc, lastScreenUpdatedAt: receivedAt };
        }
        return current;
      });
    });

    // Register every listener before connecting so the authoritative room snapshot
    // cannot arrive during setup and be missed.
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [examId]);

  const sendCommand = (studentId: string, command: string, message?: string) => {
    if (!socketRef.current?.connected || !examId) {
      setCommandFeedback({ tone: "danger", message: "Live connection is unavailable. Reconnect before sending a proctoring command." });
      return;
    }
    const key = `${studentId}:${command}`;
    if (pendingCommandKeyRef.current) return;
    pendingCommandKeyRef.current = key;
    setPendingCommandKey(key);
    setCommandFeedback({ tone: "info", message: `Sending ${commandLabel(command)} to selected student.` });
    socketRef.current.timeout(10_000).emit(
      "teacher_command",
      {
        examId,
        studentId,
        command,
        message,
      },
      (timeoutError: Error | null, ack: any) => {
        if (pendingCommandKeyRef.current === key) pendingCommandKeyRef.current = "";
        setPendingCommandKey("");
        if (timeoutError) {
          const messageText = "The student did not acknowledge this command within 10 seconds.";
          setError(messageText);
          setCommandFeedback({ tone: "danger", message: messageText });
          return;
        }
        if (!ack?.ok) {
          const messageText = ack?.message || "Failed to transmit proctoring command.";
          setError(messageText);
          setCommandFeedback({ tone: "danger", message: messageText });
          return;
        }
        setCommandFeedback({ tone: "success", message: `${commandLabel(command)} sent to selected student.` });
      }
    );
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
  const offlineStudents = students.filter((student) => student.onlineStatus !== "ONLINE").length;
  const socketIssue = socketState === "Disconnected" || socketState === "Reconnect pending";
  const analytics = useMemo(() => {
    const suspicious = students.filter((student) => statusFromScore(scorePercentage(student)) === "SUSPICIOUS").length;
    const warning = students.filter((student) => statusFromScore(scorePercentage(student)) === "WARNING").length;
    const average = students.length ? Math.round(students.reduce((sum, student) => sum + scorePercentage(student), 0) / students.length) : 0;
    const online = students.filter((student) => student.onlineStatus === "ONLINE").length;
    const integrity = Math.max(0, Math.round(100 - average * 0.55 - suspicious * 4));
    return { suspicious, warning, average, online, integrity, alertsPerMinute: alertFeed.slice(0, 8).length };
  }, [alertFeed, students]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...students]
      .sort((first, second) => scorePercentage(second) - scorePercentage(first))
      .filter((student) => filter === "ALL" || statusFromScore(scorePercentage(student)) === filter)
      .filter((student) => {
        if (!term) return true;
        return [student.studentName, student.rollId, student.studentId].some((value) => value?.toLowerCase().includes(term));
      });
  }, [filter, search, students]);
  const topRiskStudent = visibleStudents[0];
  const topRiskScore = topRiskStudent ? scorePercentage(topRiskStudent) : 0;

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
        .sort((first, second) => scorePercentage(second) - scorePercentage(first))
        .slice(0, 10)
        .map((student) => ({ name: shortName(student.studentName || student.studentId), score: scorePercentage(student) })),
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
    <div className="space-y-5 text-slate-100 font-sans">
      <div className="sr-only" role="status" aria-live="polite">
        {socketState}. {loading ? "Loading live proctoring data." : `${students.length} active students. ${offlineStudents} offline.`}
        {commandFeedback ? ` ${commandFeedback.message}` : ""}
      </div>
      <section className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/20">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300" />
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_220px] lg:items-stretch lg:p-6">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em]",
                  socketState === "Live"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                )}
              >
                <Radio size={14} className={socketState === "Live" ? "motion-safe:animate-pulse" : ""} />
                {socketState}
              </span>
              <span className="rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-300">
                Synced {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "pending"}
              </span>
            </div>

            <h1 className="truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
              {data?.exam.title || exam?.title || "Live proctoring"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Monitor live streams, score changes, alerts, and review decisions from one focused exam console.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LiveStatCard icon={Users} label="Students" value={students.length} helper={`${analytics.online} online`} tone="cyan" />
              <LiveStatCard icon={AlertTriangle} label="Needs Review" value={analytics.suspicious} helper={`${analytics.warning} warnings`} tone="rose" />
              <LiveStatCard icon={Activity} label="Avg Score" value={`${analytics.average}/100`} helper="live suspicion" tone={analytics.average >= 70 ? "rose" : analytics.average >= 40 ? "amber" : "cyan"} />
              <LiveStatCard icon={ShieldCheck} label="Integrity" value={`${analytics.integrity}%`} helper={`${offlineStudents} offline`} tone="emerald" />
            </div>
          </div>

          <div className="flex rounded-lg border border-slate-800 bg-slate-900/70 p-4 lg:flex-col lg:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Operator State</p>
              <p className={cn("mt-2 text-2xl font-black", socketState === "Live" ? "text-emerald-300" : "text-amber-300")}>{socketState}</p>
              <p className="mt-1 text-xs text-slate-500">Live events and manual refresh share the same student score source.</p>
            </div>
            <button
              className="secondary-button mt-4 justify-center border-cyan-400/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
              type="button"
              onClick={() => loadLiveData()}
            >
              <RefreshCw size={17} /> Refresh now
            </button>
          </div>
        </div>
      </section>

      {activeAlert && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-400/25 bg-rose-500/10 p-4 shadow-lg shadow-rose-950/10" role="alert">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md border border-rose-400/25 bg-rose-400/10 text-rose-300">
              <ShieldX size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Critical warning raised</p>
              <p className="text-xs text-rose-200">
                {activeAlert.student} reached {activeAlert.score}/100: {activeAlert.msg}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setActiveAlert(null)}
            className="rounded border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-100 transition hover:bg-rose-400/10"
          >
            Acknowledge
          </button>
        </div>
      )}

      {socketIssue && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100" role="status" aria-live="polite">
          <p className="font-semibold">{socketState === "Reconnect pending" ? "Reconnecting to live events" : "Live event socket disconnected"}</p>
          <p className="mt-1 text-amber-100/80">The last synchronized student list remains visible until live events reconnect.</p>
        </div>
      )}

      {commandFeedback && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            commandFeedback.tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" :
              commandFeedback.tone === "danger" ? "border-rose-400/25 bg-rose-400/10 text-rose-100" :
                "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
          )}
          role="status"
          aria-live="polite"
        >
          {commandFeedback.message}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadLiveData} />}

      {exam && <AssignStudentsToExamPanel exam={exam} onExamUpdated={setExam} />}

      {!loading && !error && !data && (
        <EmptyState icon={Radio} title="No active exam selected" description="Open an exam's live view to monitor connected students." />
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden rounded-lg border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 bg-slate-900/70 p-4">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
                  <Eye size={18} className="text-cyan-300" />
                  Student Stream Grid
                </h2>
                <p className="text-xs text-slate-400">Sorted by live suspicion score, highest risk first.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,280px)_auto] sm:items-center">
                <div className="relative min-w-0">
                  <Eye className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <label className="sr-only" htmlFor="student-search">Search students</label>
                  <input id="student-search" className="field-input h-9 w-full bg-slate-950 border-slate-800 text-slate-202 text-xs pl-9 focus:border-cyan-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or ID..." />
                </div>
                <div className="grid grid-cols-4 rounded-md border border-slate-800 bg-slate-950 p-1" role="group" aria-label="Filter students by status">
                  {(["ALL", "SAFE", "WARNING", "SUSPICIOUS"] as FilterState[]).map((item) => (
                    <button
                      className={cn("h-7 rounded px-2 text-[10px] font-bold uppercase tracking-wide transition", filter === item ? "bg-cyan-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-slate-202 hover:bg-slate-800")}
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      aria-pressed={filter === item}
                    >
                      {item === "ALL" ? "All" : item.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-800 bg-slate-950/80 p-4">
            <div className="grid gap-3 text-xs md:grid-cols-3">
              <div className="min-h-14 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2">
                <p className="font-mono uppercase tracking-wider text-slate-500">Showing</p>
                <p className="mt-1 font-bold text-white">{visibleStudents.length} of {students.length} students</p>
              </div>
              <div className="min-h-14 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2">
                <p className="font-mono uppercase tracking-wider text-slate-500">Priority</p>
                <p className={cn("mt-1 truncate font-bold", topRiskScore >= 70 ? "text-red-300" : topRiskScore >= 40 ? "text-amber-300" : "text-emerald-300")}>
                  {topRiskStudent ? `${topRiskStudent.studentName || topRiskStudent.studentId} · ${topRiskScore}%` : "No live scores"}
                </p>
              </div>
              <div className="min-h-14 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2">
                <p className="font-mono uppercase tracking-wider text-slate-500">Ordering</p>
                <p className="mt-1 font-bold text-slate-200">Suspicious &gt; Warning &gt; Safe</p>
              </div>
            </div>
          </div>

          <div className="min-h-[640px] overflow-hidden bg-slate-950">
            {loading && Array.from({ length: 6 }).map((_, index) => <SkeletonBlock className="h-44 bg-slate-800 m-4" key={index} />)}
            {!loading && visibleStudents.length > 0 && (
              <VirtualGrid
                items={visibleStudents}
                itemHeight={292}
                height={640}
                minColumnWidth={286}
                gap={16}
                padding={16}
                keyExtractor={(student) => student.studentId}
                renderItem={(student, index) => (
                  <StudentTile
                    student={student}
                    rank={index + 1}
                    selected={selectedStudent?.studentId === student.studentId}
                    onSelect={setSelectedStudent}
                    onOpen={setFullscreenStudent}
                  />
                )}
              />
            )}
            {!loading && students.length === 0 && (
              <div className="p-8">
                <EmptyState icon={UserRound} title="No connected students" description="Students will appear here after they enter the exam and establish a live session." />
              </div>
            )}
            {!loading && students.length > 0 && visibleStudents.length === 0 && (
              <div className="p-8">
                <EmptyState icon={UserRound} title="No students match filters" description="Clear search or status filters to return to the active session list." />
              </div>
            )}
          </div>
        </Card>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
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
            pendingCommandKey={pendingCommandKey}
            commandFeedback={commandFeedback?.message || ""}
          />
        </aside>
      </section>

      <section className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="overflow-hidden rounded-lg border-slate-800 bg-slate-950">
          <PanelHeader
            icon={Activity}
            title="Risk Distribution"
            description="Highest current student scores."
          />
          <div className="h-56 p-4">
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
                  <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc" }} />
                  <Area dataKey="score" stroke="#ef4444" fill="url(#risk)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Activity} title="No score data yet" description="Telemetry curve is pending student registrations." />
            )}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden rounded-lg border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-white">
                  <FileText size={16} className="text-cyan-300" />
                  Violation Timeline
                </h2>
                <p className="text-xs text-slate-400">Recent alerts from the active session cache.</p>
              </div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="timeline-student-filter">Filter timeline by student</label>
              <select 
                id="timeline-student-filter"
                value={timelineStudentFilter} 
                onChange={(e) => setTimelineStudentFilter(e.target.value)}
                className="rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:border-cyan-400"
              >
                <option value="ALL">All Students</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentName}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="timeline-severity-filter">Filter timeline by severity</label>
              <select 
                id="timeline-severity-filter"
                value={timelineSeverityFilter} 
                onChange={(e) => setTimelineSeverityFilter(e.target.value)}
                className="rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:border-cyan-400"
              >
                <option value="ALL">All Severities</option>
                <option value="HIGH">High Severity</option>
                <option value="MEDIUM">Medium Severity</option>
                <option value="LOW">Low Severity</option>
              </select>
              </div>
            </div>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto p-4">
            {filteredTimelineAlerts.map((item) => (
              <div 
                className={cn(
                  "flex flex-col justify-between gap-3 rounded border p-3 text-xs transition sm:flex-row sm:items-center",
                  item.severity === "high"
                    ? "border-rose-500/20 bg-rose-500/10"
                    : item.severity === "medium"
                      ? "border-amber-500/20 bg-amber-500/10"
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
              <div className="grid min-h-40 place-items-center rounded border border-dashed border-slate-800 text-center">
                <p className="text-xs font-mono text-slate-500">No matching timeline alerts in the active session cache.</p>
              </div>
            )}
          </div>
        </Card>
      </section>

      {ENABLE_PROCTORING_TEST_TOOLS && (
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
      )}

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

function LiveStatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  tone: "cyan" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded border", toneClass)}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-800 bg-slate-900/70 p-4">
      <h2 className="flex items-center gap-2 text-base font-black text-white">
        <Icon size={16} className="text-cyan-300" />
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  );
}

function commandLabel(command: string) {
  return command
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
