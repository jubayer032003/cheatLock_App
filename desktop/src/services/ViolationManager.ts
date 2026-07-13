export type VoiceViolationType = "VOICE_DETECTED" | "CONTINUOUS_SPEECH" | "MIC_DISCONNECTED" | "MIC_MUTED";

export interface VoiceViolationEvent {
  type: VoiceViolationType;
  speechProbability: number;
  consecutiveSeconds: number;
  message: string;
  timestamp: number;
}

/**
 * Stateful violation logic for voice activity.
 * Tracks consecutive seconds of speech above threshold and
 * escalates through warning tiers.
 */
export class ViolationManager {
  private static readonly SPEECH_THRESHOLD = 80;       // Speech probability > 80%
  private static readonly VOICE_DETECTED_SEC = 5;      // 5 consecutive seconds → VOICE_DETECTED
  private static readonly CONTINUOUS_SPEECH_SEC = 15;   // 15 consecutive seconds → CONTINUOUS_SPEECH

  private consecutiveSpeechSeconds = 0;
  private lastTickTime = 0;
  private voiceDetectedFired = false;
  private continuousSpeechFired = false;

  private listeners: ((event: VoiceViolationEvent) => void)[] = [];

  public registerListener(cb: (event: VoiceViolationEvent) => void) {
    this.listeners.push(cb);
  }

  public unregisterListener(cb: (event: VoiceViolationEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  /**
   * Called every ~1 second with the latest speech probability.
   */
  public tick(speechProbability: number) {
    const now = Date.now();

    // Debounce: ignore if called faster than 800ms
    if (this.lastTickTime && now - this.lastTickTime < 800) return;
    this.lastTickTime = now;

    if (speechProbability > ViolationManager.SPEECH_THRESHOLD) {
      this.consecutiveSpeechSeconds++;

      // Tier 1: VOICE_DETECTED after 5 consecutive seconds
      if (
        this.consecutiveSpeechSeconds >= ViolationManager.VOICE_DETECTED_SEC &&
        !this.voiceDetectedFired
      ) {
        this.voiceDetectedFired = true;
        this.emit({
          type: "VOICE_DETECTED",
          speechProbability,
          consecutiveSeconds: this.consecutiveSpeechSeconds,
          message: "Human speech detected in exam environment.",
          timestamp: now,
        });
      }

      // Tier 2: CONTINUOUS_SPEECH after 15 consecutive seconds
      if (
        this.consecutiveSpeechSeconds >= ViolationManager.CONTINUOUS_SPEECH_SEC &&
        !this.continuousSpeechFired
      ) {
        this.continuousSpeechFired = true;
        this.emit({
          type: "CONTINUOUS_SPEECH",
          speechProbability,
          consecutiveSeconds: this.consecutiveSpeechSeconds,
          message: "Sustained human speech detected — potential communication violation.",
          timestamp: now,
        });
      }
    } else {
      // Reset counters when speech drops below threshold
      this.consecutiveSpeechSeconds = 0;
      this.voiceDetectedFired = false;
      this.continuousSpeechFired = false;
    }
  }

  /**
   * Emit a microphone health violation (disconnect, muted).
   */
  public emitHealthViolation(type: "MIC_DISCONNECTED" | "MIC_MUTED") {
    this.emit({
      type,
      speechProbability: 0,
      consecutiveSeconds: 0,
      message:
        type === "MIC_DISCONNECTED"
          ? "Microphone has been disconnected during the exam."
          : "Microphone has been muted during the exam.",
      timestamp: Date.now(),
    });
  }

  public reset() {
    this.consecutiveSpeechSeconds = 0;
    this.voiceDetectedFired = false;
    this.continuousSpeechFired = false;
    this.listeners = [];
  }

  private emit(event: VoiceViolationEvent) {
    this.listeners.forEach((cb) => cb(event));
  }
}
