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
 */
export function getAutocompleteSuggestion(
  input: string,
  mode: 'normal' | 'meshcore',
  lastSuggestion?: AutocompleteSuggestion | null
): AutocompleteSuggestion | null {
  const trimmedInput = input.trim();

  // Handle /mc command in both modes (for switching)
  if ('/mc'.startsWith(trimmedInput)) {
    return {
      text: '/mc'.slice(trimmedInput.length),
      type: 'command',
      command: '/mc'
    };
  }

  if (mode !== 'meshcore') return null;

  if (!trimmedInput) return null;

  // Find all commands that match the input
  const matchingCommands = meshcoreCommandData
    .filter(cmd => !cmd.interactive)
    .filter(cmd => cmd.command.startsWith(trimmedInput))
    .sort((a, b) => a.command.localeCompare(b.command));

  if (matchingCommands.length === 0) {
    return null;
  }

  // If input ends with space, we're looking for next word in multi-word commands
  if (trimmedInput.endsWith(' ')) {
    const prefix = trimmedInput.slice(0, -1); // Remove trailing space

    // Find commands that start with this prefix and have more words
    const continuationCommands = meshcoreCommandData
      .filter(cmd => !cmd.interactive)
      .filter(cmd => cmd.command.startsWith(prefix + ' '))
      .sort((a, b) => a.command.localeCompare(b.command));

    if (continuationCommands.length === 0) {
      return null;
    }

    // Cycle through continuation commands
    let startIndex = 0;
    if (lastSuggestion && lastSuggestion.type === 'command') {
      const lastIndex = continuationCommands.findIndex(
        cmd => cmd.command === lastSuggestion.command
      );
      if (lastIndex >= 0) {
        startIndex = (lastIndex + 1) % continuationCommands.length;
      }
    }

    const nextCommand = continuationCommands[startIndex];
    const remainingPart = nextCommand.command.slice(prefix.length + 1); // +1 for the space
    const nextWordMatch = remainingPart.match(/^(\S+)/);

    if (nextWordMatch) {
      const nextWord = nextWordMatch[1];

      // Add parameter hints if this is the full command
      let paramHint = '';
      if (nextCommand.params.length > 0) {
        const sep = nextCommand.separator === 'comma' ? ',' : ' ';
        paramHint = sep + nextCommand.params
          .map(p => `<${p.name}>`)
          .join(sep);
      }

      return {
        text: nextWord + paramHint,
        type: 'command',
        command: nextCommand.command
      };
    }

    return null;
  }

  // Check if input exactly matches a command
  const exactCommand = findCommand(trimmedInput);

  if (exactCommand) {
    // Check if there are commands that start with this command + space
    const continuationCommands = meshcoreCommandData
      .filter(cmd => !cmd.interactive)
      .filter(cmd => cmd.command.startsWith(trimmedInput + ' '))
      .sort((a, b) => a.command.localeCompare(b.command));

    if (continuationCommands.length > 0) {
      // Show next word from continuation commands
      let startIndex = 0;
      if (lastSuggestion && lastSuggestion.type === 'command') {
        const lastIndex = continuationCommands.findIndex(
          cmd => cmd.command === lastSuggestion.command
        );
        if (lastIndex >= 0) {
          startIndex = (lastIndex + 1) % continuationCommands.length;
        }
      }

      const nextCommand = continuationCommands[startIndex];
      const remainingPart = nextCommand.command.slice(trimmedInput.length + 1); // +1 for the space
      const nextWordMatch = remainingPart.match(/^(\S+)/);

      if (nextWordMatch) {
        const nextWord = nextWordMatch[1];

        // Add parameter hints if this is the full command
        let paramHint = '';
        if (nextCommand.params.length > 0) {
          const sep = nextCommand.separator === 'comma' ? ',' : ' ';
          paramHint = sep + nextCommand.params
            .map(p => `<${p.name}>`)
            .join(sep);
        }

        return {
          text: ' ' + nextWord + paramHint,
          type: 'command',
          command: nextCommand.command
        };
      }
    }

    // No continuation commands - show parameters for this command
    if (exactCommand.params.length > 0) {
      const sep = exactCommand.separator === 'comma' ? ',' : ' ';
      const paramHint = sep + exactCommand.params
        .map(p => `<${p.name}>`)
        .join(sep);
      return {
        text: paramHint,
        type: 'param',
        command: exactCommand.command
      };
    }

    return null; // Command without params, fully matched
  }

  // Input is a partial command match - show suggestions
  let startIndex = 0;
  if (lastSuggestion && lastSuggestion.type === 'command') {
    const lastIndex = matchingCommands.findIndex(
      cmd => cmd.command === lastSuggestion.command
    );
    if (lastIndex >= 0) {
      startIndex = (lastIndex + 1) % matchingCommands.length;
    }
  }

  const nextCommand = matchingCommands[startIndex];
  const suffix = nextCommand.command.slice(trimmedInput.length);

  // Add parameter hints
  let paramHint = '';
  if (nextCommand.params.length > 0) {
    const sep = nextCommand.separator === 'comma' ? ',' : ' ';
    paramHint = sep + nextCommand.params
      .map(p => `<${p.name}>`)
      .join(sep);
  }

  return {
    text: suffix + paramHint,
    type: 'command',
    command: nextCommand.command
  };
}

/**
 * Accept suggestion and append it to input.
 * For command suggestions: accept only the command part (strip param hints in <>).
 * For param suggestions: accept only separators (strip param hints in <>).
 */
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
 */
export function acceptSuggestionToNextSeparator(
  input: string,
  suggestion: AutocompleteSuggestion
): string {
  let text = suggestion.text;

  // Check if text starts with a separator (space or comma)
  const startsWithSeparator = text.length > 0 && (text[0] === ' ' || text[0] === ',');

  if (startsWithSeparator) {
    // Text starts with separator - accept it and the following word
    const separator = text[0];
    text = text.substring(1); // Remove leading separator

    // Find the next separator or parameter hint
    const spaceIndex = text.indexOf(' ');
    const commaIndex = text.indexOf(',');
    const paramStartIndex = text.indexOf('<');

    let endIndex = text.length; // Default: accept everything

    const indices = [
      spaceIndex !== -1 ? spaceIndex : Infinity,
      commaIndex !== -1 ? commaIndex : Infinity,
      paramStartIndex !== -1 ? paramStartIndex : Infinity
    ];

    const minIndex = Math.min(...indices);

    if (minIndex !== Infinity) {
      endIndex = minIndex;
    }

    // Accept: separator + word up to next boundary
    const word = text.substring(0, endIndex);
    return input + separator + word;
  }

  // Text doesn't start with separator - find first boundary
  const spaceIndex = text.indexOf(' ');
  const commaIndex = text.indexOf(',');
  const paramStartIndex = text.indexOf('<');

  let endIndex = text.length; // Default: accept everything

  const indices = [
    spaceIndex !== -1 ? spaceIndex : Infinity,
    commaIndex !== -1 ? commaIndex : Infinity,
    paramStartIndex !== -1 ? paramStartIndex : Infinity
  ];

  const minIndex = Math.min(...indices);

  if (minIndex !== Infinity) {
    endIndex = minIndex;
  }

  // Accept text up to (but not including) the boundary
  const acceptedText = text.substring(0, endIndex);

  // Add the separator back if we stopped at one
  let result = input + acceptedText;
  if (minIndex !== Infinity && minIndex === spaceIndex) {
    result += ' ';
  } else if (minIndex !== Infinity && minIndex === commaIndex) {
    result += ',';
  }

  return result;
}

/**
 * Get the next suggestion for cycling through autocomplete variants.
 */
export function getNextSuggestion(
  input: string,
  currentSuggestion: AutocompleteSuggestion
): AutocompleteSuggestion | null {
  if (currentSuggestion.type === 'command') {
    const nextSuggestion = getAutocompleteSuggestion(
      input,
      'meshcore',
      currentSuggestion
    );

    // If we cycled back to the same command, return null (signal to accept current)
    if (nextSuggestion && nextSuggestion.command !== currentSuggestion.command) {
      return nextSuggestion;
    }

    return null;
  }

  // Parameter suggestions do not support cycling
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
