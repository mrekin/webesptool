// Caret coordinates for a <textarea> via the mirror-div technique.
// Pure utility: no Svelte/Serial dependencies. Used to position the
// autocomplete ghost-text overlay at the caret in multiline content.

export interface CaretCoordinates {
    top: number;
    left: number;
    height: number;
}

// Computed styles that affect text layout (copied onto the mirror div).
const LAYOUT_PROPERTIES = [
    'boxSizing', 'width', 'height',
    'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textIndent', 'textTransform', 'wordSpacing',
    'wordBreak', 'tabSize'
    // Note: 'whiteSpace'/'wordWrap' are intentionally NOT copied — the mirror
    // always wraps like a textarea (pre-wrap + overflow-wrap), set once below.
] as const;

const toKebab = (prop: string): string => prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

// Reused mirror div with persistent [before-text, marker, tail] nodes, kept in the
// DOM (hidden) so the hot path (getCaretCoordinates runs on every keystroke via
// updateOverlay) only updates text content instead of creating/appending/removing
// DOM nodes each call.
let mirror: HTMLDivElement | null = null;
let beforeText: Text | null = null;
let markerSpan: HTMLSpanElement | null = null;
let tailSpan: HTMLSpanElement | null = null;
// Signature of the last copied style batch; styles are re-synced only when it changes
// (e.g. on resize / font change), not on every keystroke.
let styleSignature = '';

function ensureMirror(textarea: HTMLTextAreaElement): HTMLDivElement {
    const computed = window.getComputedStyle(textarea);
    const signature = LAYOUT_PROPERTIES.map((p) => computed.getPropertyValue(toKebab(p))).join('|');

    if (!mirror) {
        mirror = document.createElement('div');
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.overflowWrap = 'break-word';

        beforeText = document.createTextNode('');
        markerSpan = document.createElement('span');
        markerSpan.textContent = '​'; // zero-width space so an empty caret is measurable
        tailSpan = document.createElement('span');

        mirror.appendChild(beforeText);
        mirror.appendChild(markerSpan);
        mirror.appendChild(tailSpan);
        document.body.appendChild(mirror);
    }

    if (signature !== styleSignature) {
        for (const prop of LAYOUT_PROPERTIES) {
            mirror.style.setProperty(toKebab(prop), computed.getPropertyValue(toKebab(prop)));
        }
        styleSignature = signature;
    }
    return mirror;
}

/**
 * Compute pixel coordinates of the caret in a <textarea> using the mirror-div
 * technique: clone the textarea's computed styles into a hidden div, reproduce
 * the text up to `caretPosition`, place a marker span and measure it.
 *
 * Returns coordinates relative to the textarea's top-left (border box).
 * Handles soft wrapping, padding, border, box-sizing.
 *
 * Reference implementation: component/textarea-caret-position.
 */
export function getCaretCoordinates(
    textarea: HTMLTextAreaElement,
    caretPosition: number
): CaretCoordinates {
    const div = ensureMirror(textarea);

    // Reproduce text up to the caret (before the marker) and the rest (after).
    // The marker sits between them so wrapping matches the textarea exactly.
    const text = textarea.value;
    if (beforeText) beforeText.nodeValue = text.slice(0, caretPosition);
    if (tailSpan) tailSpan.textContent = text.slice(caretPosition);

    // Measure the marker relative to the mirror div. The mirror replicates the
    // textarea's box but is appended to <body> (landing at the page bottom), so
    // we must subtract the mirror div's own rect — NOT the textarea's — otherwise
    // the offset is off by the mirror's distance from the textarea.
    const divRect = div.getBoundingClientRect();
    const markerRect = markerSpan!.getBoundingClientRect();
    return {
        top: markerRect.top - divRect.top,
        left: markerRect.left - divRect.left,
        height: markerRect.height
    };
}
