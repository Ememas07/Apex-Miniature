import { CarClassId, LiveryConfig, RaceConfig, RoomState } from './types';

export interface PeerTelemetryPacket {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  steerAngle: number;
  lap: number;
  trackT: number;
  totalDistance: number;
  specialActive: boolean;
  flashingHeadlights: boolean;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  public peerId: string;
  public room: RoomState | null = null;
  public connected = false;
  public onRoomUpdate?: (room: RoomState | null) => void;
  public onRaceStart?: (room: RoomState) => void;
  public onError?: (msg: string) => void;
  public peerTelemetry = new Map<string, PeerTelemetryPacket>();

  constructor() {
    this.peerId = `drv-${Math.random().toString(36).slice(2, 9)}`;
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const basePath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : window.location.pathname.replace(/\/[^/]*$/, '/');
      const url = `${protocol}//${window.location.host}${basePath}ws`;
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        this.connected = true;
        resolve();
      };

      socket.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const type = String(msg.type || '');
        if (type === 'room:state') {
          this.room = msg.room as RoomState;
          if (typeof msg.peerId === 'string') this.peerId = msg.peerId;
          this.onRoomUpdate?.(this.room);
        } else if (type === 'room:started') {
          this.room = msg.room as RoomState;
          this.onRaceStart?.(this.room);
        } else if (type === 'room:error') {
          this.onError?.(String(msg.message || 'Multiplayer error'));
        } else if (type === 'race:peer_telemetry') {
          const pId = String(msg.peerId || '');
          if (pId) {
            this.peerTelemetry.set(pId, msg.data as PeerTelemetryPacket);
          }
        }
      };

      socket.onclose = () => {
        this.connected = false;
      };

      socket.onerror = () => {
        this.connected = false;
        reject(new Error('Could not connect to multiplayer server.'));
      };
    });
  }

  async createRoom(name: string, carId: string, livery: LiveryConfig, config: RaceConfig, classId?: CarClassId) {
    await this.connect();
    this.ws?.send(
      JSON.stringify({
        type: 'room:create',
        peerId: this.peerId,
        name,
        carId,
        classId,
        livery,
        config,
      }),
    );
  }

  async joinRoom(code: string, name: string, carId: string, livery: LiveryConfig, classId?: CarClassId) {
    await this.connect();
    this.ws?.send(
      JSON.stringify({
        type: 'room:join',
        code: code.toUpperCase().trim(),
        peerId: this.peerId,
        name,
        carId,
        classId,
        livery,
      }),
    );
  }

  updateConfig(config: Partial<RaceConfig>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'room:configure', config }));
  }

  updatePeer(payload: { name?: string; carId?: string; classId?: CarClassId; livery?: LiveryConfig; ready?: boolean }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'room:peer_update', ...payload }));
  }

  startRace() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'room:start' }));
  }

  sendTelemetry(packet: PeerTelemetryPacket) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.room) return;
    this.ws.send(JSON.stringify({ type: 'race:telemetry', data: packet }));
  }

  leaveRoom() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave' }));
    }
    this.room = null;
    this.peerTelemetry.clear();
    this.onRoomUpdate?.(null);
  }
}
