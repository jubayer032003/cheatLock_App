package com.jubayer.cheatlock.ui

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
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.ui.theme.*
import com.jubayer.cheatlock.util.IdentifierNormalizer
import kotlinx.coroutines.launch

private val AuthBackground = Color(0xFF050A14)
private val AuthBackgroundSecondary = Color(0xFF07101F)
private val AuthSurface = Color(0xFF09172A)
private val AuthBrand = Color(0xFF087CFF)
private val AuthBrandBright = Color(0xFF169BFF)
private val AuthBrandCyan = Color(0xFF16B8FF)
private val AuthTextPrimary = Color(0xFFF5F8FF)
private val AuthTextSecondary = Color(0xFFA7B3C7)
private val AuthTextMuted = Color(0xFF718096)
private val AuthBorder = Color(0xFF5078AA)

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
    externalMessage: String? = null
) {
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
                // Premium Animated Header
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                        horizontalArrangement = Arrangement.Start
                    ) {
                        IconButton(
                            onClick = onBackToHome,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(AuthSurface.copy(alpha = 0.66f))
                                .border(1.dp, AuthBorder.copy(alpha = 0.28f), CircleShape)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = AuthTextPrimary, modifier = Modifier.size(21.dp))
                        }
                    }
                    
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(130.dp)) {
                        val transition = rememberInfiniteTransition(label = "auth-brand-rings")
                        val pulse by transition.animateFloat(
                            initialValue = 1f, targetValue = 1.1f,
                            animationSpec = infiniteRepeatable(tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                            label = "pulse"
                        )
                        
                        Canvas(modifier = Modifier.fillMaxSize().scale(pulse)) {
                            drawCircle(
                                color = AuthBrand.copy(alpha = 0.12f),
                                style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 12f), 0f))
                            )
                            drawCircle(
                                color = AuthBrandCyan.copy(alpha = 0.055f),
                                radius = size.minDimension * 0.38f,
                                style = Stroke(width = 1.dp.toPx())
                            )
                            drawArc(
                                color = AuthBrand.copy(alpha = 0.62f),
                                startAngle = 216f, sweepAngle = 82f, useCenter = false,
                                style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                            )
                        }
                        
                        Image(
                            painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg),
                            contentDescription = "CheatLock Emblem",
                            modifier = Modifier.size(104.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Professional Exam Integrity System",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuthTextSecondary,
                        fontWeight = FontWeight.Normal,
                        textAlign = TextAlign.Center
                    )
                }

                // Main Auth Card
                AnimatedContent(
                    targetState = isSignupMode,
                    transitionSpec = {
                        if (targetState) {
                            (slideInHorizontally { it } + fadeIn()).togetherWith(slideOutHorizontally { -it } + fadeOut())
                        } else {
                            (slideInHorizontally { -it } + fadeIn()).togetherWith(slideOutHorizontally { it } + fadeOut())
                        }.using(SizeTransform(clip = false))
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
                                text = if (signupMode) "Create Your Account" else "Welcome Back",
                                style = MaterialTheme.typography.headlineSmall,
                                color = AuthTextPrimary,
                                fontWeight = FontWeight.ExtraBold,
                                textAlign = TextAlign.Center
                            )
                            if (signupMode) {
                                Text(
                                    text = "Join thousands of educators and students trusting CheatLock",
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
                                    label = "Your Full Name",
                                    leadingIcon = Icons.Default.Person
                                )
                            }

                            AuthOutlinedTextField(
                                value = identifier,
                                onValueChange = { identifier = it },
                                label = "Student or Teacher ID",
                                leadingIcon = Icons.Default.Badge
                            )

                            AuthOutlinedTextField(
                                value = password,
                                onValueChange = { password = it },
                                label = "Password",
                                leadingIcon = Icons.Default.Lock,
                                isPassword = true,
                                passwordVisible = passwordVisible,
                                onVisibilityToggle = { passwordVisible = !passwordVisible }
                            )

                            if (signupMode) {
                                AuthOutlinedTextField(
                                    value = confirmPassword,
                                    onValueChange = { confirmPassword = it },
                                    label = "Confirm Password",
                                    leadingIcon = Icons.Default.Shield,
                                    isPassword = true,
                                    passwordVisible = confirmPasswordVisible,
                                    onVisibilityToggle = { confirmPasswordVisible = !confirmPasswordVisible }
                                )
                            }

                            AuthPrimaryButton(
                                text = if (signupMode) "REGISTER NOW" else "SIGN IN",
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
                                    text = if (signupMode) "Already have an account? Login" else "New to CheatLock? Register here",
                                    color = AuthBrandBright,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
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
private fun AuthPanel(content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(
                Brush.verticalGradient(
                    listOf(
                        AuthSurface.copy(alpha = 0.74f),
                        Color(0xFF050F1D).copy(alpha = 0.86f)
                    )
                )
            )
            .border(1.dp, AuthBorder.copy(alpha = 0.30f), RoundedCornerShape(22.dp))
            .padding(18.dp),
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
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        leadingIcon = leadingIcon?.let { icon ->
            { Icon(icon, contentDescription = null, tint = AuthBrandBright, modifier = Modifier.size(24.dp)) }
        },
        trailingIcon = {
            if (isPassword && onVisibilityToggle != null) {
                IconButton(onClick = onVisibilityToggle) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (passwordVisible) "Hide password" else "Show password",
                        tint = AuthTextSecondary
                    )
                }
            }
        },
        visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedTextColor = AuthTextPrimary,
            unfocusedTextColor = AuthTextPrimary,
            focusedContainerColor = AuthSurface.copy(alpha = 0.56f),
            unfocusedContainerColor = AuthSurface.copy(alpha = 0.48f),
            focusedIndicatorColor = AuthBrand.copy(alpha = 0.80f),
            unfocusedIndicatorColor = AuthBorder.copy(alpha = 0.28f),
            focusedLabelColor = AuthTextSecondary,
            unfocusedLabelColor = AuthTextSecondary,
            cursorColor = AuthBrandCyan
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
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color(0xFF075BFF),
                            AuthBrand,
                            AuthBrandCyan
                        )
                    )
                )
                .border(1.dp, AuthBrandCyan.copy(alpha = 0.55f), RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (loading) {
                CircularProgressIndicator(color = AuthTextPrimary, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    if (leadingIcon != null) {
                        Icon(leadingIcon, contentDescription = null, tint = AuthTextPrimary, modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                    }
                    Text(
                        text = text,
                        color = AuthTextPrimary,
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
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(AuthBrand.copy(alpha = 0.12f))
                .border(1.dp, AuthBrand.copy(alpha = 0.30f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = AuthBrandBright, modifier = Modifier.size(26.dp))
        }
        Text(title, color = AuthTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.Center)
        Text(subtitle, color = AuthTextSecondary, fontSize = 10.sp, lineHeight = 15.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun LoginAdvancedRoleToggle(
    selectedRole: UserRole,
    allowTeacher: Boolean,
    onRoleSelected: (UserRole) -> Unit
) {
    val studentSelected = selectedRole == UserRole.STUDENT
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(AuthSurface.copy(alpha = 0.56f))
            .border(1.dp, AuthBorder.copy(alpha = 0.22f), RoundedCornerShape(14.dp))
            .padding(4.dp)
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(11.dp))
                .background(
                    if (studentSelected) {
                        Brush.horizontalGradient(listOf(Color(0xFF075BFF), AuthBrand))
                    } else {
                        Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))
                    }
                )
                .border(
                    1.dp,
                    if (studentSelected) AuthBrandCyan.copy(alpha = 0.34f) else Color.Transparent,
                    RoundedCornerShape(11.dp)
                )
                .clickable { onRoleSelected(UserRole.STUDENT) },
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(Icons.Default.School, contentDescription = null, tint = if (studentSelected) AuthBrandCyan else AuthTextSecondary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    "STUDENT",
                    color = if (studentSelected) AuthTextPrimary else AuthTextSecondary,
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
                        Brush.horizontalGradient(listOf(Color(0xFF075BFF), AuthBrand))
                    } else {
                        Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))
                    }
                )
                .border(
                    1.dp,
                    if (!studentSelected) AuthBrandCyan.copy(alpha = 0.34f) else Color.Transparent,
                    RoundedCornerShape(11.dp)
                )
                .clickable(enabled = allowTeacher) { onRoleSelected(UserRole.TEACHER) },
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(Icons.Default.PersonOutline, contentDescription = null, tint = if (!studentSelected && allowTeacher) AuthBrandCyan else AuthTextSecondary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    "TEACHER",
                    color = if (!studentSelected && allowTeacher) AuthTextPrimary else AuthTextSecondary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 12.sp,
                    letterSpacing = 0.8.sp
                )
            }
        }
    }
}
