// Server-side storage for the zones pending ("awaiting review") directory
// (task 77). The single new closed catalog: uploads from the zone editor land
// here (atomic tmp+rename writes, per-file and total-size limits), and approve
// moves a file into the authoritative static/data/groups catalog (live-add
// semantics). The directory lives OUTSIDE static/ on purpose — it is never
// served as a static asset in any environment; its only readers are the
// token-guarded /api/zones/pending* endpoints.
//
// Never throws: read/list failures degrade to "no data" (file skipped with a
// warning), so the moderation UI keeps working on a partially broken catalog.

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import path from 'node:path';
import { ZONE_CATALOG_SCHEMA } from '$lib/config/meshcoreZoneConfig';
import { detectGroupMeshcore, parseZoneFeatures } from '$lib/utils/zoneFeatures';
import type { PendingFileInfo, ZoneFeature } from '$lib/types';

// Hard limits (final PRD values; intentionally NOT env-overridable — minimal
// configuration surface).
export const ZONES_UPLOAD_MAX_FILE_BYTES = 1_048_576; // 1 MB per file
export const ZONES_PENDING_MAX_TOTAL_BYTES = 52_428_800; // 50 MB per pending catalog

const MAX_BASENAME_LEN = 100;

// Pending directory: <cwd>/data/zones-pending (dev: frontend/data/zones-pending,
// prod: /app/data/zones-pending — a separate volume in compose), overridable
// via ZONES_PENDING_DIR. Created on demand.
export function pendingDir(): string {
    const dir = path.resolve(process.cwd(), process.env.ZONES_PENDING_DIR || 'data/zones-pending');
    mkdirSync(dir, { recursive: true });
    return dir;
}

// Authoritative published catalog (same runtime directory the /api/zones/groups
// endpoint reads; the mounted static volume in compose).
export function groupsDir(): string {
    const dir = path.resolve(process.cwd(), 'static', 'data', 'groups');
    mkdirSync(dir, { recursive: true });
    return dir;
}

// Sanitize a client-supplied filename to a safe slug: lowercase, last path
// segment only, characters outside [a-z0-9_-] -> '_', repeated '_' collapsed,
// base length capped, '.geojson' extension guaranteed. The result contains no
// '.' (except the extension) and no separators, so path traversal is excluded
// by construction. Returns null when nothing usable remains.
export function sanitizePendingFilename(raw: string): string | null {
    const seg = (raw.split(/[\\/]/).pop() ?? '').toLowerCase();
    const base = seg
        .replace(/\.geojson$/, '')
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, MAX_BASENAME_LEN);
    if (!base) return null;
    return `${base}.geojson`;
}

// Resolve an (already sanitized) filename inside the pending dir. Returns null
// unless the name is EXACTLY its own canonical form — a non-canonical name can
// never address a file.
function pendingPath(filename: string): string | null {
    const safe = sanitizePendingFilename(filename);
    if (!safe || safe !== filename) return null;
    return path.join(pendingDir(), safe);
}

// Upload validation (format + schema + docUrl), run on every upload and again
// on approve (protection against manual edits of the pending directory).
// Mirrors the reading rules of zoneFeatures.ts: docUrl counts from
// metadata.meshcore OR any feature's preset.
export function validateUploadContent(fc: unknown): {
    code?: 'invalid_format' | 'doc_url_missing';
} {
    if (!fc || typeof fc !== 'object') return { code: 'invalid_format' };
    const c = fc as { type?: unknown; features?: unknown; metadata?: { schema?: unknown } };
    if (c.type !== 'FeatureCollection' || !Array.isArray(c.features)) {
        return { code: 'invalid_format' };
    }
    const schema = c.metadata?.schema;
    if (typeof schema === 'number' && schema > ZONE_CATALOG_SCHEMA) {
        return { code: 'invalid_format' };
    }
    const features = parseZoneFeatures(c.features);
    if (features.length === 0) return { code: 'invalid_format' };
    const docUrl = detectGroupMeshcore(c as GeoJSON.FeatureCollection)?.docUrl;
    if (!docUrl || !/^https?:\/\//i.test(docUrl)) return { code: 'doc_url_missing' };
    return {};
}

// Count + total size of the pending catalog (for the quota check and the
// webhook payload). Degrades to 0/0 when the dir is unreadable.
export function pendingStats(): { count: number; bytes: number } {
    let count = 0;
    let bytes = 0;
    try {
        const dir = pendingDir();
        for (const f of readdirSync(dir)) {
            if (!f.toLowerCase().endsWith('.geojson')) continue;
            try {
                const st = statSync(path.join(dir, f));
                if (st.isFile()) {
                    count++;
                    bytes += st.size;
                }
            } catch {
                /* unreadable entry — skip */
            }
        }
    } catch (err) {
        console.warn('[zones-moderation] pending stats failed', err);
    }
    return { count, bytes };
}

// List pending files with metadata rows (name/regions/level/docUrl are parsed
// with the shared reader; unreadable files are skipped).
export function listPendingFiles(): PendingFileInfo[] {
    const out: PendingFileInfo[] = [];
    let names: string[] = [];
    try {
        names = readdirSync(pendingDir())
            .filter((f) => f.toLowerCase().endsWith('.geojson'))
            .sort();
    } catch (err) {
        console.warn('[zones-moderation] pending dir list failed', err);
        return out;
    }
    for (const name of names) {
        try {
            const full = path.join(pendingDir(), name);
            const st = statSync(full);
            if (!st.isFile()) continue;
            const raw: unknown = JSON.parse(readFileSync(full, 'utf8'));
            const fc = raw as GeoJSON.FeatureCollection & {
                metadata?: { group?: unknown; name?: unknown; author?: unknown };
            };
            const mc = detectGroupMeshcore(raw as GeoJSON.FeatureCollection);
            const features = parseZoneFeatures(fc.features, mc?.regions ?? '');
            const meta = fc.metadata ?? {};
            const nm =
                (typeof meta.group === 'string' && meta.group) ||
                (typeof meta.name === 'string' && meta.name) ||
                undefined;
            out.push({
                filename: name,
                sizeBytes: st.size,
                receivedAt: st.mtime.toISOString(),
                name: nm,
                regions: mc?.regions || undefined,
                level: mc?.level,
                docUrl: mc?.docUrl,
                radio: mc?.radio,
                pathHashMode: mc?.pathHashMode,
                nameTemplate: mc?.nameTemplate,
                author:
                    typeof meta.author === 'string' && meta.author.trim()
                        ? meta.author.trim()
                        : undefined,
                featureCount: features.length
            });
        } catch (err) {
            console.warn('[zones-moderation] pending file read failed', name, err);
        }
    }
    return out;
}

// Read one pending file's parsed JSON (as saved). Null when missing/invalid.
export function readPendingFile(filename: string): unknown | null {
    const p = pendingPath(filename);
    if (!p || !existsSync(p)) return null;
    try {
        return JSON.parse(readFileSync(p, 'utf8')) as unknown;
    } catch (err) {
        console.warn('[zones-moderation] pending file parse failed', filename, err);
        return null;
    }
}

// Atomically write a pending file (idempotent replacement of an awaiting
// version with the same name). Checks the 50 MB catalog quota first — the
// existing same-name file's size is deducted so a replacement never double
// counts. Single Node process + sync fs calls => no write races.
export function writePendingFileAtomic(
    filename: string,
    fc: unknown
): { ok: true; sizeBytes: number } | { ok: false; code: 'quota_exceeded' | 'invalid_filename' } {
    const p = pendingPath(filename);
    if (!p) return { ok: false, code: 'invalid_filename' }; // unreachable via the route (sanitized first)
    const data = JSON.stringify(fc);
    const sizeBytes = Buffer.byteLength(data);
    let existing = 0;
    try {
        existing = statSync(p).size;
    } catch {
        /* no previous version */
    }
    if (pendingStats().bytes - existing + sizeBytes > ZONES_PENDING_MAX_TOTAL_BYTES) {
        return { ok: false, code: 'quota_exceeded' };
    }
    const tmp = `${p}.tmp-${Date.now()}-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, p);
    return { ok: true, sizeBytes };
}

// Delete a pending file. False when it does not exist (missing-ok cleanup of a
// stale tmp file is left to the operator — not part of the flow).
export function deletePendingFile(filename: string): boolean {
    const p = pendingPath(filename);
    if (!p || !existsSync(p)) return false;
    rmSync(p);
    return true;
}

// Move a pending file into the authoritative groups catalog (approve). With
// overwrite=false an existing published file with the same name blocks the
// move ('name_conflict' — the moderator must confirm the replacement).
// rename within one filesystem; EXDEV fallback (pending and static are
// different volumes in compose): copy to a tmp file next to the target, rename
// over it (atomic replace), then remove the pending original.
export function movePendingToGroups(
    filename: string,
    overwrite: boolean
): 'ok' | 'name_conflict' | 'not_found' {
    const p = pendingPath(filename);
    if (!p || !existsSync(p)) return 'not_found';
    const target = path.join(groupsDir(), filename);
    if (!overwrite && existsSync(target)) return 'name_conflict';
    try {
        renameSync(p, target);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
        const tmp = `${target}.tmp-${Date.now()}-${process.pid}`;
        copyFileSync(p, tmp);
        renameSync(tmp, target);
        rmSync(p);
    }
    return 'ok';
}

// Read the published catalog entries for the approve-time conflict check — the
// same reading the /api/zones/groups endpoint does, parsed with the shared pure
// reader. Group level comes from the merged preset (metadata first, features
// fill gaps), matching parseGroupFile's coalescing.
export function loadPublishedGroupEntries(): { file: string; level?: number; features: ZoneFeature[] }[] {
    const out: { file: string; level?: number; features: ZoneFeature[] }[] = [];
    let names: string[] = [];
    try {
        names = readdirSync(groupsDir())
            .filter((f) => f.toLowerCase().endsWith('.geojson'))
            .sort();
    } catch (err) {
        console.warn('[zones-moderation] groups dir list failed', err);
        return out;
    }
    for (const f of names) {
        try {
            const raw: unknown = JSON.parse(readFileSync(path.join(groupsDir(), f), 'utf8'));
            const mc = detectGroupMeshcore(raw as GeoJSON.FeatureCollection);
            const features = parseZoneFeatures(
                (raw as { features?: unknown }).features,
                mc?.regions ?? ''
            );
            out.push({ file: f, level: mc?.level, features });
        } catch (err) {
            console.warn('[zones-moderation] published file read failed', f, err);
        }
    }
    return out;
}
