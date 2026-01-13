<script lang="ts">
  // Removed background image loading logic

  // State for keyboard navigation
  let isKeyboardNavigation = false;

  // Handle keyboard navigation for accessibility
  function handleKeydown(event: KeyboardEvent) {
    // ESC key closes any modals/dialogs
    if (event.key === 'Escape') {
      const openDialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      if (openDialog) {
        openDialog.close();
      }
    }

    // Tab navigation enhancement
    if (event.key === 'Tab') {
      // Add custom tab behavior if needed
      isKeyboardNavigation = true;
    }
  }

  // Remove keyboard navigation class when using mouse
  function handleMouseDown() {
    isKeyboardNavigation = false;
  }

  // Reactive statement to update body class
  $: if (typeof document !== 'undefined') {
    if (isKeyboardNavigation) {
      document.body.classList.add('keyboard-navigation');
    } else {
      document.body.classList.remove('keyboard-navigation');
    }
  }
</script>

<svelte:head>
  <!-- Viewport and theme -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#615353" />
</svelte:head>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="min-h-screen bg-gray-900"
  role="application"
  on:keydown={handleKeydown}
  on:mousedown={handleMouseDown}
>

  <!-- Main container with proper spacing and structure -->
  <div class="relative z-10 min-h-screen flex flex-col">
    <!-- Skip to main content for accessibility -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-orange-600 text-white px-4 py-2 rounded-md"
    >
      Skip to main content
    </a>

    <!-- Header section -->
    <header class="w-full border-b border-orange-800 bg-gray-900 bg-opacity-90 backdrop-blur-sm">
      <div class="container mx-auto px-4 py-6">
        <slot name="head"></slot>
      </div>
    </header>

    <!-- Main content area -->
    <main id="main-content" class="flex-grow container mx-auto px-4 py-8">
      <div class="max-w-7xl mx-auto">
        <slot name="content"></slot>
      </div>
    </main>

    <!-- Footer section -->
    <footer class="w-full border-t border-orange-800 bg-gray-900 bg-opacity-90 backdrop-blur-sm mt-auto">
      <div class="container mx-auto px-4 py-6">
        <slot name="footer"></slot>
      </div>
    </footer>
  </div>

  </div>

<style>
  /* Global styles */
  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #615353;
  }

  /* Focus styles for accessibility */
  :global(.keyboard-navigation *:focus) {
    outline: 2px solid #fb923c;
    outline-offset: 2px;
  }

  /* Screen reader only class */
  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  :global(.focus\\:not-sr-only) {
    position: static;
    width: auto;
    height: auto;
    padding: inherit;
    margin: inherit;
    overflow: visible;
    clip: auto;
    white-space: inherit;
  }

  /* Custom animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideIn {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  
  /* Improved scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  ::-webkit-scrollbar-thumb {
    background: #d8690e;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #b85807;
  }

  /* Firefox scrollbar */
  * {
    scrollbar-width: thin;
    scrollbar-color: #d8690e rgba(0, 0, 0, 0.1);
  }

  /* Container max-widths */
  .container {
    max-width: 1280px;
  }

  @media (max-width: 640px) {
    .container {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }

  /* Print styles */
  @media print {
    :global(body) {
      background: white;
      color: black;
    }

    
    /* Ensure text is readable */
    .bg-opacity-90 {
      background-color: transparent !important;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    :root {
      --border-color: #ffffff;
      --text-color: #ffffff;
      --bg-color: #000000;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Dark mode improvements */
  @media (prefers-color-scheme: dark) {
    :global(body) {
      color-scheme: dark;
    }
  }
</style>