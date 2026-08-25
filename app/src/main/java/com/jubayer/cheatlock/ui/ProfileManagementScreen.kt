package com.jubayer.cheatlock.ui

import androidx.compose.animation.*
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Premium Profile Management Screen
 * Modular component for dashboard integration.
 */

@Composable
fun ProfileManagementScreen(
    account: UserAccount,
    onUpdateProfile: suspend (String, String) -> Unit,
    onHasFaceProfile: suspend () -> Boolean,
    onDeleteAccount: suspend (String) -> Unit = {},
    onOpenAccountDeletionPage: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
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

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // 1. Profile Avatar & Identity Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .clip(CircleShape)
                    .background(CheatLockBrandGradient)
                    .border(4.dp, Color.White.copy(alpha = 0.1f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = name.take(1).uppercase(),
                    style = MaterialTheme.typography.displayLarge,
                    color = Color.White,
                    fontWeight = FontWeight.Black
                )
            }
            
            // Edit Toggle
            IconButton(
                onClick = { isEditing = !isEditing },
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset(x = 45.dp, y = 45.dp)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(CheatLockNavyRich)
                    .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
            ) {
                Icon(
                    imageVector = if (isEditing) Icons.Default.Close else Icons.Default.Edit,
                    contentDescription = null,
                    tint = CheatLockPurpleSoft,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        // 2. Account Details Card
        PremiumCard {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SectionHeader(
                    title = "Identity Details",
                    subtitle = "Manage your platform credentials"
                )

                if (isEditing) {
                    PremiumOutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Display Name",
                        leadingIcon = Icons.Default.Badge
                    )
                    PremiumOutlinedTextField(
                        value = identifier,
                        onValueChange = { identifier = it },
                        label = "Official ID / Email",
                        leadingIcon = Icons.Default.Fingerprint
                    )
                    
                    GradientPrimaryButton(
                        text = "SAVE CHANGES",
                        onClick = {
                            if (name.isBlank() || identifier.isBlank()) return@GradientPrimaryButton
                            isLoading = true
                            scope.launch {
                                runCatching { onUpdateProfile(name, identifier) }
                                    .onSuccess { 
                                        isEditing = false
                                        message = "Identity sequence updated."
                                    }
                                    .onFailure { message = it.message }
                                isLoading = false
                            }
                        },
                        loading = isLoading
                    )
                } else {
                    ProfileFieldRow(label = "Full Name", value = name, icon = Icons.Default.Person)
                    ProfileFieldRow(label = "Platform ID", value = identifier, icon = Icons.Default.Badge)
                    ProfileFieldRow(label = "Access Role", value = account.role.name, icon = Icons.Default.VerifiedUser)
                }
            }
        }


        if (account.role == UserRole.STUDENT) PremiumCard {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader(
                    title = "Account",
                    subtitle = "Manage your CheatLock account"
                )
                Text(
                    "Deleting your account permanently removes your profile, face enrollment, exam sessions, submissions, and proctoring evidence associated with this student account.",
                    style = MaterialTheme.typography.bodySmall,
                    color = CheatLockTextSecondaryDark
                )
                OutlinedButton(
                    onClick = { showDeleteConfirmation = true },
                    modifier = Modifier.fillMaxWidth(),
                    border = BorderStroke(1.dp, CheatLockDanger.copy(alpha = 0.6f))
                ) {
                    Icon(Icons.Default.DeleteForever, null, tint = CheatLockDanger)
                    Spacer(Modifier.width(8.dp))
                    Text("Delete Account", color = CheatLockDanger, fontWeight = FontWeight.Bold)
                }
                TextButton(
                    onClick = onOpenAccountDeletionPage,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Account deletion help or web request") }
            }
        }

        // 3. Security & Biometrics Card
        PremiumCard {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SectionHeader(
                    title = "Biometric Security",
                    subtitle = "Advanced identity verification status"
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            "Face Recognition Profile",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            if (hasFaceProfile) "Profile Synchronized" else "Profile Required",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (hasFaceProfile) CheatLockSuccess else CheatLockWarning
                        )
                    }
                    
                    Icon(
                        imageVector = if (hasFaceProfile) Icons.Default.CheckCircle else Icons.Default.Error,
                        contentDescription = null,
                        tint = if (hasFaceProfile) CheatLockSuccess else CheatLockWarning,
                        modifier = Modifier.size(28.dp)
                    )
                }
                
                if (!hasFaceProfile) {
                    Text(
                        "You must enroll your face profile from the main dashboard before joining proctored examinations.",
                        style = MaterialTheme.typography.bodySmall,
                        color = CheatLockTextSecondaryDark
                    )
                }
            }
        }

        message?.let {
            Text(
                it.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = CheatLockPurpleSoft,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }
    }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { if (!isDeleting) showDeleteConfirmation = false },
            title = { Text("Permanently delete account?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("This cannot be undone. Enter your current password to confirm.")
                    PremiumOutlinedTextField(
                        value = deletionPassword,
                        onValueChange = { deletionPassword = it },
                        label = "Current password",
                        leadingIcon = Icons.Default.Lock,
                        isPassword = true
                    )
                    message?.let { Text(it, color = CheatLockDanger) }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = deletionPassword.isNotBlank() && !isDeleting,
                    onClick = {
                        isDeleting = true
                        message = null
                        scope.launch {
                            runCatching { onDeleteAccount(deletionPassword) }
                                .onFailure { message = it.message ?: "Account deletion failed. No local session changes were made." }
                            isDeleting = false
                        }
                    }
                ) { Text(if (isDeleting) "Deleting…" else "Delete permanently", color = CheatLockDanger) }
            },
            dismissButton = {
                TextButton(
                    enabled = !isDeleting,
                    onClick = { showDeleteConfirmation = false; deletionPassword = "" }
                ) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun ProfileFieldRow(
    label: String,
    value: String,
    icon: ImageVector
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.03f))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(CheatLockNavySurface),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = CheatLockPurpleSoft, modifier = Modifier.size(18.dp))
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = CheatLockTextSecondaryDark)
            Text(value, style = MaterialTheme.typography.bodyLarge, color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}
