import { SecureStorageService } from "./SecureStorageService";

export interface ExamDraftPayload {
  answers: Record<number, string>;
  currentIndex: number;
  markedQuestions: number[];
  lastSavedAt: number;
}

export interface ExamDraftScope {
  studentId: string;
  examId: string;
  attemptId: string;
  deviceId: string;
}

export interface EncryptedExamDraftRecord {
  schemaVersion: 1;
  scopeHash: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  iv: string;
  ciphertext: string;
}

type DraftPlaintext = Omit<ExamDraftPayload, "lastSavedAt"> & {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export class OfflineCache {
  private static readonly INDEX_KEY = "cheatlock_encrypted_draft_index";
  private static readonly MAX_DRAFTS = 20;
  private static readonly DRAFT_KEY_SECRET = "cheatlock.drafts.aes_key.v1";

  public static async saveDraft(scope: ExamDraftScope, payload: Omit<ExamDraftPayload, "lastSavedAt">): Promise<void> {
    const key = await this.getDraftCryptoKey();
    const storageKey = this.getCacheKey(scope);
    const existing = await this.getEncryptedRecord(storageKey);
    const now = new Date().toISOString();
    const plaintext: DraftPlaintext = {
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      answers: payload.answers,
      currentIndex: payload.currentIndex,
      markedQuestions: payload.markedQuestions,
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const record: EncryptedExamDraftRecord = {
      schemaVersion: 1,
      scopeHash: await scopeHash(scope),
      createdAt: plaintext.createdAt,
      updatedAt: plaintext.updatedAt,
      revision: plaintext.revision,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    };
    localStorage.setItem(storageKey, JSON.stringify(record));
    this.touchIndex(storageKey);
    this.enforceStorageLimit();
  }

  public static async getDraft(scope: ExamDraftScope): Promise<ExamDraftPayload | null> {
    const storageKey = this.getCacheKey(scope);
    const record = await this.getEncryptedRecord(storageKey);
    if (!record || record.scopeHash !== await scopeHash(scope)) return null;

    try {
      const key = await this.getDraftCryptoKey();
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(record.iv) },
        key,
        base64ToBytes(record.ciphertext)
      );
      const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as DraftPlaintext;
      if (parsed.schemaVersion !== 1) return null;
      return {
        answers: parsed.answers || {},
        currentIndex: Number(parsed.currentIndex || 0),
        markedQuestions: Array.isArray(parsed.markedQuestions) ? parsed.markedQuestions : [],
        lastSavedAt: Date.parse(parsed.updatedAt) || Date.now(),
      };
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  public static async clearDraft(scope: ExamDraftScope): Promise<void> {
    const storageKey = this.getCacheKey(scope);
    localStorage.removeItem(storageKey);
    this.removeFromIndex(storageKey);
  }

  private static async getEncryptedRecord(storageKey: string): Promise<EncryptedExamDraftRecord | null> {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as EncryptedExamDraftRecord;
      if (record.schemaVersion !== 1 || !record.iv || !record.ciphertext) return null;
      return record;
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  private static getCacheKey(scope: ExamDraftScope): string {
    return `cheatlock_encrypted_draft_${safe(scope.studentId)}_${safe(scope.examId)}_${safe(scope.attemptId)}_${safe(scope.deviceId)}`;
  }

  private static async getDraftCryptoKey(): Promise<CryptoKey> {
    let raw = await SecureStorageService.get(this.DRAFT_KEY_SECRET);
    if (!raw) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      raw = bytesToBase64(bytes);
      await SecureStorageService.set(this.DRAFT_KEY_SECRET, raw);
    }
    return crypto.subtle.importKey("raw", base64ToBytes(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  private static touchIndex(storageKey: string) {
    const index = this.readIndex().filter((key) => key !== storageKey);
    index.unshift(storageKey);
    localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
  }

  private static removeFromIndex(storageKey: string) {
    localStorage.setItem(this.INDEX_KEY, JSON.stringify(this.readIndex().filter((key) => key !== storageKey)));
  }

  private static enforceStorageLimit() {
    const index = this.readIndex();
    const keep = index.slice(0, this.MAX_DRAFTS);
    for (const key of index.slice(this.MAX_DRAFTS)) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(this.INDEX_KEY, JSON.stringify(keep));
  }

  private static readIndex(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.INDEX_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
}

async function scopeHash(scope: ExamDraftScope): Promise<string> {
  const material = `${scope.studentId.trim().toLowerCase()}|${scope.examId}|${scope.attemptId}|${scope.deviceId}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return bytesToBase64(new Uint8Array(digest));
}

function safe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
