"""Cấu hình logging dùng chung cho toàn bộ backend."""
import logging
import os
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path


_DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_SECRET_QUERY_RE = re.compile(
    r"([?&](?:token|admin_token|access_token|refresh_token)=)[^&\s\"]+",
    re.IGNORECASE,
)


def _redact(value):
    if isinstance(value, str):
        return _SECRET_QUERY_RE.sub(r"\1[REDACTED]", value)
    if isinstance(value, tuple):
        return tuple(_redact(item) for item in value)
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact(item) for key, item in value.items()}
    return value


class SensitiveDataFilter(logging.Filter):
    """Che token trong message/arguments trước khi ghi file log."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _redact(record.msg)
        record.args = _redact(record.args)
        return True


def configure_logging() -> Path:
    """Ghi log của root logger và các module vào một file xoay vòng.

    Hàm idempotent để không gắn trùng handler khi app được import lại.
    """
    log_dir = Path(os.getenv("APP_LOG_DIR", str(_DEFAULT_LOG_DIR)))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / os.getenv("APP_LOG_FILE", "goldenfarmict.log")

    root = logging.getLogger()
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root.setLevel(level)

    resolved_log_file = log_file.resolve()
    already_configured = any(
        isinstance(handler, RotatingFileHandler)
        and Path(handler.baseFilename).resolve() == resolved_log_file
        for handler in root.handlers
    )
    if not already_configured:
        handler = RotatingFileHandler(
            log_file,
            maxBytes=int(os.getenv("APP_LOG_MAX_BYTES", str(10 * 1024 * 1024))),
            backupCount=int(os.getenv("APP_LOG_BACKUP_COUNT", "10")),
            encoding="utf-8",
        )
        handler.setLevel(level)
        handler.addFilter(SensitiveDataFilter())
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
        ))
        root.addHandler(handler)

        # Uvicorn tự có handler và tắt propagate, nên cần gắn file
        # handler trực tiếp để access/error log cũng nằm trong file chung.
        for logger_name in ("uvicorn", "uvicorn.access"):
            server_logger = logging.getLogger(logger_name)
            if not any(
                isinstance(existing, RotatingFileHandler)
                and Path(existing.baseFilename).resolve() == resolved_log_file
                for existing in server_logger.handlers
            ):
                server_logger.addHandler(handler)

    return log_file
