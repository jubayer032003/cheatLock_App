package com.jubayer.cheatlock.ui

import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Science
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.ui.theme.CheatLockTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlin.math.roundToInt

@Immutable
internal data class SelfExamPoster(
    val id: String,
    @param:DrawableRes val drawable: Int,
    @param:StringRes val label: Int,
    val aspectRatio: Float,
    val primaryColor: Color
)

// Curated from the approved artwork, not inferred from university names.
private val universityPosters = listOf(
    SelfExamPoster("jahangirnagar", R.drawable.self_exam_poster_jahangirnagar,
        R.string.se_poster_jahangirnagar, 1666f / 944f, Color(0xFF00633C)),
    SelfExamPoster("rajshahi", R.drawable.self_exam_poster_rajshahi,
        R.string.se_poster_rajshahi, 1666f / 944f, Color(0xFF073B96)),
    SelfExamPoster("buet", R.drawable.self_exam_poster_buet,
        R.string.se_poster_buet, 1666f / 944f, Color(0xFFA60827))
)

/** Promotional state only: the callback never receives or depends on a poster. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun SelfExamUniversityPosterCard(
    onOpenSelfExam: () -> Unit,
    posters: List<SelfExamPoster> = universityPosters,
    fallback: @Composable () -> Unit
) {
    if (posters.isEmpty()) { fallback(); return }
    val context = LocalContext.current
    val inspection = LocalInspectionMode.current
    val view = LocalView.current
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val targetPixels = with(density) { maxWidth.toPx() }.roundToInt().coerceIn(1, 1080)
        // Decode off the main thread once per viewport size, caching real posters, not loop pages.
        val images by produceState<Map<Int, ImageBitmap>?>(null, posters, targetPixels) {
            if (!inspection) value = withContext(Dispatchers.IO) {
                posters.mapNotNull { poster ->
                    try { poster.drawable to decodePoster(context.resources, poster.drawable, targetPixels).asImageBitmap() }
                    catch (_: Exception) { null }
                }.toMap()
            }
        }
        val available = remember(posters, images) {
            images?.let { cache -> posters.filter { cache.containsKey(it.drawable) } } ?: posters
        }
        if (available.isEmpty()) { fallback(); return@BoxWithConstraints }
        val motionAllowed = rememberPosterMotionAllowed()
        // Accessible paging uses the exact real page count, without sentinel pages.
        val loop = available.size > 1 && motionAllowed
        var selectedPoster by rememberSaveable { mutableIntStateOf(0) }
        var visible by remember { mutableStateOf(false) }
        val count = available.size
        val pager = key(loop, count) {
            rememberPagerState(initialPage = selectedPoster.coerceIn(0, count - 1) + if (loop) 1 else 0,
                pageCount = { if (loop) count + 2 else count })
        }
        val scope = rememberCoroutineScope()
        val lifecycle = LocalLifecycleOwner.current
        fun posterIndex(page: Int): Int = (page - if (loop) 1 else 0).mod(count)
        val activeIndex by remember(pager, count, loop) { derivedStateOf { posterIndex(pager.settledPage) } }
        val active = available[activeIndex]
        val ctaColor by animateColorAsState(active.primaryColor,
            animationSpec = tween(if (motionAllowed) 550 else 0, easing = FastOutSlowInEasing), label = "poster_cta_color")

        val surfaceAccent = if (SelfExamDesign.isLight) ctaColor else lerp(ctaColor, Color.White, 0.55f)

        // Identical sentinel artwork makes last-to-first wrapping visually continuous.
        LaunchedEffect(pager, count, loop) {
            snapshotFlow { pager.settledPage }.collect { page ->
                selectedPoster = posterIndex(page)
                if (loop && !pager.isScrollInProgress) {
                    if (page == 0) pager.scrollToPage(count)
                    else if (page == count + 1) pager.scrollToPage(1)
                }
            }
        }
        val autoPlay = motionAllowed && visible && count > 1
        LaunchedEffect(pager, lifecycle, autoPlay) {
            if (!autoPlay) return@LaunchedEffect
            lifecycle.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (currentCoroutineContext().isActive) {
                    snapshotFlow { pager.isScrollInProgress }.first { !it }
                    val settled = pager.settledPage
                    // Every drag/fling/indicator action restarts a complete quiet dwell.
                    val interrupted = withTimeoutOrNull(4500L) {
                        snapshotFlow { pager.isScrollInProgress || pager.settledPage != settled }.first { it }
                    }
                    if (interrupted == null && !pager.isScrollInProgress) {
                        try { pager.animateScrollToPage((settled + 1).coerceAtMost(pager.pageCount - 1),
                            animationSpec = tween(650, easing = FastOutSlowInEasing)) }
                        catch (_: CancellationException) { currentCoroutineContext().ensureActive() }
                    }
                }
            }
        }

        Surface(Modifier.fillMaxWidth(), shape = SelfExamDesign.cardShape, color = SelfExamDesign.surface,
            border = BorderStroke(1.dp, SelfExamDesign.border), shadowElevation = 1.dp) {
            Column {
                // One stable frame fits every original ratio; no page/height jump or cropped text.
                val frameRatio = available.minOf { it.aspectRatio }.coerceIn(1.6f, 18f / 7f)
                HorizontalPager(state = pager, userScrollEnabled = count > 1,
                    modifier = Modifier.fillMaxWidth().aspectRatio(frameRatio).background(SelfExamDesign.inset)
                        .onGloballyPositioned {
                            val bounds = it.boundsInWindow()
                            visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < view.height && bounds.right > 0 && bounds.left < view.width
                        }) { page ->
                    val index = posterIndex(page)
                    val poster = available[index]
                    val description = stringResource(R.string.se_poster_description, stringResource(poster.label), index + 1, count)
                    if (inspection) {
                        Image(painterResource(poster.drawable), description, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                    } else images?.get(poster.drawable)?.let {
                        Image(it, description, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                    }
                }
                if (count > 1) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically) {
                    available.forEachIndexed { index, poster ->
                        val selected = activeIndex == index
                        val width by animateDpAsState(if (selected) 22.dp else 6.dp,
                            animationSpec = tween(if (motionAllowed) 250 else 0), label = "poster_dot_width")
                        val label = stringResource(R.string.se_poster_show, stringResource(poster.label), index + 1, count)
                        IconButton(onClick = { scope.launch { pager.animateScrollToPage(index + if (loop) 1 else 0) } },
                            modifier = Modifier.size(48.dp).semantics { this.selected = selected; contentDescription = label }) {
                            Box(Modifier.width(width).height(6.dp).background(
                                if (selected) surfaceAccent else SelfExamDesign.secondaryText.copy(alpha = 0.4f), CircleShape))
                        }
                    }

                }
                Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp, top = if (count > 1) 0.dp else 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Surface(shape = SelfExamDesign.controlShape, color = SelfExamDesign.inset) {
                            Icon(Icons.Default.Science, null, tint = surfaceAccent,
                                modifier = Modifier.padding(10.dp).size(24.dp))
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            SelfExamLabTitle(examLabColor = surfaceAccent)
                            Text(stringResource(R.string.se_choose_a_topic_set_your_practice_and_begin),
                                color = SelfExamDesign.secondaryText, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Text(stringResource(R.string.se_track_subject_chapter_start), color = SelfExamDesign.secondaryText,
                        style = MaterialTheme.typography.labelLarge)
                    Text(stringResource(R.string.se_practice_from_your_question_bank_one_step_at_a_time),
                        color = SelfExamDesign.secondaryText, style = MaterialTheme.typography.bodySmall)
                    Button(onClick = onOpenSelfExam, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                        shape = SelfExamDesign.controlShape, contentPadding = SelfExamDesign.buttonPadding,
                        colors = ButtonDefaults.buttonColors(containerColor = ctaColor, contentColor = Color.White)) {
                        Icon(Icons.Default.PlayArrow, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(stringResource(R.string.start_practice), style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberPosterMotionAllowed(): Boolean {
    if (LocalInspectionMode.current) return false
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(AccessibilityManager::class.java) }
    fun allowed() = runCatching {
        manager?.isEnabled != true && Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }.getOrDefault(false)
    var motionAllowed by remember(context) { mutableStateOf(allowed()) }
    DisposableEffect(context, manager) {
        val accessibilityListener = AccessibilityManager.AccessibilityStateChangeListener { motionAllowed = allowed() }
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { motionAllowed = allowed() }
        }
        manager?.addAccessibilityStateChangeListener(accessibilityListener)
        context.contentResolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose {
            manager?.removeAccessibilityStateChangeListener(accessibilityListener)
            context.contentResolver.unregisterContentObserver(observer)
        }
    }
    return motionAllowed
}

private fun decodePoster(resources: android.content.res.Resources, @DrawableRes res: Int, maxWidth: Int): Bitmap {
    if (Build.VERSION.SDK_INT >= 28) return ImageDecoder.decodeBitmap(ImageDecoder.createSource(resources, res)) { decoder, info, _ ->
        val scale = (maxWidth.toFloat() / info.size.width).coerceAtMost(1f)
        decoder.setTargetSize((info.size.width * scale).roundToInt().coerceAtLeast(1), (info.size.height * scale).roundToInt().coerceAtLeast(1))
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true; inScaled = false }
    BitmapFactory.decodeResource(resources, res, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2
    val bitmap = checkNotNull(BitmapFactory.decodeResource(resources, res, BitmapFactory.Options().apply { inScaled = false; inSampleSize = sample }))
    if (bitmap.width <= maxWidth) return bitmap
    return Bitmap.createScaledBitmap(bitmap, maxWidth, (bitmap.height * maxWidth.toFloat() / bitmap.width).roundToInt().coerceAtLeast(1), true)
        .also { bitmap.recycle() }
}

@Preview(name = "Self Exam posters · Light", showBackground = true, widthDp = 360)
@Composable
private fun SelfExamPosterLightPreview() { CheatLockTheme(darkTheme = false) { Box(Modifier.padding(22.dp)) { SelfExamUniversityPosterCard({}, fallback = {}) } } }

@Preview(name = "Self Exam posters · Dark", showBackground = true, widthDp = 360)
@Composable
private fun SelfExamPosterDarkPreview() { CheatLockTheme(darkTheme = true) { Box(Modifier.padding(22.dp)) { SelfExamUniversityPosterCard({}, fallback = {}) } } }

/** Wordmark colors follow the existing light/dark logo; ExamLab follows the poster CTA hue. */
@Composable
internal fun SelfExamLabTitle(examLabColor: Color) {
    val light = SelfExamDesign.isLight
    val title = stringResource(R.string.se_examlab_title)
    val wordmark = "CheatLock"
    val annotated = buildAnnotatedString {
        withStyle(SpanStyle(color = if (light) Color(0xFF0D1D37) else Color(0xFFFCFBFB))) {
            append("Cheat")
        }
        withStyle(SpanStyle(color = if (light) Color(0xFF3276F5) else Color(0xFF0079FC))) {
            append("Lock")
        }
        withStyle(SpanStyle(color = examLabColor)) { append(title.removePrefix(wordmark)) }
    }
    Text(annotated, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
}
