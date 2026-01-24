<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
  import { locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { apiService } from '$lib/api.js';
  import type { NewsItem } from '$lib/types.js';
  import Markdown from '@humanspeak/svelte-markdown';

  export let isOpen: boolean = false;
  export let onClose: () => void = () => {};

  let allNews: NewsItem[] = [];
  let loading = false;
  let offset = 0;
  let hasMore = true;

  async function loadArchive() {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const currentLocale = $locale;
      if (!currentLocale) {
        return;
      }
      // lang is REQUIRED, offset and limit handled by backend config defaults
      const response = await apiService.getNewsArchive(currentLocale, offset);
      const newItems = response.news;
      allNews = [...allNews, ...newItems];
      offset += newItems.length;
      hasMore = newItems.length > 0;
    } catch (e) {
      console.error('Failed to load archive:', e);
      hasMore = false;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (isOpen) {
      allNews = [];
      offset = 0;
      hasMore = true;
      loadArchive();
    }
  });

  $: if (isOpen) {
    loadArchive();
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      loadArchive();
    }
  }

  function isExpired(item: NewsItem): boolean {
    if (!item.end_date) return false;
    return new Date(item.end_date) < new Date();
  }

  // Custom renderer for links
  const renderer = {
    link: (href: string, title: string | null, text: string) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">${text}</a>`;
    },
  };

  function closeOnEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto"
    onkeydown={closeOnEscape}
    role="dialog"
    aria-modal="true"
  >
    <div class="min-h-full flex items-center justify-center">
      <div class="w-full max-w-4xl max-h-screen overflow-y-auto rounded-xl border border-orange-600
                    bg-gray-800 shadow-2xl shadow-orange-900/50 my-4">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-700 p-6 sticky top-0 bg-gray-800 z-10">
          <h2 class="text-xl font-semibold text-orange-200">
            {$locales('news.archive_title')}
          </h2>
          <button onclick={onClose} class="text-gray-400 hover:text-gray-200 text-2xl">
            ✕
          </button>
        </div>

        <!-- Content -->
        <div class="p-6" onscroll={handleScroll}>
          {#if allNews.length === 0 && !loading}
            <div class="text-center text-gray-400 py-12">
              {$locales('news.no_news')}
            </div>
          {:else}
            <div class="space-y-3">
              {#each allNews as item (item.id)}
                <div class="p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex-1">
                      {#if item.is_pinned}
                        <span class="text-orange-300 mr-2">📌</span>
                      {/if}
                      <h3 class="text-orange-200 font-medium prose prose-invert prose-sm max-w-none">
                        <Markdown
                          source={item.title_markdown}
                          {renderer}
                          breaks={true}
                          linkify={true}
                        />
                      </h3>
                    </div>
                    {#if isExpired(item)}
                      <span class="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded ml-2 flex-shrink-0">
                        {$locales('news.expired')}
                      </span>
                    {/if}
                  </div>
                  <p class="text-sm text-gray-400">
                    {new Date(item.start_date).toLocaleDateString()}
                  </p>
                </div>
              {/each}
            </div>
          {/if}

          {#if loading}
            <div class="text-center text-gray-400 py-4">
              <span class="inline-block animate-spin">⏳</span>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="flex justify-end border-t border-gray-700 p-6 sticky bottom-0 bg-gray-800">
          <button onclick={onClose} class="rounded-md bg-gray-700 px-4 py-2 text-gray-300">
            {$locales('common.close')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
