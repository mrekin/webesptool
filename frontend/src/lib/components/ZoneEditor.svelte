<script lang="ts">
    // Zone drawing tool (task 72). A configurator builds groups of zones over an
    // OSM base map. Two kinds of reference layers (both per-file toggleable):
    //   - Base boundaries (static/data/boundaries/*.geojson): raw admin polygons,
    //     clicked to create zones (Select mode).
    //   - Published groups (static/data/groups/*.geojson): existing groups with a
    //     `regions` characteristic; view them, or load one into the editor to edit.
    // The user creates new groups or edits existing ones; every group's zones are
    // kept non-overlapping with ALL published groups (server-wide) + session
    // groups. Each session group exports to its own GeoJSON file.
    //
    // Tools live in a palette overlay on the map. The brush tool (Variant A)
    // paints a circular stroke: hold LMB to paint, RMB to pan. An Erase toggle
    // turns any tool into an eraser. Undo keeps a snapshot stack of geometric/
    // structural changes.

    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy } from 'svelte';
    import { loadGeoman, loadLeaflet } from '$lib/utils/leafletLoader';
    import {
        boundaryFileList,
        detectGroupMeshcore,
        fetchBoundaryFile,
        fetchGroupFiles,
        parseZoneFeatures
    } from '$lib/utils/zoneCatalog';
    import {
        bufferTrail,
        circleToPolygon,
        computeArea,
        erase,
        pointInGeometry,
        subtractExisting,
        unionInto,
        unwrapAntimeridian
    } from '$lib/utils/zoneGeometry';
    import {
        downloadCatalog,
        isValidRegions,
        serializeGroup,
        validateExport
    } from '$lib/utils/zoneExport';
    import { OSM_TILE_ATTRIBUTION, OSM_TILE_URL } from '$lib/config/meshcoreZoneConfig';
    import ZoneMeshcoreSettingsModal from './ZoneMeshcoreSettingsModal.svelte';
    import type {
        EditorPolygon,
        ExportZone,
        GroupFile,
        MeshcoreZoneSettings,
        RadioSpec,
        ZoneGeometry,
        ZoneGroup
    } from '$lib/types';

    let { onclose = () => {} }: { onclose?: () => void } = $props();

    let container: HTMLDivElement;
    let fileInput: HTMLInputElement;
    let map: any = null;
    let L: any = null;
    let loadError = $state(false);
    let notice = $state('');
    let exportProblems = $state<string[]>([]);

    type ToolId = 'select' | 'polygon' | 'circle' | 'brush';
    let mode = $state<ToolId>('select');
    // Erase is a modifier: when on, the active tool erases instead of adding.
    let eraseOn = $state(false);
    // Brush radius (meters). 5 km default.
    let brushRadiusM = $state(5000);

    const TOOLS: { id: ToolId; glyph: string; tipKey: string }[] = [
        { id: 'select', glyph: '◎', tipKey: 'select' },
        { id: 'polygon', glyph: '⬠', tipKey: 'tool_polygon' },
        { id: 'circle', glyph: '◯', tipKey: 'tool_circle' },
        { id: 'brush', glyph: '🖌', tipKey: 'tool_brush' }
    ];

    // Available reference layers. boundaryEntries combines server files and
    // user-uploaded files; boundaryLoaders resolves each key to its
    // FeatureCollection (fetch for server, in-memory for user uploads).
    let boundaryEntries = $state<{ key: string; filename: string }[]>([]);
    const boundaryLoaders = new Map<string, () => Promise<GeoJSON.FeatureCollection | null>>();
    let groupFiles = $state<GroupFile[]>([]);

    // Per-file display toggles.
    let shownBoundaries = $state<Set<string>>(new Set());
    let shownGroups = $state<Set<string>>(new Set());

    // In-session groups + their zones.
    let groups = $state<ZoneGroup[]>([]);
    let polygons = $state<EditorPolygon[]>([]);
    let activeGroupId = $state<string | null>(null);
    // Group whose meshcore settings modal (radio + path.hash.mode) is open.
    let meshcoreEditId = $state<string | null>(null);
    const meshcoreEditGroup = $derived(groups.find((g) => g.id === meshcoreEditId) ?? null);

    // Undo: snapshot stack of geometric/structural state (text edits excluded).
    interface Snapshot {
        groups: ZoneGroup[];
        polygons: EditorPolygon[];
        activeGroupId: string | null;
    }
    const UNDO_LIMIT = 25;
    let undoStack = $state<Snapshot[]>([]);

    // Brush runtime (non-reactive).
    let painting = false;
    let trail: [number, number][] = []; // [lat, lng] for Leaflet rendering
    let paintTargetId: string | null = null;
    let paintPreviewLayer: any = null;
    // Right-button pan runtime.
    let rmbDragging = false;
    let rmbLast = { x: 0, y: 0 };

    // Leaflet layer refs.
    let userOverlay: any = null;
    const boundaryLayers = new Map<string, any>();
    const groupLayers = new Map<string, any>();

    let idSeq = 0;
    const genId = (prefix: string) => `${prefix}${++idSeq}`;

    const BOUNDARY_STYLE = {
        color: '#94a3b8', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.05, dashArray: '4,2'
    };
    const BOUNDARY_HOVER = { color: '#fbbf24', weight: 2, fillOpacity: 0.12 };
    const PUBLISHED_STYLE = {
        color: '#38bdf8', weight: 1.5, fillColor: '#38bdf8', fillOpacity: 0.18
    };
    const GROUP_COLORS = [
        '#f97316', '#22c55e', '#a855f7', '#ec4899', '#eab308',
        '#14b8a6', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e'
    ];

    function groupColor(groupId: string | null): string {
        if (!groupId) return '#9ca3af';
        const idx = groups.findIndex((g) => g.id === groupId);
        return idx >= 0 ? GROUP_COLORS[idx % GROUP_COLORS.length] : '#9ca3af';
    }
    function styleFor(groupId: string | null): Record<string, unknown> {
        const c = groupColor(groupId);
        return { color: c, weight: 2, fillColor: c, fillOpacity: 0.3 };
    }

    const exportableGroups = $derived(
        groups.filter((g) => isValidRegions(g.regions) && polygons.some((p) => p.groupId === g.id))
    );

    function showNotice(text: string): void {
        notice = text;
    }

    // --- undo ---

    function pushHistory(): void {
        // $state.snapshot returns a deep, non-reactive copy — structuredClone
        // would throw DataCloneError on Svelte's deep $state proxies.
        undoStack.push({
            groups: $state.snapshot(groups),
            polygons: $state.snapshot(polygons),
            activeGroupId
        });
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    function undo(): void {
        const snap = undoStack.pop();
        if (!snap) return;
        groups = snap.groups;
        polygons = snap.polygons;
        activeGroupId = snap.activeGroupId;
        console.info('[meshcore-zone]', 'undo', undoStack.length);
    }

    // All geometries a new/edited zone must NOT overlap: every published group
    // file (server-wide, regardless of display) except the one being edited, plus
    // every in-session zone (optionally excluding one being extended). This
    // enforces "groups never overlap".
    function overlapGeometries(opts?: {
        excludeOriginUrl?: string;
        excludePolygonId?: string;
    }): ZoneGeometry[] {
        const out: ZoneGeometry[] = [];
        for (const gf of groupFiles) {
            if (gf.url === opts?.excludeOriginUrl) continue;
            for (const f of gf.features) out.push(f.geometry);
        }
        for (const p of polygons) {
            if (p.id === opts?.excludePolygonId) continue;
            out.push(p.geom as ZoneGeometry);
        }
        return out;
    }

    function activeOriginUrl(): string | undefined {
        return groups.find((g) => g.id === activeGroupId)?.originUrl;
    }
    function groupOriginUrl(groupId: string | null): string | undefined {
        if (!groupId) return undefined;
        return groups.find((g) => g.id === groupId)?.originUrl;
    }

    function layerToPolygonGeom(layer: any): ZoneGeometry {
        const raw = layer.getLatLngs();
        const isNested = Array.isArray(raw[0]);
        const ringsIn: any[] = isNested ? raw : [raw];
        const coordinates = ringsIn.map((ring: any) => {
            const pts: [number, number][] = ring.map((ll: any) => [ll.lng, ll.lat]);
            if (pts.length > 0) {
                const first = pts[0];
                const last = pts[pts.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]]);
            }
            return pts;
        });
        return { type: 'Polygon', coordinates };
    }

    function geometryFromLayer(layer: any): { kind: 'polygon' | 'circle'; geom: ZoneGeometry } {
        if (layer instanceof L.Circle) {
            const c = layer.getLatLng();
            return {
                kind: 'circle',
                geom: { type: 'Polygon', coordinates: circleToPolygon([c.lat, c.lng], layer.getRadius()) }
            };
        }
        return { kind: 'polygon', geom: layerToPolygonGeom(layer) };
    }

    // Erase `eraser` from every editable session zone; fully-covered zones drop.
    function eraseFromAll(eraser: ZoneGeometry): EditorPolygon[] {
        const next: EditorPolygon[] = [];
        for (const p of polygons) {
            const res = erase(p.geom as ZoneGeometry, eraser);
            if (res.ok) next.push({ ...p, geom: res.geometry });
            else if (res.reason === 'covered') {
                /* fully erased -> drop */
            } else {
                next.push(p);
            }
        }
        return next;
    }
    function eraseShape(eraser: ZoneGeometry): void {
        pushHistory();
        polygons = eraseFromAll(eraser);
        console.info('[meshcore-zone]', 'shape_erased');
    }

    function commitZone(kind: 'polygon' | 'circle', geom: ZoneGeometry, label?: string): void {
        const result = subtractExisting(geom, overlapGeometries({ excludeOriginUrl: activeOriginUrl() }));
        if (!result.ok) {
            console.info('[meshcore-zone]', 'overlap_discarded', result.reason);
            showNotice($locales('meshcoreconfig.zones.overlap_discarded'));
            return;
        }
        pushHistory();
        polygons = [
            ...polygons,
            { id: genId('z'), groupId: activeGroupId, kind, geom: result.geometry, label }
        ];
        if (label) showNotice(`${$locales('meshcoreconfig.zones.zone_added')}: ${label}`);
        console.info('[meshcore-zone]', 'zone_drawn', kind);
    }

    function onBoundaryClick(feature: any): void {
        if (mode !== 'select') return;
        const geom = feature.geometry as ZoneGeometry;
        const props = feature.properties ?? {};
        const label = props.name ?? props.name_en ?? '';
        if (eraseOn) {
            eraseShape(geom);
            return;
        }
        commitZone('polygon', geom, label || undefined);
    }

    function onPmCreate(e: any): void {
        const { kind, geom } = geometryFromLayer(e.layer);
        map.removeLayer(e.layer);

        if (eraseOn) {
            eraseShape(geom);
            return;
        }
        commitZone(kind, geom);
    }

    // --- brush tool (Variant A) ---

    function brushWeightPx(): number {
        if (!map) return 8;
        const c = map.getCenter();
        const mpp = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
        const r = brushRadiusM / Math.max(mpp, 1e-6);
        return Math.max(2, Math.min(220, r * 2));
    }

    function metersBetween(a: [number, number], b: [number, number]): number {
        const lat0 = ((a[0] + b[0]) / 2) * (Math.PI / 180);
        const dx = (b[1] - a[1]) * Math.cos(lat0) * 111320;
        const dy = (b[0] - a[0]) * 110540;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function startPainting(latlng: { lat: number; lng: number }): void {
        const lonLat: [number, number] = [latlng.lng, latlng.lat];
        // Target = topmost editable session zone under the start point (paint
        // extends that zone). Empty ground -> new zone in the active group.
        let target: EditorPolygon | null = null;
        for (let i = polygons.length - 1; i >= 0; i--) {
            if (pointInGeometry(lonLat, polygons[i].geom as ZoneGeometry)) {
                target = polygons[i];
                break;
            }
        }
        if (!target && !activeGroupId) {
            showNotice($locales('meshcoreconfig.zones.brush_no_active'));
            return;
        }
        painting = true;
        trail = [[latlng.lat, latlng.lng]];
        paintTargetId = target ? target.id : null;
        paintPreviewLayer = L.polyline([], {
            color: '#fb923c',
            weight: brushWeightPx(),
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
    }

    function addPaintPoint(latlng: { lat: number; lng: number }): void {
        const last = trail[trail.length - 1];
        if (last && metersBetween(last, [latlng.lat, latlng.lng]) < brushRadiusM * 0.2) return;
        trail.push([latlng.lat, latlng.lng]);
        if (paintPreviewLayer) {
            paintPreviewLayer.setLatLngs(trail);
            paintPreviewLayer.setStyle({ weight: brushWeightPx() });
        }
    }

    function removePreview(): void {
        if (paintPreviewLayer) {
            map?.removeLayer(paintPreviewLayer);
            paintPreviewLayer = null;
        }
    }

    function finishPainting(): void {
        if (!painting) return;
        painting = false;
        const pts = trail.map(([lat, lng]) => [lng, lat] as [number, number]);
        const targetId = paintTargetId;
        removePreview();
        trail = [];
        paintTargetId = null;

        const painted = pts.length ? bufferTrail(pts, brushRadiusM) : null;
        if (!painted) return;

        if (eraseOn) {
            pushHistory();
            polygons = eraseFromAll(painted);
            console.info('[meshcore-zone]', 'brush_erase');
            return;
        }

        const target = targetId ? (polygons.find((p) => p.id === targetId) ?? null) : null;
        if (!target && !activeGroupId) {
            showNotice($locales('meshcoreconfig.zones.brush_no_active'));
            return;
        }
        const originUrl = target ? groupOriginUrl(target.groupId) : groupOriginUrl(activeGroupId);
        const overlap = overlapGeometries({ excludeOriginUrl: originUrl, excludePolygonId: target?.id });
        const free = subtractExisting(painted, overlap);
        if (!free.ok) {
            console.info('[meshcore-zone]', 'brush_overlap_discarded', free.reason);
            showNotice($locales('meshcoreconfig.zones.overlap_discarded'));
            return;
        }
        pushHistory();
        if (target) {
            const merged = unionInto(target.geom as ZoneGeometry, free.geometry);
            if (merged.ok) {
                polygons = polygons.map((p) => (p.id === target.id ? { ...p, geom: merged.geometry } : p));
            } else {
                polygons = [
                    ...polygons,
                    { id: genId('z'), groupId: target.groupId, kind: 'polygon', geom: free.geometry, label: 'brush' }
                ];
            }
        } else {
            polygons = [
                ...polygons,
                { id: genId('z'), groupId: activeGroupId, kind: 'polygon', geom: free.geometry, label: 'brush' }
            ];
        }
        console.info('[meshcore-zone]', 'brush_painted');
    }

    // --- map mouse handlers (brush: LMB paint, RMB pan) ---

    function onDomMouseDown(e: MouseEvent): void {
        if (mode !== 'brush' || !map) return;
        if (e.button === 2) {
            rmbDragging = true;
            rmbLast = { x: e.clientX, y: e.clientY };
            e.preventDefault();
            return;
        }
        if (e.button !== 0) return;
        startPainting(map.mouseEventToLatLng(e));
    }

    function onDomMouseMove(e: MouseEvent): void {
        if (!map) return;
        if (rmbDragging) {
            const dx = e.clientX - rmbLast.x;
            const dy = e.clientY - rmbLast.y;
            rmbLast = { x: e.clientX, y: e.clientY };
            map.panBy([dx, dy], { animate: false });
            return;
        }
        if (painting) addPaintPoint(map.mouseEventToLatLng(e));
    }

    function onDocMouseUp(e: MouseEvent): void {
        if (rmbDragging && e.button === 2) {
            rmbDragging = false;
            return;
        }
        if (painting && e.button === 0) finishPainting();
    }

    function onContextMenu(e: Event): void {
        if (mode === 'brush') e.preventDefault();
    }

    function teardownBrush(): void {
        painting = false;
        rmbDragging = false;
        removePreview();
        trail = [];
        paintTargetId = null;
    }

    function setMode(m: ToolId): void {
        if (mode === 'brush' && m !== 'brush') teardownBrush();
        mode = m;
        if (!map) return;
        map.pm.disableDraw();
        if (m === 'polygon') map.pm.enableDraw('Polygon');
        else if (m === 'circle') map.pm.enableDraw('Circle');
        // In brush mode LMB paints and RMB pans (custom); default drag is off.
        if (m === 'brush') map.dragging.disable();
        else map.dragging.enable();
    }

    function setBrushRadiusKm(v: number): void {
        brushRadiusM = Math.max(100, Math.round(v * 1000));
    }

    // Rebuild the in-session overlay (colored per session group) on changes.
    $effect(() => {
        polygons;
        groups;
        if (!map || !L) return;
        if (userOverlay) {
            map.removeLayer(userOverlay);
            userOverlay = null;
        }
        if (polygons.length === 0) return;
        const fc = {
            type: 'FeatureCollection',
            features: polygons.map((p) => ({
                type: 'Feature' as const,
                // Display-only unwrap so antimeridian-crossing zones (e.g.
                // Чукотка) render contiguous. p.geom stays in [-180,180].
                geometry: unwrapAntimeridian(p.geom as ZoneGeometry),
                properties: { id: p.id, name: p.label ?? '', groupId: p.groupId }
            }))
        };
        userOverlay = L.geoJSON(fc, {
            style: (f: any) => styleFor(f?.properties?.groupId ?? null),
            onEachFeature: (_f: any, layer: any) => {
                const name = _f?.properties?.name;
                if (name) layer.bindTooltip(String(name));
            }
        }).addTo(map);
        userOverlay.eachLayer((l: any) => {
            l.options.pmIgnore = true;
        });
    });

    // Sync displayed base boundary layers with the shownBoundaries toggle.
    $effect(() => {
        shownBoundaries;
        if (!map || !L) return;
        for (const [url, layer] of boundaryLayers) {
            if (!shownBoundaries.has(url)) {
                map.removeLayer(layer);
                boundaryLayers.delete(url);
            }
        }
        for (const key of shownBoundaries) {
            if (boundaryLayers.has(key)) continue;
            const loader = boundaryLoaders.get(key);
            if (!loader) continue;
            loader().then((fc) => {
                if (!fc || !shownBoundaries.has(key) || !map) return;
                // Paint smaller (more specific) admin boundaries on top of
                // enclosing ones (e.g. an oblast above the country/federal-
                // district polygon that otherwise covers it and intercepts
                // hover/click). Leaflet paints GeoJSON features in array order
                // and later = on top, so sort DESCENDING by area: the largest
                // polygon is painted first (bottom) and the smallest last (top),
                // which is what receives hover/click.
                const sorted = {
                    ...fc,
                    features: [...fc.features].sort((a, b) => {
                        const ga = a.geometry as ZoneGeometry | null;
                        const gb = b.geometry as ZoneGeometry | null;
                        const aa = ga && (ga.type === 'Polygon' || ga.type === 'MultiPolygon') ? computeArea(ga) : 0;
                        const ab = gb && (gb.type === 'Polygon' || gb.type === 'MultiPolygon') ? computeArea(gb) : 0;
                        return ab - aa;
                    })
                };
                // Render antimeridian-crossing shapes (e.g. Чукотка) contiguous
                // for display, but keep the ORIGINAL geometry on the feature
                // (__orig) — clicks commit the original so storage/export and
                // the coordinate→region lookup stay in the standard [-180,180].
                const renderFc = {
                    ...sorted,
                    features: sorted.features.map((f) => {
                        const orig = f.geometry as ZoneGeometry | null;
                        const display =
                            orig && (orig.type === 'Polygon' || orig.type === 'MultiPolygon')
                                ? unwrapAntimeridian(orig)
                                : orig;
                        return {
                            ...f,
                            properties: { ...(f.properties ?? {}), __orig: orig },
                            geometry: display
                        };
                    })
                };
                const layer = L.geoJSON(renderFc, {
                    style: () => BOUNDARY_STYLE,
                    onEachFeature: (feature: any, l: any) => {
                        const name = feature?.properties?.name ?? feature?.properties?.name_en ?? '';
                        if (name) l.bindTooltip(String(name));
                        l.on('mouseover', () => l.setStyle(BOUNDARY_HOVER));
                        l.on('mouseout', () => l.setStyle(BOUNDARY_STYLE));
                        l.on('click', () =>
                            onBoundaryClick({
                                geometry: feature.properties.__orig,
                                properties: feature.properties
                            })
                        );
                    }
                }).addTo(map);
                layer.eachLayer((l: any) => {
                    l.options.pmIgnore = true;
                });
                boundaryLayers.set(key, layer);
            });
        }
    });

    // Sync displayed published-group layers with the shownGroups toggle.
    $effect(() => {
        shownGroups;
        if (!map || !L) return;
        for (const [url, layer] of groupLayers) {
            if (!shownGroups.has(url)) {
                map.removeLayer(layer);
                groupLayers.delete(url);
            }
        }
        for (const url of shownGroups) {
            if (groupLayers.has(url)) continue;
            const gf = groupFiles.find((g) => g.url === url);
            if (!gf) continue;
            const fc = {
                type: 'FeatureCollection',
                features: gf.features.map((f) => ({
                    type: 'Feature' as const,
                    geometry: f.geometry,
                    properties: { name: gf.name }
                }))
            };
            const layer = L.geoJSON(fc, { style: () => PUBLISHED_STYLE }).addTo(map);
            layer.eachLayer((l: any) => {
                l.options.pmIgnore = true;
            });
            groupLayers.set(url, layer);
        }
    });

    // --- toggles ---

    function toggleSet(set: Set<string>, url: string): Set<string> {
        const next = new Set(set);
        if (next.has(url)) next.delete(url);
        else next.add(url);
        return next;
    }

    // --- session groups / zones ---

    function addGroup(): void {
        pushHistory();
        const id = genId('g');
        groups = [...groups, { id, name: '', regions: '' }];
        activeGroupId = id;
    }

    // Is a published group already loaded into the session for editing?
    function isEditing(url: string): boolean {
        return groups.some((g) => g.originUrl === url);
    }

    // Load a published group into the editor for editing. Idempotent: if the
    // same published group is already loaded, just activate that session group
    // instead of creating a duplicate (which would double its zones and bypass
    // the overlap check via the shared originUrl).
    function editGroup(gf: GroupFile): void {
        const existing = groups.find((g) => g.originUrl === gf.url);
        if (existing) {
            activeGroupId = existing.id;
            return;
        }
        pushHistory();
        const id = genId('g');
        const loaded: EditorPolygon[] = gf.features.map((f) => ({
            id: genId('z'),
            groupId: id,
            kind: 'polygon',
            geom: f.geometry,
            label: (f.properties?.name as string) || gf.name
        }));
        groups = [
            ...groups,
            {
                id,
                name: gf.name,
                regions: gf.regions,
                radio: gf.radio,
                pathHashMode: gf.pathHashMode,
                originUrl: gf.url
            }
        ];
        polygons = [...polygons, ...loaded];
        activeGroupId = id;
        // Hide the published copy so only the editable (session) version shows.
        if (shownGroups.has(gf.url)) shownGroups = toggleSet(shownGroups, gf.url);
        showNotice(`${$locales('meshcoreconfig.zones.editor_title')}: ${gf.name}`);
    }

    // Create a copy of a published group for editing: same settings (name,
    // regions, radio, path.hash.mode) but NO zones and no originUrl — a fresh
    // independent session group the user draws new polygons into. Unlike
    // editGroup this is not idempotent: each click makes a new copy.
    function duplicateGroup(gf: GroupFile): void {
        pushHistory();
        const id = genId('g');
        groups = [
            ...groups,
            {
                id,
                name: gf.name,
                regions: gf.regions,
                radio: gf.radio,
                pathHashMode: gf.pathHashMode
            }
        ];
        activeGroupId = id;
        showNotice(`${$locales('meshcoreconfig.zones.duplicate_done')}: ${gf.name}`);
    }

    function updateGroupName(id: string, name: string): void {
        groups = groups.map((g) => (g.id === id ? { ...g, name } : g));
    }
    // Update a group's full meshcore preset (regions + radio + path.hash.mode)
    // from the settings modal. No pushHistory: a settings-modal edit is not a
    // geometric/structural change worth an undo step, same as the group name.
    function updateGroupMeshcore(
        id: string,
        regions: string,
        radio: RadioSpec | undefined,
        pathHashMode: string | undefined
    ): void {
        groups = groups.map((g) => (g.id === id ? { ...g, regions, radio, pathHashMode } : g));
        meshcoreEditId = null;
    }
    function removeGroup(id: string): void {
        pushHistory();
        groups = groups.filter((g) => g.id !== id);
        polygons = polygons.filter((p) => p.groupId !== id);
        if (activeGroupId === id) activeGroupId = null;
    }
    // Make a group the target for newly created zones. One-way (clicking another
    // group switches the target). Guarded so a click that removes the group (the
    // ✕ button bubbles to the card) does not leave a dangling activeGroupId.
    function activateGroup(id: string): void {
        if (groups.some((g) => g.id === id)) activeGroupId = id;
    }
    // Rename a zone. No pushHistory: text edits are excluded from the undo
    // stack (same as group name/regions) to avoid flooding it per keystroke.
    function updateZoneLabel(zoneId: string, label: string): void {
        polygons = polygons.map((p) => (p.id === zoneId ? { ...p, label } : p));
    }
    function setZoneGroup(zoneId: string, groupId: string): void {
        pushHistory();
        polygons = polygons.map((p) => (p.id === zoneId ? { ...p, groupId: groupId || null } : p));
    }
    function removePolygon(id: string): void {
        pushHistory();
        polygons = polygons.filter((p) => p.id !== id);
    }
    function zonesIn(groupId: string | null): EditorPolygon[] {
        return polygons.filter((p) => p.groupId === groupId);
    }

    // --- user file upload (base boundary or group, auto-detected) ---

    function stripGeoExt(name: string): string {
        return name.replace(/\.geojson$/i, '');
    }

    // A file is a "group" when it carries a meshcore preset with a regions value
    // (in metadata.meshcore/regions or on a feature); otherwise it is a plain
    // reference boundary. detectGroupMeshcore returns the full preset (regions +
    // optional radio/pathHashMode) or null.


    async function onFilePicked(e: Event): Promise<void> {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        let fc: GeoJSON.FeatureCollection;
        try {
            fc = JSON.parse(await file.text()) as GeoJSON.FeatureCollection;
        } catch (err) {
            console.warn('[meshcore-zone]', 'user file parse failed', err);
            showNotice($locales('meshcoreconfig.zones.load_file_invalid'));
            return;
        }
        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
            showNotice($locales('meshcoreconfig.zones.load_file_invalid'));
            return;
        }
        const meshcore = detectGroupMeshcore(fc);
        if (meshcore) loadFileAsGroup(fc, file.name, meshcore);
        else loadFileAsBoundary(fc, file.name);
    }

    function loadFileAsBoundary(fc: GeoJSON.FeatureCollection, filename: string): void {
        const key = `user://${filename}/${genId('u')}`;
        boundaryLoaders.set(key, () => Promise.resolve(fc));
        boundaryEntries = [...boundaryEntries, { key, filename: stripGeoExt(filename) }];
        shownBoundaries = new Set([...shownBoundaries, key]);
        console.info('[meshcore-zone]', 'user_boundary_loaded', filename);
        showNotice(`${$locales('meshcoreconfig.zones.load_file_done')}: ${stripGeoExt(filename)}`);
    }

    function loadFileAsGroup(
        fc: GeoJSON.FeatureCollection,
        filename: string,
        meshcore: MeshcoreZoneSettings
    ): void {
        const meta = (fc as { metadata?: { group?: unknown; name?: unknown } }).metadata ?? {};
        const name =
            (typeof meta.group === 'string' && meta.group) ||
            (typeof meta.name === 'string' && meta.name) ||
            stripGeoExt(filename);
        const features = parseZoneFeatures(fc.features, meshcore.regions);
        if (features.length === 0) {
            showNotice($locales('meshcoreconfig.zones.load_file_invalid'));
            return;
        }
        pushHistory();
        const id = genId('g');
        const loaded: EditorPolygon[] = features.map((f) => ({
            id: genId('z'),
            groupId: id,
            kind: 'polygon' as const,
            geom: f.geometry,
            label: (f.properties?.name as string) || name
        }));
        groups = [
            ...groups,
            {
                id,
                name,
                regions: meshcore.regions,
                radio: meshcore.radio,
                pathHashMode: meshcore.pathHashMode
            }
        ];
        polygons = [...polygons, ...loaded];
        activeGroupId = id;
        console.info('[meshcore-zone]', 'user_group_loaded', name);
        showNotice(`${$locales('meshcoreconfig.zones.load_file_done')}: ${name}`);
    }

    function removeUserBoundary(key: string): void {
        const layer = boundaryLayers.get(key);
        if (layer && map) map.removeLayer(layer);
        boundaryLayers.delete(key);
        boundaryLoaders.delete(key);
        boundaryEntries = boundaryEntries.filter((b) => b.key !== key);
        const next = new Set(shownBoundaries);
        next.delete(key);
        shownBoundaries = next;
    }

    // --- export: one file per session group ---

    function exportOne(g: ZoneGroup): void {
        const zones: ExportZone[] = polygons
            .filter((p) => p.groupId === g.id)
            .map((p) => ({
                id: p.id,
                geometry: p.geom as ZoneGeometry,
                regions: g.regions,
                group: g.name,
                radio: g.radio,
                pathHashMode: g.pathHashMode,
                properties: p.label ? { name: p.label } : undefined
            }));
        const v = validateExport(zones);
        if (!v.valid) {
            exportProblems = [...exportProblems, ...v.problems];
            return;
        }
        const slug =
            g.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_') ||
            g.regions.replace(/\s+/g, '-') ||
            g.id;
        downloadCatalog(
            serializeGroup(
                g.name,
                { regions: g.regions, radio: g.radio, pathHashMode: g.pathHashMode },
                zones
            ),
            `mczones-${slug}.geojson`
        );
    }

    function doExport(): void {
        if (exportableGroups.length === 0) {
            exportProblems = [$locales('meshcoreconfig.zones.export_empty')];
            return;
        }
        exportProblems = [];
        exportableGroups.forEach((g, i) => {
            setTimeout(() => exportOne(g), i * 350);
        });
        console.info('[meshcore-zone]', 'export_done', exportableGroups.length);
        showNotice(`${$locales('meshcoreconfig.zones.export_done')} (${exportableGroups.length})`);
    }

    onMount(async () => {
        for (const b of boundaryFileList()) {
            boundaryLoaders.set(b.url, () => fetchBoundaryFile(b.url).then((bf) => bf?.fc ?? null));
            boundaryEntries = [...boundaryEntries, { key: b.url, filename: b.filename }];
        }

        try {
            L = await loadLeaflet();
            await loadGeoman();
        } catch (err) {
            console.warn('[meshcore-zone]', 'leaflet/geoman load failed', err);
            loadError = true;
            return;
        }

        map = L.map(container).setView([55.75, 37.62], 5);
        map.attributionControl.setPrefix(false);
        L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_TILE_ATTRIBUTION }).addTo(map);

        map.pm.setGlobalOptions({ allowSelfIntersection: false });
        map.on('pm:create', onPmCreate);

        // Brush mouse handling (LMB paint, RMB pan) + context-menu suppression.
        container.addEventListener('mousedown', onDomMouseDown);
        container.addEventListener('mousemove', onDomMouseMove);
        container.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('mouseup', onDocMouseUp);

        // Published groups are needed for the overlap check (all of them, server-
        // wide) regardless of display, so they are loaded up front.
        groupFiles = await fetchGroupFiles();
        map.invalidateSize();
    });

    onDestroy(() => {
        teardownBrush();
        if (typeof container !== 'undefined' && container) {
            container.removeEventListener('mousedown', onDomMouseDown);
            container.removeEventListener('mousemove', onDomMouseMove);
            container.removeEventListener('contextmenu', onContextMenu);
        }
        document.removeEventListener('mouseup', onDocMouseUp);
        if (map) {
            map.off('pm:create');
            try {
                map.pm?.disableDraw();
                map.pm?.removeControls();
            } catch {
                /* best-effort geoman teardown */
            }
            map.remove();
            map = null;
        }
    });
</script>

<div
    class="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
>
    <div class="flex h-[80vh] w-[80vw] min-w-0 flex-col rounded-lg border border-orange-600 bg-gray-800 p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-lg font-semibold text-orange-200">
                {$locales('meshcoreconfig.zones.editor_title')}
            </h3>
        </div>

        {#if loadError}
            <div class="flex h-72 items-center justify-center rounded-md border border-gray-700 bg-gray-900 p-4 text-center text-sm text-red-300">
                {$locales('meshcoreconfig.map_load_error')}
            </div>
        {:else}
            <div class="flex min-h-0 flex-1 gap-3">
                <!-- Map + on-map tool palette -->
                <div class="relative flex-1">
                    <div
                        bind:this={container}
                        class="h-full min-h-[300px] w-full overflow-hidden rounded-md border border-gray-700 bg-gray-900"
                    ></div>

                    <div class="pointer-events-none absolute left-2 top-2 z-[1000] flex flex-col items-start gap-2">
                        <div class="pointer-events-auto flex flex-col gap-1 rounded-md border border-gray-700 bg-gray-900/90 p-1 shadow-lg">
                            {#each TOOLS as t (t.id)}
                                <button
                                    type="button"
                                    title={$locales(`meshcoreconfig.zones.${t.tipKey}`)}
                                    onclick={() => setMode(t.id)}
                                    class={`flex h-9 w-9 items-center justify-center rounded text-base ${mode === t.id ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {t.glyph}
                                </button>
                            {/each}
                            <div class="my-0.5 h-px bg-gray-700"></div>
                            <button
                                type="button"
                                title={$locales('meshcoreconfig.zones.erase_mode')}
                                onclick={() => (eraseOn = !eraseOn)}
                                class={`flex h-9 w-9 items-center justify-center rounded text-base ${eraseOn ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                                🧽
                            </button>
                            <button
                                type="button"
                                title={$locales('meshcoreconfig.zones.undo')}
                                onclick={undo}
                                disabled={undoStack.length === 0}
                                class={`flex h-9 w-9 items-center justify-center rounded text-base ${undoStack.length === 0 ? 'cursor-not-allowed bg-gray-700 text-gray-500 opacity-60' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                                ↶
                            </button>
                        </div>

                        {#if mode === 'brush'}
                            <label class="pointer-events-auto flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/90 px-2 py-1 text-[11px] text-gray-200 shadow-lg">
                                <span>{$locales('meshcoreconfig.zones.brush_radius')}</span>
                                <input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={brushRadiusM / 1000}
                                    oninput={(e) => setBrushRadiusKm(Number((e.currentTarget as HTMLInputElement).value))}
                                    class="w-16 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-xs text-gray-100 outline-none focus:border-orange-500"
                                />
                                <span>km</span>
                            </label>
                        {/if}

                        <div class="pointer-events-none max-w-[230px] rounded bg-gray-900/80 px-2 py-1 text-[10px] leading-snug text-gray-300 shadow">
                            {#if mode === 'select'}
                                {$locales('meshcoreconfig.zones.click_boundary_hint')}
                            {:else if mode === 'brush'}
                                {$locales('meshcoreconfig.zones.brush_hint')}
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
                    <!-- Load a user GeoJSON (auto: group if it has regions, else boundary) -->
                    <div>
                        <input bind:this={fileInput} type="file" accept=".geojson,application/geo+json,application/json" class="hidden" onchange={onFilePicked} />
                        <button type="button" onclick={() => fileInput?.click()} title={$locales('meshcoreconfig.zones.load_file_hint')} class="w-full rounded bg-gray-700 px-2 py-1 text-xs text-orange-200 hover:bg-gray-600">
                            📁 {$locales('meshcoreconfig.zones.load_file')}
                        </button>
                    </div>

                    <!-- Base boundary files -->
                    <div class="rounded-md border border-gray-700 bg-gray-900/50 p-2">
                        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {$locales('meshcoreconfig.zones.boundaries_section')}
                        </span>
                        <div class="space-y-1">
                            {#each boundaryEntries as b (b.key)}
                                <label class="flex items-center gap-2 text-[11px] text-gray-300">
                                    <input type="checkbox" class="h-3 w-3" checked={shownBoundaries.has(b.key)} onchange={() => (shownBoundaries = toggleSet(shownBoundaries, b.key))} />
                                    <span class="min-w-0 flex-1 truncate" title={b.filename}>{b.filename}</span>
                                    {#if b.key.startsWith('user://')}
                                        <button type="button" onclick={() => removeUserBoundary(b.key)} class="shrink-0 text-[10px] text-gray-400 hover:text-red-300">✕</button>
                                    {/if}
                                </label>
                            {/each}
                            {#if boundaryEntries.length === 0}
                                <span class="text-[11px] text-gray-500">—</span>
                            {/if}
                        </div>
                    </div>

                    <!-- Published groups -->
                    <div class="rounded-md border border-gray-700 bg-gray-900/50 p-2">
                        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {$locales('meshcoreconfig.zones.published_section')}
                        </span>
                        <div class="space-y-1">
                            {#each groupFiles as gf (gf.url)}
                                <div class="flex items-center gap-1 text-[11px] text-gray-300">
                                    <input type="checkbox" class="h-3 w-3 shrink-0" checked={shownGroups.has(gf.url)} onchange={() => (shownGroups = toggleSet(shownGroups, gf.url))} />
                                    <span class="min-w-0 flex-1 truncate" title={`${gf.name} · ${gf.regions}`}>
                                        {gf.name}<span class="text-gray-500"> · {gf.regions}</span>
                                    </span>
                                    <button type="button" onclick={() => editGroup(gf)} disabled={isEditing(gf.url)} title={isEditing(gf.url) ? $locales('meshcoreconfig.zones.editing_published') : $locales('meshcoreconfig.zones.edit_hint')} class="shrink-0 rounded bg-gray-700 px-1 py-0.5 text-[10px] text-orange-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40">
                                        ✎
                                    </button>
                                    <button type="button" onclick={() => duplicateGroup(gf)} title={$locales('meshcoreconfig.zones.duplicate_hint')} class="shrink-0 rounded bg-gray-700 px-1 py-0.5 text-[10px] text-orange-200 hover:bg-gray-600">
                                        📋
                                    </button>
                                </div>
                            {/each}
                            {#if groupFiles.length === 0}
                                <span class="text-[11px] text-gray-500">—</span>
                            {/if}
                        </div>
                    </div>

                    <!-- Session groups -->
                    <div class="rounded-md border border-gray-700 bg-gray-900/50 p-2">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                {$locales('meshcoreconfig.zones.group_label')}
                            </span>
                            <button type="button" onclick={addGroup} class="rounded bg-gray-700 px-2 py-0.5 text-xs text-orange-200 hover:bg-gray-600">
                                + {$locales('meshcoreconfig.zones.group_new')}
                            </button>
                        </div>

                        {#each groups as g (g.id)}
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                            <div class={`mb-2 cursor-pointer rounded border-l-4 bg-gray-800 p-2 ${activeGroupId === g.id ? 'ring-1 ring-orange-500' : ''}`} style={`border-left-color: ${groupColor(g.id)}`} onclick={() => activateGroup(g.id)}>
                                <div class="flex items-center gap-1">
                                    <span class="inline-block h-3 w-3 shrink-0 rounded-sm" style={`background-color: ${groupColor(g.id)}`}></span>
                                    <input type="text" value={g.name} oninput={(e) => updateGroupName(g.id, (e.currentTarget as HTMLInputElement).value)} placeholder={$locales('meshcoreconfig.zones.group_name_prompt')} class={`min-w-0 flex-1 rounded-md border bg-gray-700 px-2 py-1 text-xs text-gray-100 outline-none focus:border-orange-500 ${g.name.trim() ? 'border-gray-600' : 'border-red-500'}`} />
                                    <button type="button" onclick={(e) => { e.stopPropagation(); meshcoreEditId = g.id; }} title={$locales('meshcoreconfig.zones.meshcore_settings')} class={`shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs hover:bg-gray-600 ${g.radio || g.pathHashMode ? 'text-orange-200' : 'text-gray-300'}`}>
                                        ⚙
                                    </button>
                                    <button type="button" onclick={() => removeGroup(g.id)} class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300 hover:bg-gray-600">
                                        ✕
                                    </button>
                                </div>
                                {#if g.originUrl}
                                    <span class="mt-0.5 block text-[10px] text-sky-300">✎ {$locales('meshcoreconfig.zones.editing_published')}</span>
                                {/if}
                                <!-- Meshcore preset summary (edited via the ⚙ modal):
                                regions + optional radio/path hash. -->
                                <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                    <span
                                        class={`font-mono ${isValidRegions(g.regions) ? 'text-gray-300' : 'text-red-400'}`}
                                        title={$locales('meshcoreconfig.zones.regions_label')}
                                    >{g.regions || $locales('meshcoreconfig.zones.regions_placeholder')}</span>
                                    {#if g.radio}
                                        <span class="text-gray-500">· {g.radio.freq}</span>
                                    {/if}
                                    {#if g.pathHashMode}
                                        <span class="text-gray-500">· path {g.pathHashMode}</span>
                                    {/if}
                                </div>

                                <div class="mt-1 space-y-1">
                                    {#each zonesIn(g.id) as p (p.id)}
                                        <div class="flex items-center gap-1 text-[11px] text-gray-300">
                                            <span class="shrink-0">{p.kind === 'circle' ? '◯' : '⬠'}</span>
                                            <input type="text" value={p.label ?? ''} oninput={(e) => updateZoneLabel(p.id, (e.currentTarget as HTMLInputElement).value)} placeholder={$locales('meshcoreconfig.zones.zone_name')} title={p.id} class="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-orange-500" />
                                            <select class="max-w-[5rem] shrink-0 truncate rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-[10px] text-gray-100 outline-none" value={p.groupId ?? ''} onchange={(e) => setZoneGroup(p.id, (e.currentTarget as HTMLSelectElement).value)}>
                                                <option value="">{$locales('meshcoreconfig.zones.no_group')}</option>
                                                {#each groups as og (og.id)}<option value={og.id}>{og.name}</option>{/each}
                                            </select>
                                            <button type="button" onclick={() => removePolygon(p.id)} class="shrink-0 rounded bg-gray-700 px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-600">✕</button>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}

                        {#if zonesIn(null).length > 0}
                            <div class="mt-1 rounded border-l-4 border-gray-500 bg-gray-800/60 p-2">
                                <span class="text-[11px] font-medium text-gray-400">{$locales('meshcoreconfig.zones.no_group')}</span>
                                <div class="mt-1 space-y-1">
                                    {#each zonesIn(null) as p (p.id)}
                                        <div class="flex items-center gap-1 text-[11px] text-gray-300">
                                            <span class="shrink-0">{p.kind === 'circle' ? '◯' : '⬠'}</span>
                                            <input type="text" value={p.label ?? ''} oninput={(e) => updateZoneLabel(p.id, (e.currentTarget as HTMLInputElement).value)} placeholder={$locales('meshcoreconfig.zones.zone_name')} title={p.id} class="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-orange-500" />
                                            <select class="max-w-[5rem] shrink-0 truncate rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-[10px] text-gray-100 outline-none" value="" onchange={(e) => setZoneGroup(p.id, (e.currentTarget as HTMLSelectElement).value)}>
                                                <option value="">{$locales('meshcoreconfig.zones.no_group')}</option>
                                                {#each groups as og (og.id)}<option value={og.id}>{og.name}</option>{/each}
                                            </select>
                                            <button type="button" onclick={() => removePolygon(p.id)} class="shrink-0 rounded bg-gray-700 px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-600">✕</button>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        {#if notice}
            <div class="mt-2 text-xs text-orange-200">{notice}</div>
        {/if}
        {#if exportProblems.length > 0}
            <div class="mt-2 text-xs text-red-400">{exportProblems.join(', ')}</div>
        {/if}

        <div class="mt-3 flex items-center justify-between gap-3">
            <span class="text-xs text-gray-500">
                {$locales('meshcoreconfig.zones.export')}: {exportableGroups.length}/{groups.length} · {polygons.length}
            </span>
            <div class="flex gap-3">
                <button type="button" onclick={onclose} class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600">
                    {$locales('common.cancel')}
                </button>
                <button type="button" onclick={doExport} disabled={loadError || exportableGroups.length === 0} class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {$locales('meshcoreconfig.zones.export')}
                </button>
            </div>
        </div>
    </div>
</div>

{#if meshcoreEditGroup}
    <ZoneMeshcoreSettingsModal
        regions={meshcoreEditGroup.regions}
        radio={meshcoreEditGroup.radio}
        pathHashMode={meshcoreEditGroup.pathHashMode}
        onsave={(regions, radio, pathHashMode) =>
            updateGroupMeshcore(meshcoreEditGroup.id, regions, radio, pathHashMode)}
        onclose={() => (meshcoreEditId = null)}
    />
{/if}
