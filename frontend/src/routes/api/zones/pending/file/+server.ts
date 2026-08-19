import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardModeration, pendingNotFound } from '$lib/server/zonesModeration';
import { readPendingFile, sanitizePendingFilename } from '$lib/server/zonesPendingStore';

// GET /api/zones/pending/file?filename=… — one saved file's FeatureCollection
// as stored (<= 1 MB), for the moderator to draw it on the map over the
// published groups. Token-guarded; a wrong/absent token, an unset token and a
// missing file are indistinguishable (uniform 404).
export const GET: RequestHandler = async (event) => {
    const guard = guardModeration(event.request, event.getClientAddress());
    if (guard) return guard;
    const filename = sanitizePendingFilename(event.url.searchParams.get('filename') ?? '');
    const data = filename ? readPendingFile(filename) : null;
    if (!data) {
        // Same body/status as guardModeration's not_found — by design.
        return pendingNotFound();
    }
    return json(data);
};
