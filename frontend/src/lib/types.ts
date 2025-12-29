// TypeScript type definitions for WebESPTool Frontend

// REMOVED: DeviceCategory replaced by AvailableDevices

// Repository Level
export interface Repository {
  name: string;
  url: string;
}

// Device Level
export interface Device {
  device: string;      // ← Corresponds to legacy code
  displayName: string;
  category: 'esp' | 'uf2' | 'rp2040';
}


// Version Level
export interface Version {
  version: string;
  buildDate: string;
  notes?: string;
  latestTag?: string;
}

// Selection State (Single source of truth)
export interface SelectionState {
  repository: string | null;
  device: string | null;      // pioTarget
  version: string | null;     // only from versions[] list
  isValid: boolean;           // true if all dependencies are met
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
  src?: string; // Repository where firmware was found
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

// Source repository information
export enum RepositoryType {
  MESHTASTIC = 'meshtastic',
  MESHCORE = 'meshcore'
}

export interface SourceInfo {
  src: string;
  desc: string;
  type: RepositoryType;
}

export interface AvailableFirmwares {
  espdevices: string[];
  uf2devices: string[];
  rp2040devices: string[];
  versions: string[];
  device_names: { [key: string]: string };
  srcs: SourceInfo[];
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
  openInNewTab?: boolean;
}

export interface UIState {
  showAdvancedOptions: boolean;
  selectedDownloadMode: string | null;
  showSecurityWarning: boolean;
  interfaceMode: InterfaceMode;
}

// Interface mode enum
export enum InterfaceMode {
  FULL = 'full',
  MINIMAL = 'minimal'
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

// Unified device type enum
export enum DeviceType {
  ESP32 = 'esp32',
  NRF52 = 'nrf52',
  RP2040 = 'rp2040'
}

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
  deviceType: DeviceType;   // Unified device type
  deviceTypeCategory: DeviceCategoryType;  // Device category type (temporary for API)
  availableVersions: string[];  // List of available firmware versions
  deviceInfo: FirmwareInfo | null;  // Device firmware information
}

// ESP Flasher types
export interface ESPDeviceInfo {
  chip: string;
  flashSize: string;
  mac: string;
  features: string;
  crystal: string;
  revision: string;
  flashId: string;
  baudrate: number;
}

export interface FlashProgress {
  progress: number;
  status: string;
  error: string;
}

export interface FirmwareFile {
  file: File;
  content: string;
  size: number;
  name: string;
}

export interface SelectedFirmwareFile {
  filename: string;
  address: string;
  file: FirmwareFile;
  hasError?: boolean;
  errorMessage?: string;
  isDownloading?: boolean;
  downloadProgress?: number;
  fileSize?: number;
  isEnabled?: boolean; // If false, file is ignored during flashing and validation
}

export interface ZipExtractionResult {
  extractedFiles: File[];
  totalFiles: number;
  extractedCount: number;
  skippedCount: number;
}

export interface FlashOptions {
  baudrate: number;
  address: string;
  eraseBeforeFlash: boolean;
  onProgress?: (progress: FlashProgress) => void;
}

// Firmware metadata types
export interface FirmwareMetadataFile {
  name: string;
  md5: string;
  bytes: number;
}

export interface FirmwareMetadataPartition {
  name: string;
  type: string;
  subtype: string;
  offset: string;
  size: string;
  flags: string;
}

export interface FirmwareMetadata {
  version: string;
  build_epoch: number;
  board: string;
  mcu: string;
  repo: string;
  files: FirmwareMetadataFile[];
  part: FirmwareMetadataPartition[];
  has_mui: boolean;
  has_inkhud: boolean;
}

// Extended manifest part with classification for internal use
export interface ManifestPartExtended extends ManifestPart {
  partType: 'firmware' | 'ota' | 'filesystem';
}

// Extended manifest build for internal processing
export interface ManifestBuildExtended extends ManifestBuild {
  parts: ManifestPartExtended[];
}

// Extended manifest response for internal processing
export interface ManifestMetadata extends Omit<ManifestResponse, 'builds'> {
  builds: ManifestBuildExtended[];
}

// Union type for both metadata formats
export type FirmwareMetadataExtended = FirmwareMetadata | ManifestMetadata;

// Flash address result
export interface FlashAddressResult {
  address: string;
  type: 'firmware' | 'ota' | 'filesystem';
  description: string;
  filename?: string; // Optional filename for the flash operation
}

// Validation error codes
export const ValidationErrors = {
  UNKNOWN_ERROR: -1,
  FILES_CONFLICT: -2,
  CHIP_MISMATCH: -3
} as const;

export type ValidationError = typeof ValidationErrors[keyof typeof ValidationErrors];

// Memory map segment types
export interface MemorySegment {
  address: number;      // Starting address in bytes
  size: number;         // Size in bytes
  type: 'firmware' | 'ota' | 'filesystem';
  filename: string;
  color: string;        // Segment color
}

// ==================== PINOUT TYPES ====================

export type PinCategory = 'button' | 'lora' | 'lora_power' | 'power' | 'led' | 'audio' | 'i2c' | 'uart' | 'gps' | 'gps_config' | 'led_config' | 'spi' | 'other';

export interface PinDefine {
  [key: string]: string;  // e.g., "LORA_SCK": "10"
}

export interface PinDefines {
  button?: PinDefine;
  lora?: PinDefine;
  lora_power?: PinDefine;
  power?: PinDefine;
  led?: PinDefine;
  audio?: PinDefine;
  i2c?: PinDefine;
  uart?: PinDefine;
  gps?: PinDefine;
  gps_config?: PinDefine;
  led_config?: PinDefine;
  spi?: PinDefine;
  other?: PinDefine;
}

export interface PinSummary {
  button?: number;
  lora?: number;
  lora_power?: number;
  power?: number;
  led?: number;
  audio?: number;
  i2c?: number;
  uart?: number;
  gps?: number;
  gps_config?: number;
  led_config?: number;
  other?: number;
}

export interface BoardVariantConfig {
  [key: string]: Record<string, string>;  // Config categories like system, battery, lora, etc.
}

export interface BoardVariant {
  file: string;
  board: string;
  family: string;
  pins: PinDefines;
  config?: BoardVariantConfig;
}

export interface PinoutVariant {
  [boardName: string]: BoardVariant;
}

export interface PinoutData {
  metadata: {
    total_variants: number;
    generated_date: string;
    format_version: string;
    source_dir: string;
    total_variants_including_aliases?: number;
  };
  variants: PinoutVariant;  // Flat structure: boardName -> BoardVariant (v2.0)
}

// UI Types for pinout visualization
export interface PinInfo {
  name: string;          // e.g., "LORA_SCK"
  pinNumber: string;     // e.g., "10" or "P1.04" for NRF52
  category: PinCategory;
  description?: string;
}