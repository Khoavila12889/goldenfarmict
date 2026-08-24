"""
pdf_pages.py — Convert file đính kèm PDF của thông báo nội bộ (Dashboard) thành
các trang ảnh WebP để trình duyệt hiển thị nhanh hơn nhiều so với render PDF
trực tiếp qua OnlyOffice Document Server.

Cơ chế:
- Upload PDF  → hàng đợi convert nền (ThreadPool, không chặn request upload).
- Lần xem đầu → nếu chưa có sẵn (PDF cũ trước khi có tính năng) sẽ convert lazy.
- Kết quả cache tại backend/uploads/forum/pages/<doc_id>/ + manifest.json
  (manifest được ghi CUỐI CÙNG → tồn tại manifest = dữ liệu đã đầy đủ).
- doc_id = tên file lưu trên đĩa bỏ phần mở rộng (uuid hex, không đoán được).
"""
import json
import logging
import os
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image

from app.services.upload_service import FORUM_UPLOAD_BASE

log = logging.getLogger(__name__)

PAGES_BASE = os.path.join(FORUM_UPLOAD_BASE, 'pages')
# Cache trang ảnh cho module Tài liệu (Documents — file PDF trên FTP/SMB/GDrive)
DOC_PAGES_BASE = os.path.join(os.path.dirname(FORUM_UPLOAD_BASE), 'documents', 'pages')

# Cấu hình render — cân bằng tốc độ / dung lượng / độ nét (có thể override bằng .env)
_RENDER_DPI = int(os.environ.get('PDF_PAGES_DPI', '120'))
_MAX_PAGE_WIDTH = int(os.environ.get('PDF_PAGES_MAX_WIDTH', '2000'))
_WEBP_QUALITY = int(os.environ.get('PDF_PAGES_QUALITY', '80'))

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='pdf2webp')
_locks_guard = threading.Lock()
_locks: dict[tuple, threading.Lock] = {}   # (base, doc_id) -> Lock (chống convert trùng lặp)
_pending: set[tuple] = set()               # các (base, doc_id) đang/đợi convert


def _doc_dir(doc_id: str, base: str = PAGES_BASE) -> str:
    return os.path.join(base, doc_id)


def _manifest_path(doc_id: str, base: str = PAGES_BASE) -> str:
    return os.path.join(_doc_dir(doc_id, base), 'manifest.json')


def read_manifest(doc_id: str, base: str = PAGES_BASE) -> Optional[dict]:
    try:
        with open(_manifest_path(doc_id, base), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _lock_for(key: tuple) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def convert_pdf_to_webp(pdf_path: str, doc_id: str, base: str = PAGES_BASE) -> dict:
    """Rasterize từng trang PDF thành WebP. Trả về manifest, raise nếu lỗi."""
    out_dir = _doc_dir(doc_id, base)
    os.makedirs(out_dir, exist_ok=True)

    pages: list[str] = []
    width = height = 0
    started = time.time()
    zoom_base = _RENDER_DPI / 72.0

    with fitz.open(pdf_path) as doc:
        if doc.needs_pass:
            raise ValueError('PDF bảo vệ bằng mật khẩu, không thể convert')
        for idx, page in enumerate(doc):
            rect = page.rect
            zoom = zoom_base
            if rect.width > 0 and rect.width * zoom > _MAX_PAGE_WIDTH:
                zoom = _MAX_PAGE_WIDTH / rect.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            fname = f'p-{idx + 1:03d}.webp'
            img.save(os.path.join(out_dir, fname), 'WEBP', quality=_WEBP_QUALITY, method=4)
            pages.append(fname)
            width, height = pix.width, pix.height

    manifest = {
        'ready': True,
        'page_count': len(pages),
        'pages': pages,
        'width': width,
        'height': height,
        'dpi': _RENDER_DPI,
        'quality': _WEBP_QUALITY,
        'took_ms': int((time.time() - started) * 1000),
    }
    # Ghi qua file tạm rồi đổi tên nguyên tử — tránh manifest hỏng nếu process chết
    tmp = _manifest_path(doc_id, base) + f'.tmp-{os.getpid()}'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False)
    os.replace(tmp, _manifest_path(doc_id, base))
    return manifest


def _convert_job(key: tuple, pdf_path: str):
    base, doc_id = key
    lock = _lock_for(key)
    with lock:
        if read_manifest(doc_id, base):
            with _locks_guard:
                _pending.discard(key)
            return
        try:
            m = convert_pdf_to_webp(pdf_path, doc_id, base)
            log.info(f"[PDF→WebP] {base} {doc_id}: {m['page_count']} trang / {m['took_ms']}ms")
        except Exception as e:
            log.warning(f"[PDF→WebP] {base} {doc_id} thất bại: {e}")
            shutil.rmtree(_doc_dir(doc_id, base), ignore_errors=True)
        finally:
            with _locks_guard:
                _pending.discard(key)


def schedule_source(pdf_path: str, doc_id: str, base: str = PAGES_BASE) -> bool:
    """Hàng đợi convert nền cho 1 file PDF bất kỳ. Trả về True nếu đã/đang xử lý."""
    key = (os.path.realpath(base), doc_id)
    if not pdf_path or not os.path.exists(pdf_path):
        return False
    if read_manifest(doc_id, base):
        return True
    with _locks_guard:
        if key in _pending:
            return True
        _pending.add(key)
    _executor.submit(_convert_job, key, pdf_path)
    return True


def schedule_pdf_pages(stored_name: str) -> Optional[str]:
    """Hàng đợi convert nền cho PDF đính kèm thông báo. Trả về doc_id nếu đã/đang xử lý."""
    if not stored_name or not stored_name.lower().endswith('.pdf'):
        return None
    doc_id = os.path.splitext(stored_name)[0]
    pdf_path = os.path.join(FORUM_UPLOAD_BASE, os.path.basename(stored_name))
    if not os.path.exists(pdf_path):
        return None
    schedule_source(pdf_path, doc_id, PAGES_BASE)
    return doc_id


def pages_status(stored_name: str) -> dict:
    """
    Trạng thái trang ảnh của một PDF đính kèm.
    Chưa có manifest → tự lên lịch convert lazy (fallback cho PDF cũ).
    """
    safe = os.path.basename(stored_name or '')
    if not safe.lower().endswith('.pdf'):
        return {'ready': False, 'converting': False, 'supported': False}
    scheduled = schedule_pdf_pages(safe)
    m = read_manifest(os.path.splitext(safe)[0])
    if m:
        return {
            'ready': True,
            'converting': False,
            'supported': True,
            'page_count': m['page_count'],
            'width': m['width'],
            'height': m['height'],
            'pages': list(m['pages']),
        }
    return {'ready': False, 'converting': bool(scheduled), 'supported': True}


def delete_pdf_pages(stored_name_or_doc_id: str) -> bool:
    """Xóa cache trang ảnh khi bài đăng bị xóa/thay file."""
    name = os.path.basename(stored_name_or_doc_id or '')
    doc_id = os.path.splitext(name)[0]
    d = _doc_dir(doc_id)
    if not os.path.isdir(d):
        return False
    shutil.rmtree(d, ignore_errors=True)
    return True
