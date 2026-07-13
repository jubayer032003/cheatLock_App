export type AudioHealthStatus = "active" | "muted" | "disconnected" | "clipping" | "low_volume" | "idle";

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput";
}

export class AudioManager {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private lockedDeviceId: string | null = null;
  private healthStatus: AudioHealthStatus = "idle";
  private healthIntervalId: number | null = null;
  private timeDomainBuffer: Float32Array | null = null;
  private frequencyBuffer: Float32Array | null = null;

  /**
   * Enumerate all available audio input devices.
   */
  public async enumerateDevices(): Promise<AudioDevice[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "audioinput" && d.deviceId !== "default")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`,
          kind: "audioinput" as const,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Request microphone permission by opening a brief stream.
   */
  public async requestPermission(): Promise<boolean> {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start audio capture and wire up Web Audio API AnalyserNode.
   */
  public async startCapture(deviceId?: string): Promise<boolean> {
    this.stopCapture();

    const targetDevice = this.lockedDeviceId || deviceId;

    try {
      const constraints: MediaStreamConstraints = {
        audio: targetDevice
          ? { deviceId: { exact: targetDevice }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.3;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.analyserNode);

      const bufferLength = this.analyserNode.fftSize;
      this.timeDomainBuffer = new Float32Array(bufferLength);
      this.frequencyBuffer = new Float32Array(this.analyserNode.frequencyBinCount);

      this.healthStatus = "active";
      this.startHealthMonitor();
      return true;
    } catch {
      this.healthStatus = "disconnected";
      return false;
    }
  }

  /**
   * Stop all audio capture and release hardware.
   */
  public stopCapture() {
    this.stopHealthMonitor();

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch {}
      this.analyserNode = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.timeDomainBuffer = null;
    this.frequencyBuffer = null;
    this.healthStatus = "idle";
  }

  /**
   * Lock device selection after exam starts.
   */
  public lockDevice(deviceId: string) {
    this.lockedDeviceId = deviceId;
  }

  public unlockDevice() {
    this.lockedDeviceId = null;
  }

  public isDeviceLocked(): boolean {
    return this.lockedDeviceId !== null;
  }

  /**
   * Get a snapshot of the current time-domain audio buffer.
   */
  public getTimeDomainData(): Float32Array | null {
    if (!this.analyserNode || !this.timeDomainBuffer) return null;
    this.analyserNode.getFloatTimeDomainData(this.timeDomainBuffer as Float32Array<ArrayBuffer>);
    return this.timeDomainBuffer;
  }

  /**
   * Get a snapshot of the current frequency-domain audio buffer.
   */
  public getFrequencyData(): Float32Array | null {
    if (!this.analyserNode || !this.frequencyBuffer) return null;
    this.analyserNode.getFloatFrequencyData(this.frequencyBuffer as Float32Array<ArrayBuffer>);
    return this.frequencyBuffer;
  }

  public getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 44100;
  }

  public getFFTSize(): number {
    return this.analyserNode?.fftSize ?? 2048;
  }

  public getHealthStatus(): AudioHealthStatus {
    return this.healthStatus;
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Monitor microphone health every 1 second.
   */
  private startHealthMonitor() {
    this.stopHealthMonitor();

    this.healthIntervalId = window.setInterval(() => {
      if (!this.stream) {
        this.healthStatus = "disconnected";
        return;
      }

      const track = this.stream.getAudioTracks()[0];
      if (!track || track.readyState === "ended") {
        this.healthStatus = "disconnected";
        return;
      }
      if (track.muted || !track.enabled) {
        this.healthStatus = "muted";
        return;
      }

      // Check RMS levels from time-domain data
      const buffer = this.getTimeDomainData();
      if (!buffer) {
        this.healthStatus = "disconnected";
        return;
      }

      let sumSq = 0;
      let maxAbs = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        sumSq += v * v;
        const abs = Math.abs(v);
        if (abs > maxAbs) maxAbs = abs;
      }
      const rms = Math.sqrt(sumSq / buffer.length);

      if (maxAbs > 0.98) {
        this.healthStatus = "clipping";
      } else if (rms < 0.001) {
        this.healthStatus = "low_volume";
      } else {
        this.healthStatus = "active";
      }
    }, 1000);
  }

  private stopHealthMonitor() {
    if (this.healthIntervalId) {
      clearInterval(this.healthIntervalId);
      this.healthIntervalId = null;
    }
  }
}
