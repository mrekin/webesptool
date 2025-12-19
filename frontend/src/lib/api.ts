import type {
  VersionsResponse,
  InfoBlockResponse,
  FirmwareRequest,
  FirmwareDownloadResponse,
  ManifestResponse,
  AvailableFirmwares,
  APIError,
  AppConfig,
  UpdateMode
} from './types.ts';

class APIService {
  private baseUrl: string;
  private config: AppConfig;
  private cache: Map<string, { data: any; timestamp: number }>;
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(config: Partial<AppConfig> = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl || import.meta.env.VITE_API_URL || 'api',
      defaultSource: config.defaultSource || '',
      timeout: config.timeout || 120000, // 2 minutes default for large firmware files
      retryAttempts: config.retryAttempts || 3
    };
    this.baseUrl = this.config.apiBaseUrl;
    this.cache = new Map();
  }

  private calculateDynamicTimeout(fileSizeBytes?: number): number {
    const baseTimeout = this.config.timeout; // Use configured timeout (2 minutes by default)
    const fileSizeMB = fileSizeBytes ? fileSizeBytes / (1024 * 1024) : 0;
    return baseTimeout + (fileSizeMB * 5000); // Add 5 seconds per MB
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = `${endpoint}?${new URLSearchParams(options.body as string).toString()}`;

    // Check cache first for GET requests
    if (!options.method || options.method === 'GET') {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorData: APIError = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Cache successful GET requests
      if (!options.method || options.method === 'GET') {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw new Error('Unknown API error occurred');
    }
  }

  private async downloadFileWithFilename(
    endpoint: string,
    params: Record<string, string>
  ): Promise<FirmwareDownloadResponse> {
    const url = `${this.baseUrl}${endpoint}?${new URLSearchParams(params)}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        // Log detailed error information
        console.error(`API Error (${response.status}): Failed to download firmware from ${url}`);
        console.error('Request params:', params);

        // Try to get error details from response body
        let errorDetails = '';
        try {
          const errorText = await response.text();
          if (errorText) {
            console.error('Error response:', errorText);
            errorDetails = errorText.substring(0, 200); // Limit error details length
          }
        } catch (e) {
          // Ignore errors when trying to read error response
        }

        // Provide user-friendly error messages based on status code
        let userMessage = '';
        switch (response.status) {
          case 500:
            userMessage = 'Server error occurred while preparing firmware file. This firmware version may not be available for download.';
            break;
          case 404:
            userMessage = 'Firmware file not found. This version may not be available for this device.';
            break;
          case 429:
            userMessage = 'Too many download requests. Please try again later.';
            break;
          default:
            userMessage = `Download failed: ${response.status} ${response.statusText}`;
        }

        throw new Error(userMessage);
      }

      // Extract filename from Content-Disposition header
      let filename = '';
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        // Look for filename in Content-Disposition header
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      const blob = await response.blob();
      return { blob, filename };
    } catch (error) {
      if (error instanceof Error) {
        // Log the error for debugging
        console.error('Download error:', error.message, { url, params });
        throw new Error(`Download failed: ${error.message}`);
      }
      throw new Error('Unknown download error occurred');
    }
  }

  private async downloadFile(
    endpoint: string,
    params: Record<string, string>
  ): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}?${new URLSearchParams(params)}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Download failed: ${error.message}`);
      }
      throw new Error('Unknown download error occurred');
    }
  }

  private async downloadFileForContent(
    endpoint: string,
    params: Record<string, string>
  ): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}${endpoint}?${new URLSearchParams(params)}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Download failed: ${error.message}`);
      }
      throw new Error('Unknown download error occurred');
    }
  }

  // Get available firmware versions for a device type
  async getVersions(
    devicePioTarget: string,
    source: string = this.config.defaultSource
  ): Promise<VersionsResponse> {
    const params = new URLSearchParams({
      t: devicePioTarget,
      src: source
    });

    return this.request<VersionsResponse>(`/versions?${params}`);
  }

  // Get device information block (HTML content)
  async getInfoBlock(
    devicePioTarget: string,
    version: string,
    source: string = this.config.defaultSource
  ): Promise<InfoBlockResponse> {
    const params = new URLSearchParams({
      t: devicePioTarget,
      v: version,
      src: source
    });

    return this.request<InfoBlockResponse>(`/infoblock?${params}`);
  }

  // Get firmware manifest for ESP Web Tools
  async getManifest(
    devicePioTarget: string,
    version: string,
    updateMode: UpdateMode = '1',
    source: string = this.config.defaultSource
  ): Promise<ManifestResponse> {
    const params = new URLSearchParams({
      t: devicePioTarget,
      v: version,
      u: updateMode,
      src: source
    });

    return this.request<ManifestResponse>(`/manifest?${params}`);
  }

  // Download firmware file or package
  async downloadFirmware(request: FirmwareRequest): Promise<FirmwareDownloadResponse> {
    const params: Record<string, string> = {
      t: request.t,
      v: request.v,
      u: request.u,
      ...(request.p && { p: request.p }),
      ...(request.e !== undefined && { e: request.e.toString() }),
      ...(request.src && { src: request.src })
    };

    return this.downloadFileWithFilename('/firmware', params);
  }

  // Get initial available firmwares data (for homepage)
  async getAvailableFirmwares(
    source: string = this.config.defaultSource
  ): Promise<AvailableFirmwares> {
    const params = source ? `?src=${encodeURIComponent(source)}` : '';

    return this.request<AvailableFirmwares>(`/availableFirmwares${params}`);
  }

  // Get available firmwares data with specific source
  async getAvailableFirmwaresWithSource(
    source: string
  ): Promise<AvailableFirmwares> {
    const params = source ? `?src=${encodeURIComponent(source)}` : '';

    return this.request<AvailableFirmwares>(`/availableFirmwares${params}`);
  }

  // Get available repositories
  async getSrcs(): Promise<string[]> {
    return this.request<string[]>('/srcs');
  }

  // Download file content for processing (returns ArrayBuffer)
  async downloadFileContent(
    endpoint: string,
    params: Record<string, string>
  ): Promise<ArrayBuffer> {
    return this.downloadFileForContent(endpoint, params);
  }

  // Download file from URL (with path parsing for manifest parts)
  async downloadFromPath(path: string): Promise<ArrayBuffer> {
    // Parse path to extract endpoint and params
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const params: Record<string, string> = {};

    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Remove /api prefix if present
    const endpoint = pathname.startsWith('/api/') ? pathname.substring(4) : pathname;

    const url2 = `${this.baseUrl}${endpoint}?${new URLSearchParams(params)}`;

    try {
      const response = await fetch(url2, {
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Download failed: ${error.message}`);
      }
      throw new Error('Unknown download error occurred');
    }
  }

  // Download file from URL with filename extraction
  async downloadFromFileWithFilename(
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<{ content: ArrayBuffer; filename: string }> {
    // Parse path to extract endpoint and params
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const params: Record<string, string> = {};

    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Remove /api prefix if present
    const endpoint = pathname.startsWith('/api/') ? pathname.substring(4) : pathname;

    const url2 = `${this.baseUrl}${endpoint}?${new URLSearchParams(params)}`;

    try {
      // Use extended dynamic timeout for large firmware files
      // Start with a generous base timeout since we can't reliably get file size
      const timeout = this.calculateDynamicTimeout(); // No size parameter = use base timeout

      const response = await fetch(url2, {
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      // Extract filename from Content-Disposition header
      let filename = '';
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        // Look for filename in Content-Disposition header
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Get content length for progress calculation
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      if (!onProgress || total === 0) {
        // No progress callback or unknown size - use simple method
        const content = await response.arrayBuffer();
        return { content, filename };
      }

      // Create reader from response body for progress tracking
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Create chunks array to collect data
      const chunks: Uint8Array[] = [];

      // Read data with progress tracking
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Report progress
        const progress = Math.min(Math.round((loaded / total) * 100), 100);
        onProgress(progress);
      }

      // Combine all chunks into single ArrayBuffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const content = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.length;
      }

      return { content: content.buffer, filename };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Download failed: ${error.message}`);
      }
      throw new Error('Unknown download error occurred');
    }
  }

  // Utility method to trigger file download in browser
  triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Utility method to generate appropriate filename
  generateFilename(
    devicePioTarget: string,
    version: string,
    mode: UpdateMode,
    part?: string
  ): string {
    let filename = `${devicePioTarget}-${version}`;

    if (part) {
      filename += `-${part}`;
    }

    switch (mode) {
      case '1':
        filename += '-update';
        break;
      case '2':
        filename += '-factory';
        break;
      case '4':
        filename += '-ota';
        break;
      case '5':
        filename += '-zip';
        break;
    }

    if (mode === '5') {
      filename += '.zip';
    } else if (part === 'uf2') {
      filename += '.uf2';
    } else {
      filename += '.bin';
    }

    return filename;
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Create singleton instance
export const apiService = new APIService();

// Export class for testing or custom configuration
export { APIService };