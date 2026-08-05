// Centralized configuration for the meshcore GeoJSON zone feature (task 72).
//
// Two kinds of static GeoJSON assets live under frontend/static/data/, both
// auto-discovered at build time (import.meta.glob in zoneCatalog.ts):
//   - data/boundaries/*.geojson — base administrative boundaries (no
//     characteristics; reference shapes the user clicks to create zones).
//   - data/groups/*.geojson     — published groups: each file one group with a
//     name + `regions` characteristic. These are the source of truth for the
//     `regions` lookup (a point resolves to exactly one group).
// All URLs/parameters live here so nothing is hardcoded in components (see
// docs/conventions.md — no hardcoded URLs/paths).

// Current catalog schema version. Bumped only on a breaking schema change; the
// loader migrates older files automatically (see zoneCatalog.ts).
export const ZONE_CATALOG_SCHEMA = 1;

// Number of vertices used when approximating a drawn circle as a polygon for
// export/lookup. 64 is precise enough for region-scale radii (km–tens of km).
export const ZONE_CIRCLE_STEPS = 64;

// Minimum polygon area (m^2) accepted as a valid boolean-operation result.
// Results below this are treated as empty/sliver and rejected.
export const ZONE_MIN_AREA_M2 = 1;

// OSM raster tile layer (same source as CoordinateMapPicker).
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Administrative boundaries reference layer (drawing aid, task 72). The
// admin/developer drops one or more boundary GeoJSON files (e.g. ADM3 per
// country) into static/data/boundaries/ and they are ALL auto-loaded at build
// time (no manifest). This is NOT the zone catalog (no `regions`, never used for
// lookup). Optional: if the folder is empty, drawing continues without
// boundaries.
//
// The glob path in zoneCatalog.ts must be a literal (Vite constraint).

// Leaflet runtime CDN (kept out of the npm bundle, same as CoordinateMapPicker).
export const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// Leaflet-Geoman Free runtime CDN (drawing/editing/cut tools). MIT.
export const GEOMAN_CSS =
    'https://cdn.jsdelivr.net/npm/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.css';
export const GEOMAN_JS =
    'https://cdn.jsdelivr.net/npm/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.min.js';

// Firmware version at which the `region def` command is supported.
export const REGION_DEF_MIN_VERSION: [number, number, number] = [1, 16, 0];
