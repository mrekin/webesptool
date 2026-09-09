// Pure point-in-polygon lookup for the meshcore zone catalog (task 72).
// No Svelte, no fetch — only the catalog + point. Returns the `regions` value
// (tokens) plus the optional preset (radio/pathHashMode/nameTemplate/docUrl) for
// the zone containing the point, or nothing on miss/unavailable. A hit means the
// point is inside a zone polygon — that zone may carry any subset of preset
// fields (regions is optional, so tokens may be empty). Task 82: a feature may
// carry named settings presets (attached at parse time from metadata) — the
// result then reports them all plus the flat fields of the applied one.

import { ZONE_LEVEL_DEFAULT } from '$lib/config/meshcoreZoneConfig';
import { pointInGeometry } from '$lib/utils/zoneGeometry';
import { defaultPreset } from '$lib/utils/zoneSettingsPresets';
import type { ZoneCatalog, ZoneFeature, ZoneRegionResult } from '$lib/types';

// Cheap bbox containment prefilter: avoids the exact test for features whose
// bbox the point is clearly outside.
function withinBbox(point: [number, number], bbox: [number, number, number, number]): boolean {
    const [lon, lat] = point;
    return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

// Assemble the hit result for the resolved feature at `level` (task 82,
// RSR §3.7 — the containing-polygon choice itself is unchanged). Named presets,
// when attached, override the feature's flat fields: a single preset is applied
// as-is; with several, the `isDefault` one applies — and NO "first" fallback
// exists, so without a default the flat fields stay empty (the user must pick
// a group explicitly). The feature's flat fields (flat mode) are the metadata
// values for new files — the enrichment at parse time put them there. The
// result `level` is always the feature's own level: `level` is a zone-group
// attribute and never lives in a preset.
function regionResultFromFeature(feature: ZoneFeature, level: number): ZoneRegionResult {
    const presets = feature.settingPresets;
    if (!presets || presets.length === 0) {
        return {
            tokens: feature.regions.split(/\s+/).filter(Boolean),
            status: 'hit',
            regions: feature.regions,
            zoneId: feature.id,
            radio: feature.radio,
            pathHashMode: feature.pathHashMode,
            nameTemplate: feature.nameTemplate,
            docUrl: feature.docUrl,
            level,
            commands: feature.commands
        };
    }
    const applied = presets.length === 1 ? presets[0] : defaultPreset(presets);
    return {
        tokens: (applied?.regions ?? '').split(/\s+/).filter(Boolean),
        status: 'hit',
        regions: applied?.regions ?? '',
        zoneId: feature.id,
        radio: applied?.radio,
        pathHashMode: applied?.pathHashMode,
        nameTemplate: applied?.nameTemplate,
        docUrl: applied?.docUrl,
        level,
        commands: applied?.commands,
        settingPresets: presets,
        ...(applied ? { selectedPreset: applied.name } : {})
    };
}

// Resolve the `regions` value for `point` ([lon, lat]) against the catalog.
// - unavailable/empty catalog -> status 'unavailable' (reason set by the catalog)
// - point inside a feature     -> status 'hit', tokens = regions.split(/\s+/)
// - point outside every feature -> status 'miss'
// Zones may nest across hierarchy levels (a city zone over a country zone); the
// point resolves to the MOST SPECIFIC containing zone — the highest `level`
// (1=country … 5=city district). Zones at the same level never overlap, so the
// max level is unique; a same-level double-hit is logged defensively. Never
// throws: a failing feature is skipped with a warning.
export function lookupZoneRegion(point: [number, number], catalog: ZoneCatalog): ZoneRegionResult {
    if (catalog.status !== 'ok' || catalog.features.length === 0) {
        return { tokens: [], status: 'unavailable', reason: catalog.reason ?? 'empty_catalog' };
    }

    let best: { result: ZoneRegionResult; level: number } | null = null;
    for (const feature of catalog.features) {
        try {
            if (!withinBbox(point, feature.bbox)) continue;
            if (!pointInGeometry(point, feature.geometry)) continue;
            const level = feature.level ?? ZONE_LEVEL_DEFAULT;
            if (best && level <= best.level) {
                // Less specific (lower level) -> ignore; a same-level second hit
                // is impossible in a well-formed catalog (same-level zones never
                // overlap) — log defensively.
                if (level === best.level) {
                    console.warn('[meshcore-zone] overlap_in_catalog: same-level zones overlap');
                }
                continue;
            }
            best = { level, result: regionResultFromFeature(feature, level) };
        } catch (err) {
            console.warn('[meshcore-zone] lookup feature error, skipped', err);
        }
    }

    if (best) return best.result;
    return { tokens: [], status: 'miss' };
}
