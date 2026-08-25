package com.jubayer.cheatlock.ui

import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.ui.theme.CheatLockDarkBackground
import com.jubayer.cheatlock.ui.theme.CheatLockGray400
import com.jubayer.cheatlock.ui.theme.CheatLockNavyRich
import com.jubayer.cheatlock.ui.theme.CheatLockPurpleDeep
import com.jubayer.cheatlock.ui.theme.CheatLockPurpleSoft
import com.jubayer.cheatlock.ui.theme.CheatLockPurpleVibrant
import com.jubayer.cheatlock.util.BackendConnectionProbe
import com.jubayer.cheatlock.model.UserAccount
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val SplashIntroDurationMs = 5800
private val SplashBrandBlue = Color(0xFF087CFF)
private val SplashBrandCyan = Color(0xFF16B8FF)
private val SplashTextPrimary = Color(0xFFF5F8FF)
private val SplashTextSecondary = Color(0xFF94A3B8)
private val SplashBgPrimary = Color(0xFF050A14)
private val SplashBgSecondary = Color(0xFF07101F)

@Composable
fun SplashScreen(
    initialUrl: String,
    onProbingComplete: (resolvedUrl: String, authenticatedUser: UserAccount?) -> Unit,
    onValidateSession: suspend (String) -> UserAccount?
) {
    val context = LocalContext.current
    var currentStepText by remember { mutableStateOf("Initializing secure sandbox...") }
    var progressVal by remember { mutableFloatStateOf(0f) }
    val reducedMotion = remember {
        runCatching {
            Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
            ) == 0f
        }.getOrDefault(false)
    }

    // Sequential fade in animations
    val contentAlpha = remember { Animatable(0f) }
    val introProgress = remember { Animatable(if (reducedMotion) 1f else 0f) }

    LaunchedEffect(Unit) {
        launch {
            contentAlpha.animateTo(1f, tween(1200, easing = FastOutSlowInEasing))
        }

        launch {
            if (!reducedMotion) {
                introProgress.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(SplashIntroDurationMs, easing = LinearEasing)
                )
            }
        }

        // Animated progress incrementer
        launch {
            while (progressVal < 1f) {
                delay(30)
                if (progressVal < 0.25f) {
                    progressVal += 0.012f
                } else if (progressVal < 0.60f) {
                    progressVal += 0.007f
                } else if (progressVal < 0.90f) {
                    progressVal += 0.004f
                } else {
                    progressVal += 0.0015f
                }
            }
        }

        // Sub-tasks display
        launch {
            delay(1000)
            currentStepText = "Checking biometric module..."
            delay(1000)
            currentStepText = "Initializing proctoring engine..."
            delay(1000)
            currentStepText = "Connecting to secure node..."
            delay(800)
            currentStepText = "Handshake complete. Entering..."
        }

        // Probing backend server
        launch {
            var workingUrl: String? = null
            try {
                if (BackendConnectionProbe.ping(initialUrl)) {
                    workingUrl = initialUrl
                } else {
                    val working = BackendConnectionProbe.findWorkingUrl(context)
                    if (working != null) {
                        workingUrl = working
                    }
                }
            } catch (e: Exception) {
                // Fallback
            }

            val finalUrl = workingUrl ?: initialUrl
            
            currentStepText = "Verifying security credentials..."
            val user = onValidateSession(finalUrl)

            delay(1000)
            progressVal = 1.0f
            delay(300)

            onProbingComplete(finalUrl, user)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        SplashBgPrimary,
                        SplashBgSecondary,
                        SplashBgPrimary
                    )
                )
            )
    ) {
        SplashAmbientNebula()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            AnimatedCheatLockLogo(
                progress = introProgress.value,
                reducedMotion = reducedMotion,
                loadingStatus = currentStepText,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(430.dp)
            )
        }
    }
}

@Composable
private fun AnimatedCheatLockLogo(
    progress: Float,
    reducedMotion: Boolean,
    loadingStatus: String,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        val brandPhase = phase(progress, 4000, 4600)
        val taglinePhase = phase(progress, 4200, 4600)
        val statusPhase = phase(progress, 5200, 5800)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(430.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            SvgCheatLockLogoAnimation(
                progress = if (reducedMotion) 1f else progress,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(198.dp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .alpha(if (reducedMotion) 1f else brandPhase)
                    .offset(y = ((1f - brandPhase) * 6).dp)
            ) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "Cheat",
                        color = SplashTextPrimary,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        "Lock",
                        color = SplashBrandBlue,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                "SECURE • MONITOR • TRUST",
                color = SplashTextSecondary,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    letterSpacing = 1.8.sp
                ),
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .alpha(if (reducedMotion) 1f else taglinePhase)
                    .offset(y = ((1f - taglinePhase) * 6).dp)
            )

            Spacer(modifier = Modifier.height(28.dp))

            TrustIndicators(progress = if (reducedMotion) 1f else progress)

            Spacer(modifier = Modifier.height(20.dp))

            LoadingStatusBlock(
                loadingStatus = loadingStatus,
                progress = if (reducedMotion) 1f else progress,
                visiblePhase = if (reducedMotion) 1f else statusPhase
            )
        }
    }
}

@Composable
private fun SvgCheatLockLogoAnimation(progress: Float, modifier: Modifier = Modifier) {
    val cPath = remember { PathParser().parsePathString(CheatLockSvgBlueIconPath).toPath() }
    val iconPath = remember { PathParser().parsePathString(CheatLockSvgWhiteIconPath).toPath() }

    val introFade = phase(progress, 0, 600)
    val cReveal = phase(progress, 600, 1200)
    val coreReveal = phase(progress, 1200, 1600)
    val lSettle = phase(progress, 1500, 1800)
    val ringReveal = phase(progress, 1800, 2600)
    val particleBurst = phase(progress, 2600, 3200)
    val stabilize = phase(progress, 3200, 4000)

    Canvas(modifier = modifier) {
        val iconBoundsLeft = 394f
        val iconBoundsTop = 239f
        val iconBoundsSize = 482f
        val iconSide = kotlin.math.min(size.width * 0.28f, 96.dp.toPx())
        val introScale = lerp(0.90f, 1f, introFade)
        val scaledIconSide = iconSide * introScale
        val iconLeft = size.width / 2f - scaledIconSide / 2f
        val iconTop = size.height * 0.44f - scaledIconSide / 2f
        val iconScale = iconSide / iconBoundsSize
        val settleOffset = (1f - lSettle) * 2.dp.toPx()
        val ringRadius = scaledIconSide * 0.78f
        val ringCenter = Offset(size.width / 2f, iconTop + scaledIconSide / 2f)

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    SplashBrandBlue.copy(alpha = 0.10f * (introFade + ringReveal).coerceAtMost(1f)),
                    Color.Transparent
                ),
                center = ringCenter,
                radius = scaledIconSide * 1.55f
            )
        )

        if (ringReveal > 0f) {
            drawArc(
                color = SplashBrandBlue.copy(alpha = 0.72f),
                startAngle = 42f,
                sweepAngle = 360f * ringReveal,
                useCenter = false,
                topLeft = Offset(ringCenter.x - ringRadius, ringCenter.y - ringRadius),
                size = androidx.compose.ui.geometry.Size(ringRadius * 2f, ringRadius * 2f),
                style = Stroke(width = 1.3.dp.toPx(), cap = StrokeCap.Round)
            )
            val angle = Math.toRadians((42f + 360f * ringReveal).toDouble())
            drawCircle(
                color = SplashBrandCyan,
                radius = 2.dp.toPx(),
                center = Offset(
                    ringCenter.x + kotlin.math.cos(angle).toFloat() * ringRadius,
                    ringCenter.y + kotlin.math.sin(angle).toFloat() * ringRadius
                )
            )
            drawCircle(
                color = SplashBrandBlue.copy(alpha = 0.16f),
                radius = ringRadius * 1.18f,
                center = ringCenter,
                style = Stroke(width = 0.8.dp.toPx())
            )
        }

        withTransform({
            translate(iconLeft, iconTop)
            scale(iconScale * introScale, iconScale * introScale)
            translate(-iconBoundsLeft, -iconBoundsTop)
        }) {
            if (introFade > 0f && cReveal == 0f) {
                drawPath(cPath, SplashBrandBlue.copy(alpha = 0.20f * introFade))
                drawPath(iconPath, SplashTextPrimary.copy(alpha = 0.16f * introFade))
            }

            if (cReveal > 0f) {
                clipRect(
                    left = iconBoundsLeft,
                    top = iconBoundsTop,
                    right = iconBoundsLeft + iconBoundsSize * cReveal,
                    bottom = iconBoundsTop + iconBoundsSize
                ) {
                    drawPath(cPath, SplashBrandBlue)
                }
            }

            if (coreReveal > 0f) {
                clipRect(
                    left = 520f,
                    top = 595f - 215f * coreReveal,
                    right = 665f,
                    bottom = 596f
                ) {
                    drawPath(iconPath, SplashTextPrimary)
                }
            }

            if (lSettle > 0f) {
                clipRect(
                    left = 632f - settleOffset,
                    top = 380f,
                    right = 716f,
                    bottom = 722f
                ) {
                    drawPath(iconPath, SplashTextPrimary)
                }
                clipRect(
                    left = 636f,
                    top = 640f,
                    right = 878f,
                    bottom = 724f
                ) {
                    drawPath(iconPath, SplashTextPrimary)
                }
            }

            if (lSettle >= 1f) {
                drawPath(cPath, SplashBrandBlue)
                drawPath(iconPath, SplashTextPrimary)
            }

            val sweep = phase(progress, 3300, 3700)
            if (sweep in 0.01f..0.99f) {
                val sweepX = iconBoundsLeft + iconBoundsSize * sweep
                clipRect(left = sweepX - 8f, top = iconBoundsTop, right = sweepX + 18f, bottom = iconBoundsTop + iconBoundsSize) {
                    drawPath(cPath, SplashBrandCyan.copy(alpha = 0.22f))
                    drawPath(iconPath, Color.White.copy(alpha = 0.20f))
                }
            }
        }

        if (cReveal in 0.02f..0.98f) {
            val angle = Math.toRadians((-48f + 298f * cReveal).toDouble())
            val radius = scaledIconSide * 0.39f
            val cx = iconLeft + scaledIconSide * 0.48f + kotlin.math.cos(angle).toFloat() * radius
            val cy = iconTop + scaledIconSide * 0.50f + kotlin.math.sin(angle).toFloat() * radius
            drawCircle(SplashBrandCyan, radius = 2.4.dp.toPx(), center = Offset(cx, cy))
        }

        if (particleBurst > 0f && particleBurst < 1f) {
            splashParticles.forEachIndexed { index, particle ->
                val travel = 14.dp.toPx() + (index % 5) * 3.dp.toPx()
                val fade = 1f - particleBurst
                val angle = Math.toRadians(particle.angle.toDouble())
                val start = ringRadius * particle.radius
                drawCircle(
                    color = particle.color.copy(alpha = particle.alpha * fade),
                    radius = particle.size.dp.toPx(),
                    center = Offset(
                        ringCenter.x + kotlin.math.cos(angle).toFloat() * (start + travel * particleBurst),
                        ringCenter.y + kotlin.math.sin(angle).toFloat() * (start + travel * particleBurst)
                    )
                )
            }
        }

        if (stabilize > 0f && stabilize < 1f) {
            val pulse = phase(progress, 3200, 3600)
            drawCircle(
                color = SplashBrandBlue.copy(alpha = 0.18f * (1f - pulse)),
                radius = ringRadius * (1f + 0.38f * pulse),
                center = ringCenter,
                style = Stroke(width = 1.dp.toPx())
            )
        }
    }
}

@Composable
private fun TrustIndicators(progress: Float) {
    Row(
        modifier = Modifier.widthIn(max = 250.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        TrustIndicator(
            label = "Secure",
            icon = { Icon(Icons.Default.Security, contentDescription = null, tint = SplashBrandBlue, modifier = Modifier.size(24.dp)) },
            phase = phase(progress, 4600, 4920)
        )
        TrustIndicator(
            label = "Monitor",
            icon = { Icon(Icons.Default.Visibility, contentDescription = null, tint = SplashBrandBlue, modifier = Modifier.size(24.dp)) },
            phase = phase(progress, 4740, 5060)
        )
        TrustIndicator(
            label = "Trust",
            icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SplashBrandBlue, modifier = Modifier.size(24.dp)) },
            phase = phase(progress, 4880, 5200)
        )
    }
}

@Composable
private fun TrustIndicator(
    label: String,
    icon: @Composable () -> Unit,
    phase: Float
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier
            .width(72.dp)
            .alpha(phase)
            .offset(y = ((1f - phase) * 5).dp)
            .scale(lerp(0.94f, 1f, phase))
    ) {
        icon()
        Text(
            text = label,
            color = SplashTextSecondary,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun LoadingStatusBlock(
    loadingStatus: String,
    progress: Float,
    visiblePhase: Float
) {
    val shimmer = rememberInfiniteTransition(label = "indeterminateProgress")
    val segmentOffset by shimmer.animateFloat(
        initialValue = -0.35f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
        label = "progressSegmentOffset"
    )

    Column(
        modifier = Modifier
            .width(250.dp)
            .alpha(visiblePhase)
            .offset(y = ((1f - visiblePhase) * 6).dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        AnimatedContent(
            targetState = loadingStatus,
            transitionSpec = {
                (fadeIn(animationSpec = tween(300)) + scaleIn(initialScale = 0.98f)) togetherWith
                    (fadeOut(animationSpec = tween(220)) + scaleOut(targetScale = 0.98f))
            },
            label = "splashLoadingStatus"
        ) { stepText ->
            Text(
                text = stepText,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = SplashTextSecondary,
                    fontWeight = FontWeight.Medium
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(SplashTextSecondary.copy(alpha = 0.15f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(0.34f)
                    .offset(x = (250.dp * segmentOffset))
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        Brush.horizontalGradient(
                            listOf(SplashBrandBlue, SplashBrandCyan)
                        )
                    )
            )
        }
    }
}

private data class SplashParticle(
    val angle: Float,
    val radius: Float,
    val size: Float,
    val alpha: Float,
    val color: Color
)

private val splashParticles = listOf(
    SplashParticle(8f, 0.82f, 1.2f, 0.55f, SplashBrandBlue),
    SplashParticle(28f, 0.92f, 1.0f, 0.42f, SplashBrandCyan),
    SplashParticle(48f, 0.86f, 0.9f, 0.38f, SplashTextPrimary),
    SplashParticle(72f, 0.96f, 1.1f, 0.48f, SplashBrandBlue),
    SplashParticle(104f, 0.88f, 0.8f, 0.34f, SplashBrandCyan),
    SplashParticle(132f, 0.94f, 1.0f, 0.44f, SplashBrandBlue),
    SplashParticle(166f, 0.82f, 0.8f, 0.34f, SplashTextPrimary),
    SplashParticle(198f, 0.90f, 1.1f, 0.46f, SplashBrandCyan),
    SplashParticle(226f, 0.86f, 0.9f, 0.38f, SplashBrandBlue),
    SplashParticle(252f, 0.96f, 1.0f, 0.42f, SplashBrandCyan),
    SplashParticle(286f, 0.84f, 0.8f, 0.34f, SplashTextPrimary),
    SplashParticle(318f, 0.92f, 1.2f, 0.48f, SplashBrandBlue),
    SplashParticle(342f, 0.88f, 0.9f, 0.38f, SplashBrandCyan),
    SplashParticle(358f, 0.95f, 1.0f, 0.40f, SplashBrandBlue)
)

@Composable
private fun AssemblingLogo(progress: Float, modifier: Modifier = Modifier) {
    val cReveal = phase(progress, 0, 800)
    val cSettle = phase(progress, 800, 1400)
    val lockReveal = phase(progress, 1400, 2000)
    val lReveal = phase(progress, 2000, 2800)
    val complete = phase(progress, 2800, 3600)
    val scan = phase(progress, 4400, 5200)
    val idle = progress >= 1f
    val idleTransition = rememberInfiniteTransition(label = "splashIdle")
    val idleRotation by idleTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(3600, easing = LinearEasing)),
        label = "idleRotation"
    )
    val idleGlow by idleTransition.animateFloat(
        initialValue = 0.10f,
        targetValue = 0.18f,
        animationSpec = infiniteRepeatable(
            animation = tween(2800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "idleGlow"
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = 1.4.dp.toPx()
            val radiusInset = 7.dp.toPx()
            val ringAlpha = (complete * 0.28f + scan * 0.28f + if (idle) idleGlow else 0f).coerceIn(0f, 0.34f)
            drawCircle(
                color = SplashBrandBlue.copy(alpha = ringAlpha),
                style = Stroke(width = stroke),
                radius = size.minDimension / 2f - radiusInset
            )
            withTransform({ rotate(if (idle) idleRotation else scan * 360f) }) {
                drawArc(
                    color = SplashBrandCyan.copy(alpha = (0.15f + scan * 0.55f).coerceAtMost(0.7f)),
                    startAngle = -20f,
                    sweepAngle = 82f,
                    useCenter = false,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                )
            }

            if (cReveal in 0.05f..0.98f) {
                drawArc(
                    color = SplashBrandBlue,
                    startAngle = 210f,
                    sweepAngle = 280f * cReveal,
                    useCenter = false,
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
                    topLeft = Offset(12.dp.toPx(), 12.dp.toPx()),
                    size = androidx.compose.ui.geometry.Size(
                        size.width - 24.dp.toPx(),
                        size.height - 24.dp.toPx()
                    )
                )
            }

            val particleAlpha = (phase(progress, 2200, 3000) * (1f - phase(progress, 3200, 4000))).coerceIn(0f, 1f)
            if (particleAlpha > 0f) {
                val points = listOf(
                    Offset(size.width * 0.72f, size.height * 0.38f),
                    Offset(size.width * 0.82f, size.height * 0.50f),
                    Offset(size.width * 0.70f, size.height * 0.70f),
                    Offset(size.width * 0.58f, size.height * 0.78f),
                    Offset(size.width * 0.84f, size.height * 0.72f)
                )
                points.forEachIndexed { index, point ->
                    drawCircle(
                        color = SplashBrandCyan.copy(alpha = 0.34f * particleAlpha),
                        radius = (1.1f + index * 0.12f).dp.toPx(),
                        center = point
                    )
                }
            }
        }

        LayeredLogoImage(
            cReveal = cReveal,
            cSettle = cSettle,
            lockReveal = lockReveal,
            lReveal = lReveal,
            complete = complete,
            scan = scan,
            modifier = Modifier.fillMaxSize(0.72f)
        )
    }
}

@Composable
private fun LayeredLogoImage(
    cReveal: Float,
    cSettle: Float,
    lockReveal: Float,
    lReveal: Float,
    complete: Float,
    scan: Float,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(modifier = modifier, contentAlignment = Alignment.Center) {
        val imageSize = maxWidth
        Box(
            modifier = Modifier
                .size(imageSize)
                .clip(RoundedCornerShape(1.dp))
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .fillMaxHeight()
                    .width(imageSize * (0.62f * cReveal.coerceIn(0f, 1f)))
                    .clip(RoundedCornerShape(1.dp))
            ) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(imageSize)
                        .align(Alignment.CenterStart)
                        .alpha((0.2f + cSettle * 0.8f).coerceIn(0.2f, 1f))
                )
            }

            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(imageSize * 0.46f)
                    .scale(lerp(0.88f, 1f, lockReveal))
                    .alpha(lockReveal)
                    .clip(RoundedCornerShape(2.dp))
            ) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(imageSize)
                        .align(Alignment.Center)
                )
            }

            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .width(imageSize * (0.58f * lReveal.coerceIn(0f, 1f)))
                    .clip(RoundedCornerShape(1.dp))
            ) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(imageSize)
                        .align(Alignment.CenterEnd)
                )
            }

            Image(
                painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .alpha(complete)
            )

            if (scan > 0f && scan < 1f) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(18.dp)
                        .offset(x = imageSize * (scan - 0.45f))
                        .background(
                            Brush.horizontalGradient(
                                listOf(
                                    Color.Transparent,
                                    SplashBrandCyan.copy(alpha = 0.38f),
                                    Color.Transparent
                                )
                            )
                        )
                )
            }
        }
    }
}

private fun phase(progress: Float, startMs: Int, endMs: Int): Float {
    if (endMs <= startMs) return 1f
    val currentMs = progress.coerceIn(0f, 1f) * SplashIntroDurationMs
    val raw = ((currentMs - startMs) / (endMs - startMs)).coerceIn(0f, 1f)
    return raw * raw * (3f - 2f * raw)
}

private fun lerp(start: Float, end: Float, fraction: Float): Float {
    return start + (end - start) * fraction.coerceIn(0f, 1f)
}

private const val CheatLockSvgBlueIconPath = """M 649 239 L 608 239 L 607 240 L 599 240 L 598 241 L 593 241 L 592 242 L 587 242 L 586 243 L 582 243 L 581 244 L 577 244 L 576 245 L 573 245 L 572 246 L 569 246 L 568 247 L 561 248 L 558 250 L 555 250 L 552 252 L 550 252 L 549 253 L 544 254 L 541 256 L 539 256 L 515 268 L 513 270 L 510 271 L 502 277 L 499 278 L 496 281 L 495 281 L 492 284 L 491 284 L 488 287 L 487 287 L 483 291 L 482 291 L 477 296 L 476 296 L 457 315 L 457 316 L 450 323 L 450 324 L 447 327 L 447 328 L 443 332 L 441 336 L 438 339 L 438 340 L 434 345 L 433 348 L 431 350 L 430 353 L 428 355 L 426 360 L 424 362 L 417 376 L 417 378 L 414 383 L 414 385 L 412 388 L 412 390 L 410 393 L 409 398 L 406 404 L 406 407 L 405 408 L 405 410 L 403 414 L 403 417 L 402 418 L 402 421 L 401 422 L 401 425 L 400 426 L 400 430 L 399 431 L 399 435 L 398 436 L 398 441 L 397 442 L 397 447 L 396 448 L 396 456 L 395 457 L 395 469 L 394 470 L 394 491 L 395 492 L 395 505 L 396 506 L 396 514 L 397 515 L 397 520 L 398 521 L 398 525 L 399 526 L 399 530 L 400 531 L 400 535 L 401 536 L 402 543 L 404 547 L 404 550 L 405 551 L 405 553 L 406 554 L 406 556 L 407 557 L 407 559 L 408 560 L 408 562 L 409 563 L 410 568 L 415 578 L 415 580 L 417 583 L 417 585 L 423 597 L 425 599 L 428 606 L 430 608 L 434 616 L 439 622 L 439 623 L 444 629 L 444 630 L 448 634 L 448 635 L 451 638 L 451 639 L 459 647 L 459 648 L 474 663 L 475 663 L 483 671 L 484 671 L 487 674 L 488 674 L 499 683 L 500 683 L 505 687 L 508 688 L 510 690 L 513 691 L 515 693 L 520 695 L 522 697 L 528 700 L 530 700 L 541 706 L 546 707 L 549 709 L 551 709 L 552 710 L 554 710 L 555 711 L 557 711 L 558 712 L 560 712 L 561 713 L 563 713 L 567 715 L 570 715 L 571 716 L 574 716 L 575 717 L 578 717 L 579 718 L 583 718 L 584 719 L 588 719 L 589 720 L 594 720 L 595 721 L 600 721 L 601 722 L 608 722 L 608 646 L 602 646 L 601 645 L 596 645 L 595 644 L 588 643 L 584 641 L 581 641 L 578 639 L 576 639 L 570 636 L 568 636 L 556 630 L 554 628 L 551 627 L 549 625 L 543 622 L 540 619 L 539 619 L 532 613 L 531 613 L 524 606 L 523 606 L 509 591 L 509 590 L 500 579 L 500 578 L 496 573 L 495 570 L 493 568 L 492 565 L 490 563 L 486 555 L 486 553 L 482 546 L 482 544 L 481 543 L 481 541 L 480 540 L 480 538 L 479 537 L 479 535 L 478 534 L 478 532 L 477 531 L 477 529 L 475 525 L 475 522 L 474 521 L 474 517 L 473 516 L 473 512 L 472 511 L 472 505 L 471 504 L 471 496 L 470 495 L 470 469 L 471 468 L 471 459 L 472 458 L 472 453 L 473 452 L 473 448 L 474 447 L 474 444 L 475 443 L 475 439 L 477 435 L 477 432 L 478 431 L 479 426 L 481 423 L 481 421 L 484 415 L 484 413 L 491 399 L 493 397 L 494 394 L 498 389 L 499 386 L 502 383 L 502 382 L 505 379 L 505 378 L 508 375 L 508 374 L 524 357 L 525 357 L 531 351 L 532 351 L 539 345 L 540 345 L 545 341 L 548 340 L 550 338 L 553 337 L 555 335 L 563 331 L 565 331 L 570 328 L 572 328 L 575 326 L 577 326 L 578 325 L 580 325 L 584 323 L 587 323 L 588 322 L 595 321 L 596 320 L 601 320 L 602 319 L 607 319 L 608 318 L 616 318 L 617 317 L 640 317 L 641 318 L 650 318 L 651 319 L 656 319 L 657 320 L 661 320 L 662 321 L 669 322 L 670 323 L 672 323 L 673 324 L 675 324 L 676 325 L 678 325 L 679 326 L 684 327 L 706 338 L 708 340 L 709 340 L 711 342 L 715 344 L 718 347 L 719 347 L 725 341 L 725 340 L 728 337 L 729 337 L 730 335 L 773 292 L 773 291 L 770 288 L 769 288 L 765 284 L 764 284 L 761 281 L 760 281 L 757 278 L 756 278 L 748 272 L 738 267 L 736 265 L 722 258 L 720 258 L 715 255 L 713 255 L 710 253 L 708 253 L 707 252 L 705 252 L 704 251 L 702 251 L 701 250 L 699 250 L 698 249 L 696 249 L 692 247 L 689 247 L 688 246 L 685 246 L 684 245 L 681 245 L 680 244 L 676 244 L 675 243 L 671 243 L 670 242 L 665 242 L 664 241 L 659 241 L 658 240 L 650 240 Z"""

private const val CheatLockSvgWhiteIconPath = """M 552 413 L 552 414 L 548 418 L 545 424 L 541 429 L 536 439 L 536 441 L 534 444 L 534 446 L 533 447 L 533 449 L 531 453 L 531 456 L 530 457 L 530 460 L 529 461 L 529 465 L 528 466 L 528 472 L 527 473 L 527 497 L 528 498 L 528 505 L 529 506 L 529 510 L 530 511 L 530 515 L 531 516 L 531 519 L 532 520 L 533 525 L 535 528 L 535 530 L 537 533 L 537 535 L 541 543 L 543 545 L 544 548 L 546 550 L 548 554 L 551 557 L 551 558 L 559 566 L 559 567 L 560 567 L 567 574 L 568 574 L 571 577 L 572 577 L 577 581 L 582 583 L 584 585 L 586 585 L 591 588 L 593 588 L 596 590 L 598 590 L 602 592 L 605 592 L 606 593 L 610 593 L 611 594 L 618 594 L 619 595 L 636 595 L 637 596 L 637 714 L 638 715 L 638 717 L 642 721 L 645 721 L 646 722 L 864 722 L 865 721 L 868 721 L 872 718 L 873 718 L 873 717 L 876 713 L 876 657 L 875 656 L 875 654 L 874 652 L 870 648 L 866 646 L 864 646 L 863 645 L 710 645 L 709 644 L 709 388 L 706 383 L 704 382 L 691 382 L 690 381 L 674 381 L 673 380 L 657 380 L 656 379 L 640 379 L 639 378 L 621 378 L 620 379 L 612 379 L 611 380 L 607 380 L 606 381 L 603 381 L 602 382 L 599 382 L 598 383 L 593 384 L 590 386 L 588 386 L 578 391 L 576 393 L 573 394 L 566 400 L 565 400 Z M 606 441 L 609 441 L 610 440 L 620 440 L 621 441 L 624 441 L 630 444 L 632 446 L 633 446 L 640 453 L 645 463 L 645 467 L 646 468 L 646 475 L 645 476 L 645 480 L 644 481 L 644 483 L 641 489 L 638 492 L 638 493 L 635 496 L 634 496 L 631 499 L 630 499 L 630 502 L 631 503 L 631 506 L 632 507 L 632 510 L 633 511 L 633 515 L 634 516 L 634 519 L 635 520 L 635 523 L 636 524 L 636 527 L 637 528 L 637 531 L 638 532 L 638 535 L 639 536 L 639 538 L 638 540 L 635 543 L 593 543 L 589 539 L 589 533 L 590 532 L 590 529 L 591 528 L 591 525 L 592 524 L 592 521 L 593 520 L 593 517 L 594 516 L 594 513 L 595 512 L 595 509 L 596 508 L 596 505 L 597 504 L 597 501 L 598 500 L 596 498 L 595 498 L 589 492 L 589 491 L 587 489 L 585 485 L 585 483 L 583 479 L 583 466 L 584 465 L 585 460 L 587 456 L 589 454 L 589 453 L 597 445 L 603 442 L 605 442 Z"""

private const val CheatLockSvgWhiteWordPath = """M 546 836 L 539 844 L 538 847 L 535 851 L 535 853 L 534 854 L 534 856 L 532 860 L 532 866 L 531 867 L 531 878 L 532 879 L 532 884 L 533 885 L 533 888 L 540 902 L 549 911 L 552 912 L 554 914 L 556 914 L 559 916 L 561 916 L 562 917 L 565 917 L 566 918 L 581 918 L 582 917 L 585 917 L 586 916 L 588 916 L 594 913 L 601 907 L 602 908 L 602 916 L 603 917 L 624 917 L 624 828 L 602 828 L 602 837 L 601 838 L 596 833 L 595 833 L 593 831 L 589 829 L 587 829 L 583 827 L 577 827 L 576 826 L 571 826 L 570 827 L 564 827 L 563 828 L 558 829 L 550 833 L 547 836 Z M 572 847 L 583 847 L 584 848 L 586 848 L 592 851 L 598 857 L 601 863 L 601 865 L 602 866 L 602 879 L 601 880 L 601 882 L 599 886 L 594 892 L 593 892 L 591 894 L 585 897 L 582 897 L 581 898 L 574 898 L 573 897 L 570 897 L 569 896 L 567 896 L 565 895 L 562 892 L 561 892 L 556 886 L 555 884 L 555 882 L 554 881 L 554 878 L 553 877 L 553 867 L 554 866 L 554 864 L 555 863 L 555 861 L 556 859 L 562 852 Z M 457 828 L 456 829 L 454 829 L 448 832 L 446 834 L 442 836 L 435 843 L 435 844 L 433 846 L 428 856 L 428 859 L 427 860 L 427 863 L 426 864 L 426 880 L 427 881 L 427 885 L 428 886 L 429 891 L 432 897 L 434 899 L 434 900 L 443 909 L 444 909 L 446 911 L 447 911 L 449 913 L 453 915 L 455 915 L 459 917 L 462 917 L 463 918 L 469 918 L 470 919 L 478 919 L 479 918 L 485 918 L 486 917 L 489 917 L 490 916 L 492 916 L 502 911 L 505 908 L 506 908 L 513 900 L 508 896 L 505 895 L 503 893 L 500 892 L 496 889 L 495 889 L 489 895 L 483 898 L 480 898 L 479 899 L 468 899 L 467 898 L 462 897 L 458 894 L 457 894 L 452 889 L 452 888 L 450 886 L 449 884 L 449 881 L 450 880 L 517 880 L 517 863 L 516 862 L 516 858 L 515 857 L 515 855 L 513 852 L 513 850 L 511 846 L 508 843 L 508 842 L 500 834 L 499 834 L 497 832 L 491 829 L 489 829 L 488 828 L 485 828 L 484 827 L 479 827 L 478 826 L 467 826 L 466 827 L 461 827 L 460 828 Z M 449 860 L 451 856 L 458 849 L 464 846 L 466 846 L 467 845 L 478 845 L 479 846 L 481 846 L 487 849 L 493 855 L 495 859 L 495 861 L 496 863 L 495 864 L 450 864 L 449 863 Z M 652 804 L 653 805 L 652 806 L 653 807 L 652 808 L 653 809 L 653 812 L 652 813 L 652 819 L 653 820 L 653 827 L 652 828 L 637 828 L 637 848 L 652 848 L 653 849 L 653 897 L 654 898 L 654 901 L 657 907 L 660 911 L 661 911 L 666 915 L 668 915 L 672 917 L 690 917 L 691 916 L 698 915 L 700 914 L 700 912 L 699 911 L 699 906 L 698 905 L 698 900 L 697 899 L 697 895 L 695 896 L 692 896 L 691 897 L 681 897 L 679 896 L 675 892 L 675 890 L 674 889 L 674 849 L 675 848 L 697 848 L 697 828 L 675 828 L 674 827 L 674 804 Z M 326 788 L 326 916 L 327 917 L 348 917 L 348 865 L 349 864 L 349 861 L 352 855 L 359 849 L 361 848 L 363 848 L 364 847 L 375 847 L 381 850 L 385 854 L 387 858 L 387 860 L 388 861 L 388 875 L 389 876 L 389 885 L 388 886 L 389 887 L 389 915 L 388 916 L 389 917 L 410 917 L 410 856 L 409 855 L 409 851 L 408 850 L 408 848 L 404 840 L 399 834 L 398 834 L 393 830 L 391 829 L 389 829 L 388 828 L 386 828 L 385 827 L 379 827 L 378 826 L 373 826 L 372 827 L 367 827 L 366 828 L 363 828 L 362 829 L 360 829 L 358 831 L 355 832 L 349 838 L 348 837 L 348 788 Z M 251 785 L 250 786 L 244 786 L 243 787 L 239 787 L 238 788 L 236 788 L 235 789 L 230 790 L 222 794 L 220 796 L 217 797 L 207 806 L 207 807 L 203 811 L 203 812 L 199 817 L 195 825 L 195 827 L 194 828 L 194 830 L 192 834 L 192 838 L 191 839 L 191 845 L 190 846 L 190 858 L 191 859 L 191 866 L 192 867 L 193 874 L 194 875 L 194 877 L 196 880 L 196 882 L 198 886 L 200 888 L 201 891 L 205 895 L 205 896 L 214 905 L 215 905 L 221 910 L 231 915 L 233 915 L 237 917 L 241 917 L 242 918 L 247 918 L 248 919 L 264 919 L 265 918 L 271 918 L 272 917 L 275 917 L 276 916 L 278 916 L 279 915 L 281 915 L 284 913 L 286 913 L 288 912 L 290 910 L 293 909 L 296 906 L 297 906 L 307 896 L 309 892 L 307 891 L 303 887 L 302 887 L 296 882 L 295 882 L 291 878 L 290 880 L 287 883 L 287 884 L 279 891 L 271 895 L 269 895 L 268 896 L 265 896 L 264 897 L 250 897 L 249 896 L 245 896 L 239 893 L 237 893 L 235 891 L 232 890 L 222 880 L 222 879 L 220 877 L 216 869 L 216 866 L 215 865 L 215 862 L 214 861 L 214 843 L 215 842 L 215 839 L 216 838 L 217 833 L 219 829 L 221 827 L 221 826 L 228 818 L 229 818 L 232 815 L 233 815 L 235 813 L 239 811 L 241 811 L 245 809 L 248 809 L 249 808 L 264 808 L 265 809 L 268 809 L 269 810 L 271 810 L 279 814 L 281 816 L 282 816 L 289 823 L 289 824 L 291 826 L 293 824 L 294 824 L 299 819 L 300 819 L 305 814 L 306 814 L 308 812 L 307 809 L 304 806 L 304 805 L 299 800 L 298 800 L 295 797 L 294 797 L 292 795 L 291 795 L 289 793 L 285 791 L 283 791 L 280 789 L 278 789 L 274 787 L 270 787 L 269 786 L 263 786 L 262 785 Z"""

private const val CheatLockSvgBlueWordPath = """M 956 826 L 955 827 L 951 827 L 950 828 L 948 828 L 947 829 L 945 829 L 944 830 L 942 830 L 938 832 L 932 837 L 931 837 L 927 841 L 927 842 L 924 845 L 918 857 L 918 860 L 917 861 L 917 867 L 916 868 L 916 877 L 917 878 L 917 883 L 918 884 L 918 886 L 919 887 L 920 892 L 923 898 L 925 900 L 925 901 L 934 910 L 935 910 L 937 912 L 945 916 L 947 916 L 948 917 L 951 917 L 952 918 L 970 918 L 971 917 L 975 917 L 976 916 L 978 916 L 988 911 L 997 903 L 997 902 L 999 900 L 999 898 L 995 896 L 992 893 L 988 891 L 982 886 L 974 894 L 970 896 L 968 896 L 967 897 L 956 897 L 955 896 L 953 896 L 951 895 L 944 889 L 944 888 L 940 883 L 940 881 L 939 880 L 939 865 L 941 862 L 941 860 L 944 857 L 944 856 L 948 852 L 949 852 L 953 849 L 955 849 L 956 848 L 960 848 L 961 847 L 963 847 L 964 848 L 968 848 L 976 852 L 981 857 L 981 858 L 982 858 L 986 854 L 987 854 L 989 852 L 990 852 L 992 850 L 993 850 L 995 848 L 999 846 L 999 845 L 997 843 L 997 842 L 991 836 L 990 836 L 987 833 L 979 829 L 977 829 L 973 827 L 967 827 L 966 826 Z M 848 827 L 847 828 L 842 829 L 839 831 L 837 831 L 835 833 L 832 834 L 821 845 L 820 848 L 818 850 L 818 852 L 816 855 L 816 857 L 814 861 L 814 866 L 813 867 L 813 878 L 814 879 L 814 884 L 815 885 L 816 890 L 820 898 L 822 900 L 822 901 L 831 910 L 832 910 L 834 912 L 840 915 L 842 915 L 843 916 L 845 916 L 849 918 L 867 918 L 868 917 L 875 916 L 883 912 L 885 910 L 886 910 L 895 901 L 895 900 L 897 898 L 901 890 L 901 888 L 903 884 L 903 880 L 904 879 L 904 865 L 903 864 L 903 860 L 900 854 L 900 852 L 898 848 L 896 846 L 896 845 L 889 837 L 888 837 L 882 832 L 878 830 L 876 830 L 875 829 L 870 828 L 869 827 L 863 827 L 862 826 L 854 826 L 853 827 Z M 852 848 L 865 848 L 866 849 L 868 849 L 870 850 L 872 852 L 873 852 L 878 858 L 881 864 L 881 867 L 882 868 L 882 876 L 881 877 L 881 880 L 880 881 L 880 883 L 878 887 L 872 893 L 871 893 L 869 895 L 867 895 L 863 897 L 854 897 L 853 896 L 850 896 L 846 894 L 839 887 L 836 881 L 836 877 L 835 876 L 835 869 L 836 868 L 836 864 L 837 863 L 837 861 L 839 859 L 839 858 L 847 850 L 849 849 L 851 849 Z M 724 788 L 724 917 L 803 917 L 804 916 L 804 895 L 803 894 L 748 894 L 747 893 L 747 788 Z M 1015 787 L 1014 788 L 1014 917 L 1037 917 L 1037 889 L 1043 883 L 1045 883 L 1046 884 L 1046 885 L 1050 889 L 1050 890 L 1053 893 L 1053 894 L 1058 900 L 1058 901 L 1062 905 L 1062 906 L 1066 910 L 1068 914 L 1071 917 L 1098 917 L 1097 914 L 1093 910 L 1093 909 L 1090 906 L 1090 905 L 1081 895 L 1081 894 L 1078 891 L 1078 890 L 1074 886 L 1074 885 L 1071 882 L 1071 881 L 1066 876 L 1066 875 L 1060 868 L 1061 866 L 1079 848 L 1079 847 L 1097 829 L 1097 828 L 1068 828 L 1038 861 L 1037 860 L 1037 788 L 1036 787 L 1025 787 L 1024 788 L 1016 788 Z"""

@Composable
private fun SplashScannerRing() {
    val transition = rememberInfiniteTransition(label = "scanner")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(5000, easing = LinearEasing)
        ),
        label = "rotation"
    )
    val scalePulse by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scalePulse"
    )

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .scale(scalePulse)
    ) {
        val strokeWidth = 2.dp.toPx()

        drawCircle(
            color = CheatLockPurpleVibrant.copy(alpha = 0.12f),
            style = Stroke(
                width = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(16f, 16f), 0f)
            )
        )

        withTransform({
            rotate(degrees = rotation)
        }) {
            drawArc(
                color = CheatLockPurpleVibrant,
                startAngle = 0f,
                sweepAngle = 120f,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )

            drawArc(
                color = CheatLockPurpleSoft.copy(alpha = 0.5f),
                startAngle = 200f,
                sweepAngle = 60f,
                useCenter = false,
                style = Stroke(width = strokeWidth - 1f, cap = StrokeCap.Round)
            )
        }
    }
}

@Composable
private fun SplashAmbientNebula() {
}
