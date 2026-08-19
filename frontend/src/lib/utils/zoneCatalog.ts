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
import {
    detectGroupMeshcore,
    parseZoneFeatures,
    readMeshcore
} from '$lib/utils/zoneFeatures';
import type { BoundaryFile, GroupFile, ZoneCatalog } from '$lib/types';

// The pure feature parser + preset detector now live in zoneFeatures.ts (shared
// with the server-side upload/moderation routes); re-exported here so existing
// client imports keep working.
export { detectGroupMeshcore, parseZoneFeatures } from '$lib/utils/zoneFeatures';

// --- shared helpers ---

function assetUrl(path: string): string {
    const basePart = base ? `${base}/` : '/';
    return `${basePart}${path}`;
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
// mounted directory at runtime (live add). Exported for zonesUpload.ts, which
// parses a pending file fetched from the moderation endpoint the same way
// (url key `pending:<filename>`).
export function parseGroupFile(
    url: string,
    json: unknown
): GroupFile | null {
    try {
        const j = json as {
            metadata?: {
                group?: unknown;
                name?: unknown;
                author?: unknown;
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
            author: typeof meta.author === 'string' && meta.author.trim() ? meta.author.trim() : undefined,
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
