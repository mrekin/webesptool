import type { FirmwareFile } from '$lib/types';

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
				const result = event.target?.result as string;
				resolve(result);
			};
			reader.onerror = () => {
				reject(new Error('Failed to read file'));
			};
			reader.readAsBinaryString(firmwareFile.file);
		});
	}

	// Validate file
	function validateFile(file: File): boolean {
		const validExtensions = ['.bin', '.hex', '.elf'];
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

	return {
		handleFileSelect,
		handleDragOver,
		handleDrop,
		handleDropMultiple,
		readFileContent,
		validateFile,
		isValidFile,
		createFirmwareFile,
		formatFileSize
	};
}