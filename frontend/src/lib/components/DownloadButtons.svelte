<script lang="ts">
  import { deviceSelection, loadingState, deviceDisplayInfo, currentSource } from '$lib/stores.js';
  import { apiActions } from '$lib/stores.js';
  import { DeviceType } from '$lib/types.js';
  import { isESP32Device, isNRF52Device, isRP2040Device, supportsUF2 } from '$lib/utils/deviceTypeUtils.js';
  import type { DownloadOption } from '$lib/types.js';
  import { _ as locales, locale } from 'svelte-i18n';
  import { onMount, createEventDispatcher } from 'svelte';
	import { apiService } from '$lib/api.js';
	import { createFirmwareFileHandler } from '$lib/utils/fileHandler.js';

	// Event dispatcher for CustomFirmwareModal
	const dispatch = createEventDispatcher();

	// Initialize file handler
	const fileHandler = createFirmwareFileHandler();

  // Local state
  let espWebToolsDialog: HTMLDialogElement;
  let showMoreOptions = false;
  let firmwareMode: 'update' | 'full' = 'update'; // update = mode 1, full = mode 2

  // CustomFirmwareModal data moved to parent component

  // Subscribe to stores
  $: deviceSelectionStore = $deviceSelection;
  $: isDownloading = $loadingState.isDownloading;
  $: deviceDisplayInfoStore = $deviceDisplayInfo;
  $: currentSourceStore = $currentSource;


  // Available download options based on device type and version
  $: downloadOptions = getDownloadOptions(deviceSelectionStore.devicePioTarget, deviceDisplayInfoStore?.deviceType, deviceSelectionStore.version, firmwareMode, $locale, currentSourceStore?.type);


  function getDownloadOptions(devicePioTarget: string | null, deviceType: DeviceType | null | undefined, version: string | null, mode: 'update' | 'full', locale: any, sourceType: string | undefined): DownloadOption[] {
    if (!devicePioTarget || !version) return [];

    const options: DownloadOption[] = [];

    // ESP32 devices get esptool (primary button) and firmware mode selector
    if (isESP32Device(deviceType as DeviceType)) {
      options.push({
        id: 'esptool',
        label: mode === 'full' ? $locales('downloadbuttons.full_flash_device') : $locales('downloadbuttons.update_device'),
        mode: mode === 'full' ? '2' : '1', // 2=full, 1=update
        available: true,
        icon: '🔧',
        description: mode === 'full' ? $locales('downloadbuttons.complete_firmware_wipe') : $locales('downloadbuttons.update_existing_firmware')
      });
    }

    // UF2 downloads for NRF52 devices
    if (isNRF52Device(deviceType as DeviceType)) {
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

      // Show erase UF2 option only for Meshtastic, not Meshcore
      if (sourceType === 'meshtastic') {
        options.push({
          id: 'url',
          label: $locales('downloadbuttons.download_erase_uf2'),
          mode: '4',
          available: true,
          icon: '💾',
          description: $locales('downloadbuttons.download_nrf_erase'),
          url: 'https://flasher.meshtastic.org/uf2/nrf_erase2.uf2'
        });
      } else if (sourceType === 'meshcore') {
        // For Meshcore, show link to nRF52 Flash Format GitHub releases
        options.push({
          id: 'url',
          label: 'nRF52 Flash Format',
          mode: '4',
          available: true,
          icon: '🔗',
          description: 'Open Meshcore nRF52 Flash Format releases',
          url: 'https://github.com/meshcore-dev/nRF52-Flash-Format/releases',
          openInNewTab: true
        });
      }
    }

    // UF2 downloads for RP2040 devices
    if (isRP2040Device(deviceType as DeviceType)) {
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
      t: deviceSelectionStore.devicePioTarget || '',
      v: deviceSelectionStore.version || '',
      u: firmwareMode === 'full' ? '2' : '1',
      src: deviceSelectionStore.source || ''
    })}`;
  }


  // Simplified function to download files from URL or open in new tab
  function downloadFromUrl(url: string, openInNewTab: boolean = false): void {
    if (openInNewTab) {
      // Open in new tab (for GitHub releases, etc.)
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      // Create download link and trigger it
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // Let browser use filename from server or URL
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
      // For URL download options (e.g., Erase UF2 files or GitHub links)
      downloadFromUrl(option.url, option.openInNewTab);
      return;
    }

    if (option.id === 'esptool') {
      // Use CustomFirmwareModal with manifest files instead of ESP Web Tools
      await handleManifestFlash(option);
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

  // Handle manifest flashing using CustomFirmwareModal
  async function handleManifestFlash(option: DownloadOption) {
    try {
      // 1. Download manifest
      const modeDescription = option.mode === '2' ? 'Full Flash (factory)' : 'Update';
      console.log(`Downloading manifest for ${modeDescription} mode:`, {
        devicePioTarget: deviceSelectionStore.devicePioTarget,
        version: deviceSelectionStore.version,
        mode: option.mode,
        modeDescription: modeDescription,
        source: deviceSelectionStore.source
      });
      const manifest = await apiService.getManifest(
        deviceSelectionStore.devicePioTarget!,
        deviceSelectionStore.version!,
        option.mode,
        deviceSelectionStore.source || ''
      );
      console.log('Manifest response:', manifest);

      // 2. Dispatch event to open CustomFirmwareModal with manifest (files will be downloaded inside)
      dispatch('openCustomFirmwareModal', {
        preloadedFilesWithOffsets: [], // Files will be downloaded asynchronously in the modal
        isAutoSelectMode: true,
        manifestData: manifest
      });
      
    } catch (error) {
      console.error('Failed to prepare manifest flashing:', error);
      // Don't fallback - just show error
      alert('Failed to prepare manifest flashing: ' + (error as any).message);
    }
  }

  // Download manifest files from parts array
  async function downloadManifestFiles(manifest: any): Promise<{
    file: any;
    address: string;
    filename: string;
  }[]> {
    const files = [];

    for (const part of manifest.builds[0].parts) {
      try {
        // Download file content with filename from server headers
        const { content, filename } = await apiService.downloadFromFileWithFilename(part.path);

        // Convert ArrayBuffer to File object using server-provided filename
        const file = new File([content], filename, { type: 'application/octet-stream' });

        files.push({
          file: fileHandler.createFirmwareFile(file),
          address: `0x${part.offset.toString(16)}`, // Convert decimal offset to hex
          filename: filename
        });
      } catch (error) {
        console.error(`Failed to download file from ${part.path}:`, error);
        throw new Error(`Failed to download firmware part from ${part.path}: ${(error as any).message}`);
      }
    }

    return files;
  }

  // Extract filename from URL path
  function extractFilenameFromPath(path: string): string {
    // Try to extract filename from URL parameters or path
    const url = new URL(path, window.location.origin);

    // Check for filename in query parameters
    const filenameParam = url.searchParams.get('filename');
    if (filenameParam) {
      return filenameParam;
    }

    // Extract from path segments
    const pathSegments = url.pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];

    if (lastSegment && lastSegment.includes('.')) {
      return lastSegment;
    }

    // Fallback: generate filename based on parameters
    const part = url.searchParams.get('p') || 'firmware';
    const device = url.searchParams.get('t') || 'device';
    const version = url.searchParams.get('v') || 'unknown';

    return `${device}-${version}-${part}.bin`;
  }

  </script>


<!-- Download Options Header -->
<h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center justify-between">
  <div class="flex items-center">
    <span class="mr-3">⬇️</span>
    {$locales('page.download_options')}
  </div>
  {#if !deviceSelectionStore.devicePioTarget}
    <button
      on:click={() => dispatch('openCustomFirmwareModal', {})}
      class="text-orange-200 hover:text-orange-100 transition-colors p-1 rounded"
      title="{$locales('downloadbuttons.custom_firmware_description')}"
      aria-label="{$locales('downloadbuttons.custom_firmware_description')}"
    >
      <span class="text-xl">🔧</span>
    </button>
  {/if}
</h2>

{#if deviceSelectionStore.devicePioTarget && deviceSelectionStore.version}
  <div class="space-y-4">

    <!-- Firmware Mode Selector for ESP32 Devices -->
    {#if deviceDisplayInfoStore?.deviceType && isESP32Device(deviceDisplayInfoStore.deviceType)}
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
        <div class="space-y-3 pt-4 border-t border-orange-500 rounded-lg">
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

<!-- CustomFirmwareModal moved to +page.svelte for proper centering -->
