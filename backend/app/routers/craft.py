"""Preview tài liệu bằng ArtCraft (WordCraft/GridCraft) thay OnlyOffice — chỉ đọc.

GET /craft/preview?config_id=&file_path=&file_id=&user_code=&user_role=
  - Kiểm tra quyền Y HỆT /documents/download (folder permission + share + download).
  - doc/docx/odt/rtf  -> wordcraft-cli convert -> PDF (xem bằng trình PDF của browser).
  - xls/xlsx/csv      -> gridcraft-cli convert -> HTML (iframe sandboxed).
  - ppt/pptx/pdf      -> 400, giữ luồng OnlyOffice/WebP hiện tại.
  - Kết quả cache theo sha256 file gốc trong /app/storage/craft-cache.

CLI lấy từ env WORDCRAFT_CLI / GRIDRAFT_CLI (Dockerfile backend cài sẵn).
"""
import hashlib
import logging
import os
import subprocess

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.routers.documents import (
    _check_download_allowed,
    _check_folder_permission,
    _check_share_access,
    _get_file_bytes,
    fetchone,
)

router = APIRouter(prefix="/api/craft", tags=["craft-preview"])

WORDCRAFT_CLI = os.environ.get("WORDCRAFT_CLI", "/opt/craft/bin/wordcraft-cli")
GRIDRAFT_CLI = os.environ.get("GRIDRAFT_CLI", "/opt/craft/bin/gridcraft-cli")
CRAFT_CACHE_DIR = os.environ.get("CRAFT_CACHE_DIR", "/app/storage/craft-cache")
CRAFT_MAX_BYTES = int(os.environ.get("CRAFT_MAX_BYTES", str(30 * 1024 * 1024)))
CRAFT_TIMEOUT_SEC = int(os.environ.get("CRAFT_TIMEOUT_SEC", "180"))
CRAFT_VERSION = os.environ.get("CRAFT_VERSION", "wc0.7.0-gc0.7.0")

_WORD_EXTS = {"doc", "docx", "odt", "rtf"}
_SHEET_EXTS = {"xls", "xlsx", "csv"}


def _convert(engine: str, src: str, dst: str) -> None:
    binary = WORDCRAFT_CLI if engine == "word" else GRIDRAFT_CLI
    if not (binary and os.path.isfile(binary) and os.access(binary, os.X_OK)):
        raise HTTPException(503, "Máy chủ chưa cài công cụ convert Craft")
    try:
        proc = subprocess.run(
            [binary, "convert", src, dst],
            capture_output=True, text=True, timeout=CRAFT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Convert file quá lâu, thử file nhỏ hơn")
    if proc.returncode != 0 or not os.path.isfile(dst):
        err = (proc.stderr or proc.stdout or "")[-500:]
        logging.warning("[CRAFT] convert failed: %s", err)
        raise HTTPException(422, "Craft chưa đọc được file này, dùng OnlyOffice")


@router.get("/preview")
def craft_preview(
    config_id: int = Query(...),
    file_path: str = Query(...),
    file_id: str = Query(""),
    user_code: str = Query(""),
    user_role: str = Query("user"),
):
    active_sql = "" if user_role in ("admin", "head") else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    folder_path = os.path.dirname(file_path).replace("\\", "/")
    allowed = _check_folder_permission(config_id, folder_path, user_code, user_role)
    share_grant = _check_share_access(config_id, file_path, user_code, user_role)
    allowed = allowed or (share_grant is not None)
    if not allowed:
        raise HTTPException(403, "No permission to access this file")
    if not _check_download_allowed(config_id, folder_path, user_code, user_role) and share_grant is None:
        raise HTTPException(403, "Download not allowed for this file")

    filename = os.path.basename(file_path)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in _WORD_EXTS:
        engine, out_ext, media = "word", "pdf", "application/pdf"
    elif ext in _SHEET_EXTS:
        engine, out_ext, media = "sheet", "html", "text/html; charset=utf-8"
    else:
        raise HTTPException(400, f"Craft preview chưa hỗ trợ .{ext}, dùng OnlyOffice")

    raw = _get_file_bytes(cfg, file_path, file_id)
    if len(raw) > CRAFT_MAX_BYTES:
        raise HTTPException(413, "File quá lớn cho preview Craft (tối đa 30MB)")

    os.makedirs(CRAFT_CACHE_DIR, exist_ok=True)
    digest = hashlib.sha256(CRAFT_VERSION.encode() + raw).hexdigest()
    cached = os.path.join(CRAFT_CACHE_DIR, f"{digest}.{out_ext}")
    if not os.path.isfile(cached):
        tmp_src = os.path.join(CRAFT_CACHE_DIR, f"{digest}.src")
        # CLI đoán định dạng đầu ra theo đuôi file -> file tạm phải có đuôi thật.
        tmp_dst = os.path.join(CRAFT_CACHE_DIR, f"{digest}.tmp.{out_ext}")
        with open(tmp_src, "wb") as f:
            f.write(raw)
        try:
            _convert(engine, tmp_src, tmp_dst)
            os.replace(tmp_dst, cached)
        finally:
            for p in (tmp_src, tmp_dst):
                try:
                    os.remove(p)
                except OSError:
                    pass

    from urllib.parse import quote
    dl_name = f"{filename}.{out_ext}"
    ascii_fallback = dl_name.encode("ascii", "ignore").decode() or f"craft-preview.{out_ext}"
    return FileResponse(
        cached, media_type=media, filename=ascii_fallback,
        headers={"Content-Disposition":
                 f"inline; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(dl_name)}"},
    )
