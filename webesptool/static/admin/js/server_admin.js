// Server admin page: version cache state panel + manual rebuild.
// Markup in admin/server.html, styles in admin/css/admin.css (.cache-*).
// Dynamic values are inserted via textContent only (no innerHTML for data).
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('rebuild-cache-btn');
    const infoBox = document.getElementById('cache-info');
    const btnText = btn ? btn.textContent : 'Rebuild version cache';

    function fmtTtl(seconds) {
        if (seconds === null || seconds === undefined || seconds < 0) return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    }

    function cell(row, value) {
        const td = document.createElement('td');
        td.textContent = value === null || value === undefined ? '—' : String(value);
        row.appendChild(td);
        return td;
    }

    function note(textParts) {
        // textParts: array of strings and {bold: string} objects
        const p = document.createElement('p');
        p.className = 'cache-note';
        textParts.forEach((part) => {
            if (typeof part === 'string') {
                p.appendChild(document.createTextNode(part));
            } else {
                const b = document.createElement('b');
                b.textContent = part.bold;
                p.appendChild(b);
            }
        });
        return p;
    }

    async function loadInfo() {
        if (!infoBox) return;
        infoBox.textContent = '';
        try {
            const res = await fetch('/api/admin/cache/info');
            const info = await res.json();
            if (!res.ok) throw new Error(info.detail || ('HTTP ' + res.status));

            const summary = document.createElement('div');
            summary.className = 'cache-summary';
            const chip = document.createElement('span');
            chip.className = 'cache-chip cache-chip-' + (info.source || 'none');
            chip.textContent = info.source || 'none';
            summary.appendChild(chip);
            const meta = document.createElement('span');
            meta.className = 'cache-meta';
            const add = (label, value) => {
                meta.appendChild(document.createTextNode(label));
                const b = document.createElement('b');
                b.textContent = value;
                meta.appendChild(b);
            };
            add('Built at:', info.built_at || '—');
            add('TTL left:', fmtTtl(info.ttl_seconds_left));
            summary.appendChild(meta);
            infoBox.appendChild(summary);

            const table = document.createElement('table');
            table.className = 'cache-table';
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            ['Folder', 'Repositories', 'Last version', 'Build date'].forEach((t) => {
                const th = document.createElement('th');
                th.textContent = t;
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            if (!info.folders || info.folders.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4;
                td.textContent = 'Cache is empty';
                tr.appendChild(td);
                tbody.appendChild(tr);
            } else {
                info.folders.forEach((f) => {
                    const tr = document.createElement('tr');
                    cell(tr, f.path);
                    const srcsTd = document.createElement('td');
                    (f.srcs || []).forEach((src, i) => {
                        if (i > 0) srcsTd.appendChild(document.createElement('br'));
                        srcsTd.appendChild(document.createTextNode(src));
                    });
                    tr.appendChild(srcsTd);
                    cell(tr, f.version);
                    cell(tr, f.date);
                    tbody.appendChild(tr);
                });
            }
            table.appendChild(tbody);
            infoBox.appendChild(table);

            if (info.legacy_sources > 0) {
                infoBox.appendChild(note([
                    '+ ' + info.legacy_sources +
                    ' legacy source(s) without a path — shown without badge, not cached.'
                ]));
            }

            infoBox.appendChild(note([
                'API: ', {bold: 'POST /api/admin/cache/rebuild'}, ' · ',
                {bold: 'GET /api/admin/cache/info'}
            ]));
        } catch (e) {
            infoBox.textContent = 'Failed to load cache info: ' + e.message;
        }
    }

    if (btn) {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Rebuilding…';
            try {
                const res = await fetch('/api/admin/cache/rebuild', { method: 'POST' });
                const result = await res.json().catch(() => ({}));
                if (res.ok) {
                    showAlert('Version cache rebuilt: ' + result.repos + ' repositories (' +
                              result.paths + ' folders)', 'success');
                    await loadInfo();
                } else {
                    const detail = result.detail || ('HTTP ' + res.status);
                    showAlert('Cache rebuild failed: ' + detail, 'danger');
                }
            } catch (e) {
                showAlert('Cache rebuild failed: ' + e.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.textContent = btnText;
            }
        });
    }

    loadInfo();
});
