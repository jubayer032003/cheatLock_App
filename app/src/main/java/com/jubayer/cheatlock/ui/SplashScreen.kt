package com.jubayer.cheatlock.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.*
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.ui.theme.CheatLockTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

@Composable
fun SplashScreen(
    initialUrl: String,
    onProbingComplete: (resolvedUrl: String, authenticatedUser: UserAccount?) -> Unit,
    onValidateSession: suspend (String) -> UserAccount?
) {
    val context = LocalContext.current
    val reducedMotion = remember {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
    var status by remember { mutableStateOf("Starting CheatLock") }
    var attempt by remember { mutableIntStateOf(0) }
    var connectionFailed by remember { mutableStateOf(false) }
    val validateSession by rememberUpdatedState(onValidateSession)
    val complete by rememberUpdatedState(onProbingComplete)
    // The session request also checks connectivity. Do not probe /health first or
    // silently switch servers while restoring credentials.
    LaunchedEffect(initialUrl, attempt) {
        connectionFailed = false
        status = "Restoring trusted session"
        try {
            val user = coroutineScope {
                // Start from a rendered frame so a fast local session check does
                // not remove the splash before the logo has appeared.
                val presentation = launch {
                    withFrameNanos { }
                    if (!reducedMotion) delay(700)
                }
                val restoredUser = withTimeout(8_000) { validateSession(initialUrl) }
                presentation.join()
                restoredUser
            }
            complete(initialUrl, user)
        } catch (_: TimeoutCancellationException) {
            connectionFailed = true
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            connectionFailed = true
        }
    }
    LoadingContent(
        status, reducedMotion, connectionFailed,
        onRetry = { attempt++ },
        onContinue = { complete(initialUrl, null) }
    )
}

private class LoadingColors(val dark: Boolean) {
    val background = if (dark) Color(0xFF0A1126) else Color.White
    val bottom = if (dark) Color(0xFF071A39) else Color(0xFFE8F2FF)
    val text = if (dark) Color(0xFFF2F5FF) else Color(0xFF0F1B3D)
    val muted = if (dark) Color(0xFF9AA8D0) else Color(0xFF5B6788)
    val blue = if (dark) Color(0xFF78AAFF) else Color(0xFF2563EB)
    val border = if (dark) Color(0xFF35599A) else Color(0xFFC9D6F5)
    val tile = if (dark) Color(0xFF14214A) else Color(0xFFE8EFFF)
    val track = if (dark) Color(0xFF1D3157) else Color(0xFFD6E4FA)
}

@Composable
private fun LoadingContent(
    status: String,
    reducedMotion: Boolean,
    connectionFailed: Boolean = false,
    onRetry: () -> Unit = {},
    onContinue: () -> Unit = {}
) {
    val colors = LoadingColors(MaterialTheme.colorScheme.background.luminance() < .5f)
    val reveal = remember { Animatable(if (reducedMotion) 1f else 0f) }
    val tagline = remember { Animatable(if (reducedMotion) 1f else 0f) }
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            reveal.snapTo(1f); tagline.snapTo(1f)
        } else {
            coroutineScope {
                launch { reveal.animateTo(1f, tween(220)) }
                launch {
                    delay(100)
                    tagline.animateTo(1f, tween(200))
                }
            }
        }
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(colors.background, colors.background, colors.bottom)))) {
        LoadingWaves(colors)
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
            val availableHeight = maxHeight
            val compact = availableHeight < 520.dp
            val logoSize = if (compact) 120.dp else 160.dp
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp).heightIn(min = availableHeight),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(Modifier.height(if (compact) 24.dp else availableHeight * .19f))
                Box(Modifier.size(logoSize + 40.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        drawCircle(Brush.radialGradient(listOf(colors.blue.copy(alpha = if (colors.dark) .14f else .07f), Color.Transparent)))
                    }
                    Image(
                        painterResource(if (colors.dark) R.drawable.cheatlock_logo_sidebar_svg else R.drawable.cheatlock_logo_light),
                        contentDescription = null, contentScale = ContentScale.Fit,
                        modifier = Modifier.size(logoSize).graphicsLayer {
                            alpha = reveal.value
                            scaleX = .94f + .06f * reveal.value
                            scaleY = scaleX
                        }
                    )
                }
                Spacer(Modifier.height(20.dp))
                LoadingWordmark(colors, reducedMotion)
                Spacer(Modifier.height(16.dp))
                Text(
                    stringResource(R.string.splash_tagline), color = colors.muted,
                    style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 340.dp).graphicsLayer {
                        alpha = tagline.value
                        translationY = (1f - tagline.value) * 5.dp.toPx()
                    }
                )
                Spacer(Modifier.height(if (compact) 36.dp else availableHeight * .13f))
                Column(Modifier.widthIn(max = 248.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    // Startup exposes stages, not numerical progress.
                    if (!connectionFailed) LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).clearAndSetSemantics { },
                        color = colors.blue, trackColor = colors.track
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(
                        stringResource(if (connectionFailed) R.string.splash_connection_failed else R.string.splash_getting_ready), color = colors.muted,
                        style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                            if (!connectionFailed) contentDescription = status
                        }
                    )
                    if (connectionFailed) {
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onRetry) { Text(stringResource(R.string.splash_retry)) }
                        TextButton(onClick = onContinue) { Text(stringResource(R.string.splash_continue)) }
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun LoadingWordmark(colors: LoadingColors, reducedMotion: Boolean) {
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val fontScale = LocalDensity.current.fontScale
        val unit = minOf(1f, maxWidth.value / (310f * fontScale))
        val fontSize = (34f * unit).sp
        val tileHeight = (48f * unit * fontScale).dp
        val tileWidth = (34f * unit * fontScale).dp
        Row(
            Modifier.clearAndSetSemantics { contentDescription = "CheatLock" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text("Cheat", color = colors.text, fontSize = fontSize, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
            Spacer(Modifier.width(2.dp))
            "LOCK".forEachIndexed { index, target ->
                LetterReel(target, index, tileWidth, tileHeight, fontSize, colors, reducedMotion)
            }
        }
    }
}

@Composable
private fun LetterReel(target: Char, index: Int, width: Dp, height: Dp, fontSize: TextUnit, colors: LoadingColors, reducedMotion: Boolean) {
    val steps = 9 + index * 2
    val letters = remember(target, index) {
        val alphabet = "ABDEFGHJMNPQRSTUVWXYZ"
        List(steps) { alphabet[(it * 7 + index * 3) % alphabet.length] } + target
    }
    val position = remember { Animatable(if (reducedMotion) steps.toFloat() else 0f) }
    val accent = remember { Animatable(if (reducedMotion) .55f else 0f) }
    val heightPx = with(LocalDensity.current) { height.toPx() }
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            position.snapTo(steps.toFloat()); accent.snapTo(.55f)
        } else {
            position.animateTo(steps.toFloat(), tween(280 + index * 40, easing = CubicBezierEasing(.16f, .84f, .3f, 1f)))
            accent.animateTo(1f, tween(100))
            accent.animateTo(.55f, tween(100))
        }
    }
    Box(
        Modifier.size(width, height).clip(RoundedCornerShape(7.dp))
            .background(Brush.verticalGradient(listOf(colors.tile, colors.tile.copy(alpha = .45f))))
            .border(1.dp, colors.border, RoundedCornerShape(7.dp)), contentAlignment = Alignment.TopCenter
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val line = colors.blue.copy(alpha = .25f + accent.value * .4f)
            drawLine(line, Offset(size.width * .36f, 3.dp.toPx()), Offset(size.width * .64f, 3.dp.toPx()), 1.dp.toPx())
            drawLine(line, Offset(size.width * .36f, size.height - 3.dp.toPx()), Offset(size.width * .64f, size.height - 3.dp.toPx()), 1.dp.toPx())
        }
        Column(Modifier.wrapContentHeight(unbounded = true, align = Alignment.Top).graphicsLayer { translationY = -position.value * heightPx }) {
            letters.forEach { letter ->
                Box(Modifier.size(width, height), contentAlignment = Alignment.Center) {
                    Text(letter.toString(), color = colors.blue, fontSize = fontSize, fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp)
                }
            }
        }
    }
}

@Composable
private fun LoadingWaves(colors: LoadingColors) {
    // Static vector waves keep background cost low and remain calm with reduced motion.
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val first = Path().apply {
            moveTo(0f, h * .81f)
            cubicTo(w * .35f, h * .84f, w * .5f, h * 1.04f, w, h * .76f)
            lineTo(w, h); lineTo(0f, h); close()
        }
        drawPath(first, Brush.verticalGradient(listOf(colors.blue.copy(alpha = .01f), colors.blue.copy(alpha = .10f)), startY = h * .76f, endY = h))
        val second = Path().apply {
            moveTo(0f, h * .94f)
            cubicTo(w * .45f, h * .98f, w * .68f, h * .79f, w, h * .86f)
            lineTo(w, h); lineTo(0f, h); close()
        }
        drawPath(second, Brush.verticalGradient(listOf(colors.blue.copy(alpha = .10f), Color.Transparent), startY = h * .84f, endY = h))
    }
}

@Preview(name = "Light 360", widthDp = 360, heightDp = 800)
@Composable
private fun LoadingLightPreview() = CheatLockTheme(darkTheme = false) { LoadingContent("Starting CheatLock", true) }

@Preview(name = "Dark 393", widthDp = 393, heightDp = 852)
@Composable
private fun LoadingDarkPreview() = CheatLockTheme(darkTheme = true) { LoadingContent("Starting CheatLock", true) }

@Preview(name = "Small height large text", widthDp = 360, heightDp = 480, fontScale = 2f)
@Composable
private fun LoadingLargeTextPreview() = CheatLockTheme(darkTheme = false) { LoadingContent("Starting CheatLock", true) }

@Preview(name = "Dark 412", widthDp = 412, heightDp = 915)
@Composable
private fun LoadingWidePreview() = CheatLockTheme(darkTheme = true) { LoadingContent("Starting CheatLock", true) }
