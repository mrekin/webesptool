// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { LayoutServerData } from '$lib/types';

declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        interface PageData extends LayoutServerData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
