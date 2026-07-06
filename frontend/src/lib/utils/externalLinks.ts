/**
 * External links configuration
 * Centralized URL constants for external resources
 */
export const EXTERNAL_LINKS = {
    DONATION: {
        YOOMONEY: 'https://yoomoney.ru/fundraise/1FI1RHDF28C.260127'
    },
    MESHTASTIC: {
        MAIN: 'https://meshtastic.org/',
        DOCS: 'https://meshtastic.org/docs/',
        DISCOURSE: 'https://meshtastic.discourse.group/',
        FLASHER: 'https://flasher.meshtastic.org/'
    },
    GITHUB: {
        MESHTASTIC_FIRMWARE: 'https://github.com/meshtastic/firmware',
        MREKIN_BOARDS: 'https://github.com/mrekin/MeshtasticCustomBoards',
        ESPRESSIF_ESPTOOL: 'https://github.com/espressif/esptool-js'
    },
    MIRRORS: {
        MAIN: 'https://flashmesh.ru',
        MIRROR: 'https://flashmesh.mooo.com'
    },
    OTHER: {
        MESHCORE: 'https://meshcore.co.uk'
    },
    USEFUL_LINKS: {
        MALLA_MESHWORKS: 'https://malla.meshworks.ru',
        VOTETOVID: 'https://votetovid.ru',
        HEYWHATSTHAT: 'http://www.heywhatsthat.com/profiler.html'
    }
} as const;
