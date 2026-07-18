"""
SQLAlchemy ORM Models — 18 tables.

Khi migrate sang PostgreSQL:
  - Đổi `DATABASE_URL` trong `core/session.py`
  - Các model này dùng type chuẩn (String, Integer, Float, Boolean)
    nên tương thích cả SQLite và PostgreSQL.
  - `server_default` dùng text() để không phụ thuộc dialect.
"""

from sqlalchemy import Column, Integer, String, Float, Text, Boolean
from .core.session import Base


class Employee(Base):
    __tablename__ = 'employees'
    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String, nullable=False, default='')
    department = Column(String, default='')
    position = Column(String, default='')
    handover_date = Column(String, default='')
    phone = Column(String, default='')
    email = Column(String, default='')
    employee_code = Column(String, default='', index=True)
    personal_email = Column(String, default='')
    notes = Column(Text, default='')
    status = Column(String, default='active', index=True)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Equipment(Base):
    __tablename__ = 'equipment'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, nullable=True)
    equipment_type = Column(String, default='')
    specs = Column(Text, default='')
    os_info = Column(Text, default='')
    serial_number = Column(String, default='')
    asset_code = Column(String, default='', index=True)
    status = Column(String, default='', index=True)
    description = Column(Text, default='')
    license_key = Column(String, default='')
    notes = Column(Text, default='')
    lifecycle_status = Column(String, default='')
    purchase_date = Column(String, default='')
    purchase_cost = Column(String, default='')
    issued_date = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class License(Base):
    __tablename__ = 'licenses'
    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, nullable=False)
    license_key = Column(String, nullable=False, default='')
    product_name = Column(String, default='', index=True)
    activated = Column(String, default='')
    expiry_date = Column(String, default='', index=True)
    notes = Column(Text, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class EquipmentHistory(Base):
    __tablename__ = 'equipment_history'
    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, nullable=False)
    employee_code = Column(String, nullable=False, index=True)
    employee_name = Column(String, default='')
    handover_date = Column(String, default='')
    return_date = Column(String, default='')
    notes = Column(Text, default='')
    created_at = Column(String, default='')
    old_status = Column(String, default='')
    new_status = Column(String, default='')
    changed_by = Column(String, default='')


class Ticket(Base):
    __tablename__ = 'tickets'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, nullable=True)
    full_name = Column(String, default='')
    department = Column(String, default='')
    title = Column(String, nullable=False, default='')
    description = Column(Text, default='')
    priority = Column(String, default='Binh thuong', index=True)
    status = Column(String, default='Cho xu ly', index=True)
    resolution = Column(Text, default='')
    admin_notes = Column(Text, default='')
    employee_code = Column(String, default='', index=True)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default='user')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Resource(Base):
    __tablename__ = 'resources'
    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String, nullable=False, default='car')
    name = Column(String, nullable=False)
    description = Column(Text, default='')
    is_active = Column(Boolean, default=True)
    created_at = Column(String, default='')


class WorkflowTemplate(Base):
    __tablename__ = 'workflow_templates'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, default='')
    icon = Column(String, default='FileCheck')
    is_active = Column(Boolean, default=True)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class WorkflowStep(Base):
    __tablename__ = 'workflow_steps'
    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, nullable=False, index=True)
    step_order = Column(Integer, nullable=False)
    approver_type = Column(String, nullable=False, default='role')
    approver_value = Column(String, default='')
    department_match = Column(Boolean, default=True)
    can_edit = Column(Boolean, default=False)
    created_at = Column(String, default='')


class ApprovalRequest(Base):
    __tablename__ = 'approval_requests'
    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default='')
    requester_code = Column(String, nullable=False, index=True)
    requester_name = Column(String, default='')
    requester_dept = Column(String, default='')
    status = Column(String, default='draft', index=True)
    current_step = Column(Integer, default=1)
    total_steps = Column(Integer, nullable=False, default=1)
    metadata_json = Column(Text, default='{}')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class ApprovalLog(Base):
    __tablename__ = 'approval_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, nullable=False, index=True)
    step_order = Column(Integer, nullable=False)
    approver_code = Column(String, nullable=False)
    approver_name = Column(String, default='')
    action = Column(String, nullable=False)
    comment = Column(Text, default='')
    created_at = Column(String, default='')


class Department(Base):
    __tablename__ = 'departments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)
    head_id = Column(Integer, nullable=True, index=True)
    description = Column(Text, default='')
    created_at = Column(String, default='')


class BusinessTrip(Base):
    __tablename__ = 'business_trips'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String, nullable=False, default='', index=True)
    full_name = Column(String, default='')
    department = Column(String, default='', index=True)
    destination = Column(String, nullable=False, default='')
    purpose = Column(String, nullable=False, default='')
    start_date = Column(String, nullable=False)
    end_date = Column(String, nullable=False)
    notes = Column(Text, default='')
    status = Column(String, default='active', index=True)
    completed_at = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Booking(Base):
    __tablename__ = 'bookings'
    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, nullable=False)
    title = Column(String, nullable=False, default='')
    employee_id = Column(Integer, nullable=True)
    full_name = Column(String, default='')
    department = Column(String, default='')
    book_date = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    status = Column(String, default='active', index=True)
    notes = Column(Text, default='')
    completed_at = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class SalarySlip(Base):
    __tablename__ = 'salary_slips'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String, nullable=False, index=True)
    month = Column(String, nullable=False, index=True)
    basic_salary = Column(Float, default=0)
    allowances = Column(Float, default=0)
    bonus = Column(Float, default=0)
    deductions = Column(Float, default=0)
    net_salary = Column(Float, default=0)
    notes = Column(Text, default='')
    created_by = Column(String, default='')
    updated_by = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Salary(Base):
    __tablename__ = 'salaries'
    employee_code = Column(String, primary_key=True)
    month = Column(String, primary_key=True)
    password = Column(String, default='')
    data_json = Column(Text, default='{}')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class SalaryUploadLog(Base):
    __tablename__ = 'salary_upload_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    month = Column(String, nullable=False, index=True)
    filename = Column(String, default='')
    uploaded_by = Column(String, default='')
    uploaded_by_name = Column(String, default='')
    record_count = Column(Integer, default=0)
    created_at = Column(String, default='')


class StorageConfig(Base):
    __tablename__ = 'storage_config'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False, default='smb')
    host = Column(String, nullable=False, default='')
    port = Column(Integer, default=445)
    username = Column(String, default='')
    password = Column(String, default='')
    remote_path = Column(String, default='/')
    domain = Column(String, default='')
    is_active = Column(Boolean, default=True)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class SoftwareCategory(Base):
    __tablename__ = 'software_categories'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    icon_name = Column(String, default='')
    order_index = Column(Integer, default=0)


class SoftwareItem(Base):
    __tablename__ = 'software_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False, default='')
    registered_date = Column(String, default='')
    expiration_date = Column(String, default='')
    contract_info = Column(String, default='')
    notes = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class StoragePermission(Base):
    __tablename__ = 'storage_permissions'
    id = Column(Integer, primary_key=True, autoincrement=True)
    storage_id = Column(Integer, nullable=False, index=True)
    folder_path = Column(String, nullable=False, default='/')
    role = Column(String, default='', index=True)
    employee_code = Column(String, default='', index=True)
    department = Column(String, default='')
    permission = Column(String, nullable=False, default='read')
    created_at = Column(String, default='')
