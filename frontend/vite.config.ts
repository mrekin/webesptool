import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
        port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5173, // Use environment variable or default to 5173 for dev
		host: '0.0.0.0',
	},
});
