-- REVIEW ONLY. Expected dependencies compared through catalogs, no application rows.
BEGIN TRANSACTION READ ONLY;
WITH expected(feature,relation_name,required_columns) AS (VALUES
 ('setup categories/classes','exam_categories',ARRAY['id','name','slug','icon','color','description','display_order','is_active','created_at','updated_at']),
 ('node browsing/selection','exam_nodes',ARRAY['id','category_id','parent_id','name','slug','type','icon','color','description','display_order','is_active','metadata','created_at','updated_at']),
 ('question selection/read','question_bank_questions',ARRAY['id','node_id','question_type','question_text','difficulty','marks','explanation','status']),
 ('options/key','question_bank_question_options',ARRAY['id','question_id','option_text','is_correct','display_order']),
 ('sessions','question_bank_self_exam_sessions',ARRAY['id','student_id','node_id','duration_minutes','question_count','difficulty_mode','status','started_at','expires_at','submitted_at','score','total_marks','created_at','updated_at']),
 ('session questions','question_bank_self_exam_session_questions',ARRAY['id','session_id','question_id','display_order','marks']),
 ('answers/results','question_bank_self_exam_answers',ARRAY['id','session_id','question_id','selected_option_id','answer_text','is_correct','marks_awarded','answered_at','updated_at']),
 ('legacy classes','question_bank_classes',ARRAY['id','name','slug','display_order','is_active','created_at','updated_at']),
 ('legacy subjects','question_bank_subjects',ARRAY['id','class_id','name','slug','code','display_order','is_active','created_at','updated_at']),
 ('legacy chapters','question_bank_chapters',ARRAY['id','subject_id','name','slug','chapter_number','display_order','is_active','created_at','updated_at']))
SELECT e.feature,e.relation_name,c.oid IS NOT NULL AS relation_present,
 ARRAY(SELECT col.name FROM unnest(e.required_columns) col(name)
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname=col.name AND a.attnum>0 AND NOT a.attisdropped)) AS missing_columns
 FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.relation_name ORDER BY e.feature;
SELECT current_setting('pgrst.db_schemas',true) AS optional_db_schemas_setting,
       current_setting('pgrst.db_extra_search_path',true) AS optional_extra_search_path_setting;
-- NULL settings do not prove PostgREST exposure is absent; configuration may live outside DB.
WITH optional_rpc(name) AS (VALUES ('self_exam_start_v1'),('self_exam_save_answer_v1'),('self_exam_submit_v1'))
SELECT r.name,p.oid IS NOT NULL AS exists_optional_only,
       CASE WHEN p.oid IS NOT NULL THEN pg_get_function_identity_arguments(p.oid) ELSE NULL END AS signature,
       p.prosecdef AS security_definer
 FROM optional_rpc r LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=r.name ORDER BY r.name;
-- Phase2 RPCs/tables are DISABLED and NOT required for current setup. Do not invoke them.
SELECT extname,extversion FROM pg_extension WHERE extname='pgcrypto';
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS signature
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='auth' AND p.proname='role')
 OR (n.nspname IN ('public','pg_catalog') AND p.proname='gen_random_uuid');
-- UUID default / RLS helper availability only: no function invoked or body read.
COMMIT;
