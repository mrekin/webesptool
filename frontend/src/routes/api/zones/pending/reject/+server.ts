import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    guardModeration,
    checkUploadRateLimit,
    pendingNotFound
} from '$lib/server/zonesModeration';
import { deletePendingFile, sanitizePendingFilename } from '$lib/server/zonesPendingStore';

// POST /api/zones/pending/reject — delete a file from the pending catalog.
// Body: { filename: string }. Token-guarded with the uniform 404 semantics.
export const POST: RequestHandler = async (event) => {
    const guard = guardModeration(event.request, event.getClientAddress());
    if (guard) return guard;

    // Moderator mutations share the per-IP mutation rate limit.
    const rl = checkUploadRateLimit(event.getClientAddress());
    if (!rl.ok) {
        return json(
            { error: { code: 'rate_limited', retry_after_s: rl.retryAfterS } },
            { status: 429 }
        );
    }

    let body: unknown;
    try {
        body = await event.request.json();
    } catch {
        return json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    const req = body as { filename?: unknown };
    if (!req || typeof req.filename !== 'string') {
        return json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    const filename = sanitizePendingFilename(req.filename);
    if (!filename || !deletePendingFile(filename)) {
        // Uniform 404 (same body/status as guardModeration).
        return pendingNotFound();
    }

    console.info('[zones-moderation] rejected', filename);
    return json({ ok: true, filename });
};
