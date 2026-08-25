export const FIXED_CAPTURE_POLICY = {
  captureIntervalMs: 2000,
  maxQueueItems: 150,
  maxQueueBytes: 100 * 1024 * 1024,
  maxFrameBytes: 500 * 1024,
  maxConcurrentUploads: 2,
  maxFrameDimension: 1280,
  normalQuality: 0.65,
  suspiciousQuality: 0.82,
  preferredFormat: "image/webp",
  fallbackFormat: "image/jpeg",
  suspiciousPreEventMs: 8000,
  suspiciousPostEventMs: 8000,
} as const;
