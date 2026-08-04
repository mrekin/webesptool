import { getValkey } from './valkey';
import type { GeocodeResponse } from '$lib/types';

// Server-only reverse-geocoding proxy for Nominatim. Reads configuration from
// env variables (see RSR §7.8); nothing here is reachable from the browser.

const NOMINATIM_URL =
    process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT || 'webesptool-frontend (geocoding proxy)';
const NOMINATIM_REFERER = process.env.NOMINATIM_REFERER || '';
const NOMINATIM_ZOOM = Number(process.env.NOMINATIM_ZOOM ?? 14);
const NOMINATIM_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS ?? 5000);
const NOMINATIM_RATE_LIMIT_TPS = Number(process.env.NOMINATIM_RATE_LIMIT_TPS ?? 1);
const NOMINATIM_TTL_DAYS = Number(process.env.NOMINATIM_TTL_DAYS ?? 180);
const NOMINATIM_NEGATIVE_TTL_DAYS = Number(process.env.NOMINATIM_NEGATIVE_TTL_DAYS ?? 1);

const DAY_SECONDS = 86400;

// Normalize coordinates to 3 decimal places (~110 m) so neighbouring clicks
// collapse into a single cache key (high cache-hit, fewer external calls).
export function normalizeCoords(lat: number, lon: number): { lat3: string; lon3: string } {
    return { lat3: lat.toFixed(3), lon3: lon.toFixed(3) };
}

function cacheKey(lat3: string, lon3: string, zoom: number): string {
    return `geocode:rev:${lat3}:${lon3}:z${zoom}`;
}

// At most `tps` external calls per second. Single Node process => sufficient
// for a per-installation cap. acquire() is synchronous, so it is atomic on the
// event loop. Behaviour is reject (never queue) per PRD.
class RateLimiter {
    private readonly minIntervalMs: number;
    private lastMs = 0;
    constructor(tps: number) {
        this.minIntervalMs = tps > 0 ? 1000 / tps : 0;
    }
    acquire(): boolean {
        if (this.minIntervalMs <= 0) return true;
        const now = Date.now();
        if (now - this.lastMs < this.minIntervalMs) return false;
        this.lastMs = now;
        return true;
    }
    retryAfterMs(): number {
        if (this.minIntervalMs <= 0) return 0;
        return Math.max(0, Math.ceil(this.minIntervalMs - (Date.now() - this.lastMs)));
    }
}

let limiter: RateLimiter | null = null;
function getLimiter(): RateLimiter {
    if (!limiter) limiter = new RateLimiter(NOMINATIM_RATE_LIMIT_TPS);
    return limiter;
}

// In-flight external requests, keyed by cache key. Lets concurrent lookups for
// the same normalized cell share a single external call (and a single rate
// token), so rapid clicks on the same ~110 m area don't trip the rate-limiter
// while the first request is still pending.
const inflight = new Map<string, Promise<GeocodeResponse>>();

interface CachedEntry {
    display_name: string | null;
    raw: Record<string, unknown> | null;
    neg: boolean;
}

type FetchResult =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; reason: 'timeout' | 'error' | 'non200' };

// External call to Nominatim. Returns null-shaped result on any failure so the
// caller can decide not to cache transients. Empty User-Agent is refused
// outright (Nominatim policy blocks stock/empty UAs).
async function fetchNominatim(
    lat3: string,
    lon3: string,
    zoom: number
): Promise<FetchResult> {
    if (!NOMINATIM_USER_AGENT) {
        console.warn('[geocode] NOMINATIM_USER_AGENT is empty; external call skipped');
        return { ok: false, reason: 'error' };
    }
    const url = `${NOMINATIM_URL}?lat=${lat3}&lon=${lon3}&format=json&accept-language=en&zoom=${zoom}`;
    const headers: Record<string, string> = { 'User-Agent': NOMINATIM_USER_AGENT };
    if (NOMINATIM_REFERER) headers['Referer'] = NOMINATIM_REFERER;
    try {
        const resp = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS)
        });
        if (!resp.ok) return { ok: false, reason: 'non200' };
        const data = (await resp.json()) as Record<string, unknown>;
        return { ok: true, data };
    } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        console.debug(`[geocode] fetch failed: ${msg}`);
        return { ok: false, reason: 'timeout' };
    }
}

// Orchestration: cache (Valkey) -> in-flight dedup -> rate-limiter -> external
// call -> cache write. Degrades gracefully when Valkey is absent/unreachable.
export async function geocodeLookup(lat: number, lon: number): Promise<GeocodeResponse> {
    const zoom = NOMINATIM_ZOOM;
    const { lat3, lon3 } = normalizeCoords(lat, lon);
    const key = cacheKey(lat3, lon3, zoom);
    const vk = getValkey();

    // 1. Cache check — the rate-limiter is NOT consumed on cache hits.
    if (vk) {
        try {
            const cached = await vk.get(key);
            if (cached) {
                const entry = JSON.parse(cached) as CachedEntry;
                if (entry.neg) {
                    return { status: 'no_data', source: 'negative-cache' };
                }
                return {
                    status: 'ok',
                    display_name: entry.display_name,
                    raw: entry.raw,
                    source: 'cache'
                };
            }
        } catch (e) {
            console.debug(`[geocode] cache read failed: ${e}`);
        }
    }

    // 2. In-flight dedup — share an ongoing external request for the same key
    //    instead of consuming another rate token / firing a second call.
    const existing = inflight.get(key);
    if (existing) return existing;

    // 3. Rate-limiter + external call + cache write.
    const promise = missLookup(key, lat3, lon3, zoom, vk);
    inflight.set(key, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
    }
}

// Cache-miss path: rate-limiter -> external call -> cache write (positive or
// negative). Wrapped in an in-flight promise by geocodeLookup for dedup.
async function missLookup(
    key: string,
    lat3: string,
    lon3: string,
    zoom: number,
    vk: ReturnType<typeof getValkey>
): Promise<GeocodeResponse> {
    // Rate-limiter (reject, never queue).
    const lim = getLimiter();
    if (!lim.acquire()) {
        return { status: 'rate_limited', retry_after_ms: lim.retryAfterMs() };
    }

    // External call to Nominatim.
    const result = await fetchNominatim(lat3, lon3, zoom);
    if (!result.ok) {
        // Transient errors (timeout / network / non-200) are NOT cached.
        return { status: 'no_data', source: result.reason === 'timeout' ? 'timeout' : 'error' };
    }

    const data = result.data;
    const displayName =
        typeof data.display_name === 'string' && data.display_name.trim()
            ? data.display_name
            : null;

    // Positive result -> cache long TTL.
    if (displayName) {
        const entry: CachedEntry = { display_name: displayName, raw: data, neg: false };
        if (vk) {
            try {
                await vk.set(key, JSON.stringify(entry), 'EX', NOMINATIM_TTL_DAYS * DAY_SECONDS);
            } catch (e) {
                console.debug(`[geocode] cache write failed: ${e}`);
            }
        }
        return { status: 'ok', display_name: displayName, raw: data, source: 'live' };
    }

    // Negative (empty / no result) -> cache short TTL.
    const negEntry: CachedEntry = { display_name: null, raw: data, neg: true };
    if (vk) {
        try {
            await vk.set(
                key,
                JSON.stringify(negEntry),
                'EX',
                NOMINATIM_NEGATIVE_TTL_DAYS * DAY_SECONDS
            );
        } catch (e) {
            console.debug(`[geocode] cache write failed: ${e}`);
        }
    }
    return { status: 'no_data', source: 'miss' };
}
