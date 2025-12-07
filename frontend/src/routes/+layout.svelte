<script lang="ts">
	import '../app.css';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-900 relative">
	<!-- Language Selector - positioned in top right -->
	<div class="absolute top-4 right-4 z-50">
		<LanguageSelector />
	</div>

	<!-- Main content -->
	{@render children()}
</div>
