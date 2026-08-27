// Centralized metadata for the meshcore configurator field model.
// Non-derivable UI/protocol metadata lives here (groups, reboot keys, min versions,
// response value prefix, field display order). Field control is derived from param
// type, not from here.
export const MESHCORE_CONFIG_METADATA = {
    // Field key -> group id. Primary/user-facing fields are mapped to their group;
    // everything else (deprecated, obscure) falls back to 'advanced'.
    fieldGroups: {
        // Name & Location
        name: 'location',
        lat: 'location',
        lon: 'location',
        'owner.info': 'location',
        // Identity & Access
        'prv.key': 'identity',
        'guest.password': 'identity',
        'allow.read.only': 'identity',
        repeat: 'identity',
        // Radio (core only)
        radio: 'radio',
        freq: 'radio',
        tx: 'radio',
        'radio.rxgain': 'radio',
        'radio.fem.rxgain': 'radio',
        dutycycle: 'radio',
        // Bridge (core only)
        'bridge.enabled': 'bridge',
        // Flood (core only)
        'flood.max': 'flood',
        // Advanced: deprecated / obscure params explicitly grouped.
        cad: 'advanced',
        af: 'advanced',
        'agc.reset.interval': 'advanced',
        'int.thresh': 'advanced',
        'direct.txdelay': 'advanced',
        rxdelay: 'advanced',
        txdelay: 'advanced',
        'adc.multiplier': 'advanced',
        'path.hash.mode': 'advanced',
        'loop.detect': 'advanced',
        'multi.acks': 'advanced',
        'flood.max.unscoped': 'advanced',
        'flood.max.advert': 'advanced',
        'flood.advert.interval': 'advanced',
        'advert.interval': 'advanced',
        'bridge.baud': 'advanced',
        'bridge.channel': 'advanced',
        'bridge.delay': 'advanced',
        'bridge.secret': 'advanced',
        'bridge.source': 'advanced'
    } as Record<string, string>,
    // Groups (id -> i18n key suffix + display order). User-facing groups first.
    // Shared taxonomy for both config (get<->set) and action commands.
    groups: {
        location: { labelKey: 'location', order: 1 },
        identity: { labelKey: 'identity', order: 2 },
        radio: { labelKey: 'radio', order: 3 },
        bridge: { labelKey: 'bridge', order: 4 },
        flood: { labelKey: 'flood', order: 5 },
        region: { labelKey: 'region', order: 6 },
        system: { labelKey: 'system', order: 7 },
        advanced: { labelKey: 'advanced', order: 99 }
    } as Record<string, { labelKey: string; order: number }>,
    // Explicit within-group display order (primary fields first). Fields not listed
    // sort to the end of their group, then alphabetically by key.
    fieldOrder: [
        // location
        'name',
        'lat',
        'lon',
        'owner.info',
        // identity
        'prv.key',
        'guest.password',
        'allow.read.only',
        'repeat',
        // radio
        'radio',
        'freq',
        'tx',
        'radio.rxgain',
        'radio.fem.rxgain',
        'dutycycle',
        // bridge
        'bridge.enabled',
        // flood
        'flood.max',
        // advanced (alphabetical)
        'adc.multiplier',
        'af',
        'agc.reset.interval',
        'advert.interval',
        'bridge.baud',
        'bridge.channel',
        'bridge.delay',
        'bridge.secret',
        'bridge.source',
        'cad',
        'direct.txdelay',
        'flood.advert.interval',
        'flood.max.advert',
        'flood.max.unscoped',
        'int.thresh',
        'loop.detect',
        'multi.acks',
        'path.hash.mode',
        'rxdelay',
        'txdelay'
    ] as string[],
    // Fields whose change requires a reboot (seed from reference config.meshcore.io).
    rebootKeys: ['radio', 'prv.key'] as string[],
    // Min firmware version per field (seed from reference varMinVersion).
    minVersion: {
        'owner.info': [1, 12, 0],
        'path.hash.mode': [1, 14, 0],
        'loop.detect': [1, 14, 0]
    } as Record<string, [number, number, number]>,
    // Value prefix of a get-response line (assumption from reference).
    responseValuePrefix: '> '
} as const;
