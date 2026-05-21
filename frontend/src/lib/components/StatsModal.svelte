<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy } from 'svelte';
    import { apiService } from '$lib/api.js';
    import { deviceNames } from '$lib/stores.js';
    import StatsBarChart from './StatsBarChart.svelte';
    import type { StatsDataItem } from '$lib/types';

    export let isOpen: boolean = false;
    export let onClose: () => void = () => {};

    const periods = [7, 30, 90] as const;
    let selectedPeriod: number = 30;
    let isLoading: boolean = false;
    let error: string | null = null;

    let reposData: StatsDataItem[] | null = null;
    let devicesData: StatsDataItem[] | null = null;
    let versionsData: StatsDataItem[] | null = null;

    let reposError: string | null = null;
    let devicesError: string | null = null;
    let versionsError: string | null = null;

    function mapDeviceName(key: string): string {
        return $deviceNames[key] || key;
    }

    async function loadStats() {
        isLoading = true;
        error = null;
        reposError = null;
        devicesError = null;
        versionsError = null;

        const requests = [
            apiService.getStatsDownloads('repository', selectedPeriod, 10),
            apiService.getStatsDownloads('device', selectedPeriod, 10),
            apiService.getStatsDownloads('version', selectedPeriod, 10)
        ];

        const results = await Promise.allSettled(requests);

        if (results[0].status === 'fulfilled') {
            reposData = results[0].value.data;
        } else {
            reposError = results[0].reason?.message || 'Error';
        }

        if (results[1].status === 'fulfilled') {
            devicesData = results[1].value.data;
        } else {
            devicesError = results[1].reason?.message || 'Error';
        }

        if (results[2].status === 'fulfilled') {
            versionsData = results[2].value.data;
        } else {
            versionsError = results[2].reason?.message || 'Error';
        }

        isLoading = false;
    }

    function handlePeriodChange(period: number) {
        selectedPeriod = period;
        loadStats();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            onClose();
        }
    }

    $: if (isOpen) {
        loadStats();
    }

    onMount(() => {
        window.addEventListener('keydown', handleKeydown);
    });

    onDestroy(() => {
        window.removeEventListener('keydown', handleKeydown);
    });
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        on:click={() => onClose()}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl"
            on:click|stopPropagation={() => {}}
        >
            <!-- Header -->
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-4">
                <h2 class="text-lg font-semibold text-orange-200">{$locales('stats.title')}</h2>

                <!-- Period Selector -->
                <div class="flex items-center gap-2">
                    {#each periods as period}
                        <button
                            type="button"
                            on:click={() => handlePeriodChange(period)}
                            class="rounded-md px-3 py-1 text-xs font-medium transition-colors {selectedPeriod === period
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-700 text-orange-300 hover:bg-gray-600'}"
                        >
                            {$locales(`stats.period_${period}`)}
                        </button>
                    {/each}
                </div>

                <!-- Close button -->
                <button
                    type="button"
                    on:click={onClose}
                    class="ml-3 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    aria-label="Close"
                >
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div class="space-y-6 px-6 py-5">
                <StatsBarChart
                    title={$locales('stats.top_repositories')}
                    items={reposData}
                    isLoading={isLoading && !reposData && !reposError}
                    error={reposError}
                />

                <StatsBarChart
                    title={$locales('stats.top_devices')}
                    items={devicesData}
                    isLoading={isLoading && !devicesData && !devicesError}
                    error={devicesError}
                    nameMapper={mapDeviceName}
                />

                <StatsBarChart
                    title={$locales('stats.top_versions')}
                    items={versionsData}
                    isLoading={isLoading && !versionsData && !versionsError}
                    error={versionsError}
                />
            </div>
        </div>
    </div>
{/if}
