<script lang="ts">
    import {
        deviceSelection,
        availableFirmwares,
        versionsData,
        allDevicesFlat,
        selectionState,
        hasPinoutData,
        currentSource,
        firmwaresLoadedState
    } from '$lib/stores.js';
    import { deviceActions, selectionActions } from '$lib/stores.js';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { browser } from '$app/environment';
    import { DeviceType, RepositoryType } from '$lib/types.js';
    import { DEVICE_GROUP_LABELS } from '$lib/utils/deviceTypeUtils.js';
    import type { DeviceCategoryType } from '$lib/types.ts';
    import { _ as locales } from 'svelte-i18n';

    interface Props {
        onOpenPinoutModal?: () => void;
    }

    // Callback props
    let { onOpenPinoutModal = () => {} }: Props = $props();

    // Local state
    let deviceFilter = $state(''); // For filtering the dropdown list only
    let deviceInputValue = $state(''); // For displaying in the input field
    let showDropdown = $state(false);
    let selectedIndex = $state(-1);
    let isFiltering = $state(false); // Track if user is actively filtering vs just opening dropdown

    // Version selector state
    let showVersionDropdown = $state(false);
    let selectedVersionIndex = $state(-1);

    // Legacy compatibility (can be removed later)
    const allDevices = $derived($allDevicesFlat);
    // New derived states based on unified selectionState
    const deviceSelected = $derived($selectionState.device !== null);
    const versionSelected = $derived($selectionState.version !== null);

    // Clear input when device type is reset to null
    $effect(() => {
        if ($deviceSelection.devicePioTarget === null) {
            deviceFilter = '';
            deviceInputValue = '';
            showDropdown = false;
            selectedIndex = -1;
        }
    });

    // Update input value when device changes from store
    $effect(() => {
        const devicePioTarget = $deviceSelection.devicePioTarget;
        if (devicePioTarget && !isFiltering) {
            // Untracked: late device-names loading must not re-trigger this effect
            deviceInputValue = untrack(() => getDeviceDisplayName(devicePioTarget));
        }
    });

    // Filter devices based on search input
    const filteredDevices = $derived.by(() => {
        if (!deviceFilter) return allDevices;
        return allDevices.filter(
            (device: { device: string; category: DeviceCategoryType; displayName: string }) =>
                device.displayName.toLowerCase().includes(deviceFilter.toLowerCase()) ||
                device.device.toLowerCase().includes(deviceFilter.toLowerCase())
        );
    });

    // Group filtered devices by category
    const filteredDevicesByCategory = $derived.by(() => ({
        esp: filteredDevices.filter(
            (d: { device: string; category: string }) => d.category === 'esp'
        ),
        uf2: filteredDevices.filter(
            (d: { device: string; category: string }) => d.category === 'uf2'
        ),
        rp2040: filteredDevices.filter(
            (d: { device: string; category: string }) => d.category === 'rp2040'
        )
    }));

    // Auto-select latest version when versions are loaded for selected device
    $effect(() => {
        if ($selectionState.device && $versionsData.versions.length > 0) {
            if (
                !$selectionState.version ||
                !$versionsData.versions.includes($selectionState.version)
            ) {
                // Auto-select latest version (first in array as server returns sorted descending)
                selectionActions.setVersion($versionsData.versions[0]);
            }
        }
    });

    // Computed display value for input
    const versionDisplayValue = $derived(
        $selectionState.version ? getVersionDisplayText($selectionState.version) : ''
    );

    // Handle device selection from dropdown
    function selectDevice(device: { device: string; displayName: string }) {
        deviceInputValue = device.displayName;
        deviceFilter = '';
        isFiltering = false;
        showDropdown = false;
        selectedIndex = -1;

        // FIX: Use unified selection actions with cascade validation
        selectionActions.setDevice(device.device);
    }

    // Handle input change
    function handleInputChange(event: Event) {
        const input = event.target as HTMLInputElement;
        deviceFilter = input.value;
        deviceInputValue = input.value;
        isFiltering = true;
        showDropdown = true;
        selectedIndex = -1;
    }

    // Handle input focus - show all devices, keep input value, select all text
    function handleInputFocus(event: Event) {
        const input = event.target as HTMLInputElement;
        deviceFilter = ''; // Reset filter to show all devices
        showDropdown = true;
        selectedIndex = -1;
        isFiltering = false;

        // Select all text for easy replacement
        input.select();
    }

    // Handle version input click - toggle dropdown
    function handleVersionInputClick(event: Event) {
        event.stopPropagation();
        event.preventDefault();

        // Only toggle if dropdown is not already open
        if (!showVersionDropdown) {
            manageVersionDropdown('open');
        } else {
            manageVersionDropdown('close');
        }
    }

    // Universal keyboard navigation handler
    function handleDropdownKeydown(event: KeyboardEvent, dropdownType: 'device' | 'version') {
        switch (dropdownType) {
            case 'device':
                const visibleDevices = getVisibleDevices();
                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault();
                        if (selectedIndex < visibleDevices.length - 1) {
                            selectedIndex++;
                        } else {
                            selectedIndex = 0;
                        }
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        if (selectedIndex > 0) {
                            selectedIndex--;
                        } else {
                            selectedIndex = visibleDevices.length - 1;
                        }
                        break;
                    case 'Enter':
                        event.preventDefault();
                        if (selectedIndex >= 0 && visibleDevices[selectedIndex]) {
                            selectDevice(visibleDevices[selectedIndex]);
                        }
                        break;
                    case 'Escape':
                        closeDropdown();
                        break;
                }
                break;

            case 'version':
                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault();
                        if (selectedVersionIndex < $versionsData.versions.length - 1) {
                            selectedVersionIndex++;
                        } else {
                            selectedVersionIndex = 0;
                        }
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        if (selectedVersionIndex > 0) {
                            selectedVersionIndex--;
                        } else {
                            selectedVersionIndex = $versionsData.versions.length - 1;
                        }
                        break;
                    case 'Enter':
                        event.preventDefault();
                        if (
                            selectedVersionIndex >= 0 &&
                            $versionsData.versions[selectedVersionIndex]
                        ) {
                            selectVersion($versionsData.versions[selectedVersionIndex]);
                        }
                        break;
                    case 'Escape':
                        manageVersionDropdown('close');
                        break;
                }
                break;
        }
    }

    // Handle keyboard navigation (legacy for device dropdown)
    function handleKeydown(event: KeyboardEvent) {
        handleDropdownKeydown(event, 'device');
    }

    // Get visible devices for keyboard navigation
    function getVisibleDevices() {
        let result: any[] = [];
        if (filteredDevicesByCategory.esp.length > 0) {
            result = result.concat(filteredDevicesByCategory.esp);
        }
        if (filteredDevicesByCategory.uf2.length > 0) {
            result = result.concat(filteredDevicesByCategory.uf2);
        }
        if (filteredDevicesByCategory.rp2040.length > 0) {
            result = result.concat(filteredDevicesByCategory.rp2040);
        }
        return result;
    }

    // Clear filter
    function clearFilter() {
        deviceFilter = '';
        deviceInputValue = '';
        selectedIndex = -1;
        deviceActions.setDeviceDirectly(null);
    }

    // Toggle dropdown (show all devices)
    function toggleDropdown(event?: Event) {
        if (event) {
            event.stopPropagation();
        }
        if (showDropdown) {
            // Closing - just hide dropdown, keep input value as is
            showDropdown = false;
            selectedIndex = -1;
            isFiltering = false;
        } else {
            // Opening - reset filter, show all devices
            deviceFilter = '';
            showDropdown = true;
            selectedIndex = -1;
            isFiltering = false;
        }
    }

    // Close dropdown without losing input value
    function closeDropdown() {
        showDropdown = false;
        selectedIndex = -1;
        isFiltering = false;
        deviceFilter = ''; // Reset filter for next time
    }

    function manageVersionDropdown(action: 'open' | 'close' | 'toggle') {
        switch (action) {
            case 'open':
                showVersionDropdown = true;
                selectedVersionIndex = -1;
                break;

            case 'close':
                showVersionDropdown = false;
                selectedVersionIndex = -1;
                break;

            case 'toggle':
                showVersionDropdown = !showVersionDropdown;
                if (showVersionDropdown) {
                    selectedVersionIndex = -1;
                }
                break;
        }
    }

    // Universal click outside handler
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;

        // Close device dropdown when clicking outside
        if (!target.closest('#device-combobox') && !target.closest('.dropdown-list')) {
            closeDropdown();
        }

        // Close version dropdown when clicking outside
        if (!target.closest('#firmware-version') && !target.closest('.dropdown-list')) {
            manageVersionDropdown('close');
        }
    }

    // Global keyboard handler for ESC key
    function handleGlobalKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            // Close device dropdown if open
            if (showDropdown) {
                event.preventDefault();
                closeDropdown();
            }
            // Close version dropdown if open
            if (showVersionDropdown) {
                event.preventDefault();
                manageVersionDropdown('close');
            }
        }
    }

    // Add event listeners

    onMount(() => {
        if (browser) {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleGlobalKeydown);
        }
    });

    onDestroy(() => {
        if (browser) {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleGlobalKeydown);
        }
    });

    // Handle version change
    function handleVersionChange(event: Event) {
        const select = event.target as HTMLSelectElement;
        const version = select.value;
        deviceActions.setVersion(version === '' ? null : version);
    }

    // Handle version input change
    function handleVersionInputChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const version = input.value;
        deviceActions.setVersion(version === '' ? null : version);
    }

    // Handle version selection
    function selectVersion(version: string) {
        // FIX: Use unified selection action with validation
        selectionActions.setVersion(version);
        manageVersionDropdown('close');
    }

    // Get display name for device type
    function getDeviceDisplayName(devicePioTarget: string): string {
        return $availableFirmwares.device_names[devicePioTarget] || devicePioTarget;
    }

    // Get version display text
    function getVersionDisplayText(version: string): string {
        // Check if version exists and is in the actual versions list for current device
        if (!version || !$versionsData.versions.includes(version)) {
            return '';
        }
        return version;
    }
</script>

<div class="space-y-6">
    <!-- Combined Device Selector with Filter -->
    <div class="space-y-2">
        <label for="device-combobox" class="block text-sm font-medium text-orange-300">
            {$locales('selectdevice.device_type')}
        </label>

        <!-- Combined Input with Dropdown -->
        <div class="relative">
            <input
                id="device-combobox"
                type="text"
                placeholder={$locales('selectdevice.filter_placeholder')}
                value={deviceInputValue}
                oninput={handleInputChange}
                onfocus={handleInputFocus}
                onkeydown={handleKeydown}
                class="w-full rounded-md border border-orange-600 bg-gray-800 px-4 py-2 pr-20 text-orange-100 placeholder-orange-400 transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500"
            />

            <!-- Dropdown Arrow and Clear Button -->
            <div
                class="absolute top-1/2 right-2 flex -translate-y-1/2 transform items-center space-x-1"
            >
                {#if deviceInputValue}
                    <button
                        type="button"
                        onclick={clearFilter}
                        class="p-1 text-orange-400 transition-colors hover:text-orange-300"
                        title={$locales('selectdevice.clear_filter')}
                    >
                        ✕
                    </button>
                {/if}

                {#if $hasPinoutData && $deviceSelection.devicePioTarget && ($currentSource?.type === RepositoryType.MESHTASTIC || $currentSource?.type === RepositoryType.MESHCORE)}
                    <button
                        type="button"
                        onclick={onOpenPinoutModal}
                        class="p-1 text-orange-400 transition-colors hover:text-orange-300"
                        title={$locales('pinout.show_pinout')}
                    >
                        🪛
                    </button>
                {/if}

                <button
                    type="button"
                    onclick={toggleDropdown}
                    class="p-1 text-orange-400 transition-colors hover:text-orange-300"
                    title={$locales('selectdevice.toggle_dropdown')}
                >
                    ▼
                </button>
            </div>

            <!-- Dropdown List -->
            {#if showDropdown && allDevices.length > 0}
                <div
                    class="dropdown-list absolute right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-orange-600 bg-gray-800 shadow-lg"
                >
                    {#if filteredDevices.length === 0 && deviceFilter}
                        <div class="px-4 py-3 text-sm text-orange-300">
                            {$locales('selectdevice.no_devices_match')}
                        </div>
                    {:else}
                        <!-- Device Categories -->
                        {#each [{ key: 'esp', devices: filteredDevicesByCategory.esp, title: DEVICE_GROUP_LABELS[DeviceType.ESP32] }, { key: 'uf2', devices: filteredDevicesByCategory.uf2, title: DEVICE_GROUP_LABELS[DeviceType.NRF52] }, { key: 'rp2040', devices: filteredDevicesByCategory.rp2040, title: DEVICE_GROUP_LABELS[DeviceType.RP2040] }] as { key: string; devices: any[]; title: string }[] as category, categoryIndex (categoryIndex)}
                            {#if category.devices.length > 0}
                                <div
                                    class="border-b border-gray-600 bg-gray-700 px-2 py-4 text-sm font-bold text-orange-300"
                                >
                                    {category.title}
                                </div>
                                {#each category.devices as device, i (device.device)}
                                    <button
                                        type="button"
                                        class="w-full px-6 py-3 text-left text-sm hover:bg-gray-700 {selectedIndex ===
                                        (categoryIndex === 0
                                            ? i
                                            : categoryIndex === 1
                                              ? filteredDevicesByCategory.esp.length + i
                                              : filteredDevicesByCategory.esp.length +
                                                filteredDevicesByCategory.uf2.length +
                                                i)
                                            ? 'bg-gray-700'
                                            : ''} text-orange-100 transition-colors focus:bg-gray-700 focus:outline-none"
                                        onclick={() => selectDevice(device)}
                                        onmouseenter={() =>
                                            (selectedIndex =
                                                categoryIndex === 0
                                                    ? i
                                                    : categoryIndex === 1
                                                      ? filteredDevicesByCategory.esp.length + i
                                                      : filteredDevicesByCategory.esp.length +
                                                        filteredDevicesByCategory.uf2.length +
                                                        i)}
                                        onfocus={() =>
                                            (selectedIndex =
                                                categoryIndex === 0
                                                    ? i
                                                    : categoryIndex === 1
                                                      ? filteredDevicesByCategory.esp.length + i
                                                      : filteredDevicesByCategory.esp.length +
                                                        filteredDevicesByCategory.uf2.length +
                                                        i)}
                                    >
                                        {device.displayName}
                                    </button>
                                {/each}
                            {/if}
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Status Messages (shown only after the catalog request settled:
             flashing it earlier shrinks the card after load and clips a news
             row on the main page) -->
        {#if allDevices.length === 0 && $firmwaresLoadedState}
            <p class="text-sm text-orange-300">
                {$locales('selectdevice.no_devices_available')}
            </p>
        {:else if deviceFilter && filteredDevices.length > 0}
            <p class="text-xs text-orange-400">
                {$locales('selectdevice.found_devices', {
                    values: { count: filteredDevices.length }
                })}
            </p>
        {/if}
    </div>

    <!-- {$locales('selectdevice.firmware_version')} Selection -->
    {#if deviceSelected}
        {#if $versionsData.versions.length > 0}
            <div class="space-y-2">
                <label for="firmware-version" class="block text-sm font-medium text-orange-300">
                    {$locales('selectdevice.firmware_version')}
                </label>

                <!-- Custom Version Selector -->
                <div class="relative z-0">
                    <input
                        id="firmware-version"
                        type="text"
                        placeholder={$locales('selectdevice.version_placeholder')}
                        value={$selectionState.version
                            ? getVersionDisplayText($selectionState.version)
                            : ''}
                        oninput={handleVersionInputChange}
                        onclick={handleVersionInputClick}
                        onkeydown={(e) => handleDropdownKeydown(e, 'version')}
                        class="w-full cursor-pointer rounded-md border border-orange-600 bg-gray-800 px-4 py-2 pr-10 text-orange-100 placeholder-orange-400 transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500"
                        readonly
                    />

                    <!-- Version Dropdown Arrow -->
                    <div class="absolute top-1/2 right-2 z-20 -translate-y-1/2 transform">
                        <button
                            type="button"
                            onclick={(e) => {
                                e.stopPropagation();
                                manageVersionDropdown('toggle');
                            }}
                            class="pointer-events-auto p-1 text-orange-400 transition-colors hover:text-orange-300"
                            title={$locales('selectdevice.toggle_dropdown')}
                        >
                            ▼
                        </button>
                    </div>

                    <!-- Version Dropdown List -->
                    {#if showVersionDropdown}
                        <div
                            class="dropdown-list absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-orange-600 bg-gray-800 shadow-lg"
                        >
                            {#each $versionsData.versions as version, i (version)}
                                <button
                                    type="button"
                                    class="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 {selectedVersionIndex ===
                                    i
                                        ? 'bg-gray-700'
                                        : ''} text-orange-100 transition-colors focus:bg-gray-700 focus:outline-none"
                                    onclick={() => selectVersion(version)}
                                    onmouseenter={() => (selectedVersionIndex = i)}
                                    onfocus={() => (selectedVersionIndex = i)}
                                >
                                    {getVersionDisplayText(version)}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Version Notes -->
                {#if versionSelected && $versionsData.notes[$deviceSelection.version as any]}
                    <div class="mt-3 rounded-r-md border-l-4 border-orange-500 bg-gray-700/50 p-4">
                        <div class="flex items-start space-x-3">
                            <span class="flex-shrink-0 text-lg text-orange-400">ℹ️</span>
                            <div
                                class="prose prose-invert prose-sm prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 max-w-none text-sm text-orange-100"
                            >
                                {@html $versionsData.notes[$deviceSelection.version as any]}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <div class="space-y-2">
                <label for="firmware-version" class="block text-sm font-medium text-orange-300">
                    {$locales('selectdevice.firmware_version')}
                </label>
                <p class="text-sm text-orange-300">
                    {$locales('selectdevice.no_versions_available')}
                </p>
            </div>
        {/if}
    {/if}
</div>

<style>
    /* Softer text selection highlight */
    #device-combobox::selection {
        background-color: rgba(249, 115, 22, 0.3);
        color: inherit;
    }
</style>
