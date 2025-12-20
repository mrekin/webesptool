import { browser } from '$app/environment';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { isESP32Device, isNRF52Device, isRP2040Device } from '$lib/utils/deviceTypeUtils.js';
import { DeviceType } from '$lib/types.js';

interface MarkdownOptions {
  /** Whether to cache loaded files, defaults to true */
  cache?: boolean;
}

// Cache for loaded markdown files
const markdownCache = new Map<string, string>();

// Pre-import all markdown files (recursive to support subdirectories)
const markdownModules = import.meta.glob('/src/docs/**/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

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
 * Gets available documents from a specific directory, optionally filtered by device type
 * @param directory - The directory to search in (e.g., 'howto')
 * @param deviceType - Optional device type to filter documents
 * @returns Promise<string[]> - Array of document filenames
 */
export async function getAvailableDocuments(directory: string, deviceType?: DeviceType): Promise<string[]> {
  const docs: string[] = [];

  // Get all file paths from the specified directory
  for (const [path] of Object.entries(markdownModules)) {
    const dirPrefix = `/src/docs/${directory}/`;
    if (path.startsWith(dirPrefix)) {
      const relativePath = path.replace(dirPrefix, '');

      // If deviceType is specified, filter subdirectory documents
      if (deviceType) {
        // If file is in a subdirectory, check if it matches device type
        if (relativePath.includes('/')) {
          // For ESP32: only files from esp32/ subdirectory
          if (isESP32Device(deviceType) && !relativePath.startsWith('esp32/')) {
            continue;
          }
          // For nRF52: only files from nrf52/ subdirectory
          if (isNRF52Device(deviceType) && !relativePath.startsWith('nrf52/')) {
            continue;
          }
          // For RP2040: only files from rp2040/ subdirectory
          if (isRP2040Device(deviceType) && !relativePath.startsWith('rp2040/')) {
            continue;
          }
        }
        // If no deviceType specified, only include files from root directory
      } else {
        // Only include files from root directory (no subdirectories)
        if (relativePath.includes('/')) {
          continue;
        }
      }

      // Add only base filenames (without locale prefix)
      // For files in subdirectories: esp32/en.esp32_flashing.md -> esp32/esp32_flashing.md
      // For files in root: en.welcome.md -> welcome.md
      let baseFilename = relativePath;
      if (baseFilename.includes('/')) {
        // File in subdirectory - remove locale prefix after the slash
        baseFilename = baseFilename.replace(/\/([a-z]{2})\./, '/');
      } else {
        // File in root - remove locale prefix
        baseFilename = baseFilename.replace(/^[a-z]{2}\./, '');
      }

      // Avoid duplicates
      if (!docs.includes(baseFilename)) {
        docs.push(baseFilename);
      }
    }
  }

  // Sort: device-specific files from subdirectories first, then common files from root
  return docs.sort((a, b) => {
    const aInSubdir = a.includes('/');
    const bInSubdir = b.includes('/');
    if (aInSubdir && !bInSubdir) return -1; // subdirectories first
    if (!aInSubdir && bInSubdir) return 1;  // root later
    return a.localeCompare(b);
  });
}

/**
 * Attempts to load a markdown file with the given filename using internationalization fallback logic
 * @param filename - The base filename without locale prefix (e.g., 'guide.md', 'esp32/flashing.md', or 'welcome.md')
 * @returns Promise<string> - The markdown content
 */
async function loadMarkdownWithFallback(filename: string): Promise<string> {
  const currentLocale = getCurrentLocale();

  // Always search in howto directory for this implementation
  const directory = 'howto';

  // Ensure filename has .md extension for normalization
  const normalizedFilename = filename.endsWith('.md') ? filename.slice(0, -3) : filename;

  // Build paths with locale support
  const basePath = `/src/docs/${directory}/`;

  // For files in subdirectories, locale prefix goes after the subdirectory
  // For root files, locale prefix goes at the beginning
  let possiblePaths: string[] = [];

  if (normalizedFilename.includes('/')) {
    // File in subdirectory: esp32/esp32_flashing.md
    const [subdir, filePart] = normalizedFilename.split('/');
    possiblePaths = [
      `${basePath}${subdir}/${currentLocale}.${filePart}.md`,
      `${basePath}${subdir}/en.${filePart}.md`,
      `${basePath}${subdir}/${filePart}.md`
    ];
  } else {
    // File in root directory: welcome.md
    possiblePaths = [
      `${basePath}${currentLocale}.${normalizedFilename}.md`,
      `${basePath}en.${normalizedFilename}.md`,
      `${basePath}${normalizedFilename}.md`
    ];
  }

  let lastError: Error | null = null;

  console.debug(`[Markdown] Looking for file: ${filename}, trying paths:`, possiblePaths);

  for (const path of possiblePaths) {
    try {
      console.debug(`[Markdown] Checking path: ${path}, exists: ${!!markdownModules[path]}`);
      if (markdownModules[path]) {
        const content = await markdownModules[path]();
        console.info(`[Markdown] Successfully loaded: ${path}`);
        return content;
      }
    } catch (error) {
      lastError = error as Error;
      console.debug(`[Markdown] Failed to load ${path}:`, error);
      continue; // Try next path
    }
  }

  // If we get here, no file was found
  throw lastError || new Error(`Failed to load markdown file: ${filename} (searched in ${directory})`);
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

  // Use filename directly for cache key to preserve subdirectory information
  const cacheKey = `${getCurrentLocale()}:${filename}`;

  // Check cache first
  if (cache && markdownCache.has(cacheKey)) {
    console.debug(`[Markdown] Retrieved from cache: ${cacheKey}`);
    return markdownCache.get(cacheKey)!;
  }

  try {
    // Load the markdown content
    const content = await loadMarkdownWithFallback(filename);

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