/**
 * Dropdown management utilities
 */

export type DropdownType = 'device' | 'version' | 'custom';
export type DropdownAction = 'open' | 'close' | 'toggle';

export interface DropdownState {
  isOpen: boolean;
  selectedIndex: number;
}

export interface DropdownOptions {
  saveFilter?: boolean;
  restoreFilter?: boolean;
  filterValue?: string;
  resetSelection?: boolean;
}

/**
 * Creates a dropdown manager for managing dropdown state
 */
export function createDropdownManager() {
  const dropdowns = new Map<DropdownType, DropdownState>();

  return {
    /**
     * Get dropdown state
     */
    getState: (type: DropdownType): DropdownState => {
      return dropdowns.get(type) || { isOpen: false, selectedIndex: -1 };
    },

    /**
     * Set dropdown state
     */
    setState: function(type: DropdownType, state: Partial<DropdownState>) {
      const current = this.getState(type);
      dropdowns.set(type, { ...current, ...state });
    },

    /**
     * Check if any dropdown is open
     */
    hasOpenDropdown: (): boolean => {
      return Array.from(dropdowns.values()).some(state => state.isOpen);
    },

    /**
     * Close all dropdowns
     */
    closeAll: function() {
      for (const [type] of dropdowns) {
        this.setState(type as DropdownType, { isOpen: false, selectedIndex: -1 });
      }
    },

    /**
     * Get all open dropdowns
     */
    getOpenDropdowns: (): DropdownType[] => {
      return Array.from(dropdowns.entries())
        .filter(([_, state]) => state.isOpen)
        .map(([type]) => type);
    }
  };
}

/**
 * Legacy dropdown management function (backward compatibility)
 * @param type - Type of dropdown
 * @param action - Action to perform
 * @param options - Additional options
 * @param setter - Function to set state (usually a Svelte setter)
 */
export function manageDropdown(
  type: DropdownType,
  action: DropdownAction,
  options: DropdownOptions = {},
  setter: (state: any) => void
) {
  switch (action) {
    case 'open':
      setter({
        isOpen: true,
        selectedIndex: options.resetSelection !== false ? -1 : 0
      });
      break;

    case 'close':
      setter({
        isOpen: false,
        selectedIndex: -1
      });
      break;

    case 'toggle':
      setter((currentState: { isOpen: boolean; selectedIndex: number }) => ({
        ...currentState,
        isOpen: !currentState.isOpen,
        selectedIndex: !currentState.isOpen ? -1 : currentState.selectedIndex
      }));
      break;
  }
}

/**
 * Enhanced dropdown management with filtering support
 */
export interface EnhancedDropdownOptions extends DropdownOptions {
  items?: any[];
  filter?: string;
  onFilterChange?: (filter: string) => void;
  onItemsChange?: (items: any[]) => void;
}

export function manageEnhancedDropdown(
  type: DropdownType,
  action: DropdownAction,
  options: EnhancedDropdownOptions = {},
  setter: (state: any) => void
) {
  switch (type) {
    case 'device':
      switch (action) {
        case 'open':
          setter({
            isOpen: true,
            selectedIndex: -1,
            filter: options.saveFilter ? options.filter : '',
            filteredItems: options.items
          });
          break;

        case 'close':
          setter({
            isOpen: false,
            selectedIndex: -1,
            filter: options.restoreFilter ? options.filter : ''
          });
          break;

        case 'toggle':
          setter((currentState: { isOpen: boolean; selectedIndex: number; filter?: string; filteredItems?: any[] }) => ({
            ...currentState,
            isOpen: !currentState.isOpen,
            selectedIndex: !currentState.isOpen ? -1 : currentState.selectedIndex,
            filter: !currentState.isOpen && options.saveFilter ? options.filter : ''
          }));
          break;
      }
      break;

    case 'version':
      switch (action) {
        case 'open':
          setter({
            isOpen: true,
            selectedIndex: -1
          });
          break;

        case 'close':
          setter({
            isOpen: false,
            selectedIndex: -1
          });
          break;

        case 'toggle':
          setter((currentState: { isOpen: boolean; selectedIndex: number; filter?: string; filteredItems?: any[] }) => ({
            ...currentState,
            isOpen: !currentState.isOpen,
            selectedIndex: !currentState.isOpen ? -1 : currentState.selectedIndex
          }));
          break;
      }
      break;

    default:
      // Basic dropdown management for custom types
      manageDropdown(type, action, options, setter);
      break;
  }
}