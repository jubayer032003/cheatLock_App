import { AudioManager } from "./AudioManager";
import { DSPProcessor } from "./DSPProcessor";

export interface CalibrationProfile {
  noiseFloorRMS: number;
  noiseFloorZCR: number;
  noiseFloorSpectralRatio: number;
  thresholdRMS: number;
  thresholdZCR: number;
  thresholdSpectralRatio: number;
  calibratedAt: number;
}

export class NoiseCalibrator {
  private static readonly CALIBRATION_DURATION_MS = 5000;
  private static readonly SAMPLE_INTERVAL_MS = 100;

  /**
   * Run a 5-second ambient noise calibration.
   * Samples DSP features every 100ms (50 samples) and computes
   * mean + 2× standard deviation as the dynamic threshold.
   */
  public static async calibrate(
    audioManager: AudioManager,
    onProgress?: (elapsed: number, total: number) => void
  ): Promise<CalibrationProfile> {
    const rmsSamples: number[] = [];
    const zcrSamples: number[] = [];
    const spectralSamples: number[] = [];

    const sampleRate = audioManager.getSampleRate();
    const fftSize = audioManager.getFFTSize();

    return new Promise<CalibrationProfile>((resolve) => {
      const startTime = Date.now();

      const intervalId = window.setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= this.CALIBRATION_DURATION_MS) {
          clearInterval(intervalId);

          // Compute statistics
          const rmsStats = this.computeStats(rmsSamples);
          const zcrStats = this.computeStats(zcrSamples);
          const spectralStats = this.computeStats(spectralSamples);

          const profile: CalibrationProfile = {
            noiseFloorRMS: rmsStats.mean,
            noiseFloorZCR: zcrStats.mean,
            noiseFloorSpectralRatio: spectralStats.mean,
            // Dynamic threshold = mean + 2σ
            thresholdRMS: rmsStats.mean + 2 * rmsStats.stdDev,
            thresholdZCR: zcrStats.mean + 2 * zcrStats.stdDev,
            thresholdSpectralRatio: spectralStats.mean + 2 * spectralStats.stdDev,
            calibratedAt: Date.now(),
          };

          console.log("[NoiseCalibrator] Calibration complete:", profile);
          resolve(profile);
          return;
        }

        // Report progress
        if (onProgress) {
          onProgress(elapsed, this.CALIBRATION_DURATION_MS);
        }

        // Sample current audio features
        const timeData = audioManager.getTimeDomainData();
        const freqData = audioManager.getFrequencyData();

        if (timeData) {
          rmsSamples.push(DSPProcessor.computeRMS(timeData));
          zcrSamples.push(DSPProcessor.computeZCR(timeData));
        }
        if (freqData) {
          spectralSamples.push(
            DSPProcessor.computeSpectralRatio(freqData, sampleRate, fftSize, 85, 255)
          );
        }
      }, this.SAMPLE_INTERVAL_MS);
    });
  }

  /**
   * Compute mean and standard deviation from a number array.
   */
  private static computeStats(samples: number[]): { mean: number; stdDev: number } {
    if (samples.length === 0) return { mean: 0, stdDev: 0 };

    const sum = samples.reduce((a, b) => a + b, 0);
    const mean = sum / samples.length;

    const sqDiffSum = samples.reduce((a, v) => a + (v - mean) ** 2, 0);
    const stdDev = Math.sqrt(sqDiffSum / samples.length);

    return { mean, stdDev };
  }
}
