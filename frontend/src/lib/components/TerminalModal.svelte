<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Xterm } from '@battlefieldduck/xterm-svelte';
	import { _ as locales } from 'svelte-i18n';
	import type { Terminal } from '@xterm/xterm';

	export let isOpen = false;
	export let onClose = () => {};

	// State
	let terminal: Terminal | null = null;
	let isConnecting = false;
	let isConnected = false;
	let autoScroll = true;
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	let port: SerialPort | null = null;

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

	// Initialize terminal when component loads
	function onLoad(term: Terminal) {
		terminal = term;

		// Add keydown handler to the terminal element to handle Ctrl+C
		terminal.attachCustomKeyEventHandler((event) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'c' && terminal.hasSelection()) {
				// Only prevent default if there's a selection to copy
				// This allows Ctrl+C to work normally when there's no selection
				// (for example, to send interrupt signal to running program)
				event.preventDefault();
				setTimeout(() => copyTerminal(false), 0); // Use setTimeout to allow selection to be finalized, don't show message
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
				const fitAddon = new FitAddon();
				terminal?.loadAddon(fitAddon);

				// Wait a bit for the terminal to be properly initialized before fitting
				setTimeout(() => {
					fitAddon.fit();
				}, 100);
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

	// Read serial data loop
	async function readSerialLoop() {
		try {
			while (shouldContinueReading && port && port.readable && reader) {
				const { value, done } = await reader.read();
				if (done || !shouldContinueReading) break;
				if (value && terminal) {
					// Decode the received bytes to text
					const decodedValue = textDecoder.decode(value, { stream: true });
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

	// Cleanup
	async function handleClose() {
		// Stop reading and disconnect properly, always closing the port
		await disconnect();

		// Clear terminal reference
		terminal = null;

		// Call the onClose callback
		onClose();
	}

	onDestroy(async () => {
		shouldContinueReading = false;
		await disconnect();
	});
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="relative max-h-[95vh] w-full max-w-6xl overflow-hidden rounded-lg border border-orange-600 bg-gray-900 shadow-xl flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-4 flex-shrink-0">
				<h2 class="text-xl font-semibold text-white">
					{$locales('customfirmware.terminal')}
				</h2>
				<button
					on:click={handleClose}
					class="rounded text-gray-400 transition-colors hover:text-white"
					aria-label="Close terminal"
				>
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Terminal Content -->
			<div class="p-4 flex-1 min-h-0 flex flex-col">
				<div class="h-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950 p-4 flex flex-col flex-1">
					<Xterm {options} {onLoad} class="flex-1" />
				</div>
			</div>

			<!-- Footer with Controls -->
			<div class="flex items-center justify-between border-t border-gray-700 p-4 flex-shrink-0">
				<!-- Connection controls -->
				<div class="flex space-x-3">
					<button
						on:click={connectToPort}
						disabled={isConnecting || isConnected}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isConnecting}
							{$locales('customfirmware.connecting')}...
						{:else}
							{$locales('customfirmware.select_port')}
						{/if}
					</button>

					<button
						on:click={disconnect}
						disabled={!isConnected}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{$locales('customfirmware.disconnect')}
					</button>
				</div>

				<!-- Terminal controls -->
				<div class="flex items-center space-x-4">
					<label class="flex items-center space-x-2 text-sm text-gray-300">
						<input
							type="checkbox"
							bind:checked={autoScroll}
							class="rounded border-gray-600 bg-gray-700 text-orange-600 focus:ring-orange-600"
						/>
						<span>{$locales('customfirmware.terminal_autoscroll')}</span>
					</label>

					<button
						on:click={copyTerminal}
						class="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
					>
						{$locales('customfirmware.terminal_copy')}
					</button>

					<button
						on:click={handleClose}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
					>
						{$locales('common.close')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
