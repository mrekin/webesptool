<script lang="ts">
  import { deviceSelection, loadingState, deviceDisplayInfo } from '$lib/stores';
  import { apiActions } from '$lib/stores';
  import { DeviceType } from '$lib/types.js';
  import { isESP32Device, isNRF52Device, isRP2040Device, supportsESPWebTools, supportsUF2 } from '$lib/utils/deviceTypeUtils.js';
  import type { DownloadOption } from '$lib/types';
  import { _ as locales, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';

  // Local state
  let espWebToolsDialog: HTMLDialogElement;
  let showMoreOptions = false;
  let firmwareMode: 'update' | 'full' = 'update'; // update = режим 1, full = режим 2

  // Subscribe to stores
  $: deviceSelectionStore = $deviceSelection;
  $: isDownloading = $loadingState.isDownloading;
  $: deviceDisplayInfoStore = $deviceDisplayInfo;

  // Import esp-web-tools only on client side
  onMount(async () => {
    if (typeof window !== 'undefined') {
      try {
        await import('esp-web-tools/dist/web/install-button.js');
      } catch (error) {
        console.error('Failed to load ESP Web Tools:', error);
      }
    }
  });

  // Available download options based on device type and version
  $: downloadOptions = getDownloadOptions(deviceSelectionStore.devicePioTarget, deviceDisplayInfoStore?.deviceType, deviceSelectionStore.version, $locale);

  
  function getDownloadOptions(devicePioTarget: string | null, deviceType: DeviceType | null | undefined, version: string | null, locale: any): DownloadOption[] {
    if (!devicePioTarget || !version) return [];

    const options: DownloadOption[] = [];

    // ESP32 devices get ESP Web Tools (primary button) and firmware mode selector
    if (isESP32Device(deviceType)) {
      options.push({
        id: 'esptool',
        label: firmwareMode === 'full' ? $locales('downloadbuttons.full_flash_device') : $locales('downloadbuttons.update_device'),
        mode: firmwareMode === 'full' ? '2' : '1', // 2=full, 1=update
        available: true,
        icon: '🔧',
        description: firmwareMode === 'full' ? $locales('downloadbuttons.complete_firmware_wipe') : $locales('downloadbuttons.update_existing_firmware')
      });
    }

    // UF2 downloads for NRF52 devices
    if (isNRF52Device(deviceType)) {
      options.push({
        id: 'uf2',
        label: $locales('downloadbuttons.download_fw_uf2'),
        mode: '1',
        available: true,
        icon: '💾',
        description: $locales('downloadbuttons.download_uf2_firmware')
      });

      options.push({
        id: 'ota',
        label: $locales('downloadbuttons.download_ota_firmware'),
        mode: '4',
        available: true,
        icon: '💾',
        description: $locales('downloadbuttons.download_ota_firmware')
      });

      options.push({
        id: 'url',
        label: $locales('downloadbuttons.download_erase_uf2'),
        mode: '4',
        available: true,
        icon: '💾',
        description: $locales('downloadbuttons.download_nrf_erase'),
        url: 'https://flasher.meshtastic.org/uf2/nrf_erase2.uf2'
      });
    }

    // UF2 downloads for RP2040 devices
    if (isRP2040Device(deviceType)) {
      options.push({
        id: 'uf2',
        label: $locales('downloadbuttons.download_uf2'),
        mode: '1',
        available: true,
        icon: '💾',
        description: $locales('downloadbuttons.download_uf2_firmware')
      });
    }

    // Add firmware zip download option for all devices
    options.push({
      id: 'fwzip',
      label: $locales('downloadbuttons.download_fw_zip'),
      mode: '5',
      available: true,
      icon: '📦',
      description: $locales('downloadbuttons.download_complete_archive')
    });    

    return options;
  }

  // Function to generate manifest URL for ESP Web Tools
  function generateManifestUrl(): string {
    // Use relative path to work with current base path
    return `./api/manifest?${new URLSearchParams({
      t: deviceSelectionStore.devicePioTarget,
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
      espButton.setAttribute('manifest', manifestUrl);

      // Trigger the ESP Web Tools installation
      const activateButton = espButton.querySelector('button[slot="activate"]');

      if (activateButton) {
        activateButton.click();
        return true;
      }
    }
    return false;
  }

  // Simplified function to download files from URL
  function downloadFromUrl(url: string): void {
    // Create download link and trigger it
    const link = document.createElement('a');
    link.href = url;
    link.download = ''; // Let browser use filename from server or URL
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Handle download action
  async function handleDownload(option: DownloadOption) {
    if (!deviceSelectionStore.devicePioTarget || !deviceSelectionStore.version) return;

    try {
      await apiActions.downloadFirmware(
        deviceSelectionStore.devicePioTarget,
        deviceSelectionStore.version,
        option.mode,
        option.id === 'uf2' ? 'uf2' : 'fw'
      );
    } catch (error) {
      // Error is already handled by apiActions.downloadFirmware via loadingActions.setError
      // No need for additional console.error here
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
      // For {$locales('downloadbuttons.update_device')}/{$locales('downloadbuttons.full_flash_device')} - configure and trigger ESP Web Tools on click
      if (configureAndTriggerESPButton()) {
        return; // ESP Web Tools was triggered successfully
      } else {
        await handleDownload(option);
      }
      return;
    }

    // For fwzip - use zip download with u=5 parameter for all devices
    if (option.id === 'fwzip') {
      await apiActions.downloadFirmware(
        deviceSelectionStore.devicePioTarget!,
        deviceSelectionStore.version!,
        '5', // u=5 for zip download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
        'fw' // Download firmware zip archive
      );
      return;
    }

    // For ota - use ota download with u=5 parameter for all devices
    if (option.id === 'ota') {
      await apiActions.downloadFirmware(
        deviceSelectionStore.devicePioTarget!,
        deviceSelectionStore.version!,
        '4', // u=4 for ota download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
        'ota' // Download firmware ota file
      );
      return;
    }

    // For uf2 - use uf2 download with u=1 parameter for all devices
    if (option.id === 'uf2') {
      await apiActions.downloadFirmware(
        deviceSelectionStore.devicePioTarget!,
        deviceSelectionStore.version!,
        '1', // u=1 for uf2 download (from backend: 5 - zip, 4 - ota, 1 - update, 2 - install)
        'uf2' // Download firmware uf2 file
      );
      return;
    }
    // For uf2 and other options - use direct download
    await handleDownload(option);
  }
</script>

<!-- ESP Web Tools is now loaded as npm module in script section -->

<!-- ESP Web Tools Button (hidden, used for firmware installation) -->
{#if supportsESPWebTools(deviceDisplayInfoStore?.deviceType) && deviceSelectionStore.version}
  <div style="display: none;">
    <esp-web-install-button manifest="">
      <button slot="activate">{$locales('downloadbuttons.esp_web_tools_install')}</button>
    </esp-web-install-button>
  </div>
{/if}

{#if deviceSelectionStore.devicePioTarget && deviceSelectionStore.version}
  <div class="space-y-4">

    <!-- Firmware Mode Selector for ESP32 Devices -->
    {#if supportsESPWebTools(deviceDisplayInfoStore?.deviceType)}
      <div class="space-y-2 sm:space-y-3">
        <label class="block text-sm font-medium text-orange-200 mb-2">
          {$locales('downloadbuttons.flash_mode')}
        </label>
        <div class="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0">
          <label class="flex items-center space-x-2 cursor-pointer" title="{$locales('downloadbuttons.update_existing_firmware')}">
            <input
              type="radio"
              bind:group={firmwareMode}
              value="update"
              class="text-orange-500 focus:ring-orange-500 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900"
            />
            <span class="text-orange-100">{$locales('downloadbuttons.update_device')}</span>
            <span class="text-xs text-orange-400 max-w-[100px] sm:max-w-none break-words sm:break-normal">{$locales('downloadbuttons.preserves_settings')}</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer" title="{$locales('downloadbuttons.complete_firmware_wipe')}">
            <input
              type="radio"
              bind:group={firmwareMode}
              value="full"
              class="text-orange-500 focus:ring-orange-500 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900"
            />
            <span class="text-orange-100">{$locales('downloadbuttons.full_flash')}</span>
            <span class="text-xs text-orange-400 max-w-[100px] sm:max-w-none break-words sm:break-normal">{$locales('downloadbuttons.wipe_reinstall')}</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- Primary Download Actions -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {#each downloadOptions.slice(0, 2) as option}
        <button
          on:click={() => handleDownloadClick(option)}
          disabled={!option.available}
          class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed w-full transition-colors duration-200 text-sm sm:text-base"
          title={option.description}
          aria-label={option.description}
        >
          <span class="flex items-center justify-center">
            <span class="text-base mr-2">{option.icon}</span>
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
          {showMoreOptions ? $locales('common.show_less') : $locales('common.more_options')}
        </button>
      </div>

      {#if showMoreOptions}
        <div class="space-y-3 pt-4 border-t border-orange-700 rounded-lg">
          <h3 class="text-lg font-semibold text-orange-200">{$locales('downloadbuttons.additional_download_options')}</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {#each downloadOptions.slice(2) as option}
              <button
                on:click={() => handleDownloadClick(option)}
                disabled={!option.available}
                class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed w-full transition-colors duration-200 text-sm sm:text-base"
                title={option.description}
                aria-label={option.description}
              >
                <span class="flex items-center justify-center">
                  <span class="text-base mr-2">{option.icon}</span>
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
  <h3 class="text-lg font-semibold text-orange-200 mb-4">{$locales('downloadbuttons.esp_web_tools_title')}</h3>
  <div class="space-y-4">
    <p class="text-orange-300">
      {$locales('downloadbuttons.esp_web_tools_desc')}
    </p>
    <div class="space-y-3">
      <h4 class="font-medium text-orange-200 mb-2">{$locales('downloadbuttons.instructions')}</h4>
      <ol class="list-decimal list-inside space-y-2 text-sm text-orange-300">
        <li>{$locales('downloadbuttons.connect_device')}</li>
        <li>{$locales('downloadbuttons.click_connect')}</li>
        <li>{$locales('downloadbuttons.select_com_port')}</li>
        <li>{$locales('downloadbuttons.click_install')}</li>
        <li>{$locales('downloadbuttons.wait_complete')}</li>
      </ol>
    </div>
    <div class="flex justify-end space-x-4 pt-4">
      <button
        class="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors duration-200"
        on:click={() => espWebToolsDialog.close()}
      >
        {$locales('common.close')}
      </button>
    </div>
  </div>
</dialog>