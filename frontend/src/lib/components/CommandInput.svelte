<script lang="ts">
	import { onDestroy } from 'svelte';
	import { terminalMode } from '$lib/stores.js';
	import type { AutocompleteSuggestion, TerminalMode } from '$lib/types.js';
	import {
		getAutocompleteSuggestion,
		acceptSuggestion,
		acceptSuggestionToNextSeparator,
		getNextSuggestion
	} from '$lib/utils/meshcoreCommands.js';

	export let value = '';
	export let isConnected = false;
	export let onSubmit = (cmd: string) => {};
	export let placeholder = '';
	export let commandHistory: string[] = [];
	export let historyIndex = -1;

	let mode: TerminalMode = 'normal';
	let suggestion: AutocompleteSuggestion | null = null;
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
		suggestion = getAutocompleteSuggestion(value, mode, null);
	}

	/**
	 * Handle keydown events for autocomplete, mode switch, history, and submit
	 */
	function handleKeydown(event: KeyboardEvent) {
		// Tab - cycle suggestions or accept
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

			if (suggestion) {
				const nextSuggestion = getNextSuggestion(value, suggestion);
				if (nextSuggestion) {
					// Show next variant
					suggestion = nextSuggestion;
				} else {
					// Accept current suggestion
					value = acceptSuggestion(value, suggestion);
					suggestion = null;
					// After accepting, check if there are more suggestions
					suggestion = getAutocompleteSuggestion(value, mode, null);
				}
			}
			return;
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

		// ArrowUp - navigate history backward
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (commandHistory.length === 0) return;
			if (historyIndex > 0) {
				historyIndex--;
				value = commandHistory[historyIndex];
				suggestion = null;
			}
			return;
		}

		// ArrowDown - navigate history forward
		if (event.key === 'ArrowDown') {
			event.preventDefault();
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

		// ArrowRight - accept suggestion up to next separator
		if (event.key === 'ArrowRight' && suggestion) {
			event.preventDefault();

			value = acceptSuggestionToNextSeparator(value, suggestion);
			// Update suggestion after partial accept
			suggestion = getAutocompleteSuggestion(value, mode, null);
			return;
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
			on:input={handleInput}
			on:keydown={handleKeydown}
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
