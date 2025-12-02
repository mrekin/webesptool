<script lang="ts">
  import { uiState } from '$lib/stores';

  // Local state
  let showSecurityWarning = true;

  // Subscribe to stores
  $: showSecurityWarningStore = $uiState.showSecurityWarning;

  // Update local state when store changes
  $: {
    showSecurityWarning = showSecurityWarningStore;
  }

  // Dismiss security warning
  function dismissWarning() {
    showSecurityWarning = false;
    // This would update the store in a real implementation
    if (typeof uiState.subscribe === 'function') {
      // For now, just update local state
    }
  }

  // Security warning content
  const securityWarnings = [
    {
      icon: '⚠️',
      title: 'Unofficial Builds',
      description: 'These are not official Meshtastic firmware builds and are not supported by the Meshtastic project.',
      type: 'critical'
    },
    {
      icon: '🔬',
      title: 'Development Use Only',
      description: 'These builds are intended for testing and development purposes, not production use.',
      type: 'warning'
    },
    {
      icon: '🚨',
      title: 'Use at Your Own Risk',
      description: 'Installing unofficial firmware may void your warranty and could potentially damage your device.',
      type: 'critical'
    }
  ];

  // Build information
  const buildInfo = [
    {
      icon: '🏗️',
      title: 'Build Variants',
      description: 'Not all board-version combinations are built. Open an issue on GitHub to request specific variants.'
    },
    {
      icon: '🌍',
      title: 'Language Builds',
      description: 'Builds with "-ru" include Russian language support. Similar patterns exist for other languages.'
    },
    {
      icon: '🌙',
      title: 'Daily Builds',
      description: 'Builds ending in ".daily" are created from master branch, built 4 times daily at 5:00, 11:00, 17:00, 23:00 GMT.'
    },
    {
      icon: '⚙️',
      title: 'Custom Boards',
      description: 'Custom board configurations are available. Submit issues or PRs via GitHub.',
      link: 'https://github.com/mrekin/MeshtasticCustomBoards'
    },
    {
      icon: '📦',
      title: 'Source Code',
      description: 'Firmware is built from official Meshtastic source with only build/variant modifications applied.',
      link: 'https://github.com/meshtastic/firmware'
    }
  ];

  // Best practices
  const bestPractices = [
    {
      icon: '💾',
      title: 'Backup Configuration',
      description: 'Always backup your device configuration before flashing new firmware.'
    },
    {
      icon: '🔋',
      title: 'Battery Level',
      description: 'Ensure your device has sufficient battery charge or is connected to power during installation.'
    },
    {
      icon: '📡',
      title: 'Stable Connection',
      description: 'Maintain a stable USB connection throughout the firmware installation process.'
    },
    {
      icon: '🔄',
      title: 'Recovery Mode',
      description: 'Know how to enter recovery/bootloader mode for your specific device model.'
    },
    {
      icon: '📖',
      title: 'Read Documentation',
      description: 'Consult your device documentation for specific installation instructions and requirements.'
    }
  ];
</script>

  <!-- Security Warning Section -->
  {#if showSecurityWarning}
    <div class="mb-6 p-4 bg-red-900 bg-opacity-30 border border-red-600 rounded-lg">
      <div class="flex items-start justify-between mb-3">
        <h3 class="text-lg font-semibold text-red-200 flex items-center">
          <span class="mr-2">🚨</span>
          Security & Warning Notice
        </h3>
        <button
          on:click={dismissWarning}
          class="text-red-300 hover:text-red-200 p-1 rounded transition-colors"
          aria-label="Dismiss warning"
        >
          ✕
        </button>
      </div>

      <div class="space-y-3">
        {#each securityWarnings as warning}
          <div class="flex items-start space-x-3 p-3 bg-red-800 bg-opacity-20 rounded border border-red-700">
            <span class="text-xl flex-shrink-0 mt-1">{warning.icon}</span>
            <div class="flex-1">
              <h4 class="font-medium text-red-200 mb-1">{warning.title}</h4>
              <p class="text-red-300 text-sm">{warning.description}</p>
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-4 p-3 bg-red-800 bg-opacity-40 border border-red-700 rounded">
        <p class="text-red-200 font-medium text-center">
          <strong>IMPORTANT:</strong> By proceeding with firmware installation, you acknowledge and accept these risks.
        </p>
      </div>
    </div>
  {/if}

  <!-- General Information Section -->
  <div class="p-4 bg-gray-800 border border-orange-600 rounded-lg">
    <h3 class="text-lg font-semibold text-orange-200 mb-4 flex items-center">
      <span class="mr-2">📝</span>
      Important Information
    </h3>

    <!-- Build Information -->
    <div class="mb-6">
      <h4 class="font-medium text-orange-200 mb-3 flex items-center">
        <span class="mr-2">🏗️</span>
        Build Information
      </h4>
      <div class="space-y-3 text-sm text-orange-100">
        {#each buildInfo as info}
          <div class="flex items-start space-x-3">
            <span class="text-base flex-shrink-0 mt-0.5">{info.icon}</span>
            <div class="flex-1">
              <h5 class="font-medium text-orange-200 mb-1">{info.title}</h5>
              <p class="text-orange-300">{info.description}</p>
              {#if info.link}
                <a
                  href={info.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-orange-400 hover:text-orange-300 underline text-xs mt-1 inline-block"
                >
                  🔗 View on GitHub
                </a>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Best Practices -->
    <div class="mb-6">
      <h4 class="font-medium text-orange-200 mb-3 flex items-center">
        <span class="mr-2">✅</span>
        Best Practices
      </h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-orange-100">
        {#each bestPractices as practice}
          <div class="flex items-start space-x-3 p-3 bg-orange-900 bg-opacity-20 rounded border border-orange-700">
            <span class="text-base flex-shrink-0 mt-0.5">{practice.icon}</span>
            <div class="flex-1">
              <h5 class="font-medium text-orange-200 mb-1">{practice.title}</h5>
              <p class="text-orange-300">{practice.description}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Help and Support -->
    <div class="p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded">
      <h4 class="font-medium text-orange-200 mb-2 flex items-center">
        <span class="mr-2">💬</span>
        Need Help?
      </h4>
      <div class="space-y-2 text-sm text-orange-100">
        <p>
          If you encounter issues with these firmware builds, please:
        </p>
        <ul class="list-disc list-inside space-y-1 ml-4">
          <li>Check the device compatibility list</li>
          <li>Verify you're using the correct firmware variant</li>
          <li>Consult the official Meshtastic documentation</li>
          <li>Report issues on the relevant GitHub repository</li>
        </ul>
        <div class="mt-3 space-x-4">
          <a
            href="https://github.com/meshtastic/firmware/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-sm"
          >
            <span class="mr-2">🐛</span>
            Report Issue
          </a>
          <a
            href="https://meshtastic.org/docs/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-sm ml-2"
          >
            <span class="mr-2">📚</span>
            Documentation
          </a>
        </div>
      </div>
    </div>

    <!-- Version Information -->
    <div class="mt-4 text-xs text-orange-400 border-t border-orange-700 pt-3">
      <div class="flex justify-between items-center">
        <span>Firmware build service</span>
        <span>Beta version - Use at your own risk</span>
      </div>
      <div class="mt-2">
        <p>
          <strong>Disclaimer:</strong> This service is provided as-is without any warranty. The developers are not responsible for any damage to devices or data loss.
        </p>
        <p class="mt-1">
          By using this service, you agree to these terms and acknowledge the risks involved.
        </p>
      </div>
    </div>
  </div>

<style>
  /* Custom styles for the notes component */
  .animate-fade-in {
    animation: fadeIn 0.5s ease-out forwards;
  }

  /* Ensure proper text wrapping for long content */
  .text-wrap {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* Icon animation for attention */
  @keyframes pulse-gentle {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05);
    }
  }

  .pulse-gentle {
    animation: pulse-gentle 2s ease-in-out infinite;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .md\\:grid-cols-2 {
      grid-template-columns: 1fr;
    }
  }
</style>