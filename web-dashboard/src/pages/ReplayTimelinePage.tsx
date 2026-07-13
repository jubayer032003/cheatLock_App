import {
  Download,
  Image,
  SlidersHorizontal,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Bookmark,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Volume2,
  Monitor,
  Camera,
  Search,
  ChevronRight,
  Eye,
  HelpCircle,
  HelpCircle as QuestionIcon,
  Activity,
  ShieldX
} from "lucide-react";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchProctoringTimeline, fetchSessions, fetchTeacherExam, updateIntegrityReview } from "../lib/api";
import type { ExamSessionStatus, ProctoringTimelineResponse, TimelineEvent, IntegrityDecision } from "../types";
import {
  Badge,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  ProgressMeter,
  SkeletonBlock,
  cn,
} from "../components/ui";

type ReplayFilter = "all" | "suspicious" | "high" | "bookmarked";
type ReplayStudent = {
  studentId: string;
  studentName?: string;
  status: ExamSessionStatus | "NOT_STARTED";
  suspicionScore?: number;
  examId?: string;
};

export function ReplayTimelinePage() {
  const { examId = "" } = useParams();
  const [students, setStudents] = useState<ReplayStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [timeline, setTimeline] = useState<ProctoringTimelineResponse | null>(null);
  const [filter, setFilter] = useState<ReplayFilter>("all");
  const [message, setMessage] = useState("");

  // Replay Engine States
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4 | 8>(1);
  const timerRef = useRef<number | null>(null);

  // Persistence States
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [reviewedEvents, setReviewedEvents] = useState<string[]>([]);
  const [privateNotes, setPrivateNotes] = useState("");
  const [integrityDecision, setIntegrityDecision] = useState<IntegrityDecision>("PENDING");
  const [savingReview, setSavingReview] = useState(false);

  // Timeline list search
  const [timelineSearch, setTimelineSearch] = useState("");

  // Load students belonging to exam
  const loadStudents = useCallback(() => {
    Promise.all([fetchTeacherExam(examId), fetchSessions()])
      .then(([exam, items]) => {
        const examSessions = items.filter((session) => String(session.examId || "") === examId);
        const sessionMap = new Map(examSessions.map((session) => [session.studentId, session]));
        const studentIds = new Set<string>([
          ...(exam.assignedStudents || []),
          ...(exam.communityStudents || []),
          ...examSessions.map((session) => session.studentId),
        ]);
        const mergedStudents = [...studentIds]
          .filter(Boolean)
          .map((studentId) => {
            const session = sessionMap.get(studentId);
            return {
              studentId,
              studentName: session?.studentName || studentId,
              status: session?.status || "NOT_STARTED",
              suspicionScore: session?.suspicionScore || 0,
              examId,
            };
          })
          .sort((first, second) => (second.suspicionScore || 0) - (first.suspicionScore || 0));
        setStudents(mergedStudents);
        if (!selectedStudentId && mergedStudents.length > 0) {
          setSelectedStudentId(mergedStudents[0].studentId);
        }
      })
      .catch(() => setMessage("Could not load students."));
  }, [examId, selectedStudentId]);

  useEffect(() => {
    loadStudents();
  }, [examId]);

  // Load student timeline details
  const loadTimeline = useCallback(() => {
    if (!examId || !selectedStudentId) {
      setTimeline(null);
      return;
    }
    setIsPlaying(false);
    setPlayheadIndex(0);
    fetchProctoringTimeline(examId, selectedStudentId)
      .then((res) => {
        setTimeline(res);
        setBookmarks(res.review?.bookmarks || []);
        setReviewedEvents(res.review?.reviewedEvents || []);
        setPrivateNotes(res.review?.notes || "");
        setIntegrityDecision(res.review?.decision || "PENDING");
      })
      .catch(() => setMessage("Could not load replay timeline."));
  }, [examId, selectedStudentId]);

  useEffect(() => {
    loadTimeline();
  }, [examId, selectedStudentId]);

  // Playback loop manager
  useEffect(() => {
    if (isPlaying) {
      const eventsLength = timeline?.timelineEvents.length || 0;
      const intervalDelay = 1500 / playbackSpeed;
      
      timerRef.current = window.setInterval(() => {
        setPlayheadIndex((prev) => {
          if (prev >= eventsLength - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalDelay);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, timeline]);

  // Filter events
  const filteredEvents = useMemo(() => {
    const events = timeline?.timelineEvents || [];
    let list = events;

    if (filter === "high") {
      list = events.filter((event) => event.severity === "high");
    } else if (filter === "suspicious") {
      list = events.filter((event) => event.suspicionScore >= 40 || event.severity !== "low");
    } else if (filter === "bookmarked") {
      list = events.filter((event) => bookmarks.includes(event.id));
    }

    if (timelineSearch.trim()) {
      const term = timelineSearch.toLowerCase();
      list = list.filter((event) =>
        event.alertMessage.toLowerCase().includes(term) ||
        event.eventType.toLowerCase().includes(term)
      );
    }

    return list;
  }, [filter, timelineSearch, timeline?.timelineEvents, bookmarks]);

  // Current active event at playhead
  const currentEvent = useMemo(() => {
    const events = timeline?.timelineEvents || [];
    return events[playheadIndex] || null;
  }, [timeline?.timelineEvents, playheadIndex]);

  // Find latest screen snapshot preview up to playhead
  const latestScreenSnapshot = useMemo(() => {
    const events = timeline?.timelineEvents || [];
    for (let i = playheadIndex; i >= 0; i--) {
      const ev = events[i];
      if (ev?.eventType === "screen_telemetry_uploaded" && ev.previewBase64) {
        return ev.previewBase64;
      }
    }
    return null;
  }, [timeline?.timelineEvents, playheadIndex]);

  // Automated AI Summary Narrative Generator
  const aiNarrative = useMemo(() => {
    if (!timeline || timeline.timelineEvents.length === 0) {
      return "No proctoring event telemetry recorded for this student yet.";
    }

    const events = timeline.timelineEvents;
    const score = timeline.finalSuspicionScore;
    const highAlerts = events.filter((e) => e.severity === "high");
    const appSwitches = events.filter((e) => e.eventType.includes("WINDOW_BLURRED") || e.eventType.includes("focus"));
    const phoneDetections = events.filter((e) => e.alertMessage.includes("Phone") || e.alertMessage.includes("PHONE"));
    const speechDetections = events.filter((e) => e.eventType.includes("VOICE") || e.alertMessage.includes("Speech"));

    let text = `Student entered the proctoring environment with an initial score of 0. `;
    
    if (highAlerts.length > 0) {
      text += `During the session, the AI detector triggered ${highAlerts.length} high-severity event(s). `;
    } else {
      text += `Throughout the exam, the student maintained consistent engagement with no critical violations. `;
    }

    if (phoneDetections.length > 0) {
      text += `A prohibited item (Mobile Phone) was flagged for a duration of several seconds, causing a score increase. `;
    }
    if (appSwitches.length > 0) {
      text += `The system recorded ${appSwitches.length} instance(s) of browser window switches or exiting fullscreen, suggesting workspace distraction. `;
    }
    if (speechDetections.length > 0) {
      text += `DSP audio engine captured human speech signals in the room, incrementing suspicion levels temporarily. `;
    }

    if (score >= 70) {
      text += `Due to multiple compounding anomalies, the final suspicion score escalated to ${score} (Critical Risk). Instructor review and verification is recommended before grading.`;
    } else if (score >= 40) {
      text += `The final score concluded at ${score} (Moderate Warning). Overall behavior indicates minor anomalies.`;
    } else {
      text += `The session finished with a final suspicion score of ${score} (Normal Risk). The compliance logs support a clean exam pass.`;
    }

    return text;
  }, [timeline]);

  // AI Explanation Card info for current event
  const eventExplanation = useMemo(() => {
    if (!currentEvent) return null;
    const type = currentEvent.eventType;
    let rule = "Default scoring multiplier";
    let explanation = "Scoring weight was added based on proctoring event rules.";
    let mod = "Proctor Central";

    if (type.includes("FACE_MISSING")) {
      mod = "Biometric Face Recognition";
      rule = "Face Presence Enforcement";
      explanation = "Webcam frame did not capture any face landmarks within the tracking area. Indicates the student has left the webcam scope.";
    } else if (type.includes("MULTIPLE_FACES")) {
      mod = "Biometric Face Recognition";
      rule = "Single Occupancy Verification";
      explanation = "Tracking mesh detected more than one human face profile simultaneously. Indicates third-party presence in room.";
    } else if (type.includes("PHONE") || currentEvent.alertMessage.includes("Phone")) {
      mod = "YOLOv8n Object Detector";
      rule = "Prohibited Device Warning";
      explanation = "Deep learning object detection box matched class label 'Mobile Phone' with high confidence. Device was visible for >= 3 seconds.";
    } else if (type.includes("VOICE") || type.includes("SPEECH")) {
      mod = "Intelligent VAD Engine";
      rule = "Speech Activity Lock";
      explanation = "Offline voice activity detector identified speech patterns exceeding the calibrated environmental noise threshold.";
    } else if (type.includes("WINDOW_BLURRED")) {
      mod = "Kiosk Security Shield";
      rule = "Browser Focus Constraint";
      explanation = "Exam window lost active focus, indicating student opened another window, workspace app, or pressed ALT+TAB.";
    } else if (type.includes("MONITOR") || type.includes("display")) {
      mod = "Screen Capture Manager";
      rule = "Multi-Monitor Detection";
      explanation = "Query on available monitors returned an count > 1. External monitors must be unplugged during testing.";
    }

    return {
      module: mod,
      rule,
      explanation,
      score: currentEvent.suspicionScore,
      severity: currentEvent.severity,
    };
  }, [currentEvent]);

  // Save Notes and Flags
  const handleSaveReviewDetails = async () => {
    if (!examId || !selectedStudentId) return;
    setSavingReview(true);
    try {
      await updateIntegrityReview(examId, selectedStudentId, integrityDecision, privateNotes, {
        bookmarks,
        reviewedEvents,
      });
      setMessage("Review details saved successfully.");
      loadTimeline();
    } catch {
      setMessage("Failed to save integrity review flags.");
    } finally {
      setSavingReview(false);
    }
  };

  const toggleBookmark = (eventId: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      // Save changes immediately
      updateIntegrityReview(examId, selectedStudentId, integrityDecision, privateNotes, {
        bookmarks: next,
        reviewedEvents,
      });
      return next;
    });
  };

  const toggleReviewed = (eventId: string) => {
    setReviewedEvents((prev) => {
      const next = prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      // Save changes immediately
      updateIntegrityReview(examId, selectedStudentId, integrityDecision, privateNotes, {
        bookmarks,
        reviewedEvents: next,
      });
      return next;
    });
  };

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* Header Banner */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">Exam Replay Timeline</p>
        <h2 className="mt-1 text-xl font-bold text-white tracking-wider">{timeline?.exam.title || "Replay Timeline"}</h2>
        <p className="mt-2 text-xs text-slate-400">Review student compliance timeline, playback snapshots, and commit review verdicts.</p>
      </section>

      {/* Main Grid: Left sidebar student list, Right replay deck */}
      <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
        
        {/* Student list card */}
        <aside className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden flex flex-col max-h-[800px]">
          <div className="border-b border-slate-800 p-4 bg-slate-950">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Students</h3>
            <p className="text-[10px] text-slate-400">Select candidate to inspect replay</p>
          </div>
          <div className="divide-y divide-slate-800 overflow-y-auto flex-1">
            {students.map((session) => (
              <button
                className={`w-full px-4 py-3 text-left hover:bg-slate-800 flex items-center justify-between gap-3 transition ${
                  selectedStudentId === session.studentId ? "bg-slate-800/80 border-l-2 border-violet-500" : ""
                }`}
                key={`${session.studentId}-${session.examId || ""}`}
                onClick={() => setSelectedStudentId(session.studentId)}
                type="button"
              >
                <div>
                  <p className="text-xs font-bold text-white">{session.studentName || session.studentId}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{session.studentId}</p>
                </div>
                <div className="text-right font-mono">
                  <span className={`text-xs font-bold ${
                    session.suspicionScore && session.suspicionScore >= 70 
                      ? "text-red-400" 
                      : session.suspicionScore && session.suspicionScore >= 40 
                        ? "text-amber-400" 
                        : "text-emerald-400"
                  }`}>
                    {session.suspicionScore || 0}%
                  </span>
                </div>
              </button>
            ))}
            {students.length === 0 && <p className="p-4 text-xs text-slate-500 text-center font-mono">No student records found.</p>}
          </div>
        </aside>

        {/* Replay Details Deck */}
        <main className="space-y-6">
          
          {/* AI Exam Summary Card */}
          <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  {timeline?.student.studentName || selectedStudentId || "No student selected"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">Student ID: {selectedStudentId}</p>
              </div>
              
              <div className="flex gap-2">
                <button
                  className="secondary-button bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300 transition text-xs py-1.5 px-3 rounded"
                  disabled={!timeline}
                  type="button"
                  onClick={() => timeline && exportStudentPdf(timeline, filteredEvents, false)}
                >
                  Print Report
                </button>
                <button
                  className="primary-button bg-violet-600 hover:bg-violet-700 text-white transition text-xs py-1.5 px-3 rounded flex items-center gap-1.5"
                  disabled={!timeline}
                  type="button"
                  onClick={() => timeline && exportStudentPdf(timeline, filteredEvents, true)}
                >
                  <Download size={13} />
                  Download PDF
                </button>
              </div>
            </div>

            {/* AI Summary narrative text */}
            <div className="bg-slate-950 border border-slate-800 rounded p-4 flex flex-col gap-2">
              <span className="text-[9px] uppercase tracking-wider text-violet-400 font-mono font-bold">Concise AI behavior Summary</span>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">{aiNarrative}</p>
            </div>
          </Card>

          {/* Session Replay Player Component */}
          <Card className="p-5 bg-slate-900 border-slate-850 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Play size={14} className="text-violet-400" />
                Session Replay player
              </h3>
              
              {/* Playback speed selector */}
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-500">Speed:</span>
                {([1, 2, 4, 8] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={cn(
                      "px-2 py-0.5 rounded border text-[10px]",
                      playbackSpeed === speed ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Dual-feeds (Webcam & Screen) */}
            <div className="grid gap-4 md:grid-cols-2">
              
              {/* Webcam Viewport */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1"><Camera size={12} /> Proctor Webcam Capture</span>
                <div className="aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative flex items-center justify-center">
                  {currentEvent?.previewUrl || currentEvent?.previewBase64 ? (
                    <img 
                      className="h-full w-full object-cover" 
                      src={currentEvent.previewUrl || currentEvent.previewBase64} 
                      alt="Proctor Webcam" 
                    />
                  ) : (
                    <div className="text-slate-650 text-xs font-mono">No camera frame at playhead</div>
                  )}
                  {/* Watermark overlay */}
                  <div className="absolute bottom-2 left-2 bg-slate-950/80 border border-slate-800 rounded px-1.5 py-0.5 text-[8px] font-mono text-slate-400">
                    Playhead: {playheadIndex + 1} / {timeline?.timelineEvents.length || 0}
                  </div>
                </div>
              </div>

              {/* Desktop Screen Viewport */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1"><Monitor size={12} /> Desktop Screen snapshot</span>
                <div className="aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative flex items-center justify-center">
                  {latestScreenSnapshot ? (
                    <img 
                      className="h-full w-full object-contain bg-black" 
                      src={latestScreenSnapshot} 
                      alt="Screen snapshot" 
                    />
                  ) : (
                    <div className="text-slate-650 text-xs font-mono">No desktop snapshots recorded</div>
                  )}
                </div>
              </div>
            </div>

            {/* Replay Controls & Seek bar */}
            <div className="flex flex-col gap-3 pt-3 border-t border-slate-800">
              
              {/* Range seek slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-500 shrink-0">Seek</span>
                <input 
                  type="range"
                  min={0}
                  max={Math.max(0, (timeline?.timelineEvents.length || 1) - 1)}
                  value={playheadIndex}
                  onChange={(e) => setPlayheadIndex(Number(e.target.value))}
                  className="flex-1 accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-300 w-12 text-right shrink-0">
                  {playheadIndex + 1}/{timeline?.timelineEvents.length || 0}
                </span>
              </div>

              {/* Play, Pause, Jumps controls */}
              <div className="flex justify-center items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPlayheadIndex((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
                  title="Step Backward"
                >
                  <SkipBack size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg flex items-center justify-center transition"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setPlayheadIndex((p) => Math.min((timeline?.timelineEvents.length || 1) - 1, p + 1))}
                  className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
                  title="Step Forward"
                >
                  <SkipForward size={14} />
                </button>
              </div>
            </div>

            {/* Playhead Event Info / AI Explanation Panel */}
            {eventExplanation && (
              <div className="bg-slate-950 border border-slate-800 rounded p-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-red-950/20 border border-red-500/20 text-red-400 rounded">
                      {eventExplanation.severity} severity
                    </span>
                    <span className="text-xs font-bold text-white font-mono">{formatEventName(currentEvent?.eventType || "")}</span>
                  </div>
                  <span className="text-xs font-bold text-violet-400 font-mono">
                    Score Impact: +{eventExplanation.score}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3 text-xs font-mono border-t border-slate-900 pt-3">
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">AI Module</span>
                    <span className="text-slate-300 font-bold">{eventExplanation.module}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Rule Triggered</span>
                    <span className="text-slate-300 font-bold">{eventExplanation.rule}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Event Time</span>
                    <span className="text-slate-300 font-bold">
                      {currentEvent ? new Date(currentEvent.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-sans border-t border-slate-900 pt-3">
                  <span className="font-bold text-slate-300">Explanation:</span> {eventExplanation.explanation}
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-slate-900 text-xs">
                  <button
                    type="button"
                    onClick={() => currentEvent && toggleBookmark(currentEvent.id)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded border transition font-mono text-[10px]",
                      currentEvent && bookmarks.includes(currentEvent.id)
                        ? "bg-amber-950/20 border-amber-500/30 text-amber-400 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <Bookmark size={11} /> {currentEvent && bookmarks.includes(currentEvent.id) ? "Bookmarked" : "Bookmark Incident"}
                  </button>
                  <button
                    type="button"
                    onClick={() => currentEvent && toggleReviewed(currentEvent.id)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded border transition font-mono text-[10px]",
                      currentEvent && reviewedEvents.includes(currentEvent.id)
                        ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <CheckCircle2 size={11} /> {currentEvent && reviewedEvents.includes(currentEvent.id) ? "Marked Reviewed" : "Mark Reviewed"}
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Risk Evolution Over Time Chart */}
          <ScoreChart events={filteredEvents} />

          {/* Teacher Review flags & comments notes */}
          <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <FileText size={14} className="text-violet-400" />
              Teacher Session Review
            </h3>
            
            <div className="grid gap-4 md:grid-cols-[180px_1fr] text-xs">
              <div className="flex flex-col gap-1.5">
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Compliance Verdict</span>
                <select 
                  value={integrityDecision} 
                  onChange={(e) => setIntegrityDecision(e.target.value as IntegrityDecision)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                >
                  <option value="PENDING">Pending Review</option>
                  <option value="CLEAN">Clean Pass</option>
                  <option value="REVIEW_NEEDED">Review Needed</option>
                  <option value="DISQUALIFIED">Disqualify Student</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Private Notes & Comments</span>
                <textarea 
                  placeholder="Enter notes explaining the review verdict..." 
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 placeholder-slate-700 resize-none focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
            <button 
              type="button"
              disabled={savingReview}
              onClick={() => selectedStudentId && handleSaveReviewDetails()}
              className="mt-2 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold transition flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
            >
              {savingReview ? "Saving Changes..." : "Commit Integrity Verdict"}
            </button>
          </Card>

          {/* Filter Timeline Events List */}
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm">Chronological Event Logs ({filteredEvents.length})</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Click any event to seek playhead to that timestamp.</p>
              </div>
              
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="text" 
                  placeholder="Search events description..."
                  value={timelineSearch}
                  onChange={(e) => setTimelineSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs rounded pl-8 pr-2.5 py-1.5 sm:w-48 text-slate-300 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2 text-xs">
              <button 
                onClick={() => setFilter("all")}
                className={cn("px-3 py-1.5 rounded transition uppercase font-mono text-[10px] border", filter === "all" ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200")}
              >
                All events
              </button>
              <button 
                onClick={() => setFilter("suspicious")}
                className={cn("px-3 py-1.5 rounded transition uppercase font-mono text-[10px] border", filter === "suspicious" ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200")}
              >
                Only suspicious
              </button>
              <button 
                onClick={() => setFilter("high")}
                className={cn("px-3 py-1.5 rounded transition uppercase font-mono text-[10px] border", filter === "high" ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200")}
              >
                Only high severity
              </button>
              <button 
                onClick={() => setFilter("bookmarked")}
                className={cn("px-3 py-1.5 rounded transition uppercase font-mono text-[10px] border", filter === "bookmarked" ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200")}
              >
                Bookmarked ({bookmarks.length})
              </button>
            </div>

            {/* Event list items */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredEvents.map((event, index) => {
                const isBookmarked = bookmarks.includes(event.id);
                const isReviewed = reviewedEvents.includes(event.id);
                const originalIndex = timeline?.timelineEvents.findIndex((e) => e.id === event.id) ?? index;
                
                return (
                  <button 
                    className={cn(
                      "w-full rounded-lg border p-3.5 text-left transition relative flex gap-3 select-none outline-none focus:ring-1 focus:ring-violet-500",
                      originalIndex === playheadIndex 
                        ? "border-violet-500 bg-slate-800/40 shadow-sm" 
                        : "border-slate-850 bg-slate-950/40 hover:border-slate-700"
                    )}
                    key={event.id}
                    onClick={() => setPlayheadIndex(originalIndex)}
                    type="button"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isBookmarked && <Bookmark size={12} className="text-amber-500 fill-amber-500" />}
                          {isReviewed && <CheckCircle2 size={12} className="text-emerald-500" />}
                          <span className="font-bold text-white text-xs">{formatEventName(event.eventType)}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-350">{event.alertMessage || "Active focus check."}</p>
                      
                      <div className="flex items-center gap-2 pt-1">
                        <span className={`text-[8.5px] uppercase font-mono px-1.5 py-0.5 rounded ${severityClass(event.severity)}`}>
                          {event.severity}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Score: {event.suspicionScore}/100</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center text-slate-600">
                      <ChevronRight size={16} />
                    </div>
                  </button>
                );
              })}
              {filteredEvents.length === 0 && (
                <p className="py-6 text-xs text-slate-500 font-mono text-center">No events match the selected filters.</p>
              )}
            </div>
          </section>
        </main>
      </section>

      {message && <p className="text-xs text-rose-500 font-mono text-center">{message}</p>}
    </div>
  );
}

function severityClass(severity: string) {
  if (severity === "high") return "bg-red-950/20 border border-red-500/30 text-red-400";
  if (severity === "medium") return "bg-amber-950/20 border border-amber-500/30 text-amber-400";
  return "bg-slate-900 border border-slate-800 text-slate-400";
}

function formatEventName(eventType: string) {
  return eventType.split("_").join(" ");
}

function ScoreChart({ events }: { events: TimelineEvent[] }) {
  const points = events.filter((event) => event.eventType === "suspicion_score_updated" || event.suspicionScore > 0);
  const data = points.map((event, index) => ({
    name: `${index + 1}`,
    score: event.suspicionScore,
  }));

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-4 font-bold text-white text-sm tracking-wider flex items-center gap-2">
        <Activity className="text-violet-400" size={16} />
        Suspicion Score Risk Evolution
      </h3>
      <div className="h-56 rounded-lg bg-slate-950 p-3">
        {points.length === 0 && <p className="self-center text-xs text-slate-500 font-mono text-center py-20">No suspicion score changes logged.</p>}
        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="replayScore" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} style={{ fontSize: "10px" }} />
              <YAxis domain={[0, 100]} stroke="#64748b" tickLine={false} axisLine={false} width={25} style={{ fontSize: "10px" }} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#f8fafc" }} />
              <Area dataKey="score" stroke="#8b5cf6" fill="url(#replayScore)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function FullscreenStudent({ student, detailTab, setDetailTab }: { student: ProctoringTimelineResponse; detailTab: "camera" | "screen"; setDetailTab: (tab: "camera" | "screen") => void }) {
  return null; // Left for dialog wrapper
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function exportStudentPdf(timeline: ProctoringTimelineResponse, events: TimelineEvent[], isDownload: boolean = false) {
  const score = timeline.finalSuspicionScore;
  const riskLevel = score >= 70 ? "SUSPICIOUS" : score >= 30 ? "WARNING" : "SAFE";
  
  let gaugeClass = "gauge-safe";
  let badgeClass = "gauge-safe-badge";
  if (riskLevel === "SUSPICIOUS") {
    gaugeClass = "gauge-suspicious";
    badgeClass = "gauge-suspicious-badge";
  } else if (riskLevel === "WARNING") {
    gaugeClass = "gauge-warning";
    badgeClass = "gauge-warning-badge";
  }

  const analysisMethodologyText = "The CheatLock AI monitoring engine records student exam sessions by continuously checking face tracking patterns, browser focus app-switching metrics, tab switching, and network disconnections. Severity weights are compiled automatically to compute a composite suspicion rating (0-100). Higher metrics indicate a higher probability of non-compliance. Instructors review the logged events to make final determination.";

  const htmlContent = `
    <html>
      <head>
        <title>CheatLock Replay Report - ${escapeHtml(timeline.student.studentName || timeline.student.studentId)}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #0f172a !important;
            background-color: #ffffff !important;
            padding: 24px;
            width: 720px;
            margin: 0 auto;
            line-height: 1.45;
          }
          html.dark body {
            background-color: #ffffff !important;
            color: #0f172a !important;
          }
          html.dark th,
          html.dark td,
          html.dark h1,
          html.dark h2,
          html.dark h3,
          html.dark h4,
          html.dark h5,
          html.dark p,
          html.dark span:not(.event-badge):not(.gauge-status):not(.kpi-card-value):not(.gauge-score),
          html.dark div:not(.logo-icon):not(.gauge):not(.summary-kpi-card):not(.event-image-container) {
            color: #1e293b !important;
          }
          .meta-box {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
            border: 1px solid #e2e8f0 !important;
          }
          .gauge-box {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
          }
          .method-box {
            border-left: 4px solid #7c3aed !important;
            background: #f5f3ff !important;
            border-top: 1px solid #e9e3ff !important;
            border-right: 1px solid #e9e3ff !important;
            border-bottom: 1px solid #e9e3ff !important;
          }
          .summary-kpi-card {
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
          }
          .event-card {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            page-break-inside: avoid !important;
          }
          .badge-low { background: #d1fae5 !important; color: #065f46 !important; border: 1px solid #a7f3d0 !important; }
          .badge-medium { background: #fef3c7 !important; color: #92400e !important; border: 1px solid #fde68a !important; }
          .badge-high { background: #ffe4e6 !important; color: #9f1239 !important; border: 1px solid #fecdd3 !important; }
          .gauge-safe { background: #ecfdf5 !important; border-color: #10b981 !important; color: #047857 !important; }
          .gauge-safe-badge { background: #d1fae5 !important; color: #065f46 !important; border: 1px solid #a7f3d0 !important; }
          .gauge-warning { background: #fffbeb !important; border-color: #f59e0b !important; color: #b45309 !important; }
          .gauge-warning-badge { background: #fef3c7 !important; color: #92400e !important; border: 1px solid #fde68a !important; }
          .gauge-suspicious { background: #fff1f2 !important; border-color: #ef4444 !important; color: #be123c !important; }
          .gauge-suspicious-badge { background: #ffe4e6 !important; color: #9f1239 !important; border: 1px solid #fecdd3 !important; }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #7c3aed;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .logo-area {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo-icon {
            background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
            color: #ffffff;
            border-radius: 8px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          }
          .logo-icon svg {
            width: 22px;
            height: 22px;
            stroke: currentColor;
          }
          .logo-text h1 {
            font-size: 20px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            letter-spacing: -0.02em;
          }
          .logo-text p {
            font-size: 9px;
            font-weight: 700;
            margin: 1px 0 0 0;
            color: #7c3aed;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .badge-audit {
            background: #f5f3ff;
            border: 1px solid #ddd6fe;
            color: #6d28d9;
            font-size: 10px;
            font-weight: 800;
            padding: 5px 14px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
          }
          .meta-box {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 18px;
          }
          .meta-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
          }
          .meta-item:last-child {
            border-bottom: none;
          }
          .meta-label {
            color: #64748b;
            font-weight: 600;
          }
          .meta-val {
            color: #0f172a;
            font-weight: 700;
          }
          .gauge-box {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 18px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }
          .gauge {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            border: 4px solid;
          }
          .gauge-score {
            font-size: 18px;
            font-weight: 900;
            line-height: 1;
          }
          .gauge-lbl {
            font-size: 7px;
            font-weight: 800;
            letter-spacing: 0.05em;
          }
          .gauge-status {
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            padding: 3px 10px;
            border-radius: 9999px;
          }
          .method-box {
            border-left: 4px solid #7c3aed;
            background: #f5f3ff;
            border-top: 1px solid #e9e3ff;
            border-right: 1px solid #e9e3ff;
            border-bottom: 1px solid #e9e3ff;
            border-radius: 8px;
            padding: 14px 16px;
            margin-bottom: 24px;
            font-size: 11px;
            color: #4c1d95;
            line-height: 1.5;
          }
          .method-box strong {
            color: #6d28d9;
            display: block;
            margin-bottom: 4px;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.05em;
          }
          .stats-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .summary-kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 8px;
            text-align: center;
          }
          .kpi-card-title {
            font-size: 8.5px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            margin-bottom: 4px;
          }
          .kpi-card-value {
            font-size: 18px;
            font-weight: 800;
          }
          .events-section-title {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
            margin-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 8px;
          }
          .timeline-container {
            position: relative;
            padding-left: 28px;
            margin-left: 8px;
            border-left: 2px solid #e2e8f0;
          }
          .timeline-item {
            position: relative;
            margin-bottom: 20px;
          }
          .timeline-item:last-child {
            margin-bottom: 0;
          }
          .timeline-node {
            position: absolute;
            left: -37px;
            top: 14px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 3.5px solid #cbd5e1;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            z-index: 10;
          }
          .node-low { border-color: #10b981; background: #d1fae5; }
          .node-medium { border-color: #f59e0b; background: #fef3c7; }
          .node-high { border-color: #ef4444; background: #ffe4e6; }
          .event-card {
            border-radius: 10px;
            padding: 16px;
            border: 1px solid #e2e8f0;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }
          .event-card-low { border-left: 4px solid #10b981; }
          .event-card-medium { border-left: 4px solid #f59e0b; }
          .event-card-high { border-left: 4px solid #ef4444; }
          .event-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
          }
          .event-title {
            font-size: 13px;
            font-weight: 700;
            text-transform: capitalize;
            color: #0f172a;
          }
          .event-time {
            font-size: 10.5px;
            color: #64748b;
            font-weight: 500;
          }
          .event-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
          }
          .event-badge {
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 4px;
            letter-spacing: 0.03em;
          }
          .badge-low { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
          .badge-medium { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
          .badge-high { background: #ffe4e6; color: #9f1239; border: 1px solid #fecdd3; }
          .event-score-tag {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
          }
          .event-body {
            font-size: 11.5px;
            color: #334155;
            margin: 8px 0 0 0;
            line-height: 1.45;
          }
          .event-image-container {
            margin-top: 12px;
            display: inline-block;
          }
          .event-image {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            max-height: 140px;
            max-width: 240px;
            object-fit: cover;
            display: block;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          }
          .footer-sign {
            margin-top: 32px;
            border-top: 2px solid #e2e8f0;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 9.5px;
            color: #64748b;
          }
          .sign-line {
            border-bottom: 1.5px solid #94a3b8;
            width: 180px;
            text-align: center;
            padding-bottom: 4px;
            font-weight: 600;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="logo-area">
            <div class="logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 11 2 2 4-4"/>
              </svg>
            </div>
            <div class="logo-text">
              <h1>CheatLock Replay Report</h1>
              <p>AI Automated Proctoring System</p>
            </div>
          </div>
          <div>
            <span class="badge-audit">Official Replay Audit</span>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-box">
            <div class="meta-item">
              <span class="meta-label">Exam Title:</span>
              <span class="meta-val">${escapeHtml(timeline.exam.title)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Student Name:</span>
              <span class="meta-val">${escapeHtml(timeline.student.studentName || timeline.student.studentId)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Student ID:</span>
              <span class="meta-val font-mono">${escapeHtml(timeline.student.studentId)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Session Status:</span>
              <span class="meta-val">${escapeHtml(timeline.student.status)}</span>
            </div>
          </div>

          <div class="gauge-box">
            <div class="gauge ${gaugeClass}">
              <span class="gauge-lbl">SCORE</span>
              <span class="gauge-score">${score}</span>
            </div>
            <span class="gauge-status ${badgeClass}">${riskLevel}</span>
          </div>
        </div>

        <div class="method-box">
          <strong>Proctoring Integrity Methodology</strong>
          ${analysisMethodologyText}
        </div>

        <div class="stats-summary-grid">
          <div class="summary-kpi-card">
            <div class="kpi-card-title">Total Logged Events</div>
            <div class="kpi-card-value" style="color: #7c3aed;">${events.length}</div>
          </div>
          <div class="summary-kpi-card">
            <div class="kpi-card-title">High Severity Alerts</div>
            <div class="kpi-card-value" style="color: #ef4444;">${events.filter(e => e.severity === 'high').length}</div>
          </div>
          <div class="summary-kpi-card">
            <div class="kpi-card-title">Medium Severity Alerts</div>
            <div class="kpi-card-value" style="color: #f59e0b;">${events.filter(e => e.severity === 'medium').length}</div>
          </div>
          <div class="summary-kpi-card">
            <div class="kpi-card-title">Compliance Verdict</div>
            <div class="kpi-card-value" style="color: ${riskLevel === 'SUSPICIOUS' ? '#ef4444' : riskLevel === 'WARNING' ? '#f59e0b' : '#10b981'};">
              ${riskLevel === 'SUSPICIOUS' ? 'Suspicious' : riskLevel === 'WARNING' ? 'Warning' : 'Clean'}
            </div>
          </div>
        </div>

        <div class="events-section-title">Timeline Events Logs (${events.length})</div>
        
        <div class="timeline-container">
          ${events
            .map((event) => {
              let cardClass = "event-card-low";
              let badgeColor = "badge-low";
              let nodeColor = "node-low";
              if (event.severity === "high") {
                cardClass = "event-card-high";
                badgeColor = "badge-high";
                nodeColor = "node-high";
              } else if (event.severity === "medium") {
                cardClass = "event-card-medium";
                badgeColor = "badge-medium";
                nodeColor = "node-medium";
              }

              return `
                <div class="timeline-item">
                  <div class="timeline-node ${nodeColor}"></div>
                  <div class="event-card ${cardClass}">
                    <div class="event-header">
                      <div>
                        <span class="event-title">${escapeHtml(formatEventName(event.eventType))}</span>
                        <div class="event-meta">
                          <span class="event-badge ${badgeColor}">${event.severity}</span>
                          <span class="event-score-tag">Risk Index: ${event.suspicionScore}/100</span>
                        </div>
                      </div>
                      <span class="event-time">${new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    <p class="event-body">${escapeHtml(event.alertMessage || "No alert message recorded.")}</p>
                    ${
                      event.previewUrl || event.previewBase64
                        ? `<div class="event-image-container">
                             <img class="event-image" src="${event.previewUrl || event.previewBase64}" alt="Camera Preview Snapshot" />
                           </div>`
                        : ""
                    }
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="footer-sign">
          <div>
            <strong>CheatLock AI Replay Audit</strong><br/>
            This document is a certified record of the proctoring logs.
          </div>
          <div>
            <div class="sign-line">Instructor Signature</div>
          </div>
          <div>
            <div class="sign-line">Date</div>
          </div>
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  if (isDownload) {
    // Let browser prompt print immediately, which supports saving as PDF
    printWindow.focus();
    printWindow.print();
  } else {
    printWindow.focus();
    printWindow.print();
  }
}
