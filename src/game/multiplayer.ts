import { CarClassId, LiveryConfig, RaceConfig, RoomPeer, RoomState } from './types';

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
}

export type ConnectionMode = 'server' | 'local-relay' | 'connecting' | 'disconnected';

export function getDeploymentBasePath(): string {
  if (typeof window === 'undefined') return '/';
  let p = window.location.pathname || '/';
  if (/\.[a-zA-Z0-9]+$/.test(p)) {
    p = p.replace(/\/[^/]*$/, '');
  }
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = getDeploymentBasePath();
  return `${protocol}//${window.location.host}${basePath}ws`;
}

export function getRoomRestUrl(code: string): string {
  const normalizedCode = code.toUpperCase().trim();
  const basePath = getDeploymentBasePath();
  return `${basePath}api/rooms/${encodeURIComponent(normalizedCode)}`;
}

/**
 * Strips client-local car and livery fields so shared room broadcasts never overwrite
 * another player's locally chosen car or paint in the multiplayer lobby or on race start.
 */
export function extractSharedRoomConfigPatch(patch: Partial<RaceConfig>): Partial<RaceConfig> {
  const { playerCarId: _carId, playerLivery: _livery, ...shared } = patch;
  return shared;
}

export function mergeSharedRoomConfig(
  localConfig: RaceConfig,
  incomingRoomConfig?: Partial<RaceConfig> | null,
): RaceConfig {
  if (!incomingRoomConfig) return localConfig;
  const shared = extractSharedRoomConfigPatch(incomingRoomConfig);
  return {
    ...localConfig,
    ...shared,
    playerCarId: localConfig.playerCarId,
    playerLivery: localConfig.playerLivery,
  };
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private connectPromise: Promise<void> | null = null;
  private outboundQueue: string[] = [];
  public peerId: string;
  public room: RoomState | null = null;
  public connected = false;
  public connectionMode: ConnectionMode = 'disconnected';
  public onRoomUpdate?: (room: RoomState | null) => void;
  public onRaceStart?: (room: RoomState) => void;
  public onError?: (msg: string) => void;
  public onConnectionModeChange?: (mode: ConnectionMode) => void;
  public peerTelemetry = new Map<string, PeerTelemetryPacket>();

  constructor() {
    this.peerId = `drv-${Math.random().toString(36).slice(2, 9)}`;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('apex-miniature-multiplayer-relay');
        this.setupBroadcastChannel();
      } catch {
        this.channel = null;
      }
    }
    if (typeof window !== 'undefined') {
      this.connect().catch(() => {});
    }
  }

  private setConnectionMode(mode: ConnectionMode) {
    if (this.connectionMode !== mode) {
      this.connectionMode = mode;
      this.onConnectionModeChange?.(mode);
    }
  }

  private setupBroadcastChannel() {
    if (!this.channel) return;
    this.channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      const type = String(msg.type || '');

      if (type === 'relay:room_state') {
        const incomingRoom = msg.room as RoomState;
        if (!incomingRoom) return;
        // If this client is participating in this room or targeted by join
        if ((this.room && this.room.code === incomingRoom.code) || msg.targetPeerId === this.peerId) {
          this.room = incomingRoom;
          if (this.connectionMode !== 'server') {
            this.setConnectionMode('local-relay');
          }
          this.onRoomUpdate?.(this.room);
        }
      } else if (type === 'relay:room_join') {
        // If this tab is the host of the requested room
        if (this.room && this.room.hostId === this.peerId && this.room.code === msg.code) {
          const joiningPeer: RoomPeer = {
            peerId: String(msg.peerId),
            name: String(msg.name || 'Guest Driver').slice(0, 24),
            carId: String(msg.carId || 'porsche-963'),
            classId: (msg.classId as CarClassId) || CarClassId.HYPERCAR_GTP,
            livery: msg.livery || {},
            ready: false,
            isHost: false,
          };
          const updatedPeers = this.room.peers.filter((p) => p.peerId !== joiningPeer.peerId);
          updatedPeers.push(joiningPeer);
          const players = { ...(this.room.players || {}) };
          players[joiningPeer.peerId] = joiningPeer;

          this.room = {
            ...this.room,
            peers: updatedPeers,
            players,
          };
          this.broadcastRelay({
            type: 'relay:room_state',
            room: this.room,
            targetPeerId: msg.peerId,
          });
          this.onRoomUpdate?.(this.room);
        }
      } else if (type === 'relay:room_peer_update') {
        if (this.room && this.room.code === msg.code) {
          const peer = this.room.peers.find((p) => p.peerId === msg.peerId);
          if (peer) {
            if (msg.carId) peer.carId = String(msg.carId);
            if (msg.classId) peer.classId = msg.classId as CarClassId;
            if (msg.livery) peer.livery = msg.livery;
            if (typeof msg.ready === 'boolean') peer.ready = msg.ready;
            if (msg.name) peer.name = String(msg.name).slice(0, 24);
            if (this.room.players && this.room.players[peer.peerId]) {
              this.room.players[peer.peerId] = { ...peer };
            }
            this.onRoomUpdate?.({ ...this.room });
            if (this.room.hostId === this.peerId) {
              this.broadcastRelay({ type: 'relay:room_state', room: this.room });
            }
          }
        }
      } else if (type === 'relay:room_configure') {
        if (this.room && this.room.code === msg.code && this.room.hostId !== this.peerId) {
          this.room = {
            ...this.room,
            config: { ...this.room.config, ...msg.config },
          };
          this.onRoomUpdate?.(this.room);
        }
      } else if (type === 'relay:room_start') {
        if (this.room && this.room.code === msg.code) {
          this.room = { ...this.room, started: true };
          this.onRaceStart?.(this.room);
        }
      } else if (type === 'relay:race_telemetry') {
        const pId = String(msg.peerId || '');
        if (pId && pId !== this.peerId) {
          this.peerTelemetry.set(pId, msg.data as PeerTelemetryPacket);
        }
      } else if (type === 'relay:room_leave') {
        if (this.room && this.room.code === msg.code) {
          const updatedPeers = this.room.peers.filter((p) => p.peerId !== msg.peerId);
          if (this.room.hostId === msg.peerId && updatedPeers.length > 0) {
            updatedPeers[0].isHost = true;
            this.room.hostId = updatedPeers[0].peerId;
          }
          this.room = { ...this.room, peers: updatedPeers };
          this.onRoomUpdate?.(this.room);
        }
      }
    };
  }

  private broadcastRelay(payload: unknown) {
    try {
      this.channel?.postMessage(payload);
    } catch {}
  }

  private flushOutboundQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.outboundQueue.length > 0) {
      const msg = this.outboundQueue.shift();
      if (msg) {
        try {
          this.ws.send(msg);
        } catch {}
      }
    }
  }

  async fetchRoom(code: string): Promise<RoomState | null> {
    const normalizedCode = code.toUpperCase().trim();
    if (!normalizedCode) return null;
    try {
      const url = getRoomRestUrl(normalizedCode);
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return (await res.json()) as RoomState;
    } catch {
      return null;
    }
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.connected = true;
      this.setConnectionMode('server');
      this.flushOutboundQueue();
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.setConnectionMode('connecting');

    this.connectPromise = new Promise((resolve) => {
      if (typeof window === 'undefined') {
        this.setConnectionMode('local-relay');
        resolve();
        return;
      }

      const wsUrl = getWebSocketUrl();
      let settled = false;
      let activeSocket: WebSocket | null = null;

      const finishConnect = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.connectPromise = null;
        if (success && activeSocket && activeSocket.readyState === WebSocket.OPEN) {
          this.ws = activeSocket;
          this.connected = true;
          this.setConnectionMode('server');
          this.flushOutboundQueue();
        } else {
          this.connected = false;
          this.setConnectionMode(this.channel ? 'local-relay' : 'disconnected');
        }
        resolve();
      };

      const timeoutId = setTimeout(() => {
        if (!settled) {
          try {
            activeSocket?.close();
          } catch {}
          finishConnect(false);
        }
      }, 4000);

      try {
        const socket = new WebSocket(wsUrl);
        activeSocket = socket;

        socket.onopen = () => {
          finishConnect(true);
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
            this.setConnectionMode('server');
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
          if (this.ws === socket) {
            this.ws = null;
            this.connected = false;
            this.setConnectionMode(this.channel ? 'local-relay' : 'disconnected');
          }
          if (!settled) finishConnect(false);
        };

        socket.onerror = () => {
          if (!settled) finishConnect(false);
        };
      } catch {
        if (!settled) finishConnect(false);
      }
    });

    return this.connectPromise;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async createRoom(name: string, carId: string, livery: LiveryConfig, config: RaceConfig, classId?: CarClassId) {
    const hostPeer: RoomPeer = {
      peerId: this.peerId,
      name: String(name || 'Host Driver').slice(0, 24),
      carId: carId || 'ferrari-499p',
      classId: classId || CarClassId.HYPERCAR_GTP,
      livery: livery || ({} as LiveryConfig),
      ready: true,
      isHost: true,
    };

    const payload = JSON.stringify({
      type: 'room:create',
      peerId: this.peerId,
      name: hostPeer.name,
      carId: hostPeer.carId,
      classId: hostPeer.classId,
      livery: hostPeer.livery,
      config,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return;
      } catch {}
    }

    // Queue outbound room:create message until ws.readyState === WebSocket.OPEN
    this.outboundQueue.push(payload);

    try {
      await this.connect();
    } catch {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.flushOutboundQueue();
      return;
    }

    // If socket is still connecting, leave it queued so onopen flushes it
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Server connection unavailable; remove queued create payload and initialize local relay
    this.outboundQueue = this.outboundQueue.filter((m) => m !== payload);
    const code = this.generateRoomCode();
    const localRoom: RoomState = {
      code,
      hostId: this.peerId,
      config,
      peers: [hostPeer],
      players: { [this.peerId]: hostPeer },
      started: false,
    };
    this.room = localRoom;
    this.broadcastRelay({ type: 'relay:room_state', room: localRoom });
    this.onRoomUpdate?.(this.room);
  }

  async joinRoom(code: string, name: string, carId: string, livery: LiveryConfig, classId?: CarClassId) {
    const normalizedCode = code.toUpperCase().trim();
    if (!normalizedCode) {
      this.onError?.('Please enter a valid room code.');
      return;
    }

    const guestPeer: RoomPeer = {
      peerId: this.peerId,
      name: String(name || 'Guest Driver').slice(0, 24),
      carId: carId || 'porsche-963',
      classId: classId || CarClassId.HYPERCAR_GTP,
      livery: livery || ({} as LiveryConfig),
      ready: false,
      isHost: false,
    };

    const payload = JSON.stringify({
      type: 'room:join',
      code: normalizedCode,
      peerId: this.peerId,
      name: guestPeer.name,
      carId: guestPeer.carId,
      classId: guestPeer.classId,
      livery: guestPeer.livery,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return;
      } catch {}
    }

    // Queue outbound room:join message until ws.readyState === WebSocket.OPEN
    this.outboundQueue.push(payload);

    try {
      await this.connect();
    } catch {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.flushOutboundQueue();
      return;
    }

    // If socket is still connecting, leave it queued so onopen flushes it
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Server connection unavailable; remove queued join payload
    this.outboundQueue = this.outboundQueue.filter((m) => m !== payload);

    // Attempt REST fetch using relative base path
    const restRoom = await this.fetchRoom(normalizedCode);
    if (restRoom) {
      this.room = restRoom;
      this.onRoomUpdate?.(this.room);
    }

    // Local multi-tab signaling fallback: broadcast join request to other tabs
    this.broadcastRelay({
      type: 'relay:room_join',
      code: normalizedCode,
      peerId: this.peerId,
      name: guestPeer.name,
      carId: guestPeer.carId,
      classId: guestPeer.classId,
      livery: guestPeer.livery,
    });

    // If no response within 2.5s and not in room, show not found
    setTimeout(() => {
      if (!this.room || this.room.code !== normalizedCode) {
        this.onError?.(`Room "${normalizedCode}" not found.`);
      }
    }, 2500);
  }

  updateConfig(config: Partial<RaceConfig>) {
    if (this.room) {
      this.room = { ...this.room, config: { ...this.room.config, ...config } };
      this.broadcastRelay({
        type: 'relay:room_configure',
        code: this.room.code,
        config,
      });
      this.onRoomUpdate?.(this.room);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:configure', config }));
    }
  }

  updatePeer(payload: { name?: string; carId?: string; classId?: CarClassId; livery?: LiveryConfig; ready?: boolean }) {
    if (this.room) {
      const p = this.room.peers.find((x) => x.peerId === this.peerId);
      if (p) {
        if (payload.name) p.name = payload.name;
        if (payload.carId) p.carId = payload.carId;
        if (payload.classId) p.classId = payload.classId;
        if (payload.livery) p.livery = payload.livery;
        if (typeof payload.ready === 'boolean') p.ready = payload.ready;
        if (this.room.players && this.room.players[this.peerId]) {
          this.room.players[this.peerId] = { ...p };
        }
        this.onRoomUpdate?.({ ...this.room });
        this.broadcastRelay({
          type: 'relay:room_peer_update',
          code: this.room.code,
          peerId: this.peerId,
          ...payload,
        });
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:peer_update', ...payload }));
    }
  }

  startRace() {
    if (this.room) {
      this.room = { ...this.room, started: true };
      this.broadcastRelay({
        type: 'relay:room_start',
        code: this.room.code,
      });
      this.onRaceStart?.(this.room);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:start' }));
    }
  }

  sendTelemetry(packet: PeerTelemetryPacket) {
    if (!this.room) return;
    this.broadcastRelay({
      type: 'relay:race_telemetry',
      peerId: this.peerId,
      data: packet,
    });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'race:telemetry', data: packet }));
    }
  }

  leaveRoom() {
    if (this.room) {
      this.broadcastRelay({
        type: 'relay:room_leave',
        code: this.room.code,
        peerId: this.peerId,
      });
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave' }));
    }
    this.room = null;
    this.peerTelemetry.clear();
    this.onRoomUpdate?.(null);
  }
}
