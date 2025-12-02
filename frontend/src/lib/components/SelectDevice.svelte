<script lang="ts">
    import { deviceSelection, availableFirmwares, versionsData, isDeviceSelected, isVersionSelected, allDevicesFlat, allDevicesWithCategories } from '$lib/stores';
  import { deviceActions } from '$lib/stores.ts';

  // Local state
  let deviceFilter = '';
  
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

  $: if (filteredDevices?.length > 0  && deviceFilter.length > 0) {
    deviceSelectionStore.deviceType = filteredDevices[0].device;
  }
  
  // Handle device type change (direct selection)
  function handleDeviceTypeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const deviceType = select.value;
    deviceActions.setDeviceDirectly(deviceType === '' ? null : deviceType);
  }

  // Handle filter change
  function handleFilterChange(event: Event) {
    const input = event.target as HTMLInputElement;
    deviceFilter = input.value;
  }

  // Handle version change
  function handleVersionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const version = select.value;
    deviceActions.setVersion(version === '' ? null : version);
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

  // Clear filter
  function clearFilter() {
    deviceFilter = '';
  }
</script>

<div class="space-y-6">
  <!-- Device Selection with Filter -->
  <div class="space-y-2">
    <label for="device-type" class="block text-sm font-medium text-orange-300">
        Device Type
    </label>
      <!-- Device Filter -->
    <div class="relative">
      <input
        type="text"
        placeholder="Filter devices..."
        value={deviceFilter}
        on:input={handleFilterChange}
        class="w-full px-4 py-2 bg-gray-800 border border-orange-600 rounded-md text-orange-100 placeholder-orange-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
      />
      {#if deviceFilter}
        <button
          type="button"
          on:click={clearFilter}
          class="absolute right-2 top-1/2 transform -translate-y-1/2 text-orange-400 hover:text-orange-300 transition-colors"
          title="Clear filter"
        >
          ✕
        </button>
      {/if}
    </div>

    <!-- Device Selection with Optgroups -->
    <select
      id="device-type"
      bind:value={deviceSelectionStore.deviceType}
      on:change={handleDeviceTypeChange}
      class="w-full px-4 py-2 bg-gray-800 border border-orange-600 rounded-md text-orange-100 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
    >
      <option value="">Select device type</option>

      <!-- ESP32 Devices Optgroup -->
      {#if filteredDevicesByCategory.esp.length > 0}
        <optgroup label="ESP32 devices">
          {#each filteredDevicesByCategory.esp as device}
            <option value={device.device}>{device.displayName}</option>
          {/each}
        </optgroup>
      {/if}

      <!-- NRF52 Devices Optgroup -->
      {#if filteredDevicesByCategory.uf2.length > 0}
        <optgroup label="NRF52 devices">
          {#each filteredDevicesByCategory.uf2 as device}
            <option value={device.device}>{device.displayName}</option>
          {/each}
        </optgroup>
      {/if}

      <!-- RP2040 Devices Optgroup -->
      {#if filteredDevicesByCategory.rp2040.length > 0}
        <optgroup label="RP2040 devices">
          {#each filteredDevicesByCategory.rp2040 as device}
            <option value={device.device}>{device.displayName}</option>
          {/each}
        </optgroup>
      {/if}
    </select>

    <!-- No devices available -->
    {#if allDevices.length === 0}
      <p class="text-sm text-orange-300">
        No devices available
      </p>
    {:else if deviceFilter && filteredDevices.length === 0}
      <p class="text-sm text-orange-300">
        No devices match your filter
      </p>
    {:else if deviceFilter}
      <p class="text-xs text-orange-400">
        Showing {filteredDevices.length} of {allDevices.length} devices
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
      <select
        id="firmware-version"
        bind:value={deviceSelectionStore.version}
        on:change={handleVersionChange}
        class="w-full px-4 py-2 bg-gray-800 border border-orange-600 rounded-md text-orange-100 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
      >
        <option value="">Select firmware version</option>
        {#each versionsDataStore.versions as version}
          <option value={version}>
            {getVersionDisplayText(version)}
          </option>
        {/each}
      </select>

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