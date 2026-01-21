<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ as locales } from 'svelte-i18n';
	import {
		createESPManager,
		getMeshtasticFlashAddress,
		validateFirmwareSelection,
		parseFirmwareMetadata,
		classifyFile,
		FirmwareFileType
	} from '$lib/utils/esp.js';
	import { createFirmwareFileHandler } from '$lib/utils/fileHandler.js';
	import { apiService } from '$lib/api.js';
	import type { FirmwareFile, FirmwareMetadata, FirmwareMetadataExtended, MemorySegment, SelectedFirmwareFile } from '$lib/types.js';
	import { ValidationErrors } from '$lib/types.js';
	import { parsePartitionsWithValidation, formatAnalysis, type PartitionTable, type PartitionAnalysis } from '$lib/utils/partitionParser.js';
	import MemoryMap from '$lib/components/MemoryMap.svelte';
	import BackupConfirmModal from '$lib/components/BackupConfirmModal.svelte';
	import TerminalModal from '$lib/components/TerminalModal.svelte';
	import { uiState } from '$lib/stores.js';

	export let isOpen = false;
	export let onClose = () => {};
	export let preloadedFilesWithOffsets: {
		file: FirmwareFile;
		address: string;
		filename: string;
	}[] = [];
	export let isAutoSelectMode = false;
	export let manifestData: any = null;

	// Create utility instances
	const espManager = createESPManager();
	const fileHandler = createFirmwareFileHandler();

	// Component state
	let selectedFirmwareFiles: SelectedFirmwareFile[] = []; // Multiple files with addresses
	let isFlashing = false;
	let flashProgress = 0;
	let flashStatus = '';
	let flashError = '';
	let eraseBeforeFlash = false; // New parameter for checkbox
	let selectedBaudrate = 115200; // Default selected speed

	// Watch for baudrate changes and update esploader
	$: if (selectedBaudrate && espManager) {
		updateBaudrate(selectedBaudrate);
	}

	// Function to update baudrate in esploader
	async function updateBaudrate(newBaudrate: number) {
		if (isFlashing || isBackingUp) return; // Don't change during operations

		try {
			const currentBaudrate = espManager.getCurrentBaudrate();
			if (currentBaudrate !== newBaudrate) {
				console.log(`Changing baudrate from ${currentBaudrate} to ${newBaudrate}...`);
				await espManager.changeBaudrate(newBaudrate);
				console.log(`Baudrate changed to ${newBaudrate}`);
			}
		} catch (error) {
			console.error('Failed to change baudrate:', error);
		}
	}

	// Memory backup state
	let isBackingUp = false;
	let showBackupConfirm = false; // Confirm dialog state
	let backupAbortController: AbortController | null = null; // For cancelling backup

	// ZIP extraction state
	let isExtractingZip = false;
	let zipExtractionProgress = 0;
	let zipExtractionError = '';

	// File download state
	let isDownloadingFiles = false;
	let downloadError = '';
	let downloadAbortController: AbortController | null = null;
	let downloadCompleted = false;
	let downloadErrors: string[] = []; // Collect individual file download errors

	// Validation state
	let validationResult: { isValid: boolean; errorCode?: any; conflictingFiles?: string[]; errorMessage?: string } = { isValid: true };

	// Metadata state
	let metadataFile: FirmwareFile | null = null;
	let metadata: FirmwareMetadataExtended | null = null; // Support both .mt.json and manifest.json

	// Partitions table state
	let partitionsTable: PartitionTable | null = null;

	// Flash size calculated from partitions.bin
	let flashSizeFromPartitions: number | null = null;

	// Partitions compatibility warning (non-blocking)
	let partitionsCompatibilityWarning: string | null = null;

	// New variables for new logic
	let isPortSelected = false;
	let deviceInfo: any = null; // Device information
	let isConnecting = false;
	let showInstructions = false; // Control instructions spoiler
	let showFileDetails = false; // Control file details spoiler in AutoSelect mode
	let autoPortSelectionTriggered = false; // Flag for tracking automatic port selection
	let showTerminalModal = false; // Terminal modal state

	// Reference to file input to replace document.getElementById
	let fileInput: HTMLInputElement;

	// Experimental features flag
	$: experimentalFeatures = $uiState.experimentalFeatures;

	// Get baudrate options from utility
	const baudrateOptions = espManager.getBaudrateOptions().map((opt) => ({
		...opt,
		label: $locales(opt.labelKey)
	}));

	
	// Handle manifest data in AutoSelect mode
	$: if (isAutoSelectMode && manifestData && !metadataFile) {
		// Create a virtual metadata file from manifest data
		const manifestContent = JSON.stringify(manifestData, null, 2);
		const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
		const manifestFile = new File([manifestBlob], 'manifest.json', { type: 'application/json' });

		metadataFile = fileHandler.createFirmwareFile(manifestFile);
		metadata = parseFirmwareMetadata(manifestContent);
	}

	// Also handle initial mount
	onMount(() => {
		if (isAutoSelectMode && preloadedFilesWithOffsets.length > 0) {
			selectedFirmwareFiles = preloadedFilesWithOffsets.map(item => ({
				filename: item.filename,
				address: item.address,
				file: item.file, // File object
				hasError: false,
				errorMessage: '',
				isEnabled: true // File is enabled by default
			}));
		}
	});

	// Reactive: Start file download when modal opens in AutoSelect mode
	$: if (isOpen && isAutoSelectMode && manifestData && !isDownloadingFiles && !downloadError && !downloadCompleted) {
		startFileDownload();
	}

	// Reactive: Auto-start port selection when modal opens in AutoSelect mode (parallel to download)
	$: if (isOpen && isAutoSelectMode && !isPortSelected && !isConnecting && !autoPortSelectionTriggered) {
		// Use setTimeout to ensure DOM is ready
		setTimeout(() => {
			autoPortSelectionTriggered = true;
			selectPort();
		}, 100);
	}

	// Clean up on unmount
	onDestroy(async () => {
		await espManager.resetPort();
	});

	// Helper function to get localized error message
	function getErrorMessage(errorCode?: number): string {
		switch (errorCode) {
			case ValidationErrors.FILES_CONFLICT:
				return $locales('customfirmware.file_conflict_error');
			case ValidationErrors.CHIP_MISMATCH:
				return 'Chip mismatch: Firmware is not compatible with the connected device';
			case ValidationErrors.UNKNOWN_ERROR:
			default:
				return $locales('customfirmware.unknown_validation_error');
		}
	}

	// Handle file selection (unified function for both file selection and drag & drop)
	async function handleFileSelect(files: FileList | null) {
		if (isAutoSelectMode) return; // Ignore file selection in AutoSelect mode
		if (!files || files.length === 0) return;

		selectedFirmwareFiles = [];
		metadataFile = null;
		metadata = null;
		partitionsTable = null;
		flashError = '';
		zipExtractionError = '';
		validationResult = { isValid: true };

		// Collect all files to process (including extracted from ZIPs)
		let allFiles: File[] = [];

		// First pass: handle ZIP files and collect regular files
		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (fileHandler.isZipFile(file)) {
				// Extract ZIP archive
				isExtractingZip = true;
				zipExtractionProgress = 0;

				try {
					const extractionResult = await fileHandler.processZipArchive(file);
					allFiles = allFiles.concat(extractionResult.extractedFiles);

					// Show info about extraction
					if (extractionResult.skippedCount > 0) {
						console.info(`ZIP extraction: ${extractionResult.extractedCount} files extracted, ${extractionResult.skippedCount} files skipped`);
					}
				} catch (error) {
					zipExtractionError = `Failed to extract ZIP file: ${error}`;
					isExtractingZip = false;
					return;
				} finally {
					isExtractingZip = false;
				}
			} else if (fileHandler.isValidFile(file)) {
				allFiles.push(file);
			}
		}

		let metadataFileCount = 0;
		let partitionsFileCount = 0;

		// Collect all metadata files to prioritize manifest.json over .mt.json
		let metadataFiles: File[] = [];

		// First pass: count metadata and partitions files from all files (including extracted)
		for (let i = 0; i < allFiles.length; i++) {
			const file = allFiles[i];
			if (fileHandler.isMetadataFile(file)) {
				metadataFileCount++;
				metadataFiles.push(file);
			}
			if (classifyFile(file.name) === FirmwareFileType.PARTITIONS) {
				partitionsFileCount++;
			}
		}

		// Check for multiple partitions.bin files
		if (partitionsFileCount > 1) {
			flashError = 'Only one partitions.bin file is allowed';
			return;
		}

		// Select metadata file: prioritize ManifestMetadata (manifest.json) over FirmwareMetadata (.mt.json)
		if (metadataFiles.length > 0) {
			// Parse all metadata files to determine type
			// ManifestMetadata (manifest.json) has priority over FirmwareMetadata (.mt.json)
			for (const file of metadataFiles) {
				try {
					const tempFile = fileHandler.createFirmwareFile(file);
					const content = await fileHandler.readFileContent(tempFile);
					const parsedMetadata = parseFirmwareMetadata(content);

					if (!parsedMetadata) {
						continue;
					}

					if ('builds' in parsedMetadata) {
						// This is ManifestMetadata (manifest.json) - highest priority
						metadataFile = tempFile;
						metadata = parsedMetadata;
						break;  // Stop searching, found highest priority
					} else if (!metadata) {
						// This is FirmwareMetadata (.mt.json) - use as fallback
						metadataFile = tempFile;
						metadata = parsedMetadata;
					}
				} catch (error) {
					// Skip invalid metadata files
					console.error(`Failed to parse metadata file ${file.name}:`, error);
				}
			}
		}

		// Second pass: process all files except metadata (handled separately)
		for (let i = 0; i < allFiles.length; i++) {
			const file = allFiles[i];
			// Skip metadata files in the loop - handle selected metadata file separately
			if (fileHandler.isMetadataFile(file)) {
				continue;
			}

			if (classifyFile(file.name) === FirmwareFileType.PARTITIONS) {
				// Handle partitions.bin file - parse for address determination AND add to flash list
				try {
					// Read and parse partitions.bin
					const arrayBuffer = await fileHandler.readFileAsArrayBuffer(fileHandler.createFirmwareFile(file));
					partitionsTable = parsePartitionsWithValidation(arrayBuffer);
					console.log(`[Partitions.bin] Parsed successfully: ${partitionsTable.entries.length} entries`);

					// Debug: log all partitions
					console.log('[Partitions.bin] All entries:');
					partitionsTable.entries.forEach(entry => {
						const typeName = entry.type_val === 0x00 ? 'APP' : 'DATA';
						console.log(`  - offset=0x${entry.offset.toString(16).toUpperCase()}, type=${typeName} (0x${entry.type_val.toString(16)}), subtype=0x${entry.subtype.toString(16)}, size=${entry.size}, name=${entry.name}`);
					});
				} catch (error) {
					// Graceful degradation on parse error
					console.error(`[Partitions.bin] Failed to parse:`, error);
					flashError = `⚠️ Failed to parse partitions.bin: ${error instanceof Error ? error.message : String(error)}. Using filename patterns.`;
					partitionsTable = null;
					// Continue processing - will fall back to filename patterns
				}

				// Add partitions.bin to the flash list (it should be flashed to 0x8000)
				selectedFirmwareFiles.push({
					filename: file.name,
					address: '0x8000', // Default partitions offset
					file: fileHandler.createFirmwareFile(file),
					hasError: false,
					errorMessage: '',
					isEnabled: true
				});
			} else if (fileHandler.isFirmwareFile(file)) {
				// Handle firmware file
				selectedFirmwareFiles.push({
					filename: file.name,
					address: '0x0', // Default address in hex format
					file: fileHandler.createFirmwareFile(file),
					hasError: false,
					errorMessage: '',
					isEnabled: true // File is enabled by default
				});
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
		// Clear the input value to allow selecting the same files again
		target.value = '';
	}

	// Remove file from flashing list
	function removeFile(index: number) {
		if (isAutoSelectMode) return; // Cannot remove files in AutoSelect mode
		selectedFirmwareFiles = selectedFirmwareFiles.filter((_, i) => i !== index);
		flashError = '';
	}

	// Remove metadata file
	function removeMetadataFile() {
		if (isAutoSelectMode) return; // Cannot remove metadata file in AutoSelect mode
		metadataFile = null;
		metadata = null;
		flashError = '';

		// Note: partitions table is preserved when removing metadata
		// This allows switching between metadata and partitions.bin sources

		// Update flash addresses after removing metadata
		if (selectedFirmwareFiles.length > 0) {
			updateFlashAddresses();
		}
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
	async function resetForAnotherFlash() {
		if (isAutoSelectMode) {
			// In AutoSelect mode, reset port and status but keep files
			isPortSelected = false;
			deviceInfo = null;
			isConnecting = false;
			flashProgress = 0;
			flashStatus = '';
			flashError = '';
			eraseBeforeFlash = false;
			autoPortSelectionTriggered = false; // Reset for next auto port selection
			validationResult = { isValid: true };

			// Reset port using the dedicated function
			await espManager.resetPort();
		} else {
			// In manual mode, reset everything
			selectedFirmwareFiles = [];
			metadataFile = null;
			metadata = null;
			partitionsTable = null;
				flashProgress = 0;
			flashStatus = '';
			flashError = '';
			zipExtractionProgress = 0;
			zipExtractionError = '';
			isExtractingZip = false;
			eraseBeforeFlash = false;
			validationResult = { isValid: true };
		}
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
		partitionsTable = null;
		zipExtractionProgress = 0;
		zipExtractionError = '';
		isExtractingZip = false;

		await espManager.resetPort();
	}

	// Cancel any ongoing operations when modal closes
	async function resetState() {
		// Cancel any ongoing file download
		if (downloadAbortController) {
			downloadAbortController.abort();
			downloadAbortController = null;
		}

		// Cancel any ongoing backup
		if (backupAbortController) {
			backupAbortController.abort();
			backupAbortController = null;
		}

		// Reset port only
		await resetPort();
	}

	// Flash firmware
	async function flashFirmware() {
		// Only use enabled files for flashing
		const enabledFiles = selectedFirmwareFiles.filter(f => f.isEnabled !== false);

		// Check if we have firmware files selected (only .bin files)
		if (enabledFiles.length === 0) {
			flashError = 'Please select at least one firmware file (.bin)';
			return;
		}

		if (!isPortSelected || !espManager.getCurrentPort()) {
			flashError = 'Please select a port first';
			return;
		}

		// Validate all addresses for enabled files
		for (let i = 0; i < enabledFiles.length; i++) {
			const fileItem = enabledFiles[i];
			if (!espManager.isValidFlashAddress(fileItem.address)) {
				flashError = `Invalid address format for file "${fileItem.filename}": ${fileItem.address}. Please enter a valid address (e.g., 0x0, 0x1000, 4096)`;
				return;
			}
		}

		isFlashing = true;
		flashProgress = 0;
		flashStatus = 'Starting flash process...';
		flashError = '';

		try {
			// Sort files by flash address before flashing
			const sortedFiles = [...enabledFiles].sort((a, b) => {
				const addressA = parseInt(a.address.replace('0x', ''), 16);
				const addressB = parseInt(b.address.replace('0x', ''), 16);
				return addressA - addressB;
			});

			const totalFiles = sortedFiles.length;

			// Calculate total volume for progress tracking
			let totalVolume = 0;
			let flashSizeBytes = 0;

			// Get flash size if erase is enabled
			if (eraseBeforeFlash && deviceInfo?.flashSize) {
				flashSizeBytes = parseFlashSize(deviceInfo.flashSize);
				totalVolume += flashSizeBytes;
			}

			// Add all file sizes
			for (const fileItem of sortedFiles) {
				totalVolume += fileItem.file.size;
			}

			// Fixed progress ranges: 0-5% (preparation), 5-95% (work), 95-100% (finalization)
			flashProgress = 0;
			flashStatus = 'Starting flash process...';

			// Step 1: Erase flash if requested (0-5% preparation, then part of 5-95% work)
			let cumulativeProcessed = 0;

			if (eraseBeforeFlash && flashSizeBytes > 0) {
				flashProgress = 5;
				flashStatus = 'Erasing flash...';

				await espManager.eraseFlash({
					onProgress: (progress: any) => {
						// Erase progress 0-100 maps to 5-95% range
						const eraseProgress = (progress.progress / 100) * (flashSizeBytes / totalVolume);
						flashProgress = Math.round(5 + eraseProgress * 90);
						flashStatus = `Erasing flash... ${progress.progress}%`;
						if (progress.error) {
							flashError = progress.error;
						}
					}
				});

				cumulativeProcessed += flashSizeBytes;
			}

			// Step 2: Flash all files (part of 5-95% work)
			for (let i = 0; i < totalFiles; i++) {
				const fileItem = sortedFiles[i];

				flashStatus = `Flashing file ${i + 1}/${totalFiles}: ${fileItem.filename} @ ${fileItem.address}...`;

				// Read file content using utility
				const content = await fileHandler.readFileContent(fileItem.file);
				const firmwareFile: FirmwareFile = {
					...fileItem.file,
					content: content
				};

				const flashOptions = {
					baudrate: selectedBaudrate,
					address: fileItem.address, // Already in hex format
					onProgress: (progress: any) => {
						// File progress 0-100 maps to portion of 5-95% range
						const fileSize = fileItem.file.size;
						const processedBytes = cumulativeProcessed + (progress.progress / 100) * fileSize;
						flashProgress = Math.round(5 + (processedBytes / totalVolume) * 90);
						flashStatus = `Flashing file ${i + 1}/${totalFiles}: ${fileItem.filename} @ ${fileItem.address} - ${progress.status}`;
						if (progress.error) {
							flashError = progress.error;
						}
					}
				};

				// Use ESP manager to flash firmware
				await espManager.flashFirmware(firmwareFile, flashOptions);

				// Add completed file to cumulative processed
				cumulativeProcessed += fileItem.file.size;
			}

			// Step 3: Finalization (95-100%)
			flashProgress = 95;
			flashStatus = 'Finalizing...';
			flashProgress = 100;
			flashStatus = 'All files flashed successfully!';
		} catch (error) {
			console.error('Flash error:', error);
			flashError = error instanceof Error ? error.message : String(error);
		} finally {
			isFlashing = false;
		}
	}

	// Open backup confirmation dialog
	function openBackupConfirm() {
		showBackupConfirm = true;
	}

	// Cancel backup operation
	function cancelBackup() {
		if (backupAbortController) {
			backupAbortController.abort();
			backupAbortController = null;
		}
		flashStatus = $locales('customfirmware.backup_cancelled');
		flashError = $locales('customfirmware.backup_cancelled');
		isBackingUp = false;
		isFlashing = false;
		flashProgress = 0;
	}

	// Backup device memory
	async function backupMemory() {
		if (!isPortSelected || !deviceInfo || !espManager.getCurrentPort()) {
			flashError = 'Please select a port first';
			return;
		}

		// Parse flash size to bytes
		const flashSizeBytes = parseFlashSize(deviceInfo.flashSize);
		console.log(`Backup memory: deviceInfo.flashSize=${deviceInfo.flashSize}, flashSizeBytes=${flashSizeBytes}`);

		// Create abort controller for this backup
		backupAbortController = new AbortController();

		isBackingUp = true;
		isFlashing = true; // Use same flag to disable other actions
		flashProgress = 0;
		flashStatus = $locales('customfirmware.backup_status');
		flashError = '';
		showBackupConfirm = false; // Close confirm dialog

		try {
			// Read flash memory with progress tracking and abort signal
			const { data: flashData, flashId } = await espManager.readFlashMemory(flashSizeBytes, {
				onProgress: (progress) => {
					console.log(`Backup progress update: ${progress.progress}% - ${progress.status}`);
					flashProgress = progress.progress;
					flashStatus = progress.status;
					if (progress.error) {
						flashError = progress.error;
					}
				},
				abortSignal: backupAbortController.signal
			});

			// Check if was cancelled during operation
			if (backupAbortController.signal.aborted) {
				throw new Error('Backup cancelled');
			}

			// Generate filename with flash ID
			const filename = espManager.generateDumpFilename(deviceInfo.chip, deviceInfo.flashSize, flashId);

			// Create blob and trigger download
			const blob = new Blob([flashData as unknown as BlobPart], { type: 'application/octet-stream' });

			// Use the same download pattern as in apiService
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			flashStatus = `Backup saved: ${filename}`;
			flashProgress = 100;
		} catch (error) {
			console.error('Backup error:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			// Don't show error if user cancelled
			if (errorMessage !== 'Backup cancelled' && errorMessage !== 'Backup cancelled') {
				flashError = errorMessage;
			}
		} finally {
			isBackingUp = false;
			isFlashing = false;
			backupAbortController = null;
		}
	}


	// Start file download for AutoSelect mode
	async function startFileDownload() {
		if (!manifestData || isDownloadingFiles) return;

		isDownloadingFiles = true;
		downloadError = '';
		downloadErrors = []; // Reset errors
		downloadCompleted = false; // Reset for retry
		downloadAbortController = new AbortController();

		try {
			const parts = manifestData.builds[0].parts;

			// Create file entries immediately with downloading status
			selectedFirmwareFiles = parts.map((part: any) => {
				// Extract filename from path for immediate display
				const pathSegments = part.path.split('/');
				const extractedFilename = pathSegments[pathSegments.length - 1] || 'firmware.bin';

				return {
					filename: extractedFilename,
					address: `0x${part.offset.toString(16)}`,
					file: { file: new File([], ''), content: '', size: 0, name: extractedFilename }, // Placeholder
					hasError: false,
					errorMessage: '',
					isDownloading: true,
					downloadProgress: 0,
					fileSize: 0,
					isEnabled: true // File is enabled by default
				};
			});

			// Download each file individually with progress tracking
			const downloadPromises = parts.map(async (part: any, index: number) => {
				try {
					// Check if aborted before starting download
					if (downloadAbortController?.signal.aborted) return;

					// Download file with progress tracking
					const { content, filename } = await apiService.downloadFromFileWithFilename(
						part.path,
						(progress, total) => {
							// Update progress for this specific file
							selectedFirmwareFiles[index].downloadProgress = progress;
							// Set file size from headers
							if (total && total > 0) {
								selectedFirmwareFiles[index].fileSize = total;
							}
						},
						downloadAbortController as any
					);

					// Convert ArrayBuffer to File object
					const file = new File([content], filename, { type: 'application/octet-stream' });
					const firmwareFile = fileHandler.createFirmwareFile(file);

					// Don't update if aborted
					if (downloadAbortController?.signal.aborted) return;

					// Update file entry with downloaded data
					selectedFirmwareFiles[index] = {
						...selectedFirmwareFiles[index],
						filename: filename,
						file: firmwareFile,
						isDownloading: false,
						downloadProgress: 100,
						fileSize: content.byteLength
					};

				} catch (error) {
					// Mark this file as failed but continue with others
					const errorMessage = error instanceof Error ? error.message : String(error);
					downloadErrors.push(`${part.path}: ${errorMessage}`);

					selectedFirmwareFiles[index] = {
						...selectedFirmwareFiles[index],
						hasError: true,
						errorMessage: errorMessage,
						isDownloading: false
					};
				}
			});

			// Wait for all downloads to complete (or fail)
			await Promise.allSettled(downloadPromises);

			// Check if any files failed to download
			const failedCount = selectedFirmwareFiles.filter(f => f.hasError).length;
			if (failedCount > 0) {
				downloadError = $locales('customfirmware.download_failed_details', {
					values: { error: `${failedCount} files failed` }
				});
			} else {
				downloadCompleted = true;
			}

		} catch (error) {
			console.error('Download error:', error);
			downloadError = error instanceof Error ? error.message : String(error);
		} finally {
			isDownloadingFiles = false;
		}
	}

	// Update flash addresses using metadata and/or partition table
	function updateFlashAddresses() {
		if (selectedFirmwareFiles.length === 0) return;

		// Get partitions table from enabled partitions.bin file (no hardcoded filename)
		const partitionsBin = selectedFirmwareFiles.find(f =>
			classifyFile(f.filename) === FirmwareFileType.PARTITIONS &&
			f.isEnabled !== false
		);

		selectedFirmwareFiles = selectedFirmwareFiles.map((fileItem) => {
			const addressResult = getMeshtasticFlashAddress(
				fileItem.filename,
				metadata,
				partitionsBin ? partitionsTable : null
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
			if (fileItem.address && typeof fileItem.address === 'string' &&
				(fileItem.address.startsWith('0x') || fileItem.address.startsWith('0X'))) {
				address = parseInt(fileItem.address, 16);
			} else {
				address = parseInt(fileItem.address || '0x0', 10);
			}

			// Ensure address is a valid number
			if (isNaN(address) || address < 0) {
				address = 0x0; // Default to 0x0 for invalid addresses
			}

			// Skip files without file object
			if (!fileItem.file) return null;

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

		return segments.filter(segment => segment !== null);

	}

	// Close modal
	async function handleClose() {
		if (!isFlashing) {
			onClose();
			// Reset auto port selection trigger for next modal open
			autoPortSelectionTriggered = false;
			await resetState();
		}
	}

	// Reactive data for MemoryMap
	$: totalMemorySize = deviceInfo
		? parseFlashSize(deviceInfo.flashSize)
		: (metadata as any)?.builds
			? parseFlashSize((metadata as any)?.builds[0]?.flashsize)
			: flashSizeFromPartitions || 4 * 1024 * 1024;
	$: memorySegments = prepareMemorySegments(selectedFirmwareFiles.filter(f => f.isEnabled !== false));

	// Calculate flash size from partitions.bin (reactive)
	// Only use partitionsTable if there's an enabled partitions.bin file in the list
	$: {
		const enabledPartitionsBin = selectedFirmwareFiles.find(f =>
			classifyFile(f.filename) === FirmwareFileType.PARTITIONS &&
			f.isEnabled !== false
		);
		if (enabledPartitionsBin && partitionsTable) {
			try {
				const analysis = formatAnalysis(partitionsTable, false) as PartitionAnalysis;
				flashSizeFromPartitions = analysis.flash_size_bytes;
			} catch (error) {
				console.error('[Flash size] Failed to calculate from partitions:', error);
				flashSizeFromPartitions = null;
			}
		} else {
			flashSizeFromPartitions = null;
		}
	}

	// Check partitions compatibility with device (reactive)
	$: if (flashSizeFromPartitions && deviceInfo?.flashSize) {
		const deviceFlashSize = parseFlashSize(deviceInfo.flashSize);
		if (flashSizeFromPartitions > deviceFlashSize) {
			const partitionsMB = Math.round(flashSizeFromPartitions / (1024 * 1024));
			const deviceMB = Math.round(deviceFlashSize / (1024 * 1024));
			partitionsCompatibilityWarning = $locales('customfirmware.partitions_incompatible_warning', {
				values: { partitionsMB, deviceMB }
			});
		} else {
			partitionsCompatibilityWarning = null;
		}
	} else {
		partitionsCompatibilityWarning = null;
	}

	// Calculate file count for File Details display
	$: fileCount = selectedFirmwareFiles.length;

	// Reactive: Validate files for conflicts and chip compatibility
	$: if (selectedFirmwareFiles.length > 0) {
		// Only validate enabled files
		const enabledFiles = selectedFirmwareFiles.filter(f => f.isEnabled !== false);
		const validation = validateFirmwareSelection(
			enabledFiles.map(f => ({ filename: f.filename })),
			metadata,
			deviceInfo?.chip
		);

		// Store validation result for button state
		validationResult = validation;

		selectedFirmwareFiles = selectedFirmwareFiles.map((file) => {
			let hasError = false;
			let errorMessage = '';

			// Only validate enabled files
			if (file.isEnabled !== false && !validation.isValid) {
				if (validation.errorCode === ValidationErrors.FILES_CONFLICT && validation.conflictingFiles) {
					// Mark only conflicting files as having errors
					hasError = validation.conflictingFiles.includes(file.filename);
					errorMessage = hasError ? getErrorMessage(ValidationErrors.FILES_CONFLICT) : '';
				} else if (validation.errorCode === ValidationErrors.CHIP_MISMATCH) {
					// For chip mismatch, don't mark individual files as error - this is a global validation issue
					hasError = false;
					errorMessage = '';
				} else {
					// For other validation errors, mark all files as having error
					hasError = true;
					errorMessage = validation.errorMessage || getErrorMessage(validation.errorCode);
				}
			}

			return {
				...file,
				hasError,
				errorMessage
			};
		});

		// Update flash addresses when file enable/disable changes
		updateFlashAddresses();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
		on:keydown={(e) => e.key === 'Escape' && !isFlashing && handleClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div
			class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<h2 id="modal-title" class="text-xl font-semibold text-orange-200">
					{isAutoSelectMode ? $locales('customfirmware.flash_device') : $locales('customfirmware.flash_custom_firmware')}
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
						<div class="block text-sm font-medium text-orange-300">
							{$locales('customfirmware.select_port')}
						</div>
					</div>
					<div>
						<div class="block text-sm font-medium text-orange-300">
							{$locales('customfirmware.select_firmware_file')}
						</div>
					</div>
				</div>

				<!-- Screen reader only description for file drop zone -->
				<div id="file-drop-description" class="sr-only">
					Use drag and drop or click to select firmware files or ZIP archives. Supported formats: .bin, .mt.json, manifest.json, .zip
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
													<div class="flex items-center justify-between gap-2">
														<div class="flex items-center gap-2">
															<span><strong>Flash:</strong> {deviceInfo.flashSize}</span>
															{#if deviceInfo.psramSize}
																<span><strong>PSRAM:</strong> {deviceInfo.psramSize}</span>
															{/if}
														</div>
														<button
															on:click={openBackupConfirm}
															disabled={isFlashing || isBackingUp}
															class="text-lg hover:scale-110 transition-transform disabled:cursor-not-allowed disabled:opacity-50"
															title="Сохранить дамп памяти устройства"
														>
															💾
														</button>
													</div>
												{:else}
													<div><strong>Flash:</strong> Unknown (using manifest)</div>
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
							<!-- Drag & Drop Area - disabled in AutoSelect mode -->
							<div
								role="button"
								tabindex="{isAutoSelectMode ? -1 : 0}"
								aria-label="Select firmware files"
								aria-describedby="file-drop-description"
								class="flex h-full w-full {isAutoSelectMode ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} flex-col justify-center rounded-lg p-4 text-center transition-colors {isAutoSelectMode ? '' : 'hover:border-orange-500'} {selectedFirmwareFiles.length > 0
									? 'border border-gray-600 bg-gray-800'
									: 'border-2 border-dashed border-gray-600'}"
								on:dragover={isAutoSelectMode ? undefined : handleDragOver}
								on:drop={isAutoSelectMode ? undefined : handleDrop}
								on:click={isAutoSelectMode ? undefined : () => fileInput?.click()}
								on:keydown={(e) => (isAutoSelectMode || (e.key !== 'Enter' && e.key !== ' ') ? null : fileInput?.click())}
							>
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
							</div>

							<!-- Hidden file input with multiple attribute (disabled in AutoSelect mode) -->
							<input
								bind:this={fileInput}
								type="file"
								multiple
								disabled={isAutoSelectMode}
								accept=".bin,.mt.json,.json,application/json,.zip,application/zip"
								on:change={handleFileInputChange}
								class="{isAutoSelectMode ? 'hidden' : 'hidden'}"
							/>
						</div>

						<!-- File Details Spoiler (for AutoSelect mode) -->
						{#if isAutoSelectMode && (metadataFile || selectedFirmwareFiles.length > 0)}
							<div class="pt-3">
								<button
									on:click={() => (showFileDetails = !showFileDetails)}
									class="flex items-center space-x-2 text-sm font-medium text-orange-300 transition-colors hover:text-orange-200"
								>
									<span class="flex items-center space-x-2">
										{#if isDownloadingFiles}
											<div class="animate-spin">⏳</div>
										{/if}
										<span>{$locales('customfirmware.file_details')} ({$locales('customfirmware.file_details_count', {values: { count: fileCount }})})</span>
									</span>
									<span class="text-xs">{showFileDetails ? '▼' : '▶'}</span>
								</button>

								{#if showFileDetails}
									<div class="mt-3 space-y-3">
										<!-- Metadata File Section -->
										{#if metadataFile}
											<div>
												<div class="mb-1 flex items-center justify-between">
													<span class="text-sm font-medium text-blue-300">{$locales('customfirmware.metadata_file')}</span>
												</div>
												<div
													class="flex items-center space-x-2 rounded-md border border-blue-600 bg-blue-900/20 p-2"
												>
													<div class="min-w-0 flex-1">
														<div class="flex items-center space-x-2">
															<div class="text-blue-400" title="Metadata file for address prediction">
																📋
															</div>
															<div class="truncate text-xs font-medium text-blue-300" title={metadataFile.file.name}>
																{metadataFile.file.name}
															</div>
															<div class="text-xs text-gray-400">
																({fileHandler.formatFileSize(metadataFile.file.size)})
															</div>
														</div>
														{#if metadata}
															<div class="mt-1 text-xs text-gray-500">
																{#if (metadata as any).builds}
																	<!-- Manifest format -->
																	Version: {metadata.version} | Device: {(metadata as any).name} | Chip: {(metadata as any).builds[0]?.chipFamily}
																{:else}
																	<!-- Legacy format -->
																	Version: {metadata.version} | Board: {(metadata as any).board} | MCU: {(metadata as any).mcu}
																{/if}
															</div>
														{/if}
													</div>
													<button
														on:click={removeMetadataFile}
														disabled={isFlashing || isAutoSelectMode}
														class="text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
														title="Remove metadata file"
													>
														✕
													</button>
												</div>
											</div>
										{/if}

										<!-- Flash Address Fields -->
										{#if selectedFirmwareFiles.length > 0}
											<div>
												<div class="mb-1 flex items-center justify-between">
													<span class="text-sm font-medium text-gray-300">
														{$locales('customfirmware.flash_addresses')}
													</span>
													<span class="text-xs text-gray-500">Format: 0x1000 or 4096</span>
												</div>
												<div class="max-h-60 overflow-y-auto space-y-2">
													{#each selectedFirmwareFiles as fileItem, index}
														<div
															class="flex items-center space-x-2 border p-2 {fileItem.hasError || (fileItem.isEnabled === false)
																? (fileItem.hasError ? 'border-red-600 bg-red-900/20' : 'border-gray-600 bg-gray-800 opacity-50')
																: 'border-gray-600 bg-gray-800'} group relative rounded-md"
														>
															<!-- Checkbox to enable/disable file -->
															<div class="flex flex-shrink-0 items-center">
																<input
																	type="checkbox"
																	bind:checked={fileItem.isEnabled}
																	disabled={isFlashing || isAutoSelectMode}
																	class="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
																	title="Enable/disable this file for flashing"
																/>
															</div>

															<!-- Download progress overlay -->
															{#if fileItem.isDownloading}
																<div
																	class="absolute inset-0 z-10 rounded-md transition-all duration-300"
																	style="
																		background: linear-gradient(to right,
																			rgba(59, 130, 246, 0.3) 0%,
																			rgba(59, 130, 246, 0.3) {fileItem.downloadProgress || 0}%,
																			rgba(0, 0, 0, 0.3) {fileItem.downloadProgress || 0}%,
																			rgba(0, 0, 0, 0.3) 100%
																		);
																	"
																></div>
															{/if}
															<div class="min-w-0 flex-1">
																<div class="flex items-center space-x-2">
																	<div class="truncate text-xs font-medium text-gray-300" title={fileItem.filename}>
																		{fileItem.filename}
																	</div>
																	{#if fileItem.hasError}
																		<div class="cursor-help text-red-400" title={fileItem.errorMessage}>
																			⚠️
																		</div>
																	{/if}
																</div>
																<div class="text-xs text-gray-500">
																	{fileItem.fileSize && fileItem.fileSize > 0 ? fileHandler.formatFileSize(fileItem.fileSize) : (fileItem.file?.size ? fileHandler.formatFileSize(fileItem.file.size) : '0 bytes')}
																</div>
															</div>
															<div class="flex flex-shrink-0 items-center space-x-2">
																<span class="text-xs text-gray-400"
																	>{$locales('customfirmware.address')}:</span
																>
																<input
																	type="text"
																	bind:value={fileItem.address}
																	placeholder="0x0"
																	disabled={isFlashing || isAutoSelectMode || fileItem.isEnabled === false}
																	class="w-24 rounded-md {espManager.isValidFlashAddress(fileItem.address)
																		? 'border-gray-600'
																		: 'border-red-500'} bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
																	on:change={(e) => {
																		if (!isAutoSelectMode && fileItem.isEnabled !== false) {
																			const input = e.target as HTMLInputElement;
																			const sanitized = espManager.sanitizeAddress(input.value);
																			fileItem.address = sanitized;
																		}
																	}}
																	title="{isAutoSelectMode || fileItem.isEnabled === false ? 'Address locked' : 'Enter address in hex (0x...) or decimal format'}"
																/>
															</div>
														</div>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{:else}
							<!-- Regular mode (non-AutoSelect) - show sections normally -->
							<!-- Metadata File Section -->
							{#if metadataFile}
								<div class="pt-3">
									<div class="mb-1 flex items-center justify-between">
										<span class="text-sm font-medium text-blue-300">Metadata File</span>
									</div>
									<div
										class="flex items-center space-x-2 rounded-md border border-blue-600 bg-blue-900/20 p-2"
									>
										<div class="min-w-0 flex-1">
											<div class="flex items-center space-x-2">
												<div class="text-blue-400" title="Metadata file for address prediction">
													📋
												</div>
												<div class="truncate text-xs font-medium text-blue-300" title={metadataFile.file.name}>
													{metadataFile.file.name}
												</div>
												<div class="text-xs text-gray-400">
													({fileHandler.formatFileSize(metadataFile.file.size)})
												</div>
											</div>
											{#if metadata}
												<div class="mt-1 text-xs text-gray-500">
													{#if (metadata as any).builds}
														<!-- Manifest format -->
														Version: {metadata.version} | Device: {(metadata as any).name} | Chip: {(metadata as any).builds[0]?.chipFamily}
													{:else}
														<!-- Legacy format -->
														Version: {metadata.version} | Board: {(metadata as any).board} | MCU: {(metadata as any).mcu}
													{/if}
												</div>
											{/if}
										</div>
										<button
											on:click={removeMetadataFile}
											disabled={isFlashing || isAutoSelectMode}
											class="text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
											title="Remove metadata file"
										>
											✕
										</button>
									</div>
								</div>
							{/if}

							<!-- Flash Address Fields -->
							{#if selectedFirmwareFiles.length > 0}
								<div class="max-h-60 overflow-y-auto pt-3">
									<div class="mb-1 flex items-center justify-between">
										<span class="text-sm font-medium text-gray-300">
											{$locales('customfirmware.flash_addresses')}
										</span>
										<span class="text-xs text-gray-500">Format: 0x1000 or 4096</span>
									</div>
									<div class="space-y-2">
										{#each selectedFirmwareFiles as fileItem, index}
											<div
												class="flex items-center space-x-2 border p-2 {fileItem.hasError || (fileItem.isEnabled === false)
													? (fileItem.hasError ? 'border-red-600 bg-red-900/20' : 'border-gray-600 bg-gray-800 opacity-50')
													: 'border-gray-600 bg-gray-800'} group relative rounded-md"
											>
												<!-- Checkbox to enable/disable file -->
												<div class="flex flex-shrink-0 items-center">
													<input
														type="checkbox"
														bind:checked={fileItem.isEnabled}
														disabled={isFlashing || isAutoSelectMode}
														class="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
														title="Enable/disable this file for flashing"
													/>
												</div>

												<!-- Download progress overlay -->
												{#if fileItem.isDownloading}
													<div
														class="absolute inset-0 z-10 rounded-md transition-all duration-300"
														style="
															background: linear-gradient(to right,
																rgba(59, 130, 246, 0.3) 0%,
																rgba(59, 130, 246, 0.3) {fileItem.downloadProgress || 0}%,
																rgba(0, 0, 0, 0.3) {fileItem.downloadProgress || 0}%,
																rgba(0, 0, 0, 0.3) 100%
															);
														"
													></div>
												{/if}
												<div class="min-w-0 flex-1">
													<div class="flex items-center space-x-2">
														<div class="truncate text-xs font-medium text-gray-300" title={fileItem.filename}>
															{fileItem.filename}
														</div>
														{#if fileItem.hasError}
															<div class="cursor-help text-red-400" title={fileItem.errorMessage}>
																⚠️
															</div>
														{/if}
													</div>
													<div class="text-xs text-gray-500">
														{fileItem.fileSize && fileItem.fileSize > 0 ? fileHandler.formatFileSize(fileItem.fileSize) : fileHandler.formatFileSize(fileItem.file.size)}
													</div>
												</div>
												<div class="flex flex-shrink-0 items-center space-x-2">
													<span class="text-xs text-gray-400"
														>{$locales('customfirmware.address')}:</span
													>
													<input
														type="text"
														bind:value={fileItem.address}
														placeholder="0x0"
														disabled={isFlashing || isAutoSelectMode || fileItem.isEnabled === false}
														class="w-24 rounded-md {espManager.isValidFlashAddress(fileItem.address)
															? 'border-gray-600'
															: 'border-red-500'} bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
														on:change={(e) => {
															if (!isAutoSelectMode && fileItem.isEnabled !== false) {
																const input = e.target as HTMLInputElement;
																const sanitized = espManager.sanitizeAddress(input.value);
																fileItem.address = sanitized;
															}
														}}
														title="{isAutoSelectMode || fileItem.isEnabled === false ? 'Address locked' : 'Enter address in hex (0x...) or decimal format'}"
													/>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{:else}
								<!-- Empty space when no files selected -->
								<div></div>
							{/if}
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
							class="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 accent-blue-600"
						/>
						<label for="erase-before-flash" class="cursor-pointer text-sm text-gray-300">
							{$locales('customfirmware.erase_before_flash')}
						</label>
					</div>
				{/if}

				<!-- ZIP Extraction Status -->
				{#if isExtractingZip}
					<div class="space-y-2">
						<div class="text-sm font-medium text-blue-300">Extracting ZIP Archive...</div>
						<div role="status" aria-live="polite" class="rounded-md bg-blue-900 p-3">
							<div class="text-sm text-blue-200">Processing archive contents...</div>
							<div class="mt-2">
								<div
									role="progressbar"
									aria-valuenow={zipExtractionProgress}
									aria-valuemin="0"
									aria-valuemax="100"
									aria-label="ZIP extraction progress"
									class="h-2 w-full rounded-full bg-blue-800"
								>
									<div
										class="h-2 rounded-full bg-blue-500 animate-pulse"
										style="width: 100%"
									></div>
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if zipExtractionError}
					<div
						role="alert"
						aria-live="assertive"
						class="rounded-md border border-red-700 bg-red-900 p-3"
					>
						<div class="text-sm text-red-200">{zipExtractionError}</div>
					</div>
				{/if}

				<!-- File Download Error Status -->
				{#if downloadError}
					<div
						role="alert"
						aria-live="assertive"
						class="rounded-md border border-red-700 bg-red-900 p-3"
					>
						<div class="mb-2 text-sm font-medium text-red-200">{$locales('customfirmware.download_files_error')}</div>
						<div class="text-sm text-red-300">{downloadError}</div>
						{#if downloadErrors.length > 0}
							<div class="mt-2 text-xs text-red-400">
								{#each downloadErrors.slice(0, 3) as error}
									<div>{error}</div>
								{/each}
								{#if downloadErrors.length > 3}
									<div>... and {downloadErrors.length - 3} more errors</div>
								{/if}
							</div>
						{/if}
						<button
							on:click={startFileDownload}
							disabled={isDownloadingFiles}
							class="mt-3 rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
						>
							{$locales('customfirmware.retry_download_all')}
						</button>
					</div>
				{/if}

				<!-- Validation Error Status -->
				{#if selectedFirmwareFiles.length > 0 && !validationResult.isValid}
					<div
						role="alert"
						aria-live="assertive"
						class="rounded-md border border-red-700 bg-red-900 p-3"
					>
						<div class="text-sm text-red-200">
							{validationResult.errorMessage || getErrorMessage(validationResult.errorCode)}
						</div>
					</div>
				{/if}

				<!-- Partitions Compatibility Warning (Non-blocking) -->
				{#if partitionsCompatibilityWarning}
					<div
						role="alert"
						aria-live="polite"
						class="rounded-md border border-orange-700 bg-orange-900 p-3"
					>
						<div class="text-sm text-orange-200">
							{partitionsCompatibilityWarning}
						</div>
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
					on:click={async () => {
						if (isBackingUp) {
							cancelBackup();
						} else {
							await handleClose();
						}
					}}
					class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isFlashing && !isBackingUp}
					class:bg-red-500={isBackingUp}
					class:hover:bg-red-600={isBackingUp}
					class:text-white={isBackingUp}
				>
					{#if isBackingUp}
						{$locales('backupconfirm.cancel')}
					{:else}
						{$locales('common.cancel')}
					{/if}
				</button>

				{#if flashProgress === 100 && flashStatus.includes('successfully')}
					<!-- Show appropriate button after successful flash -->
					<button
						on:click={resetForAnotherFlash}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
					>
						{#if isAutoSelectMode}
							{$locales('customfirmware.select_different_device')}
						{:else}
							{$locales('customfirmware.flash_another_file')}
						{/if}
					</button>
				{:else}
					<button
						on:click={flashFirmware}
						disabled={selectedFirmwareFiles.length === 0 ||
							!isPortSelected ||
							isFlashing ||
							!validationResult.isValid ||
							selectedFirmwareFiles.some((file) => file.hasError) ||
							selectedFirmwareFiles.filter(f => f.isEnabled !== false).length === 0}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isFlashing}
							{$locales('customfirmware.flashing')}...
						{:else}
							{$locales('customfirmware.flash_firmware')} ({$locales('customfirmware.flash_firmware_with_count', {values: { count: selectedFirmwareFiles.filter(f => f.isEnabled !== false).length }})})
						{/if}
					</button>
				{/if}

				{#if experimentalFeatures}
					<!-- Terminal button - experimental feature -->
					<button
						on:click={async () => {
							// Close the current connection properly
							await espManager.resetPort();

							// Reset flags to reflect that we're no longer connected in this component
							isPortSelected = false;
							deviceInfo = null;

							// Open terminal modal (it will request its own port)
							showTerminalModal = true;
						}}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
						title={$locales('customfirmware.terminal')}
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</button>
				{/if}
			</div>
			{#if isPortSelected && deviceInfo}
				<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
					<div class="mb-3 text-sm font-medium text-orange-300">{$locales('customfirmware.device_information')}</div>
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
						{#if deviceInfo.psramSize}
							<div><strong>PSRAM Size:</strong> {deviceInfo.psramSize}</div>
						{/if}
						{#if deviceInfo.mac !== 'Unknown'}
							<div><strong>MAC:</strong> {deviceInfo.mac}</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Backup Confirmation Modal -->
	<BackupConfirmModal
		isOpen={showBackupConfirm}
		deviceInfo={deviceInfo}
		flashSizeBytes={deviceInfo ? parseFlashSize(deviceInfo.flashSize) : 0}
		onConfirm={backupMemory}
		onCancel={() => (showBackupConfirm = false)}
	/>

	<!-- Terminal Modal -->
	<TerminalModal
		isOpen={showTerminalModal}
		onClose={() => showTerminalModal = false}
	/>
{/if}
