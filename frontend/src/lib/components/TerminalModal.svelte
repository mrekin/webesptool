<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Xterm } from '@battlefieldduck/xterm-svelte';
	import { _ as locales } from 'svelte-i18n';
	import type { Terminal } from '@xterm/xterm';
	import { browser } from '$app/environment';
	import { getCookie, setCookie } from '$lib/utils/cookies.js';

	// Import parsing utilities
	import parsingRulesJson from '$lib/config/terminal-parsing-rules.json';
	import { loadParsingRules, createTokenParser, type TokenParser, type ParsedToken } from '$lib/utils/logParser.js';
	import TokenSidebar from './TokenSidebar.svelte';
	import CommandInput from './CommandInput.svelte';
	import { resetTerminalMode, uiState } from '$lib/stores.js';

	let { isOpen = false, onClose = () => {} } = $props();

	// State
	let terminal: Terminal | null = null;
	let fitAddon: any = null;
	let isConnecting = $state(false);
	let isConnected = $state(false);
	let autoScroll = $state(true);
	let showCommandShortDescriptions = $state(true);
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	let port: SerialPort | null = null;

	// Token parsing state
	let tokenParser = $state<TokenParser | null>(null);
	let parsedTokens = $state(new Map<string, ParsedToken>());
	let showTokensSidebar = $state(false);  // Hidden by default

	// Unique key to force reactivity when tokens change
	let tokensKey = $state(0);

	// Command input state
	let commandInput = $state('');
	let commandHistory: string[] = [];
	let historyIndex = $state(-1);
	const MAX_HISTORY = 50;
	let selectedLineEnding = $state('crlf'); // 'lf', 'crlf', 'cr'

	// Experimental features flag
	let experimentalFeatures = $state($uiState.experimentalFeatures);

	// Load settings from cookie on mount
	function loadSettings() {
		if (browser) {
			const savedValue = getCookie('meshtastic-terminal-show-short-descriptions');
			showCommandShortDescriptions = savedValue !== 'false';  // Default to true
		}
	}

	// Save settings to cookie when changed
	$effect(() => {
		if (browser) {
			setCookie('meshtastic-terminal-show-short-descriptions', String(showCommandShortDescriptions), 365);
		}
	});

	// Close token sidebar when experimental features are disabled
	$effect(() => {
		if (!experimentalFeatures) {
			showTokensSidebar = false;
		}
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
			import('@xterm/addon-search').then(({ SearchAddon }) => {
				const searchAddon = new SearchAddon();
				terminal?.loadAddon(searchAddon);
			}).catch(error => {
				console.error('Failed to load search addon:', error);
			});

			import('@xterm/addon-fit').then(({ FitAddon }) => {
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

				// Store cleanup function
				(terminal as any)._resizeHandler = handleResize;
			}).catch(error => {
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
				terminal.writeln('\x1b[1;31mWeb Serial API not supported in this browser\x1b[0m\r\n');
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
				terminal.writeln(`\x1b[1;31mConnection failed: ${error?.message || error}\x1b[0m\r\n`);
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
		}
	}

	// Disconnect from port
	async function disconnect() {
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
			await new Promise(resolve => setTimeout(resolve, 100));

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
			case 'lf': return '\n';
			case 'crlf': return '\r\n';
			case 'cr': return '\r';
			default: return '\r\n';
		}
	}

	// Send command to serial port (called from CommandInput or Send button)
	async function sendCommand(command?: string): Promise<void> {
		if (!port || !isConnected || !terminal) return;

		const cmd = (command || commandInput).trim();
		if (!cmd) return;

		let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
		try {
			// Get writer from writable stream
			writer = port.writable.getWriter();

			// Encode command with line ending
			const encoder = new TextEncoder();
			const data = cmd + getLineEndingChars();
			await writer.write(encoder.encode(data));

			// Release writer lock
			writer.releaseLock();
			writer = null;

			// Echo command to terminal with prefix
			terminal.writeln(`\x1b[1;36m>> ${cmd}\x1b[0m`);

			// Add to history
			commandHistory.push(cmd);
			if (commandHistory.length > MAX_HISTORY) {
				commandHistory.shift();
			}
			historyIndex = commandHistory.length;

			// Clear input
			commandInput = '';

			// Auto-scroll to bottom
			if (autoScroll) {
				terminal.scrollToBottom();
			}
		} catch (error) {
			// Ensure writer is released on error
			if (writer) {
				try { writer.releaseLock(); } catch { /* ignore */ }
			}
			if (terminal) {
				terminal.writeln(`\x1b[1;31mFailed to send command: ${error}\x1b[0m`);
			}
		}
	}

	// Handle command submission from CommandInput
	function handleSubmitCommand(cmd: string): void {
		sendCommand(cmd);
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
		if (terminal && (terminal as any)._resizeHandler) {
			window.removeEventListener('resize', (terminal as any)._resizeHandler);
			delete (terminal as any)._resizeHandler;
		}

		terminal = null;
		// Clear command input
		commandInput = '';

		// Call the onClose callback
		onClose();
	}

	onDestroy(async () => {
		shouldContinueReading = false;
		await disconnect();
	});

	// Load settings on mount
	onMount(() => {
		loadSettings();
	});
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="relative max-h-[95vh] w-full max-w-7xl overflow-hidden rounded-lg border border-orange-600 bg-gray-900 shadow-xl flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-4 flex-shrink-0">
				<h2 class="text-xl font-semibold text-white">
					{$locales('customfirmware.terminal')}
				</h2>
				<button
					onclick={handleClose}
					class="rounded text-gray-400 transition-colors hover:text-white"
					aria-label="Close terminal"
				>
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Main Content Area with Split View -->
			<div class="flex flex-1 min-h-0 overflow-hidden">
				<!-- Terminal Section -->
				<div class="flex-1 flex flex-col min-h-0 min-w-0">
					<div class="p-4 flex-1 min-h-0">
						<div class="h-full w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950 relative">
							<Xterm {options} {onLoad} />
						</div>
					</div>
				</div>

				<!-- Token Sidebar (conditionally rendered) -->
				{#if showTokensSidebar && experimentalFeatures}
					<div class="w-80 flex-shrink-0 border-l border-gray-700 flex flex-col">
						<TokenSidebar tokens={parsedTokens} onCopy={copyTokens} updateKey={tokensKey} />
					</div>
				{/if}
			</div>

			<!-- Command Input Area -->
			<div class="flex items-center space-x-2 border-t border-gray-700 p-4 flex-shrink-0">
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

				<!-- Command Input Component -->
				<CommandInput
					bind:value={commandInput}
					isConnected={isConnected}
					onSubmit={handleSubmitCommand}
					placeholder={$locales('customfirmware.terminal_input_placeholder')}
					{commandHistory}
					showCommandShortDescriptions={showCommandShortDescriptions}
					bind:historyIndex
				/>

				<!-- Send Button -->
				<button
					onclick={() => sendCommand()}
					disabled={!isConnected || !commandInput.trim()}
					class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
					title={$locales('customfirmware.terminal_send_tooltip')}
				>
					{$locales('customfirmware.terminal_send')}
				</button>
			</div>

			<!-- Footer with Controls (responsive) -->
			<div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 p-4 flex-shrink-0">
				<!-- Connection toggle button -->
				<button
					onclick={isConnected ? disconnect : connectToPort}
					disabled={isConnecting}
					class:bg-blue-600={!isConnected && !isConnecting}
					class:hover:bg-blue-700={!isConnected && !isConnecting}
					class:bg-gray-700={isConnected}
					class:hover:bg-gray-600={isConnected}
					class="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 flex-shrink-0"
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
				<label class="flex items-center space-x-2 text-sm text-gray-300 flex-shrink-0">
					<input
						type="checkbox"
						bind:checked={autoScroll}
						class="rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-600"
					/>
					<span>{$locales('customfirmware.terminal_autoscroll')}</span>
				</label>

				<label class="flex items-center space-x-2 text-sm text-gray-300 flex-shrink-0">
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
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600 flex-shrink-0"
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
					class="rounded-md bg-gray-700 p-2 text-white transition-colors hover:bg-gray-600 flex-shrink-0"
					title={$locales('customfirmware.terminal_copy')}
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
</svg>
				</button>

				<button
					onclick={handleClose}
					class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 flex-shrink-0"
				>
					{$locales('common.close')}
				</button>
				</div>
			</div>
		</div>
	</div>
{/if}
