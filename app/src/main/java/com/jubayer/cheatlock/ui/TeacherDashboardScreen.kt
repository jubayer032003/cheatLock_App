package com.jubayer.cheatlock.ui

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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.model.*
import com.jubayer.cheatlock.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Standard Teacher Dashboard Components
 */

private val DashboardBackground = CheatLockNavyDeep
private val DashboardSurface = CheatLockNavyRich
private val DashboardSurfaceHigh = CheatLockNavySurface
private val DashboardSurfaceSoft = CheatLockNavyRich.copy(alpha = 0.85f)
private val DashboardText = Color.White
private val DashboardMuted = CheatLockTextSecondaryDark
private val DashboardAccent = CheatLockPurpleVibrant
private val DashboardSuccess = CheatLockSuccess
private val DashboardWarning = CheatLockWarning
private val DashboardDanger = CheatLockDanger

enum class TeacherTab(val label: String) {
    Dashboard("Dashboard"),
    Exams("Exams"),
    Attendance("Attendance"),
    Reports("Reports"),
    Settings("Settings"),
    Profile("Profile")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeacherDashboardScreen(
    submissions: List<ExamSubmission>,
    sessions: List<ExamSession>,
    exams: List<Exam>,
    communityStudents: List<String>,
    modifier: Modifier = Modifier
) {
    val dashboard = remember(submissions, sessions, exams, communityStudents) {
        buildTeacherDashboardState(
            submissions = submissions,
            sessions = sessions,
            exams = exams,
            communityStudents = communityStudents
        )
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        TeacherDashboardHero(dashboard = dashboard)

        SectionTitle(
            title = "Command Overview",
            subtitle = "Live metrics from exams, sessions, reports, and your student community."
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            dashboard.stats.take(2).forEach { stat ->
                StatCard(stat = stat, modifier = Modifier.weight(1f))
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            dashboard.stats.drop(2).forEach { stat ->
                StatCard(stat = stat, modifier = Modifier.weight(1f))
            }
        }

        PerformanceChartCard(points = dashboard.performance)
        ExamMonitoringCard(state = dashboard.monitoring)

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionTitle(
                title = "Recent Activity",
                subtitle = "Latest submission, warning, and live exam signals."
            )
            if (dashboard.activities.isEmpty()) {
                EmptyDashboardActivity()
            } else {
                dashboard.activities.forEach { item ->
                    ActivityItemRow(item = item)
                }
            }
        }
    }
}

@Composable
fun TeacherSideBarContent(
    selectedTab: TeacherTab,
    onTabSelected: (TeacherTab) -> Unit,
    onClose: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val items = listOf(
        TeacherTab.Dashboard to Icons.Default.Dashboard,
        TeacherTab.Exams to Icons.Default.Assignment,
        TeacherTab.Attendance to Icons.Default.People,
        TeacherTab.Reports to Icons.Default.Report,
        TeacherTab.Profile to Icons.Default.Person,
        TeacherTab.Settings to Icons.Default.Settings
    )

    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(280.dp)
            .background(DashboardBackground)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                    contentDescription = null,
                    modifier = Modifier.size(36.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    "Instructor",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    fontWeight = FontWeight.Black
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Default.Close, null, tint = DashboardMuted)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        items.forEach { (tab, icon) ->
            val isSelected = selectedTab == tab
            
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (isSelected) DashboardAccent.copy(alpha = 0.15f) else Color.Transparent)
                    .border(
                        width = 1.dp,
                        color = if (isSelected) DashboardAccent.copy(alpha = 0.3f) else Color.Transparent,
                        shape = RoundedCornerShape(12.dp)
                    )
                    .clickable { 
                        onTabSelected(tab)
                        onClose()
                    }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isSelected) DashboardAccent else DashboardMuted,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(Modifier.width(16.dp))
                Text(
                    text = tab.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isSelected) Color.White else DashboardMuted,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                )
            }
        }
        
        Spacer(Modifier.weight(1f))

        // Red Logout Button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(DashboardDanger.copy(alpha = 0.1f))
                .border(
                    width = 1.dp,
                    color = DashboardDanger.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable { 
                    onClose()
                    onLogout()
                }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Logout,
                contentDescription = "Logout",
                tint = DashboardDanger,
                modifier = Modifier.size(22.dp)
            )
            Spacer(Modifier.width(16.dp))
            Text(
                text = "Logout",
                style = MaterialTheme.typography.bodyLarge,
                color = DashboardDanger,
                fontWeight = FontWeight.Bold
            )
        }
        
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White.copy(alpha = 0.03f))
                .padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Shield, null, tint = DashboardSuccess, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Security Protocol Active", style = MaterialTheme.typography.labelSmall, color = DashboardMuted)
            }
        }
    }
}

@Composable
private fun TeacherDashboardHero(dashboard: TeacherDashboardState) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.extraLarge)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color(0xFF17245A),
                        Color(0xFF12345B),
                        Color(0xFF0C182B)
                    )
                )
            )
            .border(
                width = 1.dp,
                color = Color.White.copy(alpha = 0.16f),
                shape = MaterialTheme.shapes.extraLarge
            )
            .padding(18.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    StatusChip(label = "Secure dashboard", tint = DashboardSuccess)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Welcome back, Teacher",
                        style = MaterialTheme.typography.headlineSmall,
                        color = DashboardText,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        text = "Real-time class security and exam operations",
                        style = MaterialTheme.typography.bodyMedium,
                        color = DashboardMuted
                    )
                }

                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(DashboardAccent)
                        .border(1.dp, Color.White.copy(alpha = 0.30f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = "Teacher profile",
                        tint = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = DashboardText,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = DashboardMuted
        )
    }
}

@Composable
fun StatCard(stat: DashboardStat, modifier: Modifier = Modifier) {
    DashboardCard(modifier = modifier.height(122.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(stat.tint.copy(alpha = 0.1f))
                        .border(1.dp, stat.tint.copy(alpha = 0.24f), MaterialTheme.shapes.medium),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = stat.icon,
                        contentDescription = null,
                        tint = stat.tint,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Text(
                    text = stat.value,
                    style = MaterialTheme.typography.headlineSmall,
                    color = DashboardText,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.End
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = stat.label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = DashboardText,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = stat.helper,
                    style = MaterialTheme.typography.labelSmall,
                    color = DashboardMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
fun PerformanceChartCard(points: List<ChartPoint>) {
    DashboardCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Class Performance", style = MaterialTheme.typography.titleMedium, color = DashboardText, fontWeight = FontWeight.Bold)
            Row(
                modifier = Modifier.fillMaxWidth().height(100.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                points.forEach { point ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .height(80.dp)
                                .width(22.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.08f)),
                            contentAlignment = Alignment.BottomCenter
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fillMaxHeight(point.value.coerceIn(0.1f, 1f))
                                    .clip(CircleShape)
                                    .background(DashboardAccent)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ExamMonitoringCard(state: MonitoringState) {
    DashboardCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text("Live Exam Monitoring", style = MaterialTheme.typography.titleMedium, color = DashboardText, fontWeight = FontWeight.Bold)
                    Text(state.examTitle, style = MaterialTheme.typography.bodyMedium, color = DashboardMuted)
                }
                Text("${state.progressPercent}%", style = MaterialTheme.typography.titleMedium, color = DashboardSuccess, fontWeight = FontWeight.ExtraBold)
            }
            LinearProgressIndicator(
                progress = { state.progressPercent / 100f },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape),
                color = DashboardSuccess,
                trackColor = Color.White.copy(alpha = 0.09f)
            )
        }
    }
}

@Composable
fun ActivityItemRow(item: ActivityRowData) {
    DashboardCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(40.dp).clip(MaterialTheme.shapes.medium).background(item.tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(item.icon, null, tint = item.tint, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(item.title, style = MaterialTheme.typography.bodyMedium, color = DashboardText, fontWeight = FontWeight.SemiBold)
                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = DashboardMuted)
            }
        }
    }
}

@Composable
private fun DashboardCard(modifier: Modifier = Modifier, containerColor: Color = DashboardSurface, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = containerColor.copy(alpha = 0.96f)),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
    ) {
        Box(modifier = Modifier.padding(14.dp)) { content() }
    }
}

@Composable
private fun StatusChip(label: String, tint: Color) {
    Row(
        modifier = Modifier.clip(CircleShape).background(tint.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(tint))
        Spacer(modifier = Modifier.width(7.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = tint)
    }
}

@Composable
private fun EmptyDashboardActivity() {
    Text("No activity yet.", color = DashboardMuted, style = MaterialTheme.typography.bodySmall)
}

private fun buildTeacherDashboardState(
    submissions: List<ExamSubmission>?,
    sessions: List<ExamSession>?,
    exams: List<Exam>?,
    communityStudents: List<String>?
): TeacherDashboardState {
    val subList = submissions ?: emptyList()
    val sessList = sessions ?: emptyList()
    val examList = exams ?: emptyList()
    val commList = communityStudents ?: emptyList()

    val uniqueStudents = buildSet {
        addAll(commList.map { it.lowercase().trim() }.filter { it.isNotBlank() })
        examList.forEach { exam ->
            exam.assignedStudents?.forEach { add(it.lowercase().trim()) }
            exam.communityStudents?.forEach { add(it.lowercase().trim()) }
        }
        subList.forEach { add(it.studentId.lowercase().trim()) }
        sessList.forEach { add(it.studentId.lowercase().trim()) }
    }.filter { it.isNotBlank() }.toSet()

    val activeExams = examList.count { it.status == ExamStatus.LIVE }
    val alerts = subList.sumOf { it.totalWarnings } + sessList.count { it.status == ExamSessionStatus.LOCKED }

    val stats = listOf(
        DashboardStat("Students", uniqueStudents.size.toString(), "Registered", Icons.Default.Groups, DashboardAccent),
        DashboardStat("Live Exams", activeExams.toString(), "Active", Icons.Default.Assignment, DashboardAccent),
        DashboardStat("Security", "0", "Alerts", Icons.Default.FactCheck, DashboardWarning),
        DashboardStat("Sessions", sessList.size.toString(), "Active", Icons.Default.Dns, DashboardSuccess)
    )

    return TeacherDashboardState(
        stats = stats,
        performance = listOf(ChartPoint("Mon", 0.4f), ChartPoint("Tue", 0.8f), ChartPoint("Wed", 0.5f), ChartPoint("Thu", 0.7f), ChartPoint("Fri", 0.9f)),
        monitoring = MonitoringState("Initializing...", 0, "DRAFT", DashboardMuted, "0 active", "0 warnings", 0),
        activities = emptyList()
    )
}

private fun weekdayLabel(timestamp: Long?): String = SimpleDateFormat("EEE", Locale.US).format(Date(timestamp ?: 0L))

data class TeacherDashboardState(val stats: List<DashboardStat>, val performance: List<ChartPoint>, val monitoring: MonitoringState, val activities: List<ActivityRowData>)
data class MonitoringState(val examTitle: String, val progressPercent: Int, val primaryChip: String, val primaryTint: Color, val secondaryChip: String, val warningChip: String, val warningCount: Int)
data class DashboardStat(val label: String, val value: String, val helper: String, val icon: ImageVector, val tint: Color)
data class ChartPoint(val label: String, val value: Float)
data class ActivityRowData(val icon: ImageVector, val title: String, val subtitle: String, val tint: Color)
