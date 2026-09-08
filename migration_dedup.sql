-- ============================================================
-- MIGRATION: Dedup nhân viên + thêm constraint + column mới
-- Chạy 1 LẦN trên production VPS
-- Cách chạy:
--   docker-compose exec -e PAGER=cat db psql -U goldenfarm -d goldenfarmict -f /tmp/migration_dedup.sql
-- (copy file này vào container trước: docker-compose cp migration_dedup.sql db:/tmp/)
-- ============================================================

-- 1. Thêm column file_path cho salary_upload_logs (lưu file Excel lương)
ALTER TABLE salary_upload_logs ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT '';

-- 2. Cập nhật references từ bản trùng (.0) sang bản gốc
UPDATE equipment SET employee_id = ke.id
FROM employees dup
JOIN employees ke ON ke.employee_code = REPLACE(dup.employee_code, '.0', '')
WHERE equipment.employee_id = dup.id
  AND dup.employee_code LIKE '%.0'
  AND ke.employee_code != dup.employee_code;

UPDATE tickets SET employee_id = ke.id
FROM employees dup
JOIN employees ke ON ke.employee_code = REPLACE(dup.employee_code, '.0', '')
WHERE tickets.employee_id = dup.id
  AND dup.employee_code LIKE '%.0'
  AND ke.employee_code != dup.employee_code;

UPDATE bookings SET employee_id = ke.id
FROM employees dup
JOIN employees ke ON ke.employee_code = REPLACE(dup.employee_code, '.0', '')
WHERE bookings.employee_id = dup.id
  AND dup.employee_code LIKE '%.0'
  AND ke.employee_code != dup.employee_code;

-- 3. Xóa bản ghi .0 trùng (giữ bản gốc không .0)
DELETE FROM employees
WHERE employee_code LIKE '%.0'
  AND EXISTS (SELECT 1 FROM employees e2 WHERE e2.employee_code = REPLACE(employees.employee_code, '.0', ''));

-- 4. Đổi tên bản .0 còn lại (không có bản gốc) thành không .0
UPDATE employees SET employee_code = REPLACE(employee_code, '.0', '')
WHERE employee_code LIKE '%.0';

-- 5. Xóa bản ghi NaN (do import lỗi từ pandas)
DELETE FROM employees WHERE employee_code = 'NaN';

-- 6. Thêm UNIQUE constraint cho employee_code (chống trùng vĩnh viễn)
ALTER TABLE employees ADD CONSTRAINT uq_employees_employee_code UNIQUE (employee_code);

-- 7. Fix dữ liệu lương: strip .0 khỏi password và employee_code trong salaries
DELETE FROM salaries WHERE employee_code = 'nan' OR employee_code = 'NaN';

DELETE FROM salaries
WHERE employee_code LIKE '%.0'
  AND EXISTS (SELECT 1 FROM salaries s2 WHERE s2.month = salaries.month AND s2.employee_code = REPLACE(salaries.employee_code, '.0', ''));

UPDATE salaries SET employee_code = REPLACE(employee_code, '.0', '')
WHERE employee_code LIKE '%.0';

UPDATE salaries SET password = REPLACE(password, '.0', '')
WHERE password LIKE '%.0';

-- Fix PASSWORD và ID trong JSON data
UPDATE salaries SET data_json = REGEXP_REPLACE(data_json, '"PASSWORD":\s*"?([0-9]+)\.0"?', '"PASSWORD": "\1"')
WHERE data_json ~ '"PASSWORD":\s*"?[0-9]+\.0"?';

UPDATE salaries SET data_json = REGEXP_REPLACE(data_json, '"ID":\s*"?([0-9]+)\.0"?', '"ID": "\1"')
WHERE data_json ~ '"ID":\s*"?[0-9]+\.0"?';
