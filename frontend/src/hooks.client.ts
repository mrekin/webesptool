import { init, register } from 'svelte-i18n';

// Register locales on client
register('en', () => import('$lib/i18n/locales/en.json'));
register('ru', () => import('$lib/i18n/locales/ru.json'));

// Initialize i18n with fallback to English
try {
  await init({
    fallbackLocale: 'en',
    initialLocale: 'en'
  });
} catch (error) {
  console.error('Error setting up i18n:', error);
}