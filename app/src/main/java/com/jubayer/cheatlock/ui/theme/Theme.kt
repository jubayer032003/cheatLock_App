package com.jubayer.cheatlock.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = CheatLockDarkPrimaryNew,
    onPrimary = CheatLockLightBackground, // Text on primary
    primaryContainer = CheatLockDarkPrimaryContainerNew,
    onPrimaryContainer = CheatLockWhite,
    secondary = CheatLockDarkSecondaryNew,
    onSecondary = CheatLockWhite,
    tertiary = Color(0xFF60A5FA),
    onTertiary = CheatLockNavyDeep,
    background = CheatLockDarkBackgroundNew,
    onBackground = CheatLockDarkTextNew,
    surface = CheatLockDarkSurfaceNew,
    onSurface = CheatLockDarkTextNew,
    surfaceVariant = CheatLockNavySurface,
    onSurfaceVariant = CheatLockGray400,
    error = CheatLockDanger,
    onError = CheatLockWhite,
    outline = CheatLockNavyBorder,
    outlineVariant = CheatLockGray700
)

private val LightColorScheme = lightColorScheme(
    primary = CheatLockLightPrimary,
    onPrimary = CheatLockWhite,
    primaryContainer = CheatLockLightPrimaryContainer,
    onPrimaryContainer = CheatLockLightPrimary,
    secondary = CheatLockLightSecondary,
    onSecondary = CheatLockWhite,
    secondaryContainer = CheatLockLightSecondaryContainer,
    onSecondaryContainer = CheatLockLightSecondary,
    background = CheatLockLightBackground,
    onBackground = CheatLockLightTextPrimary,
    surface = CheatLockLightSurface,
    onSurface = CheatLockLightTextPrimary,
    surfaceVariant = CheatLockLightSurfaceSubtle,
    onSurfaceVariant = CheatLockLightTextSecondary,
    error = CheatLockLightDanger,
    onError = CheatLockWhite,
    errorContainer = CheatLockLightDangerContainer,
    onErrorContainer = CheatLockLightDanger,
    outline = CheatLockLightBorder,
    outlineVariant = CheatLockLightBorderSubtle
)

private val CheatLockShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

@Composable
fun CheatLockTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.setDecorFitsSystemWindows(window, false)
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = CheatLockShapes,
        content = content
    )
}
