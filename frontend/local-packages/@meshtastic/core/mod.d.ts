import * as Protobuf$4 from "@meshtastic/protobufs";
import * as Protobuf$3 from "@meshtastic/protobufs";
import * as Protobuf$2 from "@meshtastic/protobufs";
import * as Protobuf$1 from "@meshtastic/protobufs";
import * as Protobuf from "@meshtastic/protobufs";
import { Logger } from "tslog";
import { SimpleEventDispatcher } from "ste-simple-events";

//#region src/constants.d.ts
declare const Constants: {
  broadcastNum: number;
  minFwVer: number;
};
declare namespace types_d_exports {
  export { ChannelNumber, Destination, DeviceOutput, DeviceStatusEnum, Emitter, EmitterScope, HttpRetryConfig, LogEvent, LogEventPacket, PacketDestination, PacketError, PacketMetadata, QueueItem, Transport };
}
interface Packet {
  type: "packet";
  data: Uint8Array;
}
interface DebugLog {
  type: "debug";
  data: string;
}
interface StatusEvent {
  type: "status";
  data: {
    status: DeviceStatusEnum;
    reason?: string;
  };
}
type DeviceOutput = Packet | DebugLog | StatusEvent;
interface Transport {
  toDevice: WritableStream<Uint8Array>;
  fromDevice: ReadableStream<DeviceOutput>;
  disconnect(): Promise<void>;
}
interface QueueItem {
  id: number;
  data: Uint8Array;
  sent: boolean;
  added: Date;
  promise: Promise<number>;
}
interface HttpRetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}
declare enum DeviceStatusEnum {
  DeviceRestarting = 1,
  DeviceDisconnected = 2,
  DeviceConnecting = 3,
  DeviceReconnecting = 4,
  DeviceConnected = 5,
  DeviceConfiguring = 6,
  DeviceConfigured = 7,
  DeviceError = 8,
}
type LogEventPacket = LogEvent & {
  date: Date;
};
type PacketDestination = "broadcast" | "direct";
interface PacketMetadata<T> {
  id: number;
  rxTime: Date;
  type: PacketDestination;
  from: number;
  to: number;
  channel: ChannelNumber;
  data: T;
}
declare enum EmitterScope {
  MeshDevice = 1,
  SerialConnection = 2,
  NodeSerialConnection = 3,
  BleConnection = 4,
  HttpConnection = 5,
}
declare enum Emitter {
  Constructor = 0,
  SendText = 1,
  SendWaypoint = 2,
  SendPacket = 3,
  SendRaw = 4,
  SetConfig = 5,
  SetModuleConfig = 6,
  ConfirmSetConfig = 7,
  SetOwner = 8,
  SetChannel = 9,
  ConfirmSetChannel = 10,
  ClearChannel = 11,
  GetChannel = 12,
  GetAllChannels = 13,
  GetConfig = 14,
  GetModuleConfig = 15,
  GetOwner = 16,
  Configure = 17,
  HandleFromRadio = 18,
  HandleMeshPacket = 19,
  Connect = 20,
  Ping = 21,
  ReadFromRadio = 22,
  WriteToRadio = 23,
  SetDebugMode = 24,
  GetMetadata = 25,
  ResetNodes = 26,
  Shutdown = 27,
  Reboot = 28,
  RebootOta = 29,
  FactoryReset = 30,
  EnterDfuMode = 31,
  RemoveNodeByNum = 32,
  SetCannedMessages = 33,
  Disconnect = 34,
  ConnectionStatus = 35,
}
interface LogEvent {
  scope: EmitterScope;
  emitter: Emitter;
  message: string;
  level: Protobuf$4.Mesh.LogRecord_Level;
  packet?: Uint8Array;
}
declare enum ChannelNumber {
  Primary = 0,
  Channel1 = 1,
  Channel2 = 2,
  Channel3 = 3,
  Channel4 = 4,
  Channel5 = 5,
  Channel6 = 6,
  Admin = 7,
}
type Destination = number | "self" | "broadcast";
interface PacketError {
  id: number;
  error: Protobuf$4.Mesh.Routing_Error;
}
//#endregion
//#region src/utils/eventSystem.d.ts
declare class EventSystem {
  /**
   * Fires when a new FromRadio message has been received from the device
   *
   * @event onLogEvent
   */
  readonly onLogEvent: SimpleEventDispatcher<LogEventPacket>;
  /**
   * Fires when a new FromRadio message has been received from the device
   *
   * @event onFromRadio
   */
  readonly onFromRadio: SimpleEventDispatcher<Protobuf$3.Mesh.FromRadio>;
  /**
   * Fires when a new FromRadio message containing a Data packet has been
   * received from the device
   *
   * @event onMeshPacket
   */
  readonly onMeshPacket: SimpleEventDispatcher<Protobuf$3.Mesh.MeshPacket>;
  /**
   * Fires when a new MyNodeInfo message has been received from the device
   *
   * @event onMyNodeInfo
   */
  readonly onMyNodeInfo: SimpleEventDispatcher<Protobuf$3.Mesh.MyNodeInfo>;
  /**
   * Fires when a new MeshPacket message containing a NodeInfo packet has been
   * received from device
   *
   * @event onNodeInfoPacket
   */
  readonly onNodeInfoPacket: SimpleEventDispatcher<Protobuf$3.Mesh.NodeInfo>;
  /**
   * Fires when a new Channel message is received
   *
   * @event onChannelPacket
   */
  readonly onChannelPacket: SimpleEventDispatcher<Protobuf$3.Channel.Channel>;
  /**
   * Fires when a new Config message is received
   *
   * @event onConfigPacket
   */
  readonly onConfigPacket: SimpleEventDispatcher<Protobuf$3.Config.Config>;
  /**
   * Fires when a new ModuleConfig message is received
   *
   * @event onModuleConfigPacket
   */
  readonly onModuleConfigPacket: SimpleEventDispatcher<Protobuf$3.ModuleConfig.ModuleConfig>;
  /**
   * Fires when a new MeshPacket message containing a ATAK packet has been
   * received from device
   *
   * @event onAtakPacket
   */
  readonly onAtakPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Text packet has been
   * received from device
   *
   * @event onMessagePacket
   */
  readonly onMessagePacket: SimpleEventDispatcher<PacketMetadata<string>>;
  /**
   * Fires when a new MeshPacket message containing a Remote Hardware packet has
   * been received from device
   *
   * @event onRemoteHardwarePacket
   */
  readonly onRemoteHardwarePacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.RemoteHardware.HardwareMessage>>;
  /**
   * Fires when a new MeshPacket message containing a Position packet has been
   * received from device
   *
   * @event onPositionPacket
   */
  readonly onPositionPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.Position>>;
  /**
   * Fires when a new MeshPacket message containing a User packet has been
   * received from device
   *
   * @event onUserPacket
   */
  readonly onUserPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.User>>;
  /**
   * Fires when a new MeshPacket message containing a Routing packet has been
   * received from device
   *
   * @event onRoutingPacket
   */
  readonly onRoutingPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.Routing>>;
  /**
   * Fires when the device receives a Metadata packet
   *
   * @event onDeviceMetadataPacket
   */
  readonly onDeviceMetadataPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.DeviceMetadata>>;
  /**
   * Fires when the device receives a Canned Message Module message packet
   *
   * @event onCannedMessageModulePacket
   */
  readonly onCannedMessageModulePacket: SimpleEventDispatcher<PacketMetadata<string>>;
  /**
   * Fires when a new MeshPacket message containing a Waypoint packet has been
   * received from device
   *
   * @event onWaypointPacket
   */
  readonly onWaypointPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.Waypoint>>;
  /**
   * Fires when a new MeshPacket message containing an Audio packet has been
   * received from device
   *
   * @event onAudioPacket
   */
  readonly onAudioPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Detection Sensor packet has been
   * received from device
   *
   * @event onDetectionSensorPacket
   */
  readonly onDetectionSensorPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Ping packet has been
   * received from device
   *
   * @event onPingPacket
   */
  readonly onPingPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a IP Tunnel packet has been
   * received from device
   *
   * @event onIpTunnelPacket
   */
  readonly onIpTunnelPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Paxcounter packet has been
   * received from device
   *
   * @event onPaxcounterPacket
   */
  readonly onPaxcounterPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.PaxCount.Paxcount>>;
  /**
   * Fires when a new MeshPacket message containing a Serial packet has been
   * received from device
   *
   * @event onSerialPacket
   */
  readonly onSerialPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Store and Forward packet
   * has been received from device
   *
   * @event onStoreForwardPacket
   */
  readonly onStoreForwardPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Store and Forward packet
   * has been received from device
   *
   * @event onRangeTestPacket
   */
  readonly onRangeTestPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Telemetry packet has been
   * received from device
   *
   * @event onTelemetryPacket
   */
  readonly onTelemetryPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Telemetry.Telemetry>>;
  /**
   * Fires when a new MeshPacket message containing a ZPS packet has been
   * received from device
   *
   * @event onZPSPacket
   */
  readonly onZpsPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Simulator packet has been
   * received from device
   *
   * @event onSimulatorPacket
   */
  readonly onSimulatorPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Trace Route packet has been
   * received from device
   *
   * @event onTraceRoutePacket
   */
  readonly onTraceRoutePacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.RouteDiscovery>>;
  /**
   * Fires when a new MeshPacket message containing a Neighbor Info packet has been
   * received from device
   *
   * @event onNeighborInfoPacket
   */
  readonly onNeighborInfoPacket: SimpleEventDispatcher<PacketMetadata<Protobuf$3.Mesh.NeighborInfo>>;
  /**
   * Fires when a new MeshPacket message containing an ATAK packet has been
   * received from device
   *
   * @event onAtakPluginPacket
   */
  readonly onAtakPluginPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Map Report packet has been
   * received from device
   *
   * @event onMapReportPacket
   */
  readonly onMapReportPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a Private packet has been
   * received from device
   *
   * @event onPrivatePacket
   */
  readonly onPrivatePacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing an ATAK Forwarder packet has been
   * received from device
   *
   * @event onAtakForwarderPacket
   */
  readonly onAtakForwarderPacket: SimpleEventDispatcher<PacketMetadata<Uint8Array>>;
  /**
   * Fires when a new MeshPacket message containing a ClientNotification packet has been
   * received from device
   *
   * @event onClientNotificationPacket
   */
  readonly onClientNotificationPacket: SimpleEventDispatcher<Protobuf$3.Mesh.ClientNotification>;
  /**
   * Fires when the devices connection or configuration status changes
   *
   * @event onDeviceStatus
   */
  readonly onDeviceStatus: SimpleEventDispatcher<DeviceStatusEnum>;
  /**
   * Fires when a new FromRadio message containing a LogRecord packet has been
   * received from device
   *
   * @event onLogRecord
   */
  readonly onLogRecord: SimpleEventDispatcher<Protobuf$3.Mesh.LogRecord>;
  /**
   * Fires when the device receives a meshPacket, returns a timestamp
   *
   * @event onMeshHeartbeat
   */
  readonly onMeshHeartbeat: SimpleEventDispatcher<Date>;
  /**
   * Outputs any debug log data (currently serial connections only)
   *
   * @event onDeviceDebugLog
   */
  readonly onDeviceDebugLog: SimpleEventDispatcher<Uint8Array>;
  /**
   * Outputs status of pending settings changes
   *
   * @event onpendingSettingsChange
   */
  readonly onPendingSettingsChange: SimpleEventDispatcher<boolean>;
  /**
   * Fires when a QueueStatus message is generated
   *
   * @event onQueueStatus
   */
  readonly onQueueStatus: SimpleEventDispatcher<Protobuf$3.Mesh.QueueStatus>;
  /**
   * Fires when a configCompleteId message is received from the device
   *
   * @event onConfigComplete
   */
  readonly onConfigComplete: SimpleEventDispatcher<number>;
}
//#endregion
//#region src/utils/queue.d.ts
declare class Queue {
  private queue;
  private lock;
  private ackNotifier;
  private errorNotifier;
  private timeout;
  constructor();
  getState(): QueueItem[];
  clear(): void;
  push(item: Omit<QueueItem, "promise" | "sent" | "added">): void;
  remove(id: number): void;
  processAck(id: number): void;
  processError(e: PacketError): void;
  wait(id: number): Promise<number>;
  processQueue(outputStream: WritableStream<Uint8Array>): Promise<void>;
}
//#endregion
//#region src/utils/transform/fromDevice.d.ts
declare const fromDeviceStream: () => TransformStream<Uint8Array, DeviceOutput>;
//#endregion
//#region src/utils/transform/toDevice.d.ts
/**
 * Pads packets with appropriate framing information before writing to the output stream.
 */
declare const toDeviceStream: () => TransformStream<Uint8Array, Uint8Array>;
//#endregion
//#region src/utils/xmodem.d.ts
type XmodemProps = (toRadio: Uint8Array, id?: number) => Promise<number>;
declare class Xmodem {
  private sendRaw;
  private rxBuffer;
  private txBuffer;
  private textEncoder;
  private counter;
  constructor(sendRaw: XmodemProps);
  downloadFile(filename: string): Promise<number>;
  uploadFile(filename: string, data: Uint8Array): Promise<number>;
  sendCommand(command: Protobuf$2.Xmodem.XModem_Control, buffer?: Uint8Array, sequence?: number, crc16?: number): Promise<number>;
  handlePacket(packet: Protobuf$2.Xmodem.XModem): Promise<number>;
  validateCrc16(packet: Protobuf$2.Xmodem.XModem): boolean;
  clear(): void;
}
declare namespace mod_d_exports {
  export { EventSystem, Queue, Xmodem, fromDeviceStream, toDeviceStream };
}
//#endregion
//#region src/meshDevice.d.ts
declare class MeshDevice {
  transport: Transport;
  /** Logs to the console and the logging event emitter */
  log: Logger<unknown>;
  /** Describes the current state of the device */
  protected deviceStatus: DeviceStatusEnum;
  /** Describes the current state of the device */
  protected isConfigured: boolean;
  /** Are there any settings that have yet to be applied? */
  protected pendingSettingsChanges: boolean;
  /** Device's node number */
  private myNodeInfo;
  /** Randomly generated number to ensure confiuration lockstep */
  configId: number;
  /**
   * Packert queue, to space out transmissions and routing handle errors and
   * acks
   */
  queue: Queue;
  events: EventSystem;
  xModem: Xmodem;
  private _heartbeatIntervalId;
  constructor(transport: Transport, configId?: number);
  /** Abstract method that connects to the radio */
  /** Abstract method that disconnects from the radio */
  /** Abstract method that pings the radio */
  /**
   * Sends a text over the radio
   */
  sendText(text: string, destination?: Destination, wantAck?: boolean, channel?: ChannelNumber, replyId?: number, emoji?: number): Promise<number>;
  /**
   * Sends a text over the radio
   */
  sendWaypoint(waypointMessage: Protobuf$1.Mesh.Waypoint, destination: Destination, channel?: ChannelNumber): Promise<number>;
  /**
   * Sends packet over the radio
   */
  sendPacket(byteData: Uint8Array, portNum: Protobuf$1.Portnums.PortNum, destination: Destination, channel?: ChannelNumber, wantAck?: boolean, wantResponse?: boolean, echoResponse?: boolean, replyId?: number, emoji?: number): Promise<number>;
  /**
   * Sends raw packet over the radio
   */
  sendRaw(toRadio: Uint8Array, id?: number): Promise<number>;
  /**
   * Writes config to device
   */
  setConfig(config: Protobuf$1.Config.Config): Promise<number>;
  /**
   * Writes module config to device
   */
  setModuleConfig(moduleConfig: Protobuf$1.ModuleConfig.ModuleConfig): Promise<number>;
  setCannedMessages(cannedMessages: Protobuf$1.CannedMessages.CannedMessageModuleConfig): Promise<number>;
  /**
   * Sets devices owner data
   */
  setOwner(owner: Protobuf$1.Mesh.User): Promise<number>;
  /**
   * Sets devices ChannelSettings
   */
  setChannel(channel: Protobuf$1.Channel.Channel): Promise<number>;
  /**
   * Triggers Device to enter DFU mode
   */
  enterDfuMode(): Promise<number>;
  /**
   * Sets static position of device
   */
  setPosition(positionMessage: Protobuf$1.Mesh.Position): Promise<number>;
  /**
   * Sets the fixed position of a device. Can be used to
   * position GPS-less devices.
   */
  setFixedPosition(latitude: number, longitude: number): Promise<number>;
  /**
   * Remove the fixed position of a device
   */
  removeFixedPosition(): Promise<number>;
  /**
   * Gets specified channel information from the radio
   */
  getChannel(index: number): Promise<number>;
  /**
   * Gets devices config
   */
  getConfig(configType: Protobuf$1.Admin.AdminMessage_ConfigType): Promise<number>;
  /**
   * Gets Module config
   */
  getModuleConfig(moduleConfigType: Protobuf$1.Admin.AdminMessage_ModuleConfigType): Promise<number>;
  /** Gets devices Owner */
  getOwner(): Promise<number>;
  /**
   * Gets devices metadata
   */
  getMetadata(nodeNum: number): Promise<number>;
  /**
   * Clears specific channel with the designated index
   */
  clearChannel(index: number): Promise<number>;
  private beginEditSettings;
  commitEditSettings(): Promise<number>;
  /**
   * Resets the internal NodeDB of the radio, usefull for removing old nodes
   * that no longer exist.
   */
  resetNodes(): Promise<number>;
  /**
   * Removes a node from the internal NodeDB of the radio by node number
   */
  removeNodeByNum(nodeNum: number): Promise<number>;
  /** Shuts down the current node after the specified amount of time has elapsed. */
  shutdown(time: number): Promise<number>;
  /** Reboots the current node after the specified amount of time has elapsed. */
  reboot(time: number): Promise<number>;
  /**
   * Reboots the current node into OTA mode after the specified amount of time has elapsed.
   */
  rebootOta(time: number): Promise<number>;
  /**
   * Factory resets the current device
   */
  factoryResetDevice(): Promise<number>;
  /**
   * Factory resets the current config
   */
  factoryResetConfig(): Promise<number>;
  /**
   * Triggers the device configure process
   */
  configure(): Promise<number>;
  /**
   * Serial connection requires a heartbeat ping to stay connected, otherwise times out after 15 minutes
   */
  heartbeat(): Promise<number>;
  /**
   * Initializes the heartbeat interval, which sends a heartbeat ping every interval milliseconds.
   */
  setHeartbeatInterval(interval: number): void;
  /**
   * Sends a trace route packet to the designated node
   */
  traceRoute(destination: number): Promise<number>;
  /**
   * Requests position from the designated node
   */
  requestPosition(destination: number): Promise<number>;
  /**
   * Updates the device status eliminating duplicate status events
   */
  updateDeviceStatus(status: DeviceStatusEnum): void;
  /**
   * Generates random packet identifier
   *
   * @returns {number} Random packet ID
   */
  private generateRandId;
  /** Completes all Events */
  complete(): void;
  /**  Disconnects from the device **/
  disconnect(): Promise<void>;
  /**
   * Gets called when a MeshPacket is received from device
   */
  handleMeshPacket(meshPacket: Protobuf$1.Mesh.MeshPacket): void;
  private handleDecodedPacket;
}
//#endregion
export { Constants, MeshDevice, Protobuf, types_d_exports as Types, mod_d_exports as Utils };