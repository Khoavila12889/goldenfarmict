-- Additive, backward-compatible migration for task deadline KPI.
ALTER TABLE todos
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL;
