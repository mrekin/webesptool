import { writable, derived, readable } from 'svelte/store';
import { browser } from '$app/environment';
import type {
  DeviceSelection,
  LoadingState,
  VersionsResponse,
  FirmwareInfo,
  AvailableFirmwares,
  UIState,
  DownloadEvent,
  FirmwareRequest,
  UpdateMode
} from './types.ts';
import { apiService } from './api.ts';

// Initial state values
const initialDeviceSelection: DeviceSelection = {
  category: null,
  deviceType: null,
  version: null,
  source: 'https://github.com/meshtastic/firmware'
};

const initialLoadingState: LoadingState = {
  isLoadingAvailable: false,    // Loading available devices list
  isLoadingVersions: false,   // Loading versions for selected device
  isLoadingInfo: false,        // Loading device/firmware info
  isDownloading: false,
  error: null
};

const initialUIState: UIState = {
  showAdvancedOptions: false,
  selectedDownloadMode: null,
  showSecurityWarning: true
};

// Device selection store - manages the current device/selection state
export const deviceSelection = writable<DeviceSelection>(initialDeviceSelection);

// Loading state store - manages all loading and error states
export const loadingState = writable<LoadingState>(initialLoadingState);

// UI state store - manages UI-specific state
export const uiState = writable<UIState>(initialUIState);

// Available firmwares store - manages device categories and names
export const availableFirmwares = writable<AvailableFirmwares>({
  espdevices: [],
  uf2devices: [],
  rp2040devices: [],
  versions: [],
  device_names: {},
  srcs: ['https://github.com/meshtastic/firmware']
});

// Versions data store - manages available versions for selected device
export const versionsData = writable<VersionsResponse>({
  versions: [],
  dates: {},
  latestTags: {},
  notes: {}
});

// Firmware info store - manages firmware information for selected device/version
export const firmwareInfo = writable<FirmwareInfo | null>(null);

// Download history store - keeps track of download attempts (for analytics)
export const downloadHistory = writable<DownloadEvent[]>([]);

// Device names store - derived from available firmwares for easy access
export const deviceNames = derived(
  availableFirmwares,
  ($availableFirmwares) => $availableFirmwares.device_names
);

// Current device category devices - derived for UI components
export const currentCategoryDevices = derived(
  [deviceSelection, availableFirmwares],
  ([$deviceSelection, $availableFirmwares]) => {
    if (!$deviceSelection.category) return [];

    switch ($deviceSelection.category) {
      case 'esp':
        return $availableFirmwares.espdevices;
      case 'uf2':
        return $availableFirmwares.uf2devices;
      case 'rp2040':
        return $availableFirmwares.rp2040devices;
      default:
        return [];
    }
  }
);

// All devices organized by category - for single dropdown with optgroups
export const allDevicesWithCategories = derived(
  availableFirmwares,
  ($availableFirmwares) => ({
    esp: $availableFirmwares.espdevices,
    uf2: $availableFirmwares.uf2devices,
    rp2040: $availableFirmwares.rp2040devices,
    device_names: $availableFirmwares.device_names
  })
);

// All devices as flat list with category info - for filtering
export const allDevicesFlat = derived(
  availableFirmwares,
  ($availableFirmwares) => {
    const devices: Array<{device: string; category: 'esp' | 'uf2' | 'rp2040'; displayName: string}> = [];

    $availableFirmwares.espdevices.forEach((device: string) => {
      devices.push({
        device,
        category: 'esp',
        displayName: $availableFirmwares.device_names[device] || device
      });
    });

    $availableFirmwares.uf2devices.forEach((device: string) => {
      devices.push({
        device,
        category: 'uf2',
        displayName: $availableFirmwares.device_names[device] || device
      });
    });

    $availableFirmwares.rp2040devices.forEach((device: string) => {
      devices.push({
        device,
        category: 'rp2040',
        displayName: $availableFirmwares.device_names[device] || device
      });
    });

    return devices.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
);

// Is device selected - derived boolean for UI state
export const isDeviceSelected = derived(
  deviceSelection,
  ($deviceSelection) => $deviceSelection.deviceType !== null
);

// Is version selected - derived boolean for UI state
export const isVersionSelected = derived(
  deviceSelection,
  ($deviceSelection) => $deviceSelection.version !== null
);

// Current device name - derived for display
export const currentDeviceName = derived(
  [deviceSelection, deviceNames],
  ([$deviceSelection, $deviceNames]) => {
    if (!$deviceSelection.deviceType || !$deviceNames[$deviceSelection.deviceType]) {
      return 'Select Device';
    }
    return $deviceNames[$deviceSelection.deviceType];
  }
);

// Device display info - shows device info regardless of version selection
export const deviceDisplayInfo = derived(
  [deviceSelection, firmwareInfo, deviceNames],
  ([$deviceSelection, $firmwareInfo, $deviceNames]) => {
    if (!$deviceSelection.deviceType) {
      return null;
    }

    return {
      deviceType: $deviceSelection.deviceType,
      deviceName: $deviceNames[$deviceSelection.deviceType] || $deviceSelection.deviceType,
      deviceInfo: $firmwareInfo
    };
  }
);

// Firmware display info - derived complex object for UI
export const firmwareDisplayInfo = derived(
  [versionsData, deviceSelection, firmwareInfo],
  ([$versionsData, $deviceSelection, $firmwareInfo]) => {
    if (!$deviceSelection.version || !$versionsData.versions.includes($deviceSelection.version)) {
      return null;
    }

    return {
      version: $deviceSelection.version,
      buildDate: $versionsData.dates[$deviceSelection.version] || 'Unknown',
      notes: $versionsData.notes[$deviceSelection.version] || '',
      latestTag: $versionsData.latestTags[$deviceSelection.version] || null,
      deviceInfo: $firmwareInfo
    };
  }
);

// URL parameter synchronization
export const urlSync = readable(
  null,
  (set) => {
    if (!browser) return;

    // Initialize from URL parameters on page load
    const urlParams = new URLSearchParams(window.location.search);
    const deviceType = urlParams.get('t');

    if (deviceType) {
      deviceSelection.update(selection => ({
        ...selection,
        deviceType,
        category: null // Will be set when availableFirmwares loads
      }));
    }

    // Subscribe to availableFirmwares changes to update category
    const unsubscribeFirmwares = availableFirmwares.subscribe((firmwares) => {
      if (firmwares && deviceType) {
        const category = detectCategoryFromDeviceTypeAvailableData(deviceType, firmwares);

        deviceSelection.update(selection => {
          if (selection.deviceType && !selection.category) {
            // Only set category if it's not already set
            return {
              ...selection,
              category
            };
          }
          return selection;
        });
      }
    });

    // Subscribe to deviceSelection changes and update URL
    const unsubscribeDeviceSelection = deviceSelection.subscribe((selection) => {
      if (selection.deviceType) {
        const url = new URL(window.location);
        url.searchParams.set('t', selection.deviceType);

        // Remove version parameter if no version selected
        if (!selection.version) {
          url.searchParams.delete('v');
        } else {
          url.searchParams.set('v', selection.version);
        }

        // Update URL without triggering page reload
        window.history.replaceState({}, '', url.toString());
      }
    });

    return () => {
      unsubscribeFirmwares();
      unsubscribeDeviceSelection();
    };
  }
);

// Helper function to detect category from device type using provided firmwares data
function detectCategoryFromDeviceTypeAvailableData(deviceType: string, firmwares: AvailableFirmwares): 'esp' | 'uf2' | 'rp2040' | null {
  // Check if device is in espdevices
  if (firmwares.espdevices.includes(deviceType)) {
    return 'esp';
  }
  // Check if device is in uf2devices
  if (firmwares.uf2devices.includes(deviceType)) {
    return 'uf2';
  }
  // Check if device is in rp2040devices
  if (firmwares.rp2040devices.includes(deviceType)) {
    return 'rp2040';
  }

  return null;
}

// Actions for device selection
export const deviceActions = {
  // Set device category
  setCategory: (category: 'esp' | 'uf2' | 'rp2040' | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      category,
      deviceType: null,
      version: null
    }));
  },

  // Set device type (original method)
  setDeviceType: (deviceType: string | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      deviceType,
      version: null
    }));
  },

  // Set device directly (new method for simplified interface)
  setDeviceDirectly: (deviceType: string | null) => {
    deviceSelection.update(selection => {
      let category: 'esp' | 'uf2' | 'rp2040' | null = null;
      if (deviceType) {
        // Get current availableFirmwares data
        let currentFirmwares: AvailableFirmwares | null = null;
        const unsubscribe = availableFirmwares.subscribe(firmwares => {
          currentFirmwares = firmwares;
        });
        unsubscribe();

        if (currentFirmwares) {
          category = detectCategoryFromDeviceTypeAvailableData(deviceType, currentFirmwares);
        }
      }

      return {
        ...selection,
        deviceType,
        category,
        version: null
      };
    });
  },

  // Set version
  setVersion: (version: string | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      version
    }));
  },

  // Set source
  setSource: (source: string | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      source,
      version: null // Reset version when source changes
    }));

    // Reload available firmwares for the new source
    let unsubscribe = deviceSelection.subscribe(currentSelection => {
      if (currentSelection.source) {
        apiActions.loadAvailableFirmwares(currentSelection.source);
      }
    });
    unsubscribe();

    // Reload versions if device type is selected
    unsubscribe = deviceSelection.subscribe(currentSelection => {
      if (currentSelection.deviceType) {
        apiActions.loadVersions(currentSelection.deviceType);
      }
    });
    unsubscribe();
  },

  // Reset all selections
  resetSelection: () => {
    deviceSelection.set(initialDeviceSelection);
  }
};

// Actions for loading state
export const loadingActions = {
  // Set loading state for available devices
  setLoadingAvailable: (loading: boolean) => {
    loadingState.update(state => ({
      ...state,
      isLoadingAvailable: loading,
      error: loading ? null : state.error
    }));
  },

  // Set loading state for versions
  setLoadingVersions: (loading: boolean) => {
    loadingState.update(state => ({
      ...state,
      isLoadingVersions: loading,
      error: loading ? null : state.error
    }));
  },

  // Set loading state for info
  setLoadingInfo: (loading: boolean) => {
    loadingState.update(state => ({
      ...state,
      isLoadingInfo: loading,
      error: loading ? null : state.error
    }));
  },

  // Set downloading state
  setDownloading: (downloading: boolean) => {
    loadingState.update(state => ({
      ...state,
      isDownloading: downloading,
      error: downloading ? null : state.error
    }));
  },

  // Set error message
  setError: (error: string | null) => {
    loadingState.update(state => ({
      ...state,
      error
    }));
  },

  // Clear all loading states
  clearLoading: () => {
    loadingState.set(initialLoadingState);
  }
};

// Actions for UI state
export const uiActions = {
  // Toggle advanced options
  toggleAdvancedOptions: () => {
    uiState.update(state => ({
      ...state,
      showAdvancedOptions: !state.showAdvancedOptions
    }));
  },

  // Set download mode
  setDownloadMode: (mode: string | null) => {
    uiState.update(state => ({
      ...state,
      selectedDownloadMode: mode
    }));
  },

  // Dismiss security warning
  dismissSecurityWarning: () => {
    uiState.update(state => ({
      ...state,
      showSecurityWarning: false
    }));
  }
};

// Async actions for API operations
export const apiActions = {
  // Load available versions for device type
  async loadVersions(deviceType: string) {
    if (!deviceType) return;

    loadingActions.setLoadingVersions(true);
    try {
      let source: string;
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || '';
      });
      const versions = await apiService.getVersions(deviceType, source);
      unsubscribe();
      versionsData.set(versions);
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load versions');
    } finally {
      loadingActions.setLoadingVersions(false);
    }
  },

  // Load device information (without version)
  async loadDeviceInfo(deviceType: string) {
    if (!deviceType) return;

    loadingActions.setLoadingInfo(true);
    try {
      let source: string = '';
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || source;
      });
      unsubscribe();

      // Get the latest version to fetch device info
      const versions = await apiService.getVersions(deviceType, source);
      const latestVersion = versions.versions[0] || 'latest';

      // Load device info using latest version
      const infoBlock = await apiService.getInfoBlock(deviceType, latestVersion, source);

      // Update firmwareInfo with device info (version-agnostic)
      firmwareInfo.set({
        deviceType,
        version: '', // No specific version selected
        buildDate: '',
        notes: '',
        pioTarget: '',
        htmlInfo: infoBlock.info
      });
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load device info');
    } finally {
      loadingActions.setLoadingInfo(false);
    }
  },

  // Load firmware information
  async loadFirmwareInfo(deviceType: string, version: string) {
    if (!deviceType || !version) return;

    loadingActions.setLoadingInfo(true);
    try {
      let source: string = 'https://github.com/meshtastic/firmware';
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || source;
      });
      unsubscribe();

      const [infoBlock, versions] = await Promise.all([
        apiService.getInfoBlock(deviceType, version, source),
        apiService.getVersions(deviceType, source)
      ]);

      firmwareInfo.set({
        deviceType,
        version,
        buildDate: versions.dates[version] || 'Unknown',
        notes: versions.notes[version] || '',
        pioTarget: '', // Would need to be extracted from info
        htmlInfo: infoBlock.info
      });
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load firmware info');
    } finally {
      loadingActions.setLoadingInfo(false);
    }
  },

  // Download firmware
  async downloadFirmware(
    deviceType: string,
    version: string,
    mode: UpdateMode,
    part?: string
  ) {
    loadingActions.setDownloading(true);
    const timestamp = new Date();

    try {
      let source: string = '';
      let category = 'esp'
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || source;
        category = s.category || category;
      });
      unsubscribe();
      const request: FirmwareRequest = {
        t: deviceType,
        v: version,
        u: mode,
        ...(part && { p: part as 'fw' | 'littlefs' | 'bleota' | 'bleota-s3' }),
        src: source,
        e: category == 'esp' ? true : false
      };

      const response = await apiService.downloadFirmware(request);
      apiService.triggerDownload(response.blob, response.filename);

      // Record successful download
      downloadHistory.update(history => [
        ...history,
        {
          deviceType,
          version,
          mode,
          timestamp,
          success: true
        }
      ]);
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Download failed');

      // Record failed download
      downloadHistory.update(history => [
        ...history,
        {
          deviceType,
          version,
          mode,
          timestamp,
          success: false
        }
      ]);
    } finally {
      loadingActions.setDownloading(false);
    }
  },

  // Load initial available firmwares
  async loadAvailableFirmwares(source: string = '') {
    loadingActions.setLoadingAvailable(true);
    try {
      const firmwares = await apiService.getAvailableFirmwares(source = source);
      availableFirmwares.set(firmwares);
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load available firmwares');
    } finally {
      loadingActions.setLoadingAvailable(false);
    }
  }
};

// Store subscription for reactive behavior
deviceSelection.subscribe((selection) => {
  if (selection.deviceType) {
    apiActions.loadVersions(selection.deviceType);
    apiActions.loadDeviceInfo(selection.deviceType);
  }
});

deviceSelection.subscribe((selection) => {
  if (selection.deviceType && selection.version) {
    apiActions.loadFirmwareInfo(selection.deviceType, selection.version);
  }
});

// Initialize on app start
if (browser) {
  apiActions.loadAvailableFirmwares();
}