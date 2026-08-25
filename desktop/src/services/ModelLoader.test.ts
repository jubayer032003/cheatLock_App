import { describe, expect, it, vi } from "vitest";
import { ModelLoader } from "./ModelLoader";

describe("ModelLoader", () => {
  it("does not simulate success when the model manifest is missing", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(vi.fn().mockRejectedValue(new Error("missing")));

    expect(result.state).toBe("not_implemented");
    expect(result.errorCode).toBe("not_implemented");
    await expect(loader.loadModel()).rejects.toThrow();
  });

  it("fails readiness when the model version does not match", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(fetchManifest({ version: "old" }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("model_version_mismatch");
  });

  it("fails readiness when checksum metadata is missing", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(fetchManifest({ checksum: "" }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("checksum_missing");
  });

  it("fails readiness when shapes are invalid", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(fetchManifest({ inputShape: [1, 3, 640] }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("shape_invalid");
  });

  it("fails readiness when test inference has not succeeded", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(fetchManifest({ testInference: { passed: false } }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("test_inference_failed");
  });

  it("reports ready only after manifest, checksum, runtime, shapes, and test inference pass", async () => {
    const loader = new ModelLoader();
    const result = await loader.checkReadiness(fetchManifest());

    expect(result.state).toBe("ready");
    expect(result.metadata).toMatchObject({
      hasAsset: true,
      checksumValidated: true,
      runtimeInitialized: true,
      shapesValidated: true,
      testInferenceSucceeded: true,
    });
  });
});

function fetchManifest(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      name: "YOLOv8n-cheatlock-proctoring",
      version: ModelLoader.EXPECTED_VERSION,
      checksum: "0123456789abcdef",
      runtime: "onnx",
      assetUrl: "/models/proctoring.onnx",
      inputShape: [1, 3, 640, 640],
      outputShape: [1, 84, 8400],
      testInference: { passed: true },
      ...overrides,
    }),
  });
}
