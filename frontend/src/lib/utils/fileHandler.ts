import JSZip from 'jszip';
import type { FirmwareFile, ZipExtractionResult } from '$lib/types.js';

export function createFirmwareFileHandler() {
	// Handle file selection
	function handleFileSelect(event: Event): FirmwareFile | null {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			const file = input.files[0];
			if (validateFile(file)) {
				return {
					file: file,
					content: '', // Will be filled by readFileContent
					size: file.size,
					name: file.name
				};
			}
		}
		return null;
	}

	// Handle drag over
	function handleDragOver(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}

	// Handle file drop
	function handleDrop(event: DragEvent): FirmwareFile | null {
		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const file = event.dataTransfer.files[0];
			if (validateFile(file)) {
				return {
					file: file,
					content: '', // Will be filled by readFileContent
					size: file.size,
					name: file.name
				};
			}
		}
		return null;
	}

	// Read file content
	async function readFileContent(firmwareFile: FirmwareFile): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (event) => {
				const result = event.target?.result;
				if (typeof result === 'string') {
					resolve(result);
				} else {
					// Convert ArrayBuffer to binary string for compatibility
					const bytes = new Uint8Array(result as ArrayBuffer);
					let binary = '';
					for (let i = 0; i < bytes.byteLength; i++) {
						binary += String.fromCharCode(bytes[i]);
					}
					resolve(binary);
				}
			};
			reader.onerror = () => {
				reject(new Error('Failed to read file'));
			};

			// Read JSON files as text, binary files as array buffer
			if (isMetadataFile(firmwareFile.file)) {
				reader.readAsText(firmwareFile.file);
			} else {
				reader.readAsArrayBuffer(firmwareFile.file);
			}
		});
	}

	// Validate file
	function validateFile(file: File): boolean {
		const validExtensions = ['.bin', '.mt.json', 'manifest.json', '.zip'];
		const fileName = file.name.toLowerCase();

		for (const ext of validExtensions) {
			if (fileName.endsWith(ext)) {
				return true;
			}
		}

		return false;
	}

	// Format file size
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	// Check if file is valid (alias for validateFile)
	function isValidFile(file: File): boolean {
		return validateFile(file);
	}

	// Check if file is metadata file
	function isMetadataFile(file: File): boolean {
		const fileName = file.name.toLowerCase();
		return fileName.endsWith('.mt.json') || fileName.endsWith('manifest.json');
	}

	// Check if file is firmware file
	function isFirmwareFile(file: File): boolean {
		return file.name.toLowerCase().endsWith('.bin');
	}

	// Create firmware file from File object
	function createFirmwareFile(file: File): FirmwareFile {
		return {
			file: file,
			content: '', // Will be filled by readFileContent
			size: file.size,
			name: file.name
		};
	}

	// Handle multiple file drop
	function handleDropMultiple(event: DragEvent): File[] | null {
		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const files: File[] = [];
			for (let i = 0; i < event.dataTransfer.files.length; i++) {
				const file = event.dataTransfer.files[i];
				if (validateFile(file)) {
					files.push(file);
				}
			}
			return files.length > 0 ? files : null;
		}
		return null;
	}

	// Check if file is a ZIP archive
	function isZipFile(file: File): boolean {
		const fileName = file.name.toLowerCase();
		return fileName.endsWith('.zip');
	}

	// Check if file extension is valid for firmware/metadata
	function isValidExtension(filename: string): boolean {
		const validExts = ['.bin', '.mt.json', 'manifest.json'];
		const lowerName = filename.toLowerCase();
		return validExts.some(ext => lowerName.endsWith(ext));
	}

	// Get content type for file
	function getContentType(filename: string): string {
		const lowerName = filename.toLowerCase();
		if (lowerName.endsWith('.json')) return 'application/json';
		if (lowerName.endsWith('.bin')) return 'application/octet-stream';
		return 'application/octet-stream';
	}

// Check if we should read file as text or binary
	function shouldReadAsText(filename: string): boolean {
		const lowerName = filename.toLowerCase();
		return lowerName.endsWith('.json');
	}

	// Extract files from ZIP archive
	async function processZipArchive(zipFile: File): Promise<ZipExtractionResult> {
		try {
			const zip = new JSZip();
			const zipContent = await zip.loadAsync(zipFile);
			const extractedFiles: File[] = [];
			let totalFiles = 0;
			let skippedCount = 0;

			// Collect all file entries first
			const fileEntries: Array<[string, any]> = [];
			zipContent.forEach((relativePath, file) => {
				if (!file.dir) {
					fileEntries.push([relativePath, file]);
				}
			});

			// Process files sequentially
			for (const [relativePath, file] of fileEntries) {
				totalFiles++;

				// Get the actual filename (remove path if any)
				const fileName = relativePath.split('/').pop() || relativePath;

				// Skip empty filenames
				if (!fileName || fileName.length === 0) {
					skippedCount++;
					continue;
				}

				// Check if file extension is supported
				if (!isValidExtension(fileName)) {
					skippedCount++;
					continue;
				}

				try {
					// Extract file content using appropriate method
					let content: any;
					if (shouldReadAsText(fileName)) {
						// For JSON files, use text
						content = await file.async('text');
					} else {
						// For binary files, use uint8array to preserve correct size
						content = await file.async('uint8array');
					}

					// Ensure we got valid content
					if (!content) {
						skippedCount++;
						continue;
					}

					// Create blob with correct content
					let blob: Blob;
					if (shouldReadAsText(fileName)) {
						blob = new Blob([content], {
							type: getContentType(fileName)
						});
					} else {
						blob = new Blob([content], {
							type: getContentType(fileName)
						});
					}

					// Create File object
					const extractedFile = new File([blob], fileName, {
						type: blob.type,
						lastModified: zipFile.lastModified
					});

					extractedFiles.push(extractedFile);
				} catch (error) {
					console.warn(`Failed to extract file ${fileName} from ZIP:`, error);
					skippedCount++;
				}
			}

			return {
				extractedFiles,
				totalFiles,
				extractedCount: extractedFiles.length,
				skippedCount
			};
		} catch (error) {
			throw new Error(`ZIP extraction failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return {
		handleFileSelect,
		handleDragOver,
		handleDrop,
		handleDropMultiple,
		readFileContent,
		validateFile,
		isValidFile,
		isMetadataFile,
		isFirmwareFile,
		isZipFile,
		createFirmwareFile,
		processZipArchive,
		formatFileSize
	};
}