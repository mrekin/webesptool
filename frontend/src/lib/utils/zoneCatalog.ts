// Client-side loaders for the meshcore zone feature (task 72). Two kinds of
// static GeoJSON assets, both auto-discovered at build time (import.meta.glob):
//   - data/boundaries/*.geojson — base admin boundaries (no characteristics).
//   - data/groups/*.geojson     — published groups (name + regions + polygons);
//     the source of truth for the `regions` lookup.
//
// Never throws: on any error (network, bad JSON, invalid feature) a file/feature
// is skipped so the editor and picker keep working. Module-level promise caches
// avoid re-fetching (session-immutable) assets.

import { base } from '$app/paths';
import { ZONE_CATALOG_SCHEMA } from '$lib/config/meshcoreZoneConfig';
import { computeBbox, validateGeometry } from '$lib/utils/zoneGeometry';
import type {
    BoundaryFile,
    GroupFile,
    MultiPolygonCoords,
    PolygonCoords,
    ZoneCatalog,
    ZoneFeature,
    ZoneGeometry
} from '$lib/types';

// --- shared helpers ---

function assetUrl(path: string): string {
    const basePart = base ? `${base}/` : '/';
    return `${basePart}${path}`;
}

function asGeometry(raw: unknown): ZoneGeometry | null {
    if (!raw || typeof raw !== 'object') return null;
    const g = raw as { type: string; coordinates: unknown };
    const coords = Array.isArray(g.coordinates) && g.coordinates.length > 0 ? g.coordinates : null;
    if (!coords) return null;
    if (g.type === 'Polygon') return { type: 'Polygon', coordinates: coords as PolygonCoords };
    if (g.type === 'MultiPolygon')
        return { type: 'MultiPolygon', coordinates: coords as MultiPolygonCoords };
    return null;
}

// Validate + normalize raw GeoJSON features into ZoneFeature[] (precompute bbox).
// `fallbackRegions` is used when a feature has no properties.regions (e.g. a
// group file carrying regions only in metadata). Invalid features are skipped.
export function parseZoneFeatures(rawFeatures: unknown, fallbackRegions = ''): ZoneFeature[] {
    const out: ZoneFeature[] = [];
    if (!Array.isArray(rawFeatures)) return out;
    rawFeatures.forEach((rawFeature, index) => {
        try {
            if (!rawFeature || typeof rawFeature !== 'object') return;
            const f = rawFeature as { geometry?: unknown; properties?: Record<string, unknown> | null };
            const geometry = asGeometry(f.geometry);
            if (!geometry || !validateGeometry(geometry).valid) return;
            const props = f.properties ?? {};
            const regions =
                (typeof props.regions === 'string' ? props.regions.trim() : '') ||
                (fallbackRegions ? fallbackRegions.trim() : '');
            if (!regions) return;
            const id = typeof props.id === 'string' && props.id ? props.id : `zone-${index + 1}`;
            out.push({
                id,
                geometry,
                bbox: computeBbox(geometry),
                regions,
                group: typeof props.group === 'string' ? props.group : undefined,
                properties: props
            });
        } catch (err) {
            console.warn('[meshcore-zone] feature skipped', err);
        }
    });
    return out;
}

// Parse a single FeatureCollection into a ZoneCatalog (kept for compatibility).
export function parseZoneCatalog(raw: unknown): ZoneCatalog {
    if (!raw || typeof raw !== 'object') return { status: 'unavailable', features: [], reason: 'invalid' };
    const fc = raw as { type?: string; features?: unknown[]; metadata?: { schema?: unknown } };
    if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        return { status: 'unavailable', features: [], reason: 'invalid' };
    }
    const schema = typeof fc.metadata?.schema === 'number' ? fc.metadata.schema : ZONE_CATALOG_SCHEMA;
    const features = parseZoneFeatures(fc.features);
    if (features.length === 0) {
        return { status: 'unavailable', features: [], reason: 'empty_catalog', schema };
    }
    return { status: 'ok', features, schema };
}

// --- build-time discovery of static assets (glob paths must be literals) ---

const boundaryUrls = import.meta.glob('/static/data/boundaries/*.geojson', {
    eager: true,
    query: '?url',
    import: 'default'
}) as Record<string, string>;

// NOTE: groups are NOT discovered via a build-time glob — they support live add
// (the administrator drops a new .geojson into the mounted static/data/groups/
// directory at runtime). Their list is fetched from the /api/zones/groups
// endpoint, which reads that directory on each request (see
// routes/api/zones/groups/+server.ts).

function fileBase(url: string): string {
    const seg = url.split('/').pop() ?? url;
    return seg.replace(/\.geojson$/i, '');
}

// --- base boundary files (reference shapes, no characteristics) ---

// List of base boundary files discovered at build time (URLs only — no content
// fetched, since these can be very large, e.g. a 39 MB country file). Content is
// fetched lazily by fetchBoundaryFile when the user toggles a file on.
export function boundaryFileList(): { url: string; filename: string }[] {
    return Object.values(boundaryUrls).map((url) => ({ url, filename: fileBase(url) }));
}

const boundaryFileCache = new Map<string, Promise<BoundaryFile | null>>();

// Fetch one boundary file's content (cached per URL). Never rejects; returns
// null on error so the editor keeps working.
export function fetchBoundaryFile(url: string): Promise<BoundaryFile | null> {
    let p = boundaryFileCache.get(url);
    if (!p) {
        p = (async () => {
            try {
                const res = await fetch(assetUrl(url.replace(/^\//, '')), {
                    signal: AbortSignal.timeout(30000)
                });
                if (!res.ok) return null;
                const json = (await res.json()) as unknown;
                if (
                    json &&
                    typeof json === 'object' &&
                    (json as { type?: string }).type === 'FeatureCollection'
                ) {
                    return {
                        url,
                        filename: fileBase(url),
                        fc: json as GeoJSON.FeatureCollection
                    } satisfies BoundaryFile;
                }
                return null;
            } catch (err) {
                console.warn('[meshcore-zone] boundary file failed', url, err);
                return null;
            }
        })();
        boundaryFileCache.set(url, p);
    }
    return p;
}

// --- published group files (source of truth for the `regions` lookup) ---

// Parse an already-loaded group file's JSON into a GroupFile. `url` is a stable
// identifier (used as the toggle key / edit-origin marker); it is NOT fetched —
// group content comes from the /api/zones/groups endpoint, which reads the
// mounted directory at runtime (live add).
function parseGroupFile(
    url: string,
    json: unknown
): GroupFile | null {
    try {
        const j = json as {
            metadata?: { group?: unknown; name?: unknown; regions?: unknown };
            features?: unknown;
        };
        const meta = j.metadata ?? {};
        const name =
            (typeof meta.group === 'string' && meta.group) ||
            (typeof meta.name === 'string' && meta.name) ||
            fileBase(url);
        const metaRegions = typeof meta.regions === 'string' ? meta.regions.trim() : '';
        const features = parseZoneFeatures(j.features, metaRegions);
        // Fall back to a feature-level regions value when metadata has none (an
        // older export or a hand-made file): the editor's regions field must
        // still populate when the group is loaded for editing.
        const regions =
            metaRegions ||
            features.map((f) => f.regions).find((r) => !!r) ||
            '';
        return { url, filename: fileBase(url), name, regions, features } satisfies GroupFile;
    } catch (err) {
        console.warn('[meshcore-zone] group parse failed', url, err);
        return null;
    }
}

// Load every published group file via the /api/zones/groups endpoint, which
// reads the mounted static/data/groups/ directory at request time. Re-fetched
// on each call so files added since the last call (live add) appear without a
// rebuild. Never rejects; failed files are skipped.
export function fetchGroupFiles(): Promise<GroupFile[]> {
    return (async () => {
        let entries: { filename: string; json: unknown }[] = [];
        try {
            const res = await fetch(assetUrl('api/zones/groups'), {
                signal: AbortSignal.timeout(15000)
            });
            if (res.ok) {
                const data = (await res.json()) as { groups?: unknown };
                if (Array.isArray(data?.groups)) {
                    entries = data.groups as { filename: string; json: unknown }[];
                }
            }
        } catch (err) {
            console.warn('[meshcore-zone]', 'group list failed', err);
        }
        const files = entries.map((e) => parseGroupFile(assetUrl(`data/groups/${e.filename}`), e.json));
        const ok = files.filter((f): f is GroupFile => f !== null);
        console.info('[meshcore-zone]', 'groups_loaded', ok.length);
        return ok;
    })();
}

// Build the lookup catalog by merging every published group file's features.
// A point resolves to the group whose polygon contains it. Recomputed on each
// call so live-added groups are picked up; never rejects (empty -> unavailable).
export function fetchZoneCatalog(): Promise<ZoneCatalog> {
    return (async () => {
        const groups = await fetchGroupFiles();
        const features = groups.flatMap((g) => g.features);
        if (features.length === 0) {
            return { status: 'unavailable', features: [], reason: 'empty_catalog' };
        }
        return { status: 'ok', features, schema: ZONE_CATALOG_SCHEMA };
    })();
}
