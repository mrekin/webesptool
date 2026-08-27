// Client-side logic for the zones upload/moderation API (task 77): all fetch
// calls, response parsing and the moderator token session live here —
// components only render and call. Never throws; every failure comes back as a
// ZonesUploadError with a machine code the UI localizes.

import { base } from '$app/paths';
import { parseGroupFile } from '$lib/utils/zoneCatalog';
import { isValidRegions } from '$lib/utils/zoneExport';
import type {
    EditorPolygon,
    GroupFile,
    MeshcoreZoneSettings,
    PendingFileInfo,
    ZoneConflictPair,
    ZoneGroup,
    ZonesUploadError,
    ZonesUploadErrorCode,
    ZonesUploadResult
} from '$lib/types';

const MODERATOR_TOKEN_KEY = 'zonesModeratorToken';

function apiUrl(path: string): string {
    const basePart = base ? `${base}/` : '/';
    return `${basePart}${path}`;
}

// --- moderator token session (sessionStorage: dies with the tab) ---

export function getModeratorToken(): string | null {
    try {
        return sessionStorage.getItem(MODERATOR_TOKEN_KEY) || null;
    } catch {
        return null;
    }
}

export function setModeratorToken(token: string): void {
    try {
        sessionStorage.setItem(MODERATOR_TOKEN_KEY, token);
    } catch {
        /* storage unavailable — the session simply won't survive a reload */
    }
}

export function clearModeratorToken(): void {
    try {
        sessionStorage.removeItem(MODERATOR_TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

// --- response parsing ---

const KNOWN_CODES: ReadonlySet<ZonesUploadErrorCode> = new Set([
    'invalid_json',
    'invalid_filename',
    'file_too_large',
    'quota_exceeded',
    'invalid_format',
    'doc_url_missing',
    'rate_limited',
    'not_found',
    'name_conflict',
    'conflicts',
    'network',
    'internal'
] as ZonesUploadErrorCode[]);

async function parseErrorResponse(res: Response): Promise<ZonesUploadError> {
    try {
        const data = (await res.json()) as {
            error?: {
                code?: unknown;
                message?: unknown;
                conflicts?: unknown;
                retry_after_s?: unknown;
            };
        };
        const e = data?.error;
        if (e && typeof e.code === 'string' && KNOWN_CODES.has(e.code as ZonesUploadErrorCode)) {
            return {
                code: e.code as ZonesUploadErrorCode,
                message: typeof e.message === 'string' ? e.message : undefined,
                conflicts: Array.isArray(e.conflicts)
                    ? (e.conflicts as ZoneConflictPair[])
                    : undefined,
                retryAfterS: typeof e.retry_after_s === 'number' ? e.retry_after_s : undefined
            };
        }
    } catch {
        /* non-JSON error body */
    }
    return { code: 'internal' };
}

// Discriminated result for the token-guarded calls: 'not_found' on the error
// side means an invalid/absent token (the uniform server answer).
export type PendingResult<T> = { ok: true; value: T } | { ok: false; error: ZonesUploadError };

async function tokenRequest(
    token: string,
    path: string,
    init?: RequestInit
): Promise<Response | null> {
    try {
        return await fetch(apiUrl(path), {
            ...init,
            headers: { 'x-zones-token': token, ...(init?.headers ?? {}) },
            signal: AbortSignal.timeout(15000)
        });
    } catch {
        return null;
    }
}

// --- moderation availability (cached for the page lifetime) ---

let moderationConfigCache: Promise<boolean> | null = null;

export function fetchModerationConfig(): Promise<boolean> {
    if (!moderationConfigCache) {
        moderationConfigCache = (async () => {
            try {
                const res = await fetch(apiUrl('api/zones/pending/config'), {
                    signal: AbortSignal.timeout(10000)
                });
                if (!res.ok) return false;
                const data = (await res.json()) as { moderationEnabled?: unknown };
                return data?.moderationEnabled === true;
            } catch {
                return false;
            }
        })();
    }
    return moderationConfigCache;
}

// --- upload (all users) ---

// Groups admitted for upload: the export criteria (valid regions + at least
// one polygon) PLUS a non-empty docUrl (client-side precheck of the server's
// doc_url_missing rejection; the server stays authoritative).
export function submittableGroups(groups: ZoneGroup[], polygons: EditorPolygon[]): ZoneGroup[] {
    return groups.filter(
        (g) =>
            isValidRegions(g.regions) &&
            (g.docUrl ?? '').trim() !== '' &&
            polygons.some((p) => p.groupId === g.id)
    );
}

export async function uploadZoneFile(
    filename: string,
    fc: GeoJSON.FeatureCollection
): Promise<ZonesUploadResult> {
    try {
        const res = await fetch(apiUrl('api/zones/upload'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename, content: fc }),
            signal: AbortSignal.timeout(30000)
        });
        if (res.ok) {
            const data = (await res.json()) as { filename?: unknown };
            return {
                ok: true,
                filename: typeof data.filename === 'string' ? data.filename : filename
            };
        }
        return { ok: false, filename, error: await parseErrorResponse(res) };
    } catch {
        return { ok: false, filename, error: { code: 'network' } };
    }
}

// --- pending moderation (token-guarded) ---

export async function fetchPendingFiles(token: string): Promise<PendingResult<PendingFileInfo[]>> {
    const res = await tokenRequest(token, 'api/zones/pending');
    if (!res) return { ok: false, error: { code: 'network' } };
    if (!res.ok) return { ok: false, error: await parseErrorResponse(res) };
    try {
        const data = (await res.json()) as { files?: unknown };
        return {
            ok: true,
            value: Array.isArray(data?.files) ? (data.files as PendingFileInfo[]) : []
        };
    } catch {
        return { ok: false, error: { code: 'internal' } };
    }
}

// Fetch one pending file's content and parse it with the SAME group parser
// the published catalog uses (url key `pending:<filename>` — a stable,
// non-colliding identifier for the editor's layer/toggle keys).
export async function fetchPendingFileContent(
    token: string,
    filename: string
): Promise<GroupFile | null> {
    const res = await tokenRequest(
        token,
        `api/zones/pending/file?filename=${encodeURIComponent(filename)}`
    );
    if (!res || !res.ok) return null;
    try {
        const json: unknown = await res.json();
        return parseGroupFile(`pending:${filename}`, json);
    } catch {
        return null;
    }
}

// Moderator edits a pending file's full preset in place (no re-upload): the
// server re-serializes the same file with the new preset — the filename (and
// the queue position) never change. `author` participates only when it is a
// string: a name sets/replaces it, '' clears it, omitted keeps it as saved.
export async function updatePendingFile(
    token: string,
    filename: string,
    preset: MeshcoreZoneSettings,
    author?: string
): Promise<PendingResult<{ filename: string }>> {
    const body: Record<string, unknown> = { filename, preset };
    if (typeof author === 'string') body.author = author;
    const res = await tokenRequest(token, 'api/zones/pending/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res) return { ok: false, error: { code: 'network' } };
    if (!res.ok) return { ok: false, error: await parseErrorResponse(res) };
    return { ok: true, value: { filename } };
}

export async function approvePendingFile(
    token: string,
    filename: string,
    overwrite: boolean
): Promise<PendingResult<{ filename: string }>> {
    const res = await tokenRequest(token, 'api/zones/pending/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename, overwrite })
    });
    if (!res) return { ok: false, error: { code: 'network' } };
    if (!res.ok) return { ok: false, error: await parseErrorResponse(res) };
    return { ok: true, value: { filename } };
}

export async function rejectPendingFile(
    token: string,
    filename: string
): Promise<PendingResult<{ filename: string }>> {
    const res = await tokenRequest(token, 'api/zones/pending/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename })
    });
    if (!res) return { ok: false, error: { code: 'network' } };
    if (!res.ok) return { ok: false, error: await parseErrorResponse(res) };
    return { ok: true, value: { filename } };
}
