<script lang="ts">
  import { onMount } from 'svelte';
  import { setCookie, hasCookie } from '$lib/utils/cookies.js';
  import { _ as locales } from 'svelte-i18n';
  import { browser } from '$app/environment';

  export let cookieName = "meshtastic-important-notice-hidden";

  let isExpanded = true;
  let isClient = false;
  let showOldFlasherMessage = false;

  // Check cookie state on mount
  onMount(() => {
    isClient = true;
    isExpanded = !hasCookie(cookieName);

    // Check if we should show old flasher message (until 30.01.2026)
    if (browser) {
      const now = new Date();
      const endDate = new Date(2026, 0, 31, 23, 59, 59); // Jan 31, 2026 23:59:59
      showOldFlasherMessage = now <= endDate;
    }
  });

  function closeNotice() {
    isExpanded = false;
    // Set cookie to remember that notice was hidden (expires in 1 year)
    setCookie(cookieName, 'true', 365);
  }

  function expandNotice() {
    isExpanded = true;
    // Remove the cookie when user expands the notice
    if (typeof document !== 'undefined') {
      document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:01 UTC;path=/;`;
    }
  }
</script>

<div class="important-notice {isExpanded ? 'expanded' : 'collapsed'}">
  {#if isClient}
    {#if isExpanded}
      <!-- Expanded state -->
      <div class="notice-content">
        <div class="notice-header">
          <h3 class="notice-title">{$locales('importantnotice.title')}</h3>
          <button
            type="button"
            class="close-button"
            on:click={closeNotice}
            title={$locales('importantnotice.close_notice')}
            aria-label={$locales('importantnotice.close_notice')}
          >
            ✕
          </button>
        </div>
        <div class="notice-body">
          <div class="notice-text">
            <p class="text-orange-300 text-sm leading-relaxed">
              {@html $locales('importantnotice.unofficial_builds')}
            </p>
            <p class="text-orange-300 text-sm mt-2">
              {$locales('importantnotice.backup_before_flashing')}
            </p>
            {#if showOldFlasherMessage}
              <p class="text-orange-300 text-sm mt-2">
                {$locales('importantnotice.old_flasher_available')}
              </p>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Collapsed state -->
      <div class="collapsed-notice">
        <span class="collapsed-title">{$locales('importantnotice.title')}</span>
        <button
          type="button"
          class="expand-button"
          on:click={expandNotice}
          title={$locales('importantnotice.expand_notice')}
          aria-label={$locales('importantnotice.expand_notice')}
        >
          ▼
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .important-notice {
    margin-bottom: 1rem;
    transition: all 0.3s ease;
  }

  .notice-content {
    background: rgba(146, 64, 14, 0.3);
    border: 1px solid #ea580c;
    border-radius: 8px;
    padding: 1rem;
    position: relative;
  }

  .notice-header {
    position: relative;
    margin-bottom: 0.5rem;
  }

  .notice-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #fed7aa;
    text-align: center;
  }

  .close-button {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: #fb923c;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1;
    padding: 0.25rem;
    transition: color 0.2s ease;
    min-width: 1.5rem;
    min-height: 1.5rem;
  }

  .close-button:hover {
    color: #fdba74;
  }

  .notice-text {
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .notice-text :global(p) {
    margin: 0 0 0.5rem 0;
    color: #fb923c;
  }

  .notice-text :global(p:last-child) {
    margin-bottom: 0;
  }

  .notice-text :global(p.mt-2) {
    margin-top: 0.5rem;
  }

  .notice-text :global(strong) {
    color: #fed7aa;
    font-weight: 600;
  }

  .collapsed-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(146, 64, 14, 0.1);
    border: 1px solid rgba(234, 88, 12, 0.2);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0.7;
  }

  .collapsed-notice:hover {
    background: rgba(146, 64, 14, 0.2);
    border-color: rgba(234, 88, 12, 0.3);
    opacity: 0.9;
  }

  .collapsed-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(254, 215, 170, 0.8);
    text-align: center;
    flex: 1;
  }

  .expand-button {
    background: transparent;
    border: none;
    color: rgba(251, 146, 60, 0.6);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1;
    padding: 0.125rem 0.25rem;
    transition: all 0.2s ease;
    min-width: 1rem;
    min-height: 1rem;
  }

  .expand-button:hover {
    color: rgba(251, 146, 60, 0.8);
  }

  /* Animation */
  .important-notice {
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>