<script lang="ts">
	import '../app.css';
	import { setupI18n } from '$lib/i18n';
	import { onMount } from 'svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';

	let { children } = $props();

	// Setup i18n as soon as possible
	setupI18n();
</script>

<div class="min-h-screen bg-gray-900 relative">
	<!-- Language Selector - positioned in top right -->
	<div class="absolute top-4 right-4 z-50">
		<LanguageSelector />
	</div>

	<!-- Main content -->
	{@render children()}
</div>
