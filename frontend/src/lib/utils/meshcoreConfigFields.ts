// Meshcore configurator field model.
// Derives the list of configurable MeshcoreConfigField descriptors from the
// static command catalog (meshcoreCommandData) plus configurator metadata,
// WITHOUT duplicating the command data itself.
import { meshcoreCommandData } from './meshcoreCommandData.js';
import { findCommand, getBaseCommandName } from './meshcoreCommands.js';
import { MESHCORE_CONFIG_METADATA } from '$lib/config/meshcoreConfigMetadata.js';
import { MESHCORE_ACTIONS } from '$lib/config/meshcoreConfigActions.js';
import type {
    MeshcoreConfigControl,
    MeshcoreConfigField,
    MeshcoreConfigGroup,
    MeshcoreConfigParam,
    MeshcoreCommandParam,
    MeshcoreCommandRow
} from '$lib/types';

// Strip the get/set verb from a base command name: 'set radio' -> 'radio', 'get name' -> 'name'.
function fieldKeyFromCommand(baseName: string): string {
    return baseName.replace(/^(get|set)\s+/, '');
}

// Derive the UI control hint from the set-command params.
function deriveControl(params: MeshcoreCommandParam[]): MeshcoreConfigControl {
    // 0-param action (e.g. reboot): no value control (rendered as an arm checkbox).
    if (params.length === 0) return 'text';
    // Composite multi-param field: number if all numeric, else text.
    if (params.length > 1) {
        return params.every((p) => p.type === 'number') ? 'number' : 'text';
    }
    const p = params[0];
    if (p.type === 'enum' && p.options) {
        // on/off enums render as a toggle; other enums as a select.
        const isOnOff =
            p.options.length === 2 && p.options.includes('on') && p.options.includes('off');
        return isOnOff ? 'toggle' : 'select';
    }
    if (p.type === 'number') return 'number';
    return 'text';
}

function toConfigParam(p: MeshcoreCommandParam): MeshcoreConfigParam {
    return { name: p.name, type: p.type, options: p.options, maxLength: p.maxLength };
}

// Build all configurable fields from get<->set command pairs + metadata.
export function buildConfigFields(): {
    fields: MeshcoreConfigField[];
    groups: MeshcoreConfigGroup[];
} {
    // Map get-keys to their full get command string.
    const getKeys = new Map<string, string>();
    for (const cmd of meshcoreCommandData) {
        const base = getBaseCommandName(cmd.command);
        if (base.startsWith('get ')) {
            getKeys.set(fieldKeyFromCommand(base), cmd.command);
        }
    }

    const fields: MeshcoreConfigField[] = [];
    for (const cmd of meshcoreCommandData) {
        if (cmd.interactive) continue;
        const base = getBaseCommandName(cmd.command);
        if (!base.startsWith('set ')) continue;
        const key = fieldKeyFromCommand(base);
        const getCommand = getKeys.get(key);
        if (!getCommand) continue; // no get-pair -> not a configurable field

        const groupId = MESHCORE_CONFIG_METADATA.fieldGroups[key] ?? 'advanced';
        const needsReboot = MESHCORE_CONFIG_METADATA.rebootKeys.includes(key);
        const minVersion = MESHCORE_CONFIG_METADATA.minVersion[key];

        fields.push({
            key,
            getCommand,
            setCommand: base,
            params: cmd.params.map(toConfigParam),
            separator: cmd.separator,
            control: deriveControl(cmd.params),
            label: cmd.shortDescription,
            groupId,
            needsReboot,
            minVersion
        });
    }

    // Sort fields by group order, then by explicit fieldOrder rank, then by key.
    const groupOrder = (id: string) => MESHCORE_CONFIG_METADATA.groups[id]?.order ?? 99;
    const fieldRank = (key: string) => {
        const idx = MESHCORE_CONFIG_METADATA.fieldOrder.indexOf(key);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    fields.sort(
        (a, b) =>
            groupOrder(a.groupId) - groupOrder(b.groupId) ||
            fieldRank(a.key) - fieldRank(b.key) ||
            a.key.localeCompare(b.key)
    );

    const groups: MeshcoreConfigGroup[] = Object.entries(MESHCORE_CONFIG_METADATA.groups)
        .map(([id, g]) => ({ id, labelKey: g.labelKey, order: g.order }))
        .sort((a, b) => a.order - b.order);

    return { fields, groups };
}

// Look up a field descriptor by key.
export function getFieldByKey(
    fields: MeshcoreConfigField[],
    key: string
): MeshcoreConfigField | undefined {
    return fields.find((f) => f.key === key);
}

// Build the UNIFIED command list: get<->set config rows + action rows, plus the
// ordered unified groups. Both kinds are described by MeshcoreCommandRow and share
// the same group taxonomy, so the UI treats them identically.
export function buildCommandRows(): {
    rows: MeshcoreCommandRow[];
    groups: MeshcoreConfigGroup[];
} {
    const { fields } = buildConfigFields();
    const rows: MeshcoreCommandRow[] = [];

    // Config rows from get<->set fields.
    for (const f of fields) {
        rows.push({
            id: f.key,
            kind: 'config',
            label: f.label ?? f.key,
            baseCommand: f.setCommand,
            getCommand: f.getCommand,
            params: f.params,
            separator: f.separator,
            control: f.control,
            groupId: f.groupId,
            needsReboot: f.needsReboot,
            minVersion: f.minVersion
        });
    }

    // Action rows from the curated action list (params/control via findCommand).
    for (const a of MESHCORE_ACTIONS) {
        const cmd = findCommand(a.command);
        if (!cmd) continue;
        const base = getBaseCommandName(a.command);
        rows.push({
            id: base,
            kind: 'action',
            label: cmd.shortDescription ?? base,
            baseCommand: base,
            params: cmd.params.map(toConfigParam),
            separator: cmd.separator,
            control: deriveControl(cmd.params),
            groupId: a.groupId,
            danger: a.danger,
            urgent: a.urgent,
            variadic: a.variadic
        });
    }

    // Unified groups from metadata (ordered).
    const groups: MeshcoreConfigGroup[] = Object.entries(MESHCORE_CONFIG_METADATA.groups)
        .map(([id, g]) => ({ id, labelKey: g.labelKey, order: g.order }))
        .sort((a, b) => a.order - b.order);

    // Sort rows: by group order, then config-before-action, then fieldOrder rank, then id.
    const groupOrder = (id: string) => MESHCORE_CONFIG_METADATA.groups[id]?.order ?? 99;
    const fieldRank = (key: string) => {
        const idx = MESHCORE_CONFIG_METADATA.fieldOrder.indexOf(key);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    rows.sort(
        (a, b) =>
            groupOrder(a.groupId) - groupOrder(b.groupId) ||
            (a.kind === 'config' ? 0 : 1) - (b.kind === 'config' ? 0 : 1) ||
            fieldRank(a.id) - fieldRank(b.id) ||
            a.id.localeCompare(b.id)
    );

    return { rows, groups };
}
