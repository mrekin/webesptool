<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ as locales } from 'svelte-i18n';
	import {
		createESPManager,
		getMeshtasticFlashAddress,
		validateFirmwareSelection,
		parseFirmwareMetadata
	} from '$lib/utils/esp';
	import { createFirmwareFileHandler } from '$lib/utils/fileHandler';
	import type { FirmwareFile, FirmwareMetadata, MemorySegment } from '$lib/types';
	import { ValidationErrors } from '$lib/types';
	import MemoryMap from '$lib/components/MemoryMap.svelte';

	export let isOpen = false;
	export let onClose = () => {};

	// Create utility instances
	const espManager = createESPManager();
	const fileHandler = createFirmwareFileHandler();

	// Component state
	let selectedFirmwareFiles: { filename: string; address: string; file: FirmwareFile }[] = []; // Multiple files with addresses
	let isFlashing = false;
	let flashProgress = 0;
	let flashStatus = '';
	let flashError = '';
	let eraseBeforeFlash = false; // Новый параметр для чекбокса
	let selectedBaudrate = 115200; // Выбранная скорость по умолчанию

	// Metadata state
	let metadataFile: FirmwareFile | null = null;
	let metadata: FirmwareMetadata | null = null;

	// Новые переменные для новой логики
	let isPortSelected = false;
	let deviceInfo: any = null; // Информация об устройстве
	let isConnecting = false;
	let showInstructions = false; // Управление спойлером инструкций

	// Ссылка на file input для замены document.getElementById
	let fileInput: HTMLInputElement;

	// Get baudrate options from utility
	const baudrateOptions = espManager.getBaudrateOptions().map((opt) => ({
		...opt,
		label:
			opt.value === 115200
				? `115200 (${$locales('customfirmware.baudrate_standard')})`
				: opt.value === 921600
					? `921600 (${$locales('customfirmware.baudrate_fast')})`
					: opt.value === 1500000
						? `1500000 (${$locales('customfirmware.baudrate_very_fast')})`
						: opt.label
	}));

	// Clean up on unmount
	onDestroy(async () => {
		await espManager.resetPort();
	});

	// Helper function to get localized error message
	function getErrorMessage(errorCode?: number): string {
		switch (errorCode) {
			case ValidationErrors.FILES_CONFLICT:
				return $locales('customfirmware.file_conflict_error');
			case ValidationErrors.UNKNOWN_ERROR:
			default:
				return $locales('customfirmware.unknown_validation_error');
		}
	}

	// Handle file selection (unified function for both file selection and drag & drop)
	async function handleFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;

		selectedFirmwareFiles = [];
		metadataFile = null;
		metadata = null;
		flashError = '';

		let metadataFileCount = 0;

		// First pass: count metadata files
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (fileHandler.isMetadataFile(file)) {
				metadataFileCount++;
			}
		}

		// Check for multiple metadata files
		if (metadataFileCount > 1) {
			flashError = 'Only one .mt.json file is allowed';
			return;
		}

		// Second pass: process files
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (fileHandler.isValidFile(file)) {
				if (fileHandler.isMetadataFile(file)) {
					// Handle metadata file
					metadataFile = fileHandler.createFirmwareFile(file);
					try {
						const content = await fileHandler.readFileContent(metadataFile);
						metadata = parseFirmwareMetadata(content);
						if (!metadata) {
							flashError = 'Failed to parse metadata file';
							return;
						}
					} catch (error) {
						flashError = `Error reading metadata file: ${error}`;
						return;
					}
				} else if (fileHandler.isFirmwareFile(file)) {
					// Handle firmware file
					selectedFirmwareFiles.push({
						filename: file.name,
						address: '0x0', // Default address in hex format
						file: fileHandler.createFirmwareFile(file),
						hasError: false,
						errorMessage: ''
					});
				}
			}
		}

		// Always trigger address update when files are selected (works with filename only)
		if (selectedFirmwareFiles.length > 0) {
			updateFlashAddresses();
		}
	}

	// Handle drag and drop
	function handleDragOver(event: DragEvent) {
		fileHandler.handleDragOver(event);
	}

	function handleDrop(event: DragEvent) {
		const files = fileHandler.handleDropMultiple(event);
		if (!files || files.length === 0) return;

		// Convert File array to FileList-like object for unified processing
		const fileList = files as unknown as FileList;
		handleFileSelect(fileList);
	}

	// Wrapper for file input change event
	function handleFileInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		handleFileSelect(target.files);
	}

	// Remove file from flashing list
	function removeFile(index: number) {
		selectedFirmwareFiles = selectedFirmwareFiles.filter((_, i) => i !== index);
		flashError = '';
	}

	// Connect to serial port
	async function connectToPort(): Promise<boolean> {
		try {
			return await espManager.connectToPort();
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
			const connected = await espManager.connectToPort();

			if (connected) {
				flashStatus = 'Connecting to device...';

				// Get device info
				const detectedDeviceInfo = await espManager.getDeviceInfo();

				if (detectedDeviceInfo) {
					isPortSelected = true;
					deviceInfo = detectedDeviceInfo;
					flashStatus = 'Device connected successfully';

					// Update addresses with device info
					if (selectedFirmwareFiles.length > 0) {
						updateFlashAddresses();
					}
				} else {
					// Device detection failed
					isPortSelected = false;
					deviceInfo = null;
					// flashError is already set in getDeviceInfo
				}
			}
		} catch (error) {
			flashError = `Failed to connect: ${error}`;
		} finally {
			isConnecting = false;
		}
	}

	// Reset file selection for flashing another file
	function resetForAnotherFlash() {
		selectedFirmwareFiles = [];
		metadataFile = null;
		metadata = null;
		flashProgress = 0;
		flashStatus = '';
		flashError = '';
		eraseBeforeFlash = false;
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
		metadataFile = null;
		metadata = null;

		await espManager.resetPort();
	}

	// Reset everything when modal closes
	async function resetState() {
		selectedFirmwareFiles = [];
		metadataFile = null;
		metadata = null;

		// Reset port using the dedicated function
		await resetPort();
	}

	// Flash firmware
	async function flashFirmware() {
		// Check if we have firmware files selected (only .bin files)
		if (!selectedFirmwareFile && selectedFirmwareFiles.length === 0) {
			flashError = 'Please select at least one firmware file (.bin)';
			return;
		}

		if (!isPortSelected || !espManager.getCurrentPort()) {
			flashError = 'Please select a port first';
			return;
		}

		// Validate all addresses for multiple files
		if (selectedFirmwareFiles.length > 0) {
			for (let i = 0; i < selectedFirmwareFiles.length; i++) {
				const fileItem = selectedFirmwareFiles[i];
				if (!espManager.isValidFlashAddress(fileItem.address)) {
					flashError = `Invalid address format for file "${fileItem.filename}": ${fileItem.address}. Please enter a valid address (e.g., 0x0, 0x1000, 4096)`;
					return;
				}
			}
		}

		isFlashing = true;
		flashProgress = 0;
		flashStatus = 'Starting flash process...';
		flashError = '';

		try {
			// Handle single file case (backward compatibility)
			if (selectedFirmwareFile) {
				flashStatus = `Reading firmware file: ${selectedFirmwareFile.name}...`;

				// Read file content using utility
				const content = await fileHandler.readFileContent(selectedFirmwareFile);
				const firmwareFile: FirmwareFile = {
					...selectedFirmwareFile,
					content: content
				};

				const flashOptions = {
					baudrate: selectedBaudrate,
					address: flashAddress,
					eraseBeforeFlash: eraseBeforeFlash,
					onProgress: (progress: any) => {
						flashProgress = progress.progress;
						flashStatus = `${selectedFirmwareFile.name} - ${progress.status}`;
						if (progress.error) {
							flashError = progress.error;
						}
					}
				};

				// Use ESP manager to flash firmware
				await espManager.flashFirmware(firmwareFile, flashOptions);
			}
			// Handle multiple files case
			else if (selectedFirmwareFiles.length > 0) {
				// Rule 3: Sort files by flash address before flashing
				const sortedFiles = [...selectedFirmwareFiles].sort((a, b) => {
					const addressA = parseInt(a.address.replace('0x', ''), 16);
					const addressB = parseInt(b.address.replace('0x', ''), 16);
					return addressA - addressB;
				});

				const totalFiles = sortedFiles.length;

				for (let i = 0; i < totalFiles; i++) {
					const fileItem = sortedFiles[i];
					// Reserve space for file completion (5% per file)
					const progressRange = (100 - totalFiles * 5) / totalFiles;
					const progressBase = (i / totalFiles) * (100 - totalFiles * 5);

					// Rule 4: Include flash address in progress status
					flashStatus = `Flashing file ${i + 1}/${totalFiles}: ${fileItem.filename} @ ${fileItem.address}...`;
					flashProgress = Math.round(progressBase);

					// Read file content using utility
					const content = await fileHandler.readFileContent(fileItem.file);
					const firmwareFile: FirmwareFile = {
						...fileItem.file,
						content: content
					};

					const flashOptions = {
						baudrate: selectedBaudrate,
						address: fileItem.address, // Already in hex format
						eraseBeforeFlash: eraseBeforeFlash && i === 0, // Only erase before first file
						onProgress: (progress: any) => {
							// Calculate overall progress combining file progress with current file position
							const overallProgress = progressBase + (progress.progress / 100) * progressRange;
							flashProgress = Math.round(overallProgress);
							// Rule 4: Include flash address in progress status
							flashStatus = `Flashing file ${i + 1}/${totalFiles}: ${fileItem.filename} @ ${fileItem.address} - ${progress.status}`;
							if (progress.error) {
								flashError = progress.error;
							}
						}
					};

					// Use ESP manager to flash firmware
					await espManager.flashFirmware(firmwareFile, flashOptions);

					// Mark file as completed
					flashProgress = Math.round(progressBase + progressRange);
					flashStatus = `Completed file ${i + 1}/${totalFiles}: ${fileItem.filename} @ ${fileItem.address}`;
				}

				flashStatus = 'All files flashed successfully!';
				flashProgress = 100;
			}
		} catch (error) {
			console.error('Flash error:', error);
			flashError = error instanceof Error ? error.message : String(error);
		} finally {
			isFlashing = false;
		}
	}

	// Update flash addresses using metadata
	function updateFlashAddresses() {
		if (selectedFirmwareFiles.length === 0) return;

		selectedFirmwareFiles = selectedFirmwareFiles.map((fileItem) => {
			const addressResult = getMeshtasticFlashAddress(
				fileItem.filename,
				metadata,
				deviceInfo?.chip
			);
			if (addressResult) {
				return {
					...fileItem,
					address: addressResult.address
				};
			}
			return fileItem;
		});
	}

	// Helper functions for memory visualization and file handling

	// Parse flash size string (e.g., "4MB", "2GB") to bytes
	function parseFlashSize(flashSizeStr: string): number {
		if (!flashSizeStr || typeof flashSizeStr !== 'string') {
			return 4 * 1024 * 1024; // Default 4MB
		}

		const trimmed = flashSizeStr.trim().toUpperCase();
		const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/);

		if (!match) {
			return 4 * 1024 * 1024; // Default 4MB for unknown values
		}

		const value = parseFloat(match[1]);
		const unit = match[2];

		switch (unit) {
			case 'KB':
				return Math.round(value * 1024);
			case 'MB':
				return Math.round(value * 1024 * 1024);
			case 'GB':
				return Math.round(value * 1024 * 1024 * 1024);
			default:
				return 4 * 1024 * 1024; // Default 4MB
		}
	}

	// Determine file type from filename
	function getFileType(filename: string): 'firmware' | 'ota' | 'filesystem' {
		if (!filename || typeof filename !== 'string') {
			return 'firmware'; // Default type
		}

		const lowerFilename = filename.toLowerCase();

		// Check for firmware files
		if (lowerFilename.includes('factory.bin')) {
			return 'firmware';
		}

		// Check for OTA files
		if (lowerFilename.includes('bleota') || lowerFilename.includes('ota')) {
			return 'ota';
		}

		// Check for filesystem files
		if (lowerFilename.includes('littlefs') || lowerFilename.includes('spiffs')) {
			return 'filesystem';
		}

		// Default to firmware for unknown files
		return 'firmware';
	}

	// Get color for each file type
	function getTypeColor(type: 'firmware' | 'ota' | 'filesystem'): string {
		switch (type) {
			case 'firmware':
				return '#fbbf24'; // Yellow/amber
			case 'ota':
				return '#f59e0b'; // Orange
			case 'filesystem':
				return '#84cc16'; // Lime/green
			default:
				return '#fbbf24'; // Default to firmware color
		}
	}

	// Prepare memory segments from selected firmware files
	function prepareMemorySegments(files: typeof selectedFirmwareFiles): MemorySegment[] {
		if (!files || files.length === 0) {
			return [];
		}

		const segments = files.map((fileItem) => {
			// Parse the address - handle both hex (0x...) and decimal formats
			let address: number;
			if (fileItem.address.startsWith('0x') || fileItem.address.startsWith('0X')) {
				address = parseInt(fileItem.address, 16);
			} else {
				address = parseInt(fileItem.address, 10);
			}

			// Ensure address is a valid number
			if (isNaN(address) || address < 0) {
				address = 0x0; // Default to 0x0 for invalid addresses
			}

			// Get file type and color
			const type = getFileType(fileItem.filename);
			const color = getTypeColor(type);

			return {
				address: address,
				size: fileItem.file.size,
				type: type,
				filename: fileItem.filename,
				color: color
			} as MemorySegment;
		});

		return segments;
	}

	// Close modal
	async function handleClose() {
		if (!isFlashing) {
			onClose();
			await resetState();
		}
	}

	// Reactive data for MemoryMap
	$: totalMemorySize = deviceInfo ? parseFlashSize(deviceInfo.flashSize) : 4 * 1024 * 1024;
	$: memorySegments = prepareMemorySegments(selectedFirmwareFiles);

	// Reactive properties for backward compatibility
	$: selectedFirmwareFile =
		selectedFirmwareFiles.length === 1 ? selectedFirmwareFiles[0].file : null;
	$: flashAddress = selectedFirmwareFiles.length > 0 ? selectedFirmwareFiles[0].address : '0x0';

	// Reactive: Validate files for conflicts
	$: if (selectedFirmwareFiles.length > 0) {
		const validation = validateFirmwareSelection(selectedFirmwareFiles);
		selectedFirmwareFiles = selectedFirmwareFiles.map((file) => ({
			...file,
			hasError: !validation.isValid && validation.conflictingFiles?.includes(file.filename),
			errorMessage:
				!validation.isValid && validation.conflictingFiles?.includes(file.filename)
					? getErrorMessage(validation.errorCode)
					: ''
		}));
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
		on:keydown={(e) => e.key === 'Escape' && !isFlashing && handleClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div
			class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-orange-600 bg-gray-800"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<h2 id="modal-title" class="text-xl font-semibold text-orange-200">
					{$locales('customfirmware.flash_custom_firmware')}
				</h2>
				<button
					on:click={async () => await handleClose()}
					on:keydown={(e) => e.key === 'Escape' && handleClose()}
					disabled={isFlashing}
					class="text-gray-400 transition-colors hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Close modal"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="space-y-6 p-6">
				<!-- Headers Row -->
				<div class="mb-4 grid grid-cols-1 gap-6 md:grid-cols-2">
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

				<!-- Screen reader only description for file drop zone -->
				<div id="file-drop-description" class="sr-only">
					Use drag and drop or click to select firmware files. Supported formats: .bin, .mt.json
				</div>

				<!-- Two-column layout with independent left and right sides -->
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Left column: Port selection and options -->
					<div class="space-y-3">
						<!-- Port Selection Field -->
						<div class="h-[100px]">
							{#if !isPortSelected}
								<button
									on:click={selectPort}
									disabled={isConnecting || isFlashing}
									class="h-full w-full rounded-lg border-2 border-dashed border-gray-600 p-4 text-center transition-colors hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{#if isConnecting}
										<div class="space-y-2">
											<div class="animate-spin text-2xl">⏳</div>
											<div class="text-sm text-orange-200">
												{$locales('customfirmware.connecting')}
											</div>
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
								<div class="relative h-full rounded-lg border border-gray-600 bg-gray-800 p-4">
									<div class="flex h-full flex-col">
										<div class="mb-2 flex items-center justify-between">
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
										class="absolute right-2 top-2 text-xs text-gray-400 transition-colors hover:text-red-400 disabled:cursor-not-allowed"
									>
										{$locales('customfirmware.disconnect')}
									</button>
								</div>
							{/if}
						</div>

						<!-- Baudrate selector (show when port is selected) -->
						{#if isPortSelected}
							<div class="pt-3">
								<label for="baudrate-select" class="mb-1 block text-sm font-medium text-gray-300">
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
					</div>

					<!-- Right column: File selection and addresses -->
					<div class="space-y-3">
						<!-- File Selection Field -->
						<div class="h-[100px]">
							<!-- Drag & Drop Area - always enabled -->
							<div
								role="button"
								tabindex="0"
								aria-label="Select firmware files"
								aria-describedby="file-drop-description"
								class="flex h-full w-full cursor-pointer flex-col justify-center rounded-lg p-4 text-center transition-colors hover:border-orange-500 {selectedFirmwareFile ||
								selectedFirmwareFiles.length > 0
									? 'border border-gray-600 bg-gray-800'
									: 'border-2 border-dashed border-gray-600'}"
								on:dragover={handleDragOver}
								on:drop={handleDrop}
								on:click={() => fileInput?.click()}
								on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' ? fileInput?.click() : null)}
							>
								{#if selectedFirmwareFile}
									<!-- Single file selected (backward compatibility) -->
									<div class="space-y-2">
										<div class="text-2xl">📄</div>
										<div class="truncate text-sm font-medium text-orange-200">
											{selectedFirmwareFile.name}
										</div>
										<div class="text-xs text-gray-400">
											{fileHandler.formatFileSize(selectedFirmwareFile.size)}
										</div>
									</div>
								{:else}
									<!-- No files selected -->
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

							<!-- Hidden file input with multiple attribute -->
							<input
								bind:this={fileInput}
								type="file"
								multiple
								accept=".bin,.mt.json"
								on:change={handleFileInputChange}
								class="hidden"
							/>
						</div>

						<!-- Metadata File Section -->
						{#if metadataFile}
							<div class="pt-3">
								<div class="mb-1 flex items-center justify-between">
									<label class="text-sm font-medium text-blue-300">Metadata File</label>
								</div>
								<div
									class="flex items-center space-x-2 rounded-md border border-blue-600 bg-blue-900/20 p-2"
								>
									<div class="min-w-0 flex-1">
										<div class="flex items-center space-x-2">
											<div class="truncate text-xs font-medium text-blue-300">
												{metadataFile.file.name}
											</div>
											<div class="text-blue-400" title="Metadata file for address prediction">
												📋
											</div>
										</div>
										<div class="text-xs text-gray-400">
											{fileHandler.formatFileSize(metadataFile.file.size)}
										</div>
										{#if metadata}
											<div class="mt-1 text-xs text-gray-500">
												Version: {metadata.version} | Board: {metadata.board} | MCU: {metadata.mcu}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/if}

						<!-- Flash Address Fields -->
						{#if selectedFirmwareFiles.length > 0}
							<div class="max-h-60 overflow-y-auto pt-3">
								<div class="mb-1 flex items-center justify-between">
									<label class="text-sm font-medium text-gray-300">
										{$locales('customfirmware.flash_addresses')}
									</label>
									<span class="text-xs text-gray-500">Format: 0x1000 or 4096</span>
								</div>
								<div class="space-y-2">
									{#each selectedFirmwareFiles as fileItem, index}
										<div
											class="flex items-center space-x-2 border p-2 {fileItem.hasError
												? 'border-red-600 bg-red-900/20'
												: 'border-gray-600 bg-gray-800'} group relative rounded-md"
										>
											<div class="min-w-0 flex-1">
												<div class="flex items-center space-x-2">
													<div class="truncate text-xs font-medium text-gray-300">
														{fileItem.filename}
													</div>
													{#if fileItem.hasError}
														<div class="cursor-help text-red-400" title={fileItem.errorMessage}>
															⚠️
														</div>
													{/if}
												</div>
												<div class="text-xs text-gray-500">
													{fileHandler.formatFileSize(fileItem.file.size)}
												</div>
											</div>
											<div class="flex flex-shrink-0 items-center space-x-2">
												<label class="text-xs text-gray-400"
													>{$locales('customfirmware.address')}:</label
												>
												<input
													type="text"
													bind:value={fileItem.address}
													placeholder="0x0"
													disabled={isFlashing}
													class="w-24 rounded-md {espManager.isValidFlashAddress(fileItem.address)
														? 'border-gray-600'
														: 'border-red-500'} bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
													on:change={(e) => {
														const input = e.target as HTMLInputElement;
														const sanitized = espManager.sanitizeAddress(input.value);
														fileItem.address = sanitized;
													}}
													title="Enter address in hex (0x...) or decimal format"
												/>
												<button
													on:click={() => removeFile(index)}
													disabled={isFlashing}
													class="text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
													title="Remove file"
												>
													✕
												</button>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<!-- Empty space when no files selected -->
							<div></div>
						{/if}
					</div>
				</div>

				<!-- Erase before flash checkbox (show when port is selected) -->
				{#if isPortSelected}
					<div class="mb-4 flex items-center space-x-2">
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
							<div
								role="alert"
								aria-live="assertive"
								class="rounded-md border border-red-700 bg-red-900 p-3"
							>
								<div class="text-sm text-red-200">{flashError}</div>
							</div>
						{:else}
							<div role="status" aria-live="polite" class="rounded-md bg-gray-700 p-3">
								<div class="text-sm text-orange-200">{flashStatus}</div>

								{#if isFlashing}
									<div class="mt-2">
										<div
											role="progressbar"
											aria-valuenow={flashProgress}
											aria-valuemin="0"
											aria-valuemax="100"
											aria-label="Flashing progress"
											class="h-2 w-full rounded-full bg-gray-600"
										>
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

				<!-- Memory Map Visualization -->
				{#if selectedFirmwareFiles.length > 0}
					<MemoryMap totalSize={totalMemorySize} segments={memorySegments} />
				{/if}

				<!-- Instructions Spoiler -->
				<div class="space-y-2">
					<button
						on:click={() => (showInstructions = !showInstructions)}
						class="flex items-center space-x-2 text-sm font-medium text-orange-300 transition-colors hover:text-orange-200"
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
						{$locales('customfirmware.flash_another_file')}
					</button>
				{:else}
					<button
						on:click={flashFirmware}
						disabled={selectedFirmwareFiles.length === 0 ||
							!isPortSelected ||
							isFlashing ||
							selectedFirmwareFiles.some((file) => file.hasError)}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isFlashing}
							{$locales('customfirmware.flashing')}...
						{:else}
							{$locales('customfirmware.flash_firmware')} ({selectedFirmwareFiles.length} file{selectedFirmwareFiles.length !==
							1
								? 's'
								: ''})
						{/if}
					</button>
				{/if}
			</div>
			{#if isPortSelected && deviceInfo}
				<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
					<div class="mb-3 text-sm font-medium text-orange-300">Device Information</div>
					<div class="grid grid-cols-1 gap-4 text-xs text-gray-400 md:grid-cols-2 lg:grid-cols-3">
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
