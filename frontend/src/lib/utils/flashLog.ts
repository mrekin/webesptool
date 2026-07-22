import { writable, type Subscriber } from 'svelte/store';
import type { FlashLogEntry, FlashLogLevel } from '$lib/types.js';

export interface FlashLogger {
    subscribe(subscriber: Subscriber<FlashLogEntry[]>): () => void;
    info(message: string): void;
    success(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    /** Throttled progress: adds a new line only when percent crosses STEP for the given key. */
    progress(key: string, percent: number, message: string): void;
    /** Inserts a visible session-separator marker (does NOT clear history). */
    addSeparator(message?: string): void;
    /** Full clear (modal close / port disconnect). */
    clear(): void;
    /** Returns plain-text representation of the current (capped) log, for clipboard. */
    getCopyText(): string;
}

export interface CreateFlashLoggerOptions {
    maxEntries?: number; // Default: 100 (per PRD)
    progressStep?: number; // Default: 10 (percentage points)
}

export function createFlashLogger(options?: CreateFlashLoggerOptions): FlashLogger {
    const maxEntries = options?.maxEntries ?? 100;
    const progressStep = options?.progressStep ?? 10;
    const { subscribe, set, update } = writable<FlashLogEntry[]>([]);

    // Monotonic id generator (closure-private)
    let nextId = 1;

    // Throttle state: key -> last reported percent
    const lastProgressByKey = new Map<string, number>();

    function append(level: FlashLogLevel, message: string, isSeparator = false): void {
        const entry: FlashLogEntry = {
            id: nextId++,
            timestamp: Date.now(),
            level,
            message,
            isSeparator
        };
        update((entries) => {
            const next = [...entries, entry];
            // Cap to last `maxEntries` (separators count toward the cap on purpose —
            // they're part of the visible history)
            return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
        });
    }

    return {
        subscribe,
        info: (m) => append('info', m),
        success: (m) => append('success', m),
        warning: (m) => append('warning', m),
        error: (m) => append('error', m),

        progress(key, percent, message) {
            const last = lastProgressByKey.get(key);
            // Always log on first event for the key, on STEP boundary crossings, and on completion (100%).
            const isFirst = last === undefined;
            const crossedStep = last !== undefined && percent - last >= progressStep;
            const isComplete = percent >= 100;
            if (isFirst || crossedStep || isComplete) {
                lastProgressByKey.set(key, percent);
                append('info', message);
            }
        },

        addSeparator(message) {
            // Reset throttle state so post-separator progress events start fresh
            lastProgressByKey.clear();
            append('info', message ?? '—', true);
        },

        clear() {
            lastProgressByKey.clear();
            set([]);
        },

        getCopyText() {
            let value: FlashLogEntry[] = [];
            const unsub = subscribe((v) => (value = v));
            unsub();
            return value
                .map((e) => {
                    if (e.isSeparator) {
                        return `[${formatTime(e.timestamp)}] ─── ${e.message} ───`;
                    }
                    return `[${formatTime(e.timestamp)}] ${e.message}`;
                })
                .join('\n');
        }
    };
}

/** HH:mm:ss formatter (locale-independent, compact, copy-friendly). */
function formatTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
