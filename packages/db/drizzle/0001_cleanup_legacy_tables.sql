-- File: packages/db/drizzle/0001_cleanup_legacy_tables.sql
-- Legacy cleanup for single-institution Voz schema.

DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS usage_events CASCADE;
DROP TABLE IF EXISTS voice_sessions CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
