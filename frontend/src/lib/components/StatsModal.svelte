<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { apiService } from '$lib/api.js';
    import { deviceNames } from '$lib/stores.js';
    import StatsBarChart from './StatsBarChart.svelte';
    import ModalWindowControls from './ModalWindowControls.svelte';
    import ModalShareFallback from './ModalShareFallback.svelte';
    import type { StatsDataItem } from '$lib/types';

    interface Props {
        isOpen?: boolean;
        onClose?: () => void;
    }

    let { isOpen = false, onClose = () => {} }: Props = $props();

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);

    const periods = [7, 30, 90] as const;
    let selectedPeriod = $state(30);
    let isLoading = $state(false);
    let error = $state<string | null>(null);

    let reposData = $state<StatsDataItem[] | null>(null);
    let devicesData = $state<StatsDataItem[] | null>(null);
    let versionsData = $state<StatsDataItem[] | null>(null);

    let reposError = $state<string | null>(null);
    let devicesError = $state<string | null>(null);
    let versionsError = $state<string | null>(null);

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

    // Reload stats each time the modal opens. Period changes reload explicitly
    // via handlePeriodChange, so reads inside loadStats stay untracked to keep
    // the effect depending on isOpen only (legacy "$:" semantics).
    $effect(() => {
        if (isOpen) {
            untrack(() => loadStats());
        }
    });

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-modal-title"
        tabindex="-1"
        onclick={() => onClose()}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl"
            onclick={(e) => e.stopPropagation()}
        >
            <!-- Header -->
            <div
                class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-4"
            >
                <h2 id="stats-modal-title" class="text-lg font-semibold text-orange-200">
                    {$locales('stats.title')}
                </h2>

                <!-- Period Selector -->
                <div class="flex items-center gap-2">
                    {#each periods as period (period)}
                        <button
                            type="button"
                            onclick={() => handlePeriodChange(period)}
                            class="rounded-md px-3 py-1 text-xs font-medium transition-colors {selectedPeriod ===
                            period
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-700 text-orange-300 hover:bg-gray-600'}"
                        >
                            {$locales(`stats.period_${period}`)}
                        </button>
                    {/each}
                </div>

                <!-- Window controls cluster (task 83) -->
                <ModalWindowControls
                    shareId="stats"
                    bind:shareFallbackUrl={shareFallbackUrl}
                    onclose={onClose}
                />
            </div>

            {#if shareFallbackUrl}
                <ModalShareFallback url={shareFallbackUrl} />
            {/if}

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
