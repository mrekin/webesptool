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

<div class="overflow-hidden rounded-lg border border-gray-700">
    <button
        onclick={toggle}
        class="flex w-full items-center justify-between border-0 bg-orange-900/20 p-3 text-left
           transition-all duration-300 hover:bg-orange-900/40"
        aria-expanded={expanded}
    >
        <div class="flex min-w-0 flex-1 items-center space-x-2">
            {#if item.is_pinned}
                <span class="flex-shrink-0 text-orange-300">📌</span>
            {/if}
            <div class="text-sm font-medium text-orange-100">
                <MarkdownRenderer source={item.title_markdown} unwrap={true} />
            </div>
        </div>
        <div class="ml-2 flex flex-shrink-0 items-center space-x-2">
            <span class="text-xs text-gray-400">
                {formatDate(item.start_date)}
            </span>
            <span
                class="transform text-orange-300 transition-transform duration-300"
                style="transform: {expanded ? 'rotate(180deg)' : 'rotate(0deg)'}"
            >
                ▼
            </span>
        </div>
    </button>

    {#if expanded}
        <div class="animate-fade-in border-t border-gray-700 bg-gray-900 p-3">
            <MarkdownRenderer
                source={item.body_markdown}
                wrapperClass="prose prose-invert prose-sm max-w-none"
            />
        </div>
    {/if}
</div>

<style>
    @keyframes fade-in {
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
        animation: fade-in 0.3s ease-out;
    }
</style>
