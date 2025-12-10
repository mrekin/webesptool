<script lang="ts">
  import { locale } from 'svelte-i18n';
  import { changeLocale } from '$lib/i18n';
  import { _ as locales } from 'svelte-i18n';

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' }
  ];

  function handleLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    changeLocale(target.value);
  }

  $: currentLanguage = $locale;
</script>

<div class="relative">
  <select
    bind:value={currentLanguage}
    on:change={handleLanguageChange}
    class="appearance-none bg-transparent border border-gray-300 rounded-md px-3 py-1 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent hover:border-gray-400 transition-colors cursor-pointer text-orange-200"
    title={$locales('languageselector.language')}
  >
    {#each languages as lang}
      <option value={lang.code}>
        {lang.flag} {lang.name}
      </option>
    {/each}
  </select>

  <!-- Custom dropdown arrow -->
  <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
    <svg class="fill-current h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>
  </div>
</div>