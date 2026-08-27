// Runtime CDN loader for Leaflet and Leaflet-Geoman (task 72). Both libraries
// are loaded from CDN at runtime and kept out of the npm bundle, matching the
// existing CoordinateMapPicker pattern. The helpers are idempotent: repeated
// calls reuse the already-injected <link>/<script> and resolve once the global
// is available.

import { GEOMAN_CSS, GEOMAN_JS, LEAFLET_CSS, LEAFLET_JS } from '$lib/config/meshcoreZoneConfig';

// Inject a stylesheet <link> once.
export function loadCss(href: string): void {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

// Per-src promise cache so loadScript is idempotent. The first call injects the
// <script> and waits for onload; every later call returns the SAME (resolved)
// promise. Without this, a second call would find the existing <script> tag and
// wait for a 'load' event that already fired — hanging forever (this broke the
// zone editor on reopen, where geoman's script was already in the DOM).
const scriptPromises = new Map<string, Promise<void>>();

// Inject a <script> once. `globalKey` (e.g. 'L') short-circuits to success when
// the global is already present. Rejects on load error.
export function loadScript(src: string, globalKey?: string): Promise<void> {
    const cached = scriptPromises.get(src);
    if (cached) return cached;
    const promise = new Promise<void>((resolve, reject) => {
        const w = window as unknown as Record<string, unknown>;
        if (globalKey && w[globalKey]) return resolve();
        if (document.querySelector(`script[src="${src}"]`)) {
            // Tag is already in the DOM (added this session) -> already loaded.
            return resolve();
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`load error: ${src}`));
        document.head.appendChild(s);
    });
    scriptPromises.set(src, promise);
    return promise;
}

// Load Leaflet CSS/JS and return the global `L`. Idempotent.
export async function loadLeaflet(): Promise<any> {
    loadCss(LEAFLET_CSS);
    await loadScript(LEAFLET_JS, 'L');
    const L = (window as unknown as Record<string, unknown>).L;
    if (!L) throw new Error('Leaflet unavailable');
    return L;
}

// Load Leaflet-Geoman CSS/JS (requires Leaflet already loaded). Idempotent.
export async function loadGeoman(): Promise<void> {
    loadCss(GEOMAN_CSS);
    await loadScript(GEOMAN_JS);
}
