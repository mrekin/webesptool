<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { pinoutStore, deviceDisplayInfo } from '$lib/stores';
    import {
        mapDeviceToPinout,
        extractPinsFromVariant,
        extractConfigsFromVariant,
        getCategoryColor
    } from '$lib/utils/pinoutUtils';
    import type { PinInfo, PinCategory, ConfigInfo } from '$lib/types';
    import { onMount, onDestroy } from 'svelte';

    export let isOpen: boolean = false;
    export let onClose: () => void = () => {};
    export let devicePioTarget: string = '';

    let currentTab: 'pins' | 'configs' = 'pins';
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
    $: allPins = boardVariant
        ? extractPinsFromVariant(boardVariant, $deviceDisplayInfo?.deviceType || null)
        : [];

    // Extract configs
    $: allConfigs = boardVariant ? extractConfigsFromVariant(boardVariant) : [];

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

    // Group configs by category
    $: configsByCategory = (() => {
        const grouped: Record<string, ConfigInfo[]> = {};

        for (const config of allConfigs) {
            if (!grouped[config.category]) {
                grouped[config.category] = [];
            }
            grouped[config.category].push(config);
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
            name: pins.length > 1 ? pins.map((p) => p.name).join(', ') : pins[0].name
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
    $: mcuHeight =
        3 +
        Math.max(totalLinesInColumn(diagramPins.left), totalLinesInColumn(diagramPins.right)) * 1.5;

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
        class="animate-fade-in fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
        on:keydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pinout-modal-title"
        tabindex="-1"
    >
        <div class="flex min-h-full items-center justify-center">
            <div
                class="my-4 max-h-screen w-full max-w-6xl overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
            >
                <!-- Header -->
                <div
                    class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 p-6"
                >
                    <div>
                        <h2 id="pinout-modal-title" class="text-xl font-semibold text-orange-200">
                            {$locales('pinout.title')}
                        </h2>
                        {#if boardVariant}
                            <p class="mt-1 text-sm text-gray-400">
                                {devicePioTarget} ({boardVariant.family})
                            </p>
                        {/if}
                    </div>
                    <button
                        on:click={onClose}
                        class="text-2xl text-gray-400 transition-colors hover:text-gray-200"
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>

                <!-- Content -->
                <div class="space-y-6 p-6">
                    {#if !boardVariant}
                        <div class="py-12 text-center text-orange-300">
                            {$locales('pinout.no_data')}
                        </div>
                    {:else}
                        <!-- Diagram Section -->
                        <div class="rounded-lg border border-gray-700 bg-gray-900 p-8">
                            <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
                                <!-- Left Side: MCU with pins -->
                                <div class="space-y-4">
                                    <h3 class="mb-6 text-lg font-medium text-orange-300">
                                        {$locales('pinout.diagram')}
                                    </h3>

                                    <!-- Desktop (>1024px): Horizontal MCU layout -->
                                    <div class="mb-6 hidden items-center justify-center lg:flex">
                                        <div class="relative">
                                            <div
                                                class="flex w-32 items-center justify-center rounded-lg border-4 border-orange-500 bg-gray-700 py-6"
                                                style="min-height: {mcuHeight}rem;"
                                            >
                                                <div class="text-center">
                                                    <div class="text-sm font-bold text-orange-400">
                                                        {boardVariant.family.toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Left pins -->
                                            <div
                                                class="absolute top-0 -left-48 flex h-full flex-col justify-between py-6"
                                            >
                                                {#each diagramPins.left as pinGroup}
                                                    {@const isSelected = pinGroup.pins.some(
                                                        (p) =>
                                                            p.pinNumber === selectedPin?.pinNumber
                                                    )}
                                                    <div class="group flex items-center">
                                                        <div class="w-32 pr-1 text-right">
                                                            {#if pinGroup.pins.length > 1}
                                                                <div
                                                                    class="space-y-0.5 text-xs text-gray-400"
                                                                >
                                                                    {#each pinGroup.pins as pin, index}
                                                                        <span class="block"
                                                                            >{pin.name}</span
                                                                        >
                                                                    {/each}
                                                                </div>
                                                            {:else}
                                                                <span class="text-xs text-gray-400"
                                                                    >{pinGroup.name}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                        <div class="flex items-center gap-2">
                                                            <div
                                                                class="h-0.5 w-12 {isSelected
                                                                    ? 'bg-orange-500'
                                                                    : 'bg-gray-600'} group-hover:{isSelected
                                                                    ? 'bg-orange-400'
                                                                    : 'bg-gray-500'} transition-colors"
                                                            ></div>
                                                            <button
                                                                class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-110 {isSelected
                                                                    ? 'ring-2 ring-orange-300'
                                                                    : ''} border-0 p-0"
                                                                style="background-color: {getCategoryColor(
                                                                    pinGroup.category
                                                                )}"
                                                                on:click={() =>
                                                                    (selectedPin =
                                                                        pinGroup.pins[0])}
                                                                title="{pinGroup.name}: {pinGroup.description}"
                                                                aria-label="{pinGroup.name}: {pinGroup.description}"
                                                            >
                                                                {pinGroup.pinNumber}
                                                            </button>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>

                                            <!-- Right pins -->
                                            <div
                                                class="absolute top-0 -right-48 flex h-full flex-col justify-between py-6"
                                            >
                                                {#each diagramPins.right as pinGroup}
                                                    {@const isSelected = pinGroup.pins.some(
                                                        (p) =>
                                                            p.pinNumber === selectedPin?.pinNumber
                                                    )}
                                                    <div class="group flex items-center">
                                                        <div class="flex items-center gap-2">
                                                            <button
                                                                class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-110 {isSelected
                                                                    ? 'ring-2 ring-orange-300'
                                                                    : ''} border-0 p-0"
                                                                style="background-color: {getCategoryColor(
                                                                    pinGroup.category
                                                                )}"
                                                                on:click={() =>
                                                                    (selectedPin =
                                                                        pinGroup.pins[0])}
                                                                title="{pinGroup.name}: {pinGroup.description}"
                                                                aria-label="{pinGroup.name}: {pinGroup.description}"
                                                            >
                                                                {pinGroup.pinNumber}
                                                            </button>
                                                            <div
                                                                class="h-0.5 w-12 {isSelected
                                                                    ? 'bg-orange-500'
                                                                    : 'bg-gray-600'} group-hover:{isSelected
                                                                    ? 'bg-orange-400'
                                                                    : 'bg-gray-500'} transition-colors"
                                                            ></div>
                                                        </div>
                                                        <div class="w-32 pl-1">
                                                            {#if pinGroup.pins.length > 1}
                                                                <div
                                                                    class="space-y-0.5 text-xs text-gray-400"
                                                                >
                                                                    {#each pinGroup.pins as pin, index}
                                                                        <span class="block"
                                                                            >{pin.name}</span
                                                                        >
                                                                    {/each}
                                                                </div>
                                                            {:else}
                                                                <span class="text-xs text-gray-400"
                                                                    >{pinGroup.name}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Medium (640px-1024px): Centered MCU layout with auto-scale -->
                                    <div
                                        class="mb-6 hidden w-full items-center justify-center sm:flex lg:hidden"
                                        bind:this={mediumContainer}
                                    >
                                        <div
                                            class="relative mx-auto"
                                            style="transform: scale({mediumScale}); transform-origin: center center;"
                                        >
                                            <div
                                                class="flex w-32 items-center justify-center rounded-lg border-4 border-orange-500 bg-gray-700 py-6"
                                                style="min-height: {mcuHeight}rem;"
                                            >
                                                <div class="text-center">
                                                    <div class="text-sm font-bold text-orange-400">
                                                        {boardVariant.family.toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Left pins -->
                                            <div
                                                class="absolute top-0 -left-48 flex h-full flex-col justify-between py-6"
                                            >
                                                {#each diagramPins.left as pinGroup}
                                                    {@const isSelected = pinGroup.pins.some(
                                                        (p) =>
                                                            p.pinNumber === selectedPin?.pinNumber
                                                    )}
                                                    <div class="group flex items-center">
                                                        <div class="w-32 pr-1 text-right">
                                                            {#if pinGroup.pins.length > 1}
                                                                <div
                                                                    class="space-y-0.5 text-xs text-gray-400"
                                                                >
                                                                    {#each pinGroup.pins as pin, index}
                                                                        <span class="block"
                                                                            >{pin.name}</span
                                                                        >
                                                                    {/each}
                                                                </div>
                                                            {:else}
                                                                <span class="text-xs text-gray-400"
                                                                    >{pinGroup.name}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                        <div class="flex items-center gap-2">
                                                            <div
                                                                class="h-0.5 w-12 {isSelected
                                                                    ? 'bg-orange-500'
                                                                    : 'bg-gray-600'} group-hover:{isSelected
                                                                    ? 'bg-orange-400'
                                                                    : 'bg-gray-500'} transition-colors"
                                                            ></div>
                                                            <button
                                                                class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-110 {isSelected
                                                                    ? 'ring-2 ring-orange-300'
                                                                    : ''} border-0 p-0"
                                                                style="background-color: {getCategoryColor(
                                                                    pinGroup.category
                                                                )}"
                                                                on:click={() =>
                                                                    (selectedPin =
                                                                        pinGroup.pins[0])}
                                                                title="{pinGroup.name}: {pinGroup.description}"
                                                                aria-label="{pinGroup.name}: {pinGroup.description}"
                                                            >
                                                                {pinGroup.pinNumber}
                                                            </button>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>

                                            <!-- Right pins -->
                                            <div
                                                class="absolute top-0 -right-48 flex h-full flex-col justify-between py-6"
                                            >
                                                {#each diagramPins.right as pinGroup}
                                                    {@const isSelected = pinGroup.pins.some(
                                                        (p) =>
                                                            p.pinNumber === selectedPin?.pinNumber
                                                    )}
                                                    <div class="group flex items-center">
                                                        <div class="flex items-center gap-2">
                                                            <button
                                                                class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-110 {isSelected
                                                                    ? 'ring-2 ring-orange-300'
                                                                    : ''} border-0 p-0"
                                                                style="background-color: {getCategoryColor(
                                                                    pinGroup.category
                                                                )}"
                                                                on:click={() =>
                                                                    (selectedPin =
                                                                        pinGroup.pins[0])}
                                                                title="{pinGroup.name}: {pinGroup.description}"
                                                                aria-label="{pinGroup.name}: {pinGroup.description}"
                                                            >
                                                                {pinGroup.pinNumber}
                                                            </button>
                                                            <div
                                                                class="h-0.5 w-12 {isSelected
                                                                    ? 'bg-orange-500'
                                                                    : 'bg-gray-600'} group-hover:{isSelected
                                                                    ? 'bg-orange-400'
                                                                    : 'bg-gray-500'} transition-colors"
                                                            ></div>
                                                        </div>
                                                        <div class="w-32 pl-1">
                                                            {#if pinGroup.pins.length > 1}
                                                                <div
                                                                    class="space-y-0.5 text-xs text-gray-400"
                                                                >
                                                                    {#each pinGroup.pins as pin, index}
                                                                        <span class="block"
                                                                            >{pin.name}</span
                                                                        >
                                                                    {/each}
                                                                </div>
                                                            {:else}
                                                                <span class="text-xs text-gray-400"
                                                                    >{pinGroup.name}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Mobile (<640px): Vertical layout with MCU on left, pins on right -->
                                    <div class="flex w-full flex-row sm:hidden">
                                        <!-- MCU Rectangle on the left -->
                                        <div
                                            class="flex w-16 flex-shrink-0 items-center justify-center rounded-lg border-4 border-orange-500 bg-gray-700 py-4"
                                            style="min-height: {mobileMcuHeight}rem;"
                                        >
                                            <div class="text-center">
                                                <div
                                                    class="text-xs leading-tight font-bold text-orange-400"
                                                >
                                                    {boardVariant.family.toUpperCase()}
                                                </div>
                                            </div>
                                        </div>

                                        <!-- All pins in one column on the right -->
                                        <div class="-ml-[1.125rem] flex flex-1 flex-col gap-2">
                                            {#each [...diagramPins.left, ...diagramPins.right] as pinGroup}
                                                {@const isSelected = pinGroup.pins.some(
                                                    (p) => p.pinNumber === selectedPin?.pinNumber
                                                )}
                                                <div class="group flex items-center gap-2">
                                                    <!-- Pin circle -->
                                                    <button
                                                        class="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-110 {isSelected
                                                            ? 'ring-2 ring-orange-300'
                                                            : ''} border-0 p-0"
                                                        style="background-color: {getCategoryColor(
                                                            pinGroup.category
                                                        )}"
                                                        on:click={() =>
                                                            (selectedPin = pinGroup.pins[0])}
                                                        title="{pinGroup.name}: {pinGroup.description}"
                                                        aria-label="{pinGroup.name}: {pinGroup.description}"
                                                    >
                                                        {pinGroup.pinNumber}
                                                    </button>

                                                    <!-- Connector line -->
                                                    <div
                                                        class="h-0.5 w-4 {isSelected
                                                            ? 'bg-orange-500'
                                                            : 'bg-gray-600'} group-hover:{isSelected
                                                            ? 'bg-orange-400'
                                                            : 'bg-gray-500'} transition-colors"
                                                    ></div>

                                                    <!-- Pin names -->
                                                    <div class="min-w-0 flex-1">
                                                        {#if pinGroup.pins.length > 1}
                                                            <div
                                                                class="space-y-0.5 text-sm text-gray-300"
                                                            >
                                                                {#each pinGroup.pins as pin}
                                                                    <span
                                                                        class="block truncate"
                                                                        title={pin.name}
                                                                        >{pin.name}</span
                                                                    >
                                                                {/each}
                                                            </div>
                                                        {:else}
                                                            <span
                                                                class="block truncate text-sm text-gray-300"
                                                                title={pinGroup.name}
                                                            >
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
                                    <!-- Tab navigation -->
                                    <div
                                        class="mb-3 flex items-center gap-2 border-b border-gray-700"
                                    >
                                        <button
                                            on:click={() => (currentTab = 'pins')}
                                            class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
                                            class:text-orange-300={currentTab === 'pins'}
                                            class:border-orange-500={currentTab === 'pins'}
                                            class:text-gray-400={currentTab !== 'pins'}
                                            class:border-transparent={currentTab !== 'pins'}
                                            class:hover:text-gray-200={currentTab !== 'pins'}
                                        >
                                            {$locales('pinout.peripherals')}
                                        </button>
                                        <button
                                            on:click={() => (currentTab = 'configs')}
                                            class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
                                            class:text-orange-300={currentTab === 'configs'}
                                            class:border-orange-500={currentTab === 'configs'}
                                            class:text-gray-400={currentTab !== 'configs'}
                                            class:border-transparent={currentTab !== 'configs'}
                                            class:hover:text-gray-200={currentTab !== 'configs'}
                                        >
                                            {$locales('pinout.configs')}
                                        </button>
                                    </div>

                                    <!-- Peripherals by category -->
                                    {#if currentTab === 'pins'}
                                        {#each Object.entries(pinsByCategory) as [category, pins]}
                                            <div
                                                class="rounded-lg border border-gray-700 bg-gray-800 p-3"
                                            >
                                                <div class="mb-2 flex items-center gap-2">
                                                    <div
                                                        class="h-3 w-3 rounded-full"
                                                        style="background-color: {getCategoryColor(
                                                            category as PinCategory
                                                        )}"
                                                    ></div>
                                                    <span
                                                        class="text-sm font-medium text-orange-200 capitalize"
                                                        >{category}</span
                                                    >
                                                    <span class="text-xs text-gray-500"
                                                        >({pins.length})</span
                                                    >
                                                </div>

                                                <div class="flex flex-wrap gap-1">
                                                    {#each pins as pin}
                                                        <button
                                                            class="flex cursor-pointer items-center gap-1.5 rounded border-0 bg-gray-900 px-2 py-1 text-left text-xs transition-colors hover:bg-gray-700"
                                                            class:bg-orange-900={selectedPin?.pinNumber ===
                                                                pin.pinNumber}
                                                            on:click={() => (selectedPin = pin)}
                                                            aria-label="{pin.name} ({pin.pinNumber})"
                                                        >
                                                            <div
                                                                class="h-2 w-2 flex-shrink-0 rounded-full"
                                                                style="background-color: {getCategoryColor(
                                                                    pin.category
                                                                )}"
                                                            ></div>
                                                            <span class="font-medium text-gray-200"
                                                                >{pin.name}</span
                                                            >
                                                            <span class="ml-0.5 text-gray-500"
                                                                >{pin.pinNumber}</span
                                                            >
                                                        </button>
                                                    {/each}
                                                </div>
                                            </div>
                                        {/each}
                                    {:else}
                                        <!-- Configs by category -->
                                        {#each Object.entries(configsByCategory) as [category, configs]}
                                            <div
                                                class="rounded-lg border border-gray-700 bg-gray-800 p-3"
                                            >
                                                <div class="mb-2 flex items-center gap-2">
                                                    <div
                                                        class="h-3 w-3 rounded-full"
                                                        style="background-color: {getCategoryColor(
                                                            category as PinCategory
                                                        )}"
                                                    ></div>
                                                    <span
                                                        class="text-sm font-medium text-orange-200 capitalize"
                                                        >{category}</span
                                                    >
                                                    <span class="text-xs text-gray-500"
                                                        >({configs.length})</span
                                                    >
                                                </div>

                                                <div class="space-y-1">
                                                    {#each configs as config}
                                                        <div
                                                            class="flex items-center gap-2 rounded bg-gray-900 px-2 py-1.5 text-xs"
                                                        >
                                                            <span
                                                                class="flex-1 font-medium text-gray-300"
                                                                >{config.name}</span
                                                            >
                                                            <span class="font-mono text-orange-400"
                                                                >{config.value}</span
                                                            >
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                        {/each}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Footer -->
                <div
                    class="sticky bottom-0 flex flex-col gap-4 border-t border-gray-700 bg-gray-800 p-6"
                >
                    <div class="flex items-center justify-between gap-4">
                        <div
                            class="flex flex-1 items-start gap-3 rounded-lg border border-blue-700/50 bg-blue-900/30 p-3"
                        >
                            <svg
                                class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                            <p class="text-sm text-blue-200">
                                {$locales('pinout.disclaimer')}
                            </p>
                        </div>
                        <button
                            on:click={onClose}
                            class="flex-shrink-0 rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
                        >
                            {$locales('common.close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}
