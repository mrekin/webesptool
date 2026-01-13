import type {
	MeshtasticDeviceInfo,
	MeshtasticConnectionStatus,
	MeshtasticConnectionOptions,
	MeshtasticConfigReadResult,
	MeshtasticChannelInfo,
	MeshtasticOwnerInfo,
	MeshtasticEventCallbacks,
	MeshtasticNodeMetrics,
	MeshtasticNodeStats
} from '$lib/types.js';

import { MeshDevice, Protobuf } from '@meshtastic/core';
import { TransportWebSerial } from '@meshtastic/transport-web-serial';

// @ts-ignore - Accessing runtime enums from Protobuf.Admin
const ConfigType = (Protobuf as any).Admin?.AdminMessage_ConfigType;
// @ts-ignore - Accessing runtime enums from Protobuf.Admin
const ModuleConfigType = (Protobuf as any).Admin?.AdminMessage_ModuleConfigType;
// @ts-ignore - Accessing runtime enum from Protobuf.Mesh
const HardwareModel = (Protobuf as any).Mesh?.HardwareModel;

// Get enum values dynamically (lazy initialization)
// @ts-ignore
let Config_LoRaConfig_RegionCode: any;
// @ts-ignore
let Config_DeviceConfig_Role: any;
// @ts-ignore
let Config_LoRaConfig_ModemPreset: any;

function getEnums() {
	if (!Config_LoRaConfig_RegionCode) {
		const Config = (Protobuf as any).Config;
		Config_LoRaConfig_RegionCode = Config?.Config_LoRaConfig_RegionCode;
		Config_DeviceConfig_Role = Config?.Config_DeviceConfig_Role;
		Config_LoRaConfig_ModemPreset = Config?.Config_LoRaConfig_ModemPreset;
	}
	return { Config_LoRaConfig_RegionCode, Config_DeviceConfig_Role, Config_LoRaConfig_ModemPreset };
}

// Local enum since DeviceStatusEnum is not exported from @meshtastic/core
enum DeviceStatusEnum {
	DeviceRestarting = 1,
	DeviceDisconnected = 2,
	DeviceConnecting = 3,
	DeviceReconnecting = 4,
	DeviceConnected = 5,
	DeviceConfiguring = 6,
	DeviceConfigured = 7
}

const DEFAULT_BAUDRATE = 115200;
const DEFAULT_HEARTBEAT_INTERVAL = 300000;

// ==================== Base64 Conversion Utilities ====================

/**
 * Convert Uint8Array to base64 string with 'base64:' prefix
 * Matches Python client format for security keys (privateKey, publicKey, adminKey)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
	return 'base64:' + btoa(binary);
}

/**
 * Convert base64 string (with or without 'base64:' prefix) back to Uint8Array
 * Used when loading config from file
 */
export function base64ToUint8Array(base64Str: string): Uint8Array {
	// Remove 'base64:' prefix if present
	const actualBase64 = base64Str.startsWith('base64:')
		? base64Str.substring(7)
		: base64Str;

	// Empty base64 string means empty Uint8Array
	if (actualBase64 === '') {
		return new Uint8Array(0);
	}

	const binary = atob(actualBase64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Recursively convert base64 strings back to Uint8Array in config object
 * Restores security keys when loading config from file
 */
export function restoreUint8Arrays(obj: any, key: string = ''): any {
	// Check if this looks like a base64-encoded security key
	// Keys like privateKey, publicKey, adminKey, psk are stored as "base64:..."
	if (typeof obj === 'string' && obj.startsWith('base64:')) {
		try {
			return base64ToUint8Array(obj);
		} catch {
			// If decoding fails, return original string
			return obj;
		}
	}

	// Convert hex MAC address back to Uint8Array
	if (key === 'macaddr' && typeof obj === 'string' && obj.includes(':')) {
		const hexStr = obj.replace(/:/g, '');
		const bytes = new Uint8Array(hexStr.length / 2);
		for (let i = 0; i < hexStr.length; i += 2) {
			bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
		}
		return bytes;
	}

	// Handle non-object types (numbers, booleans, already converted arrays)
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}

	// Recursively process object properties or array elements
	if (Array.isArray(obj)) {
		return obj.map((item) => restoreUint8Arrays(item, key));
	}

	const result: any = {};
	for (const [k, value] of Object.entries(obj)) {
		result[k] = restoreUint8Arrays(value, k);
	}
	return result;
}

/**
 * JSON replacer function that converts BigInt and Uint8Array for serialization
 * Handles security keys with base64 encoding matching Python client format
 */
export function meshtasticJsonReplacer(_key: string, value: any): any {
	if (typeof value === 'bigint') {
		return value.toString();
	}
	// Handle Uint8Array (security keys: privateKey, publicKey, adminKey)
	// Match Python client format with 'base64:' prefix
	if (value instanceof Uint8Array) {
		return uint8ArrayToBase64(value);
	}
	return value;
}

/**
 * Convert MAC address from base64-encoded Uint8Array to hex string format
 * Format: "XX:XX:XX:XX:XX:XX"
 */
export function macaddrToHex(macaddr: Uint8Array | string): string {
	// If it's already a string with base64: prefix, decode it
	if (typeof macaddr === 'string') {
		if (macaddr.startsWith('base64:')) {
			macaddr = base64ToUint8Array(macaddr);
		} else {
			// Already in some format, return as is
			return macaddr;
		}
	}

	// Convert Uint8Array to hex format
	if (macaddr instanceof Uint8Array) {
		return Array.from(macaddr)
			.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
			.join(':');
	}

	return String(macaddr);
}

/**
 * Convert camelCase to snake_case
 * Example: ledHeartbeatDisabled -> led_heartbeat_disabled
 */
export function convertToSnakeCase(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => convertToSnakeCase(item));
	}

	const result: any = {};
	for (const [key, value] of Object.entries(obj)) {
		// Convert camelCase to snake_case
		const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
		result[snakeKey] = convertToSnakeCase(value);
	}
	return result;
}

/**
 * Remove protobuf internal fields like $typeName, $case, payloadVariant, etc.
 * These are used by the protobuf library but shouldn't be in the exported config
 */
export function cleanProtobufFields(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	// Keep Uint8Array as is
	if (obj instanceof Uint8Array) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => cleanProtobufFields(item));
	}

	const result: any = {};
	for (const [key, value] of Object.entries(obj)) {
		// Skip protobuf internal fields
		if (key.startsWith('$') || key === 'payloadVariant') {
			continue;
		}
		// Recursively clean nested objects, but keep Uint8Array
		if (value instanceof Uint8Array) {
			result[key] = value;
		} else if (typeof value === 'object' && value !== null) {
			result[key] = cleanProtobufFields(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Convert all Uint8Array values to base64 strings recursively
 * This must be done before YAML export since js-yaml doesn't support replacer function
 */
export function convertUint8ArraysToBase64(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	// Handle Uint8Array directly
	if (obj instanceof Uint8Array) {
		return uint8ArrayToBase64(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => convertUint8ArraysToBase64(item));
	}

	const result: any = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value instanceof Uint8Array) {
			result[key] = uint8ArrayToBase64(value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = convertUint8ArraysToBase64(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Extract actual config data from protobuf wrapper structure
 * Handles both direct config objects and payloadVariant.value wrapped objects
 */
export function extractConfigData(configWrapper: any): any {
	if (!configWrapper || typeof configWrapper !== 'object') {
		return configWrapper;
	}

	// If has payloadVariant.value structure, extract the value
	if (configWrapper.payloadVariant?.value) {
		return extractConfigData(configWrapper.payloadVariant.value);
	}

	// If has payload.payloadVariant.value structure, extract it
	if (configWrapper.payload?.payloadVariant?.value) {
		return extractConfigData(configWrapper.payload.payloadVariant.value);
	}

	// Otherwise, clean and return the object directly
	return cleanProtobufFields(configWrapper);
}

// ==================== Python Client Format Conversion ====================

/**
 * Configuration format compatible with Meshtastic Python client
 * Matches the YAML export/import format for config file interoperability
 */
export interface MeshtasticPythonConfig {
	owner?: string;
	owner_short?: string;
	channel_url?: string;
	location?: {
		lat: number;
		lon: number;
		alt?: number;
	};
	config: Record<string, any>;  // LocalConfig sections: device, security, lora, etc.
	module_config?: Record<string, any>;  // ModuleConfig sections: mqtt, serial, etc.
}

/**
 * Convert our internal config format to Python client compatible format
 * Transforms from:
 *   { localConfig: { device: {...}, security: {...} }, moduleConfig: {...}, ... }
 * To:
 *   { owner: "...", config: { device: {...}, security: {...} }, module_config: {...} }
 *
 * This allows config files to be interoperable with Meshtastic Python client
 */
export function transformToPythonFormat(fullConfig: any): MeshtasticPythonConfig {
	const result: MeshtasticPythonConfig = {
		config: {},
		module_config: {}
	};
	// Ensure module_config is initialized to avoid TypeScript errors
	if (!result.module_config) {
		result.module_config = {};
	}

	// Extract owner information
	if (fullConfig.owner) {
		result.owner = fullConfig.owner.owner || fullConfig.owner.name || '';
		// Generate short owner name (max 4 chars, trimmed)
		result.owner_short = result.owner
			? result.owner.substring(0, 4).trim()
			: '';
	}

	// Extract location from position config if available
	if (fullConfig.localConfig?.position) {
		const pos = fullConfig.localConfig.position;
		if (pos.latitude || pos.longitude || pos.altitude) {
			result.location = {
				lat: pos.latitude ?? 0,
				lon: pos.longitude ?? 0
			};
			if (pos.altitude !== undefined && pos.altitude !== 0) {
				result.location.alt = pos.altitude;
			}
		}
	}

	// Flatten localConfig sections into 'config' object
	if (fullConfig.localConfig) {
		for (const [sectionName, sectionData] of Object.entries(fullConfig.localConfig)) {
			result.config[sectionName] = sectionData;
		}
	}

	// Flatten moduleConfig sections into 'module_config' object
	if (fullConfig.moduleConfig) {
		for (const [sectionName, sectionData] of Object.entries(fullConfig.moduleConfig)) {
			result.module_config[sectionName] = sectionData;
		}
	}

	// Generate channel_url from primary channel if available
	if (fullConfig.channels && fullConfig.channels.length > 0) {
		const primaryChannel = fullConfig.channels[0];
		if (primaryChannel.config && primaryChannel.config.settings) {
			// Channel URL would need to be generated from channel settings
			// For now, we'll skip this as it requires complex encoding
			// result.channel_url = generateChannelUrl(primaryChannel.config);
		}
	}

	return result;
}

/**
 * Convert Python client config format back to our internal format
 * Used when importing a config file that was exported from Python client
 */
export function transformFromPythonFormat(pythonConfig: MeshtasticPythonConfig): any {
	const result: any = {
		version: '1.0',
		timestamp: new Date().toISOString(),
		localConfig: {},
		moduleConfig: {},
		channels: [],
		owner: null
	};

	// Reconstruct localConfig from 'config' sections
	if (pythonConfig.config) {
		for (const [sectionName, sectionData] of Object.entries(pythonConfig.config)) {
			result.localConfig[sectionName] = sectionData;
		}
	}

	// Reconstruct moduleConfig from 'module_config' sections
	if (pythonConfig.module_config) {
		for (const [sectionName, sectionData] of Object.entries(pythonConfig.module_config)) {
			result.moduleConfig[sectionName] = sectionData;
		}
	}

	// Reconstruct owner
	if (pythonConfig.owner) {
		result.owner = {
			owner: pythonConfig.owner,
			// owner_short is derived from owner
		};
	}

	// Location is already stored in position config, no need to handle separately

	return result;
}

// ==================== Retry Helper ====================

/**
 * Execute async function with retry logic
 * @param fn - Async function to execute
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Delay between retries in ms (default: 100)
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	retries: number = 3,
	delayMs: number = 100
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				// Wait before retry
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}
	}

	throw lastError;
}

/**
 * Validate Meshtastic configuration
 * Checks that at least one section has data
 */
export function validateMeshtasticConfig(config: any): { valid: boolean; error?: string } {
	if (!config || typeof config !== 'object') {
		return { valid: false, error: 'Invalid configuration' };
	}

	const hasLocalConfig = config.localConfig && Object.keys(config.localConfig).length > 0;
	const hasModuleConfig = config.moduleConfig && Object.keys(config.moduleConfig).length > 0;
	const hasChannels = config.channels && config.channels.length > 0;
	const hasOwner = config.owner;

	if (!hasLocalConfig && !hasModuleConfig && !hasChannels && !hasOwner) {
		return { valid: false, error: 'Configuration must contain at least one section: localConfig, moduleConfig, channels, or owner' };
	}

	return { valid: true };
}

// ==================== Meshtastic Manager ====================

/**
 * Create Meshtastic device manager
 * Factory function following project pattern from esp.ts
 */
export function createMeshtasticManager(options?: MeshtasticConnectionOptions) {
	// State management
	let transport: any = null;
	let device: any = null;
	let serialPort: any = null; // Store SerialPort reference for direct closing
	let eventCallbacks: MeshtasticEventCallbacks = {};
	let connectionStatus: MeshtasticConnectionStatus = 'disconnected';

	// Cached device info from various sources
	let cachedMyNodeInfo: any = null;
	let cachedNodeInfo: any = null;
	let cachedDeviceMetadata: any = null;
	let cachedOwner: any = null;
	let cachedMetrics: MeshtasticNodeMetrics = {};
	let networkNodes: Map<number, any> = new Map();  // All nodes in network

	const baudRate = options?.baudRate ?? DEFAULT_BAUDRATE;
	const heartbeatInterval = options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
	const autoConfigure = options?.autoConfigure ?? true;

	/**
	 * Connect to Meshtastic device
	 * Returns device info (node name and firmware version)
	 */
	async function connect(): Promise<MeshtasticDeviceInfo> {
		try {
			updateConnectionStatus('connecting');

			// Ensure cleanup from any previous connection
			if (transport || device || serialPort) {
				console.log('[Meshtastic] Cleaning up previous connection...');
				if (device?._heartbeatIntervalId !== undefined) {
					clearInterval(device._heartbeatIntervalId);
				}
				if (transport?.abortController) {
					transport.abortController.abort();
				}
				// Close serial port directly if it's open
				if (serialPort && (serialPort.readable || serialPort.writable)) {
					try {
						await serialPort.close();
						await new Promise(resolve => setTimeout(resolve, 100));
					} catch (err) {
						console.warn('[Meshtastic] Error closing port before reconnect:', err);
					}
				}
				cleanup();
				// Small delay to allow cleanup
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			// Request port from user first
			const port = await (navigator as any).serial.requestPort({});
			serialPort = port; // Store reference

			// Create transport from the port
			transport = await TransportWebSerial.createFromPort(port);

			// Create MeshDevice instance
			device = new MeshDevice(transport);

			// Disable internal logging from @meshtastic library
			// Log levels: TRACE=5, DEBUG=10, INFO=20, WARNING=30, ERROR=40, CRITICAL=50
			// Set minLevel to WARNING (30) to show only warnings and errors
			if (device.log?.settings) {
				device.log.settings.minLevel = 30;
			}

			// Subscribe to device events
			setupEventSubscriptions();

			// Start configuration process (don't await - it will complete in background)
			if (autoConfigure) {
				device.configure().catch((err: Error) => console.error('[Meshtastic] Configure error:', err));
			}

			// Wait for onMyNodeInfo event which will update status to 'configured'
			// The event is already subscribed, so we just need to wait a bit
			console.log('[Meshtastic] Waiting for myNodeInfo event...');

			// Wait up to 5 seconds for configured status
			const maxWaitTime = 5000;
			const startTime = Date.now();
			let iterations = 0;

			while (connectionStatus !== 'configured' && Date.now() - startTime < maxWaitTime) {
				iterations++;
				if (iterations % 10 === 0) { // Log every 500ms
					console.log(`[Meshtastic] Still waiting... status: ${connectionStatus}, elapsed: ${Date.now() - startTime}ms`);
				}
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			console.log(`[Meshtastic] Wait complete. Status: ${connectionStatus}, elapsed: ${Date.now() - startTime}ms, iterations: ${iterations}`);

			if (connectionStatus !== 'configured') {
				throw new Error('Device configuration timeout');
			}

			// Set up heartbeat to maintain connection
			device.setHeartbeatInterval(heartbeatInterval);

			// Request metadata for our own node to get firmware version and hardware model
			if (cachedMyNodeInfo?.myNodeNum) {
				console.log('[Meshtastic] Requesting metadata for node:', cachedMyNodeInfo.myNodeNum);
				device.getMetadata(cachedMyNodeInfo.myNodeNum).catch((err: Error) => {
					console.error('[Meshtastic] GetMetadata error:', err);
				});
			}

			// Request owner information to get node name
			console.log('[Meshtastic] Requesting owner information...');
			device.getOwner().catch((err: Error) => {
				console.error('[Meshtastic] GetOwner error:', err);
			});

			return extractDeviceInfo();
		} catch (error) {
			updateConnectionStatus('disconnected');
			cleanup();
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Disconnect from Meshtastic device
	 * Uses port.forget() to release locks (from web-flasher)
	 */
	async function disconnect(): Promise<void> {
		// Clear callbacks
		eventCallbacks = {};

		// Clear heartbeat
		if (device?._heartbeatIntervalId !== undefined) {
			clearInterval(device._heartbeatIntervalId);
		}

		// Cancel fromDevice stream (ignore errors - stream may be locked)
		if (transport?._fromDevice) {
			transport._fromDevice.cancel().catch(() => {});
		}

		// Close toDevice stream (ignore errors)
		if (transport?.toDevice) {
			transport.toDevice.close().catch(() => {});
		}

		// Forget the port - this releases all locks!
		if (serialPort && typeof serialPort.forget === 'function') {
			serialPort.forget().catch(() => {});
		}

		// Cleanup
		cleanup();
		updateConnectionStatus('disconnected');
	}

	/**
	 * Set device owner name (simple test)
	 */
	async function setOwnerName(longName: string, shortName: string): Promise<void> {
		ensureConfigured();
		await device.setOwner({ longName, shortName });
		await device.commitEditSettings();
	}

	/**
	 * Write LocalConfig section to device
	 * Automatically determines payloadVariant.case from config structure
	 */
	async function writeLocalConfig(config: any): Promise<void> {
		ensureConfigured();

		// Determine which config section this is based on structure
		// Config should have exactly one top-level key (device, lora, security, etc.)
		const sectionName = Object.keys(config)[0];
		if (!sectionName) {
			throw new Error('Invalid config: no section found');
		}

		// Extract the actual config data (without the section name wrapper)
		const configData = config[sectionName];

		// Resolve enum values (e.g., "RU" -> 9, "LONG_FAST" -> 0)
		// Use path with section name for enum resolution
		const resolvedConfig = resolveEnumValues(configData, `localConfig.${sectionName}`);

		// Wrap in Config object with payloadVariant
		// The library expects Config.Config which has a payloadVariant field
		const configWithVariant = {
			payloadVariant: { case: sectionName, value: resolvedConfig }
		};

		console.log(`[Meshtastic] Writing LocalConfig section: ${sectionName}`, configWithVariant);
		await device.setConfig(configWithVariant);
	}

	/**
	 * Write ModuleConfig section to device
	 * Automatically determines payloadVariant.case from config structure
	 */
	async function writeModuleConfig(config: any): Promise<void> {
		ensureConfigured();

		// Determine which module config section this is based on structure
		// Config should have exactly one top-level key (mqtt, serial, etc.)
		const sectionName = Object.keys(config)[0];
		if (!sectionName) {
			throw new Error('Invalid module config: no section found');
		}

		// Extract the actual config data (without the section name wrapper)
		const configData = config[sectionName];

		// Resolve enum values if any
		// Use path with section name for enum resolution
		const resolvedConfig = resolveEnumValues(configData, `moduleConfig.${sectionName}`);

		// Wrap in ModuleConfig object with payloadVariant
		const configWithVariant = {
			payloadVariant: { case: sectionName, value: resolvedConfig }
		};

		console.log(`[Meshtastic] Writing ModuleConfig section: ${sectionName}`, configWithVariant);
		await device.setModuleConfig(configWithVariant);
	}

	/**
	 * Write channel to device
	 */
	async function writeChannel(config: any): Promise<void> {
		ensureConfigured();
		console.log('[Meshtastic] Writing channel:', config);
		console.log('[Meshtastic] Channel psk:', config.settings?.psk);
		await device.setChannel(config);
	}

	/**
	 * Write owner to device
	 */
	async function writeOwner(config: any): Promise<void> {
		ensureConfigured();
		console.log('[Meshtastic] Writing owner:', config);
		await device.setOwner(config);
	}

	/**
	 * Commit all pending changes
	 */
	async function commitSettings(): Promise<void> {
		ensureConfigured();
		console.log('[Meshtastic] Committing settings changes...');
		await device.commitEditSettings();
		console.log('[Meshtastic] Settings committed successfully');
	}

	/**
	 * Read single channel from device
	 */
	async function readChannel(index: number, timeoutMs: number = 2000): Promise<MeshtasticChannelInfo> {
		ensureConfigured();

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Channel read timeout'));
			}, timeoutMs);

			const unsubscribe = device.events.onChannelPacket.subscribe((channel: any) => {
				clearTimeout(timeout);
				unsubscribe();
				resolve({
					index,
					config: channel,
					pending: device.pendingSettingsChanges
				});
			});

			device.getChannel(index).catch((error: Error) => {
				clearTimeout(timeout);
				unsubscribe();
				reject(error);
			});
		});
	}

	/**
	 * Read owner from device
	 */
	async function readOwner(timeoutMs: number = 2000): Promise<MeshtasticOwnerInfo> {
		ensureConfigured();

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Owner read timeout'));
			}, timeoutMs);

			const unsubscribe = device.events.onUserPacket.subscribe((packet: any) => {
				clearTimeout(timeout);
				unsubscribe();

				// Convert macaddr from base64/Uint8Array to hex format
				const owner = packet.data;
				if (owner?.macaddr) {
					owner.macaddr = macaddrToHex(owner.macaddr);
				}

				resolve({
					owner,
					pending: device.pendingSettingsChanges
				});
			});

			device.getOwner().catch((error: Error) => {
				clearTimeout(timeout);
				unsubscribe();
				reject(error);
			});
		});
	}

	function setEventCallbacks(callbacks: MeshtasticEventCallbacks): void {
		eventCallbacks = { ...callbacks };
	}

	function getConnectionStatus(): MeshtasticConnectionStatus {
		return connectionStatus;
	}

	// ========== Helper functions ==========

	function setupEventSubscriptions(): void {
		if (!device) return;

		device.events.onDeviceStatus.subscribe((status: DeviceStatusEnum) => {
			const newStatus = mapDeviceStatus(status);
			updateConnectionStatus(newStatus);
			eventCallbacks.onDeviceStatus?.(newStatus);
		});

		device.events.onMyNodeInfo.subscribe((myNodeInfo: any) => {
			console.log('[Meshtastic] onMyNodeInfo received:', myNodeInfo);
			cachedMyNodeInfo = myNodeInfo;
			const deviceInfo = extractDeviceInfo();
			// When we receive myNodeInfo, device is ready
			if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
				updateConnectionStatus('configured');
			}
			eventCallbacks.onMyNodeInfo?.(deviceInfo);
		});

		device.events.onNodeInfoPacket.subscribe((packet: any) => {
			// Collect all nodes in network
			if (packet.data && packet.data.num) {
				networkNodes.set(packet.data.num, packet.data);
				console.log('[Meshtastic] NodeInfo received:', packet.data.num, packet.data.user?.longName);
				console.log('[Meshtastic] NodeInfo keys:', Object.keys(packet.data));
				console.log('[Meshtastic] Full NodeInfo:', JSON.stringify(packet.data, null, 2));

				// Update stats
				updateNodeStats();

				// NodeInfo for our own node
				if (cachedMyNodeInfo && packet.data.num === cachedMyNodeInfo.myNodeNum) {
					cachedNodeInfo = packet.data;
					console.log('[Meshtastic] Cached own NodeInfo:', cachedNodeInfo);
					// Extract metrics from deviceMetrics
					if (packet.data.deviceMetrics) {
						extractMetrics(packet.data.deviceMetrics);
					}
					// Notify with updated device info
					const deviceInfo = extractDeviceInfo();
					eventCallbacks.onMyNodeInfo?.(deviceInfo);
				}
			}
		});

		device.events.onDeviceMetadataPacket.subscribe((packet: any) => {
			console.log('[Meshtastic] onDeviceMetadataPacket received:', packet);
			if (packet.data) {
				cachedDeviceMetadata = packet.data;
				console.log('[Meshtastic] Cached DeviceMetadata:', cachedDeviceMetadata);
				console.log('[Meshtastic] DeviceMetadata keys:', Object.keys(cachedDeviceMetadata));
				// Notify with updated device info
				const deviceInfo = extractDeviceInfo();
				eventCallbacks.onMyNodeInfo?.(deviceInfo);
			}
		});

		device.events.onConfigPacket.subscribe((config: any) => {
			eventCallbacks.onConfigPacket?.(config);
		});

		device.events.onModuleConfigPacket.subscribe((config: any) => {
			eventCallbacks.onModuleConfigPacket?.(config);
		});

		device.events.onChannelPacket.subscribe((channel: any) => {
			eventCallbacks.onChannelPacket?.(channel);
		});

		device.events.onUserPacket.subscribe((packet: any) => {
			// User packet for our own node (owner info)
			if (packet.data && cachedMyNodeInfo && packet.from === cachedMyNodeInfo.myNodeNum) {
				cachedOwner = packet.data;
				console.log('[Meshtastic] Cached owner:', cachedOwner);
				// Notify with updated device info
				const deviceInfo = extractDeviceInfo();
				eventCallbacks.onMyNodeInfo?.(deviceInfo);
			}
			eventCallbacks.onUserPacket?.(packet);
		});

		device.events.onTelemetryPacket.subscribe((packet: any) => {
			console.log('[Meshtastic] Telemetry packet received:', packet);
			console.log('[Meshtastic] Telemetry data keys:', packet.data ? Object.keys(packet.data) : 'no data');
			console.log('[Meshtastic] Telemetry data:', JSON.stringify(packet.data, null, 2));

			// Telemetry for our own node
			if (packet.data && cachedMyNodeInfo && packet.from === cachedMyNodeInfo.myNodeNum) {
				// Telemetry can have different variants: deviceMetrics, environmentMetrics, etc.
				const telemetry = packet.data;

				// Device metrics contain battery, chutil, airutil
				if (telemetry.deviceMetrics) {
					console.log('[Meshtastic] Device metrics telemetry:', telemetry.deviceMetrics);
					extractMetrics(telemetry.deviceMetrics);
				}

				// Environment metrics (temperature, humidity, etc.)
				if (telemetry.environmentMetrics) {
					console.log('[Meshtastic] Environment metrics:', telemetry.environmentMetrics);
				}

				// Power metrics (voltage, current)
				if (telemetry.powerMetrics) {
					console.log('[Meshtastic] Power metrics:', telemetry.powerMetrics);
					extractMetrics(telemetry.powerMetrics);
				}
			}
		});
	}

	/**
	 * Decode hardware model number to human-readable name
	 */
	function decodeHardwareModel(hwModel: number): string {
		// HardwareModel enum has reverse mapping: HardwareModel[94] = "HELTEC_MESH_POCKET"
		if (HardwareModel && HardwareModel[hwModel]) {
			return HardwareModel[hwModel];
		}
		// Fallback to showing the number
		return `Unknown (${hwModel})`;
	}

	function extractDeviceInfo(): MeshtasticDeviceInfo {
		if (!device?.myNodeInfo) {
			throw new Error('Device not initialized');
		}

		console.log('[Meshtastic] extractDeviceInfo myNodeInfo:', device.myNodeInfo);
		console.log('[Meshtastic] cachedNodeInfo:', cachedNodeInfo);
		console.log('[Meshtastic] cachedOwner:', cachedOwner);
		console.log('[Meshtastic] cachedDeviceMetadata:', cachedDeviceMetadata);

		const myNodeInfo = device.myNodeInfo;

		// Extract long and short names from Owner packet (has highest priority)
		let longName = cachedOwner?.longName;
		let shortName = cachedOwner?.shortName;

		// Fallback to NodeInfo user if Owner not available
		if (!longName && !shortName && cachedNodeInfo?.user) {
			longName = cachedNodeInfo.user.longName;
			shortName = cachedNodeInfo.user.shortName;
		}

		// nodeName for backward compatibility - use longName or shortName or 'Unknown'
		const nodeName = longName || shortName || 'Unknown';

		// Extract firmware version from DeviceMetadata
		let firmwareVersion = 'Unknown';
		if (cachedDeviceMetadata?.firmwareVersion) {
			firmwareVersion = cachedDeviceMetadata.firmwareVersion;
		} else if (myNodeInfo.minAppVersion) {
			firmwareVersion = `${myNodeInfo.minAppVersion}`;
		}

		// Extract hardware model from DeviceMetadata or pioEnv
		let hardwareModel = 'Unknown';
		if (cachedDeviceMetadata?.hwModel) {
			hardwareModel = decodeHardwareModel(cachedDeviceMetadata.hwModel);
		} else if (myNodeInfo.pioEnv) {
			hardwareModel = myNodeInfo.pioEnv;
		}

		return {
			nodeName,
			longName,
			shortName,
			nodeNum: myNodeInfo.myNodeNum || 0,
			firmwareVersion,
			hardwareModel,
			pioEnv: myNodeInfo.pioEnv || 'Unknown'
		};
	}

	function mapDeviceStatus(status: DeviceStatusEnum): MeshtasticConnectionStatus {
		switch (status) {
			case DeviceStatusEnum.DeviceDisconnected:
				return 'disconnected';
			case DeviceStatusEnum.DeviceConnecting:
				return 'connecting';
			case DeviceStatusEnum.DeviceConnected:
				return 'connected';
			case DeviceStatusEnum.DeviceConfiguring:
				return 'configuring';
			case DeviceStatusEnum.DeviceConfigured:
				return 'configured';
			case DeviceStatusEnum.DeviceReconnecting:
				return 'reconnecting';
			case DeviceStatusEnum.DeviceRestarting:
				return 'restarting';
			default:
				return 'disconnected';
		}
	}

	function updateConnectionStatus(status: MeshtasticConnectionStatus): void {
		connectionStatus = status;
	}

	/**
	 * Update node statistics (total and online nodes)
	 * Online = node has been heard from in the last 30 minutes
	 */
	function updateNodeStats(): void {
		const totalNodes = networkNodes.size;
		const now = Math.floor(Date.now() / 1000); // Current time in seconds
		const onlineThreshold = 30 * 60; // 30 minutes

		let onlineNodes = 0;
		for (const [, nodeInfo] of networkNodes.entries()) {
			if (nodeInfo.lastHeard && (now - nodeInfo.lastHeard) < onlineThreshold) {
				onlineNodes++;
			}
		}

		const stats: MeshtasticNodeStats = {
			totalNodes,
			onlineNodes
		};

		console.log('[Meshtastic] Node stats update:', stats);
		eventCallbacks.onNodeStatsUpdate?.(stats);
	}

	/**
	 * Extract metrics from device metrics data
	 * Handles both deviceMetrics from NodeInfo and telemetry packets
	 */
	function extractMetrics(data: any): void {
		console.log('[Meshtastic] Extracting metrics from:', data);

		const newMetrics: MeshtasticNodeMetrics = {};

		// Try different possible structures
		const metrics = data.deviceMetrics || data;

		if (metrics.batteryLevel !== undefined) {
			newMetrics.batteryLevel = metrics.batteryLevel;
		}
		if (metrics.voltage !== undefined) {
			newMetrics.voltage = metrics.voltage;
		}
		if (metrics.channelUtilization !== undefined) {
			newMetrics.chUtil = metrics.channelUtilization;
		}
		if (metrics.airUtilTx !== undefined) {
			newMetrics.airUtil = metrics.airUtilTx;
		}
		if (metrics.time !== undefined) {
			newMetrics.time = metrics.time;
		}

		// Log what we found
		if (Object.keys(newMetrics).length > 0) {
			console.log('[Meshtastic] Metrics extracted:', newMetrics);
			cachedMetrics = { ...cachedMetrics, ...newMetrics };
			eventCallbacks.onMetricsUpdate?.(cachedMetrics);
		} else {
			console.log('[Meshtastic] No metrics found in data. Available keys:', Object.keys(data || {}));
		}
	}

	async function waitForPendingSettings(): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Timeout waiting for pending settings to clear'));
			}, 10000); // 10 second timeout

			const checkPending = () => {
				if (!device?.pendingSettingsChanges) {
					clearTimeout(timeout);
					resolve();
				} else {
					setTimeout(checkPending, 100);
				}
			};
			checkPending();
		});
	}

	function ensureConfigured(): void {
		if (connectionStatus !== 'configured') {
			throw new Error('Device not configured. Please connect first.');
		}
	}

	function cleanup(): void {
		transport = null;
		device = null;
		serialPort = null;
	}

	/**
	 * Read all LocalConfig sections with retry
	 * Sections are read sequentially to avoid event subscription conflicts
	 */
	async function readAllLocalConfig(): Promise<Record<string, any>> {
		ensureConfigured();

		const results: Record<string, any> = {};

		// Get all numeric enum values
		const configTypes = Object.values(ConfigType).filter((v): v is number => typeof v === 'number');

		// Read configs sequentially
		for (const configNum of configTypes) {
			const result = await withRetry(
				() => new Promise<MeshtasticConfigReadResult<any>>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Config read timeout')), 2000);

					const unsubscribe = device.events.onConfigPacket.subscribe((config: any) => {
						clearTimeout(timeout);
						unsubscribe();
						resolve({ config, pending: device.pendingSettingsChanges });
					});

					device.getConfig(configNum).catch((error: Error) => {
						clearTimeout(timeout);
						unsubscribe();
						reject(error);
					});
				}),
				3,
				100
			);

			const caseName = result.config?.payloadVariant?.case;
			if (caseName) {
				const extractedData = extractConfigData(result.config);
				// Convert numeric enums to string names for readability
				results[caseName] = resolveEnumNames(extractedData, `localConfig.${caseName}`);
			}
		}

		return results;
	}

	/**
	 * Read all ModuleConfig sections with retry
	 * Sections are read sequentially to avoid event subscription conflicts
	 */
	async function readAllModuleConfig(): Promise<Record<string, any>> {
		ensureConfigured();

		const results: Record<string, any> = {};

		// Get all numeric enum values
		const moduleConfigTypes = Object.values(ModuleConfigType).filter((v): v is number => typeof v === 'number');

		// Read configs sequentially
		for (const configNum of moduleConfigTypes) {
			const result = await withRetry(
				() => new Promise<MeshtasticConfigReadResult<any>>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Module config read timeout')), 2000);

					const unsubscribe = device.events.onModuleConfigPacket.subscribe((config: any) => {
						clearTimeout(timeout);
						unsubscribe();
						resolve({ config, pending: device.pendingSettingsChanges });
					});

					device.getModuleConfig(configNum).catch((error: Error) => {
						clearTimeout(timeout);
						unsubscribe();
						reject(error);
					});
				}),
				3,
				100
			);

			const caseName = result.config?.payloadVariant?.case;
			if (caseName) {
				const extractedData = extractConfigData(result.config);
				// Convert numeric enums to string names for readability
				results[caseName] = resolveEnumNames(extractedData, `moduleConfig.${caseName}`);
			}
		}

		return results;
	}

	/**
	 * Read all channels (up to 8) with retry
	 * Stops at first failure (no more channels)
	 */
	async function readAllChannels(): Promise<MeshtasticChannelInfo[]> {
		ensureConfigured();

		const channels: MeshtasticChannelInfo[] = [];

		for (let i = 0; i < 8; i++) {
			try {
				const channel = await withRetry(
					() => readChannel(i),
					3, // retries
					100 // delay between retries
				);
				channels.push(channel);
			} catch {
				// No more channels
				break;
			}
		}

		return channels;
	}

	return {
		connect,
		disconnect,
		setOwnerName,
		writeLocalConfig,
		writeModuleConfig,
		writeChannel,
		writeOwner,
		commitSettings,
		readAllLocalConfig,
		readAllModuleConfig,
		readAllChannels,
		readOwner,
		setEventCallbacks,
		getConnectionStatus
	};
}

// ==================== Enum Resolution Utilities ====================

/**
 * Known enum paths for config fields
 * Maps config field paths to enum objects (lazy getter)
 */
const ENUM_PATHS: Record<string, () => any> = {
	'localConfig.lora.region': () => getEnums().Config_LoRaConfig_RegionCode,
	'localConfig.device.role': () => getEnums().Config_DeviceConfig_Role,
	'localConfig.lora.modemPreset': () => getEnums().Config_LoRaConfig_ModemPreset,
	'channels.config.role': () => null  // TODO: add Channel.ChannelRole if needed
};

/**
 * Resolve enum string names to numeric values in config object
 * Recursively processes all fields and converts known enum names to their numeric values
 *
 * @param config - The config object to process
 * @param path - Current path in the config (for tracking nested fields)
 */
export function resolveEnumValues(config: any, path: string = ''): any {
	if (typeof config !== 'object' || config === null) {
		return config;
	}

	if (Array.isArray(config)) {
		return config.map((item, index) => resolveEnumValues(item, `${path}[${index}]`));
	}

	const result: any = {};

	for (const [key, value] of Object.entries(config)) {
		const currentPath = path ? `${path}.${key}` : key;

		if (typeof value === 'string') {
			// Check if this field has an enum mapping
			const enumGetter = ENUM_PATHS[currentPath];
			const enumValues = enumGetter ? enumGetter() : undefined;
			if (enumValues && enumValues[value] !== undefined) {
				result[key] = enumValues[value];
				continue;
			}
			// Try case-insensitive match
			const upperKey = value.toUpperCase();
			if (enumValues && enumValues[upperKey] !== undefined) {
				result[key] = enumValues[upperKey];
				continue;
			}
			result[key] = value;
		} else if (typeof value === 'object' && value !== null) {
			result[key] = resolveEnumValues(value, currentPath);
		} else {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Resolve numeric enum values to string names in config object
 * Recursively processes all fields and converts known numeric values to their enum names
 * Used when reading config from device to make it human-readable
 *
 * @param config - The config object to process
 * @param path - Current path in the config (for tracking nested fields)
 */
export function resolveEnumNames(config: any, path: string = ''): any {
	if (typeof config !== 'object' || config === null) {
		return config;
	}

	if (Array.isArray(config)) {
		return config.map((item, index) => resolveEnumNames(item, `${path}[${index}]`));
	}

	const result: any = {};

	for (const [key, value] of Object.entries(config)) {
		const currentPath = path ? `${path}.${key}` : key;

		if (typeof value === 'number') {
			// Check if this field has an enum mapping
			const enumGetter = ENUM_PATHS[currentPath];
			const enumValues = enumGetter ? enumGetter() : undefined;
			if (enumValues) {
				// Find enum name by numeric value
				const enumName = Object.keys(enumValues).find(k => enumValues[k] === value);
				if (enumName) {
					result[key] = enumName;
					continue;
				}
			}
			result[key] = value;
		} else if (typeof value === 'object' && value !== null) {
			result[key] = resolveEnumNames(value, currentPath);
		} else {
			result[key] = value;
		}
	}

	return result;
}
