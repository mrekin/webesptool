<script lang="ts">
    // Small modal that edits a zone group's full meshcore settings: `regions`
    // (region def), the radio preset `set radio {freq},{bw},{sf},{cr}`,
    // `set path.hash.mode`, the node-name template, the doc URL and the extra-
    // commands list (task 79). The modal is mounted fresh on each open, so
    // $state initializers read the current props once.
    //
    // Task 82 adds the settings-groups switcher: the caller passes either a
    // flat `preset` or named `settingsPresets` — never both. One set of fields
    // is edited at a time; switching groups flushes the fields into the draft
    // and loads the next entry, so nothing is lost. `level` stays OUTSIDE the
    // switcher — it is a property of the whole zone group (hierarchy
    // attribute), saved in both modes.
    //
    // Naming convention (task 82): the runtime key of the preset list is
    // `settingsPresets`; a zone-group settings payload is `ZoneGroupSettings`.

    import { _ as locales } from 'svelte-i18n';
    import { untrack } from 'svelte';
    import { ZONE_LEVELS, ZONE_LEVEL_DEFAULT } from '$lib/config/meshcoreZoneConfig';
    import { isValidRegions } from '$lib/utils/zoneExport';
    import { uniquePresetName } from '$lib/utils/zoneSettingsPresets';
    import { parseNameTemplate } from '$lib/utils/nameTemplate';
    import type { NameTemplateToken } from '$lib/utils/nameTemplate';
    import { fillHint } from '$lib/actions/fillHint.js';
    import ModalWindowControls from './ModalWindowControls.svelte';
    import ModalShareFallback from './ModalShareFallback.svelte';
    import type {
        MeshcoreZoneSettings,
        NamedMeshcoreSettings,
        RadioSpec,
        ZoneGroupSettings
    } from '$lib/types';

    let {
        preset = {},
        settingsPresets = undefined,
        author = undefined,
        editAuthor = false,
        publishedGroupFilename = null,
        viewOnly = false,
        onsave = (_result: ZoneGroupSettings, _author?: string) => {},
        onclose = () => {}
    }: {
        /** Flat preset state of the caller (used when settingsPresets is absent). */
        preset?: MeshcoreZoneSettings;
        /** Named settings presets (grouped state); non-empty -> grouped mode. */
        settingsPresets?: NamedMeshcoreSettings[] | null;
        /** Current author (metadata), shown when editAuthor is set. */
        author?: string;
        /** Render the author field (used by the pending-file edit; in-session
         groups edit the author in their card instead). */
        editAuthor?: boolean;
        /** Base filename of the PUBLISHED group file these settings come from
         (task 83): enables the share button (?m=zone-settings&g=<filename>).
         Session drafts and pending files have no addressable id -> null. */
        publishedGroupFilename?: string | null;
        /** View mode of the direct-URL context (task 83): hides the bottom
         Cancel/Apply row entirely (fields stay visible) — the link recipient
         has no session draft to save into; closing is the header cross only. */
        viewOnly?: boolean;
        /** Object save (task 79/82): flat preset (incl. `level`) OR `level` +
         `settingsPresets` — the two states are mutually exclusive. */
        onsave?: (result: ZoneGroupSettings, author?: string) => void;
        onclose?: () => void;
    } = $props();

    // Fixed protocol enum for `set path.hash.mode` (matches meshcoreCommandData).
    const PATH_HASH_OPTIONS = ['0', '1', '2'];

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);

    // Grouped draft: the presets being edited (a copy — edits never mutate the
    // caller's array). null = flat mode (no settings groups). Creation order of
    // the array is preserved (selectors that need it sort by name elsewhere).
    let presetsDraft = $state<NamedMeshcoreSettings[] | null>(
        untrack(() => (settingsPresets && settingsPresets.length > 0 ? [...settingsPresets] : null))
    );
    let activeIndex = $state(0);
    // Inline "new settings group" name prompt (RSR §3.8): null = hidden,
    // 'create' = wrap the current flat fields into one group, 'add' = append a
    // new (default-valued) group, 'clone' = clone the selected settings group
    // (task 84; the source is the CURRENTLY selected group — user feedback).
    let namePromptMode = $state<'create' | 'add' | 'clone' | null>(null);
    let newGroupName = $state('');

    // One-shot field source: the first draft entry in grouped mode, the flat
    // prop otherwise (the modal is mounted fresh on each open).
    const initialFields: MeshcoreZoneSettings | NamedMeshcoreSettings | undefined = untrack(() =>
        presetsDraft ? presetsDraft[activeIndex] : preset
    );

    // Text inputs so the user can type freely; coerced to numbers on save.
    let regionsVal = $state(initialFields?.regions ?? '');
    let freq = $state(initialFields?.radio?.freq != null ? String(initialFields.radio.freq) : '');
    let bw = $state(initialFields?.radio?.bw != null ? String(initialFields.radio.bw) : '');
    let sf = $state(initialFields?.radio?.sf != null ? String(initialFields.radio.sf) : '');
    let cr = $state(initialFields?.radio?.cr != null ? String(initialFields.radio.cr) : '');
    // Default to '1' (recommended path hash mode) when the group has none set;
    // an existing '0'/'2' is preserved, and '—' stays selectable to clear it.
    let pathHash = $state(initialFields?.pathHashMode ?? '1');
    let nameTemplateVal = $state(initialFields?.nameTemplate ?? '');
    let docUrlVal = $state(initialFields?.docUrl ?? '');
    // Zone hierarchy level: a property of the whole zone group — kept OUTSIDE
    // the settings-groups switcher (saved in both flat and grouped modes).
    let levelVal = $state(untrack(() => preset.level ?? ZONE_LEVEL_DEFAULT));
    let authorVal = $state(untrack(() => author ?? ''));
    // Extra command lines (task 79): a plain editable string list — no
    // validation, no autocomplete (the point is NOT to rebuild the
    // configurator here). Copied so edits never mutate the caller's array.
    let commandsVal = $state<string[]>([...(initialFields?.commands ?? [])]);

    // Live preview of the parsed template tokens (enum/free/literal).
    const templateTokens = $derived(parseNameTemplate(nameTemplateVal));

    // The active draft entry (clamped — the index never escapes the array).
    const activePreset = $derived(
        presetsDraft ? presetsDraft[Math.min(activeIndex, presetsDraft.length - 1)] : undefined
    );

    // Radio is valid when either fully empty (-> cleared) or all four components
    // are finite numbers. A partial entry blocks save.
    const radioValid = $derived.by(() => {
        const parts = [freq, bw, sf, cr].map((s) => s.trim());
        const filled = parts.filter((p) => p !== '');
        if (filled.length === 0) return true;
        if (filled.length !== 4) return false;
        return parts.map(Number).every((n) => Number.isFinite(n));
    });

    const regionsValid = $derived(isValidRegions(regionsVal));
    // Grouped mode additionally requires every group name to be non-empty and
    // unique within the zone group (PRD scenario 14).
    const groupNamesValid = $derived.by(() => {
        if (!presetsDraft) return true;
        const names = presetsDraft.map((p) => p.name.trim());
        return names.every((n) => n !== '') && new Set(names).size === names.length;
    });
    // Localized error key of the active group's name field (grouped only).
    const activeNameError = $derived.by(() => {
        if (!presetsDraft) return null;
        const name = (activePreset?.name ?? '').trim();
        if (name === '') return 'meshcoreconfig.zones.settings_group_name_required';
        if (presetsDraft.filter((p) => p.name.trim() === name).length > 1) {
            return 'meshcoreconfig.zones.settings_group_name_taken';
        }
        return null;
    });
    // nameTemplate/docUrl/commands are optional metadata — they never block save.
    const canSave = $derived(regionsValid && radioValid && groupNamesValid);
    // A non-blank (after trim) command list enables the "copy all" button.
    const hasCommandsToCopy = $derived(commandsVal.some((c) => c.trim() !== ''));

    // Snapshot of the currently edited fields as a preset payload — no
    // `name`/`isDefault`/`level` (the entry identity and the zone-group level
    // are preserved by the caller).
    function collectFields(): Omit<NamedMeshcoreSettings, 'name'> {
        const parts = [freq, bw, sf, cr].map((s) => s.trim());
        const hasRadio = parts.some((p) => p !== '');
        const resolvedRadio: RadioSpec | undefined = hasRadio
            ? {
                  freq: Number(parts[0]),
                  bw: Number(parts[1]),
                  sf: Number(parts[2]),
                  cr: Number(parts[3])
              }
            : undefined;
        // Blank/whitespace command rows are dropped (order kept, duplicates
        // kept); the key is dropped when nothing remains so an emptied list
        // CLEARS the stored field.
        const cleanedCommands = commandsVal.map((c) => c.trim()).filter((c) => c !== '');
        return {
            regions: regionsVal.trim(),
            radio: resolvedRadio,
            pathHashMode: pathHash || undefined,
            nameTemplate: nameTemplateVal.trim() || undefined,
            docUrl: docUrlVal.trim() || undefined,
            commands: cleanedCommands.length > 0 ? cleanedCommands : undefined
        };
    }

    // Load the editor fields from a preset source (a draft entry or the flat
    // prop). `level` is not loaded — it lives outside the switcher.
    function loadFieldsFrom(
        src: MeshcoreZoneSettings | NamedMeshcoreSettings | null | undefined
    ): void {
        regionsVal = src?.regions ?? '';
        freq = src?.radio?.freq != null ? String(src.radio.freq) : '';
        bw = src?.radio?.bw != null ? String(src.radio.bw) : '';
        sf = src?.radio?.sf != null ? String(src.radio.sf) : '';
        cr = src?.radio?.cr != null ? String(src.radio.cr) : '';
        pathHash = src?.pathHashMode ?? '1';
        nameTemplateVal = src?.nameTemplate ?? '';
        docUrlVal = src?.docUrl ?? '';
        commandsVal = [...(src?.commands ?? [])];
    }

    // Store the currently edited fields into the active draft entry (keeps the
    // entry's name/isDefault) — no data loss when switching groups (RSR §3.8).
    function flushFieldsToDraft(): void {
        if (!presetsDraft) return;
        const cur = presetsDraft[activeIndex];
        if (!cur) return;
        const next = [...presetsDraft];
        next[activeIndex] = {
            ...collectFields(),
            name: cur.name,
            ...(cur.isDefault === true ? { isDefault: true } : {})
        };
        presetsDraft = next;
    }

    // Switch the active group: flush the current fields into the draft, then
    // load the target entry (PRD scenario 11 — nothing is lost).
    function switchGroup(index: number): void {
        if (!presetsDraft) return;
        const target = Math.max(0, Math.min(index, presetsDraft.length - 1));
        if (target === activeIndex) return;
        flushFieldsToDraft();
        activeIndex = target;
        loadFieldsFrom(presetsDraft[target]);
    }

    // True when none of the editable preset fields has content. `pathHash` is
    // excluded — its '1' is a UI default, not user input.
    function fieldsEmpty(): boolean {
        return (
            regionsVal.trim() === '' &&
            freq.trim() === '' &&
            bw.trim() === '' &&
            sf.trim() === '' &&
            cr.trim() === '' &&
            nameTemplateVal.trim() === '' &&
            docUrlVal.trim() === '' &&
            commandsVal.every((c) => c.trim() === '')
        );
    }

    function openNamePrompt(mode: 'create' | 'add' | 'clone'): void {
        newGroupName = '';
        // Grouped "+": flush the active group's latest edits into its draft
        // entry, then show DEFAULTS in the fields right away (user feedback
        // 3.2) — what the form shows under the prompt is what the new group
        // will get. Cancel restores the active group's values.
        if (mode === 'add' && presetsDraft) {
            flushFieldsToDraft();
            loadFieldsFrom(null);
        }
        namePromptMode = mode;
    }
    function cancelNamePrompt(): void {
        namePromptMode = null;
        newGroupName = '';
        // Undo the defaults the grouped "+" prompt put into the fields.
        if (presetsDraft) loadFieldsFrom(presetsDraft[activeIndex]);
    }
    function onPromptKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') confirmNamePrompt();
        else if (e.key === 'Escape') cancelNamePrompt();
    }

    // Confirm the inline name prompt (RSR §3.8):
    // - 'create': the current flat fields become the single named group (PRD
    //   scenarios 9/10) — the flat state disappears;
    // - 'add' from flat with non-empty fields: the flat values are FIRST
    //   carried into an auto-named group (`default`/`default1`…, PRD scenario
    //   13) so nothing is lost, then the new (empty) group becomes active;
    // - 'add' from grouped: appends an empty group (PRD scenario 11).
    // A blank/duplicate name is accepted here and blocks SAVE with a
    // localized error (PRD scenario 14 / checklist E14).
    function confirmNamePrompt(): void {
        const name = newGroupName.trim();
        if (namePromptMode === 'create') {
            presetsDraft = [{ name, ...collectFields() }];
            activeIndex = 0;
        } else if (namePromptMode === 'add') {
            if (!presetsDraft) {
                const draft: NamedMeshcoreSettings[] = [];
                if (!fieldsEmpty()) {
                    const carried = uniquePresetName(draft.map((p) => p.name));
                    draft.push({ ...collectFields(), name: carried });
                }
                draft.push({ name });
                presetsDraft = draft;
                activeIndex = draft.length - 1;
            } else {
                // Grouped "+" (user feedback 3.2): the fields were reset to
                // defaults when the prompt opened, so what the form shows now
                // (defaults or the user's tweaks under the prompt) IS the new
                // group's content. NO flush here — it would overwrite the
                // active group with the fresh defaults.
                presetsDraft = [...presetsDraft, { ...collectFields(), name }];
                activeIndex = presetsDraft.length - 1;
            }
        } else if (namePromptMode === 'clone') {
            if (!presetsDraft) return; // unreachable: the clone entry exists in grouped mode only
            // No name — no clone (PRD П4.2): the ✓ gate alone does not cover
            // the Enter key, so the branch itself refuses an empty name.
            if (name === '') return;
            // The source is the CURRENTLY selected group (user feedback 3.1):
            // flush its latest edits first, THEN read the entry — flush
            // replaces the array element, and snapshotting the pre-flush
            // reference would copy stale values.
            flushFieldsToDraft();
            const src = presetsDraft[activeIndex];
            if (!src) return;
            // Whole-structure deep copy WITHOUT the identity fields: values,
            // not references (a detached $state.snapshot copy — no proxy), so
            // future new fields ride along automatically. The clone never
            // inherits the "default" mark; the name comes from the prompt.
            const copy: NamedMeshcoreSettings = $state.snapshot(src);
            copy.name = name;
            delete copy.isDefault;
            presetsDraft = [...presetsDraft, copy];
            activeIndex = presetsDraft.length - 1;
        }
        namePromptMode = null;
        newGroupName = '';
        if (presetsDraft) loadFieldsFrom(presetsDraft[activeIndex]);
    }

    // Rename the active group inline (uniqueness/emptiness is validated live
    // and blocks save, PRD scenario 14).
    function renameActiveGroup(name: string): void {
        if (!presetsDraft) return;
        const next = [...presetsDraft];
        next[activeIndex] = { ...next[activeIndex], name };
        presetsDraft = next;
    }

    // Checkbox with radio semantics: at most one default preset per zone
    // group; unchecking the active one removes the default entirely (allowed,
    // PRD scenario 5 — nothing is applied until the user picks a group).
    function toggleDefault(): void {
        if (!presetsDraft) return;
        const make = presetsDraft[activeIndex]?.isDefault !== true;
        presetsDraft = presetsDraft.map((p, i) => {
            const next: NamedMeshcoreSettings = { ...p };
            if (i === activeIndex && make) next.isDefault = true;
            else delete next.isDefault;
            return next;
        });
    }

    // Delete-group confirmation window (user feedback 3.3): the ✕ button only
    // OPENS it, the real removal happens on its confirm button — a real
    // confirmation dialog, same interaction pattern as BackupConfirmModal.
    let deleteConfirmOpen = $state(false);
    // The dialog names its target (user feedback): the active group's name,
    // or the localized "(unnamed)" placeholder for a nameless draft.
    const deleteTargetName = $derived(
        (activePreset?.name ?? '').trim() ||
            $locales('meshcoreconfig.zones.upload_unnamed_group')
    );

    // Delete the active group (RSR §3.8 / Q1): removing the LAST group returns
    // to the flat mode keeping the removed group's values in the fields;
    // otherwise the neighbour becomes active (flush first — nothing is lost).
    function removeGroup(): void {
        if (!presetsDraft) return;
        flushFieldsToDraft();
        const removed = presetsDraft[activeIndex];
        if (presetsDraft.length === 1) {
            presetsDraft = null;
            activeIndex = 0;
            loadFieldsFrom(removed);
            return;
        }
        const next = presetsDraft.filter((_, i) => i !== activeIndex);
        presetsDraft = next;
        activeIndex = Math.min(activeIndex, next.length - 1);
        loadFieldsFrom(next[activeIndex]);
    }

    // Extra-commands list editing: append a blank row, drop one row, edit one.
    function addCommandRow(): void {
        commandsVal = [...commandsVal, ''];
    }
    function removeCommandRow(index: number): void {
        commandsVal = commandsVal.filter((_, i) => i !== index);
    }
    function updateCommandRow(index: number, value: string): void {
        commandsVal = commandsVal.map((c, i) => (i === index ? value : c));
    }
    // Multi-line paste into a command row: split the pasted text by lines —
    // the first line lands in the pasted field, the remaining lines become
    // new rows right after it (order kept). Trailing blank lines (from a
    // trailing newline) are dropped; a single-line paste is left to the
    // browser default.
    function onCommandPaste(index: number, e: ClipboardEvent): void {
        const text = e.clipboardData?.getData('text') ?? '';
        if (!/\r|\n/.test(text)) return;
        e.preventDefault();
        const lines = text.split(/\r?\n/);
        while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
        commandsVal = [...commandsVal.slice(0, index), ...lines, ...commandsVal.slice(index + 1)];
    }
    // Copy every non-empty command line to the clipboard, one command per
    // line. The modal has no notice mechanism, so a clipboard failure is a
    // silent no-op (same as the shared terminalClipboard helpers).
    function copyAllCommands(): void {
        const text = commandsVal
            .map((c) => c.trim())
            .filter((c) => c !== '')
            .join('\n');
        if (text === '') return;
        navigator.clipboard.writeText(text).catch(() => {
            /* clipboard unavailable — ignore */
        });
    }

    // Name of the subgroup header that opens exactly at option `oi` (task 82
    // preview): null when the option belongs to the unnamed leading segment or
    // to a previously opened subgroup.
    function subgroupHeaderAt(tok: NameTemplateToken, oi: number): string | null {
        if (tok.type !== 'enum' || !tok.subgroups) return null;
        for (const sg of tok.subgroups) {
            if (sg.start === oi) return sg.name;
        }
        return null;
    }

    function save(): void {
        if (!canSave) return;
        const resultAuthor = authorVal.trim() || undefined;
        if (presetsDraft) {
            // Grouped: the active group's latest edits are flushed first; the
            // fields of the saved presets stay as edited (level is common).
            flushFieldsToDraft();
            onsave(
                { level: levelVal, settingsPresets: presetsDraft.map((p) => ({ ...p })) },
                resultAuthor
            );
        } else {
            onsave({ ...collectFields(), level: levelVal }, resultAuthor);
        }
    }
</script>

<div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
>
    <div class="w-full max-w-md rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-base font-semibold text-orange-200">
                {$locales('meshcoreconfig.zones.meshcore_settings')}
            </h3>
            <!-- Window controls cluster (task 83): share only for published
                 groups (addressable filename), cross = Cancel. -->
            <ModalWindowControls
                shareId={publishedGroupFilename ? 'zone-settings' : null}
                shareParams={publishedGroupFilename ? { g: publishedGroupFilename } : null}
                bind:shareFallbackUrl={shareFallbackUrl}
                onclose={onclose}
            />
        </div>

        {#if shareFallbackUrl}
            <ModalShareFallback url={shareFallbackUrl} />
        {/if}

        <!-- Zone hierarchy level: zones at the same level may not overlap;
             different levels may nest; lookup resolves to the most specific.
             Kept OUTSIDE the settings-groups switcher (a zone-group attribute). -->
        <div class="mb-3">
            <label
                for="mc-zone-level"
                class="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
            >
                {$locales('meshcoreconfig.zones.zone_level')}
            </label>
            <select
                id="mc-zone-level"
                value={levelVal}
                onchange={(e) => (levelVal = Number((e.currentTarget as HTMLSelectElement).value))}
                class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
            >
                {#each ZONE_LEVELS as lv (lv)}
                    <option value={lv}
                        >{lv} — {$locales(`meshcoreconfig.zones.zone_level_${lv}`)}</option
                    >
                {/each}
            </select>
        </div>

        <!-- Settings groups (task 82): grouped switcher or flat-mode actions.
             One set of preset fields below serves the active group. -->
        {#if presetsDraft}
            <div class="mb-3 rounded-md border border-gray-700 bg-gray-900/50 p-2">
                <div class="mb-2 flex items-center gap-1">
                    <select
                        value={activeIndex}
                        onchange={(e) =>
                            switchGroup(Number((e.currentTarget as HTMLSelectElement).value))}
                        class="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    >
                        {#each presetsDraft as p, i (i)}
                            <option value={i}>{p.name || '—'}</option>
                        {/each}
                    </select>
                    <button
                        type="button"
                        onclick={() => openNamePrompt('add')}
                        title={$locales('meshcoreconfig.zones.settings_group_add')}
                        aria-label={$locales('meshcoreconfig.zones.settings_group_add')}
                        class="shrink-0 rounded bg-gray-700 px-2 py-1 text-xs font-bold text-orange-200 transition-colors hover:bg-gray-600"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onclick={() => openNamePrompt('clone')}
                        title={$locales('meshcoreconfig.zones.settings_group_clone')}
                        aria-label={$locales('meshcoreconfig.zones.settings_group_clone')}
                        class="shrink-0 rounded bg-gray-700 px-2 py-1 text-xs font-bold text-orange-200 transition-colors hover:bg-gray-600"
                    >
                        ⧉
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="text"
                        value={activePreset?.name ?? ''}
                        oninput={(e) =>
                            renameActiveGroup((e.currentTarget as HTMLInputElement).value)}
                        placeholder={$locales('meshcoreconfig.zones.settings_group_name_prompt')}
                        use:fillHint
                        class={`min-w-0 flex-1 rounded-md border bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500 ${activeNameError ? 'border-red-500' : 'border-gray-600'}`}
                    />
                    <label
                        class="flex shrink-0 items-center gap-1 text-[11px] text-gray-300"
                        title={$locales('meshcoreconfig.zones.settings_group_default')}
                    >
                        <input
                            type="checkbox"
                            class="h-3 w-3"
                            checked={activePreset?.isDefault === true}
                            onchange={toggleDefault}
                        />
                        <span>{$locales('meshcoreconfig.zones.settings_group_default')}</span>
                    </label>
                    <button
                        type="button"
                        onclick={() => (deleteConfirmOpen = true)}
                        title={$locales('meshcoreconfig.zones.settings_group_delete')}
                        aria-label={$locales('meshcoreconfig.zones.settings_group_delete')}
                        class="shrink-0 rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300"
                    >
                        ✕
                    </button>
                </div>
                {#if activeNameError}
                    <span class="mt-1 block text-[10px] text-red-400">
                        {$locales(activeNameError)}
                    </span>
                {/if}
            </div>
        {:else}
            <div class="mb-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onclick={() => openNamePrompt('create')}
                    class="rounded bg-gray-700 px-2 py-1 text-xs text-orange-200 transition-colors hover:bg-gray-600"
                >
                    {$locales('meshcoreconfig.zones.settings_group_create_from_current')}
                </button>
                <button
                    type="button"
                    onclick={() => openNamePrompt('add')}
                    class="rounded bg-gray-700 px-2 py-1 text-xs text-orange-200 transition-colors hover:bg-gray-600"
                >
                    + {$locales('meshcoreconfig.zones.settings_group_add')}
                </button>
            </div>
        {/if}

        <!-- Inline name prompt of the settings-group creation (RSR §3.8).
             Clone has no source picker: the source is the currently selected
             group (user feedback 3.1). -->
        {#if namePromptMode}
            <div class="mb-3">
                <div class="flex items-center gap-1">
                    <input
                        type="text"
                        value={newGroupName}
                        oninput={(e) =>
                            (newGroupName = (e.currentTarget as HTMLInputElement).value)}
                        onkeydown={onPromptKeydown}
                        placeholder={$locales('meshcoreconfig.zones.settings_group_name_prompt')}
                        use:fillHint
                        class="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                    <button
                        type="button"
                        onclick={confirmNamePrompt}
                        disabled={namePromptMode === 'clone' && newGroupName.trim() === ''}
                        title={namePromptMode === 'clone'
                            ? $locales('meshcoreconfig.zones.settings_group_name_required')
                            : undefined}
                        class="shrink-0 rounded bg-orange-600 px-2 py-1 text-xs text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        ✓
                    </button>
                    <button
                        type="button"
                        onclick={cancelNamePrompt}
                        title={$locales('common.cancel')}
                        aria-label={$locales('common.cancel')}
                        class="shrink-0 rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300"
                    >
                        ✕
                    </button>
                </div>
            </div>
        {/if}

        <!-- regions: region def -->
        <div class="mb-3">
            <label
                for="mc-zone-regions"
                class="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
            >
                {$locales('meshcoreconfig.zones.regions_label')}
            </label>
            <input
                id="mc-zone-regions"
                type="text"
                value={regionsVal}
                oninput={(e) => (regionsVal = (e.currentTarget as HTMLInputElement).value)}
                placeholder={$locales('meshcoreconfig.zones.regions_placeholder')}
                use:fillHint
                class={`w-full rounded-md border bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500 ${regionsValid ? 'border-gray-600' : 'border-red-500'}`}
            />
            {#if regionsVal && !regionsValid}
                <span class="mt-0.5 block text-[10px] text-red-400">
                    {$locales('meshcoreconfig.zones.regions_invalid')}
                </span>
            {/if}
        </div>

        <!-- Radio preset: set radio {freq},{bw},{sf},{cr} -->
        <div class="mb-3 rounded-md border border-gray-700 bg-gray-900/50 p-2">
            <span
                class="mb-2 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
            >
                {$locales('meshcoreconfig.zones.radio_label')}
            </span>
            <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_freq')}</span>
                    <input
                        type="text"
                        inputmode="decimal"
                        value={freq}
                        oninput={(e) => (freq = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="868.731"
                        use:fillHint
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_bw')}</span>
                    <input
                        type="text"
                        inputmode="decimal"
                        value={bw}
                        oninput={(e) => (bw = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="62.5"
                        use:fillHint
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_sf')}</span>
                    <input
                        type="text"
                        inputmode="decimal"
                        value={sf}
                        oninput={(e) => (sf = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="7"
                        use:fillHint
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_cr')}</span>
                    <input
                        type="text"
                        inputmode="decimal"
                        value={cr}
                        oninput={(e) => (cr = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="7"
                        use:fillHint
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
            </div>
            {#if !radioValid}
                <span class="mt-1 block text-[10px] text-red-400">
                    {$locales('meshcoreconfig.zones.radio_invalid')}
                </span>
            {/if}
        </div>

        <!-- Path hash mode: set path.hash.mode {value} -->
        <div class="mb-1 rounded-md border border-gray-700 bg-gray-900/50 p-2">
            <div class="flex items-center justify-between gap-2 text-[11px] text-gray-300">
                <span class="font-semibold tracking-wide text-gray-400 uppercase">
                    {$locales('meshcoreconfig.zones.path_hash_mode')}
                </span>
                <select
                    aria-label={$locales('meshcoreconfig.zones.path_hash_mode')}
                    value={pathHash}
                    onchange={(e) => (pathHash = (e.currentTarget as HTMLSelectElement).value)}
                    class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                >
                    <option value="">—</option>
                    {#each PATH_HASH_OPTIONS as opt (opt)}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- Name template: composer template for `set name` -->
        <div class="mb-3 rounded-md border border-gray-700 bg-gray-900/50 p-2">
            <label
                for="mc-zone-name-template"
                class="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
            >
                {$locales('meshcoreconfig.zones.name_template')}
            </label>
            <input
                id="mc-zone-name-template"
                type="text"
                value={nameTemplateVal}
                oninput={(e) => (nameTemplateVal = (e.currentTarget as HTMLInputElement).value)}
                class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
            />
            {#if templateTokens.length > 0}
                <!-- Live preview: literal (gray), enum options (orange), free token (sky).
                     Enum subgroup headers (task 82) render gray before their options. -->
                <div class="mt-1 flex flex-wrap items-center gap-1 text-[10px] leading-tight">
                    {#each templateTokens as tok, i (i)}
                        {#if tok.type === 'literal'}
                            <span class="text-gray-500">{tok.value}</span>
                        {:else if tok.type === 'enum'}
                            <span
                                class="rounded bg-orange-900/50 px-1 text-orange-200"
                                title={$locales('meshcoreconfig.zones.name_template_preview_enum')}
                            >
                                {#if tok.subgroups}
                                    {#each tok.options as opt, oi (oi)}{#if oi > 0}|{/if}{#if subgroupHeaderAt(tok, oi)}<span
                                                class="text-gray-500"
                                            >
                                                --{subgroupHeaderAt(tok, oi)}--
                                            </span>{/if}{opt}{/each}
                                {:else}
                                    {tok.options.join('|')}
                                {/if}
                            </span>
                        {:else}
                            <span
                                class="rounded bg-sky-900/50 px-1 text-sky-200"
                                title={$locales('meshcoreconfig.zones.name_template_preview_free')}
                                >{tok.name}</span
                            >
                        {/if}
                    {/each}
                </div>
            {/if}
            <span class="mt-0.5 block text-[10px] text-gray-500">
                {$locales('meshcoreconfig.zones.name_template_hint')}
            </span>
        </div>

        <!-- Doc URL: link to a settings document -->
        <div class="mb-1">
            <label
                for="mc-zone-doc-url"
                class="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
            >
                {$locales('meshcoreconfig.zones.doc_url')}
            </label>
            <input
                id="mc-zone-doc-url"
                type="url"
                value={docUrlVal}
                oninput={(e) => (docUrlVal = (e.currentTarget as HTMLInputElement).value)}
                placeholder="https://..."
                use:fillHint
                class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
            />
        </div>

        <!-- Extra commands (task 79): numbered list of arbitrary one-line
             meshcore commands, no validation/autocomplete by design. -->
        <div class="mt-3 mb-1 rounded-md border border-gray-700 bg-gray-900/50 p-2">
            <div class="mb-1 flex items-center justify-between gap-2">
                <span class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                    {$locales('meshcoreconfig.zones.commands_label')}
                </span>
                {#if hasCommandsToCopy}
                    <button
                        type="button"
                        onclick={copyAllCommands}
                        title={$locales('meshcoreconfig.zones.commands_copy')}
                        aria-label={$locales('meshcoreconfig.zones.commands_copy')}
                        class="rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-orange-200"
                    >
                        ⧉
                    </button>
                {/if}
            </div>
            <div class="space-y-1">
                {#each commandsVal as cmd, i (i)}
                    <div class="flex items-center gap-1">
                        <span class="w-4 shrink-0 text-right text-[10px] text-gray-500"
                            >{i + 1}</span
                        >
                        <input
                            type="text"
                            value={cmd}
                            oninput={(e) =>
                                updateCommandRow(i, (e.currentTarget as HTMLInputElement).value)}
                            onpaste={(e) => onCommandPaste(i, e)}
                            use:fillHint
                            class="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-xs text-gray-100 outline-none focus:border-orange-500"
                        />
                        <button
                            type="button"
                            onclick={() => removeCommandRow(i)}
                            title={$locales('meshcoreconfig.zones.commands_remove')}
                            aria-label={$locales('meshcoreconfig.zones.commands_remove')}
                            class="shrink-0 rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300"
                        >
                            ✕
                        </button>
                    </div>
                {/each}
                <button
                    type="button"
                    onclick={addCommandRow}
                    class="rounded bg-gray-700 px-2 py-1 text-xs text-orange-200 transition-colors hover:bg-gray-600"
                >
                    + {$locales('meshcoreconfig.zones.commands_add')}
                </button>
            </div>
            <span class="mt-1 block text-[10px] text-gray-500">
                {$locales('meshcoreconfig.zones.commands_hint')}
            </span>
        </div>

        <!-- Author: plain catalog metadata (who filled the group in), not a
             firmware setting — only the pending-file edit needs it here. -->
        {#if editAuthor}
            <div class="mt-3 mb-1">
                <label
                    for="mc-zone-author"
                    class="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
                >
                    {$locales('meshcoreconfig.zones.group_author_prompt')}
                </label>
                <input
                    id="mc-zone-author"
                    type="text"
                    value={authorVal}
                    oninput={(e) => (authorVal = (e.currentTarget as HTMLInputElement).value)}
                    use:fillHint
                    class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                />
            </div>
        {/if}

        <!-- Bottom actions are hidden entirely in view mode (direct-URL
             context, task 83): there is nothing to save into. -->
        {#if !viewOnly}
            <div class="mt-4 flex items-center justify-end gap-3">
                <button
                    type="button"
                    onclick={onclose}
                    class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
                >
                    {$locales('common.cancel')}
                </button>
                <button
                    type="button"
                    onclick={save}
                    disabled={!canSave}
                    class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {$locales('meshcoreconfig.apply')}
                </button>
            </div>
        {/if}
    </div>

    <!-- Delete-group confirmation (user feedback 3.3): a real confirmation
         window, same interaction pattern as BackupConfirmModal. A child of
         the z-[80] overlay, so it layers above the settings card. -->
    {#if deleteConfirmOpen}
        <div
            class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            onkeydown={(e) => e.key === 'Escape' && (deleteConfirmOpen = false)}
        >
            <div
                class="w-full max-w-sm rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl"
            >
                <h3 class="mb-2 text-base font-semibold text-orange-200">
                    {$locales('meshcoreconfig.zones.settings_group_delete')}
                </h3>
                <p class="mb-4 text-sm text-gray-300">
                    {$locales('meshcoreconfig.zones.settings_group_delete_confirm', {
                        values: { name: deleteTargetName }
                    })}
                </p>
                <div class="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onclick={() => (deleteConfirmOpen = false)}
                        class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
                    >
                        {$locales('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onclick={() => {
                            deleteConfirmOpen = false;
                            removeGroup();
                        }}
                        class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                        {$locales('meshcoreconfig.zones.settings_group_delete')}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>
