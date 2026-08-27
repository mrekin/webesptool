// Pure geometry helpers for the meshcore zone feature (task 72). No Svelte, no
// fetch — only turf operations on GeoJSON geometries. Coordinates are GeoJSON
// [lon, lat] throughout this module; Leaflet [lat, lon] conversion happens at
// the component boundary (see toLonLat / toLatLon).
//
// This module is the single swap point for the boolean-operations engine
// (currently @turf). If turf proves too brittle on real geometries, replace the
// implementation here (e.g. with polygon-clipping) without touching callers.

import { area as turfArea } from '@turf/area';
import { bbox as turfBbox } from '@turf/bbox';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { buffer as turfBuffer } from '@turf/buffer';
import { circle as turfCircle } from '@turf/circle';
import { difference as turfDifference } from '@turf/difference';
import {
    featureCollection,
    lineString as turfLineString,
    multiPolygon as turfMultiPolygon,
    point as turfPoint,
    polygon as turfPolygon
} from '@turf/helpers';
import { union as turfUnion } from '@turf/union';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { ZONE_CIRCLE_STEPS, ZONE_MIN_AREA_M2 } from '$lib/config/meshcoreZoneConfig';
import type { MultiPolygonCoords, PolygonCoords, PolygonRing, ZoneGeometry } from '$lib/types';

// --- coordinate conversion (Leaflet [lat,lon] <-> GeoJSON [lon,lat]) ---

export function toLonLat(latLon: [number, number]): [number, number] {
    return [latLon[1], latLon[0]];
}

export function toLatLon(lonLat: [number, number]): [number, number] {
    return [lonLat[1], lonLat[0]];
}

// --- geometry <-> turf feature ---

export function toTurfFeature(geom: ZoneGeometry): Feature<Polygon | MultiPolygon> {
    if (geom.type === 'Polygon') {
        return turfPolygon(geom.coordinates as Position[][]) as Feature<Polygon | MultiPolygon>;
    }
    return turfMultiPolygon(geom.coordinates as Position[][][]) as Feature<Polygon | MultiPolygon>;
}

export function fromTurfFeature(feature: Feature<Polygon | MultiPolygon>): ZoneGeometry {
    const g = feature.geometry;
    if (g.type === 'MultiPolygon') {
        return { type: 'MultiPolygon', coordinates: g.coordinates as MultiPolygonCoords };
    }
    return { type: 'Polygon', coordinates: g.coordinates as PolygonCoords };
}

// Bounding box [minLon, minLat, maxLon, maxLat] used by the lookup prefilter.
export function computeBbox(geom: ZoneGeometry): [number, number, number, number] {
    return turfBbox(toTurfFeature(geom)) as [number, number, number, number];
}

// Area in m² (turf). Used to paint more specific (smaller) admin boundaries on
// top of enclosing ones in the editor, so a region (e.g. Московская область)
// receives hover/click instead of the country/federal-district polygon that
// covers it. Returns 0 on failure (sorts to the bottom of the paint stack).
export function computeArea(geom: ZoneGeometry): number {
    try {
        return turfArea(toTurfFeature(geom));
    } catch {
        return 0;
    }
}

// --- antimeridian (±180°) display unwrap ---

// Shift every longitude in a set of rings by `delta`. Used to align MultiPolygon
// parts that sit on opposite sides of the date line.
function shiftRings(rings: PolygonCoords, delta: number): PolygonCoords {
    if (delta === 0) return rings;
    return rings.map((ring) => ring.map(([lon, lat]) => [lon + delta, lat] as [number, number]));
}

// Make a single ring continuous: walking the vertices, remove >180° jumps by
// accumulating a ±360 shift. A ring already on one side is returned unchanged.
function unwrapRing(ring: PolygonRing): PolygonRing {
    if (ring.length === 0) return ring;
    const out: PolygonRing = [];
    let shift = 0;
    let prev: number | null = null;
    for (const [lon, lat] of ring) {
        if (prev !== null) {
            while (lon + shift - prev > 180) shift -= 360;
            while (lon + shift - prev < -180) shift += 360;
        }
        const l = lon + shift;
        out.push([l, lat] as [number, number]);
        prev = l;
    }
    return out;
}

// Mean longitude of a polygon's exterior ring (its "side" of the date line).
function meanLon(rings: PolygonCoords): number {
    const ring = rings[0];
    if (!ring || ring.length === 0) return 0;
    let sum = 0;
    for (const [lon] of ring) sum += lon;
    return sum / ring.length;
}

// Return a copy of `geom` with antimeridian-crossing shapes made contiguous for
// DISPLAY. Rings are walked to remove >180° jumps, and MultiPolygon parts on
// opposite sides of ±180° are aligned to the largest part's cluster (so some
// longitudes may end up outside [-180,180]). This is display-only: callers must
// keep the original geometry for storage/export/lookup, which must stay in the
// standard [-180,180] range.
export function unwrapAntimeridian(geom: ZoneGeometry): ZoneGeometry {
    if (geom.type === 'Polygon') {
        return { type: 'Polygon', coordinates: geom.coordinates.map(unwrapRing) };
    }
    const parts = geom.coordinates.map((poly) => poly.map(unwrapRing));
    // Align parts to the cluster of the largest part (by exterior-ring vertex
    // count) so a region split across the date line renders as one shape.
    let center = 0;
    let best = -1;
    for (const poly of parts) {
        const n = poly[0]?.length ?? 0;
        if (n > best) {
            best = n;
            center = meanLon(poly);
        }
    }
    const aligned = parts.map((poly) => {
        const d = meanLon(poly) - center;
        return shiftRings(poly, d > 180 ? -360 : d < -180 ? 360 : 0);
    });
    return { type: 'MultiPolygon', coordinates: aligned };
}

// --- circle -> polygon approximation (task 72: circle is a tool artifact) ---

// Approximate a circle (center given in [lat, lon], radius in meters) as a
// polygon with `steps` vertices. Returns GeoJSON Polygon coordinates [lon, lat].
export function circleToPolygon(
    centerLatLon: [number, number],
    radiusMeters: number,
    steps: number = ZONE_CIRCLE_STEPS
): PolygonCoords {
    const feature = turfCircle(toLonLat(centerLatLon), radiusMeters, {
        steps,
        units: 'meters'
    });
    return feature.geometry.coordinates as PolygonCoords;
}

// --- validation (robustness after boolean operations) ---

export interface GeometryValidation {
    valid: boolean;
    reason?: 'empty' | 'self_intersection' | 'too_small';
}

// Validate a geometry: non-null and area above the floor. The self-intersection
// check (turf.kinks) is intentionally NOT run here — it is O(n^2) and prohibitive
// on the dense polygons that come from administrative boundaries (tens of
// thousands of vertices), which made zone commit, export AND the picker lookup
// take minutes. The lookup is defensive anyway: invalid features are skipped.
export function validateGeometry(geom: ZoneGeometry): GeometryValidation {
    const feature = toTurfFeature(geom);
    if (turfArea(feature) <= ZONE_MIN_AREA_M2) {
        return { valid: false, reason: 'too_small' };
    }
    return { valid: true };
}

// Result of a boolean operation: either a valid geometry or a reason the
// operation produced nothing usable.
export type GeometryResult =
    | { ok: true; geometry: ZoneGeometry }
    | { ok: false; reason: 'covered' | 'invalid' };

function diff(
    target: Feature<Polygon | MultiPolygon>,
    subtractor: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> | null {
    // turf v7 difference takes a FeatureCollection: first feature minus the rest.
    return turfDifference(featureCollection([target, subtractor]));
}

// Subtract all `existing` geometries from `newGeom` (no-overlap on commit).
// Returns ok:false with 'covered' when the new polygon is fully inside an
// existing zone, or 'invalid' when the result fails validation.
export function subtractExisting(newGeom: ZoneGeometry, existing: ZoneGeometry[]): GeometryResult {
    let current: Feature<Polygon | MultiPolygon> | null = toTurfFeature(newGeom);
    for (const ex of existing) {
        if (!current) break;
        current = diff(current, toTurfFeature(ex));
    }
    if (!current) return { ok: false, reason: 'covered' };
    const result = fromTurfFeature(current);
    if (!validateGeometry(result).valid) return { ok: false, reason: 'invalid' };
    return { ok: true, geometry: result };
}

// Eraser: subtract `eraser` from `target`. Returns ok:false with 'covered' when
// the whole target is erased, or 'invalid' when validation fails.
export function erase(target: ZoneGeometry, eraser: ZoneGeometry): GeometryResult {
    const current = diff(toTurfFeature(target), toTurfFeature(eraser));
    if (!current) return { ok: false, reason: 'covered' };
    const result = fromTurfFeature(current);
    if (!validateGeometry(result).valid) return { ok: false, reason: 'invalid' };
    return { ok: true, geometry: result };
}

// Buffer a brush trail (list of [lon, lat] points) into a polygon by expanding
// the line by `radiusMeters` on all sides (a round-capped stroke). A single
// point buffers into a circle. Used by the brush tool's commit step.
const BRUSH_BUFFER_STEPS = 24;
export function bufferTrail(points: [number, number][], radiusMeters: number): ZoneGeometry | null {
    if (points.length === 0) return null;
    const feature = points.length === 1 ? turfPoint(points[0]) : turfLineString(points);
    const buffered = turfBuffer(feature, radiusMeters, {
        units: 'meters',
        steps: BRUSH_BUFFER_STEPS
    });
    if (!buffered) return null;
    return fromTurfFeature(buffered as Feature<Polygon | MultiPolygon>);
}

// Merge `addition` into `target` (brush stroke extending an existing zone).
// Returns ok:false with 'invalid' when the union yields nothing usable.
export function unionInto(target: ZoneGeometry, addition: ZoneGeometry): GeometryResult {
    const merged = turfUnion(featureCollection([toTurfFeature(target), toTurfFeature(addition)]));
    if (!merged) return { ok: false, reason: 'invalid' };
    const result = fromTurfFeature(merged);
    if (!validateGeometry(result).valid) return { ok: false, reason: 'invalid' };
    return { ok: true, geometry: result };
}

// Point-in-geometry test (exact). `pointLonLat` is [lon, lat].
export function pointInGeometry(pointLonLat: [number, number], geom: ZoneGeometry): boolean {
    return booleanPointInPolygon(pointLonLat, toTurfFeature(geom), {
        ignoreBoundary: false
    });
}

// --- coordinate text -> polygon (Polygon-by-coordinates tool) ---

export interface ParsedCoordinatePolygon {
    ok: true;
    geometry: ZoneGeometry;
    pointCount: number;
}
export type ParseCoordinatePolygonResult =
    | ParsedCoordinatePolygon
    | { ok: false; reason: 'empty' | 'too_few_points' | 'out_of_range' | 'malformed' };

// Parse a free-form list of polygon vertices typed by the user. Each line is a
// "lat,lng" pair; a comma or whitespace separates the two numbers. Blank lines
// and lines starting with # or // are ignored. Latitude must be in [-90, 90]
// and longitude in [-180, 180]. The ring is auto-closed (first vertex repeated
// at the end) when it is not already, and the resulting Polygon is returned in
// GeoJSON [lon, lat] coordinate order. Used by the Polygon tool's
// "by-coordinates" sub-variant in the editor.
export function parseCoordinatePolygon(text: string): ParseCoordinatePolygonResult {
    const points: [number, number][] = []; // [lat, lng] in human order
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#') || line.startsWith('//')) continue;
        const parts = line.split(/[,\s]+/).filter((s) => s.length > 0);
        if (parts.length < 2) return { ok: false, reason: 'malformed' };
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return { ok: false, reason: 'malformed' };
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { ok: false, reason: 'out_of_range' };
        }
        points.push([lat, lng]);
    }
    if (points.length === 0) return { ok: false, reason: 'empty' };
    if (points.length < 3) return { ok: false, reason: 'too_few_points' };
    // GeoJSON order is [lon, lat]; auto-close the ring if it is open.
    const ring: PolygonRing = points.map(([lat, lng]) => [lng, lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return {
        ok: true,
        geometry: { type: 'Polygon', coordinates: [ring] },
        pointCount: points.length
    };
}
