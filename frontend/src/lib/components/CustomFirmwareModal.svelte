<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { _ as locales } from 'svelte-i18n';
    import {
        createESPManager,
        getMeshtasticFlashAddress,
        validateFirmwareSelection,
        parseFirmwareMetadata,
        classifyFile,
        extractFilenameFromManifestPath,
        FirmwareFileType
    } from '$lib/utils/esp.js';
    import { createFirmwareFileHandler } from '$lib/utils/fileHandler.js';
    import { apiService } from '$lib/api.js';
    import type {
        FirmwareFile,
        FirmwareMetadataExtended,
        MemorySegment,
        SelectedFirmwareFile
    } from '$lib/types.js';
    import { ValidationErrors } from '$lib/types.js';
    import {
        parsePartitionsWithValidation,
        formatAnalysis,
        type PartitionTable,
        type PartitionAnalysis
    } from '$lib/utils/partitionParser.js';
    import MemoryMap from '$lib/components/MemoryMap.svelte';
    import BackupConfirmModal from '$lib/components/BackupConfirmModal.svelte';
    import TerminalModal from '$lib/components/TerminalModal.svelte';
    import FlashLog from '$lib/components/FlashLog.svelte';
    import ModalWindowControls from '$lib/components/ModalWindowControls.svelte';
    import ModalShareFallback from '$lib/components/ModalShareFallback.svelte';
    import { createFlashLogger } from '$lib/utils/flashLog.js';
    import { selectionState, availableSources } from '$lib/stores.js';
    import { RepositoryType } from '$lib/types.js';
    import { EXTERNAL_LINKS } from '$lib/utils/externalLinks.js';
    import { getRepositoryType } from '$lib/utils/repository.js';

    // External links
    const MESHCORE_CONFIGURATOR_URL = 'https://config.meshcore.io';
    const MESHTASTIC_FLASHER_URL = EXTERNAL_LINKS.MESHTASTIC.FLASHER;

    // Dynamic imports to avoid conflicts with +page.svelte. Held in $state so the
    // direct component tags below re-render once the lazy import resolves.
    let MeshtasticDeviceModal = $state<any>(null);
    let MeshcoreConfigModal = $state<any>(null);

    interface Props {
        isOpen?: boolean;
        onClose?: () => void;
        preloadedFilesWithOffsets?: {
            file: FirmwareFile;
            address: string;
            filename: string;
        }[];
        isAutoSelectMode?: boolean;
        manifestData?: any;
    }

    let {
        isOpen = false,
        onClose = () => {},
        preloadedFilesWithOffsets = [],
        isAutoSelectMode = false,
        manifestData = null
    }: Props = $props();

    // Share fallback URL surfaced by the header controls cluster (task 83).
    let shareFallbackUrl = $state<string | null>(null);

    // Create utility instances
    const espManager = createESPManager();
    const fileHandler = createFirmwareFileHandler();
    // Flash log state + logic (factory follows createESPManager/createFirmwareFileHandler pattern)
    const logger = createFlashLogger();

    // Component state
    // Multiple files with addresses
    let selectedFirmwareFiles = $state<SelectedFirmwareFile[]>([]);
    let isFlashing = $state(false);
    let flashProgress = $state(0);
    // Per-segment fill fraction (0..1) during flashing; key = segment filename.
    // Updated in flashFirmware onProgress; reset on start / resetForAnotherFlash / resetPort.
    let segmentFill = $state(new Map<string, number>());
    // Throttle step for segment fill updates (percentage points of the current file)
    const FILL_PROGRESS_STEP = 3;
    let flashStatus = $state('');
    let flashError = $state('');
    let eraseBeforeFlash = $state(false); // New parameter for checkbox
    let selectedBaudrate = $state(512000); // Default selected speed

    // NOTE: the selected baudrate is NOT applied to a live connection anymore.
    // Each operation (flash/backup) opens its own loader session at
    // `selectedBaudrate` and closes the port afterwards (session-less model
    // in esp.ts) - mid-session baudrate changes are unreliable in esptool-js.

    // Memory backup state
    let isBackingUp = $state(false);
    let showBackupConfirm = $state(false); // Confirm dialog state
    let backupAbortController = $state<AbortController | null>(null); // For cancelling backup

    // ZIP extraction state
    let isExtractingZip = $state(false);
    let zipExtractionProgress = $state(0);
    let zipExtractionError = $state('');

    // File download state
    let isDownloadingFiles = $state(false);
    let downloadError = $state('');
    let downloadAbortController = $state<AbortController | null>(null);
    let downloadCompleted = $state(false);

    // Validation state
    let validationResult = $state<{
        isValid: boolean;
        errorCode?: any;
        conflictingFiles?: string[];
        errorMessage?: string;
    }>({ isValid: true });

    // Metadata state
    let metadataFile = $state<FirmwareFile | null>(null);
    // Support both .mt.json and manifest.json
    let metadata = $state<FirmwareMetadataExtended | null>(null);

    // Partitions table state
    let partitionsTable = $state<PartitionTable | null>(null);

    // New variables for new logic
    let isPortSelected = $state(false);
    let deviceInfo = $state<any>(null); // Device information
    let isConnecting = $state(false);
    let showInstructions = $state(false); // Control instructions spoiler
    let showFileDetails = $state(false); // Control file details spoiler in AutoSelect mode
    let autoPortSelectionTriggered = $state(false); // Flag for tracking automatic port selection
    let showTerminalModal = $state(false); // Terminal modal state
    let showMeshtasticModal = $state(false); // Meshtastic device modal state
    let showMeshcoreConfigModal = $state(false); // Meshcore config modal state
    // When true, the next MeshcoreConfigModal open auto-opens the coordinate map
    // picker. Set by the 📍 shortcut inside the merged Configure button.
    let meshcoreAutoOpenPicker = $state(false);

    // Reference to file input to replace document.getElementById
    let fileInput = $state<HTMLInputElement | null>(null);

    // Function to dynamically load MeshtasticDeviceModal
    async function openMeshtasticModal() {
        if (!MeshtasticDeviceModal) {
            MeshtasticDeviceModal = (await import('$lib/components/MeshtasticDeviceModal.svelte'))
                .default;
        }
        showMeshtasticModal = true;
    }

    // Function to dynamically load MeshcoreConfigModal
    async function openMeshcoreConfigModal() {
        if (!MeshcoreConfigModal) {
            MeshcoreConfigModal = (await import('$lib/components/MeshcoreConfigModal.svelte'))
                .default;
        }
        showMeshcoreConfigModal = true;
    }

    // Get baudrate options from utility
    const baudrateOptions = espManager.getBaudrateOptions().map((opt) => ({
        ...opt,
        label: $locales(opt.labelKey)
    }));

    // The user's chosen baudrate persists in localStorage: the last selected
    // speed becomes the default for every future flashing session. A saved
    // value that is no longer among the options is ignored.
    const BAUDRATE_STORAGE_KEY = 'esp-baudrate';
    if (typeof localStorage !== 'undefined') {
        const savedBaudrate = Number(localStorage.getItem(BAUDRATE_STORAGE_KEY));
        if (baudrateOptions.some((opt) => opt.value === savedBaudrate)) {
            selectedBaudrate = savedBaudrate;
        }
    }

    function saveBaudrate(event: Event): void {
        const select = event.currentTarget as HTMLSelectElement;
        localStorage.setItem(BAUDRATE_STORAGE_KEY, String(select.value));
    }

    // Handle manifest data in AutoSelect mode
    $effect(() => {
        if (isAutoSelectMode && manifestData && !metadataFile) {
            // Create a virtual metadata file from manifest data
            const manifestContent = JSON.stringify(manifestData, null, 2);
            const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
            const manifestFile = new File([manifestBlob], 'manifest.json', {
                type: 'application/json'
            });

            metadataFile = fileHandler.createFirmwareFile(manifestFile);
            metadata = parseFirmwareMetadata(manifestContent);
        }
    });

    // Also handle initial mount
    onMount(() => {
        if (isAutoSelectMode && preloadedFilesWithOffsets.length > 0) {
            selectedFirmwareFiles = preloadedFilesWithOffsets.map((item) => ({
                filename: item.filename,
                address: item.address,
                file: item.file, // File object
                hasDownloadError: false,
                downloadErrorMessage: '',
                hasValidationError: false,
                validationErrorMessage: '',
                isRetryable: false,
                isEnabled: true, // File is enabled by default
                userEdited: false
            }));
        }
    });

    // Reactive: Start file download when modal opens in AutoSelect mode
    $effect(() => {
        if (
            isOpen &&
            isAutoSelectMode &&
            manifestData &&
            !isDownloadingFiles &&
            !downloadError &&
            !downloadCompleted
        ) {
            startFileDownload();
        }
    });

    // Reactive: Auto-start port selection when modal opens in AutoSelect mode (parallel to download)
    $effect(() => {
        if (
            isOpen &&
            isAutoSelectMode &&
            !isPortSelected &&
            !isConnecting &&
            !autoPortSelectionTriggered
        ) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                autoPortSelectionTriggered = true;
                selectPort();
            }, 100);
        }
    });

    // Clean up on unmount
    onDestroy(async () => {
        await espManager.resetPort();
    });

    // Format elapsed milliseconds as "12.3s" or "2:05 min"
    function formatElapsed(ms: number): string {
        const seconds = ms / 1000;
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${String(Math.round(seconds - minutes * 60)).padStart(2, '0')} min`;
    }

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

    // Copy full flash log to clipboard (for bug reports)
    async function copyLogToClipboard() {
        try {
            await navigator.clipboard.writeText(logger.getCopyText());
        } catch (error) {
            console.error('Failed to copy flash log:', error);
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

        logger.info(
            $locales('customfirmware.log_files_selected', { values: { count: files.length } })
        );

        // Collect all files to process (including extracted from ZIPs)
        let allFiles: File[] = [];

        // First pass: handle ZIP files and collect regular files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (fileHandler.isZipFile(file)) {
                // Extract ZIP archive
                isExtractingZip = true;
                zipExtractionProgress = 0;
                logger.info($locales('customfirmware.log_zip_extracting'));

                try {
                    const extractionResult = await fileHandler.processZipArchive(file);
                    allFiles = allFiles.concat(extractionResult.extractedFiles);

                    logger.success(
                        $locales('customfirmware.log_zip_extracted', {
                            values: {
                                extracted: extractionResult.extractedCount,
                                skipped: extractionResult.skippedCount
                            }
                        })
                    );

                    // Show info about extraction
                    if (extractionResult.skippedCount > 0) {
                        console.info(
                            `ZIP extraction: ${extractionResult.extractedCount} files extracted, ${extractionResult.skippedCount} files skipped`
                        );
                    }
                } catch (error) {
                    zipExtractionError = `Failed to extract ZIP file: ${error}`;
                    logger.error(
                        $locales('customfirmware.log_zip_extract_failed', {
                            values: { error: String(error) }
                        })
                    );
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
            logger.error($locales('customfirmware.log_partitions_error_multiple'));
            return;
        }

        // Multiple metadata files are not allowed (only one wins, others must be flagged)
        if (metadataFiles.length > 1) {
            logger.error($locales('customfirmware.log_metadata_error_multiple'));
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
                        logger.info(
                            $locales('customfirmware.log_metadata_found', {
                                values: {
                                    summary:
                                        `manifest.json (${(parsedMetadata as any).name ?? ''} ${(parsedMetadata as any).version ?? ''})`.trim()
                                }
                            })
                        );
                        break; // Stop searching, found highest priority
                    } else if (!metadata) {
                        // This is FirmwareMetadata (.mt.json) - use as fallback
                        metadataFile = tempFile;
                        metadata = parsedMetadata;
                        logger.info(
                            $locales('customfirmware.log_metadata_found', {
                                values: {
                                    summary:
                                        `${file.name} (${(parsedMetadata as any).board ?? ''} ${(parsedMetadata as any).mcu ?? ''})`.trim()
                                }
                            })
                        );
                    }
                } catch (error) {
                    // Skip invalid metadata files
                    console.error(`Failed to parse metadata file ${file.name}:`, error);
                    logger.error(
                        $locales('customfirmware.log_metadata_parse_error', {
                            values: { error: String(error) }
                        })
                    );
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
                    const arrayBuffer = await fileHandler.readFileAsArrayBuffer(
                        fileHandler.createFirmwareFile(file)
                    );
                    partitionsTable = parsePartitionsWithValidation(arrayBuffer);
                    console.log(
                        `[Partitions.bin] Parsed successfully: ${partitionsTable.entries.length} entries`
                    );

                    // Debug: log all partitions
                    console.log('[Partitions.bin] All entries:');
                    partitionsTable.entries.forEach((entry) => {
                        const typeName = entry.type_val === 0x00 ? 'APP' : 'DATA';
                        console.log(
                            `  - offset=0x${entry.offset.toString(16).toUpperCase()}, type=${typeName} (0x${entry.type_val.toString(16)}), subtype=0x${entry.subtype.toString(16)}, size=${entry.size}, name=${entry.name}`
                        );
                    });
                } catch (error) {
                    // Graceful degradation on parse error
                    console.error(`[Partitions.bin] Failed to parse:`, error);
                    flashError = `⚠️ Failed to parse partitions.bin: ${error instanceof Error ? error.message : String(error)}. Using filename patterns.`;
                    logger.error(
                        $locales('customfirmware.log_partitions_parse_error', {
                            values: {
                                error: error instanceof Error ? error.message : String(error)
                            }
                        })
                    );
                    partitionsTable = null;
                    // Continue processing - will fall back to filename patterns
                }

                // Add partitions.bin to the flash list (it should be flashed to 0x8000)
                const partitionsFirmwareFile = fileHandler.createFirmwareFile(file);
                const partitionsIsEmpty = partitionsFirmwareFile.size === 0;
                selectedFirmwareFiles.push({
                    filename: file.name,
                    address: '0x8000', // Default partitions offset
                    file: partitionsFirmwareFile,
                    hasDownloadError: partitionsIsEmpty,
                    downloadErrorMessage: partitionsIsEmpty
                        ? $locales('customfirmware.empty_file')
                        : '',
                    hasValidationError: false,
                    validationErrorMessage: '',
                    isRetryable: false, // Local 0-byte file is NOT retryable
                    isEnabled: true,
                    userEdited: false
                });
            } else if (fileHandler.isFirmwareFile(file)) {
                // Handle firmware file
                const firmwareFirmwareFile = fileHandler.createFirmwareFile(file);
                const firmwareIsEmpty = firmwareFirmwareFile.size === 0;
                selectedFirmwareFiles.push({
                    filename: file.name,
                    address: '0x0', // Default address in hex format
                    file: firmwareFirmwareFile,
                    hasDownloadError: firmwareIsEmpty,
                    downloadErrorMessage: firmwareIsEmpty
                        ? $locales('customfirmware.empty_file')
                        : '',
                    hasValidationError: false,
                    validationErrorMessage: '',
                    isRetryable: false, // Local 0-byte file is NOT retryable
                    isEnabled: true, // File is enabled by default
                    userEdited: false
                });
            }
        }

        // Always trigger address update when files are selected (works with filename only)
        if (selectedFirmwareFiles.length > 0) {
            logger.info(
                $locales('customfirmware.log_firmware_files_found', {
                    values: { count: selectedFirmwareFiles.length }
                })
            );
            for (const f of selectedFirmwareFiles) {
                logger.info(
                    $locales('customfirmware.log_file_info', {
                        values: {
                            filename: f.filename,
                            size: fileHandler.formatFileSize(f.file.size)
                        }
                    })
                );
            }
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

    // Toggle file enabled/disabled state for flashing
    function toggleFileEnabled(index: number) {
        selectedFirmwareFiles = selectedFirmwareFiles.map((f, i) =>
            i === index ? { ...f, isEnabled: f.isEnabled === false } : f
        );
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
        // Guard against double activation: the auto-select reactive
        // (setTimeout) can race a user click on the "Select port" button and
        // launch two concurrent detections on the same serial port.
        if (isConnecting || isFlashing) return;

        isConnecting = true;
        flashStatus = 'Selecting port...';
        flashError = '';
        logger.info($locales('customfirmware.log_selecting_port'));

        try {
            const connected = await espManager.connectToPort();

            if (connected) {
                flashStatus = 'Connecting to device...';
                logger.info($locales('customfirmware.log_connecting_to_device'));

                // Get device info
                const detectedDeviceInfo = await espManager.getDeviceInfo();

                if (detectedDeviceInfo) {
                    isPortSelected = true;
                    deviceInfo = detectedDeviceInfo;
                    flashStatus = 'Device connected successfully';
                    logger.success(
                        $locales('customfirmware.log_device_connected', {
                            values: {
                                chip: detectedDeviceInfo.chip,
                                flashSize: detectedDeviceInfo.flashSize,
                                psram: detectedDeviceInfo.psramSize
                                    ? $locales('customfirmware.log_psram', {
                                          values: { size: detectedDeviceInfo.psramSize }
                                      })
                                    : '',
                                mac:
                                    detectedDeviceInfo.mac !== 'Unknown'
                                        ? $locales('customfirmware.log_mac', {
                                              values: { mac: detectedDeviceInfo.mac }
                                          })
                                        : ''
                            }
                        })
                    );

                    // Update addresses with device info
                    if (selectedFirmwareFiles.length > 0) {
                        updateFlashAddresses();
                    }
                } else {
                    // Device detection failed
                    isPortSelected = false;
                    deviceInfo = null;
                    logger.error(flashError || $locales('customfirmware.log_device_not_detected'));
                    // flashError is already set in getDeviceInfo
                }
            }
        } catch (error) {
            flashError = `Failed to connect: ${error}`;
            logger.error(
                $locales('customfirmware.log_connect_failed', {
                    values: { error: String(error) }
                })
            );
        } finally {
            isConnecting = false;
        }
    }

    // Reset file selection for flashing another file
    async function resetForAnotherFlash() {
        // Insert session separator — keep history, do NOT clear
        logger.addSeparator($locales('customfirmware.log_session_separator'));

        if (isAutoSelectMode) {
            // In AutoSelect mode, reset port and status but keep files
            isPortSelected = false;
            deviceInfo = null;
            isConnecting = false;
            flashProgress = 0;
            segmentFill = new Map();
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
            segmentFill = new Map();
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
        segmentFill = new Map();
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

        // Full log clear on disconnect / modal close
        logger.clear();

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

    // Flash firmware or erase-only mode
    async function flashFirmware() {
        // Only use enabled files for flashing
        const enabledFiles = selectedFirmwareFiles.filter((f) => f.isEnabled !== false);

        // Check if we have firmware files selected OR erase-only mode
        const isEraseOnly = enabledFiles.length === 0 && eraseBeforeFlash;

        if (!isEraseOnly && enabledFiles.length === 0) {
            flashError = 'Please select at least one firmware file (.bin)';
            logger.warning($locales('customfirmware.log_no_firmware_selected'));
            return;
        }

        if (!isPortSelected || !espManager.getCurrentPort()) {
            flashError = 'Please select a port first';
            logger.warning($locales('customfirmware.log_no_port_selected'));
            return;
        }

        // Validate all addresses for enabled files (skip validation in erase-only mode)
        if (!isEraseOnly) {
            for (let i = 0; i < enabledFiles.length; i++) {
                const fileItem = enabledFiles[i];
                if (!espManager.isValidFlashAddress(fileItem.address)) {
                    flashError = `Invalid address format for file "${fileItem.filename}": ${fileItem.address}. Please enter a valid address (e.g., 0x0, 0x1000, 4096)`;
                    logger.warning(
                        $locales('customfirmware.log_invalid_address', {
                            values: { filename: fileItem.filename, address: fileItem.address }
                        })
                    );
                    return;
                }
            }
        }

        isFlashing = true;
        flashProgress = 0;
        segmentFill = new Map();
        flashStatus = 'Starting flash process...';
        flashError = '';

        logger.info(
            $locales('customfirmware.log_flash_start', {
                values: {
                    count: isEraseOnly ? 0 : enabledFiles.length,
                    erase: eraseBeforeFlash ? $locales('customfirmware.log_flash_start_erase') : ''
                }
            })
        );

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
            if (!isEraseOnly) {
                for (const fileItem of sortedFiles) {
                    totalVolume += fileItem.file.size;
                }
            } else {
                // In erase-only mode, totalVolume is just flashSizeBytes
            }

            // Fixed progress ranges: 0-5% (preparation), 5-95% (work), 95-100% (finalization)
            flashProgress = 0;
            flashStatus = 'Starting flash process...';

            // Erase volume is processed first; file progress continues after it
            const willErase = eraseBeforeFlash && flashSizeBytes > 0;
            let cumulativeProcessed = willErase ? flashSizeBytes : 0;
            // Per-file throttling tracker for segment fill updates (reset on each file start)
            let lastSegmentPercent: number | undefined;
            let fileStartTime = 0;

            // Read all file contents up front, before the loader session opens
            const flashEntries: {
                data: Uint8Array;
                address: string;
                filename: string;
                size: number;
            }[] = [];
            for (const fileItem of sortedFiles) {
                const content = new Uint8Array(
                    await fileHandler.readFileAsArrayBuffer(fileItem.file)
                );
                flashEntries.push({
                    data: content,
                    address: fileItem.address, // Already in hex format
                    filename: fileItem.filename,
                    size: fileItem.file.size
                });
            }

            logger.info(
                $locales('customfirmware.log_baudrate_set', {
                    values: { baud: selectedBaudrate }
                })
            );

            if (willErase) {
                logger.info($locales('customfirmware.log_erase_start'));
            }

            // Single loader session: optional erase + all files in one writeFlash.
            // The session opens at the selected baudrate and closes afterwards.
            await espManager.flashFiles(flashEntries, {
                baudrate: selectedBaudrate,
                eraseBeforeFlash: willErase,
                onEraseProgress: (progress) => {
                    // Erase progress 0-100 maps to 5-95% range
                    const eraseProgress =
                        (progress.progress / 100) * (flashSizeBytes / totalVolume);
                    flashProgress = Math.round(5 + eraseProgress * 90);
                    flashStatus = `Erasing flash... ${progress.progress}%`;
                    // Throttled progress log (erase emits only 0% and 100%)
                    logger.progress(
                        'erase',
                        progress.progress,
                        $locales('customfirmware.log_erase_progress', {
                            values: { percent: progress.progress }
                        })
                    );
                    if (progress.error) {
                        flashError = progress.error;
                        logger.error(
                            $locales('customfirmware.log_progress_error', {
                                values: { error: progress.error }
                            })
                        );
                    }
                },
                onFileProgress: (event) => {
                    const fileItem = sortedFiles[event.index];

                    if (event.phase === 'start') {
                        lastSegmentPercent = undefined;
                        fileStartTime = Date.now();
                        flashStatus = `Flashing file ${event.index + 1}/${totalFiles}: ${event.filename} @ ${event.address}...`;
                        logger.info(
                            $locales('customfirmware.log_flash_file_start', {
                                values: {
                                    index: event.index + 1,
                                    total: totalFiles,
                                    filename: event.filename,
                                    address: event.address,
                                    size: fileHandler.formatFileSize(fileItem.file.size)
                                }
                            })
                        );
                        // Show the segment as soon as its file starts
                        segmentFill.set(event.filename, 0);
                        return;
                    }

                    if (event.phase === 'done') {
                        // Add completed file to cumulative processed
                        cumulativeProcessed += fileItem.file.size;
                        flashProgress = Math.round(5 + (cumulativeProcessed / totalVolume) * 90);
                        logger.success(
                            $locales('customfirmware.log_flash_file_done', {
                                values: {
                                    filename: event.filename,
                                    time: formatElapsed(Date.now() - fileStartTime)
                                }
                            })
                        );
                        // Ensure the completed file is fully filled (fraction = 1)
                        segmentFill.set(event.filename, 1);
                        return;
                    }

                    // 'progress': file progress 0-100 maps to portion of 5-95% range
                    const fileSize = fileItem.file.size;
                    const processedBytes = cumulativeProcessed + (event.progress / 100) * fileSize;
                    flashProgress = Math.round(5 + (processedBytes / totalVolume) * 90);
                    flashStatus = `Flashing file ${event.index + 1}/${totalFiles}: ${event.filename} @ ${event.address} - ${event.progress}%`;
                    // Throttled progress log (10 p.p. step per-file key)
                    logger.progress(
                        `flash:${event.filename}`,
                        event.progress,
                        $locales('customfirmware.log_flash_file_progress', {
                            values: {
                                filename: event.filename,
                                percent: event.progress
                            }
                        })
                    );

                    // Throttled fill update: only on STEP boundary or at file start/end.
                    const fraction = event.progress / 100;
                    if (
                        lastSegmentPercent === undefined ||
                        event.progress - lastSegmentPercent >= FILL_PROGRESS_STEP ||
                        event.progress >= 100 ||
                        event.progress === 0
                    ) {
                        lastSegmentPercent = event.progress;
                        segmentFill.set(event.filename, fraction);
                    }
                }
            });

            // The device was rebooted inside flashFiles() (RTS pulse) so the
            // new firmware starts right away
            logger.info($locales('customfirmware.log_device_reset'));

            if (willErase) {
                logger.success($locales('customfirmware.log_erase_done'));
            }

            // Step 3: Finalization (95-100%)
            flashProgress = 95;
            flashStatus = 'Finalizing...';
            flashProgress = 100;
            // Different status messages for erase-only vs flash modes
            flashStatus = isEraseOnly
                ? $locales('customfirmware.erase_success')
                : 'All files flashed successfully!';
            logger.success(
                isEraseOnly
                    ? $locales('customfirmware.log_erase_success')
                    : $locales('customfirmware.log_flash_complete')
            );
        } catch (error) {
            console.error('Flash error:', error);
            flashError = error instanceof Error ? error.message : String(error);
            logger.error(
                $locales('customfirmware.log_flash_failed', {
                    values: { error: error instanceof Error ? error.message : String(error) }
                })
            );
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
        logger.warning($locales('customfirmware.log_backup_cancelled'));
    }

    // Backup device memory
    async function backupMemory() {
        if (!isPortSelected || !deviceInfo || !espManager.getCurrentPort()) {
            flashError = 'Please select a port first';
            logger.warning($locales('customfirmware.log_no_port_selected'));
            return;
        }

        // Parse flash size to bytes
        const flashSizeBytes = parseFlashSize(deviceInfo.flashSize);
        console.log(
            `Backup memory: deviceInfo.flashSize=${deviceInfo.flashSize}, flashSizeBytes=${flashSizeBytes}`
        );

        // Create abort controller for this backup
        backupAbortController = new AbortController();

        isBackingUp = true;
        isFlashing = true; // Use same flag to disable other actions
        flashProgress = 0;
        flashStatus = $locales('customfirmware.backup_status');
        flashError = '';
        showBackupConfirm = false; // Close confirm dialog

        logger.info(
            $locales('customfirmware.log_backup_start', {
                values: { size: deviceInfo.flashSize }
            })
        );
        logger.info(
            $locales('customfirmware.log_baudrate_set', {
                values: { baud: selectedBaudrate }
            })
        );

        try {
            // Read flash memory with progress tracking and abort signal.
            // Runs in its own loader session at the selected baudrate.
            const { data: flashData, flashId } = await espManager.readFlashMemory(flashSizeBytes, {
                baudrate: selectedBaudrate,
                onProgress: (progress) => {
                    console.log(
                        `Backup progress update: ${progress.progress}% - ${progress.status}`
                    );
                    flashProgress = progress.progress;
                    flashStatus = progress.status;
                    // Throttled progress log (10 p.p. step)
                    logger.progress(
                        'read:backup',
                        progress.progress,
                        $locales('customfirmware.log_backup_progress', {
                            values: { percent: progress.progress }
                        })
                    );
                    if (progress.error) {
                        flashError = progress.error;
                        logger.error(
                            $locales('customfirmware.log_progress_error', {
                                values: { error: progress.error }
                            })
                        );
                    }
                },
                abortSignal: backupAbortController.signal
            });

            if (flashId && flashId !== 'Unknown') {
                logger.info(
                    $locales('customfirmware.log_backup_flash_id', { values: { id: flashId } })
                );
            }

            // Check if was cancelled during operation
            if (backupAbortController.signal.aborted) {
                throw new Error('Backup cancelled');
            }

            // Generate filename with flash ID
            const filename = espManager.generateDumpFilename(
                deviceInfo.chip,
                deviceInfo.flashSize,
                flashId
            );

            // Create blob and trigger download
            const blob = new Blob([flashData as unknown as BlobPart], {
                type: 'application/octet-stream'
            });

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
            logger.success($locales('customfirmware.log_backup_saved', { values: { filename } }));
        } catch (error) {
            console.error('Backup error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Don't show error if user cancelled
            if (errorMessage !== 'Backup cancelled' && errorMessage !== 'Backup cancelled') {
                flashError = errorMessage;
                logger.error(
                    $locales('customfirmware.log_backup_failed', {
                        values: { error: errorMessage }
                    })
                );
            }
        } finally {
            isBackingUp = false;
            isFlashing = false;
            backupAbortController = null;
        }
    }

    // Start file download for AutoSelect mode.
    // On retry path, successful files are preserved (not re-downloaded);
    // only entries with `hasDownloadError` or empty content are re-fetched.
    async function startFileDownload() {
        if (!manifestData || isDownloadingFiles) return;

        isDownloadingFiles = true;
        downloadError = '';
        downloadCompleted = false; // Reset for retry
        downloadAbortController = new AbortController();

        try {
            const parts = manifestData.builds[0].parts;

            logger.info(
                $locales('customfirmware.log_manifest_list_built', {
                    values: { count: parts.length }
                })
            );

            // Build placeholder list ONLY when there are no entries yet (initial run).
            // On retry, preserve successful entries and reset only the failed/empty ones.
            if (selectedFirmwareFiles.length !== parts.length) {
                selectedFirmwareFiles = parts.map((part: any) => {
                    const extractedFilename = extractFilenameFromManifestPath(part.path);
                    return {
                        filename: extractedFilename,
                        address: `0x${part.offset.toString(16)}`,
                        file: {
                            file: new File([], ''),
                            content: new Uint8Array(0),
                            size: 0,
                            name: extractedFilename
                        }, // Placeholder
                        hasDownloadError: false,
                        downloadErrorMessage: '',
                        hasValidationError: false,
                        validationErrorMessage: '',
                        isRetryable: false,
                        isDownloading: true,
                        downloadProgress: 0,
                        fileSize: 0,
                        isEnabled: true, // File is enabled by default
                        userEdited: false
                    };
                });
            } else {
                // Retry path: reset only entries that need re-download
                // (failed with hasDownloadError or empty content); keep successful ones untouched.
                selectedFirmwareFiles = selectedFirmwareFiles.map((entry, index) => {
                    const part = parts[index];
                    const needsRedownload = entry.hasDownloadError || entry.file?.size === 0;
                    if (!needsRedownload) {
                        return entry;
                    }
                    const extractedFilename = extractFilenameFromManifestPath(part.path);
                    return {
                        ...entry,
                        filename: extractedFilename,
                        hasDownloadError: false,
                        downloadErrorMessage: '',
                        isRetryable: false,
                        isDownloading: true,
                        downloadProgress: 0,
                        fileSize: 0
                    };
                });
            }

            // Download each file individually, skipping already-successful entries (on retry)
            const downloadPromises = parts.map(async (part: any, index: number) => {
                const current = selectedFirmwareFiles[index];
                if (!current.isDownloading && current.file?.size > 0 && !current.hasDownloadError) {
                    return; // Skip already-downloaded files on retry
                }

                const downloadFilename = extractFilenameFromManifestPath(part.path);
                logger.info(
                    $locales('customfirmware.log_download_start', {
                        values: { filename: downloadFilename }
                    })
                );

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
                            // Throttled progress log (percent of bytes; step 10 p.p.)
                            const totalForLog = total && total > 0 ? total : 0;
                            const percent = totalForLog
                                ? Math.round((progress / totalForLog) * 100)
                                : progress;
                            // NOTE: use `downloadFilename` (known before download), NOT the
                            // result `filename` — that const is in TDZ while this callback
                            // fires during the await, which would throw and break the download.
                            logger.progress(
                                `download:${downloadFilename}`,
                                percent,
                                $locales('customfirmware.log_download_progress', {
                                    values: { filename: downloadFilename, percent }
                                })
                            );
                        },
                        downloadAbortController as any
                    );

                    // Convert ArrayBuffer to File object
                    const file = new File([content], filename, {
                        type: 'application/octet-stream'
                    });
                    const firmwareFile = fileHandler.createFirmwareFile(file);

                    // Don't update if aborted
                    if (downloadAbortController?.signal.aborted) return;

                    // Update file entry with downloaded data
                    selectedFirmwareFiles[index] = {
                        ...selectedFirmwareFiles[index],
                        filename: filename,
                        file: firmwareFile,
                        hasDownloadError: false,
                        downloadErrorMessage: '',
                        isRetryable: false,
                        isDownloading: false,
                        downloadProgress: 100,
                        fileSize: content.byteLength
                    };
                    logger.success(
                        $locales('customfirmware.log_download_done', {
                            values: {
                                filename,
                                size: fileHandler.formatFileSize(content.byteLength)
                            }
                        })
                    );
                } catch (error) {
                    // Mark this file as failed but continue with others
                    const errorMessage = error instanceof Error ? error.message : String(error);

                    selectedFirmwareFiles[index] = {
                        ...selectedFirmwareFiles[index],
                        hasDownloadError: true,
                        downloadErrorMessage: $locales('customfirmware.download_error'),
                        downloadErrorCode: errorMessage,
                        isRetryable: true, // Network errors are retryable
                        isDownloading: false
                    };
                    logger.error(
                        $locales('customfirmware.log_download_failed', {
                            values: { filename: downloadFilename, error: errorMessage }
                        })
                    );
                }
            });

            // Wait for all downloads to complete (or fail)
            await Promise.allSettled(downloadPromises);

            // Check if any files failed to download
            const failedCount = selectedFirmwareFiles.filter((f) => f.hasDownloadError).length;
            const successCount = selectedFirmwareFiles.length - failedCount;
            if (failedCount > 0) {
                downloadError = $locales('customfirmware.download_failed_details', {
                    values: {
                        error: `${failedCount} ${$locales('customfirmware.file_details_count', {
                            values: { count: failedCount }
                        })}`
                    }
                });
                logger.warning(
                    $locales('customfirmware.log_download_summary', {
                        values: { success: successCount, failed: failedCount }
                    })
                );
            } else {
                downloadCompleted = true;
                logger.success(
                    $locales('customfirmware.log_download_summary', {
                        values: { success: successCount, failed: failedCount }
                    })
                );
            }
        } catch (error) {
            console.error('Download error:', error);
            downloadError = error instanceof Error ? error.message : String(error);
        } finally {
            isDownloadingFiles = false;
        }
    }

    // Retry downloading a single manifest part without touching other files.
    // Available only when the entry is marked retryable (network error, not a local 0-byte file).
    async function retrySingleFile(index: number) {
        if (!manifestData || isDownloadingFiles) return;
        const target = selectedFirmwareFiles[index];
        if (!target || !target.isRetryable) return;

        isDownloadingFiles = true;
        const part = manifestData.builds[0].parts[index];
        const abortController = new AbortController();
        downloadAbortController = abortController;

        // Reset target entry to placeholder state, keep address
        const extractedFilename = extractFilenameFromManifestPath(part.path);
        selectedFirmwareFiles[index] = {
            ...selectedFirmwareFiles[index],
            filename: extractedFilename,
            hasDownloadError: false,
            downloadErrorMessage: '',
            isRetryable: false,
            isDownloading: true,
            downloadProgress: 0,
            fileSize: 0
        };

        try {
            const { content, filename } = await apiService.downloadFromFileWithFilename(
                part.path,
                (progress, total) => {
                    selectedFirmwareFiles[index].downloadProgress = progress;
                    if (total && total > 0) {
                        selectedFirmwareFiles[index].fileSize = total;
                    }
                },
                abortController as any
            );

            const file = new File([content], filename, {
                type: 'application/octet-stream'
            });
            const firmwareFile = fileHandler.createFirmwareFile(file);

            selectedFirmwareFiles[index] = {
                ...selectedFirmwareFiles[index],
                filename: filename,
                file: firmwareFile,
                hasDownloadError: false,
                downloadErrorMessage: '',
                isRetryable: false,
                isDownloading: false,
                downloadProgress: 100,
                fileSize: content.byteLength
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Retry download error for part ${index}:`, errorMessage);

            selectedFirmwareFiles[index] = {
                ...selectedFirmwareFiles[index],
                hasDownloadError: true,
                downloadErrorMessage: $locales('customfirmware.download_error'),
                downloadErrorCode: errorMessage,
                isRetryable: true,
                isDownloading: false
            };
        } finally {
            isDownloadingFiles = false;
            downloadAbortController = null;
        }
    }

    // Update flash addresses using metadata and/or partition table.
    // Assigns the rebuilt list only when something actually changed so callers
    // running inside $effect (validation) settle instead of re-triggering forever.
    function updateFlashAddresses() {
        if (selectedFirmwareFiles.length === 0) return;
        if (isAutoSelectMode) return; // Don't override manifest addresses in AutoSelect mode

        // Get partitions table from enabled partitions.bin file (no hardcoded filename)
        const partitionsBin = selectedFirmwareFiles.find(
            (f) => classifyFile(f.filename) === FirmwareFileType.PARTITIONS && f.isEnabled !== false
        );

        let changed = false;
        const nextFiles = selectedFirmwareFiles.map((fileItem) => {
            // Skip address update if user manually edited this address
            if (fileItem.userEdited) {
                return fileItem;
            }

            const addressResult = getMeshtasticFlashAddress(
                fileItem.filename,
                metadata,
                partitionsBin ? partitionsTable : null
            );
            if (addressResult) {
                // Log the address basis per file once per (address, source) combination.
                // Dedup via loggedAddressKey on the file item — resets naturally when files
                // are re-added — so preset addresses are logged too, without spam on re-runs.
                const addressKey = `${addressResult.address}|${addressResult.source ?? 'unknown'}`;
                if (fileItem.loggedAddressKey !== addressKey) {
                    changed = true;
                    const source =
                        addressResult.source === 'metadata'
                            ? $locales('customfirmware.address_source_metadata')
                            : addressResult.source === 'partitions'
                              ? $locales('customfirmware.address_source_partitions')
                              : addressResult.source === 'pattern'
                                ? $locales('customfirmware.address_source_pattern')
                                : $locales('customfirmware.address_source_unknown');
                    logger.info(
                        $locales('customfirmware.log_address_determined', {
                            values: {
                                filename: fileItem.filename,
                                address: addressResult.address,
                                source
                            }
                        })
                    );
                }
                return {
                    ...fileItem,
                    address: addressResult.address,
                    loggedAddressKey: addressKey
                };
            }
            return fileItem;
        });
        if (changed) {
            selectedFirmwareFiles = nextFiles;
        }
    }

    // Previous reactive-validation signature — used to log ONLY on result change
    // (avoids spamming the log on every re-run when files/devices change).
    // Plain (non-reactive) on purpose: they are never rendered, only compared.
    let lastValidationErrorCode: number | undefined = undefined;
    let lastValidationIsValid: boolean | undefined = undefined;

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
            if (
                fileItem.address &&
                typeof fileItem.address === 'string' &&
                (fileItem.address.startsWith('0x') || fileItem.address.startsWith('0X'))
            ) {
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

        return segments.filter((segment) => segment !== null);
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

    // Calculate flash size from partitions.bin (reactive)
    // Only use partitionsTable if there's an enabled partitions.bin file in the list
    const flashSizeFromPartitions = $derived.by(() => {
        const enabledPartitionsBin = selectedFirmwareFiles.find(
            (f) => classifyFile(f.filename) === FirmwareFileType.PARTITIONS && f.isEnabled !== false
        );
        if (enabledPartitionsBin && partitionsTable) {
            try {
                const analysis = formatAnalysis(partitionsTable, false) as PartitionAnalysis;
                return analysis.flash_size_bytes;
            } catch (error) {
                console.error('[Flash size] Failed to calculate from partitions:', error);
                return null;
            }
        }
        return null;
    });

    // Reactive data for MemoryMap
    const totalMemorySize = $derived(
        deviceInfo
            ? parseFlashSize(deviceInfo.flashSize)
            : (metadata as any)?.builds
              ? parseFlashSize((metadata as any)?.builds[0]?.flashsize)
              : flashSizeFromPartitions || 4 * 1024 * 1024
    );
    const memorySegments = $derived(
        prepareMemorySegments(selectedFirmwareFiles.filter((f) => f.isEnabled !== false))
    );

    // Check partitions compatibility with device (reactive)
    const partitionsCompatibilityWarning = $derived.by(() => {
        if (flashSizeFromPartitions && deviceInfo?.flashSize) {
            const deviceFlashSize = parseFlashSize(deviceInfo.flashSize);
            if (flashSizeFromPartitions > deviceFlashSize) {
                const partitionsMB = Math.round(flashSizeFromPartitions / (1024 * 1024));
                const deviceMB = Math.round(deviceFlashSize / (1024 * 1024));
                return $locales('customfirmware.partitions_incompatible_warning', {
                    values: { partitionsMB, deviceMB }
                });
            }
        }
        return null;
    });

    // Calculate file count for File Details display
    const fileCount = $derived(selectedFirmwareFiles.length);

    // Number of files with download errors (for spoiler header badge)
    const failedFileCount = $derived(
        selectedFirmwareFiles.filter((f) => f.hasDownloadError).length
    );

    // Any enabled file with download or validation error blocks flashing
    const hasBlockingError = $derived(
        selectedFirmwareFiles.some(
            (f) => f.isEnabled !== false && (f.hasDownloadError || f.hasValidationError)
        )
    );

    // Number of enabled, ready-to-flash files (no download/validation error)
    const enabledNonEmptyCount = $derived(
        selectedFirmwareFiles.filter(
            (f) => f.isEnabled !== false && !f.hasDownloadError && !f.hasValidationError
        ).length
    );

    // meshcore room_server / repeater builds need device config after a successful
    // flash — suggest (and highlight) the MeshcoreConfigModal entry point then.
    const suggestDeviceConfig = $derived(
        flashProgress === 100 &&
            flashStatus.includes('successfully') &&
            getRepositoryType($availableSources, $selectionState.repository) ===
                RepositoryType.MESHCORE &&
            selectedFirmwareFiles.some((f) => /room_server|repeater/i.test(f.filename))
    );

    // Visual morph flag. The flash_another_file button is rendered only once
    // flashing succeeds, so tying the shrunk style directly to suggestDeviceConfig
    // would make it mount already shrunk — transition-all would have no prior
    // state and no animation would play. configSuggested lags suggestDeviceConfig
    // by one frame: the button mounts full-size, then this flips true and BOTH
    // buttons morph in parallel (one shrinks, the other grows).
    let configSuggested = $state(false);
    $effect(() => {
        if (suggestDeviceConfig && !configSuggested) {
            requestAnimationFrame(() => {
                if (suggestDeviceConfig) configSuggested = true;
            });
        } else if (!suggestDeviceConfig && configSuggested) {
            configSuggested = false;
        }
    });

    // Reactive: Validate files for conflicts and chip compatibility.
    // IMPORTANT: this block writes ONLY to hasValidationError / validationErrorMessage.
    // It MUST NOT overwrite hasDownloadError / downloadErrorMessage / isRetryable —
    // those are owned by the download source (handleFileSelect / startFileDownload / retrySingleFile).
    // Previously, this block reused a single `hasError`/`errorMessage` pair and erased
    // the download-error state on every successful validation pass.
    $effect(() => {
        if (selectedFirmwareFiles.length === 0) return;

        // Only validate enabled files
        const enabledFiles = selectedFirmwareFiles.filter((f) => f.isEnabled !== false);
        const validation = validateFirmwareSelection(
            enabledFiles.map((f) => ({ filename: f.filename })),
            metadata,
            deviceInfo?.chip
        );

        // Store validation result for button state
        validationResult = validation;

        // Log validation result ONLY when it changes (guard against spam on re-runs).
        // Open Question #11: without this guard, every reactive re-run would add a line.
        if (
            validation.isValid !== lastValidationIsValid ||
            validation.errorCode !== lastValidationErrorCode
        ) {
            lastValidationIsValid = validation.isValid;
            lastValidationErrorCode = validation.errorCode;
            if (validation.isValid) {
                logger.info($locales('customfirmware.log_validation_ok'));
            } else if (validation.errorCode === ValidationErrors.FILES_CONFLICT) {
                logger.warning(
                    $locales('customfirmware.log_validation_conflict', {
                        values: {
                            files: (validation.conflictingFiles ?? []).join(', ')
                        }
                    })
                );
            } else if (validation.errorCode === ValidationErrors.CHIP_MISMATCH) {
                logger.error(
                    $locales('customfirmware.log_validation_chip_mismatch', {
                        values: {
                            message:
                                validation.errorMessage || getErrorMessage(validation.errorCode)
                        }
                    })
                );
            }
        }

        // Write the per-file flags back. Assign only when a flag actually changed so
        // this effect settles instead of re-triggering itself with an equal array
        // (cyclic effects are not allowed in runes mode).
        let flagsChanged = false;
        const nextFiles = selectedFirmwareFiles.map((file) => {
            let hasValidationError = false;
            let validationErrorMessage = '';

            // Only validate enabled files
            if (file.isEnabled !== false && !validation.isValid) {
                if (
                    validation.errorCode === ValidationErrors.FILES_CONFLICT &&
                    validation.conflictingFiles
                ) {
                    // Mark only conflicting files as having errors
                    hasValidationError = validation.conflictingFiles.includes(file.filename);
                    validationErrorMessage = hasValidationError
                        ? getErrorMessage(ValidationErrors.FILES_CONFLICT)
                        : '';
                } else if (validation.errorCode === ValidationErrors.CHIP_MISMATCH) {
                    // For chip mismatch, don't mark individual files as error - this is a global validation issue
                    hasValidationError = false;
                    validationErrorMessage = '';
                } else {
                    // For other validation errors, mark all files as having error
                    hasValidationError = true;
                    validationErrorMessage =
                        validation.errorMessage || getErrorMessage(validation.errorCode);
                }
            }

            if (
                file.hasValidationError !== hasValidationError ||
                file.validationErrorMessage !== validationErrorMessage
            ) {
                flagsChanged = true;
                return { ...file, hasValidationError, validationErrorMessage };
            }
            return file;
        });
        if (flagsChanged) {
            selectedFirmwareFiles = nextFiles;
        }

        // Update flash addresses when file enable/disable changes
        updateFlashAddresses();
    });
</script>

{#if isOpen}
    <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onkeydown={(e) => e.key === 'Escape' && !isFlashing && handleClose()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
    >
        <div
            class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-orange-600 bg-gray-800 shadow-2xl shadow-orange-900/50"
        >
            {#snippet fileCard(fileItem: SelectedFirmwareFile, index: number)}
                <div
                    class="flex items-center space-x-2 border p-2 {fileItem.hasDownloadError ||
                    fileItem.hasValidationError ||
                    fileItem.isEnabled === false
                        ? fileItem.hasDownloadError || fileItem.hasValidationError
                            ? 'border-red-600 bg-red-900/20'
                            : 'border-gray-600 bg-gray-800 opacity-50'
                        : 'border-gray-600 bg-gray-800'} group relative rounded-md"
                >
                    <!-- Checkbox to enable/disable file -->
                    <div class="flex flex-shrink-0 items-center">
                        <input
                            type="checkbox"
                            checked={fileItem.isEnabled !== false}
                            onchange={() => toggleFileEnabled(index)}
                            disabled={isFlashing || isAutoSelectMode}
                            class="h-4 w-4 rounded border-gray-300 text-orange-600 accent-blue-600 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                            <div
                                class="truncate text-xs font-medium text-gray-300"
                                title={fileItem.filename}
                            >
                                {fileItem.filename}
                            </div>
                            {#if fileItem.hasDownloadError || fileItem.hasValidationError}
                                <div
                                    class="cursor-help text-red-400"
                                    title={fileItem.hasDownloadError
                                        ? fileItem.downloadErrorCode ||
                                          fileItem.downloadErrorMessage
                                        : fileItem.validationErrorMessage}
                                >
                                    ⚠️
                                </div>
                                {#if fileItem.hasDownloadError && fileItem.isRetryable}
                                    <button
                                        onclick={() => retrySingleFile(index)}
                                        disabled={isDownloadingFiles || isFlashing}
                                        class="text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                        title={$locales('customfirmware.retry_download')}
                                    >
                                        ↻
                                    </button>
                                {/if}
                            {/if}
                        </div>
                        <div
                            class="text-xs {fileItem.hasDownloadError
                                ? 'text-red-400'
                                : 'text-gray-500'}"
                        >
                            {#if fileItem.isDownloading}
                                {$locales('customfirmware.downloading')}
                            {:else if fileItem.hasDownloadError}
                                {fileItem.downloadErrorCode || fileItem.downloadErrorMessage}
                            {:else if fileItem.fileSize && fileItem.fileSize > 0}
                                {fileHandler.formatFileSize(fileItem.fileSize)}
                            {:else if fileItem.file?.size}
                                {fileHandler.formatFileSize(fileItem.file.size)}
                            {:else}
                                0 bytes
                            {/if}
                        </div>
                    </div>
                    <div class="flex flex-shrink-0 items-center space-x-2">
                        <span class="text-xs text-gray-400"
                            >{$locales('customfirmware.address')}:</span
                        >
                        <div class="relative flex items-center">
                            <input
                                type="text"
                                value={fileItem.address}
                                placeholder="0x0"
                                disabled={isFlashing ||
                                    isAutoSelectMode ||
                                    fileItem.isEnabled === false}
                                class="w-24 rounded-md {fileItem.userEdited
                                    ? 'pr-8 '
                                    : ''}{espManager.isValidFlashAddress(fileItem.address)
                                    ? 'border-gray-600'
                                    : 'border-red-500'} bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                oninput={(e) => {
                                    if (!isAutoSelectMode && fileItem.isEnabled !== false) {
                                        const input = e.target as HTMLInputElement;
                                        fileItem.address = input.value;
                                    }
                                }}
                                onchange={(e) => {
                                    if (!isAutoSelectMode && fileItem.isEnabled !== false) {
                                        const input = e.target as HTMLInputElement;
                                        const sanitized = espManager.sanitizeAddress(input.value);
                                        // Only mark as userEdited if value actually changed
                                        if (sanitized !== fileItem.address) {
                                            fileItem.address = sanitized;
                                            fileItem.userEdited = true;
                                        }
                                    }
                                }}
                                title={isAutoSelectMode || fileItem.isEnabled === false
                                    ? 'Address locked'
                                    : 'Enter address in hex (0x...) or decimal format'}
                            />
                            {#if fileItem.userEdited && !isAutoSelectMode && fileItem.isEnabled !== false}
                                <button
                                    onclick={() => {
                                        fileItem.userEdited = false;
                                        updateFlashAddresses();
                                    }}
                                    class="absolute right-1 text-gray-400 transition-colors hover:text-orange-400"
                                    title={$locales('customfirmware.auto_detect_address')}
                                >
                                    ↻
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/snippet}

            <!-- Header -->
            <div class="flex items-center justify-between border-b border-gray-700 p-6">
                <h2 id="modal-title" class="text-xl font-semibold text-orange-200">
                    {isAutoSelectMode
                        ? $locales('customfirmware.flash_device')
                        : $locales('customfirmware.flash_custom_firmware')}
                </h2>
                <!-- Window controls cluster (task 83): share copies the
                     ?m=custom-firmware link (recipient gets the start state);
                     the cross keeps the flashing guard of handleClose. -->
                <ModalWindowControls
                    shareId="custom-firmware"
                    bind:shareFallbackUrl={shareFallbackUrl}
                    onclose={handleClose}
                    closeDisabled={isFlashing}
                />
            </div>

            {#if shareFallbackUrl}
                <ModalShareFallback url={shareFallbackUrl} />
            {/if}

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
                    Use drag and drop or click to select firmware files or ZIP archives. Supported
                    formats: .bin, .mt.json, manifest.json, .zip
                </div>

                <!-- Two-column layout with independent left and right sides -->
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <!-- Left column: Port selection and options -->
                    <div class="space-y-3">
                        <!-- Port Selection Field -->
                        <div class="h-[100px]">
                            {#if !isPortSelected}
                                <button
                                    onclick={selectPort}
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
                                <div
                                    class="relative h-full rounded-lg border border-gray-600 bg-gray-800 p-4"
                                >
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
                                                <div>
                                                    <strong>Device:</strong>
                                                    {deviceInfo.chip}
                                                </div>
                                                {#if deviceInfo.flashSize !== 'Unknown'}
                                                    <div
                                                        class="flex items-center justify-between gap-2"
                                                    >
                                                        <div class="flex items-center gap-2">
                                                            <span
                                                                ><strong>Flash:</strong>
                                                                {deviceInfo.flashSize}</span
                                                            >
                                                            {#if deviceInfo.psramSize}
                                                                <span
                                                                    ><strong>PSRAM:</strong>
                                                                    {deviceInfo.psramSize}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                        <button
                                                            onclick={openBackupConfirm}
                                                            disabled={isFlashing || isBackingUp}
                                                            class="text-lg transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                                                            title="Сохранить дамп памяти устройства"
                                                        >
                                                            💾
                                                        </button>
                                                    </div>
                                                {:else}
                                                    <div>
                                                        <strong>Flash:</strong> Unknown (using manifest)
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                    <button
                                        onclick={async () => await resetPort()}
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
                                <label
                                    for="baudrate-select"
                                    class="mb-1 block text-sm font-medium text-gray-300"
                                >
                                    {$locales('customfirmware.baudrate_label')}
                                </label>
                                <select
                                    id="baudrate-select"
                                    bind:value={selectedBaudrate}
                                    onchange={saveBaudrate}
                                    disabled={isFlashing}
                                    class="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {#each baudrateOptions as option (option.value)}
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
                                tabindex={isAutoSelectMode ? -1 : 0}
                                aria-label="Select firmware files"
                                aria-describedby="file-drop-description"
                                class="flex h-full w-full {isAutoSelectMode
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'cursor-pointer'} flex-col justify-center rounded-lg p-4 text-center transition-colors {isAutoSelectMode
                                    ? ''
                                    : 'hover:border-orange-500'} {selectedFirmwareFiles.length > 0
                                    ? 'border border-gray-600 bg-gray-800'
                                    : 'border-2 border-dashed border-gray-600'}"
                                ondragover={(e) => {
                                    if (!isAutoSelectMode) handleDragOver(e);
                                }}
                                ondrop={(e) => {
                                    if (!isAutoSelectMode) handleDrop(e);
                                }}
                                onclick={() => {
                                    if (!isAutoSelectMode) fileInput?.click();
                                }}
                                onkeydown={(e) => {
                                    if (isAutoSelectMode || (e.key !== 'Enter' && e.key !== ' ')) {
                                        return;
                                    }
                                    fileInput?.click();
                                }}
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
                                onchange={handleFileInputChange}
                                class={isAutoSelectMode ? 'hidden' : 'hidden'}
                            />
                        </div>

                        <!-- File Details Spoiler (for AutoSelect mode) -->
                        {#if isAutoSelectMode && (metadataFile || selectedFirmwareFiles.length > 0)}
                            <div class="pt-3">
                                <button
                                    onclick={() => (showFileDetails = !showFileDetails)}
                                    class="flex items-center space-x-2 text-sm font-medium text-orange-300 transition-colors hover:text-orange-200"
                                >
                                    <span class="flex items-center space-x-2">
                                        {#if isDownloadingFiles}
                                            <div class="animate-spin">⏳</div>
                                        {/if}
                                        <span
                                            >{$locales('customfirmware.file_details')} ({$locales(
                                                'customfirmware.file_details_count',
                                                { values: { count: fileCount } }
                                            )})</span
                                        >
                                        {#if failedFileCount > 0}
                                            <span
                                                class="ml-2 inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white"
                                                title={$locales('customfirmware.some_files_failed')}
                                            >
                                                ⚠️ {failedFileCount}
                                            </span>
                                        {/if}
                                    </span>
                                    <span class="text-xs">{showFileDetails ? '▼' : '▶'}</span>
                                </button>

                                {#if showFileDetails}
                                    <div class="mt-3 space-y-3">
                                        <!-- Metadata File Section -->
                                        {#if metadataFile}
                                            <div>
                                                <div class="mb-1 flex items-center justify-between">
                                                    <span class="text-sm font-medium text-blue-300"
                                                        >{$locales(
                                                            'customfirmware.metadata_file'
                                                        )}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center space-x-2 rounded-md border border-blue-600 bg-blue-900/20 p-2"
                                                >
                                                    <div class="min-w-0 flex-1">
                                                        <div class="flex items-center space-x-2">
                                                            <div
                                                                class="text-blue-400"
                                                                title="Metadata file for address prediction"
                                                            >
                                                                📋
                                                            </div>
                                                            <div
                                                                class="truncate text-xs font-medium text-blue-300"
                                                                title={metadataFile.file.name}
                                                            >
                                                                {metadataFile.file.name}
                                                            </div>
                                                            <div class="text-xs text-gray-400">
                                                                ({fileHandler.formatFileSize(
                                                                    metadataFile.file.size
                                                                )})
                                                            </div>
                                                        </div>
                                                        {#if metadata}
                                                            <div class="mt-1 text-xs text-gray-500">
                                                                {#if (metadata as any).builds}
                                                                    <!-- Manifest format -->
                                                                    Version: {metadata.version} | Device:
                                                                    {(metadata as any).name} | Chip:
                                                                    {(metadata as any).builds[0]
                                                                        ?.chipFamily}
                                                                {:else}
                                                                    <!-- Legacy format -->
                                                                    Version: {metadata.version} | Board:
                                                                    {(metadata as any).board} | MCU:
                                                                    {(metadata as any).mcu}
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                    <button
                                                        onclick={removeMetadataFile}
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
                                                    <span class="text-xs text-gray-500"
                                                        >Format: 0x1000 or 4096</span
                                                    >
                                                </div>
                                                <div class="max-h-60 space-y-2 overflow-y-auto">
                                                    {#each selectedFirmwareFiles as fileItem, index (index)}
                                                        {@render fileCard(fileItem, index)}
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
                                        <span class="text-sm font-medium text-blue-300"
                                            >Metadata File</span
                                        >
                                    </div>
                                    <div
                                        class="flex items-center space-x-2 rounded-md border border-blue-600 bg-blue-900/20 p-2"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center space-x-2">
                                                <div
                                                    class="text-blue-400"
                                                    title="Metadata file for address prediction"
                                                >
                                                    📋
                                                </div>
                                                <div
                                                    class="truncate text-xs font-medium text-blue-300"
                                                    title={metadataFile.file.name}
                                                >
                                                    {metadataFile.file.name}
                                                </div>
                                                <div class="text-xs text-gray-400">
                                                    ({fileHandler.formatFileSize(
                                                        metadataFile.file.size
                                                    )})
                                                </div>
                                            </div>
                                            {#if metadata}
                                                <div class="mt-1 text-xs text-gray-500">
                                                    {#if (metadata as any).builds}
                                                        <!-- Manifest format -->
                                                        Version: {metadata.version} | Device: {(
                                                            metadata as any
                                                        ).name} | Chip: {(metadata as any).builds[0]
                                                            ?.chipFamily}
                                                    {:else}
                                                        <!-- Legacy format -->
                                                        Version: {metadata.version} | Board: {(
                                                            metadata as any
                                                        ).board} | MCU: {(metadata as any).mcu}
                                                    {/if}
                                                </div>
                                            {/if}
                                        </div>
                                        <button
                                            onclick={removeMetadataFile}
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
                                        <span class="text-xs text-gray-500"
                                            >Format: 0x1000 or 4096</span
                                        >
                                    </div>
                                    <div class="space-y-2">
                                        {#each selectedFirmwareFiles as fileItem, index (index)}
                                            {@render fileCard(fileItem, index)}
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
                            class="h-4 w-4 rounded border-gray-300 text-orange-600 accent-blue-600 focus:ring-orange-500"
                        />
                        <label
                            for="erase-before-flash"
                            class="cursor-pointer text-sm text-gray-300"
                        >
                            {$locales('customfirmware.erase_before_flash')}
                        </label>
                    </div>
                {/if}

                <!-- ZIP Extraction Status -->
                {#if isExtractingZip}
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-blue-300">
                            Extracting ZIP Archive...
                        </div>
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
                                        class="h-2 animate-pulse rounded-full bg-blue-500"
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

                <!-- Memory Map Visualization -->
                {#if selectedFirmwareFiles.length > 0}
                    <MemoryMap
                        totalSize={totalMemorySize}
                        segments={memorySegments}
                        {segmentFill}
                    />
                {/if}

                <!-- Action buttons (moved under memory map) -->
                <div class="flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button
                        onclick={async () => {
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
                        <!-- Show appropriate button after successful flash.
                         When a meshcore room_server/repeater build was flashed,
                         this button shrinks (transition-all) to a short label so
                         the highlighted "Configure" CTA takes focus instead. -->
                        <button
                            onclick={resetForAnotherFlash}
                            class="rounded-md bg-blue-600 text-sm font-medium text-white transition-all duration-[3000ms] ease-in-out hover:bg-blue-700 {configSuggested
                                ? 'px-2.5 py-1.5 text-xs opacity-80'
                                : 'px-4 py-2'}"
                        >
                            {#if configSuggested}
                                {$locales('customfirmware.flash_another_short')}
                            {:else if isAutoSelectMode}
                                {$locales('customfirmware.select_different_device')}
                            {:else}
                                {$locales('customfirmware.flash_another_file')}
                            {/if}
                        </button>
                    {:else}
                        <button
                            onclick={flashFirmware}
                            disabled={!isPortSelected ||
                                isFlashing ||
                                !validationResult.isValid ||
                                hasBlockingError ||
                                (!eraseBeforeFlash && enabledNonEmptyCount === 0)}
                            class="min-w-[7.5rem] rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white tabular-nums transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                            role={isFlashing ? 'progressbar' : undefined}
                            aria-valuenow={isFlashing ? flashProgress : undefined}
                            aria-valuemin={isFlashing ? 0 : undefined}
                            aria-valuemax={isFlashing ? 100 : undefined}
                            aria-label={isFlashing
                                ? $locales('customfirmware.flash_progress_aria', {
                                      values: { percent: flashProgress }
                                  })
                                : undefined}
                        >
                            {#if isFlashing}
                                {$locales('customfirmware.flashing_with_percent', {
                                    values: { percent: flashProgress }
                                })}
                            {:else if eraseBeforeFlash && selectedFirmwareFiles.filter((f) => f.isEnabled !== false).length === 0}
                                {$locales('customfirmware.erase_flash')}
                            {:else}
                                {$locales('customfirmware.flash_firmware')} ({$locales(
                                    'customfirmware.flash_firmware_with_count',
                                    {
                                        values: {
                                            count: selectedFirmwareFiles.filter(
                                                (f) => f.isEnabled !== false
                                            ).length
                                        }
                                    }
                                )})
                            {/if}
                        </button>
                    {/if}

                    <!-- Terminal button -->
                    <button
                        onclick={async () => {
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
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                    </button>

                    <!-- Meshtastic device config button -->
                    {#if !isAutoSelectMode || getRepositoryType($availableSources, $selectionState.repository) === RepositoryType.MESHTASTIC}
                        <button
                            onclick={openMeshtasticModal}
                            class="flex items-center justify-center rounded-md bg-gray-700 px-3 py-2 text-orange-300 transition-colors hover:bg-gray-600"
                            title={$locales('customfirmware.meshtastic_config')}
                        >
                            🗺️
                        </button>
                    {/if}

                    {#if !isAutoSelectMode || getRepositoryType($availableSources, $selectionState.repository) === RepositoryType.MESHCORE}
                        <!-- Merged "Configure" button: one visual button, two actual
                         buttons. No entrance animation — on a successful flash the
                         CTA snaps to its final orange state; only the 📍 shortcut
                         blinks (animate-blink-attention, twice) for attention.
                         Left (🗼) opens the configurator; right (📍, post-flash only)
                         opens it with the coordinate map picker auto-opened. -->
                        <div
                            class="flex items-stretch overflow-hidden rounded-md font-medium {configSuggested
                                ? 'shadow-orange bg-orange-600 text-sm text-white ring-2 ring-orange-300'
                                : 'bg-gray-700 text-orange-300'}"
                        >
                            <button
                                onclick={openMeshcoreConfigModal}
                                class="flex items-center justify-center gap-1.5 py-2 transition-colors {configSuggested
                                    ? 'px-4 hover:bg-orange-700/60'
                                    : 'px-3 hover:bg-gray-600'}"
                                title={$locales('downloadbuttons.meshcore_config_description')}
                                aria-label={$locales('downloadbuttons.meshcore_config_description')}
                            >
                                {#if configSuggested}
                                    <span>{$locales('customfirmware.configure')}</span>
                                {/if}
                                🗼
                            </button>
                            {#if configSuggested}
                                <button
                                    onclick={() => {
                                        meshcoreAutoOpenPicker = true;
                                        openMeshcoreConfigModal();
                                    }}
                                    class="animate-blink-attention flex items-center justify-center border-l border-orange-300/50 px-3 py-2 transition-colors hover:bg-orange-700/60"
                                    title={$locales('meshcoreconfig.pick_on_map')}
                                    aria-label={$locales('meshcoreconfig.pick_on_map')}
                                >
                                    📍
                                </button>
                            {/if}
                        </div>
                    {/if}

                    <!-- Meshcore configurator button -->
                    {#if !isAutoSelectMode || getRepositoryType($availableSources, $selectionState.repository) === RepositoryType.MESHCORE}
                        <button
                            onclick={() =>
                                window.open(
                                    MESHCORE_CONFIGURATOR_URL,
                                    '_blank',
                                    'noopener,noreferrer'
                                )}
                            class="flex items-center justify-center rounded-md bg-gray-700 px-3 py-2 text-lg transition-colors hover:bg-gray-600"
                            title={$locales('customfirmware.meshcore_configurator')}
                            aria-label={$locales('customfirmware.meshcore_configurator')}
                        >
                            📤
                        </button>
                    {/if}
                </div>

                <!-- Flash Operation Log (always visible; placed below memory map) -->
                <FlashLog entries={$logger} onCopy={() => copyLogToClipboard()} />

                <!-- Instructions Spoiler -->
                <div class="space-y-2">
                    <button
                        onclick={() => (showInstructions = !showInstructions)}
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

            {#if isPortSelected && deviceInfo}
                <div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                    <div class="mb-3 text-sm font-medium text-orange-300">
                        {$locales('customfirmware.device_information')}
                    </div>
                    <div
                        class="grid grid-cols-1 gap-4 text-xs text-gray-400 md:grid-cols-2 lg:grid-cols-3"
                    >
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
        {deviceInfo}
        flashSizeBytes={deviceInfo ? parseFlashSize(deviceInfo.flashSize) : 0}
        onConfirm={backupMemory}
        onCancel={() => (showBackupConfirm = false)}
    />

    <!-- Terminal Modal -->
    <TerminalModal
        isOpen={showTerminalModal}
        onClose={() => (showTerminalModal = false)}
        initialMode={getRepositoryType($availableSources, $selectionState.repository) ===
        RepositoryType.MESHCORE
            ? 'meshcore'
            : 'normal'}
    />

    <!-- Meshtastic Device Modal -->
    {#if showMeshtasticModal && MeshtasticDeviceModal}
        <MeshtasticDeviceModal
            isOpen={showMeshtasticModal}
            onClose={() => (showMeshtasticModal = false)}
        />
    {/if}

    <!-- Meshcore Config Modal -->
    {#if showMeshcoreConfigModal && MeshcoreConfigModal}
        <MeshcoreConfigModal
            isOpen={showMeshcoreConfigModal}
            autoOpenPicker={meshcoreAutoOpenPicker}
            onClose={() => {
                showMeshcoreConfigModal = false;
                meshcoreAutoOpenPicker = false;
            }}
        />
    {/if}
{/if}
