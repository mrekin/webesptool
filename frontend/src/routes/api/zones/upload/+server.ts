import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkUploadRateLimit } from '$lib/server/zonesModeration';
import { notifyPendingUpload } from '$lib/server/zonesWebhook';
import {
    pendingStats,
    sanitizePendingFilename,
    validateUploadContent,
    writePendingFileAtomic,
    ZONES_UPLOAD_MAX_FILE_BYTES
} from '$lib/server/zonesPendingStore';

// POST /api/zones/upload — send one group file to the pending catalog (task
// 77). Public (no token): the pending catalog is closed on the READ side, and
// writing is bounded by the rate limit, the 1 MB file limit, the 50 MB catalog
// quota and the format/docUrl validation. Fixed pipeline (cheap checks first):
// rate limit -> early content-length rejection -> envelope parse -> filename
// sanitize -> exact size -> format+docUrl -> quota -> atomic write -> webhook
// (fire-and-forget). Every rejection is logged with its machine code.

// Allowance over the file limit for the JSON envelope wrapper + escaping when
// rejecting early by the content-length header (the exact byteLength check
// below stays authoritative).
const ENVELOPE_OVERHEAD_BYTES = 1024;

function reject(
    code: string,
    status: number,
    filename?: string,
    extra?: Record<string, unknown>
): Response {
    console.warn('[zones-upload] rejected', code, filename ?? '');
    return json({ error: { code, ...extra } }, { status });
}

export const POST: RequestHandler = async (event) => {
    // 1. Per-IP upload rate limit.
    const rl = checkUploadRateLimit(event.getClientAddress());
    if (!rl.ok) {
        return reject('rate_limited', 429, undefined, { retry_after_s: rl.retryAfterS });
    }

    // 2. Early size rejection by the declared body size (body not read).
    const declared = Number(event.request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > ZONES_UPLOAD_MAX_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return reject('file_too_large', 413);
    }

    // 3. Envelope: { filename: string, content: FeatureCollection }.
    let body: unknown;
    try {
        body = await event.request.json();
    } catch {
        return reject('invalid_json', 400);
    }
    const envelope = body as { filename?: unknown; content?: unknown };
    if (
        !envelope ||
        typeof envelope !== 'object' ||
        typeof envelope.filename !== 'string' ||
        !envelope.content ||
        typeof envelope.content !== 'object'
    ) {
        return reject('invalid_json', 400);
    }

    // 4. Filename sanitization (the client is not trusted).
    const filename = sanitizePendingFilename(envelope.filename);
    if (!filename) return reject('invalid_filename', 400);

    // 5. Exact file size (serialized content).
    const content = envelope.content as GeoJSON.FeatureCollection;
    const sizeBytes = Buffer.byteLength(JSON.stringify(content));
    if (sizeBytes > ZONES_UPLOAD_MAX_FILE_BYTES) {
        return reject('file_too_large', 413, filename);
    }

    // 6. Format (FeatureCollection + schema + >=1 valid feature) + docUrl.
    const v = validateUploadContent(content);
    if (v.code) return reject(v.code, 422, filename);

    // 7+8. Quota (50 MB, replacement-aware) + atomic write (tmp + rename; a
    // re-upload with the same name replaces the awaiting version).
    const written = writePendingFileAtomic(filename, content);
    if (!written.ok) return reject(written.code, 422, filename);

    console.info('[zones-upload] accepted', filename, written.sizeBytes);

    // 9. Webhook — fire-and-forget, never affects the response.
    const stats = pendingStats();
    void notifyPendingUpload(filename, written.sizeBytes, stats.count, stats.bytes);

    return json({ ok: true, filename, sizeBytes: written.sizeBytes });
};
