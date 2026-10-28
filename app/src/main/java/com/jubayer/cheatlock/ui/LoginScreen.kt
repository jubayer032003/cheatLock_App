package com.jubayer.cheatlock.ui

import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.jubayer.cheatlock.R
import androidx.compose.ui.graphics.Brush
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.ui.theme.*
import com.jubayer.cheatlock.util.IdentifierNormalizer
import kotlinx.coroutines.launch

private val AuthBackground: Color
    @Composable get() = MaterialTheme.colorScheme.background
private val AuthSurface: Color
    @Composable get() = MaterialTheme.colorScheme.surface
private val AuthBrand: Color
    @Composable get() = MaterialTheme.colorScheme.primary
private val AuthBrandBright: Color
    @Composable get() = if (MaterialTheme.colorScheme.background == CheatLockLightBackground) Color(0xFF075EB8) else Color(0xFF169BFF)
private val AuthBrandCyan: Color
    @Composable get() = MaterialTheme.colorScheme.secondary
private val AuthTextPrimary: Color
    @Composable get() = MaterialTheme.colorScheme.onBackground
private val AuthTextSecondary: Color
    @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
private val AuthTextMuted: Color
    @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
private val AuthBorder: Color
    @Composable get() = MaterialTheme.colorScheme.outline


/**
 * Professional Login & Registration Screen
 * Clean, simple layout with Navy Blue & Light Purple theme.
 */

@Composable
fun LoginScreen(
    serverUrl: String,
    configuredServerUrl: String,
    initialSignupMode: Boolean = false,
    onBackToHome: () -> Unit = {},
    onServerUrlSave: (String) -> Unit,
    onTestServerConnection: suspend (String) -> Result<String>,
    onLogin: suspend (String, String, UserRole) -> UserAccount,
    onSignup: suspend (UserAccount) -> UserAccount,
    onSignupSuccess: (UserAccount) -> Unit = {},
    onStudentLogin: (UserAccount) -> Unit,
    onTeacherLogin: (UserAccount) -> Unit,
    externalMessage: String? = null,
    appLanguage: AppLanguage = AppLanguage.English,
    onLanguageChange: (AppLanguage) -> Unit = {},
    appThemeMode: AppThemeMode = AppThemeMode.System,
    onThemeModeChange: (AppThemeMode) -> Unit = {}
) {
    val motionContext = LocalContext.current
    val reducedMotion = remember {
        runCatching {
            Settings.Global.getFloat(
                motionContext.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
            ) == 0f
        }.getOrDefault(false)
    }
    val scope = rememberCoroutineScope()
    var isSignupMode by remember { mutableStateOf(initialSignupMode) }
    var selectedRole by remember { mutableStateOf(UserRole.STUDENT) }
    var name by remember { mutableStateOf("") }
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var showServerSettings by remember { mutableStateOf(false) }
    var serverInput by remember(configuredServerUrl) { mutableStateOf(configuredServerUrl) }
    var isTestingServer by remember { mutableStateOf(false) }

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Additional Decorative Nebula for Login only
            LoginDecorativeNebula()

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp)
                    .padding(top = 22.dp, bottom = 28.dp)
                    .verticalScroll(rememberScrollState())
                    .imePadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(26.dp)
            ) {
                val isLightMode = MaterialTheme.colorScheme.background == CheatLockLightBackground
                val isDark = with(AppUiPreferences) { appThemeMode.isDarkTheme() }
                val isBn = appLanguage == AppLanguage.Bengali

                // Premium Animated Header
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = onBackToHome,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (isLightMode) CheatLockLightSurface else AuthSurface.copy(alpha = 0.66f))
                                .border(1.dp, if (isLightMode) CheatLockLightBorder else AuthBorder.copy(alpha = 0.28f), CircleShape)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                "Back",
                                tint = if (isLightMode) CheatLockLightTextPrimary else AuthTextPrimary,
                                modifier = Modifier.size(21.dp)
                            )
                        }

                        // Quick Language & Theme Mode Selectors on Login & Signup
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Language [ BN | EN ]
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isLightMode) CheatLockLightSurface else AuthSurface.copy(alpha = 0.66f),
                                border = BorderStroke(1.dp, if (isLightMode) CheatLockLightBorder else AuthBorder.copy(alpha = 0.28f))
                            ) {
                                Row(
                                    modifier = Modifier.padding(2.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isBn) CheatLockLightPrimary else Color.Transparent)
                                            .clickable { onLanguageChange(AppLanguage.Bengali) }
                                            .padding(horizontal = 7.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            "BN",
                                            color = if (isBn) Color.White else if (isLightMode) CheatLockLightTextSecondary else AuthTextSecondary,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (!isBn) CheatLockLightPrimary else Color.Transparent)
                                            .clickable { onLanguageChange(AppLanguage.English) }
                                            .padding(horizontal = 7.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            "EN",
                                            color = if (!isBn) Color.White else if (isLightMode) CheatLockLightTextSecondary else AuthTextSecondary,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // Theme [ ☀️ | 🌙 ]
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isLightMode) CheatLockLightSurface else AuthSurface.copy(alpha = 0.66f),
                                border = BorderStroke(1.dp, if (isLightMode) CheatLockLightBorder else AuthBorder.copy(alpha = 0.28f))
                            ) {
                                Row(
                                    modifier = Modifier.padding(2.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (!isDark) CheatLockLightPrimary else Color.Transparent)
                                            .clickable { onThemeModeChange(AppThemeMode.Light) }
                                            .padding(horizontal = 6.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            Icons.Default.WbSunny,
                                            "Light Mode",
                                            tint = if (!isDark) Color.White else if (isLightMode) CheatLockLightTextSecondary else AuthTextSecondary,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isDark) CheatLockLightPrimary else Color.Transparent)
                                            .clickable { onThemeModeChange(AppThemeMode.Dark) }
                                            .padding(horizontal = 6.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            Icons.Default.NightsStay,
                                            "Dark Mode",
                                            tint = if (isDark) Color.White else if (isLightMode) CheatLockLightTextSecondary else AuthTextSecondary,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(118.dp)) {
                        Image(
                            painter = painterResource(
                                id = if (isLightMode) com.jubayer.cheatlock.R.drawable.cheatlock_logo_light
                                     else com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg
                            ),
                            contentDescription = "CheatLock Emblem",
                            modifier = Modifier.size(104.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.professional_exam_integrity),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isLightMode) CheatLockLightTextSecondary else AuthTextSecondary,
                        fontWeight = FontWeight.Normal,
                        textAlign = TextAlign.Center
                    )
                }

                // Main Auth Card
                AnimatedContent(
                    targetState = isSignupMode,
                    transitionSpec = {
                        cheatLockAuthModeTransition(
                            toSignup = targetState,
                            reducedMotion = reducedMotion
                        ).using(SizeTransform(clip = false))
                    },
                    label = "auth-mode"
                ) { signupMode ->
                    AuthPanel {
                        Column(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(18.dp)
                        ) {
                            Text(
                                text = if (signupMode) stringResource(R.string.sign_up) else stringResource(R.string.login),
                                style = MaterialTheme.typography.headlineSmall,
                                color = AuthTextPrimary,
                                fontWeight = FontWeight.ExtraBold,
                                textAlign = TextAlign.Center
                            )
                            if (signupMode) {
                                Text(
                                    text = stringResource(R.string.security_priority_body),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AuthTextSecondary,
                                    textAlign = TextAlign.Center,
                                    lineHeight = 22.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp)
                                )
                            }

                            LoginAdvancedRoleToggle(
                                selectedRole = selectedRole,
                                allowTeacher = true
                            ) { selectedRole = it }

                            if (signupMode) {
                                AuthOutlinedTextField(
                                    value = name,
                                    onValueChange = { name = it },
                                    label = stringResource(R.string.full_name),
                                    leadingIcon = Icons.Default.Person
                                )
                            }

                            AuthOutlinedTextField(
                                value = identifier,
                                onValueChange = { identifier = it },
                                label = stringResource(R.string.email_platform_id),
                                leadingIcon = Icons.Default.Badge
                            )

                            AuthOutlinedTextField(
                                value = password,
                                onValueChange = { password = it },
                                label = stringResource(R.string.password),
                                leadingIcon = Icons.Default.Lock,
                                isPassword = true,
                                passwordVisible = passwordVisible,
                                onVisibilityToggle = { passwordVisible = !passwordVisible }
                            )

                            if (signupMode) {
                                AuthOutlinedTextField(
                                    value = confirmPassword,
                                    onValueChange = { confirmPassword = it },
                                    label = stringResource(R.string.confirm_password),
                                    leadingIcon = Icons.Default.Shield,
                                    isPassword = true,
                                    passwordVisible = confirmPasswordVisible,
                                    onVisibilityToggle = { confirmPasswordVisible = !confirmPasswordVisible }
                                )
                            }

                            AuthPrimaryButton(
                                text = if (signupMode) stringResource(R.string.sign_up) else stringResource(R.string.login),
                                onClick = {
                                    if (identifier.isBlank() || password.isBlank()) {
                                        message = "Please enter your ID and password."
                                        return@AuthPrimaryButton
                                    }
                                    isLoading = true
                                    message = null
                                    scope.launch {
                                        try {
                                            if (signupMode) {
                                                val account = onSignup(UserAccount(name.trim(), identifier.trim().lowercase(), password, selectedRole))
                                                onSignupSuccess(account)
                                            } else {
                                                val account = onLogin(identifier.trim().lowercase(), password, selectedRole)
                                                if (account.role == UserRole.STUDENT) onStudentLogin(account) else onTeacherLogin(account)
                                            }
                                        } catch (e: Exception) {
                                            message = e.message ?: "Login failed. Please check your credentials."
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                loading = isLoading,
                                leadingIcon = if (signupMode) Icons.Default.PersonAdd else Icons.AutoMirrored.Filled.Login
                            )

                            TextButton(onClick = { isSignupMode = !isSignupMode; message = null }) {
                                Text(
                                    text = if (signupMode) stringResource(R.string.already_have_account) else stringResource(R.string.dont_have_account),
                                    color = AuthBrandBright,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
                                )
                            }

                            TextButton(onClick = { showServerSettings = !showServerSettings }) {
                                Text(
                                    text = stringResource(R.string.server_settings),
                                    color = AuthTextSecondary,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp
                                )
                            }

                            AnimatedVisibility(visible = showServerSettings) {
                                ServerSettingsPanel(
                                    activeServerUrl = serverUrl,
                                    serverInput = serverInput,
                                    isTesting = isTestingServer,
                                    onServerInputChange = { serverInput = it },
                                    onSave = {
                                        if (serverInput.isBlank()) {
                                            message = "Enter your Render backend URL."
                                        } else {
                                            isTestingServer = true
                                            message = null
                                            scope.launch {
                                                onTestServerConnection(serverInput)
                                                    .onSuccess { resolved ->
                                                        onServerUrlSave(resolved)
                                                        serverInput = resolved
                                                        message = "Connected to $resolved"
                                                    }
                                                    .onFailure { error ->
                                                        message = error.message ?: "Could not connect to this backend."
                                                    }
                                                isTestingServer = false
                                            }
                                        }
                                    }
                                )
                            }

                            if (signupMode) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 4.dp),
                                    color = AuthBorder.copy(alpha = 0.16f)
                                )
                                RegistrationTrustIndicators()
                            }
                        }
                    }
                }

                // Message Display
                (externalMessage ?: message)?.let {
                    PremiumCard(elevated = false) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val isError = it.contains("failed", true) || it.contains("error", true)
                            Icon(
                                if (isError) Icons.Default.Error else Icons.Default.CheckCircle,
                                null,
                                tint = if (isError) CheatLockDanger else CheatLockSuccess,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = it.uppercase(),
                                color = if (isError) CheatLockDanger else CheatLockSuccess,
                                style = MaterialTheme.typography.labelSmall,
                                textAlign = TextAlign.Start,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LoginDecorativeNebula() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AuthBackground)
    )
}

@Composable
private fun ServerSettingsPanel(
    activeServerUrl: String,
    serverInput: String,
    isTesting: Boolean,
    onServerInputChange: (String) -> Unit,
    onSave: () -> Unit
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val panelBg = if (isLight) CheatLockLightSurfaceSubtle else AuthSurface.copy(alpha = 0.42f)
    val panelBorder = if (isLight) CheatLockLightBorder else AuthBorder.copy(alpha = 0.18f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(panelBg)
            .border(1.dp, panelBorder, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "Active server: $activeServerUrl",
            color = if (isLight) CheatLockLightTextSecondary else AuthTextMuted,
            style = MaterialTheme.typography.labelSmall,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth()
        )
        AuthOutlinedTextField(
            value = serverInput,
            onValueChange = onServerInputChange,
            label = "Render backend URL",
            leadingIcon = Icons.Default.Cloud
        )
        AuthPrimaryButton(
            text = "TEST AND SAVE SERVER",
            onClick = onSave,
            loading = isTesting,
            leadingIcon = Icons.Default.Sync,
            modifier = Modifier.height(52.dp)
        )
    }
}

@Composable
private fun AuthPanel(content: @Composable BoxScope.() -> Unit) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val panelBg = if (isLight) {
        Brush.verticalGradient(listOf(Color.White, Color.White))
    } else {
        Brush.verticalGradient(
            listOf(
                AuthSurface.copy(alpha = 0.74f),
                Color(0xFF050F1D).copy(alpha = 0.86f)
            )
        )
    }
    val panelBorder = if (isLight) CheatLockLightBorder else AuthBorder.copy(alpha = 0.30f)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(panelBg)
            .border(1.dp, panelBorder, RoundedCornerShape(22.dp))
            .padding(20.dp),
        content = content
    )
}

@Composable
private fun AuthOutlinedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onVisibilityToggle: (() -> Unit)? = null
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val iconColor = if (isLight) CheatLockLightPrimary else AuthBrandBright

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        leadingIcon = leadingIcon?.let { icon ->
            { Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(22.dp)) }
        },
        trailingIcon = {
            if (isPassword && onVisibilityToggle != null) {
                IconButton(onClick = onVisibilityToggle) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (passwordVisible) "Hide password" else "Show password",
                        tint = if (isLight) CheatLockLightTextSecondary else AuthTextSecondary
                    )
                }
            }
        },
        visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = if (isLight) CheatLockLightTextPrimary else AuthTextPrimary,
            unfocusedTextColor = if (isLight) CheatLockLightTextPrimary else AuthTextPrimary,
            focusedContainerColor = if (isLight) Color.White else AuthSurface.copy(alpha = 0.56f),
            unfocusedContainerColor = if (isLight) Color.White else AuthSurface.copy(alpha = 0.48f),
            focusedBorderColor = if (isLight) CheatLockLightPrimary else AuthBrand.copy(alpha = 0.80f),
            unfocusedBorderColor = if (isLight) CheatLockLightBorder else AuthBorder.copy(alpha = 0.28f),
            focusedLabelColor = if (isLight) CheatLockLightPrimary else AuthBrandBright,
            unfocusedLabelColor = if (isLight) CheatLockLightTextSecondary else AuthTextSecondary,
            cursorColor = if (isLight) CheatLockLightPrimary else AuthBrandCyan
        ),
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
    )
}

@Composable
private fun AuthPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val buttonGradient = if (isLight) {
        Brush.horizontalGradient(listOf(CheatLockLightPrimary, CheatLockLightPrimaryDark))
    } else {
        Brush.horizontalGradient(
            listOf(
                Color(0xFF075BFF),
                AuthBrand,
                AuthBrandCyan
            )
        )
    }
    val borderColor = if (isLight) CheatLockLightPrimary.copy(alpha = 0.3f) else AuthBrandCyan.copy(alpha = 0.55f)

    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier
            .fillMaxWidth()
            .height(58.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
        contentPadding = PaddingValues(0.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(14.dp))
                .background(buttonGradient)
                .border(1.dp, borderColor, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (loading) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    if (leadingIcon != null) {
                        Icon(leadingIcon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                        Spacer(modifier = Modifier.width(10.dp))
                    }
                    Text(
                        text = text,
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.6.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun RegistrationTrustIndicators() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        RegistrationTrustItem("Secure", "Your data is encrypted\nand protected", Icons.Default.EnhancedEncryption, Modifier.weight(1f))
        RegistrationTrustItem("Monitor", "AI-powered monitoring\nand proctoring", Icons.Default.Adjust, Modifier.weight(1f))
        RegistrationTrustItem("Trust", "Ensuring fairness and\nacademic integrity", Icons.Default.VerifiedUser, Modifier.weight(1f))
    }
}

@Composable
private fun RegistrationTrustItem(
    title: String,
    subtitle: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val iconBg = if (isLight) CheatLockLightPrimaryContainer else AuthBrand.copy(alpha = 0.12f)
    val iconBorder = if (isLight) CheatLockLightPrimary.copy(alpha = 0.25f) else AuthBrand.copy(alpha = 0.30f)
    val iconTint = if (isLight) CheatLockLightPrimary else AuthBrandBright

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(iconBg)
                .border(1.dp, iconBorder, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(26.dp))
        }
        Text(title, color = if (isLight) CheatLockLightTextPrimary else AuthTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.Center)
        Text(subtitle, color = if (isLight) CheatLockLightTextSecondary else AuthTextSecondary, fontSize = 10.sp, lineHeight = 15.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun LoginAdvancedRoleToggle(
    selectedRole: UserRole,
    allowTeacher: Boolean,
    onRoleSelected: (UserRole) -> Unit
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val studentSelected = selectedRole == UserRole.STUDENT
    val containerBg = if (isLight) CheatLockLightSurfaceSubtle else AuthSurface.copy(alpha = 0.56f)
    val containerBorder = if (isLight) CheatLockLightBorder else AuthBorder.copy(alpha = 0.22f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(containerBg)
            .border(1.dp, containerBorder, RoundedCornerShape(14.dp))
            .padding(4.dp)
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(11.dp))
                .background(
                    if (studentSelected) {
                        if (isLight) Brush.horizontalGradient(listOf(CheatLockLightPrimary, CheatLockLightPrimary))
                        else Brush.horizontalGradient(listOf(Color(0xFF075BFF), AuthBrand))
                    } else {
                        Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))
                    }
                )
                .border(
                    1.dp,
                    if (studentSelected) {
                        if (isLight) Color.Transparent else AuthBrandCyan.copy(alpha = 0.34f)
                    } else Color.Transparent,
                    RoundedCornerShape(11.dp)
                )
                .clickable { onRoleSelected(UserRole.STUDENT) },
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(
                    Icons.Default.School,
                    contentDescription = null,
                    tint = if (studentSelected) Color.White else (if (isLight) CheatLockLightTextSecondary else AuthTextSecondary),
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "STUDENT",
                    color = if (studentSelected) Color.White else (if (isLight) CheatLockLightTextSecondary else AuthTextSecondary),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 12.sp,
                    letterSpacing = 0.8.sp
                )
            }
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(11.dp))
                .background(
                    if (!studentSelected) {
                        if (isLight) Brush.horizontalGradient(listOf(CheatLockLightPrimary, CheatLockLightPrimary))
                        else Brush.horizontalGradient(listOf(Color(0xFF075BFF), AuthBrand))
                    } else {
                        Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))
                    }
                )
                .border(
                    1.dp,
                    if (!studentSelected) {
                        if (isLight) Color.Transparent else AuthBrandCyan.copy(alpha = 0.34f)
                    } else Color.Transparent,
                    RoundedCornerShape(11.dp)
                )
                .clickable(enabled = allowTeacher) { onRoleSelected(UserRole.TEACHER) },
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(
                    Icons.Default.PersonOutline,
                    contentDescription = null,
                    tint = if (!studentSelected && allowTeacher) Color.White else (if (isLight) CheatLockLightTextSecondary else AuthTextSecondary),
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "TEACHER",
                    color = if (!studentSelected && allowTeacher) Color.White else (if (isLight) CheatLockLightTextSecondary else AuthTextSecondary),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 12.sp,
                    letterSpacing = 0.8.sp
                )
            }
        }
    }
}
