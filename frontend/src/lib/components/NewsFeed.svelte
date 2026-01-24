<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { apiService } from '$lib/api.js';
  import type { NewsItem } from '$lib/types.js';
  import NewsItemComponent from '$lib/components/NewsItem.svelte';
  import NewsArchiveModal from '$lib/components/NewsArchiveModal.svelte';

  let news: NewsItem[] = [];
  let loading = false;
  let showArchive = false;

  async function loadNews() {
    loading = true;
    try {
      const currentLocale = $locale;
      if (!currentLocale) {
        news = [];
        return;
      }
      // lang is REQUIRED, limit uses config default from backend
      const response = await apiService.getNews(currentLocale);
      news = response.news;
    } catch (e) {
      console.error('Failed to load news:', e);
      news = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadNews();
  });

  // Re-render when locale changes
  $: if ($locale) {
    loadNews();
  }

  function openArchive() {
    showArchive = true;
  }
</script>

{#if news.length > 0}
  <div class="p-6 bg-gray-800 border border-orange-600 rounded-lg">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-orange-200 flex items-center">
        <span class="mr-3">📰</span>
        {$locales('news.title')}
      </h2>
      {#if news.length > 0}
        <button
          onclick={openArchive}
          class="text-sm text-orange-300 hover:text-orange-100 transition-colors"
        >
          {$locales('news.view_all')}
        </button>
      {/if}
    </div>

    <div class="space-y-3">
      {#each news as item (item.id)}
        <NewsItemComponent {item} />
      {/each}
    </div>
  </div>
{/if}

{#if showArchive}
  <NewsArchiveModal
    isOpen={showArchive}
    onClose={() => showArchive = false}
  />
{/if}
