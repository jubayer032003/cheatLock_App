package com.jubayer.cheatlock.ui

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jubayer.cheatlock.BuildConfig
import com.jubayer.cheatlock.ui.theme.*
import com.jubayer.cheatlock.model.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    account: UserAccount,
    submissions: List<ExamSubmission>,
    sessions: List<ExamSession>,
    exams: List<Exam>,
    communityStudents: List<String>,
    teacherClasses: List<TeacherClass>,
    onCreateExam: suspend (Exam) -> Exam,
    onUpdateExamLifecycle: (String, String) -> Unit,
    onAssignStudentsToExam: suspend (String, List<String>) -> Unit,
    onSaveCommunity: (List<String>) -> Unit,
    onSaveClass: suspend (TeacherClass) -> Unit,
    onDeleteClass: suspend (String) -> Unit,
    onClearReports: () -> Unit,
    onResetAttempt: (String, String?) -> Unit,
    onGetExamOverview: suspend (String) -> ExamAttendanceOverview,
    onGetExamSubmissions: suspend (String) -> List<ExamSubmission>,
    onGradeSubmission: suspend (String, String, Double, String) -> ExamSubmission,
    onDecideEnrollment: suspend (String, String, String) -> Unit,
    onUpdateProfile: suspend (String, String) -> Unit,
    onHasFaceProfile: suspend () -> Boolean,
    onLogout: () -> Unit,
    onRefresh: suspend () -> Unit
) {
    var showClearConfirm by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableStateOf(TeacherTab.Dashboard) }
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    var dashboardMessage by remember { mutableStateOf<String?>(null) }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Clear Reports?") },
            text = { Text("This removes saved teacher reports from the dashboard.") },
            confirmButton = {
                Button(onClick = { showClearConfirm = false; onClearReports() }) { Text("Clear") }
            },
            dismissButton = {
                OutlinedButton(onClick = { showClearConfirm = false }) { Text("Cancel") }
            }
        )
    }

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = {
                ModalDrawerSheet(
                    drawerContainerColor = CheatLockNavyRich,
                    drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp)
                ) {
                    TeacherSideBarContent(
                        selectedTab = selectedTab,
                        onTabSelected = { tab ->
                            selectedTab = tab
                            scope.launch { scrollState.scrollTo(0) }
                        },
                        onClose = { scope.launch { drawerState.close() } },
                        onLogout = onLogout
                    )
                }
            }
        ) {
            Scaffold(
                modifier = Modifier.fillMaxSize(),
                containerColor = Color.Transparent,
                topBar = {
                    CenterAlignedTopAppBar(
                        title = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(
                                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo),
                                    contentDescription = null,
                                    modifier = Modifier.size(32.dp)
                                )
                                Spacer(Modifier.width(12.dp))
                                Text("CHEATLOCK", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                            }
                        },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Default.Menu, "Menu")
                            }
                        },
                        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                            containerColor = Color.Transparent,
                            navigationIconContentColor = Color.White,
                            titleContentColor = Color.White
                        )
                    )
                }
            ) { innerPadding ->
                PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = {
                        scope.launch {
                            isRefreshing = true
                            try {
                                onRefresh()
                                dashboardMessage = null
                            } catch (e: Exception) {
                                dashboardMessage = e.message ?: "Failed to refresh dashboard."
                            } finally {
                                isRefreshing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize().padding(innerPadding)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .verticalScroll(scrollState)
                            .imePadding()
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp)
                    ) {
                        dashboardMessage?.let { msg ->
                            PremiumCard(elevated = false) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().padding(8.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Error,
                                        null,
                                        tint = CheatLockDanger,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    Text(
                                        text = msg.uppercase(),
                                        color = CheatLockDanger,
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.weight(1f)
                                    )
                                    IconButton(onClick = { dashboardMessage = null }) {
                                        Icon(Icons.Default.Close, null, tint = Color.White)
                                    }
                                }
                            }
                        }

                        AnimatedContent(
                            targetState = selectedTab,
                            transitionSpec = { cheatLockTabTransition(forward = targetState.ordinal >= initialState.ordinal) },
                            label = "teacher-tabs"
                        ) { tab ->
                            Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                                when (tab) {
                                    TeacherTab.Dashboard -> {
                                        BrandHero(title = "Instructor Console", subtitle = "System Security: ACTIVE")
                                        RoleBadge(label = "Faculty")
                                        Spacer(modifier = Modifier.height(4.dp))
                                        TeacherDashboardScreen(submissions, sessions, exams, communityStudents)
                                    }

                                    TeacherTab.Exams -> {
                                        TeacherExamsTab(exams, teacherClasses, communityStudents, onCreateExam, onUpdateExamLifecycle, onAssignStudentsToExam, onGetExamOverview, onGetExamSubmissions, onGradeSubmission)
                                    }

                                    TeacherTab.Attendance -> {
                                        BrandHero(title = "Student roster", subtitle = "Manage academic identities")
                                        TeacherStudentsTab(communityStudents, teacherClasses, onSaveCommunity, onSaveClass, onDeleteClass, onDecideEnrollment)
                                    }

                                    TeacherTab.Reports -> {
                                        TeacherReportsTab(submissions, sessions, onResetAttempt)
                                    }

                                    TeacherTab.Settings -> {
                                        TeacherSettingsTab(submissions.size, { showClearConfirm = true }, submissions.isNotEmpty())
                                    }

                                    TeacherTab.Profile -> {
                                        BrandHero(title = "Account Security", subtitle = "Faculty Profile Management")
                                        ProfileManagementScreen(account, onUpdateProfile, onHasFaceProfile)
                                        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth().height(54.dp), colors = ButtonDefaults.buttonColors(containerColor = CheatLockDanger)) {
                                            Text("TERMINATE SESSION", fontWeight = FontWeight.Black)
                                        }
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(80.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun TeacherExamsTab(
    exams: List<Exam>, 
    teacherClasses: List<TeacherClass>, 
    communityStudents: List<String>, 
    onCreateExam: suspend (Exam) -> Exam, 
    onUpdateExamLifecycle: (String, String) -> Unit, 
    onAssignStudentsToExam: suspend (String, List<String>) -> Unit, 
    onGetExamOverview: suspend (String) -> ExamAttendanceOverview, 
    onGetExamSubmissions: suspend (String) -> List<ExamSubmission>, 
    onGradeSubmission: suspend (String, String, Double, String) -> ExamSubmission
) {
    SectionHeader(title = "Exam studio", subtitle = "Create secure proctored exams")
    ExamCreatorCard(teacherClasses, onCreateExam)
    SectionHeader(title = "Created exams", subtitle = "${exams.size} exam(s) in workspace")
    if (exams.isEmpty()) {
        EmptyState(title = "No exams yet", body = "Initialize a module to generate access keys.")
    } else {
        exams.forEach { exam -> 
            ExamCard(exam, communityStudents, teacherClasses, onUpdateExamLifecycle, onAssignStudentsToExam, onGetExamOverview, onGetExamSubmissions, onGradeSubmission) 
        }
    }
}

@Composable
fun TeacherStudentsTab(
    communityStudents: List<String>, 
    teacherClasses: List<TeacherClass>, 
    onSaveCommunity: (List<String>) -> Unit, 
    onSaveClass: suspend (TeacherClass) -> Unit, 
    onDeleteClass: suspend (String) -> Unit,
    onDecideEnrollment: suspend (String, String, String) -> Unit
) {
    EnrollmentRequestsCard(teacherClasses, onDecideEnrollment)
    StudentProfileCreatorCard(onSaveCommunity)
    CommunityCard(communityStudents, onSaveCommunity)
    ClassManagerCard(teacherClasses, onSaveClass, onDeleteClass)
}

@Composable
fun EnrollmentRequestsCard(classes: List<TeacherClass>, onDecide: suspend (String, String, String) -> Unit) {
    val scope = rememberCoroutineScope()
    val pendingRequests = classes.flatMap { cls -> 
        cls.enrollmentRequests.filter { it.status == "PENDING" }.map { it to cls }
    }

    if (pendingRequests.isNotEmpty()) {
        SectionHeader(title = "Enrollment Requests", subtitle = "Pending approval for your classes")
        pendingRequests.forEach { (request, cls) ->
            PremiumCard {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(request.studentName, color = Color.White, fontWeight = FontWeight.Bold)
                        Text("${request.studentId} → ${cls.name}", color = CheatLockPurpleSoft, style = MaterialTheme.typography.labelSmall)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        IconButton(
                            onClick = { scope.launch { runCatching { onDecide(cls.id.orEmpty(), request.studentId, "REJECTED") } } },
                            modifier = Modifier.size(36.dp).clip(CircleShape).background(CheatLockDanger.copy(alpha = 0.1f))
                        ) {
                            Icon(Icons.Default.Close, null, tint = CheatLockDanger, modifier = Modifier.size(18.dp))
                        }
                        IconButton(
                            onClick = { scope.launch { runCatching { onDecide(cls.id.orEmpty(), request.studentId, "APPROVED") } } },
                            modifier = Modifier.size(36.dp).clip(CircleShape).background(CheatLockSuccess.copy(alpha = 0.1f))
                        ) {
                            Icon(Icons.Default.Check, null, tint = CheatLockSuccess, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
    }
}

@Composable
fun StudentProfileCreatorCard(onSave: (List<String>) -> Unit) {
    var studentId by remember { mutableStateOf("") }
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Enroll New Identity", style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.Bold)
            PremiumOutlinedTextField(value = studentId, onValueChange = { studentId = it }, label = "New Student ID", leadingIcon = Icons.Default.PersonAdd)
            Button(onClick = { if(studentId.isNotBlank()) onSave(listOf(studentId.trim())); studentId = "" }, modifier = Modifier.fillMaxWidth()) {
                Text("ENROLL STUDENT")
            }
        }
    }
}

@Composable
fun TeacherReportsTab(
    submissions: List<ExamSubmission>, 
    sessions: List<ExamSession>, 
    onResetAttempt: (String, String?) -> Unit
) {
    SectionHeader(title = "Live sessions", subtitle = "Active telemetry monitoring")
    if (sessions.isEmpty()) {
        EmptyState(title = "No active streams", body = "Signals will manifest during live exam cycles.")
    } else {
        sessions.forEach { session -> SessionCard(session, onResetAttempt) }
    }
    SectionHeader(title = "Submission reports", subtitle = "Heuristic integrity analysis")
    if (submissions.isEmpty()) {
        EmptyState(title = "No reports indexed", body = "Completed submissions will appear here.")
    } else {
        submissions.forEach { submission -> SubmissionReportCard(submission) }
    }
}

@Composable
fun TeacherSettingsTab(count: Int, onClear: () -> Unit, enabled: Boolean) {
    SectionHeader(title = "System Control", subtitle = "Workspace configuration")
    
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            FeatureRow(Icons.Default.Shield, "Proctoring Core", "Active")
            FeatureRow(Icons.Default.VerifiedUser, "Encrypted Logs", "$count records")
        }
    }
    OutlinedButton(onClick = onClear, enabled = enabled, modifier = Modifier.fillMaxWidth().height(50.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = CheatLockDanger)) { 
        Icon(Icons.Default.DeleteSweep, null)
        Spacer(Modifier.width(8.dp))
        Text("FLUSH SYSTEM LOGS")
    }
}

@Composable
fun ExamCreatorCard(teacherClasses: List<TeacherClass>, onCreateExam: suspend (Exam) -> Exam) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var duration by remember { mutableStateOf("30") }
    var assignedStudents by remember { mutableStateOf("") }
    var questionType by remember { mutableStateOf(QuestionType.CQ) }
    var questionText by remember { mutableStateOf("") }
    var options by remember { mutableStateOf(listOf("", "")) }
    var questions by remember { mutableStateOf(emptyList<ExamQuestion>()) }
    var lockAnswers by remember { mutableStateOf(true) }
    var selectedClassIds by remember { mutableStateOf(emptySet<String>()) }
    var isCreating by remember { mutableStateOf(false) }
    var creatorMessage by remember { mutableStateOf<String?>(null) }

    var showCameraDialog by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            showCameraDialog = true
        } else {
            android.widget.Toast.makeText(context, "Camera permission is required to scan questions.", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Launch New Assessment", style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
            
            PremiumOutlinedTextField(value = title, onValueChange = { title = it }, label = "Exam Title", leadingIcon = Icons.Default.Title)
            PremiumOutlinedTextField(value = duration, onValueChange = { duration = it.filter { c -> c.isDigit() } }, label = "Duration (Minutes)", leadingIcon = Icons.Default.Timer)
            PremiumOutlinedTextField(value = assignedStudents, onValueChange = { assignedStudents = it }, label = "Individual Students (IDs, comma-separated)", leadingIcon = Icons.Default.PersonAdd)

            if (teacherClasses.isNotEmpty()) {
                Text("Target Classes", style = MaterialTheme.typography.labelLarge, color = CheatLockPurpleSoft)
                teacherClasses.forEach { cls ->
                    val classId = cls.id
                    if (classId != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = selectedClassIds.contains(classId), onCheckedChange = { 
                                selectedClassIds = if (it) selectedClassIds + classId else selectedClassIds - classId
                            })
                            Text("${cls.name} (${cls.section})", color = Color.White)
                        }
                    }
                }
            }

            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Question Module", style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = questionType == QuestionType.CQ, onClick = { questionType = QuestionType.CQ }, label = { Text("WRITTEN") })
                        FilterChip(selected = questionType == QuestionType.MCQ, onClick = { questionType = QuestionType.MCQ }, label = { Text("MCQ") })
                    }
                    PremiumOutlinedTextField(
                        value = questionText,
                        onValueChange = { questionText = it },
                        label = "Inquiry Text",
                        leadingIcon = Icons.Default.HelpCenter,
                        singleLine = false,
                        trailingIcon = {
                            IconButton(onClick = {
                                val hasPermission = ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.CAMERA
                                ) == PackageManager.PERMISSION_GRANTED
                                if (hasPermission) {
                                    showCameraDialog = true
                                } else {
                                    permissionLauncher.launch(Manifest.permission.CAMERA)
                                }
                            }) {
                                Icon(
                                    imageVector = Icons.Default.PhotoCamera,
                                    contentDescription = "Scan Question",
                                    tint = CheatLockPurpleSoft
                                )
                            }
                        }
                    )
                    if (questionType == QuestionType.MCQ) {
                        options.forEachIndexed { i, opt ->
                            PremiumOutlinedTextField(value = opt, onValueChange = { 
                                val n = options.toMutableList(); n[i] = it; options = n
                            }, label = "Option ${'A' + i}")
                        }
                        TextButton(onClick = { options = options + "" }) { Text("+ Add Option", color = CheatLockPurpleSoft) }
                    }
                    Button(onClick = {
                        if (questionText.isBlank()) return@Button
                        questions = questions + ExamQuestion(type = questionType, text = questionText.trim(), options = if (questionType == QuestionType.MCQ) options.filter { it.isNotBlank() } else emptyList())
                        questionText = ""; options = listOf("", "")
                    }, modifier = Modifier.fillMaxWidth()) { Text("INDEX QUESTION") }
                }
            }

            if (questions.isNotEmpty()) {
                Text("Indexed: ${questions.size} questions", color = CheatLockPurpleSoft, style = MaterialTheme.typography.labelSmall)
            }

            creatorMessage?.let { msg ->
                Text(
                    text = msg,
                    color = CheatLockDanger,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            GradientPrimaryButton(text = "DEPLOY EXAMINATION", onClick = {
                if (title.isBlank() || questions.isEmpty()) {
                    creatorMessage = "Title and at least one question are required."
                    return@GradientPrimaryButton
                }
                isCreating = true
                scope.launch {
                    try {
                        onCreateExam(Exam(title = title.trim(), durationMinutes = duration.toIntOrNull() ?: 30, questions = questions, assignedStudents = assignedStudents.split(",").map { it.trim() }.filter { it.isNotBlank() }, classIds = selectedClassIds.toList(), lockAnswers = lockAnswers))
                        title = ""; questions = emptyList(); assignedStudents = ""
                        creatorMessage = null
                    } catch (e: Exception) {
                        creatorMessage = e.message ?: "Failed to deploy examination."
                    } finally { isCreating = false }
                }
            }, loading = isCreating)
        }
    }

    if (showCameraDialog) {
        OcrCameraDialog(
            onDismiss = { showCameraDialog = false },
            onTextExtracted = { text ->
                questionText = text
            }
        )
    }
}

@Composable
fun ExamCard(
    exam: Exam, 
    students: List<String>, 
    classes: List<TeacherClass>, 
    onUpdate: (String, String) -> Unit, 
    onAssign: suspend (String, List<String>) -> Unit, 
    onOverview: suspend (String) -> ExamAttendanceOverview, 
    onSubmissions: suspend (String) -> List<ExamSubmission>, 
    onGrade: suspend (String, String, Double, String) -> ExamSubmission
) {
    var showAttendanceSheet by remember { mutableStateOf(false) }
    val examId = exam.id

    if (examId == null) {
        PremiumCard {
            Text("Error: Exam ID is missing.", color = CheatLockDanger, style = MaterialTheme.typography.bodyMedium)
        }
        return
    }
    
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text(exam.title, color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
                    Text("KEY: ${exam.accessCode}", color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
                }
                StatusPill(exam.status.name, if (exam.status == ExamStatus.LIVE) CheatLockSuccess else CheatLockWarning)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (exam.status != ExamStatus.LIVE) Button(onClick = { onUpdate(examId, "START") }, modifier = Modifier.weight(1f)) { Text("START") }
                if (exam.status == ExamStatus.LIVE) Button(onClick = { onUpdate(examId, "END") }, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = CheatLockDanger)) { Text("END") }
                OutlinedButton(onClick = { onUpdate(examId, "ARCHIVE") }, modifier = Modifier.weight(1f)) { Text("ARCHIVE") }
            }
            Button(
                onClick = { showAttendanceSheet = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = CheatLockNavySurface)
            ) {
                Icon(Icons.Default.Assessment, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("ATTENDANCE & GRADING")
            }
        }
    }

    if (showAttendanceSheet) {
        ExamAttendanceGradingSheet(
            examId = examId,
            examTitle = exam.title,
            onLoadOverview = onOverview,
            onLoadSubmission = { id, studentId -> onSubmissions(id).firstOrNull { it.studentId == studentId } },
            onGradeSubmission = onGrade,
            onDismiss = { showAttendanceSheet = false }
        )
    }
}

@Composable
fun CommunityCard(students: List<String>, onSave: (List<String>) -> Unit) {
    var text by remember(students) { mutableStateOf(students.joinToString(", ")) }
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Student Community Registry", style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.Bold)
            PremiumOutlinedTextField(value = text, onValueChange = { text = it }, label = "Identity IDs (comma-separated)")
            Button(onClick = { onSave(text.split(",").map { it.trim() }.filter { it.isNotBlank() }) }, modifier = Modifier.fillMaxWidth()) {
                Text("SYNCHRONIZE COMMUNITY")
            }
        }
    }
}

@Composable
fun ClassManagerCard(classes: List<TeacherClass>, onSave: suspend (TeacherClass) -> Unit, onDelete: suspend (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var section by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var cardMessage by remember { mutableStateOf<String?>(null) }

    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Class Architecture", style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.Bold)
            PremiumOutlinedTextField(value = name, onValueChange = { name = it }, label = "Designation (e.g. CS101)")
            PremiumOutlinedTextField(value = section, onValueChange = { section = it }, label = "Batch/Section")
            Button(onClick = {
                if (name.isBlank() || section.isBlank()) {
                    cardMessage = "Designation and section are required."
                    return@Button
                }
                scope.launch {
                    try {
                        onSave(TeacherClass(name = name.trim(), section = section.trim(), subject = subject.trim(), students = emptyList()))
                        name = ""
                        section = ""
                        cardMessage = null
                    } catch (e: Exception) {
                        cardMessage = e.message ?: "Failed to build class."
                    }
                }
            }, modifier = Modifier.fillMaxWidth()) {
                Text("BUILD CLASS")
            }
            
            cardMessage?.let { msg ->
                Text(
                    text = msg,
                    color = CheatLockDanger,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            if (classes.isNotEmpty()) {
                Divider(color = Color.White.copy(0.05f))
                classes.forEach { cls ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Text(cls.name, color = Color.White, fontWeight = FontWeight.Bold)
                            Text(cls.section, color = CheatLockTextSecondaryDark, style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = {
                            val classId = cls.id
                            if (classId.isNullOrBlank()) {
                                cardMessage = "Cannot delete: Class ID is missing."
                                return@IconButton
                            }
                            scope.launch {
                                try {
                                    onDelete(classId)
                                    cardMessage = null
                                } catch (e: Exception) {
                                    cardMessage = e.message ?: "Failed to delete class."
                                }
                            }
                        }) {
                            Icon(Icons.Default.Delete, null, tint = CheatLockDanger)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SessionCard(session: ExamSession, onReset: (String, String?) -> Unit) {
    PremiumCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(session.studentId, color = Color.White, fontWeight = FontWeight.Bold)
                Text(session.onlineStatus, color = if (session.onlineStatus == "ONLINE") CheatLockSuccess else CheatLockTextSecondaryDark, style = MaterialTheme.typography.labelSmall)
            }
            if (session.suspicionScore > 0) SuspicionMeter(score = session.suspicionScore, modifier = Modifier.width(100.dp))
            IconButton(onClick = { onReset(session.studentId, session.examId) }) { Icon(Icons.Default.Refresh, null, tint = CheatLockPurpleSoft) }
        }
    }
}

@Composable
fun SubmissionReportCard(submission: ExamSubmission) {
    val f = remember { SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()) }
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text(submission.studentId, color = Color.White, fontWeight = FontWeight.Bold)
                    Text(f.format(Date(submission.submittedAt)), color = CheatLockTextSecondaryDark, style = MaterialTheme.typography.labelSmall)
                }
                StatusPill(submission.riskLevel, statusColorForRisk(submission.riskLevel))
            }
            Text("Violations: ${submission.totalWarnings}", color = if (submission.totalWarnings > 0) CheatLockDanger else CheatLockSuccess, style = MaterialTheme.typography.bodySmall)
        }
    }
}
