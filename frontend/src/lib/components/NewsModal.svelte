<script lang="ts">
	import { _ as locales } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { apiService } from '$lib/api.js';
	import type { NewsItem } from '$lib/types.js';
	import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

	export let isOpen: boolean = false;
	export let onClose: () => void = () => {};

	let newsList: NewsItem[] = [];
	let loading = false;
	let lastId: number | null = null;
	let hasMore = true;

	async function loadNews(loadMore = false) {
		if (loading) return;
		if (loadMore && !hasMore) return;

		loading = true;
		try {
			const currentLocale = $locale;
			if (!currentLocale) {
				return;
			}
			const response = await apiService.getNewsArchive(currentLocale, lastId ?? 0);
			const newItems = response.news || [];

			if (newItems.length > 0) {
				newsList = [...newsList, ...newItems];
				// Update cursor to last item's id for next page
				lastId = newItems[newItems.length - 1].id;
				hasMore = newItems.length >= 50;
			} else {
				hasMore = false;
			}
		} catch (e) {
			console.error('Failed to load news:', e);
		} finally {
			loading = false;
		}
	}

	function handleLoadMore() {
		loadNews(true);
	}

	onMount(() => {
		if (isOpen) {
			newsList = [];
			lastId = null;
			hasMore = true;
			loadNews();
		}
	});

	$: if (isOpen) {
		newsList = [];
		lastId = null;
		hasMore = true;
		loadNews();
	}

	function isExpired(item: NewsItem): boolean {
		if (!item.end_date) return false;
		return new Date(item.end_date) < new Date();
	}

	function closeOnEscape(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			onClose();
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto"
		onkeydown={closeOnEscape}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="min-h-full flex items-center justify-center">
			<div
				class="w-full max-w-2xl max-h-screen overflow-y-auto rounded-xl border border-orange-600
                    bg-gray-800 shadow-2xl shadow-orange-900/50 my-4"
			>
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-700 p-6 sticky top-0 bg-gray-800 z-10">
					<h2 class="text-xl font-semibold text-orange-200">
						{$locales('news.latest_title')}
					</h2>
					<button onclick={onClose} class="text-gray-400 hover:text-gray-200 text-2xl">✕</button>
				</div>

				<!-- Content -->
				<div class="p-6">
					{#if loading}
						<div class="text-center text-gray-400 py-12">
							<span class="inline-block animate-spin">⏳</span>
						</div>
					{:else if newsList.length > 0}
						<div class="space-y-3">
							{#each newsList as item (item.id)}
								<div class="p-4 bg-gray-900 rounded-lg border border-gray-700 news-item-markdown">
									<div class="flex items-start justify-between mb-2">
										<div class="flex-1 flex items-center gap-2">
											{#if item.is_pinned}
												<span class="text-orange-300">📌</span>
											{/if}
											<h3 class="text-orange-200 font-semibold text-lg">
												<MarkdownRenderer source={item.title_markdown} unwrap={true} />
											</h3>
										</div>
										<div class="flex items-center gap-2 flex-shrink-0">
											<span class="text-sm text-gray-400">{formatDate(item.start_date)}</span>
											{#if isExpired(item)}
												<span class="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded">
													{$locales('news.expired')}
												</span>
											{/if}
										</div>
									</div>
									<div class="pt-3 border-t border-gray-700">
										<MarkdownRenderer
											source={item.body_markdown}
											wrapperClass="prose prose-sm max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-headings:my-1 prose-p:text-sm prose-li:text-sm prose-text-gray-100"
										/>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center text-gray-400 py-12">
							{$locales('news.no_news')}
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex justify-end space-x-3 border-t border-gray-700 p-6">
					<button
						onclick={onClose}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
					>
						{$locales('common.close')}
					</button>
					{#if hasMore && newsList.length > 0}
						<button
							onclick={handleLoadMore}
							disabled={loading}
							class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{$locales('news.more')}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.animate-spin {
		animation: spin 1s linear infinite;
	}

	/* Override prose styles for news body - scoped to news items only */
	.news-item-markdown :global(.prose) {
		color: #f3f4f6;
		font-size: 0.875rem;
		font-weight: 300;
		line-height: 1.25;
	}

	.news-item-markdown :global(.prose p),
	.news-item-markdown :global(.prose li) {
		color: #f3f4f6;
		font-size: 0.875rem;
		font-weight: 300;
		line-height: 1.25;
		margin-top: 0;
		margin-bottom: 0;
	}

	.news-item-markdown :global(.prose ul),
	.news-item-markdown :global(.prose ol) {
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}
</style>
