import { describe, expect, it } from "vitest";
import { SuspicionScoreEngine } from "./SuspicionScoreEngine";

describe("SuspicionScoreEngine", () => {
  it("records score delta separately from the total score", () => {
    const engine = new SuspicionScoreEngine(undefined, 0);

    const first = engine.addViolation("WINDOW_BLURRED", "Security", 1, "Window blurred");
    const second = engine.addViolation("PHONE_DETECTED", "Object", 1, "Phone detected");

    expect(first.scoreChange).toBe(20);
    expect(first.totalSuspicionScore).toBe(20);
    expect(second.scoreChange).toBe(20);
    expect(second.totalSuspicionScore).toBe(40);
    expect(engine.getScore()).toBe(40);
  });

  it("caps five counted alerts at 100", () => {
    const engine = new SuspicionScoreEngine(undefined, 0);

    for (let index = 0; index < 5; index += 1) {
      engine.addViolation("WINDOW_BLURRED", "Security", 1, "Window blurred");
    }

    expect(engine.getScore()).toBe(100);
  });
});
