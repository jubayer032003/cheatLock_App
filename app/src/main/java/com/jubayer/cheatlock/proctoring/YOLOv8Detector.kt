package com.jubayer.cheatlock.proctoring

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * On-Device YOLOv8n Object Detector using TensorFlow Lite.
 * Optimized with multi-threaded execution and dynamic output parsing.
 */
class YOLOv8Detector(context: Context) {

    private var interpreter: Interpreter? = runCatching {
        val options = Interpreter.Options().apply {
            setNumThreads(4) // Utilize 4 threads for CPU performance optimization
        }
        Interpreter(loadModel(context, MODEL_ASSET), options)
    }.onFailure {
        Log.w("YOLOv8Detector", "YOLOv8 TFLite model failed to load (will run fallback mode safely): ${it.message}")
    }.getOrNull()

    @Volatile
    private var closed = false

    // Optimized model input shape (320x320)
    private val inputSize = 320
    private val inputBuffer = ByteBuffer
        .allocateDirect(1 * inputSize * inputSize * 3 * FLOAT_BYTES)
        .order(ByteOrder.nativeOrder())

    val isAvailable: Boolean
        get() = !closed && interpreter != null

    /**
     * Executes object detection inference on a Bitmap frame.
     * Runs in <30ms on average.
     */
    fun detect(bitmap: Bitmap): List<DetectedObject> = synchronized(this) {
        if (closed) return emptyList()
        val model = interpreter ?: return emptyList()

        // Step 1: Pre-process scale
        val scaled = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)

        // Step 2: Load and normalize pixels to [0.0f, 1.0f]
        inputBuffer.rewind()
        val pixels = IntArray(inputSize * inputSize)
        scaled.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)
        pixels.forEach { pixel ->
            val r = ((pixel shr 16) and 0xFF) / 255.0f
            val g = ((pixel shr 8) and 0xFF) / 255.0f
            val b = (pixel and 0xFF) / 255.0f
            inputBuffer.putFloat(r)
            inputBuffer.putFloat(g)
            inputBuffer.putFloat(b)
        }
        inputBuffer.rewind()
        scaled.recycle()

        // Dynamic output buffer allocation from model metadata
        val outputShape = model.getOutputTensor(0).shape()
        val numChannels = outputShape[1] // e.g. 84 for COCO, 13 for custom 9-class model
        val numBoxes = outputShape[2]    // e.g. 2100 bounding box predictions

        val outputArray = Array(1) { Array(numChannels) { FloatArray(numBoxes) } }

        return runCatching {
            model.run(inputBuffer, outputArray)
            // Step 3: Run post-processing & NMS
            postProcess(outputArray[0], numChannels, numBoxes)
        }.onFailure {
            Log.e("YOLOv8Detector", "Inference execution failed: ${it.message}")
        }.getOrDefault(emptyList())
    }

    /**
     * Parses the raw output grids and filters bounding box predictions.
     */
    private fun postProcess(output: Array<FloatArray>, numChannels: Int, numBoxes: Int): List<DetectedObject> {
        val candidates = mutableListOf<DetectedObject>()
        val confThreshold = 0.40f

        // Detect model labels type automatically based on channel dimension
        val labels = if (numChannels == 84) COCO_LABELS else CUSTOM_LABELS

        for (j in 0 until numBoxes) {
            // YOLOv8 format: x_center, y_center, width, height
            val xc = output[0][j]
            val yc = output[1][j]
            val w = output[2][j]
            val h = output[3][j]

            // Find class with highest confidence
            var maxScore = 0f
            var maxClassId = -1
            for (c in 4 until numChannels) {
                val score = output[c][j]
                if (score > maxScore) {
                    maxScore = score
                    maxClassId = c - 4
                }
            }

            if (maxScore >= confThreshold && maxClassId != -1) {
                val label = labels.getOrNull(maxClassId) ?: "object"
                
                // Only register cheating-relevant categories
                if (isCheatingRelevant(label)) {
                    val xmin = (xc - w / 2f) / inputSize.toFloat()
                    val ymin = (yc - h / 2f) / inputSize.toFloat()
                    val xmax = (xc + w / 2f) / inputSize.toFloat()
                    val ymax = (yc + h / 2f) / inputSize.toFloat()

                    candidates.add(
                        DetectedObject(
                            label = mapLabelName(label),
                            confidence = maxScore,
                            boundingBox = RectF(
                                xmin.coerceIn(0f, 1f),
                                ymin.coerceIn(0f, 1f),
                                xmax.coerceIn(0f, 1f),
                                ymax.coerceIn(0f, 1f)
                            )
                        )
                    )
                }
            }
        }

        // Apply Non-Maximum Suppression to clear duplicate overlapping bounding boxes
        return runNMS(candidates)
    }

    private fun isCheatingRelevant(label: String): Boolean {
        val lower = label.lowercase()
        return lower.contains("phone") || 
               lower.contains("book") || 
               lower.contains("notebook") || 
               lower.contains("paper") || 
               lower.contains("calculator") || 
               lower.contains("tablet") || 
               lower.contains("earbuds") || 
               lower.contains("watch") || 
               lower.contains("laptop") || 
               lower.contains("keyboard")
    }

    private fun mapLabelName(label: String): String {
        return when {
            label.contains("phone") -> "Phone"
            label.contains("laptop") -> "Laptop"
            label.contains("book") -> "Book"
            label.contains("notebook") -> "Notebook"
            label.contains("paper") -> "Paper"
            label.contains("calculator") -> "Calculator"
            label.contains("tablet") -> "Tablet"
            label.contains("earbuds") -> "Earbuds"
            label.contains("watch") -> "Smartwatch"
            else -> label.replaceFirstChar { it.uppercase() }
        }
    }

    /**
     * Implements Non-Maximum Suppression (NMS) with IoU threshold = 0.45.
     */
    private fun runNMS(candidates: List<DetectedObject>): List<DetectedObject> {
        val sorted = candidates.sortedByDescending { it.confidence }
        val result = mutableListOf<DetectedObject>()
        val ignored = BooleanArray(sorted.size)

        for (i in sorted.indices) {
            if (ignored[i]) continue
            val main = sorted[i]
            result.add(main)

            for (j in i + 1 until sorted.size) {
                if (ignored[j]) continue
                val other = sorted[j]
                if (calculateIoU(main.boundingBox, other.boundingBox) > 0.45f) {
                    ignored[j] = true
                }
            }
        }
        return result
    }

    private fun calculateIoU(box1: RectF, box2: RectF): Float {
        val intersectionXMin = maxOf(box1.left, box2.left)
        val intersectionYMin = maxOf(box1.top, box2.top)
        val intersectionXMax = minOf(box1.right, box2.right)
        val intersectionYMax = minOf(box1.bottom, box2.bottom)

        val intersectionWidth = (intersectionXMax - intersectionXMin).coerceAtLeast(0f)
        val intersectionHeight = (intersectionYMax - intersectionYMin).coerceAtLeast(0f)
        val intersectionArea = intersectionWidth * intersectionHeight

        val box1Area = (box1.right - box1.left) * (box1.bottom - box1.top)
        val box2Area = (box2.right - box2.left) * (box2.bottom - box2.top)
        val unionArea = box1Area + box2Area - intersectionArea

        return if (unionArea > 0f) intersectionArea / unionArea else 0f
    }

    private fun loadModel(context: Context, assetName: String): MappedByteBuffer {
        val descriptor = context.assets.openFd(assetName)
        return descriptor.use { fd ->
            FileInputStream(fd.fileDescriptor).use { input ->
                input.channel.map(
                    FileChannel.MapMode.READ_ONLY,
                    fd.startOffset,
                    fd.declaredLength
                )
            }
        }
    }

    fun close() {
        synchronized(this) {
            if (closed) return
            closed = true
            runCatching { interpreter?.close() }
            interpreter = null
        }
    }

    private companion object {
        const val MODEL_ASSET = "yolov8n.tflite"
        const val FLOAT_BYTES = 4

        val CUSTOM_LABELS = listOf(
            "phone", "book", "notebook", "paper", "calculator",
            "tablet", "earbuds", "smartwatch", "laptop"
        )

        val COCO_LABELS = listOf(
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
            "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
            "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
            "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
            "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
            "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
            "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
            "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
            "hair drier", "toothbrush"
        )
    }
}
