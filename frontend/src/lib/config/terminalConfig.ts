// Centralized, non-hardcoded terminal tuning constants.
// Single source of truth for configurable terminal behavior.
export const TERMINAL_CONFIG = {
    /** Silence duration after the last received byte to consider device response complete (ms). */
    silenceTimeoutMs: 1000,
    /** Maximum number of command lines in multiline mode. */
    maxCommandLines: 15,
    /** Maximum visible textarea lines before it starts scrolling (display only). */
    maxVisibleLines: 6,
    /** Approximate line height in rem used for the textarea max-height cap.
     *  `field-sizing: content` grows the box; this is the upper bound and a
     *  fallback for browsers without `field-sizing` support (Firefox/Safari). */
    approxLineHeightRem: 1.5,
    /** Maximum command history entries. */
    maxHistory: 50
} as const;
