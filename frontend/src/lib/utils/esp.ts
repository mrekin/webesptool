import type { ESPDeviceInfo, FlashProgress, FlashOptions, FirmwareFile, FirmwareMetadata, FirmwareMetadataExtended, FlashAddressResult, ValidationError } from '$lib/types.js';
import { ValidationErrors } from '$lib/types.js';

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

/**
 * Determine flash address for firmware file based on filename, metadata, and chip name
 * Works even without metadata by using filename patterns and chip detection
 */
export function getMeshtasticFlashAddress(filename: string, metadata: FirmwareMetadataExtended | null, chipName?: string): FlashAddressResult | null {
	if (!filename) return null;

	const basename = filename.toLowerCase();

	// Rule 0: Dump files - address 0x0
	if (basename.startsWith('dump_') && basename.endsWith('.bin')) {
		return {
			address: '0x0',
			type: 'firmware',
			description: 'Memory dump file - restores complete flash memory'
		};
	}

	// Rule 1: Factory firmware files - address 0x0
	if (FULL_FIRMWARE_FILE_TYPES.some(type => basename.includes(type))) {
		// Check manifest first for factory firmware
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			const manifestPart = findManifestPart(filename, metadata);
			if (manifestPart?.partType === 'firmware' && manifestPart.offset === 0) {
				return {
					address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
					type: 'firmware',
					description: `Factory firmware for ${(metadata as any).name || 'device'}. Contains bootloader, partitions, application`
				};
			}
		}

		return {
			address: FIRMWARE_OFFSET,
			type: 'firmware',
			description: 'Factory firmware - full installation'
		};
	}

	// Rule 1.1: Bootloader files - address 0x0
	if (basename.includes('bootloader.bin')) {
		// Check manifest first for factory firmware
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			const manifestPart = findManifestPart(filename, metadata);
			if (manifestPart?.partType === 'firmware' && manifestPart.offset === 0) {
				return {
					address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
					type: 'firmware',
					description: `Bootloader for ${(metadata as any).name || 'device'}`
				};
			}
		}

		return {
			address: BOOTLOADER_OFFSET,
			type: 'firmware',
			description: 'Bootloader file'
		};
	}
	// Rule 1.2: Partition files - address 0x8000
	if (basename.includes('partitions.bin')) {
		// Check manifest first for factory firmware
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			const manifestPart = findManifestPart(filename, metadata);
			if (manifestPart?.partType === 'firmware' && manifestPart.offset === 0) {
				return {
					address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
					type: 'firmware',
					description: `Partitions for ${(metadata as any).name || 'device'}`
				};
			}
		}

		return {
			address: PARTITIONS_OFFSET,
			type: 'firmware',
			description: 'Partitions file'
		};
	}

	// Rule 2: Update files (non-factory .bin) - address from app partition in metadata
	if (basename.endsWith('.bin') && !isFullFirmwareFile(filename) &&
		!basename.includes('bleota') && !basename.includes('littlefs') && !basename.includes('spiffs')) {

		// Use legacy metadata to get app partition address if available
		if (metadata && detectMetadataFormat(metadata) === 'legacy') {
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

		// For manifest with multiple parts: don't use manifest for update firmware
		// Manifest with multiple parts is only for factory installation
		// For single-part manifest: check if it's an update manifest
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			// Only use manifest for update firmware if it has exactly one part
			// and that part is not at offset 0 (factory)
			if ((metadata as any).builds?.[0]?.parts?.length === 1) {
				const singlePart = (metadata as any).builds[0].parts[0];
				if (singlePart.offset !== 0 && classifyManifestPart(singlePart.path) === 'firmware') {
					return {
						address: `0x${singlePart.offset.toString(16).toUpperCase()}`,
						type: 'firmware',
						description: `Update firmware for ${(metadata as any).name || 'device'}`
					};
				}
			}
		}

		// Fallback to default UPDATE_OFFSET if no metadata or app partition found
		return {
			address: UPDATE_OFFSET,
			type: 'firmware',
			description: 'Update firmware - partial installation'
		};
	}

	// Rule 3: OTA files - enhanced logic with chip detection
	if (basename.includes('bleota')) {
		let otaOffset = DEFAULT_OTA_OFFSET;
		let description = 'OTA firmware';

		// Priority order: manifest > legacy metadata > chipName > filename > default

		// 1. Check manifest first (highest priority)
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			const manifestPart = findManifestPart(filename, metadata);
			if (manifestPart?.partType === 'ota') {
				return {
					address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
					type: 'ota',
					description: `OTA firmware for ${(metadata as any).name || 'device'}`
				};
			}
		}

		// 2. Use legacy metadata if available
		if (metadata && detectMetadataFormat(metadata) === 'legacy') {
			description = `OTA firmware for ${(metadata as any).mcu}`;
			otaOffset = getOtaOffsetFromMetadata(metadata as any);
		}
		// 3. Use detected chip name if no metadata
		else if (chipName) {
			const detectedChip = chipName.toLowerCase();
			if (detectedChip.includes('esp32-s3') || detectedChip === 'esp32s3') {
				description = 'OTA firmware for ESP32-S3';
			} else if (detectedChip.includes('esp32-c3') || detectedChip === 'esp32c3') {
				description = 'OTA firmware for ESP32-C3';
			} else if (detectedChip.includes('esp32-c2') || detectedChip === 'esp32c2') {
				description = 'OTA firmware for ESP32-C2';
			} else if (detectedChip.includes('esp32-c5') || detectedChip === 'esp32c5') {
				description = 'OTA firmware for ESP32-C5';
			} else if (detectedChip.includes('esp32-c6') || detectedChip === 'esp32c6') {
				description = 'OTA firmware for ESP32-C6';
			} else if (detectedChip.includes('esp32-s2') || detectedChip === 'esp32s2') {
				description = 'OTA firmware for ESP32-S2';
			} else if (detectedChip.includes('esp32-h2') || detectedChip === 'esp32h2') {
				description = 'OTA firmware for ESP32-H2';
			} else if (detectedChip.includes('esp32-p4') || detectedChip === 'esp32p4') {
				description = 'OTA firmware for ESP32-P4';
			} else if (detectedChip.includes('esp8266')) {
				description = 'OTA firmware for ESP8266';
			} else if (detectedChip.includes('esp32') && !detectedChip.includes('c') && !detectedChip.includes('s') && !detectedChip.includes('h') && !detectedChip.includes('p')) {
				description = 'OTA firmware for ESP32';
			} else {
				description = `OTA firmware for ${chipName}`;
			}
		}
		// 4. Try to determine MCU type from filename (lower priority)
		else if (basename.includes('s3') || basename.includes('esp32s3')) {
			description = 'OTA firmware for ESP32-S3';
		} else if (basename.includes('c3') || basename.includes('esp32c3')) {
			description = 'OTA firmware for ESP32-C3';
		} else if (basename.includes('c2') || basename.includes('esp32c2')) {
			description = 'OTA firmware for ESP32-C2';
		} else if (basename.includes('c5') || basename.includes('esp32c5')) {
			description = 'OTA firmware for ESP32-C5';
		} else if (basename.includes('c6') || basename.includes('esp32c6')) {
			description = 'OTA firmware for ESP32-C6';
		} else if (basename.includes('s2') || basename.includes('esp32s2')) {
			description = 'OTA firmware for ESP32-S2';
		} else if (basename.includes('h2') || basename.includes('esp32h2')) {
			description = 'OTA firmware for ESP32-H2';
		} else if (basename.includes('p4') || basename.includes('esp32p4')) {
			description = 'OTA firmware for ESP32-P4';
		} else if (basename.includes('8266')) {
			description = 'OTA firmware for ESP8266';
		} else {
			description = 'OTA firmware for ESP32';
		}

		return {
			address: otaOffset,
			type: 'ota',
			description: description
		};
	}

	// Rule 4: LittleFS/SPIFFS files - enhanced logic
	if (basename.includes('littlefs') || basename.includes('spiffs')) {
		let spiffsOffset = DEFAULT_SPIFFS_OFFSET;
		let description = 'File system (LittleFS/SPIFFS)';

		// Check manifest first for filesystem
		if (metadata && detectMetadataFormat(metadata) === 'manifest') {
			const manifestPart = findManifestPart(filename, metadata);
			if (manifestPart?.partType === 'filesystem') {
				return {
					address: `0x${manifestPart.offset.toString(16).toUpperCase()}`,
					type: 'filesystem',
					description: `File system for ${(metadata as any).name || 'device'}`
				};
			}
		}

		// Use legacy metadata if available for precise info
		if (metadata && detectMetadataFormat(metadata) === 'legacy') {
			spiffsOffset = getSpiffsOffsetFromMetadata(metadata);
			description = 'File system (LittleFS/SPIFFS)';
		} else {
			description = 'File system (LittleFS/SPIFFS) - default offset';
		}

		return {
			address: spiffsOffset,
			type: 'filesystem',
			description: description
		};
	}

	return null;
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
			let mac = 'Unknown';
			let features = 'Unknown';
			let crystal = 'Unknown';
			let revision = 'Unknown';
			let flashId = 'Unknown';

			// Parse terminal output for detailed info
			const outputText = terminalOutput.join('\n');

			// Extract MAC address
			const macMatch = outputText.match(/MAC:\s*([0-9A-Fa-f:]+)/);
			if (macMatch) mac = macMatch[1];

			// Extract chip info with revision
			const chipMatch = outputText.match(/Chip is (.+) \(revision (.+)\)/);
			if (chipMatch) {
				revision = chipMatch[2];
			}

			// Extract features
			const featuresMatch = outputText.match(/Features:\s*(.+)/);
			if (featuresMatch) features = featuresMatch[1];

			// Extract crystal frequency
			const crystalMatch = outputText.match(/Crystal is (\d+)MHz/);
			if (crystalMatch) crystal = `${crystalMatch[1]}MHz`;

			// Extract flash size
			const flashSizeMatch = outputText.match(/Embedded Flash ([0-9]+MB) /);
			const psramSizeMatch = outputText.match(/Embedded PSRAM ([0-9]+MB) /);
			if (flashSizeMatch) {
				flashSize = flashSizeMatch[1];
			}else if (psramSizeMatch) {
				flashSize = psramSizeMatch[1];
			}
			// Extract flash ID
			const flashIdMatch = outputText.match(/Flash ID:\s*(.+)/);
			if (flashIdMatch) {
				flashId = flashIdMatch[1];
			}

			const deviceInfo: ESPDeviceInfo = {
				chip: espChipName, // Use normalized chip name
				flashSize: flashSize,
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
			onProgress?: (progress: FlashProgress) => void
		} = {}
	): Promise<{ data: Uint8Array; flashId: string }> {
		if (!esploader) {
			throw new Error('ESP loader not initialized. Please connect to device first.');
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
				const flashIdResult = await esploader.flashId();
				flashId = typeof flashIdResult === 'object' ? JSON.stringify(flashIdResult) : String(flashIdResult);
				console.log('Flash ID:', flashId);
			} catch (error) {
				console.warn('Failed to read flash ID:', error);
			}

			// Read entire flash memory from address 0x0
			// esptool-js callback signature: onPacketReceived(packet, bytesRead, totalSize)
			const flashData = await esploader.readFlash(0x0, sizeBytes, (packet: Uint8Array, bytesRead: number, totalSize: number) => {
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