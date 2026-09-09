<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount } from 'svelte';
    import { JSONEditor } from 'svelte-jsoneditor';
    import type { MeshtasticFullConfig } from '$lib/types.js';
    import { validateMeshtasticConfig } from '$lib/utils/meshtastic.js';
    import ModalWindowControls from './ModalWindowControls.svelte';
    import ModalShareFallback from './ModalShareFallback.svelte';

    interface Props {
        isOpen?: boolean;
        onClose?: () => void;
        config?: MeshtasticFullConfig | null;
        onSave?: (config: MeshtasticFullConfig) => void;
    }

    let { isOpen = false, onClose = () => {}, config = null, onSave = () => {} }: Props = $props();

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);

    // Validation error
    let validationError = $state('');

    // Validate current config
    function validateCurrentConfig(): boolean {
        if (!jsonContent?.json) {
            validationError = 'No configuration to validate';
            return false;
        }

        const validation = validateMeshtasticConfig(jsonContent.json);
        if (!validation.valid) {
            validationError = validation.error || 'Invalid configuration';
            return false;
        }

        validationError = '';
        return true;
    }

    // Convert config to JSON content for editor
    let jsonContent = $state<{ json: MeshtasticFullConfig } | null>(null);

    // Track if config was modified
    let originalConfigJson = $state('');

    // Reference of the incoming config currently reflected in the editor.
    // Plain (non-reactive) on purpose: comparing identities must not create dependencies.
    let adoptedConfigRef: MeshtasticFullConfig | null = null;

    // Adopt an externally provided config: replace editor content and modification baseline
    function adoptExternalConfig(next: MeshtasticFullConfig | null): void {
        adoptedConfigRef = next;
        jsonContent = next ? { json: next } : null;
        originalConfigJson = next ? JSON.stringify(next) : '';
    }

    // First adoption happens on mount (before first paint): reads inside a closure
    // keep the compiler happy about initial-value captures;
    // further parent-provided configs (parents reassign the object, never mutate deeply)
    // are picked up by the effect below.
    onMount(() => adoptExternalConfig(config));

    $effect(() => {
        if (config !== adoptedConfigRef) {
            adoptExternalConfig(config);
        }
    });

    const isModified = $derived(
        jsonContent && JSON.stringify(jsonContent.json) !== originalConfigJson
    );

    // Save changes
    function handleSave() {
        if (!jsonContent?.json) return;

        if (!validateCurrentConfig()) return;

        onSave(jsonContent.json);
        originalConfigJson = JSON.stringify(jsonContent.json);
    }

    // Disable context menu
    function handleRenderContextMenu(_items: any, _context: any): false {
        return false;
    }
</script>

<!-- isOpen-only gate: a direct link (?m=json-preview) opens the modal in its
     start state — shell without config (empty editor, Apply disabled). -->
{#if isOpen}
    <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onclick={(e) => e.target === e.currentTarget && onClose()}
        onkeydown={(e) => e.key === 'Escape' && onClose()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="json-preview-title"
        tabindex="-1"
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
            onclick={(e) => e.stopPropagation()}
        >
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-gray-700 p-6">
                <h2 id="json-preview-title" class="text-xl font-semibold text-orange-200">
                    {$locales('jsonpreview.title')}
                </h2>
                <!-- Window controls cluster (task 83): share copies the
                     ?m=json-preview link (recipient gets the start state). -->
                <ModalWindowControls
                    shareId="json-preview"
                    bind:shareFallbackUrl={shareFallbackUrl}
                    onclose={onClose}
                />
            </div>

            {#if shareFallbackUrl}
                <ModalShareFallback url={shareFallbackUrl} />
            {/if}

            <!-- Validation error -->
            {#if validationError}
                <div
                    role="alert"
                    aria-live="assertive"
                    class="mx-6 mt-4 rounded-md border border-yellow-700 bg-yellow-900 p-3"
                >
                    <div class="text-sm text-yellow-200">{validationError}</div>
                </div>
            {/if}

            <!-- Content -->
            <div class="jse-theme-orange max-h-[70vh] overflow-auto">
                {#if jsonContent}
                    <JSONEditor
                        bind:content={jsonContent}
                        navigationBar={false}
                        onRenderContextMenu={handleRenderContextMenu}
                    />
                {/if}
            </div>

            <!-- Footer -->
            <div class="flex justify-end space-x-3 border-t border-gray-700 p-6">
                <button
                    onclick={handleSave}
                    disabled={!isModified}
                    class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {$locales('jsonpreview.apply_changes')}
                </button>
                <button
                    onclick={onClose}
                    class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
                >
                    {$locales('common.close')}
                </button>
            </div>
        </div>
    </div>
{/if}
