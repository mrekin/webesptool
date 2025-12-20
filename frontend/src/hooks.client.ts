import { init, register } from 'svelte-i18n';
import { defaultLocale, supportedLocales } from '$lib/i18n/index.js';

// Register locales on client
supportedLocales.forEach(locale => {
  register(locale, () => import(`$lib/i18n/locales/${locale}.json`));
});

// Initialize i18n with fallback to default locale
try {
  await init({
    fallbackLocale: defaultLocale,
    initialLocale: defaultLocale
  });
} catch (error) {
  console.error('Error setting up i18n:', error);
}