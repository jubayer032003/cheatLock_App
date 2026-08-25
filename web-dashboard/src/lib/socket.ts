import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";
import { getAuthToken } from "./auth";

export type ProctoringEvent =
  | "student_joined_exam"
  | "student_left_exam"
  | "suspicion_score_updated"
  | "ai_alert_created"
  | "camera_preview_updated"
  | "screen_telemetry_uploaded"
  | "student_heartbeat"
  | "live_student_list";

export function createProctoringSocket(): Socket {
  return io(API_BASE_URL, {
    auth: {
      token: getAuthToken(),
    },
    transports: ["websocket"],
    autoConnect: false,
  });
}
