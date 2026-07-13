export interface ExamDraftPayload {
  answers: Record<number, string>;
  currentIndex: number;
  markedQuestions: number[];
  lastSavedAt: number;
}

export class OfflineCache {
  private static getCacheKey(studentId: string, examId: string): string {
    return `cheatlock_draft_${studentId.trim().toLowerCase()}_${examId.trim()}`;
  }

  public static saveDraft(
    studentId: string,
    examId: string,
    payload: Omit<ExamDraftPayload, "lastSavedAt">
  ): void {
    const key = this.getCacheKey(studentId, examId);
    const draft: ExamDraftPayload = {
      ...payload,
      lastSavedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
  }

  public static getDraft(studentId: string, examId: string): ExamDraftPayload | null {
    const key = this.getCacheKey(studentId, examId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ExamDraftPayload;
    } catch {
      return null;
    }
  }

  public static clearDraft(studentId: string, examId: string): void {
    const key = this.getCacheKey(studentId, examId);
    localStorage.removeItem(key);
  }
}
