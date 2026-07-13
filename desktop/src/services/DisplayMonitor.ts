import { getCurrentWindow, availableMonitors } from "../utils/tauri";

export type DisplayEventType = "DISPLAY_ADDED" | "DISPLAY_REMOVED" | "RESOLUTION_CHANGED";

export interface DisplayEvent {
  type: DisplayEventType;
  message: string;
  displayCount: number;
  timestamp: number;
}

export class DisplayMonitor {
  private lastMonitorsCount = 0;
  private lastResolutionStr = "";
  private pollIntervalId: number | null = null;
  private listeners: ((event: DisplayEvent) => void)[] = [];

  /**
   * Start polling Tauri window monitors configuration.
   */
  public async start(): Promise<void> {
    this.stop();

    try {
      const monitors = await availableMonitors();
      this.lastMonitorsCount = monitors.length;
      this.lastResolutionStr = await this.getCurrentResolutionString();

      // Poll every 3 seconds for display changes
      this.pollIntervalId = window.setInterval(async () => {
        await this.checkDisplayChanges();
      }, 3000);
    } catch (e) {
      console.warn("[DisplayMonitor] Failed to initialize display polling:", e);
    }
  }

  /**
   * Stop polling.
   */
  public stop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  public registerListener(callback: (event: DisplayEvent) => void): void {
    this.listeners.push(callback);
  }

  public unregisterListener(callback: (event: DisplayEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  /**
   * Query monitor state and emit events on configuration adjustments.
   */
  private async checkDisplayChanges(): Promise<void> {
    try {
      const monitors = await availableMonitors();
      const currentCount = monitors.length;
      const currentResolution = await this.getCurrentResolutionString();
      const timestamp = Date.now();

      // 1. Check Monitor Hot-Plug (Added)
      if (currentCount > this.lastMonitorsCount) {
        const diff = currentCount - this.lastMonitorsCount;
        this.emit({
          type: "DISPLAY_ADDED",
          message: `Connected ${diff} external display(s). Total displays: ${currentCount}.`,
          displayCount: currentCount,
          timestamp,
        });
      }
      
      // 2. Check Monitor Hot-Plug (Removed)
      else if (currentCount < this.lastMonitorsCount) {
        const diff = this.lastMonitorsCount - currentCount;
        this.emit({
          type: "DISPLAY_REMOVED",
          message: `Disconnected ${diff} external display(s). Total displays: ${currentCount}.`,
          displayCount: currentCount,
          timestamp,
        });
      }

      // 3. Check Primary Monitor Resolution / Orientation changes
      if (currentResolution !== this.lastResolutionStr) {
        this.emit({
          type: "RESOLUTION_CHANGED",
          message: `Primary display configuration changed. New: ${currentResolution}.`,
          displayCount: currentCount,
          timestamp,
        });
      }

      this.lastMonitorsCount = currentCount;
      this.lastResolutionStr = currentResolution;
    } catch (e) {
      console.warn("[DisplayMonitor] Failed to retrieve available monitors:", e);
    }
  }

  private async getCurrentResolutionString(): Promise<string> {
    try {
      const tWindow = getCurrentWindow();
      const scaleFactor = await tWindow.scaleFactor();
      const size = await tWindow.innerSize();
      
      // Return width x height combined with scale factor to detect orientations
      return `${size.width}x${size.height}@Scale${scaleFactor.toFixed(2)}`;
    } catch {
      return `${window.innerWidth}x${window.innerHeight}`;
    }
  }

  private emit(event: DisplayEvent): void {
    this.listeners.forEach((cb) => cb(event));
  }
}

export const displayMonitor = new DisplayMonitor();
