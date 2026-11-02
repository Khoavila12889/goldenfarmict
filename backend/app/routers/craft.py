"""Preview tài liệu bằng ArtCraft (WordCraft/GridCraft) thay OnlyOffice — chỉ đọc.

GET /craft/preview?config_id=&file_path=&file_id=&user_code=&user_role=
  - Kiểm tra quyền xem như OnlyOffice (folder permission + share).
  - doc/docx/odt/rtf  -> wordcraft-cli convert -> PDF (xem bằng trình PDF của browser).
  - xls/xlsx/csv      -> gridcraft-cli convert -> HTML (iframe sandboxed).
  - ppt/pptx/pdf      -> 400, giữ luồng OnlyOffice/WebP hiện tại.
  - Kết quả cache theo sha256 file gốc trong /app/storage/craft-cache.

CLI lấy từ env WORDCRAFT_CLI / GRIDRAFT_CLI (Dockerfile backend cài sẵn).
"""
import hashlib
import html
import json
import logging
import os
import re
import subprocess
import tempfile
import threading
import time
import zipfile

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
CRAFT_VERSION = os.environ.get("CRAFT_VERSION", "wc0.7.0-gc0.7.0-preview3")
# Số convert chạy song song + thời gian chờ slot.
# Trước đây = 1 slot + chờ 1s -> mở file thứ 2 trong lúc file thứ 1
# đang convert (xlsx nhiều sheet có thể mất 10-60s) là 503 ngay.
# VPS 6 CPU cho phép 3 parallel an toàn; chờ tối đa 120s để request
# thứ 2 xếp hàng thay vì báo lỗi.
CRAFT_CONCURRENCY = max(1, int(os.environ.get("CRAFT_CONCURRENCY", "3")))
CRAFT_QUEUE_TIMEOUT_SEC = int(os.environ.get("CRAFT_QUEUE_TIMEOUT_SEC", "120"))

_CONVERT_SLOT = threading.BoundedSemaphore(CRAFT_CONCURRENCY)

_WORD_EXTS = {"doc", "docx", "odt", "rtf"}
_SHEET_EXTS = {"xls", "xlsx", "csv"}


def _convert(engine: str, src: str, dst: str) -> None:
    binary = WORDCRAFT_CLI if engine == "word" else GRIDRAFT_CLI
    if not (binary and os.path.isfile(binary) and os.access(binary, os.X_OK)):
        raise HTTPException(503, "Máy chủ chưa cài công cụ convert Craft")
    # Some CLI versions accept damaged Office input as an empty workbook.
    if os.path.splitext(src)[1].lower() in {".xlsx", ".docx", ".odt"} and not zipfile.is_zipfile(src):
        raise HTTPException(422, "File Office không hợp lệ, thử mở bằng OnlyOffice")
    deadline = time.monotonic() + CRAFT_TIMEOUT_SEC

    def run(args):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(args, CRAFT_TIMEOUT_SEC)
        proc = subprocess.run(
            [binary, *args], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=remaining,
        )
        if proc.returncode != 0:
            logging.warning("[CRAFT] convert failed: %s", (proc.stderr or proc.stdout or "")[-500:])
            raise HTTPException(422, "Craft chưa đọc được file này, dùng OnlyOffice")
        return proc.stdout

    try:
        if engine == "sheet":
            # CLI HTML export defaults to only the active sheet. Include every
            # visible sheet, retaining each sheet's original exported formatting.
            info = json.loads(run(["info", src, "--json"]))
            sheets = [s["name"] for s in info["sheets"] if s.get("visibility", "Visible") == "Visible"]
            if not sheets:
                raise HTTPException(422, "Bảng tính không có sheet hiển thị")
            with open(dst, "w", encoding="utf-8") as output:
                output.write('<!doctype html><html><head><meta charset="utf-8"><title>GridCraft</title></head><body>')
                output.write('<nav>' + ' · '.join(
                    f'<a href="#sheet-{i}">{html.escape(name)}</a>' for i, name in enumerate(sheets)
                ) + '</nav>')
                for i, name in enumerate(sheets):
                    part = os.path.join(os.path.dirname(dst), f"sheet-{i}.html")
                    run(["convert", src, part, "--sheet", name])
                    with open(part, encoding="utf-8") as source:
                        content = source.read()
                    # Preserve styles without nesting complete HTML documents.
                    styles = ''.join(re.findall(r"<style\b[^>]*>.*?</style>", content, re.S))
                    body = content.split("<body>", 1)[1].split("</body>", 1)[0]
                    output.write(f'<section id="sheet-{i}"><h2>{html.escape(name)}</h2>{styles}{body}</section>')
                output.write('</body></html>')
        else:
            run(["convert", src, dst])
    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(422, "Craft trả về dữ liệu không hợp lệ, dùng OnlyOffice")
    except OSError:
        raise HTTPException(503, "Không thể khởi chạy Craft, dùng OnlyOffice")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Convert file quá lâu, thử file nhỏ hơn")
    if not os.path.isfile(dst) or os.path.getsize(dst) == 0:
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
    can_download = _check_download_allowed(config_id, folder_path, user_code, user_role) or share_grant is not None

    filename = os.path.basename(file_path)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in _WORD_EXTS:
        engine, out_ext, media = "word", "pdf", "application/pdf"
    elif ext in _SHEET_EXTS:
        engine, out_ext, media = "sheet", "html", "text/html; charset=utf-8"
    else:
        raise HTTPException(400, f"Craft preview chưa hỗ trợ .{ext}, dùng OnlyOffice")

    raw = _get_file_bytes(cfg, file_path, file_id)
    if not raw:
        raise HTTPException(422, "File rỗng hoặc không đọc được từ kho tài liệu")
    if len(raw) > CRAFT_MAX_BYTES:
        raise HTTPException(413, "File quá lớn cho preview Craft (tối đa 30MB)")

    os.makedirs(CRAFT_CACHE_DIR, exist_ok=True)
    digest = hashlib.sha256(f"{CRAFT_VERSION}:{engine}:{ext}:".encode() + raw).hexdigest()
    cached = os.path.join(CRAFT_CACHE_DIR, f"{digest}.{out_ext}")
    if not os.path.isfile(cached):
        _wait_start = time.monotonic()
        if not _CONVERT_SLOT.acquire(timeout=CRAFT_QUEUE_TIMEOUT_SEC):
            raise HTTPException(
                429,
                "Craft đang bận xử lý tài liệu khác. Hệ thống sẽ tự thử lại, hoặc mở bằng OnlyOffice.",
                headers={"Retry-After": "5"},
            )
        try:
            waited = time.monotonic() - _wait_start
            if waited > 5:
                logging.info("[CRAFT] queued %.1fs for %s (engine=%s)", waited, filename, engine)
            # Isolated inputs retain their extension; publish only complete output.
            if not os.path.isfile(cached):
                with tempfile.TemporaryDirectory(prefix="convert-", dir=CRAFT_CACHE_DIR) as tmp:
                    tmp_src = os.path.join(tmp, f"input.{ext}")
                    tmp_dst = os.path.join(tmp, f"preview.{out_ext}")
                    with open(tmp_src, "wb") as f:
                        f.write(raw)
                    _convert(engine, tmp_src, tmp_dst)
                    os.replace(tmp_dst, cached)
        finally:
            _CONVERT_SLOT.release()

    from urllib.parse import quote
    dl_name = f"{filename}.{out_ext}"
    headers = {
        "Content-Disposition": f"inline; filename=preview.{out_ext}; filename*=UTF-8''{quote(dl_name, safe='')}",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Download-Allowed": "true" if can_download else "false",
    }
    if out_ext == "html":
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
    return FileResponse(cached, media_type=media, headers=headers)
