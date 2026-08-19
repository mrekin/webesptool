// Zone conflict engine (task 77), shared by the client (moderation UI) and the
// server (authoritative check on approve). Pure module — no Svelte, no fetch;
// imports only turf + config. Implements the task-72 non-overlap rules: two
// zones conflict when they share a concrete level (or either has none — the
// homeless-zone wildcard), their bboxes intersect, and the intersection area is
// above the sliver floor (touching contours are NOT a conflict).

import { area as turfArea } from '@turf/area';
import { featureCollection } from '@turf/helpers';
import { intersect as turfIntersect } from '@turf/intersect';
import { ZONE_LEVEL_DEFAULT, ZONE_MIN_AREA_M2 } from '$lib/config/meshcoreZoneConfig';
import { toTurfFeature } from '$lib/utils/zoneGeometry';
import type { ZoneConflictPair, ZoneConflictRef, ZoneFeature } from '$lib/types';

// Two zones may not overlap when they share a concrete level, OR when either
// is a wildcard (no level) — a homeless zone collides with zones of any level.
// The single implementation of the rule (moved here from ZoneEditor.svelte so
// the editor's drawing checks and the moderation engine cannot diverge).
export function levelsConflict(a: number | null, b: number | null): boolean {
    return a === null || b === null || a === b;
}

// A feature's effective level: the feature's own preset first, then the file's
// group level, then the default (task 72 coalescing — file zones always end up
// with a concrete level).
function featureLevel(f: ZoneFeature, fileLevel: number | undefined): number {
    return f.level ?? fileLevel ?? ZONE_LEVEL_DEFAULT;
}

function refOf(file: string, f: ZoneFeature, level: number): ZoneConflictRef {
    const name = f.properties?.name;
    return {
        file,
        id: f.id,
        name: typeof name === 'string' && name ? name : undefined,
        level
    };
}

function bboxesOverlap(
    a: [number, number, number, number],
    b: [number, number, number, number]
): boolean {
    return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

// Intersection area in m²; 0 on no overlap or a failed pair (never throws — a
// broken pair is skipped with a warning, mirroring the parser's resilience).
function overlapAreaM2(a: ZoneFeature, b: ZoneFeature): number {
    try {
        const inter = turfIntersect(
            featureCollection([toTurfFeature(a.geometry), toTurfFeature(b.geometry)])
        );
        if (!inter) return 0;
        return turfArea(inter);
    } catch (err) {
        console.warn('[meshcore-zone] conflict pair check failed', a.id, b.id, err);
        return 0;
    }
}

// One side of the conflict check: a named file (pending or published) with its
// group level and parsed features.
export interface ZoneConflictInput {
    file: string;
    level?: number;
    features: ZoneFeature[];
}

// Find every conflict pair of a pending file:
//   - kind 'within'    — two features of the SAME pending file (pairs i < j);
//   - kind 'published' — a pending feature vs a published catalog feature.
// Pairs between DIFFERENT pending files are deliberately not checked (PRD 77:
// only (a) with published and (b) within the file). A conflict requires
// levelsConflict + bbox overlap + intersection area above the floor.
export function findZoneConflicts(
    pending: ZoneConflictInput,
    published: ZoneConflictInput[]
): ZoneConflictPair[] {
    const pairs: ZoneConflictPair[] = [];
    const feats = pending.features;
    for (let i = 0; i < feats.length; i++) {
        const a = feats[i];
        const aLvl = featureLevel(a, pending.level);
        for (let j = i + 1; j < feats.length; j++) {
            const b = feats[j];
            const bLvl = featureLevel(b, pending.level);
            if (!levelsConflict(aLvl, bLvl)) continue;
            if (!bboxesOverlap(a.bbox, b.bbox)) continue;
            if (overlapAreaM2(a, b) <= ZONE_MIN_AREA_M2) continue;
            pairs.push({ kind: 'within', a: refOf(pending.file, a, aLvl), b: refOf(pending.file, b, bLvl) });
        }
        for (const pub of published) {
            for (const b of pub.features) {
                const bLvl = featureLevel(b, pub.level);
                if (!levelsConflict(aLvl, bLvl)) continue;
                if (!bboxesOverlap(a.bbox, b.bbox)) continue;
                if (overlapAreaM2(a, b) <= ZONE_MIN_AREA_M2) continue;
                pairs.push({
                    kind: 'published',
                    a: refOf(pending.file, a, aLvl),
                    b: refOf(pub.file, b, bLvl)
                });
            }
        }
    }
    return pairs;
}
