<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import ModalWindowControls from './ModalWindowControls.svelte';
    import ModalShareFallback from './ModalShareFallback.svelte';

    interface Props {
        isOpen?: boolean;
        onConfirm?: () => void;
        onCancel?: () => void;
        deviceInfo?: any;
        flashSizeBytes?: number;
    }

    let {
        isOpen = false,
        onConfirm = () => {},
        onCancel = () => {},
        deviceInfo = null,
        flashSizeBytes = 0
    }: Props = $props();

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);

    function formatFileSize(bytes: number): string {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    }
</script>

<!-- isOpen-only gate: a direct link (?m=backup-confirm) opens the modal in
     its start state — without device info the fields render as em-dashes. -->
{#if isOpen}
    <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onkeydown={(e) => e.key === 'Escape' && onCancel()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="max-w-md rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
        >
            <div class="flex items-center justify-between border-b border-gray-700 p-6">
                <h3 class="text-lg font-semibold text-orange-200">
                    {$locales('backupconfirm.title')}
                </h3>
                <!-- Window controls cluster (task 83): share copies the
                     ?m=backup-confirm link; the cross is Cancel. -->
                <ModalWindowControls
                    shareId="backup-confirm"
                    bind:shareFallbackUrl={shareFallbackUrl}
                    onclose={onCancel}
                />
            </div>

            {#if shareFallbackUrl}
                <ModalShareFallback url={shareFallbackUrl} />
            {/if}

            <div class="space-y-6 p-6">
                <div class="space-y-2 text-sm text-gray-300">
                    <p>
                        <strong>{$locales('backupconfirm.device_label')}</strong>
                        {deviceInfo?.chip ?? '—'}
                    </p>
                    <p>
                        <strong>{$locales('backupconfirm.memory_size')}</strong>
                        {deviceInfo?.flashSize ?? '—'}
                    </p>
                    <p>
                        <strong>{$locales('backupconfirm.file_size')}</strong>
                        {formatFileSize(flashSizeBytes)}
                    </p>
                </div>
                <div
                    class="rounded-md border border-yellow-700/50 bg-yellow-900/20 p-3 text-sm text-yellow-400"
                >
                    ⚠️ {$locales('backupconfirm.warning')}
                </div>
                <div class="flex justify-end space-x-3">
                    <button
                        onclick={onCancel}
                        class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
                    >
                        {$locales('backupconfirm.cancel')}
                    </button>
                    <button
                        onclick={onConfirm}
                        class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                    >
                        {$locales('backupconfirm.confirm')}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
