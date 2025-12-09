import { browser } from '$app/environment';
import { init, register, _ } from 'svelte-i18n';
import { getCookie, setCookie } from '../utils/cookies.js';

const defaultLocale = 'en';

// Register locales
register('en', () => import('./locales/en.json'));
register('ru', () => import('./locales/ru.json'));


// Monkey patch the original _ function to support nested keys
const originalSubscribe = _.subscribe;
_.subscribe = function(callback: any) {
  return originalSubscribe((formatter: any) => {
    const enhancedFormatter = (key: string, options?: any) => {
      let result = formatter(key, options);

      // Replace {nested.key} patterns with actual locale values
      if (typeof result === 'string') {
        result = result.replace(/\{([^}]+)\}/g, (match, nestedKey) => {
          const nestedValue = formatter(nestedKey);
          return nestedValue !== nestedKey ? nestedValue : match;
        });
      }

      return result;
    };

    callback(enhancedFormatter);
  });
};

export const locales = _;

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