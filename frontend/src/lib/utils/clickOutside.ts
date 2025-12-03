import { onMount, onDestroy } from 'svelte';

/**
 * Creates a click outside handler for an element
 * @param element - The target element
 * @param callback - Function to call when clicking outside
 * @param selector - Optional selector to exclude elements (e.g., '.dropdown-list')
 */
export function createClickOutside(
  element: HTMLElement,
  callback: () => void,
  excludeSelector?: string
) {
  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Check if click is outside the element
    let isOutside = !element.contains(target);

    // If exclude selector provided, also check if clicked element matches it
    if (excludeSelector && target.closest(excludeSelector)) {
      isOutside = false;
    }

    if (isOutside) {
      callback();
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClick, true);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClick, true);
  });

  return {
    destroy: () => {
      document.removeEventListener('click', handleClick, true);
    }
  };
}

/**
 * Creates a click outside handler for multiple elements
 * @param elements - Array of elements to check
 * @param callback - Function to call when clicking outside all elements
 * @param excludeSelector - Optional selector to exclude elements
 */
export function createClickOutsideForMultiple(
  elements: HTMLElement[],
  callback: () => void,
  excludeSelector?: string
) {
  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Check if click is outside all elements
    let isOutsideAll = elements.every(element => !element.contains(target));

    // If exclude selector provided, also check if clicked element matches it
    if (excludeSelector && target.closest(excludeSelector)) {
      isOutsideAll = false;
    }

    if (isOutsideAll) {
      callback();
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClick, true);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClick, true);
  });

  return {
    destroy: () => {
      document.removeEventListener('click', handleClick, true);
    }
  };
}