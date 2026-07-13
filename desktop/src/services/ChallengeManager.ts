import { FaceMetrics } from "./LandmarkAnalyzer";

export type LivenessAction = "BLINK" | "SMILE" | "TURN_LEFT" | "TURN_RIGHT" | "LOOK_UP" | "LOOK_DOWN";

export interface ChallengeState {
  actions: LivenessAction[];
  currentActionIdx: number;
  timeRemainingSec: number;
  status: "idle" | "running" | "completed" | "failed";
  retryCount: number;
}

export class ChallengeManager {
  private static readonly CHALLENGE_ACTIONS: LivenessAction[] = [
    "BLINK",
    "SMILE",
    "TURN_LEFT",
    "TURN_RIGHT",
    "LOOK_UP",
    "LOOK_DOWN",
  ];

  /**
   * Generate a new challenge sequence choosing 2-3 random actions.
   */
  public static generateChallenge(retryCount = 0): ChallengeState {
    const list = [...this.CHALLENGE_ACTIONS];
    const size = Math.floor(Math.random() * 2) + 2; // Choose 2 or 3 actions
    const selected: LivenessAction[] = [];

    for (let i = 0; i < size; i++) {
      const idx = Math.floor(Math.random() * list.length);
      selected.push(list.splice(idx, 1)[0]);
    }

    return {
      actions: selected,
      currentActionIdx: 0,
      timeRemainingSec: 10, // 10 seconds timeout limit
      status: "running",
      retryCount,
    };
  }

  /**
   * Evaluate face metrics against the active challenge threshold.
   */
  public static evaluateAction(action: LivenessAction, metrics: FaceMetrics): boolean {
    // Check for spoofing / frozen webcam replay attacks first
    if (metrics.replayScore === 0) {
      return false; // Reject frozen feeds instantly
    }

    switch (action) {
      case "BLINK":
        // Eye openness drops below 40% (more forgiving for small eyes/low lighting)
        return metrics.eyeOpenness < 0.40;
      case "SMILE":
        // Smile score stretches past 40%
        return metrics.smileScore > 0.40;
      case "TURN_LEFT":
        // Yaw skew turns to left side (relaxed bounds)
        return metrics.yaw > 0.18;
      case "TURN_RIGHT":
        // Yaw skew turns to right side (relaxed bounds)
        return metrics.yaw < -0.18;
      case "LOOK_UP":
        // Pitch turns upward (relaxed bounds)
        return metrics.pitch > 0.18;
      case "LOOK_DOWN":
        // Pitch turns downward (relaxed bounds)
        return metrics.pitch < -0.18;
      default:
        return false;
    }
  }

  /**
   * Formats action strings into student-friendly instructions.
   */
  public static getInstruction(action: LivenessAction): string {
    switch (action) {
      case "BLINK":
        return "Blink your eyes twice";
      case "SMILE":
        return "Smile widely at the camera";
      case "TURN_LEFT":
        return "Slowly turn your head left";
      case "TURN_RIGHT":
        return "Slowly turn your head right";
      case "LOOK_UP":
        return "Look upwards";
      case "LOOK_DOWN":
        return "Look downwards";
      default:
        return "";
    }
  }
}
