import { describe, expect, it } from "vitest";
import { FaceRecognitionService } from "./FaceRecognitionService";

describe("FaceRecognitionService", () => {
  it("fails closed when no registered descriptor is available", () => {
    const service = new FaceRecognitionService();
    const result = (service as any).evaluateSecurityAlerts({} as HTMLCanvasElement, [
      {
        id: 1,
        detection: {
          x: 10,
          y: 10,
          width: 120,
          height: 120,
          confidence: 0.95,
          landmarks: [
            { x: 40, y: 50 },
            { x: 80, y: 50 },
          ],
        },
      },
    ]);

    expect(result.status).toBe("FACE_MISMATCH");
    expect(result.similarity).toBe(0);
    expect(result.message).toBe("No verified face profile is available for this student.");
  });
});
