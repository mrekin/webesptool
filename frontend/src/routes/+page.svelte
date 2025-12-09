<script lang="ts">
  import BaseLayout from '$lib/components/BaseLayout.svelte';
  import SelectDevice from '$lib/components/SelectDevice.svelte';
  import RepositorySelector from '$lib/components/RepositorySelector.svelte';
  import FirmwareInfo from '$lib/components/FirmwareInfo.svelte';
  import DownloadButtons from '$lib/components/DownloadButtons.svelte';
  import Notes from '$lib/components/Notes.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import ImportantNotice from '$lib/components/ImportantNotice.svelte';
  import { loadingState, availableFirmwares } from '$lib/stores';
  import { onMount } from 'svelte';
  import { _ as locales, locale } from 'svelte-i18n';

  // Local state with i18n
  $: pageTitle = $locales('page.main_title');

  // Subscribe to stores
  $: error = $loadingState.error;
  $: availableFirmwaresStore = $availableFirmwares;

  // Set page title on mount (browser side only)
  onMount(() => {
    if (typeof document !== 'undefined') {
      document.title = pageTitle;
    }
  });

  // Check if we have any available firmwares
  $: hasAvailableDevices = availableFirmwaresStore.espdevices.length > 0 ||
                           availableFirmwaresStore.uf2devices.length > 0 ||
                           availableFirmwaresStore.rp2040devices.length > 0;
</script>

<svelte:head>
  <title>{$locales('page.main_title')}</title>
  <meta name="description" content={$locales('page.meta_description')} />
  <meta name="keywords" content="meshtastic, firmware, esp32, lora, mesh network" />
  <meta property="og:title" content={$locales('page.main_title')} />
  <meta property="og:description" content={$locales('page.main_description')} />
  <meta property="og:type" content="website" />
</svelte:head>

<BaseLayout>
  <!-- Header Section -->
  <div slot="head" class="text-center space-y-4">
    <h1 class="text-3xl md:text-4xl font-bold text-orange-200 mb-4">
      {$locales('page.main_title')}
    </h1>

    <div class="max-w-2xl mx-auto">
      <p class="text-orange-300 text-lg">
        {$locales('page.main_description')}
      </p>
    </div>

    <div class="mt-2 max-w-6xl mx-auto">
      <ImportantNotice />
    </div>

    <!-- Error State -->
    {#if error}
      <div class="mt-6">
        <div class="max-w-6xl mx-auto">
          <div class="bg-gray-800 bg-opacity-90 border border-red-600 rounded-lg p-4">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center space-x-3">
                <h2 class="text-lg font-semibold text-red-200">❌ {$locales('page.error')}</h2>
                <p class="text-red-300">{error}</p>
              </div>
              <button
                on:click={() => window.location.reload()}
                class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                {$locales('page.reload_page')}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Repository Selection -->
    {#if !error}
      <div class="mt-6">
        <div class="max-w-6xl mx-auto">
          <div class="bg-gray-800 bg-opacity-90 border border-orange-600 rounded-lg p-4">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center space-x-3">
                <span class="text-orange-200 font-medium flex items-center">
                  <span class="inline-block w-5 text-center mr-2">
                    {#if $loadingState.isLoadingAvailable}
                      <!-- Spinning globe emoji during loading -->
                      <span class="inline-block animate-spin">🌐</span>
                    {:else}
                      <!-- Static globe emoji when not loading -->
                      🌐
                    {/if}
                  </span>
                  {$locales('page.source_repository')}
                </span>
                <RepositorySelector />
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Main Content Area -->
  <div slot="content" class="space-y-8">
    <!-- Main Content Column -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Column: Device Selection and Actions -->
        <div class="space-y-8">
          <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
            <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
              <span class="mr-3">
                {#if $loadingState.isLoadingAvailable}
                  <!-- Spinning target emoji during loading -->
                  <span class="inline-block animate-spin">🎯</span>
                {:else}
                  <!-- Static target emoji when not loading -->
                  🎯
                {/if}
              </span>

              {$locales('page.device_selection')}
            </h2>
            <SelectDevice />
          </div>

          <!-- Download Actions -->
          <div class="p-1 bg-gray-800 border border-orange-600 rounded-lg">
            <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
              <span class="mr-3">⬇️</span>
              {$locales('page.download_options')}
            </h2>
            <DownloadButtons />
          </div>
        </div>

        <!-- Right Column: Information and Notes -->
        <div class="space-y-8">
          <!-- Firmware Information -->
          <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
            <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
              <span class="mr-3">ℹ️</span>
              {$locales('page.firmware_information')}
            </h2>
            <FirmwareInfo />
          </div>

          </div>
      </div>
  
    <!-- Important Notes - Full Width Section -->
    <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg mt-8">
      <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
        <span class="mr-3">📝</span>
        {$locales('page.important_notes')}
      </h2>
      <Notes />
    </div>
    <!-- Information section -->
    {#if !error}
      <div class="max-w-4xl mx-auto mt-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

        </div>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div slot="footer">
    <Footer />
  </div>
</BaseLayout>

<style>
  /* Custom animations - optimized */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Apply fade-in animation to main content */
  .grid > div {
    animation: fadeIn 0.6s ease-out forwards;
  }

  .grid > div:nth-child(1) {
    animation-delay: 0.1s;
  }

  .grid > div:nth-child(2) {
    animation-delay: 0.2s;
  }

  /* Custom scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #1f2937;
  }

  ::-webkit-scrollbar-thumb {
    background: #d8690e;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #b85807;
  }

  /* Loading state improvements */
  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Focus states for accessibility - only button focus used */
  button:focus {
    outline: 2px solid #fb923c;
    outline-offset: 2px;
  }

  /* Ensure responsive spacing */
  @media (max-width: 1024px) {
    .lg\:col-span-2 {
      grid-column: span 1;
    }
  }
</style>