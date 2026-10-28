package com.jubayer.cheatlock.ui

import android.net.Uri
import android.widget.VideoView
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val isHomeLight: Boolean
    @Composable get() = MaterialTheme.colorScheme.background == CheatLockLightBackground || MaterialTheme.colorScheme.surface == CheatLockLightSurface

private val HeroVideoBackground: Color
    @Composable get() = if (isHomeLight) Color(0xFFF1F5F9) else CheatLockNavyDeep

private val HomeBackground: Color
    @Composable get() = if (isHomeLight) Color(0xFFF8FAFC) else Color(0xFF050A14)

private val HomeSurface: Color
    @Composable get() = if (isHomeLight) Color(0xFFFFFFFF) else Color(0xFF07101F)

private val HomeSurfaceElevated: Color
    @Composable get() = if (isHomeLight) Color(0xFFF1F5F9) else Color(0xFF09172A)

private val HomeBrandBlue: Color
    @Composable get() = if (isHomeLight) Color(0xFF2563EB) else Color(0xFF087CFF)

private val HomeBrandBlueHover: Color
    @Composable get() = if (isHomeLight) Color(0xFF1D4ED8) else Color(0xFF2592FF)

private val HomeBrandCyan: Color
    @Composable get() = if (isHomeLight) Color(0xFF0284C7) else Color(0xFF16B8FF)

private val HomeTextPrimary: Color
    @Composable get() = if (isHomeLight) Color(0xFF0F172A) else Color(0xFFF5F8FF)

private val HomeTextSecondary: Color
    @Composable get() = if (isHomeLight) Color(0xFF475569) else Color(0xFF94A3B8)

private val HomeTextMuted: Color
    @Composable get() = if (isHomeLight) Color(0xFF64748B) else Color(0xFF64748B)

private val HomeBorder: Color
    @Composable get() = if (isHomeLight) Color(0xFFE2E8F0) else Color(0xFF20304D)

private val HomeBorderBright: Color
    @Composable get() = if (isHomeLight) Color(0xFF93C5FD) else Color(0xFF5082BE)

private val DrawerBackground: Color
    @Composable get() = if (isHomeLight) Color(0xFFFFFFFF) else Color(0xFF07101F)

private val DrawerSurface: Color
    @Composable get() = if (isHomeLight) Color(0xFFF8FAFC) else Color(0xFF09172A)

private val DrawerSurfaceElevated: Color
    @Composable get() = if (isHomeLight) Color(0xFFF1F5F9) else Color(0xFF101B32)

private val DrawerBrandBlue: Color
    @Composable get() = if (isHomeLight) Color(0xFF2563EB) else Color(0xFF087CFF)

private val DrawerBrandBlueHover: Color
    @Composable get() = if (isHomeLight) Color(0xFF1D4ED8) else Color(0xFF2592FF)

private val DrawerBrandCyan: Color
    @Composable get() = if (isHomeLight) Color(0xFF0284C7) else Color(0xFF16B8FF)

private val DrawerTextPrimary: Color
    @Composable get() = if (isHomeLight) Color(0xFF0F172A) else Color(0xFFF5F8FF)

private val DrawerTextSecondary: Color
    @Composable get() = if (isHomeLight) Color(0xFF475569) else Color(0xFF94A3B8)

private val DrawerTextMuted: Color
    @Composable get() = if (isHomeLight) Color(0xFF64748B) else Color(0xFF64748B)

private val DrawerBorder: Color
    @Composable get() = if (isHomeLight) Color(0xFFE2E8F0) else Color(0xFF20304D)

private val DrawerCrispBorder: Color
    @Composable get() = if (isHomeLight) Color(0xFF93C5FD) else Color(0xFF5082BE)

private const val WATCH_DEMO_URL = "https://youtu.be/OzYVLCNSPew?si=5g-e7n7y8qthYtoU"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToSignup: () -> Unit,
    onPurchasePlan: (String) -> Unit,
    onOpenPrivacyPolicy: () -> Unit = {},
    onOpenTerms: () -> Unit = {},
    appLanguage: AppLanguage = AppLanguage.English,
    onLanguageChange: (AppLanguage) -> Unit = {},
    appThemeMode: AppThemeMode = AppThemeMode.System,
    onThemeModeChange: (AppThemeMode) -> Unit = {}
) {
    val scrollState = rememberScrollState()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // Section offsets for navigation
    var featuresOffset by remember { mutableStateOf(0f) }
    var pricingOffset by remember { mutableStateOf(0f) }
    var howItWorksOffset by remember { mutableStateOf(0f) }
    var faqOffset by remember { mutableStateOf(0f) }
    var footerOffset by remember { mutableStateOf(0f) }

    fun scrollTo(offset: Float) {
        scope.launch {
            drawerState.close()
            scrollState.animateScrollTo(offset.roundToInt())
        }
    }

    val currentNavDestination = remember(scrollState.value, featuresOffset, pricingOffset) {
        when {
            pricingOffset > 0f && scrollState.value >= (pricingOffset - 300f) -> HomeNavDestination.PRICING
            featuresOffset > 0f && scrollState.value >= (featuresOffset - 300f) -> HomeNavDestination.FEATURES
            else -> HomeNavDestination.OVERVIEW
        }
    }

    val isLight = MaterialTheme.colorScheme.surface == Color.White ||
        MaterialTheme.colorScheme.background.red > 0.8f

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = if (isLight) Color.White else CheatLockNavyDeep,
                drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp)
            ) {
                HomeDrawerContent(
                    onClose = { scope.launch { drawerState.close() } },
                    onLogin = onNavigateToLogin,
                    onSignup = onNavigateToSignup,
                    onScrollToFeatures = { scrollTo(featuresOffset) },
                    onScrollToPricing = { scrollTo(pricingOffset) },
                    onScrollToHowItWorks = { scrollTo(howItWorksOffset) },
                    onScrollToFaq = { scrollTo(faqOffset) },
                    onScrollToContact = { scrollTo(footerOffset) },
                    appLanguage = appLanguage,
                    onLanguageChange = onLanguageChange,
                    appThemeMode = appThemeMode,
                    onThemeModeChange = onThemeModeChange
                )
            }
        }
    ) {
        val isBn = appLanguage == AppLanguage.Bengali

        Scaffold(
            topBar = {
                HomeTopBar(
                    onOpenDrawer = { scope.launch { drawerState.open() } },
                    onLogin = onNavigateToLogin,
                    onSignup = onNavigateToSignup,
                    isBn = isBn
                )
            },
            containerColor = Color.Transparent
        ) { innerPadding ->
            PremiumScreen(modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.fillMaxSize()) {
                    HomeAmbientBackground()
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                            .verticalScroll(scrollState)
                            .padding(bottom = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(56.dp)
                    ) {
                        HeroSection(isBn = isBn, onGetStarted = onNavigateToSignup)

                        Box(modifier = Modifier.onGloballyPositioned { featuresOffset = it.positionInParent().y }) {
                            FeaturesSection(isBn = isBn)
                        }

                        Box(modifier = Modifier.onGloballyPositioned { howItWorksOffset = it.positionInParent().y }) {
                            HowItWorksSection(isBn = isBn)
                        }

                        Box(modifier = Modifier.onGloballyPositioned { pricingOffset = it.positionInParent().y }) {
                            PricingSection(isBn = isBn, onPurchase = onPurchasePlan)
                        }

                        TestimonialsSection(isBn = isBn)

                        Box(modifier = Modifier.onGloballyPositioned { faqOffset = it.positionInParent().y }) {
                            FaqSection(isBn = isBn)
                        }

                        Box(modifier = Modifier.onGloballyPositioned { footerOffset = it.positionInParent().y }) {
                            FooterSection(
                                isBn = isBn,
                                onOpenPrivacyPolicy = onOpenPrivacyPolicy,
                                onOpenTerms = onOpenTerms
                            )
                        }

                        // Bottom spacing so footer is not covered by floating bottom navigation
                        Spacer(Modifier.height(84.dp))
                    }

                    // World-Class Floating Bottom Navigation for Landing / Home Screen
                    CheatLockHomeBottomNavigation(
                        selectedDestination = currentNavDestination,
                        onDestinationSelected = { destination ->
                            when (destination) {
                                HomeNavDestination.OVERVIEW -> scrollTo(0f)
                                HomeNavDestination.FEATURES -> scrollTo(featuresOffset)
                                HomeNavDestination.PRICING -> scrollTo(pricingOffset)
                                HomeNavDestination.LOGIN -> onNavigateToLogin()
                            }
                        },
                        modifier = Modifier.align(Alignment.BottomCenter)
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeAmbientBackground() {
    val isLight = isHomeLight
    val brandBlue = HomeBrandBlue
    val brandCyan = HomeBrandCyan
    val bg = HomeBackground
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                if (isLight) {
                    Brush.verticalGradient(
                        listOf(
                            Color(0xFFF8FAFC),
                            Color(0xFFF1F5F9),
                            Color(0xFFF8FAFC)
                        )
                    )
                } else {
                    Brush.verticalGradient(
                        listOf(
                            bg,
                            Color(0xFF061120),
                            bg
                        )
                    )
                }
            )
    )
    Canvas(modifier = Modifier.fillMaxSize()) {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    brandBlue.copy(alpha = if (isLight) 0.08f else 0.16f),
                    Color.Transparent
                ),
                center = Offset(size.width * 0.5f, size.height * 0.18f),
                radius = size.minDimension * 0.72f
            )
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    brandCyan.copy(alpha = if (isLight) 0.05f else 0.07f),
                    Color.Transparent
                ),
                center = Offset(size.width * 0.16f, size.height * 0.62f),
                radius = size.minDimension * 0.55f
            )
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeTopBar(
    onOpenDrawer: () -> Unit,
    onLogin: () -> Unit,
    onSignup: () -> Unit,
    isBn: Boolean = false
) {
    val isLight = isHomeLight
    CenterAlignedTopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(
                        id = if (isLight) com.jubayer.cheatlock.R.drawable.cheatlock_logo_light
                             else com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg
                    ),
                    contentDescription = null,
                    modifier = Modifier.size(34.dp)
                )
                Spacer(Modifier.width(8.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "Cheat",
                        style = MaterialTheme.typography.titleLarge,
                        color = HomeTextPrimary,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        "Lock",
                        style = MaterialTheme.typography.titleLarge,
                        color = HomeBrandBlue,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        },
        navigationIcon = {
            IconButton(onClick = onOpenDrawer) {
                Icon(Icons.Default.Menu, "Menu", tint = HomeTextPrimary)
            }
        },
        actions = {
            OutlinedButton(
                onClick = onLogin,
                shape = RoundedCornerShape(10.dp),
                border = BorderStroke(1.dp, HomeBrandBlue.copy(alpha = 0.72f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color.Transparent,
                    contentColor = HomeTextPrimary
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    if (isBn) "লগইন" else "LOGIN",
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.4.sp,
                    fontSize = 12.sp
                )
            }
        },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = Color.Transparent,
            scrolledContainerColor = Color.Transparent,
            navigationIconContentColor = HomeTextPrimary,
            titleContentColor = HomeTextPrimary,
            actionIconContentColor = HomeTextPrimary
        )
    )
}

@Composable
private fun HeroSection(
    isBn: Boolean = false,
    onGetStarted: () -> Unit
) {
    val uriHandler = LocalUriHandler.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        HomeBackground,
                        HomeSurface.copy(alpha = 0.22f),
                        HomeBackground
                    )
                )
            )
            .clipToBounds()
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 1040.dp)
                .align(Alignment.TopCenter)
                .padding(horizontal = 20.dp)
                .padding(top = 34.dp, bottom = 24.dp)
        ) {
            val compact = maxWidth < 430.dp

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = if (compact) 240.dp else 290.dp),
                horizontalArrangement = Arrangement.spacedBy(if (compact) 12.dp else 28.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HomeHeroText(
                    isBn = isBn,
                    compact = compact,
                    onGetStarted = onGetStarted,
                    onWatchDemo = { uriHandler.openUri(WATCH_DEMO_URL) },
                    modifier = Modifier
                        .weight(if (compact) 0.62f else 0.56f)
                        .fillMaxHeight()
                )
                HomeHeroArtwork(
                    compact = compact,
                    modifier = Modifier
                        .weight(if (compact) 0.38f else 0.44f)
                        .fillMaxHeight()
                )
            }
        }
    }
}

@Composable
private fun HomeHeroText(
    isBn: Boolean,
    compact: Boolean,
    onGetStarted: () -> Unit,
    onWatchDemo: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start
    ) {
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(HomeSurfaceElevated.copy(alpha = 0.70f))
                .border(1.dp, HomeBrandBlue.copy(alpha = 0.36f), CircleShape)
                .padding(horizontal = if (compact) 10.dp else 14.dp, vertical = if (compact) 6.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Shield,
                contentDescription = null,
                tint = HomeBrandBlue,
                modifier = Modifier.size(if (compact) 14.dp else 17.dp)
            )
            Text(
                text = if (isBn) "CheatLock সুরক্ষা সক্রিয়" else "CheatLock security active",
                style = MaterialTheme.typography.labelSmall,
                color = HomeBrandBlueHover,
                fontWeight = FontWeight.Bold,
                maxLines = 1
            )
        }

        Spacer(Modifier.height(if (compact) 8.dp else 14.dp))

        Text(
            text = if (isBn) "প্রতিদিন পরীক্ষা,\nসাফল্যের প্রস্তুতি।" else "Daily exams,\nready for success.",
            style = MaterialTheme.typography.displaySmall.copy(
                fontSize = if (compact) 24.sp else 38.sp,
                lineHeight = if (compact) 30.sp else 44.sp
            ),
            color = HomeTextPrimary,
            fontWeight = FontWeight.Black
        )

        Spacer(Modifier.height(if (compact) 7.dp else 12.dp))

        Text(
            text = if (isBn)
                "নিরাপদ পরিবেশে আত্মবিশ্বাসের সাথে আপনার পরীক্ষা দিন।"
            else
                "Take every exam with confidence in a secure environment.",
            style = if (compact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.titleMedium,
            color = HomeTextSecondary,
            lineHeight = if (compact) 18.sp else 24.sp,
            maxLines = if (compact) 2 else Int.MAX_VALUE
        )

        Spacer(Modifier.height(if (compact) 14.dp else 22.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HomePrimaryButton(
                text = if (isBn) "শুরু করুন" else "Get Started",
                onClick = onGetStarted,
                modifier = Modifier
                    .weight(1.2f)
                    .height(if (compact) 50.dp else 56.dp),
                leadingIcon = null,
                showEndArrow = !compact
            )
            OutlinedButton(
                onClick = onWatchDemo,
                modifier = Modifier
                    .weight(1.0f)
                    .height(if (compact) 50.dp else 56.dp),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.5.dp, HomeBrandBlue.copy(alpha = 0.55f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = HomeSurfaceElevated.copy(alpha = 0.82f),
                    contentColor = HomeBrandBlueHover
                ),
                contentPadding = PaddingValues(horizontal = if (compact) 10.dp else 16.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = if (isBn) "ডেমো দেখুন" else "Watch Demo",
                    tint = HomeBrandBlueHover,
                    modifier = Modifier.size(if (compact) 20.dp else 22.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (isBn) "ডেমো দেখুন" else "Watch Demo",
                    fontWeight = FontWeight.Bold,
                    fontSize = if (compact) 13.sp else 14.sp,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun HomeHeroArtwork(
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    val isLight = isHomeLight
    val logoRes = if (isLight) R.drawable.cheatlock_logo_light else R.drawable.cheatlock_logo
    Box(
        modifier = modifier.aspectRatio(if (compact) 0.86f else 1.08f),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = logoRes),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize(if (compact) 0.88f else 0.78f)
                .align(Alignment.CenterEnd)
                .alpha(if (isLight) 0.13f else 0.11f),
            contentScale = ContentScale.Fit
        )
        Image(
            painter = painterResource(id = R.drawable.cheatlock_hero),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize(if (compact) 1f else 0.9f)
                .align(Alignment.BottomCenter),
            contentScale = ContentScale.Fit
        )
        HomeHeroBubble(
            icon = Icons.Default.Mic,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) (-34).dp else (-54).dp, y = if (compact) 10.dp else 14.dp)
        )
        HomeHeroBubble(
            icon = Icons.Default.QrCodeScanner,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) 8.dp else 4.dp, y = if (compact) 2.dp else 4.dp)
        )
        HomeHeroBubble(
            icon = Icons.Default.PhotoCamera,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) 50.dp else 62.dp, y = if (compact) 12.dp else 18.dp)
        )
    }
}

@Composable
private fun HomeHeroBubble(
    icon: ImageVector,
    size: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.size(size),
        shape = CircleShape,
        color = HomeSurface.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, HomeBorderBright.copy(alpha = 0.48f)),
        tonalElevation = 3.dp,
        shadowElevation = 3.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = HomeBrandBlue, modifier = Modifier.size(size * 0.5f))
        }
    }
}

private data class PromoAdItem(
    val id: String,
    val badgeEn: String,
    val badgeBn: String,
    val titleEn: String,
    val titleBn: String,
    val subtitleEn: String,
    val subtitleBn: String,
    val tagEn: String,
    val tagBn: String,
    val ctaEn: String,
    val ctaBn: String,
    val icon: ImageVector,
    val gradientColors: List<Color>,
    val accentColor: Color
)

@Composable
private fun PromoAdSliderSection(
    isBn: Boolean,
    onAdClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isLight = isHomeLight
    val ads = remember(isLight) {
        listOf(
            PromoAdItem(
                id = "ai_proctoring",
                badgeEn = "PROCTORING 2.0",
                badgeBn = "এআই প্রক্টরিং ২.০",
                titleEn = "Smart AI Face & Audio Defense",
                titleBn = "স্মার্ট এআই ফেস ও অডিও নিরাপত্তা",
                subtitleEn = "Real-time gaze detection, noise audit & anti-cheat shield.",
                subtitleBn = "রিয়েল-টাইম ফেস ট্র্যাকিং, নয়েজ অডিট ও চিটিং প্রতিরোধ।",
                tagEn = "99.9% Accuracy",
                tagBn = "৯৯.৯% নিখুঁত",
                ctaEn = "Start Exam Now",
                ctaBn = "পরীক্ষা শুরু করুন",
                icon = Icons.Default.Security,
                gradientColors = if (isLight) {
                    listOf(Color(0xFFEFF6FF), Color(0xFFDBEAFE), Color(0xFFEFF6FF))
                } else {
                    listOf(Color(0xFF041838), Color(0xFF09295E), Color(0xFF071B3D))
                },
                accentColor = if (isLight) Color(0xFF2563EB) else Color(0xFF38BDF8)
            ),
            PromoAdItem(
                id = "self_exam",
                badgeEn = "PRACTICE ARENA",
                badgeBn = "সেলফ প্র্যাকটিস জোন",
                titleEn = "Instant AI-Scored Practice Tests",
                titleBn = "তাত্ক্ষণিক স্কোরিং দিয়ে প্রস্তুতি নিন",
                subtitleEn = "Unlimited MCQs, solution notes & verified grade sheets.",
                subtitleBn = "আনলিমিটেড MCQ, উত্তর সমাধান ও ভেরিফাইড গ্রেড শিট।",
                tagEn = "Instant Reports",
                tagBn = "তাৎক্ষণিক রিপোর্ট",
                ctaEn = "Practice for Free",
                ctaBn = "অনুশীলন শুরু করুন",
                icon = Icons.Default.AutoGraph,
                gradientColors = if (isLight) {
                    listOf(Color(0xFFF0F9FF), Color(0xFFE0F2FE), Color(0xFFF0F9FF))
                } else {
                    listOf(Color(0xFF051C33), Color(0xFF0C3861), Color(0xFF082442))
                },
                accentColor = if (isLight) Color(0xFF0284C7) else Color(0xFF00E5FF)
            ),
            PromoAdItem(
                id = "teacher_suite",
                badgeEn = "TEACHER COMMAND",
                badgeBn = "শিক্ষক ড্যাশবোর্ড",
                titleEn = "Host & Monitor Live Class Exams",
                titleBn = "লাইভ ক্লাস পরীক্ষা পরিচালনা করুন",
                subtitleEn = "Live telemetry, suspicious event alerts & instant exports.",
                subtitleBn = "লাইভ মনিটরিং, অডিট রিপোর্ট ও ক্লাস গ্রেড শিট এক্সপোর্ট।",
                tagEn = "10k+ Sessions",
                tagBn = "১০,০০০+ সেশন",
                ctaEn = "Explore Teacher Hub",
                ctaBn = "টিচার পোর্টাল খুলুন",
                icon = Icons.Default.School,
                gradientColors = if (isLight) {
                    listOf(Color(0xFFF8FAFC), Color(0xFFEEF2F6), Color(0xFFF8FAFC))
                } else {
                    listOf(Color(0xFF061426), Color(0xFF0F2E52), Color(0xFF081C33))
                },
                accentColor = if (isLight) Color(0xFF1D4ED8) else Color(0xFF60A5FA)
            ),
            PromoAdItem(
                id = "secure_kiosk",
                badgeEn = "SECURE KIOSK",
                badgeBn = "সিকিউর কিওস্ক",
                titleEn = "Zero-Leakage Locked Environment",
                titleBn = "শতভাগ নিরাপদ পরীক্ষার পরিবেশ",
                subtitleEn = "Hardware-bound lock task mode prevents split screen & copy-paste.",
                subtitleBn = "হার্ডওয়্যার লক টাস্ক যা স্প্লিট স্ক্রিন ও নকল সম্পূর্ণ বন্ধ করে।",
                tagEn = "Zero Leaks",
                tagBn = "১০০% সুরক্ষিত",
                ctaEn = "Log In & Experience",
                ctaBn = "লগইন করে দেখুন",
                icon = Icons.Default.Lock,
                gradientColors = if (isLight) {
                    listOf(Color(0xFFEFF6FF), Color(0xFFE0E7FF), Color(0xFFEFF6FF))
                } else {
                    listOf(Color(0xFF05152E), Color(0xFF0D2A54), Color(0xFF071936))
                },
                accentColor = if (isLight) Color(0xFF2563EB) else Color(0xFF38BDF8)
            )
        )
    }

    val pagerState = rememberPagerState(pageCount = { ads.size })

    // Automatic sliding every 4 seconds
    LaunchedEffect(pagerState) {
        while (true) {
            delay(4000L)
            if (!pagerState.isScrollInProgress) {
                val next = (pagerState.currentPage + 1) % ads.size
                pagerState.animateScrollToPage(
                    page = next,
                    animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing)
                )
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 1040.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Slider Container
            HorizontalPager(
                state = pagerState,
                pageSpacing = 16.dp,
                modifier = Modifier.fillMaxWidth()
            ) { page ->
                val ad = ads[page]
                PromoAdCard(
                    ad = ad,
                    isBn = isBn,
                    isLight = isLight,
                    onClick = onAdClick
                )
            }

            // Interactive Indicators
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ads.forEachIndexed { index, ad ->
                    val isSelected = pagerState.currentPage == index
                    val width by animateDpAsState(
                        targetValue = if (isSelected) 26.dp else 8.dp,
                        animationSpec = tween(durationMillis = 300),
                        label = "ad_indicator_width"
                    )
                    val alpha by animateFloatAsState(
                        targetValue = if (isSelected) 1f else 0.4f,
                        animationSpec = tween(durationMillis = 300),
                        label = "ad_indicator_alpha"
                    )
                    Box(
                        modifier = Modifier
                            .height(6.dp)
                            .width(width)
                            .clip(CircleShape)
                            .background(
                                if (isSelected) ad.accentColor else (if (isLight) Color(0xFF94A3B8) else Color(0xFF64748B)).copy(alpha = alpha)
                            )
                    )
                }
            }
        }
    }
}

@Composable
private fun PromoAdCard(
    ad: PromoAdItem,
    isBn: Boolean,
    isLight: Boolean,
    onClick: () -> Unit
) {
    val borderColor = if (isLight) Color(0xFFBFDBFE) else HomeBrandBlue.copy(alpha = 0.35f)
    val cardShadow = if (isLight) 3.dp else 6.dp

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable { onClick() },
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.5.dp, borderColor),
        shadowElevation = cardShadow,
        tonalElevation = cardShadow,
        color = Color.Transparent
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(ad.gradientColors))
                .padding(horizontal = 20.dp, vertical = 18.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left Content
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Badge & Tag Row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Badge
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(ad.accentColor.copy(alpha = if (isLight) 0.16f else 0.25f))
                                .border(1.dp, ad.accentColor.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = if (isBn) ad.badgeBn else ad.badgeEn,
                                color = ad.accentColor,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                letterSpacing = 0.8.sp
                            )
                        }

                        // Tag
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (isLight) Color(0xFFDCFCE7) else Color(0xFF064E3B).copy(alpha = 0.6f))
                                .border(1.dp, if (isLight) Color(0xFF86EFAC) else Color(0xFF10B981).copy(alpha = 0.5f), CircleShape)
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = if (isBn) ad.tagBn else ad.tagEn,
                                color = if (isLight) Color(0xFF166534) else Color(0xFF34D399),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 10.sp
                            )
                        }
                    }

                    // Title
                    Text(
                        text = if (isBn) ad.titleBn else ad.titleEn,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Black,
                        color = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC),
                        maxLines = 1
                    )

                    // Subtitle
                    Text(
                        text = if (isBn) ad.subtitleBn else ad.subtitleEn,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isLight) Color(0xFF475569) else Color(0xFF94A3B8),
                        maxLines = 2,
                        lineHeight = 16.sp
                    )

                    Spacer(Modifier.height(2.dp))

                    // Action CTA Row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(ad.accentColor.copy(alpha = if (isLight) 0.12f else 0.20f))
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = if (isBn) ad.ctaBn else ad.ctaEn,
                            color = ad.accentColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            tint = ad.accentColor,
                            modifier = Modifier.size(13.dp)
                        )
                    }
                }

                Spacer(Modifier.width(16.dp))

                // Right Glowing Icon Art
                Box(
                    modifier = Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    ad.accentColor.copy(alpha = if (isLight) 0.22f else 0.35f),
                                    Color.Transparent
                                )
                            )
                        )
                        .border(
                            width = 1.5.dp,
                            color = ad.accentColor.copy(alpha = if (isLight) 0.45f else 0.6f),
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = ad.icon,
                        contentDescription = null,
                        tint = ad.accentColor,
                        modifier = Modifier.size(34.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroBackgroundDecor(modifier: Modifier = Modifier) {
    val brandBlue = HomeBrandBlue
    val brandCyan = HomeBrandCyan
    Canvas(modifier = modifier) {
        val center = Offset(size.width * 0.5f, size.height * 0.45f)
        val ringRadius = size.minDimension * 0.46f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    brandBlue.copy(alpha = 0.12f),
                    brandBlue.copy(alpha = 0.06f),
                    Color.Transparent
                ),
                center = Offset(size.width * 0.5f, size.height * 0.38f),
                radius = size.minDimension * 0.68f
            )
        )

        drawCircle(
            color = brandBlue.copy(alpha = 0.10f),
            radius = ringRadius,
            center = center,
            style = Stroke(width = 1.dp.toPx())
        )
        drawCircle(
            color = brandCyan.copy(alpha = 0.055f),
            radius = ringRadius * 0.78f,
            center = center,
            style = Stroke(width = 1.dp.toPx())
        )
        drawArc(
            color = brandBlue.copy(alpha = 0.07f),
            startAngle = 206f,
            sweepAngle = 116f,
            useCenter = false,
            topLeft = Offset(center.x - ringRadius * 1.08f, center.y - ringRadius * 1.08f),
            size = androidx.compose.ui.geometry.Size(ringRadius * 2.16f, ringRadius * 2.16f),
            style = Stroke(width = 1.dp.toPx(), cap = StrokeCap.Round)
        )

        val dots = listOf(
            Offset(0.09f, 0.18f), Offset(0.18f, 0.24f), Offset(0.30f, 0.15f),
            Offset(0.43f, 0.22f), Offset(0.57f, 0.16f), Offset(0.70f, 0.24f),
            Offset(0.84f, 0.18f), Offset(0.13f, 0.39f), Offset(0.24f, 0.48f),
            Offset(0.36f, 0.37f), Offset(0.66f, 0.40f), Offset(0.78f, 0.50f),
            Offset(0.90f, 0.38f), Offset(0.19f, 0.66f), Offset(0.32f, 0.74f),
            Offset(0.50f, 0.70f), Offset(0.62f, 0.78f), Offset(0.76f, 0.68f),
            Offset(0.88f, 0.77f), Offset(0.08f, 0.81f), Offset(0.46f, 0.10f),
            Offset(0.55f, 0.29f), Offset(0.73f, 0.12f), Offset(0.27f, 0.84f)
        )
        dots.forEachIndexed { index, dot ->
            drawCircle(
                color = if (index % 5 == 0) brandCyan.copy(alpha = 0.18f) else brandBlue.copy(alpha = 0.13f),
                radius = if (index % 4 == 0) 1.5.dp.toPx() else 1.dp.toPx(),
                center = Offset(dot.x * size.width, dot.y * size.height)
            )
        }
    }
}

@Composable
private fun HeroLogoVideo(modifier: Modifier = Modifier) {
    var showFallbackLogo by remember { mutableStateOf(false) }
    val videoUri = "android.resource://com.jubayer.cheatlock/${com.jubayer.cheatlock.R.raw.cheatlock_logo_intro}"

    if (!showFallbackLogo) {
        AndroidView(
            modifier = modifier
                .background(HeroVideoBackground),
            factory = { viewContext ->
                VideoView(viewContext).apply {
                    setBackgroundColor(android.graphics.Color.rgb(10, 15, 29))
                    setVideoURI(Uri.parse(videoUri))
                    setOnPreparedListener { mediaPlayer ->
                        mediaPlayer.isLooping = true
                        mediaPlayer.setVolume(0f, 0f)
                        start()
                    }
                    setOnErrorListener { _, _, _ ->
                        showFallbackLogo = true
                        true
                    }
                }
            },
            onRelease = { videoView ->
                runCatching { videoView.stopPlayback() }
            }
        )
        return
    }

    val transition = rememberInfiniteTransition(label = "heroLogo")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(5200, easing = LinearEasing)
        ),
        label = "heroLogoRotation"
    )
    val pulse by transition.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "heroLogoPulse"
    )

    val brandBlue = HomeBrandBlue
    val brandCyan = HomeBrandCyan

    Box(
        modifier = modifier
            .background(HeroVideoBackground),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth(0.72f)
                .aspectRatio(1f)
                .scale(pulse)
        ) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        brandBlue.copy(alpha = 0.18f),
                        Color.Transparent
                    ),
                    radius = size.minDimension * 0.58f
                )
            )
            drawCircle(
                color = brandBlue.copy(alpha = 0.18f),
                style = Stroke(
                    width = 1.5.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 18f), 0f)
                )
            )
            rotate(rotation) {
                drawArc(
                    color = brandBlue,
                    startAngle = 0f,
                    sweepAngle = 120f,
                    useCenter = false,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                )
                drawArc(
                    color = brandCyan.copy(alpha = 0.65f),
                    startAngle = 210f,
                    sweepAngle = 70f,
                    useCenter = false,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                )
            }
        }

        Image(
            painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
            contentDescription = "CheatLock Logo",
            modifier = Modifier
                .fillMaxWidth(0.34f)
                .aspectRatio(1f)
                .scale(pulse)
        )
    }
}

@Composable
private fun FeaturesSection(isBn: Boolean = false) {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = if (isBn) "শক্তিশালী ফিচারসমূহ" else "Powerful Features",
            subtitle = if (isBn) "নিরাপদ ও নির্ভরযোগ্য পরীক্ষা পরিচালনার পূর্ণাঙ্গ সমাধান" else "Everything you need to ensure secure assessments"
        )

        val features = if (isBn) {
            listOf(
                FeatureData("এআই প্রক্টরিং", "স্বয়ংক্রিয় আচরণ বিশ্লেষণ ও অসদুপায় শনাক্তকরণ।", Icons.Default.AutoGraph),
                FeatureData("ফেস ভেরিফিকেশন", "পরীক্ষায় শিক্ষার্থীর সার্বক্ষণিক উপস্থিতি নিশ্চিতকরণ।", Icons.Default.Face),
                FeatureData("অ্যান্টি-চিটিং সিকিউরিটি", "অ্যাপ পরিবর্তন ও স্ক্রিনশেয়ারিং তাৎক্ষণিক ব্লক।", Icons.Default.Security),
                FeatureData("রিয়েল-টাইম অ্যালার্ট", "সন্দেহজনক কার্যকলাপে তাৎক্ষণিক সতর্কবার্তা।", Icons.Default.NotificationsActive),
                FeatureData("অখণ্ডতা রিপোর্ট", "বিস্তারিত প্রক্টরিং লগ ও ঝুঁকি স্কোরিং বিশ্লেষণ।", Icons.Default.Assessment),
                FeatureData("মাল্টি-প্ল্যাটফর্ম", "মোবাইল ও ড্যাশবোর্ডে নিরাপদ ও সহজ প্রবেশ।", Icons.Default.Devices)
            )
        } else {
            listOf(
                FeatureData("AI Proctoring", "Automated behavior analysis and threat detection.", Icons.Default.AutoGraph),
                FeatureData("Face Detection", "Continuous biometric verification of students.", Icons.Default.Face),
                FeatureData("Anti-Cheating", "Browser lock and app-switch monitoring.", Icons.Default.Security),
                FeatureData("Real-Time Alerts", "Instant signals for proctors and teachers.", Icons.Default.NotificationsActive),
                FeatureData("Analytics", "Detailed integrity reports and risk scores.", Icons.Default.Assessment),
                FeatureData("Multi-Platform", "Secure mobile and web dashboard access.", Icons.Default.Devices)
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            features.chunked(2).forEach { rowFeatures ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    rowFeatures.forEach { feature ->
                        FeatureCard(feature, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun HowItWorksSection(isBn: Boolean = false) {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = if (isBn) "কীভাবে কাজ করে" else "How It Works",
            subtitle = if (isBn) "সহজ চারটি ধাপে সম্পূর্ণ সুরক্ষিত পরীক্ষা ব্যবস্থা" else "Deployment in four simple steps"
        )

        val steps = if (isBn) {
            listOf(
                StepData("01", "অ্যাকাউন্ট তৈরি", "শিক্ষক বা প্রতিষ্ঠান হিসেবে সহজে নিবন্ধন করুন।"),
                StepData("02", "পরীক্ষা প্রস্তুত", "প্রশ্ন সাজান এবং প্রক্টরিং নিরাপত্তা স্তর নির্ধারণ করুন।"),
                StepData("03", "লাইভ মনিটরিং", "পরীক্ষা চলাকালীন এআই ও ফেস শনাক্তকরণ নজরদারি।"),
                StepData("04", "ফলাফল ও গ্রেডিং", "স্বয়ংক্রিয় মূল্যায়ন ও বিস্তারিত রিপোর্ট ডাউনলোড করুন।")
            )
        } else {
            listOf(
                StepData("01", "Create Account", "Register as a teacher or institution to begin."),
                StepData("02", "Configure Exam", "Build questions and set proctoring strictness."),
                StepData("03", "Live Monitoring", "Observe student streams and AI security signals."),
                StepData("04", "Review Reports", "Analyze detailed logs and assign final grades.")
            )
        }

        steps.forEach { step ->
            HowItWorksRow(step)
        }
    }
}

@Composable
private fun PricingSection(
    isBn: Boolean = false,
    onPurchase: (String) -> Unit
) {
    var isYearly by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = if (isBn) "স্বচ্ছ ও সাশ্রয়ী প্রাইসিং" else "Simple Pricing",
            subtitle = if (isBn) "আপনার প্রয়োজন অনুযায়ী সেরা প্ল্যানটি বেছে নিন" else "Choose the plan that fits your academic needs"
        )

        // Billing Toggle
        Row(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .clip(CircleShape)
                .background(HomeSurfaceElevated.copy(alpha = 0.76f))
                .border(1.dp, HomeBorderBright.copy(alpha = 0.24f), CircleShape)
                .padding(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val toggleModifier = Modifier
                .clip(CircleShape)
                .clickable { isYearly = !isYearly }
                .padding(horizontal = 20.dp, vertical = 8.dp)

            Text(
                if (isBn) "মাসিক" else "Monthly",
                modifier = toggleModifier.background(if (!isYearly) HomeBrandBlue else Color.Transparent),
                color = if (!isYearly) HomeTextPrimary else HomeTextSecondary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
            Text(
                if (isBn) "বার্ষিক" else "Yearly",
                modifier = toggleModifier.background(if (isYearly) HomeBrandBlue else Color.Transparent),
                color = if (isYearly) HomeTextPrimary else HomeTextSecondary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }

        val plans = if (isBn) {
            listOf(
                PlanData("Free", "0", "ব্যক্তিগত ব্যবহারের জন্য মৌলিক অ্যাক্সেস।", listOf("৩টি পরীক্ষা/মাস", "মৌলিক প্রক্টরিং", "৫ জন শিক্ষার্থী")),
                PlanData("Basic", if (isYearly) "19" else "29", "ক্লাসের জন্য স্ট্যান্ডার্ড নিরাপত্তা।", listOf("আনলিমিটেড পরীক্ষা", "ফেস ডিটেকশন", "৩০ জন শিক্ষার্থী")),
                PlanData("Pro", if (isYearly) "49" else "69", "বিভাগ বা ইনস্টিটিউটের জন্য উন্নত প্রক্টরিং।", listOf("এআই অ্যানালিটিক্স", "লাইভ রেকর্ডিং", "১০০ জন শিক্ষার্থী"), isPopular = true),
                PlanData("Enterprise", "Custom", "বৃহৎ প্রতিষ্ঠানের জন্য কাস্টম সমাধান।", listOf("ডেডিকেটেড সার্ভার", "এপিআই অ্যাক্সেস", "এসএসও লগইন"))
            )
        } else {
            listOf(
                PlanData("Free", "0", "Basic access for individuals.", listOf("3 Exams/Mo", "Basic Proctoring", "5 Students")),
                PlanData("Basic", if (isYearly) "19" else "29", "Standard security for classes.", listOf("Unlimited Exams", "Face Detection", "30 Students")),
                PlanData("Pro", if (isYearly) "49" else "69", "Advanced proctoring for departments.", listOf("AI Analytics", "Live Recording", "100 Students"), isPopular = true),
                PlanData("Enterprise", "Custom", "Full-scale institutional integrity.", listOf("Dedicated Server", "API Access", "SSO Login"))
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            plans.forEach { plan ->
                PricingCard(plan, isYearly, isBn = isBn, onPurchase = { onPurchase(plan.name) })
            }
        }
    }
}

@Composable
private fun TestimonialsSection(isBn: Boolean = false) {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = if (isBn) "ব্যবহারকারীদের মতামত" else "Testimonials",
            subtitle = if (isBn) "বিশ্বব্যাপী শিক্ষক ও শিক্ষা প্রতিষ্ঠানের আস্থা" else "Trusted by educators worldwide"
        )

        val reviews = if (isBn) {
            listOf(
                ReviewData("ড. সারাহ জেনকিন্স", "ইউনিভার্সিটি অফ টেক", "চিটলক আমাদের অনলাইন পরীক্ষার রূপরেখা বদলে দিয়েছে। এর এআই প্রক্টরিং অত্যন্ত নিখুঁত ও নির্ভরযোগ্য।"),
                ReviewData("জেমস উইলসন", "অনলাইন একাডেমি", "টিচার ড্যাশবোর্ডটি অত্যন্ত শক্তিশালী এবং ব্যবহারবান্ধব। রিয়েল-টাইম অ্যালার্ট আমাদের কাজকে সহজ করেছে।")
            )
        } else {
            listOf(
                ReviewData("Dr. Sarah Jenkins", "University of Tech", "CheatLock has completely transformed how we conduct remote assessments. The AI is remarkably accurate."),
                ReviewData("James Wilson", "Online Academy", "The teacher dashboard is intuitive and powerful. Real-time alerts are a game changer.")
            )
        }

        reviews.forEach { review ->
            HomeCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).clip(CircleShape).background(HomeBrandBlue), contentAlignment = Alignment.Center) {
                            Text(review.name.take(1), color = HomeTextPrimary, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(review.name, fontWeight = FontWeight.Bold, color = HomeTextPrimary)
                            Text(review.org, style = MaterialTheme.typography.labelSmall, color = HomeTextSecondary)
                        }
                    }
                    Text("\"${review.text}\"", style = MaterialTheme.typography.bodyMedium, color = HomeTextSecondary, lineHeight = 22.sp)
                }
            }
        }
    }
}

@Composable
private fun FaqSection(isBn: Boolean = false) {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        SectionHeader(
            title = if (isBn) "সচরাচর জিজ্ঞাসা (FAQ)" else "FAQ",
            subtitle = if (isBn) "চিটলক প্ল্যাটফর্ম সম্পর্কিত সাধারণ প্রশ্নোত্তর" else "Common questions about our platform"
        )

        val faqs = if (isBn) {
            listOf(
                "এআই প্রক্টরিং কীভাবে কাজ করে?" to "আমাদের এআই স্বয়ংক্রিয়ভাবে পরীক্ষার্থীর আচরণ, চোখের নড়াচড়া এবং শব্দ পর্যবেক্ষণ করে যে কোনো অসদুপায় তাৎক্ষণিক শনাক্ত করে।",
                "শিক্ষার্থীরা কি যে কোনো ডিভাইসে ব্যবহার করতে পারবে?" to "হ্যাঁ, চিটলক মোবাইল অ্যাপ এবং কম্পিউটার ব্রাউজার উভয়ের মাধ্যমেই সাবলীলভাবে ব্যবহার করা যায়।",
                "আমাদের ডাটা কি সম্পূর্ণ নিরাপদ?" to "নিরাপত্তা আমাদের সর্বোচ্চ অগ্রাধিকার। সকল ভিডিও ও পরীক্ষার ডাটা এন্টারপ্রাইজ-গ্রেড সিকিউরিটি দিয়ে এনক্রিপ্ট করা।"
            )
        } else {
            listOf(
                "How does AI proctoring work?" to "Our AI monitors student behavior, eye movement, and environment noises to detect potential integrity breaches automatically.",
                "Can students use it on any device?" to "Yes, CheatLock is optimized for both desktop browsers and mobile devices through our cross-platform apps.",
                "Is the data encrypted?" to "Security is our priority. All student data, video streams, and exam content are encrypted using enterprise-grade protocols."
            )
        }

        faqs.forEach { (q, a) ->
            var expanded by remember { mutableStateOf(false) }
            HomeCard(contentPadding = PaddingValues(0.dp)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { expanded = !expanded }
                        .padding(horizontal = 18.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(q, fontWeight = FontWeight.Bold, color = HomeTextPrimary, modifier = Modifier.weight(1f))
                        Icon(
                            if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            null,
                            tint = HomeBrandBlueHover
                        )
                    }
                    AnimatedVisibility(visible = expanded) {
                        Text(a, style = MaterialTheme.typography.bodySmall, color = HomeTextSecondary, lineHeight = 20.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun FooterSection(
    isBn: Boolean = false,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenTerms: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(
                        HomeSurface.copy(alpha = 0.20f),
                        HomeSurfaceElevated.copy(alpha = 0.72f)
                    )
                )
            )
            .border(1.dp, HomeBorderBright.copy(alpha = 0.12f))
            .padding(vertical = 40.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                alpha = 0.6f
            )
            Spacer(Modifier.width(12.dp))
            Text(
                if (isBn) "চিটলক সিকিউরিটি" else "CheatLock Security",
                style = MaterialTheme.typography.titleSmall,
                color = HomeTextPrimary.copy(alpha = 0.84f),
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Text(if (isBn) "আমাদের সম্পর্কে" else "About", color = HomeTextSecondary, style = MaterialTheme.typography.labelSmall)
            Text(
                if (isBn) "গোপনীয়তা" else "Privacy",
                color = HomeTextSecondary,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.clickable(onClick = onOpenPrivacyPolicy)
            )
            Text(
                if (isBn) "শর্তাবলী" else "Terms",
                color = HomeTextSecondary,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.clickable(onClick = onOpenTerms)
            )
            Text(if (isBn) "যোগাযোগ" else "Contact", color = HomeTextSecondary, style = MaterialTheme.typography.labelSmall)
        }

        HorizontalDivider(
            modifier = Modifier.width(40.dp),
            thickness = 1.dp,
            color = HomeBorderBright.copy(alpha = 0.24f)
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                if (isBn) "© ২০২৬ চিটলক সিকিউরিটি। সর্বস্বত্ব সংরক্ষিত।" else "© 2026 CheatLock Security. All rights reserved.",
                style = MaterialTheme.typography.labelSmall,
                color = HomeTextSecondary,
                textAlign = TextAlign.Center
            )
            Text(
                if (isBn) "ডেভেলপার: জুবায়ের রহমান চৌধুরী (টিম নেক্সটজেন)" else "Developed by Jubayer Rahman Chowdhury (Team NextZen)",
                style = MaterialTheme.typography.labelSmall,
                color = HomeBrandBlueHover.copy(alpha = 0.84f),
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String, subtitle: String) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = HomeTextPrimary,
            fontWeight = FontWeight.Black
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyLarge,
            color = HomeTextSecondary,
            lineHeight = 24.sp
        )
    }
}

@Composable
private fun HomeCard(
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(18.dp),
    content: @Composable () -> Unit
) {
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        HomeSurfaceElevated.copy(alpha = if (highlighted) 0.88f else 0.72f),
                        HomeSurface.copy(alpha = if (highlighted) 0.76f else 0.52f)
                    )
                )
            )
            .border(
                1.dp,
                if (highlighted) HomeBrandBlue.copy(alpha = 0.74f) else HomeBorderBright.copy(alpha = 0.28f),
                shape
            )
            .padding(contentPadding)
    ) {
        content()
    }
}

@Composable
private fun HomePrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    showEndArrow: Boolean = true
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
        contentPadding = PaddingValues(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color(0xFF076CFF),
                            HomeBrandBlue,
                            HomeBrandCyan
                        )
                    )
                )
                .padding(horizontal = 20.dp),
            contentAlignment = Alignment.Center
        ) {
            if (leadingIcon != null) {
                Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.align(Alignment.CenterStart).size(20.dp)
                )
            }
            Text(
                text = text,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp
            )
            if (showEndArrow) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.align(Alignment.CenterEnd).size(22.dp)
                )
            }
        }
    }
}

@Composable
private fun HomeBadge(text: String) {
    Text(
        text = text,
        modifier = Modifier
            .clip(CircleShape)
            .background(HomeBrandBlue.copy(alpha = 0.14f))
            .border(1.dp, HomeBrandBlue.copy(alpha = 0.48f), CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        color = HomeBrandBlueHover,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.8.sp
    )
}

@Composable
private fun FeatureCard(data: FeatureData, modifier: Modifier = Modifier) {
    HomeCard(modifier = modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(HomeBrandBlue.copy(alpha = 0.10f))
                    .border(1.dp, HomeBrandBlue.copy(alpha = 0.42f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(data.icon, null, tint = HomeBrandBlueHover, modifier = Modifier.size(24.dp))
            }
            Text(data.title, fontWeight = FontWeight.Bold, color = HomeTextPrimary, fontSize = 15.sp)
            Text(data.desc, style = MaterialTheme.typography.bodySmall, color = HomeTextSecondary, lineHeight = 19.sp)
        }
    }
}

@Composable
private fun HowItWorksRow(data: StepData) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(HomeBrandBlue.copy(alpha = 0.10f))
                    .border(1.dp, HomeBrandBlue.copy(alpha = 0.42f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = data.no,
                    color = HomeBrandBlueHover,
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp
                )
            }
        }
        HomeCard(modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(data.title, fontWeight = FontWeight.Bold, color = HomeTextPrimary, fontSize = 18.sp)
                Text(data.desc, style = MaterialTheme.typography.bodyMedium, color = HomeTextSecondary, lineHeight = 22.sp)
            }
        }
    }
}

@Composable
private fun PricingCard(
    data: PlanData,
    isYearly: Boolean,
    isBn: Boolean = false,
    onPurchase: () -> Unit
) {
    HomeCard(highlighted = data.isPopular) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (data.isPopular) {
                HomeBadge(text = if (isBn) "সর্বাধিক জনপ্রিয়" else "MOST POPULAR")
            }
            Text(data.name, fontWeight = FontWeight.Black, color = HomeTextPrimary, fontSize = 20.sp)
            Row(verticalAlignment = Alignment.Bottom) {
                if (data.price != "Custom") {
                    Text("$", color = HomeTextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
                }
                Text(data.price, color = HomeTextPrimary, style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Black)
                Text(if (data.price == "Custom") "" else if (isYearly) (if (isBn) "/বছর" else "/yr") else (if (isBn) "/মাস" else "/mo"), color = HomeTextSecondary, modifier = Modifier.padding(bottom = 8.dp, start = 4.dp))
            }
            Text(data.desc, style = MaterialTheme.typography.bodySmall, color = HomeTextSecondary)

            HorizontalDivider(color = HomeBorderBright.copy(alpha = 0.14f))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                data.features.forEach { feat ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = HomeBrandCyan, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(feat, style = MaterialTheme.typography.bodySmall, color = HomeTextPrimary)
                    }
                }
            }

            HomePrimaryButton(
                text = if (data.name == "Free" || data.name == "ফ্রি") (if (isBn) "শুরু করুন" else "GET STARTED") else (if (isBn) "সাবস্ক্রাইব করুন" else "BUY NOW"),
                onClick = onPurchase,
                modifier = Modifier.fillMaxWidth().height(50.dp)
            )
        }
    }
}

@Composable
private fun HomeDrawerContent(
    onClose: () -> Unit,
    onLogin: () -> Unit,
    onSignup: () -> Unit,
    onScrollToFeatures: () -> Unit,
    onScrollToPricing: () -> Unit,
    onScrollToHowItWorks: () -> Unit,
    onScrollToFaq: () -> Unit,
    onScrollToContact: () -> Unit,
    appLanguage: AppLanguage,
    onLanguageChange: (AppLanguage) -> Unit,
    appThemeMode: AppThemeMode,
    onThemeModeChange: (AppThemeMode) -> Unit
) {
    val scrollState = rememberScrollState()
    val isLight = MaterialTheme.colorScheme.surface == Color.White ||
        MaterialTheme.colorScheme.background.red > 0.8f
    val isDark = with(AppUiPreferences) { appThemeMode.isDarkTheme() }
    val isBn = appLanguage == AppLanguage.Bengali

    val drawerBgGradient = if (isLight) {
        listOf(Color(0xFFFFFFFF), Color(0xFFF8FAFC), Color(0xFFF1F5F9))
    } else {
        listOf(Color(0xFF081426), Color(0xFF06101F), Color(0xFF050B16))
    }
    val contentTextPrimary = if (isLight) Color(0xFF0F172A) else DrawerTextPrimary
    val contentTextSecondary = if (isLight) Color(0xFF475569) else DrawerTextSecondary
    val contentCrispBorder = if (isLight) Color(0xFFE2E8F0) else DrawerCrispBorder
    val contentSurface = if (isLight) Color(0xFFF8FAFC) else DrawerSurface
    val contentSurfaceElevated = if (isLight) Color(0xFFF1F5F9) else DrawerSurfaceElevated

    Box(
        modifier = Modifier
            .fillMaxHeight()
            .fillMaxWidth(0.88f)
            .widthIn(max = 380.dp)
            .clip(RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp))
            .background(Brush.verticalGradient(drawerBgGradient))
            .border(
                width = 1.dp,
                color = contentCrispBorder.copy(alpha = 0.25f),
                shape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp)
            )
    ) {
        DrawerBottomWave(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .fillMaxWidth(0.78f)
                .height(160.dp)
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 22.dp, vertical = 22.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painter = painterResource(id = if (isLight) com.jubayer.cheatlock.R.drawable.cheatlock_logo_light else com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg),
                        contentDescription = "CheatLock logo",
                        modifier = Modifier.size(52.dp)
                    )
                    Spacer(Modifier.width(13.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                "Cheat",
                                style = MaterialTheme.typography.titleLarge,
                                color = contentTextPrimary,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                "Lock",
                                style = MaterialTheme.typography.titleLarge,
                                color = DrawerBrandBlue,
                                fontWeight = FontWeight.Black
                            )
                        }
                        Text(
                            if (isBn) "নিরাপত্তা • পর্যবেক্ষণ • বিশ্বাস" else "SECURE • MONITOR • TRUST",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                            color = contentTextSecondary,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = 1.8.sp
                        )
                    }
                }
                IconButton(
                    onClick = onClose,
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(contentSurface.copy(alpha = 0.72f))
                        .border(1.dp, contentCrispBorder.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = contentTextPrimary)
                }
            }

            Spacer(Modifier.height(24.dp))

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                DrawerLink(if (isBn) "ফিচার্স" else "Features", Icons.Default.AutoGraph, active = true, isLight = isLight) { onScrollToFeatures() }
                DrawerLink(if (isBn) "প্রাইসিং" else "Pricing", Icons.Default.Payments, isLight = isLight) { onScrollToPricing() }
                DrawerLink(if (isBn) "কীভাবে কাজ করে" else "How It Works", Icons.Default.Info, isLight = isLight) { onScrollToHowItWorks() }
                DrawerLink(if (isBn) "প্রশ্নোত্তর" else "FAQ", Icons.Default.QuestionAnswer, isLight = isLight) { onScrollToFaq() }
                DrawerLink(if (isBn) "যোগাযোগ" else "Contact", Icons.Default.Email, isLight = isLight) { onScrollToContact() }
            }

            Spacer(Modifier.height(24.dp))

            // In-drawer Appearance & Language Control
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = contentSurfaceElevated.copy(alpha = 0.85f),
                border = BorderStroke(1.dp, contentCrispBorder.copy(alpha = 0.35f))
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Appearance Mode Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = stringResource(R.string.theme),
                                color = contentTextPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = when (appThemeMode) {
                                    AppThemeMode.Light -> stringResource(R.string.theme_light)
                                    AppThemeMode.Dark -> stringResource(R.string.theme_dark)
                                    AppThemeMode.System -> stringResource(R.string.theme_system)
                                },
                                color = contentTextSecondary,
                                fontSize = 11.sp
                            )
                        }

                        // 3-way toggle (System | Light | Dark)
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isLight) Color(0xFFE2E8F0) else Color(0xFF0F172A),
                            border = BorderStroke(1.dp, contentCrispBorder.copy(alpha = 0.25f))
                        ) {
                            Row(
                                modifier = Modifier.padding(2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val modes = listOf(
                                    Triple(AppThemeMode.System, Icons.Default.SettingsBrightness, "SYS"),
                                    Triple(AppThemeMode.Light, Icons.Default.WbSunny, "Light"),
                                    Triple(AppThemeMode.Dark, Icons.Default.NightsStay, "Dark")
                                )
                                modes.forEach { (mode, icon, desc) ->
                                    val isSelected = appThemeMode == mode
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) DrawerBrandBlue else Color.Transparent)
                                            .clickable { onThemeModeChange(mode) }
                                            .padding(horizontal = 7.dp, vertical = 5.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = icon,
                                            contentDescription = desc,
                                            tint = if (isSelected) Color.White else contentTextSecondary,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    HorizontalDivider(color = contentCrispBorder.copy(alpha = 0.25f))

                    // Language Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = stringResource(R.string.language),
                                color = contentTextPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = if (isBn) "বাংলা" else "English",
                                color = contentTextSecondary,
                                fontSize = 11.sp
                            )
                        }

                        // 2-way toggle (BN | EN)
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isLight) Color(0xFFE2E8F0) else Color(0xFF0F172A),
                            border = BorderStroke(1.dp, contentCrispBorder.copy(alpha = 0.25f))
                        ) {
                            Row(
                                modifier = Modifier.padding(2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val languages = listOf(
                                    Pair(AppLanguage.Bengali, "বাংলা"),
                                    Pair(AppLanguage.English, "EN")
                                )
                                languages.forEach { (lang, label) ->
                                    val isSelected = appLanguage == lang
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) DrawerBrandBlue else Color.Transparent)
                                            .clickable { onLanguageChange(lang) }
                                            .padding(horizontal = 9.dp, vertical = 5.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = label,
                                            color = if (isSelected) Color.White else contentTextSecondary,
                                            fontSize = 11.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider(color = contentTextSecondary.copy(alpha = 0.15f))
            Spacer(Modifier.height(18.dp))

            Text(
                if (isBn) "অ্যাকাউন্ট ও নিরাপত্তা" else "ACCOUNT & SECURITY",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = contentTextSecondary,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.1.sp
            )
            Spacer(Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 68.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(DrawerSurfaceElevated.copy(alpha = 0.65f))
                    .border(1.dp, DrawerCrispBorder.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(CheatLockSuccess)
                    )
                    Spacer(Modifier.width(12.dp))
                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = DrawerTextPrimary, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(if (isBn) "সিস্টেম সুরক্ষিত" else "System Secure", color = DrawerTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(if (isBn) "সকল মনিটরিং সক্রিয় রয়েছে" else "All systems are active", color = DrawerTextSecondary, fontSize = 12.sp)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = onLogin,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(11.dp),
                    border = BorderStroke(1.dp, DrawerBrandBlue.copy(alpha = 0.65f)),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.Transparent,
                        contentColor = DrawerBrandBlueHover
                    )
                ) {
                    Icon(Icons.AutoMirrored.Filled.Login, contentDescription = null, tint = DrawerBrandBlueHover, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(if (isBn) "লগইন" else "LOGIN", fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp, fontSize = 14.sp)
                }
                Button(
                    onClick = onSignup,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.horizontalGradient(
                                    0.0f to Color(0xFF075BFF),
                                    0.58f to DrawerBrandBlue,
                                    1.0f to DrawerBrandCyan
                                )
                            )
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, tint = Color.White, modifier = Modifier.align(Alignment.CenterStart).size(20.dp))
                        Text(if (isBn) "সাইন আপ" else "SIGN UP", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.align(Alignment.CenterEnd).size(24.dp))
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = DrawerBrandBlue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(10.dp))
                Text(
                    if (isBn) "চিটলক প্রক্টরিং সিস্টেম" else "CheatLock Proctoring System",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                    color = DrawerTextMuted
                )
            }
        }
    }
}

@Composable
private fun DrawerLink(
    text: String,
    icon: ImageVector,
    active: Boolean = false,
    isLight: Boolean = false,
    onClick: () -> Unit
) {
    val shape = RoundedCornerShape(12.dp)
    val inactiveText = if (isLight) Color(0xFF475569) else DrawerTextSecondary
    val activeText = if (isLight) Color(0xFF1D4ED8) else DrawerBrandBlueHover

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(shape)
            .background(if (active) DrawerBrandBlue.copy(alpha = if (isLight) 0.12f else 0.10f) else Color.Transparent)
            .then(
                if (active) {
                    Modifier.border(1.dp, DrawerBrandBlue.copy(alpha = if (isLight) 0.28f else 0.22f), shape)
                } else {
                    Modifier
                }
            )
            .clickable { onClick() }
    ) {
        if (active) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(3.dp)
                    .fillMaxHeight()
                    .background(
                        DrawerBrandBlue,
                        RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)
                    )
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 15.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (active) activeText else inactiveText,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text,
                color = if (active) activeText else inactiveText,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                fontSize = 15.sp
            )
        }
    }
}

@Composable
private fun DrawerBottomWave(modifier: Modifier = Modifier) {
    val brandBlue = DrawerBrandBlue
    Canvas(modifier = modifier) {
        val dotColor = brandBlue.copy(alpha = 0.22f)
        val spacing = 11.dp.toPx()
        val rows = (size.height / spacing).toInt()
        val cols = (size.width / spacing).toInt()
        for (row in 0..rows) {
            for (col in 0..cols) {
                val x = col * spacing
                val wave = kotlin.math.sin((col + row) * 0.34f) * 18.dp.toPx()
                val y = size.height - (row * spacing * 0.72f) - wave
                val fade = (col.toFloat() / cols.coerceAtLeast(1)) * (1f - row.toFloat() / rows.coerceAtLeast(1))
                if (y in 0f..size.height) {
                    drawCircle(dotColor.copy(alpha = 0.10f * fade), radius = 0.9.dp.toPx(), center = Offset(x, y))
                }
            }
        }
    }
}

private data class FeatureData(val title: String, val desc: String, val icon: ImageVector)
private data class StepData(val no: String, val title: String, val desc: String)
private data class PlanData(val name: String, val price: String, val desc: String, val features: List<String>, val isPopular: Boolean = false)
private data class ReviewData(val name: String, val org: String, val text: String)
