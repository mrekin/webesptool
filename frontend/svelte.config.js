import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		paths: {
            base: process.env.VITE_BASE_PATH || '', // Empty base path by default, can be overridden via VITE_BASE_PATH
			relative: false
        }
	}
};

export default config;
