<script lang="ts">
    // Unified header window-controls cluster (task 83): the disappearing
    // copy confirmation + optional share button + the close cross, byte-equal
    // to the frozen reference header of CoordinateMapPicker. The cross is the
    // host modal's regular dismiss action (same handler as its Cancel button);
    // existing operation guards stay per-modal via closeDisabled.
    import { onDestroy } from 'svelte';
    import { _ as locales } from 'svelte-i18n';
    import { buildShareableModalUrl } from '$lib/utils/modalRoutes.js';
    import type { AddressableModalId } from '$lib/types';

    let {
        onclose = () => {},
        // Addressable modal id for the share button; null = no share button
        // (criteria of PRD rule 2 not met / nested confirmation).
        shareId = null,
        // Extra URL context of the share link (e.g. { t: pio }, { g: file }).
        shareParams = null,
        // Existing operation guards stay per-modal (flashing/busy/saving).
        closeDisabled = false,
        // Surfaced for the host: the manual-copy fallback row renders below
        // the header (host position), bound via $bindable.
        shareFallbackUrl = $bindable(null)
    }: {
        onclose?: () => void;
        shareId?: AddressableModalId | null;
        shareParams?: Record<string, string> | null;
        closeDisabled?: boolean;
        shareFallbackUrl?: string | null;
    } = $props();

    // Share state (single copy of the picker's logic, task 78)
    let shareMessage = $state('');
    let shareOk = $state(true);
    let shareTimer: ReturnType<typeof setTimeout> | undefined;

    async function shareLink(): Promise<void> {
        const url = buildShareableModalUrl(shareId as AddressableModalId, shareParams ?? undefined);
        try {
            await navigator.clipboard.writeText(url);
            shareFallbackUrl = null;
            shareOk = true;
            shareMessage = $locales('meshcoreconfig.share_link_copied');
            clearTimeout(shareTimer);
            shareTimer = setTimeout(() => (shareMessage = ''), 2500);
        } catch {
            shareMessage = '';
            shareFallbackUrl = url; // manual-copy fallback row (host renders it)
        }
    }

    onDestroy(() => clearTimeout(shareTimer));
</script>

<div class="ml-auto flex items-center gap-2">
    {#if shareMessage}
        <span
            class={`text-xs ${shareOk ? 'text-green-400' : 'text-red-400'}`}
            role="status"
            aria-live="polite"
        >
            {shareMessage}
        </span>
    {/if}
    <div class="flex items-center gap-1">
        {#if shareId}
            <button
                type="button"
                onclick={shareLink}
                title={$locales('meshcoreconfig.share_link')}
                aria-label={$locales('meshcoreconfig.share_link')}
                class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600"
            >
                🔗
            </button>
        {/if}
        <button
            type="button"
            onclick={onclose}
            disabled={closeDisabled}
            title={$locales('common.close')}
            aria-label={$locales('common.close')}
            class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
            &#x2715;
        </button>
    </div>
</div>
