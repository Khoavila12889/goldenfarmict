"""Mã hoá at-rest cho mật khẩu IMAP/SMTP và token OAuth của module Mail.

Key lấy từ env `MAIL_SECRET_KEY` (khuyến nghị 32 byte base64-urlsafe).
Nếu chưa cấu hình, fallback sang `SESSION_SECRET`/`ONLYOFFICE_SECRET` để không
làm chết app khi nâng cấp, nhưng log cảnh báo khi khởi động.
"""
import base64
import hashlib
import os

_PREFIX = "v1:"
_AAD = b"goldenfarm-mail"


def _raw_key() -> str:
    value = (
        os.environ.get("MAIL_SECRET_KEY")
        or os.environ.get("SESSION_SECRET")
        or os.environ.get("ONLYOFFICE_SECRET")
        or ""
    ).strip()
    if not value:
        raise RuntimeError(
            "Thiếu MAIL_SECRET_KEY. Thêm key 32 byte (base64-urlsafe) vào .env trước khi lưu hộp thư."
        )
    return value


def _key() -> bytes:
    raw = _raw_key()
    try:
        decoded = base64.urlsafe_b64decode(raw.encode("ascii"))
        if len(decoded) in (16, 24, 32):
            return decoded
    except Exception:
        pass
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_secret(plaintext: str) -> str:
    """Mã hoá AES-GCM. Trả về chuỗi `v1:<base64(nonce+ciphertext)>`."""
    if not plaintext:
        return ""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, plaintext.encode("utf-8"), _AAD)
    return _PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_secret(token: str) -> str:
    """Giải mã secret. Hỗ trợ dữ liệu cũ dạng plaintext (không có tiền tố v1:)."""
    if not token:
        return ""
    if not token.startswith(_PREFIX):
        return token
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    raw = base64.urlsafe_b64decode(token[len(_PREFIX):].encode("ascii"))
    nonce, ciphertext = raw[:12], raw[12:]
    return AESGCM(_key()).decrypt(nonce, ciphertext, _AAD).decode("utf-8")
