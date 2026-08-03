// Meshcore configurator state & diff helpers.
// Pure functions (no Svelte, no serial): parse get-responses, compare values,
// compute diffs and serialize set-command lines. Modeled on config.meshcore.io.
import { getBaseCommandName } from './meshcoreCommands.js';
import type {
    MeshcoreConfigDiff,
    MeshcoreConfigField,
    MeshcoreConfigParam,
    MeshcoreConfigValue,
    MeshcoreFieldValue,
    MeshcoreCommandRow,
    MeshcoreCommandSeparator
} from '$lib/types';

// Numeric literal regex (integer or decimal, optional leading minus).
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

/**
 * Parse the raw text of a single `get X` response into a coerced value.
 * Mirrors config.meshcore.io parseVariableResponse: a response that does not
 * start with the value prefix is treated as failed. Otherwise the payload is
 * coerced purely by content (number / on-off boolean / composite array).
 */
export function parseGetResponse(
    field: { params: MeshcoreConfigParam[]; separator: MeshcoreCommandSeparator },
    rawResponse: string
): MeshcoreFieldValue {
    // sendCommand delivers the framed response line: "> value" for a get, or an
    // error like "??:" / "OK" for other commands. Mirror the official
    // config.meshcore.io parseVariableResponse: only a "> "-prefixed line is a value.
    const raw = typeof rawResponse === 'string' ? rawResponse : '';
    if (!raw.startsWith('> ')) {
        return { ok: false, raw };
    }
    const value = raw.substring(2).trim();
    if (value === '') {
        return { ok: true, value: '' };
    }

    // Composite (multi-param) field: split payload by the on-wire separator.
    if (field.params.length > 1) {
        const sep = field.separator === 'comma' ? ',' : ' ';
        const parts = value.split(sep).map((p) => p.trim());
        if (parts.length < field.params.length) {
            return { ok: false, raw };
        }
        return { ok: true, value: parts };
    }

    // Single-param field.
    const p = field.params[0];
    if (p?.type === 'enum' && p.options) {
        // on/off enum -> boolean (toggle); any other enum -> keep the option
        // string as-is so it matches <option value> (e.g. path.hash.mode "0").
        const isOnOff =
            p.options.length === 2 && p.options.includes('on') && p.options.includes('off');
        if (isOnOff) {
            if (value.toLowerCase() === 'on') return { ok: true, value: true };
            if (value.toLowerCase() === 'off') return { ok: true, value: false };
        }
        return { ok: true, value };
    }
    // Number param: some values carry trailing units (e.g. dutycycle "50.0%");
    // strip them so a numeric input never receives a non-numeric string.
    if (p?.type === 'number') {
        const m = value.match(/-?\d+(\.\d+)?/);
        return { ok: true, value: m ? Number(m[0]) : value };
    }
    if (NUMERIC_RE.test(value)) {
        return { ok: true, value: Number(value) };
    }
    return { ok: true, value };
}

/**
 * Parse get-responses for every field into a values map keyed by field key.
 * Caller assigns the result to both current and original baselines.
 */
export function applyDeviceValues(
    fields: MeshcoreConfigField[],
    responses: Record<string, string>
): { values: Record<string, MeshcoreFieldValue> } {
    const values: Record<string, MeshcoreFieldValue> = {};
    for (const field of fields) {
        values[field.key] = parseGetResponse(field, responses[field.key] ?? '');
    }
    return { values };
}

/**
 * Canonical value comparison used by the diff logic.
 * Arrays compare element-wise via String(); numeric-looking scalars compare by
 * Number(); booleans compare strictly; everything else compares as trimmed
 * strings. undefined vs undefined is equal; undefined vs defined is equal only
 * when the defined side normalizes to ''.
 */
export function valuesEqual(
    a: MeshcoreConfigValue | undefined,
    b: MeshcoreConfigValue | undefined
): boolean {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) {
        const defined = (a ?? b) as MeshcoreConfigValue;
        return String(defined ?? '').trim() === '';
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => String(item) === String(b[index]));
    }
    const aNumeric = typeof a === 'number' || (typeof a === 'string' && NUMERIC_RE.test(a));
    const bNumeric = typeof b === 'number' || (typeof b === 'string' && NUMERIC_RE.test(b));
    if (aNumeric && bNumeric) {
        return Number(a) === Number(b);
    }
    if (typeof a === 'boolean' || typeof b === 'boolean') {
        return a === b;
    }
    return String(a).trim() === String(b).trim();
}

/**
 * Coerce a raw loaded value (e.g. parsed from a set-line of a command set) into
 * the field's value type. Inverse of coerceToWireValue: composite fields keep a
 * string[] (capped to param count); single on/off enums become booleans and
 * numeric-looking scalars become numbers, so controls receive typed values.
 */
export function coerceValue(
    field: { params: MeshcoreConfigParam[] },
    raw: string | string[]
): MeshcoreConfigValue {
    if (field.params.length > 1) {
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.slice(0, field.params.length);
    }
    const s = Array.isArray(raw) ? (raw[0] ?? '') : raw;
    const p = field.params[0];
    if (p?.type === 'enum' && p.options) {
        // on/off enum -> boolean; other enum -> keep the option string as-is.
        const isOnOff =
            p.options.length === 2 && p.options.includes('on') && p.options.includes('off');
        if (isOnOff) {
            if (s === 'on') return true;
            if (s === 'off') return false;
        }
        return s;
    }
    // Number param: strip trailing units (e.g. "50.0%") -> 50.
    if (p?.type === 'number') {
        const m = s.match(/-?\d+(\.\d+)?/);
        return m ? Number(m[0]) : s;
    }
    if (NUMERIC_RE.test(s)) return Number(s);
    return s;
}

/**
 * Produce the per-sub-param wire strings for a field value.
 * Arrays map element-wise; booleans become 'on'/'off'; scalars are stringified.
 * Returns one entry per set-command param (caller joins by the field separator).
 */
export function coerceToWireValue(
    field: MeshcoreConfigField,
    value: MeshcoreConfigValue
): string[] {
    if (Array.isArray(value)) {
        return value.map(String);
    }
    if (typeof value === 'boolean') {
        return [value ? 'on' : 'off'];
    }
    return [String(value)];
}

/**
 * Serialize a single field value to a `set X ...` command line.
 */
export function fieldToSetLine(
    field: MeshcoreConfigField,
    value: MeshcoreConfigValue
): string {
    const parts = coerceToWireValue(field, value);
    const sep = field.separator === 'comma' ? ',' : ' ';
    return `${field.setCommand} ${parts.join(sep)}`;
}

/**
 * Serialize a unified command row's value into a wire line:
 * `baseCommand` + coerced values joined by the separator. Empty/undefined value
 * yields just the base command (used for 0-param actions like 'reboot').
 */
export function buildCommand(
    row: MeshcoreCommandRow,
    value: MeshcoreConfigValue | undefined
): string {
    let parts: string[];
    if (Array.isArray(value)) {
        parts = value.map((v) => String(v)).filter((v) => v !== '');
    } else if (typeof value === 'boolean') {
        parts = [value ? 'on' : 'off'];
    } else if (value === undefined || value === null || value === '') {
        parts = [];
    } else {
        parts = [String(value)];
    }
    if (parts.length === 0) return row.baseCommand;
    const sep = row.separator === 'comma' ? ',' : ' ';
    return `${row.baseCommand} ${parts.join(sep)}`;
}

/**
 * Compute the diff between current and original values.
 * Only fields present in `current` whose value differs are reported, each with
 * the set-command line to send and whether it needs a reboot.
 */
export function computeDiff(
    fields: MeshcoreConfigField[],
    current: Record<string, MeshcoreConfigValue>,
    original: Record<string, MeshcoreConfigValue>
): MeshcoreConfigDiff {
    const changes: MeshcoreConfigDiff['changes'] = [];
    let needsReboot = false;

    for (const field of fields) {
        if (!(field.key in current)) continue;
        if (valuesEqual(current[field.key], original[field.key])) continue;

        const reboot = !!field.needsReboot;
        changes.push({
            key: field.key,
            setLine: fieldToSetLine(field, current[field.key]),
            needsReboot: reboot
        });
        if (reboot) {
            needsReboot = true;
        }
    }

    return { changes, needsReboot };
}

/**
 * Parse a single set-command line back into { key, values }.
 * Used to populate field values from a loaded command set. Returns null for
 * non-config lines (mode-switch, INI header, action command) so the caller can
 * keep them as extra visible lines. When several fields match, the longest
 * (most specific) set-base name wins.
 */
export function parseSetLine(
    fields: MeshcoreConfigField[],
    setLine: string
): { key: string; values: string[] } | null {
    const trimmed = setLine.trim();
    if (!trimmed) return null;

    // Find the longest matching set-base name among config fields.
    let bestField: MeshcoreConfigField | null = null;
    let bestBase = '';
    for (const field of fields) {
        const base = getBaseCommandName(field.setCommand);
        if (trimmed === base || trimmed.startsWith(base + ' ')) {
            if (base.length > bestBase.length) {
                bestBase = base;
                bestField = field;
            }
        }
    }
    if (!bestField) return null;

    const field = bestField;
    const remainder = trimmed.slice(bestBase.length).trim();
    const parts =
        field.separator === 'comma'
            ? remainder.split(',').map((p) => p.trim()).filter((p) => p !== '')
            : remainder.split(/\s+/).filter((p) => p !== '');
    return { key: field.key, values: parts };
}

/**
 * Build the full list of set-command lines to render (one per field that has a
 * current value), each flagged dirty when it differs from the original. Extra
 * (non-config) lines from a loaded set are returned verbatim.
 */
export function buildVisibleCommandList(
    fields: MeshcoreConfigField[],
    current: Record<string, MeshcoreConfigValue>,
    original: Record<string, MeshcoreConfigValue>,
    extraLines: string[]
): {
    setLines: { line: string; dirty: boolean }[];
    extra: string[];
} {
    const setLines: { line: string; dirty: boolean }[] = [];
    for (const field of fields) {
        if (!(field.key in current)) continue;
        const dirty = !valuesEqual(current[field.key], original[field.key]);
        setLines.push({ line: fieldToSetLine(field, current[field.key]), dirty });
    }
    return { setLines, extra: extraLines };
}

/**
 * Snapshot the applied values as the new "original" baseline.
 * After a successful commit, applied values are merged into original so every
 * field becomes clean (current === original).
 */
export function commitApplied(
    _fields: MeshcoreConfigField[],
    applied: Record<string, MeshcoreConfigValue>,
    original: Record<string, MeshcoreConfigValue>
): Record<string, MeshcoreConfigValue> {
    return { ...original, ...applied };
}
