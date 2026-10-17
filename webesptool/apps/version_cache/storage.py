"""Version-cache storage: latest known versions per repository.

Valkey is the primary store (survives restarts, honest TTL); an in-process
copy serves as a fallback while Valkey is unavailable (prod decision
2026-10-16: repositories must keep their badges even when Valkey is down).
Stored value is an envelope: {"built_at": iso, "versions": {path: {...}}}.
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import valkey.asyncio as aiovalkey

logger = logging.getLogger(__name__)

SNAPSHOT_KEY = 'webesptool:repo_versions_latest'

_valkey_client: Optional[aiovalkey.Valkey] = None
_valkey_url: Optional[str] = None
# In-memory fallback: {'versions': {...}, 'built_at': iso, 'expires_at': monotonic}
_memory_snapshot: Optional[dict] = None


async def init_valkey(valkey_url: str) -> None:
    global _valkey_client, _valkey_url
    client = aiovalkey.from_url(valkey_url, decode_responses=True)
    await client.ping()
    _valkey_client = client
    _valkey_url = valkey_url
    logger.info("Version cache Valkey connected: %s", valkey_url)


async def close_valkey() -> None:
    global _valkey_client
    if _valkey_client:
        await _valkey_client.aclose()
        _valkey_client = None


def get_valkey() -> Optional[aiovalkey.Valkey]:
    return _valkey_client


def _unpack(raw: str) -> dict:
    """Envelope JSON → {'built_at': iso|None, 'versions': {...}}.

    Bare dicts written before the envelope existed are accepted as-is."""
    data = json.loads(raw)
    if isinstance(data, dict) and 'versions' in data:
        return {'built_at': data.get('built_at'), 'versions': data.get('versions') or {}}
    return {'built_at': None, 'versions': data or {}}


async def get_snapshot() -> Optional[dict]:
    """Versions map {path: {version, date}} or None when no data exists.

    Valkey first; while it is unavailable the in-memory copy answers (same
    TTL counted from its own rebuild). None means "unknown" — callers must
    not confuse it with an empty dict (scan found no versions at all).
    """
    if _valkey_client:
        try:
            raw = await _valkey_client.get(SNAPSHOT_KEY)
            if raw:
                return _unpack(raw)['versions']
        except Exception as e:
            logger.warning("Version cache Valkey read failed, memory fallback: %s", e)
    if _memory_snapshot and _memory_snapshot.get('expires_at', 0) > time.monotonic():
        return _memory_snapshot.get('versions')
    return None


async def get_snapshot_info() -> dict:
    """Snapshot meta for the admin page: source, built_at, TTL left, versions."""
    if _valkey_client:
        try:
            raw = await _valkey_client.get(SNAPSHOT_KEY)
            if raw:
                parts = _unpack(raw)
                ttl = await _valkey_client.ttl(SNAPSHOT_KEY)
                parts.update(source='valkey', ttl_seconds_left=ttl)
                return parts
        except Exception as e:
            logger.warning("Version cache Valkey info read failed, memory fallback: %s", e)
    if _memory_snapshot and _memory_snapshot.get('expires_at', 0) > time.monotonic():
        return {
            'built_at': _memory_snapshot.get('built_at'),
            'versions': _memory_snapshot.get('versions'),
            'source': 'memory',
            'ttl_seconds_left': int(_memory_snapshot['expires_at'] - time.monotonic()),
        }
    return {'built_at': None, 'versions': None, 'source': 'none', 'ttl_seconds_left': None}


async def save_snapshot(versions: dict, ttl_seconds: int) -> bool:
    """Persist snapshot (rebuild-then-swap: single SETEX, no delete window).

    Stores the built_at envelope; Valkey is best-effort (reconnect attempted
    on the next save); the in-memory copy is always updated. Returns True
    when Valkey accepted the write.
    """
    global _memory_snapshot
    built_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    _memory_snapshot = {
        'versions': versions,
        'built_at': built_at,
        'expires_at': time.monotonic() + ttl_seconds,
    }
    if not _valkey_client and _valkey_url:
        try:
            await init_valkey(_valkey_url)
        except Exception:
            pass
    if _valkey_client:
        try:
            envelope = json.dumps({'built_at': built_at, 'versions': versions})
            await _valkey_client.set(SNAPSHOT_KEY, envelope, ex=ttl_seconds)
            return True
        except Exception as e:
            logger.warning("Version cache Valkey write failed: %s", e)
    return False
