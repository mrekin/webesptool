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
		PRIMARY_1: 'https://mrekin.duckdns.org/flasher/',
		PRIMARY_2: 'https://flashmesh.ru',
		EUROPEAN: 'https://de2-vardas.duckdns.org'
	},
	OTHER: {
		MESHCORE: 'https://meshcore.co.uk'
	}
} as const;
