import { browser } from '$app/environment';
import { init, register, _ } from 'svelte-i18n';
import { getCookie, setCookie } from '../utils/cookies.js';

export const defaultLocale = 'en';
export const supportedLocales = ['en', 'ru', 'pl'] as const;

// Register locales
supportedLocales.forEach(locale => {
  register(locale, () => import(`./locales/${locale}.json`));
});


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
    if (savedLocale && supportedLocales.includes(savedLocale as any)) {
      return savedLocale;
    }
    const browserLocale = navigator.language;
    if (browserLocale.startsWith('ru')) {
      return 'ru';
    }
    if (browserLocale.startsWith('pl')) {
      return 'pl';
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

export async function changeLocale(locale: string) {
  if (browser) {
    setCookie('locale', locale, 365);
  }
  try {
    const { locale: i18nLocale } = await import('svelte-i18n');
    i18nLocale.set(locale);
  } catch (error) {
    console.error('Failed to change locale:', error);
  }
}