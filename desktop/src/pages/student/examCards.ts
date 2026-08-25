import type { Exam, ExamAvailabilityStatus, ExamSession } from "../../types";
import {
  studentExamReadinessRoute,
  studentExamRoute,
  studentExamSessionRoute,
  studentExamSubmittedRoute,
  studentExamVerificationRoute,
} from "../../routes/studentRoutes";

export type StudentExamActionLabel =
  | "View Instructions"
  | "Prepare for Exam"
  | "Continue Verification"
  | "Resume Exam"
  | "View Submission";

export interface StudentExamCardModel {
  exam: Exam;
  availability: ExamAvailabilityStatus;
  badgeLabel: string;
  badgeTone: "neutral" | "info" | "success" | "warning" | "danger";
  actionLabel: StudentExamActionLabel;
  actionTo: string;
}

export function deriveExamAvailability(exam: Exam, session?: ExamSession | null): ExamAvailabilityStatus {
  if (session?.status === "SUBMITTED") return "submitted";
  if (session?.status === "IN_PROGRESS") return "in_progress";
  if (session?.status === "LOCKED") return "blocked";

  if (exam.status === "SCHEDULED") return "upcoming";
  if (exam.status === "LIVE") return session?.status === "RESET_BY_TEACHER" ? "ready" : "verification_required";
  if (exam.status === "ENDED" || exam.status === "ARCHIVED") return "expired";
  if (exam.status === "DRAFT") return "unavailable";

  return "unavailable";
}

export function buildStudentExamCard(exam: Exam, session?: ExamSession | null): StudentExamCardModel {
  const availability = deriveExamAvailability(exam, session);
  const config = cardConfigByAvailability[availability];

  return {
    exam,
    availability,
    ...config,
    actionTo: actionRouteForAvailability(exam.id, availability),
  };
}

export function groupStudentExamCards(cards: StudentExamCardModel[]) {
  return {
    upcoming: cards.filter((card) => card.availability === "upcoming"),
    available: cards.filter((card) => card.availability === "ready" || card.availability === "verification_required"),
    inProgress: cards.filter((card) => card.availability === "in_progress"),
    completed: cards.filter((card) => card.availability === "submitted"),
    unavailable: cards.filter((card) =>
      card.availability === "unavailable" ||
      card.availability === "expired" ||
      card.availability === "blocked"
    ),
  };
}

function actionRouteForAvailability(examId: string, availability: ExamAvailabilityStatus) {
  if (availability === "ready") return studentExamReadinessRoute(examId);
  if (availability === "verification_required") return studentExamVerificationRoute(examId);
  if (availability === "in_progress") return studentExamSessionRoute(examId);
  if (availability === "submitted") return studentExamSubmittedRoute(examId);
  return studentExamRoute(examId);
}

const cardConfigByAvailability: Record<
  ExamAvailabilityStatus,
  Pick<StudentExamCardModel, "badgeLabel" | "badgeTone" | "actionLabel">
> = {
  upcoming: {
    badgeLabel: "Upcoming",
    badgeTone: "info",
    actionLabel: "View Instructions",
  },
  ready: {
    badgeLabel: "Ready to Join",
    badgeTone: "success",
    actionLabel: "Prepare for Exam",
  },
  verification_required: {
    badgeLabel: "Verification Required",
    badgeTone: "warning",
    actionLabel: "Continue Verification",
  },
  in_progress: {
    badgeLabel: "In Progress",
    badgeTone: "warning",
    actionLabel: "Resume Exam",
  },
  submitted: {
    badgeLabel: "Submitted",
    badgeTone: "success",
    actionLabel: "View Submission",
  },
  unavailable: {
    badgeLabel: "Unavailable",
    badgeTone: "neutral",
    actionLabel: "View Instructions",
  },
  expired: {
    badgeLabel: "Expired",
    badgeTone: "danger",
    actionLabel: "View Instructions",
  },
  blocked: {
    badgeLabel: "Blocked",
    badgeTone: "danger",
    actionLabel: "View Instructions",
  },
};
