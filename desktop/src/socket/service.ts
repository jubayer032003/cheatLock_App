import { io, Socket } from "socket.io-client";
import { getServerUrl } from "../api/client";

export class SocketService {
  private static instance: SocketService | null = null;
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  private connectionPromise: Promise<Socket> | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public connect(token: string): Promise<Socket> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      // Only clean up if we have a stale disconnected socket
      if (this.socket) {
        this.disconnect();
      }

      const serverUrl = getServerUrl();
      logInfo(`[Socket] Connecting to ${serverUrl}...`);

      this.socket = io(serverUrl, {
        auth: { token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        timeout: 20000,
      });

      this.socket.on("connect", () => {
        logInfo("[Socket] Connected successfully.");
        // Re-bind all active listeners on reconnect
        this.listeners.forEach((callbacks, event) => {
          callbacks.forEach((cb) => this.socket?.on(event, cb));
        });
        this.connectionPromise = null;
        resolve(this.socket!);
      });

      this.socket.on("connect_error", (error) => {
        logError("[Socket] Connection error:", error.message);
        this.connectionPromise = null;
        reject(error);
      });

      this.socket.on("disconnect", (reason) => {
        logInfo("[Socket] Disconnected. Reason:", reason);
      });
    });

    return this.connectionPromise;
  }

  public disconnect() {
    this.connectionPromise = null;
    if (this.socket) {
      logInfo("[Socket] Closing connection.");
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public emit(event: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error("Socket is not connected."));
      }

      this.socket.emit(event, payload, (ack: { ok: boolean; message?: string; [key: string]: any }) => {
        if (ack?.ok) {
          resolve(ack);
        } else {
          reject(new Error(ack?.message || `Event ${event} failed standard acknowledgement.`));
        }
      });
    });
  }

  public on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public off(event: string, callback: (...args: any[]) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

function logInfo(...args: any[]) {
  console.log("%c[SocketService]", "color: #8b5cf6; font-weight: bold;", ...args);
}

function logError(...args: any[]) {
  console.error("%c[SocketService]", "color: #ef4444; font-weight: bold;", ...args);
}
