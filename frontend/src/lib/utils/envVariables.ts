/**
 * Environment variables utility module
 * Provides safe access to environment variables with fallbacks
 */

/**
 * Application version from build environment
 * Set VITE_APP_VERSION in .env file to override
 */
export const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
