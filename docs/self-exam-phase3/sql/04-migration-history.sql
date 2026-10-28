-- REVIEW ONLY. Missing tracking table/column/privileges yield metadata status, not a crash.
-- No migration statement bodies, credentials or application rows selected.
BEGIN TRANSACTION READ ONLY;
WITH history AS (
 SELECT c.oid AS relation_id,n.oid AS schema_id
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations' AND c.relkind IN ('r','p')),
version_column AS (
 SELECT h.*,a.attnum FROM history h JOIN pg_attribute a ON a.attrelid=h.relation_id
 WHERE a.attname='version' AND a.attnum>0 AND NOT a.attisdropped
 AND a.atttypid IN ('pg_catalog.text'::regtype,'pg_catalog.varchar'::regtype)),
version_access AS (
 SELECT * FROM version_column v WHERE has_schema_privilege(current_user,v.schema_id,'USAGE')
 AND has_column_privilege(current_user,v.relation_id,v.attnum,'SELECT'))
SELECT EXISTS(SELECT 1 FROM history) AS tracking_relation_exists,
 CASE WHEN NOT EXISTS(SELECT 1 FROM history) THEN 'tracking relation absent'
      WHEN NOT EXISTS(SELECT 1 FROM version_column) THEN 'version column absent or unsupported type'
      WHEN NOT EXISTS(SELECT 1 FROM version_access) THEN 'tracking metadata access unavailable'
      ELSE 'limited version-only inspection available' END AS status,
 CASE WHEN EXISTS(SELECT 1 FROM version_access)
 THEN query_to_xml('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 100',true,false,'')
 ELSE NULL END AS latest_100_versions_xml;
-- query_to_xml runs ONLY the fixed version-only SELECT after relation/column/grant guards.
-- Optional narrow USAGE/schema and SELECT(version) permission; no full history-body access needed.
-- Tracking rows can omit manually applied SQL: cross-check physical schema, not just versions.
COMMIT;
