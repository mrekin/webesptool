import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
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
		},
	},
});
