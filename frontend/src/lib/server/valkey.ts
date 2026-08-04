import { Redis } from 'ioredis';

// Server-only singleton Valkey (Redis wire-compatible) client.
// Anything under $lib/server is never bundled to the browser, so process.env
// and the connection stay on the Node side.

let client: Redis | null = null;

export function getValkey(): Redis | null {
    if (client) return client;
    // VALKEY_URL must use the redis:// scheme: Valkey is wire-compatible with
    // Redis, and ioredis does not parse the valkey:// scheme.
    const url = process.env.VALKEY_URL;
    if (!url) return null;
    client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    // Swallow connection error events so an unreachable Valkey never crashes the
    // server; lookups degrade gracefully via try/catch in geocodeLookup.
    client.on('error', () => {});
    return client;
}
