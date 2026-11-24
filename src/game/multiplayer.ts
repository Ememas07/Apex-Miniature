import {
  CarClassId,
  ChatMessage,
  LiveryConfig,
  LobbySummary,
  PlayerOnlineProfile,
  RaceConfig,
  RoomPeer,
  RoomState,
  TrackSpec,
} from './types';

export interface PlaylistEntry {
  trackId: string;
  trackName?: string;
  totalLaps?: number;
  customTrack?: TrackSpec;
}

export interface ServerLeaderboardEntry {
  trackId: string;
  classId?: CarClassId | string;
  peerId: string;
  driverName: string;
  carId: string;
  lapTimeSeconds: number;
  trackLengthMeters: number;
  recordedAt: number;
}

export interface RaceResultReportEntry {
  peerId: string;
  driverName?: string;
  carId?: string;
  classId?: CarClassId | string;
  position: number;
  bestLapTime?: number | null;
  incidents?: number;
  cleanLaps?: number;
}

export interface ExtendedRaceConfig extends RaceConfig {
  mandatoryServiceStop?: boolean;
  playlist?: string[];
  playlistEntries?: PlaylistEntry[];
  playlistIndex?: number;
}

export interface ExtendedRoomState extends RoomState {
  config: Partial<ExtendedRaceConfig>;
  bannedPeerIds?: string[];
  playlist?: string[];
  playlistEntries?: PlaylistEntry[];
  playlistIndex?: number;
  leaderboard?: ServerLeaderboardEntry[];
}

export const MAX_VALID_LAP_SPEED_MS = 135;

export function isValidFastestLapTime(elapsedSeconds: number, trackLengthMeters: number): boolean {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(trackLengthMeters)) return false;
  if (elapsedSeconds <= 0 || trackLengthMeters <= 0) return false;
  return elapsedSeconds >= trackLengthMeters / MAX_VALID_LAP_SPEED_MS;
}

export function normalizePlaylist(raw: unknown): PlaylistEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaylistEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const tid = item.trim().slice(0, 64);
      if (tid) out.push({ trackId: tid });
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const tid = typeof obj.trackId === 'string' ? obj.trackId.trim().slice(0, 64) : '';
      if (!tid) continue;
      const entry: PlaylistEntry = { trackId: tid };
      if (typeof obj.trackName === 'string' && obj.trackName.trim()) {
        entry.trackName = obj.trackName.trim().slice(0, 48);
      }
      if (typeof obj.totalLaps === 'number' && Number.isFinite(obj.totalLaps) && obj.totalLaps >= 1) {
        entry.totalLaps = Math.max(1, Math.min(50, Math.round(obj.totalLaps)));
      }
      if (obj.customTrack && typeof obj.customTrack === 'object') {
        entry.customTrack = obj.customTrack as TrackSpec;
      }
      out.push(entry);
    }
    if (out.length >= 20) break;
  }
  return out;
}

export function resolveWinningVotedTrack(trackVotes?: Record<string, string>): string | null {
  if (!trackVotes || typeof trackVotes !== 'object') return null;
  const counts = new Map<string, number>();
  for (const rawTid of Object.values(trackVotes)) {
    const tid = typeof rawTid === 'string' ? rawTid.trim() : '';
    if (!tid) continue;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let bestCount = 0;
  for (const [tid, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestId = tid;
    }
  }
  return bestId;
}

export function resolveNextPlaylistIndex(
  playlist: PlaylistEntry[],
  currentIndex: number,
  trackVotes?: Record<string, string>,
): { nextIndex: number; entry: PlaylistEntry | null; votedTrackId: string | null } {
  const votedTrackId = resolveWinningVotedTrack(trackVotes);
  if (votedTrackId) {
    const matchIdx = playlist.findIndex((p) => p.trackId === votedTrackId);
    if (matchIdx >= 0) {
      return { nextIndex: matchIdx, entry: playlist[matchIdx], votedTrackId };
    }
    return { nextIndex: Math.max(0, currentIndex), entry: null, votedTrackId };
  }
  if (playlist.length === 0) {
    return { nextIndex: 0, entry: null, votedTrackId: null };
  }
  const safeCur = Number.isFinite(currentIndex) && currentIndex >= 0 ? Math.floor(currentIndex) : 0;
  const nextIndex = (safeCur + 1) % playlist.length;
  return { nextIndex, entry: playlist[nextIndex] ?? null, votedTrackId: null };
}

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

export interface InterpolatedPeerState extends PeerTelemetryPacket {
  isGhosted: boolean;
  ageMs: number;
}

export interface TimedTelemetrySnapshot {
  packet: PeerTelemetryPacket;
  receivedAtMs: number;
  sentAtMs: number;
}

export interface AiSyncCarState {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  lap: number;
  trackT: number;
}

export type ConnectionMode = 'server' | 'local-relay' | 'connecting' | 'disconnected';

const ONLINE_PROFILE_STORAGE_KEY = 'apex-miniature-online-profile-v1';
const SESSION_TOKEN_STORAGE_KEY = 'apex-miniature-mp-session-token-v1';
const BINARY_MAGIC_0 = 0x41; // 'A'
const BINARY_MAGIC_1 = 0x58; // 'X'
const INTERP_DELAY_MS = 90;
const MAX_EXTRAPOLATION_MS = 320;
const STALE_GHOST_MS = 1200;
const HIGH_PING_GHOST_MS = 350;

export function loadOrCreateSessionToken(): string {
  const gen = () => `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  if (typeof window === 'undefined') return gen();
  try {
    const existing = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) {
      return existing.trim().slice(0, 64);
    }
    const created = gen();
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, created);
    return created;
  } catch {
    return gen();
  }
}

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

export function loadOnlineProfile(): PlayerOnlineProfile {
  const fallback: PlayerOnlineProfile = {
    username: 'Player 1',
    eloRating: 1200,
    safetyRating: 80,
    racesCompleted: 0,
    wins: 0,
    cleanLaps: 0,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(ONLINE_PROFILE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerOnlineProfile>;
    return {
      username: typeof parsed.username === 'string' && parsed.username.trim() ? parsed.username.slice(0, 24) : fallback.username,
      eloRating: typeof parsed.eloRating === 'number' && Number.isFinite(parsed.eloRating) ? Math.round(parsed.eloRating) : 1200,
      safetyRating:
        typeof parsed.safetyRating === 'number' && Number.isFinite(parsed.safetyRating)
          ? Math.max(0, Math.min(100, Math.round(parsed.safetyRating)))
          : 80,
      racesCompleted: typeof parsed.racesCompleted === 'number' ? Math.max(0, Math.floor(parsed.racesCompleted)) : 0,
      wins: typeof parsed.wins === 'number' ? Math.max(0, Math.floor(parsed.wins)) : 0,
      cleanLaps: typeof parsed.cleanLaps === 'number' ? Math.max(0, Math.floor(parsed.cleanLaps)) : 0,
    };
  } catch {
    return fallback;
  }
}

export function saveOnlineProfile(profile: PlayerOnlineProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ONLINE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota errors
  }
}

export function updateOnlineRatings(
  position: number,
  totalRacers: number,
  incidents: number,
  cleanLapsDelta: number,
): PlayerOnlineProfile {
  const current = loadOnlineProfile();
  const field = Math.max(2, totalRacers);
  const normalizedPerf = 1 - (Math.max(1, Math.min(field, position)) - 1) / (field - 1);
  const eloDelta = Math.round((normalizedPerf - 0.5) * 44);
  const srDelta = Math.round(cleanLapsDelta * 1.5 - incidents * 4);
  const next: PlayerOnlineProfile = {
    ...current,
    eloRating: Math.max(400, Math.min(3500, current.eloRating + eloDelta)),
    safetyRating: Math.max(0, Math.min(100, current.safetyRating + srDelta)),
    racesCompleted: current.racesCompleted + 1,
    wins: current.wins + (position === 1 ? 1 : 0),
    cleanLaps: current.cleanLaps + Math.max(0, cleanLapsDelta),
  };
  saveOnlineProfile(next);
  return next;
}

/**
 * Encodes peer telemetry into a compact binary ArrayBuffer (~56 bytes vs ~240 bytes JSON).
 * Layout:
 *  [0..1]   magic 'AX' (2B)
 *  [2]      flags bitmask (bit 0 = specialActive) (1B)
 *  [3]      peerId UTF-8 byte length N (max 32) (1B)
 *  [4..4+N) peerId bytes
 *  [offset] Float64 sentAtMs (8B)
 *  [+8]     9 x Float32: x, y, z, heading, speed, steerAngle, lap, trackT, totalDistance (36B)
 */
export function encodeBinaryTelemetry(
  peerId: string,
  pkt: PeerTelemetryPacket,
  sentAtMs: number = Date.now(),
): ArrayBuffer {
  const idStr = peerId.slice(0, 32);
  const idBytes = textEncoder
    ? textEncoder.encode(idStr)
    : Uint8Array.from(Array.from(idStr).map((c) => c.charCodeAt(0) & 0x7f));
  const idLen = Math.min(32, idBytes.byteLength);
  const totalBytes = 4 + idLen + 8 + 36;
  const buf = new ArrayBuffer(totalBytes);
  const u8 = new Uint8Array(buf);
  const view = new DataView(buf);

  u8[0] = BINARY_MAGIC_0;
  u8[1] = BINARY_MAGIC_1;
  u8[2] = pkt.specialActive ? 1 : 0;
  u8[3] = idLen;
  u8.set(idBytes.subarray(0, idLen), 4);

  let off = 4 + idLen;
  view.setFloat64(off, sentAtMs, true);
  off += 8;
  view.setFloat32(off, pkt.x, true); off += 4;
  view.setFloat32(off, pkt.y, true); off += 4;
  view.setFloat32(off, pkt.z, true); off += 4;
  view.setFloat32(off, pkt.heading, true); off += 4;
  view.setFloat32(off, pkt.speed, true); off += 4;
  view.setFloat32(off, pkt.steerAngle, true); off += 4;
  view.setFloat32(off, pkt.lap, true); off += 4;
  view.setFloat32(off, pkt.trackT, true); off += 4;
  view.setFloat32(off, pkt.totalDistance, true);

  return buf;
}

export function decodeBinaryTelemetry(
  buf: ArrayBuffer,
): { peerId: string; sentAtMs: number; packet: PeerTelemetryPacket } | null {
  if (!buf || buf.byteLength < 48) return null;
  const u8 = new Uint8Array(buf);
  if (u8[0] !== BINARY_MAGIC_0 || u8[1] !== BINARY_MAGIC_1) return null;
  const flags = u8[2];
  const idLen = u8[3];
  if (idLen === 0 || idLen > 32 || buf.byteLength < 4 + idLen + 44) return null;

  const idSlice = u8.subarray(4, 4 + idLen);
  const peerId = textDecoder
    ? textDecoder.decode(idSlice)
    : String.fromCharCode(...Array.from(idSlice));

  const view = new DataView(buf);
  let off = 4 + idLen;
  const sentAtMs = view.getFloat64(off, true);
  off += 8;
  const x = view.getFloat32(off, true); off += 4;
  const y = view.getFloat32(off, true); off += 4;
  const z = view.getFloat32(off, true); off += 4;
  const heading = view.getFloat32(off, true); off += 4;
  const speed = view.getFloat32(off, true); off += 4;
  const steerAngle = view.getFloat32(off, true); off += 4;
  const lap = Math.round(view.getFloat32(off, true)); off += 4;
  const trackT = view.getFloat32(off, true); off += 4;
  const totalDistance = view.getFloat32(off, true);

  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(speed) || Math.abs(speed) > 165) {
    return null;
  }

  return {
    peerId,
    sentAtMs,
    packet: {
      x,
      y,
      z,
      heading,
      speed,
      steerAngle,
      lap,
      trackT,
      totalDistance,
      specialActive: (flags & 1) !== 0,
    },
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function getDeploymentBasePath(): string {
  if (typeof window === 'undefined') return '/';
  let p = window.location.pathname || '/';
  if (/\.[a-zA-Z0-9]+$/.test(p)) {
    p = p.replace(/\/[^/]*$/, '');
  }
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p.replace(/\/+/g, '/');
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

export function getPublicRoomsRestUrl(): string {
  const basePath = getDeploymentBasePath();
  return `${basePath}api/rooms`;
}

export function getLeaderboardRestUrl(trackId?: string): string {
  const basePath = getDeploymentBasePath();
  const base = `${basePath}api/leaderboard`;
  if (trackId && trackId.trim()) {
    return `${base}?trackId=${encodeURIComponent(trackId.trim())}`;
  }
  return base;
}

let activeMultiplayerClient: MultiplayerClient | null = null;

export function getActiveMultiplayerClient(): MultiplayerClient | null {
  return activeMultiplayerClient;
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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private manualDisconnect = false;
  private isStartingRace = false;

  public peerId: string;
  public sessionToken: string;
  public room: RoomState | null = null;
  public connected = false;
  public connectionMode: ConnectionMode = 'disconnected';
  public clockOffsetMs = 0;
  public myPingMs = 0;
  public peerPings: Record<string, number> = {};
  public chatMessages: ChatMessage[] = [];

  public onRoomUpdate?: (room: RoomState | null) => void;
  public onRaceStart?: (room: RoomState) => void;
  public onError?: (msg: string) => void;
  public onConnectionModeChange?: (mode: ConnectionMode) => void;
  public onChatMessage?: (msg: ChatMessage) => void;
  public onAiSync?: (cars: AiSyncCarState[], serverTime: number) => void;
  public onKicked?: (reason: string) => void;
  public onBanned?: (reason: string) => void;
  public onLeaderboardUpdate?: (entries: ServerLeaderboardEntry[]) => void;

  public peerTelemetry = new Map<string, PeerTelemetryPacket>();
  public peerSnapshots = new Map<string, TimedTelemetrySnapshot[]>();

  constructor() {
    this.peerId = `drv-${Math.random().toString(36).slice(2, 9)}`;
    this.sessionToken = loadOrCreateSessionToken();
    activeMultiplayerClient = this;
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

  private startClockPingLoop() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const sendPing = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(
          JSON.stringify({
            type: 'clock:ping',
            clientTime: Date.now(),
            measuredPingMs: this.myPingMs,
          }),
        );
      } catch {
        // ignore
      }
    };
    sendPing();
    this.pingTimer = setInterval(sendPing, 4000);
  }

  private stopClockPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private pushPeerSnapshot(peerId: string, packet: PeerTelemetryPacket, sentAtMs: number) {
    const now = Date.now();
    this.peerTelemetry.set(peerId, packet);
    let list = this.peerSnapshots.get(peerId);
    if (!list) {
      list = [];
      this.peerSnapshots.set(peerId, list);
    }
    list.push({ packet, receivedAtMs: now, sentAtMs });
    if (list.length > 16) {
      list.splice(0, list.length - 16);
    }
  }

  /**
   * Returns a smoothly interpolated (and short-window extrapolated) state for a remote peer,
   * plus an auto-ghost flag when ping > 350ms or packets are stale (> 1.2s).
   */
  public getInterpolatedPeerState(peerId: string, nowMs: number = Date.now()): InterpolatedPeerState | null {
    const snaps = this.peerSnapshots.get(peerId);
    if (!snaps || snaps.length === 0) {
      const raw = this.peerTelemetry.get(peerId);
      if (!raw) return null;
      return { ...raw, isGhosted: false, ageMs: 0 };
    }

    const latest = snaps[snaps.length - 1];
    const ageMs = Math.max(0, nowMs - latest.receivedAtMs);
    const peerPing = this.peerPings[peerId] ?? 0;
    const isGhosted = peerPing > HIGH_PING_GHOST_MS || ageMs > STALE_GHOST_MS;

    const renderTime = nowMs - INTERP_DELAY_MS;
    if (snaps.length >= 2 && renderTime <= latest.receivedAtMs) {
      // Find bracketing snapshots around renderTime
      for (let i = snaps.length - 1; i >= 1; i--) {
        const s1 = snaps[i];
        const s0 = snaps[i - 1];
        if (renderTime >= s0.receivedAtMs && renderTime <= s1.receivedAtMs) {
          const span = Math.max(1, s1.receivedAtMs - s0.receivedAtMs);
          const alpha = Math.max(0, Math.min(1, (renderTime - s0.receivedAtMs) / span));
          return {
            x: s0.packet.x + (s1.packet.x - s0.packet.x) * alpha,
            y: s0.packet.y + (s1.packet.y - s0.packet.y) * alpha,
            z: s0.packet.z + (s1.packet.z - s0.packet.z) * alpha,
            heading: lerpAngle(s0.packet.heading, s1.packet.heading, alpha),
            speed: s0.packet.speed + (s1.packet.speed - s0.packet.speed) * alpha,
            steerAngle: s0.packet.steerAngle + (s1.packet.steerAngle - s0.packet.steerAngle) * alpha,
            lap: s1.packet.lap,
            trackT: s1.packet.trackT,
            totalDistance: s0.packet.totalDistance + (s1.packet.totalDistance - s0.packet.totalDistance) * alpha,
            specialActive: s1.packet.specialActive,
            isGhosted,
            ageMs,
          };
        }
      }
    }

    // Dead-reckoning extrapolation for brief packet gaps (capped at MAX_EXTRAPOLATION_MS)
    const extrapSec = Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, renderTime - latest.receivedAtMs)) / 1000;
    if (extrapSec > 0.002 && Math.abs(latest.packet.speed) > 0.5) {
      const vx = Math.sin(latest.packet.heading) * latest.packet.speed;
      const vz = Math.cos(latest.packet.heading) * latest.packet.speed;
      return {
        ...latest.packet,
        x: latest.packet.x + vx * extrapSec,
        z: latest.packet.z + vz * extrapSec,
        isGhosted,
        ageMs,
      };
    }

    return {
      ...latest.packet,
      isGhosted,
      ageMs,
    };
  }

  private syncPeerPingsFromRoom(room: RoomState | null) {
    if (!room) return;
    const map: Record<string, number> = {};
    for (const p of room.peers) {
      if (typeof p.pingMs === 'number') {
        map[p.peerId] = p.pingMs;
      }
    }
    this.peerPings = map;
    if (Array.isArray(room.chatMessages)) {
      this.chatMessages = room.chatMessages.slice(-40);
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
        if ((this.room && this.room.code === incomingRoom.code) || msg.targetPeerId === this.peerId) {
          this.room = incomingRoom;
          this.syncPeerPingsFromRoom(this.room);
          if (this.connectionMode !== 'server') {
            this.setConnectionMode('local-relay');
          }
          this.onRoomUpdate?.(this.room);
        }
      } else if (type === 'relay:room_join') {
        if (this.room && this.room.hostId === this.peerId && this.room.code === msg.code) {
          const extRoom = this.room as ExtendedRoomState;
          const joinPeerId = String(msg.peerId);
          if (Array.isArray(extRoom.bannedPeerIds) && extRoom.bannedPeerIds.includes(joinPeerId)) {
            this.broadcastRelay({
              type: 'relay:room_banned',
              code: this.room.code,
              targetPeerId: joinPeerId,
            });
            return;
          }
          const joiningPeer: RoomPeer = {
            peerId: String(msg.peerId),
            name: String(msg.name || 'Guest Driver').slice(0, 24),
            carId: String(msg.carId || 'porsche-963'),
            classId: (msg.classId as CarClassId) || CarClassId.HYPERCAR_GTP,
            livery: msg.livery || {},
            ready: Boolean(msg.isSpectator),
            isHost: false,
            isSpectator: Boolean(msg.isSpectator) || this.room.started,
            eloRating: typeof msg.eloRating === 'number' ? msg.eloRating : 1200,
            safetyRating: typeof msg.safetyRating === 'number' ? msg.safetyRating : 80,
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
            if (typeof msg.isSpectator === 'boolean') peer.isSpectator = msg.isSpectator;
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
          if (!this.room.started) {
            this.room = { ...this.room, started: true };
            this.onRaceStart?.(this.room);
          }
        }
      } else if (type === 'relay:race_telemetry') {
        const pId = String(msg.peerId || '');
        if (pId && pId !== this.peerId && msg.data) {
          this.pushPeerSnapshot(pId, msg.data as PeerTelemetryPacket, Number(msg.sentAtMs) || Date.now());
        }
      } else if (type === 'relay:room_chat') {
        if (this.room && this.room.code === msg.code && msg.message) {
          const entry = msg.message as ChatMessage;
          if (!this.chatMessages.some((m) => m.id === entry.id)) {
            this.chatMessages = [...this.chatMessages.slice(-39), entry];
            this.onChatMessage?.(entry);
          }
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
      } else if (type === 'relay:room_banned') {
        if (msg.targetPeerId === this.peerId && this.room?.code === msg.code) {
          const reason = 'You have been banned from this lobby.';
          this.room = null;
          this.peerTelemetry.clear();
          this.peerSnapshots.clear();
          this.chatMessages = [];
          this.onRoomUpdate?.(null);
          this.onBanned?.(reason);
          this.onKicked?.(reason);
          this.onError?.(reason);
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

  async fetchPublicLobbies(): Promise<LobbySummary[]> {
    try {
      const res = await fetch(getPublicRoomsRestUrl(), { cache: 'no-cache' });
      if (!res.ok) return [];
      const body = (await res.json()) as { rooms?: LobbySummary[] };
      return Array.isArray(body.rooms) ? body.rooms : [];
    } catch {
      return [];
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

  disconnect() {
    this.manualDisconnect = true;
    this.stopClockPingLoop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connected = false;
    this.setConnectionMode('disconnected');
  }

  connect(): Promise<void> {
    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.ws = activeSocket;
          this.connected = true;
          this.setConnectionMode('server');
          this.flushOutboundQueue();
          this.startClockPingLoop();
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
        socket.binaryType = 'arraybuffer';
        activeSocket = socket;

        socket.onopen = () => {
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          finishConnect(true);
        };

        socket.onmessage = (ev) => {
          // Fast-path binary telemetry frame
          if (ev.data instanceof ArrayBuffer) {
            const decoded = decodeBinaryTelemetry(ev.data);
            if (decoded && decoded.peerId !== this.peerId) {
              this.pushPeerSnapshot(decoded.peerId, decoded.packet, decoded.sentAtMs);
            }
            return;
          }

          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          const type = String(msg.type || '');
          if (type === 'clock:pong') {
            const now = Date.now();
            const sent = Number(msg.clientTime) || now;
            const serverTime = Number(msg.serverTime) || now;
            const rtt = Math.max(0, now - sent);
            this.myPingMs = Math.round(rtt / 2);
            this.clockOffsetMs = Math.round(serverTime + rtt / 2 - now);
            return;
          }
          if (type === 'room:state') {
            this.room = msg.room as RoomState;
            if (typeof msg.peerId === 'string') this.peerId = msg.peerId;
            this.syncPeerPingsFromRoom(this.room);
            this.setConnectionMode('server');
            this.onRoomUpdate?.(this.room);
          } else if (type === 'room:started') {
            const incomingRoom = msg.room as RoomState;
            const wasStarted = this.room?.started;
            this.room = incomingRoom;
            this.syncPeerPingsFromRoom(this.room);
            if (!wasStarted) {
              this.onRaceStart?.(this.room);
            }
          } else if (type === 'room:chat') {
            const entry = msg.message as ChatMessage;
            if (entry && !this.chatMessages.some((m) => m.id === entry.id)) {
              this.chatMessages = [...this.chatMessages.slice(-39), entry];
              if (this.room) {
                this.room = { ...this.room, chatMessages: this.chatMessages };
              }
              this.onChatMessage?.(entry);
            }
          } else if (type === 'room:kicked') {
            const reason = String(msg.reason || 'Removed from lobby');
            const isBanned = Boolean(msg.banned);
            this.room = null;
            this.peerTelemetry.clear();
            this.peerSnapshots.clear();
            this.chatMessages = [];
            this.onRoomUpdate?.(null);
            if (isBanned) this.onBanned?.(reason);
            this.onKicked?.(reason);
            this.onError?.(reason);
          } else if (type === 'race:leaderboard_update') {
            const entries = Array.isArray(msg.entries) ? (msg.entries as ServerLeaderboardEntry[]) : [];
            if (this.room) {
              const updated: ExtendedRoomState = {
                ...(this.room as ExtendedRoomState),
                leaderboard: entries,
              };
              this.room = updated;
              this.onRoomUpdate?.(this.room);
            }
            this.onLeaderboardUpdate?.(entries);
          } else if (type === 'room:error') {
            this.onError?.(String(msg.message || 'Multiplayer error'));
          } else if (type === 'race:peer_telemetry') {
            const pId = String(msg.peerId || '');
            if (pId && msg.data) {
              this.pushPeerSnapshot(pId, msg.data as PeerTelemetryPacket, Number(msg.serverTime) || Date.now());
            }
          } else if (type === 'race:ai_sync') {
            if (Array.isArray(msg.cars)) {
              this.onAiSync?.(msg.cars as AiSyncCarState[], Number(msg.serverTime) || Date.now());
            }
          }
        };

        socket.onclose = () => {
          this.stopClockPingLoop();
          if (this.ws === socket) {
            this.ws = null;
            this.connected = false;
            this.setConnectionMode(this.channel ? 'local-relay' : 'disconnected');
          }
          if (!settled) finishConnect(false);
          if (!this.manualDisconnect && !this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              this.connect().catch(() => {});
            }, 2500);
          }
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

  async createRoom(
    name: string,
    carId: string,
    livery: LiveryConfig,
    config: RaceConfig,
    classId?: CarClassId,
    opts?: { isPublic?: boolean; lobbyName?: string },
  ) {
    const profile = loadOnlineProfile();
    const cleanName = String(name || profile.username || 'Host Driver').slice(0, 24);
    if (cleanName !== profile.username) {
      saveOnlineProfile({ ...profile, username: cleanName });
    }
    const isPublic = opts?.isPublic !== false;
    const lobbyName = (opts?.lobbyName || `${cleanName}'s Paddock`).slice(0, 36);

    const hostPeer: RoomPeer = {
      peerId: this.peerId,
      name: cleanName,
      carId: carId || 'ferrari-499p',
      classId: classId || CarClassId.HYPERCAR_GTP,
      livery: livery || ({} as LiveryConfig),
      ready: true,
      isHost: true,
      isSpectator: false,
      pingMs: this.myPingMs,
      eloRating: profile.eloRating,
      safetyRating: profile.safetyRating,
    };

    const payload = JSON.stringify({
      type: 'room:create',
      peerId: this.peerId,
      sessionToken: this.sessionToken,
      name: hostPeer.name,
      carId: hostPeer.carId,
      classId: hostPeer.classId,
      livery: hostPeer.livery,
      eloRating: profile.eloRating,
      safetyRating: profile.safetyRating,
      isPublic,
      lobbyName,
      config,
    });

    this.chatMessages = [];

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return;
      } catch {}
    }

    this.outboundQueue.push(payload);

    try {
      await this.connect();
    } catch {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.flushOutboundQueue();
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.outboundQueue = this.outboundQueue.filter((m) => m !== payload);
    const code = this.generateRoomCode();
    const localRoom: RoomState = {
      code,
      hostId: this.peerId,
      name: lobbyName,
      isPublic,
      config,
      peers: [hostPeer],
      players: { [this.peerId]: hostPeer },
      started: false,
      chatMessages: [],
      trackVotes: {},
    };
    this.room = localRoom;
    this.broadcastRelay({ type: 'relay:room_state', room: localRoom });
    this.onRoomUpdate?.(this.room);
  }

  async joinRoom(
    code: string,
    name: string,
    carId: string,
    livery: LiveryConfig,
    classId?: CarClassId,
    opts?: { isSpectator?: boolean },
  ) {
    const normalizedCode = code.toUpperCase().trim();
    if (!normalizedCode) {
      this.onError?.('Please enter a valid room code.');
      return;
    }

    const profile = loadOnlineProfile();
    const cleanName = String(name || profile.username || 'Guest Driver').slice(0, 24);
    if (cleanName !== profile.username) {
      saveOnlineProfile({ ...profile, username: cleanName });
    }
    const isSpectator = Boolean(opts?.isSpectator);

    const guestPeer: RoomPeer = {
      peerId: this.peerId,
      name: cleanName,
      carId: carId || 'porsche-963',
      classId: classId || CarClassId.HYPERCAR_GTP,
      livery: livery || ({} as LiveryConfig),
      ready: isSpectator,
      isHost: false,
      isSpectator,
      pingMs: this.myPingMs,
      eloRating: profile.eloRating,
      safetyRating: profile.safetyRating,
    };

    const payload = JSON.stringify({
      type: 'room:join',
      code: normalizedCode,
      peerId: this.peerId,
      sessionToken: this.sessionToken,
      name: guestPeer.name,
      carId: guestPeer.carId,
      classId: guestPeer.classId,
      livery: guestPeer.livery,
      isSpectator,
      eloRating: profile.eloRating,
      safetyRating: profile.safetyRating,
    });

    this.chatMessages = [];

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        return;
      } catch {}
    }

    this.outboundQueue.push(payload);

    try {
      await this.connect();
    } catch {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.flushOutboundQueue();
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.outboundQueue = this.outboundQueue.filter((m) => m !== payload);

    const restRoom = await this.fetchRoom(normalizedCode);
    if (restRoom) {
      this.room = restRoom;
      this.syncPeerPingsFromRoom(this.room);
      this.onRoomUpdate?.(this.room);
    }

    this.broadcastRelay({
      type: 'relay:room_join',
      code: normalizedCode,
      peerId: this.peerId,
      name: guestPeer.name,
      carId: guestPeer.carId,
      classId: guestPeer.classId,
      livery: guestPeer.livery,
      isSpectator,
      eloRating: profile.eloRating,
      safetyRating: profile.safetyRating,
    });

    setTimeout(() => {
      if (!this.room || this.room.code !== normalizedCode) {
        this.onError?.(`Room "${normalizedCode}" not found.`);
      }
    }, 2500);
  }

  updateConfig(config: Partial<RaceConfig>, meta?: { isPublic?: boolean; lobbyName?: string }) {
    if (this.room) {
      this.room = {
        ...this.room,
        ...(typeof meta?.isPublic === 'boolean' ? { isPublic: meta.isPublic } : {}),
        ...(typeof meta?.lobbyName === 'string' ? { name: meta.lobbyName } : {}),
        config: { ...this.room.config, ...config },
      };
      this.broadcastRelay({
        type: 'relay:room_configure',
        code: this.room.code,
        config,
      });
      this.onRoomUpdate?.(this.room);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:configure', config, ...meta }));
    }
  }

  updatePeer(payload: {
    name?: string;
    carId?: string;
    classId?: CarClassId;
    livery?: LiveryConfig;
    ready?: boolean;
    isSpectator?: boolean;
  }) {
    if (this.room) {
      const p = this.room.peers.find((x) => x.peerId === this.peerId);
      if (p) {
        if (payload.name) p.name = payload.name;
        if (payload.carId) p.carId = payload.carId;
        if (payload.classId) p.classId = payload.classId;
        if (payload.livery) p.livery = payload.livery;
        if (typeof payload.ready === 'boolean') p.ready = payload.ready;
        if (typeof payload.isSpectator === 'boolean') p.isSpectator = payload.isSpectator;
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

  sendChat(text: string) {
    const clean = text.trim().slice(0, 140);
    if (!this.room || !clean) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:chat', text: clean }));
      return;
    }
    // Local multi-tab relay fallback
    const me = this.room.peers.find((p) => p.peerId === this.peerId);
    const entry: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: this.peerId,
      senderName: me?.name || 'Driver',
      text: clean,
      timestamp: Date.now(),
    };
    this.chatMessages = [...this.chatMessages.slice(-39), entry];
    this.onChatMessage?.(entry);
    this.broadcastRelay({ type: 'relay:room_chat', code: this.room.code, message: entry });
  }

  voteTrack(trackId: string) {
    if (!this.room || !trackId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:vote_track', trackId }));
    }
  }

  kickPeer(targetPeerId: string) {
    if (!this.room || this.room.hostId !== this.peerId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:kick', targetPeerId }));
    }
  }

  banPeer(targetPeerId: string) {
    if (!this.room || this.room.hostId !== this.peerId || !targetPeerId || targetPeerId === this.peerId) return;
    const extRoom = this.room as ExtendedRoomState;
    const prevBans = Array.isArray(extRoom.bannedPeerIds) ? extRoom.bannedPeerIds : [];
    const nextBans = prevBans.includes(targetPeerId) ? prevBans : [...prevBans, targetPeerId];
    const nextPeers = this.room.peers.filter((p) => p.peerId !== targetPeerId);
    const nextPlayers = { ...(this.room.players || {}) };
    delete nextPlayers[targetPeerId];
    const updated: ExtendedRoomState = {
      ...extRoom,
      bannedPeerIds: nextBans,
      peers: nextPeers,
      players: nextPlayers,
    };
    this.room = updated;
    this.broadcastRelay({ type: 'relay:room_banned', code: updated.code, targetPeerId });
    this.broadcastRelay({ type: 'relay:room_state', room: updated });
    this.onRoomUpdate?.(updated);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:ban', targetPeerId }));
    }
  }

  unbanPeer(targetPeerId: string) {
    if (!this.room || this.room.hostId !== this.peerId || !targetPeerId) return;
    const extRoom = this.room as ExtendedRoomState;
    const nextBans = (extRoom.bannedPeerIds ?? []).filter((id) => id !== targetPeerId);
    const updated: ExtendedRoomState = { ...extRoom, bannedPeerIds: nextBans };
    this.room = updated;
    this.broadcastRelay({ type: 'relay:room_state', room: updated });
    this.onRoomUpdate?.(updated);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:unban', targetPeerId }));
    }
  }

  advancePlaylist() {
    if (!this.room || this.room.hostId !== this.peerId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:advance_playlist' }));
      return;
    }
    const extRoom = this.room as ExtendedRoomState;
    const playlist = normalizePlaylist(
      extRoom.config?.playlistEntries ?? extRoom.playlistEntries ?? extRoom.config?.playlist ?? extRoom.playlist,
    );
    const currentIndex = Number(extRoom.config?.playlistIndex ?? extRoom.playlistIndex ?? 0);
    const { nextIndex, entry, votedTrackId } = resolveNextPlaylistIndex(playlist, currentIndex, this.room.trackVotes);
    const nextTrackId = entry?.trackId ?? votedTrackId ?? extRoom.config?.trackId;
    if (!nextTrackId) return;
    const nextConfig: Partial<ExtendedRaceConfig> = {
      ...extRoom.config,
      trackId: nextTrackId,
      customTrack: entry?.customTrack,
      ...(entry?.totalLaps ? { totalLaps: entry.totalLaps } : {}),
      playlistIndex: nextIndex,
    };
    const updated: ExtendedRoomState = {
      ...extRoom,
      trackVotes: {},
      playlistIndex: nextIndex,
      config: nextConfig,
    };
    this.room = updated;
    this.broadcastRelay({ type: 'relay:room_state', room: updated });
    this.onRoomUpdate?.(updated);
  }

  reportLapComplete(
    elapsedSeconds: number,
    trackLengthMeters?: number,
    trackId?: string,
    carId?: string,
    classId?: CarClassId,
  ) {
    if (!this.room) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'race:lap_complete',
          elapsed: elapsedSeconds,
          trackLength: trackLengthMeters,
          trackId: trackId ?? this.room.config?.trackId,
          carId,
          classId,
        }),
      );
    }
  }

  submitRaceResult(results: RaceResultReportEntry[], trackLengthMeters?: number, advancePlaylist = true) {
    if (!this.room || this.room.hostId !== this.peerId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'race:submit_result',
          results,
          trackLength: trackLengthMeters,
          trackId: this.room.config?.trackId,
          advancePlaylist,
        }),
      );
    }
  }

  async fetchLeaderboard(trackId?: string): Promise<ServerLeaderboardEntry[]> {
    try {
      const res = await fetch(getLeaderboardRestUrl(trackId), { cache: 'no-cache' });
      if (!res.ok) return [];
      const data = (await res.json()) as { entries?: ServerLeaderboardEntry[] };
      return Array.isArray(data.entries) ? data.entries : [];
    } catch {
      return [];
    }
  }

  returnToLobby() {
    if (!this.room || this.room.hostId !== this.peerId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:return_to_lobby' }));
    }
  }

  sendAiSync(cars: AiSyncCarState[]) {
    if (!this.room || this.room.hostId !== this.peerId) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'race:ai_sync', cars }));
    }
  }

  startRace() {
    if (this.isStartingRace) return;
    if (this.room) {
      if (this.room.started) return;
      this.isStartingRace = true;
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
    setTimeout(() => {
      this.isStartingRace = false;
    }, 1500);
  }

  sendTelemetry(packet: PeerTelemetryPacket) {
    if (!this.room) return;
    const now = Date.now();
    this.broadcastRelay({
      type: 'relay:race_telemetry',
      peerId: this.peerId,
      data: packet,
      sentAtMs: now,
    });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeBinaryTelemetry(this.peerId, packet, now + this.clockOffsetMs));
      } catch {
        this.ws.send(JSON.stringify({ type: 'race:telemetry', data: packet }));
      }
    }
  }

  leaveRoom() {
    this.isStartingRace = false;
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
    this.peerSnapshots.clear();
    this.chatMessages = [];
    this.onRoomUpdate?.(null);
  }
}

