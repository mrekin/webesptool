<script lang="ts">
  import { deviceDisplayInfo, firmwareDisplayInfo, loadingState } from '$lib/stores';

  // Local state for HTML rendering
  let firmwareInfoElement: HTMLElement;

  // Subscribe to stores
  $: deviceInfo = $deviceDisplayInfo;
  $: displayInfo = $firmwareDisplayInfo;
  $: error = $loadingState.error;

  // Safely render HTML content
  function renderHTML(htmlContent: string): string {
    if (!htmlContent) return '';
    // Basic sanitization - in production, use a proper HTML sanitizer
    return htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
  }
</script>

{#if deviceInfo}
  <div class="space-y-4">
        <!-- Firmware Version Header -->
    <div class="p-4 bg-gray-800 border border-orange-600 rounded-md">
      <h2 class="text-xl font-bold text-orange-200 mb-3">
        Firmware Information
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <!-- Device Information -->
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-orange-300 font-medium">Version: </span>
            <span class="text-orange-100 font-mono">{displayInfo?.version}</span>
          </div>

          {#if displayInfo?.buildDate && displayInfo.buildDate !== 'Unknown'}
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">Build Date: </span>
              <span class="text-orange-100">{displayInfo.buildDate}</span>
            </div>
          {/if}

          {#if displayInfo?.latestTag}
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">Latest Tag: </span>
              <span class="text-orange-100">{displayInfo.latestTag}</span>
            </div>
          {/if}
        </div>

        <!-- Additional Information -->
        <div class="space-y-2">
          {#if displayInfo?.deviceInfo?.pioTarget}
            <div class="flex justify-between items-center">
              <span class="text-orange-300 font-medium">PIO Target: </span>
              <span class="text-orange-100">{displayInfo.deviceInfo.pioTarget}</span>
            </div>
          {/if}

        </div>
      </div>

      <!-- Release Notes -->
      {#if displayInfo?.notes}
        <div class="mt-4 pt-4 border-t border-orange-700">
          <h3 class="text-lg font-semibold text-orange-200 mb-2">Release Notes</h3>
          <div class="text-sm text-orange-100 bg-gray-900 p-3 rounded border border-orange-700">
            <p class="whitespace-pre-wrap">{displayInfo.notes}</p>
          </div>
        </div>
      {/if}
    </div>
    <!-- Device Information Header -->
    <div class="p-4 bg-gray-800 border border-orange-600 rounded-md">
      <h2 class="text-xl font-bold text-orange-200 mb-3">
        Device Information
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-1 gap-4 text-sm">
        <div class="space-y-2">
          <div class="flex justify-start items-center gap-4">
            <span class="text-orange-300 font-medium">Device:</span>
            <span class="text-orange-100">{deviceInfo.deviceName}</span>
          </div>

          <div class="flex justify-start items-center gap-4">
            <span class="text-orange-300 font-medium">Build name: </span>
            <span class="text-orange-100">{deviceInfo.deviceType}</span>
          </div>

          <div class="flex justify-start items-center gap-4">
            <span class="text-orange-300 font-medium">Status:</span>
            <span class="text-green-400">Ready to Configure</span>
          </div>
        </div>
      </div>

      <!-- Device Specific Information -->
      <div class="mt-4 pt-4 border-t border-orange-700">
        <h3 class="text-lg font-semibold text-orange-200 mb-3">Device Details</h3>

        {#if deviceInfo.deviceInfo?.htmlInfo}
          <div
            bind:this={firmwareInfoElement}
            class="text-sm text-orange-100 prose prose-invert max-w-none"
          >
            {@html renderHTML(deviceInfo.deviceInfo.htmlInfo)}
          </div>
        {:else if deviceInfo}
          <div class="text-sm text-orange-300 text-center py-8">
            No device information available
          </div>
        {:else}
          <div class="text-sm text-orange-300 text-center py-8">
            Select a device to view details
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Firmware Information (only when version is selected) -->
{#if displayInfo}
  <div class="space-y-4">



    <!-- Installation Instructions Preview -->
    <div class="p-4 bg-gray-800 border border-orange-600 rounded-md">
      <h3 class="text-lg font-semibold text-orange-200 mb-3">Installation Instructions</h3>

      <div class="space-y-3 text-sm text-orange-100">
        {#if displayInfo.deviceInfo?.deviceType?.includes('esp')}
          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">1.</span>
            <div>
              <p class="font-medium text-orange-200">ESP Web Tools Installation</p>
              <p class="text-orange-300">Click "ESP Web Tools Install" to use browser-based installation.</p>
            </div>
          </div>

          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">2.</span>
            <div>
              <p class="font-medium text-orange-200">Alternative: Manual Download</p>
              <p class="text-orange-300">Use download buttons to get firmware files for manual flashing.</p>
            </div>
          </div>
        {:else if displayInfo.deviceInfo?.deviceType?.includes('rak') || displayInfo.deviceInfo?.deviceType?.includes('nrf')}
          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">1.</span>
            <div>
              <p class="font-medium text-orange-200">UF2 File Download</p>
              <p class="text-orange-300">Download UF2 file and copy to your device when in bootloader mode.</p>
            </div>
          </div>

          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">2.</span>
            <div>
              <p class="font-medium text-orange-200">Device Bootloader</p>
              <p class="text-orange-300">Double-click reset button or use reset pin to enter bootloader mode.</p>
            </div>
          </div>
        {:else if displayInfo.deviceInfo?.deviceType?.includes('pico')}
          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">1.</span>
            <div>
              <p class="font-medium text-orange-200">UF2 File for RP2040</p>
              <p class="text-orange-300">Download UF2 file and drag-and-drop to the RP2040 when in bootloader mode.</p>
            </div>
          </div>

          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">2.</span>
            <div>
              <p class="font-medium text-orange-200">Enter Bootloader</p>
              <p class="text-orange-300">Hold BOOTSEL button while connecting USB to enter bootloader mode.</p>
            </div>
          </div>
        {:else}
          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">1.</span>
            <div>
              <p class="font-medium text-orange-200">Download Firmware</p>
              <p class="text-orange-300">Use appropriate download button for your device type.</p>
            </div>
          </div>

          <div class="flex items-start space-x-3">
            <span class="text-orange-400 font-bold">2.</span>
            <div>
              <p class="font-medium text-orange-200">Follow Device Instructions</p>
              <p class="text-orange-300">Refer to your device's manual for specific installation steps.</p>
            </div>
          </div>
        {/if}

        <div class="mt-4 p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded">
          <p class="text-orange-200 font-medium">
            ⚠️ <strong>Important:</strong> This will replace your current firmware.
          </p>
          <p class="text-orange-300 text-xs mt-1">
            Make sure to backup any important data before proceeding with installation.
          </p>
        </div>
      </div>
    </div>
  </div>
{:else if error}
  <div class="p-4 bg-red-900 bg-opacity-30 border border-red-600 rounded-md">
    <h3 class="text-lg font-semibold text-red-200 mb-2">Error Loading Firmware Information</h3>
    <p class="text-sm text-red-300">{error}</p>
  </div>
{:else}
  <div class="p-4 bg-gray-800 border border-orange-600 rounded-md">
    <h3 class="text-lg font-semibold text-orange-200 mb-2">Firmware Information</h3>
    <p class="text-sm text-orange-300">
      Select a device and firmware version to view detailed information and installation instructions.
    </p>
  </div>
{/if}

<style>
  /* Custom styles for rendered HTML content */
  :global(.prose h1) {
    @apply text-xl font-bold text-orange-200 mb-2 mt-4;
  }

  :global(.prose h2) {
    @apply text-lg font-semibold text-orange-200 mb-2 mt-3;
  }

  :global(.prose h3) {
    @apply text-base font-medium text-orange-200 mb-1 mt-2;
  }

  :global(.prose p) {
    @apply text-orange-100 mb-2;
  }

  :global(.prose ul) {
    @apply list-disc list-inside text-orange-100 mb-2;
  }

  :global(.prose ol) {
    @apply list-decimal list-inside text-orange-100 mb-2;
  }

  :global(.prose li) {
    @apply mb-1;
  }

  :global(.prose code) {
    @apply bg-gray-900 px-1 py-0.5 rounded text-orange-200 font-mono text-xs;
  }

  :global(.prose pre) {
    @apply bg-gray-900 p-3 rounded mb-2 overflow-x-auto;
  }

  :global(.prose pre code) {
    @apply bg-transparent p-0;
  }

  :global(.prose a) {
    @apply text-orange-400 hover:text-orange-300 underline;
  }

  :global(.prose blockquote) {
    @apply border-l-4 border-orange-600 pl-4 italic text-orange-200;
  }

  :global(.prose table) {
    @apply w-full text-sm mb-2;
  }

  :global(.prose th) {
    @apply bg-gray-900 px-2 py-1 text-left font-medium text-orange-200;
  }

  :global(.prose td) {
    @apply px-2 py-1 border-t border-gray-700 text-orange-100;
  }
</style>