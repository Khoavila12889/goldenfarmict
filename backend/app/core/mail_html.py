"""Chuẩn hoá HTML email trước khi trả về UI.

Ưu tiên `nh3` (Rust ammonia), fallback `bleach`, cuối cùng là bộ lọc regex tối
thiểu. Không bao giờ trả nguyên HTML thô từ người gửi ra trình duyệt.
"""
import re

try:  # pragma: no cover - phụ thuộc môi trường
    import nh3
except Exception:  # pragma: no cover
    nh3 = None

try:  # pragma: no cover
    import bleach
except Exception:  # pragma: no cover
    bleach = None


ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "caption", "code", "div", "em",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p",
    "pre", "s", "small", "span", "strong", "sub", "sup", "table", "tbody",
    "td", "tfoot", "th", "thead", "tr", "u", "ul",
}

ALLOWED_ATTRS = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "table": {"cellpadding", "cellspacing", "border", "width"},
    "div": {"align"},
    "p": {"align"},
    "span": {"style"},
}

ALLOWED_SCHEMES = {"http", "https", "mailto", "cid"}

_SCRIPT_RE = re.compile(r"(?is)<(script|style|iframe|object|embed|form|link|meta)\b.*?>.*?</\1>")
_VOID_DANGER_RE = re.compile(r"(?is)<(script|style|iframe|object|embed|form|link|meta)\b[^>]*/?>")
_EVENT_ATTR_RE = re.compile(r"(?is)\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)")
_JS_URL_RE = re.compile(r"(?is)(href|src)\s*=\s*(\"|')\s*javascript:[^\"']*\2")


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    if nh3 is not None:
        return nh3.clean(
            html,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRS,
            url_schemes=ALLOWED_SCHEMES,
            link_rel="noopener noreferrer nofollow",
        )
    if bleach is not None:
        return bleach.clean(
            html,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRS,
            protocols=ALLOWED_SCHEMES,
            strip=True,
        )
    cleaned = _SCRIPT_RE.sub("", html)
    cleaned = _VOID_DANGER_RE.sub("", cleaned)
    cleaned = _EVENT_ATTR_RE.sub("", cleaned)
    cleaned = _JS_URL_RE.sub(r'\1=\2#\2', cleaned)
    return cleaned


def plain_snippet(text: str, limit: int = 255) -> str:
    snippet = re.sub(r"\s+", " ", text or "").strip()
    return snippet[:limit]
