export interface SubmissionReceipt {
  examId: string;
  examTitle: string;
  studentId: string;
  attemptId: string;
  status: "confirmed";
  submittedAt: string;
  receiptReference: string;
}

export class SubmissionReceiptService {
  public static save(receipt: SubmissionReceipt): void {
    localStorage.setItem(receiptKey(receipt.examId, receipt.studentId), JSON.stringify(receipt));
  }

  public static get(examId: string, studentId: string): SubmissionReceipt | null {
    const raw = localStorage.getItem(receiptKey(examId, studentId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SubmissionReceipt;
      return parsed.examId === examId && parsed.studentId === studentId && parsed.status === "confirmed" ? parsed : null;
    } catch {
      return null;
    }
  }

  public static clear(examId: string, studentId: string): void {
    localStorage.removeItem(receiptKey(examId, studentId));
  }
}

function receiptKey(examId: string, studentId: string) {
  return `cheatlock_submission_receipt_${safe(studentId)}_${safe(examId)}`;
}

function safe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}
