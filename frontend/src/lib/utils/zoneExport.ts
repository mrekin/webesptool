// Serialization + validation of the configurator's drawn zones into the
// authoritative catalog format (task 72). Pure functions (downloadCatalog is a
// small DOM helper). Circles are converted to polygons before reaching here, so
// the exported file always holds standard Polygon/MultiPolygon features.

import { ZONE_CATALOG_SCHEMA } from '$lib/config/meshcoreZoneConfig';
import { validateGeometry } from '$lib/utils/zoneGeometry';
import type { ExportZone, MeshcoreZoneSettings } from '$lib/types';

// The on-disk catalog: a GeoJSON FeatureCollection with a small `metadata`
// extension (schema version) used for forward-compatible migration. The meshcore
// preset (regions + radio + pathHashMode) lives nested under `metadata.meshcore`
// and each feature's `properties.meshcore`; a flat legacy `regions` is kept in
// the type for backward-compatible reading of older catalogs.
export type ZoneCatalogJson = GeoJSON.FeatureCollection & {
    metadata?: {
        schema?: number;
        group?: string;
        regions?: string; // legacy flat field (older exports)
        meshcore?: MeshcoreZoneSettings;
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
        if (!isValidRegions(z.regions)) problems.push(`${z.id}: invalid regions`);
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
    return Object.keys(block).length > 0 ? block : undefined;
}

// Serialize one group's resolved zones into a GeoJSON FeatureCollection. The
// group name and the meshcore preset (any subset of regions/radio/pathHashMode/
// nameTemplate/docUrl) are stored nested under `metadata.meshcore` (so the editor
// can list groups without parsing features) and on each feature's
// `properties.meshcore` (so the lookup resolves a point and its full preset).
// Empty fields are omitted; a zone with no preset at all carries no meshcore key.
export function serializeGroup(
    name: string,
    meshcore: MeshcoreZoneSettings,
    zones: ExportZone[]
): ZoneCatalogJson {
    const metaBlock = buildMeshcoreBlock(meshcore);
    const metadata: ZoneCatalogJson['metadata'] = {
        schema: ZONE_CATALOG_SCHEMA,
        group: name
    };
    if (metaBlock) metadata.meshcore = metaBlock;
    return {
        type: 'FeatureCollection',
        metadata,
        features: zones.map((z) => {
            const featureBlock = buildMeshcoreBlock({
                regions: z.regions,
                radio: meshcore.radio,
                pathHashMode: meshcore.pathHashMode,
                nameTemplate: meshcore.nameTemplate,
                docUrl: meshcore.docUrl,
                level: z.level ?? meshcore.level
            });
            const properties: Record<string, unknown> = {
                ...z.properties,
                id: z.id,
                group: name
            };
            if (featureBlock) properties.meshcore = featureBlock;
            return {
                type: 'Feature' as const,
                geometry: z.geometry,
                properties
            };
        })
    };
}

// Trigger a browser download of the catalog as a .geojson file.
export function downloadCatalog(
    fc: ZoneCatalogJson,
    filename = 'mczones.geojson'
): void {
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
