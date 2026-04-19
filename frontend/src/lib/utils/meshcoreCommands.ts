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
  /* console.log('[getAutocompleteSuggestion] CALLED WITH:', {
    input,
    mode,
    currentCommand,
    lastSuggestion
  }); */

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

  // console.log('[getAutocompleteSuggestion] Matching commands:', matchingCommands.map(c => c.command));

  // Tab cycling: if lastSuggestion provided, start from next command
  let startIndex = 0;
  if (lastSuggestion && lastSuggestion.type === 'command') {
    const lastCommand = lastSuggestion.command;

    // If input is a prefix of lastSuggestion command, continue with that same command
    if (lastCommand.startsWith(input)) {
      const matchingCmd = matchingCommands.find(cmd => cmd.command === lastCommand);
      if (matchingCmd) {
        const suffix = matchingCmd.command.slice(input.length);
        // console.log('[getAutocompleteSuggestion] Input continues from lastSuggestion, staying on:', lastCommand);
        return {
          text: suffix,
          type: 'command' as const,
          command: matchingCmd.command
        };
      }
    }

    const lastIndex = matchingCommands.findIndex(
      cmd => cmd.command === lastSuggestion.command
    );
    if (lastIndex >= 0) {
      startIndex = (lastIndex + 1) % matchingCommands.length;
      // console.log('[getAutocompleteSuggestion] Tab cycling: from index', lastIndex, 'to', startIndex);
    }
  }

  if (matchingCommands.length > 0) {
    const nextCmd = matchingCommands[startIndex];
    // console.log('[getAutocompleteSuggestion] Selected command:', nextCmd.command);

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
    const baseCommand = getBaseCommandName(cmd.command);
    if (input.startsWith(baseCommand + ' ') && cmd.params.length > 0) {
      // Extract params part from input
      const paramsPart = input.slice(baseCommand.length + 1).trim();

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
        // For comma separator: user must type comma
        // For space separator: user can type space OR comma
        const endsWithSeparator = separator === 'comma'
          ? input.endsWith(',')
          : (input.endsWith(' ') || input.endsWith(','));

        if (endsWithSeparator) {
          // Show all remaining params, with enum params shown as values
          const remainingParams = cmd.params.slice(enteredParams.length);
          if (remainingParams.length > 0) {
            const paramTexts = remainingParams.map(p => {
              if (p.type === 'enum' && p.options) {
                return `{${p.options.join('|')}}`;
              }
              return `{${p.name}}`;
            });

            const paramSeparator = separator === 'comma' ? ',' : ' ';
            return {
              text: paramTexts.join(paramSeparator),
              type: 'param' as const,
              command: cmd.command
            };
          }
        } else if (enteredParams.length > 0 && enteredParams.length < cmd.params.length) {
          // User entered a param value but hasn't typed separator yet
          // Show separator + remaining params to guide user
          const remainingParams = cmd.params.slice(enteredParams.length);
          if (remainingParams.length > 0) {
            const paramTexts = remainingParams.map(p => {
              if (p.type === 'enum' && p.options) {
                return `{${p.options.join('|')}}`;
              }
              return `{${p.name}}`;
            });

            // Prepend separator to show user what to type next
            const paramSeparator = separator === 'comma' ? ',' : ' ';
            const prefix = paramSeparator;
            return {
              text: prefix + paramTexts.join(paramSeparator),
              type: 'param' as const,
              command: cmd.command
            };
          }
        }
      }
    }
  }

  // Check enum parameter autocomplete for partially entered values
  // This check comes AFTER the param placeholder check, so we only show
  // enum suggestions when the user is actually typing (non-empty value)
  for (const cmd of meshcoreCommandData) {
    if (cmd.params.length === 0) continue;
    const enumSuggestion = getEnumSuggestion(input, cmd, lastSuggestion);
    if (enumSuggestion) return enumSuggestion;
  }

  return null;
}

/**
 * Find enum values that start with the given prefix (case-insensitive).
 */
function findMatchingEnumValues(prefix: string, options: string[]): string[] {
  const lowerPrefix = prefix.toLowerCase();
  return options.filter(option => option.toLowerCase().startsWith(lowerPrefix));
}

/**
 * Extract the base command name from a full command string.
 * Strips parameter placeholders like {on|off}, {pubkey}, etc.
 * e.g., "gps {on|off}" -> "gps", "setperm {pubkey} {0|1|2|3}" -> "setperm"
 */
function getBaseCommandName(fullCommand: string): string {
  // Match everything before the first parameter placeholder (space + { or just {)
  const braceIndex = fullCommand.indexOf('{');
  if (braceIndex === -1) return fullCommand;
  // Trim trailing space before the brace
  return fullCommand.substring(0, braceIndex).trimEnd();
}

/**
 * Determine the current parameter context for a command with params.
 * Returns the index of the param being entered and its partial value.
 */
function getCurrentParamContext(
  input: string,
  cmd: MeshcoreCommand
): { paramIndex: number; paramValue: string; justStarted: boolean } | null {
  const baseCommand = getBaseCommandName(cmd.command);
  if (!input.startsWith(baseCommand + ' ')) return null;

  const paramsPart = input.slice(baseCommand.length + 1);
  const separator = cmd.separator || 'space';

  let enteredParams: string[] = [];
  if (separator === 'comma') {
    enteredParams = paramsPart.split(',').map((p: string) => p.trim()).filter((p: string) => p);
  } else {
    enteredParams = paramsPart.split(/\s+/).filter((p: string) => p);
  }

  // Determine which param is being entered
  // If input ends with separator, user is starting a new param
  const endsWithSeparator = separator === 'comma'
    ? input.endsWith(',')
    : input.endsWith(' ');

  if (endsWithSeparator) {
    // User finished entering a param and is starting the next one
    const nextIndex = enteredParams.length;
    if (nextIndex < cmd.params.length) {
      return { paramIndex: nextIndex, paramValue: '', justStarted: true };
    }
    return null; // All params entered
  }

  // User is typing a param value
  const currentIndex = enteredParams.length - 1;
  if (currentIndex >= 0 && currentIndex < cmd.params.length) {
    return { paramIndex: currentIndex, paramValue: enteredParams[currentIndex], justStarted: false };
  }

  return null;
}

/**
 * Handle enum parameter autocomplete for a partially entered command.
 * Called when the input matches a known command with enum params.
 */
function getEnumSuggestion(
  input: string,
  cmd: MeshcoreCommand,
  lastSuggestion?: AutocompleteSuggestion | null
): AutocompleteSuggestion | null {
  const ctx = getCurrentParamContext(input, cmd);
  if (!ctx) return null;

  const param = cmd.params[ctx.paramIndex];
  if (param.type !== 'enum' || !param.options) return null;

  // If user just started a new param (value is empty, just finished previous param),
  // don't show enum suggestion - let placeholder logic show param name instead
  if (ctx.justStarted) {
    return null;
  }

  // Find matching enum values (empty prefix matches all values)
  const matchedValues = ctx.paramValue === ''
    ? param.options
    : findMatchingEnumValues(ctx.paramValue, param.options);

  if (matchedValues.length === 0) return null;

  // If exact full match and it's the only match, no suggestion needed
  if (ctx.paramValue !== '' && matchedValues.length === 1 &&
      matchedValues[0].toLowerCase() === ctx.paramValue.toLowerCase()) {
    return null;
  }

  // Determine which value to show (cycling support via lastSuggestion)
  let selectedIndex = 0;
  if (lastSuggestion && lastSuggestion.type === 'enum' &&
      lastSuggestion.paramName === param.name &&
      lastSuggestion.command === cmd.command &&
      lastSuggestion.matchedValues) {
    // Find the last shown value in current matched list
    const lastIdx = matchedValues.indexOf(lastSuggestion.enumValue || '');
    if (lastIdx >= 0) {
      selectedIndex = (lastIdx + 1) % matchedValues.length;
    }
  }

  const selectedValue = matchedValues[selectedIndex];
  // Suffix is the part after what user already typed
  const suffix = selectedValue.slice(ctx.paramValue.length);

  return {
    text: suffix,
    type: 'enum',
    command: cmd.command,
    paramName: param.name,
    enumValue: selectedValue,
    matchedValues,
    paramPrefix: ctx.paramValue
  };
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

  /* console.log('[acceptSuggestionToNextSeparator]', {
    input,
    suggestionText: text,
    startsWithSpace: text.startsWith(' '),
    startsWithBrace: text.startsWith('{'),
    startsWithComma: text.startsWith(',')
  }); */

  if (!text) {
    // console.log('[acceptSuggestionToNextSeparator] Empty text, returning input');
    return input;
  }

  // For enum suggestions: accept the full suffix (replacing partial input)
  if (suggestion.type === 'enum' && suggestion.enumValue) {
    return input + text;
  }

  // Check if starts with space
  if (text.startsWith(' ')) {
    // console.log('[acceptSuggestionToNextSeparator] Accepting space');
    return input + ' ';
  }

  // Check if starts with parameter placeholder brackets
  if (text.startsWith('<') || text.startsWith('{') || text.startsWith('[')) {
    // console.log('[acceptSuggestionToNextSeparator] Parameter placeholder, not accepting');
    return input;
  }

  // Check if starts with comma (separator)
  if (text.startsWith(',')) {
    // console.log('[acceptSuggestionToNextSeparator] Accepting comma');
    return input + ',';
  }

  // Otherwise: accept entire word up to next space
  const spaceIdx = text.indexOf(' ');
  if (spaceIdx === -1) {
    // console.log('[acceptSuggestionToNextSeparator] No space found, accepting entire text:', text);
    return input + text;
  } else {
    const toAccept = text.substring(0, spaceIdx);
    // console.log('[acceptSuggestionToNextSeparator] Accepting up to space:', toAccept);
    return input + toAccept;
  }
}

/**
 * Get the next suggestion for cycling through autocomplete variants.
 * Returns the next variant, cycling back to the first command when reaching the end.
 */
export function getNextSuggestion(
  input: string,
  currentSuggestion: AutocompleteSuggestion
): AutocompleteSuggestion | null {
  // console.log('[getNextSuggestion] CALLED WITH:', { input, currentSuggestion });

  if (currentSuggestion.type === 'enum') {
    return cycleEnumSuggestion(currentSuggestion, 1);
  }

  if (currentSuggestion.type === 'command') {
    // Find all matching commands
    const matchingCommands = meshcoreCommandData
      .filter(cmd => !cmd.interactive)
      .filter(cmd => cmd.command.startsWith(input))
      .sort((a, b) => a.command.localeCompare(b.command));

    // console.log('[getNextSuggestion] Matching commands:', matchingCommands.map(c => c.command));

    if (matchingCommands.length === 0) {
      // console.log('[getNextSuggestion] No matching commands');
      return null;
    }

    // Find current command index
    const currentIndex = matchingCommands.findIndex(
      cmd => cmd.command === currentSuggestion.command
    );

    // console.log('[getNextSuggestion] Current command index:', currentIndex);

    if (currentIndex === -1) {
      // console.log('[getNextSuggestion] Current command not found in matching list');
      return null;
    }

    // Cycle to next command, wrapping around to first
    const nextIndex = (currentIndex + 1) % matchingCommands.length;
    const nextCmd = matchingCommands[nextIndex];

    // console.log('[getNextSuggestion] Next command index:', nextIndex, 'command:', nextCmd.command);

    // Just suggest rest of command (params are already in command name!)
    const suffix = nextCmd.command.slice(input.length);
    const result = {
      text: suffix,
      type: 'command' as const,
      command: nextCmd.command
    };

    // console.log('[getNextSuggestion] Returning:', result);
    return result;
  }

  // console.log('[getNextSuggestion] Not a command suggestion');
  return null;
}

/**
 * Get the previous suggestion for cycling through autocomplete variants.
 * Returns the previous variant, cycling back to the last command when reaching the beginning.
 */
export function getPreviousSuggestion(
  input: string,
  currentSuggestion: AutocompleteSuggestion
): AutocompleteSuggestion | null {
  // console.log('[getPreviousSuggestion] CALLED WITH:', { input, currentSuggestion });

  if (currentSuggestion.type === 'enum') {
    return cycleEnumSuggestion(currentSuggestion, -1);
  }

  if (currentSuggestion.type === 'command') {
    // Find all matching commands
    const matchingCommands = meshcoreCommandData
      .filter(cmd => !cmd.interactive)
      .filter(cmd => cmd.command.startsWith(input))
      .sort((a, b) => a.command.localeCompare(b.command));

    // console.log('[getPreviousSuggestion] Matching commands:', matchingCommands.map(c => c.command));

    if (matchingCommands.length === 0) {
      // console.log('[getPreviousSuggestion] No matching commands');
      return null;
    }

    // Find current command index
    const currentIndex = matchingCommands.findIndex(
      cmd => cmd.command === currentSuggestion.command
    );

    // console.log('[getPreviousSuggestion] Current command index:', currentIndex);

    if (currentIndex === -1) {
      // console.log('[getPreviousSuggestion] Current command not found in matching list');
      return null;
    }

    // Cycle to previous command, wrapping around to last
    const prevIndex = (currentIndex - 1 + matchingCommands.length) % matchingCommands.length;
    const prevCmd = matchingCommands[prevIndex];

    // console.log('[getPreviousSuggestion] Previous command index:', prevIndex, 'command:', prevCmd.command);

    // Just suggest rest of command (params are already in command name!)
    const suffix = prevCmd.command.slice(input.length);
    const result = {
      text: suffix,
      type: 'command' as const,
      command: prevCmd.command
    };

    // console.log('[getPreviousSuggestion] Returning:', result);
    return result;
  }

  // console.log('[getPreviousSuggestion] Not a command suggestion');
  return null;
}

/**
 * Cycle through enum values in a suggestion by a given direction.
 * direction: 1 for next, -1 for previous.
 * When cycling, replaces the partial input with the new enum value.
 */
function cycleEnumSuggestion(
  currentSuggestion: AutocompleteSuggestion,
  direction: 1 | -1
): AutocompleteSuggestion | null {
  if (!currentSuggestion.matchedValues || !currentSuggestion.enumValue) {
    return null;
  }

  const currentIndex = currentSuggestion.matchedValues.indexOf(currentSuggestion.enumValue);
  if (currentIndex === -1) return null;

  const newIndex = (currentIndex + direction + currentSuggestion.matchedValues.length) %
                    currentSuggestion.matchedValues.length;
  const newValue = currentSuggestion.matchedValues[newIndex];
  const prefix = currentSuggestion.paramPrefix || '';

  return {
    ...currentSuggestion,
    text: newValue.slice(prefix.length),
    enumValue: newValue
  };
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
