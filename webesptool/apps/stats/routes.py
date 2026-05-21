import logging
from datetime import datetime, timezone
from enum import Enum

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from .storage import (
    OP_TYPE_MAP,
    GROUP_BY_MAP,
    get_download_stats,
    get_visit_stats,
    parse_user_agent,
    record_visit_event,
)


class DownloadGroupBy(str, Enum):
    repository = "repository"
    version = "version"
    device = "device"
    operation = "operation"
    firmware = "firmware"
    platform = "platform"
    country = "country"
    city = "city"
    browser = "browser"
    os = "os"


class VisitGroupBy(str, Enum):
    country = "country"
    city = "city"
    browser = "browser"
    os = "os"


logger = logging.getLogger(__name__)

router = APIRouter()


def _get_cfg(request: Request) -> dict:
    return request.app.state.config.get("stats", {})


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/api/stats/visit")
async def record_visit(request: Request):
    cfg = _get_cfg(request)
    if not cfg.get("enabled", False):
        return {"status": "disabled"}

    ttl_days = cfg.get("ttl_days", 90)
    client_ip = _get_client_ip(request)

    from service import getClientIp, getIpInfo

    ip_info = await getIpInfo(client_ip) if client_ip else None

    ua_raw = request.headers.get("user-agent", "")
    browser, os_name = parse_user_agent(ua_raw)

    data = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "country": ip_info.get("country") if ip_info else None,
        "city": ip_info.get("city") if ip_info else None,
        "browser": browser,
        "os": os_name,
        "referer": request.headers.get("referer"),
    }

    await record_visit_event(data, ttl_days)
    return {"status": "ok"}


@router.get("/api/stats/downloads")
async def api_get_download_stats(
    request: Request,
    group_by: DownloadGroupBy = DownloadGroupBy.repository,
    period: int = Query(7, ge=1, le=365, description="Number of days"),
    limit: int = Query(None, ge=1, description="Return top N results. Omit for all"),
):
    cfg = _get_cfg(request)
    if not cfg.get("enabled"):
        return JSONResponse(content={"error": "stats disabled"}, status_code=404)
    dl_cfg = cfg.get("downloads", {})
    if not dl_cfg.get("stats", True):
        return JSONResponse(content={"error": "stats disabled"}, status_code=404)
    allowed = dl_cfg.get("public_group_by", [])
    if allowed and group_by.value not in allowed:
        return JSONResponse(content={"error": "invalid group_by"}, status_code=400)
    return await get_download_stats(group_by.value, period, limit)


@router.get("/api/stats/visits")
async def api_get_visit_stats(
    request: Request,
    group_by: VisitGroupBy = VisitGroupBy.country,
    period: int = Query(7, ge=1, le=365, description="Number of days"),
    limit: int = Query(None, ge=1, description="Return top N results. Omit for all"),
):
    cfg = _get_cfg(request)
    visits_cfg = cfg.get("visits", {})
    if not visits_cfg.get("stats", False):
        return JSONResponse(content={"error": "not found"}, status_code=404)
    return await get_visit_stats(group_by.value, period, limit)


def build_download_event_data(
    request: Request,
    device: str | None,
    version: str | None,
    src: str | None,
    u: str,
    e: bool,
    fw_type: str | None,
    ip_info: dict | None,
) -> dict:
    ua_raw = request.headers.get("user-agent", "")
    browser, os_name = parse_user_agent(ua_raw)

    op_type = OP_TYPE_MAP.get(u, "unknown")
    platform = "esp" if e else "other"

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "dev": device,
        "ver": version,
        "src": src,
        "op": op_type,
        "fw": fw_type,
        "platform": platform,
        "country": ip_info.get("country") if ip_info else None,
        "city": ip_info.get("city") if ip_info else None,
        "browser": browser,
        "os": os_name,
        "ua": ua_raw,
        "referer": request.headers.get("referer"),
    }
