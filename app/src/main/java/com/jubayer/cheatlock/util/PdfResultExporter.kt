package com.jubayer.cheatlock.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.core.content.FileProvider
import com.jubayer.cheatlock.model.ExamSubmission
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfResultExporter {

    fun exportAndShareResult(
        context: Context,
        submission: ExamSubmission,
        studentName: String = "Student"
    ) {
        runCatching {
            val pdfDocument = PdfDocument()
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 page (595x842 pt)
            val page = pdfDocument.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val paint = Paint().apply { isAntiAlias = true }
            val titlePaint = Paint().apply {
                isAntiAlias = true
                textSize = 18f
                isFakeBoldText = true
                color = Color.rgb(8, 124, 255)
            }
            val headerPaint = Paint().apply {
                isAntiAlias = true
                textSize = 13f
                isFakeBoldText = true
                color = Color.rgb(15, 23, 42)
            }
            val bodyPaint = Paint().apply {
                isAntiAlias = true
                textSize = 10f
                color = Color.rgb(71, 85, 105)
            }
            val accentPaint = Paint().apply {
                isAntiAlias = true
                textSize = 10f
                isFakeBoldText = true
                color = Color.rgb(37, 99, 235)
            }

            var y = 44f

            // Top Brand Line
            paint.color = Color.rgb(8, 124, 255)
            canvas.drawRect(36f, y, 559f, y + 4f, paint)
            y += 26f

            canvas.drawText("CHEATLOCK - OFFICIAL EXAMINATION GRADE SHEET", 36f, y, titlePaint)
            y += 16f
            canvas.drawText("Verified Academic Assessment & AI Proctoring Report", 36f, y, bodyPaint)
            y += 24f

            // Metadata Box
            paint.color = Color.rgb(241, 245, 249)
            canvas.drawRoundRect(36f, y, 559f, y + 78f, 8f, 8f, paint)

            val dateStr = if (submission.submittedAt > 0) {
                SimpleDateFormat("MMM dd, yyyy • hh:mm a", Locale.getDefault()).format(Date(submission.submittedAt))
            } else "Recent Attempt"

            canvas.drawText("Student: $studentName (${submission.studentId.ifBlank { "N/A" }})", 48f, y + 24f, headerPaint)
            canvas.drawText("Exam: ${submission.examId?.ifBlank { "Assessment" } ?: "Practice Exam"}", 48f, y + 44f, bodyPaint)
            canvas.drawText("Date & Time: $dateStr", 48f, y + 64f, bodyPaint)

            val gradeStr = if (submission.grade != null) String.format(Locale.US, "%.1f%%", submission.grade) else "Submitted"
            accentPaint.textSize = 20f
            canvas.drawText(gradeStr, 455f, y + 46f, accentPaint)
            accentPaint.textSize = 10f

            y += 98f

            // Integrity & Proctoring Audit
            canvas.drawText("AI PROCTORING & INTEGRITY AUDIT", 36f, y, headerPaint)
            y += 16f

            paint.color = Color.rgb(248, 250, 252)
            canvas.drawRoundRect(36f, y, 559f, y + 54f, 8f, 8f, paint)

            val riskLabel = if (submission.totalWarnings == 0) "100/100 CLEAN" else "${submission.totalWarnings} Warnings Logged"
            canvas.drawText("• Proctoring Status: $riskLabel", 48f, y + 22f, bodyPaint)
            canvas.drawText("• Questions Submitted: ${submission.answers.size}", 48f, y + 40f, bodyPaint)
            canvas.drawText("• Device & Screen Protection: Verified Active", 310f, y + 22f, bodyPaint)

            y += 74f

            // Question Breakdown
            if (submission.answers.isNotEmpty()) {
                canvas.drawText("QUESTION BREAKDOWN", 36f, y, headerPaint)
                y += 18f

                submission.answers.take(14).forEachIndexed { idx, ans ->
                    if (y > 780f) return@forEachIndexed
                    val qClean = ans.questionText.replace("\n", " ").take(68).ifBlank { "Question ${idx + 1}" }
                    val aClean = ans.answerText.replace("\n", " ").take(78).ifBlank { "No answer" }

                    paint.color = Color.rgb(241, 245, 249)
                    canvas.drawRoundRect(36f, y, 559f, y + 34f, 6f, 6f, paint)

                    canvas.drawText("${idx + 1}. $qClean", 44f, y + 14f, bodyPaint)
                    canvas.drawText("Answer: $aClean", 44f, y + 28f, accentPaint)
                    y += 38f
                }
            }

            // Footer
            y = 808f
            paint.color = Color.rgb(226, 232, 240)
            canvas.drawLine(36f, y, 559f, y, paint)
            y += 14f
            bodyPaint.textSize = 8.5f
            canvas.drawText("Generated by CheatLock Academic Proctoring Engine • Digitally Verified Grade Sheet", 36f, y, bodyPaint)

            pdfDocument.finishPage(page)

            val sanitizedExamId = (submission.examId ?: "Exam").replace(Regex("[^a-zA-Z0-9_]"), "_").take(30)
            val fileName = "CheatLock_Result_${sanitizedExamId}_${System.currentTimeMillis()}.pdf"

            // 1. Save directly to public Downloads folder so it downloads properly
            var savedToDownloads = false
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val contentValues = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                        put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CheatLock")
                    }
                    val resolver = context.contentResolver
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { out ->
                            pdfDocument.writeTo(out)
                        }
                        savedToDownloads = true
                    }
                } else {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    val targetFile = File(downloadsDir, fileName)
                    FileOutputStream(targetFile).use { out ->
                        pdfDocument.writeTo(out)
                    }
                    savedToDownloads = true
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // 2. Also save to app cache for immediate opening/sharing via FileProvider
            val cacheDir = File(context.cacheDir, "cheatlock_reports").apply { mkdirs() }
            val cacheFile = File(cacheDir, fileName)
            FileOutputStream(cacheFile).use { out ->
                pdfDocument.writeTo(out)
            }
            pdfDocument.close()

            // 3. Share/View via FileProvider with FLAG_ACTIVITY_NEW_TASK
            val contentUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                cacheFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                putExtra(Intent.EXTRA_SUBJECT, "CheatLock Grade Sheet - $sanitizedExamId")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val chooser = Intent.createChooser(shareIntent, "Save or Share Grade Sheet PDF").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)

            val message = if (savedToDownloads) {
                "Grade Sheet downloaded to Downloads folder!"
            } else {
                "Grade Sheet PDF generated successfully!"
            }
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }.onFailure { error ->
            error.printStackTrace()
            Toast.makeText(context, "Could not generate PDF: ${error.message}", Toast.LENGTH_LONG).show()
        }
    }
}