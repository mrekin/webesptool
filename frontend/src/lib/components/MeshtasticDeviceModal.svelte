<script lang="ts">
    import {
        createMeshtasticManager,
        restoreUint8Arrays,
        meshtasticJsonReplacer,
        withRetry,
        resolveEnumValues,
        validateMeshtasticConfig,
        computeConfigDiff,
        formatValue
    } from '$lib/utils/meshtastic.js';
    import type {
        MeshtasticDeviceInfo,
        MeshtasticFullConfig,
        MeshtasticConnectionStatus,
        MeshtasticConfigSelection,
        MeshtasticNodeMetrics,
        MeshtasticNodeStats,
        MeshtasticConfigChanges,
        TooltipState
    } from '$lib/types.js';
    import { onMount, onDestroy } from 'svelte';
    import { _ as locales } from 'svelte-i18n';
    import JsonPreviewModal from './JsonPreviewModal.svelte';

    // Props
    let { isOpen = false, onClose = () => {} } = $props();

    // Meshtastic manager
    let meshtasticManager: ReturnType<typeof createMeshtasticManager> | null = null;

    // Connection state
    let isPortSelected = $state(false);
    let isConnecting = $state(false);
    let deviceInfo = $state<MeshtasticDeviceInfo | null>(null);

    // Connection indicator state
    let connectionColor = $derived(
        isConnecting
            ? 'bg-yellow-500'
            : isPortSelected && deviceInfo
              ? 'bg-green-500'
              : 'bg-red-500'
    );
    let isPulsing = $state(false);

    // Operation state
    let isSaving = $state(false);
    let isLoading = $state(false);
    let operationStatus = $state('');
    let operationError = $state('');

    // DFU state
    let isEnteringDfu = $state(false);
    let showDfuConfirm = $state(false);

    // File input reference
    let fileInput = $state<HTMLInputElement | undefined>(undefined);

    // UI state
    let showInstructions = $state(false);
    let showPresetConfigs = $state(false);
    let showJsonPreviewModal = $state(false);

    // Network metrics
    let nodeStats = $state<MeshtasticNodeStats>({ totalNodes: 0, onlineNodes: 0 });
    let deviceMetrics = $state<MeshtasticNodeMetrics>({});

    // Preset configs
    let presetConfigs = $state<string[]>([]);

    // Config file and selection state
    let parsedConfig = $state<MeshtasticFullConfig | null>(null);
    let configFromDevice = $state(false); // Track if config is from device (not from file)
    let configSelection = $state<MeshtasticConfigSelection>({
        localConfig: { enabled: true, sections: [] },
        moduleConfig: { enabled: true, sections: [] },
        includeChannels: true,
        includeOwner: true
    });

    // Config diff state
    let originalConfig = $state<MeshtasticFullConfig | null>(null);

    let configChanges = $derived<MeshtasticConfigChanges | null>(
        computeConfigDiff(originalConfig, parsedConfig)
    );

    // Tooltip state for config diff
    let tooltipState = $state<TooltipState>({
        visible: false,
        x: 0,
        y: 0,
        content: ''
    });

    onMount(() => {
        meshtasticManager = createMeshtasticManager({
            baudRate: 115200,
            heartbeatInterval: 300000,
            autoConfigure: true
        });

        meshtasticManager.setEventCallbacks({
            onDeviceStatus: (status: MeshtasticConnectionStatus) => {
                if (status === 'disconnected') {
                    if (isEnteringDfu) {
                        // Expected disconnection when entering DFU
                        operationStatus = $locales('meshtasticdevice.dfu_success');
                        isEnteringDfu = false;
                    } else {
                        // Normal disconnection
                        isPortSelected = false;
                        deviceInfo = null;
                        nodeStats = { totalNodes: 0, onlineNodes: 0 };
                        deviceMetrics = {};
                    }
                }
            },
            onMyNodeInfo: (info: MeshtasticDeviceInfo) => {
                // Create a new object to ensure Svelte 5 reactivity
                deviceInfo = { ...info };
            },
            onNodeStatsUpdate: (stats: MeshtasticNodeStats) => {
                nodeStats = { ...stats };
                triggerPulse();
            },
            onMetricsUpdate: (metrics: MeshtasticNodeMetrics) => {
                deviceMetrics = { ...metrics };
                triggerPulse();
            },
            onConfigPacket: (_config: any) => {
                triggerPulse();
            },
            onModuleConfigPacket: (_config: any) => {
                triggerPulse();
            },
            onChannelPacket: (_channel: any) => {
                triggerPulse();
            },
            onUserPacket: (_user: any) => {
                triggerPulse();
            },
            onMessagePacket: (_data: any) => {
                console.log('[Meshtastic] onMessagePacket callback');
                triggerPulse();
            },
            onMeshPacket: (_data: any) => {
                console.log('[Meshtastic] onMeshPacket callback');
                triggerPulse();
            }
        });
    });

    // Disconnect flag to prevent race conditions
    let isDisconnecting = $state(false);

    onDestroy(async () => {
        if (meshtasticManager && !isDisconnecting) {
            console.log('[Meshtastic] OnDestroy - disconnecting');
            await meshtasticManager.disconnect();
        }
    });

    // Auto-disconnect when modal closes
    async function handleModalClose() {
        if (!meshtasticManager || isDisconnecting) return;

        isDisconnecting = true;
        console.log('[Meshtastic] Modal closed, auto-disconnecting...');
        await disconnectDevice()
            .catch((err) => {
                // Ignore disconnect errors - they're expected
                if (
                    err?.message?.includes('device has been lost') ||
                    err?.name === 'NetworkError'
                ) {
                    console.log('[Meshtastic] Device disconnected (expected error)');
                } else {
                    console.error('[Meshtastic] Disconnect error:', err);
                }
            })
            .finally(() => {
                isDisconnecting = false;
            });
    }

    $effect(() => {
        if (!isOpen && meshtasticManager && !isDisconnecting) {
            handleModalClose();
        }
    });

    // Load preset configs list
    const presetConfigModules = import.meta.glob('/src/lib/config/meshtastic_configs/*.json');

    async function loadPresetConfigs() {
        try {
            presetConfigs = Object.keys(presetConfigModules).map((path) => {
                return path.split('/').pop() || '';
            });
        } catch (error) {
            console.error('Failed to load preset configs:', error);
            presetConfigs = [];
        }
    }

    // Load preset config by filename
    async function loadPresetConfig(filename: string) {
        showPresetConfigs = false;
        isLoading = true;
        operationStatus = $locales('meshtasticdevice.reading_config');
        operationError = '';

        try {
            const modulePath = `/src/lib/config/meshtastic_configs/${filename}`;
            const module = (await presetConfigModules[modulePath]()) as Record<string, any>;
            let config: any = module.default || module;

            console.log('[Meshtastic] Loading preset config:', filename, config);

            // Validate config has at least some data
            const validation = validateMeshtasticConfig(config);
            if (!validation.valid) {
                throw new Error($locales('meshtasticdevice.invalid_config_file'));
            }

            // Don't modify original config - use it as-is
            // Use JSON serialization to handle Uint8Array correctly (keep base64 strings)
            const normalizedConfig: MeshtasticFullConfig = JSON.parse(
                JSON.stringify(config, meshtasticJsonReplacer)
            );

            console.log('[Meshtastic] Normalized config:', normalizedConfig);

            // Check what sections are present
            const hasLocalConfig = !!(
                normalizedConfig.localConfig && Object.keys(normalizedConfig.localConfig).length > 0
            );
            const hasModuleConfig = !!(
                normalizedConfig.moduleConfig &&
                Object.keys(normalizedConfig.moduleConfig).length > 0
            );
            const hasChannels = !!(
                normalizedConfig.channels && normalizedConfig.channels.length > 0
            );
            const hasOwner = !!normalizedConfig.owner;

            // Store parsed config
            parsedConfig = normalizedConfig;
            configFromDevice = false; // Config from file
            originalConfig = null; // No original - everything is changed

            // Initialize selection with all sections
            configSelection = {
                localConfig: {
                    enabled: hasLocalConfig,
                    sections: hasLocalConfig ? Object.keys(normalizedConfig.localConfig as Record<string, any>) : []
                },
                moduleConfig: {
                    enabled: hasModuleConfig,
                    sections: hasModuleConfig ? Object.keys(normalizedConfig.moduleConfig as Record<string, any>) : []
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
        }
    }

    // Load preset configs when modal opens
    $effect(() => {
        if (isOpen) {
            loadPresetConfigs();
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

    function triggerPulse() {
        // Only show activity when device is connected
        if (!isPortSelected || !deviceInfo) return;

        // Don't restart if already pulsing
        if (isPulsing) return;

        isPulsing = true;

        // Single blink: 1.0s animation
        setTimeout(() => {
            isPulsing = false;
        }, 1050);
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

    async function handleEnterDfuMode() {
        if (!meshtasticManager || !isPortSelected) return;

        showDfuConfirm = false;
        isEnteringDfu = true;
        operationStatus = $locales('meshtasticdevice.dfu_entering');
        operationError = '';

        try {
            await meshtasticManager.enterDfuMode();
            // Device will reboot and disconnect
            // onDeviceStatus callback will handle the disconnection
        } catch (error) {
            operationError = $locales('meshtasticdevice.dfu_error', {
                values: { error: error instanceof Error ? error.message : String(error) }
            });
            isEnteringDfu = false;
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
            const ownerResult = await withRetry(() => meshtasticManager!.readOwner(), 3, 100);

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

            // Serialize to JSON with proper handling of Uint8Array, then parse back
            // This ensures Uint8Array is stored as base64 strings for display/download
            const serializedConfig = JSON.parse(JSON.stringify(fullConfig, meshtasticJsonReplacer));

            // Store config in parsedConfig to reuse existing UI
            parsedConfig = serializedConfig;
            configFromDevice = true; // Config from device

            // Deep clone original config for diff comparison
            // JSON serialization is safe here since config was already serialized (no Uint8Array)
            originalConfig = JSON.parse(JSON.stringify(serializedConfig));

            // Initialize selection with all sections
            configSelection = {
                localConfig: {
                    enabled: Object.keys(fullConfig.localConfig ?? {}).length > 0,
                    sections: Object.keys(fullConfig.localConfig ?? {})
                },
                moduleConfig: {
                    enabled: Object.keys(fullConfig.moduleConfig ?? {}).length > 0,
                    sections: Object.keys(fullConfig.moduleConfig ?? {})
                },
                includeChannels: (fullConfig.channels ?? []).length > 0,
                includeOwner: !!fullConfig.owner
            };

            operationStatus = $locales('meshtasticdevice.config_ready');
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

    async function downloadDeviceConfig() {
        if (!parsedConfig) return;

        // Filter config based on current selection
        const filteredConfig = filterConfigBySelection(parsedConfig, configSelection);

        // Generate filename - use deviceInfo from config or fallback
        const nodeName = parsedConfig.deviceInfo?.nodeName || deviceInfo?.nodeName || 'device';
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').split('T')[0]; // YYYY-MM-DD
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        const filename = `meshtastic_config_${nodeName}_${dateStr}_${timeStr}.json`;

        // Download
        downloadJsonFile(filteredConfig, filename);

        operationStatus = $locales('meshtasticdevice.config_saved');
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
            // Don't convert enum strings to numbers - keep as-is for display
            const restoredConfig = restoreUint8Arrays(config);

            // Validate config has at least some data
            const validation = validateMeshtasticConfig(restoredConfig);
            if (!validation.valid) {
                throw new Error($locales('meshtasticdevice.invalid_config_file'));
            }

            // Don't modify original config - use it as-is
            // Use JSON serialization to handle Uint8Array correctly
            const normalizedConfig: MeshtasticFullConfig = JSON.parse(
                JSON.stringify(restoredConfig, meshtasticJsonReplacer)
            );

            // Check what sections are present
            const hasLocalConfig =
                !!(normalizedConfig.localConfig &&
                Object.keys(normalizedConfig.localConfig).length > 0);
            const hasModuleConfig =
                !!(normalizedConfig.moduleConfig &&
                Object.keys(normalizedConfig.moduleConfig).length > 0);
            const hasChannels = !!(normalizedConfig.channels && normalizedConfig.channels.length > 0);
            const hasOwner = !!normalizedConfig.owner;

            // Store parsed config
            parsedConfig = normalizedConfig;
            configFromDevice = false; // Config from file
            originalConfig = null; // No original - everything is changed

            // Initialize selection with all sections
            configSelection = {
                localConfig: {
                    enabled: hasLocalConfig,
                    sections: hasLocalConfig ? Object.keys(normalizedConfig.localConfig as Record<string, any>) : []
                },
                moduleConfig: {
                    enabled: hasModuleConfig,
                    sections: hasModuleConfig ? Object.keys(normalizedConfig.moduleConfig as Record<string, any>) : []
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

        console.log('[Meshtastic] Preparing config for device write');
        console.log('[Meshtastic] Config before restoration:', JSON.stringify(config, null, 2));

        // Restore Uint8Array from base64/hex strings before writing to device
        // This handles all fields that should be Uint8Array for protobuf encoding
        const configForDevice = restoreUint8Arrays(config);

        console.log(
            '[Meshtastic] Config after restoreUint8Arrays:',
            JSON.stringify(
                configForDevice,
                (key, value) => {
                    if (value instanceof Uint8Array) {
                        return `Uint8Array(${value.length} bytes)`;
                    }
                    return value;
                },
                2
            )
        );

        // Write LocalConfig sections
        operationStatus = $locales('meshtasticdevice.writing_local_config');
        for (const [sectionName, configData] of Object.entries(configForDevice.localConfig)) {
            console.log(`[Meshtastic] Writing LocalConfig section: ${sectionName}`);
            // Wrap configData with section name so writeLocalConfig can determine payloadVariant.case
            await meshtasticManager.writeLocalConfig({ [sectionName]: configData });
        }

        // Write ModuleConfig sections
        operationStatus = $locales('meshtasticdevice.writing_module_config');
        for (const [sectionName, moduleData] of Object.entries(configForDevice.moduleConfig)) {
            console.log(`[Meshtastic] Writing ModuleConfig section: ${sectionName}`);
            // Wrap moduleData with section name so writeModuleConfig can determine payloadVariant.case
            await meshtasticManager.writeModuleConfig({ [sectionName]: moduleData });
        }

        // Write channels
        operationStatus = $locales('meshtasticdevice.writing_channels');
        for (const channel of configForDevice.channels) {
            console.log('[Meshtastic] Writing channel:', channel);
            await meshtasticManager.writeChannel(channel.config);
        }

        // Write owner (if present)
        if (configForDevice.owner) {
            operationStatus = $locales('meshtasticdevice.writing_owner');
            console.log('[Meshtastic] Writing owner:', configForDevice.owner);
            await meshtasticManager.writeOwner(configForDevice.owner);
        }

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
                if (config.localConfig?.[section]) {
                    result.localConfig![section] = config.localConfig[section];
                }
            }
        }

        // Filter moduleConfig sections
        if (selection.moduleConfig.enabled) {
            for (const section of selection.moduleConfig.sections) {
                if (config.moduleConfig?.[section]) {
                    result.moduleConfig![section] = config.moduleConfig[section];
                }
            }
        }

        // Include channels if selected
        if (selection.includeChannels) {
            result.channels = config.channels ?? [];
        }

        // Include owner if selected
        if (selection.includeOwner) {
            result.owner = config.owner;
        }

        return result;
    }

    function isSelectionValid(): boolean {
        if (
            configSelection.localConfig.enabled &&
            configSelection.localConfig.sections.length > 0
        ) {
            return true;
        }
        if (
            configSelection.moduleConfig.enabled &&
            configSelection.moduleConfig.sections.length > 0
        ) {
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
            originalConfig = null; // Clear original config
            configFromDevice = false;
        } catch (error) {
            operationError = $locales('meshtasticdevice.load_error', {
                values: { error: error instanceof Error ? error.message : String(error) }
            });
        } finally {
            isLoading = false;
        }
    }

    function toggleAllLocalConfig(select: boolean) {
        if (!parsedConfig?.localConfig) return;
        configSelection.localConfig.enabled = select;
        configSelection.localConfig.sections = select ? Object.keys(parsedConfig.localConfig) : [];
    }

    function toggleAllModuleConfig(select: boolean) {
        if (!parsedConfig?.moduleConfig) return;
        configSelection.moduleConfig.enabled = select;
        configSelection.moduleConfig.sections = select
            ? Object.keys(parsedConfig.moduleConfig)
            : [];
    }

    // Universal function to get all config sections
    function getConfigSections() {
        const sections: any[] = [];

        // LocalConfig sections
        if (parsedConfig?.localConfig) {
            const localConfig = parsedConfig.localConfig;
            sections.push({
                type: 'localConfig',
                label: $locales('meshtasticdevice.local_config'),
                enabled: configSelection.localConfig.enabled,
                bindGroup: configSelection.localConfig.sections,
                toggleFn: toggleAllLocalConfig,
                sections: Object.keys(localConfig).map((name) => ({
                    name,
                    value: name,
                    label: `${name} (${Object.keys(localConfig[name]).length})`
                }))
            });
        }

        // ModuleConfig sections
        if (parsedConfig?.moduleConfig) {
            const moduleConfig = parsedConfig.moduleConfig;
            sections.push({
                type: 'moduleConfig',
                label: $locales('meshtasticdevice.module_config'),
                enabled: configSelection.moduleConfig.enabled,
                bindGroup: configSelection.moduleConfig.sections,
                toggleFn: toggleAllModuleConfig,
                sections: Object.keys(moduleConfig).map((name) => ({
                    name,
                    value: name,
                    label: `${name} (${Object.keys(moduleConfig[name]).length})`
                }))
            });
        }

        // Channels
        if (parsedConfig?.channels && parsedConfig.channels.length > 0) {
            sections.push({
                type: 'channels',
                label: `${$locales('meshtasticdevice.channels')} (${parsedConfig.channels.length})`,
                enabled: configSelection.includeChannels,
                bindGroup: null,
                toggleFn: () => {},
                sections: [
                    {
                        name: null,
                        value: null,
                        label: $locales('meshtasticdevice.channels')
                    }
                ]
            });
        }

        // Owner
        if (parsedConfig?.owner) {
            sections.push({
                type: 'owner',
                label: $locales('meshtasticdevice.owner'),
                enabled: configSelection.includeOwner,
                bindGroup: null,
                toggleFn: () => {},
                sections: [
                    {
                        name: null,
                        value: null,
                        label: $locales('meshtasticdevice.owner')
                    }
                ]
            });
        }

        return sections;
    }

    // Handle config save from JSON preview modal
    function handleJsonPreviewSave(updatedConfig: MeshtasticFullConfig) {
        parsedConfig = updatedConfig;
    }

    // Universal tooltip for changes - works with any data path
    function showChangesTooltip(
        event: MouseEvent,
        changes: string[] | 'all' | null | undefined,
        dataPath: string[]
    ) {
        if (!changes) return;

        let content = '';

        if (changes === 'all') {
            // Show list of all parameters that will be written
            const fullPath = [...dataPath];
            let dataObj: any = parsedConfig;

            for (const key of fullPath) {
                dataObj = dataObj?.[key];
            }

            // Get all parameter names
            const allParams = dataObj ? Object.keys(dataObj) : [];

            if (allParams.length <= 15) {
                // Show all parameters
                content = $locales('meshtasticdevice.changed_params') + '\n';
                for (const param of allParams) {
                    const newValue = dataObj?.[param];
                    content += `\n- ${param}: "${formatValue(newValue)}"`;
                }
            } else {
                // Too many parameters - suggest using editor
                content = $locales('meshtasticdevice.too_many_parameters') + '\n\n';
                content += $locales('meshtasticdevice.check_in_editor');
            }
        } else {
            // Show only changed parameters with old values
            content = $locales('meshtasticdevice.changed_params') + '\n';
            const items = changes.slice(0, 15);

            for (const item of items) {
                // Build path to the changed parameter
                const fullPath = [...dataPath, item];

                // Get old and new values using the path
                let oldValue: any = originalConfig;
                let newValue: any = parsedConfig;

                for (const key of fullPath) {
                    oldValue = oldValue?.[key];
                    newValue = newValue?.[key];
                }

                // Special case for channels (item is already formatted)
                if (dataPath[0] === 'channels') {
                    content += `\n- ${item}`;
                } else {
                    content += `\n- ${item}: "${formatValue(newValue)}" (${$locales('meshtasticdevice.was')} "${formatValue(oldValue)}")`;
                }
            }

            if (changes.length > 15) {
                content += `\n... and ${changes.length - 15} more`;
            }
        }

        tooltipState = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            content
        };
    }

    function hideTooltip() {
        tooltipState = { visible: false, x: 0, y: 0, content: '' };
    }

    function handleClose() {
        if (isSaving || isLoading) return;
        // Don't disconnect here - reactive block will handle it
        // Don't clear parsedConfig - keep it for user to review/download
        onClose();
    }
</script>

{#if isOpen}
    <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onkeydown={(e) => e.key === 'Escape' && !isSaving && !isLoading && handleClose()}
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
                    onclick={handleClose}
                    onkeydown={(e) => e.key === 'Escape' && handleClose()}
                    disabled={isSaving || isLoading}
                    class="text-gray-400 transition-colors hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Close modal"
                >
                    &#x2715;
                </button>
            </div>

            <!-- Content -->
            <div class="space-y-6 p-6">
                <!-- Headers Row -->
                <div class="mb-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                        <div class="block text-sm font-medium text-orange-300">
                            {$locales('meshtasticdevice.select_port')}
                        </div>
                    </div>
                    <div>
                        <div class="block text-sm font-medium text-orange-300">
                            {$locales('meshtasticdevice.config_actions')}
                        </div>
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
                        <div class="flex items-center justify-between">
                            <div class="text-sm text-orange-200">{operationStatus}</div>
                            <!-- Connection indicator -->
                            <div
                                class="h-3 w-3 rounded-full {connectionColor} {isPulsing
                                    ? 'blink'
                                    : ''}"
                                title="Connection status"
                            ></div>
                        </div>
                    </div>
                {:else}
                    <!-- Connection indicator - always visible when connecting or connected -->
                    {#if isPortSelected || isConnecting}
                        <div class="flex items-center justify-end py-2">
                            <div
                                class="h-3 w-3 rounded-full {connectionColor} {isPulsing
                                    ? 'blink'
                                    : ''}"
                                title="Connection status"
                            ></div>
                        </div>
                    {/if}
                {/if}

                <!-- Two-column layout -->
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <!-- Left column: Port selection -->
                    <div class="space-y-3">
                        <div class="h-[100px]">
                            {#if !isPortSelected}
                                <button
                                    onclick={selectPort}
                                    disabled={isConnecting || isSaving || isLoading}
                                    class="h-full w-full rounded-lg border-2 border-dashed border-gray-600 p-4 text-center transition-colors hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {#if isConnecting}
                                        <div class="space-y-2">
                                            <div class="animate-spin text-2xl">&#x23F3;</div>
                                            <div class="text-sm text-orange-200">
                                                {$locales('meshtasticdevice.connecting')}
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="space-y-2">
                                            <div class="text-2xl">&#x1F50C;</div>
                                            <div class="text-sm text-orange-200">
                                                {$locales('meshtasticdevice.click_to_select_port')}
                                            </div>
                                        </div>
                                    {/if}
                                </button>
                            {:else}
                                <!-- Port selected -->
                                <div
                                    class="relative h-full rounded-lg border border-gray-600 bg-gray-800 p-4"
                                >
                                    <div class="flex h-full flex-col justify-center">
                                        <div class="mb-1 flex items-center space-x-2">
                                            <div class="text-lg">&#x2705;</div>
                                            <div class="text-sm font-medium text-green-400">
                                                {$locales('meshtasticdevice.port_connected')}
                                            </div>
                                        </div>
                                        {#if deviceInfo}
                                            <div class="text-xs text-gray-400">
                                                <div>
                                                    <strong
                                                        >{$locales(
                                                            'meshtasticdevice.node_name'
                                                        )}:</strong
                                                    >
                                                    {deviceInfo.longName || deviceInfo.nodeName}
                                                    {deviceInfo.shortName &&
                                                    deviceInfo.longName !== deviceInfo.shortName
                                                        ? ` (${deviceInfo.shortName})`
                                                        : ''}
                                                </div>
                                                <div>
                                                    <strong
                                                        >{$locales(
                                                            'meshtasticdevice.firmware_version'
                                                        )}:</strong
                                                    >
                                                    {deviceInfo.firmwareVersion}
                                                </div>
                                                <div>
                                                    <strong
                                                        >{$locales(
                                                            'meshtasticdevice.hardware_model'
                                                        )}:</strong
                                                    >
                                                    {deviceInfo.hardwareModel}
                                                </div>
                                                <div>
                                                    <strong
                                                        >{$locales(
                                                            'meshtasticdevice.pio_env'
                                                        )}:</strong
                                                    >
                                                    {deviceInfo.pioEnv}
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                    <button
                                        onclick={async () => await disconnectDevice()}
                                        disabled={isSaving || isLoading}
                                        class="absolute top-2 right-2 text-xs text-gray-400 transition-colors hover:text-red-400 disabled:cursor-not-allowed"
                                    >
                                        {$locales('meshtasticdevice.disconnect')}
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Right column: Config actions -->
                    <div class="space-y-3">
                        <div class="flex space-x-2">
                            <button
                                onclick={saveConfiguration}
                                disabled={!isPortSelected || isSaving || isLoading}
                                class="flex w-14 items-center justify-center rounded-md bg-orange-600 py-2 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                                title={$locales('meshtasticdevice.save_button_tooltip')}
                            >
                                <span>&#x1F4E5;</span>
                                {#if isSaving}
                                    <span class="animate-spin">&#x23F3;</span>
                                {/if}
                            </button>

                            <button
                                onclick={selectConfigFile}
                                disabled={isSaving || isLoading}
                                class="flex w-14 items-center justify-center rounded-md bg-blue-600 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                title={$locales('meshtasticdevice.load_button_tooltip')}
                            >
                                <span>&#x1F4E4;</span>
                                {#if isLoading}
                                    <span class="animate-spin">&#x23F3;</span>
                                {/if}
                            </button>

                            <div class="relative">
                                <!-- Preset configs dropdown -->
                                {#if showPresetConfigs && presetConfigs.length > 0}
                                    <div
                                        class="absolute right-0 bottom-full z-10 mb-2 w-64 rounded-lg border border-orange-600 bg-gray-800 shadow-2xl"
                                    >
                                        <div class="max-h-60 overflow-y-auto">
                                            {#each presetConfigs as config (config)}
                                                <button
                                                    onclick={() => loadPresetConfig(config)}
                                                    disabled={isLoading}
                                                    class="w-full px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {config.replace('.json', '')}
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                <button
                                    onclick={() => (showPresetConfigs = !showPresetConfigs)}
                                    disabled={isSaving || isLoading || presetConfigs.length === 0}
                                    class="flex w-14 items-center justify-center rounded-md bg-gray-700 py-2 text-orange-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    title={$locales('meshtasticdevice.preset_configs')}
                                >
                                    &#x1F5FA;&#xFE0F;
                                </button>
                            </div>

                            <button
                                onclick={() => (showDfuConfirm = true)}
                                disabled={!isPortSelected || isSaving || isLoading || isEnteringDfu}
                                class="flex w-14 items-center justify-center rounded-md bg-orange-600 py-2 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                                title={$locales('meshtasticdevice.dfu_button_tooltip')}
                            >
                                <span>&#x1F5A5;</span>
                                {#if isEnteringDfu}
                                    <span class="animate-spin">&#x23F3;</span>
                                {/if}
                            </button>
                        </div>

                        <!-- Hidden file input -->
                        <input
                            bind:this={fileInput}
                            type="file"
                            accept=".json,application/json"
                            onchange={handleFileSelect}
                            class="hidden"
                        />
                    </div>
                </div>

                <!-- Config Selection Section (shown after file is parsed) -->
                {#if parsedConfig}
                    <div class="space-y-4 rounded-md border border-gray-600 bg-gray-900 p-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-medium text-orange-300">
                                {$locales('meshtasticdevice.select_sections')}
                            </h3>
                            <div class="flex items-center gap-2">
                                <!-- Preview icon -->
                                <button
                                    onclick={() => (showJsonPreviewModal = true)}
                                    class="text-gray-400 transition-colors hover:text-blue-400"
                                    aria-label="Preview configuration as JSON"
                                    title={$locales('meshtasticdevice.preview')}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                        />
                                    </svg>
                                </button>
                                <!-- Save icon - download config to file -->
                                <button
                                    onclick={downloadDeviceConfig}
                                    class="text-gray-400 transition-colors hover:text-green-400"
                                    aria-label="Download configuration file"
                                    title={$locales('meshtasticdevice.download')}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <!-- Universal config sections renderer -->
                        {#each getConfigSections() as section (section.type)}
                            {#if section.sections.length > 0}
                                {#if section.sections[0].name === null}
                                    <!-- Single item section (channels, owner) - rendered later in flex container -->
                                {:else}
                                    <!-- Multi-item section (localConfig, moduleConfig) -->
                                    <div class="space-y-2">
                                        <label class="flex cursor-pointer items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                checked={section.enabled}
                                                onchange={(e) => {
                                                    section.toggleFn(
                                                        (e.target as HTMLInputElement).checked
                                                    );
                                                }}
                                                class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
                                            />
                                            <span class="text-sm font-medium text-gray-300">
                                                {section.label}
                                            </span>
                                        </label>
                                        <div class="grid grid-cols-2 gap-2 pl-6 md:grid-cols-3">
                                            {#each section.sections as item (item.name)}
                                                {@const itemChanges = (configChanges as any)?.[
                                                    section.type
                                                ]?.[item.name]}
                                                <label
                                                    class="flex items-center space-x-2 rounded p-1 text-xs text-gray-400 transition-colors
														{itemChanges ? 'border border-yellow-600 bg-yellow-900/30' : ''}"
                                                    onmouseenter={(e) =>
                                                        showChangesTooltip(e, itemChanges, [
                                                            section.type,
                                                            item.name
                                                        ])}
                                                    onmouseleave={hideTooltip}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        bind:group={section.bindGroup}
                                                        value={item.value}
                                                        class="h-3 w-3 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
                                                    />
                                                    <span>{item.label}</span>
                                                </label>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        {/each}

                        <!-- Single item sections (channels, owner) in flex container -->
                        <div class="flex flex-wrap gap-4">
                            {#each getConfigSections() as section (section.type)}
                                {#if section.sections.length > 0 && section.sections[0].name === null}
                                    {@const itemChanges = (configChanges as any)?.[section.type]}
                                    <label
                                        class="flex items-center space-x-2 rounded p-1 transition-colors
											{itemChanges ? 'border border-yellow-600 bg-yellow-900/30' : ''}"
                                        onmouseenter={(e) =>
                                            showChangesTooltip(e, itemChanges, [section.type])}
                                        onmouseleave={hideTooltip}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={section.enabled}
                                            onchange={(e) => {
                                                const val = (e.target as HTMLInputElement).checked;
                                                if (section.type === 'channels')
                                                    configSelection.includeChannels = val;
                                                else if (section.type === 'owner')
                                                    configSelection.includeOwner = val;
                                            }}
                                            class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-500"
                                        />
                                        <span class="text-sm text-gray-300"
                                            >{section.sections[0].label}</span
                                        >
                                    </label>
                                {/if}
                            {/each}
                        </div>

                        <!-- Upload button -->
                        <button
                            onclick={uploadSelectedConfig}
                            disabled={!isSelectionValid() || isLoading}
                            class="flex w-full items-center justify-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span>&#x1F4E4;</span>
                            <span>{$locales('meshtasticdevice.upload_selected')}</span>
                            {#if isLoading}
                                <span class="animate-spin">&#x23F3;</span>
                            {/if}
                        </button>
                    </div>
                {/if}

                <!-- Instructions Spoiler -->
                <div class="space-y-2">
                    <button
                        onclick={() => (showInstructions = !showInstructions)}
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
                                &#x26A0;&#xFE0F; {$locales('meshtasticdevice.warning_config')}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Footer with metrics and close button -->
            <div class="flex flex-col gap-4 border-t border-gray-700 p-6">
                <!-- Metrics row -->
                {#if isPortSelected}
                    <div
                        class="grid grid-cols-2 gap-4 text-center text-xs md:grid-cols-4 lg:grid-cols-6"
                    >
                        <div class="space-y-1">
                            <div class="text-gray-400">Nodes</div>
                            <div class="font-medium text-orange-300">
                                {nodeStats.onlineNodes}/{nodeStats.totalNodes}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Battery</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.batteryLevel !== undefined
                                    ? `${deviceMetrics.batteryLevel}%`
                                    : deviceMetrics.voltage !== undefined
                                      ? `${deviceMetrics.voltage.toFixed(2)}V`
                                      : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">ChUtil</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.chUtil !== undefined
                                    ? `${deviceMetrics.chUtil.toFixed(2)}%`
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">AirUtil</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.airUtil !== undefined
                                    ? `${deviceMetrics.airUtil.toFixed(2)}%`
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Uptime</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.uptimeSeconds !== undefined
                                    ? `${Math.floor(deviceMetrics.uptimeSeconds / 60)}m`
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">TX/RX</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.numPacketsTx !== undefined &&
                                deviceMetrics.numPacketsRx !== undefined
                                    ? `${deviceMetrics.numPacketsTx}/${deviceMetrics.numPacketsRx}`
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Bad/Dupe</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.numPacketsRxBad !== undefined &&
                                deviceMetrics.numRxDupe !== undefined
                                    ? `${deviceMetrics.numPacketsRxBad}/${deviceMetrics.numRxDupe}`
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Relay</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.numTxRelay !== undefined
                                    ? deviceMetrics.numTxRelay
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Dropped</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.numTxDropped !== undefined
                                    ? deviceMetrics.numTxDropped
                                    : 'N/A'}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-gray-400">Heap</div>
                            <div class="font-medium text-orange-300">
                                {deviceMetrics.heapFreeBytes !== undefined &&
                                deviceMetrics.heapTotalBytes !== undefined
                                    ? `${(deviceMetrics.heapFreeBytes / 1024).toFixed(0)}/${(deviceMetrics.heapTotalBytes / 1024).toFixed(0)}KB`
                                    : 'N/A'}
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Close button -->
                <div class="flex justify-end">
                    <button
                        onclick={handleClose}
                        disabled={isSaving || isLoading}
                        class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {$locales('common.close')}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- JSON Preview Modal -->
    <JsonPreviewModal
        isOpen={showJsonPreviewModal}
        onClose={() => (showJsonPreviewModal = false)}
        config={parsedConfig}
        onSave={handleJsonPreviewSave}
    />

    <!-- DFU Confirmation Dialog -->
    {#if showDfuConfirm}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
            <div class="max-w-md rounded-lg border border-orange-600 bg-gray-800 p-6 shadow-2xl">
                <h3 class="mb-4 text-lg font-semibold text-orange-200">
                    {$locales('meshtasticdevice.dfu_confirm_title')}
                </h3>
                <p class="mb-6 text-sm text-gray-300">
                    {$locales('meshtasticdevice.dfu_confirm_message')}
                </p>
                <div class="flex space-x-3">
                    <button
                        onclick={() => (showDfuConfirm = false)}
                        class="flex-1 rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                    >
                        {$locales('common.cancel')}
                    </button>
                    <button
                        onclick={handleEnterDfuMode}
                        class="flex-1 rounded-md bg-orange-600 px-4 py-2 text-white transition-colors hover:bg-orange-700"
                    >
                        {$locales('meshtasticdevice.dfu_button')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Config Diff Tooltip -->
    {#if tooltipState.visible}
        <div
            class="pointer-events-none fixed z-[60] max-w-xs rounded-md border border-yellow-600 bg-gray-900 p-3 text-xs whitespace-pre-line text-yellow-200 shadow-xl"
            style="left: {Math.min(tooltipState.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 320)}px; top: {Math.min(
                tooltipState.y + 12,
                (typeof window !== 'undefined' ? window.innerHeight : 9999) - 100
            )}px;"
        >
            {tooltipState.content}
        </div>
    {/if}
{/if}

<style>
    @keyframes blink {
        0%,
        100% {
            opacity: 0.5;
        }
        50% {
            opacity: 1;
        }
    }
    .blink {
        animation: blink 1s ease-in-out;
    }
</style>
