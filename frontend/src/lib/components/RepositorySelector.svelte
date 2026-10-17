<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import {
        availableSources,
        deviceSelection,
        deviceActions,
        loadingState,
        uiState
    } from '$lib/stores.js';
    import { RepositoryType } from '$lib/types.js';
    import type { SourceInfo } from '$lib/types.js';
    import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
    import { lastFlashed, isNewerBuild } from '$lib/utils/lastFlashed.js';

    interface Props {
        onOpenStats?: () => void;
    }

    let { onOpenStats = undefined }: Props = $props();

    // Localized group subtitles: trade names, identical in every locale.
    const GROUP_TITLE_KEYS: Record<RepositoryType, string> = {
        [RepositoryType.MESHTASTIC]: 'page.source_group_meshtastic',
        [RepositoryType.MESHCORE]: 'page.source_group_meshcore'
    };

    // Two fixed rows (PRD: Meshtastic first, then MeshCore), regardless of the
    // API response order. Empty groups are omitted entirely; the relative
    // order of repositories inside a group follows the API response.
    const sourceGroups = $derived.by(() => {
        const byType = new Map<RepositoryType, SourceInfo[]>();
        for (const source of $availableSources) {
            const type = source.type;
            const list = byType.get(type);
            if (list) list.push(source);
            else byType.set(type, [source]);
        }
        return [RepositoryType.MESHTASTIC, RepositoryType.MESHCORE]
            .map((type) => ({
                type,
                titleKey: GROUP_TITLE_KEYS[type],
                sources: byType.get(type) ?? []
            }))
            .filter((group) => group.sources.length > 0);
    });

    // Stats button: same visibility conditions as before; rendered in the last
    // group row (right end), matching the approved variant-a4 mockups.
    const showStatsButton = $derived(
        $uiState.statsEnabled && $uiState.experimentalFeatures && onOpenStats !== undefined
    );

    // T-153: repositories whose latest build is STRICTLY newer than the user's
    // last flashed one (build-date comparison). Shown only with experimental
    // features on; missing/broken data → no marker (PRD goals 1–3).
    const newVersionSources = $derived.by(() => {
        const marked = new Set<string>();
        if (!$uiState.experimentalFeatures) return marked;
        const flashed = $lastFlashed;
        for (const source of $availableSources) {
            if (!source.date) continue;
            const entry = flashed[source.src];
            if (!entry) continue;
            if (isNewerBuild(source.date, entry.date)) marked.add(source.src);
        }
        return marked;
    });

    // Get current repository description
    const currentRepoDesc = $derived(
        $availableSources.find((s: any) => s.src === $deviceSelection.source)?.desc || ''
    );

    // Handle source repository change
    function handleSourceChange(source: string) {
        deviceActions.setSource(source);
    }

    // Badge shows the base version only (variant-a4 mockups): v1.12.0.e738a74
    // .room-server → v1.12.0, v2.7.15.80e676a59.daily → v2.7.15, v1.18.0b2 stays
    // v1.18.0b2. Unknown formats fall through untouched.
    function formatVersion(version: string): string {
        const m = version.match(/^[vV]?\d+(?:\.\d+){1,2}[a-zA-Z0-9]*/);
        return m ? m[0] : version;
    }
</script>

<!-- Compact Source Repository Selection -->
<!-- Container query context for adaptive layout (@container) -->
<div class="@container w-full">
    <!-- Outer wrapper: column (narrow) / row (wide) -->
    <div class="flex flex-col gap-4 @2xl:flex-row @2xl:items-center">
        <!-- Label: heading above the rows (narrow) / left column (wide) -->
        <h2
            class="flex shrink-0 items-center gap-2 text-lg font-semibold text-orange-200
                   @xl:text-xl
                   @2xl:w-[102px] @2xl:gap-1 @2xl:text-[0.68rem] @2xl:leading-tight
                   @4xl:w-[150px] @4xl:gap-1.5 @4xl:text-[0.8rem]"
        >
            <span class="shrink-0" class:animate-spin={$loadingState.isLoadingAvailable}>🌐</span>
            <span class="@2xl:flex-1 @2xl:text-center">
                {$locales('page.source_repository')}
            </span>
        </h2>

        <!-- Group rows + description: everything to the right of / below the label -->
        <div class="min-w-0 flex-1 space-y-3">
            {#each sourceGroups as group, groupIndex (group.type)}
                <div
                    class="flex items-center gap-2"
                    role="group"
                    aria-label={$locales(group.titleKey)}
                >
                    <!-- Group subtitle (left on the row); fixed width keeps both
                         rows' buttons left-aligned despite different name lengths -->
                    <span
                        class="w-28 shrink-0 text-xs font-bold tracking-wider text-gray-400 uppercase"
                    >
                        {$locales(group.titleKey)}
                    </span>
                    <!-- One row per group: never wraps, scrolls horizontally -->
                    <div
                        class="repo-row flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto"
                    >
                        {#each group.sources as source (source.src)}
                            <button
                                type="button"
                                onclick={() => handleSourceChange(source.src)}
                                class:selected={$deviceSelection.source === source.src}
                                class:hasnew={newVersionSources.has(source.src)}
                                class="shrink-0 rounded-md px-3 @4xl:px-1.5 @6xl:px-3 py-1.5 text-sm transition-colors
                                       {$deviceSelection.source === source.src
                                    ? 'border-orange-500 bg-orange-600 text-white shadow-sm'
                                    : 'border-gray-600 bg-gray-700 text-orange-300 hover:bg-gray-600 hover:text-orange-200'}
                                       border text-xs font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                            >
                                {source.src}{#if newVersionSources.has(source.src)}
                                    <span class="repo-dot" aria-hidden="true"></span>
                                {/if}{#if source.last_version}
                                    <span
                                        class="ver hidden @2xl:inline {$deviceSelection.source ===
                                        source.src
                                            ? 'opacity-90'
                                            : 'opacity-75'}">· {formatVersion(source.last_version)}</span
                                    >
                                {/if}
                            </button>
                        {/each}
                    </div>
                    <!-- Stats button: right end of the last group row -->
                    {#if groupIndex === sourceGroups.length - 1 && showStatsButton}
                        <button
                            type="button"
                            onclick={onOpenStats}
                            class="ml-auto shrink-0 rounded-md border border-gray-600 bg-gray-700 p-1.5 text-orange-300 transition-colors hover:bg-gray-600 hover:text-orange-200 focus:ring-1 focus:ring-orange-500 focus:outline-none"
                            title={$locales('stats.open_stats')}
                            aria-label={$locales('stats.open_stats')}
                        >
                            <svg
                                class="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                            </svg>
                        </button>
                    {/if}
                </div>
            {/each}

            <!-- Repository Description -->
            {#if currentRepoDesc}
                <!-- ml aligns with repo buttons: group subtitle w-28 (7rem) + gap-2 -->
                <div class="ml-[7.5rem] max-w-md text-left text-xs text-orange-300">
                    <MarkdownRenderer source={currentRepoDesc} wrapperClass="" />
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    /* Custom styles for repository selector */
    button {
        min-width: fit-content;
        white-space: nowrap;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Hover effects for better UX */
    button:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    button:not(:disabled):active {
        transform: translateY(0);
    }

    /* Focus styles for accessibility */
    button:focus-visible {
        outline: 2px solid #fb923c;
        outline-offset: 2px;
    }

    /* Version badge (T-151): "· vX.Y.Z" after the name in one capsule; hidden on
       narrow containers (variant-a4-640/430). Opacity per mockup: 0.75 normal /
       0.9 selected (utilities in the template). */
    .ver {
        margin-left: 5px; /* mockup pill gap: 6px incl. separator spacing */
        font-weight: 400;
    }

    /* New-version marker (T-153): green dot + soft border tint, verbatim from the
       approved variant-a4 mockups. Not tied to container width (variant-a4-640). */
    .repo-dot {
        display: inline-block;
        margin-left: 5px; /* spacing without relying on template whitespace */
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.15);
        flex-shrink: 0;
    }

    button.hasnew {
        border-color: rgba(74, 222, 128, 0.55);
    }

    button.hasnew .ver {
        color: #4ade80;
        opacity: 1;
    }

    button.hasnew.selected .ver {
        color: #bbf7d0;
    }

    /* Group row: horizontal scroll fallback (rows never wrap to a second line) */
    .repo-row {
        scrollbar-width: none;
    }

    .repo-row::-webkit-scrollbar {
        display: none;
    }

    /* Loading state improvements */
    .animate-spin {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
