import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Frontend liveness probe (task 90). Always 200 with a fixed body, no side
// effects: no backend calls, no stats, no external requests. Excluded from
// the Python proxy in hooks.server.ts — backend health is observable via the
// regular proxy 502 "Backend unavailable" on any /api/* data path.
export const GET: RequestHandler = async () => json({ status: 'ok' });
