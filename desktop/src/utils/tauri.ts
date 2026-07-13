import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { getCurrentWindow as tauriGetCurrentWindow, availableMonitors as tauriAvailableMonitors } from "@tauri-apps/api/window";

export const isTauriAvailable = (): boolean => {
  try {
    return Boolean(window && (window as any).__TAURI_INTERNALS__ && (window as any).__TAURI_INTERNALS__.invoke);
  } catch {
    return false;
  }
};

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    throw new Error(`Tauri not available: cannot invoke command '${cmd}'`);
  }
  return tauriInvoke<T>(cmd, args);
}

export function getCurrentWindow() {
  if (!isTauriAvailable()) {
    throw new Error("Tauri not available: getCurrentWindow() cannot be used in a browser context");
  }
  return tauriGetCurrentWindow();
}

export async function availableMonitors() {
  if (!isTauriAvailable()) {
    return [];
  }
  return tauriAvailableMonitors();
}
