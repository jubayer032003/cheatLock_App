package com.jubayer.cheatlock.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.ui.theme.CheatLockTheme
import com.jubayer.cheatlock.util.SuspicionScoreCalculator

@Composable
fun ResultScreen(
    studentId: String,
    appSwitchWarnings: Int,
    faceMissingWarnings: Int,
    audioWarnings: Int = 0,
    phoneWarnings: Int = 0,
    authoritativeSuspicionScore: Int? = null,
    grade: Double? = null,
    feedback: String? = null,
    gradedAt: String? = null,
    answers: List<StudentAnswer>,
    onBackToLogin: () -> Unit
) {
    // Preserve the existing authoritative-score precedence, fallback and classification.
    val locallyCalculatedScore = SuspicionScoreCalculator.calculateScore(
        appSwitchWarnings = appSwitchWarnings,
        faceMissingWarnings = faceMissingWarnings,
        audioWarnings = audioWarnings,
        phoneWarnings = phoneWarnings,
    )
    val integrityScore = authoritativeSuspicionScore ?: locallyCalculatedScore
    val riskLevel = SuspicionScoreCalculator.riskLevel(integrityScore)
    val colors = ResultColors(MaterialTheme.colorScheme.background.luminance() < .5f, MaterialTheme.colorScheme)
    val context = LocalContext.current
    val reducedMotion = remember(context) {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }

    Box(Modifier.fillMaxSize().background(colors.background).safeDrawingPadding()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(Modifier.widthIn(max = 560.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                ResultBrand(colors)
                ResultStatus(grade != null, colors)
                if (grade != null) {
                    ResultGradeCard(grade, colors, reducedMotion)
                    if (!feedback.isNullOrBlank()) ResultFeedback(feedback, colors)
                }
                ResultRiskCard(integrityScore, riskLevel, colors, reducedMotion)
                ResultSignals(appSwitchWarnings, faceMissingWarnings, audioWarnings, phoneWarnings, colors)
                ResultCard(colors) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(stringResource(R.string.result_student_id), style = MaterialTheme.typography.labelMedium, color = colors.muted)
                        Text(studentId, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = colors.text)
                    }
                }
                Button(
                    onClick = onBackToLogin,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFBE2230), contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp)
                ) {
                    Icon(Icons.Outlined.Dashboard, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.return_to_dashboard), style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(4.dp))
            }
        }
    }
}

private class ResultColors(val dark: Boolean, scheme: ColorScheme) {
    val background = scheme.background
    val surface = scheme.surface
    val text = scheme.onSurface
    val muted = scheme.onSurfaceVariant
    val border = scheme.outlineVariant
    val blue = if (dark) Color(0xFF9DBDFF) else Color(0xFF174DAA)
    val tint = if (dark) Color(0xFF203454) else Color(0xFFEDF3FF)
    val hero = if (dark) Color(0xFF1B3A8F) else Color(0xFF0B4FD8)
    val track = if (dark) Color(0xFF334358) else Color(0xFFE5EBF4)
}

@Composable
private fun ResultCard(colors: ResultColors, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), color = colors.surface, border = BorderStroke(1.dp, colors.border)) {
        Column(Modifier.padding(20.dp), content = content)
    }
}

@Composable
private fun SectionTitle(text: String, colors: ResultColors) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = colors.text,
        modifier = Modifier.semantics { heading() })
}

@Composable
private fun ResultBrand(colors: ResultColors) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(
            painterResource(if (colors.dark) R.drawable.cheatlock_logo_sidebar_svg else R.drawable.cheatlock_logo_light),
            contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(40.dp)
        )
        Text("CheatLock", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = colors.text)
    }
}

@Composable
private fun ResultStatus(graded: Boolean, colors: ResultColors) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
        Surface(shape = RoundedCornerShape(16.dp), color = colors.tint) {
            Icon(if (graded) Icons.Outlined.TaskAlt else Icons.Outlined.AssignmentTurnedIn, null, tint = colors.blue,
                modifier = Modifier.padding(14.dp).size(24.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(if (graded) R.string.exam_graded else R.string.submitted), style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold, color = colors.text, modifier = Modifier.semantics { heading() })
            Text(stringResource(if (graded) R.string.final_results_confirmed else R.string.security_seal_applied),
                style = MaterialTheme.typography.bodySmall, color = colors.blue)
        }
    }
}

@Composable
private fun ResultGradeCard(grade: Double, colors: ResultColors, reducedMotion: Boolean) {
    // The existing teacher endpoint explicitly validates grades on a 0..100 scale.
    // Preserve raw grade text; only clamp the decorative arc, never the displayed result.
    val progress = if (grade.isFinite()) (grade / 100.0).coerceIn(0.0, 1.0).toFloat() else 0f
    val animated = resultVisualProgress(progress, reducedMotion)
    val gradeDescription = contextGradeDescription(grade)
    Surface(shape = RoundedCornerShape(24.dp), color = colors.hero, modifier = Modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.padding(24.dp)) {
            val stacked = maxWidth < 260.dp || LocalDensity.current.fontScale > 1.3f
            val score: @Composable () -> Unit = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.clearAndSetSemantics {
                    contentDescription = gradeDescription
                }) {
                    Text(stringResource(R.string.official_assessment), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = .9f))
                    Text(grade.toString(), fontSize = 52.sp, lineHeight = 60.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(stringResource(R.string.result_out_of_100), style = MaterialTheme.typography.titleMedium, color = Color.White.copy(alpha = .9f))
                }
            }
            val ring: @Composable () -> Unit = {
                Box(Modifier.size(112.dp).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        val inset = 6.dp.toPx()
                        val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
                        drawArc(Color.White.copy(alpha = .2f), -90f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(7.dp.toPx(), cap = StrokeCap.Round))
                        drawArc(Color.White, -90f, 360f * animated.value, false, Offset(inset, inset), arcSize, style = Stroke(7.dp.toPx(), cap = StrokeCap.Round))
                    }
                    if (grade.isFinite() && grade in 0.0..100.0) {
                        Text(stringResource(R.string.result_percentage, grade.toString()), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
            if (stacked) Column(verticalArrangement = Arrangement.spacedBy(24.dp)) { score(); ring() }
            else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.weight(1f)) { score() }; ring()
            }
        }
    }
}

@Composable
private fun contextGradeDescription(grade: Double): String = stringResource(R.string.result_grade_description, grade.toString())

@Composable
private fun ResultFeedback(feedback: String, colors: ResultColors) {
    ResultCard(colors) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.width(3.dp).height(36.dp).background(colors.blue, RoundedCornerShape(2.dp)))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.instructor_feedback), style = MaterialTheme.typography.labelLarge, color = colors.blue, fontWeight = FontWeight.Bold)
                Text(feedback, style = MaterialTheme.typography.bodyLarge, color = colors.text)
            }
        }
    }
}

@Composable
private fun ResultRiskCard(score: Int, risk: String, colors: ResultColors, reducedMotion: Boolean) {
    // Map only the calculator's existing labels, without adding or changing thresholds.
    val riskLabel = stringResource(when (risk) { "High Risk" -> R.string.risk_high; "Medium Risk" -> R.string.risk_medium; else -> R.string.risk_low })
    val riskColor = when (risk) {
        "High Risk" -> if (colors.dark) Color(0xFFFFA6AD) else Color(0xFFB42335)
        "Medium Risk" -> if (colors.dark) Color(0xFFFFD08A) else Color(0xFF8A4A06)
        else -> if (colors.dark) Color(0xFF83DFBC) else Color(0xFF14734F)
    }
    val animated = resultVisualProgress(score.coerceIn(0, 100) / 100f, reducedMotion)
    val description = stringResource(R.string.result_risk_description, score, riskLabel)
    ResultCard(colors) {
        SectionTitle(stringResource(R.string.integrity_analysis), colors)
        Spacer(Modifier.height(12.dp))
        Surface(shape = CircleShape, color = riskColor.copy(alpha = .12f)) {
            Text(riskLabel, color = riskColor, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp))
        }
        Spacer(Modifier.height(16.dp))
        Column(Modifier.clearAndSetSemantics { contentDescription = description }) {
            Text(stringResource(R.string.result_percentage, score.toString()), fontSize = 40.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold, color = riskColor)
            Text(stringResource(R.string.result_risk_score), style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            Spacer(Modifier.height(14.dp))
            Canvas(Modifier.fillMaxWidth().height(8.dp)) {
                drawLine(colors.track, Offset(4.dp.toPx(), center.y), Offset(size.width - 4.dp.toPx(), center.y), 8.dp.toPx(), StrokeCap.Round)
                if (animated.value > 0f) drawLine(riskColor, Offset(4.dp.toPx(), center.y), Offset(4.dp.toPx() + (size.width - 8.dp.toPx()) * animated.value, center.y), 8.dp.toPx(), StrokeCap.Round)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.result_risk_hint), style = MaterialTheme.typography.bodySmall, color = colors.muted)
    }
}

@Composable
private fun ResultSignal(labelId: Int, count: Int, icon: ImageVector, colors: ResultColors, modifier: Modifier) {
    val label = stringResource(labelId)
    // Counts stay unmodified. A blue tint indicates a recorded signal, not a verdict.
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = if (count > 0) colors.tint else colors.surface, border = BorderStroke(1.dp, colors.border)) {
        Column(Modifier.padding(16.dp).semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, contentDescription = null, tint = if (count > 0) colors.blue else colors.muted, modifier = Modifier.size(24.dp))
            Text(count.toString(), fontSize = 30.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold, color = colors.text)
            Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
    }
}

@Composable
private fun resultVisualProgress(target: Float, reducedMotion: Boolean): Animatable<Float, androidx.compose.animation.core.AnimationVector1D> {
    val animated = remember { Animatable(if (reducedMotion) target else 0f) }
    LaunchedEffect(target, reducedMotion) {
        if (reducedMotion) animated.snapTo(target)
        else animated.animateTo(target, tween(850, easing = FastOutSlowInEasing))
    }
    return animated
}

// Isolated design-time fixtures only. They cannot replace production result state.
@Preview(name = "Graded light 360", widthDp = 360, heightDp = 800)
@Composable
private fun ResultLightPreview() = CheatLockTheme(false) {
    ResultScreen("Preview student", 0, 0, grade = 0.0, answers = emptyList(), onBackToLogin = {})
}

@Preview(name = "Graded dark 393", widthDp = 393, heightDp = 852)
@Composable
private fun ResultDarkPreview() = CheatLockTheme(true) {
    ResultScreen("Preview student", 1, 1, authoritativeSuspicionScore = 40, grade = 72.5,
        feedback = "Preview feedback", answers = emptyList(), onBackToLogin = {})
}

@Preview(name = "Pending high risk 412", widthDp = 412, heightDp = 915)
@Composable
private fun ResultPendingPreview() = CheatLockTheme(false) {
    ResultScreen("Preview student", 4, 0, answers = emptyList(), onBackToLogin = {})
}

@Preview(name = "Bangla dark large type", widthDp = 360, heightDp = 800, fontScale = 2f, locale = "bn")
@Composable
private fun ResultBanglaPreview() = CheatLockTheme(true) {
    ResultScreen("Preview student with a long identifier", 0, 0, grade = 100.0, answers = emptyList(), onBackToLogin = {})
}


@Composable
private fun ResultSignals(appSwitches: Int, faces: Int, audio: Int, phones: Int, colors: ResultColors) {
    val signals = listOf(
        Triple(R.string.app_switches, appSwitches, Icons.AutoMirrored.Outlined.OpenInNew),
        Triple(R.string.face_alerts, faces, Icons.Outlined.Face),
        Triple(R.string.audio_signals, audio, Icons.Outlined.MicNone),
        Triple(R.string.mobile_detection, phones, Icons.Outlined.Smartphone)
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle(stringResource(R.string.result_detected_signals), colors)
        BoxWithConstraints {
            val columns = if (maxWidth < 300.dp || LocalDensity.current.fontScale >= 1.7f) 1 else 2
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                signals.chunked(columns).forEach { group ->
                    Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        group.forEach { (label, count, icon) -> ResultSignal(label, count, icon, colors, Modifier.weight(1f).fillMaxHeight()) }
                    }
                }
            }
        }
    }
}
