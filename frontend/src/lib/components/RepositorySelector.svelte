<script lang="ts">
  import { deviceSelection, availableFirmwares } from '$lib/stores';
  import { deviceActions } from '$lib/stores.ts';

  // Subscribe to stores
  $: deviceSelectionStore = $deviceSelection;
  $: availableFirmwaresStore = $availableFirmwares;

  // Get current repository description
  $: currentRepoDesc = availableFirmwaresStore.srcs?.find(s => s.src === deviceSelectionStore.source)?.desc || '';

  // Handle source repository change
  function handleSourceChange(source: string) {
    deviceActions.setSource(source);
  }
</script>

<!-- Compact Source Repository Selection -->
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      {#each availableFirmwaresStore.srcs as source}
        <button
          type="button"
          on:click={() => handleSourceChange(source.src)}
          class="px-3 py-1.5 text-sm rounded-md transition-colors {
            deviceSelectionStore.source === source.src
              ? 'bg-orange-600 text-white border-orange-500 shadow-sm'
              : 'bg-gray-700 text-orange-300 border-gray-600 hover:bg-gray-600 hover:text-orange-200'
          } border focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs font-medium"
          title="{source.desc}"
        >
          {source.src}
        </button>
      {/each}
    </div>

    <!-- Repository Description -->
    {#if currentRepoDesc}
      <div class="text-xs text-orange-300 italic text-left max-w-md">
        {currentRepoDesc}
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