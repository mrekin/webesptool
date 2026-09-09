<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { apiService } from '$lib/api';
    import type { GeocodeResponse, PickerResult, ZoneCatalog, ZoneRegionResult } from '$lib/types';
    import GeocodeResponseModal from './GeocodeResponseModal.svelte';
    import ZoneEditor from './ZoneEditor.svelte';
    import { loadLeaflet } from '$lib/utils/leafletLoader';
    import { fetchZoneCatalog } from '$lib/utils/zoneCatalog';
    import { lookupZoneRegion } from '$lib/utils/zoneResolver';
    import { defaultPreset, sortedPresetsByName } from '$lib/utils/zoneSettingsPresets';
    import { unwrapAntimeridian } from '$lib/utils/zoneGeometry';
    import {
        addressableModalLayer,
        pushAddressableModalLayer,
        popAddressableModalLayer,
        buildShareableModalUrl
    } from '$lib/utils/modalRoutes.js';

    let {
        lat,
        lon,
        direct = false,
        onconfirm = (_result: PickerResult) => {},
        onregionapply = (_result: PickerResult) => {},
        onclose = () => {}
    }: {
        lat?: number;
        lon?: number;
        direct?: boolean;
        detectCoords?: boolean;
        detectRegions?: boolean;
        onconfirm?: (result: PickerResult) => void;
        onregionapply?: (result: PickerResult) => void;
        onclose?: () => void;
    } = $props();

    let container: HTMLDivElement;
    let map: any = null;
    let marker: any = null;
    let L: any = null;
    let loadError = $state(false);

    // Thin orange outlines of every published zone (display-only; rebuilt when
    // the catalog arrives). No hover/click/tooltip — interactive:false lets map
    // clicks pass through to placeMarker.
    let publishedLayer: any = null;

    const hasCoords = $derived(
        typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0
    );
    // Init-once snapshot of the props (the picker mounts fresh per open) —
    // read untracked so only the initial values are captured.
    let pickLat = $state(untrack(() => (hasCoords ? (lat as number) : 55.75)));
    let pickLon = $state(untrack(() => (hasCoords ? (lon as number) : 37.62)));

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

    // Nested-dialog visibility (task 78): in the direct context (?m=coords)
    // the nested dialogs are driven by the addressable modal layer store; in
    // the regular context they stay the local flags above.
    const activeLayer = $derived(direct ? $addressableModalLayer : null);
    const zoneEditorVisible = $derived(direct ? activeLayer === 'zones' : showZoneEditor);
    const geocodeResponseVisible = $derived(
        direct ? activeLayer === 'geocode' : showGeocodeResponse
    );

    // Share-link state (window controls cluster, task 78): transient inline
    // confirmation; when the clipboard is unavailable the URL itself is shown
    // for manual copying instead.
    let shareMessage = $state('');
    let shareOk = $state(true);
    let shareFallbackUrl = $state<string | null>(null);
    let shareTimer: ReturnType<typeof setTimeout> | undefined;

    // Suppress the automatic geocode on open. The picker mounts with either the
    // device's current coords or a default — we must NOT fire a network geocode
    // for those. Only after the user actually picks a point (map click or marker
    // drag) does userPicked flip true and the effect below start issuing requests.
    let userPicked = $state(false);

    // Debounced reverse-geocode lookup on marker placement/drag. The requestId
    // guard discards stale responses if the marker moves again within the window.
    $effect(() => {
        if (!userPicked) return;
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

    // --- Settings-group selector (task 82, RSR §3.4) ---

    // Groups of the resolved zone, display-sorted by name (the array order in
    // the file has no technical role). Empty for flat zones / miss / unavailable.
    const sortedPresets = $derived(
        regionResult && regionResult.status === 'hit'
            ? sortedPresetsByName(regionResult.settingPresets ?? [])
            : []
    );

    // Identity of the currently resolved zone — the selector reseeds on ITS
    // change only: dragging the marker inside the same zone keeps the choice.
    const resolvedZoneId = $derived(
        regionResult && regionResult.status === 'hit' ? regionResult.zoneId : undefined
    );

    // Selected settings-group name (null = nothing picked yet). Seeded from the
    // zone's presets: the default one, or the only one; several groups without
    // a default leave it null — nothing is applied until the user picks
    // (PRD scenario 5).
    let selectedPresetName = $state<string | null>(null);
    // Reseed bookkeeping for the effect below (plain let, never rendered).
    let seededZoneId: string | undefined;

    // Reseed the selection when the resolved zone changes (RSR §3.4). Only the
    // zone id is tracked; the presets are read untracked so unrelated lookup
    // updates do not re-run the effect.
    $effect(() => {
        const zoneId = resolvedZoneId;
        if (zoneId === seededZoneId) return;
        seededZoneId = zoneId;
        untrack(() => {
            const presets =
                regionResult?.status === 'hit' ? (regionResult.settingPresets ?? []) : [];
            selectedPresetName =
                defaultPreset(presets)?.name ?? (presets.length === 1 ? presets[0].name : null);
        });
    });

    // Zone result with the named settings group applied (RSR §3.4): the lookup
    // shell (status/zoneId/level/preset list) comes from the base result, the
    // settings fields come from the chosen preset alone — a field the preset
    // does not define stays empty (no fallback to another group's value: exactly
    // the chosen group's fields get applied downstream). A null/unknown name
    // returns the base result unchanged (flat zone, or no group picked).
    function resultForPreset(name: string | null): ZoneRegionResult | null {
        const base = regionResult;
        if (!base || base.status !== 'hit') return base;
        const preset = name ? (base.settingPresets ?? []).find((p) => p.name === name) : undefined;
        if (!preset) return base;
        return {
            ...base,
            tokens: (preset.regions ?? '').split(/\s+/).filter(Boolean),
            regions: preset.regions ?? '',
            radio: preset.radio,
            pathHashMode: preset.pathHashMode,
            nameTemplate: preset.nameTemplate,
            docUrl: preset.docUrl,
            commands: preset.commands,
            selectedPreset: preset.name
        };
    }

    // What the panel shows and confirm() sends: the base result overlaid with
    // the selected settings group.
    const activeRegionResult = $derived(resultForPreset(selectedPresetName));

    // Settings-group selection changed: remember the choice and push the result
    // through the same application path as confirm (coords null — only the zone
    // preset fields are re-applied, RSR §3.4).
    function onPresetChange(e: Event): void {
        const name = (e.currentTarget as HTMLSelectElement).value || null;
        selectedPresetName = name;
        onregionapply({ coords: null, region: resultForPreset(name) });
    }

    // Draw every published zone's outline as a thin orange line. Display-only:
    // interactive:false disables hover/click/tooltip so map clicks still place
    // the marker. Antimeridian-crossing zones (e.g. Чукотка) are unwrapped for
    // contiguous rendering, mirroring ZoneEditor.
    $effect(() => {
        const cat = catalog;
        if (!map || !L || !cat || cat.features.length === 0) return;
        const fc = {
            type: 'FeatureCollection',
            features: cat.features.map((f) => ({
                type: 'Feature' as const,
                geometry: unwrapAntimeridian(f.geometry),
                properties: {}
            }))
        };
        if (publishedLayer) {
            map.removeLayer(publishedLayer);
            publishedLayer = null;
        }
        publishedLayer = L.geoJSON(fc, {
            style: () => ({ color: '#f97316', weight: 1, fillOpacity: 0, interactive: false })
        }).addTo(map);
        publishedLayer.eachLayer((l: any) => {
            l.options.interactive = false;
        });
    });

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
                userPicked = true;
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
            region: useRegions ? activeRegionResult : null
        });
    }

    // Nested-dialog routing (task 78): direct context opens/closes layers via
    // history entries (Back closes the top layer first, then the picker);
    // regular context toggles the local flags — no history is written.
    function openZoneEditor(): void {
        if (direct) pushAddressableModalLayer('zones');
        else showZoneEditor = true;
    }

    function closeZoneEditor(): void {
        if (direct) popAddressableModalLayer();
        else showZoneEditor = false;
    }

    function openGeocodeView(): void {
        if (direct) pushAddressableModalLayer('geocode');
        else showGeocodeResponse = true;
    }

    function closeGeocodeView(): void {
        if (direct) popAddressableModalLayer();
        else showGeocodeResponse = false;
    }

    // Copy the direct link of this window to the clipboard. The modal stays
    // open; on failure the URL is surfaced for manual copying (fallback row).
    async function shareLink(): Promise<void> {
        const url = buildShareableModalUrl('coords');
        try {
            await navigator.clipboard.writeText(url);
            shareFallbackUrl = null;
            shareOk = true;
            shareMessage = $locales('meshcoreconfig.share_link_copied');
            clearTimeout(shareTimer);
            shareTimer = setTimeout(() => (shareMessage = ''), 2500);
        } catch {
            shareMessage = '';
            shareFallbackUrl = url;
        }
    }

    onMount(async () => {
        try {
            L = await loadLeaflet();
        } catch {
            loadError = true;
            return;
        }
        const center: [number, number] = hasCoords
            ? [lat as number, lon as number]
            : [55.75, 37.62];
        map = L.map(container).setView(center, hasCoords ? 13 : 4);
        // Drop the Leaflet logo flag from the attribution control (keep OSM credit).
        map.attributionControl.setPrefix(false);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        map.on('click', (e: any) => {
            userPicked = true;
            placeMarker(e.latlng.lat, e.latlng.lng);
        });
        if (hasCoords) placeMarker(lat as number, lon as number);
        // The container was laid out while hidden; force a recalculation.
        setTimeout(() => map?.invalidateSize(), 50);

        // Load the zone catalog in the background (lookup degrades to "miss"/
        // "unavailable" predictably if it is absent/empty).
        fetchZoneCatalog().then((c) => (catalog = c));
    });

    onDestroy(() => {
        clearTimeout(shareTimer);
        publishedLayer = null;
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
    <div
        class="flex h-[95vh] w-[95vw] flex-col rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl"
    >
        <div class="mb-3 flex shrink-0 items-center gap-2">
            <h3 class="text-lg font-semibold text-orange-200">
                {$locales('meshcoreconfig.pick_on_map')}
            </h3>
            <button
                type="button"
                title={$locales('meshcoreconfig.zones.editor_title')}
                onclick={openZoneEditor}
                class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600"
            >
                ✏️
            </button>
            {#if shareMessage}
                <span
                    class={`ml-auto text-xs ${shareOk ? 'text-green-400' : 'text-red-400'}`}
                    role="status"
                    aria-live="polite"
                >
                    {shareMessage}
                </span>
            {/if}
            <!-- Window controls cluster (task 78): share link left of the
                 close cross; the cross is identical to Cancel (both call
                 onclose). -->
            <div class="ml-auto flex items-center gap-1">
                <button
                    type="button"
                    onclick={shareLink}
                    title={$locales('meshcoreconfig.share_link')}
                    aria-label={$locales('meshcoreconfig.share_link')}
                    class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600"
                >
                    🔗
                </button>
                <button
                    type="button"
                    onclick={onclose}
                    title={$locales('common.close')}
                    aria-label={$locales('common.close')}
                    class="rounded bg-gray-700 px-2 py-1 text-sm text-orange-200 hover:bg-gray-600"
                >
                    &#x2715;
                </button>
            </div>
        </div>

        {#if shareFallbackUrl}
            <!-- Manual-copy fallback (task 78): shown when the clipboard is
                 unavailable; clicking the field selects the URL text. -->
            <div
                class="mb-2 flex shrink-0 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2"
            >
                <span class="shrink-0 text-xs text-gray-400">
                    {$locales('meshcoreconfig.share_link_manual_hint')}
                </span>
                <input
                    readonly
                    value={shareFallbackUrl}
                    onclick={(e) => e.currentTarget.select()}
                    class="min-w-0 flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 font-mono text-xs text-gray-200 outline-none"
                />
            </div>
        {/if}

        {#if loadError}
            <div
                class="flex min-h-0 flex-1 items-center justify-center rounded-md border border-gray-700 bg-gray-900 p-4 text-center text-sm text-red-300"
            >
                {$locales('meshcoreconfig.map_load_error')}
            </div>
        {:else}
            <div class="flex min-h-0 flex-1 gap-3">
                <div
                    bind:this={container}
                    class="min-h-0 w-full flex-1 overflow-hidden rounded-md border border-gray-700 bg-gray-900"
                ></div>

                <!-- Right-side point-info panel. Fixed width so loading region/
                     geocode data no longer resizes the card; content scrolls here. -->
                <div
                    class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-md border border-gray-700 bg-gray-900/50 p-3"
                >
                    <!-- Coordinates -->
                    <div class="flex flex-col gap-0.5">
                        <span
                            class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
                        >
                            {$locales('meshcoreconfig.coordinates')}
                        </span>
                        <span class="font-mono text-xs text-gray-300">
                            {pickLat.toFixed(5)}, {pickLon.toFixed(5)}
                        </span>
                    </div>

                    <!-- Region lookup -->
                    <div class="flex flex-col gap-1">
                        <span
                            class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
                        >
                            {$locales('meshcoreconfig.zones.result_label')}
                        </span>
                        {#if useRegions && activeRegionResult}
                            {#if activeRegionResult.status === 'hit'}
                                {#if sortedPresets.length > 1}
                                    <!-- Settings-group selector (task 82, RSR §3.4): shown only
                                         when the resolved zone carries several groups; the default
                                         one wears a ★ prefix (config data — never localized). -->
                                    <label class="flex flex-col gap-0.5">
                                        <span class="text-[11px] text-gray-400">
                                            {$locales('meshcoreconfig.zones.result_groups_label')}
                                        </span>
                                        <select
                                            value={selectedPresetName ?? ''}
                                            onchange={onPresetChange}
                                            class="rounded border border-gray-600 bg-gray-700 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                                        >
                                            {#each sortedPresets as p (p.name)}
                                                <option
                                                    value={p.name}
                                                    title={p.isDefault
                                                        ? $locales(
                                                              'meshcoreconfig.zones.settings_group_default'
                                                          )
                                                        : undefined}
                                                >
                                                    {p.isDefault ? `★ ${p.name}` : p.name}
                                                </option>
                                            {/each}
                                        </select>
                                    </label>
                                {/if}
                                {#if activeRegionResult.tokens.length > 0}
                                    <span
                                        class="font-mono text-xs text-orange-200"
                                        title={activeRegionResult.regions}
                                    >
                                        {activeRegionResult.tokens.join(' ')}
                                    </span>
                                {/if}
                                {#if activeRegionResult.level != null}
                                    <span
                                        class="font-mono text-[11px] text-gray-500"
                                        title={$locales('meshcoreconfig.zones.zone_level')}
                                    >
                                        L{activeRegionResult.level} · {$locales(
                                            `meshcoreconfig.zones.zone_level_${activeRegionResult.level}`
                                        )}
                                    </span>
                                {/if}
                                {#if activeRegionResult.radio}
                                    <span
                                        class="font-mono text-[11px] text-gray-400"
                                        title={$locales('meshcoreconfig.zones.radio_label')}
                                    >
                                        {$locales('meshcoreconfig.zones.result_radio', {
                                            values: { freq: activeRegionResult.radio.freq }
                                        })}
                                    </span>
                                {/if}
                                {#if activeRegionResult.pathHashMode}
                                    <span class="font-mono text-[11px] text-gray-400">
                                        {$locales('meshcoreconfig.zones.result_path_hash', {
                                            values: { mode: activeRegionResult.pathHashMode }
                                        })}
                                    </span>
                                {/if}
                                {#if activeRegionResult.nameTemplate}
                                    <span
                                        class="font-mono text-[11px] text-gray-400"
                                        title={activeRegionResult.nameTemplate}
                                    >
                                        {$locales('meshcoreconfig.zones.result_name_template')}: {activeRegionResult.nameTemplate}
                                    </span>
                                {/if}
                                {#if activeRegionResult.docUrl}
                                    <a
                                        href={activeRegionResult.docUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="text-[11px] text-sky-400 underline hover:text-sky-300"
                                    >
                                        {$locales('meshcoreconfig.zones.result_doc')}
                                    </a>
                                {/if}
                            {:else if activeRegionResult.status === 'miss'}
                                <span class="text-[11px] text-gray-500"
                                    >{$locales('meshcoreconfig.zones.status_miss')}</span
                                >
                            {:else}
                                <span class="text-[11px] text-gray-500"
                                    >{$locales('meshcoreconfig.zones.status_unavailable')}</span
                                >
                            {/if}
                        {:else}
                            <span class="text-[11px] text-gray-500">—</span>
                        {/if}
                    </div>

                    <!-- Reverse geocode (address) -->
                    <div class="flex flex-col gap-1">
                        <span
                            class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
                        >
                            {$locales('meshcoreconfig.geocode.location_label')}
                        </span>
                        {#if geocodeDisplay}
                            {#if geocodeDisplay.kind === 'loading'}
                                <span class="flex items-center gap-2 text-xs text-gray-400">
                                    <span
                                        class="inline-block h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent"
                                    ></span>
                                    {$locales('meshcoreconfig.geocode.loading')}
                                </span>
                            {:else if geocodeDisplay.kind === 'ok'}
                                <span class="flex items-center gap-1.5 text-xs text-gray-300">
                                    📍 <span
                                        class="min-w-0 flex-1 break-words"
                                        title={geocodeDisplay.text}>{geocodeDisplay.text}</span
                                    >
                                    {#if geocodeDisplay.source === 'cache'}
                                        <span
                                            class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400"
                                        >
                                            {$locales('meshcoreconfig.geocode.source_cache')}
                                        </span>
                                    {:else if geocodeDisplay.source === 'live'}
                                        <span
                                            class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400"
                                        >
                                            {$locales('meshcoreconfig.geocode.source_live')}
                                        </span>
                                    {/if}
                                </span>
                            {:else if geocodeDisplay.kind === 'rate_limited'}
                                <span class="text-xs text-yellow-300">
                                    {$locales('meshcoreconfig.geocode.rate_limited')}
                                </span>
                            {:else if geocodeDisplay.kind === 'no_data'}
                                <span class="text-xs text-gray-500"
                                    >{$locales('meshcoreconfig.geocode.no_data')}</span
                                >
                            {:else if geocodeDisplay.kind === 'error'}
                                <span class="text-xs text-gray-500"
                                    >{$locales('meshcoreconfig.geocode.error')}</span
                                >
                            {/if}
                        {:else}
                            <span class="text-[11px] text-gray-500">—</span>
                        {/if}
                        <button
                            type="button"
                            onclick={openGeocodeView}
                            disabled={!geocodeResp?.raw}
                            class="mt-1 self-start rounded bg-gray-700 px-2 py-1 text-[11px] text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {$locales('meshcoreconfig.geocode.view_response')}
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <div class="mt-3 flex shrink-0 items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-4 text-xs text-gray-300">
                <label class="flex items-center gap-1.5">
                    <input type="checkbox" bind:checked={useCoords} class="h-3 w-3" />
                    {$locales('meshcoreconfig.coordinates')}
                </label>
                <label class="flex items-center gap-1.5">
                    <input type="checkbox" bind:checked={useRegions} class="h-3 w-3" />
                    {$locales('meshcoreconfig.zones.detect_regions')}
                </label>
            </div>
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
    isOpen={geocodeResponseVisible}
    raw={geocodeResp?.raw ?? null}
    onclose={closeGeocodeView}
/>

{#if zoneEditorVisible}
    <ZoneEditor onclose={closeZoneEditor} />
{/if}
