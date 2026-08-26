// Command delay prefix `[dN]` — parsing, cancelable countdown and clickable timer.
// Single source of the delay rule for every send path (firmware terminal,
// configurator terminal tab, Apply queue) — task 80. The delay is a property of
// the command line itself, so storage formats are untouched: the prefix lives
// inside the line and only the clean command reaches the device.

import type { Terminal } from '@xterm/xterm';
import { TERMINAL_CONFIG } from '$lib/config/terminalConfig.js';

export interface ParsedCommandDelay {
    /** Seconds as written (leading zeros collapsed), NOT clamped. */
    delaySeconds: number;
    /** Clean command: no prefix, no surrounding whitespace. */
    command: string;
}

// `[dN]` + any run of spaces/tabs (zero allowed) + a non-empty command.
// Everything else (no prefix / no command after it / [D30] / [d-5] / [dabc] /
// prefix not at line start) yields null — the line keeps its existing treatment.
const COMMAND_DELAY_RE = /^\[d(\d+)\][ \t]*(.+)$/;

export function parseCommandDelay(line: string): ParsedCommandDelay | null {
    const match = COMMAND_DELAY_RE.exec(line.trim());
    if (!match) return null;
    const command = match[2].trim();
    if (!command) return null;
    return { delaySeconds: Number(match[1]), command };
}

/** Clamp to TERMINAL_CONFIG.maxDelaySeconds; `clamped` flags the localized notice. */
export function clampDelaySeconds(seconds: number): { seconds: number; clamped: boolean } {
    if (seconds <= TERMINAL_CONFIG.maxDelaySeconds) return { seconds, clamped: false };
    return { seconds: TERMINAL_CONFIG.maxDelaySeconds, clamped: true };
}

export type DelayCountdownOutcome = 'elapsed' | 'early' | 'cancelled' | 'aborted';

export interface DelayCountdownOptions {
    /** Already clamped value > 0 (callers never start a countdown for [d0]). */
    delaySeconds: number;
    /** Command shown inside the countdown line — clean, without the `[dN]` prefix. */
    displayLine: string;
    /** Console output (xterm write + autoscroll, or the pending chunks buffer). */
    write: (chunk: string) => void;
    /** Localized clamping notice, written as a service line before the countdown. */
    clampedNotice?: string;
    /** When set — the timer line is clickable (double click = early send) and the
     *  terminal width / anchor row are known for in-place redrawing. */
    terminal?: Terminal;
}

export interface DelayCountdownHandle {
    /** Resolves exactly once: 'elapsed' | 'early' -> send the command; otherwise don't. */
    promise: Promise<DelayCountdownOutcome>;
    /** Early send (double click on the timer line). */
    finishEarly(): void;
    /** Stop / connection loss — the command must not be sent afterwards. */
    cancel(reason?: 'cancelled' | 'aborted'): void;
}

// Dim grey service style, matching the terminals' existing helper lines.
const GREY = '\x1b[90m';
const RESET = '\x1b[0m';
// Fallback row width when no terminal is attached (buffered output before mount).
const FALLBACK_COLS = 80;

// One active countdown per terminal at a time (sends are blocked while waiting).
const activeCountdowns = new WeakMap<Terminal, DelayCountdown>();

/** Rendered cell width — the ⏳ hourglass (U+23F3) is a wide glyph in xterm. */
function cellWidth(text: string): number {
    return text.length + (text.includes('⏳') ? 1 : 0);
}

/** Clamp to a single console row (with an ellipsis) so `\r`+`\x1b[K` always
 *  erases the whole previous tick and the line never wraps. */
function clampToRow(text: string, cols: number): string {
    if (cellWidth(text) <= cols) return text;
    // One cell of slack for the wide glyph: slice + ellipsis stays within cols.
    const limit = Math.max(cols - 2, 1);
    return text.slice(0, limit) + '…';
}

class DelayCountdown implements DelayCountdownHandle {
    readonly promise: Promise<DelayCountdownOutcome>;
    private resolver: ((outcome: DelayCountdownOutcome) => void) | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private remaining: number;
    /** Absolute buffer row of the countdown line (0-based); -1 without a terminal. */
    anchorRow = -1;
    private finished = false;
    private lastActivation = 0;

    constructor(private options: DelayCountdownOptions) {
        this.remaining = options.delaySeconds;
        this.promise = new Promise((resolve) => {
            this.resolver = resolve;
        });
        this.start();
    }

    finishEarly(): void {
        this.finish('early');
    }

    cancel(reason: 'cancelled' | 'aborted' = 'cancelled'): void {
        this.finish(reason);
    }

    /** Link activation: two activations within the double-click window send early;
     *  a single click only records its time and sends nothing. */
    handleActivation(): void {
        if (this.finished) return;
        const now = performance.now();
        if (now - this.lastActivation < TERMINAL_CONFIG.delayEarlySendDoubleClickMs) {
            this.lastActivation = 0;
            this.finish('early');
        } else {
            this.lastActivation = now;
        }
    }

    private start(): void {
        const term = this.options.terminal;
        if (term) activeCountdowns.set(term, this);
        // xterm's write() is asynchronous, so the anchor row is computed from one
        // consistent pre-write snapshot instead of re-reading the buffer after
        // our own output (which would still be unprocessed).
        let anchor = -1;
        if (term) {
            const buffer = term.buffer.active;
            anchor = buffer.baseY + buffer.cursorY;
            if (this.options.clampedNotice) {
                // The notice line ends with \r\n, so it always lands the cursor at
                // column 0 of the next row — even appended to a partial foreign line.
                this.options.write(`${GREY}${this.options.clampedNotice}${RESET}\r\n`);
                anchor += 1;
            } else if (buffer.cursorX !== 0) {
                // Do not glue the countdown onto someone's unterminated output.
                this.options.write('\r\n');
                anchor += 1;
            }
        } else if (this.options.clampedNotice) {
            this.options.write(`${GREY}${this.options.clampedNotice}${RESET}\r\n`);
        }
        this.anchorRow = anchor;
        this.renderTick(this.remaining);
        this.timer = setInterval(() => this.tick(), 1000);
    }

    private tick(): void {
        this.remaining -= 1;
        if (this.remaining <= 0) {
            this.finish('elapsed');
            return;
        }
        this.reanchorAfterForeignOutput();
        this.renderTick(this.remaining);
    }

    /** If foreign output moved the cursor off the countdown row, close that row
     *  and continue the countdown on a fresh row — never erase foreign output. */
    private reanchorAfterForeignOutput(): void {
        const term = this.options.terminal;
        if (!term) return; // buffered output is linear — no drift check possible
        const buffer = term.buffer.active;
        const cursorRow = buffer.baseY + buffer.cursorY;
        if (cursorRow !== this.anchorRow) {
            this.options.write('\r\n');
            this.anchorRow = cursorRow + 1;
        }
    }

    private renderTick(secondsLeft: number): void {
        const cols = this.options.terminal?.cols ?? FALLBACK_COLS;
        const text = clampToRow(`⏳ ${secondsLeft} ${this.options.displayLine}`, cols);
        this.options.write(`\r\x1b[K${GREY}${text}${RESET}`);
    }

    private finish(outcome: DelayCountdownOutcome): void {
        if (this.finished) return; // resolve exactly once; later calls are no-ops
        this.finished = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const term = this.options.terminal;
        if (term && activeCountdowns.get(term) === this) {
            activeCountdowns.delete(term);
        }
        const cols = term?.cols ?? FALLBACK_COLS;
        const done =
            outcome === 'elapsed' || outcome === 'early'
                ? `⏳ 0 ${this.options.displayLine}`
                : `✖ ${this.options.displayLine}`;
        this.options.write(`\r\x1b[K${GREY}${clampToRow(done, cols)}${RESET}\r\n`);
        this.resolver?.(outcome);
        this.resolver = null;
    }
}

export function createDelayCountdown(options: DelayCountdownOptions): DelayCountdownHandle {
    return new DelayCountdown(options);
}

/**
 * Register the countdown link provider on a terminal (once, in its onLoad).
 * The active countdown's row becomes a link: hover underlines it and switches
 * the cursor to pointer, double click finishes the countdown early. The link
 * exists only while a countdown is active and follows the anchor row on drift.
 * Returns a dispose function (call on close/destroy).
 */
export function attachDelayCountdownLinks(terminal: Terminal): () => void {
    const provider = terminal.registerLinkProvider({
        provideLinks: (bufferLineNumber: number, callback) => {
            const active = activeCountdowns.get(terminal);
            // anchorRow is 0-based, the API line coordinate is 1-based.
            if (!active || active.anchorRow + 1 !== bufferLineNumber) {
                callback(undefined);
                return;
            }
            callback([
                {
                    range: {
                        start: { x: 1, y: bufferLineNumber },
                        end: { x: terminal.cols, y: bufferLineNumber }
                    },
                    text: '',
                    decorations: { underline: true, pointerCursor: true },
                    activate: () => active.handleActivation()
                }
            ]);
        }
    });
    return () => provider.dispose();
}
