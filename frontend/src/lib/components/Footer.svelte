<script lang="ts">
    import { _ as locales, locale } from 'svelte-i18n';
    import type { FooterLink } from '$lib/types';
    import { appVersion } from '$lib/utils/envVariables.js';
    import { EXTERNAL_LINKS } from '$lib/utils/externalLinks';

    // Local state
    let currentYear = new Date().getFullYear();

    // Reactive footer links data using localization
    $: mainLinks = [
        {
            name: $locales('footer.meshtastic_name'),
            href: EXTERNAL_LINKS.MESHTASTIC.MAIN,
            description: $locales('footer.meshtastic_desc')
        },
        {
            name: $locales('footer.meshcore_name'),
            href: EXTERNAL_LINKS.OTHER.MESHCORE,
            description: $locales('footer.meshcore_desc')
        },
        {
            name: $locales('footer.documentation_name'),
            href: EXTERNAL_LINKS.MESHTASTIC.DOCS,
            description: $locales('footer.documentation_desc')
        },
        {
            name: $locales('footer.community_name'),
            href: EXTERNAL_LINKS.MESHTASTIC.DISCOURSE,
            description: $locales('footer.community_desc'),
            langFilter: 'en,pl'
        },
        {
            name: $locales('footer.mrekin_github_name'),
            href: EXTERNAL_LINKS.GITHUB.MREKIN_BOARDS,
            description: $locales('footer.mrekin_github_desc')
        },
        {
            name: $locales('footer.github_name'),
            href: EXTERNAL_LINKS.GITHUB.MESHTASTIC_FIRMWARE,
            description: $locales('footer.github_desc')
        },
        {
            name: $locales('footer.takemeacoffee_name'),
            href: EXTERNAL_LINKS.DONATION.YOOMONEY,
            description: $locales('footer.takemeacoffee_desc'),
            langFilter: 'ru' // Show only for Russian locale
        }
    ];

    // Reactive filtering based on current locale
    $: filteredMainLinks = mainLinks.filter((link) => {
        // If langFilter is not specified or empty - show for all languages
        if (!link.langFilter) return true;
        const trimmedFilter = link.langFilter.trim();
        if (trimmedFilter === '') return true;

        // Check if current locale is in the allowed list
        const allowedLocales = trimmedFilter.split(',');
        return $locale !== null && allowedLocales.includes($locale as string);
    }) as FooterLink[];

    $: toolLinks = [
        {
            name: $locales('footer.meshtastic_flasher_name'),
            href: EXTERNAL_LINKS.MESHTASTIC.FLASHER,
            description: $locales('footer.meshtastic_flasher_desc')
        },
        {
            name: $locales('footer.esp_web_tools_name'),
            href: EXTERNAL_LINKS.GITHUB.ESPRESSIF_ESPTOOL,
            description: $locales('footer.esp_web_tools_desc')
        }
    ];

    $: mirrorLinks = [
        {
            name: $locales('footer.primary_mirror_name'),
            href: EXTERNAL_LINKS.MIRRORS.PRIMARY_1,
            description: $locales('footer.primary_mirror_desc')
        },
        {
            name: $locales('footer.primary_mirror_name'),
            href: EXTERNAL_LINKS.MIRRORS.PRIMARY_2,
            description: $locales('footer.primary_mirror_desc')
        },
        {
            name: $locales('footer.european_mirror_name'),
            href: EXTERNAL_LINKS.MIRRORS.EUROPEAN,
            description: $locales('footer.european_mirror_desc')
        }
    ];

    function formatLink(link: any) {
        return {
            ...link,
            formattedName: link.name.replace(/\s+/g, '-').toLowerCase()
        };
    }
</script>

<footer
    class="bg-opacity-90 mt-auto w-full border-t border-orange-600 bg-gray-900 backdrop-blur-sm"
>
    <!-- Main footer content -->
    <div class="container mx-auto px-4 py-8">
        <!-- Top section with main links -->
        <div class="mb-8">
            <div class="flex flex-wrap justify-center gap-4 sm:gap-6 lg:gap-8">
                {#each filteredMainLinks as link}
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="group hover:bg-opacity-50 flex min-w-[120px] flex-col items-center rounded-lg p-3 text-center transition-all duration-200 hover:bg-gray-800 sm:min-w-[140px]"
                        title={link.description}
                    >
                        <span
                            class="text-sm font-medium text-orange-200 transition-colors group-hover:text-orange-100 sm:text-base"
                        >
                            {link.name}
                        </span>
                        <span
                            class="mt-1 line-clamp-2 max-w-[120px] text-xs text-orange-400 transition-colors group-hover:text-orange-300 sm:max-w-[140px]"
                        >
                            {link.description}
                        </span>
                    </a>
                {/each}
            </div>
        </div>

        <!-- Tools and Mirrors section -->
        <div class="mb-8">
            <div class="mb-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <!-- Tools column -->
                <div>
                    <h3 class="mb-2 flex items-center text-sm font-semibold text-orange-200">
                        <span class="mr-2">🛠️</span>
                        {$locales('footer.development_tools')}
                    </h3>
                    <p class="mb-3 text-xs text-orange-300">
                        {$locales('footer.installer_description')}
                    </p>
                </div>
                <!-- Mirrors column -->
                <div>
                    <h3 class="mb-2 flex items-center text-sm font-semibold text-orange-200">
                        <span class="mr-2">🌐</span>
                        {$locales('footer.service_mirrors')}
                    </h3>
                    <p class="mb-3 text-xs text-orange-300">
                        {$locales('footer.alternative_endpoints')}
                    </p>
                </div>
            </div>

            <!-- Combined cards row -->
            <div class="flex flex-wrap justify-center gap-2 sm:gap-3">
                {#each [...toolLinks, ...mirrorLinks] as link}
                    <div
                        class="min-w-[180px] flex-1 rounded border border-orange-500 bg-gray-800 p-2 transition-all duration-200 hover:bg-gray-700 sm:min-w-[200px]"
                    >
                        <h4 class="mb-1 truncate text-xs font-medium text-orange-200">
                            {link.name}
                        </h4>
                        <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="block truncate text-xs break-all text-orange-400 underline hover:text-orange-200 hover:text-orange-300"
                            title={link.description}
                        >
                            {link.href}
                        </a>
                        <p class="mt-1 line-clamp-1 text-xs text-orange-400">{link.description}</p>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-orange-600 pt-8">
            <!-- Bottom section with legal and info -->
            <div class="grid grid-cols-1 gap-8 md:grid-cols-3"></div>

            <!-- Copyright and credits -->
            <div class="mt-8 border-t border-orange-600 pt-6">
                <div class="space-y-2 text-center text-sm text-orange-400">
                    <p class="flex flex-col items-center justify-center gap-1 text-xs sm:flex-row">
                        <span>{$locales('footer.license_info')}</span>
                        <span class="text-orange-300">|</span>
                        <span class="text-orange-300">{$locales('footer.license_desc')}</span>
                    </p>

                    <p>
                        {$locales('footer.built_with')}
                        <a
                            href="https://svelte.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-orange-300 underline hover:text-orange-200"
                        >
                            SvelteKit
                        </a>
                        ,
                        <a
                            href="https://tailwindcss.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-orange-300 underline hover:text-orange-200"
                        >
                            TailwindCSS
                        </a>
                        , and
                        <a
                            href="https://vitejs.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-orange-300 underline hover:text-orange-200"
                        >
                            Vite
                        </a>
                    </p>
                    <p class="text-xs">
                        {@html $locales('footer.trademark_notice')}
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Bottom bar with additional info -->
    <div class="border-t border-orange-600 bg-gray-800">
        <div class="container mx-auto px-4 py-3">
            <div
                class="flex flex-col items-center justify-between text-xs text-orange-400 sm:flex-row"
            >
                <div class="flex items-center space-x-4">
                    <span>{$locales('footer.status')}:</span>
                    <span class="text-orange-300">{$locales('footer.beta_service')}</span>
                    <span class="ml-2 inline-block h-2 w-2 rounded-full bg-yellow-500"></span>
                </div>
                <div class="flex items-center space-x-4">
                    <span>{$locales('footer.version')}:</span>
                    <span class="text-orange-300">{appVersion}</span>
                </div>
            </div>
        </div>
    </div>
</footer>

<style>
    /* Custom footer styles */
    footer {
        box-shadow:
            0 -4px 6px -1px rgba(97, 83, 83, 0.1),
            0 -2px 4px -1px rgba(97, 83, 83, 0.06);
    }

    /* Link hover effects */
    a {
        transition: all 0.2s ease;
    }

    /* Line clamp utility for text truncation */
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .line-clamp-1 {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    /* Pulse animation for status indicator */
    @keyframes pulse-slow {
        0%,
        100% {
            opacity: 1;
        }
    }

    /* Print styles */
    @media print {
        footer {
            background: white !important;
            color: black !important;
            box-shadow: none !important;
        }

        footer a {
            color: black !important;
        }
    }
</style>
