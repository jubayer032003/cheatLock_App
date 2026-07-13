import { DetectionProposal } from "./NMSProcessor";

export type ObjectViolationType = 
  | "PHONE_DETECTED" 
  | "BOOK_DETECTED" 
  | "TABLET_DETECTED" 
  | "CALCULATOR_DETECTED" 
  | "MULTIPLE_PROHIBITED_OBJECTS"
  | "OBJECT_REMOVED"
  | "OBJECT_PERSISTING";

export interface ObjectViolationEvent {
  type: ObjectViolationType;
  classLabel: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  durationMs: number;
  timestamp: number;
  message: string;
}

export class ObjectViolationManager {
  private activeDurations: Map<string, {
    startTime: number;
    lastSeenTime: number;
    hasFiredDetected: boolean;
    lastPersistTime: number;
    proposal: DetectionProposal;
  }> = new Map();

  private readonly VALIDATION_DURATION_MS = 3000; // Require 3 seconds continuous presence
  private readonly COOLDOWN_DURATION_MS = 1500;   // Cooldown buffer for frame drops
  private readonly PERSIST_INTERVAL_MS = 5000;    // Trigger PERSISTING alerts every 5 seconds

  private listeners: ((event: ObjectViolationEvent) => void)[] = [];

  public registerListener(callback: (event: ObjectViolationEvent) => void) {
    this.listeners.push(callback);
  }

  public unregisterListener(callback: (event: ObjectViolationEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  /**
   * Process a list of filtered detections from the active frame.
   */
  public tick(detections: DetectionProposal[]) {
    const now = Date.now();
    const seenClasses = new Set<string>();

    // 1. Process current detections
    detections.forEach((det) => {
      seenClasses.add(det.classLabel);
      const state = this.activeDurations.get(det.classLabel);

      if (!state) {
        // First time seeing this class in this sequence
        this.activeDurations.set(det.classLabel, {
          startTime: now,
          lastSeenTime: now,
          hasFiredDetected: false,
          lastPersistTime: now,
          proposal: det,
        });
      } else {
        // Update presence track
        state.lastSeenTime = now;
        state.proposal = det; // Keep latest bounding box
        
        const duration = now - state.startTime;

        // If continuous presence exceeds threshold and warning has not fired yet
        if (duration >= this.VALIDATION_DURATION_MS && !state.hasFiredDetected) {
          state.hasFiredDetected = true;
          state.lastPersistTime = now;

          this.emit(this.createViolationType(det.classLabel), det, duration, `${det.classLabel} detected in exam environment.`);
        }

        // If warning has already fired, and it persists for another interval
        if (state.hasFiredDetected && now - state.lastPersistTime >= this.PERSIST_INTERVAL_MS) {
          state.lastPersistTime = now;
          this.emit("OBJECT_PERSISTING", det, duration, `${det.classLabel} continues to persist in environment.`);
        }
      }
    });

    // 2. Scan active tracks for disappeared objects
    this.activeDurations.forEach((state, classLabel) => {
      if (now - state.lastSeenTime > this.COOLDOWN_DURATION_MS) {
        // Object has been missing past the cooldown buffer - fire OBJECT_REMOVED
        if (state.hasFiredDetected) {
          this.emit("OBJECT_REMOVED", state.proposal, now - state.startTime, `${classLabel} removed from exam environment.`);
        }
        this.activeDurations.delete(classLabel);
      }
    });

    // 3. Check for multiple prohibited items simultaneously
    const activeAlerts = Array.from(this.activeDurations.values()).filter(s => s.hasFiredDetected);
    if (activeAlerts.length > 1 && seenClasses.size > 1) {
      const firstActive = activeAlerts[0].proposal;
      this.emit("MULTIPLE_PROHIBITED_OBJECTS", firstActive, now - activeAlerts[0].startTime, "Multiple prohibited objects detected.");
    }
  }

  public reset() {
    this.activeDurations.clear();
    this.listeners = [];
  }

  private createViolationType(classLabel: string): ObjectViolationType {
    switch (classLabel) {
      case "Mobile Phone":
        return "PHONE_DETECTED";
      case "Book":
      case "Notebook":
      case "Paper Notes":
        return "BOOK_DETECTED";
      case "Tablet":
        return "TABLET_DETECTED";
      case "Calculator":
        return "CALCULATOR_DETECTED";
      default:
        return "PHONE_DETECTED"; // Fallback mapping
    }
  }

  private emit(type: ObjectViolationType, det: DetectionProposal, duration: number, message: string) {
    const event: ObjectViolationEvent = {
      type,
      classLabel: det.classLabel,
      confidence: det.confidence,
      boundingBox: {
        x: det.x,
        y: det.y,
        width: det.width,
        height: det.height,
      },
      durationMs: duration,
      timestamp: Date.now(),
      message,
    };
    this.listeners.forEach((cb) => cb(event));
  }
}
export const objectViolationManager = new ObjectViolationManager();
