package com.jubayer.cheatlock.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.jubayer.cheatlock.R

/** Localizes owned UI messages at display time; never translates server content or changes classification. */
@Composable
internal fun selfExamMessage(message: String): String {
    val context = LocalContext.current
    val resource = when (message) {
        "CheatLock logo" -> R.string.se_cheatlock_logo
        "Student" -> R.string.se_student
        "Target" -> R.string.se_target
        "Subject" -> R.string.se_subject
        "Chapter" -> R.string.se_chapter
        "Setup" -> R.string.se_setup
        "Ready" -> R.string.se_ready
        "Track" -> R.string.se_track
        "Questions" -> R.string.se_questions
        "Difficulty" -> R.string.se_difficulty
        "Duration" -> R.string.se_duration
        "Exam setup flow" -> R.string.se_exam_setup_flow
        "Select cleanly. Start only when everything is ready." -> R.string.se_select_cleanly_start_only_when_everything_is_ready
        "Select Class" -> R.string.se_select_class
        "Select Admission Track" -> R.string.se_select_admission_track
        "Choose from active classes configured in the Admin Question Bank" -> R.string.se_choose_from_active_classes_configured_in_the_admin_question_bank
        "Loading classes from Question Bank..." -> R.string.se_loading_classes_from_question_bank
        "Classes and subjects created in the Admin Dashboard will sync here automatically." -> R.string.se_classes_and_subjects_created_in_the_admin_dashboard_will_sync_her
        "SELF EXAM ENGINE" -> R.string.se_self_exam_engine
        "CENTRAL QUESTION BANK" -> R.string.se_central_question_bank
        "Personalized Smart Exam & Test Prep" -> R.string.se_personalized_smart_exam_test_prep
        "Practice topic-wise or take full mock exams synchronized directly with the Admin Question Bank." -> R.string.se_practice_topic_wise_or_take_full_mock_exams_synchronized_directly
        "Academic" -> R.string.se_academic
        "Admission" -> R.string.se_admission
        "School & College (1-12)" -> R.string.se_school_college_1_12
        "Varsity • Medical • Eng" -> R.string.se_varsity_medical_eng
        "Choose Subject" -> R.string.se_choose_subject
        "Choose your subject" -> R.string.se_choose_your_subject
        "Loading syllabus subjects..." -> R.string.se_loading_syllabus_subjects
        "No subjects added for this class yet. Please add subjects in the Admin Dashboard or pick another class." -> R.string.se_no_subjects_added_for_this_class_yet_please_add_subjects_in_the_a
        "Choose Chapter / Topic" -> R.string.se_choose_chapter_topic
        "Full Subject Practice (all topics included)" -> R.string.se_full_subject_practice_all_topics_included
        "Loading chapters..." -> R.string.se_loading_chapters
        "No separate chapters defined for this subject. The exam will draw questions from the full subject bank." -> R.string.se_no_separate_chapters_defined_for_this_subject_the_exam_will_draw_
        "⭐ All Chapters (Full Subject)" -> R.string.se_all_chapters_full_subject
        "Monitoring readiness" -> R.string.se_monitoring_readiness
        "Camera permission is ready. Monitoring starts only after the server starts the exam." -> R.string.se_camera_permission_is_ready_monitoring_starts_only_after_the_serve
        "Camera permission is required before the self exam timer can start." -> R.string.se_camera_permission_is_required_before_the_self_exam_timer_can_star
        "ALLOW MONITORING" -> R.string.se_allow_monitoring
        "Ready for a clean exam" -> R.string.se_ready_for_a_clean_exam
        "Review your setup" -> R.string.se_review_your_setup
        "Your timer starts only after this setup is accepted." -> R.string.se_your_timer_starts_only_after_this_setup_is_accepted
        "Choose a class or admission target" -> R.string.se_choose_a_class_or_admission_target
        "Choose a subject" -> R.string.se_choose_a_subject
        "All Chapters (Full Subject Practice)" -> R.string.se_all_chapters_full_subject_practice
        "Explanation" -> R.string.se_explanation
        "No Questions Found" -> R.string.se_no_questions_found
        "This selection does not have any active questions yet. Choose another subject/chapter or add questions from the admin dashboard." -> R.string.se_this_selection_does_not_have_any_active_questions_yet_choose_anot
        "Choose Again" -> R.string.se_choose_again
        "Could not load self exam tracks." -> R.string.se_could_not_load_self_exam_tracks
        "Could not load subjects for this level." -> R.string.se_could_not_load_subjects_for_this_level
        "Could not load chapters for this subject." -> R.string.se_could_not_load_chapters_for_this_subject
        "Could not resume self exam." -> R.string.se_could_not_resume_self_exam
        "Could not start self exam." -> R.string.se_could_not_start_self_exam
        "Could not setup self exam." -> R.string.se_could_not_setup_self_exam
        "Camera Permission Required" -> R.string.se_camera_permission_required
        "Camera permission is required before starting a monitored self exam." -> R.string.se_camera_permission_is_required_before_starting_a_monitored_self_ex
        "Camera permission is required before starting." -> R.string.se_camera_permission_is_required_before_starting
        "Grant Permission" -> R.string.se_grant_permission
        "Selection Incomplete" -> R.string.se_selection_incomplete
        "Please choose your track, grade/unit, and subject to begin." -> R.string.se_please_choose_your_track_grade_unit_and_subject_to_begin
        "Got it" -> R.string.se_got_it
        "Try Again" -> R.string.se_try_again
        "Cancel" -> R.string.se_cancel
        "An unexpected error occurred while setting up your self exam." -> R.string.se_an_unexpected_error_occurred_while_setting_up_your_self_exam
        "Question Bank Unavailable" -> R.string.se_question_bank_unavailable
        "Server Error" -> R.string.se_server_error
        "Connection Problem" -> R.string.se_connection_problem
        "We couldn't connect to the CheatLock server. Please check your internet connection and try again." -> R.string.se_we_couldn_t_connect_to_the_cheatlock_server_please_check_your_int
        "Request Timed Out" -> R.string.se_request_timed_out
        "The server is taking longer than expected to prepare your exam. Please try again." -> R.string.se_the_server_is_taking_longer_than_expected_to_prepare_your_exam_pl
        "Camera permission is required to monitor your self exam session. Please grant permission when prompted." -> R.string.se_camera_permission_is_required_to_monitor_your_self_exam_session_p
        "We couldn't generate your exam right now due to a temporary server issue. Please try again." -> R.string.se_we_couldn_t_generate_your_exam_right_now_due_to_a_temporary_serve
        "No Questions Available" -> R.string.se_no_questions_available
        "There are no active questions available for the selected topic. Please select a different subject or chapter." -> R.string.se_there_are_no_active_questions_available_for_the_selected_topic_pl
        "We couldn't process your self exam setup right now. Please try again." -> R.string.se_we_couldn_t_process_your_self_exam_setup_right_now_please_try_aga
        "Selection Required" -> R.string.se_selection_required
        "Unable to Setup Exam" -> R.string.se_unable_to_setup_exam
        "Question Bank is not configured on the server. Please contact the administrator." -> R.string.se_question_bank_is_not_configured_on_the_server_please_contact_the_
        "Question Bank is unavailable on the server. The administrator needs to check its database connection, schema and access." -> R.string.se_question_bank_is_unavailable_on_the_server_the_administrator_need
        "The server cannot access Question Bank. Please contact the administrator." -> R.string.se_the_server_cannot_access_question_bank_please_contact_the_adminis
        "The server could not complete this request. Please try again." -> R.string.se_the_server_could_not_complete_this_request_please_try_again
        "Build your own practice exam" -> R.string.se_build_your_own_practice_exam
        "Choose a topic, set your practice and begin." -> R.string.se_choose_a_topic_set_your_practice_and_begin
        "Track → Subject → Chapter → Start" -> R.string.se_track_subject_chapter_start
        "Practice from your question bank, one step at a time." -> R.string.se_practice_from_your_question_bank_one_step_at_a_time
        "Increase questions" -> R.string.se_increase_questions
        "Decrease questions" -> R.string.se_decrease_questions
        "Open exam review" -> R.string.se_open_exam_review
        "Changes remain in memory until submission" -> R.string.se_changes_remain_in_memory_until_submission
        "Correct answer" -> R.string.se_correct_answer
        "Your answer" -> R.string.se_your_answer
        "Not selected" -> R.string.se_not_selected
        "Selected" -> R.string.se_selected
        "Complete" -> R.string.se_complete
        "Not complete" -> R.string.se_not_complete
        "Checking" -> R.string.se_checking
        "Face found" -> R.string.se_face_found
        "Face missing" -> R.string.se_face_missing
        "Multiple faces" -> R.string.se_multiple_faces
        "Looking away" -> R.string.se_looking_away
        "Submission failed. Unsaved changes remain in this screen; retry before the deadline." -> R.string.se_submission_failed_unsaved_changes_remain_in_this_screen_retry_bef
        "We couldn't submit your exam. Your answers are still saved. Please try again." -> R.string.se_we_couldn_t_submit_your_exam_your_answers_are_still_saved_please_
        "Camera and microphone status" -> R.string.se_camera_and_microphone_status
        "Back to dashboard" -> R.string.se_back_to_dashboard
        "No questions available" -> R.string.se_no_questions_available
        "This exam does not have any questions. Please contact your teacher." -> R.string.se_this_exam_does_not_have_any_questions_please_contact_your_teacher
        "Session timing is unavailable. Reload the self exam before submitting." -> R.string.se_session_timing_is_unavailable_reload_the_self_exam_before_submitt
        "We couldn't submit your exam." -> R.string.se_we_couldn_t_submit_your_exam
        "Your answer · Incorrect" -> R.string.se_your_answer_incorrect
        else -> null
    }
    return resource?.let { context.getString(it) } ?: message
}
