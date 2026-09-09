// Name-template parsing/composition for the meshcore zone feature (task 72).
// A group may define a node-name template (stored as `meshcore.nameTemplate`)
// that the configurator turns into an interactive composer for the `set name`
// row. Pure functions — no Svelte.
//
// Template notation (single string):
//   - `[a|b|c]`  → enum token: the user picks one of the `|`-separated options.
//   - `--Name--` → inside an enum only (task 82): a subgroup header — the
//                  options after it (until the next header/end of the enum)
//                  form a named group shown as an `<optgroup>`; the options
//                  before the first header are the unnamed leading segment.
//                  Headers never reach the composed name.
//   - `[NAME]`   → free token (no `|`): the user types an arbitrary value.
//   - `[?...]`   → optional marker: a leading `?` right after `[` makes the
//                  placeholder optional, so an empty value does NOT block Apply.
//                  Works for both kinds: `[?ID]` (free), `[?A|B|C]` (enum).
//   - everything else → literal text, copied verbatim.
//
// Examples:
//   "[NN|DZ|BOR|NNO]-[AVT|KAN|LEN]-[ID]"  → enum, '-', enum, '-', free
//   "[PREFIX]433-[LOC]-[ID]"              → free, '433-', free, '-', free
//   "[PREFIX]-[?ID]"                      → free, '-', optional free
//   "mc-[--Band--|868|433]-[NAME]"        → enum (subgroup Band), '-', free

// One named subgroup of an enum token's options (task 82): a `--Name--`
// header inside the enum opens it. `start`/`count` are indices into the FLAT
// `options` array of the same token (after the per-segment dedup+sort), so
// `composeName`/`defaultComposerParts` keep working on the flat array.
export interface NameTemplateSubgroup {
    name: string;
    start: number;
    count: number;
}

export type NameTemplateToken =
    | { type: 'literal'; value: string }
    | { type: 'enum'; options: string[]; subgroups?: NameTemplateSubgroup[]; optional?: boolean }
    | { type: 'free'; name: string; optional?: boolean };

// Matches a `[...]` block with no nested brackets and no `[`/`]` inside.
const TOKEN_RE = /\[([^\[\]]+)\]/g;

// Matches a subgroup header element inside an enum: `--Name--` (task 82).
const SUBGROUP_HEADER_RE = /^--(.+)--$/;

// Split a template string into ordered tokens. Bracketed blocks become enum or
// free tokens (enum when the content has a `|`, free otherwise); the text
// between blocks becomes literal tokens. Empty literals are dropped.
export function parseNameTemplate(template: string): NameTemplateToken[] {
    const tokens: NameTemplateToken[] = [];
    let last = 0;
    for (const match of template.matchAll(TOKEN_RE)) {
        const raw = match[1];
        const start = match.index ?? 0;
        if (start > last) {
            const lit = template.slice(last, start);
            if (lit) tokens.push({ type: 'literal', value: lit });
        }
        // A leading `?` marks the placeholder optional (an empty value will not
        // block Apply in the composer): `[?ID]`, `[?A|B|C]`. Strip it before the
        // enum/free split so it never leaks into option or field names.
        let optional = false;
        let inner = raw;
        if (inner.startsWith('?')) {
            optional = true;
            inner = inner.slice(1);
        }
        if (inner.includes('|')) {
            // Enum token: keep `|`-separated options INCLUDING an explicit empty
            // one (so `[A|B|]` -> ['A','B',''] and `[|]` -> [''] stay selectable).
            // `--Name--` elements are subgroup headers, not options (task 82):
            // they split the options into segments — deduplication and the
            // alphabetical sort (empty option last) run INSIDE each segment
            // independently, segments concatenate in order into the flat
            // `options` array, and named segments are recorded in `subgroups`
            // by start/count. A header with no values before the next
            // header/end is dropped; an enum of headers only degrades to a
            // literal, exactly like an empty enum.
            const segments: { name: string | null; opts: string[] }[] = [{ name: null, opts: [] }];
            let hasHeader = false;
            for (const opt of inner.split('|').map((o) => o.trim())) {
                const header = SUBGROUP_HEADER_RE.exec(opt);
                if (header) {
                    hasHeader = true;
                    segments.push({ name: header[1], opts: [] });
                    continue;
                }
                segments[segments.length - 1].opts.push(opt);
            }
            const options: string[] = [];
            const subgroups: NameTemplateSubgroup[] = [];
            for (const seg of segments) {
                const seen = new Set<string>();
                const deduped: string[] = [];
                for (const opt of seg.opts) {
                    if (seen.has(opt)) continue;
                    seen.add(opt);
                    deduped.push(opt);
                }
                deduped.sort((a, b) => {
                    if (a === '') return 1;
                    if (b === '') return -1;
                    return a.localeCompare(b);
                });
                if (seg.name === null) {
                    options.push(...deduped);
                } else if (deduped.length > 0) {
                    subgroups.push({
                        name: seg.name,
                        start: options.length,
                        count: deduped.length
                    });
                    options.push(...deduped);
                }
            }
            if (options.length > 0) {
                tokens.push(
                    hasHeader
                        ? { type: 'enum', options, subgroups, optional }
                        : { type: 'enum', options, optional }
                );
            } else {
                tokens.push({ type: 'literal', value: match[0] });
            }
        } else {
            const name = inner.trim();
            if (name) tokens.push({ type: 'free', name, optional });
            else tokens.push({ type: 'literal', value: match[0] });
        }
        last = start + match[0].length;
    }
    if (last < template.length) {
        const lit = template.slice(last);
        if (lit) tokens.push({ type: 'literal', value: lit });
    }
    return tokens;
}

// Number of input tokens (enum + free) — the composer renders one control each.
export function nameInputCount(tokens: NameTemplateToken[]): number {
    return tokens.filter((t) => t.type !== 'literal').length;
}

// Compose the final name from tokens and one value per input token (in order).
// `parts` may be shorter than the input count (trailing inputs left empty).
export function composeName(tokens: NameTemplateToken[], parts: string[]): string {
    let i = 0;
    let out = '';
    for (const t of tokens) {
        if (t.type === 'literal') {
            out += t.value;
        } else {
            out += parts[i] ?? '';
            i++;
        }
    }
    return out;
}

// Default composer values: each enum → its first option, each free → ''.
export function defaultComposerParts(tokens: NameTemplateToken[]): string[] {
    const parts: string[] = [];
    for (const t of tokens) {
        if (t.type === 'enum') parts.push(t.options[0] ?? '');
        else if (t.type === 'free') parts.push('');
    }
    return parts;
}
