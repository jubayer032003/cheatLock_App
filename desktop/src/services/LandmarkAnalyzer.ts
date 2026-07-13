import { FaceDetection } from "./FaceDetector";

export interface FaceMetrics {
  eyeOpenness: number; // 0 (closed) to 1 (fully open)
  smileScore: number;  // 0 (neutral) to 1 (wide smile)
  yaw: number;         // -1 (turned right) to +1 (turned left)
  pitch: number;       // -1 (looking down) to +1 (looking up)
  roll: number;        // Head tilt angle in degrees
  replayScore: number; // Frame change indicator (0 = static/frozen, >0 = natural movement)
}

export class LandmarkAnalyzer {
  private static lastFramePixels: Uint8ClampedArray | null = null;
  private static stableFrameCount = 0;

  /**
   * Analyze canvas pixels within a face box to compute landmark metrics.
   */
  public static analyze(
    ctx: CanvasRenderingContext2D,
    detection: FaceDetection,
    width: number,
    height: number
  ): FaceMetrics {
    const rLeftEye = detection.landmarks[0];
    const rRightEye = detection.landmarks[1];

    // 1. Calculate Roll Angle (eye tilt)
    const dy = rRightEye.y - rLeftEye.y;
    const dx = rRightEye.x - rLeftEye.x;
    const roll = Math.atan2(dy, dx) * (180 / Math.PI);

    // 2. Crop Face area to run structural change checks (anti-replay)
    const cropX = Math.max(0, detection.x);
    const cropY = Math.max(0, detection.y);
    const cropW = Math.min(width - cropX, detection.width);
    const cropH = Math.min(height - cropY, detection.height);

    let replayScore = 0.5; // Default normal movement score
    try {
      const facePixels = ctx.getImageData(cropX, cropY, cropW, cropH).data;
      if (this.lastFramePixels && this.lastFramePixels.length === facePixels.length) {
        let diffSum = 0;
        const total = facePixels.length;
        
        // Sample every 4th pixel to keep CPU usage low
        for (let i = 0; i < total; i += 16) {
          diffSum += Math.abs(facePixels[i] - this.lastFramePixels[i]);
        }
        const meanDiff = diffSum / (total / 16);
        
        // If mean difference is extremely close to 0 (e.g. < 0.3 out of 255), frame is frozen or static
        if (meanDiff < 0.3) {
          this.stableFrameCount++;
          if (this.stableFrameCount > 6) {
            replayScore = 0; // Frozen/Replay detected
          }
        } else {
          this.stableFrameCount = 0;
          replayScore = Math.min(1.0, meanDiff / 10.0); // Natural change mapping
        }
      }
      // Keep copy of current pixels for next frame check
      this.lastFramePixels = new Uint8ClampedArray(facePixels);
    } catch {
      // Fallback
    }

    // 3. Compute Yaw (Head turn left/right)
    // Frontal face eye distance proportion center:
    // Estimate nose position. Normally nose tip is centered vertically and horizontally
    const noseEstimate = {
      x: detection.x + detection.width * 0.5,
      y: detection.y + detection.height * 0.55,
    };
    const distToLeftEye = noseEstimate.x - rLeftEye.x;
    const distToRightEye = rRightEye.x - noseEstimate.x;
    const eyeDistSum = distToLeftEye + distToRightEye;
    
    // Yaw offset ratio
    const yaw = eyeDistSum > 0 ? (distToLeftEye / eyeDistSum - 0.5) * 4 : 0;

    // 4. Compute Pitch (Looking up/down)
    const eyeMidY = (rLeftEye.y + rRightEye.y) / 2;
    const verticalOffset = noseEstimate.y - eyeMidY;
    const expectedOffset = detection.height * 0.15;
    const pitch = expectedOffset > 0 ? (verticalOffset / expectedOffset - 1) * 3 : 0;

    // 5. Compute Smile (mouth corners stretching)
    // Mouth is located in the bottom 30% of the face bounding box
    const mouthY = Math.round(detection.y + detection.height * 0.72);
    const mouthH = Math.round(detection.height * 0.12);
    const mouthW = Math.round(detection.width * 0.45);
    const mouthX = Math.round(detection.x + detection.width * 0.28);

    let smileScore = 0.1; // Default neutral expression
    try {
      const mouthImg = ctx.getImageData(
        Math.max(0, mouthX),
        Math.max(0, mouthY),
        Math.min(width - mouthX, mouthW),
        Math.min(height - mouthY, mouthH)
      );
      const mPixels = mouthImg.data;
      
      // Calculate luminance contrast in mouth region
      // Wide smiles expand width and expose teeth (high contrast/white peaks)
      let contrast = 0;
      let minL = 255;
      let maxL = 0;
      for (let i = 0; i < mPixels.length; i += 8) {
        const l = 0.299 * mPixels[i] + 0.587 * mPixels[i + 1] + 0.114 * mPixels[i + 2];
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
      contrast = maxL - minL;
      // High contrast variance in mouth region denotes wide teeth exposure or wide lips opening
      smileScore = Math.max(0.1, Math.min(1.0, contrast / 180.0));
    } catch {}

    // 6. Compute Eye Openness (Blinks)
    // Look at contrast around the left eye area
    let eyeOpenness = 0.8; // Default open state
    try {
      const eyeSize = Math.round(detection.width * 0.12);
      const eyeImg = ctx.getImageData(
        Math.max(0, Math.round(rLeftEye.x - eyeSize / 2)),
        Math.max(0, Math.round(rLeftEye.y - eyeSize / 2)),
        Math.min(width - Math.round(rLeftEye.x - eyeSize / 2), eyeSize),
        Math.min(height - Math.round(rLeftEye.y - eyeSize / 2), eyeSize)
      );
      const ePixels = eyeImg.data;
      
      let darkPixelsCount = 0;
      // Eyes closed reduces contrast and pupil (dark iris) exposure
      for (let i = 0; i < ePixels.length; i += 4) {
        const l = 0.299 * ePixels[i] + 0.587 * ePixels[i + 1] + 0.114 * ePixels[i + 2];
        if (l < 65) darkPixelsCount++; // Count dark iris pixels
      }
      // If dark iris pixel count drops below threshold, eye is closed (blink)
      eyeOpenness = darkPixelsCount > (ePixels.length / 4) * 0.08 ? 1.0 : 0.05;
    } catch {}

    return {
      eyeOpenness,
      smileScore,
      yaw: Math.max(-1, Math.min(1, yaw)),
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll,
      replayScore,
    };
  }
}
