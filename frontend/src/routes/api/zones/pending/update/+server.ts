import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    guardModeration,
    checkUploadRateLimit,
    pendingNotFound
} from '$lib/server/zonesModeration';
import {
    readPendingFile,
    sanitizePendingFilename,
    validateUploadContent,
    writePendingFileAtomic,
    ZONES_UPLOAD_MAX_FILE_BYTES
} from '$lib/server/zonesPendingStore';
import { detectGroupMeshcore, parseZoneFeatures } from '$lib/utils/zoneFeatures';
import { serializeGroup } from '$lib/utils/zoneExport';
import type { MeshcoreZoneSettings, NamedMeshcoreSettings, ZoneGroupSettings } from '$lib/types';

// Coerce the flat preset fields of a client-supplied payload (the client is
// not trusted): empty/absent fields are dropped, radio requires all four finite
// numbers, commands accepts only an array of non-empty strings. Mirrors the
// reading coercion of zoneFeatures.readMeshcore so an update can never inject
// arbitrary JSON. `level` is handled by the callers (a preset never carries it).
function coerceFlatFields(p: Record<string, unknown>): Omit<MeshcoreZoneSettings, 'level'> {
    const out: Omit<MeshcoreZoneSettings, 'level'> = {};
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
    // Extra commands: only a real array is considered, only its non-empty
    // string entries survive (trimmed); anything else is ignored and an empty
    // result writes no key (mirrors readMeshcore's coercion).
    if (Array.isArray(p.commands)) {
        const cmds = p.commands
            .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
            .map((c) => c.trim());
        if (cmds.length > 0) out.commands = cmds;
    }
    return out;
}

function coerceLevel(raw: unknown): number | undefined {
    const level = Number(raw);
    return Number.isInteger(level) && level >= 1 && level <= 5 ? level : undefined;
}

// Coerce a raw `settingsPresets` array (task 82). ONLY an array is accepted;
// every element must be an object with a non-empty string `name` and (trimmed)
// unique names — any structural violation returns null (the route answers
// invalid_format). The remaining fields go through the same coercion as the
// flat preset (minus `level`, which a preset never carries — it is a zone-group
// attribute); `isDefault` counts only when === true. An empty array yields an
// empty list (the caller treats it as the flat mode — a grouped -> flat edit is
// legitimate).
function coercePresetsArray(raw: unknown[]): NamedMeshcoreSettings[] | null {
    const presets: NamedMeshcoreSettings[] = [];
    const names = new Set<string>();
    for (const el of raw) {
        if (!el || typeof el !== 'object') return null;
        const elObj = el as Record<string, unknown>;
        const rawName = elObj.name;
        if (typeof rawName !== 'string' || !rawName.trim()) return null;
        const name = rawName.trim();
        if (names.has(name)) return null; // duplicate name
        names.add(name);
        const preset: NamedMeshcoreSettings = { name, ...coerceFlatFields(elObj) };
        if (elObj.isDefault === true) preset.isDefault = true;
        presets.push(preset);
    }
    return presets;
}

// Coerce a client-supplied settings payload into the typed ZoneGroupSettings
// (the client is not trusted). Task 82: `settingsPresets` is accepted ONLY as
// an array (any other shape is a structural violation -> null -> invalid_format
// 422). A non-empty array produces the grouped payload ({ level?,
// settingsPresets } — flat settings fields are dropped, serializeGroup writes
// only level + presets for a grouped file); an empty/absent array produces the
// flat preset (the fields + level), so a grouped -> flat transition stays a
// legitimate moderator edit. Returns null on a structural violation.
function coercePreset(raw: unknown): ZoneGroupSettings | null {
    const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (p.settingsPresets !== undefined) {
        if (!Array.isArray(p.settingsPresets)) return null;
        const presets = coercePresetsArray(p.settingsPresets);
        if (!presets) return null;
        if (presets.length > 0) {
            const out: ZoneGroupSettings = { settingsPresets: presets };
            const level = coerceLevel(p.level);
            if (level != null) out.level = level;
            return out;
        }
        // Empty array -> fall through to the flat preset.
    }
    const out: ZoneGroupSettings = coerceFlatFields(p);
    const level = coerceLevel(p.level);
    if (level != null) out.level = level;
    return out;
}

function reject(code: string, status: number, filename: string): Response {
    console.warn('[zones-moderation] update rejected', code, filename);
    return json({ error: { code } }, { status });
}

// POST /api/zones/pending/update — moderator edits a pending file's FULL
// settings payload (a flat preset OR named presets, task 82, and the optional
// author) right in the moderation UI (no re-upload): body { filename: string,
// preset: ZoneGroupSettings, author?: string }. The file is re-read,
// re-serialized with the new payload (geometry and per-zone regions/levels are
// preserved; the group name — and therefore the filename — never changes) and
// atomically written back under the same name. serializeGroup restores the
// on-disk format of RSR task 82 §3.0 (settings only in metadata.meshcore).
// `author`: a string sets/replaces it ('' clears), omitted keeps the saved
// value. Format/docUrl/size/quota checks are the same as on upload; no
// conflict check here (approve stays the authoritative gate) and no webhook
// (the moderator made the change).
export const POST: RequestHandler = async (event) => {
    const guard = guardModeration(event.request, event.getClientAddress());
    if (guard) return guard;

    // Moderator mutations share the per-IP mutation rate limit.
    const rl = checkUploadRateLimit(event.getClientAddress());
    if (!rl.ok) {
        return json(
            { error: { code: 'rate_limited', retry_after_s: rl.retryAfterS } },
            { status: 429 }
        );
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
    const author = typeof req.author === 'string' ? req.author.trim() || undefined : savedAuthor;
    // Coerce the new settings payload (trust boundary): a structural violation
    // of the named presets (non-array, empty/duplicate name) is a 422.
    const preset = coercePreset(req.preset);
    if (!preset) {
        return reject('invalid_format', 422, filename);
    }
    const zones = parseZoneFeatures(fc.features, detectGroupMeshcore(fc)?.regions ?? '');
    const updated = serializeGroup(name, preset, zones, author);

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
