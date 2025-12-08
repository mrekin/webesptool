import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { deviceSelection } from '$lib/stores.js';

// URL parameter synchronization
let oldDevice: string | null = null;

export function initializeUrlSync(initialDevice?: string | null) {
  if (!browser) return;

  // Initialize oldDevice from URL parameters on page load
  const url = new URL(window.location.href);
  const devicePioInitialTarget = initialDevice !== undefined ? initialDevice : url.searchParams.get('t');

  if (devicePioInitialTarget) {
    oldDevice = devicePioInitialTarget;
  }

  // Subscribe to deviceSelection changes and update URL
  deviceSelection.subscribe((selection) => {
    // Skip if oldDevice hasn't been initialized yet (avoid initial URL update)
    if (oldDevice === null) return;

    let url = new URL(window.location.href);

    if (oldDevice !== selection.devicePioTarget) {

      // Remove version parameter if no version selected
      if (!selection.devicePioTarget) {
        url.searchParams.delete('t');
      } else {
        oldDevice = selection.devicePioTarget;
        url.searchParams.set('t', selection.devicePioTarget);
      }

      // Update URL without triggering page reload
      setTimeout(() => {
        if (browser) {
          replaceState(url, '');
        }
      }, 0);
    }
  });
}