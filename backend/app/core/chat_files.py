"""Short-lived file capabilities issued only through authenticated chat endpoints.

The database retains canonical URLs; signatures are never archived or persisted.
"""
import hashlib
import hmac
import os
import re
import time
from urllib.parse import parse_qs, urlsplit

PREFIX = "/api/chat/uploads/"
TTL_SECONDS = 24 * 3600


def _signature(filename: str, expires: int) -> str:
    secret = os.environ.get("SESSION_SECRET") or os.environ.get("ONLYOFFICE_SECRET")
    if not secret:
        raise RuntimeError("SESSION_SECRET must be configured")
    return hmac.new(secret.encode(), f"chat-file:{filename}:{expires}".encode(), hashlib.sha256).hexdigest()


def canonical_file_url(url: str) -> str:
    parsed = urlsplit(url)
    filename = parsed.path.removeprefix(PREFIX)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith(PREFIX) or not re.fullmatch(r"[a-f0-9]{32}\.(?:pdf|doc|docx|xlsx|jpg|jpeg|png|webp)", filename):
        raise ValueError("Đường dẫn tệp chat không hợp lệ")
    return PREFIX + filename


def signed_file_url(url: str | None) -> str | None:
    if not url:
        return None
    path = canonical_file_url(url)
    expires = int(time.time()) + TTL_SECONDS
    return f"{path}?expires={expires}&signature={_signature(path[len(PREFIX):], expires)}"


def verify_file_signature(filename: str, expires: int, signature: str) -> bool:
    return int(time.time()) <= expires <= int(time.time()) + TTL_SECONDS and hmac.compare_digest(_signature(filename, expires), signature)


def validate_attachment(url: str) -> str:
    path = canonical_file_url(url)
    query = parse_qs(urlsplit(url).query)
    try:
        expires = int(query["expires"][0])
        signature = query["signature"][0]
    except (KeyError, ValueError, IndexError):
        raise ValueError("Liên kết tệp không hợp lệ, vui lòng tải lại tệp")
    if not verify_file_signature(path[len(PREFIX):], expires, signature):
        raise ValueError("Liên kết tệp đã hết hạn, vui lòng tải lại tệp")
    return path
