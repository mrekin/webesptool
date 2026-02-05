<script lang="ts">
	import { _ as locales } from 'svelte-i18n';
	import type { ParsedToken, TokenCategory } from '$lib/types.js';

	export let tokens = new Map<string, ParsedToken>();
	export let onCopy = () => {};
	export let updateKey: number = 0; // Trigger for reactivity

	// Collapsed state for each category
	let collapsedCategories: Record<TokenCategory, boolean> = {
		firstEntrance: false,
		dynamic: false,
		avg: false,
		static: false
	};

	// Toggle category collapsed state
	function toggleCategory(category: TokenCategory) {
		collapsedCategories[category] = !collapsedCategories[category];
	}

	// Group tokens by category - initialize empty
	let tokenGroups = new Map<TokenCategory, ParsedToken[]>();

	// Update token groups when tokens or updateKey changes
	$: tokenGroups = groupTokensByCategory(), updateKey;

	// Group tokens by category
	function groupTokensByCategory(): Map<TokenCategory, ParsedToken[]> {
		const groups = new Map<TokenCategory, ParsedToken[]>();

		for (const token of tokens.values()) {
			let category: TokenCategory = 'dynamic' as TokenCategory;

			// Check for firstEntrance behavior (based on token names for simplicity)
			// In production, this could be determined from the parsing rule
			if (['Chip', 'Nodenum', 'Region', 'Frequency', 'Timezone', 'IP'].includes(token.name)) {
				category = 'firstEntrance' as TokenCategory;
			} else if (token.type === 'avg') {
				category = 'avg' as TokenCategory;
			} else if (token.type === 'static') {
				category = 'static' as TokenCategory;
			} else {
				category = 'dynamic' as TokenCategory;
			}

			if (!groups.has(category)) {
				groups.set(category, []);
			}
			groups.get(category)!.push(token);
		}

		return groups;
	}

	// Category display names with localization
	const categoryNames: Record<TokenCategory, string> = {
		firstEntrance: 'customfirmware.device_info',
		dynamic: 'customfirmware.dynamic',
		avg: 'customfirmware.averaged',
		static: 'customfirmware.static'
	};

	// Format token value for display
	function formatTokenValue(token: ParsedToken): string {
		if (token.value === null || token.value === undefined) {
			return '-';
		}

		if (token.type === 'bool') {
			return token.value ? '✓' : '✗';
		}

		return String(token.value);
	}
</script>

<div class="flex flex-col flex-1 bg-gray-800 overflow-hidden">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-gray-700 p-4 flex-shrink-0">
		<h3 class="text-lg font-semibold text-white">{$locales('customfirmware.parsed_tokens')}</h3>
		<button
			on:click={onCopy}
			class="rounded-md bg-gray-700 px-3 py-1 text-sm text-white transition-colors hover:bg-gray-600"
			title={$locales('customfirmware.tokens_copied')}
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
				/>
			</svg>
		</button>
	</div>

	<!-- Tokens List -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if tokenGroups.size === 0}
			<p class="text-center text-gray-400">{$locales('customfirmware.no_tokens')}</p>
		{:else}
			{#each Array.from(tokenGroups.entries()) as [category, tokensInCategory]}
				<div class="mb-4">
					<!-- Category header (clickable) -->
					<button
						on:click={() => toggleCategory(category)}
						class="mb-2 flex w-full items-center justify-between text-sm font-semibold text-gray-300 hover:text-white transition-colors"
					>
						<span>{$locales(categoryNames[category])}</span>
						<svg
							class="h-4 w-4 transition-transform"
							class:rotate-180={!collapsedCategories[category]}
							class:rotate-0={collapsedCategories[category]}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					<!-- Tokens in category (collapsed by default) -->
					{#if !collapsedCategories[category]}
						<div class="space-y-2">
							{#each tokensInCategory as token}
								<div class="flex justify-between rounded bg-gray-900 p-2">
									<span class="text-sm text-gray-400">{token.name}:</span>
									<span class="text-sm font-medium text-white">{formatTokenValue(token)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
