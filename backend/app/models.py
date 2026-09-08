"""
SQLAlchemy ORM Models — 21+ tables.

Project dùng PostgreSQL 16.
  - `DATABASE_URL` cấu hình trong `core/session.py`
  - Các model này dùng type chuẩn (String, Integer, Float, Boolean)
    tương thích PostgreSQL.
  - `server_default` dùng text() để không phụ thuộc dialect.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Text, Boolean, UniqueConstraint, ForeignKey, DateTime
from .core.session import Base


class Employee(Base):
    __tablename__ = 'employees'
    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String, nullable=False, default='')
    department = Column(String, default='')
    position = Column(String, default='')
    handover_date = Column(String, default='')
    start_date = Column(String, default='')
    phone = Column(String, default='')
    email = Column(String, default='')
    employee_code = Column(String, unique=True, nullable=False, default='', index=True)
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
    employee_id = Column(Integer, nullable=True)
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
    username = Column(String, unique=True, nullable=True, default='')
    password_hash = Column(String, nullable=False)
    role = Column(String, default='user')
    is_first_login = Column(Boolean, default=True)
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
    type = Column(String, default='business_trip', index=True)
    approval_request_id = Column(Integer, default=0)
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
    payment_date = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class SalaryUploadLog(Base):
    __tablename__ = 'salary_upload_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    month = Column(String, nullable=False, index=True)
    filename = Column(String, default='')
    file_path = Column(String, default='')
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
    target_type = Column(String, default='DEPARTMENT')
    can_read = Column(Integer, default=1)
    can_write = Column(Integer, default=0)
    can_edit = Column(Integer, default=0)
    can_delete = Column(Integer, default=0)
    allow_download = Column(Integer, default=1)
    can_reshare = Column(Integer, default=0)
    can_upload = Column(Integer, default=0)
    expires_at = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Todo(Base):
    __tablename__ = 'todos'
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    description = Column(Text, default='')
    scope = Column(String, default='personal', index=True)
    department = Column(String, default='', index=True)
    creator_code = Column(String, nullable=False, index=True)
    creator_name = Column(String, default='')
    assignee_code = Column(String, default='', index=True)
    assignee_name = Column(String, default='')
    status = Column(String, default='todo', index=True)
    priority = Column(String, default='medium')
    due_date = Column(String, default='')
    tags = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class TodoSubtask(Base):
    __tablename__ = 'todo_subtasks'
    id = Column(Integer, primary_key=True, autoincrement=True)
    todo_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    is_completed = Column(Integer, default=0)
    sort_order = Column(Integer, default=0)
    created_at = Column(String, default='')


class Comment(Base):
    __tablename__ = 'comments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    todo_id = Column(Integer, nullable=False, index=True)
    user_code = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class Attachment(Base):
    __tablename__ = 'attachments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    todo_id = Column(Integer, nullable=False, index=True)
    uploader_code = Column(String, nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, default='')
    file_size = Column(Integer, default=0)
    file_url = Column(String, default='')
    created_at = Column(String, default='')


class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_code = Column(String, nullable=False, index=True)
    todo_id = Column(Integer, nullable=False, index=True)
    message = Column(Text, nullable=False)
    is_read = Column(Integer, default=0)
    created_at = Column(String, default='')


class LicCategory(Base):
    __tablename__ = 'lic_categories'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    icon = Column(String, default='')
    sort_order = Column(Integer, default=0)


class LicItem(Base):
    __tablename__ = 'lic_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False, default='')
    registered_date = Column(String, default='')
    expiry_date = Column(String, default='')
    notes = Column(Text, default='')
    contract_file = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class UserPermission(Base):
    __tablename__ = 'user_permissions'
    __table_args__ = (UniqueConstraint('employee_code', 'module', name='uq_user_perm'),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String, nullable=False, index=True)
    module = Column(String, nullable=False, index=True)
    can_view = Column(Integer, default=1)
    can_edit = Column(Integer, default=0)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class RolePermission(Base):
    __tablename__ = 'role_permissions'
    __table_args__ = (UniqueConstraint('role', 'module', name='uq_role_perm'),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String, nullable=False, index=True)
    module = Column(String, nullable=False, index=True)
    can_view = Column(Integer, default=1)
    can_edit = Column(Integer, default=0)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class DepartmentPermission(Base):
    __tablename__ = 'department_permissions'
    __table_args__ = (UniqueConstraint('department', 'module', name='uq_dept_perm'),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    department = Column(String, nullable=False, index=True)
    module = Column(String, nullable=False, index=True)
    can_view = Column(Integer, default=1)
    can_edit = Column(Integer, default=0)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class DocumentShare(Base):
    """File-level share grants (All users / Department / Public link).

    A share references a file OR folder inside a storage config:
      - config_id + file_path uniquely identify the item (SMB/FTP path, or
        Google Drive 'folderId/name' style path).
      - file_id carries the real Google Drive file id for GDrive downloads.
      - item_type: 'file' | 'folder' — when 'folder', file_path is the shared
        folder (absolute storage path for SMB/FTP, folder id for GDrive) and
        access is inherited by every file/folder nested inside it.
    share_type: ALL | DEPT | USER | PUBLIC
      - ALL    -> every authenticated internal user may access
      - DEPT   -> authenticated users whose department matches department_id
      - USER   -> only the employees listed in employee_code (comma list) may access
      - PUBLIC -> anyone with the share_token may access (no login needed)
    share_token is always generated (used as the stable public link identifier).
    """
    __tablename__ = 'document_shares'
    id = Column(Integer, primary_key=True, autoincrement=True)
    config_id = Column(Integer, nullable=False, index=True)
    item_type = Column(String, nullable=False, default='file', index=True)
    file_path = Column(String, nullable=False, default='', index=True)
    file_id = Column(String, nullable=False, default='')
    file_name = Column(String, default='')
    share_type = Column(String, nullable=False, default='ALL', index=True)
    department_id = Column(Integer, nullable=True, index=True)
    employee_code = Column(String, default='', index=True)
    share_token = Column(String, default='', unique=True, index=True)
    permissions = Column(String, nullable=False, default='view,download')
    created_by = Column(String, default='')
    created_at = Column(String, default='')
    updated_at = Column(String, default='')
    expires_at = Column(String, default='')


class ChatRoom(Base):
    """Phòng chat nội bộ (direct / group / department).

    `id` là UUID (String(36)) tự sinh.
    `type`: 'direct' (nhắn riêng 1-1), 'group' (nhóm) hoặc 'department' (phòng ban).
    `name`: None cho direct, tên nhóm cho group, tên phòng ban cho department.
    `department`: tên phòng ban (chỉ dùng khi type='department').
    `owner_code`: mã nhân viên tạo/quản lý phòng (group). Admin/trưởng phòng
                  quản lý phòng phòng ban, admin quản lý mọi phòng.
    """
    __tablename__ = 'chat_rooms'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False, default='direct', index=True)
    name = Column(String, nullable=True)
    department = Column(String, nullable=True, index=True)
    owner_code = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatRoomMember(Base):
    """Thành viên của phòng chat (bảng join 2 phía).

    Cần thiết để xác định "người nhận" khi broadcast tin nhắn qua
    ConnectionManager. Xoá phòng chat → cascade xoá thành viên.
    """
    __tablename__ = 'chat_room_members'
    __table_args__ = (UniqueConstraint('room_id', 'employee_code', name='uq_chat_room_member'),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(36), ForeignKey('chat_rooms.id', ondelete='CASCADE'), nullable=False, index=True)
    employee_code = Column(String, ForeignKey('users.employee_code', ondelete='CASCADE'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ForumPost(Base):
    """Thông báo nội bộ / forum post.

    `target_type`: 'all' (mọi người), 'dept' (một phòng ban) hoặc 'user'
                  (danh sách mã nhân viên cụ thể, phân biệt bằng dấu phẩy).
    `target_value`: '' khi 'all', tên phòng ban khi 'dept', danh sách mã
                  nhân viên (phân cách phẩy) khi 'user'.
    """
    __tablename__ = 'forum_posts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False, default='')
    content = Column(Text, default='')
    author_code = Column(String, default='', index=True)
    author_name = Column(String, default='')
    target_type = Column(String, default='all', index=True)
    target_value = Column(String, default='')
    is_pinned = Column(Integer, default=0, index=True)
    attachment_url = Column(String, default='')
    attachment_name = Column(String, default='')
    attachment_type = Column(String, default='')
    attachment_size = Column(Integer, default=0)
    created_at = Column(String, default='')
    updated_at = Column(String, default='')


class ForumReply(Base):
    """Trao đổi (hỏi–đáp) bên trong một thông báo / forum post."""
    __tablename__ = 'forum_replies'
    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_code = Column(String, nullable=False, index=True)
    user_name = Column(String, default='')
    content = Column(Text, nullable=False)
    created_at = Column(String, default='')


class ChatMessage(Base):
    """Tin nhắn chat nội bộ.

    `sender_id` FK tới `users.employee_code` với `ondelete='SET NULL'`
    (QUY TẮC D3): khi xoá User, tin nhắn của họ KHÔNG bị xoá, chỉ đặt
    `sender_id` về NULL.

    `is_pinned`/`pinned_by`/`pinned_at`: tin nhắn được ghim lên header
    box chat (bất kỳ thành viên nào cũng ghim được).
    """
    __tablename__ = 'chat_messages'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey('chat_rooms.id', ondelete='CASCADE'), nullable=False, index=True)
    sender_id = Column(String, ForeignKey('users.employee_code', ondelete='SET NULL'), nullable=True, index=True)
    content = Column(Text, nullable=False, default='')
    attachment_url = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    attachment_type = Column(String, nullable=True)
    attachment_size = Column(Integer, nullable=True)
    is_pinned = Column(Integer, default=0, index=True)
    pinned_by = Column(String, nullable=True)
    pinned_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
