import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
        port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5173, // Use environment variable or default to 5173 for dev
		host: '0.0.0.0',
		fs: {
			// Allow serving files from the local-packages directory
			allow: ['..']
		}
	},
	define: {
		// Pass VITE_APP_VERSION to build-time constants
		'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || 'dev'),
		// Polyfill process.env.NODE_ENV for @meshtastic/core (client-side only)
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
		// Define global for browser
		global: 'globalThis',
	},
	resolve: {
		alias: {
			// Polyfill Node.js modules for @meshtastic/core
			os: 'os-browserify/browser.js',
			path: 'path-browserify',
			util: 'util',
			// Add process polyfill for browser
			process: 'process/browser'
		}
	},
	optimizeDeps: {
		include: [
			'@meshtastic/core',
			'process/browser',
			'buffer'
		]
	}
});
