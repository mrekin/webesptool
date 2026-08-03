// Curated list of meshcore action (non get<->set) commands. Each entry references
// the full command string from meshcoreCommandData; params and labels are looked
// up via findCommand, so the command model is not duplicated here. Actions share
// the SAME unified group taxonomy as config fields (see meshcoreConfigMetadata):
// identity / location / radio / flood / region / system. Read-only queries
// (ver, stats-*, neighbors, log print, get *, discover.neighbors, board, clock,
// view-forms of dual commands) are intentionally excluded — they don't set state.

export interface MeshcoreAction {
    /** Full command string as in meshcoreCommandData (used to look up params/label). */
    command: string;
    /** Unified group id (shared with config field groups). */
    groupId: string;
    /** Whether the action is destructive and needs a confirmation dialog. */
    danger?: boolean;
    /** Urgent one-shot action — run-now only, cannot be queued for Apply. */
    urgent?: boolean;
    /** Variadic action: the whole remainder is one value (e.g. 'region def a b c'). */
    variadic?: boolean;
}

export const MESHCORE_ACTIONS: MeshcoreAction[] = [
    // Identity & Access
    { command: 'password {new_password}', groupId: 'identity' },
    { command: 'setperm {pubkey} {0|1|2|3}', groupId: 'identity' },

    // Location (GPS)
    { command: 'gps {on|off}', groupId: 'location' },
    { command: 'gps advert {none|share|prefs}', groupId: 'location' },
    { command: 'gps sync', groupId: 'location' },
    { command: 'gps setloc', groupId: 'location' },

    // Radio (power saving)
    { command: 'powersaving on', groupId: 'radio' },
    { command: 'powersaving off', groupId: 'radio' },

    // Flood / Advert
    { command: 'advert', groupId: 'flood', urgent: true },
    { command: 'advert.zerohop', groupId: 'flood', urgent: true },

    // Region management (region load is interactive -> terminal only)
    { command: 'region save', groupId: 'region' },
    { command: 'region def {token} [{token} ...]', groupId: 'region', variadic: true },
    { command: 'region allowf {name}', groupId: 'region' },
    { command: 'region denyf {name}', groupId: 'region' },
    { command: 'region default {name}', groupId: 'region' },
    { command: 'region home {name}', groupId: 'region' },
    { command: 'region remove {name}', groupId: 'region' },

    // System
    { command: 'reboot', groupId: 'system', danger: true, urgent: true },
    { command: 'erase', groupId: 'system', danger: true, urgent: true },
    { command: 'start ota', groupId: 'system', urgent: true },
    { command: 'time {epoch_seconds}', groupId: 'system' },
    { command: 'clkreboot', groupId: 'system', urgent: true },
    { command: 'clear stats', groupId: 'system', urgent: true },
    { command: 'log start', groupId: 'system', urgent: true },
    { command: 'log stop', groupId: 'system', urgent: true },
    { command: 'log erase', groupId: 'system', urgent: true }
];
