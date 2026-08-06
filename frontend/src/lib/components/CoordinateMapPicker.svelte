<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy } from 'svelte';
    import { apiService } from '$lib/api';
    import type { GeocodeResponse, PickerResult, ZoneCatalog } from '$lib/types';
    import GeocodeResponseModal from './GeocodeResponseModal.svelte';
    import ZoneEditor from './ZoneEditor.svelte';
    import { loadLeaflet } from '$lib/utils/leafletLoader';
    import { fetchZoneCatalog } from '$lib/utils/zoneCatalog';
    import { lookupZoneRegion } from '$lib/utils/zoneResolver';

    let {
        lat,
        lon,
        onconfirm = (_result: PickerResult) => {},
        onclose = () => {}
    }: {
        lat?: number;
        lon?: number;
        detectCoords?: boolean;
        detectRegions?: boolean;
        onconfirm?: (result: PickerResult) => void;
        onclose?: () => void;
    } = $props();

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

    // The picker always opens with both coordinates and regions enabled,
    // regardless of which entry point opened it.
    let useCoords = $state(true);
    let useRegions = $state(true);
    let showZoneEditor = $state(false);

    // Authoritative zone catalog (lazy-loaded once; immutable for the session).
    let catalog = $state<ZoneCatalog | null>(null);

    // Reverse-geocoding state. Triggered reactively whenever the marker moves.
    let geocodeResp = $state<GeocodeResponse | null>(null);
    let geocodeLoading = $state(false);
    let geoRequestId = 0;
    let showGeocodeResponse = $state(false);

    // Debounced reverse-geocode lookup on marker placement/drag. The requestId
    // guard discards stale responses if the marker moves again within the window.
    $effect(() => {
        const la = pickLat;
        const lo = pickLon;
        const requestId = ++geoRequestId;
        geocodeLoading = true;
        const timer = setTimeout(async () => {
            if (requestId !== geoRequestId) return;
            const resp = await apiService.getGeocode(la, lo);
            if (requestId !== geoRequestId) return;
            geocodeResp = resp;
            geocodeLoading = false;
        }, 500);
        return () => clearTimeout(timer);
    });

    const geocodeDisplay = $derived.by(() => {
        if (geocodeLoading) return { kind: 'loading' as const };
        if (!geocodeResp) return null;
        switch (geocodeResp.status) {
            case 'ok':
                return {
                    kind: 'ok' as const,
                    text: geocodeResp.display_name ?? '',
                    source: geocodeResp.source
                };
            case 'rate_limited':
                return { kind: 'rate_limited' as const };
            case 'no_data':
                if (geocodeResp.source === 'error' || geocodeResp.source === 'timeout') {
                    return { kind: 'error' as const };
                }
                return { kind: 'no_data' as const };
            case 'disabled':
            default:
                return null;
        }
    });

    // Point-in-polygon region lookup (only when enabled and the catalog is loaded).
    const regionResult = $derived(
        useRegions && catalog ? lookupZoneRegion([pickLon, pickLat], catalog) : null
    );

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

    function confirm(): void {
        onconfirm({
            coords: useCoords
                ? { lat: Number(pickLat.toFixed(5)), lon: Number(pickLon.toFixed(5)) }
                : null,
            region: useRegions ? regionResult : null
        });
    }

    onMount(async () => {
        try {
            L = await loadLeaflet();
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

        // Load the zone catalog in the background (lookup degrades to "miss"/
        // "unavailable" predictably if it is absent/empty).
        fetchZoneCatalog().then((c) => (catalog = c));
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
    <div class="w-full max-w-[52rem] rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold text-orange-200">
                    {$locales('meshcoreconfig.pick_on_map')}
                </h3>
                <button
                    type="button"
                    title={$locales('meshcoreconfig.zones.editor_title')}
                    onclick={() => (showZoneEditor = true)}
                    class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600"
                >
                    ✏️
                </button>
            </div>
            <div class="flex flex-col items-end gap-0.5 text-right">
                <span class="font-mono text-xs text-gray-400">
                    {pickLat.toFixed(5)}, {pickLon.toFixed(5)}
                </span>
                {#if useRegions && regionResult}
                    {#if regionResult.status === 'hit'}
                        <span class="font-mono text-xs text-orange-200" title={regionResult.regions}>
                            {$locales('meshcoreconfig.zones.result_label')}: {regionResult.tokens.join(' ')}
                        </span>
                        {#if regionResult.radio}
                            <span class="font-mono text-[11px] text-gray-400" title={$locales('meshcoreconfig.zones.radio_label')}>
                                {$locales('meshcoreconfig.zones.result_radio', {
                                    values: { freq: regionResult.radio.freq }
                                })}
                            </span>
                        {/if}
                        {#if regionResult.pathHashMode}
                            <span class="font-mono text-[11px] text-gray-400">
                                {$locales('meshcoreconfig.zones.result_path_hash', {
                                    values: { mode: regionResult.pathHashMode }
                                })}
                            </span>
                        {/if}
                    {:else if regionResult.status === 'miss'}
                        <span class="text-[11px] text-gray-500">{$locales('meshcoreconfig.zones.status_miss')}</span>
                    {:else}
                        <span class="text-[11px] text-gray-500">{$locales('meshcoreconfig.zones.status_unavailable')}</span>
                    {/if}
                {/if}
            </div>
        </div>

        {#if loadError}
            <div class="flex h-72 items-center justify-center rounded-md border border-gray-700 bg-gray-900 p-4 text-center text-sm text-red-300">
                {$locales('meshcoreconfig.map_load_error')}
            </div>
        {:else}
            <div
                bind:this={container}
                class="h-[360px] w-full overflow-hidden rounded-md border border-gray-700 bg-gray-900"
            ></div>
        {/if}

        <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-300">
            <label class="flex items-center gap-1.5">
                <input type="checkbox" bind:checked={useCoords} class="h-3 w-3" />
                {$locales('meshcoreconfig.coordinates')}
            </label>
            <label class="flex items-center gap-1.5">
                <input type="checkbox" bind:checked={useRegions} class="h-3 w-3" />
                {$locales('meshcoreconfig.zones.detect_regions')}
            </label>
        </div>

        {#if geocodeDisplay}
            <div class="mt-3 flex min-h-5 items-center gap-2 text-sm">
                {#if geocodeDisplay.kind === 'loading'}
                    <span
                        class="inline-block h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent"
                    ></span>
                    <span class="text-gray-400">{$locales('meshcoreconfig.geocode.loading')}</span>
                {:else if geocodeDisplay.kind === 'ok'}
                    <span class="min-w-0 flex-1 truncate text-gray-300" title={geocodeDisplay.text}>
                        📍 {geocodeDisplay.text}
                    </span>
                    {#if geocodeDisplay.source === 'cache'}
                        <span
                            class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400"
                        >
                            {$locales('meshcoreconfig.geocode.source_cache')}
                        </span>
                    {:else if geocodeDisplay.source === 'live'}
                        <span
                            class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400"
                        >
                            {$locales('meshcoreconfig.geocode.source_live')}
                        </span>
                    {/if}
                {:else if geocodeDisplay.kind === 'rate_limited'}
                    <span class="text-yellow-300">
                        {$locales('meshcoreconfig.geocode.rate_limited')}
                    </span>
                {:else if geocodeDisplay.kind === 'no_data'}
                    <span class="text-gray-500">{$locales('meshcoreconfig.geocode.no_data')}</span>
                {:else if geocodeDisplay.kind === 'error'}
                    <span class="text-gray-500">{$locales('meshcoreconfig.geocode.error')}</span>
                {/if}
            </div>
        {/if}

        <div class="mt-3 flex items-center justify-between gap-3">
            <button
                type="button"
                onclick={() => (showGeocodeResponse = true)}
                disabled={!geocodeResp?.raw}
                class="rounded-md bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {$locales('meshcoreconfig.geocode.view_response')}
            </button>
            <div class="flex gap-3">
                <button
                    type="button"
                    onclick={onclose}
                    class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
                >
                    {$locales('common.cancel')}
                </button>
                <button
                    type="button"
                    onclick={confirm}
                    disabled={loadError}
                    class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {$locales('meshcoreconfig.apply')}
                </button>
            </div>
        </div>
    </div>
</div>

<GeocodeResponseModal
    isOpen={showGeocodeResponse}
    raw={geocodeResp?.raw ?? null}
    onclose={() => (showGeocodeResponse = false)}
/>

{#if showZoneEditor}
    <ZoneEditor onclose={() => (showZoneEditor = false)} />
{/if}
