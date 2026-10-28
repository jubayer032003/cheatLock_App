package com.jubayer.cheatlock.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.stringResource
import com.jubayer.cheatlock.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.ui.theme.CheatLockDanger
import com.jubayer.cheatlock.ui.theme.CheatLockTextSecondaryDark

@Composable
fun CrashRecoveryScreen(
    supportCode: String,
    onRetry: () -> Unit
) {
    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(CheatLockDanger.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.BugReport,
                    contentDescription = "System Crash Recovery Mode",
                    tint = CheatLockDanger,
                    modifier = Modifier.size(36.dp)
                )
            }

            Text(
                text = stringResource(R.string.exam_recovery_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Black,
                color = Color.White
            )

            Text(
                text = stringResource(R.string.exam_recovery_summary),
                style = MaterialTheme.typography.bodyMedium,
                color = CheatLockTextSecondaryDark,
                lineHeight = 20.sp
            )

            // Diagnostic report card
            PremiumCard(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                elevated = true
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = stringResource(R.string.exam_recovery_help_title),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = CheatLockDanger
                    )

                    HorizontalDivider(color = Color.White.copy(alpha = 0.1f))

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.Black.copy(alpha = 0.4f))
                            .padding(12.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                        ) {
                            Text(
                                text = stringResource(R.string.exam_recovery_help),
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    lineHeight = 15.sp
                                ),
                                color = Color.LightGray
                            )
                        }
                    }
                }
            }

            Text(
                text = stringResource(R.string.exam_recovery_support_code, supportCode),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Retry button
            GradientPrimaryButton(
                text = stringResource(R.string.exam_recovery_reopen),
                onClick = onRetry,
                leadingIcon = Icons.Default.Refresh,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            )
        }
    }
}
