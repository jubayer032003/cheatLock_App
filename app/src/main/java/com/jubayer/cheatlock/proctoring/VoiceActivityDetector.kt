package com.jubayer.cheatlock.proctoring

import android.util.Log
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * On-Device Digital Signal Processing (DSP) Voice Activity Detector.
 * Runs completely offline under 5% CPU overhead.
 */
class VoiceActivityDetector(private val sampleRate: Int = 8000) {

    companion object {
        private const val TAG = "VoiceActivityDetector"
        private const val FRAME_SIZE = 256 // 32ms frame size at 8kHz
        private const val CALIBRATION_DURATION_MS = 5000L
        
        // Typical Zero Crossing count range for human speech in 256-sample frame (32ms)
        private const val MIN_SPEECH_ZCR = 6
        private const val MAX_SPEECH_ZCR = 75
        
        // Autoregressive smoothing factors
        private const val NOISE_FLOOR_DECAY = 0.98f
        private const val NOISE_FLOOR_ATTACK = 0.002f
    }

    // Biquad Bandpass Filter (85Hz - 255Hz at 8000Hz samplerate)
    // Formula: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    private var b0 = 0.0
    private var b1 = 0.0
    private var b2 = 0.0
    private var a1 = 0.0
    private var a2 = 0.0

    // Filter delay lines
    private var x1 = 0.0
    private var x2 = 0.0
    private var y1 = 0.0
    private var y2 = 0.0

    // VAD State variables
    private var isCalibrated = false
    private var calibrationStartTime = 0L
    private var calibrationSumRMS = 0.0
    private var calibrationFrameCount = 0

    var noiseFloor = 150.0 // Initial baseline assumption
        private set
    var dynamicThreshold = 300.0
        private set

    // Sliding window of speech probability for triggering alerts (5 seconds)
    // 5 seconds at 32ms frames is ~156 frames
    private val probabilityHistory = mutableListOf<Float>()
    private val maxHistorySize = 156

    init {
        setupBandpassFilter(170.0, 170.0) // Center = 170Hz, Bandwidth = 170Hz
    }

    /**
     * Initializes the Biquad IIR Bandpass Filter coefficients.
     */
    private fun setupBandpassFilter(centerFreq: Double, bandwidth: Double) {
        val w0 = 2.0 * Math.PI * centerFreq / sampleRate.toDouble()
        val sinW0 = Math.sin(w0)
        val cosW0 = Math.cos(w0)
        val q = centerFreq / bandwidth
        val alpha = sinW0 / (2.0 * q)

        val a0 = 1.0 + alpha
        b0 = alpha / a0
        b1 = 0.0
        b2 = -alpha / a0
        a1 = -2.0 * cosW0 / a0
        a2 = (1.0 - alpha) / a0
    }

    /**
     * Processes a single audio sample through the bandpass filter delay lines.
     */
    private fun filterSample(sample: Double): Double {
        val y = b0 * sample + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1
        x1 = sample
        y2 = y1
        y1 = y
        return y
    }

    /**
     * Feeds raw PCM buffer chunk to the VAD and evaluates speech probability.
     */
    fun processAudioBuffer(buffer: ShortArray, size: Int): Float {
        // Handle initial calibration timing
        val now = System.currentTimeMillis()
        if (calibrationStartTime == 0L) {
            calibrationStartTime = now
            Log.d(TAG, "Audio VAD calibration started.")
        }

        val isCalibrating = (now - calibrationStartTime) < CALIBRATION_DURATION_MS

        var totalFramesProcessed = 0
        var accumulatedProb = 0f

        // Slice input buffer into 256-sample frames for localized analysis
        var offset = 0
        while (offset + FRAME_SIZE <= size) {
            val frame = ShortArray(FRAME_SIZE)
            System.arraycopy(buffer, offset, frame, 0, FRAME_SIZE)
            
            val frameRMS = calculateRMS(frame)
            
            if (isCalibrating) {
                calibrationSumRMS += frameRMS
                calibrationFrameCount++
            } else {
                // Post-calibration active detection
                if (!isCalibrated) {
                    finalizeCalibration()
                }

                // Dynamic background noise floor tracking
                updateNoiseFloor(frameRMS)

                // Calculate frame level metrics
                val frameZCR = calculateZCR(frame)
                val filteredRMS = calculateFilteredRMS(frame)
                
                // Calculate speech probability for this frame
                val prob = estimateSpeechProbability(frameRMS, filteredRMS, frameZCR)
                accumulatedProb += prob
                totalFramesProcessed++

                // Store in sliding history
                synchronized(probabilityHistory) {
                    probabilityHistory.add(prob)
                    if (probabilityHistory.size > maxHistorySize) {
                        probabilityHistory.removeAt(0)
                    }
                }
            }
            
            offset += FRAME_SIZE
        }

        // Return average probability for the current buffer
        return if (totalFramesProcessed > 0) accumulatedProb / totalFramesProcessed else 0f
    }

    /**
     * Finalizes the calibration process, establishing the noise floor.
     */
    private fun finalizeCalibration() {
        if (calibrationFrameCount > 0) {
            noiseFloor = calibrationSumRMS / calibrationFrameCount
            // Establish dynamic threshold (factor of 2.2 above noise floor with absolute minimum filter)
            dynamicThreshold = (noiseFloor * 2.2).coerceAtLeast(200.0)
            Log.d(TAG, "Calibration completed. Noise Floor: $noiseFloor, Dynamic Threshold: $dynamicThreshold")
        }
        isCalibrated = true
    }

    /**
     * Calculates the Root Mean Square (RMS) energy.
     */
    private fun calculateRMS(frame: ShortArray): Double {
        var sum = 0.0
        for (sample in frame) {
            sum += sample.toDouble() * sample.toDouble()
        }
        return sqrt(sum / frame.size)
    }

    /**
     * Calculates Zero Crossing Rate (ZCR).
     */
    private fun calculateZCR(frame: ShortArray): Int {
        var crossings = 0
        for (i in 1 until frame.size) {
            val prev = frame[i - 1].toInt()
            val curr = frame[i].toInt()
            if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
                crossings++
            }
        }
        return crossings
    }

    /**
     * Passes the frame through the bandpass filter and calculates its RMS.
     */
    private fun calculateFilteredRMS(frame: ShortArray): Double {
        var sum = 0.0
        for (sample in frame) {
            val filtered = filterSample(sample.toDouble())
            sum += filtered * filtered
        }
        return sqrt(sum / frame.size)
    }

    /**
     * Slowly tracks the background noise floor using an asymmetric filter.
     */
    private fun updateNoiseFloor(frameRMS: Double) {
        if (frameRMS < noiseFloor) {
            // Decay noise floor quickly during silence periods
            noiseFloor = noiseFloor * NOISE_FLOOR_DECAY + frameRMS * (1.0 - NOISE_FLOOR_DECAY)
        } else {
            // Attack noise floor very slowly during loud periods to prevent voice adaptation
            noiseFloor = noiseFloor * (1.0 - NOISE_FLOOR_ATTACK) + frameRMS * NOISE_FLOOR_ATTACK
        }
        dynamicThreshold = (noiseFloor * 2.2).coerceAtLeast(200.0)
    }

    /**
     * Estimates the speech probability of a frame based on RMS, voice ratio, and ZCR.
     */
    private fun estimateSpeechProbability(rms: Double, filteredRMS: Double, zcr: Int): Float {
        // If energy is below dynamic threshold, it's silence/hum (0% speech probability)
        if (rms < dynamicThreshold) return 0f

        // Energy ratio: how much energy lies in the 85-255Hz human speech range
        val voiceRatio = filteredRMS / rms
        
        // Zero Crossing Rate Score
        val zcrScore = if (zcr in MIN_SPEECH_ZCR..MAX_SPEECH_ZCR) 1.0f else 0.0f

        // Energy exceedance ratio
        val energyExceedance = ((rms - dynamicThreshold) / dynamicThreshold).coerceIn(0.0, 2.0).toFloat()
        val energyFactor = (energyExceedance / 2.0f).coerceIn(0.3f, 1.0f)

        // Calculate final speech probability (0 to 100)
        // If the energy falls in the speech band and crossings are speech-like
        return if (voiceRatio > 0.38f && zcrScore > 0f) {
            (voiceRatio.toFloat() * energyFactor * zcrScore * 100f).coerceIn(0f, 100f)
        } else {
            0f
        }
    }

    /**
     * Checks if the average speech probability over the 5-second window is > 80%.
     */
    fun isSpeechViolationTriggered(): Boolean {
        synchronized(probabilityHistory) {
            // Require history to be fully populated to trigger (ensures a solid 5 seconds)
            if (probabilityHistory.size < maxHistorySize) return false
            val avg = probabilityHistory.average().toFloat()
            return avg > 80f
        }
    }

    /**
     * Reset the VAD history window (useful when warning is raised or active exam resets).
     */
    fun clearHistory() {
        synchronized(probabilityHistory) {
            probabilityHistory.clear()
        }
    }
}
