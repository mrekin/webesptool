// TypeScript type definitions for WebESPTool Frontend

export interface DeviceCategory {
  espdevices: string[];
  uf2devices: string[];
  rp2040devices: string[];
}

export interface DeviceNames {
  [key: string]: string;
}

export interface VersionsResponse {
  versions: string[];
  dates: {
    [version: string]: string;
  };
  latestTags: {
    [version: string]: string;
  };
  notes: {
    [version: string]: string;
  };
}

export interface InfoBlockResponse {
  info: string;
}

export interface FirmwareRequest {
  t: string; // device type
  v: string; // version
  u: UpdateMode; // update mode: 1=update, 2=install/wipe, 4=OTA, 5=ZIP
  p?: 'fw' | 'littlefs' | 'bleota' | 'bleota-s3'; // part
  e?: boolean; // ESP32 flag
  src?: string; // source repository
}

export interface FirmwareDownloadResponse {
  blob: Blob;
  filename: string;
}

export interface ManifestBuild {
  chipFamily: ChipFamily;
  parts: ManifestPart[];
}

export interface ManifestPart {
  path: string;
  offset: number;
}

export interface ManifestResponse {
  name: string;
  version: string;
  new_install_improv_wait_time: number;
  new_install_prompt_erase: boolean;
  builds: ManifestBuild[];
  pathfw: string;
  pathota: string;
}

export interface AvailableFirmwares {
  espdevices: string[];
  uf2devices: string[];
  rp2040devices: string[];
  versions: string[];
  device_names: DeviceNames;
  srcs: string[];
}

export interface DeviceSelection {
  category: DeviceCategoryType | null;
  devicePioTarget: string | null;
  version: string | null;
  source: string | null;
}

export interface LoadingState {
  isLoadingAvailable: boolean;  // Loading available devices list
  isLoadingVersions: boolean;   // Loading versions for selected device
  isLoadingInfo: boolean;        // Loading device/firmware info
  isDownloading: boolean;
  error: string | null;
}

export interface FirmwareInfo {
  devicePioTarget: string;
  version: string;
  buildDate: string;
  notes: string;
  htmlInfo: string;
}

export interface DownloadOption {
  id: string;
  label: string;
  mode: UpdateMode;
  available: boolean;
  icon?: string;
  description?: string;
  url?: string;
}

export interface UIState {
  showAdvancedOptions: boolean;
  selectedDownloadMode: string | null;
  showSecurityWarning: boolean;
}

// API Error types
export interface APIError {
  error: string;
  status?: number;
  details?: any;
}

// Update modes for firmware downloads
export type UpdateMode = '1' | '2' | '4' | '5';

// Device type categories for UI organization
export type DeviceCategoryType = 'esp' | 'uf2' | 'rp2040';


// Chip families for manifest generation
export type ChipFamily = 'ESP32' | 'ESP32-S3' | 'ESP32-C3' | 'NRF52' | 'RP2040';

// Configuration interface
export interface AppConfig {
  apiBaseUrl: string;
  defaultSource: string;
  timeout: number;
  retryAttempts: number;
}

// Event types for analytics/logging
export interface DownloadEvent {
  devicePioTarget: string;
  version: string;
  mode: UpdateMode;
  timestamp: Date;
  success: boolean;
}

export interface SelectionChangeEvent {
  category: DeviceCategoryType | null;
  devicePioTarget: string | null;
  previousDevicePioTarget: string | null;
}

export interface DeviceDisplayInfo {
  devicePioTarget: string;  // Previously deviceType - the PIO target from firmware
  deviceName: string;       // Human-readable device name
  deviceTypeCategory: DeviceCategoryType;  // Device category type
  devicePlatformType: 'esp32' | 'nrf52' | 'rp2040';  // Platform type based on chip family
  availableVersions: string[];  // List of available firmware versions
  deviceInfo: FirmwareInfo | null;  // Device firmware information
}