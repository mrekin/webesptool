// Meshcore command autocomplete utilities
import { meshcoreCommandData } from './meshcoreCommandData.js';
import type {
  MeshcoreCommand,
  ParsedCommandInput,
  AutocompleteSuggestion
} from '$lib/types';

/**
 * Parse user input and determine command, parameters and their count.
 * Supports both space and comma separators, and quoted values with spaces.
 */
export function parseCommandInput(
  input: string,
  command?: MeshcoreCommand
): ParsedCommandInput {
  const trimmedInput = input.trim();
  const parts: string[] = [];
  let currentPart = '';
  let inQuotes = false;

  // Determine separator based on known command or default to space
  const separator = command?.separator || 'space';

  if (separator === 'comma') {
    // Parse with comma separator
    for (let i = 0; i < trimmedInput.length; i++) {
      const char = trimmedInput[i];

      if (char === '"' && (i === 0 || trimmedInput[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(currentPart.trim());
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
  } else {
    // Parse with space separator
    for (let i = 0; i < trimmedInput.length; i++) {
      const char = trimmedInput[i];

      if (char === '"' && (i === 0 || trimmedInput[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
        currentPart += char;
      } else if (char === ' ' && !inQuotes) {
        if (currentPart) {
          parts.push(currentPart);
          currentPart = '';
        }
      } else {
        currentPart += char;
      }
    }
  }

  // Add last part
  if (currentPart) {
    parts.push(currentPart);
  }

  // Determine command and parameters
  let commandName = '';
  let params: string[] = [];

  if (command) {
    // Known command: split parts after the command words
    const commandWords = command.command.split(' ');
    commandName = command.command;
    params = parts.slice(commandWords.length);
  } else if (parts.length > 0) {
    // Try to find command by matching first words
    for (let i = parts.length; i > 0; i--) {
      const potentialCommand = parts.slice(0, i).join(' ');
      const foundCommand = findCommand(potentialCommand);
      if (foundCommand) {
        commandName = foundCommand.command;
        params = parts.slice(i);
        break;
      }
    }

    // Fallback: use first word as command
    if (!commandName) {
      commandName = parts[0];
      params = parts.slice(1);
    }
  }

  return {
    command: commandName,
    params: params.map(p => p.replace(/^"|"$/g, '')),
    paramCount: params.length,
    inQuotes
  };
}

/**
 * Get autocomplete suggestion based on current input and mode.
 * Algorithm from test_autocomplete.py:
 * 1. If current_command provided, continue from it
 * 2. If input ends with space - show params or continuations
 * 3. If input matches exact command - show params or continuations with leading space
 * 4. If input partial match - show rest of command + params
 */
export function getAutocompleteSuggestion(
  input: string,
  mode: 'normal' | 'meshcore',
  currentCommand?: string | null,
  lastSuggestion?: AutocompleteSuggestion | null
): AutocompleteSuggestion | null {
  console.log('[getAutocompleteSuggestion] CALLED WITH:', {
    input,
    mode,
    currentCommand,
    lastSuggestion
  });

  const trimmedInput = input.trim();

  // Handle /mc command in normal mode
  if (mode === 'normal') {
    // Suggest /mc for inputs that start with / (including just "/")
    if (trimmedInput === '/' || '/mc'.startsWith(trimmedInput)) {
      return {
        text: '/mc'.slice(trimmedInput.length),
        type: 'command' as const,
        command: '/mc'
      };
    }
    return null;
  }

  if (mode !== 'meshcore') return null;
  if (!trimmedInput) return null;

  // Find all commands that start with input (PARTIAL MATCH - this handles ALL cases!)
  let matchingCommands = meshcoreCommandData
    .filter(cmd => !cmd.interactive)
    .filter(cmd => cmd.command.startsWith(input))
    .sort((a, b) => a.command.localeCompare(b.command));

  console.log('[getAutocompleteSuggestion] Matching commands:', matchingCommands.map(c => c.command));

  // Tab cycling: if lastSuggestion provided, start from next command
  let startIndex = 0;
  if (lastSuggestion && lastSuggestion.type === 'command') {
    const lastIndex = matchingCommands.findIndex(
      cmd => cmd.command === lastSuggestion.command
    );
    if (lastIndex >= 0) {
      startIndex = (lastIndex + 1) % matchingCommands.length;
      console.log('[getAutocompleteSuggestion] Tab cycling: from index', lastIndex, 'to', startIndex);
    }
  }

  if (matchingCommands.length > 0) {
    const nextCmd = matchingCommands[startIndex];
    console.log('[getAutocompleteSuggestion] Selected command:', nextCmd.command);

    // Just suggest rest of command (params are already in command name!)
    const suffix = nextCmd.command.slice(input.length);
    return {
      text: suffix,
      type: 'command' as const,
      command: nextCmd.command
    };
  }

  // Check if input matches a command with partially entered params
  // e.g., "set radio 123" should match "set radio" and show next param
  for (const cmd of meshcoreCommandData) {
    if (input.startsWith(cmd.command + ' ') && cmd.params.length > 0) {
      // Extract params part from input
      const paramsPart = input.slice(cmd.command.length + 1).trim();

      // Determine separator
      const separator = cmd.separator || 'space';

      // Count how many params are entered
      let enteredParams: string[] = [];
      if (separator === 'comma') {
        enteredParams = paramsPart.split(',').map(p => p.trim()).filter(p => p);
      } else { // space
        enteredParams = paramsPart.split(/\s+/).filter(p => p);
      }

      // Check if we can move to next param
      if (enteredParams.length < cmd.params.length) {
        // Check if input ends with separator (ready for next param)
        if (separator === 'comma' && input.endsWith(',')) {
          // Show remaining params
          const remainingParams = cmd.params.slice(enteredParams.length);
          if (remainingParams.length > 0) {
            const paramNames = remainingParams.map(p => p.name);
            const paramsStr = paramNames.join('},{');
            return {
              text: `{${paramsStr}}`,
              type: 'param' as const,
              command: cmd.command
            };
          }
        } else if (separator === 'space' && input.endsWith(' ')) {
          // Show next param
          const nextParam = cmd.params[enteredParams.length];
          return {
            text: `{${nextParam.name}}`,
            type: 'param',
            command: cmd.command
          };
        }
      }
    }
  }

  return null;
}
export function acceptSuggestion(
  input: string,
  suggestion: AutocompleteSuggestion
): string {
  // Strip parameter hints (anything in angle brackets) and trim trailing separators
  const acceptedText = suggestion.text.replace(/<[^>]+>/g, '').trimEnd();
  return input + acceptedText;
}

/**
 * Accept suggestion up to the next separator (space or comma) or parameter hint.
 * Used for ArrowRight key functionality.
 * Logic from test_autocomplete.py:
 * - If suggestion starts with space: accept the space
 * - If suggestion starts with '<', '{', '[': don't accept (user must type param value)
 * - If suggestion starts with comma: accept the comma
 * - Otherwise: accept ENTIRE word up to next space
 */
export function acceptSuggestionToNextSeparator(
  input: string,
  suggestion: AutocompleteSuggestion
): string {
  const text = suggestion.text;

  console.log('[acceptSuggestionToNextSeparator]', {
    input,
    suggestionText: text,
    startsWithSpace: text.startsWith(' '),
    startsWithBrace: text.startsWith('{'),
    startsWithComma: text.startsWith(',')
  });

  if (!text) {
    console.log('[acceptSuggestionToNextSeparator] Empty text, returning input');
    return input;
  }

  // Check if starts with space
  if (text.startsWith(' ')) {
    console.log('[acceptSuggestionToNextSeparator] Accepting space');
    return input + ' ';
  }

  // Check if starts with parameter placeholder brackets
  if (text.startsWith('<') || text.startsWith('{') || text.startsWith('[')) {
    console.log('[acceptSuggestionToNextSeparator] Parameter placeholder, not accepting');
    return input;
  }

  // Check if starts with comma (separator)
  if (text.startsWith(',')) {
    console.log('[acceptSuggestionToNextSeparator] Accepting comma');
    return input + ',';
  }

  // Otherwise: accept entire word up to next space
  const spaceIdx = text.indexOf(' ');
  if (spaceIdx === -1) {
    console.log('[acceptSuggestionToNextSeparator] No space found, accepting entire text:', text);
    return input + text;
  } else {
    const toAccept = text.substring(0, spaceIdx);
    console.log('[acceptSuggestionToNextSeparator] Accepting up to space:', toAccept);
    return input + toAccept;
  }
}

/**
 * Get the next suggestion for cycling through autocomplete variants.
 * Returns the next variant, cycling back to the first command when reaching the end.
 */
/**
 * Get the next suggestion for cycling through autocomplete variants.
 * Returns the next variant, cycling back to the first command when reaching the end.
 */
export function getNextSuggestion(
  input: string,
  currentSuggestion: AutocompleteSuggestion
): AutocompleteSuggestion | null {
  console.log('[getNextSuggestion] CALLED WITH:', { input, currentSuggestion });

  if (currentSuggestion.type === 'command') {
    // Find all matching commands
    const matchingCommands = meshcoreCommandData
      .filter(cmd => !cmd.interactive)
      .filter(cmd => cmd.command.startsWith(input))
      .sort((a, b) => a.command.localeCompare(b.command));

    console.log('[getNextSuggestion] Matching commands:', matchingCommands.map(c => c.command));

    if (matchingCommands.length === 0) {
      console.log('[getNextSuggestion] No matching commands');
      return null;
    }

    // Find current command index
    const currentIndex = matchingCommands.findIndex(
      cmd => cmd.command === currentSuggestion.command
    );

    console.log('[getNextSuggestion] Current command index:', currentIndex);

    if (currentIndex === -1) {
      console.log('[getNextSuggestion] Current command not found in matching list');
      return null;
    }

    // Cycle to next command, wrapping around to first
    const nextIndex = (currentIndex + 1) % matchingCommands.length;
    const nextCmd = matchingCommands[nextIndex];

    console.log('[getNextSuggestion] Next command index:', nextIndex, 'command:', nextCmd.command);

    // Just suggest rest of command (params are already in command name!)
    const suffix = nextCmd.command.slice(input.length);
    const result = {
      text: suffix,
      type: 'command' as const,
      command: nextCmd.command
    };

    console.log('[getNextSuggestion] Returning:', result);
    return result;
  }

  console.log('[getNextSuggestion] Not a command suggestion');
  return null;
}

/**
 * Check if input is a mode switch command (/mc).
 */
export function isModeSwitchCommand(input: string): boolean {
  return input.trim() === '/mc';
}

/**
 * Find a command by its full name.
 */
export function findCommand(commandName: string): MeshcoreCommand | undefined {
  return meshcoreCommandData.find(cmd => cmd.command === commandName);
}
