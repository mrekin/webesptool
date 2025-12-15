<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ as locales } from 'svelte-i18n';
	import { createESPManager, getMeshtasticFlashAddress, validateFirmwareSelection } from '$lib/utils/esp';
	import { createFirmwareFileHandler } from '$lib/utils/fileHandler';
	import type { FirmwareFile } from '$lib/types';
import { ValidationErrors } from '$lib/types';

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

	// Новые переменные для новой логики
	let isPortSelected = false;
	let deviceInfo: any = null; // Информация об устройстве
	let isConnecting = false;
	let showInstructions = false; // Управление спойлером инструкций

	// Ссылка на file input для замены document.getElementById
	let fileInput: HTMLInputElement;

	// Get baudrate options from utility
	const baudrateOptions = espManager.getBaudrateOptions().map(opt => ({
		...opt,
		label: opt.value === 115200
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
	function handleFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;

		selectedFirmwareFiles = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (fileHandler.isValidFile(file)) {
				selectedFirmwareFiles.push({
					filename: file.name,
					address: '0x0', // Default address in hex format
					file: fileHandler.createFirmwareFile(file),
					hasError: false,
					errorMessage: ''
				});
			}
		}

		// Validation is handled reactively - no need to validate here
		flashError = '';
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

		await espManager.resetPort();
	}

	// Reset everything when modal closes
	async function resetState() {
		selectedFirmwareFiles = [];

		// Reset port using the dedicated function
		await resetPort();
	}

	// Flash firmware
	async function flashFirmware() {
		// Check if we have files selected (single or multiple)
		if (!selectedFirmwareFile && selectedFirmwareFiles.length === 0) {
			flashError = 'Please select a firmware file';
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
					const progressRange = (100 - (totalFiles * 5)) / totalFiles;
					const progressBase = (i / totalFiles) * (100 - (totalFiles * 5));

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

	
	// Close modal
	async function handleClose() {
		if (!isFlashing) {
			onClose();
			await resetState();
		}
	}

	// Reactive properties for backward compatibility
	$: selectedFirmwareFile = selectedFirmwareFiles.length === 1 ? selectedFirmwareFiles[0].file : null;
	$: flashAddress = selectedFirmwareFiles.length > 0 ? selectedFirmwareFiles[0].address : '0x0';

	// Reactive: Update flash addresses when files or device info changes
	$: if (selectedFirmwareFiles.length > 0) {
		selectedFirmwareFiles = selectedFirmwareFiles.map(fileItem => {
			const addressResult = getMeshtasticFlashAddress(fileItem.filename, null, deviceInfo?.chip);
			if (addressResult) {
				return {
					...fileItem,
					address: addressResult.address
				};
			}
			return fileItem;
		});
	}

	// Reactive: Validate files for conflicts
	$: if (selectedFirmwareFiles.length > 0) {
		const validation = validateFirmwareSelection(selectedFirmwareFiles);
		selectedFirmwareFiles = selectedFirmwareFiles.map(file => ({
			...file,
			hasError: !validation.isValid && validation.conflictingFiles?.includes(file.filename),
			errorMessage: !validation.isValid && validation.conflictingFiles?.includes(file.filename)
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

				<!-- Screen reader only description for file drop zone -->
			<div id="file-drop-description" class="sr-only">
				Use drag and drop or click to select firmware files. Supported formats: .bin, .hex, .elf
			</div>

			<!-- Two-column layout with independent left and right sides -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Left column: Port selection and options -->
				<div class="space-y-3">
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

						<!-- Baudrate selector (show when port is selected) -->
						{#if isPortSelected}
							<div class="pt-3">
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
									class="w-full h-full rounded-lg p-4 text-center transition-colors hover:border-orange-500 cursor-pointer flex flex-col justify-center {(selectedFirmwareFile || selectedFirmwareFiles.length > 0) ? 'border border-gray-600 bg-gray-800' : 'border-2 border-dashed border-gray-600'}"
									on:dragover={handleDragOver}
									on:drop={handleDrop}
									on:click={() => fileInput?.click()}
									on:keydown={(e) => e.key === 'Enter' || e.key === ' ' ? fileInput?.click() : null}
								>
									{#if selectedFirmwareFile}
										<!-- Single file selected (backward compatibility) -->
										<div class="space-y-2">
											<div class="text-2xl">📄</div>
											<div class="text-sm font-medium text-orange-200 truncate">{selectedFirmwareFile.name}</div>
											<div class="text-xs text-gray-400">{fileHandler.formatFileSize(selectedFirmwareFile.size)}</div>
										</div>
									{:else if selectedFirmwareFiles.length > 0}
										<!-- Multiple files selected -->
										<div class="space-y-2">
											<div class="text-2xl">📄</div>
											<div class="text-sm font-medium text-orange-200">{selectedFirmwareFiles.length} files selected</div>
											<div class="text-xs text-gray-400">
												{selectedFirmwareFiles.map(f => f.filename).join(', ')}
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
									accept=".bin,.hex,.elf"
									on:change={handleFileInputChange}
									class="hidden"
							/>
						</div>

						<!-- Flash Address Fields -->
						{#if selectedFirmwareFiles.length > 0}
							<div class="pt-3 max-h-60 overflow-y-auto">
								<div class="flex items-center justify-between mb-1">
									<label class="text-sm font-medium text-gray-300">
										{$locales('customfirmware.flash_addresses')}
									</label>
									<span class="text-xs text-gray-500">Format: 0x1000 or 4096</span>
								</div>
								<div class="space-y-2">
									{#each selectedFirmwareFiles as fileItem, index}
										<div class="flex items-center space-x-2 p-2 border {fileItem.hasError ? 'border-red-600 bg-red-900/20' : 'border-gray-600 bg-gray-800'} rounded-md relative group">
											<div class="flex-1 min-w-0">
												<div class="flex items-center space-x-2">
													<div class="text-xs text-gray-300 font-medium truncate">{fileItem.filename}</div>
													{#if fileItem.hasError}
														<div class="text-red-400 cursor-help" title={fileItem.errorMessage}>
															⚠️
														</div>
													{/if}
												</div>
												<div class="text-xs text-gray-500">{fileHandler.formatFileSize(fileItem.file.size)}</div>
											</div>
											<div class="flex items-center space-x-2 flex-shrink-0">
												<label class="text-xs text-gray-400">{$locales('customfirmware.address')}:</label>
												<input
													type="text"
													bind:value={fileItem.address}
													placeholder="0x0"
													disabled={isFlashing}
		class="w-24 rounded-md {espManager.isValidFlashAddress(fileItem.address) ? 'border-gray-600' : 'border-red-500'} bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
													on:input={(e) => {
														const input = e.target as HTMLInputElement;
														const sanitized = espManager.sanitizeAddress(input.value);
														if (sanitized !== input.value) {
															input.value = sanitized;
															fileItem.address = sanitized;
														}
													}}
													title="Enter address in hex (0x...) or decimal format"
												/>
												<button
													on:click={() => removeFile(index)}
													disabled={isFlashing}
													class="text-red-400 hover:text-red-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
							<div role="alert" aria-live="assertive" class="rounded-md border border-red-700 bg-red-900 p-3">
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
						{$locales('customfirmware.flash_another_file')}
					</button>
				{:else}
					<button
						on:click={flashFirmware}
						disabled={(!selectedFirmwareFile && selectedFirmwareFiles.length === 0) || !isPortSelected || isFlashing || selectedFirmwareFiles.some(file => file.hasError)}
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
