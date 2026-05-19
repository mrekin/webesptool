<script lang="ts">
    import { deviceSelection, availableSources } from '$lib/stores.js';
    import { deviceActions } from '$lib/stores.js';
    import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

    // Subscribe to stores
    $: deviceSelectionStore = $deviceSelection;
    $: availableSourcesStore = $availableSources;

    // Get current repository description
    $: currentRepoDesc =
        availableSourcesStore.find((s: any) => s.src === deviceSelectionStore.source)?.desc || '';

    // Handle source repository change
    function handleSourceChange(source: string) {
        deviceActions.setSource(source);
    }
</script>

<!-- Compact Source Repository Selection -->
<div class="space-y-2">
    <div class="flex flex-wrap gap-2">
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
