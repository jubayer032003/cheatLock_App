import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const camera = readFileSync("app/src/main/java/com/jubayer/cheatlock/ui/CameraPreview.kt", "utf8");
const exam = readFileSync("app/src/main/java/com/jubayer/cheatlock/ui/ExamScreen.kt", "utf8");

test("normal exams explicitly opt into healthy-observation gating; Self Exam keeps its legacy route", () => {
  assert.match(exam, /separateSensorFailures = !isSelfExam/);
  assert.match(exam, /val shouldWarn = shouldCountFaceWarning\(/);
  assert.match(exam, /sensorHealth = if \(isSelfExam\) CameraSensorHealth.HEALTHY else cameraSensorHealth/);
  assert.match(camera, /separateSensorFailures: Boolean = false/);
  assert.match(camera, /if \(separateSensorFailures\) postStatus\(FaceStatus.CHECKING\)/);
});

test("operational camera errors have distinct states and never call the face resolver", () => {
  for (const state of ["PERMISSION_DENIED", "CAMERA_INITIALIZATION_FAILED", "MODEL_INITIALIZATION_FAILED", "ANALYZER_FAILED", "FRAME_UNAVAILABLE", "TEMPORARILY_UNAVAILABLE"]) {
    assert.ok(camera.includes(`reportFailure(CameraSensorHealth.${state}`), state);
  }
  assert.equal((camera.match(/resolveFaceStatus\(faces\)/g) || []).length, 1);
  assert.match(camera, /reportHealth\(CameraSensorHealth.HEALTHY\)[\s\S]*?val status = resolveFaceStatus\(faces\)/);
  assert.match(camera, /faces.isEmpty\(\) -> FaceStatus.NO_FACE/);
  assert.match(camera, /faces.size > 1 -> FaceStatus.MULTIPLE_FACES/);
  assert.match(camera, /headEulerAngleY > 28f/);
  assert.match(camera, /headEulerAngleZ > 22f/);
});

test("asynchronous frame ownership and late-callback cleanup remain explicit", () => {
  assert.match(camera, /faceTask.addOnCompleteListener \{ imageProxy.close\(\) \}/);
  assert.match(camera, /if \(!detectorOwnsFrame\) imageProxy.close\(\)/);
  assert.match(camera, /if \(released\) return@addOnSuccessListener/);
  assert.match(camera, /mainHandler.post \{ if \(!released\) onFaceStatusChanged\(status\) \}/);
  assert.match(camera, /mainHandler.removeCallbacksAndMessages\(null\)/);
});
