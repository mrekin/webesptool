<script lang="ts">
    import { _ as locales } from 'svelte-i18n';
    import { onMount, onDestroy } from 'svelte';
    import { Xterm } from '@battlefieldduck/xterm-svelte';
    import type { Terminal } from '@xterm/xterm';
    import { buildCommandRows } from '$lib/utils/meshcoreConfigFields.js';
    import {
        parseGetResponse,
        buildCommand,
        classifyCommandLine
    } from '$lib/utils/meshcoreConfigState.js';
    import {
        splitIntoCommandLines,
        isModeSwitchLine,
        trimTrailingEmptyLine
    } from '$lib/utils/multilineCommands.js';
    import { createMeshcoreCliManager, type MeshcoreCliStatus } from '$lib/utils/meshcoreCli.js';
    import { attachTerminalCopy } from '$lib/utils/terminalClipboard.js';
    import { setTerminalMode, resetTerminalMode, uiState } from '$lib/stores.js';
    import { TERMINAL_CONFIG } from '$lib/config/terminalConfig.js';
    import { ResponseDetector } from '$lib/utils/responseDetector.js';
    import {
        parseCommandDelay,
        clampDelaySeconds,
        createDelayCountdown,
        attachDelayCountdownLinks,
        type DelayCountdownHandle,
        type DelayCountdownOutcome
    } from '$lib/utils/commandDelay.js';
    import McCommandSetPicker from './McCommandSetPicker.svelte';
    import MeshcoreConfigRow from './MeshcoreConfigRow.svelte';
    import MeshcoreConfigCommandList from './MeshcoreConfigCommandList.svelte';
    import CommandInput from './CommandInput.svelte';
    import MultilineControls from './MultilineControls.svelte';
    import CoordinateMapPicker from './CoordinateMapPicker.svelte';
    import { parseDeviceVersion, versionGte } from '$lib/utils/meshcoreVersion.js';
    import { fillHint } from '$lib/actions/fillHint.js';
    import {
        parseNameTemplate,
        composeName,
        defaultComposerParts
    } from '$lib/utils/nameTemplate.js';
    import {
        PATH_HASH_MODE_MIN_VERSION,
        REGION_DEF_MIN_VERSION
    } from '$lib/config/meshcoreZoneConfig.js';
    import type {
        MeshcoreCommandRow,
        MeshcoreConfigGroup,
        MeshcoreConfigValue,
        PickerResult
    } from '$lib/types.js';

    let {
        isOpen = false,
        onClose = () => {},
        autoOpenPicker = false,
        directPickerResult = null,
        onDirectPickerApplied = () => {}
    }: {
        isOpen?: boolean;
        onClose?: () => void;
        autoOpenPicker?: boolean;
        directPickerResult?: PickerResult | null;
        onDirectPickerApplied?: () => void;
    } = $props();

    // Unified command model is static, built once at init: config get<->set rows
    // and one-shot action rows share the same shape and group taxonomy.
    const { rows, groups } = buildCommandRows();

    // Pre-group rows by their group id (rows never change, so this is plain).
    const rowsByGroup = new Map<string, MeshcoreCommandRow[]>();
    for (const g of groups) {
        rowsByGroup.set(
            g.id,
            rows.filter((r) => r.groupId === g.id)
        );
    }

    // Region commands that mutate the device's region tree (every action in the
    // 'region' group except 'region save'). Region edits only persist once
    // 'region save' runs, so a 'region save' must follow any of these on Apply —
    // see the auto-sync $effect below.
    const regionMutatingIds = new Set(
        rows
            .filter((r) => r.groupId === 'region' && r.kind === 'action' && r.id !== 'region save')
            .map((r) => r.id)
    );

    // Current value of every row (config current value + action inputs).
    let rowValues = $state<Record<string, MeshcoreConfigValue>>({});
    // Baseline for config rows (committed value used to revert on Discard).
    let originalValues = $state<Record<string, MeshcoreConfigValue>>({});

    // The Apply queue: an ORDERED list of commands to send — the single source of
    // truth for the command list, card dirty state and group badges. File-load
    // appends in file order (order never changes); manual edits/arm append at the
    // end. Each entry optionally tracks its row (for badges / Discard revert).
    type QueueEntry = { line: string; rowId?: string };
    let commandQueue = $state<QueueEntry[]>([]);

    // Output line ending for the copy buffer.
    let selectedLineEnding = $state<'lf' | 'crlf' | 'cr'>('crlf');

    // CLI manager (assigned in onMount; not rendered, so plain let).
    let cliManager: ReturnType<typeof createMeshcoreCliManager> | null = null;

    // Connection / operation state.
    let status = $state<MeshcoreCliStatus>('disconnected');
    let busy = $state(false);
    let statusMessage = $state('');
    let errorMessage = $state('');

    // UI state.
    let isSupported = $state(true);
    // Less-commonly used groups are collapsed by default ('advanced' is a normal
    // collapsible group now, not behind an extra toggle).
    let collapsedGroups = $state<Set<string>>(
        new Set(['bridge', 'flood', 'region', 'system', 'advanced'])
    );
    let showRebootConfirm = $state(false);
    // A destructive action awaiting confirmation (reboot/erase run immediately).
    let pendingDangerAction = $state<{ row: MeshcoreCommandRow; line: string } | null>(null);
    // Device firmware version (read via 'ver' after connect).
    let deviceVersion = $state('');

    // Terminal xterm is lazily mounted on first open so it measures a visible box.
    let terminalEverOpened = $state(false);
    // Coordinate map picker dialog.
    let showMapPicker = $state(false);
    // Initial toggles for the picker (coords vs regions entry points).
    let pickerInitial = $state<{ detectCoords: boolean; detectRegions: boolean }>({
        detectCoords: true,
        detectRegions: false
    });

    // Node-name composer: when the picker resolves a zone carrying a name
    // template, the `set name` row turns into a composer (enum selects + free
    // inputs) instead of a plain text field. `composerParts` holds one value per
    // input token (enum/free), in order. Null template -> normal text input.
    let activeNameTemplate = $state<string | null>(null);
    let composerParts = $state<string[]>([]);

    // Settings-document link for the currently-applied zone preset (from the
    // picker's resolved region meshcore.docUrl). Shown in the toolbar next to
    // the generic Docs link. Null until a region with a docUrl is applied.
    let regionDocUrl = $state<string | null>(null);

    // `region def` is supported on firmware >= 1.16. An empty version (not
    // connected / 'ver' unanswered) is treated as supported: the region is still
    // shown/resolved, the user applies it themselves.
    const regionDefSupported = $derived(
        deviceVersion === '' || versionGte(parseDeviceVersion(deviceVersion), REGION_DEF_MIN_VERSION)
    );
    // `set path.hash.mode` is supported on firmware >= 1.14. Same empty-version
    // convention as regionDefSupported.
    const pathHashSupported = $derived(
        deviceVersion === '' || versionGte(parseDeviceVersion(deviceVersion), PATH_HASH_MODE_MIN_VERSION)
    );

    // Parsed tokens of the active name template (empty when none active).
    const nameTokens = $derived(activeNameTemplate ? parseNameTemplate(activeNameTemplate) : []);
    // Maps each token index to its composer-part index (-1 for literals), so the
    // composer can bind the right `composerParts` slot to each input control.
    const nameTokenComposerIndex = $derived.by<number[]>(() => {
        const map: number[] = [];
        let n = 0;
        for (const t of nameTokens) {
            map.push(t.type === 'literal' ? -1 : n++);
        }
        return map;
    });
    // The device caps `set name` at 32 chars; flag an over-long composed name.
    const nameTooLong = $derived(
        activeNameTemplate !== null && composeName(nameTokens, composerParts).length > 32
    );

    // While a name template is active, every REQUIRED placeholder must be filled
    // before the queue can be sent. A placeholder is required unless it is marked
    // optional (`[?...]`) or it is an enum exposing an explicit empty variant
    // (`[A|B|]` -> options include ''). Free-edit mode (no template) is never
    // incomplete.
    const nameIncomplete = $derived.by(() => {
        if (activeNameTemplate === null) return false;
        let n = 0;
        for (const t of nameTokens) {
            if (t.type === 'literal') continue;
            const part = composerParts[n] ?? '';
            n++;
            // Optional placeholders and empty-variant enums never block Apply.
            // (n is incremented above so composerParts stays aligned either way.)
            if (t.optional) continue;
            const allowsEmpty = t.type === 'enum' && t.options.includes('');
            if (!allowsEmpty && part.trim() === '') return true;
        }
        return false;
    });

    // Does the configurator expose a given row id? Zone presets only apply when
    // the matching command row exists for this command-set variant.
    function hasRow(id: string): boolean {
        return rows.some((r) => r.id === id);
    }

    // Light metric logging for the zone feature (counters, debug-level).
    function logZoneMetric(kind: string): void {
        console.info('[meshcore-zone]', kind);
    }

    // Terminal tab state. Shares the same cliManager/port as the settings tab;
    // the xterm only displays (and sends manual input), settings logic is untouched.
    let activeTab = $state<'settings' | 'terminal'>('settings');
    let terminal = $state<Terminal | null>(null);
    let fitAddon: any = null;
    // Window resize listener cleanup ref for the xterm fit addon.
    let resizeHandler: (() => void) | null = null;
    let autoScroll = $state(true);
    // Output that arrived before the xterm was mounted (it mounts lazily on the
    // first Terminal-tab open). Replayed into the terminal on mount so early
    // traffic — and the `>> cmd` echoes of sent commands — is not lost.
    let pendingTermChunks: string[] = [];
    // Terminal input has its own history, independent from TerminalModal.
    let termInput = $state('');
    let commandHistory = $state<string[]>([]);
    let historyIndex = $state(0);
    let currentLine = $state('');
    let showCommandShortDescriptions = $state(true);
    let isMassRunning = $state(false);
    let stopMassRequested = false;
    let massSentIndex = $state(-1);
    // Delay countdown state (task 80) — mirrors TerminalModal: one active
    // countdown at most; sends from this terminal are blocked while waiting.
    let isTermWaiting = $state(false);
    let activeTermCountdown: DelayCountdownHandle | null = null;
    // Response detector for the terminal-tab mass send — unified with the
    // firmware terminal: fed from onChunk, resolves on response silence.
    let termResponseDetector: ResponseDetector | null = null;
    // Countdown link provider disposer (double click = early send).
    let disposeDelayLinks: (() => void) | null = null;

    // xterm options — same theme as TerminalModal.
    const terminalOptions = {
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: {
            background: '#1f2937',
            foreground: '#10b981',
            cursor: '#10b981',
            cursorAccent: '#1f2937'
        },
        cursorBlink: true,
        scrollback: 1000,
        allowProposedApi: true
    };

    // Guard against double-disconnect (mirrors MeshtasticDeviceModal).
    // Plain let: internal guard read only in handlers/effects, never rendered.
    let isDisconnecting = false;

    let isConnected = $derived(status === 'connected');
    let isConnecting = $derived(status === 'connecting');

    // Load Command Set is gated behind the Experimental Features toggle.
    let experimentalFeatures = $derived($uiState.experimentalFeatures);

    let statusText = $derived(
        isConnecting
            ? $locales('meshcoreconfig.status_connecting')
            : isConnected
              ? $locales('meshcoreconfig.status_connected')
              : $locales('meshcoreconfig.status_disconnected')
    );
    let statusDotColor = $derived(
        isConnecting ? 'bg-yellow-500' : isConnected ? 'bg-green-500' : 'bg-red-500'
    );
    let connectionLabel = $derived(
        isConnecting
            ? $locales('meshcoreconfig.status_connecting')
            : isConnected
              ? $locales('meshcoreconfig.disconnect')
              : $locales('meshcoreconfig.connect')
    );

    // Config rows and param-action rows go through the Apply queue; only direct
    // (0-param) actions run immediately via their own Run button — the queueable
    // rule lives in meshcoreConfigState.isQueueable (shared with the classifier).

    function inQueue(r: MeshcoreCommandRow): boolean {
        return commandQueue.some((e) => e.rowId === r.id);
    }

    // The assembled send queue = the exact ordered list Apply will send (single
    // source of truth for the visible command list). Order is preserved: file-load
    // order for loaded lines, append order for manual edits.
    let assembled = $derived(commandQueue.map((e) => ({ line: e.line, dirty: true })));
    let assembledCount = $derived(commandQueue.length);

    // Latitude/longitude render as a single combined "Coordinates" card, so they
    // stay side by side regardless of the auto-fill grid's column count.
    let latRow = $derived(rows.find((r) => r.id === 'lat'));
    let lonRow = $derived(rows.find((r) => r.id === 'lon'));
    let coordsDirty = $derived(
        !!(latRow && inQueue(latRow)) || !!(lonRow && inQueue(lonRow))
    );

    function errorText(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }

    // Terminal output helper: write to the mounted xterm (autoscroll by flag) or
    // buffer into pendingTermChunks until the xterm mounts. Shared by onChunk
    // and the delay countdown (which must be visible even before the mount).
    function writeToConsole(chunk: string): void {
        if (terminal) {
            terminal.write(chunk);
            if (autoScroll) terminal.scrollToBottom();
        } else {
            pendingTermChunks.push(chunk);
        }
    }

    onMount(() => {
        // CommandInput reads the global terminalMode store for meshcore autocomplete.
        setTerminalMode('meshcore');
        cliManager = createMeshcoreCliManager({
            onStatusChange: (s) => {
                status = s;
                if (s === 'disconnected') {
                    // Connection loss: a pending countdown must not send its
                    // command, and an awaited response detection stops the run.
                    termResponseDetector?.cancel();
                    activeTermCountdown?.cancel('aborted');
                }
            },
            // Every decoded device chunk (and the cyan `>> cmd` echo of sent
            // commands) is teed here — write it straight to the xterm (or buffer
            // it until the lazily-mounted Terminal tab opens) and feed the
            // terminal-tab response detector (unified mass send, task 80).
            onChunk: (data) => {
                termResponseDetector?.notifyData();
                writeToConsole(data);
            }
        });
        isSupported = cliManager.isSupported();
        // Auto-open the coordinate map picker when the modal is opened from the
        // CustomFirmwareModal 📍 shortcut. The confirmed point is then applied to
        // the device config rows through the existing picker onconfirm handler.
        if (autoOpenPicker) {
            pickerInitial = { detectCoords: true, detectRegions: true };
            showMapPicker = true;
        }
    });

    onDestroy(() => {
        resetTerminalMode();
        // Clean up the xterm resize listener if the terminal tab was opened.
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        disposeDelayLinks?.();
        disposeDelayLinks = null;
        if (cliManager && !isDisconnecting) {
            void cliManager.disconnect();
        }
    });

    // Auto-disconnect when the modal closes while still connected.
    $effect(() => {
        if (!isOpen && isConnected && !isDisconnecting) {
            void disconnect();
        }
    });

    // Apply a point picked in the direct-URL picker (?m=coords): the configurator
    // may be freshly opened by Apply or already open — both paths converge here.
    $effect(() => {
        if (isOpen && directPickerResult) {
            applyPickerResult(directPickerResult);
            onDirectPickerApplied(); // the parent resets the pending result
        }
    });

    // The 📍 map-picker buttons wear a finite `animate-blink-attention` class:
    // it plays once (6 slow blinks, ~6.6s) on open to draw the user to
    // geolocation setup, then self-stops. No state needed — the buttons live
    // inside the {#if isOpen} block, so they mount fresh on every open (the
    // animation replays) and unmount on close.

    // Keep exactly one 'region save' in the Apply queue while any region-mutating
    // command is present, and drop it once none remain. Without 'region save' the
    // region edits are lost on reboot, so this makes persistence automatic. The
    // effect is idempotent: after adding/removing the entry the re-run is a no-op.
    $effect(() => {
        const hasMutating = commandQueue.some(
            (e) => e.rowId !== undefined && regionMutatingIds.has(e.rowId)
        );
        const hasSave = commandQueue.some((e) => e.rowId === 'region save');
        if (hasMutating && !hasSave) {
            commandQueue = [...commandQueue, { line: 'region save', rowId: 'region save' }];
        } else if (!hasMutating && hasSave) {
            commandQueue = commandQueue.filter((e) => e.rowId !== 'region save');
        }
    });

    // --- Terminal tab helpers ---

    // xterm is mounted once (the terminal panel stays in the DOM, just hidden),
    // so capture the instance, lazily load the fit addon and re-fit on resize.
    function onLoad(term: Terminal): void {
        terminal = term;
        // Wire Ctrl/Cmd+C copy handling (shared with TerminalModal).
        attachTerminalCopy(term);
        // Countdown timer links: double click on the active countdown line sends early.
        disposeDelayLinks?.();
        disposeDelayLinks = attachDelayCountdownLinks(term);
        term.writeln('\x1b[1;33mMeshcore terminal\x1b[0m');
        term.writeln('\x1b[90mConnect to the device to see traffic.\x1b[0m\r\n');
        // Replay output that arrived before the xterm mounted (lazy mount on
        // first Terminal-tab open) so the session log is complete.
        if (pendingTermChunks.length > 0) {
            for (const chunk of pendingTermChunks) term.write(chunk);
            pendingTermChunks = [];
            if (autoScroll) term.scrollToBottom();
        }
        import('@xterm/addon-fit')
            .then(({ FitAddon }) => {
                fitAddon = new FitAddon();
                terminal?.loadAddon(fitAddon);
                setTimeout(() => fitAddon?.fit(), 50);
                const handleResize = () => fitAddon?.fit();
                window.addEventListener('resize', handleResize);
                resizeHandler = handleResize;
            })
            .catch(() => {
                /* fit addon unavailable — terminal still works, just no auto-fit */
            });
    }

    function selectTab(tab: 'settings' | 'terminal'): void {
        activeTab = tab;
        if (tab === 'terminal') {
            // Lazily mount the xterm on first open so it measures a visible box,
            // then refit whenever the terminal tab becomes visible again.
            terminalEverOpened = true;
            setTimeout(() => fitAddon?.fit(), 60);
        }
    }

    // Number of rows in a group that are currently in the send queue — used to
    // badge group headers so pending changes are visible even when collapsed.
    function groupQueueCount(groupId: string): number {
        return (rowsByGroup.get(groupId) ?? []).filter((r) => inQueue(r)).length;
    }

    // Send the time command immediately: the entered epoch if present, else now.
    // Sent at once (no field-filling) to avoid drift between displayed and sent time.
    function sendCurrentTime(): void {
        if (!cliManager || !isConnected || busy) return;
        const entered = rowValues['time'];
        const epoch =
            typeof entered === 'number' && entered > 0
                ? entered
                : Math.floor(Date.now() / 1000);
        void doRunAction(`time ${epoch}`);
    }

    // Push a sent line onto the terminal history (FIFO-capped), mirroring
    // TerminalModal.writeCommand so ArrowUp/ArrowDown recall prior commands.
    function pushHistory(line: string): void {
        commandHistory.push(line);
        if (commandHistory.length > TERMINAL_CONFIG.maxHistory) {
            commandHistory.shift();
        }
        historyIndex = commandHistory.length;
    }

    // Run the delay countdown for a line carrying a positive `[dN]` directive:
    // clamp (with a localized notice), wait for the outcome. Returns null when
    // the line has no directive or a zero delay (no countdown at all). The
    // countdown is written via writeToConsole, so it lands in the xterm or in
    // the pending buffer (visible on the first Terminal-tab open) either way.
    async function awaitTermDelay(raw: string): Promise<DelayCountdownOutcome | null> {
        const parsed = parseCommandDelay(raw);
        if (!parsed || parsed.delaySeconds <= 0) return null;
        const { seconds, clamped } = clampDelaySeconds(parsed.delaySeconds);
        let notice: string | undefined;
        if (clamped) {
            notice = $locales('meshcoreconfig.terminal_delay_clamped', {
                values: { max: TERMINAL_CONFIG.maxDelaySeconds }
            });
        }
        activeTermCountdown = createDelayCountdown({
            delaySeconds: seconds,
            displayLine: parsed.command,
            write: writeToConsole,
            clampedNotice: notice,
            terminal: terminal ?? undefined
        });
        const outcome = await activeTermCountdown.promise;
        activeTermCountdown = null;
        return outcome;
    }

    /** Whether the line carries a `[dN]` directive with a positive delay. */
    function hasPositiveDelay(line: string): boolean {
        const parsed = parseCommandDelay(line);
        return parsed !== null && parsed.delaySeconds > 0;
    }

    // Common single-send path for the terminal tab (manual Enter + per-line ▶):
    // parse the `[dN]` prefix, run the countdown, then send the CLEAN command
    // (frame=false) and push the line AS TYPED into the history.
    async function sendTermCommand(raw: string): Promise<void> {
        if (!cliManager || !isConnected || isMassRunning || isTermWaiting) return;
        const line = raw.trim();
        if (!line) return;
        const parsed = parseCommandDelay(line);
        if (parsed && parsed.delaySeconds > 0) {
            isTermWaiting = true;
            const outcome = await awaitTermDelay(line);
            isTermWaiting = false;
            // Cancelled (Stop) or aborted (disconnect): the command must not go out.
            if (outcome !== 'elapsed' && outcome !== 'early') return;
        }
        try {
            await cliManager.sendCommand(parsed ? parsed.command : line, false);
            pushHistory(line);
        } catch {
            /* errors are surfaced through the xterm via onChunk */
        }
    }

    // Manual single-line send from the terminal input. frame=false: just write,
    // the device's output (and the cyan `>> cmd` echo) arrives via onChunk.
    function handleTermSubmit(cmd: string): void {
        void sendTermCommand(cmd);
    }

    // Per-line Send (the ▶ button in CommandInput): same as a manual send.
    function sendTermLine(line: string): void {
        void sendTermCommand(line);
    }

    // Multiline "Send all" — unified with the firmware terminal (task 80):
    // send a line, await the device response completion (silence heuristic fed
    // from onChunk), then the next line. Delayed lines run their countdown
    // first; the progress counter only moves at the actual send.
    async function runTermMassSend(): Promise<void> {
        if (!cliManager || !isConnected || isMassRunning || isTermWaiting) return;
        const lines = splitIntoCommandLines(termInput)
            .map((l) => l.trim())
            .filter((l) => l && !isModeSwitchLine(l));
        if (lines.length === 0) return;
        isMassRunning = true;
        stopMassRequested = false;
        massSentIndex = -1;
        try {
            for (let i = 0; i < lines.length; i++) {
                if (stopMassRequested || !isConnected) break;
                const line = lines[i];
                const outcome = await awaitTermDelay(line);
                if (outcome !== null && outcome !== 'elapsed' && outcome !== 'early') {
                    break; // cancelled (Stop) / aborted (disconnect)
                }
                // Count the line only at its actual send moment — not while waiting.
                massSentIndex = i;
                const parsed = parseCommandDelay(line);
                termResponseDetector = new ResponseDetector({
                    silenceTimeoutMs: TERMINAL_CONFIG.silenceTimeoutMs
                });
                try {
                    await cliManager.sendCommand(parsed ? parsed.command : line, false);
                    pushHistory(line);
                    await termResponseDetector.start(); // resolves on response silence
                } catch {
                    break; // send error / aborted detector (Stop / disconnect)
                } finally {
                    termResponseDetector = null;
                }
            }
        } finally {
            isMassRunning = false;
            massSentIndex = -1;
        }
    }

    // Stop the mass send (and any single-line delay wait): remaining lines are
    // not sent, the awaited countdown/detector resolve as cancelled/aborted.
    function stopTermMassSend(): void {
        stopMassRequested = true;
        termResponseDetector?.cancel();
        activeTermCountdown?.cancel('cancelled');
    }

    async function connect(): Promise<void> {
        if (!cliManager) return;
        // Hold busy for the whole connect (incl. the ver query) so no other
        // command (requestSettings/apply/actions) can start until connect is
        // fully done — the port serves one command at a time, and the device
        // resets on open (boot log) so ver must finish before the first get.
        busy = true;
        pendingTermChunks = []; // fresh session: drop any buffered output
        errorMessage = '';
        statusMessage = ''; // connection state is shown by statusText + dot
        try {
            await cliManager.connect();
            // Read the firmware version (best-effort; ignore errors).
            deviceVersion = '';
            try {
                const ver = await cliManager.sendCommand('ver');
                deviceVersion = (ver || '').trim();
            } catch {
                /* version is informational only */
            }
        } catch (err) {
            statusMessage = '';
            errorMessage = errorText(err);
        } finally {
            busy = false;
        }
    }

    async function disconnect(): Promise<void> {
        if (!cliManager || isDisconnecting) return;
        isDisconnecting = true;
        try {
            await cliManager.disconnect();
        } catch {
            // Disconnect errors are expected (e.g. port already gone); ignore.
        } finally {
            isDisconnecting = false;
        }
    }

    async function toggleConnection(): Promise<void> {
        if (isConnected) {
            await disconnect();
        } else {
            await connect();
        }
    }

    // Pull current values from the device for every config row. parseGetResponse
    // reads row.params/row.separator, so the unified row is passed directly.
    async function requestSettings(): Promise<void> {
        if (!cliManager || !isConnected) return;
        busy = true;
        errorMessage = '';
        statusMessage = '';
        try {
            for (const r of rows) {
                if (r.kind !== 'config') continue;
                const raw = await cliManager.getVariable(r.id);
                const parsed = parseGetResponse(r, raw);
                if (parsed.ok) {
                    rowValues[r.id] = parsed.value;
                    originalValues[r.id] = parsed.value;
                }
            }
        } catch (err) {
            errorMessage = errorText(err);
        } finally {
            busy = false;
        }
    }

    // Command-line classification (longest base match, skip rules, queueable /
    // arm / raw) lives in meshcoreConfigState.classifyCommandLine — shared with
    // applyZoneCommands so the file load and the zone commands evolve together.

    function handleSetSelected(content: string): void {
        // Load the file into the queue IN FILE ORDER: every command line becomes
        // one queue entry (verbatim). Config/param rows also fill their card;
        // non-urgent 0-param actions arm; 'time', urgent actions and unknown lines
        // stay raw. No reordering, no validation — the list mirrors the file.
        const lines = trimTrailingEmptyLine(splitIntoCommandLines(content));
        const queue: QueueEntry[] = [];
        for (const line of lines) {
            const c = classifyCommandLine(line, rows);
            if (c.kind === 'skip') continue;
            const t = line.trim();
            if (c.kind === 'value') {
                rowValues[c.row.id] = c.value;
                queue.push({ line: t, rowId: c.row.id });
            } else if (c.kind === 'arm') {
                queue.push({ line: t, rowId: c.row.id });
            } else {
                queue.push({ line: t });
            }
        }
        commandQueue = queue;
        errorMessage = '';
        statusMessage = '';
    }

    function applyAll(): void {
        if (!isConnected || busy || assembledCount === 0) return;
        void doApply();
    }

    // Discard all uncommitted (queued) changes: revert each queued row's current
    // value to its baseline. Config rows return to the last value read from the
    // device (requestSettings baseline); param-action rows have no baseline, so
    // they clear to undefined and leave the queue. Purely local — no device I/O,
    // so it works even while disconnected.
    function discardChanges(): void {
        if (busy || commandQueue.length === 0) return;
        // Revert config rows in the queue to their baseline, then clear the queue.
        for (const e of commandQueue) {
            if (!e.rowId) continue;
            const row = rows.find((r) => r.id === e.rowId);
            if (row?.kind === 'config') rowValues[e.rowId] = originalValues[e.rowId];
        }
        commandQueue = [];
    }

    async function doApply(): Promise<void> {
        if (!cliManager || !isConnected) return;
        busy = true;
        errorMessage = '';
        statusMessage = '';
        // Snapshot the ordered queue before awaiting.
        const entries = [...commandQueue];
        const lines = entries.map((e) => e.line);
        const failures: string[] = [];
        try {
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const parsed = parseCommandDelay(raw);
                if (parsed && parsed.delaySeconds > 0) {
                    // Delayed line: run the countdown (visible in the terminal
                    // console — buffered until the tab is first opened).
                    const outcome = await awaitTermDelay(raw);
                    if (outcome !== 'elapsed' && outcome !== 'early') {
                        // Cancelled/aborted (connection loss): stop the apply the
                        // usual error way — unsent lines stay in the queue.
                        throw new Error($locales('meshcoreconfig.apply_error'));
                    }
                }
                const resp = await cliManager.sendCommand(parsed ? parsed.command : raw);
                // Device signals trouble with "Err ...", "??: ..." or "... fail(ed)".
                if (/^(Err|\?\?)/i.test(resp) || /fail/i.test(resp)) {
                    failures.push(`${raw} → ${resp}`);
                }
                // Give the device time to finish the previous command before the
                // next — unless the next line is delayed: its countdown already
                // paces the queue (a delay REPLACES the pause, never stacks on it).
                if (i < lines.length - 1 && !hasPositiveDelay(lines[i + 1])) {
                    await new Promise((r) => setTimeout(r, 150));
                }
            }
            // Commit config baseline so applied config rows become clean.
            const applied: Record<string, MeshcoreConfigValue> = {};
            let needsReboot = false;
            for (const e of entries) {
                if (!e.rowId) continue;
                const row = rows.find((r) => r.id === e.rowId);
                if (row?.kind === 'config') {
                    applied[row.id] = rowValues[row.id];
                    if (row.needsReboot) needsReboot = true;
                }
            }
            originalValues = { ...originalValues, ...applied };
            commandQueue = []; // all entries sent
            statusMessage = $locales('meshcoreconfig.apply_success');
            if (failures.length > 0) {
                errorMessage = failures.join('  |  ');
                statusMessage = '';
            }
            if (needsReboot) {
                showRebootConfirm = true;
            }
        } catch (err) {
            errorMessage = errorText(err) || $locales('meshcoreconfig.apply_error');
        } finally {
            busy = false;
        }
    }

    // Action rows execute IMMEDIATELY via their own Run button (not the queue).
    function runAction(row: MeshcoreCommandRow): void {
        if (!cliManager || !isConnected || busy) return;
        const line = buildCommand(row, rowValues[row.id]);
        if (row.danger) {
            pendingDangerAction = { row, line };
            return;
        }
        void doRunAction(line);
    }

    async function doRunAction(line: string): Promise<void> {
        if (!cliManager) return;
        // Jump to the terminal so the user sees the command and the device reply.
        // selectTab (not a bare activeTab assignment) mounts the xterm on first open.
        selectTab('terminal');
        busy = true;
        errorMessage = '';
        try {
            await cliManager.sendCommand(line, false);
        } catch (err) {
            errorMessage = errorText(err);
        } finally {
            busy = false;
        }
    }

    async function confirmDangerAction(): Promise<void> {
        const pending = pendingDangerAction;
        pendingDangerAction = null;
        if (pending) await doRunAction(pending.line);
    }

    async function confirmReboot(): Promise<void> {
        showRebootConfirm = false;
        if (!cliManager) return;
        busy = true;
        try {
            await cliManager.reboot();
            await disconnect();
            statusMessage = $locales('meshcoreconfig.reboot_prompt');
        } catch (err) {
            errorMessage = errorText(err) || $locales('meshcoreconfig.apply_error');
        } finally {
            busy = false;
        }
    }

    function toggleGroup(id: string): void {
        const next = new Set(collapsedGroups);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        collapsedGroups = next;
    }

    function setRowValue(id: string, next: MeshcoreConfigValue): void {
        rowValues[id] = next;
        const row = rows.find((r) => r.id === id);
        if (!row) return;
        const line = buildCommand(row, next);
        const idx = commandQueue.findIndex((e) => e.rowId === id);
        if (idx >= 0) {
            // Update in place — keeps the entry's position (file order for loaded rows).
            commandQueue = commandQueue.map((e, i) => (i === idx ? { ...e, line } : e));
        } else {
            commandQueue = [...commandQueue, { line, rowId: id }];
        }
    }

    // Activate the name composer for a resolved zone's template: parse it, seed
    // the inputs with defaults (enum -> first option, free -> '') and write the
    // composed name straight into the `set name` row.
    function applyNameTemplate(tpl: string): void {
        const tokens = parseNameTemplate(tpl);
        activeNameTemplate = tpl;
        composerParts = defaultComposerParts(tokens);
        setRowValue('name', composeName(tokens, composerParts));
    }

    // One composer input changed: update its slot and re-compose the name.
    function updateComposerPart(partIndex: number, val: string): void {
        const next = composerParts.map((p, i) => (i === partIndex ? val : p));
        composerParts = next;
        setRowValue('name', composeName(nameTokens, next));
    }

    // Abandon the zone template composer: drop the template binding so the
    // `set name` row falls back to a plain free-text input. The currently
    // composed name is KEPT (so it can be hand-edited) — only the structured
    // composer controls are removed.
    function clearNameTemplate(): void {
        activeNameTemplate = null;
        composerParts = [];
    }

    // Arm/disarm a 0-param action for the Apply queue (manual add-to-queue).
    function toggleArm(row: MeshcoreCommandRow): void {
        const idx = commandQueue.findIndex((e) => e.rowId === row.id);
        if (idx >= 0) {
            commandQueue = commandQueue.filter((_, i) => i !== idx);
        } else {
            commandQueue = [...commandQueue, { line: row.baseCommand, rowId: row.id }];
        }
    }

    function handleClose(): void {
        if (busy) return;
        // The $effect above handles disconnect when isOpen flips to false.
        onClose();
    }

    // Apply the extra command lines of a zone preset (task 79): same
    // classification as a loaded command-set file, but ADDS to the existing
    // queue instead of replacing it (specialized preset fields are applied
    // first; a later value wins). Known rows fill their card via setRowValue
    // (queue entry updated in place / created); 0-param non-urgent actions arm
    // and time/urgent/unknown lines go in as raw verbatim entries.
    function applyZoneCommands(commands: string[]): void {
        for (const line of commands) {
            const c = classifyCommandLine(line, rows);
            if (c.kind === 'skip') continue;
            if (c.kind === 'value') {
                // A `set name` line supersedes the zone's template composer:
                // drop the structured controls first so the free-text card and
                // the queue entry cannot diverge.
                if (c.row.id === 'name' && activeNameTemplate !== null) clearNameTemplate();
                setRowValue(c.row.id, c.value);
                // A delayed value line must keep its `[dN]` prefix in the queue
                // (same semantics as a loaded command file): setRowValue rebuilds
                // the line from the card value, so patch the entry back to the
                // verbatim original. Manual card edits later drop the prefix (PRD 5.5).
                if (parseCommandDelay(line) !== null) {
                    const idx = commandQueue.findIndex((e) => e.rowId === c.row.id);
                    if (idx >= 0) {
                        const t = line.trim();
                        commandQueue = commandQueue.map((e, i) =>
                            i === idx ? { ...e, line: t } : e
                        );
                    }
                }
            } else if (c.kind === 'arm') {
                commandQueue = [...commandQueue, { line: line.trim(), rowId: c.row.id }];
            } else {
                commandQueue = [...commandQueue, { line: line.trim() }];
            }
        }
    }

    // Shared reception of a picker result (entry points: internal picker
    // onconfirm and the direct-URL picker via the directPickerResult prop,
    // task 78).
    function applyPickerResult(res: PickerResult): void {
        if (res.coords) {
            setRowValue('lat', res.coords.lat);
            setRowValue('lon', res.coords.lon);
        }
        if (res.region && res.region.status === 'hit') {
            const r = res.region;
            if (r.tokens.length > 0) {
                if (regionDefSupported) {
                    setRowValue('region def', r.tokens.join(' '));
                    logZoneMetric('zones_hit');
                } else {
                    logZoneMetric('old_firmware_skipped');
                }
            }
            // Apply the zone's radio preset (full `set radio`) when the
            // configurator exposes that row.
            if (r.radio && hasRow('radio')) {
                setRowValue(
                    'radio',
                    [r.radio.freq, r.radio.bw, r.radio.sf, r.radio.cr].map(String)
                );
                logZoneMetric('zones_radio_applied');
            }
            // Apply path hash mode (firmware-gated >= 1.14).
            if (r.pathHashMode && pathHashSupported && hasRow('path.hash.mode')) {
                setRowValue('path.hash.mode', r.pathHashMode);
                logZoneMetric('zones_pathhash_applied');
            }
            // Activate the node-name composer for the zone's template.
            if (r.nameTemplate && hasRow('name')) {
                applyNameTemplate(r.nameTemplate);
                logZoneMetric('zones_nametemplate_applied');
            }
            // Apply the zone's extra commands AFTER the specialized fields
            // (later application wins on conflicts).
            if (r.commands && r.commands.length > 0) {
                applyZoneCommands(r.commands);
                logZoneMetric('zones_commands_applied');
            }
            // Surface the region's settings-docs link in the toolbar.
            regionDocUrl = r.docUrl || null;
        } else if (res.region && res.region.status === 'miss') {
            regionDocUrl = null;
            logZoneMetric('zones_miss');
        } else {
            regionDocUrl = null;
        }
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meshcore-config-title"
        tabindex="-1"
        onkeydown={(e) => e.key === 'Escape' && !busy && handleClose()}
    >
        <div
            class="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-orange-600 bg-gray-800 shadow-2xl"
        >
            <!-- Header -->
            <div class="flex shrink-0 items-center justify-between border-b border-gray-700 p-6">
                <h2 id="meshcore-config-title" class="text-xl font-semibold text-orange-200">
                    {$locales('meshcoreconfig.title')}
                </h2>
                <button
                    type="button"
                    onclick={handleClose}
                    disabled={busy}
                    class="text-gray-400 transition-colors hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Close modal"
                >
                    &#x2715;
                </button>
            </div>

            <!-- Content: flexes to fill below the header; the panels area below takes the rest. -->
            <div class="flex min-h-0 flex-1 flex-col space-y-4 p-6">
                <!-- Connection row -->
                <div class="flex shrink-0 flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onclick={toggleConnection}
                        disabled={!isSupported || isConnecting || busy}
                        title={$locales('meshcoreconfig.select_port')}
                        class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {connectionLabel}
                    </button>
                    <span class={`h-3 w-3 rounded-full ${statusDotColor}`} aria-hidden="true"
                    ></span>
                    <span class="text-sm text-orange-200">{statusText}</span>
                    {#if deviceVersion}
                        <span class="text-xs text-gray-400">v{deviceVersion.replace(/^v/i, '')}</span>
                    {/if}
                    {#if !isSupported}
                        <span class="text-xs text-red-300">
                            {$locales('meshcoreconfig.no_webserial')}
                        </span>
                    {/if}
                </div>

                <!-- Tab bar: Settings / Terminal. Both panels below stay mounted;
                     the inactive one is hidden so the xterm keeps its state. -->
                <div class="flex shrink-0 gap-1 border-b border-gray-700">
                    <button
                        type="button"
                        onclick={() => selectTab('settings')}
                        class={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-gray-700 text-orange-200' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        {$locales('meshcoreconfig.tab_settings')}
                    </button>
                    <button
                        type="button"
                        onclick={() => selectTab('terminal')}
                        class={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'terminal' ? 'bg-gray-700 text-orange-200' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        {$locales('meshcoreconfig.tab_terminal')}
                    </button>
                </div>

                <!-- Panels: flex to fill the remaining modal height so nothing is clipped
                     and switching tabs never resizes the modal (both panels are h-full of
                     this same box). Settings scrolls, terminal stretches. -->
                <div class="min-h-0 flex-1">
                <!-- Settings panel: all existing settings functionality. -->
                <div
                    class={`h-full space-y-5 overflow-y-auto pr-1 ${activeTab === 'settings' ? '' : 'hidden'}`}
                >
                <!-- Toolbar: Request settings, load command set, single Apply, EOL -->
                <div class="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onclick={requestSettings}
                        disabled={!isConnected || busy}
                        class="rounded-md bg-gray-700 px-3 py-2 text-sm text-orange-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {$locales('meshcoreconfig.request_settings')}
                    </button>

                    {#if experimentalFeatures}
                        <McCommandSetPicker
                            onselect={handleSetSelected}
                            label={$locales('meshcoreconfig.load_command_set')}
                            dropup={false}
                        />
                    {/if}

                    <!-- Single Apply for the whole assembled queue (config + actions). -->
                    <button
                        type="button"
                        onclick={applyAll}
                        disabled={!isConnected || busy || assembledCount === 0 || nameIncomplete}
                        title={nameIncomplete ? $locales('meshcoreconfig.zones.name_incomplete') : ''}
                        class="rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {$locales('meshcoreconfig.apply')}
                        {#if assembledCount > 0}
                            <span class="ml-1 rounded-full bg-orange-600 px-1.5 py-0.5 text-xs">
                                {assembledCount}
                            </span>
                        {/if}
                    </button>

                    <!-- Discard all uncommitted (queued) changes back to baseline. -->
                    <button
                        type="button"
                        onclick={discardChanges}
                        disabled={busy || assembledCount === 0}
                        class="rounded-md bg-gray-700 px-3 py-2 text-sm text-orange-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {$locales('meshcoreconfig.discard_changes')}
                    </button>

                    <select
                        bind:value={selectedLineEnding}
                        title="EOL"
                        class="rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-orange-500 focus:ring-orange-500"
                    >
                        <option value="lf">LF</option>
                        <option value="crlf">CRLF</option>
                        <option value="cr">CR</option>
                    </select>

                    <!-- Docs link (external) -->
                    <a
                        href="https://docs.meshcore.io/cli_commands"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-xs text-orange-300 underline hover:text-orange-200"
                    >
                        {$locales('meshcoreconfig.docs')}
                    </a>

                    <!-- Regional settings-docs link for the applied zone preset
                         (meshcore.docUrl from the resolved region). -->
                    {#if regionDocUrl}
                        <a
                            href={regionDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-xs text-sky-400 underline hover:text-sky-300"
                        >
                            {$locales('meshcoreconfig.regional_docs')}
                        </a>
                    {/if}
                </div>

                <!-- Status / error messages -->
                {#if errorMessage}
                    <div
                        role="alert"
                        aria-live="assertive"
                        class="rounded-md border border-red-700 bg-red-900/60 p-3 text-sm text-red-200"
                    >
                        {errorMessage}
                    </div>
                {/if}
                {#if statusMessage && !errorMessage}
                    <div
                        role="status"
                        aria-live="polite"
                        class="rounded-md bg-gray-700 p-3 text-sm text-orange-200"
                    >
                        {statusMessage}
                    </div>
                {/if}
                {#if showRebootConfirm}
                    <!-- Compact reboot hint: the changes are already applied, a reboot
                         only activates them — so this is a non-blocking inline banner
                         (replaces the old full-screen confirm modal: less text, less space). -->
                    <div
                        role="status"
                        aria-live="polite"
                        class="flex items-center gap-2 rounded-md border border-yellow-600 bg-yellow-900/30 px-3 py-2 text-sm text-yellow-100"
                    >
                        <span aria-hidden="true">⚠</span>
                        <span class="flex-1">{$locales('meshcoreconfig.reboot_banner')}</span>
                        <button
                            type="button"
                            onclick={confirmReboot}
                            class="shrink-0 rounded bg-yellow-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-yellow-600"
                        >
                            ⟳ {$locales('meshcoreconfig.reboot_now')}
                        </button>
                        <button
                            type="button"
                            onclick={() => (showRebootConfirm = false)}
                            class="shrink-0 text-yellow-300/70 transition-colors hover:text-yellow-100"
                            aria-label={$locales('common.close')}
                        >
                            &#x2715;
                        </button>
                    </div>
                {/if}

                <!-- Body: unified groups (left, wider) + assembled command list (right) -->
                <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
                    <!-- Left: grouped rows in an auto-fill grid -->
                    <div class="space-y-4">
                        {#each groups as group (group.id)}
                            {@const groupRows = rowsByGroup.get(group.id) ?? []}
                            {#if groupRows.length > 0}
                                <div class="rounded-md border border-gray-700 bg-gray-900/50">
                                    <div
                                        class="flex items-center border-b border-gray-700/60"
                                    >
                                        <button
                                            type="button"
                                            onclick={() => toggleGroup(group.id)}
                                            class="flex flex-1 items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-gray-800/50"
                                            aria-expanded={!collapsedGroups.has(group.id)}
                                        >
                                            <span class="flex items-center gap-2">
                                                <span class="text-sm font-semibold uppercase tracking-wide text-orange-300">
                                                    {$locales(`meshcoreconfig.group_${group.labelKey}`)}
                                                </span>
                                                {#if groupQueueCount(group.id) > 0}
                                                    <span class="rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                                        {groupQueueCount(group.id)}
                                                    </span>
                                                {/if}
                                            </span>
                                            <span class="text-xs text-gray-400">
                                                {collapsedGroups.has(group.id) ? '▶' : '▼'}
                                            </span>
                                        </button>
                                        {#if group.id === 'region'}
                                            <div class="flex items-center gap-1 pr-2">
                                                <button
                                                    type="button"
                                                    onclick={() => {
                                                        pickerInitial = {
                                                            detectCoords: false,
                                                            detectRegions: true
                                                        };
                                                        showMapPicker = true;
                                                    }}
                                                    class="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-orange-200 transition-colors hover:bg-gray-600 animate-blink-attention"
                                                    title={$locales('meshcoreconfig.zones.detect_regions')}
                                                >
                                                    📍
                                                </button>
                                            </div>
                                        {/if}
                                    </div>
                                    {#if !collapsedGroups.has(group.id)}
                                        <div
                                            class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] p-3"
                                        >
                                            {#each groupRows as r (r.id)}
                                                {#if r.id === 'lat'}
                                                    <!-- Combined coordinates card: lat + lon stay side by side. -->
                                                    <div
                                                        class={`rounded-lg border px-3 py-2 transition-colors ${coordsDirty ? 'border-orange-600/70 bg-orange-900/10' : 'border-gray-700/60 bg-gray-900/40 hover:border-gray-600'}`}
                                                    >
                                                        <div
                                                            class="mb-1.5 flex items-center justify-between gap-2"
                                                        >
                                                            <span class="flex items-center gap-2">
                                                                <span
                                                                    class="text-xs font-semibold uppercase tracking-wide text-gray-400"
                                                                >
                                                                    {$locales('meshcoreconfig.coordinates')}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onclick={() => {
                                                                        pickerInitial = {
                                                                            detectCoords: true,
                                                                            detectRegions: false
                                                                        };
                                                                        showMapPicker = true;
                                                                    }}
                                                                    class="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-orange-200 transition-colors hover:bg-gray-600 animate-blink-attention"
                                                                    title={$locales('meshcoreconfig.pick_on_map')}
                                                                >
                                                                    📍
                                                                </button>
                                                            </span>
                                                            {#if coordsDirty}
                                                                <span
                                                                    class="shrink-0 rounded-full bg-orange-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-200"
                                                                >
                                                                    {$locales('meshcoreconfig.dirty_badge')}
                                                                </span>
                                                            {/if}
                                                        </div>
                                                        <div class="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label
                                                                    class="mb-1 block text-[11px] text-gray-500"
                                                                >
                                                                    lat
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    inputmode="decimal"
                                                                    class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                                                                    value={rowValues['lat'] ?? ''}
                                                                    onchange={(e) =>
                                                                        setRowValue(
                                                                            'lat',
                                                                            Number(
                                                                                (
                                                                                    e.currentTarget as HTMLInputElement
                                                                                ).value.replace(',', '.')
                                                                            )
                                                                        )}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label
                                                                    class="mb-1 block text-[11px] text-gray-500"
                                                                >
                                                                    lon
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    inputmode="decimal"
                                                                    class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                                                                    value={rowValues['lon'] ?? ''}
                                                                    onchange={(e) =>
                                                                        setRowValue(
                                                                            'lon',
                                                                            Number(
                                                                                (
                                                                                    e.currentTarget as HTMLInputElement
                                                                                ).value.replace(',', '.')
                                                                            )
                                                                        )}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                {:else if r.id === 'lon'}
                                                    <!-- rendered inside the coordinates card -->
                                                {:else if r.id === 'time'}
                                                    <!-- time action: epoch seconds input + "now" button -->
                                                    <div
                                                        class={`rounded-lg border px-3 py-2 transition-colors ${inQueue(r) ? 'border-orange-600/70 bg-orange-900/10' : 'border-gray-700/60 bg-gray-900/40 hover:border-gray-600'}`}
                                                    >
                                                        <div
                                                            class="mb-1.5 flex items-center justify-between gap-2"
                                                        >
                                                            <span
                                                                class="text-xs font-semibold uppercase tracking-wide text-gray-400"
                                                                title={r.label}
                                                            >
                                                                {r.id}
                                                            </span>
                                                            {#if inQueue(r)}
                                                                <span
                                                                    class="shrink-0 rounded-full bg-orange-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-200"
                                                                >
                                                                    {$locales('meshcoreconfig.dirty_badge')}
                                                                </span>
                                                            {/if}
                                                        </div>
                                                        <div class="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                class="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                                                                value={rowValues['time'] ?? ''}
                                                                onchange={(e) =>
                                                                    setRowValue(
                                                                        'time',
                                                                        Number(
                                                                            (
                                                                                e.currentTarget as HTMLInputElement
                                                                            ).value.replace(',', '.')
                                                                        )
                                                                    )}
                                                            />
                                                            <button
                                                                type="button"
                                                                onclick={sendCurrentTime}
                                                                class="shrink-0 rounded-md bg-gray-700 px-2 py-1.5 text-xs text-orange-200 transition-colors hover:bg-gray-600"
                                                                title={$locales('meshcoreconfig.time_now')}
                                                            >
                                                                🕐
                                                            </button>
                                                        </div>
                                                    </div>
                                                {:else if r.id === 'name' && activeNameTemplate}
                                                    <!-- Name composer: the zone's template drives inline enum
                                                         selects + free inputs; the composed name is written to
                                                         the `set name` row via setRowValue. -->
                                                    <div
                                                        class={`rounded-lg border px-3 py-2 transition-colors ${inQueue(r) ? 'border-orange-600/70 bg-orange-900/10' : 'border-gray-700/60 bg-gray-900/40 hover:border-gray-600'}`}
                                                    >
                                                        <div
                                                            class="mb-1.5 flex items-center justify-between gap-2"
                                                        >
                                                            <span
                                                                class="text-xs font-semibold uppercase tracking-wide text-gray-400"
                                                                title={r.label}
                                                            >
                                                                {r.id}
                                                            </span>
                                                            <div class="flex items-center gap-1">
                                                                {#if inQueue(r)}
                                                                    <span
                                                                        class="shrink-0 rounded-full bg-orange-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-200"
                                                                    >
                                                                        {$locales('meshcoreconfig.dirty_badge')}
                                                                    </span>
                                                                {/if}
                                                                <button
                                                                    type="button"
                                                                    onclick={clearNameTemplate}
                                                                    title={$locales('meshcoreconfig.zones.name_template_clear')}
                                                                    class="shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div class="flex flex-wrap items-center gap-1">
                                                            {#each nameTokens as tok, i (i)}
                                                                {#if tok.type === 'literal'}
                                                                    <span class="text-xs text-gray-500">{tok.value}</span>
                                                                {:else if tok.type === 'enum'}
                                                                    {@const pi = nameTokenComposerIndex[i]}
                                                                    <select
                                                                        class="rounded border border-gray-600 bg-gray-700 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                                                                        value={composerParts[pi] ?? ''}
                                                                        onchange={(e) =>
                                                                            updateComposerPart(
                                                                                pi,
                                                                                (e.currentTarget as HTMLSelectElement).value
                                                                            )}
                                                                    >
                                                                        {#each tok.options as opt (opt)}
                                                                            <option value={opt}>{opt}</option>
                                                                        {/each}
                                                                    </select>
                                                                {:else}
                                                                    {@const pi = nameTokenComposerIndex[i]}
                                                                    <input
                                                                        type="text"
                                                                        maxlength="32"
                                                                        placeholder={tok.optional ? `${tok.name}?` : tok.name}
                                                                        use:fillHint
                                                                        class="w-16 rounded border border-gray-600 bg-gray-700 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-orange-500"
                                                                        value={composerParts[pi] ?? ''}
                                                                        oninput={(e) =>
                                                                            updateComposerPart(
                                                                                pi,
                                                                                (e.currentTarget as HTMLInputElement).value
                                                                            )}
                                                                    />
                                                                {/if}
                                                            {/each}
                                                        </div>
                                                        {#if nameTooLong}
                                                            <span class="mt-1 block text-[10px] text-red-400">
                                                                {$locales('meshcoreconfig.zones.name_too_long')}
                                                            </span>
                                                        {/if}
                                                        {#if nameIncomplete}
                                                            <span class="mt-1 block text-[10px] text-red-400">
                                                                {$locales('meshcoreconfig.zones.name_incomplete')}
                                                            </span>
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <MeshcoreConfigRow
                                                        row={r}
                                                        value={rowValues[r.id]}
                                                        dirty={inQueue(r)}
                                                        canRun={isConnected && !busy}
                                                        armed={inQueue(r)}
                                                        onchange={(next) => setRowValue(r.id, next)}
                                                        onsend={() => runAction(r)}
                                                        onarm={() => toggleArm(r)}
                                                    />
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>

                    <!-- Right: the assembled send queue (exact truth for Apply) -->
                    <div>
                        <MeshcoreConfigCommandList
                            setLines={assembled}
                            lineEnding={selectedLineEnding}
                        />
                    </div>
                </div>
                </div><!-- /Settings panel -->

                <!-- Terminal panel (lazily mounted on first open so xterm sizes correctly). -->
                {#if terminalEverOpened}
                <div
                    class={`h-full flex flex-col space-y-3 ${activeTab === 'terminal' ? '' : 'hidden'}`}
                >
                    <div
                        class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-800"
                    >
                        <!-- h-full w-full forwards onto the component's host <div> (via its
                             {...rest} spread) so it stretches to the flex-1 box; otherwise
                             fitAddon.fit() sizes the canvas to the collapsed host height. -->
                        <Xterm options={terminalOptions} {onLoad} class="h-full w-full" />
                    </div>
                    <div class="shrink-0">
                        <CommandInput
                            bind:value={termInput}
                            isConnected={isConnected}
                            isMassRunning={isMassRunning}
                            isSendBlocked={isMassRunning || isTermWaiting}
                            onSubmit={handleTermSubmit}
                            onsendall={runTermMassSend}
                            onsendline={sendTermLine}
                            placeholder={$locales('meshcoreconfig.terminal_input_placeholder')}
                            {commandHistory}
                            bind:historyIndex
                            {showCommandShortDescriptions}
                            bind:currentLine
                        />
                    </div>
                    <MultilineControls
                        isMultiline={true}
                        isConnected={isConnected}
                        isMassRunning={isMassRunning}
                        isWaiting={isTermWaiting}
                        lastSentIndex={massSentIndex}
                        totalLines={splitIntoCommandLines(termInput).filter(
                            (l) => l.trim() && !isModeSwitchLine(l)
                        ).length}
                        limitExceeded={false}
                        onsendall={runTermMassSend}
                        onstop={stopTermMassSend}
                    />
                </div>
                {/if}
                </div><!-- /panels wrapper -->
            </div>
        </div>
    </div>

    <!-- Destructive action confirmation (reboot/erase run immediately). -->
    {#if pendingDangerAction}
        <div
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meshcore-danger-title"
        >
            <div class="max-w-md rounded-lg border border-orange-600 bg-gray-800 p-6 shadow-2xl">
                <h3 id="meshcore-danger-title" class="mb-4 text-lg font-semibold text-orange-200">
                    {$locales('meshcoreconfig.apply_confirm', { values: { count: 1 } })}
                    <span class="mt-1 block font-mono text-sm text-orange-300">
                        {pendingDangerAction.line}
                    </span>
                </h3>
                <div class="flex justify-end gap-3">
                    <button
                        type="button"
                        onclick={() => (pendingDangerAction = null)}
                        class="rounded-md bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
                    >
                        {$locales('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onclick={confirmDangerAction}
                        class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                    >
                        {$locales('meshcoreconfig.apply')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Coordinate map picker (coords and/or region lookup entry points) -->
    {#if showMapPicker}
        <CoordinateMapPicker
            lat={typeof rowValues['lat'] === 'number' ? (rowValues['lat'] as number) : undefined}
            lon={typeof rowValues['lon'] === 'number' ? (rowValues['lon'] as number) : undefined}
            detectCoords={pickerInitial.detectCoords}
            detectRegions={pickerInitial.detectRegions}
            onconfirm={(res: PickerResult) => {
                applyPickerResult(res);
                showMapPicker = false;
            }}
            onclose={() => (showMapPicker = false)}
        />
    {/if}
{/if}
