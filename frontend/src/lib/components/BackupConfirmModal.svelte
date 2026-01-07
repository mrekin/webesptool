<script lang="ts">
	import { _ as locales } from 'svelte-i18n';

	export let isOpen = false;
	export let onConfirm = () => {};
	export let onCancel = () => {};
	export let deviceInfo: any = null;
	export let flashSizeBytes = 0;

	function formatFileSize(bytes: number): string {
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(2)} MB`;
	}
</script>

{#if isOpen && deviceInfo}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
		on:keydown={(e) => e.key === 'Escape' && onCancel()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="max-w-md rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50">
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<h3 class="text-lg font-semibold text-orange-200">{$locales('backupconfirm.title')}</h3>
				<button
					on:click={onCancel}
					on:keydown={(e) => e.key === 'Escape' && onCancel()}
					class="text-gray-400 transition-colors hover:text-gray-200"
					aria-label="Close modal"
				>
					✕
				</button>
			</div>
			<div class="space-y-6 p-6">
				<div class="space-y-2 text-sm text-gray-300">
					<p><strong>{$locales('backupconfirm.device_label')}</strong> {deviceInfo.chip}</p>
					<p><strong>{$locales('backupconfirm.memory_size')}</strong> {deviceInfo.flashSize}</p>
					<p><strong>{$locales('backupconfirm.file_size')}</strong> {formatFileSize(flashSizeBytes)}</p>
				</div>
				<div class="rounded-md border border-yellow-700/50 bg-yellow-900/20 p-3 text-sm text-yellow-400">
					⚠️ {$locales('backupconfirm.warning')}
				</div>
				<div class="flex justify-end space-x-3">
					<button
						on:click={onCancel}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
					>
						{$locales('backupconfirm.cancel')}
					</button>
					<button
						on:click={onConfirm}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
					>
						{$locales('backupconfirm.confirm')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
