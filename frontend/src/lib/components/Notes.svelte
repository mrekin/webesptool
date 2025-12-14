<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
  import { deviceDisplayInfo } from '$lib/stores';
  import { isNRF52Device, isESP32Device } from '$lib/utils/deviceTypeUtils.js';
  import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
  import { getAvailableDocuments } from '$lib/utils/markdown';

  // Local state
  let showMoreSection = $state(false);
  let showImportantNotes = $state(false);
  let showHowTo = $state(false);
  let availableDocuments = $state([]);

  // Subscribe to device display info
  let currentDeviceInfo = $derived($deviceDisplayInfo);

  // Reactive document loading from howto directory
  $effect(() => {
    // Always load documents, even when no device is selected
    loadDocuments();
  });

  async function loadDocuments() {
    try {
      // Load documents from howto directory with device type filtering
      const docs = await getAvailableDocuments('howto', currentDeviceInfo?.deviceType);
      availableDocuments = docs;
    } catch (error) {
      console.error('Failed to load documents:', error);
      availableDocuments = [];
    }
  }

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

  
  // Reactive build information and best practices using localization
  let buildInfo = $derived([
    {
      icon: '🏗️',
      title: $locales('notes.build_variants_title'),
      description: $locales('notes.build_variants_desc')
    },
    {
      icon: '🌍',
      title: $locales('notes.language_builds_title'),
      description: $locales('notes.language_builds_desc')
    },
    {
      icon: '🌙',
      title: $locales('notes.daily_builds_title'),
      description: $locales('notes.daily_builds_desc')
    },
    {
      icon: '⚙️',
      title: $locales('notes.custom_boards_title'),
      description: $locales('notes.custom_boards_desc'),
      link: 'https://github.com/mrekin/MeshtasticCustomBoards'
    },
    {
      icon: '📦',
      title: $locales('notes.source_code_title'),
      description: $locales('notes.source_code_desc'),
      link: 'https://github.com/meshtastic/firmware'
    }
  ]);

  let bestPractices = $derived([
    {
      icon: '💾',
      title: $locales('notes.backup_config_title'),
      description: $locales('notes.backup_config_desc')
    },
    {
      icon: '🔋',
      title: $locales('notes.battery_level_title'),
      description: $locales('notes.battery_level_desc')
    },
    {
      icon: '📡',
      title: $locales('notes.stable_connection_title'),
      description: $locales('notes.stable_connection_desc')
    },
    {
      icon: '🔄',
      title: $locales('notes.recovery_mode_title'),
      description: $locales('notes.recovery_mode_desc')
    },
    {
      icon: '📖',
      title: $locales('notes.read_documentation_title'),
      description: $locales('notes.read_documentation_desc')
    }
  ]);
</script>


  <!-- General Information Section -->
  <div class="p-4 bg-gray-800 border border-orange-600 rounded-lg">
    <!-- HowTo Section -->
    <div class="mb-6">
      <button
        onclick={toggleHowTo}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showHowTo}
        aria-controls="howto-content"
      >
        <h3 class="text-lg font-semibold text-orange-200 flex items-center">
          <span class="mr-2">📖</span>
          {$locales('notes.howto')}
        </h3>
        <span class="text-orange-300 transform transition-transform duration-200" style="transform: {showHowTo ? 'rotate(180deg)' : 'rotate(0deg)'}">
          ▼
        </span>
      </button>

      {#if showHowTo}
        <div id="howto-content" class="mt-3 space-y-4 animate-fade-in">
          {#if availableDocuments.length > 0}
            {#each availableDocuments as doc (doc)}
              <div class="text-orange-300 text-sm">
                <div class="prose prose-invert max-w-none">
                  <MarkdownRenderer filename={doc} hide={true} />
                </div>
              </div>
            {/each}
          {:else}
            <p>{$locales('notes.howto_coming_soon')}</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Notes Section -->
    <div class="mb-6">
      <button
        onclick={toggleImportantNotes}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showImportantNotes}
        aria-controls="important-notes-content"
      >
        <h3 class="text-lg font-semibold text-orange-200 flex items-center">
          <span class="mr-2">📝</span>
          {$locales('notes.notes')}
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
            {$locales('notes.build_info')}
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
        onclick={toggleMore}
        class="w-full flex items-center justify-between p-3 bg-orange-900 bg-opacity-30 border border-orange-600 rounded hover:bg-orange-900 bg-opacity-40 transition-colors text-left"
        aria-expanded={showMoreSection}
        aria-controls="more-content"
      >
        <h4 class="font-medium text-orange-200 flex items-center">
          <span class="mr-2">📋</span>
          {$locales('notes.more')}
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
              {$locales('notes.best_practices')}
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
              {$locales('notes.need_help')}
            </h5>
            <div class="space-y-2 text-sm text-orange-100">
              <p>
                {$locales('notes.if_encounter_issues')}
              </p>
              <ul class="list-disc list-inside space-y-1 ml-4">
                <li>{$locales('notes.check_compatibility')}</li>
                <li>{$locales('notes.verify_firmware_variant')}</li>
                <li>{$locales('notes.consult_documentation')}</li>
                <li>{$locales('notes.report_issues')}</li>
              </ul>
              <div class="mt-3 space-x-4">
                <a
                  href="https://github.com/mrekin/MeshtasticCustomBoards"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-sm"
                >
                  <span class="mr-2">🐛</span>
                  {$locales('notes.report_issue')}
                </a>
                <a
                  href="https://meshtastic.org/docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-sm ml-2"
                >
                  <span class="mr-2">📚</span>
                  {$locales('notes.documentation')}
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
        <span>{$locales('notes.firmware_build_service')}</span>
        <span>{$locales('notes.beta_version')}</span>
      </div>
      <div class="mt-2">
        <p>
          <strong>{$locales('notes.disclaimer')}:</strong> {$locales('notes.disclaimer_text')}
        </p>
        <p class="mt-1">
          {$locales('notes.terms_agreement')}
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