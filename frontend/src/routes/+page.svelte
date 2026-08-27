<script lang="ts">
    import BaseLayout from '$lib/components/BaseLayout.svelte';
    import SelectDevice from '$lib/components/SelectDevice.svelte';
    import DownloadButtons from '$lib/components/DownloadButtons.svelte';
    import ImportantNotice from '$lib/components/ImportantNotice.svelte';
    // Components needed in both modes, so import statically
    import RepositorySelector from '$lib/components/RepositorySelector.svelte';
    import CustomFirmwareModal from '$lib/components/CustomFirmwareModal.svelte';
    import PinoutModal from '$lib/components/PinoutModal.svelte';

    // Dynamic imports for components used only in specific modes.
    // Holders must be $state in runes mode so the template re-renders
    // once the async import resolves.
    let FirmwareInfo = $state<any>(null);
    let Notes = $state<any>(null);
    let Footer = $state<any>(null);
    let MinimalFooter = $state<any>(null);
    let MeshtasticDeviceModal = $state<any>(null);
    let MeshcoreConfigModal = $state<any>(null);
    let StatsModal = $state<any>(null);
    let NewsFeed = $state<any>(null);
    import { loadingState, uiState, deviceSelection, isDeviceSelected } from '$lib/stores.js';
    import { onMount, onDestroy } from 'svelte';
    import { _ as locales } from 'svelte-i18n';
    import { InterfaceMode } from '$lib/types.js';
    import type { PickerResult } from '$lib/types.js';
    import {
        addressableModal,
        initAddressableModals,
        disposeAddressableModals,
        closeAddressableModal
    } from '$lib/utils/modalRoutes.js';

    // Merged layout server data — carries the deploy-time header disclaimer
    // (see routes/+layout.server.ts). Empty string on the primary instance.
    let { data }: { data: App.PageData } = $props();

    // Unified modal state
    let modalState = $state({
        isOpen: false,
        mode: 'manual' as 'manual' | 'autoselect',
        preloadedFilesWithOffsets: [] as any[],
        isAutoSelectMode: false,
        manifestData: null as any
    });

    // Pinout modal state
    let showPinoutModal = $state(false);

    // Meshtastic device modal state
    let showMeshtasticModal = $state(false);

    // Meshcore configurator modal state
    let showMeshcoreConfigModal = $state(false);

    // Stats modal state
    let showStatsModal = $state(false);

    async function openStatsModal() {
        if (!StatsModal) {
            StatsModal = (await import('$lib/components/StatsModal.svelte')).default;
        }
        showStatsModal = true;
    }

    function closeStatsModal() {
        showStatsModal = false;
    }

    async function openMeshtasticModal() {
        if (!MeshtasticDeviceModal) {
            MeshtasticDeviceModal = (await import('$lib/components/MeshtasticDeviceModal.svelte'))
                .default;
        }
        showMeshtasticModal = true;
    }

    function closeMeshtasticModal() {
        showMeshtasticModal = false;
    }

    async function openMeshcoreConfigModal() {
        if (!MeshcoreConfigModal) {
            MeshcoreConfigModal = (await import('$lib/components/MeshcoreConfigModal.svelte'))
                .default;
        }
        showMeshcoreConfigModal = true;
    }

    function closeMeshcoreConfigModal() {
        showMeshcoreConfigModal = false;
    }

    // Direct-URL coordinate picker (task 78, ?m=coords). Loaded dynamically on
    // first open — the picker pulls Leaflet in lazily and must not enter the
    // main page bundle.
    let CoordinateMapPickerComp = $state<any>(null);

    // Point picked in the direct-URL picker, handed over to the configurator
    // via its directPickerResult prop; reset by onDirectPickerApplied.
    let pendingDirectPickerResult = $state<PickerResult | null>(null);

    const directPickerOpen = $derived($addressableModal === 'coords');

    // Effects run client-side only, so the lazy import never fires during SSR
    $effect(() => {
        if (directPickerOpen && !CoordinateMapPickerComp) {
            import('$lib/components/CoordinateMapPicker.svelte').then(
                (m) => (CoordinateMapPickerComp = m.default)
            );
        }
    });

    // "Apply" from the direct-URL picker: open the configurator (existing
    // dynamic import + flag) and close the addressable modal — history.back()
    // clears the address, the picker unmounts on popstate.
    async function applyDirectPickerResult(res: PickerResult) {
        pendingDirectPickerResult = res;
        await openMeshcoreConfigModal();
        closeAddressableModal();
    }

    function openModal(
        options: {
            preloadedFilesWithOffsets?: any[];
            isAutoSelectMode?: boolean;
            manifestData?: any;
        } = {}
    ) {
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

    // Load additional components only when needed (client-side only: effects
    // do not execute during SSR)
    $effect(() => {
        if ($uiState.interfaceMode === InterfaceMode.FULL && !FirmwareInfo) {
            loadFullModeComponents();
        }
    });

    $effect(() => {
        if ($uiState.interfaceMode === InterfaceMode.MINIMAL && !MinimalFooter) {
            loadMinimalModeComponents();
        }
    });

    async function loadFullModeComponents() {
        if (!FirmwareInfo) {
            const [FWInfo, NotesComp, FooterComp, NewsFeedComp] = await Promise.all([
                import('$lib/components/FirmwareInfo.svelte'),
                import('$lib/components/Notes.svelte'),
                import('$lib/components/Footer.svelte'),
                import('$lib/components/NewsFeed.svelte')
            ]);

            FirmwareInfo = FWInfo.default;
            Notes = NotesComp.default;
            Footer = FooterComp.default;
            NewsFeed = NewsFeedComp.default;
        }
    }

    async function loadMinimalModeComponents() {
        if (!MinimalFooter) {
            const MinimalFooterComp = await import('$lib/components/MinimalFooter.svelte');
            MinimalFooter = MinimalFooterComp.default;
        }
    }

    // Page title: localized base + optional deploy-time disclaimer suffix.
    // Disclaimer is a single non-localized instance marker (e.g. "(mirror");
    // when empty (primary instance) the title is exactly the base, no artifacts.
    const disclaimer = $derived(data.disclaimer ?? '');
    const pageTitle = $derived($locales('page.main_title') + (disclaimer ? ` ${disclaimer}` : ''));

    // Set page title on mount (browser side only)
    onMount(() => {
        initAddressableModals();
        if (typeof document !== 'undefined') {
            document.title = pageTitle;
        }
    });

    // Addressable-modals controller teardown (hygiene for HMR/future changes).
    onDestroy(() => {
        disposeAddressableModals();
    });
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={$locales('page.meta_description')} />
    <meta name="keywords" content="meshtastic, firmware, esp32, lora, mesh network" />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={$locales('page.main_description')} />
    <meta property="og:type" content="website" />
</svelte:head>

{#if $uiState.interfaceMode === InterfaceMode.MINIMAL}
    <!-- Minimal Interface Mode -->
    <div class="min-h-screen bg-gray-900 py-8">
        <div class="mx-auto max-w-2xl space-y-8 px-4">
            <!-- Title -->
            <div class="text-center">
                <h1 class="text-2xl font-bold text-orange-200">
                    {pageTitle}
                </h1>
            </div>

            <!-- Important Notice -->
            <ImportantNotice />

            <!-- Source Repository -->
            <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                <h2 class="mb-6 flex items-center text-xl font-bold text-orange-200">
                    <span class="mr-3">
                        {#if $loadingState.isLoadingAvailable}
                            <span class="inline-block animate-spin">🌐</span>
                        {:else}
                            🌐
                        {/if}
                    </span>
                    {$locales('page.source_repository')}
                </h2>
                <RepositorySelector onOpenStats={openStatsModal} />
            </div>

            <!-- Device Selection -->
            <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                <h2 class="mb-6 flex items-center text-xl font-bold text-orange-200">
                    <span class="mr-3">
                        {#if $loadingState.isLoadingAvailable}
                            <span class="inline-block animate-spin">🎯</span>
                        {:else}
                            🎯
                        {/if}
                    </span>
                    {$locales('page.device_selection')}
                </h2>
                <SelectDevice onOpenPinoutModal={() => (showPinoutModal = true)} />
            </div>

            <!-- Download Options -->
            <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                <DownloadButtons
                    onOpenCustomFirmware={openModal}
                    onOpenMeshtasticDevice={openMeshtasticModal}
                    onOpenMeshcoreConfig={openMeshcoreConfigModal}
                />
            </div>

            <!-- Minimal Footer -->
            {#if MinimalFooter}
                <MinimalFooter />
            {:else}
                <!-- Loading placeholder -->
                <div class="h-16 animate-pulse rounded bg-gray-700"></div>
            {/if}
        </div>
    </div>
{:else}
    <!-- Full Interface Mode -->
    <BaseLayout>
        {#snippet head()}
            <!-- Header Section -->
            <div class="space-y-4 text-center">
                <h1 class="mb-4 text-3xl font-bold text-orange-200 md:text-4xl">
                    {pageTitle}
                </h1>

                <div class="mx-auto max-w-2xl">
                    <p class="text-lg text-orange-300">
                        {$locales('page.main_description')}
                    </p>
                </div>

                <div class="mx-auto mt-2 max-w-6xl">
                    <ImportantNotice />
                </div>

                <!-- Error State -->
                {#if $loadingState.error}
                    <div class="mt-6">
                        <div class="mx-auto max-w-6xl">
                            <div
                                class="bg-opacity-90 rounded-lg border border-red-600 bg-gray-800 p-4"
                            >
                                <div class="flex flex-wrap items-center justify-between gap-4">
                                    <div class="flex items-center space-x-3">
                                        <h2 class="text-lg font-semibold text-red-200">
                                            ❌ {$locales('page.error')}
                                        </h2>
                                        <p class="text-red-300">{$loadingState.error}</p>
                                    </div>
                                    <button
                                        onclick={() => window.location.reload()}
                                        class="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                                    >
                                        {$locales('page.reload_page')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Repository Selection -->
                {#if !$loadingState.error}
                    <div class="mt-6">
                        <div class="mx-auto max-w-6xl">
                            <div
                                class="bg-opacity-90 rounded-lg border border-orange-600 bg-gray-800 p-4"
                            >
                                <div class="flex flex-wrap items-center justify-between gap-4">
                                    <div class="flex flex-1 items-center space-x-3">
                                        <span class="flex items-center font-medium text-orange-200">
                                            <span class="mr-2 inline-block w-5 text-center">
                                                {#if $loadingState.isLoadingAvailable}
                                                    <!-- Spinning globe emoji during loading -->
                                                    <span class="inline-block animate-spin">🌐</span
                                                    >
                                                {:else}
                                                    <!-- Static globe emoji when not loading -->
                                                    🌐
                                                {/if}
                                            </span>
                                            {$locales('page.source_repository')}
                                        </span>
                                        <RepositorySelector onOpenStats={openStatsModal} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {/snippet}

        {#snippet content()}
            <!-- Main Content Area -->
            <div class="space-y-8">
                <!-- Main Content Column -->
                <div class="flex flex-col gap-8 md:flex-row">
                    <!-- Left Column: Device Selection and Actions -->
                    <div class="flex-1 space-y-8">
                        <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                            <h2 class="mb-6 flex items-center text-xl font-bold text-orange-200">
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
                            <SelectDevice onOpenPinoutModal={() => (showPinoutModal = true)} />
                        </div>

                        <!-- Download Actions -->
                        <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                            <DownloadButtons
                                onOpenCustomFirmware={openModal}
                                onOpenMeshtasticDevice={openMeshtasticModal}
                                onOpenMeshcoreConfig={openMeshcoreConfigModal}
                            />
                        </div>
                    </div>

                    <!-- Right Column: Information and Notes -->
                    <div class="flex flex-1 flex-col gap-8">
                        <!-- Firmware Information (mounted only after a device is selected) -->
                        {#if $isDeviceSelected}
                            <div
                                class="animate-fade-in rounded-lg border border-orange-600 bg-gray-800 p-6"
                            >
                                <h2
                                    class="mb-6 flex items-center text-xl font-bold text-orange-200"
                                >
                                    <span class="mr-3">ℹ️</span>
                                    {$locales('page.firmware_information')}
                                </h2>
                                {#if FirmwareInfo}
                                    <FirmwareInfo />
                                {:else}
                                    <!-- Loading placeholder -->
                                    <div class="h-64 animate-pulse rounded bg-gray-700"></div>
                                {/if}
                            </div>
                        {/if}

                        <!-- News Feed -->
                        {#if NewsFeed}
                            <NewsFeed />
                        {/if}
                    </div>
                </div>

                <!-- Important Notes - Full Width Section -->
                <div class="mt-8 rounded-lg border border-orange-600 bg-gray-800 p-6">
                    <h2 class="mb-6 flex items-center text-xl font-bold text-orange-200">
                        <span class="mr-3">📝</span>
                        {$locales('page.important_notes')}
                    </h2>
                    {#if Notes}
                        <Notes />
                    {:else}
                        <!-- Loading placeholder -->
                        <div class="h-48 animate-pulse rounded bg-gray-700"></div>
                    {/if}
                </div>
                <!-- Information section -->
                {#if !$loadingState.error}
                    <div class="mx-auto mt-8 max-w-4xl">
                        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2"></div>
                    </div>
                {/if}
            </div>
        {/snippet}

        {#snippet footer()}
            {#if Footer}
                <Footer />
            {:else}
                <!-- Loading placeholder -->
                <div class="h-32 animate-pulse rounded bg-gray-700"></div>
            {/if}
        {/snippet}
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
        onClose={() => (showPinoutModal = false)}
        devicePioTarget={$deviceSelection.devicePioTarget || ''}
    />
{/if}

{#if showMeshtasticModal && MeshtasticDeviceModal}
    <MeshtasticDeviceModal isOpen={showMeshtasticModal} onClose={closeMeshtasticModal} />
{/if}

{#if showMeshcoreConfigModal && MeshcoreConfigModal}
    <MeshcoreConfigModal
        isOpen={showMeshcoreConfigModal}
        onClose={closeMeshcoreConfigModal}
        directPickerResult={pendingDirectPickerResult}
        onDirectPickerApplied={() => (pendingDirectPickerResult = null)}
    />
{/if}

{#if showStatsModal && StatsModal}
    <StatsModal isOpen={showStatsModal} onClose={closeStatsModal} />
{/if}

<!-- Direct-URL coordinate picker (task 78): opened by ?m=coords over any
     state; default picker state (no lat/lon props). Rendered last so it lies
     above every other modal in the DOM. -->
{#if directPickerOpen && CoordinateMapPickerComp}
    <CoordinateMapPickerComp
        direct={true}
        onconfirm={applyDirectPickerResult}
        onclose={closeAddressableModal}
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

    /* Fade-in for the firmware info card appearing after device selection */
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out;
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
