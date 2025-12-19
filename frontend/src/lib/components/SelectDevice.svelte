<script lang="ts">
    import { deviceSelection, availableFirmwares, versionsData, allDevicesFlat, allDevicesWithCategories,
         selectionState, availableDevicesForSelection, availableVersionsForSelection } from '$lib/stores';
  import { deviceActions, selectionActions } from '$lib/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { DeviceType } from '$lib/types.js';
  import { DEVICE_GROUP_LABELS } from '$lib/utils/deviceTypeUtils.js';
  import type { DeviceCategoryType } from '$lib/types.ts';
  import { _ as locales } from 'svelte-i18n';

  // Local state
  let deviceFilter = '';
  let showDropdown = false;
  let selectedIndex = -1;
  let savedFilter = ''; // Save filter value to restore if dropdown is cancelled
  let isFiltering = false; // Track if user is actively filtering vs just opening dropdown

  // Version selector state
  let showVersionDropdown = false;
  let selectedVersionIndex = -1;

  // Subscribe to stores - NEW: Use unified stores
  $: deviceSelectionStore = $deviceSelection;
  $: availableFirmwaresStore = $availableFirmwares;
  $: versionsDataStore = $versionsData;

  // NEW: Unified selection state
  $: selectionStateStore = $selectionState;
  $: availableDevicesForSelectionStore = $availableDevicesForSelection;
  $: availableVersionsForSelectionStore = $availableVersionsForSelection;

  // Legacy compatibility (can be removed later)
  $: allDevices = $allDevicesFlat;
  // New derived states based on unified selectionState
  $: deviceSelected = $selectionState.device !== null;
  $: versionSelected = $selectionState.version !== null;

  // Clear filter when device type is reset to null
  $: if (deviceSelectionStore.devicePioTarget === null) {
    deviceFilter = '';
    showDropdown = false;
    selectedIndex = -1;
  }

  // Filter devices based on search input
  $: filteredDevices = deviceFilter
    ? allDevices.filter((device: {device: string; category: DeviceCategoryType; displayName: string}) =>
        device.displayName.toLowerCase().includes(deviceFilter.toLowerCase()) ||
        device.device.toLowerCase().includes(deviceFilter.toLowerCase())
      )
    : allDevices;

  // Group filtered devices by category
  $: filteredDevicesByCategory = {
    esp: filteredDevices.filter((d: {device: string; category: string}) => d.category === 'esp'),
    uf2: filteredDevices.filter((d: {device: string; category: string}) => d.category === 'uf2'),
    rp2040: filteredDevices.filter((d: {device: string; category: string}) => d.category === 'rp2040')
  };

  // FIX: Unified reactive statement for auto-version selection
  $: if (selectionStateStore.device && availableVersionsForSelectionStore.length > 0) {
    if (!selectionStateStore.version || !availableVersionsForSelectionStore.includes(selectionStateStore.version)) {
      // Auto-select latest version (first in array as server returns sorted descending)
      selectionActions.setVersion(availableVersionsForSelectionStore[0]);
    }
  }

  $: if (deviceSelectionStore.devicePioTarget && !isFiltering) {
   deviceFilter = getDeviceDisplayName(deviceSelectionStore.devicePioTarget);
  }
  
  // Handle device selection from dropdown
  function selectDevice(device: {device: string; displayName: string}) {
    deviceFilter = device.displayName;
    isFiltering = false; // Reset filtering flag since we made a selection
    manageDeviceDropdown('close', { restoreFilter: false }); // Don't restore filter since we made a selection

    // FIX: Use unified selection actions with cascade validation
    selectionActions.setDevice(device.device);
  }

  // Handle input change
  function handleInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    deviceFilter = input.value;
    isFiltering = true; // Mark this as a filtering action
    showDropdown = true;
    selectedIndex = -1;
  }

  // Handle input focus - show all devices
  function handleInputFocus() {
    openDropdown(false); // Don't save filter on focus
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
            if (selectedVersionIndex < versionsDataStore.versions.length - 1) {
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
              selectedVersionIndex = versionsDataStore.versions.length - 1;
            }
            break;
          case 'Enter':
            event.preventDefault();
            if (selectedVersionIndex >= 0 && versionsDataStore.versions[selectedVersionIndex]) {
              selectVersion(versionsDataStore.versions[selectedVersionIndex]);
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
    selectedIndex = -1;
    deviceActions.setDeviceDirectly(null);
  }

  // Simplified dropdown management using new utilities
  function manageDeviceDropdown(action: 'open' | 'close' | 'toggle', options?: any) {
    switch (action) {
      case 'open':
        showDropdown = true;
        selectedIndex = -1;
        isFiltering = false;
        if (options?.saveFilter && deviceFilter && deviceSelected) {
          savedFilter = deviceFilter;
        } else {
          savedFilter = '';
        }
        deviceFilter = '';
        break;

      case 'close':
        showDropdown = false;
        selectedIndex = -1;
        if (options?.restoreFilter && !isFiltering) {
          restoreFilterIfNeeded();
        }
        isFiltering = false;
        break;

      case 'toggle':
        if (showDropdown) {
          manageDeviceDropdown('close');
        } else {
          manageDeviceDropdown('open', { saveFilter: true });
        }
        break;
    }
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

  // Helper functions for filter management
  function restoreFilterIfNeeded() {
    if (savedFilter) {
      deviceFilter = savedFilter;
    }
  }

  function openDropdown(saveFilter = false) {
    manageDeviceDropdown('open', { saveFilter });
  }

  function closeDropdown(restoreFilter = true) {
    manageDeviceDropdown('close', { restoreFilter });
  }

  // Toggle dropdown
  function toggleDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    manageDeviceDropdown('toggle');
  }

  // Universal click outside handler
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Close device dropdown when clicking outside
    if (!target.closest('#device-combobox') && !target.closest('.dropdown-list')) {
      manageDeviceDropdown('close');
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
        manageDeviceDropdown('close');
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
    return availableFirmwaresStore.device_names[devicePioTarget] || devicePioTarget;
  }

  // Get version display text with validation
  function getVersionDisplayText(version: string): string {
    // NEW: Protect against invalid versions
    if (!version || !availableVersionsForSelectionStore.includes(version)) {
      return '';
    }
    let displayText = version;
    return displayText;
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
        value={deviceFilter}
        on:input={handleInputChange}
        on:focus={handleInputFocus}
        on:keydown={handleKeydown}
        class="w-full px-4 py-2 pr-20 bg-gray-800 border border-orange-600 rounded-md text-orange-100 placeholder-orange-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
      />

      <!-- Dropdown Arrow and Clear Button -->
      <div class="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
        {#if deviceFilter}
          <button
            type="button"
            on:click={clearFilter}
            class="text-orange-400 hover:text-orange-300 transition-colors p-1"
            title={$locales('selectdevice.clear_filter')}
          >
            ✕
          </button>
        {/if}
        <button
          type="button"
          on:click={toggleDropdown}
          class="text-orange-400 hover:text-orange-300 transition-colors p-1"
          title={$locales('selectdevice.toggle_dropdown')}
        >
          ▼
        </button>
      </div>

      <!-- Dropdown List -->
      {#if showDropdown && allDevices.length > 0}
        <div class="dropdown-list absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-orange-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
        {#if filteredDevices.length === 0 && deviceFilter}
          <div class="px-4 py-3 text-sm text-orange-300">
            {$locales('selectdevice.no_devices_match')}
          </div>
        {:else}
          <!-- Device Categories -->
          {#each [
            { key: 'esp', devices: filteredDevicesByCategory.esp, title: DEVICE_GROUP_LABELS[DeviceType.ESP32] },
            { key: 'uf2', devices: filteredDevicesByCategory.uf2, title: DEVICE_GROUP_LABELS[DeviceType.NRF52] },
            { key: 'rp2040', devices: filteredDevicesByCategory.rp2040, title: DEVICE_GROUP_LABELS[DeviceType.RP2040] }
          ] as { key: string; devices: any[]; title: string }[] as category, categoryIndex (categoryIndex)}
            {#if category.devices.length > 0}
              <div class="px-2 py-4 text-sm font-bold text-orange-300 bg-gray-700 border-b border-gray-600">
                {category.title}
              </div>
              {#each category.devices as device, i}
                <button
                  type="button"
                  class="w-full px-6 py-3 text-sm text-left hover:bg-gray-700 {selectedIndex === (categoryIndex === 0 ? i : categoryIndex === 1 ? filteredDevicesByCategory.esp.length + i : filteredDevicesByCategory.esp.length + filteredDevicesByCategory.uf2.length + i) ? 'bg-gray-700' : ''} text-orange-100 focus:bg-gray-700 focus:outline-none transition-colors"
                  on:click={() => selectDevice(device)}
                  on:mouseenter={() => selectedIndex = categoryIndex === 0 ? i : categoryIndex === 1 ? filteredDevicesByCategory.esp.length + i : filteredDevicesByCategory.esp.length + filteredDevicesByCategory.uf2.length + i}
                  on:focus={() => selectedIndex = categoryIndex === 0 ? i : categoryIndex === 1 ? filteredDevicesByCategory.esp.length + i : filteredDevicesByCategory.esp.length + filteredDevicesByCategory.uf2.length + i}
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

    <!-- Status Messages -->
    {#if allDevices.length === 0}
      <p class="text-sm text-orange-300">
        {$locales('selectdevice.no_devices_available')}
      </p>
    {:else if deviceFilter && filteredDevices.length > 0}
      <p class="text-xs text-orange-400">
        {$locales('selectdevice.found_devices', {values: { count: filteredDevices.length }})}
      </p>
    {/if}
  </div>

  <!-- {$locales('selectdevice.firmware_version')} Selection -->
  {#if deviceSelected}
    {#if versionsDataStore.versions.length > 0}
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
          value={selectionStateStore.version && availableVersionsForSelectionStore.includes(selectionStateStore.version)
      ? getVersionDisplayText(selectionStateStore.version)
      : (deviceSelectionStore.version ? getVersionDisplayText(deviceSelectionStore.version) : '')}
          on:input={handleVersionInputChange}
          on:click={handleVersionInputClick}
          on:keydown={(e) => handleDropdownKeydown(e, 'version')}
          class="w-full px-4 py-2 pr-10 bg-gray-800 border border-orange-600 rounded-md text-orange-100 placeholder-orange-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors cursor-pointer"
          readonly
        />

        <!-- Version Dropdown Arrow -->
        <div class="absolute right-2 top-1/2 transform -translate-y-1/2 z-20">
          <button
            type="button"
            on:click|stopPropagation={() => manageVersionDropdown('toggle')}
            class="text-orange-400 hover:text-orange-300 transition-colors p-1 pointer-events-auto"
            title={$locales('selectdevice.toggle_dropdown')}
          >
            ▼
          </button>
        </div>

        <!-- Version Dropdown List -->
        {#if showVersionDropdown}
          <div class="dropdown-list absolute z-10 w-full mt-1 bg-gray-800 border border-orange-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {#each versionsDataStore.versions as version, i}
              <button
                type="button"
                class="w-full px-4 py-2 text-sm text-left hover:bg-gray-700 {selectedVersionIndex === i ? 'bg-gray-700' : ''} text-orange-100 focus:bg-gray-700 focus:outline-none transition-colors"
                on:click={() => selectVersion(version)}
                on:mouseenter={() => selectedVersionIndex = i}
                on:focus={() => selectedVersionIndex = i}
              >
                {getVersionDisplayText(version)}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Version Notes -->
      {#if versionSelected && versionsDataStore.notes[deviceSelectionStore.version]}
        <div class="mt-2 p-3 bg-gray-800 border border-orange-600 rounded-md version-notes">
          <div class="text-sm text-orange-200 prose prose-invert prose-sm max-w-none">
            {@html versionsDataStore.notes[deviceSelectionStore.version]}
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
</style>