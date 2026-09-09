// Pure helpers for the named settings presets of a zone group (task 82).
// No Svelte, no fetch — shared by the editor components and the server-side
// moderation routes alike (same pattern as zoneFeatures.ts).

import type { NamedMeshcoreSettings, ZoneGroup, ZoneGroupSettings } from '$lib/types';

// The preset marked `isDefault: true`. NO "first preset" fallback exists for
// settings: without a default nothing is applied (PRD task 82, scenario 5) —
// the user must pick a group explicitly.
export function defaultPreset(presets: NamedMeshcoreSettings[]): NamedMeshcoreSettings | undefined {
    return presets.find((p) => p.isDefault === true);
}

// Mutually exclusive transfer of a settings payload onto a zone group (the
// two states never coexist, RSR §3.2):
// - grouped (`preset.settingsPresets` non-empty): the group's flat settings
//   fields are stripped and the presets installed;
// - flat: the presets are removed and the flat fields spread from `preset`.
// `level` is carried over in both branches — it is a property of the whole
// zone group, not of a preset. Returns a new object; the input is untouched.
export function applySettingsPresets(group: ZoneGroup, preset: ZoneGroupSettings): ZoneGroup {
    if (preset.settingsPresets && preset.settingsPresets.length > 0) {
        return {
            ...group,
            // `regions` stays '' (the in-memory "not set" value — the field is
            // a required string on ZoneGroup); every other flat field is unset.
            regions: '',
            radio: undefined,
            pathHashMode: undefined,
            nameTemplate: undefined,
            docUrl: undefined,
            commands: undefined,
            settingsPresets: preset.settingsPresets,
            level: preset.level
        };
    }
    return {
        ...group,
        regions: preset.regions ?? '',
        radio: preset.radio,
        pathHashMode: preset.pathHashMode,
        nameTemplate: preset.nameTemplate,
        docUrl: preset.docUrl,
        commands: preset.commands,
        settingsPresets: undefined,
        level: preset.level
    };
}

// First free name with the `base`, `base1`, `base2`… pattern — used when flat
// values migrate into a named group so nothing is lost (PRD scenario 13).
export function uniquePresetName(existing: string[], base = 'default'): string {
    if (!existing.includes(base)) return base;
    for (let i = 1; ; i++) {
        const candidate = `${base}${i}`;
        if (!existing.includes(candidate)) return candidate;
    }
}

// Display order of presets in selectors: a copy sorted by `name` (locale
// compare). The creation order of the array has no technical role (RSR §3.1),
// so selectors always sort by name.
export function sortedPresetsByName(presets: NamedMeshcoreSettings[]): NamedMeshcoreSettings[] {
    return [...presets].sort((a, b) => a.name.localeCompare(b.name));
}
