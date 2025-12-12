import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { getCookie, setCookie } from '$lib/utils/cookies.js';
import type {
  DeviceSelection,
  LoadingState,
  VersionsResponse,
  FirmwareInfo,
  AvailableFirmwares,
  UIState,
  DownloadEvent,
  FirmwareRequest,
  UpdateMode,
  DeviceCategoryType,
  DeviceDisplayInfo
} from './types.ts';
import { mapCategoryToDeviceType } from './utils/deviceTypeUtils.js';
import { apiService } from './api.ts';

// Initial state values
const initialDeviceSelection: DeviceSelection = {
  category: null,
  devicePioTarget: null,
  version: null,
  source: ''
};

const initialLoadingState: LoadingState = {
  isLoadingAvailable: false,    // Loading available devices list
  isLoadingVersions: false,   // Loading versions for selected device
  isLoadingInfo: false,        // Loading device/firmware info
  isDownloading: false,
  error: null
};

// Get interface mode from cookie or default to 'full'
const getInitialInterfaceMode = (): 'full' | 'minimal' => {
  if (browser) {
    const savedMode = getCookie('meshtastic-interface-mode');
    return savedMode === 'minimal' ? 'minimal' : 'full';
  }
  return 'full';
};

const initialUIState: UIState = {
  showAdvancedOptions: false,
  selectedDownloadMode: null,
  showSecurityWarning: true,
  interfaceMode: getInitialInterfaceMode()
};

// Device selection store - manages the current device/selection state
export const deviceSelection = writable<DeviceSelection>(initialDeviceSelection);

// Loading state store - manages all loading and error states
export const loadingState = writable<LoadingState>(initialLoadingState);

// UI state store - manages UI-specific state
export const uiState = writable<UIState>(initialUIState);

// Available repositories store - manages repository list
export const availableSources = writable<string[]>([]);

// Available firmwares store - manages device categories and names
export const availableFirmwares = writable<AvailableFirmwares>({
  espdevices: [],
  uf2devices: [],
  rp2040devices: [],
  versions: [],
  device_names: {},
  srcs: ['']
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
    const devices: Array<{device: string; category: DeviceCategoryType; displayName: string}> = [];

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
  ($deviceSelection) => $deviceSelection.devicePioTarget !== null
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
    if (!$deviceSelection.devicePioTarget || !$deviceNames[$deviceSelection.devicePioTarget]) {
      return 'Select Device';
    }
    return $deviceNames[$deviceSelection.devicePioTarget];
  }
);

// Device display info - shows device info regardless of version selection
export const deviceDisplayInfo = derived(
  [deviceSelection, firmwareInfo, deviceNames, availableFirmwares, versionsData],
  ([$deviceSelection, $firmwareInfo, $deviceNames, $availableFirmwares, $versionsData]) => {
    if (!$deviceSelection.devicePioTarget) {
      return null;
    }

    // Determine device type category
    const deviceTypeCategory = $deviceSelection.category || detectCategoryFromDeviceTypeAvailableData($deviceSelection.devicePioTarget, $availableFirmwares);

    // Determine unified device type using utility function
    const deviceType = mapCategoryToDeviceType(deviceTypeCategory || 'esp');

    return {
      devicePioTarget: $deviceSelection.devicePioTarget,
      deviceName: $deviceNames[$deviceSelection.devicePioTarget] || $deviceSelection.devicePioTarget,
      deviceType,  // Унифицированный тип устройства
      deviceTypeCategory: deviceTypeCategory || 'esp',  // Временно для API
      availableVersions: $versionsData.versions || [],
      deviceInfo: $firmwareInfo
    } as DeviceDisplayInfo;
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


// Helper function to detect category from device type using provided firmwares data
function detectCategoryFromDeviceTypeAvailableData(devicePioTarget: string, firmwares: AvailableFirmwares): DeviceCategoryType | null {
  // Check if device is in espdevices
  if (firmwares.espdevices.includes(devicePioTarget)) {
    return 'esp';
  }
  // Check if device is in uf2devices
  if (firmwares.uf2devices.includes(devicePioTarget)) {
    return 'uf2';
  }
  // Check if device is in rp2040devices
  if (firmwares.rp2040devices.includes(devicePioTarget)) {
    return 'rp2040';
  }

  return null;
}

// Actions for device selection
export const deviceActions = {
  // Set device category
  setCategory: (category: DeviceCategoryType | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      category,
      devicePioTarget: null,
      version: null
    }));
  },

  // Set device type (original method)
  setDeviceType: (devicePioTarget: string | null) => {
    deviceSelection.update(selection => ({
      ...selection,
      devicePioTarget,
      version: null
    }));
  },

  // Set device directly (new method for simplified interface)
  setDeviceDirectly: (devicePioTarget: string | null) => {
    deviceSelection.update(selection => {
      let category: DeviceCategoryType | null = null;
      if (devicePioTarget) {
        // Get current availableFirmwares data
        let currentFirmwares: AvailableFirmwares | null = null;
        const unsubscribe = availableFirmwares.subscribe(firmwares => {
          currentFirmwares = firmwares;
        });
        unsubscribe();

        if (currentFirmwares) {
          category = detectCategoryFromDeviceTypeAvailableData(devicePioTarget, currentFirmwares);
        }
      }

      return {
        ...selection,
        devicePioTarget,
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
      devicePioTarget: null,    // Reset device type when source changes
      category: null,      // Reset category when source changes
      version: null        // Reset version when source changes
    }));

    // Reload available firmwares for the new source
    apiActions.loadAvailableFirmwares(source || '');
  },

  // Update source only (used when backend returns the actual source where firmware was found)
  updateSourceOnly: (source: string) => {
    console.log('updateSourceOnly called with:', source);
    deviceSelection.update(selection => ({
      ...selection,
      source
    }));

    // Reload available firmwares for the new source
    console.log('Calling loadAvailableFirmwares with:', source);
    apiActions.loadAvailableFirmwares(source);
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
  },

  // Set interface mode
  setInterfaceMode: (mode: 'full' | 'minimal') => {
    uiState.update(state => ({
      ...state,
      interfaceMode: mode
    }));
    // Save to cookie for persistence
    if (browser) {
      setCookie('meshtastic-interface-mode', mode, 365);
    }
  }
};

// Async actions for API operations
export const apiActions = {
  // Load available repositories
  async loadSrcs() {
    try {
      const sources = await apiService.getSrcs();
      availableSources.set(sources);

      if (sources.length > 0) {
        // Set first source as default and load devices
        deviceActions.setSource(sources[0]);
      }
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load repositories');
    }
  },

  // Load available versions for device type
  async loadVersions(devicePioTarget: string) {
    if (!devicePioTarget) return;

    loadingActions.setLoadingVersions(true);
    try {
      let source: string = '';
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || '';
      });
      const versions = await apiService.getVersions(devicePioTarget, source);
      unsubscribe();

      // Если бэкенд вернул поле src, обновляем выбор репозитория без сброса устройства
      if (versions.src) {
        deviceActions.updateSourceOnly(versions.src);
      }

      versionsData.set(versions);
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load versions');
    } finally {
      loadingActions.setLoadingVersions(false);
    }
  },

  // Load device information (without version)
  async loadDeviceInfo(devicePioTarget: string) {
    if (!devicePioTarget) return;

    loadingActions.setLoadingInfo(true);
    try {
      let source: string = '';
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || source;
      });
      unsubscribe();

      // Use 'latest' as version to fetch device info instead of requesting versions
      const latestVersion = 'latest';

      // Load device info using latest version
      const infoBlock = await apiService.getInfoBlock(devicePioTarget, latestVersion, source);

      // Update firmwareInfo with device info (version-agnostic)
      firmwareInfo.set({
        devicePioTarget,
        version: '', // No specific version selected
        buildDate: '',
        notes: '',
        htmlInfo: infoBlock.info
      });
    } catch (error) {
      loadingActions.setError(error instanceof Error ? error.message : 'Failed to load device info');
    } finally {
      loadingActions.setLoadingInfo(false);
    }
  },

  // Load firmware information
  async loadFirmwareInfo(devicePioTarget: string, version: string) {
    if (!devicePioTarget || !version) return;

    loadingActions.setLoadingInfo(true);
    try {
      let source: string = 'https://github.com/meshtastic/firmware';
      const unsubscribe = deviceSelection.subscribe(s => {
        source = s.source || source;
      });
      unsubscribe();

      // Get versions data from the store instead of making another API call
      let versionsDataResponse: VersionsResponse = { versions: [], dates: {}, notes: {}, latestTags: {} };
      const unsubscribeVersions = versionsData.subscribe(v => {
        versionsDataResponse = v;
      });
      unsubscribeVersions();

      const infoBlock = await apiService.getInfoBlock(devicePioTarget, version, source);

      firmwareInfo.set({
        devicePioTarget,
        version,
        buildDate: versionsDataResponse.dates[version] || 'Unknown',
        notes: versionsDataResponse.notes[version] || '',
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
    devicePioTarget: string,
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
        t: devicePioTarget,
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
          devicePioTarget,
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
          devicePioTarget,
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

// Store subscription for reactive behavior - single subscription to avoid duplicate requests
let previousDevicePioTarget: string | null = null;
let previousVersion: string | null = null;

deviceSelection.subscribe((selection) => {
  const { devicePioTarget, version } = selection;

  // Load versions and device info only when device type changes
  if (devicePioTarget && devicePioTarget !== previousDevicePioTarget) {
    apiActions.loadVersions(devicePioTarget);
    apiActions.loadDeviceInfo(devicePioTarget);
  }

  // Load firmware info only when version is selected (and device is already set)
  if (devicePioTarget && version && version !== previousVersion) {
    apiActions.loadFirmwareInfo(devicePioTarget, version);
  }

  previousDevicePioTarget = devicePioTarget;
  previousVersion = version;
});

// Initialize on app start
if (browser) {
  // Check if URL has device parameter first
  const url = new URL(window.location.href);
  const deviceFromUrl = url.searchParams.get('t');

  if (deviceFromUrl) {
    // Load versions for specific device from URL to discover src
    await initializeFromDeviceParam(deviceFromUrl);
  } else {
    // No device in URL - load repositories and select first one
    apiActions.loadSrcs();
  }

  import('$lib/utils/urlSync.js').then(({ initializeUrlSync }) => {
    initializeUrlSync(deviceFromUrl);
  });
}

// Initialize app when device parameter is provided in URL
async function initializeFromDeviceParam(devicePioTarget: string) {
  try {
    // First, call versions API without source to discover the repository
    const versions = await apiService.getVersions(devicePioTarget, '');

    // If backend returned src, device was found
    if (versions.src) {
      // Load available firmwares for the discovered source
      await apiActions.loadAvailableFirmwares(versions.src);

      // Update the source in device selection
      deviceActions.updateSourceOnly(versions.src);

      // Update versions data with the response we already have
      versionsData.set(versions);

      // Set device selection after data is loaded
      deviceActions.setDeviceDirectly(devicePioTarget);
    } else {
      // No src returned - device not found, load default repositories
      apiActions.loadSrcs();
    }

  } catch (error) {
    console.error('Failed to initialize from device parameter:', error);
    // Fallback to loading repositories
    apiActions.loadSrcs();
  }
}