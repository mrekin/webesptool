from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from typing import Optional
from .database import (
    get_active_news,
    get_all_news,
    get_all_news_admin,
    get_news_by_id,
    create_news,
    update_news,
    delete_news,
    SUPPORTED_LANGUAGES
)

router = APIRouter()

def get_cfg(request):
    """Get config from app.state"""
    return request.app.state.config

def get_log(request):
    """Get logger from app.state"""
    return request.app.state.log

def get_templates(request):
    """Get templates from app.state"""
    return request.app.state.templates

# Config values
MAX_PINNED_NEWS = 2  # Maximum number of news that can be pinned at the same time


@router.get("/api/news")
async def api_get_news(request: Request, lang: str, limit: int = None):
    """Get active news for user

    Args:
        lang: Language code (any string, e.g., "en", "ru", "pl", "de", etc.) - REQUIRED
        limit: Maximum number of news to return (optional, uses config default if not provided)

    Returns:
        JSON with news list

    Note:
        - No fallback: if lang not found in content, returns empty list for that news
        - Returns empty list if DB not initialized
        - Server time is used
        - Backend doesn't validate or hardcode language list - it's content-driven
        - lang is REQUIRED parameter - no default value
    """
    try:
        cfg = get_cfg(request)
        # Use limit from config if not provided
        if limit is None:
            limit = cfg['news']['max_items_on_main']

        get_log(request).info(f"[API /api/news] lang={lang}, limit={limit}")
        news = await get_active_news(lang, limit)
        get_log(request).info(f"[API /api/news] returning {len(news)} news")
        return {"news": news}
    except Exception as e:
        # If DB doesn't exist, return empty list
        get_log(request).warning(f"Failed to get news: {e}")
        return {"news": []}


@router.get("/api/news/archive")
async def api_get_news_archive(request: Request, lang: str, offset: int = 0, limit: int = None):
    """Get all news for archive modal

    Args:
        lang: Language code (any string, REQUIRED)
        offset: Pagination offset
        limit: Maximum number of news to return (optional, uses config default if not provided)

    Note:
        - No fallback: only returns news that have content for requested language
        - Backend doesn't validate or hardcode language list
        - lang is REQUIRED parameter - no default value
    """
    try:
        cfg = get_cfg(request)
        # Use limit from config if not provided
        if limit is None:
            limit = cfg['news']['archive_page_size']

        news = await get_all_news(lang, offset, limit)
        return {"news": news}
    except Exception as e:
        get_log(request).warning(f"Failed to get news archive: {e}")
        return {"news": []}


@router.get("/api/news/{news_id}")
async def api_get_news_by_id(news_id: int):
    """Get news by ID (for admin)"""
    news = await get_news_by_id(news_id)
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    return news


# Admin endpoints (no auth initially, restricted by network)
@router.post("/api/admin/news")
async def api_create_news(request: Request, news_data: dict):
    """Create new news item"""
    try:
        # Check pin limit before creating
        if news_data.get("is_pinned"):
            all_news = await get_all_news_admin()
            pinned_count = sum(1 for n in all_news if n.get("is_pinned"))

            if pinned_count >= MAX_PINNED_NEWS:
                # Find and unpin oldest pinned news
                pinned_news = [n for n in all_news if n.get("is_pinned")]
                if pinned_news:
                    oldest_pinned = min(pinned_news, key=lambda n: n["created_at"])
                    await update_news(oldest_pinned["id"], {"is_pinned": False})
                    get_log(request).info(f"Auto-unpinned news id={oldest_pinned['id']} to make room for new news (max {MAX_PINNED_NEWS} pinned)")

        news_id = await create_news(news_data)
        return {"id": news_id, "status": "created"}
    except Exception as e:
        get_log(request).error(f"Failed to create news: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/admin/news/{news_id}")
async def api_update_news(request: Request, news_id: int, news_data: dict):
    """Update news item"""
    try:
        # Check pin limit before updating (if setting is_pinned=True)
        if news_data.get("is_pinned"):
            all_news = await get_all_news_admin()
            # Count pinned news excluding the one being updated
            pinned_news = [n for n in all_news if n.get("is_pinned") and n["id"] != news_id]

            if len(pinned_news) >= MAX_PINNED_NEWS:
                # Find and unpin oldest pinned news
                oldest_pinned = min(pinned_news, key=lambda n: n["created_at"])
                await update_news(oldest_pinned["id"], {"is_pinned": False})
                get_log(request).info(f"Auto-unpinned news id={oldest_pinned['id']} to make room for id={news_id} (max {MAX_PINNED_NEWS} pinned)")

        success = await update_news(news_id, news_data)
        if not success:
            raise HTTPException(status_code=404, detail="News not found")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        get_log(request).error(f"Failed to update news: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/admin/news/{news_id}")
async def api_delete_news(news_id: int):
    """Delete news item"""
    success = await delete_news(news_id)
    if not success:
        raise HTTPException(status_code=404, detail="News not found")
    return {"status": "deleted"}


@router.get("/api/admin/all-news")
async def api_get_all_news_admin():
    """Get all news for admin (without language filtering)

    Returns all news items with full content in all languages.
    Used for admin panel to refresh the news list.
    """
    try:
        all_news = await get_all_news_admin()
        return {"news": all_news}
    except Exception as e:
        get_log(request).warning(f"Failed to get all news: {e}")
        return {"news": []}


@router.post("/api/admin/news/{news_id}/toggle")
async def toggle_news(news_id: int):
    """Toggle status between show/hide"""
    existing = await get_news_by_id(news_id)
    if not existing:
        raise HTTPException(status_code=404, detail="News not found")

    new_status = "hide" if existing["status"] == "show" else "show"
    await update_news(news_id, {"status": new_status})

    return {"status": new_status}


@router.post("/api/admin/news/{news_id}/pin")
async def pin_news(request: Request, news_id: int, is_pinned: bool = True):
    """Pin/unpin news

    Automatically unpins oldest news if trying to pin more than MAX_PINNED_NEWS (2).

    Args:
        news_id: ID of the news item
        is_pinned: True to pin, False to unpin

    Returns:
        JSON with is_pinned, optional message, and optional unpinned_news_id
    """
    unpinned_news_id = None
    message = None

    if is_pinned:
        # Get all currently pinned news (excluding current one)
        all_news = await get_all_news_admin()
        pinned_news = [n for n in all_news if n.get("is_pinned") and n["id"] != news_id]

        if len(pinned_news) >= MAX_PINNED_NEWS:
            # Find oldest pinned news (by created_at)
            oldest_pinned = min(pinned_news, key=lambda n: n["created_at"])

            # Get title for message - try languages from config in order
            content = oldest_pinned.get("content", {})
            title = None
            for lang in SUPPORTED_LANGUAGES:
                lang_code = lang["code"]
                if content.get(lang_code, {}).get("title"):
                    title = content[lang_code]["title"]
                    break

            if not title:
                title = f"news id={oldest_pinned['id']}"

            # Unpin the oldest
            await update_news(oldest_pinned["id"], {"is_pinned": False})
            unpinned_news_id = oldest_pinned["id"]

            message = f"Auto-unpinned: '{title}' (max {MAX_PINNED_NEWS} pinned news allowed)"
            get_log(request).warning(f"Auto-unpinned news id={oldest_pinned['id']} ({title}) to make room for id={news_id} (max {MAX_PINNED_NEWS} pinned allowed)")

    await update_news(news_id, {"is_pinned": is_pinned})

    result = {
        "is_pinned": is_pinned
    }

    if unpinned_news_id:
        result["unpinned_news_id"] = unpinned_news_id

    if message:
        result["message"] = message

    return result


# Admin UI routes (HTMX + Jinja2)
@router.get("/admin/news", response_class=HTMLResponse)
async def admin_news_list(request: Request, news_id: Optional[int] = None):
    """Admin page: unified news editor with list, form, and preview

    Args:
        news_id: Optional news ID to pre-select (from query param)
    """
    templates = get_templates(request)
    all_news = await get_all_news_admin()
    # Explicitly use None when news_id is not provided
    selected_id = news_id if news_id is not None else None
    return templates.TemplateResponse("admin/news_edit.html", {
        "request": request,
        "news_list": all_news,
        "selected_id": selected_id,
        "languages": SUPPORTED_LANGUAGES
    })


