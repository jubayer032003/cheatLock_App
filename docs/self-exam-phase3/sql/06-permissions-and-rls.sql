-- REVIEW ONLY. Inspect metadata/effective privileges; never grants, role changes or policy writes.
BEGIN TRANSACTION READ ONLY;
SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname LIKE 'question_bank_%' OR c.relname IN ('exam_categories','exam_nodes')) ORDER BY c.relname;
SELECT tablename,policyname,permissive,cmd,
       'service_role'=ANY(roles) AS includes_service_role,'anon'=ANY(roles) AS includes_anon,
       'authenticated'=ANY(roles) AS includes_authenticated,'public'=ANY(roles) AS includes_public,
       md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) AS expression_fingerprint
 FROM pg_policies WHERE schemaname='public' AND (tablename LIKE 'question_bank_%' OR tablename IN ('exam_categories','exam_nodes')) ORDER BY tablename,policyname;
-- Expression bodies omitted to avoid accidental identifier/literal disclosure.
SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges
 WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated','service_role')
 AND (table_name LIKE 'question_bank_%' OR table_name IN ('exam_categories','exam_nodes')) ORDER BY table_name,grantee,privilege_type;
WITH roles AS (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 tables AS (SELECT c.oid,c.relname,c.relnamespace FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v') AND (c.relname LIKE 'question_bank_%' OR c.relname IN ('exam_categories','exam_nodes'))),
 privileges(name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'))
SELECT r.rolname,t.relname,p.name AS privilege,
 has_schema_privilege(r.rolname,t.relnamespace,'USAGE') AS schema_usage,
 has_table_privilege(r.rolname,t.oid,p.name) AS effective_table_privilege
 FROM roles r CROSS JOIN tables t CROSS JOIN privileges p ORDER BY t.relname,r.rolname,p.name;
-- Role visibility/metadata rights can limit output. No elevated credential required by file.
-- If restricted, request narrow metadata rights separately; never switch to a secret/admin key automatically.
COMMIT;
