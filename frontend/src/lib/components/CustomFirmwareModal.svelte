<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ as locales } from 'svelte-i18n';

	export let isOpen = false;
	export let onClose = () => {};

	let selectedFile: File | null = null;
	let isFlashing = false;
	let flashProgress = 0;
	let flashStatus = '';
	let flashError = '';
	let port: SerialPort | null = null;
	let eraseBeforeFlash = false; // Новый параметр для чекбокса
	let selectedBaudrate = 115200; // Выбранная скорость по умолчанию
	let flashAddress = '0x0'; // Адрес для прошивки по умолчанию

	// Новые переменные для новой логики
	let isPortSelected = false;
	let deviceInfo: any = null; // Информация об устройстве
	let isConnecting = false;
	let showInstructions = false; // Управление спойлером инструкций

	// Опции скорости прошивки
	const baudrateOptions = [
		{ value: 115200, label: `115200 (${$locales('customfirmware.baudrate_standard')})` },
		{ value: 230400, label: '230400' },
		{ value: 460800, label: '460800' },
		{ value: 512000, label: '512000' },
		{ value: 921600, label: `921600 (${$locales('customfirmware.baudrate_fast')})` },
		{ value: 1500000, label: `1500000 (${$locales('customfirmware.baudrate_very_fast')})` }
	];

	// Clean up on unmount
	onDestroy(() => {
		if (port) {
			try {
				if (port.readable) {
					port.close();
				}
			} catch (error) {
				// Port might already be closed or managed by ESPLoader
				console.log('Port cleanup:', error);
			}
		}
	});

	// Handle file selection
	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			selectedFile = input.files[0];
			flashError = '';
		}
	}

	// Handle drag and drop
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			selectedFile = event.dataTransfer.files[0];
			flashError = '';
		}
	}

	// Connect to serial port
	async function connectToPort(): Promise<boolean> {
		try {
			if ('serial' in navigator) {
				// Just request port, don't open it here - ESPLoader will open it
				port = await (navigator as any).serial.requestPort();
				return true;
			} else {
				flashError = 'Web Serial API not supported in this browser';
				return false;
			}
		} catch (error) {
			flashError = `Failed to connect: ${error}`;
			return false;
		}
	}

	// Select and analyze port
	async function selectPort() {
		isConnecting = true;
		flashStatus = 'Selecting port...';
		flashError = '';

		try {
			if ('serial' in navigator) {
				// Request port
				port = await (navigator as any).serial.requestPort();

				if (port) {
					flashStatus = 'Connecting to device...';

					// Get device info
					const deviceDetected = await getDeviceInfo();

					if (deviceDetected) {
						isPortSelected = true;
						flashStatus = 'Device connected successfully';
					} else {
						// Device detection failed
						isPortSelected = false;
						port = null; // Reset port
						// flashError is already set in getDeviceInfo
					}
				}
			} else {
				flashError = 'Web Serial API not supported in this browser';
			}
		} catch (error) {
			flashError = `Failed to connect: ${error}`;
		} finally {
			isConnecting = false;
		}
	}

	// Get device information - returns true if successful
	async function getDeviceInfo(): Promise<boolean> {
		if (!port) return false;

		try {
			// Import ESPLoader
			const { ESPLoader, Transport, LoaderOptions } = await import('esptool-js');

			// Create transport and store for reuse
			transport = new Transport(port, true);

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

			deviceInfo = {
				chip: chipName,
				flashSize: flashSize,
				mac: mac,
				features: features,
				crystal: crystal,
				revision: revision,
				flashId: flashId,
				baudrate: selectedBaudrate
			};

			// Clean up
			await esploader.after();
			// Don't close the port - keep it open for flashing
			console.log('Device detection completed, port kept open for flashing');

			return true; // Success

		} catch (error: any) {
			console.error('Failed to get device info:', error);
			deviceInfo = null; // Reset device info on error
			flashError = `Failed to detect device: ${error.message || error.toString()}`;
			return false; // Failure
		}
	}

	// Store esploader instance for reuse
	let esploader: any = null;
	let transport: any = null;

	// Reset file selection for flashing another file
	function resetForAnotherFlash() {
		selectedFile = null;
		flashProgress = 0;
		flashStatus = '';
		flashError = '';
		eraseBeforeFlash = false;
		flashAddress = '0x0';
	}

	// Reset port only (when user clicks disconnect)
	async function resetPort() {
		isFlashing = false;
		flashProgress = 0;
		flashStatus = '';
		flashError = '';
		isPortSelected = false;
		deviceInfo = null;
		eraseBeforeFlash = false;

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

	// Reset everything when modal closes
	async function resetState() {
		selectedFile = null;
		flashAddress = '0x0';

		// Reset port using the dedicated function
		await resetPort();
	}

	// Flash firmware
	async function flashFirmware() {
		if (!selectedFile) {
			flashError = 'Please select a firmware file';
			return;
		}

		if (!isPortSelected || !port) {
			flashError = 'Please select a port first';
			return;
		}

		isFlashing = true;
		flashProgress = 0;
		flashStatus = 'Starting flash process...';
		flashError = '';

		try {
			// Port is already selected and device info retrieved

			flashStatus = 'Reading firmware file...';

			// Read file content как в примере
			const firmware = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = (event) => {
					const result = event.target?.result as string;
					resolve(result);
				};
				reader.onerror = () => {
					reject(new Error('Failed to read file'));
				};
				reader.readAsBinaryString(selectedFile);
			});

			flashStatus = 'Starting flash process...';
			flashProgress = 10;

			console.log('Firmware size:', firmware.length);

			// Check if we have esploader from device detection
			if (!esploader || !transport) {
				flashError = 'Device not properly detected. Please disconnect and reconnect.';
				isFlashing = false;
				return;
			}

			console.log('Using existing esploader and transport for flashing');

			flashStatus = 'Preparing to flash...';
			flashProgress = 20;

			try {
				const chipName = deviceInfo?.chip || 'ESP32';
				flashStatus = `Ready to flash ${chipName}...`;
				flashProgress = 40;

				// Only erase flash if checkbox is checked
				if (eraseBeforeFlash) {
					flashStatus = `Erasing flash...`;
					await esploader.eraseFlash();
					console.log('Full device erase performed (checkbox checked)');
				} else {
					console.log('Skipping flash erase (checkbox unchecked)');
				}
			} catch (stepError) {
				console.error('Error during erase step:', stepError);
				throw stepError;
			}

			flashStatus = 'Writing firmware...';
			flashProgress = 60;

			// Parse flash address
			let address = 0x0;
			try {
				// Handle both decimal and hex input
				if (typeof flashAddress === 'string') {
					if (flashAddress.startsWith('0x') || flashAddress.startsWith('0X')) {
						address = parseInt(flashAddress, 16);
					} else {
						address = parseInt(flashAddress, 10);
					}
				} else {
					address = flashAddress;
				}

				// Validate address range
				if (isNaN(address) || address < 0) {
					throw new Error('Invalid address');
				}

				console.log(`Using flash address: 0x${address.toString(16).toUpperCase()} (${address})`);
			} catch (error) {
				flashError = `Invalid flash address: ${flashAddress}. Please enter a valid address (e.g., 0x0, 0x1000, 4096)`;
				isFlashing = false;
				return;
			}

			// Write firmware using proper FlashOptions
			const flashOptions: FlashOptions = {
				fileArray: [
					{
						data: firmware,
						address: address
					}
				],
				flashMode: 'keep', // Оставить текущий режим
				flashFreq: 'keep', // Оставить текущую частоту
				flashSize: 'keep', // Оставить текущий размер флеш-памяти
				eraseAll: eraseBeforeFlash, // Использовать значение из чекбокса
				compress: true,
				reportProgress: (fileIndex, written, total) => {
					const progress = Math.round((written / total) * 100);
					flashProgress = 60 + Math.round(progress * 0.4); // 60-100%
					flashStatus = `Writing firmware... ${progress}%`;
					console.log(`Progress: ${written}/${total} bytes`);
				}
			} as FlashOptions;


			console.log('Flash options:', flashOptions);
			console.log('Starting write flash...');

			// Простая запись как в примере
			console.log('Starting writeFlash...');
			await esploader.writeFlash(flashOptions);
			console.log('writeFlash completed successfully');

			flashStatus = 'Finalizing...';
			flashProgress = 90;

			console.log('Starting after() call...');
			// Call after to reset the chip
			await esploader.after();
			console.log('after() completed successfully');

			flashStatus = 'Firmware flashed successfully!';
			flashProgress = 100;

			// ESPLoader manages port automatically, no need to manually close
			// Modal remains open for user to see results
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
				flashError = `Device not in bootloader mode. Please put your device in download mode:\n• ESP32/ESP8266: Hold BOOT/FLASH button, press RESET, release RESET, then release BOOT\n• ESP32-S2/S3: Double-tap RESET button\n• Alternative: Hold BOOT button while connecting USB\n\nThen try flashing again.`;
			} else {
				flashError = `Flash failed: ${errorMessage}`;
			}

			// ESPLoader handles port cleanup automatically
			port = null; // Reset port reference
		} finally {
			isFlashing = false;
		}
	}

	
	// Close modal
	async function handleClose() {
		if (!isFlashing) {
			onClose();
			await resetState();
		}
	}

	// Format file size
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
		<div
			class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-orange-600 bg-gray-800"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<h2 class="text-xl font-semibold text-orange-200">
					{$locales('customfirmware.flash_custom_firmware')}
				</h2>
				<button
					on:click={async () => await handleClose()}
					disabled={isFlashing}
					class="text-gray-400 transition-colors hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-6">
				<!-- Headers Row -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
					<div>
						<label class="block text-sm font-medium text-orange-300">
							{$locales('customfirmware.select_port')}
						</label>
					</div>
					<div>
						<label class="block text-sm font-medium text-orange-300">
							{$locales('customfirmware.select_firmware_file')}
						</label>
					</div>
				</div>

				<!-- Selection Fields Row -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<!-- Port Selection Field -->
					<div class="h-[100px]">
						{#if !isPortSelected}
							<button
								on:click={selectPort}
								disabled={isConnecting || isFlashing}
								class="w-full h-full rounded-lg border-2 border-dashed border-gray-600 p-4 text-center transition-colors hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#if isConnecting}
									<div class="space-y-2">
										<div class="text-2xl animate-spin">⏳</div>
										<div class="text-sm text-orange-200">{$locales('customfirmware.connecting')}</div>
									</div>
								{:else}
									<div class="space-y-2">
										<div class="text-2xl">🔌</div>
										<div class="text-sm text-orange-200">
											{$locales('customfirmware.click_to_select_port')}
										</div>
									</div>
								{/if}
							</button>
						{:else}
							<!-- Port selected -->
							<div class="h-full rounded-lg border border-gray-600 bg-gray-800 p-4 relative">
								<div class="flex flex-col h-full">
									<div class="flex items-center justify-between mb-2">
										<div class="flex items-center space-x-2">
											<div class="text-lg">✅</div>
											<div class="text-sm font-medium text-green-400">
												{$locales('customfirmware.port_connected')}
											</div>
										</div>
									</div>
									{#if deviceInfo}
										<div class="text-xs text-gray-400">
											<div><strong>Device:</strong> {deviceInfo.chip}</div>
											{#if deviceInfo.flashSize !== 'Unknown'}
												<div><strong>Flash:</strong> {deviceInfo.flashSize}</div>
											{/if}
										</div>
									{/if}
								</div>
								<button
									on:click={async () => await resetPort()}
									disabled={isFlashing}
									class="absolute top-2 right-2 text-xs text-gray-400 transition-colors hover:text-red-400 disabled:cursor-not-allowed"
								>
									{$locales('customfirmware.disconnect')}
								</button>
							</div>
						{/if}
					</div>

					<!-- File Selection Field -->
					<div class="h-[100px]">

						<!-- Drag & Drop Area - always enabled -->
							<div
								class="w-full h-full rounded-lg p-4 text-center transition-colors hover:border-orange-500 cursor-pointer flex flex-col justify-center {selectedFile ? 'border border-gray-600 bg-gray-800' : 'border-2 border-dashed border-gray-600'}"
								on:dragover={handleDragOver}
								on:drop={handleDrop}
								on:click={() => document.getElementById('file-input')?.click()}
							>
								{#if selectedFile}
									<div class="space-y-2">
										<div class="text-2xl">📄</div>
										<div class="text-sm font-medium text-orange-200 truncate">{selectedFile.name}</div>
										<div class="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</div>
									</div>
								{:else}
									<div class="space-y-2">
										<div class="text-2xl">📁</div>
										<div class="text-sm text-orange-200">
											{$locales('customfirmware.drag_drop_file')}
										</div>
										<div class="text-xs text-gray-400">
											{$locales('customfirmware.or_click_to_select')}
										</div>
									</div>
								{/if}
							</div>

							<!-- Hidden file input -->
							<input
								id="file-input"
								type="file"
								accept=".bin,.hex,.elf"
								on:change={handleFileSelect}
								class="hidden"
						/>
					</div>
				</div>

				<!-- Device Info Card (show when port is selected) -->

				<!-- Flash Options Row - always show this row, but individual fields depend on conditions -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<!-- Left: Baudrate selector (show when port is selected) -->
					{#if isPortSelected}
						<div>
							<label for="baudrate-select" class="block text-sm font-medium text-gray-300 mb-1">
								{$locales('customfirmware.baudrate_label')}
							</label>
							<select
								id="baudrate-select"
								bind:value={selectedBaudrate}
								disabled={isFlashing}
								class="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#each baudrateOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					{:else}
						<!-- Empty space when no port selected -->
						<div></div>
					{/if}

					<!-- Right: Flash Address Input (show when file is selected) -->
					{#if selectedFile}
						<div>
							<label for="flash-address" class="block text-sm font-medium text-gray-300 mb-1">
								Flash Address
							</label>
							<input
								id="flash-address"
								type="text"
								bind:value={flashAddress}
								placeholder="0x0"
								disabled={isFlashing}
								class="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
					{:else}
						<!-- Empty space when no file selected -->
						<div></div>
					{/if}
				</div>

				<!-- Erase before flash checkbox (show when port is selected) -->
				{#if isPortSelected}
					<div class="flex items-center space-x-2 mb-4">
						<input
							type="checkbox"
							id="erase-before-flash"
							bind:checked={eraseBeforeFlash}
							class="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
						/>
						<label for="erase-before-flash" class="cursor-pointer text-sm text-gray-300">
							{$locales('customfirmware.erase_before_flash')}
						</label>
					</div>
				{/if}

				<!-- Flash Status -->
				{#if isFlashing || flashStatus || flashError}
					<div class="space-y-2">
						<div class="text-sm font-medium text-orange-300">
							{$locales('customfirmware.status')}
						</div>

						{#if flashError}
							<div class="rounded-md border border-red-700 bg-red-900 p-3">
								<div class="text-sm text-red-200">{flashError}</div>
							</div>
						{:else}
							<div class="rounded-md bg-gray-700 p-3">
								<div class="text-sm text-orange-200">{flashStatus}</div>

								{#if isFlashing}
									<div class="mt-2">
										<div class="h-2 w-full rounded-full bg-gray-600">
											<div
												class="h-2 rounded-full bg-orange-500 transition-all duration-300"
												style="width: {flashProgress}%"
											></div>
										</div>
										<div class="mt-1 text-xs text-gray-400">{flashProgress}%</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Instructions Spoiler -->
				<div class="space-y-2">
					<button
						on:click={() => showInstructions = !showInstructions}
						class="flex items-center space-x-2 text-sm font-medium text-orange-300 hover:text-orange-200 transition-colors"
					>
						<span>{$locales('customfirmware.instructions_title')}</span>
						<span class="text-xs">{showInstructions ? '▼' : '▶'}</span>
					</button>

					{#if showInstructions}
						<div class="space-y-2">
							<ol class="list-inside list-decimal space-y-1 text-xs text-gray-400">
								<li>{$locales('customfirmware.step1_connect')}</li>
								<li>
									{$locales('customfirmware.put_device_download')}
								</li>
								<li>{$locales('customfirmware.step2_select')}</li>
								<li>{$locales('customfirmware.step3_flash')}</li>
							</ol>
							<div
								class="mt-2 rounded-md border border-yellow-700/50 bg-yellow-900/20 p-2 text-xs text-yellow-400"
							>
								⚠️ {$locales('customfirmware.important_device_bootloader')}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="flex justify-end space-x-3 border-t border-gray-700 p-6">
				<button
					on:click={async () => await handleClose()}
					disabled={isFlashing}
					class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{$locales('common.cancel')}
				</button>

				{#if flashProgress === 100 && flashStatus.includes('successfully')}
					<!-- Show Flash Another button after successful flash -->
					<button
						on:click={resetForAnotherFlash}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
					>
						Flash Another File
					</button>
				{:else}
					<button
						on:click={flashFirmware}
						disabled={!selectedFile || !isPortSelected || isFlashing}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isFlashing}
							{$locales('customfirmware.flashing')}...
						{:else}
							{$locales('customfirmware.flash_firmware')}
						{/if}
					</button>
				{/if}
			</div>
      {#if isPortSelected && deviceInfo}
        <div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <div class="text-sm font-medium text-orange-300 mb-3">Device Information</div>
          <div class="text-xs text-gray-400 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#if deviceInfo.chip !== 'Unknown'}
              <div><strong>Chip:</strong> {deviceInfo.chip}</div>
            {/if}
            {#if deviceInfo.revision !== 'Unknown'}
              <div><strong>Revision:</strong> {deviceInfo.revision}</div>
            {/if}
            {#if deviceInfo.features !== 'Unknown'}
              <div><strong>Features:</strong> {deviceInfo.features}</div>
            {/if}
            {#if deviceInfo.crystal !== 'Unknown'}
              <div><strong>Crystal:</strong> {deviceInfo.crystal}</div>
            {/if}
            {#if deviceInfo.flashId !== 'Unknown'}
              <div><strong>Flash ID:</strong> {deviceInfo.flashId}</div>
            {/if}
            {#if deviceInfo.flashSize !== 'Unknown'}
              <div><strong>Flash Size:</strong> {deviceInfo.flashSize}</div>
            {/if}
            {#if deviceInfo.mac !== 'Unknown'}
              <div><strong>MAC:</strong> {deviceInfo.mac}</div>
            {/if}
          </div>
        </div>
      {/if}
		</div>
	</div>
{/if}
