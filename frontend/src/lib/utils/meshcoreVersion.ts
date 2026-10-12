// Firmware version parsing/comparison for meshcore device gating (task 72),
// plus grouping of meshcore manifest version strings by build.
//
// The `ver` command returns a free-form version string. We extract the leading
// numeric components (major, minor, patch) and compare as a tuple so features
// can be gated on a minimum version (e.g. `region def` requires >= 1.16.0).

export type SemVer = [number, number, number];

// Parse the leading "major.minor.patch" out of a version string. Missing
// components default to 0. Non-numeric prefixes/suffixes are ignored.
// Examples: 'v1.16' -> [1,16,0], '1.16.2-rc1' -> [1,16,2], '' -> [0,0,0].
export function parseDeviceVersion(raw: string): SemVer {
    if (!raw) return [0, 0, 0];
    const matches = raw.trim().match(/\d+/g);
    if (!matches || matches.length === 0) return [0, 0, 0];
    const major = Number(matches[0]) || 0;
    const minor = Number(matches[1]) || 0;
    const patch = Number(matches[2]) || 0;
    return [major, minor, patch];
}

// Return true when version `a` >= `b` (component-wise tuple comparison).
export function versionGte(a: SemVer, b: SemVer): boolean {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true; // all components equal
}

// Short commit-hash segment of a meshcore manifest version string:
// 7-8 lowercase hex chars ('5adbde0' in 'v1.17.1b3.5adbde0.companion.radio_uni').
const HASH_SEGMENT_RE = /^[0-9a-f]{7,8}$/;

// Group key of a meshcore manifest version string ("build" part): everything
// up to and including the short commit hash. A string that does not match the
// template (no hash-like segment, or the hash in the last position without a
// variant after it) is returned unchanged — it forms its own single-item group.
function meshcoreVersionGroupKey(version: string): string {
    const segments = version.trim().split('.');
    // The hash needs a version part before it and a variant part after it.
    for (let i = 1; i < segments.length - 1; i++) {
        if (HASH_SEGMENT_RE.test(segments[i])) {
            return segments.slice(0, i + 1).join('.');
        }
    }
    return version;
}

// Indices of `versions` at which a new build group starts: the group key
// differs from the previous line's key. Index 0 is never a start. The array
// is not modified — grouping never reorders or filters anything.
export function meshcoreVersionGroupStarts(versions: string[]): Set<number> {
    const starts = new Set<number>();
    let previousKey = versions.length > 0 ? meshcoreVersionGroupKey(versions[0]) : '';
    for (let i = 1; i < versions.length; i++) {
        const key = meshcoreVersionGroupKey(versions[i]);
        if (key !== previousKey) starts.add(i);
        previousKey = key;
    }
    // All groups are single-item (every adjacent key differs): a line before
    // every row would only clutter the list, so render no separators at all.
    if (versions.length > 1 && starts.size === versions.length - 1) {
        return new Set<number>();
    }
    return starts;
}
