import { area as turfArea } from '@turf/area';
import { bbox as turfBbox } from '@turf/bbox';
import { difference as turfDifference } from '@turf/difference';
import {
    featureCollection,
    multiPolygon as turfMultiPolygon,
    polygon as turfPolygon
} from '@turf/helpers';
import fs from 'fs';

const toTurf = (g) =>
    g.type === 'Polygon' ? turfPolygon(g.coordinates) : turfMultiPolygon(g.coordinates);
const fromTurf = (f) => {
    const g = f.geometry;
    return g.type === 'MultiPolygon'
        ? { type: 'MultiPolygon', coordinates: g.coordinates }
        : { type: 'Polygon', coordinates: g.coordinates };
};
const MIN = 1000; // ZONE_MIN_AREA_M2
const validate = (g) => turfArea(toTurf(g)) > MIN;
const diff = (a, b) => turfDifference(featureCollection([a, b]));
function subtractExisting(newGeom, existing) {
    let cur = toTurf(newGeom);
    for (const ex of existing) {
        if (!cur) break;
        cur = diff(cur, toTurf(ex));
    }
    if (!cur) return { ok: false, reason: 'covered' };
    const r = fromTurf(cur);
    if (!validate(r)) return { ok: false, reason: 'invalid' };
    return { ok: true };
}

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const nng = load('static/data/boundaries/OSMB-rus-nng.geojson');
// published group geometries
const pubFiles = [
    'mczones-nizhniy_novgorod.geojson',
    'mczones-mczones-nng-bor.geojson',
    'mczones-stavropol.geojson'
];
const pub = [];
for (const f of pubFiles) {
    try {
        const j = load('static/data/groups/' + f);
        for (const ft of j.features || [])
            if (
                ft.geometry &&
                (ft.geometry.type === 'Polygon' || ft.geometry.type === 'MultiPolygon')
            )
                pub.push({ f, geom: ft.geometry });
    } catch (e) {}
}
console.log('published polys:', pub.length);

// Test each boundary feature: empty existing, then vs published
let okEmpty = 0,
    failEmpty = 0,
    okPub = 0,
    covered = 0,
    invalid = 0,
    throwN = 0;
for (const ft of nng.features) {
    const geom = ft.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) continue;
    // bbox of boundary
    // (a) empty
    try {
        const r = subtractExisting(geom, []);
        if (r.ok) okEmpty++;
        else failEmpty++;
    } catch (e) {
        throwN++;
        console.log('THROW empty on', ft.properties?.name, e.message);
    }
    // (b) vs published (same-level sim)
    try {
        // bbox prefilter
        const r = subtractExisting(
            geom,
            pub.map((p) => p.geom)
        );
        if (r.ok) okPub++;
        else {
            if (r.reason === 'covered') covered++;
            else invalid++;
        }
    } catch (e) {
        throwN++;
        console.log('THROW pub on', ft.properties?.name, e.message);
    }
}
console.log('boundaries tested:', nng.features.length);
console.log('vs EMPTY  -> ok:', okEmpty, 'fail:', failEmpty);
console.log('vs PUB    -> ok:', okPub, 'covered:', covered, 'invalid:', invalid, 'throws:', throwN);
