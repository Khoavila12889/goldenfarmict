"""Backup/restore theo module cho Todos, Booking và Nhân viên."""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from hashlib import sha256
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import inspect, or_, text

from app.core.session import SessionLocal
from app.models import Attachment, Booking, Comment, Employee, Notification, Resource, Todo, TodoSubtask, User, UserPermission
from app.services.upload_service import UPLOAD_BASE

BACKUP_VERSION = 1
BACKUP_BASE = Path(os.environ.get("MODULE_BACKUP_DIR", str(Path(__file__).resolve().parents[2] / "storage" / "module-backups")))
MAX_UPLOAD_SIZE = 100 * 1024 * 1024
MAX_UNCOMPRESSED_SIZE = 3 * 1024 * 1024 * 1024
MODULES = {
    "todos": {"model": Todo, "date": "created_at", "label": "todos", "cleanup": True},
    "bookings": {"model": Booking, "date": "book_date", "label": "booking", "cleanup": True},
    "employees": {"model": Employee, "date": "created_at", "label": "nhan-vien", "cleanup": False},
}


def _module(name: str) -> dict:
    if name not in MODULES:
        raise ValueError("Module backup không hợp lệ")
    return MODULES[name]


def _dates(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    except (TypeError, ValueError) as exc:
        raise ValueError("Ngày phải có định dạng YYYY-MM-DD") from exc
    if end < start:
        raise ValueError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu")
    if (end - start).days > 3660:
        raise ValueError("Khoảng scan tối đa 10 năm")
    return start, end


def _row(model) -> dict:
    return {column.key: getattr(model, column.key) for column in inspect(model).mapper.column_attrs}


def _json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def _query(db, module: str, start_date: str, end_date: str, record_ids=None, lock=False):
    config = _module(module)
    start, end = _dates(start_date, end_date)
    model = config["model"]
    query = db.query(model)
    ids = sorted({int(value) for value in (record_ids or [])})
    if ids:
        query = query.filter(model.id.in_(ids))
    else:
        column = getattr(model, config["date"])
        date_filter = (column >= start.isoformat()) & (column < (end + timedelta(days=1)).isoformat())
        if module == "employees":
            date_filter = or_(date_filter, column.is_(None), column == "")
        query = query.filter(date_filter)
    if lock:
        query = query.with_for_update()
    return query.order_by(model.id).all()


def preview_module(module: str, start_date: str, end_date: str) -> dict:
    config = _module(module)
    db = SessionLocal()
    try:
        rows = _query(db, module, start_date, end_date)
        items = []
        for item in rows:
            data = _row(item)
            title = data.get("title") or data.get("full_name") or f"#{data['id']}"
            subtitle = data.get("department") or data.get("book_date") or data.get("status") or ""
            items.append({"id": data["id"], "title": title, "subtitle": subtitle, "date": data.get(config["date"]) or ""})
        ids = [item["id"] for item in items]
        related_counts = {}
        if module == "todos" and ids:
            related_counts = {
                "subtasks": db.query(TodoSubtask).filter(TodoSubtask.todo_id.in_(ids)).count(),
                "comments": db.query(Comment).filter(Comment.todo_id.in_(ids)).count(),
                "notifications": db.query(Notification).filter(Notification.todo_id.in_(ids)).count(),
                "attachments": db.query(Attachment).filter(Attachment.todo_id.in_(ids)).count(),
            }
        elif module == "bookings" and rows:
            related_counts = {"resources": len({row.resource_id for row in rows})}
        elif module == "employees" and rows:
            codes = {row.employee_code for row in rows}
            related_counts = {
                "users": db.query(User).filter(User.employee_code.in_(codes)).count(),
                "permissions": db.query(UserPermission).filter(UserPermission.employee_code.in_(codes)).count(),
            }
        return {"module": module, "cleanup_allowed": config["cleanup"], "record_count": len(items), "related_counts": related_counts, "records": items}
    finally:
        db.close()


def _file_hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _manifest(db, module: str, start_date: str, end_date: str, record_ids, lock=False) -> tuple[dict, list[tuple[Path, str]]]:
    rows = _query(db, module, start_date, end_date, record_ids, lock=lock)
    ids = [row.id for row in rows]
    related, files, file_inventory, missing_files = {}, [], [], []
    if module == "todos":
        related["subtasks"] = [_row(row) for row in db.query(TodoSubtask).filter(TodoSubtask.todo_id.in_(ids)).all()] if ids else []
        related["comments"] = [_row(row) for row in db.query(Comment).filter(Comment.todo_id.in_(ids)).all()] if ids else []
        related["notifications"] = [_row(row) for row in db.query(Notification).filter(Notification.todo_id.in_(ids)).all()] if ids else []
        attachments = db.query(Attachment).filter(Attachment.todo_id.in_(ids)).all() if ids else []
        related["attachments"] = [_row(row) for row in attachments]
        for attachment in attachments:
            if attachment.file_type == "url":
                continue
            path = Path(UPLOAD_BASE) / Path(attachment.file_url or "").name
            if path.is_file():
                archive_name = f"attachments/{path.name}"
                files.append((path, archive_name))
                file_inventory.append({"path": archive_name, "size": path.stat().st_size, "sha256": _file_hash(path)})
            else:
                missing_files.append({"attachment_id": attachment.id, "file_name": attachment.file_name, "stored_name": path.name})
    elif module == "bookings":
        resource_ids = {row.resource_id for row in rows}
        related["resources"] = [_row(row) for row in db.query(Resource).filter(Resource.id.in_(resource_ids)).all()] if resource_ids else []
    elif module == "employees":
        codes = {row.employee_code for row in rows}
        related["users"] = [_row(row) for row in db.query(User).filter(User.employee_code.in_(codes)).all()] if codes else []
        related["permissions"] = [_row(row) for row in db.query(UserPermission).filter(UserPermission.employee_code.in_(codes)).all()] if codes else []
    return ({
        "format": "goldenfarm-module-backup", "version": BACKUP_VERSION, "module": module,
        "created_at": datetime.utcnow().isoformat(), "start_date": start_date, "end_date": end_date,
        "cleanup_allowed": MODULES[module]["cleanup"], "records": [_row(row) for row in rows], "related": related,
        "files": file_inventory, "missing_files": missing_files,
    }, files)


def _filename(manifest: dict) -> str:
    return f"bk_{manifest['start_date'].replace('-', '')}_{manifest['end_date'].replace('-', '')}_{MODULES[manifest['module']]['label']}.zip"


def _available(manifest: dict) -> Path:
    path = BACKUP_BASE / _filename(manifest)
    number = 2
    while path.exists():
        path = BACKUP_BASE / f"{Path(_filename(manifest)).stem}_{number}.zip"
        number += 1
    return path


def create_backup(module: str, start_date: str, end_date: str, record_ids, cleanup: bool) -> dict:
    config = _module(module)
    if cleanup and not config["cleanup"]:
        raise ValueError("Module Nhân viên chỉ cho phép snapshot, không dọn tự động")
    BACKUP_BASE.mkdir(parents=True, exist_ok=True)
    db, destination, temp_path = SessionLocal(), None, None
    database_committed = False
    cleanup_warnings = []
    try:
        manifest, files = _manifest(db, module, start_date, end_date, record_ids, lock=cleanup)
        if not manifest["records"]:
            return {"filename": None, "record_count": 0}
        destination = _available(manifest)
        fd, raw = tempfile.mkstemp(prefix=".module-backup-", suffix=".zip", dir=BACKUP_BASE)
        os.close(fd); temp_path = Path(raw)
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as package:
            package.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2, default=_json_default))
            for source, archive_name in files:
                package.write(source, archive_name)
        with zipfile.ZipFile(temp_path) as package:
            if package.testzip() is not None:
                raise RuntimeError("ZIP backup vừa tạo bị lỗi")
        os.replace(temp_path, destination); temp_path = None
        if cleanup:
            ids = [row["id"] for row in manifest["records"]]
            if module == "todos":
                db.query(Notification).filter(Notification.todo_id.in_(ids)).delete(synchronize_session=False)
                db.query(Attachment).filter(Attachment.todo_id.in_(ids)).delete(synchronize_session=False)
                db.query(Comment).filter(Comment.todo_id.in_(ids)).delete(synchronize_session=False)
                db.query(TodoSubtask).filter(TodoSubtask.todo_id.in_(ids)).delete(synchronize_session=False)
                db.query(Todo).filter(Todo.id.in_(ids)).delete(synchronize_session=False)
            elif module == "bookings":
                db.query(Booking).filter(Booking.id.in_(ids)).delete(synchronize_session=False)
            db.commit()
            database_committed = True
            for source, _ in files:
                still_used = db.query(Attachment.id).filter(Attachment.file_url.like(f"%/{source.name}")).first()
                if not still_used:
                    try:
                        source.unlink(missing_ok=True)
                    except OSError as exc:
                        cleanup_warnings.append(f"Không xóa được {source.name}: {exc}")
        return {"filename": destination.name, "record_count": len(manifest["records"]), "size": destination.stat().st_size, "cleaned": cleanup, "file_count": len(manifest["files"]), "missing_file_count": len(manifest["missing_files"]), "cleanup_warnings": cleanup_warnings}
    except Exception:
        db.rollback()
        if destination is not None and not database_committed:
            destination.unlink(missing_ok=True)
        raise
    finally:
        db.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def _read(path: Path) -> dict:
    with zipfile.ZipFile(path) as package:
        data = json.loads(package.read("manifest.json").decode("utf-8"))
    if data.get("format") != "goldenfarm-module-backup" or data.get("version") != BACKUP_VERSION or data.get("module") not in MODULES:
        raise ValueError("Định dạng backup module không được hỗ trợ")
    return data


def _verify_declared_files(path: Path, manifest: dict):
    with zipfile.ZipFile(path) as package:
        names = set(package.namelist())
        for item in manifest.get("files") or []:
            if item["path"] not in names: raise ValueError(f"ZIP thiếu file {item['path']}")
            digest, size = sha256(), 0
            with package.open(item["path"]) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    size += len(chunk)
                    digest.update(chunk)
            if size != item["size"] or digest.hexdigest() != item["sha256"]:
                raise ValueError(f"Checksum không khớp: {item['path']}")


def list_backups() -> list[dict]:
    BACKUP_BASE.mkdir(parents=True, exist_ok=True)
    result = []
    for path in sorted(BACKUP_BASE.glob("*.zip"), reverse=True):
        try:
            data = _read(path)
            result.append({"filename": path.name, "size": path.stat().st_size, "module": data["module"], "created_at": data.get("created_at"), "start_date": data.get("start_date"), "end_date": data.get("end_date"), "record_count": len(data.get("records") or []), "file_count": len(data.get("files") or []), "missing_file_count": len(data.get("missing_files") or [])})
        except Exception as exc:
            result.append({"filename": path.name, "size": path.stat().st_size, "error": str(exc)})
    return result


def upload_backup(source: BinaryIO) -> dict:
    BACKUP_BASE.mkdir(parents=True, exist_ok=True)
    fd, raw = tempfile.mkstemp(prefix=".module-upload-", suffix=".zip", dir=BACKUP_BASE); os.close(fd)
    temp = Path(raw); size = 0
    try:
        with temp.open("wb") as output:
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE: raise ValueError("File vượt giới hạn 100 MB")
                output.write(chunk)
        with zipfile.ZipFile(temp) as package:
            if package.testzip() is not None: raise ValueError("File ZIP bị lỗi")
            if sum(item.file_size for item in package.infolist()) > MAX_UNCOMPRESSED_SIZE: raise ValueError("Dữ liệu giải nén vượt 3 GB")
            if any(item.filename.startswith("/") or ".." in Path(item.filename).parts for item in package.infolist()): raise ValueError("ZIP chứa đường dẫn không an toàn")
        manifest = _read(temp); _verify_declared_files(temp, manifest); destination = _available(manifest); os.replace(temp, destination)
        return {"filename": destination.name, "module": manifest["module"], "record_count": len(manifest.get("records") or []), "size": size}
    except zipfile.BadZipFile as exc:
        raise ValueError("File tải lên không phải ZIP hợp lệ") from exc
    finally:
        temp.unlink(missing_ok=True)


def _insert_if_missing(db, model, row: dict, key="id") -> bool:
    if db.query(model).filter(getattr(model, key) == row[key]).first(): return False
    allowed = {column.key for column in inspect(model).mapper.column_attrs}
    db.add(model(**{name: value for name, value in row.items() if name in allowed})); return True


def _sync_sequence(db, model):
    table = model.__tablename__
    db.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 1), (SELECT COUNT(*) > 0 FROM {table}))"))


def restore_backup(filename: str) -> dict:
    path = BACKUP_BASE / Path(filename).name
    if path.name != filename or not path.is_file(): raise FileNotFoundError("Không tìm thấy backup")
    manifest, db, copied = _read(path), SessionLocal(), []
    _verify_declared_files(path, manifest)
    module = manifest["module"]; restored = 0
    try:
        related = manifest.get("related") or {}
        if module == "bookings":
            for row in related.get("resources") or []: _insert_if_missing(db, Resource, row)
            db.flush()
        model = MODULES[module]["model"]
        for row in manifest.get("records") or []: restored += int(_insert_if_missing(db, model, row, "employee_code" if module == "employees" else "id"))
        db.flush()
        if module == "todos":
            for name, child_model in (("subtasks", TodoSubtask), ("comments", Comment), ("attachments", Attachment), ("notifications", Notification)):
                for row in related.get(name) or []: _insert_if_missing(db, child_model, row)
            Path(UPLOAD_BASE).mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(path) as package:
                for item in package.infolist():
                    if not item.filename.startswith("attachments/") or item.is_dir(): continue
                    target = Path(UPLOAD_BASE) / Path(item.filename).name
                    if target.exists(): continue
                    with package.open(item) as source, target.open("xb") as output: shutil.copyfileobj(source, output, length=1024 * 1024)
                    copied.append(target)
        elif module == "employees":
            for row in related.get("users") or []: _insert_if_missing(db, User, row, "employee_code")
            for row in related.get("permissions") or []:
                exists = db.query(UserPermission).filter(UserPermission.employee_code == row["employee_code"], UserPermission.module == row["module"]).first()
                if not exists: _insert_if_missing(db, UserPermission, row)
        touched_models = {model}
        if module == "todos": touched_models.update({TodoSubtask, Comment, Attachment, Notification})
        elif module == "bookings": touched_models.add(Resource)
        elif module == "employees": touched_models.update({User, UserPermission})
        for touched in touched_models:
            if "id" in {column.key for column in inspect(touched).mapper.column_attrs}: _sync_sequence(db, touched)
        db.commit()
        return {"filename": filename, "module": module, "restored_records": restored, "skipped_records": len(manifest.get("records") or []) - restored, "restored_files": len(copied)}
    except Exception:
        db.rollback()
        for path in copied: path.unlink(missing_ok=True)
        raise
    finally: db.close()


def delete_backup(filename: str):
    path = BACKUP_BASE / Path(filename).name
    if path.name != filename or not path.is_file(): raise FileNotFoundError("Không tìm thấy backup")
    path.unlink()
