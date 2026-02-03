<script lang="ts">
  import { deviceDisplayInfo, firmwareDisplayInfo, loadingState } from '$lib/stores.js';
  import { DeviceType } from '$lib/types.js';
  import { isESP32Device, isNRF52Device, isRP2040Device, getDeviceTypeLabel } from '$lib/utils/deviceTypeUtils.js';
  import { _ as locales } from 'svelte-i18n';
  import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

  // Local state
  let showDeviceInfo = false;

  // Subscribe to stores
  $: deviceInfo = $deviceDisplayInfo;
  $: displayInfo = $firmwareDisplayInfo;
  $: error = $loadingState.error;

  // Toggle device info section
  function toggleDeviceInfo() {
    showDeviceInfo = !showDeviceInfo;
  }
</script>

{#if deviceInfo || displayInfo}
  <div class="space-y-6">
    <!-- Firmware Version Information -->
    <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
      <h2 class="text-xl font-bold text-orange-200 mb-4">
        {$locales('firmwareinfo.title')}
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-1 gap-4 text-sm">
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-orange-300 font-medium">{$locales('common.version')} </span>
            <span class="text-orange-100 font-mono">{displayInfo?.version}</span>
          </div>

          {#if displayInfo?.buildDate && displayInfo.buildDate !== 'Unknown'}
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('common.build_date')} </span>
              <span class="text-orange-100">{displayInfo.buildDate}</span>
            </div>
          {/if}

          {#if displayInfo?.latestTag}
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('firmwareinfo.latest_tag')} </span>
              <span class="text-orange-100">{displayInfo.latestTag}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Device Information -->
    {#if deviceInfo}
      <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
        <h2 class="text-xl font-bold text-orange-200 mb-4">
          {$locales('firmwareinfo.device_info')}
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-1 gap-4 text-sm">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('common.device_name')}</span>
              <span class="text-orange-100">{deviceInfo.deviceName}</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('selectdevice.pio_target')}</span>
              <span class="text-orange-100">{deviceInfo.devicePioTarget}</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('common.platform')}</span>
              <span class="text-orange-100 uppercase">{getDeviceTypeLabel(deviceInfo.deviceType)}</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">{$locales('common.available_versions')}</span>
              <span class="text-orange-100">{deviceInfo.availableVersions?.length || 0} versions</span>
            </div>
          </div>
        </div>

        <!-- Device Specific Information -->
        <div class="mt-6 mb-6">
          <button
            on:click={toggleDeviceInfo}
            class="w-full flex items-center justify-between p-3 transition-all duration-300 text-left bg-orange-900/30 border border-orange-600 rounded hover:bg-orange-900/50 hover:border-orange-500"
            aria-expanded={showDeviceInfo}
            aria-controls="howto-content"
          >
            <h3 class="text-lg font-semibold text-orange-200 flex items-center">
              <span class="mr-2">📖</span>
              {$locales('firmwareinfo.device_details')}
            </h3>
            <span class="text-orange-300 transform transition-transform duration-300" style="transform: {showDeviceInfo ? 'rotate(180deg)' : 'rotate(0deg)'}">
              ▼
            </span>
          </button>

          {#if showDeviceInfo}
            <div id="howto-content" class="mt-3 space-y-4 animate-fade-in">
              <div class="text-orange-300 text-sm">
                {#if deviceInfo.deviceInfo?.markdownError === 'readme_not_found'}
                  <div class="text-sm text-yellow-300 text-center py-8 border border-yellow-600 rounded bg-yellow-900/20">
                    {$locales('firmwareinfo.readme_not_found')}
                  </div>
                {:else if deviceInfo.deviceInfo?.markdownInfo}
                  <MarkdownRenderer
                    source={deviceInfo.deviceInfo.markdownInfo}
                    wrapperClass="prose prose-invert max-w-none"
                  />
                {:else if deviceInfo}
                  <div class="text-sm text-orange-300 text-center py-8">
                    {$locales('firmwareinfo.no_device_info')}
                  </div>
                {:else}
                  <div class="text-sm text-orange-300 text-center py-8">
                    {$locales('firmwareinfo.select_device_view')}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Installation Instructions -->
    {#if displayInfo}
      <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
        <h2 class="text-xl font-bold text-orange-200 mb-4">{$locales('firmwareinfo.installation_instructions')}</h2>

        <div class="space-y-3 text-sm text-orange-100">
          {#if isESP32Device(deviceInfo?.deviceType as DeviceType)}
            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">1.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.esp_web_tools')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.esp_web_tools_desc')}</p>
              </div>
            </div>

            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">2.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.alternative_download')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.alternative_download_desc')}</p>
              </div>
            </div>
          {:else if isNRF52Device(deviceInfo?.deviceType as DeviceType)}
            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">1.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.uf2_download')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.uf2_download_desc')}</p>
              </div>
            </div>

            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">2.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.device_bootloader')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.device_bootloader_desc')}</p>
              </div>
            </div>
          {:else if isRP2040Device(deviceInfo?.deviceType as DeviceType)}
            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">1.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.uf2_rp2040')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.uf2_rp2040_desc')}</p>
              </div>
            </div>

            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">2.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.enter_bootloader')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.enter_bootloader_desc')}</p>
              </div>
            </div>
          {:else}
            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">1.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.download_firmware')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.download_firmware_desc')}</p>
              </div>
            </div>

            <div class="flex items-start space-x-3">
              <span class="text-orange-400 font-bold">2.</span>
              <div>
                <p class="font-medium text-orange-200">{$locales('firmwareinfo.follow_instructions')}</p>
                <p class="text-orange-300">{$locales('firmwareinfo.follow_instructions_desc')}</p>
              </div>
            </div>
          {/if}

          <div class="mt-4 p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded">
            <p class="text-orange-200 font-medium">
              {$locales('firmwareinfo.important_warning')}
            </p>
            <p class="text-orange-300 text-xs mt-1">
              {$locales('firmwareinfo.backup_warning')}
            </p>
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else if error}
  <div class="p-6 bg-red-900 bg-opacity-30 border border-red-600 rounded-lg">
    <h2 class="text-xl font-bold text-red-200 mb-4">Error Loading {$locales('firmwareinfo.title')}</h2>
    <p class="text-sm text-red-300">{error}</p>
  </div>
{:else}
  <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
    <h2 class="text-xl font-bold text-orange-200 mb-4">{$locales('firmwareinfo.title')}</h2>
    <p class="text-sm text-orange-300">
      {$locales('firmwareinfo.select_device_instructions')}
    </p>
  </div>
{/if}

<style>
  /* Fade-in animation */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.3s ease-out;
  }
</style>
