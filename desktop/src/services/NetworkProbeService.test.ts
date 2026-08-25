import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkProbeService } from "./NetworkProbeService";

const mocks = vi.hoisted(() => ({
  isTauriAvailable: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("../utils/tauri", () => ({
  isTauriAvailable: mocks.isTauriAvailable,
  invoke: mocks.invoke,
}));

function response(status: number, body = "{}") {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  mocks.isTauriAvailable.mockReturnValue(false);
  mocks.invoke.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("NetworkProbeService", () => {
  it("returns success for a valid health response", async () => {
    const result = await NetworkProbeService.probeBackendHealth({
      origin: "https://api.test",
      fetchImpl: vi.fn().mockResolvedValue(response(200, '{"ok":true}')),
      timer: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(145),
      now: () => new Date("2026-07-25T00:00:00.000Z"),
    });

    expect(result.reachable).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBe(45);
    expect(result.checkedAt).toBe("2026-07-25T00:00:00.000Z");
  });

  it("measures round-trip latency", async () => {
    const timer = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(91);
    const result = await NetworkProbeService.probeBackendHealth({
      origin: "https://api.test",
      fetchImpl: vi.fn().mockResolvedValue(response(200)),
      timer,
    });

    expect(result.latencyMs).toBe(81);
  });

  it("classifies timeout", async () => {
    const error = new DOMException("aborted", "AbortError");
    const result = await NetworkProbeService.probeBackendHealth({
      origin: "https://api.test",
      fetchImpl: vi.fn().mockRejectedValue(error),
    });

    expect(result.reachable).toBe(false);
    expect(result.errorCode).toBe("timeout");
  });

  it("classifies server error", async () => {
    const result = await NetworkProbeService.probeBackendHealth({
      origin: "https://api.test",
      fetchImpl: vi.fn().mockResolvedValue(response(503)),
    });

    expect(result.reachable).toBe(false);
    expect(result.errorCode).toBe("server_unavailable");
    expect(result.statusCode).toBe(503);
  });

  it("classifies malformed health response", async () => {
    const result = await NetworkProbeService.probeBackendHealth({
      origin: "https://api.test",
      fetchImpl: vi.fn().mockResolvedValue(response(200, "not-json")),
    });

    expect(result.reachable).toBe(false);
    expect(result.errorCode).toBe("invalid_response");
  });

  it("classifies offline state without calling fetch", async () => {
    const fetchImpl = vi.fn();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const result = await NetworkProbeService.probeBackendHealth({ origin: "https://api.test", fetchImpl });

    expect(result.reachable).toBe(false);
    expect(result.errorCode).toBe("offline");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies missing configuration", async () => {
    const result = await NetworkProbeService.probeBackendHealth({ origin: "   ", fetchImpl: vi.fn() });

    expect(result.reachable).toBe(false);
    expect(result.errorCode).toBe("configuration_missing");
  });

  it("does not cache success over retry failure", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(500));

    expect((await NetworkProbeService.probeBackendHealth({ origin: "https://api.test", fetchImpl })).reachable).toBe(true);
    const retry = await NetworkProbeService.probeBackendHealth({ origin: "https://api.test", fetchImpl });

    expect(retry.reachable).toBe(false);
    expect(retry.errorCode).toBe("server_unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
