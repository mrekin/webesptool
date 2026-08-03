<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import McCommandTreeNode from './McCommandTreeNode.svelte';
    import { buildMcCommandTree } from '$lib/utils/mcCommandSets.js';
    import type { McCommandGroupNode } from '$lib/types.js';

    let {
        onselect = (_content: string) => {},
        label = '',
        dropup = true
    }: {
        onselect?: (content: string) => void;
        label?: string;
        dropup?: boolean;
    } = $props();

    // Panel visibility. Tree is built synchronously on mount (the picker is
    // gated by the meshcore block and remounts whenever the terminal reopens,
    // so the tree is naturally fresh per session).
    let open = $state(false);
    let tree = $state<McCommandGroupNode>(buildMcCommandTree());

    function close(): void {
        open = false;
    }
</script>

<div class="relative">
    {#if open}
        <div
            class={`absolute left-0 z-30 w-72 rounded-lg border border-orange-600 bg-gray-800 shadow-2xl ${dropup ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
            {#if tree.children.length === 0}
                <div class="px-4 py-2 text-sm text-gray-400">
                    {$locales('customfirmware.terminal_mc_command_sets_empty')}
                </div>
            {:else}
                <div class="max-h-60 overflow-y-auto">
                    {#each tree.children as node (node.path)}
                        <McCommandTreeNode {node} {onselect} onclose={close} />
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <button
        type="button"
        onclick={() => (open = !open)}
        disabled={tree.children.length === 0}
        title={$locales('customfirmware.terminal_mc_command_sets')}
        class={label
            ? 'flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-2 text-sm text-orange-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50'
            : 'mt-2 flex h-5 items-center justify-center rounded bg-gray-700 px-1.5 text-xs text-orange-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50'}
    >
        &#x1F4C1;
        {#if label}<span>{label}</span>{/if}
    </button>
</div>
