@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.jubayer.cheatlock.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.isSelfPracticeResult
import com.jubayer.cheatlock.model.correctAnswerScore
import com.jubayer.cheatlock.model.withCorrectAnswerScore
import com.jubayer.cheatlock.model.selfPracticeOverviewScore
import com.jubayer.cheatlock.util.PdfResultExporter
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class ResultCategoryFilter { ALL, TEACHER_EXAMS, SELF_EXAMS, HIGH_SCORE, NEEDS_REVIEW }

private fun ExamSubmission.isPracticeResult(): Boolean =
    isSelfPracticeResult()

private fun resultKey(submission: ExamSubmission, index: Int): String =
    "${submission.id ?: submission.examId}:${submission.studentId}:${submission.submittedAt}:$index"

@Composable
fun StudentResultsScreen(
    submissions: List<ExamSubmission>,
    studentName: String = "Student",
    onPracticeAgain: () -> Unit = {},
    onRefresh: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf(ResultCategoryFilter.ALL) }
    var scoreFilter by rememberSaveable { mutableStateOf("all") }
    var oldestFirst by rememberSaveable { mutableStateOf(false) }
    var selectedKey by rememberSaveable { mutableStateOf<String?>(null) }
    val scoredSubmissions = remember(submissions) { submissions.map { it.withCorrectAnswerScore() } }
    val entries = remember(scoredSubmissions) { scoredSubmissions.mapIndexed { index, value -> resultKey(value, index) to value } }
    val filtered = remember(entries, query, category, scoreFilter, oldestFirst) {
        val search = query.trim()
        val matching = entries.filter { (_, value) ->
            val categoryMatches = when (category) {
                ResultCategoryFilter.TEACHER_EXAMS -> !value.isPracticeResult()
                ResultCategoryFilter.SELF_EXAMS -> value.isPracticeResult()
                else -> true
            }
            val scoreMatches = when (scoreFilter) {
                "high" -> value.grade?.let { it >= 80 } == true
                "review" -> value.grade?.let { it < 60 } == true
                "pending" -> value.grade == null
                else -> true
            }
            val textMatches = search.isEmpty() || value.examId.orEmpty().contains(search, true) ||
                value.feedback.orEmpty().contains(search, true) || value.answers.any {
                    it.questionText.contains(search, true) || it.answerText.contains(search, true)
                }
            categoryMatches && scoreMatches && textMatches
        }
        if (oldestFirst) matching.sortedBy { it.second.submittedAt }
        else matching.sortedByDescending { it.second.submittedAt }
    }
    val selected = entries.firstOrNull { it.first == selectedKey }?.second
    val activeFilters = query.isNotBlank() || category != ResultCategoryFilter.ALL || scoreFilter != "all"

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 108.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item(key = "heading") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.sr_title), style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                    Text(stringResource(R.string.sr_subtitle), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (onRefresh != null) IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.sr_refresh))
                }
            }
        }
        item(key = "overview") { ResultsOverview(scoredSubmissions) }
        item(key = "search") {
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
                label = { Text(stringResource(R.string.sr_search)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) IconButton(onClick = { query = "" }) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.sr_clear_search))
                    }
                }
            )
        }
        item(key = "categories") {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    ResultCategoryFilter.ALL to R.string.sr_all,
                    ResultCategoryFilter.TEACHER_EXAMS to R.string.sr_teacher,
                    ResultCategoryFilter.SELF_EXAMS to R.string.sr_practice
                ).forEach { (value, label) ->
                    FilterChip(selected = category == value, onClick = { category = value },
                        label = { Text(stringResource(label)) },
                        leadingIcon = if (category == value) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        } else null)
                }
            }
        }
        item(key = "history-heading") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.sr_history), style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f).semantics { heading() })
                    Text(stringResource(R.string.sr_count, filtered.size), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                    ScoreFilterMenu(scoreFilter) { scoreFilter = it }
                    TextButton(onClick = { oldestFirst = !oldestFirst }) {
                        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(if (oldestFirst) R.string.sr_oldest else R.string.sr_newest))
                    }
                }
            }
        }
        if (filtered.isEmpty()) {
            item(key = "empty") {
                ResultsEmptyState(activeFilters,
                    onClear = { query = ""; category = ResultCategoryFilter.ALL; scoreFilter = "all" },
                    onPractice = onPracticeAgain)
            }
        } else {
            itemsIndexed(filtered, key = { _, item -> item.first }) { _, (key, submission) ->
                ResultHistoryCard(submission, onOpen = { selectedKey = key })
            }
        }
    }
    if (selected != null) {
        ResultDetailSheet(selected, studentName, onDismiss = { selectedKey = null }, onPractice = {
            selectedKey = null
            onPracticeAgain()
        })
    }
}

@Composable
private fun ResultsOverview(submissions: List<ExamSubmission>) {
    val teacher = remember(submissions) { submissions.filterNot { it.isPracticeResult() } }
    val practice = remember(submissions) { submissions.filter { it.isPracticeResult() } }
    val largeText = LocalDensity.current.fontScale > 1.3f
    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .35f)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Insights, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(stringResource(R.string.sr_overview), style = MaterialTheme.typography.titleMedium)
            }
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                if (maxWidth < 280.dp || largeText) {
                    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                        ResultSummaryMetric(stringResource(R.string.sr_teacher), teacher)
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        ResultSummaryMetric(stringResource(R.string.sr_practice), practice, isPractice = true)
                    }
                } else {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        Column(Modifier.weight(1f)) { ResultSummaryMetric(stringResource(R.string.sr_teacher), teacher) }
                        Column(Modifier.weight(1f)) { ResultSummaryMetric(stringResource(R.string.sr_practice), practice, isPractice = true) }
                    }
                }
            }
            Text(stringResource(R.string.sr_summary_hint), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ResultSummaryMetric(label: String, values: List<ExamSubmission>, isPractice: Boolean = false) {
    val grades = remember(values) { values.mapNotNull { it.grade } }
    val answerScore = remember(values) { selfPracticeOverviewScore(values) }
    val percentage = if (isPractice) answerScore?.percentage else grades.takeIf { it.isNotEmpty() }?.average()
    val gradedCount = if (isPractice) values.count { it.correctAnswerScore() != null } else grades.size
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(percentage?.let { scoreLabel(it) } ?: "—",
            style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text(stringResource(if (isPractice) R.string.sr_correct_rate else R.string.sr_average), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (isPractice && answerScore != null) Text(
            stringResource(R.string.sr_correct_count, answerScore.correct, answerScore.total),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.sr_attempts_graded, values.size, gradedCount),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ScoreFilterMenu(selected: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val options = listOf("all" to R.string.sr_all_scores, "high" to R.string.sr_high_scores,
        "review" to R.string.sr_low_scores, "pending" to R.string.sr_pending)
    Box {
        TextButton(onClick = { expanded = true }) {
            Text(stringResource(options.first { it.first == selected }.second))
            Icon(Icons.Default.ExpandMore, contentDescription = null, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, label) ->
                DropdownMenuItem(text = { Text(stringResource(label)) }, onClick = { onSelect(value); expanded = false },
                    trailingIcon = { if (selected == value) Icon(Icons.Default.Check, contentDescription = null) })
            }
        }
    }
}

@Composable
private fun ResultHistoryCard(submission: ExamSubmission, onOpen: () -> Unit) {
    Surface(onClick = onOpen, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                ResultTypeLabel(submission)
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = stringResource(R.string.sr_view_details),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
            Text(resultTitle(submission), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(resultDate(submission.submittedAt), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f))
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(submission.grade?.let { scoreLabel(it) } ?: stringResource(
                    if (submission.isPracticeResult()) R.string.sr_score_unavailable else R.string.sr_pending),
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                    color = if (submission.grade == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
                submission.correctAnswerScore()?.let { score ->
                    Text(stringResource(R.string.sr_correct_count, score.correct, score.total),
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(stringResource(R.string.sr_answer_count, submission.answers.size),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ResultTypeLabel(submission: ExamSubmission) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(if (submission.isPracticeResult()) Icons.Default.Quiz else Icons.Default.School,
            contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
        Text(stringResource(if (submission.isPracticeResult()) R.string.sr_practice else R.string.sr_teacher),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ResultDetailSheet(submission: ExamSubmission, studentName: String, onDismiss: () -> Unit, onPractice: () -> Unit) {
    val context = LocalContext.current
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(.92f).navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.sr_details), style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = stringResource(R.string.sr_close)) }
            }
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        ResultTypeLabel(submission)
                        Text(resultTitle(submission), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text(resultDate(submission.submittedAt, includeTime = true), style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        submission.examId?.takeIf { it.isNotBlank() }?.let {
                            Text(stringResource(R.string.sr_reference, it), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                item {
                    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .35f)) {
                        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(stringResource(R.string.sr_score), style = MaterialTheme.typography.labelLarge)
                            Text(submission.grade?.let { scoreLabel(it) } ?: stringResource(
                                if (submission.isPracticeResult()) R.string.sr_score_unavailable else R.string.sr_pending),
                                style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                            submission.correctAnswerScore()?.let { score ->
                                Text(stringResource(R.string.sr_correct_count, score.correct, score.total),
                                    style = MaterialTheme.typography.bodyMedium)
                            }
                            Text(stringResource(when {
                                submission.grade != null -> R.string.sr_recorded_score
                                submission.isPracticeResult() -> R.string.sr_score_unavailable_hint
                                else -> R.string.sr_pending_hint
                            }),
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (!submission.feedback.isNullOrBlank()) item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.sr_feedback), style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics { heading() })
                        Text(submission.feedback, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (!submission.isPracticeResult()) item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        HorizontalDivider()
                        Text(stringResource(R.string.sr_events), style = MaterialTheme.typography.titleMedium)
                        RecordedEventRow(stringResource(R.string.sr_app_switches), submission.appSwitchWarnings)
                        RecordedEventRow(stringResource(R.string.sr_face_events), submission.faceMissingWarnings)
                        RecordedEventRow(stringResource(R.string.sr_audio_events), submission.audioWarnings)
                        RecordedEventRow(stringResource(R.string.sr_phone_events), submission.phoneWarnings)
                        Text(stringResource(R.string.sr_event_hint), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        HorizontalDivider()
                        Text(stringResource(R.string.sr_answers), style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics { heading() })
                        Text(stringResource(R.string.sr_answers_hint), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (submission.answers.isEmpty()) item { Text(stringResource(R.string.sr_no_answers)) }
                itemsIndexed(submission.answers) { _, answer ->
                    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(stringResource(R.string.sr_question, answer.questionIndex + 1),
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            Text(answer.questionText.ifBlank { stringResource(R.string.sr_question_unavailable) },
                                style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            Text(stringResource(R.string.sr_your_answer), style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(answer.answerText.ifBlank { stringResource(R.string.sr_unanswered) }, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            HorizontalDivider()
            FlowRow(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedButton(onClick = { PdfResultExporter.exportAndShareResult(context, submission, studentName) }) {
                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.sr_share_pdf))
                }
                if (submission.isPracticeResult()) Button(onClick = onPractice) {
                    Text(stringResource(R.string.sr_practice_again))
                }
            }
        }
    }
}

@Composable
private fun RecordedEventRow(label: String, count: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(localNumber(count), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ResultsEmptyState(filtered: Boolean, onClear: () -> Unit, onPractice: () -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(if (filtered) Icons.Default.SearchOff else Icons.Default.Assessment, contentDescription = null,
                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
            Text(stringResource(if (filtered) R.string.sr_no_matches else R.string.sr_empty_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(if (filtered) R.string.sr_no_matches_hint else R.string.sr_empty_hint),
                style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = if (filtered) onClear else onPractice) {
                Text(stringResource(if (filtered) R.string.sr_clear_filters else R.string.sr_start_practice))
            }
        }
    }
}

@Composable
private fun resultTitle(submission: ExamSubmission): String {
    val identifier = submission.examId.orEmpty().trim()
    val opaqueId = identifier.matches(Regex("[a-fA-F0-9]{24}")) || identifier.matches(Regex("[a-fA-F0-9-]{36}"))
    return if (identifier.isNotBlank() && !opaqueId) identifier
    else stringResource(if (submission.isPracticeResult()) R.string.sr_practice_session else R.string.sr_teacher_assessment)
}

@Composable
private fun localNumber(value: Number): String {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    return remember(value, locale) { NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(value) }
}

@Composable
private fun scoreLabel(grade: Double): String = stringResource(R.string.sr_percentage, localNumber(grade))

@Composable
private fun resultDate(timestamp: Long, includeTime: Boolean = false): String {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val unavailable = stringResource(R.string.sr_date_unavailable)
    return remember(timestamp, locale, includeTime, unavailable) {
        if (timestamp <= 0) unavailable else SimpleDateFormat(if (includeTime) "dd MMM yyyy · h:mm a" else "dd MMM yyyy", locale).format(Date(timestamp))
    }
}
