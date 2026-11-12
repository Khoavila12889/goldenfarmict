-- 2026-11-12: Phong ban co them pho phong (deputy_id) lam nguon chuan cho vai tro he thong.
-- Gán trưởng/phó phòng tại trang Nhân viên > Quản lý Phòng ban; backend tự đồng bộ users.role
-- (xem core/auth.py: _resync_user_role, sync_department_head_role, sync_department_deputy_role).
ALTER TABLE departments ADD COLUMN IF NOT EXISTS deputy_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_departments_deputy_id ON departments (deputy_id);
