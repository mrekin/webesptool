<script lang="ts">
  import { onMount } from 'svelte';
  import SvelteMarkdown from 'svelte-markdown';
  import { insertDoc } from '$lib/utils/markdown';
  import { locale } from 'svelte-i18n';
  import { get } from 'svelte/store';

  // Props
  interface Props {
    filename: string;
    class?: string;
    wrapperClass?: string;
    hide?: boolean;
  }

  let {
    filename,
    class: className = '',
    wrapperClass = 'prose prose-invert max-w-none',
    hide = false
  }: Props = $props();

  // State
  let content = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);
  let currentLocale = $state(get(locale));
  let spoilerTitle = $state('');
  let isSpoilerOpen = $state(false);

  // Extract first heading (H1, H2, or H3) from content for spoiler title
  function extractFirstHeading(markdown: string): string {
    // Try to find H1 (#), then H2 (##), then H3 (###)
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1];

    const h2Match = markdown.match(/^##\s+(.+)$/m);
    if (h2Match) return h2Match[1];

    const h3Match = markdown.match(/^###\s+(.+)$/m);
    if (h3Match) return h3Match[1];

    // If no heading found, use formatted filename without extension
    const cleanFilename = filename.replace(/\.md$/, '').replace(/.*[\/\\]/, '');
    // Convert filename to readable format (replace underscores/hyphens with spaces, capitalize first letter)
    return cleanFilename.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // Load markdown content
  async function loadContent() {
    try {
      loading = true;
      error = null;

      if (!filename) {
        throw new Error('Filename is required');
      }

      const markdownContent = await insertDoc(filename);

      if (!markdownContent) {
        throw new Error(`Content not found for file: ${filename}`);
      }

      content = markdownContent;
      spoilerTitle = extractFirstHeading(markdownContent);
      console.info(`[MarkdownRenderer] Successfully loaded: ${filename} for locale: ${currentLocale}`);
    } catch (err) {
      console.error('Failed to load markdown content:', err);
      error = err instanceof Error ? err.message : 'Failed to load content';
      content = '';
    } finally {
      loading = false;
    }
  }

  // Subscribe to locale changes and reload content when locale changes
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    loadContent();

    // Subscribe to locale changes
    unsubscribe = locale.subscribe((newLocale) => {
      if (newLocale !== currentLocale) {
        currentLocale = newLocale;
        loadContent();
      }
    });
  });

  // Cleanup subscription when component is destroyed
  $effect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  });

  // Custom renderer for links to open in new tab
  const renderers = {
    link: ({ href, children }: { href: string; children: any[] }) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">${children.join('')}</a>`;
    },
    code: (props: { inline: boolean; children: string }) => {
      if (props.inline) {
        return `<code class="px-1 py-0.5 bg-gray-700 text-gray-200 rounded text-sm">${props.children}</code>`;
      }
      return `<pre class="bg-gray-800 p-4 rounded-lg overflow-x-auto"><code class="text-gray-200">${props.children}</code></pre>`;
    },
    blockquote: (props: { children: any[] }) => {
      return `<blockquote class="border-l-4 border-gray-500 pl-4 italic text-gray-300">${props.children}</blockquote>`;
    },
    table: (props: { children: any[] }) => {
      return `<div class="overflow-x-auto my-4"><table class="min-w-full border-collapse border border-gray-600">${props.children}</table></div>`;
    },
    th: (props: { children: any[] }) => {
      return `<th class="border border-gray-600 px-4 py-2 bg-gray-700 text-left font-semibold">${props.children}</th>`;
    },
    td: (props: { children: any[] }) => {
      return `<td class="border border-gray-600 px-4 py-2">${props.children}</td>`;
    }
  };
</script>

<div class="{wrapperClass} {className}">
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      <span class="ml-3 text-gray-400">Loading content...</span>
    </div>
  {:else if error}
    <div class="bg-red-900 bg-opacity-20 border border-red-600 rounded-lg p-4">
      <h3 class="text-red-400 font-semibold mb-2">Error loading content</h3>
      <p class="text-red-300">{error}</p>
    </div>
  {:else if content}
    {#if hide}
      <!-- Spoiler mode -->
      <div class="border border-orange-600 rounded-lg overflow-hidden">
        <button
          on:click={() => isSpoilerOpen = !isSpoilerOpen}
          class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
          aria-expanded={isSpoilerOpen}
        >
          <h4 class="text-lg font-semibold text-orange-200">{spoilerTitle}</h4>
          <span class="text-orange-300 transform transition-transform duration-200" style="transform: {isSpoilerOpen ? 'rotate(180deg)' : 'rotate(0deg)'}">
            ▼
          </span>
        </button>
        {#if isSpoilerOpen}
          <div class="p-4 border-t border-orange-600 animate-fade-in">
            <SvelteMarkdown
              source={content}
              options={{
                breaks: true,
                linkify: true,
                typographer: true,
                sanitize: false,
                openLinksInNewTab: true
              }}
            />
          </div>
        {/if}
      </div>
    {:else}
      <!-- Normal mode -->
      <SvelteMarkdown
        source={content}
        options={{
          breaks: true,
          linkify: true,
          typographer: true,
          sanitize: false,
          openLinksInNewTab: true
        }}
      />
    {/if}
  {:else}
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-4">
      <p class="text-gray-400">No content available.</p>
    </div>
  {/if}
</div>

<style>
  /* Ensure prose styling works well with dark theme */
  :global(.prose) {
    color: #d1d5db;
  }

  :global(.prose h1) {
    color: #f3f4f6;
    font-size: 2rem;
    font-weight: bold;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
  }

  :global(.prose h2) {
    color: #e5e7eb;
    font-size: 1.5rem;
    font-weight: bold;
    margin-top: 1.25rem;
    margin-bottom: 0.75rem;
  }

  :global(.prose h3) {
    color: #e5e7eb;
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  :global(.prose p) {
    margin-top: 0.5rem;
    margin-bottom: 1rem;
    line-height: 1.75;
  }

  :global(.prose ul) {
    list-style-type: disc;
    margin-left: 1.5rem;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }

  :global(.prose ol) {
    list-style-type: decimal;
    margin-left: 1.5rem;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }

  :global(.prose li) {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }

  :global(.prose strong) {
    color: #f3f4f6;
    font-weight: 600;
  }

  :global(.prose em) {
    color: #e5e7eb;
    font-style: italic;
  }

  :global(.prose hr) {
    border: none;
    border-top: 1px solid #374151;
    margin-top: 2rem;
    margin-bottom: 2rem;
  }

  /* Loading animation */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* Fade-in animation for spoiler content */
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