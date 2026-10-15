-- Run individually in autocommit on PostgreSQL, outside a transaction.
-- Optional performance indexes; existing application/schema remain compatible.
-- Confirm a restorable backup and inspect pg_stat_activity before applying.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_room_cursor
    ON chat_messages (room_id, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_members_employee_room
    ON chat_room_members (employee_code, room_id);
-- Rollback (only if these indexes were created by this release):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_chat_messages_room_cursor;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_chat_members_employee_room;
