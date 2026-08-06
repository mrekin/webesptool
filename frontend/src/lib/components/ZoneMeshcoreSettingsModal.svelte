<script lang="ts">
    // Small modal that edits a zone group's full meshcore preset: `regions`
    // (region def), the radio preset `set radio {freq},{bw},{sf},{cr}` and
    // `set path.hash.mode`. The modal is mounted fresh on each open, so $state
    // initializers read the current props once.

    import { _ as locales } from 'svelte-i18n';
    import { untrack } from 'svelte';
    import { isValidRegions } from '$lib/utils/zoneExport';
    import type { RadioSpec } from '$lib/types';

    let {
        regions = '',
        radio = undefined,
        pathHashMode = undefined,
        onsave = (
            _regions: string,
            _radio: RadioSpec | undefined,
            _pathHashMode: string | undefined
        ) => {},
        onclose = () => {}
    }: {
        regions?: string;
        radio?: RadioSpec;
        pathHashMode?: string;
        onsave?: (
            regions: string,
            radio: RadioSpec | undefined,
            pathHashMode: string | undefined
        ) => void;
        onclose?: () => void;
    } = $props();

    // Fixed protocol enum for `set path.hash.mode` (matches meshcoreCommandData).
    const PATH_HASH_OPTIONS = ['0', '1', '2'];

    // Text inputs so the user can type freely; coerced to numbers on save. The
    // modal is mounted fresh on each open, so the initial values are read from
    // the props once (untrack signals "initial value only" intent and avoids the
    // state_referenced_locally advisory).
    let regionsVal = $state(untrack(() => regions));
    let freq = $state(untrack(() => (radio?.freq != null ? String(radio.freq) : '')));
    let bw = $state(untrack(() => (radio?.bw != null ? String(radio.bw) : '')));
    let sf = $state(untrack(() => (radio?.sf != null ? String(radio.sf) : '')));
    let cr = $state(untrack(() => (radio?.cr != null ? String(radio.cr) : '')));
    let pathHash = $state(untrack(() => pathHashMode ?? ''));

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
    const canSave = $derived(regionsValid && radioValid);

    function save(): void {
        if (!canSave) return;
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
        onsave(regionsVal.trim(), resolvedRadio, pathHash || undefined);
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
        </div>

        <!-- regions: region def -->
        <div class="mb-3">
            <label
                for="mc-zone-regions"
                class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {$locales('meshcoreconfig.zones.regions_label')}
            </label>
            <input
                id="mc-zone-regions"
                type="text"
                value={regionsVal}
                oninput={(e) => (regionsVal = (e.currentTarget as HTMLInputElement).value)}
                placeholder={$locales('meshcoreconfig.zones.regions_placeholder')}
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
            <span class="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {$locales('meshcoreconfig.zones.radio_label')}
            </span>
            <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_freq')}</span>
                    <input
                        type="number"
                        step="0.001"
                        value={freq}
                        oninput={(e) => (freq = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="868.731"
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_bw')}</span>
                    <input
                        type="number"
                        step="0.1"
                        value={bw}
                        oninput={(e) => (bw = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="62.5"
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_sf')}</span>
                    <input
                        type="number"
                        step="1"
                        value={sf}
                        oninput={(e) => (sf = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="7"
                        class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                    />
                </label>
                <label class="flex flex-col gap-1 text-[11px] text-gray-300">
                    <span>{$locales('meshcoreconfig.zones.radio_cr')}</span>
                    <input
                        type="number"
                        step="1"
                        value={cr}
                        oninput={(e) => (cr = (e.currentTarget as HTMLInputElement).value)}
                        placeholder="7"
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
                <span class="font-semibold uppercase tracking-wide text-gray-400">
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
    </div>
</div>
