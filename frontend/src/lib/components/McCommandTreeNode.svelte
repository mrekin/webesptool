<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    // Self-import for recursive rendering of group children (standard Svelte 5
    // pattern for tree components).
    import McCommandTreeNode from './McCommandTreeNode.svelte';
    import {
        loadMcCommandFileParsed,
        selectSection,
        selectWholeFile
    } from '$lib/utils/mcCommandSets.js';
    import type {
        McCommandFileParsed,
        McCommandTreeNode as McCommandTreeNodeType
    } from '$lib/types.js';

    let {
        node,
        onselect = (_content: string) => {},
        onclose = () => {}
    }: {
        node: McCommandTreeNodeType;
        onselect?: (content: string) => void;
        onclose?: () => void;
    } = $props();

    // Local UI state (resets when the picker unmounts on terminal close).
    let expanded = $state(false);
    let loading = $state(false);
    let loadError = $state(false);
    let parsed = $state<McCommandFileParsed | null>(null);

    /** File click: lazy-load + parse, then either substitute (no sections) or toggle the section list. */
    async function handleFileClick() {
        if (node.type !== 'file' || loading) return;

        // Lazy-load on first click; subsequent clicks reuse the cached parse.
        if (!parsed) {
            loading = true;
            loadError = false;
            try {
                parsed = await loadMcCommandFileParsed(node);
            } catch (error) {
                console.error('[McCommandSets] Failed to load:', node.fullPath, error);
                loadError = true;
                return;
            } finally {
                loading = false;
            }
        }

        if (!parsed) return; // defensive

        if (!parsed.hasSections) {
            // No sections: replace the input immediately and close the panel.
            onselect(selectWholeFile(parsed));
            onclose();
            return;
        }

        // Has sections: toggle the section list.
        expanded = !expanded;
    }

    function chooseSection(index: number) {
        if (!parsed) return;
        onselect(selectSection(parsed, index));
        onclose();
    }

    function chooseWhole() {
        if (!parsed) return;
        onselect(selectWholeFile(parsed));
        onclose();
    }
</script>

{#if node.type === 'group'}
    <div>
        <button
            type="button"
            onclick={() => (expanded = !expanded)}
            class="flex w-full items-center gap-1 px-2 py-1 text-left text-sm font-medium text-orange-300 transition-colors hover:bg-gray-700"
            title={node.name}
        >
            <span class="inline-block w-3 text-xs">{expanded ? '▾' : '▸'}</span>
            <span>{node.name}</span>
        </button>
        {#if expanded}
            <div class="ml-3 border-l border-gray-700 pl-1">
                {#each node.children as child (child.path)}
                    <McCommandTreeNode node={child} {onselect} {onclose} />
                {/each}
            </div>
        {/if}
    </div>
{:else}
    <div>
        <button
            type="button"
            onclick={handleFileClick}
            disabled={loading}
            class="flex w-full items-center gap-1 px-2 py-1 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={node.name}
        >
            <span class="inline-block w-3 text-xs">
                {#if loading}<span class="animate-spin">⟳</span>{:else}·{/if}
            </span>
            <span>{node.name}</span>
        </button>

        {#if loading}
            <div class="ml-4 px-2 py-1 text-xs text-gray-400">
                {$locales('customfirmware.terminal_mc_command_sets_loading')}
            </div>
        {/if}

        {#if loadError}
            <div class="ml-4 px-2 py-1 text-xs text-red-400">
                {$locales('customfirmware.terminal_mc_command_sets_load_error')}
            </div>
        {/if}

        {#if parsed && expanded && parsed.hasSections}
            <div class="ml-4 border-l border-gray-700 pl-1">
                {#each parsed.sections as section, i (i)}
                    <button
                        type="button"
                        onclick={() => chooseSection(i)}
                        class="block w-full px-3 py-1 text-left text-xs text-gray-300 transition-colors hover:bg-gray-700"
                        title={section.name}
                    >
                        {section.name || '—'}
                    </button>
                {/each}
                <button
                    type="button"
                    onclick={chooseWhole}
                    class="block w-full px-3 py-1 text-left text-xs font-medium text-orange-300 transition-colors hover:bg-gray-700"
                >
                    {$locales('customfirmware.terminal_mc_command_sets_whole_file')}
                </button>
            </div>
        {/if}
    </div>
{/if}
