<script lang="ts">
  import { onMount } from 'svelte';
  import Markdown from '@humanspeak/svelte-markdown';
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

  // Container reference for DOM manipulation
  let markdownContainer: HTMLElement;

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

  // Add link click handler when content is available
  $effect(() => {
    if (content && markdownContainer) {
      // Remove existing listener to avoid duplicates
      markdownContainer.removeEventListener('click', handleLinkClick);
      // Add new listener
      markdownContainer.addEventListener('click', handleLinkClick);
    }
  });

  function handleLinkClick(e: Event) {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (link && link.href) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
    }
  }

  // Cleanup subscription when component is destroyed
  $effect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (markdownContainer) {
        markdownContainer.removeEventListener('click', handleLinkClick);
      }
    };
  });

  // Custom renderer for links
  const renderer = {
    link: (href: string, title: string | null, text: string) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">${text}</a>`;
    },
  };
</script>

<div bind:this={markdownContainer} class="{wrapperClass} {className} markdown-container">
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
      <div class="border border-orange-600 rounded-lg overflow-hidden ml-4">
        <button
          onclick={() => isSpoilerOpen = !isSpoilerOpen}
          class="w-full flex items-center justify-between p-3 transition-all duration-300 text-left bg-orange-900/30 hover:bg-orange-900/50 hover:border-orange-500"
          aria-expanded={isSpoilerOpen}
        >
          <h4 class="text-lg font-semibold text-orange-200">{spoilerTitle}</h4>
          <span class="text-orange-300 transform transition-transform duration-300" style="transform: {isSpoilerOpen ? 'rotate(180deg)' : 'rotate(0deg)'}">
            ▼
          </span>
        </button>
        {#if isSpoilerOpen}
          <div class="p-4 border-t border-orange-600 animate-fade-in">
            <Markdown
              source={content}
              {renderer}
              breaks={true}
              linkify={true}
            />
          </div>
        {/if}
      </div>
    {:else}
      <!-- Normal mode -->
      <Markdown
        source={content}
        {renderer}
        breaks={true}
        linkify={true}
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

  /* Link styling to match the design */
  :global(.prose a) {
    color: #fb923c; /* text-orange-400 */
    text-decoration: underline;
    transition: color 0.2s ease;
  }

  :global(.prose a:hover) {
    color: #fdba74; /* text-orange-300 */
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