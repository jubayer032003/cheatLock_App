package com.jubayer.cheatlock.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AssignmentTurnedIn
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Divider
import androidx.compose.material3.HorizontalDivider
import com.jubayer.cheatlock.ui.theme.*
import androidx.compose.runtime.getValue
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.util.SuspicionScoreCalculator
import com.jubayer.cheatlock.ui.theme.CheatLockAccent
import com.jubayer.cheatlock.ui.theme.CheatLockGradientEnd
import com.jubayer.cheatlock.ui.theme.CheatLockGradientStart
import com.jubayer.cheatlock.ui.theme.CheatLockSuccess
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ResultScreen(
    studentId: String,
    appSwitchWarnings: Int,
    faceMissingWarnings: Int,
    audioWarnings: Int = 0,
    phoneWarnings: Int = 0,
    authoritativeSuspicionScore: Int? = null,
    grade: Double? = null,
    feedback: String? = null,
    gradedAt: String? = null,
    answers: List<StudentAnswer>,
    onBackToLogin: () -> Unit
) {
    val locallyCalculatedScore = SuspicionScoreCalculator.calculateScore(
        appSwitchWarnings = appSwitchWarnings,
        faceMissingWarnings = faceMissingWarnings,
        audioWarnings = audioWarnings,
        phoneWarnings = phoneWarnings,
    )
    val integrityScore = authoritativeSuspicionScore ?: locallyCalculatedScore
    val riskLevel = SuspicionScoreCalculator.riskLevel(integrityScore)

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 22.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState())
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // 1. Success Hero Section
            ResultHero(riskLevel = riskLevel, grade = grade)

            if (grade != null) {
                // 2. Premium Grade Card
                PremiumCard {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Official Assessment", style = MaterialTheme.typography.titleSmall, color = Color.White.copy(alpha = 0.6f))
                            StatusPill(label = "GRADED", statusColor = CheatLockAccent)
                        }
                        
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = grade.toString(),
                                style = MaterialTheme.typography.displayMedium,
                                color = Color.White,
                                fontWeight = FontWeight.Black
                            )
                            Spacer(Modifier.width(12.dp))
                            Text("/ 100", style = MaterialTheme.typography.titleLarge, color = Color.White.copy(alpha = 0.3f))
                        }

                        if (!feedback.isNullOrBlank()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.White.copy(alpha = 0.05f))
                                    .padding(14.dp)
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("INSTRUCTOR FEEDBACK", style = MaterialTheme.typography.labelSmall, color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold)
                                    Text(feedback, style = MaterialTheme.typography.bodyMedium, color = Color.White)
                                }
                            }
                        }
                    }
                }
            }

            // 3. Integrity Metrics Card
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("Integrity Analysis", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
                        StatusPill(riskLevel, statusColorForRisk(riskLevel))
                    }
                    
                    SuspicionMeter(score = integrityScore)

                    HorizontalDivider(color = Color.White.copy(alpha = 0.05f))

                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            MetricTile(label = "App Switches", value = appSwitchWarnings.toString(), modifier = Modifier.weight(1f), color = statusColorForScore(appSwitchWarnings * 20))
                            MetricTile(label = "Face Alerts", value = faceMissingWarnings.toString(), modifier = Modifier.weight(1f), color = statusColorForScore(faceMissingWarnings * 20))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            MetricTile(label = "Audio Signals", value = audioWarnings.toString(), modifier = Modifier.weight(1f))
                            MetricTile(label = "Mobile Detection", value = phoneWarnings.toString(), modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            // 4. Session Identification
            PremiumCard(elevated = false) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(CheatLockPurpleVibrant.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.VerifiedUser, null, tint = CheatLockPurpleVibrant, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text("Session ID", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
                        Text(studentId, style = MaterialTheme.typography.bodyLarge, color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            GradientPrimaryButton(
                text = "RETURN TO COMMAND",
                onClick = onBackToLogin,
                leadingIcon = Icons.Default.CheckCircle
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ResultHero(riskLevel: String, grade: Double? = null) {
    val infiniteTransition = rememberInfiniteTransition(label = "hero")
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f, targetValue = 0.8f,
        animationSpec = infiniteRepeatable(tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "glow"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.verticalGradient(
                    listOf(CheatLockNavyDeep, CheatLockNavyRich)
                )
            )
            .border(
                1.dp, 
                Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.15f), Color.Transparent)), 
                RoundedCornerShape(24.dp)
            ),
        contentAlignment = Alignment.Center
    ) {

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(86.dp)
                    .clip(CircleShape)
                    .background(CheatLockBrandGradient)
                    .padding(2.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .background(CheatLockNavyDeep)
                        .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (grade != null) Icons.Default.Verified else Icons.Default.TaskAlt,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(40.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(20.dp))
            
            SparklingBrandText(
                text = if (grade != null) "Exam Graded" else "Submitted",
                style = MaterialTheme.typography.headlineSmall
            )
            
            Text(
                text = if (grade != null) "Final results confirmed" else "Security Seal Applied",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White.copy(alpha = 0.6f),
                letterSpacing = 1.sp
            )
        }
    }
}
