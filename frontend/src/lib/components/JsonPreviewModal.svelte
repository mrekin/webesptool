<script lang="ts">
	import { _ as locales } from 'svelte-i18n';
	import { JSONEditor } from 'svelte-jsoneditor';
	import type { MeshtasticFullConfig } from '$lib/types.js';
	import { validateMeshtasticConfig } from '$lib/utils/meshtastic.js';

	export let isOpen = false;
	export let onClose = () => {};
	export let config: MeshtasticFullConfig | null = null;
	export let onSave: (config: MeshtasticFullConfig) => void = () => {};

	// Validation error
	let validationError = '';

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
	let originalConfigJson = '';
	$: jsonContent = config
		? {
				json: config
		  }
		: null;

	// Track if config was modified
	$: if (config) {
		originalConfigJson = JSON.stringify(config);
	}

	$: isModified = jsonContent && JSON.stringify(jsonContent.json) !== originalConfigJson;

	// Save changes
	function handleSave() {
		if (!jsonContent?.json) return;

		if (!validateCurrentConfig()) return;

		onSave(jsonContent.json);
		originalConfigJson = JSON.stringify(jsonContent.json);
	}

	// Disable context menu
	function handleRenderContextMenu() {
		return false;
	}
</script>

{#if isOpen && config}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
		on:click={(e) => e.target === e.currentTarget && onClose()}
		on:keydown={(e) => e.key === 'Escape' && onClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="json-preview-title"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
			on:click|stopPropagation
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<h2 id="json-preview-title" class="text-xl font-semibold text-orange-200">
					{$locales('jsonpreview.title')}
				</h2>
				<button
					on:click={onClose}
					class="text-gray-400 transition-colors hover:text-gray-200"
					aria-label="Close modal"
				>
					✕
				</button>
			</div>

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
					<JSONEditor bind:content={jsonContent} navigationBar={false} onRenderContextMenu={handleRenderContextMenu} />
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex justify-end space-x-3 border-t border-gray-700 p-6">
				<button
					on:click={handleSave}
					disabled={!isModified}
					class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{$locales('jsonpreview.apply_changes')}
				</button>
				<button
					on:click={onClose}
					class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
				>
					{$locales('common.close')}
				</button>
			</div>
		</div>
	</div>
{/if}
