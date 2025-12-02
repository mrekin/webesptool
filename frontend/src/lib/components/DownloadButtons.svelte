<script lang="ts">
  import { deviceSelection, loadingState, deviceNames } from '$lib/stores';
  import { apiActions } from '$lib/stores';
  import { apiService } from '$lib/api';
  import type { DownloadOption } from '$lib/types';

  // Local state
  let espWebToolsDialog: HTMLDialogElement;
  let showMoreOptions = false;
  let firmwareMode: 'update' | 'full' = 'update'; // update = режим 1, full = режим 2

  // Subscribe to stores
  $: deviceSelectionStore = $deviceSelection;
  $: isDownloading = $loadingState.isDownloading;
  $: deviceNamesStore = $deviceNames;

  // Available download options based on device type
  $: downloadOptions = getDownloadOptions(deviceSelectionStore.deviceType, deviceSelectionStore.category);

  // Debug: Log device type and options
  $: {
    if (deviceSelectionStore.deviceType) {
      console.log('Device type:', deviceSelectionStore.deviceType);
      console.log('Download options:', downloadOptions);
      console.log('Is ESP device:', deviceSelectionStore.category === 'esp');
    }
  }

  function getDownloadOptions(deviceType: string | null, category: 'esp' | 'uf2' | 'rp2040' | null): DownloadOption[] {
    if (!deviceType) return [];

    const options: DownloadOption[] = [];

    // ESP32 devices get ESP Web Tools (primary button) and firmware mode selector
    if (category === 'esp') {
      options.push({
        id: 'esptool',
        label: firmwareMode === 'full' ? 'Full Flash Device' : 'Update Device',
        mode: firmwareMode === 'full' ? '2' : '1', // 2=full, 1=update
        available: true,
        icon: '🔧',
        description: firmwareMode === 'full' ? 'Complete firmware wipe and reinstall' : 'Update existing firmware'
      });
    }

    // UF2 downloads for NRF52 and RP2040 devices
    if (category === 'uf2') {
      options.push({
        id: 'uf2',
        label: 'Download UF2',
        mode: '1',
        available: true,
        icon: '💾',
        description: 'Download UF2 firmware file for manual installation'
      });

      options.push({
        id: 'ota',
        label: 'Download OTA',
        mode: '4',
        available: true,
        icon: '💾',
        description: 'Download OTA firmware file for update over-the-air'
      });
    }

    // UF2 downloads for RP2040 devices
    if (category === 'rp2040') {
      options.push({
        id: 'uf2',
        label: 'Download UF2',
        mode: '1',
        available: true,
        icon: '💾',
        description: 'Download UF2 firmware file for manual installation'
      });
    }

    // Add firmware zip download option for all devices
    options.push({
      id: 'fwzip',
      label: 'Download Firmware ZIP',
      mode: '5',
      available: true,
      icon: '📦',
      description: 'Download complete firmware archive for manual installation'
    });    

    return options;
  }

  // Initialize ESP Web Tools button
  $: if (deviceSelectionStore.category === 'esp' && deviceSelectionStore.version) {
    const manifestUrl = `${window.location.origin}/api/manifest?${new URLSearchParams({
      t: deviceSelectionStore.deviceType,
      v: deviceSelectionStore.version,
      u: firmwareMode === 'full' ? '2' : '1',
      src: deviceSelectionStore.source
    })}`;

    // Wait for DOM to be ready and ESP Web Tools to load
    setTimeout(() => {
      const espButton = document.querySelector('esp-web-install-button');
      if (espButton) {
        console.log('ESP Web Tools - Setting manifest on button');
        espButton.setAttribute('manifest', manifestUrl);
      } else {
        console.log('ESP Web Tools - Button not found, using web fallback');
        window.open(`https://web.esphome.io/#?manifest=${encodeURIComponent(manifestUrl)}`, '_blank');
      }
    }, 1000);
  }

  // Handle download action
  async function handleDownload(option: DownloadOption) {
    if (!deviceSelectionStore.deviceType || !deviceSelectionStore.version) return;

    try {
      await apiActions.downloadFirmware(
        deviceSelectionStore.deviceType,
        deviceSelectionStore.version,
        option.mode,
        option.id === 'uf2' ? 'uf2' : 'fw'
      );
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  // Handle click action based on option
  async function handleDownloadClick(option: DownloadOption) {
    if (option.id === 'esptool') {
      // For Update Device/Full Flash Device - use ESP Web Tools if available, fallback to download
      const espButton = document.querySelector('esp-web-install-button');
      if (espButton && espButton.hasAttribute('manifest')) {
        console.log('Using ESP Web Tools for firmware installation');
        // Programmatically trigger the ESP Web Tools installation
        const activateButton = espButton.querySelector('button[slot="activate"]');
        if (activateButton) {
          activateButton.click();
        }
      } else {
        console.log('ESP Web Tools not available, falling back to direct download');
        await handleDownload(option);
      }
      return;
    }

    // For fwzip - use zip download with u=5 parameter for all devices
    if (option.id === 'fwzip') {
      try {
        await apiActions.downloadFirmware(
          deviceSelectionStore.deviceType!,
          deviceSelectionStore.version!,
          '5', // u=5 for zip download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
          'fw' // Download firmware zip archive
        );
      } catch (error) {
        console.error('Firmware zip download failed:', error);
      }
      return;
    }

    // For ota - use ota download with u=5 parameter for all devices
    if (option.id === 'ota') {
      try {
        await apiActions.downloadFirmware(
          deviceSelectionStore.deviceType!,
          deviceSelectionStore.version!,
          '4', // u=5 for zip download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
          'ota' // Download firmware zip archive
        );
      } catch (error) {
        console.error('Firmware ota download failed:', error);
      }
      return;
    }

    // For uf2 - use zip download with u=5 parameter for all devices
    if (option.id === 'uf2') {
      try {
        await apiActions.downloadFirmware(
          deviceSelectionStore.deviceType!,
          deviceSelectionStore.version!,
          '1', // u=5 for zip download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
          'uf2' // Download firmware zip archive
        );
      } catch (error) {
        console.error('Firmware uf2 download failed:', error);
      }
      return;
    }
    // For uf2 and other options - use direct download
    await handleDownload(option);
  }
</script>

<!-- ESP Web Tools script loading (conditionally) -->
<svelte:head>
  {#if deviceSelectionStore.category === 'esp'}
    <script type="module" src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js"></script>
  {/if}
</svelte:head>

{#if deviceSelectionStore.deviceType && deviceSelectionStore.version}
  <div class="space-y-4">
    <!-- ESP Web Tools info section -->
    {#if deviceSelectionStore.category === 'esp'}
      <div class="p-4 bg-green-900 bg-opacity-30 border border-green-600 rounded-lg">
        <h4 class="font-medium text-green-200 mb-2">🔧 ESP Web Tools (Recommended)</h4>
        <p class="text-green-300">
          Click "Update Device" or "Full Flash Device" below to install firmware directly in your browser.
          This is the easiest method for ESP32 devices.
        </p>
        <esp-web-install-button manifest="" style="display: none;">
          <button slot="activate"></button>
        </esp-web-install-button>
      </div>
    {/if}

    <!-- Firmware Mode Selector for ESP32 Devices -->
    {#if deviceSelectionStore.category === 'esp'}
      <div class="space-y-2">
        <label class="block text-sm font-medium text-orange-200 mb-2">
          Flash Mode
        </label>
        <div class="flex space-x-4">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              bind:group={firmwareMode}
              value="update"
              class="text-orange-500 focus:ring-orange-500 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900"
            />
            <span class="text-orange-100">Update Device</span>
            <span class="text-xs text-orange-400">(preserves settings)</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              bind:group={firmwareMode}
              value="full"
              class="text-orange-500 focus:ring-orange-500 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900"
            />
            <span class="text-orange-100">Full Flash</span>
            <span class="text-xs text-orange-400">(wipe & reinstall)</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- Primary Download Actions -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each downloadOptions.slice(0, 2) as option}
        <button
          on:click={() => handleDownloadClick(option)}
          disabled={!option.available}
          class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed w-full transition-colors duration-200"
        >
          <span class="flex items-center justify-center">
            <span class="text-xl mr-2">{option.icon}</span>
              <span>{option.label}</span>
          </span>
        </button>
      {/each}
    </div>

    <!-- Additional Options -->
    {#if downloadOptions.length > 2}
      <div class="flex justify-center">
        <button
          on:click={() => showMoreOptions = !showMoreOptions}
          class="px-4 py-2 text-sm text-orange-300 hover:text-orange-200 transition-colors"
        >
          {showMoreOptions ? 'Show Less ▲' : 'More Options ▼'}
        </button>
      </div>

      {#if showMoreOptions}
        <div class="space-y-3 pt-4 border-t border-orange-700 rounded-lg">
          <h3 class="text-lg font-semibold text-orange-200">Additional Download Options</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each downloadOptions.slice(2) as option}
              <button
                on:click={() => handleDownloadClick(option)}
                disabled={!option.available}
                class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed w-full transition-colors duration-200"
              >
                <span class="flex items-center justify-center">
                  <span class="text-lg mr-2">{option.icon}</span>
                  <span>{option.label}</span>
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<!-- ESP Web Tools Dialog (for advanced use) -->
<dialog bind:this={espWebToolsDialog} class="p-6 bg-gray-800 border border-orange-600 rounded-lg backdrop:bg-black backdrop:bg-opacity-50">
  <h3 class="text-lg font-semibold text-orange-200 mb-4">ESP Web Tools Installation</h3>
  <div class="space-y-4">
    <p class="text-orange-300">
      ESP Web Tools allows you to install Meshtastic firmware directly in your browser without any additional software.
    </p>
    <div class="space-y-3">
      <h4 class="font-medium text-orange-200 mb-2">Instructions:</h4>
      <ol class="list-decimal list-inside space-y-2 text-sm text-orange-300">
        <li>Connect your ESP32 device to your computer via USB</li>
        <li>Click "Connect" in the ESP Web Tools interface</li>
        <li>Select the correct COM port</li>
        <li>Click "Install" to begin flashing</li>
        <li>Wait for the installation to complete</li>
      </ol>
    </div>
    <div class="flex justify-end space-x-4 pt-4">
      <button
        class="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors duration-200"
        on:click={() => espWebToolsDialog.close()}
      >
        Close
      </button>
    </div>
  </div>
</dialog>