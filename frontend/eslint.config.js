// @ts-check
import globals from 'globals';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import svelteConfig from './svelte.config.js';

// Minimal ESLint setup (task 81): parser/tooling infrastructure + targeted rule blocks.
//
// Deliberately WITHOUT the opinionated preset bundles (js/ts/svelte "recommended"):
// they report ~680 errors on the pre-migration codebase (no-explicit-any, no-var,
// require-each-key, ...), which would violate the PRD requirement that the very
// first eslint run is green. Tightening hygiene rules is a possible follow-up,
// same as the rejected valid-compile option (see docs/research/
// 81. Clean svelte code.rsr.md §3.1 / §5.2).
export default ts.config(
    {
        ignores: ['build/', '.svelte-kit/', 'dist/']
    },

    // Svelte tooling (parser enablement) without opinionated rules
    svelte.configs['flat/base'],

    // Disable stylistic rules conflicting with Prettier
    prettier,
    ...svelte.configs['flat/prettier'],

    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.node }
        }
    },

    // TypeScript-aware parsing inside .svelte templates/scripts
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: ['.svelte'],
                parser: ts.parser,
                svelteConfig
            }
        }
    },

    // Task 81: ban legacy Svelte 4 patterns outright (RSR §5.2).
    // Scoped to .svelte files only: these patterns cannot arise semantically in
    // .ts modules, and a global export-let ban would forbid legitimate mutable
    // exports from service modules.
    {
        files: ['**/*.svelte'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'svelte',
                            importNames: ['createEventDispatcher'],
                            message:
                                'Use callback props instead of createEventDispatcher (Svelte 5).'
                        }
                    ]
                }
            ],
            'no-restricted-syntax': [
                'error',
                {
                    selector: "ExportNamedDeclaration > VariableDeclaration[kind='let']",
                    message: 'Use $props() instead of "export let" (Svelte 5 runes).'
                },
                {
                    selector: 'SvelteReactiveStatement',
                    message: 'Use $derived / $derived.by / $effect instead of "$:" (Svelte 5).'
                },
                {
                    // svelte-eslint-parser v1 names the directive kind 'EventHandler'
                    // (older docs/RSR draft assumed 'Event' — verified against AST dump)
                    selector: "SvelteDirective[kind='EventHandler']",
                    message:
                        'Use event attributes (onclick={...}) instead of on:<event> directives.'
                },
                {
                    selector: "SvelteElement[name.name='slot']",
                    message: 'Use snippets ({#snippet} / {@render}, children) instead of <slot>.'
                },
                {
                    selector: "SvelteAttribute[key.name='slot']",
                    message: 'Pass snippets instead of slot="..." attributes (Svelte 5).'
                },
                {
                    // Parser v1: there is no SvelteSpecialElement type; special tags are
                    // regular SvelteElement nodes with kind='special' (AST-dump verified)
                    selector: "SvelteElement[kind='special'][name.name='svelte:component']",
                    message: 'Components are dynamic in Svelte 5: render <Component /> directly.'
                }
            ]
        }
    }
);
