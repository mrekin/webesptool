/**
 * Environment variables utility module
 * Provides safe access to environment variables with fallbacks
 */

/**
 * Safely gets environment variable from build-time or runtime
 * @param key - Environment variable key
 * @param fallback - Default value if variable is not found
 * @returns Environment variable value or fallback
 */
export function getEnvVar(key: string, fallback: string = ''): string {
  // During build time: use import.meta.env (Vite injects these)
  // During runtime: fallback to provided value
  const value = import.meta.env[key];
  return value !== undefined ? value : fallback;
}

/**
 * Application version from build environment
 */
export const appVersion = getEnvVar('VITE_APP_VERSION', 'dev');

/**
 * Base path for the application (if deployed under subdirectory)
 */
export const basePath = getEnvVar('VITE_BASE_PATH', '');

/**
 * Port for development server
 */
export const devPort = getEnvVar('VITE_PORT', '3000');

/**
 * Environment (development/production)
 */
export const nodeEnv = getEnvVar('NODE_ENV', 'development');