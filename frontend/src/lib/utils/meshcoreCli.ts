// Shared Web Serial manager for MeshCore text commands.
// Owns the port and a single read loop that TEES every decoded chunk to:
//   - onChunk(data) subscriber (e.g. xterm display, so the user sees all traffic)
//   - the marker framer (resolves framed sendCommand responses)
// Web Serial reader is exclusive, so the configurator's get/set logic and the
// embedded terminal share this one manager (one Connect).
//
// Framing mirrors the official config.meshcore.io: the device prefixes each
// response line with "  -> " (matched as "-> "). sendCommand(command, true)
// returns the single framed response line (e.g. "> value", "OK", "??: …").

export type MeshcoreCliStatus = 'disconnected' | 'connecting' | 'connected';

export interface MeshcoreCliManagerOptions {
    baudRate?: number;
    responseTimeoutMs?: number;
    onStatusChange?: (status: MeshcoreCliStatus) => void;
    /** Receives every decoded chunk from the device (and the `>> cmd` echo of sent commands). */
    onChunk?: (data: string) => void;
}

// The device prefixes its response line with this marker.
const RESPONSE_MARKER = '-> ';

export function createMeshcoreCliManager(options?: MeshcoreCliManagerOptions) {
    const baudRate = options?.baudRate ?? 115200;
    const responseTimeoutMs = options?.responseTimeoutMs ?? 5000;
    const onStatusChange = options?.onStatusChange;
    const onChunk = options?.onChunk;

    let serialPort: SerialPort | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    let reading = false;
    let readBuffer = '';
    let status: MeshcoreCliStatus = 'disconnected';
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // A single in-flight framed command (the caller serializes framed sends).
    type Pending = {
        command: string;
        resolve: (line: string) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    };
    let pending: Pending | null = null;

    function setStatus(next: MeshcoreCliStatus): void {
        status = next;
        onStatusChange?.(status);
    }

    function isSupported(): boolean {
        return typeof navigator !== 'undefined' && 'serial' in navigator;
    }

    // Resolve the pending framed command once its response line is in the buffer.
    function tryResolve(): void {
        if (!pending) return;
        const { command } = pending;

        const withCrlf = command + '\r\n';
        const withCr = command + '\r';
        let echoEnd = readBuffer.indexOf(withCrlf);
        if (echoEnd !== -1) echoEnd += withCrlf.length;
        else {
            echoEnd = readBuffer.indexOf(withCr);
            echoEnd = echoEnd !== -1 ? echoEnd + withCr.length : 0;
        }

        const markerIdx = readBuffer.indexOf(RESPONSE_MARKER, echoEnd);
        if (markerIdx === -1) return;

        const payloadStart = markerIdx + RESPONSE_MARKER.length;
        let eol = readBuffer.indexOf('\r\n', payloadStart);
        let eolLen = 2;
        if (eol === -1) {
            eol = readBuffer.indexOf('\n', payloadStart);
            eolLen = 1;
        }
        if (eol === -1) return;

        const line = readBuffer.substring(payloadStart, eol).trim();
        readBuffer = readBuffer.substring(eol + eolLen);
        finish(line);
    }

    function finish(line: string): void {
        if (!pending) return;
        const p = pending;
        clearTimeout(p.timer);
        pending = null;
        p.resolve(line);
    }

    async function readLoop(): Promise<void> {
        if (!reader) return;
        reading = true;
        try {
            while (reading) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    const decoded = decoder.decode(value, { stream: true });
                    onChunk?.(decoded); // tee to display subscribers (xterm)
                    readBuffer += decoded; // feed the framer
                    tryResolve();
                }
            }
        } catch {
            // Read errors are expected on disconnect; ignore them.
        } finally {
            reading = false;
        }
    }

    async function connect(): Promise<void> {
        if (!isSupported()) {
            throw new Error('Web Serial is not supported on this device');
        }
        setStatus('connecting');
        try {
            const port: SerialPort = await (navigator as any).serial.requestPort();
            await port.open({ baudRate });
            reader = port.readable?.getReader() ?? null;
            writer = port.writable?.getWriter() ?? null;
            serialPort = port;
            readBuffer = '';
            pending = null;
            readLoop();
            setStatus('connected');
        } catch (err) {
            setStatus('disconnected');
            throw err;
        }
    }

    async function disconnect(): Promise<void> {
        reading = false;
        if (pending) {
            clearTimeout(pending.timer);
            const rej = pending.reject;
            pending = null;
            rej(new Error('Disconnected'));
        }
        try { if (reader) await reader.cancel(); } catch { /* ignore */ }
        try { if (writer) await writer.close(); } catch { /* ignore */ }
        try { reader?.releaseLock(); } catch { /* ignore */ }
        try { writer?.releaseLock(); } catch { /* ignore */ }
        try { if (serialPort) await serialPort.close(); } catch { /* ignore */ }
        reader = null;
        writer = null;
        serialPort = null;
        readBuffer = '';
        pending = null;
        setStatus('disconnected');
    }

    // Send a command. `frame=true` waits for the framed response line (get/set);
    // `frame=false` just writes (manual terminal input — output is shown via onChunk).
    // In both cases a cyan `>> command` echo is emitted via onChunk so the user sees
    // what was sent.
    function sendCommand(command: string, frame = true): Promise<string> {
        if (!serialPort || !writer || status !== 'connected') {
            return Promise.reject(new Error('Not connected'));
        }
        const w = writer;
        onChunk?.(`\x1b[1;36m>> ${command}\x1b[0m\r\n`);
        readBuffer = ''; // clean framing per command
        const writeP = w.write(encoder.encode(command + '\r'));
        if (!frame) {
            return writeP.then(() => '');
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pending && pending.command === command) {
                    pending = null;
                    reject(new Error(`Response timeout: ${command}`));
                }
            }, responseTimeoutMs);
            pending = { command, resolve, reject, timer };
            writeP.catch((err: unknown) => {
                clearTimeout(timer);
                pending = null;
                reject(err instanceof Error ? err : new Error(String(err)));
            });
        });
    }

    // Raw write without echo or framing (e.g. mass-send of prebuilt lines).
    function writeRaw(data: string): Promise<void> {
        if (!writer || status !== 'connected') {
            return Promise.reject(new Error('Not connected'));
        }
        return writer.write(encoder.encode(data));
    }

    const getVariable = (key: string) => sendCommand(`get ${key}`);
    const setVariable = (key: string, value: string) => sendCommand(`set ${key} ${value}`);
    const reboot = () => sendCommand('reboot');

    return {
        connect,
        disconnect,
        sendCommand,
        writeRaw,
        getVariable,
        setVariable,
        reboot,
        isSupported,
        getStatus: () => status
    };
}
