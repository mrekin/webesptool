import aiosqlite
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)

# DB path and languages from config, with default fallback
try:
    from webesptool.config import cfg
    DB_PATH = cfg.news.db_path
    SUPPORTED_LANGUAGES = cfg.news.languages
except (ImportError, AttributeError):
    DB_PATH = "db/news.db"
    # Fallback to default languages if config not available
    SUPPORTED_LANGUAGES = [
        {"code": "en", "name": "English", "flag": "🇬🇧"},
        {"code": "ru", "name": "Russian", "flag": "🇷🇺"},
        {"code": "pl", "name": "Polish", "flag": "🇵🇱"}
    ]


async def init_db():
    """Initialize SQLite database with news table

    Schema использует NoSQL-like подход:
    - id: глобальный инкрементальный ID
    - start_date: дата публикации (с которой отображаем)
    - seq_id: инкрементальный ID в рамках даты для сортировки
    - end_date: дата до которой отображается (null = бессрочно). Вычисляется из start_date + duration_days
    - status: show/hide (показываем/не показываем)
    - is_pinned: закреплено ли (да/нет)
    - pin_order: (deprecated, оставлен для совместимости со старыми БД)
    - content: JSON с контентом для каждого языка (динамический список из config)
    """
    # Create db directory if it doesn't exist
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        # Enable WAL mode for better concurrency
        await db.execute("PRAGMA journal_mode=WAL")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_date TEXT NOT NULL,
                seq_id INTEGER NOT NULL,
                end_date TEXT,
                status TEXT NOT NULL DEFAULT 'show',
                is_pinned BOOLEAN DEFAULT 0,
                pin_order INTEGER DEFAULT 0,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(start_date, seq_id)
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_news_dates
            ON news(start_date, end_date)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_news_status
            ON news(status)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_news_pinned
            ON news(is_pinned, pin_order)
        """)
        await db.commit()


async def get_next_seq_id(date: str) -> int:
    """Get next seq_id for given date"""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("""
            SELECT COALESCE(MAX(seq_id), 0) + 1
            FROM news
            WHERE start_date = ?
        """, (date,))
        result = await cursor.fetchone()
        return result[0] if result else 1


async def create_news(data: Dict[str, Any]) -> int:
    """Create new news item

    Args:
        data: Dictionary with news data. Can include:
            - start_date: Start date (YYYY-MM-DD format)
            - duration_days: Number of days to show (optional, null = unlimited)
            - end_date: Explicit end date (optional, calculated from duration_days if not provided)
            - status: 'show' or 'hide'
            - is_pinned: Boolean
            - content: Dict with language codes as keys, e.g. {en: {title, body}, ru: {title, body}}

    Returns:
        The ID of the created news item
    """
    # Get or set start_date (default to today)
    start_date_str = data.get('start_date')
    if not start_date_str:
        start_date_str = datetime.utcnow().date().isoformat()
    else:
        # Ensure it's just the date part (YYYY-MM-DD)
        start_date_str = start_date_str.split('T')[0]

    # Calculate end_date from duration_days if provided
    end_date = data.get("end_date")
    duration_days = data.get("duration_days")

    if duration_days is not None and duration_days != "" and start_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date_dt = start_date.fromordinal(start_date.toordinal() + int(duration_days))
            end_date = end_date_dt.date().isoformat()
        except (ValueError, TypeError):
            pass  # Keep end_date as is or None

    # Get next seq_id for this date
    seq_id = await get_next_seq_id(start_date_str)

    # Use content from data if provided, otherwise empty dict
    content = data.get("content", {})

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("""
            INSERT INTO news (start_date, seq_id, end_date, status, is_pinned, pin_order, content)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            start_date_str,
            seq_id,
            end_date,
            data.get("status", "show"),
            1 if data.get("is_pinned") else 0,
            0,  # pin_order deprecated, always 0
            json.dumps(content)
        ))
        await db.commit()
        return cursor.lastrowid


async def get_active_news(lang: str, limit: int = 5, offset: int = 0) -> List[Dict]:
    """Get active news for language

    Args:
        lang: Language code (en, ru, pl)
        limit: Maximum number of news to return
        offset: Number of items to skip for pagination

    Returns:
        List of news items with translated content

    Important:
        - NO fallback to English if lang not found
        - If news doesn't have content for requested lang, it's not returned
        - Server time is used (datetime('now')), independent of client
        - Language filtering happens first: loads all active news, filters by lang, then applies offset and limit
        - Sorting: pinned first (by pin_order), then by date (newest first), then by seq_id
        - Offset-based pagination used because IDs are not monotonic in the sorted order
    """
    # Use only date part (YYYY-MM-DD) for proper comparison with stored dates
    now = datetime.utcnow().date().isoformat()
    logger.info(f"[get_active_news] lang={lang}, now={now}, limit={limit}, offset={offset}")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Load all active news (reasonable limit for performance)
        cursor = await db.execute("""
            SELECT id, start_date, seq_id, end_date, content, is_pinned, pin_order
            FROM news
            WHERE status = 'show'
              AND start_date <= ?
              AND (end_date IS NULL OR end_date >= ?)
            ORDER BY is_pinned DESC, pin_order ASC, start_date DESC, seq_id DESC
            LIMIT 1000
        """, (now, now))

        rows = await cursor.fetchall()
        logger.info(f"[get_active_news] Found {len(rows)} raw rows from DB")

        # Filter by language and extract content
        filtered_result = []
        for row in rows:
            content = json.loads(row["content"])

            # Only include news that has content for requested language
            if lang in content and content[lang].get("title"):
                filtered_result.append({
                    "id": row["id"],
                    "start_date": row["start_date"],
                    "seq_id": row["seq_id"],
                    "end_date": row["end_date"],
                    "title_markdown": content[lang]["title"],
                    "body_markdown": content[lang]["body"],
                    "is_pinned": bool(row["is_pinned"]),
                    "pin_order": row["pin_order"]
                })

        logger.info(f"[get_active_news] After lang filter: {len(filtered_result)} news")

        # Apply offset and limit (offset-based pagination)
        result = filtered_result[offset:offset + limit]

        logger.info(f"[get_active_news] Returning {len(result)} news for lang={lang} (offset={offset})")
        return result


async def get_all_news(lang: str, offset: int = 0, limit: int = 50, after_id: Optional[int] = None) -> List[Dict]:
    """Get all news for archive (including disabled)

    Args:
        lang: Language code (en, ru, pl)
        offset: Pagination offset (deprecated, use after_id instead)
        limit: Maximum number of news to return
        after_id: Optional cursor for pagination - returns news with id > after_id (from filtered results)

    Returns:
        List of all news items with translated content

    Important:
        - Language filtering happens first: loads all news, filters by lang, then applies after_id/offset and limit
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Load all news (reasonable limit for performance)
        cursor = await db.execute("""
            SELECT id, start_date, seq_id, end_date, status, content, is_pinned, pin_order, created_at
            FROM news
            WHERE status = 'show'
            ORDER BY is_pinned DESC, start_date DESC, seq_id DESC
            LIMIT 1000
        """)

        rows = await cursor.fetchall()

        # Filter by language and extract content
        filtered_result = []
        for row in rows:
            content = json.loads(row["content"])

            # Only include news that has content for requested language
            if lang in content and content[lang].get("title"):
                filtered_result.append({
                    "id": row["id"],
                    "start_date": row["start_date"],
                    "seq_id": row["seq_id"],
                    "end_date": row["end_date"],
                    "status": row["status"],
                    "title_markdown": content[lang]["title"],
                    "body_markdown": content[lang]["body"],
                    "is_pinned": bool(row["is_pinned"]),
                    "pin_order": row["pin_order"],
                    "created_at": row["created_at"]
                })

        # Apply after_id cursor (preferred over offset)
        if after_id is not None:
            filtered_result = [item for item in filtered_result if item["id"] > after_id]
            result = filtered_result[:limit]
        else:
            # Fall back to offset for backward compatibility
            result = filtered_result[offset:offset + limit]

        return result


async def get_all_news_admin(offset: int = 0, limit: int = 100) -> List[Dict]:
    """Get all news for admin (all languages)

    Args:
        offset: Pagination offset
        limit: Maximum number of news to return

    Returns:
        List of all news items with full content and is_active flag
    """
    # Date-only comparison: a news item ending today is still active
    now = datetime.utcnow().date().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT id, start_date, seq_id, end_date, status, content, is_pinned, pin_order, created_at
            FROM news
            ORDER BY start_date DESC, seq_id DESC
            LIMIT ? OFFSET ?
        """, (limit, offset))

        rows = await cursor.fetchall()

        result = []
        for row in rows:
            # Calculate if news is currently active
            # Active means: status='show' AND start_date <= now AND (end_date IS NULL OR end_date >= now)
            is_active = (
                row["status"] == "show" and
                row["start_date"] <= now and
                (row["end_date"] is None or row["end_date"] >= now)
            )

            result.append({
                "id": row["id"],
                "start_date": row["start_date"],
                "seq_id": row["seq_id"],
                "end_date": row["end_date"],
                "status": row["status"],
                "content": json.loads(row["content"]),
                "is_pinned": bool(row["is_pinned"]),
                "pin_order": row["pin_order"],
                "created_at": row["created_at"],
                "is_active": is_active
            })

        return result


async def get_news_page_admin(
    offset: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """Paged admin list: {items, total, offset, limit}.

    Args:
        offset: Pagination offset
        limit: Page size
        search: Case-insensitive substring to match against id and all
            language titles/bodies (None = no filtering)
        status: Filter by status, 'show' or 'hide' (None = all)

    Returns:
        Dict with the page items, total count after filtering, offset and limit

    Search is done in Python: news JSON content is a single TEXT column, so
    SQL LIKE would be ASCII-only (Cyrillic would not match) — the archive is
    news-sized (hundreds), full scan per request is fine.
    """
    # Date-only comparison, same as get_all_news_admin
    now = datetime.utcnow().date().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Full scan: no LIMIT/OFFSET in SQL, filtering and paging happen below
        cursor = await db.execute("""
            SELECT id, start_date, seq_id, end_date, status, content, is_pinned, pin_order, created_at
            FROM news
            ORDER BY start_date DESC, seq_id DESC
        """)

        rows = await cursor.fetchall()

    search_lower = search.lower() if search else None

    filtered = []
    for row in rows:
        if status is not None and row["status"] != status:
            continue

        item = {
            "id": row["id"],
            "start_date": row["start_date"],
            "seq_id": row["seq_id"],
            "end_date": row["end_date"],
            "status": row["status"],
            "content": json.loads(row["content"]),
            "is_pinned": bool(row["is_pinned"]),
            "pin_order": row["pin_order"],
            "created_at": row["created_at"],
            # Active means: status='show' AND start_date <= now AND (end_date IS NULL OR end_date >= now)
            "is_active": (
                row["status"] == "show" and
                row["start_date"] <= now and
                (row["end_date"] is None or row["end_date"] >= now)
            )
        }

        if search_lower is not None:
            # Case-insensitive substring match over id and every language value
            haystacks = [str(item["id"])]
            for lang_content in item["content"].values():
                if isinstance(lang_content, dict):
                    haystacks.extend(str(v) for v in lang_content.values() if v is not None)
                elif lang_content is not None:
                    haystacks.append(str(lang_content))
            if not any(search_lower in h.lower() for h in haystacks):
                continue

        filtered.append(item)

    total = len(filtered)
    page = filtered[offset:offset + limit]
    return {"items": page, "total": total, "offset": offset, "limit": limit}


async def get_news_by_id(news_id: int) -> Optional[Dict]:
    """Get news by ID (for admin)"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT id, start_date, seq_id, end_date, status, content, is_pinned, pin_order
            FROM news
            WHERE id = ?
        """, (news_id,))

        row = await cursor.fetchone()
        if not row:
            return None

        content = json.loads(row["content"])

        return {
            "id": row["id"],
            "start_date": row["start_date"],
            "seq_id": row["seq_id"],
            "end_date": row["end_date"],
            "status": row["status"],
            "is_pinned": bool(row["is_pinned"]),
            "pin_order": row["pin_order"],
            "content": content  # Full content JSON for admin
        }


async def update_news(news_id: int, data: Dict[str, Any]) -> bool:
    """Update news item

    Args:
        data: Dictionary with fields to update:
            - start_date: Start date (YYYY-MM-DD)
            - duration_days: Number of days (will recalculate end_date)
            - end_date: Explicit end date
            - status: 'show' or 'hide'
            - is_pinned: Boolean
            - content: Dict with language codes as keys, e.g. {en: {title, body}, ru: {title, body}}
    """
    updates = []
    params = []

    # Explicit end_date applies unless it was just recalculated from duration_days
    duration_calculated = False

    # Handle start_date update
    if "start_date" in data:
        start_date_str = data["start_date"]
        if start_date_str:
            start_date_str = start_date_str.split('T')[0]
            updates.append("start_date = ?")
            params.append(start_date_str)

            # Recalculate end_date if duration_days is also provided
            duration_days = data.get("duration_days")
            if duration_days is not None and duration_days != "":
                try:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
                    end_date_dt = start_date.fromordinal(start_date.toordinal() + int(duration_days))
                    updates.append("end_date = ?")
                    params.append(end_date_dt.date().isoformat())
                    duration_calculated = True
                except (ValueError, TypeError):
                    pass

    # Handle end_date direct update (unless it was just calculated from duration_days);
    # may be None to clear the date
    if "end_date" in data and not duration_calculated:
        updates.append("end_date = ?")
        params.append(data["end_date"])

    if "status" in data:
        updates.append("status = ?")
        params.append(data["status"])

    if "is_pinned" in data:
        updates.append("is_pinned = ?")
        params.append(1 if data["is_pinned"] else 0)

    # Update content if provided
    if "content" in data:
        updates.append("content = ?")
        params.append(json.dumps(data["content"]))

    if not updates:
        return True

    updates.append("updated_at = datetime('now')")
    params.append(news_id)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"""
            UPDATE news
            SET {', '.join(updates)}
            WHERE id = ?
        """, params)
        await db.commit()

    return True


async def delete_news(news_id: int) -> bool:
    """Delete news item"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM news WHERE id = ?", (news_id,))
        await db.commit()
        return True
