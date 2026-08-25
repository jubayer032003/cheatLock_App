import { OfflineCache, type ExamDraftPayload, type ExamDraftScope } from "./OfflineCache";
import { SessionService } from "./SessionService";

export type LocalSaveState = "idle" | "saving" | "saved" | "failed";
export type BackendSyncState =
  | "idle"
  | "syncing"
  | "synchronized"
  | "failed"
  | "offline"
  | "revoked"
  | "expired"
  | "conflict"
  | "stale_ignored";

export interface ActiveExamAnswerSnapshot {
  answers: Record<number, string>;
  currentIndex: number;
  markedQuestions: number[];
}

export interface ActiveExamSaveResult {
  revision: number;
  serverRevision?: number;
  localSaveState: LocalSaveState;
  backendSyncState: BackendSyncState;
  serverTime?: string;
  message: string;
}

export interface ActiveExamAnswerServiceOptions {
  syncToBackend?: typeof defaultSyncToBackend;
  isOnline?: () => boolean;
}

export class ActiveExamAnswerService {
  private localRevision = 0;
  private serverRevision = 0;
  private activeSync: Promise<void> | null = null;
  private pendingSave: QueuedSave | null = null;

  public constructor(
    private readonly scope: ExamDraftScope,
    private readonly options: ActiveExamAnswerServiceOptions = {}
  ) {}

  public async recover(): Promise<ExamDraftPayload | null> {
    return OfflineCache.getDraft(this.scope);
  }

  public async save(snapshot: ActiveExamAnswerSnapshot): Promise<ActiveExamSaveResult> {
    const localRevision = ++this.localRevision;
    await OfflineCache.saveDraft(this.scope, snapshot);

    if (!(this.options.isOnline ?? (() => navigator.onLine))()) {
      return {
        revision: localRevision,
        serverRevision: this.serverRevision,
        localSaveState: "saved",
        backendSyncState: "offline",
        message: "Answer saved locally",
      };
    }

    const superseded = this.pendingSave;
    if (superseded) {
      superseded.resolve({
        revision: superseded.localRevision,
        serverRevision: this.serverRevision,
        localSaveState: "saved",
        backendSyncState: "stale_ignored",
        message: "Answer saved locally",
      });
    }

    const result = new Promise<ActiveExamSaveResult>((resolve) => {
      this.pendingSave = { snapshot, localRevision, resolve };
    });
    if (!this.activeSync) {
      this.activeSync = this.drainSaves().finally(() => {
        this.activeSync = null;
      });
    }
    return result;
  }

  public async flush(): Promise<void> {
    while (this.activeSync || this.pendingSave) {
      await this.activeSync;
    }
  }

  private async drainSaves(): Promise<void> {
    while (this.pendingSave) {
      const save = this.pendingSave;
      this.pendingSave = null;
      save.resolve(await this.syncSave(save));
    }
  }

  private async syncSave(save: QueuedSave): Promise<ActiveExamSaveResult> {
    try {
      const response = await (this.options.syncToBackend ?? defaultSyncToBackend)(
        this.scope,
        save.snapshot,
        this.serverRevision
      );
      this.serverRevision = Math.max(this.serverRevision, response.revision);

      if (save.localRevision < this.localRevision) {
        return {
          revision: save.localRevision,
          serverRevision: this.serverRevision,
          localSaveState: "saved",
          backendSyncState: "stale_ignored",
          serverTime: response.serverTime,
          message: "Answer saved locally",
        };
      }

      return {
        revision: save.localRevision,
        serverRevision: this.serverRevision,
        localSaveState: "saved",
        backendSyncState: "synchronized",
        serverTime: response.serverTime,
        message: "Answer synchronized",
      };
    } catch (error: any) {
      const backendSyncState = mapSyncError(error);
      return {
        revision: save.localRevision,
        serverRevision: this.serverRevision,
        localSaveState: "saved",
        backendSyncState,
        message: backendSyncState === "offline" ? "Connection unstable" : error?.message || "Action required",
      };
    }
  }

  public async clear(): Promise<void> {
    await this.flush();
    await OfflineCache.clearDraft(this.scope);
  }
}

async function defaultSyncToBackend(
  scope: ExamDraftScope,
  snapshot: ActiveExamAnswerSnapshot,
  revision: number
): Promise<{ revision: number; serverTime?: string; sessionStatus?: string }> {
  return SessionService.saveAnswerDraftRevision({
    examId: scope.examId,
    attemptId: scope.attemptId,
    deviceId: scope.deviceId,
    revision,
    answers: snapshot.answers,
    currentIndex: snapshot.currentIndex,
    markedQuestions: snapshot.markedQuestions,
  });
}

function mapSyncError(error: any): BackendSyncState {
  if (error?.status === 401 || error?.status === 403 || error?.code === "SESSION_REVOKED") return "revoked";
  if (error?.status === 410 || error?.code === "SESSION_EXPIRED" || error?.code === "EXAM_EXPIRED") return "expired";
  if (error?.status === 409 || error?.code === "ANSWER_REVISION_CONFLICT") return "conflict";
  if (!navigator.onLine || error?.code === "ERR_NETWORK" || error?.status === 0) return "offline";
  return "failed";
}

interface QueuedSave {
  snapshot: ActiveExamAnswerSnapshot;
  localRevision: number;
  resolve: (result: ActiveExamSaveResult) => void;
}
