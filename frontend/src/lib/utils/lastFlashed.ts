import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// PRD T-153: local-only history of the last flashed version per repository.
export const LAST_FLASHED_STORAGE_KEY = 'meshtastic-last-flashed';

export interface LastFlashedEntry {
    version: string;
    date: string; // ver.info date string, kept for the record only — never compared
}

type LastFlashedMap = Record<string, LastFlashedEntry>;

function loadInitial(): LastFlashedMap {
    if (!browser) return {};
    try {
        const raw = localStorage.getItem(LAST_FLASHED_STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return {};
        // Keep only well-shaped entries; corrupt data degrades to nothing.
        const map: LastFlashedMap = {};
        for (const [repo, entry] of Object.entries(parsed as Record<string, unknown>)) {
            const e = entry as Partial<LastFlashedEntry> | null;
            if (e && typeof e.version === 'string' && typeof e.date === 'string') {
                map[repo] = { version: e.version, date: e.date };
            }
        }
        return map;
    } catch {
        return {};
    }
}

export const lastFlashed = writable<LastFlashedMap>(loadInitial());

export function recordFlashed(repository: string, version: string, date: string): void {
    if (!repository || !version || !date) return; // nothing to record (PRD 3, scenario 10)
    lastFlashed.update((map) => {
        const next = { ...map, [repository]: { version, date } };
        if (browser) {
            try {
                localStorage.setItem(LAST_FLASHED_STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Storage unavailable (private mode, quota): degrade silently —
                // in-memory record still works for this session (PRD scenario 14).
            }
        }
        return next;
    });
}

// Loose version comparison for base versions, mirroring the backend's
// CustomLooseVersion order (the same order the version selector uses):
// digit runs compare numerically, alpha runs lexically, and a longer
// equal-prefix version sorts higher (v1.18.0b1 > v1.18.0).
function versionTokens(version: string): (number | string)[] {
    return version.replace(/^[vV]/, '').match(/\d+|[a-zA-Z]+/g) ?? [];
}

// Strictly-greater check (prod decision 2026-10-17): versions only — build
// dates never participate. Rebuilding an old version does not make it newer,
// and the same commit built for another device role is the same version;
// both cases collapse to equal base versions → no highlight.
export function compareVersions(a: string, b: string): number {
    const ta = versionTokens(a);
    const tb = versionTokens(b);
    const len = Math.max(ta.length, tb.length);
    for (let i = 0; i < len; i++) {
        const x = ta[i];
        const y = tb[i];
        if (x === undefined) return -1; // shorter equal prefix sorts lower
        if (y === undefined) return 1;
        const xNum = typeof x === 'number';
        const yNum = typeof y === 'number';
        if (xNum && yNum) {
            if (x !== y) return (x as number) < (y as number) ? -1 : 1;
        } else if (xNum !== yNum) {
            return xNum ? 1 : -1; // numeric runs beat alpha runs
        } else if (x !== y) {
            return String(x) < String(y) ? -1 : 1;
        }
    }
    return 0;
}
