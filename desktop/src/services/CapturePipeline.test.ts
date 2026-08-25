import { describe, expect, it, vi } from "vitest";
import { CapturePipeline } from "./CapturePipeline";

describe("CapturePipeline", () => {
  it("runs periodic captures about every two seconds without overlap", async () => {
    vi.useFakeTimers();
    const pipeline = new CapturePipeline();
    let inFlight = 0;
    let maxInFlight = 0;
    const trigger = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      inFlight -= 1;
    });

    pipeline.startPeriodic(2, trigger);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1999);
    expect(trigger).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(trigger).toHaveBeenCalledTimes(2);

    pipeline.stopPeriodic();
    await vi.advanceTimersByTimeAsync(5000);

    expect(maxInFlight).toBe(1);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it("records actual interval drift for every captured frame", () => {
    vi.useFakeTimers();
    const pipeline = new CapturePipeline();
    const frames: any[] = [];
    pipeline.registerCaptureListener((frame) => frames.push(frame));

    vi.setSystemTime(1000);
    pipeline.pushFrame(fakeFrame(), "PERIODIC", { captureStartedAt: 1000, captureCompletedAt: 1100 });
    vi.setSystemTime(3050);
    pipeline.pushFrame(fakeFrame(), "PERIODIC", { captureStartedAt: 3050, captureCompletedAt: 3150 });

    expect(frames[0]).toMatchObject({ actualIntervalMs: null, driftMs: 0 });
    expect(frames[1]).toMatchObject({ actualIntervalMs: 2050, driftMs: 50 });
  });

  it("keeps one authoritative periodic loop when start is called twice", async () => {
    vi.useFakeTimers();
    const pipeline = new CapturePipeline();
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    pipeline.startPeriodic(2, first);
    pipeline.startPeriodic(2, second);
    await vi.advanceTimersByTimeAsync(0);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(pipeline.isPeriodicActive()).toBe(true);
  });

  it("marks suspicious evidence without creating another capture timer", async () => {
    vi.useFakeTimers();
    const pipeline = new CapturePipeline();
    const trigger = vi.fn(async () => {});

    pipeline.startPeriodic(2, trigger);
    pipeline.markSuspiciousEvent("event-1", 8000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(pipeline.isSuspiciousActive()).toBe(true);
  });

  it("stops immediately and does not capture after completion", async () => {
    vi.useFakeTimers();
    const pipeline = new CapturePipeline();
    const trigger = vi.fn(async () => {});

    pipeline.startPeriodic(2, trigger);
    await vi.advanceTimersByTimeAsync(0);
    pipeline.stopPeriodic();
    await vi.advanceTimersByTimeAsync(10000);

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(pipeline.isPeriodicActive()).toBe(false);
  });
});

function fakeFrame() {
  return {
    base64: "data:image/jpeg;base64,abc",
    sizeBytes: 3,
    width: 1280,
    height: 720,
    mimeType: "image/jpeg",
  };
}
