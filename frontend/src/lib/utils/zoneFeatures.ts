// Pure GeoJSON feature parsing for the meshcore zone catalog format (task 72),
// extracted from zoneCatalog.ts (task 77) so the SERVER can reuse the exact
// same reading rules (upload validation, pending moderation) without pulling
// in client-only concerns ($app/paths, import.meta.glob, fetch). No Svelte, no
// fetch — safe to import from both the browser and +server.ts routes.

import { computeBbox, validateGeometry } from '$lib/utils/zoneGeometry';
import type {
    MeshcoreZoneSettings,
    MultiPolygonCoords,
    PolygonCoords,
    RadioSpec,
    ZoneFeature,
    ZoneGeometry
} from '$lib/types';

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
// docUrl/level/commands come only from the nested `meshcore` block. Returns the
// resolved regions (possibly '') and the optional preset fields. `level` is the
// zone hierarchy level (1-5); undefined when not specified (coalesced to the
// default at use sites — resolver/overlap — so "unspecified" stays
// distinguishable from an explicit 1 during group detection/merge).
export function readMeshcore(
    props: Record<string, unknown> | null | undefined,
    fallbackRegions = ''
): {
    regions: string; // always a string ('' = not set); guaranteed by the fallbacks below
    radio?: RadioSpec;
    pathHashMode?: string;
    nameTemplate?: string;
    docUrl?: string;
    level?: number; // 1-5; undefined when not specified
    commands?: string[]; // trimmed non-empty strings; undefined when none survive
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
                  commands?: unknown;
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
    // Coerce a raw `commands` value: only a real array is considered, only its
    // string entries are kept (trimmed, non-empty); anything else is silently
    // ignored (a hand-made/hostile file cannot smuggle other JSON shapes).
    // Duplicates are preserved — the list is applied verbatim.
    const optCommands = (v: unknown): string[] | undefined => {
        if (!Array.isArray(v)) return undefined;
        const cmds = v
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim())
            .filter((c) => c !== '');
        return cmds.length > 0 ? cmds : undefined;
    };
    return {
        regions,
        radio: mc ? parseRadio(mc.radio) ?? undefined : undefined,
        pathHashMode: mc ? optStr(mc.pathHashMode) : undefined,
        nameTemplate: mc ? optStr(mc.nameTemplate) : undefined,
        docUrl: mc ? optStr(mc.docUrl) : undefined,
        level: mc ? optLevel(mc.level) : undefined,
        commands: mc ? optCommands(mc.commands) : undefined
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
                commands: mc.commands,
                properties: props
            });
        } catch (err) {
            console.warn('[meshcore-zone] feature skipped', err);
        }
    });
    return out;
}

// Detect whether a raw FeatureCollection is a published group (vs a plain base
// boundary). A file is a group when its metadata declares a group/name OR any
// feature/metadata carries a meshcore preset field (regions/radio/pathHashMode/
// nameTemplate/docUrl) — regions is NOT required. The preset is merged across
// sources (metadata first, features fill gaps) and returned with only the present
// fields; null when the file is a plain boundary. Used by the editor to auto-detect
// group vs boundary on user upload, and by the server to read a saved file's
// preset (incl. the docUrl presence rule of the upload validation).
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
            if (!merged.commands && fs.commands) merged.commands = fs.commands;
        }
    }
    const hasField = !!(
        merged.regions ||
        merged.radio ||
        merged.pathHashMode ||
        merged.nameTemplate ||
        merged.docUrl ||
        merged.level ||
        merged.commands
    );
    if (!isGroupByName && !hasField) return null;
    const out: MeshcoreZoneSettings = {};
    if (merged.regions) out.regions = merged.regions;
    if (merged.radio) out.radio = merged.radio;
    if (merged.pathHashMode) out.pathHashMode = merged.pathHashMode;
    if (merged.nameTemplate) out.nameTemplate = merged.nameTemplate;
    if (merged.docUrl) out.docUrl = merged.docUrl;
    if (merged.level != null) out.level = merged.level;
    if (merged.commands) out.commands = merged.commands;
    return out;
}
