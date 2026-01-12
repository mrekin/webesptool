// Export all dropdown utilities
export * from './clickOutside.js';
export * from './keyboardNavigation.js';
export * from './dropdownManager.js';
export * from './dropdownUtils.js';
export * from './cookies.js';

// Export markdown utilities
export {
  insertDoc,
  clearMarkdownCache,
  getMarkdownCacheStats
} from './markdown.js';
// export type { MarkdownOptions } from './markdown.js'; // Commenting out since MarkdownOptions is not exported from markdown.js

// Re-export commonly used functions with shorter names
export {
  createClickOutside,
  createKeyboardNavigation,
  createDropdownUtils,
  createSimpleDropdown
} from './dropdownUtils.js';

// Export ESP and file handling utilities
export * from './esp.js';
export * from './fileHandler.js';

// Re-export ESP and file handler factory functions
export {
  createESPManager
} from './esp.js';

export {
  createFirmwareFileHandler
} from './fileHandler.js';

// Export Meshtastic utilities
export * from './meshtastic.js';

export {
  createMeshtasticManager
} from './meshtastic.js';