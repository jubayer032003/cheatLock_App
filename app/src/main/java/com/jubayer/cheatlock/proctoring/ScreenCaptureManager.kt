package com.jubayer.cheatlock.proctoring

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

class ScreenCaptureManager(
    private val context: Context,
    private val mediaProjection: MediaProjection,
    private val onSnapshot: (String) -> Unit
) {
    private val handlerThread = HandlerThread("CheatLockScreenCapture")
    private var handler: Handler? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var lastSentAt = 0L
    private var stopped = false
    private var isProcessingFrame = false

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            release(stopProjection = false)
        }
    }

    fun start() {
        if (stopped) return

        handlerThread.start()
        val captureHandler = Handler(handlerThread.looper)
        handler = captureHandler

        val metrics = context.resources.displayMetrics
        val rawWidth = metrics.widthPixels.coerceAtLeast(1)
        val rawHeight = metrics.heightPixels.coerceAtLeast(1)
        val density = metrics.densityDpi

        // Scale down to 720p maximum to save memory and prevent crashes on high-res devices
        val scaleDown = 720f / rawWidth.coerceAtLeast(1).toFloat()
        val width = if (scaleDown < 1.0f) (rawWidth * scaleDown).toInt() else rawWidth
        val height = if (scaleDown < 1.0f) (rawHeight * scaleDown).toInt() else rawHeight

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 1) // Reduce to 1 to save memory
        imageReader = reader
        mediaProjection.registerCallback(projectionCallback, captureHandler)
        
        virtualDisplay = try {
            mediaProjection.createVirtualDisplay(
                "CheatLockScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface,
                null,
                captureHandler
            )
        } catch (e: Exception) {
            Log.w("ScreenCaptureManager", "Primary VirtualDisplay creation failed, trying fallback", e)
            mediaProjection.createVirtualDisplay(
                "CheatLockScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC,
                reader.surface,
                null,
                captureHandler
            )
        }

        reader.setOnImageAvailableListener({ availableReader ->
            val now = System.currentTimeMillis()
            if (now - lastSentAt < SNAPSHOT_INTERVAL_MS) {
                // Important: Close any images we aren't going to use to prevent buffer exhaustion.
                availableReader.acquireLatestImage()?.close()
                return@setOnImageAvailableListener
            }
            if (isProcessingFrame) {
                availableReader.acquireLatestImage()?.close()
                return@setOnImageAvailableListener
            }

            val image = runCatching { availableReader.acquireLatestImage() }.getOrNull() ?: return@setOnImageAvailableListener
            isProcessingFrame = true
            try {
                runCatching {
                    val snapshot = image.toJpegDataUrl()
                    if (snapshot.isNotBlank()) {
                        lastSentAt = now
                        onSnapshot(snapshot)
                    }
                }.onFailure { e ->
                    Log.e("ScreenCaptureManager", "Failed to process snapshot", e)
                }
            } finally {
                image.close()
                isProcessingFrame = false
            }
        }, captureHandler)
    }

    fun stop() {
        release(stopProjection = true)
    }

    private fun release(stopProjection: Boolean) {
        if (stopped) return
        stopped = true

        runCatching { imageReader?.setOnImageAvailableListener(null, null) }
        runCatching { virtualDisplay?.release() }
        runCatching { imageReader?.close() }
        runCatching { mediaProjection.unregisterCallback(projectionCallback) }
        if (stopProjection) {
            runCatching { mediaProjection.stop() }
        }
        runCatching { handlerThread.quitSafely() }

        virtualDisplay = null
        imageReader = null
        handler = null
    }

    private fun Image.toJpegDataUrl(): String {
        val plane = planes.firstOrNull() ?: return ""
        val buffer = plane.buffer
        buffer.rewind() // Ensure we start from the beginning of the buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width
        val paddedWidth = width + rowPadding / pixelStride

        val paddedBitmap = runCatching { 
            Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.RGB_565) 
        }.getOrElse { 
            // Fallback to ARGB_8888 if RGB_565 fails on some weird device
            Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888) 
        }
        var croppedBitmap: Bitmap? = null
        var scaledBitmap: Bitmap? = null
        try {
            paddedBitmap.copyPixelsFromBuffer(buffer)
            croppedBitmap = Bitmap.createBitmap(paddedBitmap, 0, 0, width, height)
            scaledBitmap = croppedBitmap.scaleForPreview()

            val output = ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)

            val encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            return "data:image/jpeg;base64,$encoded"
        } finally {
            // Recycle all intermediates; order matters — don't recycle a bitmap that's the same object twice
            if (scaledBitmap != null && scaledBitmap != croppedBitmap) {
                runCatching { scaledBitmap.recycle() }
            }
            if (croppedBitmap != null && croppedBitmap != paddedBitmap) {
                runCatching { croppedBitmap.recycle() }
            }
            runCatching { paddedBitmap.recycle() }
        }
    }

    private fun Bitmap.scaleForPreview(): Bitmap {
        val largestSide = maxOf(width, height)
        if (largestSide <= MAX_PREVIEW_SIDE) return this

        val scale = MAX_PREVIEW_SIDE.toFloat() / largestSide.toFloat()
        val previewWidth = (width * scale).toInt().coerceAtLeast(1)
        val previewHeight = (height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(this, previewWidth, previewHeight, true)
    }

    private companion object {
        const val SNAPSHOT_INTERVAL_MS = 2_000L
        const val MAX_PREVIEW_SIDE = 1280
        const val JPEG_QUALITY = 80
    }
}
