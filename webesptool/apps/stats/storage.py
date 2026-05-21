import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import valkey.asyncio as aiovalkey
from user_agents import parse as ua_parse

logger = logging.getLogger(__name__)

_valkey_client: Optional[aiovalkey.Valkey] = None

DOWNLOAD_DIMENSIONS = [
    "src", "ver", "dev", "op", "fw", "platform",
    "country", "city", "browser", "os",
]
VISIT_DIMENSIONS = ["country", "city", "browser", "os"]

GROUP_BY_MAP = {
    "repository": "src",
    "version": "ver",
    "device": "dev",
    "operation": "op",
    "firmware": "fw",
    "platform": "platform",
    "country": "country",
    "city": "city",
    "browser": "browser",
    "os": "os",
}

VISIT_GROUP_BY_KEYS = {"country", "city", "browser", "os"}

PERIOD_DAYS = {"1d": 1, "7d": 7, "30d": 30, "90d": 90}

OP_TYPE_MAP = {"1": "update", "2": "install", "4": "ota", "5": "zip"}


async def init_valkey(valkey_url: str) -> None:
    global _valkey_client
    _valkey_client = aiovalkey.from_url(valkey_url, decode_responses=True)
    await _valkey_client.ping()
    logger.info("Valkey connected: %s", valkey_url)


async def close_valkey() -> None:
    global _valkey_client
    if _valkey_client:
        await _valkey_client.aclose()
        _valkey_client = None


def get_valkey() -> Optional[aiovalkey.Valkey]:
    return _valkey_client


def parse_user_agent(ua_string: str) -> tuple[str, str]:
    if not ua_string:
        return "Other", "Other"
    ua = ua_parse(ua_string)
    return ua.browser.family or "Other", ua.os.family or "Other"


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _days_for_period(days: int) -> list[str]:
    today = datetime.now(timezone.utc).date()
    return [
        (today - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(days)
    ]


async def record_download_event(data: dict, ttl_days: int) -> None:
    vk = get_valkey()
    if not vk:
        return

    try:
        day = data.get("ts", _today())[:10]
        raw_key = f"stats:dl:raw:{day}"
        agg_key = f"stats:dl:{day}"
        ttl = ttl_days * 86400

        async with vk.pipeline(transaction=False) as pipe:
            pipe.rpush(raw_key, json.dumps(data, default=str))
            pipe.expire(raw_key, ttl)
            pipe.hincrby(agg_key, "total", 1)
            for dim in DOWNLOAD_DIMENSIONS:
                val = data.get(dim)
                if val:
                    pipe.hincrby(agg_key, f"{dim}:{val}", 1)
            pipe.expire(agg_key, ttl)
            await pipe.execute()
    except Exception as e:
        logger.warning("Failed to record download event: %s", e)


async def record_visit_event(data: dict, ttl_days: int) -> None:
    vk = get_valkey()
    if not vk:
        return

    try:
        day = data.get("ts", _today())[:10]
        raw_key = f"stats:visit:raw:{day}"
        agg_key = f"stats:visit:{day}"
        ttl = ttl_days * 86400

        async with vk.pipeline(transaction=False) as pipe:
            pipe.rpush(raw_key, json.dumps(data, default=str))
            pipe.expire(raw_key, ttl)
            pipe.hincrby(agg_key, "total", 1)
            for dim in VISIT_DIMENSIONS:
                val = data.get(dim)
                if val:
                    pipe.hincrby(agg_key, f"{dim}:{val}", 1)
            pipe.expire(agg_key, ttl)
            await pipe.execute()
    except Exception as e:
        logger.warning("Failed to record visit event: %s", e)


async def get_download_stats(
    group_by: str, period: int, limit: int | None = None
) -> dict:
    vk = get_valkey()
    if not vk:
        return {"data": [], "period": period}

    prefix = GROUP_BY_MAP.get(group_by)
    if not prefix:
        return {"data": [], "period": period, "error": "invalid group_by"}

    days = _days_for_period(period)

    try:
        counts: dict[str, int] = {}
        async with vk.pipeline(transaction=False) as pipe:
            for day in days:
                pipe.hgetall(f"stats:dl:{day}")
            results = await pipe.execute()

        for day_hash in results:
            for key, count_str in day_hash.items():
                if key == "total":
                    continue
                dim, _, val = key.partition(":")
                if dim == prefix and val:
                    counts[val] = counts.get(val, 0) + int(count_str)

        data = [
            {"key": k, "count": v}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])
        ]
        if limit:
            data = data[:limit]
        return {"data": data, "period": period}
    except Exception as e:
        logger.warning("Failed to get download stats: %s", e)
        return {"data": [], "period": period}


async def get_visit_stats(
    group_by: str, period: int, limit: int | None = None
) -> dict:
    vk = get_valkey()
    if not vk:
        return {"data": [], "period": period}

    if group_by not in VISIT_GROUP_BY_KEYS:
        return {"data": [], "period": period, "error": "invalid group_by"}

    days = _days_for_period(period)

    try:
        counts: dict[str, int] = {}
        async with vk.pipeline(transaction=False) as pipe:
            for day in days:
                pipe.hgetall(f"stats:visit:{day}")
            results = await pipe.execute()

        for day_hash in results:
            for key, count_str in day_hash.items():
                if key == "total":
                    continue
                dim, _, val = key.partition(":")
                if dim == group_by and val:
                    counts[val] = counts.get(val, 0) + int(count_str)

        data = [
            {"key": k, "count": v}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])
        ]
        if limit:
            data = data[:limit]
        return {"data": data, "period": period}
    except Exception as e:
        logger.warning("Failed to get visit stats: %s", e)
        return {"data": [], "period": period}


async def rebuild_missing_aggregates() -> None:
    vk = get_valkey()
    if not vk:
        return

    try:
        # Rebuild download aggregates
        await _rebuild_event_type(
            vk, "dl", DOWNLOAD_DIMENSIONS
        )
        # Rebuild visit aggregates
        await _rebuild_event_type(
            vk, "visit", VISIT_DIMENSIONS
        )
    except Exception as e:
        logger.warning("Failed to rebuild aggregates: %s", e)


async def _rebuild_event_type(
    vk: aiovalkey.Valkey,
    event_type: str,
    dimensions: list[str],
) -> None:
    cursor = 0
    raw_keys: list[str] = []
    while True:
        cursor, keys = await vk.scan(
            cursor, match=f"stats:{event_type}:raw:*"
        )
        raw_keys.extend(keys)
        if cursor == 0:
            break

    for raw_key in raw_keys:
        day = raw_key.rsplit(":", 1)[-1]
        agg_key = f"stats:{event_type}:{day}"
        meta_key = f"stats:meta:{event_type}"

        meta_raw = await vk.hget(meta_key, day)
        if meta_raw:
            meta = json.loads(meta_raw)
            if meta.get("dimensions") == dimensions:
                continue

        # Rebuild from raw data
        items = await vk.lrange(raw_key, 0, -1)
        if not items:
            continue

        counts: dict[str, int] = {"total": len(items)}
        for item in items:
            try:
                record = json.loads(item)
            except json.JSONDecodeError:
                continue
            for dim in dimensions:
                val = record.get(dim)
                if val:
                    key = f"{dim}:{val}"
                    counts[key] = counts.get(key, 0) + 1

        ttl_sec = await vk.ttl(raw_key)
        if ttl_sec < 0:
            ttl_sec = 90 * 86400

        async with vk.pipeline(transaction=False) as pipe:
            pipe.delete(agg_key)
            if counts:
                pipe.hset(agg_key, mapping=counts)
            pipe.expire(agg_key, ttl_sec)
            await pipe.execute()

        await vk.hset(
            meta_key,
            day,
            json.dumps({"dimensions": dimensions, "rebuilt_at": datetime.now(timezone.utc).isoformat()}),
        )
        logger.info("Rebuilt %s aggregates for %s", event_type, day)
