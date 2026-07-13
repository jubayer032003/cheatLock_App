/**
 * Stateless DSP utility functions for audio signal analysis.
 * All functions operate on raw Float32Array buffers with zero allocations.
 */
export class DSPProcessor {
  /**
   * Root Mean Square energy of a time-domain buffer.
   * RMS = sqrt( (1/N) * Σ x_i² )
   */
  public static computeRMS(buffer: Float32Array): number {
    const len = buffer.length;
    if (len === 0) return 0;

    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    return Math.sqrt(sumSq / len);
  }

  /**
   * Zero Crossing Rate — fraction of adjacent sample pairs that cross zero.
   * Speech typically has ZCR in [0.02, 0.20]. Clicks/transients are much higher.
   */
  public static computeZCR(buffer: Float32Array): number {
    const len = buffer.length;
    if (len < 2) return 0;

    let crossings = 0;
    for (let i = 1; i < len; i++) {
      if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / (len - 1);
  }

  /**
   * Short-Time Energy — average energy over the buffer (same as RMS² but useful
   * as a separate metric for windowed comparisons).
   */
  public static computeSTE(buffer: Float32Array): number {
    const len = buffer.length;
    if (len === 0) return 0;

    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += buffer[i] * buffer[i];
    }
    return sum / len;
  }

  /**
   * Spectral energy ratio — fraction of total FFT energy that falls within
   * a given frequency band.
   *
   * @param frequencyData  Float32Array from AnalyserNode.getFloatFrequencyData() (dB values)
   * @param sampleRate     AudioContext sample rate (e.g. 44100)
   * @param fftSize        AnalyserNode.fftSize (e.g. 2048)
   * @param lowHz          Lower bound of target band (e.g. 85)
   * @param highHz         Upper bound of target band (e.g. 255)
   */
  public static computeSpectralRatio(
    frequencyData: Float32Array,
    sampleRate: number,
    fftSize: number,
    lowHz: number,
    highHz: number
  ): number {
    const binCount = frequencyData.length; // fftSize / 2
    const binWidth = sampleRate / fftSize; // Hz per bin

    const lowBin = Math.max(0, Math.floor(lowHz / binWidth));
    const highBin = Math.min(binCount - 1, Math.ceil(highHz / binWidth));

    let bandEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < binCount; i++) {
      // frequencyData is in dB; convert to linear power: 10^(dB/10)
      const power = Math.pow(10, frequencyData[i] / 10);
      totalEnergy += power;
      if (i >= lowBin && i <= highBin) {
        bandEnergy += power;
      }
    }

    return totalEnergy > 0 ? bandEnergy / totalEnergy : 0;
  }

  /**
   * Peak amplitude of the buffer (useful for clipping detection).
   */
  public static computePeak(buffer: Float32Array): number {
    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > max) max = abs;
    }
    return max;
  }
}
