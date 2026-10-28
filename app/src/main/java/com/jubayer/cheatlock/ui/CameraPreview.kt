package com.jubayer.cheatlock.ui

import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.jubayer.cheatlock.proctoring.FaceEmbeddingModel
import com.jubayer.cheatlock.proctoring.DetectedObject
import com.jubayer.cheatlock.proctoring.YOLOv8Detector
import com.jubayer.cheatlock.proctoring.CameraSensorHealth
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import com.jubayer.cheatlock.ui.theme.CheatLockDanger
import com.jubayer.cheatlock.BuildConfig
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "CameraPreview"

private fun biometricTrace(marker: String, message: String = "") {
    if (BuildConfig.ENABLE_RUNTIME_TRACING) {
        Log.d(TAG, "[$marker] $message")
    }
}

@SuppressLint("UnsafeOptInUsageError")
@Composable
fun CameraPreview(
    modifier: Modifier = Modifier,
    preferFastStartup: Boolean = false,
    onFaceStatusChanged: (FaceStatus) -> Unit,
    onPreviewSnapshot: (String) -> Unit = {},
    onFaceDescriptorChanged: (List<Double>) -> Unit = {},
    onPhoneDetected: () -> Unit = {},
    onFaceDetected: (Face) -> Unit = {},
    onObjectsDetected: (List<DetectedObject>) -> Unit = {},
    onPhoneDetectedWithLabels: (String) -> Unit = {},
    onCameraError: (String) -> Unit = {},
    separateSensorFailures: Boolean = false,
    onSensorHealthChanged: (CameraSensorHealth) -> Unit = {}
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainExecutor = ContextCompat.getMainExecutor(context)

    var detectedObjects by remember { mutableStateOf<List<DetectedObject>>(emptyList()) }
    val releaseActions = remember { mutableMapOf<PreviewView, () -> Unit>() }

    // Key the view to the lifecycleOwner and startup preference
    key(lifecycleOwner, preferFastStartup) {
        Box(modifier = modifier) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = factory@ { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }

                val mainHandler = Handler(Looper.getMainLooper())
                var released = false
                var lastHealth: CameraSensorHealth? = null
                fun postStatus(status: FaceStatus) {
                    mainHandler.post { if (!released) onFaceStatusChanged(status) }
                }
                fun reportHealth(health: CameraSensorHealth) {
                    if (released || health == lastHealth) return
                    lastHealth = health
                    mainHandler.post { if (!released) onSensorHealthChanged(health) }
                }
                fun reportFailure(health: CameraSensorHealth, legacyStatus: FaceStatus? = FaceStatus.NO_FACE) {
                    reportHealth(health)
                    if (separateSensorFailures) postStatus(FaceStatus.CHECKING)
                    else legacyStatus?.let(::postStatus)
                }

                val permissionGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                biometricTrace("BIOMETRIC_CAMERA_PERMISSION", "granted=$permissionGranted lifecycle=${lifecycleOwner.lifecycle.currentState}")
                if (!permissionGranted) {
                    reportFailure(CameraSensorHealth.PERMISSION_DENIED, null)
                    onCameraError("Camera permission is required for biometric verification.")
                    return@factory previewView
                }

                val faceEmbeddingModel = FaceEmbeddingModel(ctx.applicationContext)
                val cleanupCallbacks = mutableListOf<() -> Unit>()
                var lastSnapshotAt = 0L
                val snapshotEncoding = AtomicBoolean(false)

                reportHealth(CameraSensorHealth.STARTING)
                postStatus(FaceStatus.CHECKING)

                releaseActions[previewView] = {
                    released = true
                    if (separateSensorFailures) onSensorHealthChanged(CameraSensorHealth.STOPPED)
                    cleanupCallbacks.asReversed().forEach { cleanup ->
                        runCatching { cleanup() }
                    }
                }
                biometricTrace("BIOMETRIC_PREVIEW_READY", "surfaceProviderPrepared=true")

                cleanupCallbacks += {
                    mainHandler.removeCallbacksAndMessages(null)
                    faceEmbeddingModel.close()
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener(listener@ {
                    if (released) {
                        biometricTrace("BIOMETRIC_CAMERA_DISPOSE", "providerCompletedAfterRelease=true")
                        return@listener
                    }
                    runCatching {
                        val cameraProvider = cameraProviderFuture.get()
                        biometricTrace("BIOMETRIC_CAMERA_PROVIDER_READY", "lifecycle=${lifecycleOwner.lifecycle.currentState}")

                        val frontSelector = CameraSelector.DEFAULT_FRONT_CAMERA
                        val frontAvailable = cameraProvider.hasCamera(frontSelector)
                        biometricTrace("BIOMETRIC_FRONT_CAMERA_AVAILABLE", "available=$frontAvailable")
                        if (!frontAvailable) {
                            onCameraError("No front camera is available for biometric verification.")
                            reportFailure(CameraSensorHealth.CAMERA_INITIALIZATION_FAILED)
                            return@runCatching
                        }
                        
                        // Force unbind before re-binding to prevent hardware lock conflicts
                        cameraProvider.unbindAll()

                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }

                        val detectorOptions = if (preferFastStartup) {
                            FaceDetectorOptions.Builder()
                                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                                .enableTracking()
                                .build()
                        } else {
                            FaceDetectorOptions.Builder()
                                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                                .enableTracking()
                                .build()
                        }

                        val detector = try {
                            FaceDetection.getClient(detectorOptions)
                        } catch (error: Exception) {
                            Log.e(TAG, "Face detector initialization failed", error)
                            reportFailure(CameraSensorHealth.MODEL_INITIALIZATION_FAILED)
                            return@runCatching
                        }
                        val yoloDetector = YOLOv8Detector(ctx.applicationContext)
                        val yoloExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
                        cleanupCallbacks += {
                            detector.close()
                            yoloDetector.close()
                            yoloExecutor.shutdown()
                        }

                        val analysisExecutor: Executor = ContextCompat.getMainExecutor(ctx)
                        val imageAnalysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        var lastStatus: FaceStatus? = null
                        var lastPhoneAlertAt = 0L
                        var frameCounter = 0

                        imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                            if (released) {
                                imageProxy.close()
                                return@setAnalyzer
                            }
                            var detectorOwnsFrame = false
                            try {
                            val mediaImage = imageProxy.image
                            if (mediaImage == null) {
                                reportFailure(CameraSensorHealth.FRAME_UNAVAILABLE, null)
                                imageProxy.close()
                                return@setAnalyzer
                            }

                            val image = InputImage.fromMediaImage(
                                mediaImage,
                                imageProxy.imageInfo.rotationDegrees
                            )
                            if (frameCounter % 30 == 0) {
                                biometricTrace("BIOMETRIC_ANALYSIS_FRAME", "rotation=${imageProxy.imageInfo.rotationDegrees}")
                            }

                            val nowForSnapshot = System.currentTimeMillis()
                            if (
                                !released &&
                                nowForSnapshot - lastSnapshotAt >= 2000L &&
                                snapshotEncoding.compareAndSet(false, true)
                            ) {
                                lastSnapshotAt = nowForSnapshot
                                val evidenceBitmap = runCatching { imageProxy.toEvidenceBitmap() }
                                    .onFailure { Log.e(TAG, "Evidence frame conversion failed", it) }
                                    .getOrNull()

                                if (evidenceBitmap != null && evidenceBitmap.width > 1 && evidenceBitmap.height > 1) {
                                    Thread {
                                        try {
                                            val dataUrl = evidenceBitmap.toSmallJpegDataUrl()
                                            val descriptor = faceEmbeddingModel.embed(evidenceBitmap)
                                            if (dataUrl.isNotBlank()) {
                                                mainHandler.post {
                                                    if (!released) {
                                                        onPreviewSnapshot(dataUrl)
                                                        descriptor?.let(onFaceDescriptorChanged)
                                                    }
                                                }
                                            }
                                        } catch (e: Exception) {
                                            Log.e(TAG, "Snapshot processing failed", e)
                                        } finally {
                                            runCatching { evidenceBitmap.recycle() }
                                            snapshotEncoding.set(false)
                                        }
                                    }.start()
                                } else {
                                    snapshotEncoding.set(false)
                                }
                            }

                            // 1. Run face detection on YUV ImageProxy
                            val faceTask = detector.process(image)
                                .addOnSuccessListener { faces ->
                                    if (released) return@addOnSuccessListener
                                    val recovered = separateSensorFailures && lastHealth != CameraSensorHealth.HEALTHY
                                    reportHealth(CameraSensorHealth.HEALTHY)
                                    val status = resolveFaceStatus(faces)
                                    if (status != lastStatus || recovered) {
                                        lastStatus = status
                                        postStatus(status)
                                    }
                                    faces.firstOrNull()?.let { face ->
                                        biometricTrace("BIOMETRIC_FACE_DETECTED", "faceCount=${faces.size}")
                                        mainHandler.post { if (!released) onFaceDetected(face) }
                                        if (!faceEmbeddingModel.isAvailable) {
                                            val descriptor = face.toDescriptor(image.width, image.height)
                                            mainHandler.post { if (!released) onFaceDescriptorChanged(descriptor) }
                                        }
                                    }
                                }
                                .addOnFailureListener { error ->
                                    Log.e(TAG, "Face detection failed", error)
                                    if (!released) reportFailure(CameraSensorHealth.ANALYZER_FAILED)
                                }
                            faceTask.addOnCompleteListener { imageProxy.close() }
                            detectorOwnsFrame = true

                            // 2. Run YOLOv8 object detection on RGB preview bitmap (every 10 frames)
                            val currentFrame = frameCounter++
                            if (currentFrame % 10 == 0 && yoloDetector.isAvailable) {
                                val bitmap = previewView.bitmap
                                if (bitmap != null) {
                                    yoloExecutor.execute {
                                        try {
                                            val detections = yoloDetector.detect(bitmap)
                                            mainHandler.post {
                                                if (released) return@post
                                                detectedObjects = detections
                                                onObjectsDetected(detections)
                                                if (detections.isNotEmpty()) {
                                                    val now = System.currentTimeMillis()
                                                    if (now - lastPhoneAlertAt > 8000) {
                                                        lastPhoneAlertAt = now
                                                        // Call the old callback for backwards compatibility
                                                        onPhoneDetected()
                                                        // Call the label-specific metadata callback
                                                        val labels = detections.map { it.label }.distinct().joinToString(", ")
                                                        onPhoneDetectedWithLabels(labels)
                                                    }
                                                }
                                            }
                                        } catch (ex: Exception) {
                                            Log.e(TAG, "YOLOv8 execution failed", ex)
                                        } finally {
                                            runCatching { bitmap.recycle() }
                                        }
                                    }
                                }
                            }

                            } catch (error: Exception) {
                                if (!detectorOwnsFrame) imageProxy.close()
                                Log.e(TAG, "Camera analyzer failed", error)
                                reportFailure(CameraSensorHealth.ANALYZER_FAILED)
                            }
                        }

                        biometricTrace("BIOMETRIC_CAMERA_BIND_START", "lensFacing=front lifecycle=${lifecycleOwner.lifecycle.currentState}")
                        val camera = cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            frontSelector,
                            preview,
                            imageAnalysis
                        )
                        biometricTrace("BIOMETRIC_CAMERA_BIND_SUCCESS", "lensFacing=front")
                        camera.cameraInfo.cameraState.observe(lifecycleOwner) { state ->
                            biometricTrace("BIOMETRIC_CAMERA_STATE", "state=${state.type}")
                            if (!released && (state.error != null || state.type in setOf(CameraState.Type.CLOSED, CameraState.Type.CLOSING, CameraState.Type.PENDING_OPEN))) {
                                reportFailure(CameraSensorHealth.TEMPORARILY_UNAVAILABLE, null)
                            }
                        }
                        cleanupCallbacks += { cameraProvider.unbind(preview, imageAnalysis) }
                    }.onFailure { error ->
                        biometricTrace("BIOMETRIC_CAMERA_BIND_FAILED", "exception=${error::class.java.simpleName}")
                        Log.e(TAG, "Biometric front camera setup failed", error)
                        onCameraError("Front camera could not start. Please retry biometric verification.")
                        reportFailure(CameraSensorHealth.CAMERA_INITIALIZATION_FAILED)
                    }
                }, mainExecutor)

                previewView
            },
            update = { _ -> }, // Modifiers are handled by the shell
            onRelease = { previewView ->
                biometricTrace("BIOMETRIC_CAMERA_DISPOSE", "lifecycle=${lifecycleOwner.lifecycle.currentState}")
                releaseActions.remove(previewView)?.invoke()
            }
        )

        // Draw Bounding Boxes Overlay Internally
        Canvas(modifier = Modifier.fillMaxSize()) {
            detectedObjects.forEach { obj ->
                val left = obj.boundingBox.left * size.width
                val top = obj.boundingBox.top * size.height
                val right = obj.boundingBox.right * size.width
                val bottom = obj.boundingBox.bottom * size.height

                // Draw bounding box border
                drawRect(
                    color = CheatLockDanger,
                    topLeft = androidx.compose.ui.geometry.Offset(left, top),
                    size = androidx.compose.ui.geometry.Size(right - left, bottom - top),
                    style = Stroke(width = 2.dp.toPx())
                )

                // Draw label background and text using native canvas
                drawContext.canvas.nativeCanvas.apply {
                    val textPaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.RED
                        textSize = 34f
                        style = android.graphics.Paint.Style.FILL
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setShadowLayer(4f, 2f, 2f, android.graphics.Color.BLACK)
                    }
                    drawText(
                        "${obj.label} ${(obj.confidence * 100).toInt()}%",
                        left + 10f,
                        top + 38f,
                        textPaint
                    )
                }
            }
        }
    }
}
}

private fun resolveFaceStatus(faces: List<Face>): FaceStatus {
    return when {
        faces.isEmpty() -> FaceStatus.NO_FACE
        faces.size > 1 -> FaceStatus.MULTIPLE_FACES
        else -> {
            val face = faces.first()
            when {
                face.headEulerAngleY > 28f || face.headEulerAngleY < -28f ||
                    face.headEulerAngleZ > 22f || face.headEulerAngleZ < -22f -> FaceStatus.LOOKING_AWAY
                else -> FaceStatus.FACE_FOUND
            }
        }
    }
}

private fun ImageProxy.toEvidenceBitmap(): Bitmap? {
    if (width <= 0 || height <= 0 || planes.size < 3) return null

    val nv21 = toNv21ByteArray()
    val jpegBytes = ByteArrayOutputStream().use { output ->
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val compressed = yuvImage.compressToJpeg(Rect(0, 0, width, height), 85, output)
        if (!compressed || output.size() <= 0) return null
        output.toByteArray()
    }

    val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size) ?: return null
    val rotationDegrees = imageInfo.rotationDegrees
    if (rotationDegrees == 0) return bitmap

    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
    return try {
        Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    } finally {
        bitmap.recycle()
    }
}

private fun ImageProxy.toNv21ByteArray(): ByteArray {
    val yPlane = planes[0]
    val uPlane = planes[1]
    val vPlane = planes[2]
    val ySize = width * height
    val uvSize = width * height / 4
    val nv21 = ByteArray(ySize + uvSize * 2)

    copyPlaneToByteArray(
        plane = yPlane,
        imageWidth = width,
        imageHeight = height,
        output = nv21,
        outputOffset = 0,
        outputPixelStride = 1
    )
    copyPlaneToByteArray(
        plane = vPlane,
        imageWidth = width / 2,
        imageHeight = height / 2,
        output = nv21,
        outputOffset = ySize,
        outputPixelStride = 2
    )
    copyPlaneToByteArray(
        plane = uPlane,
        imageWidth = width / 2,
        imageHeight = height / 2,
        output = nv21,
        outputOffset = ySize + 1,
        outputPixelStride = 2
    )

    return nv21
}

private fun copyPlaneToByteArray(
    plane: ImageProxy.PlaneProxy,
    imageWidth: Int,
    imageHeight: Int,
    output: ByteArray,
    outputOffset: Int,
    outputPixelStride: Int
) {
    val buffer = plane.buffer.duplicate()
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride

    for (row in 0 until imageHeight) {
        for (col in 0 until imageWidth) {
            val bufferIndex = row * rowStride + col * pixelStride
            val outputIndex = outputOffset + row * imageWidth * outputPixelStride + col * outputPixelStride
            if (bufferIndex < buffer.limit() && outputIndex < output.size) {
                output[outputIndex] = buffer.get(bufferIndex)
            }
        }
    }
}

private fun Bitmap.toSmallJpegDataUrl(): String {
    val maxSide = 320
    val largestSide = maxOf(width, height)
    val scaledBitmap = if (largestSide > maxSide) {
        val scale = maxSide.toFloat() / largestSide.toFloat()
        val targetWidth = (width * scale).toInt().coerceAtLeast(1)
        val targetHeight = (height * scale).toInt().coerceAtLeast(1)
        Bitmap.createScaledBitmap(this, targetWidth, targetHeight, true)
    } else {
        this
    }

    val output = ByteArrayOutputStream()
    scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 32, output)
    
    // Step 4: Recycle intermediate scaled bitmap
    if (scaledBitmap != this) {
        scaledBitmap.recycle()
    }

    val base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    return "data:image/jpeg;base64,$base64"
}

private fun Face.toDescriptor(imageWidth: Int, imageHeight: Int): List<Double> {
    val safeWidth = imageWidth.coerceAtLeast(1).toDouble()
    val safeHeight = imageHeight.coerceAtLeast(1).toDouble()
    val box = boundingBox
    return listOf(
        box.centerX() / safeWidth,
        box.centerY() / safeHeight,
        box.width() / safeWidth,
        box.height() / safeHeight,
        headEulerAngleY / 60.0,
        headEulerAngleZ / 60.0,
        (leftEyeOpenProbability ?: 0.5f).toDouble(),
        (rightEyeOpenProbability ?: 0.5f).toDouble()
    )
}
