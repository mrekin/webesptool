import { describe, it, expect } from 'vitest';
import {
  parseCommandInput,
  getAutocompleteSuggestion,
  acceptSuggestion,
  getNextSuggestion,
  findCommand,
  isModeSwitchCommand
} from './meshcoreCommands';

describe('meshcoreCommands', () => {
  describe('findCommand', () => {
    it('should find command by name', () => {
      const command = findCommand('neighbors');
      expect(command).not.toBeUndefined();
      expect(command?.command).toBe('neighbors');
    });

    it('should find multi-word command', () => {
      const command = findCommand('set name');
      expect(command).not.toBeUndefined();
      expect(command?.command).toBe('set name');
    });

    it('should return undefined for unknown command', () => {
      const command = findCommand('unknown');
      expect(command).toBeUndefined();
    });

    it('should find get radio command', () => {
      const command = findCommand('get radio');
      expect(command).not.toBeUndefined();
      expect(command?.command).toBe('get radio');
    });
  });

  describe('isModeSwitchCommand', () => {
    it('should return true for /mc', () => {
      expect(isModeSwitchCommand('/mc')).toBe(true);
    });

    it('should return true for /mc with whitespace', () => {
      expect(isModeSwitchCommand('  /mc  ')).toBe(true);
    });

    it('should return false for other input', () => {
      expect(isModeSwitchCommand('neighbors')).toBe(false);
      expect(isModeSwitchCommand('/meshcore')).toBe(false);
    });
  });

  describe('parseCommandInput', () => {
    it('should parse command without params', () => {
      const result = parseCommandInput('neighbors');
      expect(result.command).toBe('neighbors');
      expect(result.params).toEqual([]);
      expect(result.paramCount).toBe(0);
    });

    it('should parse multi-word command without params', () => {
      const result = parseCommandInput('get radio');
      expect(result.command).toBe('get radio');
      expect(result.params).toEqual([]);
      expect(result.paramCount).toBe(0);
    });

    it('should parse command with space-separated params', () => {
      const result = parseCommandInput('set name MyNode');
      expect(result.command).toBe('set name');
      expect(result.params).toEqual(['MyNode']);
      expect(result.paramCount).toBe(1);
    });

    it('should parse command with quoted params with spaces', () => {
      const result = parseCommandInput('set name "My Node"');
      expect(result.command).toBe('set name');
      expect(result.params).toEqual(['My Node']);
      expect(result.paramCount).toBe(1);
    });

    it('should detect in-quotes state', () => {
      const result = parseCommandInput('set name "My');
      expect(result.inQuotes).toBe(true);
    });

    it('should parse command with comma-separated params when command is known', () => {
      const command = findCommand('set radio');
      const result = parseCommandInput('set radio 915,125,9,5', command);
      expect(result.command).toBe('set radio');
      expect(result.params).toEqual(['915', '125', '9', '5']);
      expect(result.paramCount).toBe(4);
    });

    it('should parse partial input (command name only)', () => {
      const result = parseCommandInput('get');
      // 'get' is not a standalone command, so it falls back to first word
      expect(result.command).toBe('get');
      expect(result.params).toEqual([]);
    });

    it('should handle empty input', () => {
      const result = parseCommandInput('');
      expect(result.command).toBe('');
      expect(result.params).toEqual([]);
      expect(result.paramCount).toBe(0);
    });
  });

  describe('getAutocompleteSuggestion', () => {
    it('should not suggest in normal mode', () => {
      const suggestion = getAutocompleteSuggestion('n', 'normal');
      expect(suggestion).toBeNull();
    });

    it('should not suggest for empty input', () => {
      const suggestion = getAutocompleteSuggestion('', 'meshcore');
      expect(suggestion).toBeNull();
    });

    it('should suggest command names for partial input', () => {
      const suggestion = getAutocompleteSuggestion('n', 'meshcore');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe('command');
      expect(suggestion?.text).toContain('eighbors');
      expect(suggestion?.command).toBe('neighbors');
    });

    it('should suggest multi-word commands from partial input', () => {
      const suggestion = getAutocompleteSuggestion('get r', 'meshcore');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe('command');
      // Should suggest the first command starting with "get r"
      expect(suggestion?.command).toBe('get radio');
    });

    it('should suggest params for fully matched command', () => {
      const suggestion = getAutocompleteSuggestion('set name', 'meshcore');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe('param');
      expect(suggestion?.text).toContain('<name>');
    });

    it('should not suggest for command without params when fully typed', () => {
      const suggestion = getAutocompleteSuggestion('neighbors', 'meshcore');
      expect(suggestion).toBeNull();
    });

    it('should suggest params for command with comma separator', () => {
      const suggestion = getAutocompleteSuggestion('set radio', 'meshcore');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe('param');
      expect(suggestion?.text).toContain('<freq>');
      expect(suggestion?.text).toContain('<bw>');
    });

    it('should not suggest for interactive commands', () => {
      // 'region load' is interactive - should not autocomplete
      const suggestion = getAutocompleteSuggestion('region lo', 'meshcore');
      // It might still suggest region load as a command name, but let's check
      // Actually, interactive commands are filtered out from matching
      expect(suggestion).toBeNull();
    });

    it('should suggest remaining params after partial params entered', () => {
      const suggestion = getAutocompleteSuggestion('set name MyNode', 'meshcore');
      // All params entered (1 param), so no suggestion
      expect(suggestion).toBeNull();
    });

    it('should suggest remaining params for multi-param command', () => {
      const suggestion = getAutocompleteSuggestion('sensor set key', 'meshcore');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe('param');
      expect(suggestion?.text).toContain('<value>');
    });
  });

  describe('acceptSuggestion', () => {
    it('should accept command suggestion (strip param hints)', () => {
      const suggestion = {
        text: 'eighbors',
        type: 'command' as const,
        command: 'neighbors'
      };
      const result = acceptSuggestion('n', suggestion);
      expect(result).toBe('neighbors');
    });

    it('should accept command suggestion with param hints', () => {
      const suggestion = {
        text: 'ame <name>',
        type: 'command' as const,
        command: 'set name'
      };
      const result = acceptSuggestion('set n', suggestion);
      expect(result).toBe('set name');
    });

    it('should accept param suggestion (strip param names, keep separator)', () => {
      const suggestion = {
        text: ' <name>',
        type: 'param' as const,
        command: 'set name'
      };
      const result = acceptSuggestion('set name', suggestion);
      expect(result).toBe('set name ');
    });

    it('should accept comma-separated param suggestion', () => {
      const suggestion = {
        text: ',<bw>,<sf>,<cr>',
        type: 'param' as const,
        command: 'set radio'
      };
      const result = acceptSuggestion('set radio 915', suggestion);
      expect(result).toBe('set radio 915,');
    });
  });

  describe('getNextSuggestion', () => {
    it('should return next command suggestion', () => {
      const currentSuggestion = {
        text: 'eighbors',
        type: 'command' as const,
        command: 'neighbors'
      };
      const next = getNextSuggestion('n', currentSuggestion);
      // Should return a different command starting with 'n', or null if only one
      if (next) {
        expect(next.command).not.toBe('neighbors');
        expect(next.command.startsWith('n')).toBe(true);
      }
    });

    it('should return null for param suggestion (no cycling)', () => {
      const currentSuggestion = {
        text: ' <name>',
        type: 'param' as const,
        command: 'set name'
      };
      const next = getNextSuggestion('set name', currentSuggestion);
      expect(next).toBeNull();
    });

    it('should cycle through matching commands', () => {
      // 'set' matches many commands: set name, set freq, set radio, etc.
      const firstSuggestion = getAutocompleteSuggestion('set', 'meshcore');
      expect(firstSuggestion).not.toBeNull();

      if (firstSuggestion) {
        const secondSuggestion = getNextSuggestion('set', firstSuggestion);
        if (secondSuggestion) {
          expect(secondSuggestion.command).not.toBe(firstSuggestion.command);
        }
      }
    });
  });
});
