import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Runtime discovery + content of published group files (task 72). Unlike
// boundaries (baked into the image at build and served from build/client by
// adapter-node), groups support "live add": the administrator drops a new
// .geojson into the mounted static/data/groups/ directory and it shows up in the
// editor/picker without an image rebuild. Because adapter-node only serves the
// BAKED static directory, live-added files are not reachable as plain static
// URLs — so this endpoint reads them from disk and returns both name and parsed
// content in one response. Always answers 200; a missing/unreadable dir or file
// is skipped so the client degrades to "no groups".
export const GET: RequestHandler = async () => {
    const dir = path.resolve(process.cwd(), 'static', 'data', 'groups');
    const groups: { filename: string; json: unknown }[] = [];
    try {
        if (existsSync(dir)) {
            const files = readdirSync(dir)
                .filter((f) => f.toLowerCase().endsWith('.geojson'))
                .sort();
            for (const f of files) {
                try {
                    groups.push({
                        filename: f,
                        json: JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
                    });
                } catch (err) {
                    console.warn('[meshcore-zone]', 'group file read failed', f, err);
                }
            }
        }
    } catch (err) {
        console.warn('[meshcore-zone]', 'groups dir list failed', dir, err);
    }
    return json({ groups });
};
