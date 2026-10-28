package com.jubayer.cheatlock.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Locale

private val ProfileBgSecondary: Color
    @Composable get() = if (MaterialTheme.colorScheme.background == CheatLockLightBackground) Color(0xFFF1F5F9) else Color(0xFF07101F)
private val ProfileSurface: Color
    @Composable get() = MaterialTheme.colorScheme.surface
private val ProfileSurfaceRaised: Color
    @Composable get() = if (MaterialTheme.colorScheme.background == CheatLockLightBackground) Color(0xFFFFFFFF) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
private val ProfileBlue: Color
    @Composable get() = MaterialTheme.colorScheme.primary
private val ProfileBlueBright: Color
    @Composable get() = if (MaterialTheme.colorScheme.background == CheatLockLightBackground) Color(0xFF1D4ED8) else Color(0xFF169BFF)
private val ProfileTextPrimary: Color
    @Composable get() = MaterialTheme.colorScheme.onSurface
private val ProfileTextSecondary: Color
    @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
private val ProfileTextMuted: Color
    @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f)
private val ProfileBorder: Color
    @Composable get() = MaterialTheme.colorScheme.outline

/**
 * World-Class Academic Identity & Command Center Profile Screen
 */
@Composable
fun ProfileManagementScreen(
    account: UserAccount,
    onUpdateProfile: suspend (String, String) -> Unit,
    onHasFaceProfile: suspend () -> Boolean,
    onDeleteAccount: suspend (String) -> Unit = {},
    onOpenAccountDeletionPage: () -> Unit = {},
    submissions: List<ExamSubmission> = emptyList(),
    appLanguage: AppLanguage = AppLanguage.English,
    onLanguageChange: (AppLanguage) -> Unit = {},
    appThemeMode: AppThemeMode = AppThemeMode.System,
    onThemeModeChange: (AppThemeMode) -> Unit = {},
    onOpenBiometricCalibration: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val isBn = appLanguage == AppLanguage.Bengali
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val profileUpdatedMessage = stringResource(R.string.profile_successfully_updated)

    var name by remember(account) { mutableStateOf(account.name) }
    var identifier by remember(account) { mutableStateOf(account.identifier) }
    var isEditing by remember { mutableStateOf(false) }
    var hasFaceProfile by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var deletionPassword by remember { mutableStateOf("") }
    var isDeleting by remember { mutableStateOf(false) }

    LaunchedEffect(account) {
        runCatching { onHasFaceProfile() }
            .onSuccess { hasFaceProfile = it }
            .onFailure { hasFaceProfile = false }
    }

    // Calculated Performance Metrics
    val totalAssessments = submissions.size
    val gradedSubmissions = remember(submissions) { submissions.filter { it.grade != null } }
    val averageScore = remember(gradedSubmissions) {
        if (gradedSubmissions.isNotEmpty()) {
            gradedSubmissions.mapNotNull { it.grade }.average()
        } else null
    }
    val cleanSubmissionsCount = remember(submissions) { submissions.count { it.totalWarnings == 0 } }
    val integrityPercentage = remember(submissions) {
        if (submissions.isNotEmpty()) {
            (cleanSubmissionsCount.toDouble() / submissions.size * 100).toInt()
        } else 100
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // ==========================================
        // 1. IDENTITY & VERIFICATION HERO CARD
        // ==========================================
        ProfileIdentityHeroCard(
            name = name,
            identifier = identifier,
            role = account.role,
            isBn = isBn,
            isLight = isLight,
            isEditing = isEditing,
            onToggleEdit = { isEditing = !isEditing }
        )

        // ==========================================
        // 2. INLINE EDIT FORM (When editing)
        // ==========================================
        AnimatedVisibility(
            visible = isEditing,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            ProfileCard {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    ProfileSectionHeader(
                        title = stringResource(R.string.edit_identity),
                        subtitle = stringResource(R.string.edit_identity_supporting)
                    )

                    ProfileTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = stringResource(R.string.full_name),
                        leadingIcon = Icons.Default.Person
                    )
                    ProfileTextField(
                        value = identifier,
                        onValueChange = { identifier = it },
                        label = stringResource(R.string.email_platform_id),
                        leadingIcon = Icons.Default.Badge
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                name = account.name
                                identifier = account.identifier
                                isEditing = false
                            },
                            modifier = Modifier.weight(1f).height(50.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(stringResource(R.string.cancel), fontWeight = FontWeight.SemiBold)
                        }

                        Button(
                            onClick = {
                                if (name.isBlank() || identifier.isBlank()) return@Button
                                isLoading = true
                                scope.launch {
                                    runCatching { onUpdateProfile(name, identifier) }
                                        .onSuccess {
                                            isEditing = false
                                            message = profileUpdatedMessage
                                        }
                                        .onFailure { message = it.message }
                                    isLoading = false
                                }
                            },
                            enabled = !isLoading,
                            modifier = Modifier.weight(1.5f).height(50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = if (isLight) Color(0xFF087CFF) else Color(0xFF2563EB))
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(stringResource(R.string.save_changes), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // 3. ACADEMIC & INTEGRITY STATS (3-Pillar Grid)
        // ==========================================
        ProfileStatsGrid(
            totalAssessments = totalAssessments,
            averageScore = averageScore,
            integrityPercentage = integrityPercentage,
            isBn = isBn,
            isLight = isLight
        )

        // ==========================================
        // 4. BIOMETRIC & PROCTORING READINESS
        // ==========================================
        ProfileBiometricCard(
            hasFaceProfile = hasFaceProfile,
            isBn = isBn,
            isLight = isLight,
            onCalibrate = onOpenBiometricCalibration
        )

        // ==========================================
        // 5. APP ENVIRONMENT & THEME / LANGUAGE
        // ==========================================
        ProfilePreferencesCard(
            appLanguage = appLanguage,
            onLanguageChange = onLanguageChange,
            appThemeMode = appThemeMode,
            onThemeModeChange = onThemeModeChange,
            isBn = isBn,
            isLight = isLight
        )

        // ==========================================
        // 6. ACADEMIC HONOR CODE & GUIDELINES
        // ==========================================
        ProfileHonorCodeCard(isBn = isBn, isLight = isLight)

        // ==========================================
        // 7. DANGER ZONE (Account Deletion)
        // ==========================================
        if (account.role == UserRole.STUDENT) {
            ProfileDangerZoneCard(
                isBn = isBn,
                isLight = isLight,
                onDeleteClick = { showDeleteConfirmation = true },
                onHelpClick = onOpenAccountDeletionPage
            )
        }

        message?.let {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF087CFF).copy(alpha = 0.12f))
                    .border(1.dp, Color(0xFF087CFF).copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                    .padding(12.dp)
            ) {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isLight) Color(0xFF087CFF) else Color(0xFF38BDF8),
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { if (!isDeleting) showDeleteConfirmation = false },
            containerColor = if (isLight) Color.White else Color(0xFF07111F),
            titleContentColor = CheatLockDanger,
            textContentColor = if (isLight) Color(0xFF475569) else Color(0xFF94A3B8),
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = CheatLockDanger, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.delete_account_title), fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.delete_account_confirm_body))
                    OutlinedTextField(
                        value = deletionPassword,
                        onValueChange = { deletionPassword = it },
                        label = { Text(stringResource(R.string.current_password)) },
                        leadingIcon = { Icon(Icons.Default.Lock, null, tint = CheatLockDanger) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = deletionPassword.isNotBlank() && !isDeleting,
                    onClick = {
                        isDeleting = true
                        message = null
                        scope.launch {
                            runCatching { onDeleteAccount(deletionPassword) }
                                .onFailure { message = it.message ?: "Account deletion failed." }
                            isDeleting = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CheatLockDanger)
                ) {
                    Text(if (isDeleting) stringResource(R.string.deleting) else stringResource(R.string.delete_permanently))
                }
            },
            dismissButton = {
                OutlinedButton(
                    enabled = !isDeleting,
                    onClick = { showDeleteConfirmation = false; deletionPassword = "" }
                ) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
}

// =========================================================================
// SUB-COMPONENTS
// =========================================================================

@Composable
private fun ProfileIdentityHeroCard(
    name: String,
    identifier: String,
    role: UserRole,
    isBn: Boolean,
    isLight: Boolean,
    isEditing: Boolean,
    onToggleEdit: () -> Unit
) {
    val heroGradient = if (isLight) {
        Brush.linearGradient(listOf(Color(0xFFEFF6FF), Color(0xFFDBEAFE), Color(0xFFEFF6FF)))
    } else {
        Brush.linearGradient(listOf(Color(0xFF041838), Color(0xFF082654), Color(0xFF0A1E3D)))
    }
    val borderColor = if (isLight) Color(0xFFBFDBFE) else Color(0xFF087CFF).copy(alpha = 0.35f)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.5.dp, borderColor),
        shadowElevation = if (isLight) 3.dp else 6.dp,
        tonalElevation = if (isLight) 2.dp else 4.dp,
        color = Color.Transparent
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(heroGradient)
                .padding(20.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Concentric Glowing Avatar
                Box(contentAlignment = Alignment.Center) {
                    // Outer Ring
                    Box(
                        modifier = Modifier
                            .size(108.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.sweepGradient(
                                    listOf(
                                        Color(0xFF076CFF),
                                        Color(0xFF00E5FF),
                                        Color(0xFF10B981),
                                        Color(0xFF076CFF)
                                    )
                                )
                            )
                            .padding(3.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        // Inner Avatar
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(CircleShape)
                                .background(if (isLight) Color(0xFF087CFF) else Color(0xFF0B192C)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = name.take(1).ifBlank { "S" }.uppercase(),
                                style = MaterialTheme.typography.displaySmall,
                                color = Color.White,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }

                    // Edit Trigger
                    IconButton(
                        onClick = onToggleEdit,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(if (isLight) Color.White else Color(0xFF0F172A))
                            .border(1.5.dp, Color(0xFF087CFF), CircleShape)
                    ) {
                        Icon(
                            imageVector = if (isEditing) Icons.Default.Close else Icons.Default.Edit,
                            contentDescription = "Edit Profile",
                            tint = Color(0xFF087CFF),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                // Name & Identifier
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = name.ifBlank { "CheatLock Candidate" },
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Black,
                        color = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC)
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = identifier,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isLight) Color(0xFF475569) else Color(0xFF94A3B8)
                    )
                }

                // Verified Student Badge & Status
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Verified Badge
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (isLight) Color(0xFFDCFCE7) else Color(0xFF064E3B).copy(alpha = 0.6f))
                            .border(1.dp, if (isLight) Color(0xFF86EFAC) else Color(0xFF10B981).copy(alpha = 0.5f), CircleShape)
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Default.Verified, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(14.dp))
                            Text(
                                text = stringResource(R.string.verified_candidate),
                                color = if (isLight) Color(0xFF166534) else Color(0xFF34D399),
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp
                            )
                        }
                    }

                    // Role Chip
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (isLight) Color(0xFFEFF6FF) else Color(0xFF0F2444))
                            .border(1.dp, if (isLight) Color(0xFFBFDBFE) else Color(0xFF1E40AF), CircleShape)
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = role.name,
                            color = if (isLight) Color(0xFF1E40AF) else Color(0xFF60A5FA),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileStatsGrid(
    totalAssessments: Int,
    averageScore: Double?,
    integrityPercentage: Int,
    isBn: Boolean,
    isLight: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Assessments Card
        ProfileStatCard(
            label = stringResource(R.string.assessments),
            value = totalAssessments.toString(),
            subtext = stringResource(R.string.total_taken),
            icon = Icons.Default.Quiz,
            iconColor = Color(0xFF087CFF),
            modifier = Modifier.weight(1f),
            isLight = isLight
        )

        // Average Mastery Card
        val scoreStr = if (averageScore != null) String.format(Locale.US, "%.1f%%", averageScore) else "-"
        ProfileStatCard(
            label = stringResource(R.string.mastery),
            value = scoreStr,
            subtext = stringResource(R.string.avg_grade),
            icon = Icons.Default.AutoGraph,
            iconColor = Color(0xFF0284C7),
            modifier = Modifier.weight(1f),
            isLight = isLight
        )

        // Integrity Rating Card
        ProfileStatCard(
            label = stringResource(R.string.integrity),
            value = "$integrityPercentage%",
            subtext = stringResource(R.string.clean_proctored),
            icon = Icons.Default.Shield,
            iconColor = Color(0xFF10B981),
            modifier = Modifier.weight(1f),
            isLight = isLight
        )
    }
}

@Composable
private fun ProfileStatCard(
    label: String,
    value: String,
    subtext: String,
    icon: ImageVector,
    iconColor: Color,
    isLight: Boolean,
    modifier: Modifier = Modifier
) {
    val cardBg = if (isLight) Color.White else Color(0xFF09172A)
    val cardBorder = if (isLight) Color(0xFFE2E8F0) else Color(0xFF1E293B)

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, cardBorder),
        color = cardBg,
        shadowElevation = if (isLight) 2.dp else 4.dp
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = if (isLight) 0.12f else 0.20f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(16.dp))
            }

            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Black,
                color = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC)
            )

            Column {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isLight) Color(0xFF1E293B) else Color(0xFFE2E8F0)
                )
                Text(
                    text = subtext,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    color = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8)
                )
            }
        }
    }
}

@Composable
private fun ProfileBiometricCard(
    hasFaceProfile: Boolean,
    isBn: Boolean,
    isLight: Boolean,
    onCalibrate: () -> Unit
) {
    ProfileCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            ProfileSectionHeader(
                title = stringResource(R.string.biometric_readiness_title),
                subtitle = stringResource(R.string.biometric_readiness_supporting)
            )

            // Status Banner
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (hasFaceProfile) (if (isLight) Color(0xFFDCFCE7) else Color(0xFF064E3B).copy(alpha = 0.4f)) else (if (isLight) Color(0xFFFEF3C7) else Color(0xFF78350F).copy(alpha = 0.4f)))
                    .border(1.dp, if (hasFaceProfile) (if (isLight) Color(0xFF86EFAC) else Color(0xFF10B981).copy(alpha = 0.4f)) else (if (isLight) Color(0xFFFDE68A) else Color(0xFFF59E0B).copy(alpha = 0.4f)), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(
                        imageVector = if (hasFaceProfile) Icons.Default.CheckCircle else Icons.Default.Warning,
                        contentDescription = null,
                        tint = if (hasFaceProfile) Color(0xFF10B981) else Color(0xFFF59E0B),
                        modifier = Modifier.size(24.dp)
                    )
                    Column {
                        Text(
                            text = if (hasFaceProfile) stringResource(R.string.face_id_profile_active) else stringResource(R.string.biometric_enrollment_needed),
                            fontWeight = FontWeight.Bold,
                            color = if (hasFaceProfile) (if (isLight) Color(0xFF166534) else Color(0xFF34D399)) else (if (isLight) Color(0xFF92400E) else Color(0xFFFCD34D)),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = if (hasFaceProfile) stringResource(R.string.ready_secure_exam_entry) else stringResource(R.string.register_face_descriptor),
                            color = if (hasFaceProfile) (if (isLight) Color(0xFF166534).copy(alpha = 0.8f) else Color(0xFF34D399).copy(alpha = 0.8f)) else (if (isLight) Color(0xFF92400E).copy(alpha = 0.8f) else Color(0xFFFCD34D).copy(alpha = 0.8f)),
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp)
                        )
                    }
                }
            }

            // Diagnostics Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DiagnosticPill(label = stringResource(R.string.camera_sensor), status = stringResource(R.string.active), isLight = isLight, modifier = Modifier.weight(1f))
                DiagnosticPill(label = stringResource(R.string.mic_monitor), status = stringResource(R.string.active), isLight = isLight, modifier = Modifier.weight(1f))
                DiagnosticPill(label = stringResource(R.string.kiosk_lock), status = stringResource(R.string.secured), isLight = isLight, modifier = Modifier.weight(1f))
            }

            // Calibration Button
            OutlinedButton(
                onClick = onCalibrate,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF087CFF).copy(alpha = 0.5f))
            ) {
                Icon(Icons.Default.CameraAlt, contentDescription = null, tint = Color(0xFF087CFF), modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.recalibrate_biometric_face_id),
                    color = Color(0xFF087CFF),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun DiagnosticPill(
    label: String,
    status: String,
    isLight: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (isLight) Color(0xFFF1F5F9) else Color(0xFF0C192C))
            .border(1.dp, if (isLight) Color(0xFFE2E8F0) else Color(0xFF1E293B), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.bodySmall.copy(fontSize = 9.5.sp), color = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8))
            Text("$status", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
        }
    }
}

@Composable
private fun ProfilePreferencesCard(
    appLanguage: AppLanguage,
    onLanguageChange: (AppLanguage) -> Unit,
    appThemeMode: AppThemeMode,
    onThemeModeChange: (AppThemeMode) -> Unit,
    isBn: Boolean,
    isLight: Boolean
) {
    ProfileCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            ProfileSectionHeader(
                title = stringResource(R.string.appearance_and_language),
                subtitle = stringResource(R.string.appearance_supporting)
            )

            // Language Selector
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(R.string.display_language),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isLight) Color(0xFF1E293B) else Color(0xFFF8FAFC)
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isLight) Color(0xFFF1F5F9) else Color(0xFF0A1628))
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    SegmentedButton(
                        selected = appLanguage == AppLanguage.English,
                        text = stringResource(R.string.english),
                        onClick = { onLanguageChange(AppLanguage.English) },
                        isLight = isLight,
                        modifier = Modifier.weight(1f)
                    )
                    SegmentedButton(
                        selected = appLanguage == AppLanguage.Bengali,
                        text = stringResource(R.string.bengali),
                        onClick = { onLanguageChange(AppLanguage.Bengali) },
                        isLight = isLight,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // Theme Mode Selector
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(R.string.visual_theme),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isLight) Color(0xFF1E293B) else Color(0xFFF8FAFC)
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isLight) Color(0xFFF1F5F9) else Color(0xFF0A1628))
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    SegmentedButton(
                        selected = appThemeMode == AppThemeMode.Light,
                        text = stringResource(R.string.theme_light),
                        onClick = { onThemeModeChange(AppThemeMode.Light) },
                        isLight = isLight,
                        modifier = Modifier.weight(1f)
                    )
                    SegmentedButton(
                        selected = appThemeMode == AppThemeMode.Dark,
                        text = stringResource(R.string.theme_dark),
                        onClick = { onThemeModeChange(AppThemeMode.Dark) },
                        isLight = isLight,
                        modifier = Modifier.weight(1f)
                    )
                    SegmentedButton(
                        selected = appThemeMode == AppThemeMode.System,
                        text = stringResource(R.string.theme_system),
                        onClick = { onThemeModeChange(AppThemeMode.System) },
                        isLight = isLight,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun SegmentedButton(
    selected: Boolean,
    text: String,
    onClick: () -> Unit,
    isLight: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(9.dp))
            .background(if (selected) (if (isLight) Color.White else Color(0xFF087CFF)) else Color.Transparent)
            .border(
                width = if (selected) 1.dp else 0.dp,
                color = if (selected) (if (isLight) Color(0xFFCBD5E1) else Color(0xFF38BDF8)) else Color.Transparent,
                shape = RoundedCornerShape(9.dp)
            )
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Black else FontWeight.Medium,
            color = if (selected) (if (isLight) Color(0xFF087CFF) else Color.White) else (if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8))
        )
    }
}

@Composable
private fun ProfileHonorCodeCard(isBn: Boolean, isLight: Boolean) {
    ProfileCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF087CFF).copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Gavel, contentDescription = null, tint = Color(0xFF087CFF), modifier = Modifier.size(18.dp))
                }
                Column {
                    Text(
                        text = stringResource(R.string.honor_code_title),
                        fontWeight = FontWeight.Bold,
                        color = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC)
                    )
                    Text(
                        text = stringResource(R.string.honor_code_supporting),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8)
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileDangerZoneCard(
    isBn: Boolean,
    isLight: Boolean,
    onDeleteClick: () -> Unit,
    onHelpClick: () -> Unit
) {
    ProfileCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileSectionHeader(
                title = stringResource(R.string.account_data_management),
                subtitle = stringResource(R.string.account_data_management_supporting)
            )

            OutlinedButton(
                onClick = onDeleteClick,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, CheatLockDanger.copy(alpha = 0.65f)),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = CheatLockDanger.copy(alpha = 0.04f))
            ) {
                Icon(Icons.Default.DeleteForever, null, tint = CheatLockDanger, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.permanently_delete_account),
                    color = CheatLockDanger,
                    fontWeight = FontWeight.Bold
                )
            }

            TextButton(
                onClick = onHelpClick,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = stringResource(R.string.account_deletion_policy_helpdesk),
                    color = if (isLight) Color(0xFF087CFF) else Color(0xFF38BDF8),
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
private fun ProfileCard(content: @Composable () -> Unit) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    val cardBg = if (isLight) Color.White else Color(0xFF09172A)
    val cardBorder = if (isLight) Color(0xFFE2E8F0) else Color(0xFF1E293B)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, cardBorder),
        color = cardBg,
        shadowElevation = if (isLight) 2.dp else 4.dp
    ) {
        Box(modifier = Modifier.padding(18.dp)) {
            content()
        }
    }
}

@Composable
private fun ProfileSectionHeader(title: String, subtitle: String) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = title,
            color = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Black
        )
        if (subtitle.isNotBlank()) {
            Text(
                text = subtitle,
                color = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun ProfileTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leadingIcon: ImageVector
) {
    val isLight = MaterialTheme.colorScheme.background == CheatLockLightBackground

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        label = { Text(label) },
        leadingIcon = { Icon(leadingIcon, null, tint = Color(0xFF087CFF)) },
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Color(0xFF087CFF),
            unfocusedBorderColor = if (isLight) Color(0xFFCBD5E1) else Color(0xFF334155),
            focusedContainerColor = if (isLight) Color(0xFFF8FAFC) else Color(0xFF0A1628),
            unfocusedContainerColor = if (isLight) Color.White else Color(0xFF07101F),
            cursorColor = Color(0xFF087CFF),
            focusedTextColor = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC),
            unfocusedTextColor = if (isLight) Color(0xFF0F172A) else Color(0xFFF8FAFC),
            focusedLabelColor = Color(0xFF087CFF),
            unfocusedLabelColor = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8)
        )
    )
}
