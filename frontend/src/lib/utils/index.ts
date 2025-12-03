// Export all dropdown utilities
export * from './clickOutside';
export * from './keyboardNavigation';
export * from './dropdownManager';
export * from './dropdownUtils';
export * from './cookies';

// Re-export commonly used functions with shorter names
export {
  createClickOutside,
  createKeyboardNavigation,
  createDropdownUtils,
  createSimpleDropdown
} from './dropdownUtils';