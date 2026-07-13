import { AudioManager } from "./AudioManager";
import { DSPProcessor } from "./DSPProcessor";
import { CalibrationProfile } from "./NoiseCalibrator";

/**
 * Voice Activity Detection engine.
 * Combines DSP features into a single Speech Probability score (0–100%).
 *
 * The engine interface is designed to be swappable:
 * any replacement (Silero VAD, ONNX model) only needs to implement
 * `evaluate() → speechProbability: number`.
 */
export class VADEngine {
  private calibration: CalibrationProfile | null = null;
  private audioManager: AudioManager;

  // Rolling smoothing window (500ms ≈ 5 evaluations at 100ms intervals)
  private probabilityHistory: number[] = [];
  private static readonly SMOOTHING_WINDOW = 5;

  // Feature weights
  private static readonly W_RMS = 0.35;
  private static readonly W_ZCR = 0.25;
  private static readonly W_SPECTRAL = 0.40;

  constructor(audioManager: AudioManager) {
    this.audioManager = audioManager;
  }

  public setCalibration(profile: CalibrationProfile) {
    this.calibration = profile;
    this.probabilityHistory = [];
  }

  /**
   * Evaluate current audio frame and return smoothed speech probability (0–100).
   */
  public evaluate(): number {
    if (!this.calibration) return 0;

    const timeData = this.audioManager.getTimeDomainData();
    const freqData = this.audioManager.getFrequencyData();
    if (!timeData || !freqData) return 0;

    const sampleRate = this.audioManager.getSampleRate();
    const fftSize = this.audioManager.getFFTSize();

    // 1. RMS Score — how far above the calibrated noise floor
    const rms = DSPProcessor.computeRMS(timeData);
    const rmsAboveFloor = Math.max(0, rms - this.calibration.noiseFloorRMS);
    const rmsRange = Math.max(0.001, this.calibration.thresholdRMS - this.calibration.noiseFloorRMS);
    const rmsScore = Math.min(1.0, rmsAboveFloor / rmsRange);

    // 2. ZCR Score — speech has moderate ZCR (0.02–0.20)
    //    Clicks/transients have very high ZCR, silence has very low ZCR
    const zcr = DSPProcessor.computeZCR(timeData);
    let zcrScore: number;
    if (zcr >= 0.02 && zcr <= 0.20) {
      // Sweet spot for human speech
      zcrScore = 1.0;
    } else if (zcr < 0.02) {
      // Too low — likely silence or pure tone
      zcrScore = zcr / 0.02;
    } else {
      // Too high — likely noise, clicks, or transients
      zcrScore = Math.max(0, 1.0 - (zcr - 0.20) / 0.30);
    }

    // 3. Spectral Score — energy in 85–255 Hz human speech fundamental band
    const spectralRatio = DSPProcessor.computeSpectralRatio(freqData, sampleRate, fftSize, 85, 255);
    const spectralAboveFloor = Math.max(0, spectralRatio - this.calibration.noiseFloorSpectralRatio);
    const spectralRange = Math.max(0.001, this.calibration.thresholdSpectralRatio - this.calibration.noiseFloorSpectralRatio);
    // Amplify the spectral score since it's the most discriminative feature
    const spectralScore = Math.min(1.0, (spectralAboveFloor / spectralRange) * 1.5);

    // 4. Weighted combination
    const rawProbability =
      VADEngine.W_RMS * rmsScore +
      VADEngine.W_ZCR * zcrScore +
      VADEngine.W_SPECTRAL * spectralScore;

    const clampedProbability = Math.max(0, Math.min(100, Math.round(rawProbability * 100)));

    // 5. Smoothing — rolling average over last 500ms
    this.probabilityHistory.push(clampedProbability);
    if (this.probabilityHistory.length > VADEngine.SMOOTHING_WINDOW) {
      this.probabilityHistory.shift();
    }

    const smoothed =
      this.probabilityHistory.reduce((a, b) => a + b, 0) / this.probabilityHistory.length;

    return Math.round(smoothed);
  }

  public reset() {
    this.probabilityHistory = [];
    this.calibration = null;
  }
}
