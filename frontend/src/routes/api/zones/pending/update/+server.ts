import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardModeration, checkUploadRateLimit, pendingNotFound } from '$lib/server/zonesModeration';
import {
    readPendingFile,
    sanitizePendingFilename,
    validateUploadContent,
    writePendingFileAtomic,
    ZONES_UPLOAD_MAX_FILE_BYTES
} from '$lib/server/zonesPendingStore';
import { detectGroupMeshcore, parseZoneFeatures } from '$lib/utils/zoneFeatures';
import { serializeGroup } from '$lib/utils/zoneExport';
import type { MeshcoreZoneSettings } from '$lib/types';

// Coerce a client-supplied preset into the typed shape (the client is not
// trusted): empty/absent fields are dropped, radio requires all four finite
// numbers, level must be an integer 1-5. Mirrors the reading coercion of
// zoneFeatures.readMeshcore so an update can never inject arbitrary JSON.
function coercePreset(raw: unknown): MeshcoreZoneSettings {
    const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out: MeshcoreZoneSettings = {};
    if (typeof p.regions === 'string' && p.regions.trim()) out.regions = p.regions.trim();
    if (p.radio && typeof p.radio === 'object') {
        const r = p.radio as Record<string, unknown>;
        const freq = Number(r.freq);
        const bw = Number(r.bw);
        const sf = Number(r.sf);
        const cr = Number(r.cr);
        if ([freq, bw, sf, cr].every(Number.isFinite)) out.radio = { freq, bw, sf, cr };
    }
    if (typeof p.pathHashMode === 'string' && p.pathHashMode.trim()) {
        out.pathHashMode = p.pathHashMode.trim();
    }
    if (typeof p.nameTemplate === 'string' && p.nameTemplate.trim()) {
        out.nameTemplate = p.nameTemplate.trim();
    }
    if (typeof p.docUrl === 'string' && p.docUrl.trim()) out.docUrl = p.docUrl.trim();
    const level = Number(p.level);
    if (Number.isInteger(level) && level >= 1 && level <= 5) out.level = level;
    return out;
}

function reject(code: string, status: number, filename: string): Response {
    console.warn('[zones-moderation] update rejected', code, filename);
    return json({ error: { code } }, { status });
}

// POST /api/zones/pending/update — moderator edits a pending file's FULL
// meshcore preset (and the optional author) right in the moderation UI (no
// re-upload): body { filename: string, preset: MeshcoreZoneSettings,
// author?: string }. The file is re-read, re-serialized with the new preset
// (geometry and per-zone regions/levels are preserved; the group name — and
// therefore the filename — never changes) and atomically written back under
// the same name. `author`: a string sets/replaces it ('' clears), omitted
// keeps the saved value. Format/docUrl/size/quota checks are the same as on
// upload; no conflict check here (approve stays the authoritative gate) and
// no webhook (the moderator made the change).
export const POST: RequestHandler = async (event) => {
    const guard = guardModeration(event.request, event.getClientAddress());
    if (guard) return guard;

    // Moderator mutations share the per-IP mutation rate limit.
    const rl = checkUploadRateLimit(event.getClientAddress());
    if (!rl.ok) {
        return json({ error: { code: 'rate_limited', retry_after_s: rl.retryAfterS } }, { status: 429 });
    }

    let body: unknown;
    try {
        body = await event.request.json();
    } catch {
        return json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    const req = body as { filename?: unknown; preset?: unknown; author?: unknown };
    if (!req || typeof req.filename !== 'string' || !req.preset) {
        return json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    const filename = sanitizePendingFilename(req.filename);
    const saved = filename ? readPendingFile(filename) : null;
    if (!filename || !saved) {
        // Uniform 404 (same body/status as guardModeration).
        return pendingNotFound();
    }

    // The saved file must still be valid (protection against manual edits of
    // the pending directory since the upload) — same rule as approve.
    const v = validateUploadContent(saved);
    if (v.code) {
        return reject('invalid_format', 422, filename);
    }

    // Re-serialize with the new preset: the group name stays as saved,
    // per-zone regions/levels come from the parsed features, everything else
    // in the preset is replaced. serializeGroup is the single serialization
    // authority (same function the editor upload path uses). The author comes
    // from the body when the moderator sent one (a string sets/replaces, ''
    // clears), otherwise the saved metadata author is preserved.
    const fc = saved as GeoJSON.FeatureCollection & {
        metadata?: { group?: unknown; name?: unknown; author?: unknown };
    };
    const meta = fc.metadata ?? {};
    const name =
        (typeof meta.group === 'string' && meta.group) ||
        (typeof meta.name === 'string' && meta.name) ||
        '';
    const savedAuthor =
        typeof meta.author === 'string' && meta.author.trim() ? meta.author.trim() : undefined;
    const author =
        typeof req.author === 'string' ? req.author.trim() || undefined : savedAuthor;
    const zones = parseZoneFeatures(fc.features, detectGroupMeshcore(fc)?.regions ?? '');
    const updated = serializeGroup(name, coercePreset(req.preset), zones, author);

    const recheck = validateUploadContent(updated);
    if (recheck.code) {
        // docUrl emptied by the edit or (theoretically) a broken round-trip.
        return reject(recheck.code, 422, filename);
    }
    if (Buffer.byteLength(JSON.stringify(updated)) > ZONES_UPLOAD_MAX_FILE_BYTES) {
        return reject('file_too_large', 413, filename);
    }

    const written = writePendingFileAtomic(filename, updated);
    if (!written.ok) {
        return reject(written.code, 422, filename);
    }

    console.info('[zones-moderation] updated', filename);
    return json({ ok: true, filename });
};
