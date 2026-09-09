<script lang="ts">
    // Manual-copy fallback row of the share link (task 83): shown by the host
    // modal below its header when the clipboard is unavailable. Markup equals
    // the frozen reference row of CoordinateMapPicker.
    import { _ as locales } from 'svelte-i18n';
    let { url = '' }: { url?: string } = $props();
</script>

<div
    class="mb-2 flex shrink-0 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2"
>
    <span class="shrink-0 text-xs text-gray-400">
        {$locales('meshcoreconfig.share_link_manual_hint')}
    </span>
    <input
        readonly
        value={url}
        onclick={(e) => e.currentTarget.select()}
        class="min-w-0 flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-xs text-gray-200 outline-none"
    />
</div>
