import { invoke, isTauriAvailable } from "../utils/tauri";

export interface SecureStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

class TauriKeychainAdapter implements SecureStorageAdapter {
  async get(key: string): Promise<string | null> {
    return invoke<string | null>("secure_store_get", { key });
  }

  async set(key: string, value: string): Promise<void> {
    await invoke("secure_store_set", { key, value });
  }

  async delete(key: string): Promise<void> {
    await invoke("secure_store_delete", { key });
  }
}

class MemorySecureStorageAdapter implements SecureStorageAdapter {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const memoryAdapter = new MemorySecureStorageAdapter();
let overrideAdapter: SecureStorageAdapter | null = null;

export class SecureStorageService {
  public static async get(key: string): Promise<string | null> {
    return adapter().get(key);
  }

  public static async set(key: string, value: string): Promise<void> {
    await adapter().set(key, value);
  }

  public static async delete(key: string): Promise<void> {
    await adapter().delete(key);
  }

  public static setAdapterForTests(next: SecureStorageAdapter | null) {
    overrideAdapter = next;
  }

  public static clearMemoryForTests() {
    memoryAdapter.clear();
  }
}

function adapter(): SecureStorageAdapter {
  if (overrideAdapter) return overrideAdapter;
  return isTauriAvailable() ? new TauriKeychainAdapter() : memoryAdapter;
}
