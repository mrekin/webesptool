// Moderator notifications for pending zone uploads (task 77). Server-only;
// configuration is env-only and never exposed to the client or API responses.
//
// Two independent channels — a generic JSON POST webhook and a Telegram bot
// message. Both configured => both fire; neither => the notification is
// "skipped: not configured" (logged metric) and nothing breaks. Fire-and-
// forget: one attempt per channel with a timeout; the result is logged
// (sent/failed) and never affects the upload response (PRD scenario 10).

const WEBHOOK_URL = process.env.ZONES_WEBHOOK_URL || '';
const TELEGRAM_BOT_TOKEN = process.env.ZONES_WEBHOOK_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.ZONES_WEBHOOK_TELEGRAM_CHAT_ID || '';
const TIMEOUT_MS = Number(process.env.ZONES_WEBHOOK_TIMEOUT_MS ?? 5000);

function fail(reason: unknown): void {
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    console.warn('[zones-webhook] failed:', msg);
}

// Fire-and-forget notification about an accepted upload. `pendingCount` /
// `pendingBytes` describe the queue AFTER the file was written.
export function notifyPendingUpload(
    filename: string,
    sizeBytes: number,
    pendingCount: number,
    pendingBytes: number
): void {
    const telegram = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID;
    if (!WEBHOOK_URL && !telegram) {
        console.info('[zones-webhook] skipped: not configured');
        return;
    }
    if (WEBHOOK_URL) {
        void (async () => {
            try {
                // `text` is a ready-to-forward human-readable line (e.g. for a
                // Node-RED -> Telegram relay); the structured fields stay for
                // richer consumers.
                const text = `New zone pushed. Total pending zones: ${pendingCount}`;
                const res = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        event: 'zones.pending.upload',
                        text,
                        filename,
                        sizeBytes,
                        pendingCount,
                        pendingBytes,
                        at: new Date().toISOString()
                    }),
                    signal: AbortSignal.timeout(TIMEOUT_MS)
                });
                if (!res.ok) {
                    fail(`status ${res.status}`);
                    return;
                }
                console.info('[zones-webhook] sent');
            } catch (err) {
                fail(err);
            }
        })();
    }
    if (telegram) {
        void (async () => {
            try {
                const kb = Math.max(1, Math.round(sizeBytes / 1024));
                const mb = (pendingBytes / 1_048_576).toFixed(1);
                const text = `Зоны: ${filename} (${kb} КБ) ожидает проверки; всего в очереди ${pendingCount} файлов / ${mb} МБ`;
                const res = await fetch(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
                        signal: AbortSignal.timeout(TIMEOUT_MS)
                    }
                );
                if (!res.ok) {
                    fail(`telegram status ${res.status}`);
                    return;
                }
                console.info('[zones-webhook] sent');
            } catch (err) {
                fail(err);
            }
        })();
    }
}

// Fire-and-forget notification about a rate-limit transition: an IP has just
// exhausted its window (token attempts — per-IP or global, or uploads). The
// caller fires this only on the moment the window fills, so one message per
// episode — not one per subsequent 429.
export function notifyRateLimited(
    kind: 'token_attempts' | 'token_attempts_global' | 'upload',
    ip: string
): void {
    const telegram = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID;
    if (!WEBHOOK_URL && !telegram) {
        console.info('[zones-webhook] skipped: not configured');
        return;
    }
    if (WEBHOOK_URL) {
        void (async () => {
            try {
                const text = `Rate limit exceeded (${kind}) for ${ip}`;
                const res = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        event: 'zones.rate_limited',
                        text,
                        kind,
                        ip,
                        at: new Date().toISOString()
                    }),
                    signal: AbortSignal.timeout(TIMEOUT_MS)
                });
                if (!res.ok) {
                    fail(`status ${res.status}`);
                    return;
                }
                console.info('[zones-webhook] sent');
            } catch (err) {
                fail(err);
            }
        })();
    }
    if (telegram) {
        void (async () => {
            try {
                const label =
                    kind === 'token_attempts'
                        ? 'лимит попыток ввода токена'
                        : kind === 'token_attempts_global'
                          ? 'общий лимит попыток токена'
                          : 'лимит загрузок';
                const text = `Зоны: превышен ${label} — ${ip}`;
                const res = await fetch(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
                        signal: AbortSignal.timeout(TIMEOUT_MS)
                    }
                );
                if (!res.ok) {
                    fail(`telegram status ${res.status}`);
                    return;
                }
                console.info('[zones-webhook] sent');
            } catch (err) {
                fail(err);
            }
        })();
    }
}
