import { AvgVar } from './avgVar.js';
import type {
  ParsingRule,
  ParsedToken,
  TokenParserState,
  TokenType,
  AvgVarState,
  RawParsingRule,
  RawParsingRuleConfig
} from '$lib/types.js';

// Re-export ParsedToken for use in other modules
export type { ParsedToken };

/**
 * Load parsing rules from JSON configuration.
 * @param jsonContent - JSON configuration string or object
 * @returns Array of parsing rules
 */
export function loadParsingRules(jsonContent: string | RawParsingRuleConfig): ParsingRule[] {
  try {
    const config = typeof jsonContent === 'string'
      ? JSON.parse(jsonContent)
      : jsonContent;

    if (!config || !Array.isArray(config.labels)) {
      console.warn('Invalid parsing rules format: expected labels array');
      return [];
    }

    // Convert raw rules to parsing rules with proper type conversion
    return config.labels.map((rawRule: RawParsingRule): ParsingRule => ({
      ...rawRule,
      type: mapStringToTokenType(rawRule.type)
    }));
  } catch (error) {
    console.error('Failed to load parsing rules:', error);
    return [];
  }
}

/**
 * Map string type from JSON to TokenType enum.
 * @param typeStr - String type from JSON ('str', 'bool', 'static', 'avg')
 * @returns TokenType enum value
 */
export function mapStringToTokenType(typeStr: string): TokenType {
  const typeMap: Record<string, TokenType> = {
    'str': 'str' as TokenType,
    'bool': 'bool' as TokenType,
    'static': 'static' as TokenType,
    'avg': 'avg' as TokenType
  };
  return typeMap[typeStr] || 'str' as TokenType;
}

/**
 * Token parser interface.
 */
export interface TokenParser {
  parse(line: string): void;
  reset(): void;
  getState(): TokenParserState;
}

/**
 * Check if token is considered "filled" (meshlog behavior).
 * For bool: both true and false are considered filled (once set, don't overwrite).
 * @param value - Token value
 * @returns True if filled, false otherwise
 */
function isFilled(value: string | number | boolean | null): boolean {
  if (value === null || value === undefined) return false;
  // Boolean is always filled (both true and false are valid)
  if (typeof value === 'boolean') return true;
  // Empty string is not filled
  if (typeof value === 'string') return value !== '';
  // Numbers are always filled
  return true;
}

/**
 * Create token parser instance with rules.
 * @param rules - Parsing rules from JSON
 * @returns Token parser instance
 */
export function createTokenParser(rules: ParsingRule[]): TokenParser {
  // Parser state
  const state: TokenParserState = {
    tokens: new Map<string, ParsedToken>(),
    avgVars: new Map<string, AvgVarState>(),
    lastUpdate: null
  };

  // Initialize AvgVar instances for type=avg tokens
  const avgVars = new Map<string, AvgVar>();
  for (const rule of rules) {
    if (rule.type === 'avg' as TokenType) {
      const maxIterations = rule.maxIterations || 15;
      avgVars.set(rule.name, new AvgVar(maxIterations));
    }
  }

  return {
    /**
     * Parse a log line and update tokens.
     * @param line - Log line to parse
     */
    parse(line: string): void {
      let hasUpdates = false;

      for (const rule of rules) {
        try {
          const existingToken = state.tokens.get(rule.name);
          const currentValue = existingToken?.value ?? null;

          // Check if label is filled (meshlog: False is FILLED!)
          const filled = isFilled(currentValue);

          // Check rules for behavior
          let isSkipRule = false;
          let isDropRule = false;

          if (rule.rules && filled) {
            for (const r of rule.rules) {
              if (r.type === 'firstEntrance') {
                isSkipRule = true;
              }
              if (r.dropAfter) {
                isDropRule = true;
              }
            }
          }

          // Handle dropAfter: reset token if pattern matches
          if (isDropRule) {
            for (const r of rule.rules ?? []) {
              if (r.dropAfter) {
                try {
                  const dropRegex = new RegExp(r.dropAfter);
                  if (dropRegex.test(line)) {
                    state.tokens.set(rule.name, {
                      name: rule.name,
                      value: null,
                      type: rule.type,
                      timestamp: new Date()
                    });
                    hasUpdates = true;
                    continue; // Skip to next rule
                  }
                } catch (regexError) {
                  console.error(`Invalid dropAfter regex for token ${rule.name}:`, regexError);
                }
              }
            }
          }

          // Skip if firstEntrance and already filled
          if (isSkipRule && filled) {
            continue;
          }

          let value: string | number | boolean | null = null;

          switch (rule.type) {
            case 'str' as TokenType:
              if (rule.regexp) {
                try {
                  const regex = new RegExp(rule.regexp);
                  const match = line.match(regex);
                  if (match) {
                    // Use first group if available, otherwise full match
                    value = match.length > 1 ? (match[1] ?? match[0]) : match[0];
                  }
                } catch (regexError) {
                  console.error(`Invalid regexp for token ${rule.name}:`, regexError);
                }
              } else if (rule.value !== undefined) {
                // Static value for str type
                value = String(rule.value);
              }
              break;

            case 'bool' as TokenType:
              if (rule.regexp) {
                try {
                  // Search for regexp in line
                  const regex = new RegExp(rule.regexp);
                  const match = line.match(regex);
                  value = match !== null;
                } catch (regexError) {
                  console.error(`Invalid regexp for token ${rule.name}:`, regexError);
                }
              } else if (rule.value !== undefined) {
                // Search for value as substring
                const searchValue = String(rule.value);
                value = line.includes(searchValue);
              }
              break;

            case 'static' as TokenType:
              // Always return value, ignore regexp
              if (rule.value !== undefined) {
                value = rule.value;
              }
              break;

            case 'avg' as TokenType:
              if (rule.regexp) {
                try {
                  const regex = new RegExp(rule.regexp);
                  const match = line.match(regex);
                  if (match && match[1]) {
                    const numValue = parseFloat(match[1]);
                    if (!isNaN(numValue)) {
                      const avgVar = avgVars.get(rule.name);
                      if (avgVar) {
                        const ndigits = rule.ndigits ?? 0;
                        value = avgVar.update(numValue, ndigits);

                        // Update avgVars state
                        state.avgVars.set(rule.name, avgVar.getState());
                      }
                    }
                  }
                } catch (regexError) {
                  console.error(`Invalid regexp for token ${rule.name}:`, regexError);
                }
              }
              break;
          }

          // Update token if value found
          if (value !== null) {
            state.tokens.set(rule.name, {
              name: rule.name,
              value,
              type: rule.type,
              timestamp: new Date()
            });
            hasUpdates = true;
          }
        } catch (error) {
          console.error(`Error parsing token ${rule.name}:`, error);
        }
      }

      if (hasUpdates) {
        state.lastUpdate = new Date();
      }
    },

    /**
     * Reset parser state (clear all tokens).
     */
    reset(): void {
      state.tokens.clear();
      state.avgVars.clear();
      avgVars.forEach(avgVar => avgVar.reset());
      state.lastUpdate = null;
    },

    /**
     * Get current parser state.
     */
    getState(): TokenParserState {
      return {
        tokens: new Map(state.tokens),
        avgVars: new Map(state.avgVars),
        lastUpdate: state.lastUpdate
      };
    }
  };
}
