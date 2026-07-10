<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { Xterm } from '@battlefieldduck/xterm-svelte';
    import { _ as locales } from 'svelte-i18n';
    import type { Terminal } from '@xterm/xterm';
    import { browser } from '$app/environment';
    import { getCookie, setCookie } from '$lib/utils/cookies.js';

    // Import parsing utilities
    import parsingRulesJson from '$lib/config/terminal-parsing-rules.json';
    import {
        loadParsingRules,
        createTokenParser,
        type TokenParser,
        type ParsedToken
    } from '$lib/utils/logParser.js';
    import TokenSidebar from './TokenSidebar.svelte';
    import CommandInput from './CommandInput.svelte';
    import MultilineControls from './MultilineControls.svelte';
    import { resetTerminalMode, terminalMode, toggleTerminalMode, uiState } from '$lib/stores.js';
    import { TERMINAL_CONFIG } from '$lib/config/terminalConfig.js';
    import { ResponseDetector } from '$lib/utils/responseDetector.js';
    import {
        splitIntoCommandLines,
        applyCommandLimit,
        trimTrailingEmptyLine,
        isModeSwitchLine
    } from '$lib/utils/multilineCommands.js';

    let { isOpen = false, onClose = () => {} } = $props();

    // State
    let terminal: Terminal | null = null;
    let fitAddon: any = null;
    // Window resize listener cleanup ref (kept here instead of monkey-patching the terminal).
    let resizeHandler: (() => void) | null = null;
    let isConnecting = $state(false);
    let isConnected = $state(false);

    // Type for disconnect reason tracking
    type DisconnectReason = 'user-initiated' | 'unexpected' | null;
    let disconnectReason: DisconnectReason = $state(null);

    let autoScroll = $state(true);
    let showCommandShortDescriptions = $state(true);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let port: SerialPort | null = null;

    // Token parsing state
    let tokenParser = $state<TokenParser | null>(null);
    let parsedTokens = $state(new Map<string, ParsedToken>());
    let showTokensSidebar = $state(false); // Hidden by default

    // Unique key to force reactivity when tokens change
    let tokensKey = $state(0);

    // Command input state
    let commandInput = $state('');
    let currentLine = $state(''); // line at the caret (for per-line Send in multiline)
    let commandHistory: string[] = [];
    let historyIndex = $state(-1);
    let selectedLineEnding = $state('crlf'); // 'lf', 'crlf', 'cr'

    // Multiline command state (session-local, reset on close).
    // Source of truth is `commandInput` (the textarea text); lines are derived on demand.
    let responseDetector: ResponseDetector | null = null;
    let isInFlight = false; // defensive guard, used only inside runMassSend loop
    let isMassRunning = $state(false);
    let massStopRequested = false;
    let lastSentIndex = $state(-1);
    let multilineLimitExceeded = $state(false);

    // Experimental features flag
    let experimentalFeatures = $state($uiState.experimentalFeatures);

    // Load settings from cookie on mount
    function loadSettings() {
        if (browser) {
            const savedValue = getCookie('meshtastic-terminal-show-short-descriptions');
            showCommandShortDescriptions = savedValue !== 'false'; // Default to true
        }
    }

    // Save settings to cookie when changed
    $effect(() => {
        if (browser) {
            setCookie(
                'meshtastic-terminal-show-short-descriptions',
                String(showCommandShortDescriptions),
                365
            );
        }
    });

    // Close token sidebar when experimental features are disabled
    $effect(() => {
        if (!experimentalFeatures) {
            showTokensSidebar = false;
        }
    });

    // Update limit warning reactively as the user edits the textarea.
    $effect(() => {
        const count = splitIntoCommandLines(commandInput).length;
        multilineLimitExceeded = count > TERMINAL_CONFIG.maxCommandLines;
    });

    // Terminal options
    const options = {
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: {
            background: '#1f2937',
            foreground: '#10b981',
            cursor: '#10b981',
            cursorAccent: '#1f2937'
        },
        cursorBlink: true,
        scrollback: 1000,
        allowProposedApi: true
    };

    // Initialize token parser
    function initializeTokenParser() {
        try {
            const rules = loadParsingRules(parsingRulesJson);
            if (rules.length > 0) {
                tokenParser = createTokenParser(rules);
            }
        } catch (error) {
            console.error('Failed to initialize token parser:', error);
        }
    }

    // Initialize terminal when component loads
    function onLoad(term: Terminal) {
        terminal = term;

        // Initialize token parser
        initializeTokenParser();

        // Add keydown handler to the terminal element to handle Ctrl+C
        terminal.attachCustomKeyEventHandler((event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'c' && terminal!.hasSelection()) {
                // Only prevent default if there's a selection to copy
                // This allows Ctrl+C to work normally when there's no selection
                // (for example, to send interrupt signal to running program)
                event.preventDefault();
                setTimeout(() => copyTerminal(), 0); // Use setTimeout to allow selection to be finalized
                return false; // Prevent the keypress from being processed further
            }
            return !(event.ctrlKey && event.key === 'c'); // Allow other keys, but prevent Ctrl+C propagation when no selection
        });

        try {
            // Dynamically import and load addons
            import('@xterm/addon-search')
                .then(({ SearchAddon }) => {
                    const searchAddon = new SearchAddon();
                    terminal?.loadAddon(searchAddon);
                })
                .catch((error) => {
                    console.error('Failed to load search addon:', error);
                });

            import('@xterm/addon-fit')
                .then(({ FitAddon }) => {
                    fitAddon = new FitAddon();
                    terminal?.loadAddon(fitAddon);

                    // Wait a bit for the terminal to be properly initialized before fitting
                    setTimeout(() => {
                        fitAddon.fit();
                    }, 100);

                    // Handle window resize
                    const handleResize = () => {
                        if (fitAddon && terminal) {
                            fitAddon.fit();
                        }
                    };

                    window.addEventListener('resize', handleResize);

                    // Keep the cleanup ref for handleClose/onDestroy.
                    resizeHandler = handleResize;
                })
                .catch((error) => {
                    console.error('Failed to load fit addon:', error);
                });

            terminal.writeln('\x1b[1;33mTerminal\x1b[0m');
            terminal.writeln('\x1b[90mReady to connect. Speed: 115200 baud\x1b[0m\r\n');
        } catch (error) {
            console.error('Failed to initialize terminal:', error);
            if (terminal) {
                terminal.writeln('\x1b[1;31mFailed to initialize terminal\x1b[0m\r\n');
            }
        }
    }

    // Connect to serial port
    async function connectToPort() {
        if (!terminal) return;

        try {
            isConnecting = true;

            if (!('serial' in navigator)) {
                terminal.writeln(
                    '\x1b[1;31mWeb Serial API not supported in this browser\x1b[0m\r\n'
                );
                terminal.writeln('\x1b[90mPlease use Chrome, Edge, or Opera\x1b[0m\r\n');
                return;
            }

            // Request a new port if none exists
            terminal.writeln('\x1b[90mRequesting serial port...\x1b[0m');
            port = await (navigator as any).serial.requestPort();

            // Open the port
            terminal.writeln('\x1b[90mOpening port at 115200 baud...\x1b[0m');
            if (!port) return;
            await port.open({ baudRate: 115200 });

            if (port.readable) {
                reader = port.readable.getReader();

                // Reset the flag before starting the read loop
                shouldContinueReading = true;
                readSerialLoop();

                isConnected = true;
                terminal.writeln('\x1b[1;32mConnected to serial port at 115200 baud\x1b[0m\r\n');
            }
        } catch (error: any) {
            if (terminal) {
                terminal.writeln(
                    `\x1b[1;31mConnection failed: ${error?.message || error}\x1b[0m\r\n`
                );
            }
        } finally {
            isConnecting = false;
        }
    }

    // Flag to control the read loop
    let shouldContinueReading = true;

    // Text decoder for converting bytes to text
    const textDecoder = new TextDecoder();
    // Buffer for incomplete lines
    let lineBuffer = '';

    // Read serial data loop
    async function readSerialLoop() {
        try {
            while (shouldContinueReading && port && port.readable && reader) {
                const { value, done } = await reader.read();
                if (done || !shouldContinueReading) break;
                if (value && terminal) {
                    // Decode the received bytes to text
                    const decodedValue = textDecoder.decode(value, { stream: true });

                    // Notify response detector that device produced output (silence-timeout heuristic)
                    responseDetector?.notifyData();

                    // Parse logs for token extraction - split into complete lines
                    if (tokenParser && decodedValue) {
                        // Add to buffer and split by newlines
                        lineBuffer += decodedValue;
                        const lines = lineBuffer.split('\n');

                        // Keep last incomplete line in buffer
                        lineBuffer = lines.pop() || '';

                        // Parse each complete line
                        for (const line of lines) {
                            if (line.trim()) {
                                // Remove ANSI escape codes before parsing
                                const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
                                tokenParser.parse(cleanLine + '\n');
                            }
                        }

                        // Update reactive tokens variable - create new Map for reactivity
                        const newState = tokenParser.getState();
                        parsedTokens = new Map(newState.tokens);
                        // Trigger reactivity by updating key
                        tokensKey++;
                    }

                    terminal.write(decodedValue);
                    if (autoScroll) {
                        terminal.scrollToBottom();
                    }
                }
            }
        } catch (error) {
            if (terminal) {
                terminal.writeln(`\x1b[1;31mRead error: ${error}\x1b[0m`);
            }

            // Check if the error indicates device disconnection
            const isFatalError =
                (error instanceof Error && error.name === 'NetworkError') ||
                (error instanceof Error &&
                    (error.message.includes('device has been lost') ||
                        error.message.includes('The device has been lost') ||
                        error.message.includes('Port is closed') ||
                        error.message.includes('The port is closed')));

            if (isFatalError && disconnectReason !== 'user-initiated') {
                handleUnexpectedDisconnect(
                    error instanceof Error ? error : new Error(String(error))
                );
            }
        }
    }

    // Disconnect from port
    async function disconnect() {
        disconnectReason = 'user-initiated';

        try {
            // Set flag to stop the read loop
            shouldContinueReading = false;

            // Stop the read loop by cancelling the reader
            if (reader) {
                try {
                    await reader.cancel();
                } catch (cancelError) {
                    console.warn('Error cancelling reader:', cancelError);
                } finally {
                    reader = null;
                }
            }

            // Wait a moment to ensure the stream is properly released
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Close the port regardless of whether it was existing or new
            // This ensures the port is properly released when the modal closes
            if (port) {
                await port.close();
                port = null;
            }

            isConnected = false;

            // Only write to terminal if it still exists
            if (terminal) {
                terminal.writeln('\x1b[1;33mDisconnected from serial port\x1b[0m\r\n');
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        } finally {
            disconnectReason = null;
        }
    }

    // Handle unexpected device disconnection
    async function handleUnexpectedDisconnect(error?: Error) {
        isConnected = false;
        shouldContinueReading = false;

        // Abort any in-flight response detection (mass run / manual await) -> stops the run
        responseDetector?.cancel();

        if (reader) {
            try {
                await reader.cancel();
            } catch (e) {
                console.warn('Error cancelling reader:', e);
            }
            reader = null;
        }

        if (port) {
            try {
                await port.close();
            } catch (e) {
                console.warn('Error closing port:', e);
            }
            port = null;
        }

        if (terminal) {
            terminal.writeln('\x1b[1;33mDevice disconnected unexpectedly\x1b[0m\r\n');
            if (error && error.message) {
                terminal.writeln(`\x1b[90mReason: ${error.message}\x1b[0m\r\n`);
            }
        }
    }

    // Copy terminal content
    function copyTerminal() {
        if (!terminal) return;
        const selection = terminal.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection);
        }
    }

    // Copy tokens to clipboard
    async function copyTokens() {
        try {
            const tokensArray = Array.from(parsedTokens.values()).map((token) => ({
                name: token.name,
                value: token.value,
                type: token.type,
                timestamp: token.timestamp.toISOString()
            }));

            const jsonString = JSON.stringify(tokensArray, null, 2);
            await navigator.clipboard.writeText(jsonString);
        } catch (error) {
            console.error('Failed to copy tokens:', error);
        }
    }

    // Get line ending characters based on selection
    function getLineEndingChars(): string {
        switch (selectedLineEnding) {
            case 'lf':
                return '\n';
            case 'crlf':
                return '\r\n';
            case 'cr':
                return '\r';
            default:
                return '\r\n';
        }
    }

    // Core write: encode + write to port + echo + history. Returns success.
    // Does NOT clear the input field and does NOT trim-skip empty lines (multiline needs empty lines sent as-is, OQ-4).
    async function writeCommand(line: string): Promise<boolean> {
        if (!port || !isConnected || !terminal) return false;

        let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
        try {
            if (!port.writable) {
                terminal.writeln('\x1b[1;31mPort is not writable\x1b[0m');
                return false;
            }
            writer = port.writable.getWriter();

            const data = line + getLineEndingChars();
            await writer.write(new TextEncoder().encode(data));
            writer.releaseLock();
            writer = null;

            // Per-line echo with prefix
            terminal.writeln(`\x1b[1;36m>> ${line}\x1b[0m`);

            // Add to history (FIFO cap)
            commandHistory.push(line);
            if (commandHistory.length > TERMINAL_CONFIG.maxHistory) {
                commandHistory.shift();
            }
            historyIndex = commandHistory.length;

            if (autoScroll) {
                terminal.scrollToBottom();
            }
            return true;
        } catch (error) {
            if (writer) {
                try {
                    writer.releaseLock();
                } catch {
                    /* ignore */
                }
            }
            if (terminal) {
                terminal.writeln(`\x1b[1;31mFailed to send command: ${error}\x1b[0m`);
            }
            return false;
        }
    }

    // Send command to serial port (called from CommandInput or Send button) — single-line path.
    async function sendCommand(command?: string): Promise<void> {
        const cmd = (command ?? commandInput).trim();
        if (!cmd) return;
        const ok = await writeCommand(cmd);
        if (ok) {
            commandInput = '';
        }
    }

    // Handle command submission from CommandInput
    function handleSubmitCommand(cmd: string): void {
        sendCommand(cmd);
    }

    // Send a single line and await device response completion (silence-timeout heuristic).
    async function sendLineAndAwait(line: string): Promise<boolean> {
        if (isInFlight) return false; // writer must not be grabbed twice
        isInFlight = true;
        responseDetector = new ResponseDetector({
            silenceTimeoutMs: TERMINAL_CONFIG.silenceTimeoutMs
        });
        try {
            const ok = await writeCommand(line);
            if (!ok) return false;
            await responseDetector.start(); // resolves on silence timeout
            return true;
        } catch {
            return false; // aborted (disconnect / stop)
        } finally {
            responseDetector = null;
            isInFlight = false;
        }
    }

    /** Lines to process for a mass send (trim + limit applied; /mc lines kept
     *  so runMassSend can still toggle them). */
    function computeMultilineLines(): string[] {
        return applyCommandLimit(
            trimTrailingEmptyLine(splitIntoCommandLines(commandInput)),
            TERMINAL_CONFIG.maxCommandLines
        ).lines;
    }

    /** Number of lines that will actually be sent to the device (excludes /mc). */
    function sendableLineCount(): number {
        return computeMultilineLines().filter((line) => !isModeSwitchLine(line)).length;
    }

    /** Mass send: split commandInput into lines and send sequentially, awaiting
     *  response completion between sends. Triggers: Enter in multiline textarea,
     *  "Send all" button, Ctrl/Cmd+Enter. */
    async function runMassSend(): Promise<void> {
        if (isMassRunning) return;
        const lines = computeMultilineLines();
        if (lines.length === 0) return;

        isMassRunning = true;
        massStopRequested = false;
        lastSentIndex = -1;
        let sendableIndex = -1; // 0-based position among device-bound lines (for progress)
        try {
            for (let i = 0; i < lines.length; i++) {
                if (massStopRequested || !isConnected) break;
                const line = lines[i];
                // /mc acts on the whole block, not sent to device (OQ-3)
                if (isModeSwitchLine(line)) {
                    toggleTerminalMode();
                    continue;
                }
                sendableIndex++;
                lastSentIndex = sendableIndex;
                const ok = await sendLineAndAwait(line);
                if (!ok) break; // write error / no response / disconnect (OQ-6)
            }
        } finally {
            isMassRunning = false;
        }
    }

    /** Whether the textarea currently holds multiple lines. */
    function isMultilineState(): boolean {
        return commandInput.includes('\n');
    }

    // Stop the running mass send: remaining lines are not sent.
    function stopMassSend(): void {
        massStopRequested = true;
        responseDetector?.cancel(); // unblock the awaited start()
    }

    // Cleanup
    async function handleClose() {
        // Stop reading and disconnect properly, always closing the port
        await disconnect();

        // Reset meshcore mode
        resetTerminalMode();

        // Reset token parser state
        if (tokenParser) {
            tokenParser.reset();
            parsedTokens.clear();
        }

        // Hide tokens sidebar
        showTokensSidebar = false;

        // Clear terminal reference
        // Clean up resize handler
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }

        terminal = null;
        // Stop any running mass send and clear multiline state
        stopMassSend();
        isMassRunning = false;
        multilineLimitExceeded = false;
        lastSentIndex = -1;

        // Clear command input
        commandInput = '';

        // Call the onClose callback
        onClose();
    }

    onDestroy(async () => {
        shouldContinueReading = false;
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        await disconnect();
    });

    // Load settings on mount
    onMount(() => {
        loadSettings();
    });
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div
            class="relative flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-orange-600 bg-gray-900 shadow-xl"
        >
            <!-- Header -->
            <div
                class="flex flex-shrink-0 items-center justify-between border-b border-gray-700 p-4"
            >
                <h2 class="text-xl font-semibold text-white">
                    {$locales('customfirmware.terminal')}
                </h2>
                <button
                    onclick={handleClose}
                    class="rounded text-gray-400 transition-colors hover:text-white"
                    aria-label="Close terminal"
                >
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <!-- Main Content Area with Split View -->
            <div class="flex min-h-0 flex-1 overflow-hidden">
                <!-- Terminal Section -->
                <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div class="min-h-0 flex-1 p-4">
                        <div
                            class="relative h-full w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950"
                        >
                            <Xterm {options} {onLoad} />
                        </div>
                    </div>
                </div>

                <!-- Token Sidebar (conditionally rendered) -->
                {#if showTokensSidebar && experimentalFeatures}
                    <div class="flex w-80 flex-shrink-0 flex-col border-l border-gray-700">
                        <TokenSidebar
                            tokens={parsedTokens}
                            onCopy={copyTokens}
                            updateKey={tokensKey}
                        />
                    </div>
                {/if}
            </div>

            <!-- Command Input Area -->
            <div class="flex flex-shrink-0 flex-col gap-2 border-t border-gray-700 p-4">
                <div class="flex items-start space-x-2">
                <!-- Line Ending Selector -->
                <select
                    bind:value={selectedLineEnding}
                    disabled={!isConnected}
                    class="rounded-md border border-gray-600 bg-gray-700 px-2 py-2 text-sm text-white focus:ring-orange-600 disabled:opacity-50"
                    title={$locales('customfirmware.terminal_line_ending_title')}
                >
                    <option value="lf">LF</option>
                    <option value="crlf">CRLF</option>
                    <option value="cr">CR</option>
                </select>

                <!-- Meshcore mode badge (kept out of the textarea so its right edge is free for the ▶ Send button) -->
                {#if $terminalMode === 'meshcore'}
                    <span
                        class="mt-2 flex h-5 items-center justify-center rounded bg-green-600/80 px-1.5 text-[0.625rem] font-bold tracking-tight text-white select-none"
                        title="MeshCore mode"
                    >MC</span>
                {/if}

                <!-- Always-rendered textarea (single + multiline). The ▶ Send button is rendered inside, at the caret line. -->
                <CommandInput
                    bind:value={commandInput}
                    {isConnected}
                    isMassRunning={isMassRunning}
                    onSubmit={handleSubmitCommand}
                    onsendall={runMassSend}
                    onsendline={(line: string) => writeCommand(line)}
                    placeholder={$locales('customfirmware.terminal_input_placeholder')}
                    {commandHistory}
                    {showCommandShortDescriptions}
                    bind:historyIndex
                    bind:currentLine
                />

                {#if isMultilineState()}
                    <!-- Multiline: mass-send controls inline (no separate row). Enter in textarea also triggers runMassSend. -->
                    <MultilineControls
                        isMultiline={true}
                        {isConnected}
                        {isMassRunning}
                        {lastSentIndex}
                        totalLines={sendableLineCount()}
                        limitExceeded={multilineLimitExceeded}
                        onsendall={runMassSend}
                        onstop={stopMassSend}
                    />
                {/if}
                </div>
            </div>

            <!-- Footer with Controls (responsive) -->
            <div
                class="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-700 p-4"
            >
                <!-- Connection toggle button -->
                <button
                    onclick={isConnected ? disconnect : connectToPort}
                    disabled={isConnecting}
                    class:bg-blue-600={!isConnected && !isConnecting}
                    class:hover:bg-blue-700={!isConnected && !isConnecting}
                    class:bg-gray-700={isConnected}
                    class:hover:bg-gray-600={isConnected}
                    class="flex-shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {#if isConnecting}
                        {$locales('customfirmware.connecting')}...
                    {:else if isConnected}
                        {$locales('customfirmware.disconnect')}
                    {:else}
                        {$locales('customfirmware.select_port')}
                    {/if}
                </button>

                <!-- Right-side controls -->
                <div class="flex flex-wrap items-center gap-3">
                    <!-- Terminal controls -->
                    <label class="flex flex-shrink-0 items-center space-x-2 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            bind:checked={autoScroll}
                            class="rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-600"
                        />
                        <span>{$locales('customfirmware.terminal_autoscroll')}</span>
                    </label>

                    <label class="flex flex-shrink-0 items-center space-x-2 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            bind:checked={showCommandShortDescriptions}
                            class="rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-600"
                        />
                        <span>{$locales('customfirmware.show_command_short_descriptions')}</span>
                    </label>

                    {#if tokenParser && experimentalFeatures}
                        <button
                            onclick={() => {
                                showTokensSidebar = !showTokensSidebar;
                            }}
                            class="flex-shrink-0 rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
                        >
                            {#if showTokensSidebar && experimentalFeatures}
                                {$locales('customfirmware.hide_tokens')}
                            {:else}
                                {$locales('customfirmware.show_tokens')}
                            {/if}
                        </button>
                    {/if}

                    <button
                        onclick={copyTerminal}
                        class="flex-shrink-0 rounded-md bg-gray-700 p-2 text-white transition-colors hover:bg-gray-600"
                        title={$locales('customfirmware.terminal_copy')}
                    >
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>

                    <button
                        onclick={handleClose}
                        class="flex-shrink-0 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                    >
                        {$locales('common.close')}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
