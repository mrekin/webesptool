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

  // Available download options based on device type and version
  $: downloadOptions = getDownloadOptions(deviceSelectionStore.deviceType, deviceSelectionStore.category, deviceSelectionStore.version);

  // Debug: Log device type and options
  $: {
    if (deviceSelectionStore.deviceType) {
      console.log('=== DownloadButtons Debug ===');
      console.log('Device type:', deviceSelectionStore.deviceType);
      console.log('Device category:', deviceSelectionStore.category);
      console.log('Device version:', deviceSelectionStore.version);
      console.log('Download options:', downloadOptions);
      console.log('Download options length:', downloadOptions.length);
      console.log('Is ESP device:', deviceSelectionStore.category === 'esp');
      console.log('============================');
    }
  }

  function getDownloadOptions(deviceType: string | null, category: 'esp' | 'uf2' | 'rp2040' | null, version: string | null): DownloadOption[] {
    if (!deviceType || !version) return [];

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
        label: 'Download Fw UF2',
        mode: '1',
        available: true,
        icon: '💾',
        description: 'Download UF2 firmware file for manual installation'
      });

      options.push({
        id: 'ota',
        label: 'Download Fw OTA',
        mode: '4',
        available: true,
        icon: '💾',
        description: 'Download OTA firmware file for update over-the-air'
      });

      options.push({
        id: 'url',
        label: 'Download Erase UF2',
        mode: '4',
        available: true,
        icon: '💾',
        description: 'Download NRF Erase file for memory erasing. Don\'t forget to confirm erasing in serial console!',
        url: 'https://flasher.meshtastic.org/uf2/nrf_erase2.uf2'
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
      label: 'Download Fw ZIP',
      mode: '5',
      available: true,
      icon: '📦',
      description: 'Download complete firmware archive for manual installation'
    });    

    return options;
  }

  // Function to generate manifest URL for ESP Web Tools
  function generateManifestUrl(): string {
    return `${window.location.origin}/api/manifest?${new URLSearchParams({
      t: deviceSelectionStore.deviceType,
      v: deviceSelectionStore.version,
      u: firmwareMode === 'full' ? '2' : '1',
      src: deviceSelectionStore.source
    })}`;
  }

  // Function to configure and trigger ESP Web Tools button
  function configureAndTriggerESPButton(): boolean {
    const espButton = document.querySelector('esp-web-install-button');
    if (espButton) {
      const manifestUrl = generateManifestUrl();
      console.log('ESP Web Tools - Setting manifest on button:', manifestUrl);
      espButton.setAttribute('manifest', manifestUrl);

      // Trigger the ESP Web Tools installation
      const activateButton = espButton.querySelector('button[slot="activate"]');
      if (activateButton) {
        console.log('Using ESP Web Tools for firmware installation');
        activateButton.click();
        return true;
      }
    }
    return false;
  }

  // Simplified function to download files from URL
  function downloadFromUrl(url: string): void {
    console.log('Downloading file from URL:', url);

    // Create download link and trigger it
    const link = document.createElement('a');
    link.href = url;
    link.download = ''; // Let browser use filename from server or URL
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('Download initiated');
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
    if (option.id === 'url' && option.url) {
      // For URL download options (e.g., Erase UF2 files)
      downloadFromUrl(option.url);
      return;
    }

    if (option.id === 'esptool') {
      // For Update Device/Full Flash Device - configure and trigger ESP Web Tools on click
      if (configureAndTriggerESPButton()) {
        return; // ESP Web Tools was triggered successfully
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

<!-- ESP Web Tools Button (hidden, used for firmware installation) -->
{#if deviceSelectionStore.category === 'esp' && deviceSelectionStore.version}
  <div style="display: none;">
    <esp-web-install-button manifest="">
      <button slot="activate">ESP Web Tools Install</button>
    </esp-web-install-button>
  </div>
{/if}

{#if deviceSelectionStore.deviceType && deviceSelectionStore.version}
  <div class="space-y-4">

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