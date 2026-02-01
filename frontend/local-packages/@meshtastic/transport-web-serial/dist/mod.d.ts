import { Types } from "@meshtastic/core";

//#region src/transport.d.ts

/**
 * Provides Web Serial transport for Meshtastic devices.
 *
 * Implements the {@link Types.Transport} contract using the Web Serial API.
 * Use {@link TransportWebSerial.create} or {@link TransportWebSerial.createFromPort}
 * to construct an instance.
 */
declare class TransportWebSerial implements Types.Transport {
  private _toDevice;
  private _fromDevice;
  private fromDeviceController?;
  private connection;
  private pipePromise;
  private abortController;
  private portReadable;
  private lastStatus;
  private closingByUser;
  /**
   * Create a new TransportWebSerial instance using a serial port.
   */
  static create(baudRate?: number): Promise<TransportWebSerial>;
  /**
   * Creates a new TransportWebSerial instance from an existing, provided {@link SerialPort}.
   * Opens it if not already open.
   */
  static createFromPort(port: SerialPort, baudRate?: number): Promise<TransportWebSerial>;
  /**
   * Constructs a transport around a given {@link SerialPort}.
   * @throws If the port lacks readable or writable streams.
   */
  constructor(connection: SerialPort);
  /** Writable stream of bytes to the device. */
  get toDevice(): WritableStream<Uint8Array>;
  /** Readable stream of {@link Types.DeviceOutput} from the device. */
  get fromDevice(): ReadableStream<Types.DeviceOutput>;
  private emitStatus;
  /**
   * Closes the serial port and emits `DeviceDisconnected("user")`.
   */
  disconnect(): Promise<void>;
  /**
   * Reconnects the transport by creating a new AbortController and re-establishing
   * the pipe connection. Only call this after disconnect() or if the connection failed.
   */
  reconnect(): Promise<void>;
}
//#endregion
export { TransportWebSerial };