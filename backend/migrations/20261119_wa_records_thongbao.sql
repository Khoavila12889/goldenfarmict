-- 2026-11-19: Them loai ban ghi 'thongbao' cho wa_records.
-- Dinh tuyen thong bao tu group WhatsApp theo NGUOI GUI (quyet dinh chu he
-- thong 2026-11-19): chi nguoi gui co so dien thoai nam trong bien moi
-- truong WA_ANNOUNCE_DIRECT_PHONES (.env.wa; hien tai la Nhung Nhan su)
-- moi dang thang len bang Thong bao Dashboard (forum_posts). Moi thong bao
-- con lai (ke ca thieu so dien thoai) luu vao wa_records trang thai 'moi'
-- cho admin duyet trong module "Thong bao WhatsApp".
-- Xem docs/wa_ingest_contract.md.
-- Idempotent: chay lai chi thay rang buoc bang ban tuong duong.
ALTER TABLE wa_records DROP CONSTRAINT IF EXISTS wa_records_record_type_check;
ALTER TABLE wa_records ADD CONSTRAINT wa_records_record_type_check
    CHECK (record_type IN ('datlich', 'checkin', 'baocao', 'checkout', 'thongbao'));
