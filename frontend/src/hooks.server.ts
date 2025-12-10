import { init, locale, register } from 'svelte-i18n';

// Register locales on server
register('en', () => import('$lib/i18n/locales/en.json'));
register('ru', () => import('$lib/i18n/locales/ru.json'));

let initialized = false;
let initializedLocale: string | null = null;

async function initializeSimpleI18n(initialLocale = 'en') {
  // Always reinitialize if the locale is different
  if (initialized && initializedLocale === initialLocale) {
    locale.set(initialLocale);
    return;
  }

  await init({
    fallbackLocale: 'en',
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

  const currentLocale = cookieLocale || browserLocale || 'en';

  // Initialize i18n with the detected locale
  await initializeSimpleI18n(currentLocale);
  
  // Прокси для API
  const backendUrl = process.env.VITE_API_URL || 'http://192.168.1.115:5546';
  const baseUrl = process.env.VITE_BASE_PATH || '/frontend';
  const url = new URL(event.request.url);

  // Проверяем оба пути: /api/ и {baseUrl}/api/
  let apiPath = null;
  if (url.pathname.startsWith('/api/')) {
    apiPath = url.pathname;
  } else if (url.pathname.startsWith(`${baseUrl}/api/`)) {
    apiPath = url.pathname.replace(new RegExp(`^${baseUrl}`), '');
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
      } else {
        // For binary files (ZIP, BIN, UF2) - preserve binary data
        responseBody = await response.arrayBuffer();
      }

      return new Response(responseBody, {
        status: response.status,
        headers: headers
      });
    } catch (error) {
      console.error('API proxy error:', error);
      return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Передаем локаль в data для клиента
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      // Добавляем локаль в HTML для клиента
      return html.replace(
        '<body',
        `<body data-server-locale="${currentLocale}"`
      );
    }
  });
  
  return response;
}