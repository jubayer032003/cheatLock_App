import { createHash } from "node:crypto";
import { getSignedFrameUrl } from "./s3.js";

export function snapshotSource(eventName) {
  if (eventName === "camera_preview_updated") return "camera";
  if (eventName === "screen_telemetry_uploaded") return "screen";
  return null;
}

export function parseSnapshot(dataUrl) {
  const match = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ""));
  if (!match || match[2].length % 4 !== 0) throw Object.assign(new Error("Invalid snapshot encoding."), { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[2]) throw Object.assign(new Error("Invalid snapshot encoding."), { status: 400 });
  const validType = match[1] === "jpeg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validType) throw Object.assign(new Error("Snapshot bytes do not match the declared media type."), { status: 400 });
  return { contentType: `image/${match[1]}`, extension: match[1] === "jpeg" ? "jpg" : "webp", bytes };
}

export function snapshotObjectKey({ examId, studentId, attemptStartedAt, source, dataUrl, evidenceId = "" }) {
  const { extension, bytes } = parseSnapshot(dataUrl);
  const attempt = createHash("sha256").update(JSON.stringify([String(examId), studentId, attemptStartedAt])).digest("hex");
  const digest = createHash("sha256").update(bytes).update(JSON.stringify(evidenceId)).digest("hex");
  return `exams/${examId}/attempts/${attempt}/${source}/${digest}.${extension}`;
}

export async function serializeSnapshot(value, sign = getSignedFrameUrl) {
  if (!value) return "";
  if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) return value;
  try { return await sign(value); } catch { return ""; }
}

export async function serializeStudentSnapshots(student, sign = getSignedFrameUrl) {
  const [camera, screen] = await Promise.all([
    serializeSnapshot(student.previewBase64 || student.previewUrl || "", sign),
    serializeSnapshot(student.screenBase64 || "", sign),
  ]);
  return { ...student, previewUrl: camera, previewBase64: camera.startsWith("data:") ? camera : "", screenBase64: screen, screenPreviewUrl: screen };
}
