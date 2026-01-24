<script lang="ts">
  import { locale } from 'svelte-i18n';
  import Markdown from '@humanspeak/svelte-markdown';
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

  // Custom renderer for links (same as in MarkdownRenderer)
  const renderer = {
    link: (href: string, title: string | null, text: string) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">${text}</a>`;
    },
  };
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
      <div class="text-sm text-orange-100 font-medium prose prose-invert prose-sm max-w-none">
        <Markdown
          source={item.title_markdown}
          {renderer}
          breaks={true}
          linkify={true}
        />
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
      <div class="prose prose-invert prose-sm max-w-none">
        <Markdown
          source={item.body_markdown}
          {renderer}
          breaks={true}
          linkify={true}
        />
      </div>
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
