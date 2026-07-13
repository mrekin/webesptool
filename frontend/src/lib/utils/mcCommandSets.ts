// Static catalog of MeshCore command sets, exposed as a tree of groups/files
// built from a Vite `import.meta.glob`. Each file may (optionally) carry
// INI-style `[section]` headers that split it into selectable blocks. Selected
// content (whole file or single section, headers always excluded) is returned
// as a plain multiline string meant to replace the terminal command input.
//
// Pure logic module: no Svelte/store dependencies.

import type {
    McCommandFileNode,
    McCommandFileParsed,
    McCommandGroupNode,
    McCommandSection
} from '$lib/types.js';
import { splitIntoCommandLines, trimTrailingEmptyLine } from './multilineCommands.js';

// Root directory of MeshCore command sets.
// NOTE: Vite requires the first argument of `import.meta.glob` to be a string
// literal, so the root path cannot be moved to `terminalConfig.ts` (that would
// create a second source of truth). This comment is the single canonical
// reference for the root location; the literal below is the canonical pattern.
const mcCommandSetModules = import.meta.glob('/src/lib/config/mc_command_sets/**/*', {
    query: '?raw',
    import: 'default'
}) as Record<string, () => Promise<string>>;

const MC_COMMAND_SETS_ROOT = '/src/lib/config/mc_command_sets/';

// Module-level caches so repeated expansions of the same file do not refetch
// or reparse. Safe across terminal sessions (raw text is immutable per build).
const rawCache = new Map<string, string>();
const parsedCache = new Map<string, McCommandFileParsed>();

/**
 * Build the command set tree synchronously from the glob keys (no I/O).
 * Groups come before files at every level; both are sorted via `localeCompare`.
 * Dotfiles are excluded defensively (tinyglobby already skips them by default).
 */
export function buildMcCommandTree(): McCommandGroupNode {
    const root: McCommandGroupNode = {
        type: 'group',
        name: '',
        path: '',
        children: []
    };

    for (const fullPath of Object.keys(mcCommandSetModules)) {
        if (!fullPath.startsWith(MC_COMMAND_SETS_ROOT)) continue;
        const relativePath = fullPath.slice(MC_COMMAND_SETS_ROOT.length);
        if (!relativePath) continue;

        const segments = relativePath.split('/');
        // Defensive dotfile filter (tinyglobby excludes them by default).
        if (segments.some((segment) => segment.startsWith('.'))) continue;

        insertNode(root, segments, fullPath);
    }

    sortTree(root);
    return root;
}

/** Insert a file leaf (and any missing intermediate groups) under the root. */
function insertNode(
    root: McCommandGroupNode,
    segments: string[],
    fullPath: string
): void {
    let current = root;
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        const path = segments.slice(0, i + 1).join('/');

        if (isLast) {
            current.children.push({
                type: 'file',
                name: segment,
                path,
                fullPath
            });
            return;
        }

        const existing = current.children.find(
            (child): child is McCommandGroupNode =>
                child.type === 'group' && child.name === segment
        );
        if (existing) {
            current = existing;
        } else {
            const next: McCommandGroupNode = {
                type: 'group',
                name: segment,
                path,
                children: []
            };
            current.children.push(next);
            current = next;
        }
    }
}

/** Sort groups first, then files, both via `localeCompare`. Recurses into groups. */
function sortTree(node: McCommandGroupNode): void {
    node.children.sort((a, b) => {
        const aGroup = a.type === 'group';
        const bGroup = b.type === 'group';
        if (aGroup !== bGroup) return aGroup ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
        if (child.type === 'group') sortTree(child);
    }
}

/** A line is a section header if its `trim()` matches `^[.*]$` (any content inside []). */
function isSectionHeader(line: string): boolean {
    return /^\[.*\]$/.test(line.trim());
}

/** Extract the section name (text between the brackets). Caller must ensure `isSectionHeader`. */
function sectionName(line: string): string {
    return line.trim().slice(1, -1);
}

/**
 * Parse raw text into optional preamble + named sections.
 * Reuses `splitIntoCommandLines` for CRLF/CR -> LF normalization (single source
 * of truth for line splitting, shared with the textarea input path).
 */
export function parseMcCommandSections(raw: string): McCommandFileParsed {
    const lines = splitIntoCommandLines(raw);
    const preamble: string[] = [];
    const sections: McCommandSection[] = [];
    let current: McCommandSection | null = null;

    for (const line of lines) {
        if (isSectionHeader(line)) {
            // Each header starts a new section, even when the name repeats.
            current = { name: sectionName(line), lines: [] };
            sections.push(current);
        } else if (current) {
            current.lines.push(line);
        } else {
            preamble.push(line);
        }
    }

    return {
        hasSections: sections.length > 0,
        preamble,
        sections
    };
}

/**
 * Whole-file selection: all commands (preamble + every section's lines),
 * headers excluded, joined with `\n`. `trimTrailingEmptyLine` is applied per
 * block for parity with manual paste (`computeMultilineLines` does the same).
 */
export function selectWholeFile(parsed: McCommandFileParsed): string {
    const lines: string[] = [];
    lines.push(...trimTrailingEmptyLine(parsed.preamble));
    for (const section of parsed.sections) {
        lines.push(...trimTrailingEmptyLine(section.lines));
    }
    return lines.join('\n');
}

/**
 * Single-section selection by index (correct for repeated names: each UI item
 * is a distinct entry). Header excluded; joined with `\n`.
 */
export function selectSection(parsed: McCommandFileParsed, index: number): string {
    if (index < 0 || index >= parsed.sections.length) return '';
    return trimTrailingEmptyLine(parsed.sections[index].lines).join('\n');
}

/** Lazily load the raw text of a file node, with a module-level cache. */
export async function loadMcCommandFileRaw(node: McCommandFileNode): Promise<string> {
    const cached = rawCache.get(node.fullPath);
    if (cached !== undefined) return cached;

    const loader = mcCommandSetModules[node.fullPath];
    if (!loader) {
        throw new Error(`Command set not found: ${node.fullPath}`);
    }

    const content = await loader();
    rawCache.set(node.fullPath, content);
    return content;
}

/** Lazily load and parse a file node, with a module-level parsed cache. */
export async function loadMcCommandFileParsed(
    node: McCommandFileNode
): Promise<McCommandFileParsed> {
    const cachedParsed = parsedCache.get(node.fullPath);
    if (cachedParsed) return cachedParsed;

    const raw = await loadMcCommandFileRaw(node);
    const parsed = parseMcCommandSections(raw);
    parsedCache.set(node.fullPath, parsed);
    return parsed;
}
