// Shared xterm clipboard helpers.
// Used by both TerminalModal and MeshcoreConfigModal so terminal copy behavior
// stays identical and is defined in one place.

import type { Terminal } from '@xterm/xterm';

/**
 * Copy the terminal's current selection (if any) to the clipboard.
 * Intended for copy buttons; the Ctrl/Cmd+C shortcut is wired by
 * {@link attachTerminalCopy}.
 */
export function copyTerminalSelection(term: Terminal): void {
    const selection = term.getSelection();
    if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {
            /* clipboard unavailable (permissions/focus) — ignore */
        });
    }
}

/**
 * Install Ctrl/Cmd+C copy handling on an xterm instance.
 *
 * Matches the physical key (event.code === 'KeyC') rather than event.key, so it
 * works under any keyboard layout — e.g. a Cyrillic layout yields key 'с', not
 * 'c'. The selection is read synchronously in the keydown handler (before xterm
 * can clear it) and written to the clipboard immediately. Ctrl/Cmd+C is always
 * swallowed so it never reaches the device as an interrupt byte; every other
 * key passes through to xterm unchanged.
 */
export function attachTerminalCopy(term: Terminal): void {
    term.attachCustomKeyEventHandler((event) => {
        if (!((event.ctrlKey || event.metaKey) && event.code === 'KeyC')) {
            return true;
        }
        const selection = term.getSelection();
        if (selection) {
            event.preventDefault();
            navigator.clipboard.writeText(selection).catch(() => {
                /* clipboard unavailable — ignore */
            });
        }
        return false;
    });
}
