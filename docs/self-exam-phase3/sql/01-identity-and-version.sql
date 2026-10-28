-- REVIEW ONLY; do not execute until exact target/read scope approval.
-- Requires CONNECT and ordinary metadata visibility. No secret settings queried.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_user AS inspection_role,
       current_schema() AS default_schema, current_schemas(false) AS search_path_schemas,
       inet_server_addr() AS server_address, inet_server_port() AS server_port,
       current_setting('server_version') AS postgres_version,
       current_setting('transaction_read_only') AS must_be_on;
COMMIT;
