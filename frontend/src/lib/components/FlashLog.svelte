<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import type { FlashLogEntry } from '$lib/types.js';

    // Props (Svelte 5 runes)
    let {
        entries = [],
        titleKey = 'customfirmware.log_title',
        copyLabelKey = 'customfirmware.log_copy',
        emptyKey = 'customfirmware.log_empty',
        onCopy = () => {}
    }: {
        entries?: FlashLogEntry[];
        titleKey?: string;
        copyLabelKey?: string;
        emptyKey?: string;
        onCopy?: () => void;
    } = $props();

    // Scroll container reference
    let container: HTMLDivElement | undefined = $state();

    // Track seen size to only autoscroll when entries actually grew
    let lastSeenLength = 0;

    // Autoscroll to bottom after DOM update when entries change
    $effect(() => {
        // Read entries.length to make this effect depend on it
        const len = entries.length;
        if (container && len !== lastSeenLength) {
            lastSeenLength = len;
            // Scroll the latest entry into view
            container.scrollTop = container.scrollHeight;
        }
    });

    // Level → text color (consistent with project's status/error/warning palette)
    const levelClass: Record<string, string> = {
        info: 'text-gray-300',
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400'
    };

    // Format timestamp as HH:mm:ss (matches getCopyText)
    function formatTime(ts: number): string {
        const d = new Date(ts);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
</script>

<div class="space-y-2">
    <!-- Header with title + copy button -->
    <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-orange-300">{$locales(titleKey)}</div>
        <button
            onclick={onCopy}
            disabled={entries.length === 0}
            class="rounded-md bg-gray-700 p-1.5 text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            title={$locales(copyLabelKey)}
            aria-label={$locales(copyLabelKey)}
        >
            <!-- Copy icon (consistent with TokenSidebar.svelte) -->
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
            </svg>
        </button>
    </div>

    <!-- Scrollable log area, ~6 visible lines (text-xs line-height 16px + p-2) -->
    <div
        bind:this={container}
        class="h-28 overflow-y-auto rounded-md border border-gray-600 bg-gray-900 p-2 font-mono text-xs"
        role="log"
        aria-live="polite"
        aria-label={$locales(titleKey)}
    >
        {#if entries.length === 0}
            <div class="text-gray-500">{$locales(emptyKey)}</div>
        {:else}
            {#each entries as entry (entry.id)}
                {#if entry.isSeparator}
                    <div class="my-1 flex items-center gap-2 text-gray-500">
                        <span class="h-px flex-1 bg-gray-700"></span>
                        <span class="text-[10px]">[{formatTime(entry.timestamp)}]</span>
                        <span class="uppercase tracking-wider">{entry.message}</span>
                        <span class="h-px flex-1 bg-gray-700"></span>
                    </div>
                {:else}
                    <div
                        class="whitespace-pre-wrap break-words {levelClass[entry.level] ??
                        'text-gray-300'}"
                    >
                        <span class="text-gray-500">[{formatTime(entry.timestamp)}]</span>
                        {entry.message}
                    </div>
                {/if}
            {/each}
        {/if}
    </div>
</div>
