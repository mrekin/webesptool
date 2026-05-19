<script lang="ts">
    import { deviceDisplayInfo, firmwareDisplayInfo, loadingState } from '$lib/stores.js';
    import { DeviceType } from '$lib/types.js';
    import {
        isESP32Device,
        isNRF52Device,
        isRP2040Device,
        getDeviceTypeLabel
    } from '$lib/utils/deviceTypeUtils.js';
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
        <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
            <h2 class="mb-4 text-xl font-bold text-orange-200">
                {$locales('firmwareinfo.title')}
            </h2>

            <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-1">
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-medium text-orange-300"
                            >{$locales('common.version')}
                        </span>
                        <span class="font-mono text-orange-100">{displayInfo?.version}</span>
                    </div>

                    {#if displayInfo?.buildDate && displayInfo.buildDate !== 'Unknown'}
                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('common.build_date')}
                            </span>
                            <span class="text-orange-100">{displayInfo.buildDate}</span>
                        </div>
                    {/if}

                    {#if displayInfo?.latestTag}
                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('firmwareinfo.latest_tag')}
                            </span>
                            <span class="text-orange-100">{displayInfo.latestTag}</span>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Device Information -->
        {#if deviceInfo}
            <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                <h2 class="mb-4 text-xl font-bold text-orange-200">
                    {$locales('firmwareinfo.device_info')}
                </h2>

                <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-1">
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('common.device_name')}</span
                            >
                            <span class="text-orange-100">{deviceInfo.deviceName}</span>
                        </div>

                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('selectdevice.pio_target')}</span
                            >
                            <span class="text-orange-100">{deviceInfo.devicePioTarget}</span>
                        </div>

                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('common.platform')}</span
                            >
                            <span class="text-orange-100 uppercase"
                                >{getDeviceTypeLabel(deviceInfo.deviceType)}</span
                            >
                        </div>

                        <div class="flex items-center justify-between">
                            <span class="font-medium text-orange-300"
                                >{$locales('common.available_versions')}</span
                            >
                            <span class="text-orange-100"
                                >{deviceInfo.availableVersions?.length || 0} versions</span
                            >
                        </div>
                    </div>
                </div>

                <!-- Device Specific Information -->
                <div class="mt-6 mb-6">
                    <button
                        on:click={toggleDeviceInfo}
                        class="flex w-full items-center justify-between rounded border border-orange-600 bg-orange-900/30 p-3 text-left transition-all duration-300 hover:border-orange-500 hover:bg-orange-900/50"
                        aria-expanded={showDeviceInfo}
                        aria-controls="howto-content"
                    >
                        <h3 class="flex items-center text-lg font-semibold text-orange-200">
                            <span class="mr-2">📖</span>
                            {$locales('firmwareinfo.device_details')}
                        </h3>
                        <span
                            class="transform text-orange-300 transition-transform duration-300"
                            style="transform: {showDeviceInfo ? 'rotate(180deg)' : 'rotate(0deg)'}"
                        >
                            ▼
                        </span>
                    </button>

                    {#if showDeviceInfo}
                        <div id="howto-content" class="animate-fade-in mt-3 space-y-4">
                            <div class="text-sm text-orange-300">
                                {#if deviceInfo.deviceInfo?.markdownError === 'readme_not_found'}
                                    <div
                                        class="rounded border border-yellow-600 bg-yellow-900/20 py-8 text-center text-sm text-yellow-300"
                                    >
                                        {$locales('firmwareinfo.readme_not_found')}
                                    </div>
                                {:else if deviceInfo.deviceInfo?.markdownInfo}
                                    <MarkdownRenderer
                                        source={deviceInfo.deviceInfo.markdownInfo}
                                        wrapperClass="prose prose-invert max-w-none"
                                    />
                                {:else if deviceInfo}
                                    <div class="py-8 text-center text-sm text-orange-300">
                                        {$locales('firmwareinfo.no_device_info')}
                                    </div>
                                {:else}
                                    <div class="py-8 text-center text-sm text-orange-300">
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
            <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
                <h2 class="mb-4 text-xl font-bold text-orange-200">
                    {$locales('firmwareinfo.installation_instructions')}
                </h2>

                <div class="space-y-3 text-sm text-orange-100">
                    {#if isESP32Device(deviceInfo?.deviceType as DeviceType)}
                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">1.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.esp_web_tools')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.esp_web_tools_desc')}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">2.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.alternative_download')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.alternative_download_desc')}
                                </p>
                            </div>
                        </div>
                    {:else if isNRF52Device(deviceInfo?.deviceType as DeviceType)}
                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">1.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.uf2_download')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.uf2_download_desc')}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">2.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.device_bootloader')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.device_bootloader_desc')}
                                </p>
                            </div>
                        </div>
                    {:else if isRP2040Device(deviceInfo?.deviceType as DeviceType)}
                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">1.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.uf2_rp2040')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.uf2_rp2040_desc')}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">2.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.enter_bootloader')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.enter_bootloader_desc')}
                                </p>
                            </div>
                        </div>
                    {:else}
                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">1.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.download_firmware')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.download_firmware_desc')}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start space-x-3">
                            <span class="font-bold text-orange-400">2.</span>
                            <div>
                                <p class="font-medium text-orange-200">
                                    {$locales('firmwareinfo.follow_instructions')}
                                </p>
                                <p class="text-orange-300">
                                    {$locales('firmwareinfo.follow_instructions_desc')}
                                </p>
                            </div>
                        </div>
                    {/if}

                    <div
                        class="bg-opacity-30 mt-4 rounded border border-orange-600 bg-orange-900 p-3"
                    >
                        <p class="font-medium text-orange-200">
                            {$locales('firmwareinfo.important_warning')}
                        </p>
                        <p class="mt-1 text-xs text-orange-300">
                            {$locales('firmwareinfo.backup_warning')}
                        </p>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{:else if error}
    <div class="bg-opacity-30 rounded-lg border border-red-600 bg-red-900 p-6">
        <h2 class="mb-4 text-xl font-bold text-red-200">
            Error Loading {$locales('firmwareinfo.title')}
        </h2>
        <p class="text-sm text-red-300">{error}</p>
    </div>
{:else}
    <div class="rounded-lg border border-orange-600 bg-gray-800 p-6">
        <h2 class="mb-4 text-xl font-bold text-orange-200">{$locales('firmwareinfo.title')}</h2>
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
