<script lang="ts">
  import { _ as locales } from 'svelte-i18n';

  // Local state
  let currentYear = new Date().getFullYear();

  // Reactive footer links data using localization
  $: mainLinks = [
    {
      name: $locales('footer_static.meshtastic_name'),
      href: 'https://meshtastic.org/',
      description: $locales('footer_static.meshtastic_desc')
    },
    {
      name: $locales('footer_static.documentation_name'),
      href: 'https://meshtastic.org/docs/',
      description: $locales('footer_static.documentation_desc')
    },
    {
      name: $locales('footer_static.community_name'),
      href: 'https://meshtastic.discourse.group/',
      description: $locales('footer_static.community_desc')
    },
    {
      name: $locales('footer_static.github_name'),
      href: 'https://github.com/meshtastic/firmware',
      description: $locales('footer_static.github_desc')
    }
  ];

  $: toolLinks = [
    {
      name: $locales('footer_static.meshtastic_flasher_name'),
      href: 'https://flasher.meshtastic.org/',
      description: $locales('footer_static.meshtastic_flasher_desc')
    },
    {
      name: $locales('footer_static.esp_web_tools_name'),
      href: 'https://esphome.github.io/esp-web-tools/',
      description: $locales('footer_static.esp_web_tools_desc')
    }
  ];

  $: mirrorLinks = [
    {
      name: $locales('footer_static.primary_mirror_name'),
      href: 'https://mrekin.duckdns.org/flasher/',
      description: $locales('footer_static.primary_mirror_desc')
    },
    {
      name: $locales('footer_static.european_mirror_name'),
      href: 'https://de2-vardas.duckdns.org',
      description: $locales('footer_static.european_mirror_desc')
    }
  ];

  function formatLink(link: any) {
    return {
      ...link,
      formattedName: link.name.replace(/\s+/g, '-').toLowerCase()
    };
  }
</script>

<footer class="w-full border-t border-orange-800 bg-gray-900 bg-opacity-90 backdrop-blur-sm mt-auto">
    <!-- Main footer content -->
    <div class="container mx-auto px-4 py-8">
      <!-- Top section with main links -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
        {#each mainLinks as link}
          <div class="space-y-2">
            <h3 class="text-orange-200 font-semibold mb-3">{link.name}</h3>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              class="text-orange-300 hover:text-orange-200 transition-colors text-sm block group"
            >
              <span class="group-hover:underline">{link.name}</span>
              <span class="block text-orange-400 text-xs mt-1">{link.description}</span>
            </a>
          </div>
        {/each}
      </div>

      <!-- Tools section -->
      <div class="mb-8">
        <h3 class="text-orange-200 font-semibold mb-4 flex items-center">
          <span class="mr-2">🛠️</span>
          {$locales('footer.development_tools')}
        </h3>
        <p class="text-orange-300 mb-4 text-sm">
          {$locales('footer.installer_description')}
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each toolLinks as tool}
            <div class="p-4 bg-gray-800 border border-orange-700 rounded-lg hover:bg-gray-700 transition-colors">
              <h4 class="font-medium text-orange-200 mb-2">{tool.name}</h4>
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                class="text-orange-400 hover:text-orange-300 text-sm underline block"
              >
                {tool.href}
              </a>
              <p class="text-orange-400 text-xs mt-2">{tool.description}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Mirrors section -->
      <div class="mb-8">
        <h3 class="text-orange-200 font-semibold mb-4 flex items-center">
          <span class="mr-2">🌐</span>
          {$locales('footer.service_mirrors')}
        </h3>
        <p class="text-orange-300 mb-4 text-sm">
          {$locales('footer.alternative_endpoints')}
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each mirrorLinks as mirror}
            <div class="p-3 bg-gray-800 border border-orange-700 rounded hover:bg-gray-700 transition-colors">
              <h4 class="font-medium text-orange-200 mb-1">{mirror.name}</h4>
              <a
                href={mirror.href}
                target="_blank"
                rel="noopener noreferrer"
                class="text-orange-400 hover:text-orange-300 text-sm underline block"
              >
                {mirror.href}
              </a>
              <p class="text-orange-400 text-xs mt-1">{mirror.description}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-orange-800 pt-8">
        <!-- Bottom section with legal and info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">

        </div>

        <!-- Copyright and credits -->
        <div class="border-t border-orange-800 pt-6 mt-8">
          <div class="text-center space-y-2 text-sm text-orange-400">
            <p>
              {$locales('footer_static.copyright', { year: currentYear })}
            </p>
            <p>
              {$locales('footer_static.built_with')}
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
              {$locales('footer_static.trademark_notice')}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom bar with additional info -->
    <div class="border-t border-orange-800 bg-gray-800">
      <div class="container mx-auto px-4 py-3">
        <div class="flex flex-col sm:flex-row justify-between items-center text-xs text-orange-400">
          <div class="flex items-center space-x-4">
            <span>{$locales('footer.status')}:</span>
            <span class="text-orange-300">{$locales('footer.beta_service')}</span>
            <span class="inline-block w-2 h-2 bg-yellow-500 rounded-full ml-2"></span>
          </div>
          <div class="flex items-center space-x-4">
            <span>{$locales('footer.last_updated')}:</span>
            <span class="text-orange-300">{currentYear}-{String(new Date().getMonth() + 1).padStart(2, '0')}</span>
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