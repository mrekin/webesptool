/*
 * Shared admin page helpers (task 86): toasts and modal dialogs.
 * Plain browser JS, global functions, used by all admin pages.
 * Modal markup lives in admin/base.html; this file only fills fields,
 * shows/hides overlays and resolves Promises.
 */

// Currently open dialog: { overlay, resolve, keyHandler }. Null when closed.
let activeDialog = null;

// Show a toast message. type: 'success' | 'danger' | 'warning' | 'info'.
// Auto-dismisses after ~5s; click dismisses immediately.
function showAlert(message, type = 'info') {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    toast.appendChild(closeBtn);

    function dismiss() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }

    toast.addEventListener('click', dismiss);
    container.appendChild(toast);

    setTimeout(dismiss, 5000);
}

// --- Modal plumbing -------------------------------------------------------

// Show an overlay element and remember the dialog context.
function openDialog(overlayId, context) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.classList.add('open');
    activeDialog = context;
    if (context.focusId) {
        const target = document.getElementById(context.focusId);
        if (target) target.focus();
    }
}

// Hide the current overlay and clear the dialog context.
function closeDialog() {
    if (!activeDialog) return;
    activeDialog.overlay.classList.remove('open');
    activeDialog = null;
}

// One global key handler: routes Escape/Enter to the open dialog only.
document.addEventListener('keydown', function (e) {
    if (!activeDialog) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        activeDialog.onEscape();
    } else if (e.key === 'Enter' && activeDialog.onEnter) {
        // Enter is ignored while focus is in a textarea (multi-line prompt text)
        if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
        e.preventDefault();
        activeDialog.onEnter();
    }
});

// --- Confirmation dialog (project pattern: BackupConfirmModal) ------------

// Confirm dialog with the object name in the body and a warning block.
// Resolves true on confirm, false on cancel (Cancel is default-focused,
// Escape/Enter act as cancel).
function confirmDialog({ title, name, warning, confirmText }) {
    return new Promise(function (resolve) {
        const overlay = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title || 'Confirm';
        document.getElementById('confirm-name').textContent = name || '';
        document.getElementById('confirm-warning').textContent = warning || '';
        document.getElementById('confirm-warning').style.display = warning ? 'block' : 'none';
        document.getElementById('confirm-ok').textContent = confirmText || 'Confirm';

        function cancel() {
            document.getElementById('confirm-cancel').onclick = null;
            document.getElementById('confirm-ok').onclick = null;
            closeDialog();
            resolve(false);
        }

        function confirm() {
            document.getElementById('confirm-cancel').onclick = null;
            document.getElementById('confirm-ok').onclick = null;
            closeDialog();
            resolve(true);
        }

        openDialog('confirm-modal', {
            overlay: overlay,
            focusId: 'confirm-cancel',
            onEscape: cancel,
            onEnter: cancel
        });
        document.getElementById('confirm-cancel').onclick = cancel;
        document.getElementById('confirm-ok').onclick = confirm;
    });
}

// --- Unsaved changes dialog ------------------------------------------------

// Three-way dialog for dirty forms. Resolves 'stay' | 'discard' | 'save'.
// 'Continue editing' is the safe default (focused; Escape = stay).
function unsavedChangesDialog(label) {
    return new Promise(function (resolve) {
        const overlay = document.getElementById('unsaved-modal');
        document.getElementById('unsaved-label').textContent =
            label || 'Unsaved changes';

        function finish(result) {
            ['unsaved-stay', 'unsaved-save', 'unsaved-discard'].forEach(function (id) {
                document.getElementById(id).onclick = null;
            });
            closeDialog();
            resolve(result);
        }

        openDialog('unsaved-modal', {
            overlay: overlay,
            focusId: 'unsaved-stay',
            onEscape: function () { finish('stay'); },
            onEnter: function () { finish('stay'); }
        });
        document.getElementById('unsaved-stay').onclick = function () { finish('stay'); };
        document.getElementById('unsaved-save').onclick = function () { finish('save'); };
        document.getElementById('unsaved-discard').onclick = function () { finish('discard'); };
    });
}

// --- AI prompt fallback modal ----------------------------------------------

// Guaranteed path to get the AI prompt when clipboard write is unavailable
// or denied: readonly textarea + Select all. Resolves when closed.
function promptFallbackModal({ title, text }) {
    return new Promise(function (resolve) {
        const overlay = document.getElementById('prompt-modal');
        document.getElementById('prompt-modal-title').textContent = title || 'AI prompt';
        const textarea = document.getElementById('prompt-modal-text');
        textarea.value = text || '';

        function finish() {
            document.getElementById('prompt-modal-select').onclick = null;
            document.getElementById('prompt-modal-close').onclick = null;
            closeDialog();
            resolve();
        }

        openDialog('prompt-modal', {
            overlay: overlay,
            focusId: 'prompt-modal-text',
            onEscape: finish,
            // No Enter action: the textarea legitimately needs newlines
            onEnter: null
        });
        document.getElementById('prompt-modal-select').onclick = function () {
            textarea.focus();
            textarea.select();
        };
        document.getElementById('prompt-modal-close').onclick = finish;
    });
}
