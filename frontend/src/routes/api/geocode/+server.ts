import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { geocodeLookup } from '$lib/server/geocode';

// SvelteKit server endpoint. Excluded from the Python proxy in hooks.server.ts
// so resolve(event) reaches this route. Always answers 200 with a `status`
// discriminator; true errors are surfaced by the client-side try/catch.
export const GET: RequestHandler = async ({ url }) => {
    if (process.env.NOMINATIM_ENABLED === 'false') {
        return json({ status: 'disabled' });
    }

    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lon) ||
        lon < -180 ||
        lon > 180
    ) {
        return json({ status: 'no_data', source: 'error' });
    }

    const result = await geocodeLookup(lat, lon);
    return json(result);
};
