/**
 * Configuration for keyboard navigation
 */
export interface KeyboardNavigationConfig {
  items: any[];
  selectedIndex: number;
  onSelection: (item: any, index: number) => void;
  onClose?: () => void;
  onIndexChange?: (index: number) => void;
  enabled?: boolean;
}

/**
 * Creates keyboard navigation handler
 * @param config - Navigation configuration
 * @returns Event handler function
 */
export function createKeyboardNavigation(config: KeyboardNavigationConfig) {
  return function handleKeydown(event: KeyboardEvent) {
    if (!config.enabled) return;

    const { items, selectedIndex, onSelection, onClose, onIndexChange } = config;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
        onIndexChange?.(nextIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
        onIndexChange?.(prevIndex);
        break;

      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          onSelection(items[selectedIndex], selectedIndex);
        }
        break;

      case 'Escape':
        event.preventDefault();
        onClose?.();
        break;
    }
  };
}

/**
 * Enhanced keyboard navigation with support for different dropdown types
 */
export interface EnhancedKeyboardNavigationConfig {
  dropdownType: 'device' | 'version' | 'custom';
  items: any[];
  selectedIndex: number;
  onSelection: (item: any, index: number) => void;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  customHandlers?: Record<string, (event: KeyboardEvent) => void>;
}

export function createEnhancedKeyboardNavigation(config: EnhancedKeyboardNavigationConfig) {
  return function handleKeydown(event: KeyboardEvent) {
    const { items, selectedIndex, onSelection, onClose, onIndexChange, dropdownType, customHandlers } = config;

    // Check for custom handlers first
    if (customHandlers?.[event.key]) {
      customHandlers[event.key](event);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
        onIndexChange(nextIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
        onIndexChange(prevIndex);
        break;

      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          onSelection(items[selectedIndex], selectedIndex);
        }
        break;

      case 'Escape':
        event.preventDefault();
        onClose();
        break;

      case 'Tab':
        // Allow default tab behavior but close dropdown
        onClose();
        break;

      default:
        // Handle other keys if needed for specific dropdown types
        if (dropdownType === 'device' && event.key.length === 1) {
          // Type to search functionality could be added here
          // event.preventDefault();
          // handleTypeToSearch(event.key);
        }
        break;
    }
  };
}

/**
 * Creates a simple keyboard navigation handler for basic dropdowns
 */
export function createSimpleKeyboardNavigation(
  items: any[],
  onSelect: (item: any, index: number) => void,
  onClose?: () => void
) {
  let selectedIndex = -1;

  return {
    handleKeydown: (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selectedIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
          break;

        case 'ArrowUp':
          event.preventDefault();
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
          break;

        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && items[selectedIndex]) {
            onSelect(items[selectedIndex], selectedIndex);
          }
          break;

        case 'Escape':
          event.preventDefault();
          onClose?.();
          selectedIndex = -1;
          break;
      }
    },
    getSelectedIndex: () => selectedIndex,
    setSelectedIndex: (index: number) => { selectedIndex = index; },
    resetSelection: () => { selectedIndex = -1; }
  };
}