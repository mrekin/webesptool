<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy } from 'svelte';

    let {
        lat,
        lon,
        onconfirm = (_lat: number, _lon: number) => {},
        onclose = () => {}
    }: {
        lat?: number;
        lon?: number;
        onconfirm?: (lat: number, lon: number) => void;
        onclose?: () => void;
    } = $props();

    // Leaflet is loaded from CDN at runtime (kept out of the npm bundle).
    const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    let container: HTMLDivElement;
    let map: any = null;
    let marker: any = null;
    let L: any = null;
    let loadError = $state(false);

    const hasCoords = $derived(
        typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0
    );
    let pickLat = $state(hasCoords ? (lat as number) : 55.75);
    let pickLon = $state(hasCoords ? (lon as number) : 37.62);

    function loadCss(href: string): void {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if ((window as any).L) return resolve();
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error('leaflet load error')));
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('leaflet load error'));
            document.head.appendChild(s);
        });
    }

    function placeMarker(la: number, lo: number): void {
        pickLat = la;
        pickLon = lo;
        if (!L || !map) return;
        const latlng = L.latLng(la, lo);
        if (marker) {
            marker.setLatLng(latlng);
        } else {
            marker = L.marker(latlng, {
                draggable: true,
                icon: L.divIcon({
                    className: 'mc-map-pin',
                    html: '📍',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                })
            }).addTo(map);
            marker.on('dragend', (e: any) => {
                const ll = e.target.getLatLng();
                pickLat = ll.lat;
                pickLon = ll.lng;
            });
        }
    }

    onMount(async () => {
        try {
            loadCss(LEAFLET_CSS);
            await loadScript(LEAFLET_JS);
            L = (window as any).L;
            if (!L) throw new Error('Leaflet unavailable');
        } catch {
            loadError = true;
            return;
        }
        const center: [number, number] = hasCoords ? [lat as number, lon as number] : [55.75, 37.62];
        map = L.map(container).setView(center, hasCoords ? 13 : 4);
        // Drop the Leaflet logo flag from the attribution control (keep OSM credit).
        map.attributionControl.setPrefix(false);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        map.on('click', (e: any) => placeMarker(e.latlng.lat, e.latlng.lng));
        if (hasCoords) placeMarker(lat as number, lon as number);
        // The container was laid out while hidden; force a recalculation.
        setTimeout(() => map?.invalidateSize(), 50);
    });

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
        }
    });
</script>

<div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
>
    <div class="w-full max-w-2xl rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-lg font-semibold text-orange-200">
                {$locales('meshcoreconfig.pick_on_map')}
            </h3>
            <span class="font-mono text-xs text-gray-400">
                {pickLat.toFixed(5)}, {pickLon.toFixed(5)}
            </span>
        </div>

        {#if loadError}
            <div class="flex h-72 items-center justify-center rounded-md border border-gray-700 bg-gray-900 p-4 text-center text-sm text-red-300">
                {$locales('meshcoreconfig.map_load_error')}
            </div>
        {:else}
            <div
                bind:this={container}
                class="h-72 w-full overflow-hidden rounded-md border border-gray-700 bg-gray-900"
            ></div>
        {/if}

        <div class="mt-3 flex justify-end gap-3">
            <button
                type="button"
                onclick={onclose}
                class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
            >
                {$locales('common.cancel')}
            </button>
            <button
                type="button"
                onclick={() => onconfirm(pickLat, pickLon)}
                disabled={loadError}
                class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {$locales('meshcoreconfig.apply')}
            </button>
        </div>
    </div>
</div>
