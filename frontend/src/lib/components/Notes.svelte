<script lang="ts">
  // Local state
  let showMoreSection = false;
  let showImportantNotes = false;
  let showHowTo = false;

  // Toggle more section
  function toggleMore() {
    showMoreSection = !showMoreSection;
  }

  // Toggle important notes
  function toggleImportantNotes() {
    showImportantNotes = !showImportantNotes;
  }

  // Toggle how to section
  function toggleHowTo() {
    showHowTo = !showHowTo;
  }

  
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


  <!-- General Information Section -->
  <div class="p-4 bg-gray-800 border border-orange-600 rounded-lg">
    <!-- HowTo Section -->
    <div class="mb-6">
      <button
        on:click={toggleHowTo}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showHowTo}
        aria-controls="howto-content"
      >
        <h3 class="text-lg font-semibold text-orange-200 flex items-center">
          <span class="mr-2">📖</span>
          HowTo
        </h3>
        <span class="text-orange-300 transform transition-transform duration-200" style="transform: {showHowTo ? 'rotate(180deg)' : 'rotate(0deg)'}">
          ▼
        </span>
      </button>

      {#if showHowTo}
        <div id="howto-content" class="mt-3 space-y-4 animate-fade-in">
          <!-- Content will be added later -->
          <div class="text-orange-300 text-sm">
            <p>HowTo content coming soon...</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Notes Section -->
    <div class="mb-6">
      <button
        on:click={toggleImportantNotes}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showImportantNotes}
        aria-controls="important-notes-content"
      >
        <h3 class="text-lg font-semibold text-orange-200 flex items-center">
          <span class="mr-2">📝</span>
          Notes
        </h3>
        <span class="text-orange-300 transform transition-transform duration-200" style="transform: {showImportantNotes ? 'rotate(180deg)' : 'rotate(0deg)'}">
          ▼
        </span>
      </button>

      {#if showImportantNotes}
      <div id="important-notes-content" class="space-y-6 animate-fade-in">
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
      </div>
    {/if}
    </div>

    <!-- More Section (Best Practices + Need Help) -->
    <div class="mb-6">
      <button
        on:click={toggleMore}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showMoreSection}
        aria-controls="more-content"
      >
        <h4 class="font-medium text-orange-200 flex items-center">
          <span class="mr-2">📋</span>
          More..
        </h4>
        <span class="text-orange-300 transform transition-transform duration-200" style="transform: {showMoreSection ? 'rotate(180deg)' : 'rotate(0deg)'}">
          ▼
        </span>
      </button>

      {#if showMoreSection}
        <div id="more-content" class="mt-3 space-y-4 animate-fade-in">
          <!-- Best Practices -->
          <div>
            <h5 class="font-medium text-orange-200 mb-3 flex items-center">
              <span class="mr-2">✅</span>
              Best Practices
            </h5>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-orange-100">
              {#each bestPractices as practice}
                <div class="flex items-start space-x-3 p-3 bg-orange-900 bg-opacity-20 rounded border border-orange-700">
                  <span class="text-base flex-shrink-0 mt-0.5">{practice.icon}</span>
                  <div class="flex-1">
                    <h6 class="font-medium text-orange-200 mb-1">{practice.title}</h6>
                    <p class="text-orange-300">{practice.description}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Help and Support -->
          <div class="p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded">
            <h5 class="font-medium text-orange-200 mb-2 flex items-center">
              <span class="mr-2">💬</span>
              Need Help?
            </h5>
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
        </div>
      {/if}
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