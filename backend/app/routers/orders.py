import os
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Query

from app.core.auth import verify_session
from app.routers.auth import _get_effective_permissions

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _auth(code, role, dept, token):
    identity = verify_session(code, role, dept, token)
    if identity.get("user_role") == "admin":
        return identity
    permission = _get_effective_permissions(identity.get("user_code", "")).get("orders", {})
    if not permission.get("can_view"):
        raise HTTPException(status_code=403, detail="Bạn chưa được cấp quyền xem Trung tâm đơn hàng")
    return identity


def _sales_config():
    base_url = os.getenv("SALES_BOT_API_URL", "http://host.docker.internal:3107").rstrip("/")
    api_key = os.getenv("SALES_BOT_API_KEY") or os.getenv("N8N_ORDER_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Chưa cấu hình SALES_BOT_API_KEY")
    return base_url, api_key


async def _sales_get(path: str, params=None):
    base_url, api_key = _sales_config()
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                f"{base_url}/api/zalo-personal{path}",
                params=params,
                headers={"X-Bot-Key": api_key},
            )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Không kết nối được Sales Bot API") from exc
    if response.status_code >= 400 or not payload.get("success"):
        raise HTTPException(status_code=response.status_code, detail=payload.get("message") or "Sales Bot API báo lỗi")
    return payload


@router.get("")
async def list_orders(
    status: str = Query("today", pattern="^(today|open|all)$"),
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=50),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    return await _sales_get("/orders", {"status": status, "q": q, "page": page, "page_size": page_size})


@router.get("/{order_number}")
async def order_detail(
    order_number: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    return await _sales_get(f"/orders/{order_number}")
