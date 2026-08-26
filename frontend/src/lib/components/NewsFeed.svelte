<script lang="ts">
    import { _ as locales, locale } from 'svelte-i18n';
    import { newsFeedState, newsActions } from '$lib/stores.js';
    import { setCookie } from '$lib/utils/cookies.js';
    import NewsModal from './NewsModal.svelte';

    let showModal = $state(false);
    // News id whose headline was clicked (highlighted in the modal); null if
    // the modal was opened via the "All news" button
    let openedNewsId: number | null = $state(null);

    const COOKIE_NAME = 'last_read_news_id';

    function handleOpenModal(itemId: number | null = null) {
        openedNewsId = itemId;
        showModal = true;
        markAsRead();
    }

    function handleCloseModal() {
        showModal = false;
    }

    // Mark all currently listed news as read: cookie holds the max id
    function markAsRead() {
        const ids = $newsFeedState.items.map((item) => item.id);
        if (ids.length > 0) {
            setCookie(COOKIE_NAME, String(Math.max(...ids)), 365);
        }
    }

    // Format date as YYYY.MM.DD
    function formatDateToYMD(dateStr: string): string {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
    }

    // Strip markdown for compact view
    function stripMarkdown(text: string): string {
        return text
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/`/g, '')
            .trim();
    }

    // Cap the headline for the compact row view
    function capTitle(text: string): string {
        return text.length > 60 ? text.slice(0, 60).trim() + '…' : text;
    }

    // Load news on mount and whenever the locale changes
    $effect(() => {
        if ($locale) {
            newsActions.loadNews($locale);
        }
    });
</script>

<!-- md+: basis-0 (absolute) so the card never grows the page - it fills the
     column leftover; headlines that do not fit are clipped (no inner scroll,
     full list is available via the modal). Below md the card is content-sized
     (all headlines visible). -->
<div
    class="flex min-h-[10.5rem] flex-col rounded-lg border border-orange-600 bg-gray-800 p-6 md:grow md:basis-0"
>
    <div class="mb-6 flex items-center justify-between">
        <h2 class="flex items-center text-xl font-bold text-orange-200">
            <span class="mr-3">📰</span>
            {$locales('news.title')}
        </h2>
        <button
            onclick={() => handleOpenModal()}
            class="text-sm text-orange-400 hover:text-orange-300 hover:underline"
        >
            {$locales('news.all')}
        </button>
    </div>

    {#if $newsFeedState.loading}
        <!-- Loading skeletons (one per headline row) -->
        <div class="flex-1 space-y-3">
            {#each [0, 1, 2] as i (i)}
                <div class="h-6 animate-pulse rounded bg-gray-700"></div>
            {/each}
        </div>
    {:else if $newsFeedState.failed}
        <!-- Local card error - not a global application error -->
        <div class="flex-1 text-sm text-gray-400">{$locales('news.load_error')}</div>
    {:else if $newsFeedState.items.length === 0}
        <!-- No news for the current language -->
        <div class="flex-1 text-sm text-gray-400">{$locales('news.no_news')}</div>
    {:else}
        <!-- Headlines in date order (pinned excluded - modal only); non-fitting
             rows are clipped, the full list is available via the modal -->
        <div class="min-h-0 flex-1 divide-y divide-gray-700 overflow-hidden">
            {#each $newsFeedState.items as item (item.id)}
                <button
                    onclick={() => handleOpenModal(item.id)}
                    class="flex w-full items-center gap-2 py-2 text-left hover:bg-gray-900"
                >
                    <span class="min-w-0 flex-1 truncate text-sm text-gray-200">
                        {capTitle(stripMarkdown(item.title_markdown))}
                    </span>
                    <span class="shrink-0 whitespace-nowrap text-xs text-gray-400">
                        {formatDateToYMD(item.start_date)}
                    </span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<!-- Full news viewer -->
<NewsModal isOpen={showModal} onClose={handleCloseModal} focusItemId={openedNewsId} />
