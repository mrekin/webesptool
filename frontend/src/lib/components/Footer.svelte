<script lang="ts">

  // Local state
  let currentYear = new Date().getFullYear();

  // Footer links data
  const mainLinks = [
    {
      name: 'Meshtastic',
      href: 'https://meshtastic.org/',
      description: 'Official Meshtastic project website'
    },
    {
      name: 'Documentation',
      href: 'https://meshtastic.org/docs/',
      description: 'Official documentation and guides'
    },
    {
      name: 'Community',
      href: 'https://meshtastic.discourse.group/',
      description: 'Community forums and discussions'
    },
    {
      name: 'GitHub',
      href: 'https://github.com/meshtastic/firmware',
      description: 'Source code and development'
    }
  ];

  const toolLinks = [
    {
      name: 'Meshtastic Flasher',
      href: 'https://flasher.meshtastic.org/',
      description: 'Web-based firmware flashing tool'
    },
    {
      name: 'ESP Web Tools',
      href: 'https://esphome.github.io/esp-web-tools/',
      description: 'Browser-based ESP32 development tools'
    }
  ];

  const mirrorLinks = [
    {
      name: 'Primary Mirror',
      href: 'https://mrekin.duckdns.org/flasher/',
      description: 'Main service mirror'
    },
    {
      name: 'European Mirror',
      href: 'https://de2-vardas.duckdns.org',
      description: 'European server mirror'
    }
  ];

  // Legal links
  const legalLinks = [
    {
      name: 'Privacy Policy',
      href: '#privacy',
      description: 'How we handle your data'
    },
    {
      name: 'Terms of Service',
      href: '#terms',
      description: 'Terms and conditions'
    },
    {
      name: 'Disclaimer',
      href: '#disclaimer',
      description: 'Legal disclaimers and warranties'
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
          Development Tools
        </h3>
        <p class="text-orange-300 mb-4 text-sm">
          Installer powered by advanced web-based tools for firmware development and installation:
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
          Service Mirrors
        </h3>
        <p class="text-orange-300 mb-4 text-sm">
          Alternative service endpoints for improved accessibility and performance:
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
          <!-- Legal column -->
          <div>
            <h4 class="text-orange-200 font-semibold mb-3">Legal</h4>
            <ul class="space-y-2 text-sm">
              {#each legalLinks as legal}
                <li>
                  <a
                    href={legal.href}
                    class="text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    {legal.name}
                  </a>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Version info column -->
          <div>
            <h4 class="text-orange-200 font-semibold mb-3">Version Info</h4>
            <div class="space-y-2 text-sm text-orange-300">
              <p>
                <span class="font-medium">Frontend:</span>
                SvelteKit v2.22.0
              </p>
              <p>
                <span class="font-medium">Build:</span>
                {currentYear} Beta
              </p>
              <p>
                <span class="font-medium">API:</span>
                FastAPI v0.104+
              </p>
            </div>
          </div>

          <!-- Contact/Support column -->
          <div>
            <h4 class="text-orange-200 font-semibold mb-3">Support</h4>
            <div class="space-y-2 text-sm text-orange-300">
              <p>
                <span class="font-medium">Issues:</span>
                <a href="https://github.com/meshtastic/firmware/issues" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">
                  GitHub Issues
                </a>
              </p>
              <p>
                <span class="font-medium">Discussions:</span>
                <a href="https://github.com/meshtastic/firmware/discussions" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">
                  GitHub Discussions
                </a>
              </p>
              <p>
                <span class="font-medium">Discord:</span>
                <a href="https://discord.gg/meshtastic" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline">
                  Community Discord
                </a>
              </p>
            </div>
          </div>
        </div>

        <!-- Copyright and credits -->
        <div class="border-t border-orange-800 pt-6 mt-8">
          <div class="text-center space-y-2 text-sm text-orange-400">
            <p>
              © {currentYear} Meshtastic Firmware Build Service. All rights reserved.
            </p>
            <p>
              Built with ❤️ using
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
              Meshtastic® is a registered trademark. All other trademarks are the property of their respective owners.
            </p>
            <div class="mt-4 flex justify-center space-x-4">
              <!-- Badge for SvelteKit -->
              <a href="https://svelte.dev" target="_blank" rel="noopener noreferrer" class="inline-block">
                <img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=Svelte&logoColor=white" alt="Built with SvelteKit" class="h-6">
              </a>
              <!-- Badge for TypeScript -->
              <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer" class="inline-block">
                <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=TypeScript&logoColor=white" alt="Built with TypeScript" class="h-6">
              </a>
              <!-- Badge for TailwindCSS -->
              <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" class="inline-block">
                <img src="https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Styled with TailwindCSS" class="h-6">
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom bar with additional info -->
    <div class="border-t border-orange-800 bg-gray-800">
      <div class="container mx-auto px-4 py-3">
        <div class="flex flex-col sm:flex-row justify-between items-center text-xs text-orange-400">
          <div class="flex items-center space-x-4">
            <span>Status:</span>
            <span class="text-orange-300">Beta Service</span>
            <span class="inline-block w-2 h-2 bg-yellow-500 rounded-full ml-2"></span>
          </div>
          <div class="flex items-center space-x-4">
            <span>Last Updated:</span>
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

  /* Badge animations */
  img {
    transition: transform 0.2s ease;
  }

  img:hover {
    transform: scale(1.05);
  }

  /* Pulse animation for status indicator */
  @keyframes pulse-slow {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-pulse-slow {
    animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .container {
      padding-left: 1rem;
      padding-right: 1rem;
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