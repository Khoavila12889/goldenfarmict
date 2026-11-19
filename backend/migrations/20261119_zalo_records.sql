-- 2026-11-19: Bang luu thong bao do bot Zalo ca nhan (zca-js, /home/zalo-personal-bot)
-- trich tu cac group Zalo trong danh sach ZALO_CAPTURE_GROUPS.
-- Bot ghi qua POST /api/zalo-records/ingest (header X-Bot-Secret, secret trong
-- .env.zalo tren server); app doc qua module "Thong bao Zalo" (key zalo-records,
-- giai doan phat trien chi cap cho admin — xem role_permissions).
-- msg_id UNIQUE: ingest idempotent — relay gui lai cung mot tin se nhan
-- duplicate=true va id cua dong da co, khong tao ban ghi trung.
-- Xem docs/zalo_ingest_contract.md de biet hop dong ingest.
CREATE TABLE IF NOT EXISTS zalo_records (
    id           BIGSERIAL PRIMARY KEY,
    record_type  VARCHAR(20) NOT NULL DEFAULT 'thongbao' CHECK (record_type IN ('thongbao')),
    sender_name  TEXT        NOT NULL DEFAULT '',
    sender_phone VARCHAR(32) NOT NULL DEFAULT '',
    sender_id    TEXT        NOT NULL DEFAULT '',
    group_name   TEXT        NOT NULL DEFAULT '',
    group_id     TEXT        NOT NULL DEFAULT '',
    title        TEXT        NOT NULL DEFAULT '',
    content      TEXT        NOT NULL DEFAULT '',
    raw_message  TEXT        NOT NULL DEFAULT '',
    msg_id       TEXT        UNIQUE,
    source       VARCHAR(32) NOT NULL DEFAULT 'zalo-bot',
    status       VARCHAR(20) NOT NULL DEFAULT 'moi' CHECK (status IN ('moi', 'daxuly', 'huy')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_zalo_records_created_at ON zalo_records (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_zalo_records_status ON zalo_records (status);
