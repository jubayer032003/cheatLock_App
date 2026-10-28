import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const main = read("app/src/main/java/com/jubayer/cheatlock/MainActivity.kt");
const service = read("app/src/main/java/com/jubayer/cheatlock/proctoring/ScreenCaptureService.kt");
const manager = read("app/src/main/java/com/jubayer/cheatlock/proctoring/ScreenCaptureManager.kt");

test("capture denial cannot grant startup readiness and service success follows display initialization", () => {
  const denied = main.slice(main.indexOf("if (result.resultCode != Activity.RESULT_OK"), main.indexOf('Log.d("CHEATLOCK_FLOW", "MediaProjection consent granted.'));
  assert.doesNotMatch(denied, /onReady.*invoke/);
  assert.doesNotMatch(main, /will continue with camera monitoring only/);
  assert.ok(service.indexOf("captureManager = manager") < service.indexOf("manager.start()"));
  assert.ok(service.indexOf("manager.start()") < service.indexOf("ScreenCaptureCallbacks.onReady?.invoke()"));
  assert.match(main, /continuation.resumeWith\(Result.failure/);
});
test("capture cleanup cannot create a new service or reuse a projection consent token", () => {
  const stop = service.slice(service.indexOf("fun stop(context: Context)"));
  assert.match(stop, /context.stopService\(intent\)/);
  assert.doesNotMatch(stop, /context.startService\(/);
  assert.doesNotMatch(service, /return START_STICKY\b/);
  assert.equal([...manager.matchAll(/\.createVirtualDisplay\(/g)].length, 1);
});
test("screen buffers use matching RGBA bitmap storage and release is serialized", () => {
  assert.match(manager, /PixelFormat.RGBA_8888/);
  assert.match(manager, /Bitmap.Config.ARGB_8888/);
  assert.doesNotMatch(manager, /Bitmap.Config.RGB_565/);
  assert.match(manager, /@Synchronized private fun release/);
});