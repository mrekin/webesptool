import type { LayoutServerLoad } from './$types';

/**
 * Root layout server load.
 *
 * Reads the deploy-time `HEADER_DISCLAIMER` env variable (runtime, server-only)
 * and exposes the trimmed value to the client via merged `App.PageData`.
 *
 * One docker image serves both the primary instance (env unset/empty → empty
 * disclaimer) and mirrors (env set, e.g. `(mirror)`) — the difference is purely
 * the runtime env, never a separate build. Matches the existing runtime env
 * pattern in `hooks.server.ts` (`NODE_ENV`, `API_URL`).
 */
export const load: LayoutServerLoad = () => {
    const disclaimer = (process.env.HEADER_DISCLAIMER ?? '').trim();
    return { disclaimer };
};
