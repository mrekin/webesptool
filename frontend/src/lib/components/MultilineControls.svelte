<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { TERMINAL_CONFIG } from '$lib/config/terminalConfig.js';

    let {
        isMultiline = false, // show only when true
        isConnected = false,
        isMassRunning = false,
        lastSentIndex = -1,
        totalLines = 0,
        limitExceeded = false,
        onsendall = () => {},
        onstop = () => {}
    } = $props();
</script>

{#if isMultiline}
    <div class="flex flex-shrink-0 items-center gap-2">
        {#if limitExceeded}
            <span
                class="text-yellow-500"
                title={$locales('customfirmware.terminal_multiline_limit_exceeded', {
                    values: { max: TERMINAL_CONFIG.maxCommandLines }
                })}
            >⚠</span>
        {/if}

        {#if isMassRunning}
            {#if lastSentIndex >= 0}
                <span class="text-xs text-gray-400">
                    {$locales('customfirmware.terminal_multiline_progress', {
                        values: { sent: lastSentIndex + 1, total: totalLines }
                    })}
                </span>
            {/if}
            <button
                type="button"
                onclick={() => onstop()}
                class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
                {$locales('customfirmware.terminal_multiline_stop')}
            </button>
        {:else}
            <button
                type="button"
                onclick={() => onsendall()}
                disabled={!isConnected}
                title={$locales('customfirmware.terminal_multiline_send_all_tooltip')}
                class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {$locales('customfirmware.terminal_multiline_send_all')}
            </button>
        {/if}
    </div>
{/if}
