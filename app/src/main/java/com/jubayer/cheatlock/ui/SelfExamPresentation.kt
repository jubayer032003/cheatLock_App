package com.jubayer.cheatlock.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.unit.dp
import com.jubayer.cheatlock.R
import java.text.NumberFormat

/** Scoped presentation tokens. No global theme, exam state or policy is changed. */
internal object SelfExamDesign {
    val cardShape = RoundedCornerShape(20.dp)
    val controlShape = RoundedCornerShape(14.dp)
    val buttonPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp)
    val isLight: Boolean @Composable get() = MaterialTheme.colorScheme.background.luminance() > 0.5f
    val canvas: Color @Composable get() = MaterialTheme.colorScheme.background
    val surface: Color @Composable get() = MaterialTheme.colorScheme.surface
    val inset: Color @Composable get() = MaterialTheme.colorScheme.surfaceVariant
    val text: Color @Composable get() = MaterialTheme.colorScheme.onSurface
    val secondaryText: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
    val border: Color @Composable get() = MaterialTheme.colorScheme.outline
    val controlBorder: Color @Composable get() = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8)
    val accent: Color @Composable get() = if (isLight) Color(0xFF1D4ED8) else Color(0xFF93C5FD)
    // White text on this fixed brand action color passes AA in both appearances.
    val action = Color(0xFF1D4ED8)
    val onAction = Color.White
    val success: Color @Composable get() = if (isLight) Color(0xFF047857) else Color(0xFF6EE7B7)
    val warning: Color @Composable get() = if (isLight) Color(0xFF92400E) else Color(0xFFFCD34D)
    val error: Color @Composable get() = if (isLight) Color(0xFFB91C1C) else Color(0xFFFCA5A5)
}

internal fun Modifier.selfExamControl() = heightIn(min = 48.dp)

/** Formatting is for display only; counts, IDs and wire values are never converted. */
@Composable
internal fun selfExamNumber(value: Number): String {
    val locale = LocalConfiguration.current.locales[0]
    return NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(value)
}

@Composable
internal fun selfExamQuestionCount(count: Int): String =
    pluralStringResource(R.plurals.se_question_count, count, selfExamNumber(count))

@Composable
internal fun selfExamTime(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    val formatter = NumberFormat.getIntegerInstance(LocalConfiguration.current.locales[0])
    val minutes = formatter.format(safe / 60)
    formatter.minimumIntegerDigits = 2
    return minutes + ":" + formatter.format(safe % 60)
}

@Composable
internal fun selfExamDifficulty(token: String): String = stringResource(when (token) {
    "easy" -> R.string.easy
    "medium" -> R.string.medium
    "hard" -> R.string.hard
    else -> R.string.mixed
})

@Composable
internal fun selfExamTrack(admission: Boolean): String = stringResource(
    if (admission) R.string.se_admission else R.string.se_academic
)

internal val LocalSelfExamPresentation = staticCompositionLocalOf { false }

@Composable
internal fun selfExamColor(original: Color, scoped: Color): Color =
    if (LocalSelfExamPresentation.current) scoped else original

@Composable
internal fun selfExamFaceStatus(status: FaceStatus): String = when (status.name) {
    "FACE_FOUND" -> stringResource(R.string.se_face_found)
    "FACE_MISSING", "NO_FACE" -> stringResource(R.string.se_face_missing)
    "MULTIPLE_FACES" -> stringResource(R.string.se_multiple_faces)
    "LOOKING_AWAY" -> stringResource(R.string.se_looking_away)
    else -> stringResource(R.string.se_checking)
}
