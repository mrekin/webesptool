// Container entry: boot the adapter-node server with a body limit DERIVED
// from the single admin knob ZONES_UPLOAD_MAX_FILE_BYTES (see
// src/lib/server/zonesPendingStore.ts — the same env name, same parser, same
// default). BODY_SIZE_LIMIT is not an independent configuration: it is always
// cap + JSON envelope headroom, so Kit's own 413 can never reject an
// upload the API would have admitted.
const raw = process.env.ZONES_UPLOAD_MAX_FILE_BYTES;
const mult = { K: 2 ** 10, M: 2 ** 20, G: 2 ** 30 }[raw ? raw.slice(-1).toUpperCase() : ''] ?? 1;
const n = Number(mult !== 1 ? raw.slice(0, -1) : raw);
const fileBytes = Number.isFinite(n) && n > 0 ? n * mult : 2 ** 20; // 1 MB default, same as the store
// ENVELOPE_OVERHEAD_BYTES mirror (zonesPendingStore.ts) — the same +1024 the
// upload route's early content-length check uses.
process.env.BODY_SIZE_LIMIT = String(fileBytes + 1024);
await import('./build/index.js');
