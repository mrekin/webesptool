<script lang="ts">
  import BaseLayout from '$lib/components/BaseLayout.svelte';
  import SelectDevice from '$lib/components/SelectDevice.svelte';
  import DownloadButtons from '$lib/components/DownloadButtons.svelte';
  import ImportantNotice from '$lib/components/ImportantNotice.svelte';
  // Components needed in both modes, so import statically
  import RepositorySelector from '$lib/components/RepositorySelector.svelte';
  import CustomFirmwareModal from '$lib/components/CustomFirmwareModal.svelte';
  import PinoutModal from '$lib/components/PinoutModal.svelte';

  // Dynamic imports for components used only in specific modes
  let FirmwareInfo: any = null;
  let Notes: any = null;
  let Footer: any = null;
  let MinimalFooter: any = null;
  let MeshtasticDeviceModal: any = null;
  import { loadingState, availableFirmwares, uiState, deviceSelection } from '$lib/stores.js';
  import { onMount } from 'svelte';
  import { _ as locales, locale } from 'svelte-i18n';
  import { InterfaceMode } from '$lib/types.js';

  // Subscribe to stores
  $: currentInterfaceMode = $uiState.interfaceMode;
  $: deviceSelectionStore = $deviceSelection;

  // Unified modal state
  let modalState = {
    isOpen: false,
    mode: 'manual' as 'manual' | 'autoselect',
    preloadedFilesWithOffsets: [] as any[],
    isAutoSelectMode: false,
    manifestData: null as any
  };

  // Pinout modal state
  let showPinoutModal = false;

  // Meshtastic device modal state
  let showMeshtasticModal = false;

  async function openMeshtasticModal() {
    if (!MeshtasticDeviceModal) {
      MeshtasticDeviceModal = (await import('$lib/components/MeshtasticDeviceModal.svelte')).default;
    }
    showMeshtasticModal = true;
  }

  function closeMeshtasticModal() {
    showMeshtasticModal = false;
  }

  function openModal(options: {
    preloadedFilesWithOffsets?: any[];
    isAutoSelectMode?: boolean;
    manifestData?: any;
  } = {}) {
    if (options.isAutoSelectMode && options.manifestData) {
      // AutoSelect mode (with preloaded files or for download)
      modalState = {
        isOpen: true,
        mode: 'autoselect',
        preloadedFilesWithOffsets: options.preloadedFilesWithOffsets || [],
        isAutoSelectMode: true,
        manifestData: options.manifestData
      };
    } else {
      // Manual mode
      modalState = {
        isOpen: true,
        mode: 'manual',
        preloadedFilesWithOffsets: [],
        isAutoSelectMode: false,
        manifestData: null
      };
    }
  }

  function closeModal() {
    modalState.isOpen = false;
    modalState.preloadedFilesWithOffsets = [];
    modalState.isAutoSelectMode = false;
    modalState.manifestData = null;
  }

  // Load additional components only when needed
  $: if (currentInterfaceMode === InterfaceMode.FULL && !FirmwareInfo) {
    loadFullModeComponents();
  }

  $: if (currentInterfaceMode === InterfaceMode.MINIMAL && !MinimalFooter) {
    loadMinimalModeComponents();
  }

  async function loadFullModeComponents() {
    if (!FirmwareInfo) {
      const [FWInfo, NotesComp, FooterComp] = await Promise.all([
        import('$lib/components/FirmwareInfo.svelte'),
        import('$lib/components/Notes.svelte'),
        import('$lib/components/Footer.svelte')
      ]);

      FirmwareInfo = FWInfo.default;
      Notes = NotesComp.default;
      Footer = FooterComp.default;
    }
  }

  async function loadMinimalModeComponents() {
    if (!MinimalFooter) {
      const MinimalFooterComp = await import('$lib/components/MinimalFooter.svelte');
      MinimalFooter = MinimalFooterComp.default;
    }
  }

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

{#if currentInterfaceMode === InterfaceMode.MINIMAL}
  <!-- Minimal Interface Mode -->
  <div class="min-h-screen bg-gray-900 py-8">
    <div class="max-w-2xl mx-auto px-4 space-y-8">
      <!-- Title -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-orange-200">
          {$locales('page.main_title')}
        </h1>
      </div>

      <!-- Important Notice -->
      <ImportantNotice />

      <!-- Source Repository -->
      <div class="bg-gray-800 border border-orange-600 rounded-lg p-6">
        <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
          <span class="mr-3">
            {#if $loadingState.isLoadingAvailable}
              <span class="inline-block animate-spin">🌐</span>
            {:else}
              🌐
            {/if}
          </span>
          {$locales('page.source_repository')}
        </h2>
        <RepositorySelector />
      </div>

      <!-- Device Selection -->
      <div class="bg-gray-800 border border-orange-600 rounded-lg p-6">
        <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
          <span class="mr-3">
            {#if $loadingState.isLoadingAvailable}
              <span class="inline-block animate-spin">🎯</span>
            {:else}
              🎯
            {/if}
          </span>
          {$locales('page.device_selection')}
        </h2>
        <SelectDevice onOpenPinoutModal={() => showPinoutModal = true} />
      </div>

      <!-- Download Options -->
      <div class="bg-gray-800 border border-orange-600 rounded-lg p-6">
        <DownloadButtons
          on:openCustomFirmwareModal={(e) => openModal(e.detail)}
          on:openMeshtasticDeviceModal={openMeshtasticModal}
        />
      </div>

      <!-- Minimal Footer -->
      {#if MinimalFooter}
        <svelte:component this={MinimalFooter} />
      {:else}
        <!-- Loading placeholder -->
        <div class="h-16 bg-gray-700 rounded animate-pulse"></div>
      {/if}
    </div>

    </div>
{:else}
  <!-- Full Interface Mode -->
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
      <div class="flex flex-col md:flex-row gap-8">
        <!-- Left Column: Device Selection and Actions -->
        <div class="space-y-8 flex-1">
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
            <SelectDevice onOpenPinoutModal={() => showPinoutModal = true} />
          </div>

          <!-- Download Actions -->
          <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
            <DownloadButtons
              on:openCustomFirmwareModal={(e) => openModal(e.detail)}
              on:openMeshtasticDeviceModal={openMeshtasticModal}
            />
          </div>
        </div>

        <!-- Right Column: Information and Notes -->
        <div class="space-y-8 flex-1">
          <!-- Firmware Information -->
          <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
            <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
              <span class="mr-3">ℹ️</span>
              {$locales('page.firmware_information')}
            </h2>
            {#if FirmwareInfo}
            <svelte:component this={FirmwareInfo} />
          {:else}
            <!-- Loading placeholder -->
            <div class="h-64 bg-gray-700 rounded animate-pulse"></div>
          {/if}
          </div>
        </div>
      </div>
  
    <!-- Important Notes - Full Width Section -->
    <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg mt-8">
      <h2 class="text-xl font-bold text-orange-200 mb-6 flex items-center">
        <span class="mr-3">📝</span>
        {$locales('page.important_notes')}
      </h2>
      {#if Notes}
      <svelte:component this={Notes} />
    {:else}
      <!-- Loading placeholder -->
      <div class="h-48 bg-gray-700 rounded animate-pulse"></div>
    {/if}
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
    {#if Footer}
    <svelte:component this={Footer} />
  {:else}
    <!-- Loading placeholder -->
    <div class="h-32 bg-gray-700 rounded animate-pulse"></div>
  {/if}
  </div>
</BaseLayout>

{/if}

<!-- Custom Firmware Modal - Unified Instance -->
{#if modalState.isOpen}
<CustomFirmwareModal
  isOpen={modalState.isOpen}
  onClose={closeModal}
  preloadedFilesWithOffsets={modalState.preloadedFilesWithOffsets}
  isAutoSelectMode={modalState.isAutoSelectMode}
  manifestData={modalState.manifestData}
/>
{/if}

<!-- Pinout Modal - Unified Instance -->
{#if showPinoutModal}
<PinoutModal
  isOpen={showPinoutModal}
  onClose={() => showPinoutModal = false}
  devicePioTarget={deviceSelectionStore.devicePioTarget || ''}
/>
{/if}

{#if showMeshtasticModal && MeshtasticDeviceModal}
<svelte:component this={MeshtasticDeviceModal}
  isOpen={showMeshtasticModal}
  onClose={closeMeshtasticModal}
/>
{/if}

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

  </style>