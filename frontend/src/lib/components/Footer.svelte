<script lang="ts">
  import { _ as locales } from 'svelte-i18n';
  import { appVersion } from '$lib/utils/envVariables.js';

  // Local state
  let currentYear = new Date().getFullYear();

  // Reactive footer links data using localization
  $: mainLinks = [
    {
      name: $locales('footer.meshtastic_name'),
      href: 'https://meshtastic.org/',
      description: $locales('footer.meshtastic_desc')
    },
    {
      name: $locales('footer.documentation_name'),
      href: 'https://meshtastic.org/docs/',
      description: $locales('footer.documentation_desc')
    },
    {
      name: $locales('footer.community_name'),
      href: 'https://meshtastic.discourse.group/',
      description: $locales('footer.community_desc')
    },
    {
      name: $locales('footer.mrekin_github_name'),
      href: 'https://github.com/mrekin/MeshtasticCustomBoards',
      description: $locales('footer.mrekin_github_desc')
    },
    {
      name: $locales('footer.github_name'),
      href: 'https://github.com/meshtastic/firmware',
      description: $locales('footer.github_desc')
    }
  ];

  $: toolLinks = [
    {
      name: $locales('footer.meshtastic_flasher_name'),
      href: 'https://flasher.meshtastic.org/',
      description: $locales('footer.meshtastic_flasher_desc')
    },
    {
      name: $locales('footer.esp_web_tools_name'),
      href: 'https://github.com/esphome/esp-web-tools',
      description: $locales('footer.esp_web_tools_desc')
    }
  ];

  $: mirrorLinks = [
    {
      name: $locales('footer.primary_mirror_name'),
      href: 'https://mrekin.duckdns.org/flasher/',
      description: $locales('footer.primary_mirror_desc')
    },
    {
      name: $locales('footer.european_mirror_name'),
      href: 'https://de2-vardas.duckdns.org',
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

<footer class="w-full border-t border-orange-600 bg-gray-900 bg-opacity-90 backdrop-blur-sm mt-auto">
    <!-- Main footer content -->
    <div class="container mx-auto px-4 py-8">
      <!-- Top section with main links -->
      <div class="mb-8">
        <div class="flex flex-wrap justify-center gap-4 sm:gap-6 lg:gap-8">
          {#each mainLinks as link}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              class="flex flex-col items-center text-center group min-w-[120px] sm:min-w-[140px] hover:bg-gray-800 hover:bg-opacity-50 p-3 rounded-lg transition-all duration-200"
              title={link.description}
            >
              <span class="text-orange-200 font-medium text-sm sm:text-base group-hover:text-orange-100 transition-colors">
                {link.name}
              </span>
              <span class="text-orange-400 text-xs mt-1 max-w-[120px] sm:max-w-[140px] line-clamp-2 group-hover:text-orange-300 transition-colors">
                {link.description}
              </span>
            </a>
          {/each}
        </div>
      </div>

      <!-- Tools and Mirrors section -->
      <div class="mb-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
          <!-- Tools column -->
          <div>
            <h3 class="text-orange-200 font-semibold mb-2 flex items-center text-sm">
              <span class="mr-2">🛠️</span>
              {$locales('footer.development_tools')}
            </h3>
            <p class="text-orange-300 mb-3 text-xs">
              {$locales('footer.installer_description')}
            </p>
          </div>
          <!-- Mirrors column -->
          <div>
            <h3 class="text-orange-200 font-semibold mb-2 flex items-center text-sm">
              <span class="mr-2">🌐</span>
              {$locales('footer.service_mirrors')}
            </h3>
            <p class="text-orange-300 mb-3 text-xs">
              {$locales('footer.alternative_endpoints')}
            </p>
          </div>
        </div>

        <!-- Combined cards row -->
        <div class="flex flex-wrap justify-center gap-2 sm:gap-3">
          {#each [...toolLinks, ...mirrorLinks] as link}
            <div class="flex-1 min-w-[180px] sm:min-w-[200px] p-2 bg-gray-800 border border-orange-500 rounded hover:bg-gray-700 transition-all duration-200">
              <h4 class="font-medium text-orange-200 mb-1 text-xs truncate">
                {link.name}
              </h4>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                class="text-orange-400 hover:text-orange-300 text-xs underline break-all block hover:text-orange-200 truncate"
                title={link.description}
              >
                {link.href}
              </a>
              <p class="text-orange-400 text-xs mt-1 line-clamp-1">{link.description}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-orange-600 pt-8">
        <!-- Bottom section with legal and info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">

        </div>

        <!-- Copyright and credits -->
        <div class="border-t border-orange-600 pt-6 mt-8">
          <div class="text-center space-y-2 text-sm text-orange-400">
            <p class="flex flex-col sm:flex-row items-center justify-center gap-1 text-xs">
              <span>{$locales('footer.license_info')}</span>
              <span class="text-orange-300">|</span>
              <span class="text-orange-300">{$locales('footer.license_desc')}</span>
            </p>

            <p>
              {$locales('footer.built_with')}
              <a href="https://svelte.dev" target="_blank" rel="noopener noreferrer" class="text-orange-300 hover:text-orange-200 underline">
                SvelteKit
              </a>
              ,
              <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" class="text-orange-300 hover:text-orange-200 underline">
                TailwindCSS
              </a>
              , and
              <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer" class="text-orange-300 hover:text-orange-200 underline">
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
        <div class="flex flex-col sm:flex-row justify-between items-center text-xs text-orange-400">
          <div class="flex items-center space-x-4">
            <span>{$locales('footer.status')}:</span>
            <span class="text-orange-300">{$locales('footer.beta_service')}</span>
            <span class="inline-block w-2 h-2 bg-yellow-500 rounded-full ml-2"></span>
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
    box-shadow: 0 -4px 6px -1px rgba(97, 83, 83, 0.1), 0 -2px 4px -1px rgba(97, 83, 83, 0.06);
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
    0%, 100% {
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