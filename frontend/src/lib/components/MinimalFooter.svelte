<script lang="ts">
  import { _ as locales, locale } from 'svelte-i18n';
  import NewYearModal from './NewYearModal.svelte';
  import { browser } from '$app/environment';
  import { EXTERNAL_LINKS } from '$lib/utils/externalLinks';

  let showNewYearModal = false;

  function openNewYearModal() {
    showNewYearModal = true;
  }

  function closeNewYearModal() {
    showNewYearModal = false;
  }

  // Check if we should show the New Year tree
  function showNewYearTree(): boolean {
    if (!browser) return false;

    const now = new Date();
    console.log('🎄 New Year Tree Check - Current date:', now.toISOString(), 'Local:', now.toLocaleString());

    // Always show on localhost
    if (browser && window.location.hostname === 'localhost') {
      console.log('🎄 Showing tree - localhost detected');
      return true;
    }

    // Check if current date is between Dec 31, 2025 and Jan 13, 2026
    const startDate = new Date(2025, 11, 31); // Dec 31, 2025
    const endDate = new Date(2026, 0, 13); // Jan 13, 2026

    // If we're in January before Jan 13, use previous year for start date
    if (now.getMonth() === 0 && now.getDate() <= 13) {
      const inRange = now >= startDate && now <= endDate;
      console.log('🎄 January check - in range:', inRange, 'startDate:', startDate.toISOString(), 'endDate:', endDate.toISOString());
      return inRange;
    }

    // For Dec 31, use current year start date and Dec 31 end date
    if (now.getMonth() === 11 && now.getDate() === 31) {
      console.log('🎄 Showing tree - Dec 31 detected');
      return true;
    }

    const inRange = now >= startDate && now <= endDate;
    console.log('🎄 Range check - in range:', inRange, 'startDate:', startDate.toISOString(), 'endDate:', endDate.toISOString());
    return inRange;
  }

  let showTree = showNewYearTree();

  // Show coffee icon only for Russian locale
  $: showCoffee = $locale === 'ru';
</script>

<div class="mt-8 pt-6 border-t border-gray-700">
  <p class="text-center text-xs text-gray-400">
    {@html $locales('footer.trademark_notice')}
    <!-- New Year Surprise -->
    {#if showTree}
      <button
        on:click={openNewYearModal}
        class="ml-1 text-xs hover:scale-125 transition-transform duration-300 cursor-pointer bg-transparent border-none p-0 hover:animate-sparkle align-middle"
        aria-label="New Year surprise"
        title="Click for a New Year surprise!"
      >
        🎄
      </button>
    {/if}
    <!-- Coffee donation link (Russian only) -->
    {#if showCoffee}
      <a
        href={EXTERNAL_LINKS.DONATION.YOOMONEY}
        target="_blank"
        rel="noopener noreferrer"
        class="ml-1 text-xs hover:scale-125 transition-all duration-300 cursor-pointer bg-transparent border-none p-0 hover:animate-sparkle align-middle coffee-link"
        aria-label="Support the project"
        title="{$locales('footer.takemeacoffee_desc')}"
      >
        ☕︎
      </a>
    {/if}
  </p>
</div>

<!-- New Year Modal -->
<NewYearModal isOpen={showNewYearModal} onClose={closeNewYearModal} />

<style>
  @keyframes sparkle {
    0%, 100% {
      filter: brightness(1) drop-shadow(0 0 5px rgba(255, 215, 0, 0));
    }
    50% {
      filter: brightness(1.3) drop-shadow(0 0 15px rgba(255, 215, 0, 0.8));
    }
  }

  :global(.animate-sparkle):hover {
    animation: sparkle 1s ease-in-out infinite;
  }

  .coffee-link {
    color: #ffffff !important;
  }

  .coffee-link:hover {
    color: #f3f4f6 !important;
  }
</style>
