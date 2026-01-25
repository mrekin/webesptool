<script lang="ts">
	import { _ as locales } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { apiService } from '$lib/api.js';
	import type { NewsItem } from '$lib/types.js';
	import NewsModal from './NewsModal.svelte';
	import { getCookie, setCookie } from '$lib/utils/cookies.js';

	let latestNews: NewsItem | null = null;
	let loading = false;
	let showModal = false;

	const COOKIE_NAME = 'last_read_news_id';

	async function loadLatestNews() {
		if (loading) return;
		loading = true;
		try {
			const currentLocale = $locale;
			if (!currentLocale) {
				return;
			}
			const response = await apiService.getNews(currentLocale, 10);
			const allNews = response.news || [];

			// Get the latest news by start_date (not pinned)
			if (allNews.length > 0) {
				// Sort by start_date descending and get the first one
				const sortedByDate = [...allNews].sort((a, b) =>
					new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
				);
				latestNews = sortedByDate[0] || null;
			} else {
				latestNews = null;
			}
		} catch (e) {
			console.error('Failed to load latest news:', e);
		} finally {
			loading = false;
		}
	}

	function markAsRead() {
		if (latestNews) {
			setCookie(COOKIE_NAME, String(latestNews.id), 365);
		}
	}

	function handleOpenModal() {
		showModal = true;
		markAsRead();
	}

	function handleCloseModal() {
		showModal = false;
	}

	// Format date as YYYY.MM.DD
	function formatDateToYMD(dateStr: string): string {
		const date = new Date(dateStr);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}.${month}.${day}`;
	}

	// Strip markdown for compact view
	function stripMarkdown(text: string): string {
		return text
			.replace(/#{1,6}\s/g, '')
			.replace(/\*\*/g, '')
			.replace(/\*/g, '')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/`/g, '')
			.trim();
	}

	onMount(() => {
		loadLatestNews();
	});

	// Re-render when locale changes
	$: if ($locale) {
		loadLatestNews();
	}
</script>

{#if loading}
	<!-- Loading state -->
	<div class="p-3 bg-gray-800 border border-orange-600 rounded-lg animate-pulse">
		<div class="h-4 bg-gray-700 rounded w-3/4"></div>
	</div>
{:else if latestNews}
	<!-- News block - single line -->
	<div
		onclick={handleOpenModal}
		class="p-3 bg-gray-800 border border-orange-600 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors"
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && handleOpenModal()}
	>
		<div class="flex items-center justify-between w-full">
			<span class="text-gray-200">
				📰 <span class="text-xl font-bold text-orange-200">{$locales('news.title')}:</span>
			</span>
			<span class="text-gray-200 text-sm">{stripMarkdown(latestNews.title_markdown)}</span>
			<span class="text-gray-200 text-sm">{formatDateToYMD(latestNews.start_date)}</span>
		</div>
	</div>
{/if}

<!-- Modal -->
<svelte:component
	this={NewsModal}
	isOpen={showModal}
	onClose={handleCloseModal}
/>

<style>
	.hover\:bg-gray-750:hover {
		background-color: rgb(55, 65, 81);
	}
</style>
