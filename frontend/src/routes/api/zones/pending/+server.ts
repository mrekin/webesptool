import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardModeration } from '$lib/server/zonesModeration';
import { listPendingFiles } from '$lib/server/zonesPendingStore';

// GET /api/zones/pending — metadata list of the awaiting files (token-guarded;
// see zonesModeration.guardModeration for the uniform 404/429 semantics).
export const GET: RequestHandler = async (event) => {
    const guard = guardModeration(event.request, event.getClientAddress());
    if (guard) return guard;
    return json({ files: listPendingFiles() });
};
