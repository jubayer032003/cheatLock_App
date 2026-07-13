package com.jubayer.cheatlock.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import com.jubayer.cheatlock.ui.theme.CheatLockDanger
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.Executor

private const val TAG = "CameraPreview"

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
    onPhoneDetectedWithLabels: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainExecutor = ContextCompat.getMainExecutor(context)

    var detectedObjects by remember { mutableStateOf<List<DetectedObject>>(emptyList()) }

    // Key the view to the lifecycleOwner and startup preference
    key(lifecycleOwner, preferFastStartup) {
        Box(modifier = modifier) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }

                val faceEmbeddingModel = FaceEmbeddingModel(ctx.applicationContext)
                val mainHandler = Handler(Looper.getMainLooper())
                val cleanupCallbacks = mutableListOf<() -> Unit>()

                fun postStatus(status: FaceStatus) {
                    mainHandler.post { onFaceStatusChanged(status) }
                }

                postStatus(FaceStatus.CHECKING)

                previewView.setTag {
                    cleanupCallbacks.asReversed().forEach { cleanup ->
                        runCatching { cleanup() }
                    }
                }

                val snapshotTask = object : Runnable {
                    override fun run() {
                        val bitmap = previewView.bitmap
                        if (bitmap != null) {
                            Thread {
                                try {
                                    val dataUrl = bitmap.toSmallJpegDataUrl()
                                    val descriptor = faceEmbeddingModel.embed(bitmap)

                                    mainHandler.post {
                                        onPreviewSnapshot(dataUrl)
                                        descriptor?.let(onFaceDescriptorChanged)
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "Snapshot processing failed", e)
                                } finally {
                                    // Always recycle the bitmap, even on error paths
                                    runCatching { bitmap.recycle() }
                                }
                            }.start()
                        }
                        mainHandler.postDelayed(this, 2000)
                    }
                }
                mainHandler.postDelayed(snapshotTask, if (preferFastStartup) 400L else 1500L)
                cleanupCallbacks += {
                    mainHandler.removeCallbacksAndMessages(null)
                    faceEmbeddingModel.close()
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    runCatching {
                        val cameraProvider = cameraProviderFuture.get()
                        
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

                        val detector = FaceDetection.getClient(detectorOptions)
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
                            val mediaImage = imageProxy.image
                            if (mediaImage == null) {
                                imageProxy.close()
                                return@setAnalyzer
                            }

                            val image = InputImage.fromMediaImage(
                                mediaImage,
                                imageProxy.imageInfo.rotationDegrees
                            )

                            // 1. Run face detection on YUV ImageProxy
                            val faceTask = detector.process(image)
                                .addOnSuccessListener { faces ->
                                    val status = resolveFaceStatus(faces)
                                    if (status != lastStatus) {
                                        lastStatus = status
                                        postStatus(status)
                                    }
                                    faces.firstOrNull()?.let { face ->
                                        mainHandler.post { onFaceDetected(face) }
                                        if (!faceEmbeddingModel.isAvailable) {
                                            face.toDescriptor(image.width, image.height)
                                                .let { descriptor ->
                                                    mainHandler.post { onFaceDescriptorChanged(descriptor) }
                                                }
                                        }
                                    }
                                }
                                .addOnFailureListener { error ->
                                    Log.e(TAG, "Face detection failed", error)
                                    postStatus(FaceStatus.NO_FACE)
                                }

                            // 2. Run YOLOv8 object detection on RGB preview bitmap (every 10 frames)
                            val currentFrame = frameCounter++
                            if (currentFrame % 10 == 0 && yoloDetector.isAvailable) {
                                val bitmap = previewView.bitmap
                                if (bitmap != null) {
                                    yoloExecutor.execute {
                                        try {
                                            val detections = yoloDetector.detect(bitmap)
                                            mainHandler.post {
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

                            faceTask.addOnCompleteListener { imageProxy.close() }
                        }

                        val selectors = listOf(
                            CameraSelector.DEFAULT_FRONT_CAMERA,
                            CameraSelector.DEFAULT_BACK_CAMERA
                        )
                        
                        var bound = false
                        for (selector in selectors) {
                            if (bound) break
                            try {
                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    selector,
                                    preview,
                                    imageAnalysis
                                )
                                bound = true
                                Log.d(TAG, "Camera bound: $selector")
                            } catch (bindError: Exception) {
                                Log.w(TAG, "Could not bind $selector", bindError)
                            }
                        }
                        
                        if (!bound) {
                            postStatus(FaceStatus.NO_FACE)
                        } else {
                            cleanupCallbacks += { cameraProvider.unbindAll() }
                        }
                    }.onFailure { error ->
                        Log.e(TAG, "Camera setup failed", error)
                        postStatus(FaceStatus.NO_FACE)
                    }
                }, mainExecutor)

                previewView
            },
            update = { _ -> }, // Modifiers are handled by the shell
            onRelease = { previewView ->
                (previewView.getTag() as? (() -> Unit))?.invoke()
                previewView.setTag(null)
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
