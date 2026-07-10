// Response detector: state machine "output + silence timeout".
// Detects end of a device response without touching the existing read loop or token parsing.

export interface ResponseDetectorOptions {
    silenceTimeoutMs: number;
}

/**
 * Detects end of device response via "silence timeout" heuristic.
 *
 * Flow:
 *  - start(): begins waiting, arms an initial timer (handles "command with no output"
 *    — the timer fires from send time even if no data ever arrives).
 *  - notifyData(): called from readSerialLoop on each decoded chunk; resets the timer
 *    and marks that some output was received.
 *  - On silence (no data for silenceTimeoutMs): promise resolves -> response complete.
 *  - cancel(): aborts waiting (user stop / unexpected disconnect) -> rejects with AbortError.
 *
 * Does NOT touch the existing read loop or token parsing; only consumes a notifyData() call.
 */
export class ResponseDetector {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private resolver: (() => void) | null = null;
    private rejecter: ((err: Error) => void) | null = null;
    private aborted = false;

    constructor(private options: ResponseDetectorOptions) {}

    start(): Promise<void> {
        this.aborted = false;
        this.armTimer();
        return new Promise((resolve, reject) => {
            this.resolver = resolve;
            this.rejecter = reject;
        });
    }

    /** Called from TerminalModal.readSerialLoop on each decoded chunk. */
    notifyData(): void {
        if (this.aborted) return;
        this.armTimer();
    }

    /** Abort waiting. Rejects the pending start() promise with AbortError. */
    cancel(): void {
        this.aborted = true;
        this.clearTimer();
        const rej = this.rejecter;
        this.resolver = null;
        this.rejecter = null;
        if (rej) rej(new DOMException('Response detection aborted', 'AbortError'));
    }

    private armTimer(): void {
        this.clearTimer();
        this.timer = setTimeout(() => this.finish(), this.options.silenceTimeoutMs);
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private finish(): void {
        this.clearTimer();
        const res = this.resolver;
        this.resolver = null;
        this.rejecter = null;
        if (res) res();
    }
}
