// Serialization + validation of the configurator's drawn zones into the
// authoritative catalog format (task 72). Pure functions (downloadCatalog is a
// small DOM helper). Circles are converted to polygons before reaching here, so
// the exported file always holds standard Polygon/MultiPolygon features.

import { ZONE_CATALOG_SCHEMA } from '$lib/config/meshcoreZoneConfig';
import { validateGeometry } from '$lib/utils/zoneGeometry';
import type { ExportZone } from '$lib/types';

// The on-disk catalog: a GeoJSON FeatureCollection with a small `metadata`
// extension (schema version) used for forward-compatible migration.
export type ZoneCatalogJson = GeoJSON.FeatureCollection & {
    metadata?: { schema?: number; group?: string; regions?: string };
};

// A `regions` value is valid when it is one or more whitespace-separated tokens
// with no internal whitespace inside a token (e.g. 'ru mow msk cao').
export function isValidRegions(value: string): boolean {
    return /^[^\s]+(\s+[^\s]+)*$/.test(value.trim());
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

// Serialize one group's resolved zones into a GeoJSON FeatureCollection. The
// group name and `regions` characteristic are stored both in `metadata` (so the
// editor can list groups without parsing features) and on each feature's
// properties (so the lookup resolves a point by properties.regions).
export function serializeGroup(
    name: string,
    regions: string,
    zones: ExportZone[]
): ZoneCatalogJson {
    return {
        type: 'FeatureCollection',
        metadata: { schema: ZONE_CATALOG_SCHEMA, group: name, regions },
        features: zones.map((z) => ({
            type: 'Feature' as const,
            geometry: z.geometry,
            properties: {
                id: z.id,
                group: name,
                regions,
                ...z.properties
            }
        }))
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
