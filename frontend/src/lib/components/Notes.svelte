<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { deviceDisplayInfo } from '$lib/stores.js';
    import { isNRF52Device, isESP32Device } from '$lib/utils/deviceTypeUtils.js';
    import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
    import { getAvailableDocuments } from '$lib/utils/markdown.js';
    import { EXTERNAL_LINKS } from '$lib/utils/externalLinks.js';

    // Local state
    let showMoreSection = $state(false);
    let showImportantNotes = $state(false);
    let showHowTo = $state(false);
    let availableDocuments = $state<string[]>([]);

    // Tab management
    let activeTab = $state<'recommendations' | 'links'>('recommendations');

    function setActiveTab(tab: 'recommendations' | 'links') {
        activeTab = tab;
    }

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
            const docs: string[] = await getAvailableDocuments(
                'howto',
                currentDeviceInfo?.deviceType
            );
            availableDocuments = docs as string[];
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

    // Useful links data
    let usefulLinks = $derived([
        {
            url: EXTERNAL_LINKS.USEFUL_LINKS.MALLA_MESHWORKS,
            title: $locales('notes.links.malla_title'),
            description: $locales('notes.links.malla_desc'),
            icon: '🗺️'
        },
        {
            url: EXTERNAL_LINKS.USEFUL_LINKS.VOTETOVID,
            title: $locales('notes.links.votetovid_title'),
            description: $locales('notes.links.votetovid_desc'),
            icon: '🗳️'
        },
        {
            url: EXTERNAL_LINKS.USEFUL_LINKS.HEYWHATSTHAT,
            title: $locales('notes.links.heywhatsthat_title'),
            description: $locales('notes.links.heywhatsthat_desc'),
            icon: '🏔️'
        }
    ]);
</script>

<!-- General Information Section -->
<div class="rounded-lg border border-orange-600 bg-gray-800 p-4">
    <!-- HowTo Section -->
    <div class="mb-6">
        <button
            onclick={toggleHowTo}
            class="flex w-full items-center justify-between rounded border border-orange-600 bg-orange-900/30 p-3 text-left transition-all duration-300 hover:border-orange-500 hover:bg-orange-900/50"
            aria-expanded={showHowTo}
            aria-controls="howto-content"
        >
            <h3 class="flex items-center text-lg font-semibold text-orange-200">
                <span class="mr-2">📖</span>
                {$locales('notes.howto')}
            </h3>
            <span
                class="transform text-orange-300 transition-transform duration-300"
                style="transform: {showHowTo ? 'rotate(180deg)' : 'rotate(0deg)'}"
            >
                ▼
            </span>
        </button>

        {#if showHowTo}
            <div id="howto-content" class="animate-fade-in mt-3 space-y-4">
                {#if availableDocuments.length > 0}
                    {#each availableDocuments as doc (doc)}
                        <div class="text-sm text-orange-300">
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
            class="flex w-full items-center justify-between rounded border border-orange-600 bg-orange-900/30 p-3 text-left transition-all duration-300 hover:border-orange-500 hover:bg-orange-900/50"
            aria-expanded={showImportantNotes}
            aria-controls="important-notes-content"
        >
            <h3 class="flex items-center text-lg font-semibold text-orange-200">
                <span class="mr-2">📝</span>
                {$locales('notes.notes')}
            </h3>
            <span
                class="transform text-orange-300 transition-transform duration-300"
                style="transform: {showImportantNotes ? 'rotate(180deg)' : 'rotate(0deg)'}"
            >
                ▼
            </span>
        </button>

        {#if showImportantNotes}
            <div id="important-notes-content" class="animate-fade-in space-y-6">
                <!-- Build Information -->
                <div class="mb-6">
                    <h4 class="mb-3 flex items-center font-medium text-orange-200">
                        <span class="mr-2">🏗️</span>
                        {$locales('notes.build_info')}
                    </h4>
                    <div class="space-y-3 text-sm text-orange-100">
                        {#each buildInfo as info}
                            <div class="flex items-start space-x-3">
                                <span class="mt-0.5 flex-shrink-0 text-base">{info.icon}</span>
                                <div class="flex-1">
                                    <h5 class="mb-1 font-medium text-orange-200">{info.title}</h5>
                                    <p class="text-orange-300">{info.description}</p>
                                    {#if info.link}
                                        <a
                                            href={info.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="mt-1 inline-block text-xs text-orange-400 underline hover:text-orange-300"
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
            class="flex w-full items-center justify-between rounded border border-orange-600 bg-orange-900/30 p-3 text-left transition-all duration-300 hover:border-orange-500 hover:bg-orange-900/50"
            aria-expanded={showMoreSection}
            aria-controls="more-content"
        >
            <h4 class="flex items-center font-medium text-orange-200">
                <span class="mr-2">📋</span>
                {$locales('notes.more')}
            </h4>
            <span
                class="transform text-orange-300 transition-transform duration-300"
                style="transform: {showMoreSection ? 'rotate(180deg)' : 'rotate(0deg)'}"
            >
                ▼
            </span>
        </button>

        {#if showMoreSection}
            <div id="more-content" class="animate-fade-in mt-3 space-y-4">
                <!-- Tabs Header -->
                <div class="mb-4 flex border-b border-orange-600">
                    <button
                        onclick={() => setActiveTab('recommendations')}
                        class="px-4 py-2 text-sm font-medium transition-colors duration-200
                     {activeTab === 'recommendations'
                            ? 'border-b-2 border-orange-500 text-orange-200'
                            : 'text-orange-400 hover:text-orange-300'}"
                        aria-selected={activeTab === 'recommendations'}
                        role="tab"
                    >
                        {$locales('notes.recommendations_tab')}
                    </button>
                    <button
                        onclick={() => setActiveTab('links')}
                        class="px-4 py-2 text-sm font-medium transition-colors duration-200
                     {activeTab === 'links'
                            ? 'border-b-2 border-orange-500 text-orange-200'
                            : 'text-orange-400 hover:text-orange-300'}"
                        aria-selected={activeTab === 'links'}
                        role="tab"
                    >
                        {$locales('notes.links_tab')}
                    </button>
                </div>

                <!-- Tab Content: Recommendations -->
                {#if activeTab === 'recommendations'}
                    <div role="tabpanel" aria-labelledby="tab-recommendations">
                        <!-- Best Practices -->
                        <div>
                            <h5 class="mb-3 flex items-center font-medium text-orange-200">
                                <span class="mr-2">✅</span>
                                {$locales('notes.best_practices')}
                            </h5>
                            <div
                                class="grid grid-cols-1 gap-3 text-sm text-orange-100 md:grid-cols-2"
                            >
                                {#each bestPractices as practice}
                                    <div
                                        class="flex items-start space-x-3 rounded border border-orange-500 bg-gray-800 p-3"
                                    >
                                        <span class="mt-0.5 flex-shrink-0 text-base"
                                            >{practice.icon}</span
                                        >
                                        <div class="flex-1">
                                            <h6 class="mb-1 font-medium text-orange-200">
                                                {practice.title}
                                            </h6>
                                            <p class="text-orange-300">{practice.description}</p>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <!-- Help and Support -->
                        <div class="mt-4 rounded border border-orange-600 bg-orange-900/30 p-3">
                            <h5 class="mb-2 flex items-center font-medium text-orange-200">
                                <span class="mr-2">💬</span>
                                {$locales('notes.need_help')}
                            </h5>
                            <div class="space-y-2 text-sm text-orange-100">
                                <p>
                                    {$locales('notes.if_encounter_issues')}
                                </p>
                                <ul class="ml-4 list-inside list-disc space-y-1">
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
                                        class="inline-flex items-center rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                                        style="color: white !important;"
                                    >
                                        <span class="mr-2">🐛</span>
                                        {$locales('notes.report_issue')}
                                    </a>
                                    <a
                                        href="https://meshtastic.org/docs/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="ml-2 inline-flex items-center rounded-md bg-gray-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                                        style="color: white !important;"
                                    >
                                        <span class="mr-2">📚</span>
                                        {$locales('notes.documentation')}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Tab Content: Links -->
                {#if activeTab === 'links'}
                    <div role="tabpanel" aria-labelledby="tab-links">
                        <div
                            class="grid grid-cols-1 gap-3 text-sm text-orange-100 md:grid-cols-2 lg:grid-cols-3"
                        >
                            {#each usefulLinks as link}
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="group flex flex-col items-start space-y-2 rounded border border-orange-500 bg-gray-800 p-4 transition-all duration-200 hover:border-orange-400 hover:bg-gray-700"
                                >
                                    <div class="flex w-full items-center space-x-2">
                                        <span class="flex-shrink-0 text-2xl">{link.icon}</span>
                                        <h6
                                            class="font-medium text-orange-200 transition-colors group-hover:text-orange-100"
                                        >
                                            {link.title}
                                        </h6>
                                    </div>
                                    {#if link.description}
                                        <p class="line-clamp-2 text-xs text-orange-300">
                                            {link.description}
                                        </p>
                                    {/if}
                                </a>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Version Information -->
    <div class="mt-4 border-t border-orange-500 pt-3 text-xs text-orange-400">
        <div class="flex items-center justify-between">
            <span>{$locales('notes.firmware_build_service')}</span>
            <span>{$locales('notes.beta_version')}</span>
        </div>
        <div class="mt-2">
            <p>
                <strong>{$locales('notes.disclaimer')}:</strong>
                {$locales('notes.disclaimer_text')}
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

    /* Icon animation for attention */
    @keyframes pulse-gentle {
        0%,
        100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.8;
            transform: scale(1.05);
        }
    }
</style>
