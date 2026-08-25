import { getServerUrl } from "../api/client";
import { invoke, isTauriAvailable } from "../utils/tauri";
import type { NetworkProbeErrorCode, NetworkProbeResult } from "../types";

export interface NetworkProbeOptions {
  origin?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timer?: () => number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

export class NetworkProbeService {
  public static async probeBackendHealth(options: NetworkProbeOptions = {}): Promise<NetworkProbeResult> {
    const origin = (options.origin ?? getServerUrl()).trim().replace(/\/$/, "");
    const checkedAt = (options.now ?? (() => new Date()))().toISOString();
    if (!origin) {
      return failure("configuration_missing", "Backend origin is not configured.", checkedAt);
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return failure("offline", "The device is offline.", checkedAt);
    }

    if (!options.fetchImpl && isTauriAvailable()) {
      return invoke<NetworkProbeResult>("probe_backend_health_command", {
        origin,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const started = (options.timer ?? (() => performance.now()))();
    try {
      const response = await fetchImpl(`${origin}/health?probe=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        signal: controller.signal,
      });
      const latencyMs = Math.max(0, Math.round((options.timer ?? (() => performance.now()))() - started));
      if (response.status === 401 || response.status === 403) {
        return failure("unauthorized", "Backend health endpoint rejected the request.", checkedAt, response.status);
      }
      if (response.status >= 500) {
        return failure("server_unavailable", "Backend server is unavailable.", checkedAt, response.status);
      }
      if (!response.ok) {
        return failure("http_failure", "Backend health endpoint returned an unsuccessful status.", checkedAt, response.status);
      }
      const text = await response.text();
      if (text.trim()) {
        try {
          JSON.parse(text);
        } catch {
          return failure("invalid_response", "Backend health endpoint returned malformed JSON.", checkedAt, response.status);
        }
      }
      return {
        reachable: true,
        latencyMs,
        statusCode: response.status,
        checkedAt,
        message: "Backend health endpoint is reachable.",
      };
    } catch (error: any) {
      return failure(classifyFetchError(error), "Backend health probe failed.", checkedAt);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function classifyFetchError(error: any): NetworkProbeErrorCode {
  if (error?.name === "AbortError") return "timeout";
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("dns") || message.includes("name") || message.includes("resolve")) return "dns_resolution";
  if (message.includes("refused")) return "connection_refused";
  if (message.includes("certificate") || message.includes("tls") || message.includes("ssl")) return "tls_failure";
  return "network_error";
}

function failure(
  errorCode: NetworkProbeErrorCode,
  message: string,
  checkedAt: string,
  statusCode?: number
): NetworkProbeResult {
  return {
    reachable: false,
    statusCode,
    checkedAt,
    errorCode,
    message,
  };
}
