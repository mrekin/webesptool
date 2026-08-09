// Svelte action: double-click an empty text/number/url/textarea field to fill
// it with its own placeholder (the on-screen hint). No-op when the field already
// has a value or has no placeholder. After writing the value it dispatches an
// `input` event so both `bind:value` and `oninput`/`onchange` handlers react.
//
// Used across the meshcore configurator, zone editor and zone-settings modal so
// every field that shows an example/token hint can be filled with one double-click.
import type { Action } from 'svelte/action';

export const fillHint: Action<HTMLInputElement | HTMLTextAreaElement> = (node) => {
    function onDblClick(): void {
        if (node.value !== '' || !node.placeholder) return;
        node.value = node.placeholder;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    }
    node.addEventListener('dblclick', onDblClick);
    return {
        destroy() {
            node.removeEventListener('dblclick', onDblClick);
        }
    };
};
