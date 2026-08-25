import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocketService } from "./service";

type Handler = (...args: any[]) => void;

const mocks = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  io: vi.fn((url: string, options: unknown) => {
    const socket = new FakeSocket(url, options);
    mocks.sockets.push(socket);
    return socket;
  }),
}));

vi.mock("socket.io-client", () => ({
  io: mocks.io,
}));

vi.mock("../api/client", () => ({
  getServerUrl: () => "https://api.cheatlock.example",
}));

describe("SocketService", () => {
  beforeEach(() => {
    SocketService.getInstance().disconnect();
    mocks.sockets.length = 0;
    mocks.io.mockClear();
  });

  it("disconnects a stale socket and reconnects with existing listeners rebound", async () => {
    const service = SocketService.getInstance();
    const eventHandler = vi.fn();
    service.on("exam_session_revoked", eventHandler);

    const firstConnection = service.connect("token-1");
    const firstSocket = mocks.sockets[0];
    firstSocket.connected = true;
    firstSocket.trigger("connect");
    await expect(firstConnection).resolves.toBe(firstSocket);

    firstSocket.connected = false;
    firstSocket.trigger("disconnect", "transport close");

    const secondConnection = service.connect("token-2");
    const secondSocket = mocks.sockets[1];
    secondSocket.connected = true;
    secondSocket.trigger("connect");
    await expect(secondConnection).resolves.toBe(secondSocket);

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
    secondSocket.trigger("exam_session_revoked", { attemptId: "attempt-1" });
    expect(eventHandler).toHaveBeenCalledWith({ attemptId: "attempt-1" });

    service.off("exam_session_revoked", eventHandler);
    service.disconnect();
  });
});

class FakeSocket {
  connected = false;
  handlers = new Map<string, Set<Handler>>();
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  emit = vi.fn();

  constructor(
    public url: string,
    public options: unknown
  ) {}

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }
}
