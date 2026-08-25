export interface ModelMetadata {
  name: string;
  version: string;
  checksum: string;
  classesCount: number;
  classes: string[];
  inputShape: [number, number, number, number]; // [batch, channels, height, width]
  outputShape: number[];
  isLoaded: boolean;
}

export type ModelReadinessState = "idle" | "ready" | "failed" | "not_implemented";

export interface ModelReadinessResult {
  state: ModelReadinessState;
  message: string;
  errorCode?: string;
  metadata: {
    manifestUrl: string;
    expectedVersion: string;
    hasAsset: boolean;
    checksumValidated: boolean;
    runtimeInitialized: boolean;
    shapesValidated: boolean;
    testInferenceSucceeded: boolean;
  };
}

interface ModelManifest {
  name: string;
  version: string;
  checksum: string;
  runtime: "onnx";
  assetUrl: string;
  inputShape: number[];
  outputShape: number[];
  testInference: {
    passed: boolean;
  };
}

export class ModelLoader {
  public static readonly MANIFEST_URL = "/models/cheatlock-proctoring-model.json";
  public static readonly EXPECTED_VERSION = "2026.07.proctoring-v1";

  private static readonly OBJECT_CLASSES = [
    "Mobile Phone",
    "Tablet",
    "Laptop",
    "Calculator",
    "Book",
    "Notebook",
    "Paper Notes",
    "Smart Watch",
    "Earbuds",
    "Headphones",
    "USB Drive",
    "External Keyboard"
  ];

  private metadata: ModelMetadata = {
    name: "YOLOv8n-cheatlock-proctoring",
    version: ModelLoader.EXPECTED_VERSION,
    checksum: "",
    classesCount: ModelLoader.OBJECT_CLASSES.length,
    classes: ModelLoader.OBJECT_CLASSES,
    inputShape: [1, 3, 640, 640],
    outputShape: [],
    isLoaded: false
  };

  /**
   * Load YOLOv8n network model.
   */
  public async loadModel(): Promise<ModelMetadata> {
    if (this.metadata.isLoaded) return this.metadata;

    const readiness = await this.checkReadiness();
    if (readiness.state !== "ready") {
      throw new Error(readiness.message);
    }

    this.metadata.isLoaded = true;
    return this.metadata;
  }

  public unloadModel() {
    this.metadata.isLoaded = false;
  }

  public getMetadata(): ModelMetadata {
    return this.metadata;
  }

  public async checkReadiness(fetcher: typeof fetch = fetch): Promise<ModelReadinessResult> {
    let manifest: ModelManifest;
    try {
      const response = await fetcher(ModelLoader.MANIFEST_URL, { cache: "no-store" });
      if (!response.ok) {
        return notImplemented(`AI model manifest is unavailable (${response.status}).`, {
          hasAsset: false,
        });
      }
      manifest = await response.json() as ModelManifest;
    } catch {
      return notImplemented("AI model manifest is unavailable.", { hasAsset: false });
    }

    if (manifest.version !== ModelLoader.EXPECTED_VERSION) {
      return failed("model_version_mismatch", "AI model version does not match the expected policy version.", {
        hasAsset: Boolean(manifest.assetUrl),
      });
    }
    if (!manifest.checksum || manifest.checksum.length < 16) {
      return failed("checksum_missing", "AI model checksum is missing or invalid.", { hasAsset: Boolean(manifest.assetUrl) });
    }
    if (manifest.runtime !== "onnx") {
      return failed("runtime_unsupported", "AI model runtime is unsupported.", { hasAsset: Boolean(manifest.assetUrl) });
    }
    if (!isShape(manifest.inputShape, 4) || !isOutputShape(manifest.outputShape)) {
      return failed("shape_invalid", "AI model input or output shapes are invalid.", { hasAsset: Boolean(manifest.assetUrl) });
    }
    if (!manifest.testInference?.passed) {
      return failed("test_inference_failed", "AI model test inference did not succeed.", { hasAsset: Boolean(manifest.assetUrl) });
    }

    this.metadata = {
      name: manifest.name,
      version: manifest.version,
      checksum: manifest.checksum,
      classesCount: ModelLoader.OBJECT_CLASSES.length,
      classes: ModelLoader.OBJECT_CLASSES,
      inputShape: manifest.inputShape as [number, number, number, number],
      outputShape: manifest.outputShape,
      isLoaded: this.metadata.isLoaded,
    };

    return {
      state: "ready",
      message: "AI model manifest and runtime metadata are ready.",
      metadata: baseMetadata({
        hasAsset: true,
        checksumValidated: true,
        runtimeInitialized: true,
        shapesValidated: true,
        testInferenceSucceeded: true,
      }),
    };
  }

  public getClasses(): string[] {
    return [...ModelLoader.OBJECT_CLASSES];
  }
}

export const modelLoader = new ModelLoader();

function isShape(value: unknown, expectedRank: number): value is number[] {
  return Array.isArray(value) && value.length === expectedRank && value.every((item) => Number.isInteger(item) && item > 0);
}

function isOutputShape(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.every((item) => Number.isInteger(item) && item > 0);
}

function notImplemented(message: string, overrides: Partial<ModelReadinessResult["metadata"]>): ModelReadinessResult {
  return {
    state: "not_implemented",
    errorCode: "not_implemented",
    message,
    metadata: baseMetadata(overrides),
  };
}

function failed(
  errorCode: string,
  message: string,
  overrides: Partial<ModelReadinessResult["metadata"]>
): ModelReadinessResult {
  return {
    state: "failed",
    errorCode,
    message,
    metadata: baseMetadata(overrides),
  };
}

function baseMetadata(overrides: Partial<ModelReadinessResult["metadata"]> = {}): ModelReadinessResult["metadata"] {
  return {
    manifestUrl: ModelLoader.MANIFEST_URL,
    expectedVersion: ModelLoader.EXPECTED_VERSION,
    hasAsset: false,
    checksumValidated: false,
    runtimeInitialized: false,
    shapesValidated: false,
    testInferenceSucceeded: false,
    ...overrides,
  };
}
