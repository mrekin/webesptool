// Moderator token check + per-IP rate limits for the zones upload/moderation
// API (task 77). Server-only (never imported from the browser bundle).
//
// Token model: ZONES_MODERATOR_TOKEN from env; unset/empty => the moderator
// mode "sleeps" — every token-guarded endpoint answers the same indistinguish
// able 404 "not_found" as for a wrong token or a missing file (PRD scenario
// 13). Comparison is timing-safe via sha256 digests + crypto.timingSafeEqual;
// the token itself never appears in responses or logs.
//
// Limits (env, defaults per RSR): ZONES_UPLOAD_RATE_PER_MIN (uploads and
// moderator mutations per IP per minute, 0 = off) and
// ZONES_TOKEN_ATTEMPTS_PER_MIN (FAILED token attempts per IP per minute).
// Sliding windows in memory — single Node process, synchronous checks, so
// they are atomic on the event loop (same reasoning as geocode's RateLimiter).

import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';

const MODERATOR_TOKEN = process.env.ZONES_MODERATOR_TOKEN ?? '';
const UPLOAD_RATE_PER_MIN = Number(process.env.ZONES_UPLOAD_RATE_PER_MIN ?? 10);
const TOKEN_ATTEMPTS_PER_MIN = Number(process.env.ZONES_TOKEN_ATTEMPTS_PER_MIN ?? 15);

// Startup recommendation (not a blocker): short tokens are easier to brute
// force even with the per-IP attempt limit.
if (MODERATOR_TOKEN && MODERATOR_TOKEN.length < 32) {
    console.warn(
        '[zones-moderation] ZONES_MODERATOR_TOKEN is shorter than 32 chars — use a long random secret'
    );
}

const WINDOW_MS = 60_000;

// Sliding-window counter: keeps timestamps of the last events within the
// window; `exceeded` is true once `max` events are inside it.
class SlidingWindow {
    private readonly times: number[] = [];
    constructor(private readonly max: number) {}
    private prune(): void {
        const cutoff = Date.now() - WINDOW_MS;
        while (this.times.length > 0 && this.times[0] <= cutoff) this.times.shift();
    }
    exceeded(): boolean {
        if (this.max <= 0) return false;
        this.prune();
        return this.times.length >= this.max;
    }
    record(): void {
        this.times.push(Date.now());
    }
}

const uploadWindows = new Map<string, SlidingWindow>();
const tokenWindows = new Map<string, SlidingWindow>();

function windowFor(map: Map<string, SlidingWindow>, ip: string, max: number): SlidingWindow {
    let w = map.get(ip);
    if (!w) {
        w = new SlidingWindow(max);
        map.set(ip, w);
    }
    return w;
}

// --- moderator token ---

export function moderationEnabled(): boolean {
    return MODERATOR_TOKEN !== '';
}

// Timing-safe check of the x-zones-token header. False when the token is not
// configured (no valid token exists for anyone) or the header is absent/wrong.
export function moderatorTokenOk(request: Request): boolean {
    if (!MODERATOR_TOKEN) return false;
    const provided = request.headers.get('x-zones-token') ?? '';
    if (!provided) return false;
    // Hash both sides so timingSafeEqual always compares equal-length buffers.
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(MODERATOR_TOKEN).digest();
    return timingSafeEqual(a, b);
}

// Record a FAILED token attempt (wrong/absent token). Logs the attempt with
// the IP (metric) and reports whether the per-IP window is now exhausted.
export function registerTokenFailure(ip: string): { rateLimited: boolean } {
    console.warn('[zones-moderation] token attempt failed', ip);
    const w = windowFor(tokenWindows, ip, TOKEN_ATTEMPTS_PER_MIN);
    w.record();
    const rateLimited = w.exceeded();
    if (rateLimited) console.warn('[zones-moderation] token rate limited', ip);
    return { rateLimited };
}

function isTokenRateLimited(ip: string): boolean {
    return tokenWindows.get(ip)?.exceeded() ?? false;
}

// --- upload / mutation rate limit ---

// Per-IP sliding window for uploads (and moderator mutations). 0 = disabled.
// Records the attempt when allowed.
export function checkUploadRateLimit(ip: string): { ok: boolean; retryAfterS: number } {
    const w = windowFor(uploadWindows, ip, UPLOAD_RATE_PER_MIN);
    if (w.exceeded()) {
        console.warn('[zones-upload] rate limited', ip);
        return { ok: false, retryAfterS: 60 };
    }
    w.record();
    return { ok: true, retryAfterS: 0 };
}

// --- shared responses ---

// The indistinguishable "data does not exist" answer: identical status/body
// for an unset token, a wrong token and a missing file.
export function pendingNotFound(): Response {
    return json({ error: { code: 'not_found' } }, { status: 404 });
}

function rateLimitedResponse(): Response {
    return json({ error: { code: 'rate_limited', retry_after_s: 60 } }, { status: 429 });
}

// Entry guard for every token-dependent endpoint (pending list/file/approve/
// reject): 429 when the token-attempt window is exhausted, then the token
// check — a failure is recorded (and turns into 429 once the window fills),
// otherwise the uniform 404. Returns null when the request may proceed.
export function guardModeration(request: Request, ip: string): Response | null {
    if (isTokenRateLimited(ip)) return rateLimitedResponse();
    if (!moderatorTokenOk(request)) {
        const { rateLimited } = registerTokenFailure(ip);
        if (rateLimited) return rateLimitedResponse();
        return pendingNotFound();
    }
    return null;
}
