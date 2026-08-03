<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import type { MeshcoreCommandRow, MeshcoreConfigValue } from '$lib/types.js';

    let {
        row,
        value,
        dirty = false,
        canRun = true,
        armed = false,
        onchange = (_next: MeshcoreConfigValue) => {},
        onsend = () => {},
        onarm = () => {}
    }: {
        row: MeshcoreCommandRow;
        value: MeshcoreConfigValue | undefined;
        dirty?: boolean;
        canRun?: boolean;
        armed?: boolean;
        onchange?: (next: MeshcoreConfigValue) => void;
        onsend?: () => void;
        onarm?: () => void;
    } = $props();

    let fieldId = $derived(`mc-row-${row.id}`);

    // Composite (multi-param) rows render one input per param. The draft is
    // derived purely from the parent value (single source of truth).
    let compositeValues = $derived.by<string[]>(() => {
        const len = row.params.length;
        if (Array.isArray(value)) {
            const arr = value.map((v) => String(v));
            while (arr.length < len) arr.push('');
            return arr.slice(0, len);
        }
        return new Array(len).fill('');
    });

    function updateComposite(index: number, inputValue: string): void {
        const next = compositeValues.map((v, i) => (i === index ? inputValue : v));
        onchange(next);
    }

    function onNumberChange(e: Event): void {
        onchange(Number((e.currentTarget as HTMLInputElement).value));
    }

    function onTextChange(e: Event): void {
        onchange((e.currentTarget as HTMLInputElement).value);
    }

    function onSelectChange(e: Event): void {
        onchange((e.currentTarget as HTMLSelectElement).value);
    }

    function onToggleChange(e: Event): void {
        onchange((e.currentTarget as HTMLInputElement).checked);
    }

    const inputClass =
        'w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-100 outline-none transition-colors focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
    const runBtnClass =
        'shrink-0 rounded-md bg-gray-700 px-2 py-1 text-xs text-orange-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50';
</script>

<div
    class={`rounded-lg border px-3 py-2 transition-colors ${
        dirty
            ? 'border-orange-600/70 bg-orange-900/10'
            : 'border-gray-700/60 bg-gray-900/40 hover:border-gray-600'
    } ${row.params.length > 1 ? 'col-span-full' : ''}`}
>
    <!-- Header: label (left) + dirty badge (config & param-actions) or action
         buttons (0-param actions): queue toggle (non-urgent) + Run. -->
    <div class="mb-1.5 flex items-center justify-between gap-2">
        <label
            for={fieldId}
            class="truncate text-xs font-semibold uppercase tracking-wide text-gray-400"
            title={row.label}
        >
            {row.id}
        </label>
        {#if row.kind === 'action' && row.params.length === 0}
            <div class="flex items-center gap-1.5">
                {#if !row.urgent}
                    <button
                        type="button"
                        onclick={onarm}
                        class={runBtnClass}
                        title={$locales(
                            armed
                                ? 'meshcoreconfig.remove_from_queue'
                                : 'meshcoreconfig.add_to_queue'
                        )}
                    >
                        {armed ? '✕' : '＋'}
                    </button>
                {/if}
                <button type="button" onclick={onsend} disabled={!canRun} class={runBtnClass}>
                    ▶ {$locales('meshcoreconfig.run')}
                </button>
            </div>
        {:else if dirty}
            <span
                class="shrink-0 rounded-full bg-orange-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-200"
            >
                {$locales('meshcoreconfig.dirty_badge')}
            </span>
        {/if}
    </div>

    {#if row.kind === 'action' && row.params.length === 0}
        <!-- 0-param action: nothing but the Run button in the header. -->
    {:else if row.control === 'toggle'}
        <label
            for={fieldId}
            class="flex w-full cursor-pointer items-center justify-between rounded-md bg-gray-800/60 px-2.5 py-1.5 text-sm"
        >
            <span class={value === true ? 'font-medium text-orange-200' : 'text-gray-400'}>
                {value === true ? 'on' : 'off'}
            </span>
            <input
                id={fieldId}
                type="checkbox"
                class="sr-only"
                checked={value === true}
                onchange={onToggleChange}
            />
            <span
                class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value === true ? 'bg-orange-600' : 'bg-gray-600'}`}
            >
                <span
                    class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value === true ? 'translate-x-4' : 'translate-x-0.5'}`}
                ></span>
            </span>
        </label>
    {:else if row.control === 'select'}
        <select
            id={fieldId}
            class={inputClass}
            value={value ?? ''}
            aria-label={row.label}
            onchange={onSelectChange}
        >
            {#if !value}<option value="" disabled></option>{/if}
            {#each row.params[0]?.options ?? [] as option (option)}
                <option value={option}>{option}</option>
            {/each}
        </select>
    {:else if row.control === 'number' && row.params.length === 1}
        <input
            id={fieldId}
            type="number"
            class={inputClass}
            value={value ?? ''}
            aria-label={row.label}
            onchange={onNumberChange}
        />
    {:else if row.params.length > 1}
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each row.params as p, i (p.name + i)}
                <div>
                    <label for={`${fieldId}-${i}`} class="mb-1 block text-[11px] text-gray-500">
                        {p.name}
                    </label>
                    <input
                        id={`${fieldId}-${i}`}
                        type={p.type === 'number' ? 'number' : 'text'}
                        class={inputClass}
                        value={compositeValues[i] ?? ''}
                        onchange={(e) =>
                            updateComposite(i, (e.currentTarget as HTMLInputElement).value)}
                    />
                </div>
            {/each}
        </div>
    {:else}
        <input
            id={fieldId}
            type="text"
            maxlength={row.params[0]?.maxLength}
            class={inputClass}
            value={value ?? ''}
            aria-label={row.label}
            onchange={onTextChange}
        />
    {/if}
</div>
