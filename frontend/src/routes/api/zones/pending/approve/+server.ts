import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    guardModeration,
    checkUploadRateLimit,
    pendingNotFound
} from '$lib/server/zonesModeration';
import {
    loadPublishedGroupEntries,
    movePendingToGroups,
    readPendingFile,
    sanitizePendingFilename,
    validateUploadContent
} from '$lib/server/zonesPendingStore';
import { detectGroupMeshcore, parseZoneFeatures } from '$lib/utils/zoneFeatures';
import { findZoneConflicts } from '$lib/utils/zoneConflicts';

// POST /api/zones/pending/approve — publish a pending file: re-validate the
// saved content, run the AUTHORITATIVE conflict check against the published
// catalog (the UI shows conflicts too, but only this check guarantees the
// catalog invariant), then move the file into static/data/groups (live-add
// semantics). Body: { filename: string, overwrite?: boolean } — overwrite is
// required to replace an already published file with the same name.
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
    const req = body as { filename?: unknown; overwrite?: unknown };
    if (!req || typeof req.filename !== 'string') {
        return json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    const filename = sanitizePendingFilename(req.filename);
    const saved = filename ? readPendingFile(filename) : null;
    if (!filename || !saved) {
        // Uniform 404 (same body/status as guardModeration).
        return pendingNotFound();
    }

    // Re-validate the saved file (protection against manual edits of the
    // pending directory since the upload). Mapped to invalid_format per RSR.
    const v = validateUploadContent(saved);
    if (v.code) {
        console.warn('[zones-moderation] approve rejected', v.code, filename);
        return json({ error: { code: 'invalid_format' } }, { status: 422 });
    }

    // Authoritative conflict check (pending vs published + within the file).
    // The check models the catalog AFTER publication: the published file this
    // approval replaces (same name) is excluded — otherwise a corrected
    // version of a group could never pass, always overlapping its old self.
    const fc = saved as GeoJSON.FeatureCollection;
    const mc = detectGroupMeshcore(fc);
    const conflicts = findZoneConflicts(
        {
            file: filename,
            level: mc?.level,
            features: parseZoneFeatures(fc.features, mc?.regions ?? '')
        },
        loadPublishedGroupEntries().filter((e) => e.file !== filename)
    );
    if (conflicts.length > 0) {
        console.warn('[zones-moderation] approve blocked by conflicts', filename, conflicts.length);
        return json({ error: { code: 'conflicts', conflicts } }, { status: 409 });
    }

    // Name clash with a published file: the moderator must confirm (overwrite).
    const moved = movePendingToGroups(filename, req.overwrite === true);
    if (moved === 'name_conflict') {
        return json({ error: { code: 'name_conflict' } }, { status: 409 });
    }
    if (moved === 'not_found') {
        return pendingNotFound();
    }

    console.info('[zones-moderation] approved', filename);
    return json({ ok: true, filename });
};
