-- 2026-11-18: Bang luu ban ghi do bot Hermes (WhatsApp Web) gui ve tu group WhatsApp:
-- dat lich (datlich), check-in vi tri (checkin), bao cao (baocao).
-- Bot ghi qua POST /api/wa-records/ingest (header X-Bot-Secret); app doc qua module
-- "Thong bao WhatsApp" (key wa-records, chi admin/head/deputy mac dinh).
-- Xem docs/wa_ingest_contract.md de biet hop dong ingest.
CREATE TABLE IF NOT EXISTS wa_records (
    id           BIGSERIAL PRIMARY KEY,
    record_type  VARCHAR(20) NOT NULL CHECK (record_type IN ('datlich', 'checkin', 'baocao')),
    sender_name  TEXT        NOT NULL DEFAULT '',
    sender_phone VARCHAR(32) NOT NULL DEFAULT '',
    group_name   TEXT        NOT NULL DEFAULT '',
    title        TEXT        NOT NULL DEFAULT '',
    content      TEXT        NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ,
    place        TEXT        NOT NULL DEFAULT '',
    lat          NUMERIC(10, 7),
    lng          NUMERIC(10, 7),
    raw_message  TEXT        NOT NULL DEFAULT '',
    source       VARCHAR(32) NOT NULL DEFAULT 'hermes',
    status       VARCHAR(20) NOT NULL DEFAULT 'moi' CHECK (status IN ('moi', 'daxuly', 'huy')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wa_records_created_at ON wa_records (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wa_records_record_type ON wa_records (record_type);
