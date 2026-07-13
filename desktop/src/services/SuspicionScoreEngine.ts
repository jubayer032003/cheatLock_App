export interface SuspicionViolation {
  id: string;
  timestamp: number;
  eventType: string;
  sourceModule: string;
  scoreChange: number;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  reason: string;
  durationMs?: number;
}

export interface SuspicionWeights {
  faceMissing: number;
  multipleFaces: number;
  phoneDetected: number;
  bookDetected: number;
  speechDetected: number;
  windowSwitch: number;
  fullscreenExit: number;
  clipboardUsage: number;
  multiMonitor: number;
  livenessFailure: number;
}

export type RiskLevelType = "Normal" | "Low Risk" | "Moderate Risk" | "High Risk" | "Critical Risk";

export class SuspicionScoreEngine {
  private score = 0;
  private timeline: SuspicionViolation[] = [];
  private weights: SuspicionWeights = {
    faceMissing: 25,
    multipleFaces: 30,
    phoneDetected: 20,
    bookDetected: 15,
    speechDetected: 10,
    windowSwitch: 15,
    fullscreenExit: 15,
    clipboardUsage: 10,
    multiMonitor: 25,
    livenessFailure: 40,
  };

  private decayRatePerSec = 0.4; // Decay 0.4 points per second (2 points per 5 seconds)
  private lastEventTime = Date.now();

  constructor(customWeights?: Partial<SuspicionWeights>, decayRate?: number) {
    if (customWeights) {
      this.weights = { ...this.weights, ...customWeights };
    }
    if (decayRate !== undefined) {
      this.decayRatePerSec = decayRate;
    }
  }

  /**
   * Add and normalize a violation event, recalculating score and appending to timeline.
   */
  public addViolation(
    eventType: string,
    sourceModule: string,
    confidence: number,
    reason: string,
    durationMs?: number
  ): SuspicionViolation {
    const now = Date.now();
    this.lastEventTime = now;

    const scoreChange = this.getWeightForEvent(eventType);
    
    // Apply score addition capped at 100
    this.score = Math.min(100, this.score + scoreChange);

    const severity = this.calculateSeverity(scoreChange);

    const violation: SuspicionViolation = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: now,
      eventType,
      sourceModule,
      scoreChange,
      severity,
      confidence,
      reason,
      durationMs,
    };

    this.timeline.push(violation);

    // Keep timeline capped at latest 100 entries to prevent memory leak
    if (this.timeline.length > 100) {
      this.timeline.shift();
    }

    return violation;
  }

  /**
   * Apply score decay if no events occurred during the tick.
   */
  public tickDecay(elapsedSeconds: number): number {
    const now = Date.now();
    // Only decay if it's been at least 5 seconds since the last violation event
    if (now - this.lastEventTime < 5000) {
      return this.score;
    }

    const decayAmount = this.decayRatePerSec * elapsedSeconds;
    this.score = Math.max(0, parseFloat((this.score - decayAmount).toFixed(1)));
    return this.score;
  }

  public getScore(): number {
    return this.score;
  }

  public getTimeline(): SuspicionViolation[] {
    return [...this.timeline];
  }

  public getRiskLevel(): RiskLevelType {
    if (this.score <= 20) return "Normal";
    if (this.score <= 40) return "Low Risk";
    if (this.score <= 60) return "Moderate Risk";
    if (this.score <= 80) return "High Risk";
    return "Critical Risk";
  }

  /**
   * Explain current suspicion contributions.
   */
  public getExplanations(): { module: string; contribution: number; count: number }[] {
    const contributions: Map<string, { sum: number; count: number }> = new Map();

    this.timeline.forEach((v) => {
      const existing = contributions.get(v.sourceModule) || { sum: 0, count: 0 };
      contributions.set(v.sourceModule, {
        sum: existing.sum + v.scoreChange,
        count: existing.count + 1,
      });
    });

    return Array.from(contributions.entries()).map(([module, data]) => ({
      module,
      contribution: data.sum,
      count: data.count,
    }));
  }

  public reset() {
    this.score = 0;
    this.timeline = [];
    this.lastEventTime = Date.now();
  }

  private getWeightForEvent(eventType: string): number {
    switch (eventType) {
      case "FACE_MISSING":
        return this.weights.faceMissing;
      case "MULTIPLE_FACES_DETECTED":
        return this.weights.multipleFaces;
      case "PHONE_DETECTED":
        return this.weights.phoneDetected;
      case "BOOK_DETECTED":
        return this.weights.bookDetected;
      case "VOICE_DETECTED":
      case "speech_detected":
        return this.weights.speechDetected;
      case "WINDOW_BLURRED":
      case "app_switch":
        return this.weights.windowSwitch;
      case "FULLSCREEN_EXITED":
        return this.weights.fullscreenExit;
      case "CLIPBOARD_COPIED":
        return this.weights.clipboardUsage;
      case "DISPLAY_ADDED":
      case "DISPLAY_REMOVED":
        return this.weights.multiMonitor;
      case "LIVENESS_FAILED":
        return this.weights.livenessFailure;
      default:
        return 5; // Default minor infraction weight
    }
  }

  private calculateSeverity(scoreChange: number): "low" | "medium" | "high" | "critical" {
    if (scoreChange >= 35) return "critical";
    if (scoreChange >= 20) return "high";
    if (scoreChange >= 10) return "medium";
    return "low";
  }
}
export const suspicionScoreEngine = new SuspicionScoreEngine();
