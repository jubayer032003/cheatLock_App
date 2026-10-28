-- REVIEW ONLY. Catalog inventory works even when application tables are absent.
BEGIN TRANSACTION READ ONLY;
WITH expected(name) AS (VALUES
 ('exam_categories'),('exam_nodes'),('question_bank_classes'),('question_bank_subjects'),('question_bank_chapters'),
 ('question_bank_questions'),('question_bank_question_options'),('question_bank_question_tags'),('question_bank_question_tag_map'),
 ('question_bank_self_exam_sessions'),('question_bank_self_exam_session_questions'),('question_bank_self_exam_answers'),
 ('question_bank_admin_audit_logs'),('question_bank_self_exam_question_snapshots'),('question_bank_self_exam_answer_mutations'))
SELECT e.name, c.oid IS NOT NULL AS exists_in_public, c.relkind, c.relrowsecurity, c.relforcerowsecurity
 FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name ORDER BY e.name;
SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position
 FROM information_schema.columns WHERE table_schema='public'
 AND (table_name LIKE 'question_bank_%' OR table_name IN ('exam_categories','exam_nodes'))
 ORDER BY table_name,ordinal_position;
-- Limited-role information_schema omissions mean not-visible, not proven absent.
COMMIT;
