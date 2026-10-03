/*
 * News admin page logic (task 86). Plain browser JS, global functions.
 * Reads server context once from the #admin-bootstrap JSON block rendered
 * by news_edit.html, then works entirely against the admin API.
 */

// --- Bootstrap config (rendered by the server, read once) -----------------
const BOOTSTRAP = JSON.parse(document.getElementById('admin-bootstrap').textContent);
const LANGUAGES = BOOTSTRAP.languages || [];

// --- Page state -------------------------------------------------------------
let newsCache = [];        // news items currently shown in the list (accumulated pages)
let total = 0;             // total items matching the current search/filter
let offset = 0;            // offset of the NEXT page (newsCache.length after load)
let search = '';           // current search text
let statusFilter = '';     // '' | 'show' | 'hide'
let currentNewsId = null;  // selected news id, null for "New"
let isNew = false;         // true while an unsaved "New" item is being edited
let isJsonMode = false;    // JSON editor mode active
let previewLang = 'all';   // 'all' or language code
let baselineJson = null;   // serialized form payload snapshot (unsaved-changes guard)
const PAGE_SIZE = 50;

// --- Helpers ----------------------------------------------------------------

// Escape a server-derived string for safe insertion into HTML.
function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Same engine and options as the public feed (marked 16, breaks + gfm),
// so the preview markup matches the feed structurally.
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined') {
        return '<p class="preview-muted">Markdown renderer not loaded</p>';
    }
    return marked.parse(text, { gfm: true, breaks: true });
}

// Debounce helper for the live preview (timer exposed for cancellation).
function debounce(fn, waitMs) {
    let timer = null;
    const wrapper = function () {
        clearTimeout(timer);
        timer = setTimeout(fn, waitMs);
        wrapper.timer = timer;
    };
    return wrapper;
}

// --- Form data: single sources ----------------------------------------------

// Build and return a NEW payload object from the form. Never mutates shared
// state. duration_days/end_date are picked by the active radio mode. A
// language is included in content only when it has a title or body.
function collectFormData() {
    const isDurationMode = document.getElementById('modeDuration').checked;

    const data = {
        start_date: document.getElementById('start_date').value || null,
        duration_days: null,
        end_date: null,
        status: document.getElementById('status').value,
        is_pinned: document.getElementById('is_pinned').checked,
        content: {}
    };

    if (isDurationMode) {
        data.duration_days = document.getElementById('duration_days').value || null;
    } else {
        data.end_date = document.getElementById('end_date').value || null;
    }

    LANGUAGES.forEach(function (lang) {
        const title = document.getElementById('title_' + lang.code).value;
        const body = document.getElementById('body_' + lang.code).value;
        if (title || body) {
            data.content[lang.code] = { title: title, body: body };
        }
    });

    return data;
}

// The SINGLE data -> form function (used for API items and JSON editor data).
function applyNewsToForm(news) {
    news = news || {};

    document.getElementById('start_date').value = news.start_date || '';
    document.getElementById('duration_days').value = news.duration_days || '';
    document.getElementById('end_date').value = news.end_date || '';
    document.getElementById('is_pinned').checked = !!news.is_pinned;
    document.getElementById('status').value = news.status || 'show';

    // Radio mode: end date only when an end date exists without a duration
    if (news.end_date && !news.duration_days) {
        document.getElementById('modeEndDate').checked = true;
        toggleEndDateMode('enddate');
    } else {
        document.getElementById('modeDuration').checked = true;
        toggleEndDateMode('duration');
    }

    LANGUAGES.forEach(function (lang) {
        const content = (news.content && news.content[lang.code]) || {};
        document.getElementById('title_' + lang.code).value = content.title || '';
        document.getElementById('body_' + lang.code).value = content.body || '';
        updateCharCount(lang.code);
    });

    // In JSON mode the editor text must reflect the applied data
    if (isJsonMode) {
        syncJsonEditor();
    }
}

// Empty template for "New": start date today, duration mode.
function emptyNewsTemplate() {
    return {
        id: null,
        start_date: new Date().toISOString().split('T')[0],
        duration_days: null,
        end_date: null,
        status: 'show',
        is_pinned: false,
        content: {}
    };
}

// --- Unsaved-changes baseline -------------------------------------------------

function updateBaseline() {
    baselineJson = JSON.stringify(collectFormData());
}

function isDirty() {
    if (currentNewsId === null && !isNew) return false;
    return JSON.stringify(collectFormData()) !== baselineJson;
}

// Guard before an action that would replace the form. Returns true to
// proceed, false to abort. 'stay' aborts, 'save' saves then proceeds,
// 'discard' proceeds without saving.
async function guardUnsavedChanges() {
    if (!isDirty()) return true;
    const choice = await unsavedChangesDialog(
        'Unsaved changes in ' + currentNewsLabel()
    );
    if (choice === 'stay') return false;
    if (choice === 'save') {
        const saved = await saveNews();
        if (!saved) return false; // save failed (e.g. validation): stay
    }
    return true;
}

// Human-readable label of the news in the form (for dialogs).
function currentNewsLabel() {
    if (currentNewsId !== null) {
        const item = newsCache.find(function (n) { return n.id === currentNewsId; });
        const title = item ? firstTitle(item) : '';
        return '"#' + currentNewsId + (title ? ' ' + title : '') + '"';
    }
    return '"New news item"';
}

// First non-empty title across bootstrap languages.
function firstTitle(item) {
    if (!item || !item.content) return '';
    for (let i = 0; i < LANGUAGES.length; i++) {
        const content = item.content[LANGUAGES[i].code];
        if (content && content.title) return content.title;
    }
    return '';
}

// --- News list: single client render -----------------------------------------

// HTML of one list row. All server-derived strings are escaped; long titles
// are truncated by CSS, not by substring.
function newsItemHtml(item) {
    let titleHtml = '<em class="preview-muted">(No title)</em>';
    const title = firstTitle(item);
    if (title) {
        let flag = '';
        for (let i = 0; i < LANGUAGES.length; i++) {
            if (item.content && item.content[LANGUAGES[i].code] &&
                item.content[LANGUAGES[i].code].title) {
                flag = LANGUAGES[i].flag || '';
                break;
            }
        }
        titleHtml = escapeHtml(flag) + ' ' + escapeHtml(title);
    }

    const activeClass = item.id === currentNewsId ? ' active' : '';
    const inactiveClass = item.status === 'hide' ? ' inactive' : '';

    // ID color semantics: gray hidden, green active now, orange pending
    let idClass = 'id-pending';
    if (item.status === 'hide') {
        idClass = 'id-inactive';
    } else if (item.is_active) {
        idClass = 'id-active';
    }

    const endPart = item.end_date
        ? '<span class="preview-muted"> → ' + escapeHtml(String(item.end_date).substring(0, 10)) + '</span>'
        : '';

    return '<div class="news-list-item' + activeClass + inactiveClass + '" data-id="' + item.id + '">' +
        '<div class="news-list-item-id ' + idClass + '">#' + item.id + '</div>' +
        '<div class="news-list-item-title">' + titleHtml + '</div>' +
        '<div class="news-list-item-meta">' +
        (item.is_pinned ? '📌 ' : '') +
        escapeHtml(item.status) + endPart +
        '</div></div>';
}

// Re-render the whole list from newsCache (one listener on the container
// handles clicks via delegation).
function renderNewsList() {
    const container = document.getElementById('news-list');
    if (!container) return;

    if (!newsCache.length) {
        container.innerHTML =
            '<div class="news-list-empty">No news found.<br>Click "➕ New" to create one.</div>';
    } else {
        container.innerHTML = newsCache.map(newsItemHtml).join('');
    }

    // Counter and Load more visibility
    const counter = document.getElementById('list-counter');
    if (counter) {
        counter.textContent = 'Showing ' + newsCache.length + ' of ' + total;
    }
    const loadMore = document.getElementById('btn-load-more');
    if (loadMore) {
        loadMore.style.display = (offset < total) ? '' : 'none';
    }
}

// Load from the admin API. reset=true replaces the list with the first page
// (offset 0). reset=false refreshes the already-shown range (used after quick
// actions / save-less state changes: the list reflects the server without
// growing or collapsing pagination). Use loadMoreNews() to append a page.
async function loadNewsPage({ reset }) {
    if (reset) {
        offset = 0;
    }
    const limit = reset ? PAGE_SIZE : Math.max(PAGE_SIZE, newsCache.length);
    const params = new URLSearchParams({
        offset: '0',
        limit: String(limit)
    });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    try {
        const response = await fetch('/api/admin/all-news?' + params.toString());
        if (!response.ok) {
            showAlert('Failed to load news list: HTTP ' + response.status, 'danger');
            return;
        }
        const result = await response.json();
        const page = result.news || [];
        total = result.total || 0;
        offset = result.offset + page.length; // next page offset
        newsCache = page;
        renderNewsList();
    } catch (e) {
        showAlert('Failed to load news list: ' + e.message, 'danger');
    }
}

// Load more: append the next page to the already shown items.
async function loadMoreNews() {
    const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE)
    });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    try {
        const response = await fetch('/api/admin/all-news?' + params.toString());
        if (!response.ok) {
            showAlert('Failed to load news list: HTTP ' + response.status, 'danger');
            return;
        }
        const result = await response.json();
        const page = result.news || [];
        total = result.total || 0;
        offset = result.offset + page.length;
        newsCache = newsCache.concat(page);
        renderNewsList();
    } catch (e) {
        showAlert('Failed to load news list: ' + e.message, 'danger');
    }
}

// Click delegation on the list container (one listener for all rows).
function onNewsListClick(e) {
    const row = e.target.closest('.news-list-item');
    if (!row) return;
    selectNews(parseInt(row.dataset.id, 10));
}

// --- Selection / creation ------------------------------------------------------

// Open an existing news in the editor (with unsaved-changes guard).
async function selectNews(id) {
    if (id === currentNewsId && !isNew) return;
    if (!(await guardUnsavedChanges())) return;

    let news = newsCache.find(function (n) { return n.id === id; }) || null;
    if (!news) {
        try {
            const response = await fetch('/api/news/' + id);
            if (!response.ok) {
                showAlert('News #' + id + ' not found', 'danger');
                return;
            }
            news = await response.json();
        } catch (e) {
            showAlert('Failed to load news: ' + e.message, 'danger');
            return;
        }
    }

    currentNewsId = id;
    isNew = false;
    applyNewsToForm(news);
    updateBaseline();
    updateToolbarButtons();
    renderNewsList(); // update the .active row
    schedulePreviewNow();
    switchView('editor');
}

// Start a new news item (with unsaved-changes guard).
async function createNew() {
    if (!(await guardUnsavedChanges())) return;
    doCreateNew();
}

// Internal creation without the guard (used after delete).
function doCreateNew() {
    currentNewsId = null;
    isNew = true;
    applyNewsToForm(emptyNewsTemplate());
    updateBaseline();
    updateToolbarButtons();
    renderNewsList(); // clear the .active row
    schedulePreviewNow();
    switchView('editor');
}

// Enable/disable toolbar buttons per selection/new state.
function updateToolbarButtons() {
    const hasNews = currentNewsId !== null;
    const formReady = hasNews || isNew;

    document.getElementById('btn-save').disabled = !formReady;
    document.getElementById('btn-delete').disabled = !hasNews;
    document.getElementById('btn-toggle').disabled = !hasNews;
    document.getElementById('btn-pin').disabled = !hasNews;
    document.getElementById('btn-ai-prompt').disabled = !formReady;

    // Minimal dirty indicator on the Save button
    document.getElementById('btn-save').title = isDirty()
        ? 'Save (unsaved changes)'
        : 'Save';
}

// --- Save / delete -------------------------------------------------------------

// Save from the authoritative source of the current mode.
// Returns true on success.
async function saveNews() {
    let data;
    if (isJsonMode) {
        try {
            data = JSON.parse(document.getElementById('json-editor').value);
        } catch (e) {
            showAlert('Invalid JSON: ' + e.message, 'danger');
            return false;
        }
    } else {
        data = collectFormData();
    }

    // Validate: at least one language must have a title
    const hasTitle = LANGUAGES.some(function (lang) {
        const content = data.content && data.content[lang.code];
        return !!(content && content.title && content.title.trim());
    });
    if (!hasTitle) {
        showAlert('Please fill in at least one language title', 'danger');
        return false;
    }

    const creating = currentNewsId === null;
    const url = creating ? '/api/admin/news' : '/api/admin/news/' + currentNewsId;
    const method = creating ? 'POST' : 'PUT';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            let detail = 'HTTP ' + response.status;
            try {
                const error = await response.json();
                if (error.detail) detail = error.detail;
            } catch (ignored) { /* non-JSON error body */ }
            showAlert('Save failed: ' + detail, 'danger');
            return false;
        }
        const result = await response.json();
        showAlert(creating ? 'News created!' : 'News updated!', 'success');
        if (creating && result.id) {
            currentNewsId = result.id;
            isNew = false;
        }
        updateBaseline();
        await loadNewsPage({ reset: true }); // list reflects server state
        updateToolbarButtons();
        schedulePreviewNow();
        return true;
    } catch (e) {
        showAlert('Save failed: ' + e.message, 'danger');
        return false;
    }
}

// Delete with the unsaved-changes guard, then a confirmation dialog
// (project pattern: object name in the body).
async function deleteNews() {
    if (currentNewsId === null) return;
    if (!(await guardUnsavedChanges())) return;

    const label = currentNewsLabel();
    const confirmed = await confirmDialog({
        title: 'Delete news',
        name: label,
        warning: 'This will permanently remove the news item. This action cannot be undone.',
        confirmText: 'Delete'
    });
    if (!confirmed) return;

    try {
        const response = await fetch('/api/admin/news/' + currentNewsId, {
            method: 'DELETE'
        });
        if (!response.ok) {
            showAlert('Error deleting news: HTTP ' + response.status, 'danger');
            return;
        }
        showAlert('News deleted!', 'success');
        currentNewsId = null;
        isNew = false;
        await loadNewsPage({ reset: true });
        // Clear the form without the unsaved guard (nothing left to protect)
        doCreateNew();
    } catch (e) {
        showAlert('Error deleting news: ' + e.message, 'danger');
    }
}

// --- Quick actions (toggle / pin) with baseline merge ---------------------------

// After a quick action: reload the list, merge the toggled server fields into
// the form and rebuild the baseline. Text edits stay dirty; the toggled field
// becomes clean, so the next Save keeps the action's result.
async function afterQuickAction() {
    await loadNewsPage({ reset: false });
    const serverNews = newsCache.find(function (n) { return n.id === currentNewsId; });
    if (serverNews) {
        document.getElementById('status').value = serverNews.status;
        document.getElementById('is_pinned').checked = !!serverNews.is_pinned;
    }
    baselineJson = JSON.stringify(collectFormData());
    updateToolbarButtons();
    schedulePreviewNow();
}

async function toggleStatus() {
    if (currentNewsId === null) return;
    try {
        const response = await fetch('/api/admin/news/' + currentNewsId + '/toggle', {
            method: 'POST'
        });
        if (!response.ok) {
            showAlert('Toggle failed: HTTP ' + response.status, 'danger');
            return;
        }
        const result = await response.json();
        showAlert('Status: ' + result.status, 'success');
        await afterQuickAction();
    } catch (e) {
        showAlert('Toggle failed: ' + e.message, 'danger');
    }
}

async function togglePin() {
    if (currentNewsId === null) return;
    const newPinnedState = !document.getElementById('is_pinned').checked;
    try {
        const response = await fetch(
            '/api/admin/news/' + currentNewsId + '/pin?is_pinned=' + newPinnedState,
            { method: 'POST' }
        );
        if (!response.ok) {
            showAlert('Pin action failed: HTTP ' + response.status, 'danger');
            return;
        }
        const result = await response.json();
        await afterQuickAction();
        // Auto-unpin notice from the server, else the plain result
        showAlert(result.message || (newPinnedState ? 'News pinned!' : 'News unpinned!'),
            result.message ? 'warning' : 'success');
    } catch (e) {
        showAlert('Pin action failed: ' + e.message, 'danger');
    }
}

// --- Live preview -----------------------------------------------------------------

// Immediate preview update (used on mode/news/quick-action/language changes);
// typing goes through the debounced wrapper.
function updatePreviewNow() {
    const preview = document.getElementById('preview-content');
    if (!preview) return;

    let data;
    if (isJsonMode) {
        try {
            data = JSON.parse(document.getElementById('json-editor').value);
        } catch (e) {
            // Never show stale form data when the JSON is invalid
            preview.innerHTML =
                '<div class="preview-error">Invalid JSON: ' + escapeHtml(e.message) + '</div>';
            return;
        }
    } else {
        data = collectFormData();
    }

    let html = '';

    // Metadata block (always shown)
    html += '<div class="preview-meta">';
    html += '<div><strong>Start:</strong> ' + escapeHtml(data.start_date || 'Not set') + '</div>';
    if (data.duration_days) {
        html += '<div><strong>Duration:</strong> ' + escapeHtml(data.duration_days) + ' days</div>';
    }
    if (data.end_date) {
        html += '<div><strong>End:</strong> ' + escapeHtml(data.end_date) + '</div>';
    }
    html += '<div><strong>Status:</strong> ' +
        (data.status === 'show' ? '✅ Visible' : '❌ Hidden') + '</div>';
    if (data.is_pinned) {
        html += '<div><strong>📌 Pinned</strong></div>';
    }
    html += '</div>';

    const langs = previewLang === 'all'
        ? LANGUAGES
        : LANGUAGES.filter(function (l) { return l.code === previewLang; });

    let shownCards = 0;
    langs.forEach(function (lang) {
        const content = (data.content && data.content[lang.code]) || null;
        const hasContent = !!(content && (content.title || content.body));
        if (previewLang === 'all' && !hasContent) return; // only filled languages
        shownCards++;

        html += '<div class="preview-card">';
        html += '<h6 class="preview-card-title">' + escapeHtml(lang.flag || '') + ' ' +
            escapeHtml(lang.name) + '</h6>';
        if (hasContent) {
            if (content.title) {
                html += '<div class="field-block"><strong>Title:</strong>' +
                    '<div class="markdown-preview">' + renderMarkdown(content.title) + '</div></div>';
            }
            if (content.body) {
                html += '<div><strong>Body:</strong>' +
                    '<div class="markdown-preview">' + renderMarkdown(content.body) + '</div></div>';
            }
        } else {
            html += '<em class="preview-muted">No content for this language yet</em>';
        }
        html += '</div>';
    });

    if (previewLang === 'all' && shownCards === 0) {
        html += '<div class="news-list-empty">⚠️ No content yet. Fill in at least one language.</div>';
    }

    preview.innerHTML = html;
}

// Typing path: counters immediately, preview debounced.
const schedulePreview = debounce(updatePreviewNow, 300);
function schedulePreviewNow() {
    clearTimeout(schedulePreview.timer);
    updatePreviewNow();
}

// Update char counters of one language.
function updateCharCount(langCode) {
    const title = document.getElementById('title_' + langCode).value;
    const body = document.getElementById('body_' + langCode).value;
    document.getElementById('char_count_title_' + langCode).textContent = title.length;
    document.getElementById('char_count_body_' + langCode).textContent = body.length;
}

// Duration / end date radio mode.
function toggleEndDateMode(mode) {
    const durationField = document.getElementById('durationField');
    const endDateField = document.getElementById('endDateField');
    if (mode === 'duration') {
        durationField.style.display = 'block';
        endDateField.style.display = 'none';
    } else {
        durationField.style.display = 'none';
        endDateField.style.display = 'block';
    }
}

// --- JSON editor mode ---------------------------------------------------------

// Fill the JSON editor text from the current form data.
function syncJsonEditor() {
    document.getElementById('json-editor').value =
        JSON.stringify(collectFormData(), null, 2);
    autoResizeJsonEditor();
}

// Apply the JSON editor content to the form. Returns false on invalid JSON
// (caller keeps JSON mode in that case).
function applyJsonToForm() {
    try {
        const data = JSON.parse(document.getElementById('json-editor').value);
        if (!data.content || typeof data.content !== 'object') {
            throw new Error('Invalid structure: missing or invalid "content" field');
        }
        applyNewsToForm(data);
        return true;
    } catch (e) {
        showAlert('Invalid JSON: ' + e.message, 'danger');
        return false;
    }
}

// Mode switch (shared by the toggle handler and the AI prompt auto-switch).
function setJsonMode(enabled) {
    const toggle = document.getElementById('editJsonToggle');
    isJsonMode = enabled;
    toggle.checked = enabled;

    if (enabled) {
        syncJsonEditor();
        document.getElementById('lang-editor-mode').style.display = 'none';
        document.getElementById('json-editor-mode').style.display = 'block';
        // Task 88 П7: re-measure AFTER the field is visible — while hidden its
        // scrollHeight is 0, so the pre-show measurement collapses it. One rAF
        // covers every enable path (toggle switch, AI prompt auto-switch).
        requestAnimationFrame(autoResizeJsonEditor);
    } else {
        if (!applyJsonToForm()) {
            // Invalid JSON: stay in JSON mode
            isJsonMode = true;
            toggle.checked = true;
            return;
        }
        document.getElementById('lang-editor-mode').style.display = 'block';
        document.getElementById('json-editor-mode').style.display = 'none';
    }
    schedulePreviewNow();
}

// Grow the JSON textarea to fit its content.
function autoResizeJsonEditor() {
    const editor = document.getElementById('json-editor');
    if (!editor) return;
    editor.style.height = 'auto';
    editor.style.height = editor.scrollHeight + 'px';
}

// --- AI prompt ------------------------------------------------------------------

// Ported truncation helper: shrink the news JSON under the configured limit
// by cutting body fields proportionally.
function truncateNewsForPrompt(news, maxLength) {
    const copy = JSON.parse(JSON.stringify(news));

    const jsonStr = JSON.stringify(copy);
    if (jsonStr.length <= maxLength) {
        return copy;
    }

    const langCodes = Object.keys(copy.content || {});
    const maxBodyLength = Math.floor(maxLength / langCodes.length / 2);

    for (const langCode of langCodes) {
        if (copy.content[langCode] && copy.content[langCode].body) {
            copy.content[langCode].body =
                copy.content[langCode].body.substring(0, maxBodyLength);
            const newJsonStr = JSON.stringify(copy);
            if (newJsonStr.length <= maxLength) {
                break;
            }
        }
    }

    return copy;
}

async function generateAIPrompt() {
    const template = BOOTSTRAP.aiPromptTemplate;
    const maxLength = BOOTSTRAP.aiPromptMaxLength;

    if (!template || template.trim() === '') {
        showAlert('AI prompt template is not configured in config.yml. Please add news.ai_prompt_template parameter.', 'danger');
        return;
    }

    let news;
    if (isJsonMode) {
        try {
            news = JSON.parse(document.getElementById('json-editor').value);
        } catch (e) {
            showAlert('Invalid JSON: ' + e.message, 'danger');
            return;
        }
    } else {
        news = collectFormData();
    }

    const langCodes = LANGUAGES.map(function (l) { return l.code; }).join(', ');
    const truncatedNews = truncateNewsForPrompt(news, maxLength);
    const newsJson = JSON.stringify(truncatedNews, null, 2);

    const prompt = template
        .replace('{supported_langs}', langCodes)
        .replace('{news_json}', newsJson)
        .replace('{max_title_length}', BOOTSTRAP.maxTitleLength)
        .replace('{max_body_length}', BOOTSTRAP.maxBodyLength);

    const copied = await copyTextToClipboard(prompt);
    if (copied) {
        showAlert('Prompt copied to clipboard', 'success');
    } else {
        showAlert('Could not copy the prompt to clipboard', 'danger');
    }

    // Existing behavior: switch to JSON mode after generating the prompt
    if (!isJsonMode) {
        setJsonMode(true);
    }
}

// Legacy clipboard write for non-secure origins / denied permission: a hidden
// textarea + execCommand inside the same user gesture (the historical path).
function legacyCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        ok = false;
    }
    document.body.removeChild(ta);
    return ok;
}

// Copy via the async Clipboard API; any failure (unavailable, non-secure
// origin, denied) falls back to the legacy path. Resolves true on success.
function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(
            function () { return true; },
            function () { return legacyCopyText(text); }
        );
    }
    return Promise.resolve(legacyCopyText(text));
}

// --- Column resizers (desktop, Pointer Events) ------------------------------------

// Unified mouse/touch resizing. Pointer capture gives one code path for both;
// touch-action: none (CSS) makes a drag resize instead of scroll.
function initResizers() {
    document.querySelectorAll('.admin-content .resizer').forEach(function (resizer) {
        const prevColumn = resizer.previousElementSibling;
        const nextColumn = resizer.nextElementSibling;
        let startX = 0;
        let startPrevWidth = 0;
        let startNextWidth = 0;

        // Per-column limits (mirror the CSS min/max-width of the columns).
        function columnLimits(column) {
            if (column && column.classList.contains('col-news-list')) {
                return { min: 280, max: 700 };
            }
            return { min: 300, max: Infinity };
        }

        resizer.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            resizer.setPointerCapture(e.pointerId);
            startX = e.clientX;
            startPrevWidth = prevColumn.offsetWidth;
            startNextWidth = nextColumn ? nextColumn.offsetWidth : 0;
            resizer.classList.add('active');
            resizer.parentElement.classList.add('resizing');
        });

        resizer.addEventListener('pointermove', function (e) {
            if (!resizer.classList.contains('active')) return;
            const delta = e.clientX - startX;
            // ONE shared clamp for the pair (task 88 П5): the boundary stops at the first
            // limit either of ITS two columns hits — the freed space must not leak into
            // the flexible third column.
            const prevLim = columnLimits(prevColumn);
            const nextLim = columnLimits(nextColumn);
            const maxDelta = Math.min(
                prevLim.max - startPrevWidth,
                nextColumn ? startNextWidth - nextLim.min : Infinity
            );
            const minDelta = Math.max(
                prevLim.min - startPrevWidth,
                nextColumn ? startNextWidth - nextLim.max : -Infinity
            );
            const d = Math.min(maxDelta, Math.max(minDelta, delta));
            if (prevColumn) {
                prevColumn.style.flexBasis = (startPrevWidth + d) + 'px';
                prevColumn.style.flexGrow = '0';
            }
            if (nextColumn) {
                nextColumn.style.flexBasis = (startNextWidth - d) + 'px';
                nextColumn.style.flexGrow = '0';
            }
        });

        function endDrag(e) {
            if (!resizer.classList.contains('active')) return;
            try { resizer.releasePointerCapture(e.pointerId); } catch (ignored) { /* already released */ }
            resizer.classList.remove('active');
            resizer.parentElement.classList.remove('resizing');
        }

        resizer.addEventListener('pointerup', endDrag);
        resizer.addEventListener('pointercancel', endDrag);

        // Double-click resets widths to the CSS defaults
        resizer.addEventListener('dblclick', function () {
            [prevColumn, nextColumn].forEach(function (column) {
                if (!column) return;
                column.style.flexBasis = '';
                column.style.flexGrow = '';
            });
        });
    });
}

// --- Mobile views -----------------------------------------------------------------

// Show exactly one section on mobile ('list' | 'editor' | 'preview').
// On desktop CSS ignores .view-active and shows all three columns.
function switchView(name) {
    const map = {
        list: 'col-news-list',
        editor: 'col-editor',
        preview: 'col-preview'
    };
    Object.keys(map).forEach(function (key) {
        const column = document.querySelector('.' + map[key]);
        if (column) {
            column.classList.toggle('view-active', key === name);
        }
        const btn = document.querySelector('.mobile-tabs .tab-btn[data-view="' + key + '"]');
        if (btn) {
            btn.setAttribute('aria-selected', key === name ? 'true' : 'false');
        }
    });
}

// --- Init --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {
    // Toolbar buttons
    document.getElementById('btn-create').addEventListener('click', createNew);
    document.getElementById('btn-save').addEventListener('click', saveNews);
    document.getElementById('btn-delete').addEventListener('click', deleteNews);
    document.getElementById('btn-toggle').addEventListener('click', toggleStatus);
    document.getElementById('btn-pin').addEventListener('click', togglePin);
    document.getElementById('btn-ai-prompt').addEventListener('click', generateAIPrompt);

    // JSON mode toggle
    document.getElementById('editJsonToggle').addEventListener('change', function () {
        setJsonMode(this.checked);
    });

    // Never actually submit (Enter in inputs would reload the page)
    document.getElementById('editor-form').addEventListener('submit', function (e) {
        e.preventDefault();
    });

    // JSON editor: live preview + auto-resize
    const jsonEditor = document.getElementById('json-editor');
    jsonEditor.addEventListener('input', function () {
        autoResizeJsonEditor();
        schedulePreview();
    });

    // Duration / end date radios
    document.getElementById('modeDuration').addEventListener('change', function () {
        if (this.checked) toggleEndDateMode('duration');
    });
    document.getElementById('modeEndDate').addEventListener('change', function () {
        if (this.checked) toggleEndDateMode('enddate');
    });

    // Live form updates: one delegated listener for input and change.
    // Counters update immediately, preview debounced.
    const form = document.getElementById('editor-form');
    ['input', 'change'].forEach(function (eventName) {
        form.addEventListener(eventName, function (e) {
            const id = e.target.id || '';
            if (id.startsWith('title_') || id.startsWith('body_')) {
                updateCharCount(id.replace(/^(title|body)_/, ''));
            }
            schedulePreview();
        });
    });

    // List: search (debounced), status filter, load more, row clicks
    const searchInput = document.getElementById('news-search');
    const debouncedSearch = debounce(function () {
        search = searchInput.value;
        loadNewsPage({ reset: true });
    }, 400);
    searchInput.addEventListener('input', debouncedSearch);

    document.getElementById('news-status-filter').addEventListener('change', function () {
        statusFilter = this.value;
        loadNewsPage({ reset: true });
    });

    document.getElementById('btn-load-more').addEventListener('click', loadMoreNews);

    document.getElementById('news-list').addEventListener('click', onNewsListClick);

    // Preview language selector
    document.getElementById('preview-lang').addEventListener('change', function () {
        previewLang = this.value;
        updatePreviewNow();
    });

    // Mobile tabs
    document.querySelectorAll('.mobile-tabs .tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            switchView(this.dataset.view);
        });
    });

    // Resizers, initial state, initial data
    initResizers();
    updateToolbarButtons();
    switchView('list');

    loadNewsPage({ reset: true }).then(function () {
        // Deep-link ?news_id=N: open even when not on the first page
        const selectedId = BOOTSTRAP.selectedId;
        if (selectedId !== null && selectedId !== undefined) {
            const inPage = newsCache.some(function (n) { return n.id === selectedId; });
            if (inPage) {
                selectNews(selectedId);
            } else {
                fetch('/api/news/' + selectedId)
                    .then(function (response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    })
                    .then(function (news) {
                        currentNewsId = selectedId;
                        isNew = false;
                        applyNewsToForm(news);
                        updateBaseline();
                        updateToolbarButtons();
                        renderNewsList(); // highlight if the row is visible
                        schedulePreviewNow();
                        switchView('editor');
                    })
                    .catch(function (e) {
                        showAlert('Failed to load news #' + selectedId + ': ' + e.message, 'danger');
                    });
            }
        }
    });

    // Warn before leaving the page with unsaved edits
    window.addEventListener('beforeunload', function (e) {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
