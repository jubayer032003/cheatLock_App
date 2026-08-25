import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  CameraOff,
  Monitor,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  TerminalSquare,
} from "lucide-react";
import { Button } from "../components/Button";
import {
  NativeDeviceService,
  type NativeGdiCaptureAttemptDiagnostic,
  type NativeHardwareDiagnostics,
  type NativeScreenCaptureDiagnostic,
  type NativeScreenCaptureStatus,
  type NativeScreenSessionDiagnostics,
} from "../services/NativeDeviceService";

const DEBUG_EXAM_ID = "dev-screen-diagnostic";

interface SampleMetadata {
  displayId: string;
  width: number;
  height: number;
  encoding: string;
  pixelSourceFormat: string;
  sequenceNumber: number;
  capturedAt: string;
  sizeBytes: number;
}

type BusyAction = "refresh" | "start" | "stop" | "restart" | "diagnose" | "sample" | null;

export function NativeScreenDiagnosticsPage() {
  const [hardware, setHardware] = useState<NativeHardwareDiagnostics | null>(null);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const [status, setStatus] = useState<NativeScreenCaptureStatus | null>(null);
  const [captureDiagnostic, setCaptureDiagnostic] = useState<NativeScreenCaptureDiagnostic | null>(null);
  const [sessionDiagnostic, setSessionDiagnostic] = useState<NativeScreenSessionDiagnostics | null>(null);
  const [sample, setSample] = useState<SampleMetadata | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>("Not started");

  const displays = hardware?.displays ?? [];
  const primaryDisplay = useMemo(() => displays.find((display) => display.isPrimary) ?? displays[0] ?? null, [displays]);
  const selectedDisplay = useMemo(
    () => displays.find((display) => display.id === selectedDisplayId) ?? primaryDisplay,
    [displays, primaryDisplay, selectedDisplayId]
  );
  const canUseCapture = Boolean(selectedDisplay);

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  useEffect(() => {
    if (!status || !["starting", "active", "degraded"].includes(status.state)) return;
    const timer = window.setInterval(() => {
      void refreshStatusOnly();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status?.state]);

  async function runAction(action: BusyAction, label: string, work: () => Promise<void>) {
    setBusy(action);
    setLastError(null);
    try {
      await work();
      setLastAction(label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      setLastAction(`${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function refreshDiagnostics() {
    await runAction("refresh", "Diagnostics refreshed", async () => {
      const [nextHardware, nextStatus, nextSession] = await Promise.all([
        NativeDeviceService.getNativeHardwareDiagnostics(),
        NativeDeviceService.getNativeScreenCaptureStatus(),
        NativeDeviceService.getNativeScreenSessionDiagnostics(),
      ]);
      setHardware(nextHardware);
      setStatus(nextStatus);
      setSessionDiagnostic(nextSession);
      const nextPrimary = nextHardware.displays.find((display) => display.isPrimary) ?? nextHardware.displays[0] ?? null;
      setSelectedDisplayId((current) =>
        current && nextHardware.displays.some((display) => display.id === current) ? current : nextPrimary?.id ?? null
      );
    });
  }

  async function refreshStatusOnly() {
    try {
      setStatus(await NativeDeviceService.getNativeScreenCaptureStatus());
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }

  async function startCapture() {
    if (!selectedDisplay) return;
    await runAction("start", "Native capture started", async () => {
      await NativeDeviceService.startNativeScreenCapture({
        displayId: selectedDisplay.id,
        sampleIntervalMs: 1000,
        activeExamId: DEBUG_EXAM_ID,
      });
      setStatus(await NativeDeviceService.getNativeScreenCaptureStatus());
    });
  }

  async function stopCapture(action: BusyAction = "stop", label = "Native capture stopped") {
    await runAction(action, label, async () => {
      await NativeDeviceService.stopNativeScreenCapture();
      setStatus(await NativeDeviceService.getNativeScreenCaptureStatus());
    });
  }

  async function restartCapture() {
    if (!selectedDisplay) return;
    await runAction("restart", "Native capture restarted", async () => {
      await NativeDeviceService.stopNativeScreenCapture();
      await NativeDeviceService.startNativeScreenCapture({
        displayId: selectedDisplay.id,
        sampleIntervalMs: 1000,
        activeExamId: DEBUG_EXAM_ID,
      });
      setStatus(await NativeDeviceService.getNativeScreenCaptureStatus());
    });
  }

  async function runCaptureDiagnostic() {
    await runAction("diagnose", "Capture diagnostic completed", async () => {
      const [nextCaptureDiagnostic, nextSessionDiagnostic, nextStatus] = await Promise.all([
        NativeDeviceService.diagnoseNativeScreenCapture(),
        NativeDeviceService.getNativeScreenSessionDiagnostics(),
        NativeDeviceService.getNativeScreenCaptureStatus(),
      ]);
      setCaptureDiagnostic(nextCaptureDiagnostic);
      setSessionDiagnostic(nextSessionDiagnostic);
      setStatus(nextStatus);
    });
  }

  async function captureSampleMetadata() {
    await runAction("sample", "One compressed sample metadata captured", async () => {
      const nextSample = await NativeDeviceService.captureNativeScreenSample();
      if (!nextSample) {
        setSample(null);
        throw new Error("No compressed native screen sample is available yet.");
      }
      const { data: _discardedPngBytes, ...metadata } = nextSample;
      setSample(metadata);
      setStatus(await NativeDeviceService.getNativeScreenCaptureStatus());
    });
  }

  return (
    <div className="h-full overflow-auto bg-surface-base text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-5">
        <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-accent">
              <TerminalSquare size={14} />
              Development diagnostics
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Native Screen Capture Gate</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              GDI lifecycle validation for display selection, diagnostics, one compressed sample metadata read, stop, and restart.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={refreshDiagnostics} isLoading={busy === "refresh"}>
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={runCaptureDiagnostic} isLoading={busy === "diagnose"}>
              <Activity size={16} />
              Diagnose
            </Button>
          </div>
        </header>

        {lastError && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
            {lastError}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Display Selection" icon={<Monitor size={16} />}>
            <div className="grid gap-3">
              <label className="text-xs font-mono uppercase tracking-wider text-zinc-500" htmlFor="native-display">
                Primary display
              </label>
              <select
                id="native-display"
                className="h-10 rounded-md border border-border bg-surface-overlay px-3 text-sm text-zinc-100 outline-none focus:border-accent"
                value={selectedDisplay?.id ?? ""}
                onChange={(event) => setSelectedDisplayId(event.target.value || null)}
              >
                {displays.length === 0 && <option value="">No displays reported</option>}
                {displays.map((display) => (
                  <option key={display.id} value={display.id}>
                    {display.label} {display.isPrimary ? "(primary)" : ""}
                  </option>
                ))}
              </select>
              <MetadataGrid
                rows={[
                  ["Backend", "Windows GDI native capture"],
                  ["Display ID", selectedDisplay?.id ?? "none"],
                  ["Coordinates", selectedDisplay ? `${selectedDisplay.x}, ${selectedDisplay.y}` : "none"],
                  ["Dimensions", selectedDisplay ? `${selectedDisplay.width} x ${selectedDisplay.height}` : "none"],
                  ["Hardware checked", hardware?.checkedAt ?? "pending"],
                ]}
              />
            </div>
          </Panel>

          <Panel title="Lifecycle" icon={<Activity size={16} />}>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={startCapture} disabled={!canUseCapture} isLoading={busy === "start"}>
                <Play size={16} />
                Start
              </Button>
              <Button variant="secondary" onClick={() => stopCapture()} isLoading={busy === "stop"}>
                <Square size={16} />
                Stop
              </Button>
              <Button variant="secondary" onClick={restartCapture} disabled={!canUseCapture} isLoading={busy === "restart"}>
                <RotateCcw size={16} />
                Restart
              </Button>
              <Button variant="secondary" onClick={captureSampleMetadata} isLoading={busy === "sample"}>
                <CameraOff size={16} />
                Sample
              </Button>
            </div>
            <div className="mt-4 rounded-md border border-border bg-surface-overlay px-3 py-2 text-xs text-zinc-400">
              Last action: <span className="text-zinc-200">{lastAction}</span>
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Panel title="Service State">
            <MetadataGrid
              rows={[
                ["State", status?.state ?? "pending"],
                ["Health", status?.message ?? "pending"],
                ["Frame count", String(status?.frameCount ?? 0)],
                ["Latest frame", status?.latestFrameTimestamp ?? "none"],
                ["Latest sequence", valueOrNone(status?.latestFrameSequence)],
                ["Last native error", status?.lastError ?? status?.errorCode ?? "none"],
              ]}
            />
          </Panel>

          <Panel title="Sample Metadata">
            <MetadataGrid
              rows={[
                ["Sample byte size", valueOrNone(sample?.sizeBytes)],
                ["Sample width", valueOrNone(sample?.width)],
                ["Sample height", valueOrNone(sample?.height)],
                ["Encoding", sample?.encoding ?? "none"],
                ["Pixel source", sample?.pixelSourceFormat ?? "none"],
                ["Captured at", sample?.capturedAt ?? "none"],
              ]}
            />
          </Panel>

          <Panel title="Session Diagnostics">
            <MetadataGrid
              rows={[
                ["Process ID", valueOrNone(sessionDiagnostic?.processId)],
                ["Current session", valueOrNone(sessionDiagnostic?.currentSessionId)],
                ["Active console", valueOrNone(sessionDiagnostic?.activeConsoleSessionId)],
                ["Matches active", boolOrUnknown(sessionDiagnostic?.sessionMatchesActiveConsole)],
                ["Input desktop", boolOrUnknown(sessionDiagnostic?.interactiveDesktopOpened)],
                ["Elevated", boolOrUnknown(sessionDiagnostic?.elevated)],
                ["Integrity", sessionDiagnostic?.integrityLevel ?? "not collected"],
              ]}
            />
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Session Errors">
            <MetadataGrid
              rows={[
                ["Session error", sessionDiagnostic?.currentSessionError ?? "none"],
                ["Desktop error", sessionDiagnostic?.interactiveDesktopError ?? "none"],
                ["Elevation error", sessionDiagnostic?.elevationError ?? "none"],
                ["Integrity error", sessionDiagnostic?.integrityError ?? "none"],
              ]}
            />
          </Panel>

          <Panel title="GDI Attempts">
            <div className="grid gap-2">
              {captureDiagnostic?.attempts.length ? (
                captureDiagnostic.attempts.map((attempt) => (
                  <AttemptRow key={attempt.sourceStrategy} attempt={attempt} />
                ))
              ) : (
                <p className="text-sm text-zinc-500">No capture diagnostic has been run in this view.</p>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function MetadataGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[150px_1fr] gap-3 rounded-md bg-surface-overlay px-3 py-2">
          <dt className="text-xs font-mono uppercase tracking-wider text-zinc-500">{label}</dt>
          <dd className="break-words text-zinc-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AttemptRow({ attempt }: { attempt: NativeGdiCaptureAttemptDiagnostic }) {
  const succeeded = attempt.captureBltSucceeded || attempt.srccopySucceeded;
  return (
    <div className="rounded-md border border-border bg-surface-overlay p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-xs text-zinc-200">{attempt.sourceStrategy}</div>
        <div className={`rounded-md px-2 py-1 text-xs ${succeeded ? "bg-success/15 text-green-200" : "bg-danger/15 text-red-200"}`}>
          {succeeded ? "capture path succeeded" : "capture path failed"}
        </div>
      </div>
      <MetadataGrid
        rows={[
          ["Source DC", boolOrUnknown(attempt.sourceDcAcquired)],
          ["Source handle", String(attempt.sourceDcHandle ?? 0)],
          ["RC_BITBLT", boolOrUnknown(attempt.sourceSupportsBitblt)],
          ["Memory DC", boolOrUnknown(attempt.memoryDcCreated)],
          ["Bitmap", boolOrUnknown(attempt.bitmapCreated)],
          ["Selected", boolOrUnknown(attempt.objectSelected)],
          ["CAPTUREBLT", attempt.captureBltSucceeded ? "ok" : valueOrNone(attempt.captureBltError)],
          ["SRCCOPY", attempt.srccopySucceeded ? "ok" : valueOrNone(attempt.srccopyError)],
          ["PNG bytes", valueOrNone(attempt.pngByteLength)],
          ["Error stage", attempt.errorStage ?? "none"],
          ["Win32 error", valueOrNone(attempt.win32Error)],
        ]}
      />
    </div>
  );
}

function valueOrNone(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "none";
  return String(value);
}

function boolOrUnknown(value: boolean | null | undefined) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}
