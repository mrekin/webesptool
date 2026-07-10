// Multiline command list parsing helpers. Pure functions, no UI/Serial dependencies.

export interface SplitResult {
    lines: string[];
    truncated: boolean;
}

/** Normalize CRLF/CR to LF and split into lines. Preserves empty/whitespace lines (OQ-4). */
export function splitIntoCommandLines(text: string): string[] {
    return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Apply max-commands limit. Excess lines are dropped, `truncated` flags the warning (OQ-11). */
export function applyCommandLimit(lines: string[], max: number): SplitResult {
    if (lines.length <= max) return { lines, truncated: false };
    return { lines: lines.slice(0, max), truncated: true };
}

/** Detect meshcore mode-switch control line (acts on the whole block, OQ-3). */
export function isModeSwitchLine(line: string): boolean {
    return line.trim() === '/mc';
}

/** Drop trailing empty line that appears after a final newline in pasted text. */
export function trimTrailingEmptyLine(lines: string[]): string[] {
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        return lines.slice(0, -1);
    }
    return lines;
}