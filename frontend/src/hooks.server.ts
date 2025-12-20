import { init, locale, register } from 'svelte-i18n';
import { defaultLocale, supportedLocales } from '$lib/i18n/index.js';

// Load .env file for dev environment
if (process.env.NODE_ENV !== 'production') {
  await import('dotenv').then(dotenv => dotenv.config());
}

// Register locales on server
supportedLocales.forEach(locale => {
  register(locale, () => import(`$lib/i18n/locales/${locale}.json`));
});

let initialized = false;
let initializedLocale: string | null = null;

async function initializeSimpleI18n(initialLocale = defaultLocale) {
  // Always reinitialize if the locale is different
  if (initialized && initializedLocale === initialLocale) {
    locale.set(initialLocale);
    return;
  }

  await init({
    fallbackLocale: defaultLocale,
    initialLocale: initialLocale
  });

  initialized = true;
  initializedLocale = initialLocale;
}

export async function handle({ event, resolve }) {
  // Get locale from cookies or headers BEFORE checking if initialized
  const cookieLocale = event.cookies.get('locale');
  const acceptLanguage = event.request.headers.get('accept-language');
  const browserLocale = acceptLanguage?.split(',')[0]?.split('-')[0];

  // Only use supported locales
  const detectedLocale = cookieLocale || browserLocale || defaultLocale;
  const currentLocale = supportedLocales.includes(detectedLocale as any) ? detectedLocale : defaultLocale;

  // Initialize i18n with the detected locale
  await initializeSimpleI18n(currentLocale);
  
  // API proxy
  const backendUrl = process.env.API_URL || 'http://localhost:5546';
  const url = new URL(event.request.url);

  // Check only /api/ path (baseUrl is now handled by Caddy)
  let apiPath = null;
  if (url.pathname.startsWith('/api/')) {
    apiPath = url.pathname;
  }

  if (apiPath) {
    const apiUrl = `${backendUrl}${apiPath}${url.search}`;

    let body;
    if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
      body = await event.request.text();
    }

    try {
      const response = await fetch(apiUrl, {
        headers: Object.fromEntries(event.request.headers.entries()),
        method: event.request.method,
        body: body
      });

      // Copy all important headers from backend response
      const headers: Record<string, string> = {};
      const importantHeaders = [
        'content-type',
        'content-disposition',
        'content-length',
        'cache-control',
        'etag',
        'last-modified'
      ];

      for (const headerName of importantHeaders) {
        const value = response.headers.get(headerName);
        if (value) {
          headers[headerName] = value;
        }
      }

      // Determine response type based on content-type
      const contentType = response.headers.get('content-type') || '';
      let responseBody;

      if (contentType.includes('application/json')) {
        // For JSON responses
        responseBody = await response.text();

        return new Response(responseBody, {
          status: response.status,
          headers: headers
        });
      } else {
        // For binary files (ZIP, BIN, UF2) - use stream directly
        // Create a new Response with the stream from the original response
        return new Response(response.body, {
          status: response.status,
          headers: headers
        });
      }
    } catch (error) {
      console.error('API proxy error:', error);
      return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Pass locale to client
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      // Add locale to HTML for client
      return html.replace(
        '<body',
        `<body data-server-locale="${currentLocale}"`
      );
    }
  });
  
  return response;
}