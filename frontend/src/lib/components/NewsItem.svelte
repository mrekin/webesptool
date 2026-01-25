<script lang="ts">
  import { locale } from 'svelte-i18n';
  import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
  import type { NewsItem } from '$lib/types.js';

  export let item: NewsItem;

  let expanded = false;

  function toggle() {
    expanded = !expanded;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString($locale || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<div class="border border-gray-700 rounded-lg overflow-hidden">
  <button
    onclick={toggle}
    class="w-full flex items-center justify-between p-3 text-left transition-all duration-300
           bg-orange-900/20 hover:bg-orange-900/40 border-0"
    aria-expanded={expanded}
  >
    <div class="flex items-center space-x-2 flex-1 min-w-0">
      {#if item.is_pinned}
        <span class="text-orange-300 flex-shrink-0">📌</span>
      {/if}
      <div class="text-sm text-orange-100 font-medium">
        <MarkdownRenderer source={item.title_markdown} unwrap={true} />
      </div>
    </div>
    <div class="flex items-center space-x-2 flex-shrink-0 ml-2">
      <span class="text-xs text-gray-400">
        {formatDate(item.start_date)}
      </span>
      <span class="text-orange-300 transform transition-transform duration-300"
            style="transform: {expanded ? 'rotate(180deg)' : 'rotate(0deg)'}">
        ▼
      </span>
    </div>
  </button>

  {#if expanded}
    <div class="p-3 bg-gray-900 border-t border-gray-700 animate-fade-in">
      <MarkdownRenderer
        source={item.body_markdown}
        wrapperClass="prose prose-invert prose-sm max-w-none"
      />
    </div>
  {/if}
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }
</style>
