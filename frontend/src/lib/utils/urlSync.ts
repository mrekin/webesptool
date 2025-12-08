import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { deviceSelection } from '$lib/stores.js';

// URL parameter synchronization
let oldDevice = '';

export function initializeUrlSync() {
  if (!browser) return;

  // Initialize from URL parameters on page load
  const url = new URL(window.location.href);
  const devicePioInitialTarget = url.searchParams.get('t');

  if (devicePioInitialTarget) {
    deviceSelection.update(selection => ({
      ...selection,
      devicePioTarget: devicePioInitialTarget,
      category: null // Will be set when availableFirmwares loads
    }));
    oldDevice = devicePioInitialTarget;
  }

  // Subscribe to deviceSelection changes and update URL
  deviceSelection.subscribe((selection) => {
    let url = new URL(window.location.href);

    if (oldDevice != selection.devicePioTarget) {

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