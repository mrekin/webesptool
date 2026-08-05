// Firmware version parsing/comparison for meshcore device gating (task 72).
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
