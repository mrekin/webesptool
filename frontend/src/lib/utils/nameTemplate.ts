// Name-template parsing/composition for the meshcore zone feature (task 72).
// A group may define a node-name template (stored as `meshcore.nameTemplate`)
// that the configurator turns into an interactive composer for the `set name`
// row. Pure functions — no Svelte.
//
// Template notation (single string):
//   - `[a|b|c]`  → enum token: the user picks one of the `|`-separated options.
//   - `[NAME]`   → free token (no `|`): the user types an arbitrary value.
//   - everything else → literal text, copied verbatim.
//
// Examples:
//   "[NN|DZ|BOR|NNO]-[AVT|KAN|LEN]-[ID]"  → enum, '-', enum, '-', free
//   "[PREFIX]433-[LOC]-[ID]"              → free, '433-', free, '-', free

export type NameTemplateToken =
    | { type: 'literal'; value: string }
    | { type: 'enum'; options: string[] }
    | { type: 'free'; name: string };

// Matches a `[...]` block with no nested brackets and no `[`/`]` inside.
const TOKEN_RE = /\[([^\[\]]+)\]/g;

// Split a template string into ordered tokens. Bracketed blocks become enum or
// free tokens (enum when the content has a `|`, free otherwise); the text
// between blocks becomes literal tokens. Empty literals are dropped.
export function parseNameTemplate(template: string): NameTemplateToken[] {
    const tokens: NameTemplateToken[] = [];
    let last = 0;
    for (const match of template.matchAll(TOKEN_RE)) {
        const inner = match[1];
        const start = match.index ?? 0;
        if (start > last) {
            const lit = template.slice(last, start);
            if (lit) tokens.push({ type: 'literal', value: lit });
        }
        if (inner.includes('|')) {
            const options = inner
                .split('|')
                .map((o) => o.trim())
                .filter((o) => o !== '');
            if (options.length > 0) tokens.push({ type: 'enum', options });
            else tokens.push({ type: 'literal', value: match[0] });
        } else {
            const name = inner.trim();
            if (name) tokens.push({ type: 'free', name });
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
