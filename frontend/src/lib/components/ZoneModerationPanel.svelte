<script lang="ts">
    // Moderator panel of the zone editor (task 77) — the "awaiting review"
    // sidebar section plus the token entry. Pure UI: files/conflicts/state come
    // in as props, every action goes out through callbacks; all API work lives
    // in zonesUpload.ts and is orchestrated by ZoneEditor.svelte.

    import { _ as locales } from 'svelte-i18n';
    import { onDestroy } from 'svelte';
    import type { PendingFileInfo, ZoneConflictPair } from '$lib/types';

    let {
        files,
        conflicts,
        shown,
        publishedNames,
        active,
        busy = false,
        onenter,
        onexit,
        ontoggle,
        onedit,
        onapprove,
        onreject
    }: {
        files: PendingFileInfo[];
        /** Conflicts per pending filename (empty/missing = none). */
        conflicts: Record<string, ZoneConflictPair[]>;
        /** Filenames currently drawn on the map. */
        shown: Set<string>;
        /** Base names (without .geojson) of published group files. */
        publishedNames: Set<string>;
        /** Whether the moderator mode is active (a token is stored). */
        active: boolean;
        busy?: boolean;
        onenter: (token: string) => void;
        onexit: () => void;
        ontoggle: (filename: string) => void;
        /** Open the preset edit modal over the panel (saved via pending/update). */
        onedit: (filename: string) => void;
        onapprove: (filename: string, overwrite: boolean) => void;
        onreject: (filename: string) => void;
    } = $props();

    // Token entry (inline field; the token itself never leaves enterModerator).
    let tokenInput = $state('');

    // Two-step confirmations: reject ("sure?" — auto-resets after 3 s) and
    // overwrite of an already published name.
    let rejectArm = $state<Record<string, boolean>>({});
    let overwriteArm = $state<Record<string, boolean>>({});
    const rejectTimers = new Map<string, ReturnType<typeof setTimeout>>();

    onDestroy(() => {
        for (const t of rejectTimers.values()) clearTimeout(t);
        rejectTimers.clear();
    });

    function submitToken(): void {
        const t = tokenInput.trim();
        if (!t) return;
        tokenInput = '';
        onenter(t);
    }

    function fileBase(filename: string): string {
        return filename.replace(/\.geojson$/, '');
    }

    function fileConflicts(filename: string): ZoneConflictPair[] {
        return conflicts[filename] ?? [];
    }

    function sizeKb(bytes: number): string {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    // Compact radio value for the preset line: freq/bw/sf/cr (config data,
    // never localized).
    function radioValue(r: NonNullable<PendingFileInfo['radio']>): string {
        return `${r.freq}/${r.bw}/${r.sf}/${r.cr}`;
    }

    function receivedAt(iso: string): string {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
    }

    function toggleShow(filename: string): void {
        ontoggle(filename);
    }

    function clickApprove(f: PendingFileInfo): void {
        const clashes = publishedNames.has(fileBase(f.filename));
        if (clashes && !overwriteArm[f.filename]) {
            overwriteArm = { ...overwriteArm, [f.filename]: true };
            return;
        }
        overwriteArm = { ...overwriteArm, [f.filename]: false };
        onapprove(f.filename, clashes);
    }

    function clickReject(f: PendingFileInfo): void {
        if (!rejectArm[f.filename]) {
            rejectArm = { ...rejectArm, [f.filename]: true };
            const t = setTimeout(() => {
                rejectArm = { ...rejectArm, [f.filename]: false };
                rejectTimers.delete(f.filename);
            }, 3000);
            rejectTimers.set(f.filename, t);
            return;
        }
        const t = rejectTimers.get(f.filename);
        if (t) {
            clearTimeout(t);
            rejectTimers.delete(f.filename);
        }
        rejectArm = { ...rejectArm, [f.filename]: false };
        onreject(f.filename);
    }
</script>

<div class="rounded-md border border-amber-600/60 bg-gray-900/50 p-2">
    {#if !active}
        <!-- Token entry: the only UI of the sleeping feature until entered -->
        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            {$locales('meshcoreconfig.zones.moderation_entry')}
        </span>
        <div class="flex gap-1">
            <input
                type="password"
                value={tokenInput}
                oninput={(e) => (tokenInput = (e.currentTarget as HTMLInputElement).value)}
                onkeydown={(e) => {
                    if (e.key === 'Enter') submitToken();
                }}
                placeholder={$locales('meshcoreconfig.zones.moderation_token_prompt')}
                class="min-w-0 flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-amber-500"
            />
            <button
                type="button"
                onclick={submitToken}
                disabled={busy || tokenInput.trim() === ''}
                class="shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {$locales('meshcoreconfig.zones.moderation_login')}
            </button>
        </div>
    {:else}
        <div class="mb-1 flex items-center justify-between gap-1">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                {$locales('meshcoreconfig.zones.pending_section')} ({files.length})
            </span>
            <button
                type="button"
                onclick={onexit}
                class="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600"
            >
                {$locales('meshcoreconfig.zones.moderation_exit')}
            </button>
        </div>

        {#if files.length === 0}
            <span class="text-[11px] text-gray-500">{$locales('meshcoreconfig.zones.pending_empty')}</span>
        {:else}
            <div class="space-y-2">
                {#each files as f (f.filename)}
                    <div class="rounded border border-gray-700 bg-gray-800 p-1.5">
                        <label class="flex items-center gap-1.5 text-[11px] text-gray-200">
                            <input
                                type="checkbox"
                                class="h-3 w-3 shrink-0"
                                checked={shown.has(f.filename)}
                                onchange={() => toggleShow(f.filename)}
                                title={$locales('meshcoreconfig.zones.pending_show')}
                            />
                            <span class="min-w-0 flex-1 truncate font-medium" title={f.filename}>
                                {f.name || f.filename}
                            </span>
                            <span class="shrink-0 text-gray-500">{sizeKb(f.sizeBytes)}</span>
                        </label>
                        <div class="mt-0.5 pl-5 text-[10px] leading-snug text-gray-400">
                            <span>{receivedAt(f.receivedAt)}</span>
                            <span> · {f.featureCount}</span>
                            {#if f.author}
                                <span> · {$locales('meshcoreconfig.zones.pending_author').replace('{author}', f.author)}</span>
                            {/if}
                        </div>
                        <!-- Preset summary: level / regions / doc link -->
                        <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 text-[10px] leading-snug">
                            <span class="rounded bg-gray-700 px-1 font-mono text-amber-300">L{f.level ?? 1}</span>
                            <span class="font-mono text-gray-300">{f.regions || '—'}</span>
                            {#if f.docUrl}
                                <a
                                    href={f.docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-sky-400 hover:text-sky-300"
                                >doc</a>
                            {/if}
                        </div>
                        <!-- Full preset: radio / path hash mode / name template -->
                        <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 font-mono text-[10px] leading-snug text-gray-400">
                            {#if f.radio}
                                <span title={$locales('meshcoreconfig.zones.radio_label')}>
                                    {$locales('meshcoreconfig.zones.result_radio_full').replace('{value}', radioValue(f.radio))}
                                </span>
                            {/if}
                            {#if f.pathHashMode}
                                <span>
                                    {$locales('meshcoreconfig.zones.result_path_hash').replace('{mode}', f.pathHashMode)}
                                </span>
                            {/if}
                            {#if f.nameTemplate}
                                <span title={$locales('meshcoreconfig.zones.result_name_template')}>
                                    {f.nameTemplate}
                                </span>
                            {/if}
                        </div>

                        {#if fileConflicts(f.filename).length > 0}
                            <div class="mt-1 rounded border border-red-500/50 bg-red-900/20 p-1">
                                <span class="text-[10px] font-medium text-red-300">
                                    {$locales('meshcoreconfig.zones.pending_conflicts').replace('{n}', String(fileConflicts(f.filename).length))}
                                </span>
                                <div class="mt-0.5 space-y-0.5">
                                    {#each fileConflicts(f.filename) as pair, i (i)}
                                        <div class="text-[10px] leading-snug text-red-300">
                                            L{pair.a.level} {pair.a.name ?? pair.a.id}
                                            × L{pair.b.level} {pair.b.name ?? pair.b.id}
                                            · {pair.kind === 'within'
                                                ? $locales('meshcoreconfig.zones.pending_conflict_within')
                                                : $locales('meshcoreconfig.zones.pending_conflict_published')}
                                            {#if pair.kind === 'published'}· {pair.b.file}{/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        {#if publishedNames.has(fileBase(f.filename))}
                            <div class="mt-1 pl-5 text-[10px] text-amber-400">
                                {$locales('meshcoreconfig.zones.pending_name_conflict')}
                            </div>
                        {/if}

                        <div class="mt-1 flex gap-1 pl-5">
                            <button
                                type="button"
                                onclick={() => onedit(f.filename)}
                                disabled={busy}
                                title={$locales('meshcoreconfig.zones.pending_edit_hint')}
                                class="shrink-0 rounded bg-gray-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                ✏️ {$locales('meshcoreconfig.zones.pending_edit')}
                            </button>
                            <button
                                type="button"
                                onclick={() => clickApprove(f)}
                                disabled={busy || fileConflicts(f.filename).length > 0}
                                title={overwriteArm[f.filename]
                                    ? $locales('meshcoreconfig.zones.pending_confirm_overwrite')
                                    : $locales('meshcoreconfig.zones.pending_approve')}
                                class={`flex-1 rounded px-2 py-0.5 text-[10px] font-medium text-white ${
                                    overwriteArm[f.filename]
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {overwriteArm[f.filename]
                                    ? $locales('meshcoreconfig.zones.pending_confirm_overwrite')
                                    : $locales('meshcoreconfig.zones.pending_approve')}
                            </button>
                            <button
                                type="button"
                                onclick={() => clickReject(f)}
                                disabled={busy}
                                class={`flex-1 rounded px-2 py-0.5 text-[10px] font-medium text-white ${
                                    rejectArm[f.filename]
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-gray-600 hover:bg-gray-500'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {rejectArm[f.filename]
                                    ? $locales('meshcoreconfig.zones.pending_reject_confirm')
                                    : $locales('meshcoreconfig.zones.pending_reject')}
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
