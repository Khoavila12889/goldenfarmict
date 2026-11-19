-- 2026-11-19: Them loai ban ghi 'checkout' (tra phong / roi phong hop) cho wa_records.
-- Bot Hermes ghi nhan 3 loai tu group WhatsApp: datlich (dang ky phong hop),
-- checkin (vao dung phong), checkout (tra phong). 'baocao' giu nguyen trong schema
-- (khong xoa) du bot khong dung.
-- Idempotent: chay lai chi thay rang buoc bang ban tuong duong.
ALTER TABLE wa_records DROP CONSTRAINT IF EXISTS wa_records_record_type_check;
ALTER TABLE wa_records ADD CONSTRAINT wa_records_record_type_check
    CHECK (record_type IN ('datlich', 'checkin', 'baocao', 'checkout'));
