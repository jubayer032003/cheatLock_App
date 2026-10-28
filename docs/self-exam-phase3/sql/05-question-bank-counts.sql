-- REVIEW ONLY. Estimates avoid expensive full-table scans and handle missing tables.
BEGIN TRANSACTION READ ONLY;
WITH expected(name) AS (VALUES ('exam_categories'),('exam_nodes'),('question_bank_classes'),('question_bank_subjects'),('question_bank_chapters'),
 ('question_bank_questions'),('question_bank_question_options'),('question_bank_question_tags'),('question_bank_question_tag_map'),
 ('question_bank_self_exam_sessions'),('question_bank_self_exam_session_questions'),('question_bank_self_exam_answers'),
 ('question_bank_admin_audit_logs'),('question_bank_self_exam_question_snapshots'),('question_bank_self_exam_answer_mutations'))
SELECT e.name,c.oid IS NOT NULL AS exists_in_public,s.n_live_tup AS estimated_rows,s.n_dead_tup AS estimated_dead_rows,
       s.last_analyze,s.last_autoanalyze
 FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name
 LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid ORDER BY e.name;
-- NULL means absent/unavailable, not zero; estimates are not exact/transaction-consistent.
-- No answers, identifiers, scores or student-level data extracted.
COMMIT;
