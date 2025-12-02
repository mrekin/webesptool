import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	},
	// Handle API requests in production
	handle: async ({ request, platform, resolve }) => {
		const backendUrl = process.env.VITE_API_URL || 'http://192.168.1.115:5546';

		// Proxy API requests to backend
		if (request.url.startsWith('/api/')) {
			const apiUrl = `${backendUrl}${request.url.slice(4)}`; // Remove '/api' prefix
			log(apiUrl);
			const response = await fetch(apiUrl, {
				headers: request.headers,
				method: request.method,
				body: request.body
			});

			const responseData = await response.json();

			return new Response(JSON.stringify(responseData), {
				status: response.status,
				headers: {
					'Content-Type': 'application/json',
					...response.headers
				}
			});
		}

		// Let SvelteKit handle other requests
		return await resolve(request);
	}
};

export default config;
