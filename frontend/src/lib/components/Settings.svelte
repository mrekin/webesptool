<script lang="ts">
  import { locale } from 'svelte-i18n';
  import { changeLocale } from '$lib/i18n';
  import { _ as locales } from 'svelte-i18n';
  import { uiState, uiActions } from '$lib/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { InterfaceMode } from '$lib/types';

  // Local state
  let showDropdown = false;
  let settingsButton: HTMLButtonElement;
  let settingsDropdown: HTMLDivElement;
  let isMinimalMode = false;

  // Language options
  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' }
  ];

  // Subscribe to stores
  $: currentLanguage = $locale;
  $: currentInterfaceMode = $uiState.interfaceMode;

  // Sync local state with store
  $: if (currentInterfaceMode === InterfaceMode.MINIMAL && !isMinimalMode) {
    isMinimalMode = true;
  } else if (currentInterfaceMode === InterfaceMode.FULL && isMinimalMode) {
    isMinimalMode = false;
  }

  // Handle language change
  function handleLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    changeLocale(target.value);
  }

  // Handle interface mode change
  function handleInterfaceModeChange() {
    const newMode = isMinimalMode ? InterfaceMode.MINIMAL : InterfaceMode.FULL;
    uiActions.setInterfaceMode(newMode);
    // Don't close dropdown for toggle - keep settings open
  }

  // Toggle minimal mode
  function toggleMinimalMode() {
    isMinimalMode = !isMinimalMode;
    handleInterfaceModeChange();
  }

  // Toggle dropdown
  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (showDropdown && settingsButton && !settingsButton.contains(event.target as Node)) {
      if (settingsDropdown && !settingsDropdown.contains(event.target as Node)) {
        showDropdown = false;
      }
    }
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && showDropdown) {
      showDropdown = false;
    }
  }

  // Add event listeners
  onMount(() => {
    if (browser) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<div class="relative">
  <!-- Settings Button (Gear Icon) -->
  <button
    bind:this={settingsButton}
    type="button"
    on:click={toggleDropdown}
    class="flex items-center justify-center w-10 h-10 text-orange-300 hover:text-orange-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-full shadow-lg hover:shadow-xl hover:scale-105"
    title={$locales('settings.title')}
    aria-label={$locales('settings.title')}
    aria-expanded={showDropdown}
    aria-haspopup="true"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
    </svg>
  </button>

  <!-- Dropdown Panel -->
  {#if showDropdown}
    <div
      bind:this={settingsDropdown}
      class="absolute right-0 mt-2 w-72 bg-gray-800 border border-orange-600 rounded-lg shadow-2xl z-50 backdrop-blur-sm"
      role="menu"
    >
      <div class="p-4 space-y-4">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-orange-200">{$locales('settings.title')}</h3>
          <button
            type="button"
            on:click={() => showDropdown = false}
            class="text-orange-400 hover:text-orange-300 transition-colors"
            title={$locales('common.close')}
            aria-label={$locales('common.close')}
          >
            ✕
          </button>
        </div>

        <!-- Language Selector -->
        <div class="space-y-2">
          <label for="language-select" class="block text-sm font-medium text-orange-300">
            {$locales('settings.language')}
          </label>
          <select
            id="language-select"
            bind:value={currentLanguage}
            on:change={handleLanguageChange}
            class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {#each languages as lang}
              <option value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            {/each}
          </select>
        </div>

        <!-- Minimal Interface Toggle -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-orange-300">
              {$locales('settings.minimal_interface')}
            </span>
            <!-- Custom Toggle Switch -->
            <button
              type="button"
              on:click={toggleMinimalMode}
              class="relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              class:bg-gray-600={!isMinimalMode}
              class:bg-orange-600={isMinimalMode}
              role="switch"
              aria-checked={isMinimalMode}
              aria-label={$locales('settings.minimal_interface')}
            >
              <span class="sr-only">{$locales('settings.minimal_interface')}</span>
              <span
                class="inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out"
                class:translate-x-6={isMinimalMode}
                class:translate-x-1={!isMinimalMode}
              ></span>
            </button>
          </div>
          <p class="text-xs text-orange-400">
            {$locales('settings.minimal_interface_description')}
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>