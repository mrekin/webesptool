import { browser } from '$app/environment';
import { pushState, replaceState } from '$app/navigation';
import { writable } from 'svelte/store';
import type {
    AddressableModalId,
    AddressableModalLayerId,
    ModalHistoryState
} from '$lib/types.js';

export const MODAL_URL_PARAM = 'm';
// Registry of addressable modals. Stage 1: the coordinate picker only.
// A new modal = new id literal in types.ts + entry here + render branch in +page.svelte.
export const ADDRESSABLE_MODAL_IDS: readonly AddressableModalId[] = ['coords'];

// App-wide state of the direct-URL modal (null = closed).
export const addressableModal = writable<AddressableModalId | null>(null);
// Active nested layer of the addressable modal (zones/geocode; null = none).
export const addressableModalLayer = writable<AddressableModalLayerId | null>(null);

// Pure URL helpers (no side effects; anything outside the registry degrades
// quietly to null — old/garbage links never break the app).

// Registry-valid modal id from ?m=, or null when absent/unknown/empty.
export function readAddressableModal(url: URL): AddressableModalId | null {
    const value = url.searchParams.get(MODAL_URL_PARAM);
    if (!value) return null;
    return (ADDRESSABLE_MODAL_IDS as readonly string[]).includes(value)
        ? (value as AddressableModalId)
        : null;
}

// Copy of the URL with the modal parameter set (other params preserved).
export function withModalParam(url: URL, id: AddressableModalId): URL {
    const next = new URL(url.href);
    next.searchParams.set(MODAL_URL_PARAM, id);
    return next;
}

// Copy of the URL without the modal parameter (other params preserved).
export function withoutModalParam(url: URL): URL {
    const next = new URL(url.href);
    next.searchParams.delete(MODAL_URL_PARAM);
    return next;
}

// Shareable link to a modal: origin + pathname carrying ONLY ?m=<id> (no ?t=
// or other sender context — the recipient starts from the default state).
export function buildShareableModalUrl(id: AddressableModalId): string {
    if (!browser) return '';
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set(MODAL_URL_PARAM, id);
    return url.href;
}

// --- History controller -----------------------------------------------------

let initialized = false;

// Single sync point for back/forward: the URL decides whether the modal is
// open, the entry state decides which nested layer to show.
function onPopstate(e: PopStateEvent): void {
    addressableModal.set(readAddressableModal(new URL(window.location.href)));
    addressableModalLayer.set((e.state as ModalHistoryState | null)?.modalLayer ?? null);
}

export function initAddressableModals(): void {
    if (!browser || initialized) return;
    initialized = true;

    window.addEventListener('popstate', onPopstate);

    const url = new URL(window.location.href);
    const id = readAddressableModal(url);
    // Regular load (or a garbage ?m= value left untouched) — nothing more to do.
    if (!id) return;

    addressableModal.set(id);

    const st = history.state as ModalHistoryState | null;
    if (st?.modal !== id) {
        // First visit via the link (the entry has no state of ours): normalize
        // the stack into base + modal entry so Back closes the modal inside the
        // app while the original tab position is kept.
        replaceState(withoutModalParam(url), {});
        pushState(withModalParam(url, id), { modal: id });
    } else {
        // F5 on the modal entry: the stack is already normalized — no duplicate;
        // restore the nested layer from the entry state.
        addressableModalLayer.set(st?.modalLayer ?? null);
    }
}

// Regular close (X, Cancel, and the post-Apply close): with a valid ?m= in the
// address, history.back() lets popstate reset the stores and the address;
// otherwise (defensive branch — the address is already clean) clear directly.
export function closeAddressableModal(): void {
    if (!browser) return;
    if (readAddressableModal(new URL(window.location.href))) {
        history.back();
    } else {
        addressableModal.set(null);
        addressableModalLayer.set(null);
    }
}

// Nested layer of the addressable modal (zones/geocode): only when the modal
// is addressably open. Same URL, distinct state — the officially supported
// shallow-routing case. One layer slot: zones and the geocode view are mutually
// exclusive (their buttons are unreachable under each other), so no stacking.
export function pushAddressableModalLayer(layer: AddressableModalLayerId): void {
    if (!browser) return;
    const id = readAddressableModal(new URL(window.location.href));
    if (!id) return;
    pushState(new URL(window.location.href), { modal: id, modalLayer: layer });
    addressableModalLayer.set(layer);
}

export function popAddressableModalLayer(): void {
    if (!browser) return;
    history.back(); // popstate clears the layer
}

export function disposeAddressableModals(): void {
    if (!browser || !initialized) return;
    window.removeEventListener('popstate', onPopstate);
    initialized = false;
    addressableModal.set(null);
    addressableModalLayer.set(null);
}
