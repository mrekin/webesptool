// Pure point-in-polygon lookup for the meshcore zone catalog (task 72).
// No Svelte, no fetch — only the catalog + point. Returns the `regions` value
// (tokens) plus the optional preset (radio/pathHashMode/nameTemplate/docUrl)
// merged over the zone levels containing the point (task 87: inheritance
// chain, most specific wins; only an explicit `inherit: true` continues the
// chain toward coarser zones), or nothing on miss/unavailable. A hit
// means the point is inside at least one zone polygon — zones may carry any
// subset of preset fields (regions is optional, so tokens may be empty).
// Task 82: a feature may carry named settings presets (attached at parse time
// from metadata) — the result then reports them all plus the flat fields of
// the applied one.

import { ZONE_LEVEL_DEFAULT } from '$lib/config/meshcoreZoneConfig';
import { pointInGeometry } from '$lib/utils/zoneGeometry';
import { defaultPreset } from '$lib/utils/zoneSettingsPresets';
import type {
    NamedMeshcoreSettings,
    ZoneCatalog,
    ZoneFeature,
    ZoneRegionResult,
    ZoneResultSource
} from '$lib/types';

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

// One per-level contribution to a merged lookup result (task 87): a zone
// whose polygon contains the point, its hierarchy level, and the per-zone
// result extracted from the feature.
export interface ZoneResolutionPart {
    feature: ZoneFeature;
    result: ZoneRegionResult;
    level: number;
}

// Merge two same-named settings presets across hierarchy levels (task 87,
// merge layer 2): the more specific field wins when defined, a missing one is
// filled from the coarser preset; regions — the specific non-empty string,
// else the coarser one; commands concatenate coarser -> specific (the same
// rule as zone-level commands); isDefault: true of the specific wins, else
// the coarser one stays. Returns a new object; the inputs are untouched.
function mergeNamedPresets(
    coarser: NamedMeshcoreSettings,
    specific: NamedMeshcoreSettings
): NamedMeshcoreSettings {
    return {
        ...coarser,
        ...specific,
        radio: specific.radio ?? coarser.radio,
        pathHashMode: specific.pathHashMode ?? coarser.pathHashMode,
        nameTemplate: specific.nameTemplate ?? coarser.nameTemplate,
        docUrl: specific.docUrl ?? coarser.docUrl,
        regions: specific.regions?.trim() ? specific.regions : coarser.regions,
        commands: [...(coarser.commands ?? []), ...(specific.commands ?? [])],
        isDefault: specific.isDefault ?? coarser.isDefault
    };
}

// Merge the per-level parts of an inheritance chain into one result (task 87,
// RSR §4.3.3). `parts` MUST be ordered from the largest (least specific) level
// to the most specific one. Rules:
//   - tokens: ordered union (largest first), deduplicated by exact match;
//     `regions` = tokens joined with spaces;
//   - radio/pathHashMode/nameTemplate/docUrl: the most specific part's defined
//     (!== undefined) value wins;
//   - commands: ordered concatenation (largest first), no deduplication —
//     application resolves conflicts by "later wins", as when re-applying a
//     preset;
//   - settingPresets: same-named presets merged across levels (layer 2, see
//     mergeNamedPresets); a preset without a same-named pair passes through
//     from its own level;
//   - level/zoneId/selectedPreset/status: from the most specific part;
//   - sources/zoneKey: the chain itself, MOST SPECIFIC FIRST.
// A single part reproduces today's per-zone result exactly (empty collections
// stay undefined, scalar values unchanged).
export function mergeZoneRegionResults(parts: ZoneResolutionPart[]): ZoneRegionResult {
    if (parts.length === 0) return { tokens: [], status: 'miss' };
    const mostSpecific = parts[parts.length - 1];

    // Tokens: ordered union (largest first), deduplicated by exact match.
    const tokens: string[] = [];
    for (const part of parts) {
        for (const token of part.result.tokens) {
            if (!tokens.includes(token)) tokens.push(token);
        }
    }

    // Commands: ordered concatenation (largest first), no deduplication.
    const commands = parts.flatMap((p) => p.result.commands ?? []);

    // Settings presets: merge same-named groups across levels, walking from
    // the largest level to the most specific one. Insertion order (largest
    // level's presets first) matches the single-zone array order for a single
    // part; the picker sorts by name for display anyway.
    const presetsByName = new Map<string, NamedMeshcoreSettings>();
    for (const part of parts) {
        for (const preset of part.result.settingPresets ?? []) {
            const existing = presetsByName.get(preset.name);
            presetsByName.set(preset.name, existing ? mergeNamedPresets(existing, preset) : preset);
        }
    }
    const settingPresets = [...presetsByName.values()];

    // Scalars: the most specific defined value wins (walk specific -> coarse).
    const fromSpecific = <T>(get: (r: ZoneRegionResult) => T | undefined): T | undefined => {
        for (let i = parts.length - 1; i >= 0; i--) {
            const value = get(parts[i].result);
            if (value !== undefined) return value;
        }
        return undefined;
    };

    // The chain itself, MOST SPECIFIC FIRST (panel display order). A zone's
    // display name is its catalog group name, with fallbacks for files that
    // lack one.
    const ordered = [...parts].reverse();
    const sources: ZoneResultSource[] = ordered.map((p) => {
        // Names of the zone's own groups (they fed the same-name merge) — the
        // picker derives per-source "(group)" annotations and the selector's
        // zone coverage from these, based on the ACTIVE selection.
        const presetNames = (p.result.settingPresets ?? []).map((preset) => preset.name);
        return {
            zoneId: p.result.zoneId ?? p.feature.id,
            zoneName: p.feature.groupName ?? p.feature.group ?? p.feature.id,
            level: p.level,
            ...(presetNames.length > 0 ? { presetNames } : {})
        };
    });
    const zoneKey = ordered.map((p) => p.result.zoneId ?? p.feature.id).join('|');

    return {
        tokens,
        status: 'hit',
        regions: tokens.join(' '),
        zoneId: mostSpecific.result.zoneId,
        radio: fromSpecific((r) => r.radio),
        pathHashMode: fromSpecific((r) => r.pathHashMode),
        nameTemplate: fromSpecific((r) => r.nameTemplate),
        docUrl: fromSpecific((r) => r.docUrl),
        level: mostSpecific.level,
        ...(commands.length > 0 ? { commands } : {}),
        ...(settingPresets.length > 0 ? { settingPresets } : {}),
        // The applied group of the chain: the most specific zone that HAS one
        // applied (task 82 auto-applies a zone's single/default group). With
        // same-named groups at several levels the specific one wins — same
        // priority as the scalar fields.
        selectedPreset: fromSpecific((r) => r.selectedPreset),
        sources,
        zoneKey
    };
}

// Resolve the settings of `point` ([lon, lat]) against the zone catalog.
// - unavailable/empty catalog -> status 'unavailable' (reason set by the catalog)
// - point inside feature(s)   -> status 'hit', merged chain result (task 87)
// - point outside every feature -> status 'miss'
// Zones may nest across hierarchy levels (a city zone over a country zone);
// the chain is merged from the largest level to the most specific one
// (mergeZoneRegionResults), one zone per level — but only while walking up
// from the most specific zone over zones with an explicit `inherit: true`.
// Zones at the same level never overlap, so a same-level
// double-hit is impossible in a well-formed catalog — logged defensively and
// ignored. Never throws: a failing feature is skipped with a warning.
export function lookupZoneRegion(point: [number, number], catalog: ZoneCatalog): ZoneRegionResult {
    if (catalog.status !== 'ok' || catalog.features.length === 0) {
        return { tokens: [], status: 'unavailable', reason: catalog.reason ?? 'empty_catalog' };
    }

    const parts: ZoneResolutionPart[] = [];
    for (const feature of catalog.features) {
        try {
            if (!withinBbox(point, feature.bbox)) continue;
            if (!pointInGeometry(point, feature.geometry)) continue;
            const level = feature.level ?? ZONE_LEVEL_DEFAULT;
            if (parts.some((p) => p.level === level)) {
                // A same-level second hit is impossible in a well-formed
                // catalog (same-level zones never overlap) — log defensively.
                console.warn('[meshcore-zone] overlap_in_catalog: same-level zones overlap');
                continue;
            }
            parts.push({ feature, level, result: regionResultFromFeature(feature, level) });
        } catch (err) {
            console.warn('[meshcore-zone] lookup feature error, skipped', err);
        }
    }

    if (parts.length === 0) return { tokens: [], status: 'miss' };
    // Largest (least specific) level first — the merge order.
    parts.sort((a, b) => a.level - b.level);
    // Inheritance cut (task 87): only an explicit `inherit: true` continues
    // the walk toward coarser zones — false/absent stop it.
    let start = parts.length - 1;
    while (start > 0 && parts[start].feature.inherit === true) start--;
    return mergeZoneRegionResults(parts.slice(start));
}
