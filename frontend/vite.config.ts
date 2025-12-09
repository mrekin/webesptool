import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const baseUrl = process.env.VITE_BASE_PATH || '/frontend';

export default defineConfig({
	plugins: [sveltekit()],
	base: baseUrl,
	server: {
        port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5173, // Use environment variable or default to 5173 for dev
		host: '0.0.0.0',
		// Proxy API requests to backend in development
		proxy: {
			'/api': {
				target: process.env.VITE_API_URL || 'http://192.168.1.115:5546',
				changeOrigin: true,
				secure: false,
			},
			[`${baseUrl}/api`]: {
				target: process.env.VITE_API_URL || 'http://192.168.1.115:5546',
				changeOrigin: true,
				secure: false,
				rewrite: (path: string) => path.replace(new RegExp(`^${baseUrl}/api`), '/api'),
			},
		},
	},
});
