import { browser } from '$app/environment';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';

interface MarkdownOptions {
  /** Whether to cache loaded files, defaults to true */
  cache?: boolean;
}

// Cache for loaded markdown files
const markdownCache = new Map<string, string>();

// Pre-import all markdown files
const markdownModules = import.meta.glob('/src/docs/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

/**
 * Gets the current locale from svelte-i18n
 * @returns current locale string (e.g., 'en', 'ru')
 */
function getCurrentLocale(): string {
  try {
    const currentLocale = get(locale);
    return currentLocale || 'en';
  } catch (error) {
    console.warn('[Markdown] Could not get locale, using default "en":', error);
    return 'en';
  }
}

/**
 * Attempts to load a markdown file with the given filename using internationalization fallback logic
 * @param filename - The base filename without locale prefix (e.g., 'guide.md')
 * @returns Promise<string> - The markdown content
 */
async function loadMarkdownWithFallback(filename: string): Promise<string> {
  const currentLocale = getCurrentLocale();

  // Ensure filename has .md extension
  const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

  // Try different filenames in order of preference
  const possibleFilenames = [
    `${currentLocale}.${normalizedFilename}`,
    `en.${normalizedFilename}`,
    normalizedFilename
  ];

  let lastError: Error | null = null;

  for (const fn of possibleFilenames) {
    try {
      // Try to find the module in our pre-imported modules
      const moduleKey = `/src/docs/${fn}`;

      if (markdownModules[moduleKey]) {
        const content = await markdownModules[moduleKey]();
        console.info(`[Markdown] Successfully loaded: ${fn}`);
        return content;
      }
    } catch (error) {
      lastError = error as Error;
      console.debug(`[Markdown] Failed to load ${fn}:`, error);
      continue; // Try next filename
    }
  }

  // If we get here, no file was found
  throw lastError || new Error(`Failed to load markdown file: ${filename}`);
}

/**
 * Loads and returns the content of a markdown file with internationalization support and caching.
 *
 * The function follows this priority order for finding files:
 * 1. {locale}.{filename}.md (e.g., "ru.guide.md")
 * 2. en.{filename}.md (e.g., "en.guide.md")
 * 3. {filename}.md (e.g., "guide.md")
 *
 * @param filename - The filename to load (with or without .md extension)
 * @param options - Optional configuration
 * @returns Promise<string> - The markdown content
 *
 * @example
 * ```typescript
 * // Basic usage
 * const content = await insertDoc('guide.md');
 *
 * // Disable caching
 * const content = await insertDoc('temp.md', {
 *   cache: false
 * });
 * ```
 */
export async function insertDoc(filename: string, options: MarkdownOptions = {}): Promise<string> {
  // Validate browser environment
  if (!browser) {
    console.warn('[Markdown] insertDoc should only be used in browser environment');
    return '';
  }

  const { cache = true } = options;

  // Ensure filename has .md extension
  const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

  // Create cache key
  const cacheKey = `${getCurrentLocale()}:${normalizedFilename}`;

  // Check cache first
  if (cache && markdownCache.has(cacheKey)) {
    console.debug(`[Markdown] Retrieved from cache: ${cacheKey}`);
    return markdownCache.get(cacheKey)!;
  }

  try {
    // Load the markdown content
    const content = await loadMarkdownWithFallback(normalizedFilename);

    // Cache the result if caching is enabled
    if (cache) {
      markdownCache.set(cacheKey, content);
      console.debug(`[Markdown] Cached: ${cacheKey}`);
    }

    return content;
  } catch (error) {
    console.error(`[Markdown] Error loading "${filename}":`, error);
    return '';
  }
}

/**
 * Clears the markdown cache
 * @param filename - Optional filename to clear specific entry
 */
export function clearMarkdownCache(filename?: string): void {
  if (filename) {
    // Clear specific file from all locales
    for (const [key] of markdownCache) {
      if (key.endsWith(`:${filename}`) || key.includes(`${filename}.md`)) {
        markdownCache.delete(key);
        console.info(`[Markdown] Cleared cache for: ${key}`);
      }
    }
  } else {
    // Clear all cache
    const size = markdownCache.size;
    markdownCache.clear();
    console.info(`[Markdown] Cleared all cache entries (${size} files)`);
  }
}

/**
 * Gets cache statistics for debugging
 * @returns object with cache information
 */
export function getMarkdownCacheStats() {
  return {
    size: markdownCache.size,
    entries: Array.from(markdownCache.entries()).map(([key, content]) => ({
      key,
      size: content.length,
      preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
    }))
  };
}