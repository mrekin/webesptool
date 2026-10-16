import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// PRD T-153: local-only history of the last flashed version per repository.
export const LAST_FLASHED_STORAGE_KEY = 'meshtastic-last-flashed';

export interface LastFlashedEntry {
    version: string;
    date: string; // ver.info date string, as recorded at flash/download time
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

// Parse a ver.info date string ('YYYY-MM-DD HH:MM:SS' / 'YYYY-MM-DD'); null if unknown.
export function parseFirmwareDate(value: string | undefined | null): Date | null {
    if (!value) return null;
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const d = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
}

// Strictly-newer check by build date; anything unknown → false (PRD restriction 4).
export function isNewerBuild(latestDate?: string | null, flashedDate?: string | null): boolean {
    const a = parseFirmwareDate(latestDate);
    const b = parseFirmwareDate(flashedDate);
    return a !== null && b !== null && a.getTime() > b.getTime();
}
