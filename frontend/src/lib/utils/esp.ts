import type { ESPDeviceInfo, FlashProgress, FlashOptions, FirmwareFile, FirmwareMetadata, FirmwareMetadataExtended, FlashAddressResult, ValidationError } from '$lib/types.js';
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
	return FULL_FIRMWARE_FILE_TYPES.some(type => lowerFilename.includes(type));
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
function detectMetadataFormat(metadata: FirmwareMetadataExtended): 'manifest' | 'legacy' | 'unknown' {
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
		if (partType === 'firmware' && (lowerFilename.includes('firmware') || lowerFilename.includes('factory') || lowerFilename.includes('merged'))) {
			return { ...part, partType };
		}

		if ((partType === 'ota' && lowerFilename.includes('bleota')) ||
			(partType === 'filesystem' && (lowerFilename.includes('littlefs') || lowerFilename.includes('spiffs')))) {
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
	FULL_FIRMWARE,      // factory.bin, merged.bin, dump_*.bin
	UPDATE_FIRMWARE,    // firmware*.bin (не factory/merged)
	OTA_FIRMWARE,       // bleota*.bin
	FILESYSTEM,         // littlefs*.bin, spiffs*.bin
	BOOTLOADER,         // bootloader.bin
	PARTITIONS,         // partitions.bin
	NVS_DATA,           // nvs.bin
	OTADATA_DATA,       // otadata.bin
	PHY_DATA,           // phy_init.bin
	UNKNOWN             // неизвестный тип
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
	if (lowerName.includes('factory.bin') ||
		lowerName.includes('merged.bin') ||
		(lowerName.startsWith('dump_') && lowerName.endsWith('.bin'))) {
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
			const appPartition = (metadata as any).part.find((p: any) =>
				p.subtype === 'ota_0' && p.type === 'app'
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
function findBestMatch(
	type_val: number,
	subtypes: number[],
	table: PartitionTable
): number | null {
	const matches = table.entries.filter(entry =>
		entry.type_val === type_val && subtypes.includes(entry.subtype)
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
	if (fileType === FirmwareFileType.BOOTLOADER ||
		fileType === FirmwareFileType.PARTITIONS) {
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
			return { address: 0xF000, description: 'OTA data file' };

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
		return metadataResult;
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
				description: getDescriptionForFileType(fileType)
			};
		}
		console.log(`[Address determination] ${filename}: partitions.bin - no match (fileType=${FirmwareFileType[fileType]})`);
	}

	// Step 4: Fallback to filename patterns
	const patternResult = getAddressFromClassPatterns(fileType);
	if (patternResult !== null) {
		logAddressDetermination(filename, 'filename pattern');
		return {
			address: `0x${patternResult.address.toString(16).toUpperCase()}`,
			type: getTypeFromFileType(fileType),
			description: patternResult.description
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
		FULL_FIRMWARE_FILE_TYPES.some(type => file.name.includes(type))
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
	const filesystemFile = metadata.files.find((file: any) =>
		file.name.includes('littlefs-') || file.name.includes('spiffs')
	);
	const filesystemFilename = filesystemFile ? filesystemFile.name : getFilesystemFilename(firmwareFilename);

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
): { isValid: boolean; errorCode?: ValidationError; conflictingFiles?: string[]; errorMessage?: string } {
	const hasRegularFirmware = files.some(file => isRegularFirmwareFile(file.filename));
	const hasFactoryFirmware = files.some(file => isFullFirmwareFile(file.filename));

	// Check chip compatibility if metadata and device info are available

	if (metadata && deviceChip && (metadata as any).builds && (metadata as any).builds.length > 0) {
		// Find a build in the manifest that matches the device chip family
		// Direct string comparison to match device chip family
		const matchingBuild = (metadata as any).builds.find((build: any) => build.chipFamily === deviceChip);

		console.log('Chip compatibility check:', {
			deviceChip,
			availableChips: (metadata as any).builds.map((b: any) => b.chipFamily),
			matchingBuild: matchingBuild ? matchingBuild.chipFamily : null
		});

		if (!matchingBuild) {
			// No matching build found - chip not supported
			const supportedChips = (metadata as any).builds.map((b: any) => b.chipFamily).join(', ');
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
			.filter(file =>
				isRegularFirmwareFile(file.filename) || // regular firmware
				isFullFirmwareFile(file.filename) // full firmware (factory, merged, etc.)
			)
			.map(file => file.filename);

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

	// Get device information
	async function getDeviceInfo(): Promise<ESPDeviceInfo | null> {
		if (!port) return null;

		try {
			// Import ESPLoader
			const { ESPLoader } = await import('esptool-js');
			type LoaderOptions = any; // Define LoaderOptions as any since it's not exported from esptool-js

			// Create transport and store for reuse (disable trace logging)
			transport = new (await import('esptool-js')).Transport(port, false);

			// Monkey patch trace() method to respect tracing flag
			// The original implementation always logs regardless of the tracing flag
			transport.trace = function(message: string) {
				if (this.tracing) {
					const delta = Date.now() - (this as any).lastTraceTime;
					const prefix = `TRACE ${delta.toFixed(3)}`;
					const traceMessage = `${prefix} ${message}`;
					console.log(traceMessage);
					(this as any).traceLog += traceMessage + "\n";
				}
			};

			// Create terminal and collect all output
			const terminalOutput: string[] = [];
			const espLoaderTerminal = {
				clean() {
					// console.clear();
				},
				writeLine(data: string) {
					terminalOutput.push(data);
				},
				write(data: string) {
					terminalOutput.push(data);
				}
			};

			// Create ESPLoader with minimal options
			const loaderOptions: any = {
				transport,
				baudrate: 115200, // Use standard speed for detection
				terminal: espLoaderTerminal,
				debugLogging: false,
				enableTracing: false, // Disable TRACE logs
			};

			esploader = new ESPLoader(loaderOptions);

			// Initialize to detect chip - main() returns chip name as string
			const chipName = await esploader.main();
			// Also get chip name from esploader.chip.CHIP_NAME
			let espChipName = esploader.chip?.CHIP_NAME || chipName;
			// Remove revision info from chip name (e.g., "ESP32-C6 (revision 2)" -> "ESP32-C6")
			espChipName = espChipName.replace(/\s*\(revision.*\)$/, '').trim();
			console.log("Chip detected:", chipName);
			console.log("ESP chip name (normalized):", espChipName);
			console.log("Terminal output:", terminalOutput);

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
				mac = await esploader.chip.readMac(esploader);
			} catch (error) {
				console.warn('Failed to get MAC from ROM API:', error);
				const macMatch = outputText.match(/MAC:\s*([0-9A-Fa-f:]+)/);
				if (macMatch) mac = macMatch[1];
			}

			// Get chip features using ROM API
			try {
				features = await esploader.chip.getChipFeatures(esploader);
			} catch (error) {
				console.warn('Failed to get features from ROM API:', error);
				const featuresMatch = outputText.match(/Features:\s*(.+)/);
				if (featuresMatch) features = featuresMatch[1];
			}

			// Get crystal frequency using ROM API
			try {
				const crystalFreq = await esploader.chip.getCrystalFreq(esploader);
				crystal = `${crystalFreq}MHz`;
			} catch (error) {
				console.warn('Failed to get crystal from ROM API:', error);
				const crystalMatch = outputText.match(/Crystal is (\d+)MHz/);
				if (crystalMatch) crystal = `${crystalMatch[1]}MHz`;
			}

			// Get chip revision using ROM API
			try {
				if (esploader.chip.getChipRevision) {
					revision = await esploader.chip.getChipRevision(esploader);
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

			// Detect flash size using esploader's getFlashSize()
			// This is more reliable than parsing terminal output, especially when PSRAM is present
			try {
				const flashSizeNum = await esploader.getFlashSize();
				// getFlashSize() returns KB, convert to string format (e.g., 4096 -> "4MB", 8192 -> "8MB")
				if (flashSizeNum && flashSizeNum > 0) {
					if (flashSizeNum >= 1024) {
						flashSize = `${flashSizeNum / 1024}MB`;
					} else {
						flashSize = `${flashSizeNum}KB`;
					}
				} else {
					flashSize = 'Unknown';
				}
				console.log('Detected flash size via getFlashSize():', flashSize);
			} catch (error) {
				console.warn('Failed to detect flash size using getFlashSize():', error);
				// Fallback to parsing terminal output if getFlashSize fails
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
				flashSize: flashSize,  // May be 'Unknown' if detection failed
				psramSize: psramSize,  // undefined if no PSRAM
				mac: mac,
				features: features,
				crystal: crystal,
				revision: revision,
				flashId: flashId,
				baudrate: 115200
			};


			// Clean up
			await esploader.after();
			// Don't close the port - keep it open for flashing
			console.log('Device detection completed, port kept open for flashing');
			console.log(`Final device chip: ${espChipName} (was: ${chipName})`);

			return deviceInfo;

		} catch (error: any) {
			console.error('Failed to get device info:', error);
			throw new Error(`Failed to detect device: ${error.message || error.toString()}`);
		}
	}

	// Erase flash memory
	async function eraseFlash(options: { onProgress?: (progress: FlashProgress) => void } = {}): Promise<void> {
		if (!esploader) {
			throw new Error('ESP loader not initialized. Please connect to device first.');
		}

		try {
			options.onProgress?.({
				progress: 0,
				status: 'Erasing flash...',
				error: ''
			});

			await esploader.eraseFlash();
			console.log('Flash erase completed successfully');

			options.onProgress?.({
				progress: 100,
				status: 'Flash erased successfully',
				error: ''
			});
		} catch (error) {
			console.error('Erase error:', error);
			throw new Error(`Erase failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Read flash memory
	async function readFlashMemory(
		sizeBytes: number,
		options: {
			onProgress?: (progress: FlashProgress) => void;
			abortSignal?: AbortSignal;
		} = {}
	): Promise<{ data: Uint8Array; flashId: string }> {
		if (!esploader) {
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

			console.log(`Reading ${sizeBytes} bytes from flash memory...`);

			// Read flash ID first
			let flashId = 'Unknown';
			try {
				// Check if aborted before reading flash ID
				if (options.abortSignal?.aborted) {
					throw new Error('Backup cancelled');
				}

				const flashIdResult = await esploader.flashId();
				flashId = typeof flashIdResult === 'object' ? JSON.stringify(flashIdResult) : String(flashIdResult);
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
			const flashData = await esploader.readFlash(0x0, sizeBytes, (packet: Uint8Array, bytesRead: number, totalSize: number) => {
				// Check if aborted during read
				if (options.abortSignal?.aborted) {
					throw new Error('Backup cancelled');
				}

				const progress = Math.round((bytesRead / totalSize) * 100);
				console.log(`Read progress: ${bytesRead}/${totalSize} bytes (${progress}%)`);
				options.onProgress?.({
					progress: progress,
					status: `Reading flash memory... ${progress}%`,
					error: ''
				});
			});

			console.log(`Flash read completed successfully. Total bytes: ${flashData.length}`);

			options.onProgress?.({
				progress: 100,
				status: 'Flash memory read completed',
				error: ''
			});

			return { data: flashData, flashId };
		} catch (error) {
			console.error('Flash read error:', error);
			throw new Error(`Flash read failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Flash firmware
	async function flashFirmware(firmwareFile: FirmwareFile, options: FlashOptions): Promise<void> {
		if (!port) {
			throw new Error('No port selected');
		}

		if (!esploader || !transport) {
			throw new Error('Device not properly detected. Please disconnect and reconnect.');
		}

		try {
			console.log('Firmware size:', firmwareFile.content.length);

			// Parse flash address
			let address = 0x0;
			try {
				// Handle both decimal and hex input
				if (typeof options.address === 'string') {
					if (options.address.startsWith('0x') || options.address.startsWith('0X')) {
						address = parseInt(options.address, 16);
					} else {
						address = parseInt(options.address, 10);
					}
				} else {
					address = options.address;
				}

				// Validate address range
				if (isNaN(address) || address < 0) {
					throw new Error('Invalid address');
				}

				console.log(`Using flash address: 0x${address.toString(16).toUpperCase()} (${address})`);
			} catch (error) {
				throw new Error(`Invalid flash address: ${options.address}. Please enter a valid address (e.g., 0x0, 0x1000, 4096)`);
			}

			// Write firmware using proper FlashOptions
			const flashOptions = {
				fileArray: [
					{
						data: firmwareFile.content,
						address: address
					}
				],
				flashMode: 'keep', // Keep current mode
				flashFreq: 'keep', // Keep current frequency
				flashSize: 'keep', // Keep current flash size
				eraseAll: false, // Erase is now handled separately
				compress: true,
				reportProgress: (fileIndex: number, written: number, total: number) => {
					const progress = Math.round((written / total) * 100);
					options.onProgress?.({
						progress: progress, // 0-100%
						status: `Writing firmware... ${progress}%`,
						error: ''
					});
					console.log(`Progress: ${written}/${total} bytes`);
				}
			};

			console.log('Flash options:', flashOptions);
			console.log('Starting write flash...');

			// Simple write as in example
			console.log('Starting writeFlash...');
			await esploader.writeFlash(flashOptions);
			console.log('writeFlash completed successfully');

			console.log('Starting after() call...');
			// Call after to reset the chip
			await esploader.after();
			console.log('after() completed successfully');

		} catch (error) {
			console.error('Flash error:', error);
			console.error(
				'Error stack:',
				error instanceof Error ? error.stack : 'No stack trace available'
			);
			console.error('Error details:', {
				message: error instanceof Error ? error.message : String(error),
				name: error instanceof Error ? error.name : 'Unknown',
				toString: error ? error.toString() : 'No toString method'
			});

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

			// ESPLoader handles port cleanup automatically
			port = null; // Reset port reference
		}
	}

	// Reset port and cleanup
	async function resetPort(): Promise<void> {
		// Cleanup order: esploader first, then transport, then port
		try {
			if (esploader) {
				await esploader.after();
				console.log('ESPLoader cleaned up');
			}
		} catch (e) {
			// Ignore errors if port is already closed
			console.log('ESPLoader cleanup note:', (e as any).message || e);
		}

		try {
			if (transport && typeof transport.disconnect === 'function') {
				await transport.disconnect();
				console.log('Transport disconnected');
			}
		} catch (e) {
			// Ignore errors if transport is already disconnected
			console.log('Transport disconnect note:', (e as any).message || e);
		}

		// Try to close port directly if still open
		try {
			if (port && port.readable) {
				await port.close();
				console.log('Port closed directly');
			}
		} catch (e) {
			// Port might already be closed, that's ok
			console.log('Port close note:', (e as any).message || e);
		}

		// Reset all references
		port = null;
		esploader = null;
		transport = null;
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
		const sanitizedFlashId = flashId && flashId !== 'Unknown' && flashId !== 'undefined'
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
		flashFirmware,
		eraseFlash,
		readFlashMemory,
		resetPort,
		getCurrentPort,
		getBaudrateOptions,
		generateDumpFilename,
		parseFlashAddress,
		isValidFlashAddress,
		sanitizeAddress,
		getCurrentBaudrate,
		changeBaudrate
	};

	// Get current baudrate from esploader
	function getCurrentBaudrate(): number {
		return esploader?.baudrate || 115200;
	}

	// Change baudrate in esploader
	async function changeBaudrate(newBaudrate: number): Promise<void> {
		if (!esploader) {
			throw new Error('ESP loader not initialized');
		}

		if (esploader.baudrate !== newBaudrate) {
			esploader.baudrate = newBaudrate;
			await esploader.changeBaud();
		}
	}
}