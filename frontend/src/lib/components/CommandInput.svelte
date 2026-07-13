<script lang="ts">
    import { terminalMode, toggleTerminalMode } from '$lib/stores.js';
    import type { AutocompleteSuggestion } from '$lib/types.js';
    import {
        getAutocompleteSuggestion,
        acceptSuggestionToNextSeparator,
        getNextSuggestion,
        getPreviousSuggestion,
        getLineCommandDescription
    } from '$lib/utils/meshcoreCommands.js';
    import { getCaretCoordinates, type CaretCoordinates } from '$lib/utils/textareaCaret.js';
    import { TERMINAL_CONFIG } from '$lib/config/terminalConfig.js';
    import { _ as locales } from 'svelte-i18n';

    let {
        value = $bindable(),
        isConnected = false,
        isMassRunning = false, // textarea disabled during mass run (no editing)
        onSubmit = (_cmd: string) => {}, // single-line Enter -> sendCommand
        onsendall = () => {}, // multiline Enter / Ctrl+Cmd+Enter -> runMassSend
        placeholder = '',
        commandHistory = [],
        historyIndex = $bindable(),
        showCommandShortDescriptions = true,
        currentLine = $bindable(''), // text of the line at the caret (for per-line Send)
        onsendline = (_line: string) => {} // send a specific line without clearing the field
    } = $props();

    // Terminal mode is a Svelte store; reactively derived for use in event handlers.
    let mode = $derived($terminalMode);
    let suggestion = $state<AutocompleteSuggestion | null>(null);
    let textareaElement: HTMLTextAreaElement;
    let caretCoords = $state<CaretCoordinates>({ top: 0, left: 0, height: 0 });
    // Cached textarea line metrics for cheap repositioning on scroll.
    let lineMetrics = $state({ lineHeight: 20, paddingTop: 8, borderTop: 1 });
    let caretPos = $state(0);

    // Per-line command descriptions rendered for every line at its end
    // (not only the caret line), so each recognized command shows its description.
    type LineDescription = {
        top: number;
        left: number;
        desc: string | undefined;
        isCaret: boolean;
    };
    let lineDescriptions = $state<LineDescription[]>([]);

    // Recompute per-line descriptions on content/mode/flag changes — including
    // programmatic value changes (e.g. loading a command set), which do not
    // fire textarea input events. Caret/scroll-driven refreshes (isCaret, tops)
    // are handled by updateOverlay()/handleScroll().
    $effect(() => {
        value;
        mode;
        showCommandShortDescriptions;
        // Defer to the next frame so the textarea has reflowed for the new
        // content (field-sizing: content); otherwise positions are measured
        // against a stale layout and only snap into place on first interaction.
        const raf = requestAnimationFrame(() => recomputeLineDescriptions());
        return () => cancelAnimationFrame(raf);
    });

    /** Whether the field contains more than one line. */
    function isMultiline(): boolean {
        return value.includes('\n');
    }

    /** Line currently being edited (where the caret is). Autocomplete INPUT only,
     *  NOT a send unit (model M2 sends either the whole single line or all lines). */
    function getCurrentLine(): string {
        const before = value.slice(0, textareaElement?.selectionStart ?? value.length);
        const lineIndex = before.split('\n').length - 1;
        return value.split('\n')[lineIndex] ?? '';
    }

    /** Start/end indices (in `value`) of the line currently being edited. */
    function getCurrentLineBounds(): { lineStart: number; lineEnd: number } {
        const pos = textareaElement?.selectionStart ?? value.length;
        const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
        let lineEnd = value.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = value.length;
        return { lineStart, lineEnd };
    }

    /** Character offset of the start of line `lineIdx` (given the split lines). */
    function lineStartOffset(lineIdx: number, lines: string[]): number {
        let off = 0;
        for (let i = 0; i < lineIdx; i++) off += lines[i].length + 1; // +1 for '\n'
        return off;
    }

    /** Move the caret to the previous/next line keeping the column (Shift+ArrowUp/Down). */
    function moveCaretLine(direction: 'up' | 'down'): void {
        if (!textareaElement) return;
        const pos = textareaElement.selectionStart;
        const lines = value.split('\n');
        const beforeLines = value.slice(0, pos).split('\n');
        const lineIndex = beforeLines.length - 1;
        const col = beforeLines[beforeLines.length - 1].length;
        let targetPos: number;
        if (direction === 'up') {
            if (lineIndex === 0) {
                targetPos = 0;
            } else {
                const targetLine = lineIndex - 1;
                const targetCol = Math.min(col, lines[targetLine].length);
                targetPos = lineStartOffset(targetLine, lines) + targetCol;
            }
        } else {
            if (lineIndex === lines.length - 1) {
                targetPos = value.length;
            } else {
                const targetLine = lineIndex + 1;
                const targetCol = Math.min(col, lines[targetLine].length);
                targetPos = lineStartOffset(targetLine, lines) + targetCol;
            }
        }
        textareaElement.setSelectionRange(targetPos, targetPos);
        textareaElement.focus();
        updateOverlay(); // refresh suggestion for the new line + reposition the ▶ button
    }

    /** Recompute per-line command descriptions (every line at its end). Self-contained:
     *  reads DOM metrics + caret line index, writes lineDescriptions. Called on
     *  content/mode/flag changes ($effect) and on user interaction (updateOverlay). */
    function recomputeLineDescriptions(): void {
        if (!textareaElement) {
            lineDescriptions = [];
            return;
        }
        const cs = getComputedStyle(textareaElement);
        const lineHeight = parseFloat(cs.lineHeight) || 20;
        const paddingTop = parseFloat(cs.paddingTop) || 0;
        const borderTop = parseFloat(cs.borderTopWidth) || 0;
        const caretLineIndex = (
            value.slice(0, textareaElement.selectionStart ?? value.length).match(/\n/g) || []
        ).length;
        const allLines = value.split('\n');
        const next: LineDescription[] = [];
        let lineOffset = 0;
        for (let i = 0; i < allLines.length; i++) {
            const lineText = allLines[i];
            const lineEndOffset = lineOffset + lineText.length;
            const lineTop = paddingTop + borderTop + i * lineHeight - textareaElement.scrollTop;
            const lineLeft = getCaretCoordinates(textareaElement, lineEndOffset).left;
            const desc = showCommandShortDescriptions
                ? getLineCommandDescription(lineText, mode)
                : undefined;
            next.push({ top: lineTop, left: lineLeft, desc, isCaret: i === caretLineIndex });
            lineOffset = lineEndOffset + 1; // +1 for '\n'
        }
        lineDescriptions = next;
    }

    /** Recompute caret line position + autocomplete suggestion (based on the current line). */
    function updateOverlay(): void {
        caretPos = textareaElement?.selectionStart ?? value.length;
        const line = getCurrentLine();
        currentLine = line; // expose to parent for per-line Send
        if (textareaElement) {
            // Y (vertical): the current line's top (scroll-aware) — used by the ghost AND the ▶ button.
            const cs = getComputedStyle(textareaElement);
            const lineHeight = parseFloat(cs.lineHeight) || 20;
            const paddingTop = parseFloat(cs.paddingTop) || 0;
            const borderTop = parseFloat(cs.borderTopWidth) || 0;
            lineMetrics = { lineHeight, paddingTop, borderTop };
            const lineIndex = (value.slice(0, caretPos).match(/\n/g) || []).length;
            const top = paddingTop + borderTop + lineIndex * lineHeight - textareaElement.scrollTop;
            // X (horizontal): the ghost is a COMPLETION of the current line, so it sits at the
            // END of the line's text (not at the caret) — matches the original <input> behavior
            // and keeps the suggestion still while the caret moves within the line.
            const lineStart = value.lastIndexOf('\n', caretPos - 1) + 1;
            const lineEnd = lineStart + line.length;
            const mirror = getCaretCoordinates(textareaElement, lineEnd);
            caretCoords = { top, left: mirror.left, height: lineHeight };
        }

        recomputeLineDescriptions();
        // No ghost on an empty line: it would overlap the placeholder ("Введите команду...").
        if (!line) {
            suggestion = null;
            return;
        }
        let newSuggestion = getAutocompleteSuggestion(
            line,
            mode,
            null,
            suggestion,
            showCommandShortDescriptions
        );
        if (newSuggestion && line.endsWith(' ') && newSuggestion.text.startsWith(' ')) {
            newSuggestion = { ...newSuggestion, text: newSuggestion.text.substring(1) };
        }
        suggestion = newSuggestion;
    }

    /** Cheap repositioning on scroll: only the Y offset depends on scrollTop (no mirror-div). */
    function handleScroll(): void {
        if (!textareaElement) return;
        const lineIndex = (value.slice(0, caretPos).match(/\n/g) || []).length;
        const top =
            lineMetrics.paddingTop +
            lineMetrics.borderTop +
            lineIndex * lineMetrics.lineHeight -
            textareaElement.scrollTop;
        caretCoords = { ...caretCoords, top };
        // Reposition per-line description overlays vertically (only top depends on scrollTop).
        lineDescriptions = lineDescriptions.map((d, i) => ({
            ...d,
            top:
                lineMetrics.paddingTop +
                lineMetrics.borderTop +
                i * lineMetrics.lineHeight -
                textareaElement.scrollTop
        }));
    }

    function handleInput() {
        updateOverlay();
        // Reset history position on manual input (single-line history behavior)
        if (!isMultiline()) historyIndex = commandHistory.length;
    }

    function handleKeyUp(event: KeyboardEvent) {
        // Refresh caret coords on caret-moving keys not handled in keydown
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
            updateOverlay();
        }
    }

    function handleClick() {
        updateOverlay();
    }

    function handleSelect() {
        updateOverlay();
    }

    /**
     * Handle keydown events. Model M2:
     * - Ctrl/Cmd+Enter -> mass send (works for single-line too -> paced send)
     * - Shift+Enter -> native newline (do NOT preventDefault)
     * - Enter (no modifiers): single-line -> sendCommand (onSubmit); multiline -> mass send (onsendall)
     * - Tab/ArrowRight -> accept suggestion up to next separator (within current line)
     * - ArrowUp/Down -> autocomplete cycling (priority) OR history (single-line) OR native caret (multiline)
     * - Escape -> clear suggestion
     */
    function handleKeydown(event: KeyboardEvent) {
        // Ctrl/Cmd+Enter - mass send (works for single-line too -> paced send)
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (isConnected && !isMassRunning && value.trim()) {
                onsendall();
            }
            return;
        }

        // Shift+Enter - native newline: do NOT preventDefault (textarea inserts \n)
        if (event.key === 'Enter' && event.shiftKey) {
            return; // native behavior
        }

        // Enter (no modifiers) - model M2 (D1)
        if (event.key === 'Enter') {
            event.preventDefault(); // suppress native newline insertion

            // Single-line /mc mode switch works even without a connection (PRD #40).
            if (!isMultiline() && value.trim() === '/mc') {
                toggleTerminalMode();
                value = '';
                suggestion = null;
                return;
            }

            // Everything below actually sends to the device -> needs a connection.
            if (!isConnected || isMassRunning) return;

            if (isMultiline()) {
                // Multiline -> mass send of all lines (runMassSend).
                if (!value.trim()) return;
                onsendall();
                return;
            }

            // Single line -> send command
            if (!value.trim()) return;
            onSubmit(value); // sendCommand trims, sends, clears the field
            value = '';
            suggestion = null;
            return;
        }

        // Tab - accept suggestion OR /mc mode switch (single-line)
        if (event.key === 'Tab') {
            event.preventDefault();
            if (mode === 'normal' && !isMultiline() && value.trim() === '/mc') {
                toggleTerminalMode();
                value = '';
                suggestion = null;
                return;
            }
            // fall through to ArrowRight-style accept below
        }

        // ArrowRight/Tab - accept suggestion up to next separator (caret at end of current line)
        if ((event.key === 'ArrowRight' || event.key === 'Tab') && suggestion) {
            const { lineStart, lineEnd } = getCurrentLineBounds();
            const currentLine = value.slice(lineStart, lineEnd);
            const caretInLine = (textareaElement.selectionStart ?? 0) - lineStart;
            const isAtEndOfLine = caretInLine === currentLine.length;
            // Tab always accepts; ArrowRight only at end of current line.
            if (event.key === 'Tab' || isAtEndOfLine) {
                const accepted = acceptSuggestionToNextSeparator(currentLine, suggestion);
                value = value.slice(0, lineStart) + accepted + value.slice(lineEnd);
                queueMicrotask(() => {
                    const pos = lineStart + accepted.length;
                    textareaElement.setSelectionRange(pos, pos);
                    updateOverlay();
                });
                return;
            }
        }

        // ArrowUp - Shift+ArrowUp moves between lines; plain ArrowUp cycles suggestions / history
        if (event.key === 'ArrowUp') {
            if (event.shiftKey) {
                event.preventDefault();
                moveCaretLine('up');
                return;
            }
            if (suggestion) {
                event.preventDefault();
                const next = getNextSuggestion(getCurrentLine(), suggestion, showCommandShortDescriptions);
                if (next) suggestion = next;
                return;
            }
            if (!isMultiline()) {
                event.preventDefault();
                if (commandHistory.length === 0) return;
                if (historyIndex > 0) {
                    historyIndex--;
                    value = commandHistory[historyIndex];
                    suggestion = null;
                    queueMicrotask(updateOverlay);
                }
                return;
            }
            // multiline: do not preventDefault -> native caret movement
        }

        // ArrowDown - Shift+ArrowDown moves between lines; plain ArrowDown cycles suggestions / history
        if (event.key === 'ArrowDown') {
            if (event.shiftKey) {
                event.preventDefault();
                moveCaretLine('down');
                return;
            }
            if (suggestion) {
                event.preventDefault();
                const prev = getPreviousSuggestion(getCurrentLine(), suggestion, showCommandShortDescriptions);
                if (prev) suggestion = prev;
                return;
            }
            if (!isMultiline()) {
                event.preventDefault();
                if (commandHistory.length === 0) return;
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    value = '';
                }
                suggestion = null;
                queueMicrotask(updateOverlay);
                return;
            }
        }

        // Escape - clear suggestion
        if (event.key === 'Escape') {
            suggestion = null;
            return;
        }
    }
</script>

<div class="command-input-container flex flex-1 items-start">
    <div class="input-wrapper relative flex-1">
        <textarea
            bind:this={textareaElement}
            bind:value
            oninput={handleInput}
            onkeydown={handleKeydown}
            onkeyup={handleKeyUp}
            onclick={handleClick}
            onscroll={handleScroll}
            onselect={handleSelect}
            title={$locales('customfirmware.terminal_multiline_newline_tooltip')}
            {placeholder}
            rows="1"
            disabled={isMassRunning}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            class="command-input relative w-full resize-none rounded-md border border-gray-600 bg-gray-700 py-2 pr-8 pl-3 text-sm text-white placeholder-gray-400 focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none"
            style="font-family: Consolas, 'Courier New', monospace; field-sizing: content; max-height: {TERMINAL_CONFIG.maxVisibleLines * TERMINAL_CONFIG.approxLineHeightRem}rem; overflow-y: auto;"
        ></textarea>

        <!-- Autocomplete ghost + per-line command descriptions (every line at its end). -->
        {#each lineDescriptions as d, i (i)}
            {#if d.desc || (d.isCaret && suggestion?.text)}
                <div
                    class="autocomplete-overlay pointer-events-none absolute overflow-visible"
                    style="top: {d.top}px; left: {d.left}px; line-height: {caretCoords.height}px; font-family: Consolas, 'Courier New', monospace; font-size: 0.875rem;"
                >
                    {#if d.isCaret && suggestion?.text}
                        <span class="whitespace-pre text-gray-400">{suggestion.text}</span>
                    {/if}
                    {#if d.desc}
                        <span class="ml-2 overflow-hidden text-ellipsis whitespace-nowrap text-gray-500 italic"
                            >- {d.desc}</span
                        >
                    {/if}
                </div>
            {/if}
        {/each}

        <!-- Floating per-line Send button: one button at the right edge of the caret's line.
             Follows the line being edited; click sends that line only (manual per-command, OQ-7). -->
        {#if currentLine.trim()}
            <button
                type="button"
                class="send-line-btn absolute right-2 flex items-center justify-center text-gray-500 transition-colors hover:text-green-400 disabled:cursor-not-allowed disabled:opacity-40"
                style="top: {caretCoords.top}px; height: {caretCoords.height}px; line-height: {caretCoords.height}px;"
                title={$locales('customfirmware.terminal_send_tooltip')}
                disabled={!isConnected || isMassRunning}
                onclick={() => onsendline(currentLine)}
            >▶</button>
        {/if}
    </div>
</div>
