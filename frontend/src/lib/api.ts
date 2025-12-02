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
      apiBaseUrl: config.apiBaseUrl || import.meta.env.VITE_API_URL || '/api',
      defaultSource: config.defaultSource || '',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3
    };
    this.baseUrl = this.config.apiBaseUrl;
    this.cache = new Map();
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

      const blob = await response.blob();
      return { blob, filename };
    } catch (error) {
      if (error instanceof Error) {
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

  // Get available firmware versions for a device type
  async getVersions(
    deviceType: string,
    source: string = this.config.defaultSource
  ): Promise<VersionsResponse> {
    const params = new URLSearchParams({
      t: deviceType,
      src: source
    });

    return this.request<VersionsResponse>(`/versions?${params}`);
  }

  // Get device information block (HTML content)
  async getInfoBlock(
    deviceType: string,
    version: string,
    source: string = this.config.defaultSource
  ): Promise<InfoBlockResponse> {
    const params = new URLSearchParams({
      t: deviceType,
      v: version,
      src: source
    });

    return this.request<InfoBlockResponse>(`/infoblock?${params}`);
  }

  // Get firmware manifest for ESP Web Tools
  async getManifest(
    deviceType: string,
    version: string,
    updateMode: UpdateMode = '1',
    source: string = this.config.defaultSource
  ): Promise<ManifestResponse> {
    const params = new URLSearchParams({
      t: deviceType,
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
    deviceType: string,
    version: string,
    mode: UpdateMode,
    part?: string
  ): string {
    let filename = `${deviceType}-${version}`;

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