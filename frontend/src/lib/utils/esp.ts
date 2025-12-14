import type { ESPDeviceInfo, FlashProgress, FlashOptions, FirmwareFile, FirmwareMetadata, FlashAddressResult } from '$lib/types';

// Constants for flash addresses
const FIRMWARE_OFFSET = '0x00';
const UPDATE_OFFSET = '0x10000';
const DEFAULT_OTA_OFFSET = '0x260000';
const DEFAULT_SPIFFS_OFFSET = '0x300000';

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
 * Determine flash address for firmware file based on filename, metadata, and chip name
 * Works even without metadata by using filename patterns and chip detection
 */
export function getMeshtasticFlashAddress(filename: string, metadata: FirmwareMetadata | null, chipName?: string): FlashAddressResult | null {
	if (!filename) return null;

	const basename = filename.toLowerCase();

	// Rule 1: Factory firmware files - address 0x00
	if (basename.includes('factory.bin')) {
		return {
			address: FIRMWARE_OFFSET,
			type: 'firmware',
			description: 'Factory firmware - full installation'
		};
	}

	// Rule 2: Update files (non-factory .bin) - address 0x10000
	if (basename.endsWith('.bin') && !basename.includes('factory.bin') &&
		!basename.includes('bleota') && !basename.includes('littlefs') && !basename.includes('spiffs')) {
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

		// Priority order: metadata > chipName > filename > default

		// 1. Use metadata if available (highest priority)
		if (metadata) {
			description = `OTA firmware for ${metadata.mcu}`;
			otaOffset = getOtaOffsetFromMetadata(metadata);
		}
		// 2. Use detected chip name if no metadata
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
		// 3. Try to determine MCU type from filename (lower priority)
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

		// Use metadata if available for precise info
		if (metadata) {
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
function getSpiffsOffsetFromMetadata(metadata: FirmwareMetadata): string {
	const spiffsPartition = metadata.part.find((p: any) => p.subtype === 'spiffs');
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

	// Find factory firmware filename
	const factoryFirmwareFile = metadata.files.find((file: any) =>
		file.name.includes('.factory.bin')
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

export function createESPManager() {
	let port: SerialPort | null = null;
	let esploader: any = null;
	let transport: any = null;

	// Baudrate options
	const baudrateOptions = [
		{ value: 115200, label: '115200 (стандартная)' },
		{ value: 230400, label: '230400' },
		{ value: 460800, label: '460800' },
		{ value: 512000, label: '512000' },
		{ value: 921600, label: '921600 (быстрая)' },
		{ value: 1500000, label: '1500000 (очень быстрая)' }
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
			const { ESPLoader, LoaderOptions } = await import('esptool-js');

			// Create transport and store for reuse
			transport = new (await import('esptool-js')).Transport(port, true);

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
			const loaderOptions = {
				transport,
				baudrate: 115200, // Используем стандартную скорость для определения
				terminal: espLoaderTerminal,
				debugLogging: false,
			} as LoaderOptions;

			esploader = new ESPLoader(loaderOptions);

			// Initialize to detect chip - main() returns chip name as string
			const chipName = await esploader.main();
			console.log("Chip detected:", chipName);
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
			const flashSizeMatch = outputText.match(/Auto-detected Flash size:\s*(.+)/);
			if (flashSizeMatch) {
				flashSize = flashSizeMatch[1];
			}

			// Extract flash ID
			const flashIdMatch = outputText.match(/Flash ID:\s*(.+)/);
			if (flashIdMatch) {
				flashId = flashIdMatch[1];
			}

			const deviceInfo: ESPDeviceInfo = {
				chip: chipName,
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

			return deviceInfo;

		} catch (error: any) {
			console.error('Failed to get device info:', error);
			throw new Error(`Failed to detect device: ${error.message || error.toString()}`);
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
			options.onProgress?.({
				progress: 10,
				status: 'Starting flash process...',
				error: ''
			});

			console.log('Firmware size:', firmwareFile.content.length);

			options.onProgress?.({
				progress: 20,
				status: 'Preparing to flash...',
				error: ''
			});

			// Only erase flash if requested
			if (options.eraseBeforeFlash) {
				options.onProgress?.({
					progress: 40,
					status: 'Erasing flash...',
					error: ''
				});
				await esploader.eraseFlash();
				console.log('Full device erase performed (eraseBeforeFlash enabled)');
			} else {
				console.log('Skipping flash erase (eraseBeforeFlash disabled)');
			}

			options.onProgress?.({
				progress: 60,
				status: 'Writing firmware...',
				error: ''
			});

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
				flashMode: 'keep', // Оставить текущий режим
				flashFreq: 'keep', // Оставить текущую частоту
				flashSize: 'keep', // Оставить текущий размер флеш-памяти
				eraseAll: options.eraseBeforeFlash, // Использовать значение из опций
				compress: true,
				reportProgress: (fileIndex: number, written: number, total: number) => {
					const progress = Math.round((written / total) * 100);
					options.onProgress?.({
						progress: 60 + Math.round(progress * 0.4), // 60-100%
						status: `Writing firmware... ${progress}%`,
						error: ''
					});
					console.log(`Progress: ${written}/${total} bytes`);
				}
			};

			console.log('Flash options:', flashOptions);
			console.log('Starting write flash...');

			// Простая запись как в примере
			console.log('Starting writeFlash...');
			await esploader.writeFlash(flashOptions);
			console.log('writeFlash completed successfully');

			options.onProgress?.({
				progress: 90,
				status: 'Finalizing...',
				error: ''
			});

			console.log('Starting after() call...');
			// Call after to reset the chip
			await esploader.after();
			console.log('after() completed successfully');

			options.onProgress?.({
				progress: 100,
				status: 'Firmware flashed successfully!',
				error: ''
			});

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
			console.log('ESPLoader cleanup note:', e.message || e);
		}

		try {
			if (transport && typeof transport.disconnect === 'function') {
				await transport.disconnect();
				console.log('Transport disconnected');
			}
		} catch (e) {
			// Ignore errors if transport is already disconnected
			console.log('Transport disconnect note:', e.message || e);
		}

		// Try to close port directly if still open
		try {
			if (port && port.readable) {
				await port.close();
				console.log('Port closed directly');
			}
		} catch (e) {
			// Port might already be closed, that's ok
			console.log('Port close note:', e.message || e);
		}

		// Reset all references
		port = null;
		esploader = null;
		transport = null;
	}

	// Get current port
	function getCurrentPort(): SerialPort | null {
		return port;
	}

	// Get baudrate options
	function getBaudrateOptions() {
		return baudrateOptions;
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
		resetPort,
		getCurrentPort,
		getBaudrateOptions,
		parseFlashAddress,
		isValidFlashAddress,
		sanitizeAddress
	};
}