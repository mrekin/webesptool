<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import type { StatsDataItem } from '$lib/types';

    export let title: string = '';
    export let items: StatsDataItem[] | null = null;
    export let isLoading: boolean = false;
    export let error: string | null = null;
    export let nameMapper: ((key: string) => string) | undefined = undefined;

    $: maxCount = items && items.length > 0 ? Math.max(...items.map((i) => i.count)) : 0;

    function getDisplayName(key: string): string {
        if (nameMapper) {
            return nameMapper(key);
        }
        return key;
    }
</script>

<div class="space-y-2">
    <h3 class="text-sm font-medium text-orange-200">{title}</h3>

    {#if isLoading}
        <div class="space-y-2">
            {#each { length: 5 } as _}
                <div class="flex items-center gap-3">
                    <div class="h-4 w-24 animate-pulse rounded bg-gray-700"></div>
                    <div class="h-4 flex-1 animate-pulse rounded bg-gray-700"></div>
                    <div class="h-4 w-12 animate-pulse rounded bg-gray-700"></div>
                </div>
            {/each}
        </div>
    {:else if error}
        <p class="py-2 text-xs text-red-400">{$locales('stats.error_loading')}</p>
    {:else if !items || items.length === 0}
        <p class="py-2 text-xs text-gray-500">{$locales('stats.no_data')}</p>
    {:else}
        <div class="space-y-1.5">
            {#each items as item}
                {@const width = maxCount > 0 ? (item.count / maxCount) * 100 : 0}
                {@const displayName = getDisplayName(item.key)}
                <div class="flex items-center gap-3">
                    <span class="w-[240px] shrink-0 text-xs text-gray-300" title={displayName}>
                        {displayName}
                    </span>
                    <div class="flex-1 rounded bg-gray-700">
                        <div
                            class="rounded bg-orange-500 transition-all duration-300"
                            style="width: {width}%; min-height: 16px;"
                        ></div>
                    </div>
                    <span class="min-w-[50px] text-right text-xs tabular-nums text-gray-400">
                        {item.count}
                    </span>
                </div>
            {/each}
        </div>
    {/if}
</div>
