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
import { ZONE_CATALOG_SCHEMA, ZONE_LEVEL_DEFAULT } from '$lib/config/meshcoreZoneConfig';
import { computeBbox, validateGeometry } from '$lib/utils/zoneGeometry';
import type {
    BoundaryFile,
    GroupFile,
    MeshcoreZoneSettings,
    MultiPolygonCoords,
    PolygonCoords,
    RadioSpec,
    ZoneCatalog,
    ZoneFeature,
    ZoneGeometry
} from '$lib/types';

// --- shared helpers ---

function assetUrl(path: string): string {
    const basePart = base ? `${base}/` : '/';
    return `${basePart}${path}`;
}

// Coerce a raw `properties.meshcore.radio` object into a typed RadioSpec.
// Requires all four numeric components; any missing/non-finite value -> null
// (the zone simply has no radio preset).
function parseRadio(raw: unknown): RadioSpec | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as { freq?: unknown; bw?: unknown; sf?: unknown; cr?: unknown };
    const freq = Number(r.freq);
    const bw = Number(r.bw);
    const sf = Number(r.sf);
    const cr = Number(r.cr);
    if (![freq, bw, sf, cr].every(Number.isFinite)) return null;
    return { freq, bw, sf, cr };
}

// Read the meshcore preset from a raw properties/metadata object. `regions` is
// read from the nested `meshcore.regions` first, then falls back to a flat
// legacy `regions`, then to `fallbackRegions`. radio/pathHashMode/nameTemplate/
// docUrl/level come only from the nested `meshcore` block. Returns the resolved
// regions (possibly '') and the optional preset fields. `level` is the zone
// hierarchy level (1-5); undefined when not specified (coalesced to the default
// at use sites — resolver/overlap — so "unspecified" stays distinguishable from
// an explicit 1 during group detection/merge).
function readMeshcore(
    props: Record<string, unknown> | null | undefined,
    fallbackRegions = ''
): {
    regions: string; // always a string ('' = not set); guaranteed by the fallbacks below
    radio?: RadioSpec;
    pathHashMode?: string;
    nameTemplate?: string;
    docUrl?: string;
    level?: number; // 1-5; undefined when not specified
} {
    const mcRaw = props?.meshcore;
    const mc =
        mcRaw && typeof mcRaw === 'object'
            ? (mcRaw as {
                  regions?: unknown;
                  radio?: unknown;
                  pathHashMode?: unknown;
                  nameTemplate?: unknown;
                  docUrl?: unknown;
                  level?: unknown;
              })
            : null;
    const regions =
        (mc && typeof mc.regions === 'string' ? mc.regions.trim() : '') ||
        (props && typeof props.regions === 'string' ? (props.regions as string).trim() : '') ||
        (fallbackRegions ? fallbackRegions.trim() : '');
    const optStr = (v: unknown): string | undefined =>
        typeof v === 'string' && v.trim() ? v.trim() : undefined;
    // Coerce a raw level to an integer 1-5, or undefined when absent/invalid.
    const optLevel = (v: unknown): number | undefined => {
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
        return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
    };
    return {
        regions,
        radio: mc ? parseRadio(mc.radio) ?? undefined : undefined,
        pathHashMode: mc ? optStr(mc.pathHashMode) : undefined,
        nameTemplate: mc ? optStr(mc.nameTemplate) : undefined,
        docUrl: mc ? optStr(mc.docUrl) : undefined,
        level: mc ? optLevel(mc.level) : undefined
    };
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
// A feature is kept as long as it has a valid geometry — it need NOT carry a
// `regions` value (regions, like every meshcore field, is optional; a zone may
// have any subset, including none). `fallbackRegions` is used when a feature
// carries regions only in metadata (e.g. an older group file). The preset
// (regions/radio/pathHashMode/nameTemplate/docUrl) is read from the nested
// `properties.meshcore` with a fallback to a flat legacy `properties.regions`.
// Invalid geometries are skipped.
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
            const mc = readMeshcore(props, fallbackRegions);
            const id = typeof props.id === 'string' && props.id ? props.id : `zone-${index + 1}`;
            out.push({
                id,
                geometry,
                bbox: computeBbox(geometry),
                regions: mc.regions,
                group: typeof props.group === 'string' ? props.group : undefined,
                radio: mc.radio,
                pathHashMode: mc.pathHashMode,
                nameTemplate: mc.nameTemplate,
                docUrl: mc.docUrl,
                level: mc.level,
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

// Detect whether a raw FeatureCollection is a published group (vs a plain base
// boundary). A file is a group when its metadata declares a group/name OR any
// feature/metadata carries a meshcore preset field (regions/radio/pathHashMode/
// nameTemplate/docUrl) — regions is NOT required. The preset is merged across
// sources (metadata first, features fill gaps) and returned with only the present
// fields; null when the file is a plain boundary. Used by the editor to auto-detect
// group vs boundary on user upload.
export function detectGroupMeshcore(fc: GeoJSON.FeatureCollection): MeshcoreZoneSettings | null {
    const meta = (fc as { metadata?: Record<string, unknown> }).metadata;
    const isGroupByName = !!(
        meta &&
        ((typeof meta.group === 'string' && meta.group) ||
            (typeof meta.name === 'string' && meta.name))
    );
    const merged = readMeshcore(meta);
    if (Array.isArray(fc.features)) {
        for (const f of fc.features) {
            const props = (f as { properties?: Record<string, unknown> | null }).properties ?? {};
            const fs = readMeshcore(props);
            if (!merged.regions && fs.regions) merged.regions = fs.regions;
            if (!merged.radio && fs.radio) merged.radio = fs.radio;
            if (!merged.pathHashMode && fs.pathHashMode) merged.pathHashMode = fs.pathHashMode;
            if (!merged.nameTemplate && fs.nameTemplate) merged.nameTemplate = fs.nameTemplate;
            if (!merged.docUrl && fs.docUrl) merged.docUrl = fs.docUrl;
            if (merged.level == null && fs.level != null) merged.level = fs.level;
        }
    }
    const hasField = !!(
        merged.regions ||
        merged.radio ||
        merged.pathHashMode ||
        merged.nameTemplate ||
        merged.docUrl ||
        merged.level
    );
    if (!isGroupByName && !hasField) return null;
    const out: MeshcoreZoneSettings = {};
    if (merged.regions) out.regions = merged.regions;
    if (merged.radio) out.radio = merged.radio;
    if (merged.pathHashMode) out.pathHashMode = merged.pathHashMode;
    if (merged.nameTemplate) out.nameTemplate = merged.nameTemplate;
    if (merged.docUrl) out.docUrl = merged.docUrl;
    if (merged.level != null) out.level = merged.level;
    return out;
}

// --- build-time discovery of static assets (glob paths must be literals) ---

// Build-time list of base boundary files. Only the glob KEYS are used (literal
// source paths under /static) — NOT `?url`. With `?url` Vite emits a
// content-hashed asset (e.g. OSMB-rus.DR3XXwFS.geojson under
// _app/immutable/assets/); the hash leaks into the displayed filename and the
// hashed URL 404s in the built image. Files under static/ are copied verbatim
// into build/client and served at their original path, so the served URL is the
// key with the /static prefix stripped (works identically in dev and build).
const boundaryPaths = Object.keys(
    import.meta.glob('/static/data/boundaries/*.geojson')
) as string[];

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
    return boundaryPaths.map((p) => ({
        url: p.replace(/^\/static/, ''),
        filename: fileBase(p)
    }));
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
            metadata?: {
                group?: unknown;
                name?: unknown;
                regions?: unknown;
                meshcore?: unknown;
            };
            features?: unknown;
        };
        const meta = j.metadata ?? {};
        const name =
            (typeof meta.group === 'string' && meta.group) ||
            (typeof meta.name === 'string' && meta.name) ||
            fileBase(url);
        // Read the group-level preset from metadata.meshcore (with a fallback to
        // a flat legacy metadata.regions), then let per-feature values fill in
        // regions when metadata has none.
        const metaMc = readMeshcore(meta as Record<string, unknown>);
        const metaRegions = metaMc.regions || (typeof meta.regions === 'string' ? meta.regions.trim() : '');
        const features = parseZoneFeatures(j.features, metaRegions);
        // Fall back to a feature-level regions value when metadata has none (an
        // older export or a hand-made file): the editor's regions field must
        // still populate when the group is loaded for editing.
        const regions =
            metaRegions ||
            features.map((f) => f.regions).find((r) => !!r) ||
            '';
        // Group level: metadata.meshcore.level first, then a feature's level,
        // then the default (1).
        const level =
            metaMc.level ??
            features.map((f) => f.level).find((l): l is number => l != null) ??
            ZONE_LEVEL_DEFAULT;
        return {
            url,
            filename: fileBase(url),
            name,
            regions,
            radio: metaMc.radio,
            pathHashMode: metaMc.pathHashMode,
            nameTemplate: metaMc.nameTemplate,
            docUrl: metaMc.docUrl,
            level,
            features
        } satisfies GroupFile;
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
