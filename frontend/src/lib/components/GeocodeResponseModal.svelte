<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import ModalWindowControls from './ModalWindowControls.svelte';
    import ModalShareFallback from './ModalShareFallback.svelte';

    let {
        isOpen = false,
        raw = null,
        onclose = () => {}
    }: {
        isOpen?: boolean;
        raw?: Record<string, unknown> | null;
        onclose?: () => void;
    } = $props();

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
        role="dialog"
        aria-modal="true"
    >
        <div
            class="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl"
        >
            <div class="mb-3 flex items-center justify-between gap-2">
                <h3 class="text-lg font-semibold text-orange-200">
                    {$locales('meshcoreconfig.geocode.response_title')}
                </h3>
                <!-- Window controls cluster (task 83): the cross replaces the
                     former text Cancel button; share copies the
                     ?m=geocode-response link (start state: empty response). -->
                <ModalWindowControls
                    shareId="geocode-response"
                    bind:shareFallbackUrl={shareFallbackUrl}
                    onclose={onclose}
                />
            </div>

            {#if shareFallbackUrl}
                <ModalShareFallback url={shareFallbackUrl} />
            {/if}
            <pre
                class="overflow-auto rounded-md border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200">{JSON.stringify(
                    raw,
                    null,
                    2
                )}</pre>
        </div>
    </div>
{/if}
