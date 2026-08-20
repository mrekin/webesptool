import type {
    ESPDeviceInfo,
    FlashProgress,
    FirmwareMetadata,
    FirmwareMetadataExtended,
    FlashAddressResult,
    ValidationError
} from '$lib/types.js';
import { ValidationErrors } from '$lib/types.js';
import type { PartitionTable } from '$lib/utils/partitionParser.js';

// Constants for flash addresses
const FIRMWARE_OFFSET = '0x0';
const BOOTLOADER_OFFSET = '0x0';
const PARTITIONS_OFFSET = '0x8000';
const UPDATE_OFFSET = '0x10000';
const DEFAULT_OTA_OFFSET = '0x260000';
const DEFAULT_SPIFFS_OFFSET = '0x300000';

// Full firmware file types (factory and merged files that should be treated the same way)
const FULL_FIRMWARE_FILE_TYPES = ['factory.bin', 'merged.bin'];

/**
 * Check if a filename matches any of the full firmware file types
 */
function isFullFirmwareFile(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    return FULL_FIRMWARE_FILE_TYPES.some((type) => lowerFilename.includes(type));
}

/**
 * Check if a filename is a regular firmware file (not a full firmware file)
 */
function isRegularFirmwareFile(filename: string): boolean {
    return /^firmware.*\.bin$/i.test(filename) && !isFullFirmwareFile(filename);
}

/**
 * Parse firmware metadata from JSON string
 */
export function parseFirmwareMetadata(metadataJson: string): FirmwareMetadata | null {
    try {
        return JSON.parse(metadataJson) as FirmwareMetadata;
    } catch (error) {
        console.error('Failed to parse firmware metadata:', error);
        return null;
    }
}

/**
 * Detect metadata format (manifest vs legacy)
 */
function detectMetadataFormat(
    metadata: FirmwareMetadataExtended
): 'manifest' | 'legacy' | 'unknown' {
    if (!metadata) return 'unknown';
    if ('builds' in metadata && Array.isArray(metadata.builds)) return 'manifest';
    if ('part' in metadata && Array.isArray(metadata.part)) return 'legacy';
    return 'unknown';
}

/**
 * Classify manifest part type from URL path
 */
function classifyManifestPart(path: string): 'firmware' | 'ota' | 'filesystem' {
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes('p=fw')) return 'firmware';
    if (lowerPath.includes('p=bleota')) return 'ota';
    if (lowerPath.includes('p=littlefs')) return 'filesystem';
    return 'firmware';
}

/**
 * Find matching part in manifest for given filename
 */
function findManifestPart(filename: string, manifest: any) {
    if (!manifest.builds?.[0]?.parts) return null;

    const lowerFilename = filename.toLowerCase();
    const parts = manifest.builds[0].parts;

    for (const part of parts) {
        const partType = classifyManifestPart(part.path);

        // Only match firmware parts for actual firmware files
        if (
            partType === 'firmware' &&
            (lowerFilename.includes('firmware') ||
                lowerFilename.includes('factory') ||
                lowerFilename.includes('merged'))
        ) {
            return { ...part, partType };
        }

        if (
            (partType === 'ota' && lowerFilename.includes('bleota')) ||
            (partType === 'filesystem' &&
                (lowerFilename.includes('littlefs') || lowerFilename.includes('spiffs')))
        ) {
            return { ...part, partType };
        }
    }
    return null;
}

// ======== Partition-based Address Determination ========

/**
 * Firmware file type enum for classification
 */
export enum FirmwareFileType {
    FULL_FIRMWARE, // factory.bin, merged.bin, dump_*.bin
    UPDATE_FIRMWARE, // firmware*.bin (не factory/merged)
    OTA_FIRMWARE, // bleota*.bin
    FILESYSTEM, // littlefs*.bin, spiffs*.bin
    BOOTLOADER, // bootloader.bin
    PARTITIONS, // partitions.bin
    NVS_DATA, // nvs.bin
    OTADATA_DATA, // otadata.bin
    PHY_DATA, // phy_init.bin
    UNKNOWN // неизвестный тип
}

/**
 * Classify firmware file type by filename patterns
 */
export function classifyFile(filename: string): FirmwareFileType {
    const lowerName = filename.toLowerCase();

    // Special files (exact match required)
    if (lowerName === 'nvs.bin') return FirmwareFileType.NVS_DATA;
    if (lowerName === 'otadata.bin') return FirmwareFileType.OTADATA_DATA;
    if (lowerName === 'phy_init.bin') return FirmwareFileType.PHY_DATA;

    // Bootloader and partitions (should NOT be matched)
    if (lowerName.includes('bootloader.bin')) return FirmwareFileType.BOOTLOADER;
    if (lowerName.includes('partitions.bin')) return FirmwareFileType.PARTITIONS;

    // Full firmware: factory, merged, dump files (complete flash restore)
    if (
        lowerName.includes('factory.bin') ||
        lowerName.includes('merged.bin') ||
        (lowerName.startsWith('dump_') && lowerName.endsWith('.bin'))
    ) {
        return FirmwareFileType.FULL_FIRMWARE;
    }

    // Regular firmware (update files)
    if (/^firmware.*\.bin$/i.test(filename)) return FirmwareFileType.UPDATE_FIRMWARE;

    // OTA firmware
    if (lowerName.includes('ota')) return FirmwareFileType.OTA_FIRMWARE;

    // Filesystem
    if (lowerName.includes('littlefs') || lowerName.includes('spiffs')) {
        return FirmwareFileType.FILESYSTEM;
    }

    return FirmwareFileType.UNKNOWN;
}

/**
 * Mapping of manifest query parameter `p` values to canonical firmware filenames.
 * Used to derive a meaningful filename from a query-style manifest path when the
 * real filename from Content-Disposition is unavailable (e.g. on download error).
 * Matches the naming scheme returned by the backend on successful downloads.
 */
const PART_TYPE_TO_FILENAME: Record<string, string> = {
    fw: 'firmware.bin',
    littlefs: 'littlefs.bin',
    bleota: 'bleota.bin',
    'bleota-s3': 'bleota-s3.bin'
};

/**
 * Extract a meaningful filename from a manifest part path.
 *
 * Manifest paths produced by the backend are query-style endpoints without slashes
 * (e.g. `firmware?v=...&t=...&u=...&p=fw&src=...`). The `p` query parameter
 * identifies the part type and is mapped to the canonical binary filename that
 * matches what Content-Disposition returns on a successful download.
 *
 * Fallback: for paths that do contain slashes (legacy/external URLs) the last
 * segment after `/` is returned; if everything fails, `firmware.bin` is used.
 */
export function extractFilenameFromManifestPath(path: string): string {
    try {
        const url = new URL(path, window.location.origin);
        const p = url.searchParams.get('p');
        if (p && PART_TYPE_TO_FILENAME[p]) return PART_TYPE_TO_FILENAME[p];
        if (p) return `${p}.bin`;
        // u=1 path without `p` is plain firmware (webesptool/service.py)
        return 'firmware.bin';
    } catch {
        // fallback: legacy/external path with slashes
        const segments = path.split('/');
        return segments[segments.length - 1] || 'firmware.bin';
    }
}

/**
 * Get address from metadata (manifest.json or .mt.json)
 * Returns null if no metadata or file not found in metadata
 */
function getAddressFromMetadata(
    filename: string,
    metadata: FirmwareMetadataExtended | null
): FlashAddressResult | null {
    if (!metadata) return null;

    const format = detectMetadataFormat(metadata);
    if (format === 'unknown') return null;

    if (format === 'manifest') {
        const manifestPart = findManifestPart(filename, metadata);
        if (!manifestPart) return null;

        return {
            address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
            type: manifestPart.partType,
            description: getDescriptionFromManifestPart(manifestPart, metadata)
        };
    }

    if (format === 'legacy') {
        const lowerFilename = filename.toLowerCase();

        // Legacy metadata logic for OTA files
        if (lowerFilename.includes('bleota')) {
            const otaOffset = getOtaOffsetFromMetadata(metadata as any);
            return {
                address: otaOffset,
                type: 'ota',
                description: `OTA firmware for ${(metadata as any).mcu}`
            };
        }

        // Legacy metadata logic for SPIFFS files
        if (lowerFilename.includes('littlefs') || lowerFilename.includes('spiffs')) {
            const spiffsOffset = getSpiffsOffsetFromMetadata(metadata);
            return {
                address: spiffsOffset,
                type: 'filesystem',
                description: 'File system (LittleFS/SPIFFS)'
            };
        }

        // Legacy metadata logic for firmware files
        if (/^firmware.*\.bin$/i.test(filename)) {
            const appPartition = (metadata as any).part.find(
                (p: any) => p.subtype === 'ota_0' && p.type === 'app'
            );
            if (appPartition) {
                return {
                    address: appPartition.offset,
                    type: 'firmware',
                    description: `Update firmware for ${(metadata as any).mcu} - ${(metadata as any).board}`
                };
            }
        }
    }

    return null;
}

/**
 * Get description from manifest part
 */
function getDescriptionFromManifestPart(manifestPart: any, metadata: any): string {
    const deviceName = metadata.name || 'device';

    if (manifestPart.partType === 'firmware') {
        if (manifestPart.offset === 0) {
            return `Factory firmware for ${deviceName}. Contains bootloader, partitions, application`;
        }
        return `Update firmware for ${deviceName}`;
    }

    if (manifestPart.partType === 'ota') {
        return `OTA firmware for ${deviceName}`;
    }

    if (manifestPart.partType === 'filesystem') {
        return `File system for ${deviceName}`;
    }

    return 'Firmware file';
}

/**
 * Find best matching partition by subtype priority
 * Returns offset of first matching partition or null
 */
function findBestMatch(type_val: number, subtypes: number[], table: PartitionTable): number | null {
    const matches = table.entries.filter(
        (entry) => entry.type_val === type_val && subtypes.includes(entry.subtype)
    );

    if (matches.length === 0) return null;

    // Sort by subtype priority, then by minimal offset
    const prioritized = matches.sort((a, b) => {
        const priorityA = subtypes.indexOf(a.subtype);
        const priorityB = subtypes.indexOf(b.subtype);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.offset - b.offset;
    });

    return prioritized[0].offset;
}

/**
 * Get address from partitions table
 * Returns null if:
 * - partitionsTable is null
 * - file type should NOT be matched (bootloader, partitions)
 * - no matching partition found
 */
function getAddressFromPartitions(
    fileType: FirmwareFileType,
    filename: string,
    table: PartitionTable
): number | null {
    // These file types should NOT be matched (per PRD requirements)
    if (fileType === FirmwareFileType.BOOTLOADER || fileType === FirmwareFileType.PARTITIONS) {
        return null;
    }

    // For FULL_FIRMWARE, no matching partition (contains multiple partitions)
    if (fileType === FirmwareFileType.FULL_FIRMWARE) {
        return null; // Will use 0x0 from fallback
    }

    switch (fileType) {
        case FirmwareFileType.UPDATE_FIRMWARE:
            // firmware.bin → ota_0 (0x10) or factory (0x00) in APP partitions (type=0x00)
            return findBestMatch(0x00, [0x10, 0x00], table);

        case FirmwareFileType.OTA_FIRMWARE:
            // bleota.bin → ota_1 (0x11) → ota_0 (0x10) → factory (0x00) in APP partitions
            return findBestMatch(0x00, [0x11, 0x10, 0x00], table);

        case FirmwareFileType.FILESYSTEM:
            // littlefs/spiffs → corresponding DATA partition (type=0x01)
            const isLittlefs = filename.toLowerCase().includes('littlefs');
            // littlefs (0x09) → spiffs (0x08) → custom spiffs (0x82)
            const subtypes = isLittlefs ? [0x09, 0x08, 0x82] : [0x08, 0x09, 0x82];
            return findBestMatch(0x01, subtypes, table);

        case FirmwareFileType.NVS_DATA:
            // nvs.bin → nvs (subtype=0x02) in DATA partitions
            return findBestMatch(0x01, [0x02], table);

        case FirmwareFileType.OTADATA_DATA:
            // otadata.bin → otadata (subtype=0x00) in DATA partitions
            return findBestMatch(0x01, [0x00], table);

        case FirmwareFileType.PHY_DATA:
            // phy_init.bin → phy (subtype=0x01) in DATA partitions
            return findBestMatch(0x01, [0x01], table);

        default:
            return null;
    }
}

/**
 * Get address from class-based filename patterns
 * Returns default address for each file type
 */
function getAddressFromClassPatterns(
    fileType: FirmwareFileType
): { address: number; description: string } | null {
    switch (fileType) {
        case FirmwareFileType.BOOTLOADER:
            return { address: 0x0, description: 'Bootloader file' };

        case FirmwareFileType.PARTITIONS:
            return { address: 0x8000, description: 'Partitions file' };

        case FirmwareFileType.FULL_FIRMWARE:
            return { address: 0x0, description: 'Factory firmware - full installation' };

        case FirmwareFileType.UPDATE_FIRMWARE:
            return { address: 0x10000, description: 'Update firmware - partial installation' };

        case FirmwareFileType.OTA_FIRMWARE:
            return { address: 0x260000, description: 'OTA firmware' };

        case FirmwareFileType.FILESYSTEM:
            return { address: 0x300000, description: 'File system (LittleFS/SPIFFS)' };

        case FirmwareFileType.NVS_DATA:
            return { address: 0x9000, description: 'NVS data file' };

        case FirmwareFileType.OTADATA_DATA:
            return { address: 0xf000, description: 'OTA data file' };

        case FirmwareFileType.PHY_DATA:
            return { address: 0x11000, description: 'PHY init data file' };

        default:
            return null;
    }
}

/**
 * Log address determination method
 */
function logAddressDetermination(filename: string, method: string, details?: string): void {
    if (details) {
        console.log(`[Address determination] ${filename}: ${method} (${details})`);
    } else {
        console.log(`[Address determination] ${filename}: ${method}`);
    }
}

/**
 * Determine flash address for firmware file
 * Priority: metadata > partitions.bin > filename patterns
 *
 * @param filename - Firmware filename
 * @param metadata - Firmware metadata (manifest.json or .mt.json)
 * @param partitionsTable - Optional partition table from partitions.bin
 * @returns Flash address result or null if not determined
 */
export function getMeshtasticFlashAddress(
    filename: string,
    metadata: FirmwareMetadataExtended | null,
    partitionsTable?: PartitionTable | null
): FlashAddressResult | null {
    if (!filename) return null;

    // Step 1: Try metadata (highest priority)
    const metadataResult = getAddressFromMetadata(filename, metadata);
    if (metadataResult) {
        logAddressDetermination(filename, 'metadata (manifest.json)');
        return { ...metadataResult, source: 'metadata' };
    }

    // Step 2: Classify file (only if no metadata)
    const fileType = classifyFile(filename);

    // Step 3: Try partitions.bin
    if (partitionsTable) {
        const partitionResult = getAddressFromPartitions(fileType, filename, partitionsTable);
        if (partitionResult !== null) {
            logAddressDetermination(filename, 'partitions.bin');
            return {
                address: `0x${partitionResult.toString(16).toUpperCase()}`,
                type: getTypeFromFileType(fileType),
                description: getDescriptionForFileType(fileType),
                source: 'partitions'
            };
        }
        console.log(
            `[Address determination] ${filename}: partitions.bin - no match (fileType=${FirmwareFileType[fileType]})`
        );
    }

    // Step 4: Fallback to filename patterns
    const patternResult = getAddressFromClassPatterns(fileType);
    if (patternResult !== null) {
        logAddressDetermination(filename, 'filename pattern');
        return {
            address: `0x${patternResult.address.toString(16).toUpperCase()}`,
            type: getTypeFromFileType(fileType),
            description: patternResult.description,
            source: 'pattern'
        };
    }

    // Not determined
    logAddressDetermination(filename, 'not determined');
    return null;
}

/**
 * Get flash address type from file type
 */
function getTypeFromFileType(fileType: FirmwareFileType): 'firmware' | 'ota' | 'filesystem' {
    if (fileType === FirmwareFileType.OTA_FIRMWARE) return 'ota';
    if (fileType === FirmwareFileType.FILESYSTEM) return 'filesystem';
    return 'firmware';
}

/**
 * Get description for file type
 */
function getDescriptionForFileType(fileType: FirmwareFileType): string {
    switch (fileType) {
        case FirmwareFileType.BOOTLOADER:
            return 'Bootloader file';
        case FirmwareFileType.PARTITIONS:
            return 'Partitions file';
        case FirmwareFileType.FULL_FIRMWARE:
            return 'Factory firmware - full installation';
        case FirmwareFileType.UPDATE_FIRMWARE:
            return 'Update firmware - partial installation';
        case FirmwareFileType.OTA_FIRMWARE:
            return 'OTA firmware';
        case FirmwareFileType.FILESYSTEM:
            return 'File system (LittleFS/SPIFFS)';
        case FirmwareFileType.NVS_DATA:
            return 'NVS data file';
        case FirmwareFileType.OTADATA_DATA:
            return 'OTA data file';
        case FirmwareFileType.PHY_DATA:
            return 'PHY init data file';
        default:
            return 'Firmware file';
    }
}

/**
 * Get OTA offset from metadata partitions
 */
function getOtaOffsetFromMetadata(metadata: FirmwareMetadata): string {
    const otaPartition = metadata.part.find((p: any) => p.subtype === 'ota_1');
    return otaPartition ? otaPartition.offset : DEFAULT_OTA_OFFSET;
}

/**
 * Get SPIFFS offset from metadata partitions
 */
function getSpiffsOffsetFromMetadata(metadata: FirmwareMetadataExtended): string {
    const spiffsPartition = (metadata as any).part.find((p: any) => p.subtype === 'spiffs');
    return spiffsPartition ? spiffsPartition.offset : DEFAULT_SPIFFS_OFFSET;
}

/**
 * Get all flash addresses for a complete installation based on metadata
 */
export function getCompleteFlashAddresses(metadata: FirmwareMetadata): {
    firmware: FlashAddressResult;
    ota: FlashAddressResult;
    filesystem: FlashAddressResult;
} | null {
    if (!metadata) return null;

    // Find factory firmware filename (includes both factory.bin and merged.bin files)
    const factoryFirmwareFile = metadata.files.find((file: any) =>
        FULL_FIRMWARE_FILE_TYPES.some((type) => file.name.includes(type))
    );
    const firmwareFilename = factoryFirmwareFile ? factoryFirmwareFile.name : '';

    const firmwareAddress: FlashAddressResult = {
        address: FIRMWARE_OFFSET,
        type: 'firmware',
        description: 'Factory firmware',
        filename: firmwareFilename
    };

    const otaOffset = getOtaOffsetFromMetadata(metadata);
    const otaFilename = getOtaFilename(metadata.mcu);
    const otaAddress: FlashAddressResult = {
        address: otaOffset,
        type: 'ota',
        description: `OTA firmware for ${metadata.mcu}`,
        filename: otaFilename
    };

    const spiffsOffset = getSpiffsOffsetFromMetadata(metadata);
    // Find filesystem filename or generate it
    const filesystemFile = metadata.files.find(
        (file: any) => file.name.includes('littlefs-') || file.name.includes('spiffs')
    );
    const filesystemFilename = filesystemFile
        ? filesystemFile.name
        : getFilesystemFilename(firmwareFilename);

    const filesystemAddress: FlashAddressResult = {
        address: spiffsOffset,
        type: 'filesystem',
        description: 'File system (LittleFS/SPIFFS)',
        filename: filesystemFilename
    };

    return {
        firmware: firmwareAddress,
        ota: otaAddress,
        filesystem: filesystemAddress
    };
}

/**
 * Determine OTA filename based on MCU type
 */
export function getOtaFilename(mcu: string): string {
    switch (mcu) {
        case 'esp32s3':
            return 'bleota-s3.bin';
        case 'esp32c3':
            return 'bleota-c3.bin';
        default:
            return 'bleota.bin';
    }
}

/**
 * Determine filesystem filename based on firmware filename
 */
export function getFilesystemFilename(firmwareFilename: string): string {
    // Extract board info from firmware filename
    const match = firmwareFilename.match(/firmware-(.+)-\d/);
    if (match) {
        const boardInfo = match[1];
        return `littlefs-${boardInfo}.bin`;
    }
    return 'littlefs.bin';
}

// Validate firmware file selection for conflicts and chip compatibility
export function validateFirmwareSelection(
    files: { filename: string }[],
    metadata?: FirmwareMetadataExtended | null,
    deviceChip?: string
): {
    isValid: boolean;
    errorCode?: ValidationError;
    conflictingFiles?: string[];
    errorMessage?: string;
} {
    const hasRegularFirmware = files.some((file) => isRegularFirmwareFile(file.filename));
    const hasFactoryFirmware = files.some((file) => isFullFirmwareFile(file.filename));

    // Check chip compatibility if metadata and device info are available

    if (metadata && deviceChip && (metadata as any).builds && (metadata as any).builds.length > 0) {
        // Find a build in the manifest that matches the device chip family
        // Direct string comparison to match device chip family
        const matchingBuild = (metadata as any).builds.find(
            (build: any) => build.chipFamily === deviceChip
        );

        console.log('Chip compatibility check:', {
            deviceChip,
            availableChips: (metadata as any).builds.map((b: any) => b.chipFamily),
            matchingBuild: matchingBuild ? matchingBuild.chipFamily : null
        });

        if (!matchingBuild) {
            // No matching build found - chip not supported
            const supportedChips = (metadata as any).builds
                .map((b: any) => b.chipFamily)
                .join(', ');
            return {
                isValid: false,
                errorCode: ValidationErrors.CHIP_MISMATCH,
                errorMessage: `Firmware does not support ${deviceChip}. Supported chips: ${supportedChips}`
            };
        }
    }

    // Check for firmware conflicts (only if chip compatibility passed)
    if (hasRegularFirmware && hasFactoryFirmware) {
        // Get all conflicting files
        const conflictingFiles = files
            .filter(
                (file) =>
                    isRegularFirmwareFile(file.filename) || // regular firmware
                    isFullFirmwareFile(file.filename) // full firmware (factory, merged, etc.)
            )
            .map((file) => file.filename);

        return {
            isValid: false,
            errorCode: ValidationErrors.FILES_CONFLICT,
            conflictingFiles
        };
    }

    return { isValid: true };
}

export function createESPManager() {
    let port: any = null; // Use 'any' type for SerialPort since it's not defined in the current context
    let esploader: any = null;
    let transport: any = null;
    // Serializes port sessions: only one open loader session may run at a
    // time. Overlapping operations (e.g. a double port selection: auto-select
    // reactive racing a user click) previously fought over the same
    // SerialPort and failed with "The port is already open".
    let activeSession: Promise<unknown> = Promise.resolve();

    function runSerialized<T>(task: () => Promise<T>): Promise<T> {
        const result = activeSession.then(task, task);
        activeSession = result.catch(() => undefined);
        return result;
    }

    // Baudrate options
    const baudrateOptions = [
        { value: 57600, labelKey: 'customfirmware.baudrate_57600' },
        { value: 115200, labelKey: 'customfirmware.baudrate_115200' },
        { value: 230400, labelKey: 'customfirmware.baudrate_230400' },
        { value: 460800, labelKey: 'customfirmware.baudrate_460800' },
        { value: 512000, labelKey: 'customfirmware.baudrate_512000' },
        { value: 921600, labelKey: 'customfirmware.baudrate_921600' },
        { value: 1500000, labelKey: 'customfirmware.baudrate_1500000' }
    ];

    // Connect to serial port
    async function connectToPort(): Promise<boolean> {
        try {
            if ('serial' in navigator) {
                // Just request port, don't open it here - ESPLoader will open it
                port = await (navigator as any).serial.requestPort();
                return true;
            } else {
                throw new Error('Web Serial API not supported in this browser');
            }
        } catch (error) {
            throw new Error(`Failed to connect: ${error}`);
        }
    }

    // Close the serial port reliably. transport.disconnect() races with the
    // esptool-js readLoop (it releases the stream lock between iterations),
    // which can leave the port open with a locked stream and every later
    // device.open() fails with "The port is already open". So we cancel the
    // reader ourselves (retrying, because readLoop re-acquires the lock) and
    // wait a bounded time for the lock to become free before closing.
    // Returns true if the port ended up closed.
    async function closePortQuietly(): Promise<boolean> {
        if (!port || !port.readable) return true; // already closed

        for (let i = 0; i < 20; i++) {
            try {
                await (transport as any)?.reader?.cancel();
            } catch {
                // reader already released between readLoop iterations - retry
            }
            if (!port.readable?.locked) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        try {
            await port.close();
        } catch (e) {
            console.log('Port close note:', (e as any).message || e);
        }
        return !port.readable;
    }

    // Reboot the device: pulse EN via RTS with IO0 (DTR) released. The
    // default loader.after() "hard_reset" only drops RTS, which is a no-op
    // when RTS is already low - no reset edge, the chip stays in the flasher
    // stub. The pulse works for classic auto-reset circuits and for the
    // USB-JTAG-Serial peripheral alike.
    async function hardResetDevice(loader: any): Promise<void> {
        try {
            await loader.transport.setDTR(false);
            await loader.transport.setRTS(true);
            await new Promise((resolve) => setTimeout(resolve, 100));
            await loader.transport.setDTR(false);
            await loader.transport.setRTS(false);
            console.log('Device reset via RTS pulse');
        } catch (e) {
            console.log('Device reset note:', (e as any).message || e);
        }
    }

    // Run an operation in a fresh loader session (session-less model):
    // opens the port, resets the chip into download mode, syncs and uploads
    // the flasher stub at `baudrate` directly (ROM autobaud), then runs the
    // operation. One open() per session: esptool-js otherwise syncs at a
    // hardcoded romBaudrate=115200 and switches afterwards via changeBaud()
    // which closes and reopens the port - Chrome's reopen pulses DTR/EN and
    // kicks some boards out of the just-loaded stub. If a direct high-baud
    // sync fails (ROM autobaud is not reliable on every chip/crystal), fall
    // back once to that classic 115200 + changeBaud() path.
    async function withLoader<T>(
        baudrate: number,
        operation: (loader: any, terminalOutput: string[]) => Promise<T>
    ): Promise<T> {
        if (!port) {
            throw new Error('No port selected');
        }

        // One session at a time: a second operation (double port selection,
        // reset during detection, ...) waits for the previous session to
        // finish and close the port instead of racing on the same SerialPort.
        return runSerialized(async () => {
            const { ESPLoader, Transport } = await import('esptool-js');

            // Recover from a previous session that failed to close the port
            const recovered = await closePortQuietly();
            if (!recovered) {
                throw new Error(
                    'Serial port is busy (held open by a previous session). Reload the page and try again.'
                );
            }

            // One connect attempt: fresh terminal/transport/loader. With
            // directBaud the port opens at the target speed right away
            // (romBaudrate override), so main()'s changeBaud() never runs.
            const attempt = async (directBaud: boolean): Promise<T> => {
                // Create terminal and collect all output (used for info parsing).
                // Full lines are also mirrored to the console so the loader
                // messages (e.g. "Changing baudrate to ...") stay visible.
                const terminalOutput: string[] = [];
                const espLoaderTerminal = {
                    clean() {
                        // console.clear();
                    },
                    writeLine(data: string) {
                        terminalOutput.push(data);
                        console.log(data);
                    },
                    write(data: string) {
                        terminalOutput.push(data);
                    }
                };

                transport = new Transport(port, false);

                // Create ESPLoader with minimal options
                const loaderOptions: any = {
                    transport,
                    baudrate,
                    terminal: espLoaderTerminal,
                    debugLogging: false,
                    enableTracing: false // Disable TRACE logs
                };

                const loader = new ESPLoader(loaderOptions);
                esploader = loader;
                if (directBaud) {
                    // Not settable via loaderOptions: the constructor hardcodes
                    // 115200 and main() opens the port at romBaudrate.
                    (loader as any).romBaudrate = baudrate;
                } else if (baudrate !== 115200) {
                    // Classic path (fallback): main() switches to the target
                    // speed via changeBaud() = close + reopen, and esptool-js
                    // continues immediately. Some devices need a moment to
                    // settle on the new speed before the next command arrives.
                    const originalChangeBaud = loader.changeBaud.bind(loader);
                    loader.changeBaud = async () => {
                        await originalChangeBaud();
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    };
                }

                try {
                    await loader.main();
                    return await operation(loader, terminalOutput);
                } catch (error) {
                    // A holder outside this manager (a stale module after a hot
                    // reload, another tab) keeps the port open invisibly: our
                    // port.readable is null, but open() still fails. Surface it
                    // as an actionable error instead of the cryptic
                    // InvalidStateError.
                    const message = (error as any)?.message || String(error);
                    if (message.includes('already open')) {
                        throw new Error(
                            'Serial port is busy (held open by another session). Reload the page and reconnect the device.'
                        );
                    }
                    throw error;
                } finally {
                    // Same cleanup order as resetPort(): loader, then port
                    try {
                        await loader.after();
                    } catch (e) {
                        console.log('ESPLoader cleanup note:', (e as any).message || e);
                    }
                    await closePortQuietly();
                    esploader = null;
                    transport = null;
                }
            };

            // 115200 needs no override: romBaudrate already equals baudrate,
            // changeBaud() is skipped by main() anyway.
            if (baudrate === 115200) {
                return await attempt(false);
            }
            try {
                return await attempt(true);
            } catch (error) {
                // Autobaud at the target speed failed - retry once with the
                // classic 115200 sync + internal changeBaud() (the previous
                // behavior). Surface the retry's error: it matches what the
                // classic path would have reported.
                console.warn(
                    `Direct ${baudrate} baud connect failed, retrying via 115200 + changeBaud:`,
                    error
                );
                const retryRecovered = await closePortQuietly();
                if (!retryRecovered) throw error;
                return await attempt(false);
            }
        });
    }

    // Get device information
    // Detection runs in its own loader session; withLoader() closes the port
    // afterwards, so no live connection is kept between operations.
    async function getDeviceInfo(): Promise<ESPDeviceInfo | null> {
        if (!port) return null;

        try {
            return await withLoader(
                115200, // Use standard speed for detection
                async (loader: any, terminalOutput: string[]) => {
                    // Chip is already detected: withLoader() ran main() (which
                    // opens the port, syncs and uploads the stub). Calling
                    // main() again here re-opens the already open port and
                    // fails with "The port is already open".
                    let espChipName = loader.chip?.CHIP_NAME || 'Unknown';
                    // Remove revision info from chip name (e.g., "ESP32-C6 (revision 2)" -> "ESP32-C6")
                    espChipName = espChipName.replace(/\s*\(revision.*\)$/, '').trim();
                    console.log('ESP chip name (normalized):', espChipName);
                    console.log('Terminal output:', terminalOutput);

                    // Parse detailed information from terminal output
                    let flashSize = 'Unknown';
                    let psramSize: string | undefined;
                    let mac = 'Unknown';
                    let features = 'Unknown';
                    let crystal = 'Unknown';
                    let revision = 'Unknown';
                    let flashId = 'Unknown';

                    // Parse terminal output for detailed info
                    const outputText = terminalOutput.join('\n');

                    // Use ROM API methods when available, fallback to parsing terminal output

                    // Get MAC address using ROM API
                    try {
                        mac = await loader.chip.readMac(loader);
                    } catch (error) {
                        console.warn('Failed to get MAC from ROM API:', error);
                        const macMatch = outputText.match(/MAC:\s*([0-9A-Fa-f:]+)/);
                        if (macMatch) mac = macMatch[1];
                    }

                    // Get chip features using ROM API
                    try {
                        features = await loader.chip.getChipFeatures(loader);
                    } catch (error) {
                        console.warn('Failed to get features from ROM API:', error);
                        const featuresMatch = outputText.match(/Features:\s*(.+)/);
                        if (featuresMatch) features = featuresMatch[1];
                    }

                    // Get crystal frequency using ROM API
                    try {
                        const crystalFreq = await loader.chip.getCrystalFreq(loader);
                        crystal = `${crystalFreq}MHz`;
                    } catch (error) {
                        console.warn('Failed to get crystal from ROM API:', error);
                        const crystalMatch = outputText.match(/Crystal is (\d+)MHz/);
                        if (crystalMatch) crystal = `${crystalMatch[1]}MHz`;
                    }

                    // Get chip revision using ROM API
                    try {
                        if (loader.chip.getChipRevision) {
                            revision = await loader.chip.getChipRevision(loader);
                        } else {
                            // Fallback to parsing for chips without getChipRevision
                            const chipMatch = outputText.match(/Chip is (.+) \(revision (.+)\)/);
                            if (chipMatch) {
                                revision = chipMatch[2];
                            }
                        }
                    } catch (error) {
                        console.warn('Failed to get revision from ROM API:', error);
                        const chipMatch = outputText.match(/Chip is (.+) \(revision (.+)\)/);
                        if (chipMatch) {
                            revision = chipMatch[2];
                        }
                    }

                    // Detect flash size using loader's detectFlashSize() (esptool-js 0.6.1 API).
                    // Returns an already-formatted string (e.g., "8MB"); more reliable than parsing
                    // terminal output, especially when PSRAM is present.
                    try {
                        const detected = await loader.detectFlashSize();
                        if (detected) {
                            flashSize = detected; // e.g., "4MB", "8MB", "16MB"
                        } else {
                            flashSize = 'Unknown';
                        }
                        console.log('Detected flash size via detectFlashSize():', flashSize);
                    } catch (error) {
                        console.warn('Failed to detect flash size using detectFlashSize():', error);
                        // Fallback to parsing terminal output if detection fails
                        const flashSizeMatch = outputText.match(/Embedded Flash ([0-9]+MB) /);
                        if (flashSizeMatch) {
                            flashSize = flashSizeMatch[1];
                        }
                        // If fallback also didn't work - leave flashSize as 'Unknown'
                    }

                    // Detect PSRAM size by parsing terminal output
                    // Note: PSRAM info is only shown in terminal output, not available via ROM API
                    const psramSizeMatch = outputText.match(/Embedded PSRAM ([0-9]+MB) /);
                    if (psramSizeMatch) {
                        psramSize = psramSizeMatch[1];
                        console.log('Detected PSRAM size:', psramSize);
                    }

                    // Get Flash ID - not available via ROM API, parse from terminal output
                    const flashIdMatch = outputText.match(/Flash ID:\s*(.+)/);
                    if (flashIdMatch) {
                        flashId = flashIdMatch[1];
                    }

                    const deviceInfo: ESPDeviceInfo = {
                        chip: espChipName, // Use normalized chip name
                        flashSize: flashSize, // May be 'Unknown' if detection failed
                        psramSize: psramSize, // undefined if no PSRAM
                        mac: mac,
                        features: features,
                        crystal: crystal,
                        revision: revision,
                        flashId: flashId,
                        baudrate: 115200
                    };

                    console.log('Device detection completed, port closed (session-less mode)');
                    console.log(`Final device chip: ${espChipName}`);

                    return deviceInfo;
                }
            );
        } catch (error: any) {
            console.error('Failed to get device info:', error);
            throw new Error(`Failed to detect device: ${error.message || error.toString()}`);
        }
    }

    // Read flash memory
    // Runs in its own loader session at the given baudrate (session-less model).
    async function readFlashMemory(
        sizeBytes: number,
        options: {
            baudrate?: number;
            onProgress?: (progress: FlashProgress) => void;
            abortSignal?: AbortSignal;
        } = {}
    ): Promise<{ data: Uint8Array; flashId: string }> {
        if (!port) {
            throw new Error('ESP loader not initialized. Please connect to device first.');
        }

        // Check if aborted before starting
        if (options.abortSignal?.aborted) {
            throw new Error('Backup cancelled');
        }

        try {
            options.onProgress?.({
                progress: 0,
                status: 'Reading flash memory...',
                error: ''
            });

            return await withLoader(
                options.baudrate ?? 115200,
                async (loader: any): Promise<{ data: Uint8Array; flashId: string }> => {
                    console.log(`Reading ${sizeBytes} bytes from flash memory...`);

                    // Read flash ID first
                    let flashId = 'Unknown';
                    try {
                        // Check if aborted before reading flash ID
                        if (options.abortSignal?.aborted) {
                            throw new Error('Backup cancelled');
                        }

                        const flashIdResult = await loader.flashId();
                        flashId =
                            typeof flashIdResult === 'object'
                                ? JSON.stringify(flashIdResult)
                                : String(flashIdResult);
                        console.log('Flash ID:', flashId);
                    } catch (error) {
                        console.warn('Failed to read flash ID:', error);
                        // Check if error is from abort
                        if (error instanceof Error && error.message === 'Backup cancelled') {
                            throw error;
                        }
                    }

                    // Read entire flash memory from address 0x0
                    // esptool-js callback signature: onPacketReceived(packet, bytesRead, totalSize)
                    const flashData = await loader.readFlash(
                        0x0,
                        sizeBytes,
                        (packet: Uint8Array, bytesRead: number, totalSize: number) => {
                            // Check if aborted during read
                            if (options.abortSignal?.aborted) {
                                throw new Error('Backup cancelled');
                            }

                            const progress = Math.round((bytesRead / totalSize) * 100);
                            console.log(
                                `Read progress: ${bytesRead}/${totalSize} bytes (${progress}%)`
                            );
                            options.onProgress?.({
                                progress: progress,
                                status: `Reading flash memory... ${progress}%`,
                                error: ''
                            });
                        }
                    );

                    console.log(
                        `Flash read completed successfully. Total bytes: ${flashData.length}`
                    );

                    options.onProgress?.({
                        progress: 100,
                        status: 'Flash memory read completed',
                        error: ''
                    });

                    return { data: flashData, flashId };
                }
            );
        } catch (error) {
            console.error('Flash read error:', error);
            throw new Error(
                `Flash read failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    // Flash multiple files in a single loader session opened at `baudrate`
    // (session-less model: the port is closed afterwards). Optionally erases
    // the whole flash first - erase and write share the same session.
    async function flashFiles(
        files: { data: Uint8Array; address: string; filename: string; size: number }[],
        options: {
            baudrate?: number;
            eraseBeforeFlash?: boolean;
            onEraseProgress?: (progress: FlashProgress) => void;
            onFileProgress?: (event: {
                index: number;
                total: number;
                filename: string;
                address: string;
                progress: number;
                phase: 'start' | 'progress' | 'done';
            }) => void;
        } = {}
    ): Promise<void> {
        if (!port) {
            throw new Error('No port selected');
        }

        if (files.length === 0 && !options.eraseBeforeFlash) {
            throw new Error('No files to flash');
        }

        // Parse and validate all addresses up front
        const fileArray = files.map((file) => {
            const address = parseFlashAddress(file.address);
            if (isNaN(address) || address < 0) {
                throw new Error(
                    `Invalid flash address: ${file.address} (${file.filename}). Please enter a valid address (e.g., 0x0, 0x1000, 4096)`
                );
            }
            console.log(
                `${file.filename}: using flash address 0x${address.toString(16).toUpperCase()} (${address}), size ${file.size}`
            );
            return { data: file.data, address };
        });

        try {
            await withLoader(options.baudrate ?? 115200, async (loader: any) => {
                // Erase first (if requested) in the same session
                if (options.eraseBeforeFlash) {
                    options.onEraseProgress?.({
                        progress: 0,
                        status: 'Erasing flash...',
                        error: ''
                    });

                    await loader.eraseFlash();
                    console.log('Flash erase completed successfully');

                    options.onEraseProgress?.({
                        progress: 100,
                        status: 'Flash erased successfully',
                        error: ''
                    });
                }

                if (files.length === 0) {
                    // Erase-only mode: still reboot the device afterwards
                    await hardResetDevice(loader);
                    return;
                }

                // Track per-file progress: esptool-js reports (fileIndex, written, totalSize);
                // a change of fileIndex means the previous file is complete.
                let lastIndex = -1;
                const emit = (
                    index: number,
                    progress: number,
                    phase: 'start' | 'progress' | 'done'
                ) => {
                    const file = files[index];
                    options.onFileProgress?.({
                        index,
                        total: files.length,
                        filename: file.filename,
                        address: file.address,
                        progress,
                        phase
                    });
                };

                const flashOptions = {
                    fileArray,
                    flashMode: 'keep', // Keep current mode
                    flashFreq: 'keep', // Keep current frequency
                    flashSize: 'keep', // Keep current flash size
                    eraseAll: false, // Erase is handled separately
                    compress: true,
                    reportProgress: (fileIndex: number, written: number, totalSize: number) => {
                        if (fileIndex !== lastIndex) {
                            if (lastIndex >= 0) {
                                emit(lastIndex, 100, 'done');
                            }
                            emit(fileIndex, 0, 'start');
                            lastIndex = fileIndex;
                        }
                        const progress =
                            totalSize > 0 ? Math.round((written / totalSize) * 100) : 100;
                        emit(fileIndex, progress, 'progress');
                        console.log(`Progress: file ${fileIndex} ${written}/${totalSize} bytes`);
                    }
                };

                console.log('Flash options:', {
                    files: files.map((f) => ({ filename: f.filename, size: f.size })),
                    compress: true
                });
                console.log('Starting writeFlash...');
                await loader.writeFlash(flashOptions);
                console.log('writeFlash completed successfully');

                if (lastIndex >= 0) {
                    emit(lastIndex, 100, 'done');
                }

                // Reboot the device so the new firmware starts
                await hardResetDevice(loader);
            });
        } catch (error) {
            console.error('Flash error:', error);
            console.error(
                'Error stack:',
                error instanceof Error ? error.stack : 'No stack trace available'
            );

            // Check for common bootloader mode errors
            const errorMessage = error && error.toString ? error.toString() : String(error);
            if (
                errorMessage.includes('Invalid head of packet') ||
                errorMessage.includes('serial noise') ||
                errorMessage.includes('corruption')
            ) {
                throw new Error(`Device not in bootloader mode. Please put your device in download mode:
• ESP32/ESP8266: Hold BOOT/FLASH button, press RESET, release RESET, then release BOOT
• ESP32-S2/S3: Double-tap RESET button
• Alternative: Hold BOOT button while connecting USB

Then try flashing again.`);
            } else {
                throw new Error(`Flash failed: ${errorMessage}`);
            }
        }
    }

    // Reset port and cleanup
    async function resetPort(): Promise<void> {
        // Wait for any running session to finish before touching the port
        await runSerialized(async () => {
            // Cleanup order: esploader first, then port
            try {
                if (esploader) {
                    await esploader.after();
                    console.log('ESPLoader cleaned up');
                }
            } catch (e) {
                // Ignore errors if port is already closed
                console.log('ESPLoader cleanup note:', (e as any).message || e);
            }

            // Close the port reliably (cancels the readLoop reader first)
            await closePortQuietly();

            // Reset all references
            port = null;
            esploader = null;
            transport = null;
        });
    }

    // Get current port
    function getCurrentPort(): any {
        return port;
    }

    // Get baudrate options
    function getBaudrateOptions() {
        return baudrateOptions;
    }

    // Generate dump filename
    function generateDumpFilename(chip: string, flashSize: string, flashId?: string): string {
        const now = new Date();
        const date = now.toISOString().split('T')[0].replace(/-/g, '.');
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '.');
        // Sanitize chip name (remove spaces and special chars)
        const sanitizedChip = chip.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        // Sanitize flash size (remove spaces, convert to MB notation)
        const sanitizedSize = flashSize.replace(/\s+/g, '');
        // Sanitize flash ID (remove spaces and special chars)
        const sanitizedFlashId =
            flashId && flashId !== 'Unknown' && flashId !== 'undefined'
                ? flashId.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')
                : '';

        if (sanitizedFlashId) {
            return `dump_${sanitizedChip}_${sanitizedSize}_${sanitizedFlashId}_${date}_${time}.bin`;
        }
        return `dump_${sanitizedChip}_${sanitizedSize}_${date}_${time}.bin`;
    }

    // Parse flash address
    function parseFlashAddress(address: string): number {
        if (address.startsWith('0x') || address.startsWith('0X')) {
            return parseInt(address, 16);
        } else {
            return parseInt(address, 10);
        }
    }

    // Validate flash address format
    function isValidFlashAddress(address: string): boolean {
        if (!address || address.trim() === '') return false;

        const trimmed = address.trim();

        // Check hex format (0x...)
        if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
            const hexPart = trimmed.substring(2);
            return /^[0-9A-Fa-f]*$/.test(hexPart) && hexPart.length > 0;
        }

        // Check decimal format (only digits)
        return /^[0-9]+$/.test(trimmed);
    }

    // Sanitize address input
    function sanitizeAddress(address: string): string {
        const trimmed = address.trim();

        // If it starts with 0x, ensure only hex digits
        if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
            const hexPart = trimmed.substring(2).replace(/[^0-9A-Fa-f]/g, '');
            return hexPart ? `0x${hexPart}` : '0x0';
        }

        // For decimal, keep only digits
        const decimalPart = trimmed.replace(/[^0-9]/g, '');
        return decimalPart || '0';
    }

    return {
        connectToPort,
        getDeviceInfo,
        flashFiles,
        readFlashMemory,
        resetPort,
        getCurrentPort,
        getBaudrateOptions,
        generateDumpFilename,
        parseFlashAddress,
        isValidFlashAddress,
        sanitizeAddress
    };
}
