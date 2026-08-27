import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { moderationEnabled } from '$lib/server/zonesModeration';

// GET /api/zones/pending/config — the single public bit of the moderation
// feature: whether it is enabled on this installation (a token is configured).
// Reveals nothing else about the configuration. Not HTTP-cached so a config
// change is picked up on the next editor open; the client additionally caches
// the promise for the page lifetime (zonesUpload.fetchModerationConfig).
export const GET: RequestHandler = async () => {
    return json(
        { moderationEnabled: moderationEnabled() },
        {
            headers: { 'cache-control': 'no-store' }
        }
    );
};
