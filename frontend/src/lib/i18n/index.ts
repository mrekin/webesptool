import { browser } from '$app/environment';
import { init, register } from 'svelte-i18n';
import { getCookie, setCookie } from '../utils/cookies.js';

const defaultLocale = 'en';

// Register locales
register('en', () => import('./locales/en.json'));
register('ru', () => import('./locales/ru.json'));

const getInitialLocale = () => {
  if (browser) {
    const savedLocale = getCookie('locale');
    if (savedLocale && ['en', 'ru'].includes(savedLocale)) {
      return savedLocale;
    }
    const browserLocale = navigator.language;
    if (browserLocale.startsWith('ru')) {
      return 'ru';
    }
  }
  return defaultLocale;
};

export async function setupI18n(locale?: string) {
  // Handle both SSR and client-side
  const initialLocale = locale || (typeof window !== 'undefined' ? getInitialLocale() : defaultLocale);

  try {
    await init({
      fallbackLocale: defaultLocale,
      initialLocale
    });
  } catch (error) {
    console.error('[I18N] Error during init:', error);
    throw error;
  }
}

export function initI18nSync() {
  // Handle both SSR and client-side
  const initialLocale = typeof window !== 'undefined' ? getInitialLocale() : defaultLocale;

  init({
    fallbackLocale: defaultLocale,
    initialLocale
  });
}

export function changeLocale(locale: string) {
  if (browser) {
    setCookie('locale', locale, 365);
  }
  return import('svelte-i18n').then(({ locale: i18nLocale }) => {
    i18nLocale.set(locale);
  });
}