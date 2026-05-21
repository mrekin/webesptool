<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { deviceSelection, availableSources, uiState } from '$lib/stores.js';
    import { deviceActions } from '$lib/stores.js';
    import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

    export let onOpenStats: (() => void) | undefined = undefined;

    // Subscribe to stores
    $: deviceSelectionStore = $deviceSelection;
    $: availableSourcesStore = $availableSources;
    $: experimentalFeatures = $uiState.experimentalFeatures;
    $: statsEnabled = $uiState.statsEnabled;

    // Get current repository description
    $: currentRepoDesc =
        availableSourcesStore.find((s: any) => s.src === deviceSelectionStore.source)?.desc || '';

    // Handle source repository change
    function handleSourceChange(source: string) {
        deviceActions.setSource(source);
    }
</script>

<!-- Compact Source Repository Selection -->
<div class="w-full space-y-2">
    <div class="flex w-full flex-wrap items-center gap-2">
        {#each availableSourcesStore as source}
            <button
                type="button"
                on:click={() => handleSourceChange((source as any).src)}
                class="rounded-md px-3 py-1.5 text-sm transition-colors {deviceSelectionStore.source ===
                (source as any).src
                    ? 'border-orange-500 bg-orange-600 text-white shadow-sm'
                    : 'border-gray-600 bg-gray-700 text-orange-300 hover:bg-gray-600 hover:text-orange-200'} border text-xs font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
            >
                {(source as any).src}
            </button>
        {/each}
        {#if statsEnabled && experimentalFeatures && onOpenStats}
            <button
                type="button"
                on:click={onOpenStats}
                class="ml-auto rounded-md border border-gray-600 bg-gray-700 p-1.5 text-orange-300 transition-colors hover:bg-gray-600 hover:text-orange-200 focus:ring-1 focus:ring-orange-500 focus:outline-none"
                title={$locales('stats.open_stats')}
            >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            </button>
        {/if}
    </div>

    <!-- Repository Description -->
    {#if currentRepoDesc}
        <div class="max-w-md text-left text-xs text-orange-300">
            <MarkdownRenderer source={currentRepoDesc} wrapperClass="" />
        </div>
    {/if}
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
</style>
