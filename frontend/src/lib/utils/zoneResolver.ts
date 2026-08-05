// Pure point-in-polygon lookup for the meshcore zone catalog (task 72).
// No Svelte, no fetch — only the catalog + point. Returns the `regions` value
// (tokens) for the zone containing the point, or nothing on miss/unavailable.

import { pointInGeometry } from '$lib/utils/zoneGeometry';
import type { ZoneCatalog, ZoneRegionResult } from '$lib/types';

// Cheap bbox containment prefilter: avoids the exact test for features whose
// bbox the point is clearly outside.
function withinBbox(
    point: [number, number],
    bbox: [number, number, number, number]
): boolean {
    const [lon, lat] = point;
    return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

// Resolve the `regions` value for `point` ([lon, lat]) against the catalog.
// - unavailable/empty catalog -> status 'unavailable' (reason set by the catalog)
// - point inside a feature     -> status 'hit', tokens = regions.split(/\s+/)
// - point outside every feature -> status 'miss'
// Never throws: a failing feature is skipped with a warning. Intersections in a
// catalog are impossible by construction (cut at draw time); defensively the
// first hit wins and an overlap is logged.
export function lookupZoneRegion(
    point: [number, number],
    catalog: ZoneCatalog
): ZoneRegionResult {
    if (catalog.status !== 'ok' || catalog.features.length === 0) {
        return { tokens: [], status: 'unavailable', reason: catalog.reason ?? 'empty_catalog' };
    }

    let hit: ZoneRegionResult | null = null;
    for (const feature of catalog.features) {
        try {
            if (!withinBbox(point, feature.bbox)) continue;
            if (!pointInGeometry(point, feature.geometry)) continue;
            if (hit) {
                // Catalogs should have no overlaps; log defensively if one is found.
                console.warn('[meshcore-zone] overlap_in_catalog: point in multiple zones');
                continue;
            }
            hit = {
                tokens: feature.regions.split(/\s+/).filter(Boolean),
                status: 'hit',
                regions: feature.regions,
                zoneId: feature.id
            };
        } catch (err) {
            console.warn('[meshcore-zone] lookup feature error, skipped', err);
        }
    }

    if (hit) return hit;
    return { tokens: [], status: 'miss' };
}
