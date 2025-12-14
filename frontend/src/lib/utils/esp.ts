import type { ESPDeviceInfo, FlashProgress, FlashOptions, FirmwareFile } from '$lib/types';

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