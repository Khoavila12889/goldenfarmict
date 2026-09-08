-- ============================================================
-- MIGRATION: Deduplicate user_permissions
-- Xóa các dòng trùng lặp trong user_permissions (giữ 1 dòng per employee_code + module)
-- Chạy 1 LẦN trên production VPS
-- Cách chạy:
--   docker-compose exec -e PAGER=cat db psql -U goldenfarm -d goldenfarmict -f /tmp/migration_dedup_permissions.sql
-- (copy file này vào container trước: docker-compose cp migration_dedup_permissions.sql db:/tmp/)
-- ============================================================

-- 1. Xóa các bản ghi user_permissions có employee_code trùng với employee gốc (không .0)
--    Giữ lại bản ghi có employee_code không có suffix .0
DELETE FROM user_permissions
WHERE employee_code LIKE '%.0'
  AND EXISTS (
    SELECT 1 FROM user_permissions up2
    WHERE up2.module = user_permissions.module
      AND up2.employee_code = REPLACE(user_permissions.employee_code, '.0', '')
  );

-- 2. Đổi tên employee_code còn lại từ .0 thành không .0 (nếu vẫn còn sau bước 1)
UPDATE user_permissions
SET employee_code = REPLACE(employee_code, '.0', '')
WHERE employee_code LIKE '%.0';

-- 3. Xóa các bản ghi user_permissions có employee_code không tồn tại trong employees
DELETE FROM user_permissions
WHERE NOT EXISTS (
  SELECT 1 FROM employees e WHERE e.employee_code = user_permissions.employee_code
);

-- 4. Đảm bảo không có duplicate (employee_code, module) - giữ lại bản ghi mới nhất (max id)
DELETE FROM user_permissions
WHERE id NOT IN (
  SELECT MAX(id)
  FROM user_permissions
  GROUP BY employee_code, module
);

-- 5. Thêm lại constraint UNIQUE nếu chưa có (chống trùng tương lai)
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS uq_user_perm;
ALTER TABLE user_permissions ADD CONSTRAINT uq_user_perm UNIQUE (employee_code, module);

-- 6. Kiểm tra kết quả
SELECT employee_code, module, COUNT(*) as cnt
FROM user_permissions
GROUP BY employee_code, module
HAVING COUNT(*) > 1;
