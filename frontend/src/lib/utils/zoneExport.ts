// Serialization + validation of the configurator's drawn zones into the
// authoritative catalog format (task 72). Pure functions (downloadCatalog is a
// small DOM helper). Circles are converted to polygons before reaching here, so
// the exported file always holds standard Polygon/MultiPolygon features.

import { ZONE_CATALOG_SCHEMA } from '$lib/config/meshcoreZoneConfig';
import { validateGeometry } from '$lib/utils/zoneGeometry';
import type {
    ExportZone,
    MeshcoreZoneSettings,
    NamedMeshcoreSettings,
    ZoneGroupSettings
} from '$lib/types';

// The on-disk catalog: a GeoJSON FeatureCollection with a small `metadata`
// extension (schema version) used for forward-compatible migration. The meshcore
// settings live ONLY under `metadata.meshcore` (task 82, review 2026-09-08) —
// features carry no `properties.meshcore`; a flat legacy `regions` is kept in
// the type for backward-compatible reading of older catalogs.
export type ZoneCatalogJson = GeoJSON.FeatureCollection & {
    metadata?: {
        schema?: number;
        group?: string;
        author?: string; // who filled the group in (optional catalog metadata)
        regions?: string; // legacy flat field (older exports)
        // Mutually exclusive forms (RSR §3.0): either the flat preset fields
        // (incl. `level`) or `level` + `settingsPresets` — never both; written
        // that way by serializeGroup, read metadata-first by zoneFeatures.
        meshcore?: ZoneGroupSettings;
    };
};

// A `regions` value is valid when it is empty (regions is optional — '' means
// "not set") or one or more whitespace-separated tokens with no internal
// whitespace inside a token (e.g. 'ru mow msk cao').
export function isValidRegions(value: string): boolean {
    const t = value.trim();
    return t === '' || /^[^\s]+(\s+[^\s]+)*$/.test(t);
}

export interface ExportValidation {
    valid: boolean;
    problems: string[];
}

// Validate a set of zones before export: non-empty, each has a valid `regions`
// value and a valid geometry (no self-intersections, non-trivial area).
export function validateExport(zones: ExportZone[]): ExportValidation {
    const problems: string[] = [];
    if (zones.length === 0) {
        return { valid: false, problems: ['empty'] };
    }
    zones.forEach((z) => {
        if (!isValidRegions(z.regions ?? '')) problems.push(`${z.id}: invalid regions`);
        const check = validateGeometry(z.geometry);
        if (!check.valid) problems.push(`${z.id}: ${check.reason}`);
    });
    return { valid: problems.length === 0, problems };
}

// Build a meshcore preset object containing only the present (non-empty) fields,
// so a zone without `regions` (or any other characteristic) is serialized without
// that key. Returns undefined when the preset has no fields at all (a paramless
// zone carries no `meshcore` block at all — only geometry + id + group).
function buildMeshcoreBlock(p: MeshcoreZoneSettings): MeshcoreZoneSettings | undefined {
    const block: MeshcoreZoneSettings = {};
    if (p.regions && p.regions.trim()) block.regions = p.regions;
    if (p.radio) block.radio = p.radio;
    if (p.pathHashMode) block.pathHashMode = p.pathHashMode;
    if (p.nameTemplate && p.nameTemplate.trim()) block.nameTemplate = p.nameTemplate;
    if (p.docUrl && p.docUrl.trim()) block.docUrl = p.docUrl;
    if (p.level != null) block.level = p.level;
    // Extra commands ride along only when the list is non-empty (an empty list
    // writes no key, same rule as every other empty preset field).
    if (p.commands && p.commands.length > 0) block.commands = p.commands;
    return Object.keys(block).length > 0 ? block : undefined;
}

// Build one element of `metadata.meshcore.settingsPresets` (task 82): `name`
// always, `isDefault` only when true, then the preset fields through the shared
// "empty fields are omitted" rule. `level` never appears — a preset does not
// carry it by type (level is a zone-group attribute, RSR §3.6).
function buildPresetBlock(p: NamedMeshcoreSettings): NamedMeshcoreSettings {
    return {
        name: p.name,
        ...(p.isDefault === true ? { isDefault: true } : {}),
        ...(buildMeshcoreBlock(p) ?? {})
    };
}

// Serialize one group's resolved zones into a GeoJSON FeatureCollection. The
// group name and the optional author (catalog metadata — who filled the group
// in) are plain `metadata` fields next to `schema`. The meshcore settings live
// ONCE, under `metadata.meshcore` (task 82, review 2026-09-08): flat state
// (no settingsPresets) writes the flat preset incl. `level` — the same block
// composition as before; grouped state writes ONLY `level` +
// `settingsPresets` (flat settings fields are deliberately omitted — the two
// forms are mutually exclusive, RSR §3.0). Features carry no `properties.meshcore`
// at all: settings and level are enriched back in memory at parse time
// (zoneFeatures.enrichFeaturesFromMetadata), which also makes new files
// noticeably smaller than the old per-polygon duplication. `author` is
// metadata-only — not firmware config, not duplicated into features.
export function serializeGroup(
    name: string,
    settings: ZoneGroupSettings,
    zones: ExportZone[],
    author?: string
): ZoneCatalogJson {
    const metadata: ZoneCatalogJson['metadata'] = {
        schema: ZONE_CATALOG_SCHEMA,
        group: name
    };
    if (author && author.trim()) metadata.author = author.trim();
    if (settings.settingsPresets && settings.settingsPresets.length > 0) {
        metadata.meshcore = {
            ...(settings.level != null ? { level: settings.level } : {}),
            settingsPresets: settings.settingsPresets.map(buildPresetBlock)
        };
    } else {
        const metaBlock = buildMeshcoreBlock(settings);
        if (metaBlock) metadata.meshcore = metaBlock;
    }
    return {
        type: 'FeatureCollection',
        metadata,
        features: zones.map((z) => ({
            type: 'Feature' as const,
            geometry: z.geometry,
            properties: {
                ...z.properties,
                id: z.id,
                group: name
            }
        }))
    };
}

// Trigger a browser download of the catalog as a .geojson file.
export function downloadCatalog(fc: ZoneCatalogJson, filename = 'mczones.geojson'): void {
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/// The canonical file name of one group's catalog file: `mczones-<slug>.geojson`
// where the slug is the group name with anything outside [a-z0-9_-] replaced by
// '_' (collapsed), falling back to a regions-derived slug, then the group id.
// Shared by the export download and the server upload (task 77) so a re-upload
// of the same group targets the same pending file name (idempotent replace).
export function groupFileName(name: string, regions: string, id: string): string {
    const slug =
        name.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_') ||
        regions.replace(/\s+/g, '-') ||
        id;
    return `mczones-${slug}.geojson`;
}
