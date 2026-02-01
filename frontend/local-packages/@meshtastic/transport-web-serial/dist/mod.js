import { Types, Utils } from "@meshtastic/core";

//#region src/transport.ts
/**
* Provides Web Serial transport for Meshtastic devices.
*
* Implements the {@link Types.Transport} contract using the Web Serial API.
* Use {@link TransportWebSerial.create} or {@link TransportWebSerial.createFromPort}
* to construct an instance.
*/
var TransportWebSerial = class TransportWebSerial {
	_toDevice;
	_fromDevice;
	fromDeviceController;
	connection;
	pipePromise = null;
	abortController;
	portReadable;
	lastStatus = Types.DeviceStatusEnum.DeviceDisconnected;
	closingByUser = false;
	/**
	* Create a new TransportWebSerial instance using a serial port.
	*/
	static async create(baudRate) {
		const port = await navigator.serial.requestPort();
		await port.open({ baudRate: baudRate || 115200 });
		return new TransportWebSerial(port);
	}
	/**
	* Creates a new TransportWebSerial instance from an existing, provided {@link SerialPort}.
	* Opens it if not already open.
	*/
	static async createFromPort(port, baudRate) {
		if (!port.readable || !port.writable) await port.open({ baudRate: baudRate || 115200 });
		return new TransportWebSerial(port);
	}
	/**
	* Constructs a transport around a given {@link SerialPort}.
	* @throws If the port lacks readable or writable streams.
	*/
	constructor(connection) {
		if (!connection.readable || !connection.writable) throw new Error("Stream not accessible");
		this.connection = connection;
		this.portReadable = connection.readable;
		this.abortController = new AbortController();
		const abortController = this.abortController;
		const toDeviceTransform = Utils.toDeviceStream();
		this.pipePromise = toDeviceTransform.readable.pipeTo(connection.writable, { signal: this.abortController.signal }).catch((err) => {
			if (abortController.signal.aborted) return;
			console.error("Error piping data to serial port:", err);
			this.connection.close().catch(() => {});
			this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "write-error");
		});
		this._toDevice = toDeviceTransform.writable;
		this._fromDevice = new ReadableStream({ start: async (ctrl) => {
			this.fromDeviceController = ctrl;
			this.emitStatus(Types.DeviceStatusEnum.DeviceConnecting);
			const transformed = this.portReadable.pipeThrough(Utils.fromDeviceStream());
			const reader = transformed.getReader();
			const onOsDisconnect = (ev) => {
				const { port } = ev;
				if (port && port === this.connection) this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "serial-disconnected");
			};
			navigator.serial.addEventListener("disconnect", onOsDisconnect);
			this.emitStatus(Types.DeviceStatusEnum.DeviceConnected);
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					ctrl.enqueue(value);
				}
				ctrl.close();
			} catch (error) {
				if (!this.closingByUser) this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "read-error");
				ctrl.error(error instanceof Error ? error : new Error(String(error)));
				try {
					await transformed.cancel();
				} catch {}
			} finally {
				reader.releaseLock();
				navigator.serial.removeEventListener("disconnect", onOsDisconnect);
			}
		} });
	}
	/** Writable stream of bytes to the device. */
	get toDevice() {
		return this._toDevice;
	}
	/** Readable stream of {@link Types.DeviceOutput} from the device. */
	get fromDevice() {
		return this._fromDevice;
	}
	emitStatus(next, reason) {
		if (next === this.lastStatus) return;
		this.lastStatus = next;
		this.fromDeviceController?.enqueue({
			type: "status",
			data: {
				status: next,
				reason
			}
		});
	}
	/**
	* Closes the serial port and emits `DeviceDisconnected("user")`.
	*/
	async disconnect() {
		try {
			this.closingByUser = true;
			this.abortController.abort();
			if (this.pipePromise) await this.pipePromise;
			if (this._fromDevice?.locked) try {
				await this._fromDevice.cancel();
			} catch {}
			await this.connection.close();
		} catch (error) {
			console.warn("Could not cleanly disconnect serial port:", error);
		} finally {
			this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "user");
			this.closingByUser = false;
		}
	}
	/**
	* Reconnects the transport by creating a new AbortController and re-establishing
	* the pipe connection. Only call this after disconnect() or if the connection failed.
	*/
	async reconnect() {
		this.emitStatus(Types.DeviceStatusEnum.DeviceConnecting, "reconnect");
		try {
			if (!this.connection.readable || !this.connection.writable) throw new Error("Stream not accessible");
			this.portReadable = this.connection.readable;
			this.abortController = new AbortController();
			const abortController = this.abortController;
			const toDeviceTransform = Utils.toDeviceStream();
			this.pipePromise = toDeviceTransform.readable.pipeTo(this.connection.writable, { signal: this.abortController.signal }).catch((error) => {
				if (abortController.signal.aborted) return;
				console.error("Error piping data to serial port (reconnect):", error);
				this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "write-error");
			});
			this.emitStatus(Types.DeviceStatusEnum.DeviceConnected, "reconnected");
		} catch (error) {
			this.emitStatus(Types.DeviceStatusEnum.DeviceDisconnected, "reconnect-failed");
			throw error;
		}
	}
};

//#endregion
export { TransportWebSerial };