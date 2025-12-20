import { onMount, onDestroy } from 'svelte';
import { createClickOutside } from './clickOutside.js';
import { createEnhancedKeyboardNavigation, type EnhancedKeyboardNavigationConfig } from './keyboardNavigation.js';
import { createDropdownManager } from './dropdownManager.js';

/**
 * Complete dropdown management utility
 * Combines click outside, keyboard navigation, and state management
 */
export interface DropdownUtilsConfig extends EnhancedKeyboardNavigationConfig {
  element: HTMLElement;
  excludeSelector?: string;
  onStateChange?: (isOpen: boolean, selectedIndex: number) => void;
}

export function createDropdownUtils(config: DropdownUtilsConfig) {
  const manager = createDropdownManager();
  let currentState = {
    isOpen: false,
    selectedIndex: -1
  };

  // Update state and notify callbacks
  function updateState(updates: Partial<typeof currentState>) {
    currentState = { ...currentState, ...updates };
    config.onStateChange?.(currentState.isOpen, currentState.selectedIndex);
    config.onIndexChange?.(currentState.selectedIndex);
  }

  // Keyboard navigation handler
  const keyboardHandler = createEnhancedKeyboardNavigation({
    ...config,
    onSelection: (item, index) => {
      config.onSelection(item, index);
      updateState({ isOpen: false, selectedIndex: -1 });
    },
    onClose: () => {
      config.onClose();
      updateState({ isOpen: false, selectedIndex: -1 });
    },
    onIndexChange: (index) => {
      updateState({ selectedIndex: index });
    }
  });

  // Click outside handler
  const clickOutsideHandler = createClickOutside(
    config.element,
    () => {
      config.onClose();
      updateState({ isOpen: false, selectedIndex: -1 });
    },
    config.excludeSelector
  );

  // Event listeners
  function addKeyboardListener() {
    document.addEventListener('keydown', keyboardHandler);
  }

  function removeKeyboardListener() {
    document.removeEventListener('keydown', keyboardHandler);
  }

  onMount(() => {
    addKeyboardListener();
  });

  onDestroy(() => {
    removeKeyboardListener();
    clickOutsideHandler.destroy?.();
  });

  return {
    // State management
    getState: () => currentState,
    open: (resetSelection = true) => updateState({
      isOpen: true,
      selectedIndex: resetSelection ? -1 : currentState.selectedIndex
    }),
    close: () => updateState({ isOpen: false, selectedIndex: -1 }),
    toggle: () => updateState({
      isOpen: !currentState.isOpen,
      selectedIndex: !currentState.isOpen ? -1 : currentState.selectedIndex
    }),
    setSelectedIndex: (index: number) => updateState({ selectedIndex: index }),

    // Manual event handler attachment
    addKeyboardListener,
    removeKeyboardListener,

    // Cleanup
    destroy: () => {
      removeKeyboardListener();
      clickOutsideHandler.destroy?.();
    }
  };
}

/**
 * Simplified dropdown utility for basic use cases
 */
export function createSimpleDropdown(element: HTMLElement, options: {
  items: any[];
  onSelect: (item: any, index: number) => void;
  onClose?: () => void;
}) {
  let isOpen = false;
  let selectedIndex = -1;

  // Click outside handler
  const clickOutsideHandler = createClickOutside(element, () => {
    isOpen = false;
    selectedIndex = -1;
    options.onClose?.();
  });

  // Create keyboard navigation handler
  let keyboardNavHandler: any;

  // Initialize keyboard navigation
  onMount(() => {
    keyboardNavHandler = createEnhancedKeyboardNavigation(
      {
        dropdownType: 'custom' as const,
        selectedIndex: -1,
        items: options.items,
        onSelection: (item: any, index: number) => {
          options.onSelect(item, index);
          isOpen = false;
          selectedIndex = -1;
        },
        onClose: () => {
          isOpen = false;
          selectedIndex = -1;
          options.onClose?.();
        },
        onIndexChange: (index: number) => {} // Placeholder
      }
    );

    document.addEventListener('keydown', handleKeydown);
  });

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen || !keyboardNavHandler) return;
    keyboardNavHandler.handleKeydown(event);
  }

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    clickOutsideHandler.destroy?.();
  });

  return {
    open: () => {
      isOpen = true;
      selectedIndex = -1;
      if (keyboardNavHandler) keyboardNavHandler.resetSelection();
    },
    close: () => {
      isOpen = false;
      selectedIndex = -1;
      if (keyboardNavHandler) keyboardNavHandler.resetSelection();
    },
    toggle: () => {
      if (isOpen) {
        isOpen = false;
        selectedIndex = -1;
        if (keyboardNavHandler) keyboardNavHandler.resetSelection();
      } else {
        isOpen = true;
        selectedIndex = -1;
        if (keyboardNavHandler) keyboardNavHandler.resetSelection();
      }
    },
    getIsOpen: () => isOpen,
    getSelectedIndex: () => selectedIndex,
    setSelectedIndex: (index: number) => {
      selectedIndex = index;
      if (keyboardNavHandler) keyboardNavHandler.setSelectedIndex(index);
    }
  };
}

// Re-export for convenience
export { createClickOutside } from './clickOutside.js';
export { createKeyboardNavigation, createEnhancedKeyboardNavigation, createSimpleKeyboardNavigation } from './keyboardNavigation.js';
export { createDropdownManager, manageDropdown, manageEnhancedDropdown } from './dropdownManager.js';