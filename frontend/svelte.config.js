import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */

// Task 81: our src tree is fully migrated to runes and must stay that way
// (compiler rejects reintroduced Svelte 4 syntax). Dependencies and vendored
// packages keep the compiler's AUTO detection: some ship classic "export let"
// components (svelte-jsoneditor, local-packages/@meshtastic/*), others are
// Svelte 5 runes-native (@humanspeak/svelte-markdown) and break when forced
// into legacy mode ("props is not defined" at runtime).
const srcDir = new URL('./src/', import.meta.url).pathname;

const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true
    },
    vitePlugin: {
        dynamicCompileOptions({ filename }) {
            if (!filename.startsWith(srcDir)) {
                // Explicit undefined overrides the global true and restores
                // per-component auto detection for dependency code
                return { runes: undefined };
            }
        }
    },
    kit: {
        adapter: adapter(),
        paths: {
            base: '', // Используем пустой base path
            relative: true // Относительные пути для ассетов
        }
    }
};

export default config;
