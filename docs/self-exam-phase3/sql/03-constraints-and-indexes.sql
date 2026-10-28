-- REVIEW ONLY. Constraint/index definitions, never application rows.
BEGIN TRANSACTION READ ONLY;
SELECT c.relname AS table_name, x.conname, x.contype, pg_get_constraintdef(x.oid) AS definition,
       x.convalidated, x.condeferrable, x.condeferred
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname LIKE 'question_bank_%' OR c.relname IN ('exam_categories','exam_nodes'))
 ORDER BY c.relname,x.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND (tablename LIKE 'question_bank_%' OR tablename IN ('exam_categories','exam_nodes')) ORDER BY tablename,indexname;
SELECT c.relname AS table_name,t.tgname,t.tgenabled
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
 AND (c.relname LIKE 'question_bank_%' OR c.relname IN ('exam_categories','exam_nodes')) ORDER BY c.relname,t.tgname;
-- No trigger/function bodies extracted. Verify unusual definitions separately.
COMMIT;
