<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
  import { pinoutStore, deviceDisplayInfo } from '$lib/stores';
  import { mapDeviceToPinout, extractPinsFromVariant, getCategoryColor } from '$lib/utils/pinoutUtils';
  import type { PinInfo, PinCategory } from '$lib/types';
  import { onMount, onDestroy } from 'svelte';

  export let isOpen: boolean = false;
  export let onClose: () => void = () => {};
  export let devicePioTarget: string = '';

  let selectedPin: PinInfo | null = null;

  // Get board variant data
  $: boardVariant = (() => {
    const pinoutData = $pinoutStore.data;
    if (!pinoutData || !devicePioTarget) return null;

    const mapping = mapDeviceToPinout(devicePioTarget, pinoutData);
    if (!mapping) return null;

    return pinoutData.variants[mapping.board] || null;
  })();

  // Extract and filter pins
  $: allPins = boardVariant ? extractPinsFromVariant(boardVariant, $deviceDisplayInfo?.deviceType || null) : [];

  // Group pins by category
  $: pinsByCategory = (() => {
    const grouped: Record<string, PinInfo[]> = {};

    for (const pin of allPins) {
      if (!grouped[pin.category]) {
        grouped[pin.category] = [];
      }
      grouped[pin.category].push(pin);
    }

    return grouped;
  })();

  // Group pins for diagram display - split into two columns
  // Group identical pins by pinNumber and combine their names
  // Exclude negative pins from diagram (but show in peripherals list)
  $: diagramPins = (() => {
    const pinGroups = new Map<string, PinInfo[]>();

    // Group pins by pinNumber, only include non-negative pins
    for (const pin of allPins) {
      // Extract numeric value from pinNumber (handles both "10", "P1.04", and "-1" formats)
      let numericValue: number;

      // Handle NRF52 format (P1.04)
      if (pin.pinNumber.startsWith('P')) {
        const match = pin.pinNumber.match(/P(\d+)\.(\d+)/);
        if (match) {
          const port = parseInt(match[1]);
          const pin = parseInt(match[2]);
          numericValue = port * 32 + pin;
        } else {
          numericValue = parseInt(pin.pinNumber);
        }
      } else {
        // Simple decimal number (could be negative)
        numericValue = parseInt(pin.pinNumber);
      }

      // Skip negative pins (-1, -2, etc.) for diagram
      if (numericValue < 0 || isNaN(numericValue)) continue;

      if (!pinGroups.has(pin.pinNumber)) {
        pinGroups.set(pin.pinNumber, []);
      }
      pinGroups.get(pin.pinNumber)!.push(pin);
    }

    // Convert to array and sort by numeric pin number
    const groupedPins = Array.from(pinGroups.entries()).map(([pinNumber, pins]) => ({
      pinNumber,
      pins,
      // Get first pin's properties for display
      category: pins[0].category,
      description: pins[0].description,
      // Combine names if multiple pins share the same number
      name: pins.length > 1 ? pins.map(p => p.name).join(', ') : pins[0].name
    }));

    // Sort by numeric pin number
    groupedPins.sort((a, b) => {
      const numA = parseInt(a.pinNumber.replace(/\D/g, '') || a.pinNumber);
      const numB = parseInt(b.pinNumber.replace(/\D/g, '') || b.pinNumber);
      return numA - numB;
    });

    // Split into left and right columns
    const midPoint = Math.ceil(groupedPins.length / 2);
    return {
      left: groupedPins.slice(0, midPoint),
      right: groupedPins.slice(midPoint)
    };
  })();

  // Calculate total text lines in a column (each pin in a group = 1 line)
  $: totalLinesInColumn = (groups: typeof diagramPins.left) => {
    return groups.reduce((total, group) => total + group.pins.length, 0);
  };

  // MCU height: padding (1.5rem top + 1.5rem bottom = 3rem) + lines * 1rem + spacing
  $: mcuHeight = 3 + Math.max(totalLinesInColumn(diagramPins.left), totalLinesInColumn(diagramPins.right)) * 1.5;

  // Mobile MCU height: based on total number of pins (left + right)
  $: mobileMcuHeight = 3 + [...diagramPins.left, ...diagramPins.right].length * 1.5;

  // Auto-scale for medium layout (600px-1024px)
  let mediumContainer: HTMLDivElement;
  let mediumScale = 1;
  let resizeObserver: ResizeObserver | null = null;

  function updateMediumScale() {
    if (!mediumContainer) return;
    const containerWidth = mediumContainer.offsetWidth;
    // MCU layout width: 32px (center) + 192px (left pins) + 192px (right pins) = 416px
    const layoutWidth = 416;
    mediumScale = Math.min(1, containerWidth / layoutWidth);
  }

  // Set up ResizeObserver when component mounts
  onMount(() => {
    if (typeof window !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateMediumScale());
    }
  });

  // Clean up on destroy
  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  // Observe container when it changes
  $: if (mediumContainer && resizeObserver) {
    resizeObserver.observe(mediumContainer);
    updateMediumScale();
  }

  // Handle keyboard close
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto"
    on:keydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="pinout-modal-title"
    tabindex="-1"
  >
    <div class="min-h-full flex items-center justify-center">
      <div class="w-full max-w-6xl max-h-screen overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50 my-4">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-700 p-6 sticky top-0 bg-gray-800 z-10">
        <div>
          <h2 id="pinout-modal-title" class="text-xl font-semibold text-orange-200">
            {$locales('pinout.title')}
          </h2>
          {#if boardVariant}
            <p class="text-sm text-gray-400 mt-1">
              {devicePioTarget} ({boardVariant.family})
            </p>
          {/if}
        </div>
        <button
          on:click={onClose}
          class="text-gray-400 transition-colors hover:text-gray-200 text-2xl"
          aria-label="Close modal"
        >
          ✕
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        {#if !boardVariant}
          <div class="text-center text-orange-300 py-12">
            {$locales('pinout.no_data')}
          </div>
        {:else}
          <!-- Diagram Section -->
          <div class="bg-gray-900 rounded-lg p-8 border border-gray-700">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <!-- Left Side: MCU with pins -->
              <div class="space-y-4">
                <h3 class="text-lg font-medium text-orange-300 mb-6">
                  {$locales('pinout.diagram')}
                </h3>

                <!-- Desktop (>1024px): Horizontal MCU layout -->
                <div class="hidden lg:flex items-center justify-center mb-6">
                  <div class="relative">
                    <div class="w-32 bg-gray-700 border-4 border-orange-500 rounded-lg flex items-center justify-center py-6" style="min-height: {mcuHeight}rem;">
                      <div class="text-center">
                        <div class="text-orange-400 font-bold text-sm">{boardVariant.family.toUpperCase()}</div>
                      </div>
                    </div>

                    <!-- Left pins -->
                    <div class="absolute -left-48 top-0 h-full flex flex-col justify-between py-6">
                      {#each diagramPins.left as pinGroup}
                        {@const isSelected = pinGroup.pins.some(p => p.pinNumber === selectedPin?.pinNumber)}
                        <div class="flex items-center group">
                          <div class="w-32 text-right pr-1">
                            {#if pinGroup.pins.length > 1}
                              <div class="text-xs text-gray-400 space-y-0.5">
                                {#each pinGroup.pins as pin, index}
                                  <span class="block">{pin.name}</span>
                                {/each}
                              </div>
                            {:else}
                              <span class="text-xs text-gray-400">{pinGroup.name}</span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2">
                            <div class="w-12 h-0.5 {isSelected ? 'bg-orange-500' : 'bg-gray-600'} group-hover:{isSelected ? 'bg-orange-400' : 'bg-gray-500'} transition-colors"></div>
                            <div
                              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:scale-110 transition-transform {isSelected ? 'ring-2 ring-orange-300' : ''}"
                              style="background-color: {getCategoryColor(pinGroup.category)}"
                              on:click={() => selectedPin = pinGroup.pins[0]}
                              title="{pinGroup.name}: {pinGroup.description}"
                            >
                              {pinGroup.pinNumber}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>

                    <!-- Right pins -->
                    <div class="absolute -right-48 top-0 h-full flex flex-col justify-between py-6">
                      {#each diagramPins.right as pinGroup}
                        {@const isSelected = pinGroup.pins.some(p => p.pinNumber === selectedPin?.pinNumber)}
                        <div class="flex items-center group">
                          <div class="flex items-center gap-2">
                            <div
                              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:scale-110 transition-transform {isSelected ? 'ring-2 ring-orange-300' : ''}"
                              style="background-color: {getCategoryColor(pinGroup.category)}"
                              on:click={() => selectedPin = pinGroup.pins[0]}
                              title="{pinGroup.name}: {pinGroup.description}"
                            >
                              {pinGroup.pinNumber}
                            </div>
                            <div class="w-12 h-0.5 {isSelected ? 'bg-orange-500' : 'bg-gray-600'} group-hover:{isSelected ? 'bg-orange-400' : 'bg-gray-500'} transition-colors"></div>
                          </div>
                          <div class="w-32 pl-1">
                            {#if pinGroup.pins.length > 1}
                              <div class="text-xs text-gray-400 space-y-0.5">
                                {#each pinGroup.pins as pin, index}
                                  <span class="block">{pin.name}</span>
                                {/each}
                              </div>
                            {:else}
                              <span class="text-xs text-gray-400">{pinGroup.name}</span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>

                <!-- Medium (640px-1024px): Centered MCU layout with auto-scale -->
                <div class="hidden sm:flex lg:hidden items-center justify-center mb-6 w-full" bind:this={mediumContainer}>
                  <div class="relative mx-auto" style="transform: scale({mediumScale}); transform-origin: center center;">
                    <div class="w-32 bg-gray-700 border-4 border-orange-500 rounded-lg flex items-center justify-center py-6" style="min-height: {mcuHeight}rem;">
                      <div class="text-center">
                        <div class="text-orange-400 font-bold text-sm">{boardVariant.family.toUpperCase()}</div>
                      </div>
                    </div>

                    <!-- Left pins -->
                    <div class="absolute -left-48 top-0 h-full flex flex-col justify-between py-6">
                      {#each diagramPins.left as pinGroup}
                        {@const isSelected = pinGroup.pins.some(p => p.pinNumber === selectedPin?.pinNumber)}
                        <div class="flex items-center group">
                          <div class="w-32 text-right pr-1">
                            {#if pinGroup.pins.length > 1}
                              <div class="text-xs text-gray-400 space-y-0.5">
                                {#each pinGroup.pins as pin, index}
                                  <span class="block">{pin.name}</span>
                                {/each}
                              </div>
                            {:else}
                              <span class="text-xs text-gray-400">{pinGroup.name}</span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2">
                            <div class="w-12 h-0.5 {isSelected ? 'bg-orange-500' : 'bg-gray-600'} group-hover:{isSelected ? 'bg-orange-400' : 'bg-gray-500'} transition-colors"></div>
                            <div
                              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:scale-110 transition-transform {isSelected ? 'ring-2 ring-orange-300' : ''}"
                              style="background-color: {getCategoryColor(pinGroup.category)}"
                              on:click={() => selectedPin = pinGroup.pins[0]}
                              title="{pinGroup.name}: {pinGroup.description}"
                            >
                              {pinGroup.pinNumber}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>

                    <!-- Right pins -->
                    <div class="absolute -right-48 top-0 h-full flex flex-col justify-between py-6">
                      {#each diagramPins.right as pinGroup}
                        {@const isSelected = pinGroup.pins.some(p => p.pinNumber === selectedPin?.pinNumber)}
                        <div class="flex items-center group">
                          <div class="flex items-center gap-2">
                            <div
                              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:scale-110 transition-transform {isSelected ? 'ring-2 ring-orange-300' : ''}"
                              style="background-color: {getCategoryColor(pinGroup.category)}"
                              on:click={() => selectedPin = pinGroup.pins[0]}
                              title="{pinGroup.name}: {pinGroup.description}"
                            >
                              {pinGroup.pinNumber}
                            </div>
                            <div class="w-12 h-0.5 {isSelected ? 'bg-orange-500' : 'bg-gray-600'} group-hover:{isSelected ? 'bg-orange-400' : 'bg-gray-500'} transition-colors"></div>
                          </div>
                          <div class="w-32 pl-1">
                            {#if pinGroup.pins.length > 1}
                              <div class="text-xs text-gray-400 space-y-0.5">
                                {#each pinGroup.pins as pin, index}
                                  <span class="block">{pin.name}</span>
                                {/each}
                              </div>
                            {:else}
                              <span class="text-xs text-gray-400">{pinGroup.name}</span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>

                <!-- Mobile (<640px): Vertical layout with MCU on left, pins on right -->
                <div class="sm:hidden flex flex-row w-full">
                  <!-- MCU Rectangle on the left -->
                  <div class="w-16 bg-gray-700 border-4 border-orange-500 rounded-lg flex items-center justify-center py-4 flex-shrink-0"
                       style="min-height: {mobileMcuHeight}rem;">
                    <div class="text-center">
                      <div class="text-orange-400 font-bold text-xs leading-tight">
                        {boardVariant.family.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <!-- All pins in one column on the right -->
                  <div class="flex-1 flex flex-col gap-2 -ml-[1.125rem]">
                    {#each [...diagramPins.left, ...diagramPins.right] as pinGroup}
                      {@const isSelected = pinGroup.pins.some(p => p.pinNumber === selectedPin?.pinNumber)}
                      <div class="flex items-center gap-2 group">
                        <!-- Pin circle -->
                        <div
                          class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:scale-110 transition-transform flex-shrink-0 {isSelected ? 'ring-2 ring-orange-300' : ''}"
                          style="background-color: {getCategoryColor(pinGroup.category)}"
                          on:click={() => selectedPin = pinGroup.pins[0]}
                          title="{pinGroup.name}: {pinGroup.description}"
                        >
                          {pinGroup.pinNumber}
                        </div>

                        <!-- Connector line -->
                        <div class="w-4 h-0.5 {isSelected ? 'bg-orange-500' : 'bg-gray-600'} group-hover:{isSelected ? 'bg-orange-400' : 'bg-gray-500'} transition-colors"></div>

                        <!-- Pin names -->
                        <div class="flex-1 min-w-0">
                          {#if pinGroup.pins.length > 1}
                            <div class="text-sm text-gray-300 space-y-0.5">
                              {#each pinGroup.pins as pin}
                                <span class="block truncate" title="{pin.name}">{pin.name}</span>
                              {/each}
                            </div>
                          {:else}
                            <span class="text-sm text-gray-300 block truncate" title="{pinGroup.name}">
                              {pinGroup.name}
                            </span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Right Side: Peripherals legend -->
              <div class="space-y-3">
                <h4 class="text-md font-medium text-orange-300 mb-3">{$locales('pinout.peripherals')}</h4>

                <!-- Peripherals by category -->
                {#each Object.entries(pinsByCategory) as [category, pins]}
                  <div class="bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <div class="flex items-center gap-2 mb-2">
                      <div
                        class="w-3 h-3 rounded-full"
                        style="background-color: {getCategoryColor(category as PinCategory)}"
                      ></div>
                      <span class="font-medium text-orange-200 text-sm capitalize">{category}</span>
                      <span class="text-gray-500 text-xs">({pins.length})</span>
                    </div>

                    <div class="flex flex-wrap gap-1">
                      {#each pins as pin}
                        <div
                          class="flex items-center gap-1.5 text-xs bg-gray-900 rounded px-2 py-1 cursor-pointer hover:bg-gray-700 transition-colors"
                          class:bg-orange-900={selectedPin?.pinNumber === pin.pinNumber}
                          on:click={() => selectedPin = pin}
                        >
                          <div
                            class="w-2 h-2 rounded-full flex-shrink-0"
                            style="background-color: {getCategoryColor(pin.category)}"
                          ></div>
                          <span class="font-medium text-gray-200">{pin.name}</span>
                          <span class="text-gray-500 ml-0.5">{pin.pinNumber}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex flex-col gap-4 border-t border-gray-700 p-6 sticky bottom-0 bg-gray-800">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-start gap-3 bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 flex-1">
            <svg class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
            <p class="text-sm text-blue-200">
              {$locales('pinout.disclaimer')}
            </p>
          </div>
          <button
            on:click={onClose}
            class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 flex-shrink-0"
          >
            {$locales('common.close')}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
{/if}
