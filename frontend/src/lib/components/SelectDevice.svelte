<script lang="ts">
    import { deviceSelection, availableFirmwares, versionsData, isDeviceSelected, isVersionSelected, allDevicesFlat, allDevicesWithCategories } from '$lib/stores';
  import { deviceActions } from '$lib/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  // Local state
  let deviceFilter = '';
  let showDropdown = false;
  let selectedIndex = -1;

  // Version selector state
  let showVersionDropdown = false;
  let selectedVersionIndex = -1;

  // Subscribe to stores
  $: deviceSelectionStore = $deviceSelection;
  $: availableFirmwaresStore = $availableFirmwares;
  $: versionsDataStore = $versionsData;
  // Get devices with categories from store
  const devicesWithCategories = $allDevicesWithCategories;
  $: allDevices = $allDevicesFlat;
  $: deviceSelected = $isDeviceSelected;
  $: versionSelected = $isVersionSelected;

  // Filter devices based on search input
  $: filteredDevices = deviceFilter
    ? allDevices.filter((device: {device: string; category: 'esp' | 'uf2' | 'rp2040'; displayName: string}) =>
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

  $: if (versionsDataStore?.versions?.length > 0 && !deviceSelectionStore.version) {
     deviceActions.setVersion(versionsDataStore?.versions[0]);
  }
  // Handle device selection from dropdown
  function selectDevice(device: {device: string; displayName: string}) {
    deviceFilter = device.displayName;
    showDropdown = false;
    deviceActions.setDeviceDirectly(device.device);
    deviceActions.setVersion(null);
  }

  // Handle input change
  function handleInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    deviceFilter = input.value;
    showDropdown = true;
    selectedIndex = -1;
  }

  // Handle input focus - show all devices
  function handleInputFocus() {
    showDropdown = true;
    selectedIndex = -1;
    // Clear filter temporarily when focusing to show all devices
    if (deviceFilter && allDevices.some(d => d.displayName === deviceFilter)) {
      // If current filter matches a device exactly, clear it to show all devices
      deviceFilter = '';
    }
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
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
        showDropdown = false;
        selectedIndex = -1;
        break;
    }
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
  }

  // Toggle dropdown
  function toggleDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    showDropdown = !showDropdown;
    if (showDropdown) {
      selectedIndex = -1;
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('#device-combobox') && !target.closest('.dropdown-list')) {
      showDropdown = false;
      selectedIndex = -1;
    }
  }

  // Add click outside listener

  onMount(() => {
    if (browser) {
      document.addEventListener('click', handleClickOutside);
    }
  });

  onDestroy(() => {
    if (browser) {
      document.removeEventListener('click', handleClickOutside);
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
    deviceActions.setVersion(version);
    showVersionDropdown = false;
  }

  // Get display name for device type
  function getDeviceDisplayName(deviceType: string): string {
    return availableFirmwaresStore.device_names[deviceType] || deviceType;
  }

  // Get version display text
  function getVersionDisplayText(version: string): string {
    let displayText = version;
    return displayText;
  }
</script>

<div class="space-y-6">
  <!-- Combined Device Selector with Filter -->
  <div class="space-y-2">
    <label for="device-combobox" class="block text-sm font-medium text-orange-300">
        Device Type
    </label>

    <!-- Combined Input with Dropdown -->
    <div class="relative">
      <input
        id="device-combobox"
        type="text"
        placeholder="Type to filter or click to select..."
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
            title="Clear filter"
          >
            ✕
          </button>
        {/if}
        <button
          type="button"
          on:click={toggleDropdown}
          class="text-orange-400 hover:text-orange-300 transition-colors p-1"
          title="Toggle dropdown"
        >
          ▼
        </button>
      </div>
    </div>

    <!-- Dropdown List -->
    {#if showDropdown && allDevices.length > 0}
      <div class="dropdown-list absolute z-10 w-full mt-1 bg-gray-800 border border-orange-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
        {#if filteredDevices.length === 0 && deviceFilter}
          <div class="px-4 py-3 text-sm text-orange-300">
            No devices match your filter
          </div>
        {:else}
          <!-- Device Categories -->
          {#each [
            { key: 'esp', devices: filteredDevicesByCategory.esp, title: 'ESP32 DEVICES' },
            { key: 'uf2', devices: filteredDevicesByCategory.uf2, title: 'NRF52 DEVICES' },
            { key: 'rp2040', devices: filteredDevicesByCategory.rp2040, title: 'RP2040 DEVICES' }
          ] as category, categoryIndex}
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

    <!-- Status Messages -->
    {#if allDevices.length === 0}
      <p class="text-sm text-orange-300">
        No devices available
      </p>
    {:else if deviceFilter && filteredDevices.length > 0}
      <p class="text-xs text-orange-400">
        Found {filteredDevices.length} device{filteredDevices.length === 1 ? '' : 's'}
      </p>
    {/if}
  </div>

  <!-- Firmware Version Selection -->
  {#if deviceSelected}
    {#if versionsDataStore.versions.length > 0}
    <div class="space-y-2">
      <label for="firmware-version" class="block text-sm font-medium text-orange-300">
        Firmware Version
      </label>

      <!-- Custom Version Selector -->
      <div class="relative">
        <input
          id="firmware-version"
          type="text"
          placeholder="Select firmware version..."
          value={deviceSelectionStore.version ? getVersionDisplayText(deviceSelectionStore.version) : ''}
          on:input={handleVersionInputChange}
          on:focus={() => showVersionDropdown = true}
          class="w-full px-4 py-2 pr-10 bg-gray-800 border border-orange-600 rounded-md text-orange-100 placeholder-orange-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors cursor-pointer"
          readonly
        />

        <!-- Version Dropdown Arrow -->
        <div class="absolute right-2 top-1/2 transform -translate-y-1/2">
          <button
            type="button"
            on:click={() => showVersionDropdown = !showVersionDropdown}
            class="text-orange-400 hover:text-orange-300 transition-colors p-1"
            title="Toggle version dropdown"
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
        <div class="mt-2 p-3 bg-gray-800 border border-orange-600 rounded-md">
          <p class="text-sm text-orange-200">
            {versionsDataStore.notes[deviceSelectionStore.version]}
          </p>
        </div>
      {/if}
    </div>
    {:else}
    <div class="space-y-2">
      <label for="firmware-version" class="block text-sm font-medium text-orange-300">
        Firmware Version
      </label>
      <p class="text-sm text-orange-300">
        No versions available for this device
      </p>
    </div>
    {/if}
  {/if}



  </div>

<style>

  details summary::-webkit-details-marker {
    color: #fb923c;
  }

  details summary {
    list-style: none;
  }

  details summary::before {
    content: '▶';
    display: inline-block;
    margin-right: 0.5rem;
    transition: transform 0.2s;
  }

  details[open] summary::before {
    transform: rotate(90deg);
  }
</style>