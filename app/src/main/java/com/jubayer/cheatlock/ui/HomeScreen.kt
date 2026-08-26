package com.jubayer.cheatlock.ui

import android.net.Uri
import android.widget.VideoView
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val HeroVideoBackground = CheatLockNavyDeep
private val HomeBackground = Color(0xFF050A14)
private val HomeSurface = Color(0xFF07101F)
private val HomeSurfaceElevated = Color(0xFF09172A)
private val HomeBrandBlue = Color(0xFF087CFF)
private val HomeBrandBlueHover = Color(0xFF2592FF)
private val HomeBrandCyan = Color(0xFF16B8FF)
private val HomeTextPrimary = Color(0xFFF5F8FF)
private val HomeTextSecondary = Color(0xFF94A3B8)
private val HomeTextMuted = Color(0xFF64748B)
private val HomeBorder = Color(0xFF20304D)
private val HomeBorderBright = Color(0xFF5082BE)
private val DrawerBackground = Color(0xFF07101F)
private val DrawerSurface = Color(0xFF09172A)
private val DrawerSurfaceElevated = Color(0xFF101B32)
private val DrawerBrandBlue = Color(0xFF087CFF)
private val DrawerBrandBlueHover = Color(0xFF2592FF)
private val DrawerBrandCyan = Color(0xFF16B8FF)
private val DrawerTextPrimary = Color(0xFFF5F8FF)
private val DrawerTextSecondary = Color(0xFF94A3B8)
private val DrawerTextMuted = Color(0xFF64748B)
private val DrawerBorder = Color(0xFF20304D)
private val DrawerCrispBorder = Color(0xFF5082BE)
private const val WATCH_DEMO_URL = "https://youtu.be/OzYVLCNSPew?si=5g-e7n7y8qthYtoU"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToSignup: () -> Unit,
    onPurchasePlan: (String) -> Unit,
    onOpenPrivacyPolicy: () -> Unit = {},
    onOpenTerms: () -> Unit = {}
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

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = CheatLockNavyDeep,
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
                    onScrollToContact = { scrollTo(footerOffset) }
                )
            }
        }
    ) {
        Scaffold(
            topBar = {
                HomeTopBar(
                    onOpenDrawer = { scope.launch { drawerState.open() } },
                    onLogin = onNavigateToLogin,
                    onSignup = onNavigateToSignup
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
                            .padding(bottom = 40.dp),
                        verticalArrangement = Arrangement.spacedBy(56.dp)
                    ) {
                        HeroSection(onGetStarted = onNavigateToSignup)
                        
                        Box(modifier = Modifier.onGloballyPositioned { featuresOffset = it.positionInParent().y }) {
                            FeaturesSection()
                        }
                        
                        Box(modifier = Modifier.onGloballyPositioned { howItWorksOffset = it.positionInParent().y }) {
                            HowItWorksSection()
                        }
                        
                        Box(modifier = Modifier.onGloballyPositioned { pricingOffset = it.positionInParent().y }) {
                            PricingSection(onPurchase = onPurchasePlan)
                        }
                        
                        TestimonialsSection()
                        
                        Box(modifier = Modifier.onGloballyPositioned { faqOffset = it.positionInParent().y }) {
                            FaqSection()
                        }

                        Box(modifier = Modifier.onGloballyPositioned { footerOffset = it.positionInParent().y }) {
                            FooterSection(
                                onOpenPrivacyPolicy = onOpenPrivacyPolicy,
                                onOpenTerms = onOpenTerms
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeAmbientBackground() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        HomeBackground,
                        Color(0xFF061120),
                        HomeBackground
                    )
                )
            )
    )
    Canvas(modifier = Modifier.fillMaxSize()) {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    HomeBrandBlue.copy(alpha = 0.16f),
                    Color.Transparent
                ),
                center = Offset(size.width * 0.5f, size.height * 0.18f),
                radius = size.minDimension * 0.72f
            )
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    HomeBrandCyan.copy(alpha = 0.07f),
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
    onSignup: () -> Unit
) {
    CenterAlignedTopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg),
                    contentDescription = null,
                    modifier = Modifier.size(34.dp)
                )
                Spacer(Modifier.width(10.dp))
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
                    "LOGIN",
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.6.sp,
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
private fun HeroSection(onGetStarted: () -> Unit) {
    val uriHandler = LocalUriHandler.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        HomeBackground,
                        HomeSurface.copy(alpha = 0.38f),
                        HomeBackground
                    )
                )
            )
            .clipToBounds()
    ) {
        HeroBackgroundDecor(modifier = Modifier.matchParentSize())

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 640.dp)
                .align(Alignment.TopCenter)
                .padding(horizontal = 20.dp)
                .padding(top = 54.dp, bottom = 0.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(HomeSurfaceElevated.copy(alpha = 0.70f))
                    .border(1.dp, HomeBrandBlue.copy(alpha = 0.36f), CircleShape)
                    .padding(horizontal = 18.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = null,
                    tint = HomeBrandBlue,
                    modifier = Modifier.size(17.dp)
                )
                Text(
                    text = "AI-POWERED EXAM SECURITY",
                    style = MaterialTheme.typography.labelMedium,
                    color = HomeBrandBlueHover,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = buildAnnotatedString {
                    append("Secure exams.\nSmarter ")
                    withStyle(SpanStyle(color = HomeBrandBlue)) {
                        append("proctoring.")
                    }
                },
                style = MaterialTheme.typography.displayMedium,
                color = HomeTextPrimary,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                lineHeight = 48.sp
            )

            Spacer(Modifier.height(20.dp))

            Text(
                text = "AI-powered exam security platform with advanced face detection, real-time monitoring, and intelligent proctoring solutions.",
                style = MaterialTheme.typography.bodyLarge,
                color = HomeTextSecondary,
                textAlign = TextAlign.Center,
                lineHeight = 26.sp,
                modifier = Modifier.widthIn(max = 560.dp)
            )

            Spacer(Modifier.height(30.dp))

            HomePrimaryButton(
                text = "Get Started",
                onClick = onGetStarted,
                modifier = Modifier.fillMaxWidth().height(58.dp),
                leadingIcon = null
            )

            Spacer(Modifier.height(22.dp))

            TextButton(
                onClick = { uriHandler.openUri(WATCH_DEMO_URL) },
                modifier = Modifier.height(54.dp),
                colors = ButtonDefaults.textButtonColors(
                    contentColor = HomeTextPrimary
                )
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(HomeBrandBlue.copy(alpha = 0.10f))
                        .border(1.dp, HomeBrandBlue.copy(alpha = 0.65f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(21.dp),
                        tint = HomeBrandBlueHover
                    )
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    "Watch Demo",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            }

            Spacer(Modifier.height(62.dp))

            HorizontalDivider(
                modifier = Modifier.fillMaxWidth(),
                thickness = 1.dp,
                color = HomeBorderBright.copy(alpha = 0.18f)
            )
        }
    }
}

@Composable
private fun HeroBackgroundDecor(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val center = Offset(size.width * 0.5f, size.height * 0.45f)
        val ringRadius = size.minDimension * 0.46f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    HomeBrandBlue.copy(alpha = 0.12f),
                    HomeBrandBlue.copy(alpha = 0.06f),
                    Color.Transparent
                ),
                center = Offset(size.width * 0.5f, size.height * 0.38f),
                radius = size.minDimension * 0.68f
            )
        )

        drawCircle(
            color = HomeBrandBlue.copy(alpha = 0.10f),
            radius = ringRadius,
            center = center,
            style = Stroke(width = 1.dp.toPx())
        )
        drawCircle(
            color = HomeBrandCyan.copy(alpha = 0.055f),
            radius = ringRadius * 0.78f,
            center = center,
            style = Stroke(width = 1.dp.toPx())
        )
        drawArc(
            color = HomeBrandBlue.copy(alpha = 0.07f),
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
                color = if (index % 5 == 0) HomeBrandCyan.copy(alpha = 0.18f) else HomeBrandBlue.copy(alpha = 0.13f),
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
                        HomeBrandBlue.copy(alpha = 0.18f),
                        Color.Transparent
                    ),
                    radius = size.minDimension * 0.58f
                )
            )
            drawCircle(
                color = HomeBrandBlue.copy(alpha = 0.18f),
                style = Stroke(
                    width = 1.5.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 18f), 0f)
                )
            )
            rotate(rotation) {
                drawArc(
                    color = HomeBrandBlue,
                    startAngle = 0f,
                    sweepAngle = 120f,
                    useCenter = false,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                )
                drawArc(
                    color = HomeBrandCyan.copy(alpha = 0.65f),
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
private fun FeaturesSection() {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = "Powerful Features",
            subtitle = "Everything you need to ensure secure assessments"
        )

        val features = listOf(
            FeatureData("AI Proctoring", "Automated behavior analysis and threat detection.", Icons.Default.AutoGraph),
            FeatureData("Face Detection", "Continuous biometric verification of students.", Icons.Default.Face),
            FeatureData("Anti-Cheating", "Browser lock and app-switch monitoring.", Icons.Default.Security),
            FeatureData("Real-Time Alerts", "Instant signals for proctors and teachers.", Icons.Default.NotificationsActive),
            FeatureData("Analytics", "Detailed integrity reports and risk scores.", Icons.Default.Assessment),
            FeatureData("Multi-Platform", "Secure mobile and web dashboard access.", Icons.Default.Devices)
        )

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
private fun HowItWorksSection() {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = "How It Works",
            subtitle = "Deployment in four simple steps"
        )

        val steps = listOf(
            StepData("01", "Create Account", "Register as a teacher or institution to begin."),
            StepData("02", "Configure Exam", "Build questions and set proctoring strictness."),
            StepData("03", "Live Monitoring", "Observe student streams and AI security signals."),
            StepData("04", "Review Reports", "Analyze detailed logs and assign final grades.")
        )

        steps.forEach { step ->
            HowItWorksRow(step)
        }
    }
}

@Composable
private fun PricingSection(onPurchase: (String) -> Unit) {
    var isYearly by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = "Simple Pricing",
            subtitle = "Choose the plan that fits your academic needs"
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
                "Monthly",
                modifier = toggleModifier.background(if (!isYearly) HomeBrandBlue else Color.Transparent),
                color = if (!isYearly) HomeTextPrimary else HomeTextSecondary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
            Text(
                "Yearly",
                modifier = toggleModifier.background(if (isYearly) HomeBrandBlue else Color.Transparent),
                color = if (isYearly) HomeTextPrimary else HomeTextSecondary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }

        val plans = listOf(
            PlanData("Free", "0", "Basic access for individuals.", listOf("3 Exams/Mo", "Basic Proctoring", "5 Students")),
            PlanData("Basic", if(isYearly) "19" else "29", "Standard security for classes.", listOf("Unlimited Exams", "Face Detection", "30 Students")),
            PlanData("Pro", if(isYearly) "49" else "69", "Advanced proctoring for departments.", listOf("AI Analytics", "Live Recording", "100 Students"), isPopular = true),
            PlanData("Enterprise", "Custom", "Full-scale institutional integrity.", listOf("Dedicated Server", "API Access", "SSO Login"))
        )

        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            plans.forEach { plan ->
                PricingCard(plan, isYearly, onPurchase = { onPurchase(plan.name) })
            }
        }
    }
}

@Composable
private fun TestimonialsSection() {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        SectionHeader(
            title = "Testimonials",
            subtitle = "Trusted by educators worldwide"
        )

        val reviews = listOf(
            ReviewData("Dr. Sarah Jenkins", "University of Tech", "CheatLock has completely transformed how we conduct remote assessments. The AI is remarkably accurate."),
            ReviewData("James Wilson", "Online Academy", "The teacher dashboard is intuitive and powerful. Real-time alerts are a game changer.")
        )

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
private fun FaqSection() {
    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        SectionHeader(title = "FAQ", subtitle = "Common questions about our platform")

        val faqs = listOf(
            "How does AI proctoring work?" to "Our AI monitors student behavior, eye movement, and environment noises to detect potential integrity breaches automatically.",
            "Can students use it on any device?" to "Yes, CheatLock is optimized for both desktop browsers and mobile devices through our cross-platform apps.",
            "Is the data encrypted?" to "Security is our priority. All student data, video streams, and exam content are encrypted using enterprise-grade protocols."
        )

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
                "CheatLock Security",
                style = MaterialTheme.typography.titleSmall,
                color = HomeTextPrimary.copy(alpha = 0.84f),
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Text("About", color = HomeTextSecondary, style = MaterialTheme.typography.labelSmall)
            Text(
                "Privacy",
                color = HomeTextSecondary,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.clickable(onClick = onOpenPrivacyPolicy)
            )
            Text(
                "Terms",
                color = HomeTextSecondary,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.clickable(onClick = onOpenTerms)
            )
            Text("Contact", color = HomeTextSecondary, style = MaterialTheme.typography.labelSmall)
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
                "© 2026 CheatLock Security. All rights reserved.",
                style = MaterialTheme.typography.labelSmall,
                color = HomeTextSecondary,
                textAlign = TextAlign.Center
            )
            Text(
                "Developed by Jubayer Rahman Chowdhury (Team NextZen)",
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
    leadingIcon: ImageVector? = null
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
                    tint = HomeTextPrimary,
                    modifier = Modifier.align(Alignment.CenterStart).size(20.dp)
                )
            }
            Text(
                text = text,
                color = HomeTextPrimary,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp
            )
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = HomeTextPrimary,
                modifier = Modifier.align(Alignment.CenterEnd).size(24.dp)
            )
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
private fun PricingCard(data: PlanData, isYearly: Boolean, onPurchase: () -> Unit) {
    HomeCard(highlighted = data.isPopular) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (data.isPopular) {
                HomeBadge(text = "MOST POPULAR")
            }
            Text(data.name, fontWeight = FontWeight.Black, color = HomeTextPrimary, fontSize = 20.sp)
            Row(verticalAlignment = Alignment.Bottom) {
                if (data.price != "Custom") {
                    Text("$", color = HomeTextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
                }
                Text(data.price, color = HomeTextPrimary, style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Black)
                Text(if (data.price == "Custom") "" else if (isYearly) "/yr" else "/mo", color = HomeTextSecondary, modifier = Modifier.padding(bottom = 8.dp, start = 4.dp))
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
                text = if (data.name == "Free") "GET STARTED" else "BUY NOW",
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
    onScrollToContact: () -> Unit
) {
    val scrollState = rememberScrollState()
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .fillMaxWidth(0.88f)
            .widthIn(max = 380.dp)
            .clip(RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp))
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF081426),
                        Color(0xFF06101F),
                        Color(0xFF050B16)
                    )
                )
            )
            .border(
                width = 1.dp,
                color = DrawerCrispBorder.copy(alpha = 0.22f),
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
                        painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg),
                        contentDescription = "CheatLock logo",
                        modifier = Modifier.size(52.dp)
                    )
                    Spacer(Modifier.width(13.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                "Cheat",
                                style = MaterialTheme.typography.titleLarge,
                                color = DrawerTextPrimary,
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
                            "SECURE • MONITOR • TRUST",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                            color = DrawerTextSecondary,
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
                        .background(DrawerSurface.copy(alpha = 0.72f))
                        .border(1.dp, DrawerCrispBorder.copy(alpha = 0.22f), RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = DrawerTextPrimary)
                }
            }

            Spacer(Modifier.height(24.dp))

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                DrawerLink("Features", Icons.Default.AutoGraph, active = true) { onScrollToFeatures() }
                DrawerLink("Pricing", Icons.Default.Payments) { onScrollToPricing() }
                DrawerLink("How It Works", Icons.Default.Info) { onScrollToHowItWorks() }
                DrawerLink("FAQ", Icons.Default.QuestionAnswer) { onScrollToFaq() }
                DrawerLink("Contact", Icons.Default.Email) { onScrollToContact() }
            }

            Spacer(Modifier.height(60.dp))
            HorizontalDivider(color = DrawerTextSecondary.copy(alpha = 0.10f))
            Spacer(Modifier.height(18.dp))

            Text(
                "ACCOUNT & SECURITY",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = DrawerTextSecondary,
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
                        Text("System Secure", color = DrawerTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text("All systems are active", color = DrawerTextSecondary, fontSize = 12.sp)
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
                    Text("LOGIN", fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp, fontSize = 14.sp)
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
                        Text("SIGN UP", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.align(Alignment.CenterEnd).size(24.dp))
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = DrawerBrandBlue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(10.dp))
                Text(
                    "CheatLock Proctoring System",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                    color = DrawerTextMuted
                )
            }
        }
    }
}

@Composable
private fun DrawerLink(text: String, icon: ImageVector, active: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(shape)
            .background(if (active) DrawerBrandBlue.copy(alpha = 0.10f) else Color.Transparent)
            .then(
                if (active) {
                    Modifier.border(1.dp, DrawerBrandBlue.copy(alpha = 0.22f), shape)
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
                tint = if (active) DrawerBrandBlueHover else DrawerTextSecondary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text,
                color = if (active) DrawerBrandBlueHover else DrawerTextSecondary,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                fontSize = 15.sp
            )
        }
    }
}

@Composable
private fun DrawerBottomWave(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val dotColor = DrawerBrandBlue.copy(alpha = 0.22f)
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
