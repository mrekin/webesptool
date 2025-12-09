<script lang="ts">
	import '../app.css';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { setupI18n } from '$lib/i18n/index.js';
	import { onMount } from 'svelte';
	import { locale, isLoading, _ as locales } from 'svelte-i18n';

	let { children } = $props();
	let i18nReady = $state(false);

	// Initialize i18n on client side as early as possible
	onMount(async () => {
		try {
			console.log('[LAYOUT] Initializing i18n...');
			await setupI18n();
			i18nReady = true;
			console.log('[LAYOUT] i18n initialized successfully');
		} catch (error) {
			console.error('Failed to initialize i18n:', error);
			i18nReady = true; // Still show content even if i18n fails
		}
	});
</script>

{#if !i18nReady}
	<div class="min-h-screen bg-gray-900 flex items-center justify-center">
		<div class="text-white text-xl">{$locales('common.loading')}</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-900 relative">
		<!-- Language Selector - positioned in top right -->
		<div class="absolute top-4 right-4 z-50">
			<LanguageSelector />
		</div>

		<!-- Main content -->
		{@render children()}
	</div>
{/if}
