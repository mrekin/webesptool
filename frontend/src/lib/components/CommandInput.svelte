<script lang="ts">
	import { onDestroy } from 'svelte';
	import { terminalMode } from '$lib/stores.js';
	import type { AutocompleteSuggestion, TerminalMode } from '$lib/types.js';
	import {
		getAutocompleteSuggestion,
		acceptSuggestionToNextSeparator,
		getNextSuggestion,
		getPreviousSuggestion
	} from '$lib/utils/meshcoreCommands.js';

	let {
		value = '',
		isConnected = false,
		onSubmit = (_cmd: string) => {},
		placeholder = '',
		commandHistory = [],
		historyIndex = -1
	} = $props();

	let mode = $state<TerminalMode>('normal');
	let suggestion = $state<AutocompleteSuggestion | null>(null);
	let inputElement: HTMLInputElement;

	// Subscribe to terminal mode store
	const unsubscribeMode = terminalMode.subscribe((m: TerminalMode) => {
		mode = m;
	});

	onDestroy(() => {
		unsubscribeMode();
	});

	/**
	 * Handle input change - update autocomplete suggestion
	 */
	function handleInput() {
		// Update current command from suggestion if available
	let newSuggestion = getAutocompleteSuggestion(value, mode, null, suggestion);

		// Remove leading space from suggestion if input already ends with space
		if (newSuggestion && value.endsWith(' ') && newSuggestion.text.startsWith(' ')) {
			newSuggestion = {
				...newSuggestion,
				text: newSuggestion.text.substring(1)
			};
		}

		suggestion = newSuggestion;
	}

	/**
	 * Handle keydown events for autocomplete, mode switch, history, and submit
	 */
	function handleKeydown(event: KeyboardEvent) {
		// Tab - switch to meshcore mode or accept suggestion
		if (event.key === 'Tab') {
			event.preventDefault();

			if (mode === 'normal') {
				// In normal mode, /mc + Tab switches to meshcore mode
				if (value.trim() === '/mc') {
					terminalMode.set('meshcore');
					value = '';
					suggestion = null;
					return;
				}
			}
			// Tab accepts suggestion same as ArrowRight (handled below)
		}

		// Enter - submit command or switch mode
		if (event.key === 'Enter') {
			event.preventDefault();

			const trimmedValue = value.trim();

			// Check for mode switch (works even without connection)
			if (trimmedValue === '/mc') {
				terminalMode.update(m => m === 'normal' ? 'meshcore' : 'normal');
				value = '';
				suggestion = null;
				return;
			}

			// Submit command (requires connection)
			if (!isConnected) return;
			if (trimmedValue) {
				onSubmit(trimmedValue);
				value = '';
				suggestion = null;
			}
			return;
		}

		// ArrowUp - navigate history backward OR cycle autocomplete suggestions forward
		if (event.key === 'ArrowUp') {
			event.preventDefault();

			// Priority: autocomplete over history
			if (suggestion) {
				const nextSuggestion = getNextSuggestion(value, suggestion);
				if (nextSuggestion) {
					suggestion = nextSuggestion;
				}
				return;
			}

			// Otherwise: navigate history backward
			if (commandHistory.length === 0) return;
			if (historyIndex > 0) {
				historyIndex--;
				value = commandHistory[historyIndex];
				suggestion = null;
			}
			return;
		}

		// ArrowDown - navigate history forward OR cycle autocomplete suggestions backward
		if (event.key === 'ArrowDown') {
			event.preventDefault();

			// Priority: autocomplete over history
			if (suggestion) {
				const prevSuggestion = getPreviousSuggestion(value, suggestion);
				if (prevSuggestion) {
					suggestion = prevSuggestion;
				}
				return;
			}

			// Otherwise: navigate history forward
			if (commandHistory.length === 0) return;
			if (historyIndex < commandHistory.length - 1) {
				historyIndex++;
				value = commandHistory[historyIndex];
			} else {
				historyIndex = commandHistory.length;
				value = '';
			}
			suggestion = null;
			return;
		}

		// Escape - clear suggestion
		if (event.key === 'Escape') {
			suggestion = null;
			return;
		}

			// ArrowRight/Tab - accept suggestion up to next separator (only if cursor at end)
			if ((event.key === 'ArrowRight' || event.key === 'Tab') && suggestion) {
				const cursorPosition = inputElement.selectionStart;
				const isAtEnd = cursorPosition === value.length;

				// console.log('[' + event.key + '] Cursor position:', cursorPosition, 'Value length:', value.length, 'Is at end:', isAtEnd);

				// Tab: always accept; ArrowRight: only if at end
				if (event.key === 'Tab' || isAtEnd) {
					event.preventDefault();

					// console.log('[' + event.key + '] Before accept:', { value, suggestion });
					const oldValue = value;
					value = acceptSuggestionToNextSeparator(value, suggestion);
					// console.log('[' + event.key + '] After accept:', { oldValue, newValue: value, accepted: value.slice(oldValue.length) });
					// Update suggestion after partial accept, passing current suggestion to maintain context
					const currentSuggestion = suggestion;
					suggestion = getAutocompleteSuggestion(value, mode, null, currentSuggestion);
					// console.log('[' + event.key + '] New suggestion:', suggestion);
					return;
				}
				// If not at end, let browser handle cursor movement normally
			}
	}
</script>

<div class="command-input-container flex items-center flex-1">
	<!-- Input Field with Autocomplete and Mode Indicator -->
	<div class="input-wrapper relative flex-1">
		<input
			type="text"
			bind:this={inputElement}
			bind:value
			oninput={handleInput}
			onkeydown={handleKeydown}
			{placeholder}
			class="command-input w-full rounded-md border border-gray-600 bg-gray-700 pl-3 pr-8 py-2 text-sm text-white placeholder-gray-400 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600 relative"
			style="font-family: Consolas, 'Courier New', monospace;"
		/>

		<!-- Meshcore Mode Indicator (inside input) -->
		{#if mode === 'meshcore'}
			<div
				class="meshcore-indicator absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-5 bg-green-600/80 text-white rounded text-[0.625rem] font-bold cursor-help tracking-tight select-none backdrop-blur-sm"
				title="MeshCore mode"
			>
				MC
			</div>
		{/if}

		<!-- Autocomplete Suggestion Overlay -->
		{#if suggestion}
			<div
				class="autocomplete-overlay absolute top-2 left-3 pointer-events-none whitespace-pre overflow-hidden"
				style="font-family: Consolas, 'Courier New', monospace; font-size: 0.875rem;"
			>
				<!-- Invisible text matching current input to position the suggestion correctly -->
				<span style="visibility: hidden;">{value}</span><span class="text-gray-400">{suggestion.text}</span>
			</div>
		{/if}
	</div>
</div>
