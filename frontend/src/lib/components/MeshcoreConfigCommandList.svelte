<script lang="ts">
    import { _ as locales } from 'svelte-i18n';

    let {
        setLines,
        extra = [],
        lineEnding = 'crlf',
        disabled = false
    }: {
        setLines: { line: string; dirty: boolean }[];
        extra?: string[];
        lineEnding?: 'lf' | 'crlf' | 'cr';
        disabled?: boolean;
    } = $props();

    // Transient copy feedback. Empty string => no message shown.
    let copyMessage = $state('');
    let copyOk = $state(true);

    // Collapsed state for the command list body (header stays visible).
    let collapsed = $state(false);

    let hasContent = $derived(setLines.length > 0 || extra.length > 0);

    function lineEndingChar(le: 'lf' | 'crlf' | 'cr'): string {
        if (le === 'lf') return '\n';
        if (le === 'cr') return '\r';
        return '\r\n';
    }

    async function copyCommands(): Promise<void> {
        if (!hasContent || disabled) return;
        const sep = lineEndingChar(lineEnding);
        const text = [...setLines.map((s) => s.line), ...extra].join(sep);
        try {
            await navigator.clipboard.writeText(text);
            copyMessage = $locales('meshcoreconfig.copy_success');
            copyOk = true;
        } catch {
            copyMessage = $locales('meshcoreconfig.copy_error');
            copyOk = false;
        }
        // Clear the transient message shortly after so it does not linger.
        setTimeout(() => {
            copyMessage = '';
        }, 2000);
    }
</script>

<div class="space-y-3 rounded-md border border-gray-600 bg-gray-900 p-4">
    <div class="flex items-center justify-between gap-2">
        <button
            type="button"
            onclick={() => (collapsed = !collapsed)}
            class="flex items-center gap-1 text-sm font-medium text-orange-300"
            aria-expanded={!collapsed}
        >
            {$locales('meshcoreconfig.command_list_title')}
            <span class="text-xs text-gray-400">{collapsed ? '▶' : '▼'}</span>
        </button>
        <button
            type="button"
            onclick={copyCommands}
            disabled={!hasContent || disabled}
            class="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {$locales('meshcoreconfig.copy_commands')}
        </button>
    </div>

    {#if copyMessage}
        <div
            class={`text-xs ${copyOk ? 'text-green-400' : 'text-red-400'}`}
            role="status"
            aria-live="polite"
        >
            {copyMessage}
        </div>
    {/if}

    {#if !collapsed}
        <div
            class="max-h-[50vh] space-y-0.5 overflow-y-auto rounded bg-gray-950/50 p-2 font-mono text-xs"
        >
            {#if !hasContent}
                <div class="text-gray-500">{$locales('meshcoreconfig.no_changes')}</div>
            {:else}
                {#each setLines as entry, i (i)}
                    <div
                        class={`border-l-2 pl-2 ${
                            entry.dirty
                                ? 'border-yellow-500 text-yellow-200'
                                : 'border-transparent text-gray-300'
                        }`}
                    >
                        {entry.line}
                    </div>
                {/each}
                {#each extra as line, i (`extra-${i}`)}
                    <div class="border-l-2 border-transparent pl-2 text-gray-500">{line}</div>
                {/each}
            {/if}
        </div>
    {/if}
</div>
