# Dropdown Utilities

Набор универсальных утилит для управления dropdown компонентами в Svelte приложениях.

## Установка и импорт

```typescript
import {
  createClickOutside,
  createKeyboardNavigation,
  createDropdownUtils
} from '$lib/utils';
```

## Основные компоненты

### 1. Click Outside Handler

Обрабатывает клики вне указанного элемента.

```typescript
import { createClickOutside } from '$lib/utils';

function handleClickOutside() {
  console.log('Clicked outside!');
}

// Использование в Svelte компоненте
const element = document.getElementById('my-element');
createClickOutside(element, handleClickOutside);

// С исключением определенных элементов
createClickOutside(element, handleClickOutside, '.dropdown-list');
```

### 2. Keyboard Navigation

Универсальная клавиатурная навигация для dropdown списков.

```typescript
import { createKeyboardNavigation } from '$lib/utils';

const config = {
  items: ['Item 1', 'Item 2', 'Item 3'],
  selectedIndex: -1,
  onSelection: (item, index) => console.log('Selected:', item),
  onClose: () => console.log('Closed'),
  onIndexChange: (index) => console.log('Index changed:', index)
};

const handleKeydown = createKeyboardNavigation(config);

// В Svelte компоненте
<svelte:window on:keydown={handleKeydown} />
```

### 3. Complete Dropdown Utils

Комплексное решение для управления dropdown.

```typescript
import { createDropdownUtils } from '$lib/utils';

// В Svelte компоненте
let element: HTMLElement;

onMount(() => {
  const dropdown = createDropdownUtils({
    element,
    dropdownType: 'custom',
    items: ['Option 1', 'Option 2'],
    selectedIndex: -1,
    onSelection: (item, index) => {
      // Обработка выбора
    },
    onClose: () => {
      // Обработка закрытия
    },
    onIndexChange: (index) => {
      // Обработка изменения индекса
    }
  });

  // Управление состоянием
  dropdown.open();
  dropdown.close();
  dropdown.toggle();
});
```

### 4. Simple Dropdown

Упрощенная версия для базовых dropdown компонентов.

```typescript
import { createSimpleDropdown } from '$lib/utils';

const dropdown = createSimpleDropdown(element, {
  items: ['Item 1', 'Item 2', 'Item 3'],
  onSelect: (item, index) => console.log('Selected:', item),
  onClose: () => console.log('Closed')
});

dropdown.open();
dropdown.close();
dropdown.toggle();
```

## Пример использования в Svelte компоненте

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createDropdownUtils } from '$lib/utils';

  let element: HTMLElement;
  let isOpen = false;
  let selectedIndex = -1;

  const items = ['Option 1', 'Option 2', 'Option 3'];

  onMount(() => {
    const dropdown = createDropdownUtils({
      element,
      dropdownType: 'custom',
      items,
      selectedIndex,
      onSelection: (item, index) => {
        console.log('Selected:', item);
        isOpen = false;
        selectedIndex = -1;
      },
      onClose: () => {
        console.log('Dropdown closed');
        isOpen = false;
        selectedIndex = -1;
      },
      onStateChange: (open, index) => {
        isOpen = open;
        selectedIndex = index;
      }
    });
  });

  function toggleDropdown() {
    isOpen = !isOpen;
    if (!isOpen) selectedIndex = -1;
  }
</script>

<div bind:this={element}>
  <button on:click={toggleDropdown}>
    Toggle Dropdown
  </button>

  {#if isOpen}
    <div class="dropdown-list">
      {#each items as item, i}
        <div
          class:item-selected={selectedIndex === i}
          on:click={() => dropdown.select(item, i)}
        >
          {item}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

## Интеграция с существующими компонентами

Утилиты спроектированы для постепенной миграции. Существующие компоненты могут использовать утилитарные функции постепенно:

```typescript
// Постепенная миграция с существующего кода
import { createClickOutside } from '$lib/utils';

// Замена существующего handleClickOutside
function handleClickOutside(event: MouseEvent) {
  // Старая логика...
}

// Новая версия с утилитой
const element = document.getElementById('my-dropdown');
createClickOutside(element, handleClickOutside, '.dropdown-list');
```

## Типы и интерфейсы

```typescript
interface KeyboardNavigationConfig {
  items: any[];
  selectedIndex: number;
  onSelection: (item: any, index: number) => void;
  onClose?: () => void;
  onIndexChange?: (index: number) => void;
  enabled?: boolean;
}

interface DropdownUtilsConfig extends KeyboardNavigationConfig {
  element: HTMLElement;
  excludeSelector?: string;
  onStateChange?: (isOpen: boolean, selectedIndex: number) => void;
}
```

## Преимущества

- **Универсальность**: Работает с любыми dropdown компонентами
- **Типизация**: Полная TypeScript поддержка
- **Доступность**: Поддержка клавиатурной навигации и ARIA атрибутов
- **Производительность**: Оптимизированные обработчики событий
- **Совместимость**: Легкая интеграция с существующим кодом