<script lang="ts">
	import {
		createMeshtasticManager,
		restoreUint8Arrays,
		meshtasticJsonReplacer,
		withRetry
	} from '$lib/utils/meshtastic.js';
	import type {
		MeshtasticDeviceInfo,
		MeshtasticFullConfig,
		MeshtasticConnectionStatus,
		MeshtasticConfigSelection
	} from '$lib/types.js';
	import { onMount, onDestroy } from 'svelte';
	import { _ as locales } from 'svelte-i18n';

	// Props
	export let isOpen = false;
	export let onClose = () => {};

	// Meshtastic manager
	let meshtasticManager: ReturnType<typeof createMeshtasticManager> | null = null;

	// Connection state
	let isPortSelected = false;
	let isConnecting = false;
	let deviceInfo: MeshtasticDeviceInfo | null = null;

	// Operation state
	let isSaving = false;
	let isLoading = false;
	let operationStatus = '';
	let operationError = '';

	// File input reference
	let fileInput: HTMLInputElement;

	// UI state
	let showInstructions = false;

	// Config file and selection state
	let parsedConfig: MeshtasticFullConfig | null = null;
	let configSelection: MeshtasticConfigSelection = {
		localConfig: { enabled: true, sections: [] },
		moduleConfig: { enabled: true, sections: [] },
		includeChannels: true,
		includeOwner: true
	};

	onMount(() => {
		meshtasticManager = createMeshtasticManager({
			baudRate: 115200,
			heartbeatInterval: 300000,
			autoConfigure: true
		});

		meshtasticManager.setEventCallbacks({
			onDeviceStatus: (status: MeshtasticConnectionStatus) => {
				if (status === 'disconnected') {
					isPortSelected = false;
					deviceInfo = null;
				}
			},
			onMyNodeInfo: (info: MeshtasticDeviceInfo) => {
				deviceInfo = info;
			}
		});
	});

	onDestroy(async () => {
		if (meshtasticManager) {
			await meshtasticManager.disconnect();
		}
	});

	async function selectPort() {
		isConnecting = true;
		operationStatus = $locales('meshtasticdevice.connecting');
		operationError = '';

		try {
			if (!meshtasticManager) {
				throw new Error('Manager not initialized');
			}

			const info = await meshtasticManager.connect();
			isPortSelected = true;
			deviceInfo = info;
			operationStatus = $locales('meshtasticdevice.connected');
		} catch (error) {
			operationError = $locales('meshtasticdevice.connect_error', {
				values: { error: error instanceof Error ? error.message : String(error) }
			});
			isPortSelected = false;
			deviceInfo = null;
		} finally {
			isConnecting = false;
		}
	}

	async function disconnectDevice() {
		if (!meshtasticManager) return;

		try {
			await meshtasticManager.disconnect();
			isPortSelected = false;
			deviceInfo = null;
			operationStatus = '';
		} catch (error) {
			operationError = $locales('meshtasticdevice.disconnect_error');
		}
	}

	async function saveConfiguration() {
		if (!isPortSelected || !meshtasticManager) {
			operationError = $locales('meshtasticdevice.not_connected');
			return;
		}

		isSaving = true;
		operationStatus = $locales('meshtasticdevice.reading_config');
		operationError = '';

		try {
			// Read LocalConfig sections (sequential with retry)
			operationStatus = $locales('meshtasticdevice.reading_local_config');
			const localConfig = await meshtasticManager.readAllLocalConfig();

			// Read ModuleConfig sections (sequential with retry)
			operationStatus = $locales('meshtasticdevice.reading_module_config');
			const moduleConfig = await meshtasticManager.readAllModuleConfig();

			// Read channels (sequential with retry)
			operationStatus = $locales('meshtasticdevice.reading_channels');
			const channels = await meshtasticManager.readAllChannels();

			// Read owner (with retry)
			operationStatus = $locales('meshtasticdevice.reading_owner');
			const ownerResult = await withRetry(
				() => meshtasticManager!.readOwner(),
				3,
				100
			);

			// Build full config
			const fullConfig: MeshtasticFullConfig = {
				version: '1.0',
				timestamp: new Date().toISOString(),
				deviceInfo: deviceInfo!,
				localConfig,
				moduleConfig,
				channels,
				owner: ownerResult.owner
			};

			// Download JSON config
			const filename = `meshtastic_config_${deviceInfo!.nodeName}_${Date.now()}.json`;
			downloadJsonFile(fullConfig, filename);

			operationStatus = $locales('meshtasticdevice.config_saved');
		} catch (error) {
			operationError = $locales('meshtasticdevice.save_error', {
				values: { error: error instanceof Error ? error.message : String(error) }
			});
		} finally {
			isSaving = false;
		}
	}

	function downloadJsonFile(data: any, filename: string) {
		// Use meshtasticJsonReplacer for BigInt and Uint8Array serialization
		const json = JSON.stringify(data, meshtasticJsonReplacer, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function selectConfigFile() {
		fileInput?.click();
	}

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		isLoading = true;
		operationStatus = $locales('meshtasticdevice.reading_config');
		operationError = '';

		try {
			// Read file content
			const content = await file.text();
			let config: any;

			// Parse as JSON
			try {
				config = JSON.parse(content);
			} catch {
				throw new Error($locales('meshtasticdevice.invalid_config_file'));
			}

			// Restore Uint8Array from base64 (security keys)
			const restoredConfig = restoreUint8Arrays(config);

			// Validate config has at least some data
			const hasLocalConfig = restoredConfig.localConfig && Object.keys(restoredConfig.localConfig).length > 0;
			const hasModuleConfig = restoredConfig.moduleConfig && Object.keys(restoredConfig.moduleConfig).length > 0;
			const hasChannels = restoredConfig.channels && restoredConfig.channels.length > 0;
			const hasOwner = restoredConfig.owner;

			if (!hasLocalConfig && !hasModuleConfig && !hasChannels && !hasOwner) {
				throw new Error($locales('meshtasticdevice.invalid_config_file'));
			}

			// Normalize config structure - ensure all required fields exist
			const normalizedConfig: MeshtasticFullConfig = {
				version: restoredConfig.version || '1.0',
				timestamp: restoredConfig.timestamp || new Date().toISOString(),
				deviceInfo: restoredConfig.deviceInfo || { nodeName: 'Unknown', nodeNum: 0, firmwareVersion: 'Unknown', hardwareModel: 'Unknown', pioEnv: 'Unknown' },
				localConfig: restoredConfig.localConfig || {},
				moduleConfig: restoredConfig.moduleConfig || {},
				channels: restoredConfig.channels || [],
				owner: restoredConfig.owner || null
			};

			// Store parsed config
			parsedConfig = normalizedConfig;

			// Initialize selection with all sections
			configSelection = {
				localConfig: {
					enabled: hasLocalConfig,
					sections: hasLocalConfig ? Object.keys(normalizedConfig.localConfig) : []
				},
				moduleConfig: {
					enabled: hasModuleConfig,
					sections: hasModuleConfig ? Object.keys(normalizedConfig.moduleConfig) : []
				},
				includeChannels: hasChannels,
				includeOwner: hasOwner
			};

			operationStatus = $locales('meshtasticdevice.select_sections');
		} catch (error) {
			operationError = $locales('meshtasticdevice.load_error', {
				values: { error: error instanceof Error ? error.message : String(error) }
			});
			parsedConfig = null;
		} finally {
			isLoading = false;
			target.value = '';
		}
	}

	async function writeConfigurationToDevice(config: MeshtasticFullConfig) {
		if (!meshtasticManager || !isPortSelected) {
			throw new Error($locales('meshtasticdevice.not_connected'));
		}

		// Write LocalConfig sections
		operationStatus = $locales('meshtasticdevice.writing_local_config');
		for (const [, configData] of Object.entries(config.localConfig)) {
			await meshtasticManager.writeLocalConfig(configData);
		}

		// Write ModuleConfig sections
		operationStatus = $locales('meshtasticdevice.writing_module_config');
		for (const [, moduleData] of Object.entries(config.moduleConfig)) {
			await meshtasticManager.writeModuleConfig(moduleData);
		}

		// Write channels
		operationStatus = $locales('meshtasticdevice.writing_channels');
		for (const channel of config.channels) {
			await meshtasticManager.writeChannel(channel.config);
		}

		// Write owner
		operationStatus = $locales('meshtasticdevice.writing_owner');
		await meshtasticManager.writeOwner(config.owner);

		// Commit all changes
		operationStatus = 'Committing changes...';
		await meshtasticManager.commitSettings();
	}

	function filterConfigBySelection(
		config: MeshtasticFullConfig,
		selection: MeshtasticConfigSelection
	): MeshtasticFullConfig {
		const result: MeshtasticFullConfig = {
			version: config.version,
			timestamp: config.timestamp,
			deviceInfo: config.deviceInfo,
			localConfig: {},
			moduleConfig: {},
			channels: [],
			owner: null
		};

		// Filter localConfig sections
		if (selection.localConfig.enabled) {
			for (const section of selection.localConfig.sections) {
				if (config.localConfig[section]) {
					result.localConfig[section] = config.localConfig[section];
				}
			}
		}

		// Filter moduleConfig sections
		if (selection.moduleConfig.enabled) {
			for (const section of selection.moduleConfig.sections) {
				if (config.moduleConfig[section]) {
					result.moduleConfig[section] = config.moduleConfig[section];
				}
			}
		}

		// Include channels if selected
		if (selection.includeChannels) {
			result.channels = config.channels;
		}

		// Include owner if selected
		if (selection.includeOwner) {
			result.owner = config.owner;
		}

		return result;
	}

	function isSelectionValid(): boolean {
		if (configSelection.localConfig.enabled && configSelection.localConfig.sections.length > 0) {
			return true;
		}
		if (configSelection.moduleConfig.enabled && configSelection.moduleConfig.sections.length > 0) {
			return true;
		}
		if (configSelection.includeChannels) {
			return true;
		}
		if (configSelection.includeOwner) {
			return true;
		}
		return false;
	}

	async function uploadSelectedConfig() {
		if (!isPortSelected || !meshtasticManager || !parsedConfig) {
			operationError = $locales('meshtasticdevice.not_connected');
			return;
		}

		if (!isSelectionValid()) {
			operationError = $locales('meshtasticdevice.no_sections_selected');
			return;
		}

		isLoading = true;
		operationStatus = $locales('meshtasticdevice.writing_config');
		operationError = '';

		try {
			// Filter config based on selection
			const filteredConfig = filterConfigBySelection(parsedConfig, configSelection);

			// Write filtered config to device
			await writeConfigurationToDevice(filteredConfig);

			operationStatus = $locales('meshtasticdevice.config_loaded');
			parsedConfig = null; // Clear after successful upload
		} catch (error) {
			operationError = $locales('meshtasticdevice.load_error', {
				values: { error: error instanceof Error ? error.message : String(error) }
			});
		} finally {
			isLoading = false;
		}
	}

	function toggleAllLocalConfig(select: boolean) {
		if (!parsedConfig) return;
		configSelection.localConfig.sections = select
			? Object.keys(parsedConfig.localConfig)
			: [];
	}

	function toggleAllModuleConfig(select: boolean) {
		if (!parsedConfig) return;
		configSelection.moduleConfig.sections = select
			? Object.keys(parsedConfig.moduleConfig)
			: [];
	}

	async function testSetOwner() {
		if (!meshtasticManager || !isPortSelected) {
			operationError = 'Not connected';
			return;
		}

		isLoading = true;
		operationStatus = 'Setting owner name...';
		operationError = '';

		try {
			await meshtasticManager.setOwnerName('Test Device', 'TEST');
			operationStatus = 'Owner name set successfully!';
		} catch (error) {
			operationError = `Failed: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isLoading = false;
		}
	}

	async function handleClose() {
		if (isSaving || isLoading) return;
		await disconnectDevice();
		parsedConfig = null; // Clear parsed config on close
		onClose();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
		on:click={(e) => e.target === e.currentTarget && handleClose()}
		on:keydown={(e) => e.key === 'Escape' && !isSaving && !isLoading && handleClose()}
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
					{$locales('meshtasticdevice.title')}
				</h2>
				<button
					on:click={handleClose}
					on:keydown={(e) => e.key === 'Escape' && handleClose()}
					disabled={isSaving || isLoading}
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
							{$locales('meshtasticdevice.select_port')}
						</label>
					</div>
					<div>
						<label class="block text-sm font-medium text-orange-300">
							{$locales('meshtasticdevice.config_actions')}
						</label>
					</div>
				</div>

				<!-- Status messages -->
				{#if operationError}
					<div
						role="alert"
						aria-live="assertive"
						class="rounded-md border border-red-700 bg-red-900 p-3"
					>
						<div class="text-sm text-red-200">{operationError}</div>
					</div>
				{/if}

				{#if operationStatus && !operationError}
					<div role="status" aria-live="polite" class="rounded-md bg-gray-700 p-3">
						<div class="text-sm text-orange-200">{operationStatus}</div>
					</div>
				{/if}

				<!-- Two-column layout -->
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Left column: Port selection -->
					<div class="space-y-3">
						<div class="h-[100px]">
							{#if !isPortSelected}
								<button
									on:click={selectPort}
									disabled={isConnecting || isSaving || isLoading}
									class="h-full w-full rounded-lg border-2 border-dashed border-gray-600 p-4 text-center transition-colors hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{#if isConnecting}
										<div class="space-y-2">
											<div class="animate-spin text-2xl">⏳</div>
											<div class="text-sm text-orange-200">
												{$locales('meshtasticdevice.connecting')}
											</div>
										</div>
									{:else}
										<div class="space-y-2">
											<div class="text-2xl">🔌</div>
											<div class="text-sm text-orange-200">
												{$locales('meshtasticdevice.click_to_select_port')}
											</div>
										</div>
									{/if}
								</button>
							{:else}
								<!-- Port selected -->
								<div class="relative h-full rounded-lg border border-gray-600 bg-gray-800 p-4">
									<div class="flex h-full flex-col justify-center">
										<div class="mb-1 flex items-center space-x-2">
											<div class="text-lg">✅</div>
											<div class="text-sm font-medium text-green-400">
												{$locales('meshtasticdevice.port_connected')}
											</div>
										</div>
										{#if deviceInfo}
											<div class="text-xs text-gray-400">
												<div>
													<strong>{$locales('meshtasticdevice.node_name')}:</strong>
													{deviceInfo.nodeName}
												</div>
												<div>
													<strong>{$locales('meshtasticdevice.firmware_version')}:</strong>
													{deviceInfo.firmwareVersion}
												</div>
												<div>
													<strong>{$locales('meshtasticdevice.hardware_model')}:</strong>
													{deviceInfo.hardwareModel}
												</div>
												<div>
													<strong>{$locales('meshtasticdevice.pio_env')}:</strong>
													{deviceInfo.pioEnv}
												</div>
											</div>
										{/if}
									</div>
									<button
										on:click={async () => await disconnectDevice()}
										disabled={isSaving || isLoading}
										class="absolute right-2 top-2 text-xs text-gray-400 transition-colors hover:text-red-400 disabled:cursor-not-allowed"
									>
										{$locales('meshtasticdevice.disconnect')}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Right column: Config actions -->
					<div class="space-y-3">
						<button
							on:click={saveConfiguration}
							disabled={!isPortSelected || isSaving || isLoading}
							class="flex w-full items-center justify-center space-x-2 rounded-md bg-orange-600 px-4 py-2 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span>📥</span>
							<span>{$locales('meshtasticdevice.save_button')}</span>
							{#if isSaving}
								<span class="animate-spin">⏳</span>
							{/if}
						</button>

						<button
							on:click={selectConfigFile}
							disabled={!isPortSelected || isSaving || isLoading}
							class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span>📤</span>
							<span>{$locales('meshtasticdevice.load_button')}</span>
							{#if isLoading}
								<span class="animate-spin">⏳</span>
							{/if}
						</button>

						<!-- Test button -->
						<button
							on:click={testSetOwner}
							disabled={!isPortSelected || isSaving || isLoading}
							class="flex w-full items-center justify-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span>🧪</span>
							<span>Test: Set Owner</span>
						</button>

						<!-- Hidden file input -->
						<input
							bind:this={fileInput}
							type="file"
							accept=".json,application/json"
							on:change={handleFileSelect}
							class="hidden"
						/>
					</div>
				</div>

				<!-- Config Selection Section (shown after file is parsed) -->
				{#if parsedConfig}
					<div class="space-y-4 rounded-md border border-gray-600 bg-gray-900 p-4">
						<h3 class="text-sm font-medium text-orange-300">
							{$locales('meshtasticdevice.select_sections')}
						</h3>

						<!-- LocalConfig Section -->
						{#if Object.keys(parsedConfig.localConfig).length > 0}
						<div class="space-y-2">
							<label class="flex cursor-pointer items-center space-x-2">
								<input
									type="checkbox"
									bind:checked={configSelection.localConfig.enabled}
									on:change={(e) => {
										toggleAllLocalConfig(e.currentTarget.checked);
									}}
									class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
								/>
								<span class="text-sm font-medium text-gray-300">
									{$locales('meshtasticdevice.local_config')}
								</span>
							</label>
							<div class="grid grid-cols-2 gap-2 pl-6 md:grid-cols-3">
								{#each Object.keys(parsedConfig.localConfig) as section}
									<label class="flex items-center space-x-2 text-xs text-gray-400">
										<input
											type="checkbox"
											bind:group={configSelection.localConfig.sections}
											value={section}
											class="h-3 w-3 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
										/>
										<span>{section}</span>
									</label>
								{/each}
							</div>
						</div>
						{/if}

						<!-- ModuleConfig Section -->
						{#if Object.keys(parsedConfig.moduleConfig).length > 0}
						<div class="space-y-2">
							<label class="flex cursor-pointer items-center space-x-2">
								<input
									type="checkbox"
									bind:checked={configSelection.moduleConfig.enabled}
									on:change={(e) => {
										toggleAllModuleConfig(e.currentTarget.checked);
									}}
									class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
								/>
								<span class="text-sm font-medium text-gray-300">
									{$locales('meshtasticdevice.module_config')}
								</span>
							</label>
							<div class="grid grid-cols-2 gap-2 pl-6 md:grid-cols-3">
								{#each Object.keys(parsedConfig.moduleConfig) as section}
									<label class="flex items-center space-x-2 text-xs text-gray-400">
										<input
											type="checkbox"
											bind:group={configSelection.moduleConfig.sections}
											value={section}
											class="h-3 w-3 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
										/>
										<span>{section}</span>
									</label>
								{/each}
							</div>
						</div>
						{/if}

						<!-- Channels and Owner -->
						<div class="flex flex-wrap gap-4">
							{#if parsedConfig.channels && parsedConfig.channels.length > 0}
								<label class="flex items-center space-x-2">
									<input
										type="checkbox"
										bind:checked={configSelection.includeChannels}
										class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
									/>
									<span class="text-sm text-gray-300">
										{$locales('meshtasticdevice.channels')} ({parsedConfig.channels.length})
									</span>
								</label>
							{/if}
							{#if parsedConfig.owner}
								<label class="flex items-center space-x-2">
									<input
										type="checkbox"
										bind:checked={configSelection.includeOwner}
										class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
									/>
									<span class="text-sm text-gray-300">
										{$locales('meshtasticdevice.owner')}
									</span>
								</label>
							{/if}
						</div>

						<!-- Upload button -->
						<button
							on:click={uploadSelectedConfig}
							disabled={!isSelectionValid() || isLoading}
							class="flex w-full items-center justify-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span>📤</span>
							<span>{$locales('meshtasticdevice.upload_selected')}</span>
							{#if isLoading}
								<span class="animate-spin">⏳</span>
							{/if}
						</button>
					</div>
				{/if}

				<!-- Instructions Spoiler -->
				<div class="space-y-2">
					<button
						on:click={() => (showInstructions = !showInstructions)}
						class="flex items-center space-x-2 text-sm font-medium text-orange-300 transition-colors hover:text-orange-200"
					>
						<span>{$locales('meshtasticdevice.instructions_title')}</span>
						<span class="text-xs">{showInstructions ? '▼' : '▶'}</span>
					</button>

					{#if showInstructions}
						<div class="space-y-2">
							<ol class="list-inside list-decimal space-y-1 text-xs text-gray-400">
								<li>{$locales('meshtasticdevice.step1_connect')}</li>
								<li>{$locales('meshtasticdevice.step2_save')}</li>
								<li>{$locales('meshtasticdevice.step3_load')}</li>
							</ol>
							<div
								class="mt-2 rounded-md border border-yellow-700/50 bg-yellow-900/20 p-2 text-xs text-yellow-400"
							>
								⚠️ {$locales('meshtasticdevice.warning_config')}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="flex justify-end space-x-3 border-t border-gray-700 p-6">
				<button
					on:click={handleClose}
					disabled={isSaving || isLoading}
					class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{$locales('common.close')}
				</button>
			</div>
		</div>
	</div>
{/if}
