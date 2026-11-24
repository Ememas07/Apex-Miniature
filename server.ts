import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  PlaylistEntry,
  ServerLeaderboardEntry,
  isValidFastestLapTime,
  normalizePlaylist,
  resolveNextPlaylistIndex,
} from './src/game/multiplayer';
import {
  CommunityTrackEntry,
  STARTER_TEMPLATES,
  StudioTrackSpec,
  analyzeTrackGeometry,
  createCustomTrackSpec,
  isValidTrackSpecObject,
} from './src/game/customTracks';
import { compileTrack, getTrackById } from './src/game/tracks';
import { TrackSpec } from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PeerRecord {
  peerId: string;
  sessionToken?: string;
  name: string;
  carId: string;
  classId?: string;
  livery: unknown;
  ready: boolean;
  isHost: boolean;
  isSpectator: boolean;
  pingMs: number;
  elo: number;
  safetyRating: number;
  ws: WebSocket;
}

interface ChatEntry {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

interface RoomRecord {
  code: string;
  hostId: string;
  isPublic: boolean;
  lobbyName: string;
  config: Record<string, unknown>;
  peers: Map<string, PeerRecord>;
  bannedPeerIds: Set<string>;
  bannedSessionTokens: Set<string>;
  bannedTokenByPeer: Map<string, string>;
  chatMessages: ChatEntry[];
  trackVotes: Record<string, string>; // peerId -> trackId
  started: boolean;
  raceRoundAdvancedForCurrentStart: boolean;
  createdAt: number;
  lastActivityAt: number;
}

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
}

const rooms = new Map<string, RoomRecord>();
const ROOM_IDLE_TTL_MS = 45 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 25_000;

const AUDIT_DIR = path.resolve(__dirname, 'audit');
const LEADERBOARD_FILE = path.join(AUDIT_DIR, 'mp_leaderboard.json');
const COMMUNITY_TRACKS_FILE = path.join(AUDIT_DIR, 'community_tracks.json');

const leaderboardEntries: ServerLeaderboardEntry[] = [];
const communityTracks = new Map<string, CommunityTrackEntry>();
const trackUpvoters = new Map<string, Set<string>>();

function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

function loadServerStores() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item && typeof item.trackId === 'string' && typeof item.lapTimeSeconds === 'number') {
            leaderboardEntries.push(item as ServerLeaderboardEntry);
          }
        }
      }
    }
  } catch {
    // ignore corrupt/unavailable leaderboard file
  }

  try {
    if (fs.existsSync(COMMUNITY_TRACKS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(COMMUNITY_TRACKS_FILE, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry && typeof entry.id === 'string' && isValidTrackSpecObject(entry.trackSpec)) {
            communityTracks.set(entry.id, entry as CommunityTrackEntry);
          }
        }
      }
    }
  } catch {
    // ignore corrupt/unavailable community tracks file
  }

  if (communityTracks.size === 0) {
    const now = Date.now();
    for (let i = 0; i < Math.min(2, STARTER_TEMPLATES.length); i++) {
      const tmpl = STARTER_TEMPLATES[i];
      const spec = createCustomTrackSpec({
        id: `community-${tmpl.id}`,
        name: tmpl.name,
        country: 'Global',
        scenery: tmpl.scenery,
        trackWidth: tmpl.trackWidth,
        kerbPrimary: tmpl.kerbPrimary,
        kerbSecondary: tmpl.kerbSecondary,
        waypoints: tmpl.waypoints,
      });
      const analysis = analyzeTrackGeometry(spec.waypoints, spec.trackWidth);
      communityTracks.set(spec.id, {
        id: spec.id,
        name: spec.name,
        author: 'Apex Motorsport',
        country: spec.country,
        scenery: spec.scenery,
        lengthMeters: analysis.totalLengthMeters,
        corners: analysis.cornerCount,
        targetLapSeconds: spec.targetLapSeconds,
        upvotes: 12 - i * 4,
        createdAt: now - (i + 1) * 3_600_000,
        updatedAt: now - (i + 1) * 3_600_000,
        trackSpec: spec,
      });
    }
  }
}

function saveLeaderboardStore() {
  try {
    ensureAuditDir();
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardEntries.slice(0, 300), null, 2), 'utf-8');
  } catch {
    // ignore disk errors
  }
}

function saveCommunityTracksStore() {
  try {
    ensureAuditDir();
    fs.writeFileSync(
      COMMUNITY_TRACKS_FILE,
      JSON.stringify(Array.from(communityTracks.values()), null, 2),
      'utf-8',
    );
  } catch {
    // ignore disk errors
  }
}

loadServerStores();

function resolveServerTrackLength(
  trackId: string,
  customTrack?: unknown,
  fallbackLength?: number,
): number {
  if (isValidTrackSpecObject(customTrack)) {
    try {
      const compiled = compileTrack(customTrack as TrackSpec);
      if (Number.isFinite(compiled.totalLength) && compiled.totalLength >= 200) {
        return compiled.totalLength;
      }
    } catch {
      // fall through
    }
  }
  const builtIn = getTrackById(trackId);
  if (builtIn && builtIn.id === trackId) {
    try {
      const compiled = compileTrack(builtIn);
      if (Number.isFinite(compiled.totalLength) && compiled.totalLength >= 200) {
        return compiled.totalLength;
      }
    } catch {
      // fall through
    }
  }
  if (typeof fallbackLength === 'number' && Number.isFinite(fallbackLength) && fallbackLength >= 400) {
    return fallbackLength;
  }
  try {
    const compiled = compileTrack(builtIn);
    if (Number.isFinite(compiled.totalLength) && compiled.totalLength >= 200) {
      return compiled.totalLength;
    }
  } catch {
    // ignore
  }
  return 1500;
}

function getTrackLeaderboard(trackId?: string, classId?: string): ServerLeaderboardEntry[] {
  return leaderboardEntries
    .filter((e) => (!trackId || e.trackId === trackId) && (!classId || e.classId === classId))
    .sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)
    .slice(0, 50);
}

function recordValidatedFastestLap(entry: ServerLeaderboardEntry): { accepted: boolean; minValidSeconds: number } {
  const minValidSeconds = entry.trackLengthMeters / 135;
  if (!isValidFastestLapTime(entry.lapTimeSeconds, entry.trackLengthMeters)) {
    return { accepted: false, minValidSeconds };
  }
  const existingIdx = leaderboardEntries.findIndex(
    (e) =>
      e.trackId === entry.trackId &&
      e.peerId === entry.peerId &&
      (e.classId || '') === (entry.classId || ''),
  );
  if (existingIdx >= 0) {
    if (entry.lapTimeSeconds < leaderboardEntries[existingIdx].lapTimeSeconds) {
      leaderboardEntries[existingIdx] = entry;
    }
  } else {
    leaderboardEntries.push(entry);
  }
  leaderboardEntries.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
  if (leaderboardEntries.length > 300) {
    leaderboardEntries.length = 300;
  }
  saveLeaderboardStore();
  return { accepted: true, minValidSeconds };
}

function sanitizeRoomConfig(rawConfig: Record<string, unknown>): Record<string, unknown> {
  const cfg = { ...rawConfig };
  if ('playlist' in cfg) {
    cfg.playlist = normalizePlaylist(cfg.playlist);
  }
  if ('playlistIndex' in cfg) {
    const idx = Number(cfg.playlistIndex);
    cfg.playlistIndex = Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0;
  }
  if ('mandatoryServiceStop' in cfg) {
    cfg.mandatoryServiceStop = Boolean(cfg.mandatoryServiceStop);
  }
  return cfg;
}

function advanceRoomTrackOrPlaylist(room: RoomRecord): boolean {
  const cfg = room.config as Record<string, unknown>;
  const playlist: PlaylistEntry[] = normalizePlaylist(cfg.playlist);
  const currentIdx = Number.isFinite(Number(cfg.playlistIndex)) ? Math.max(0, Math.floor(Number(cfg.playlistIndex))) : 0;
  const hasVotes = Object.keys(room.trackVotes).length > 0;
  if (!hasVotes && playlist.length === 0) {
    return false;
  }

  const { nextIndex, entry, votedTrackId } = resolveNextPlaylistIndex(playlist, currentIdx, room.trackVotes);
  room.trackVotes = {};

  if (entry) {
    cfg.playlistIndex = nextIndex;
    cfg.trackId = entry.trackId;
    cfg.customTrack = entry.customTrack;
    if (entry.totalLaps) {
      cfg.totalLaps = entry.totalLaps;
    }
    const label = entry.trackName || getTrackById(entry.trackId).shortName || entry.trackId;
    pushSystemChat(room, `Playlist Round ${nextIndex + 1}/${playlist.length}: ${label}.`);
    return true;
  }

  if (votedTrackId) {
    cfg.trackId = votedTrackId;
    cfg.customTrack = undefined;
    const label = getTrackById(votedTrackId).shortName || votedTrackId;
    pushSystemChat(room, `Circuit vote winner: ${label}.`);
    return true;
  }

  return false;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sanitizeText(raw: unknown, maxLen: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLen);
}

function isValidTelemetryData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const numericFields = ['x', 'z', 'speed', 'heading'];
  for (const field of numericFields) {
    if (d[field] !== undefined && (typeof d[field] !== 'number' || !Number.isFinite(d[field]))) {
      return false;
    }
  }
  if (typeof d.speed === 'number' && Math.abs(d.speed) > 165) {
    // > ~594 km/h is physically impossible in Apex Miniature
    return false;
  }
  return true;
}

function serializeRoom(room: RoomRecord) {
  const cfg = room.config as Record<string, unknown>;
  const peersList = Array.from(room.peers.values()).map((p) => ({
    peerId: p.peerId,
    name: p.name,
    carId: p.carId,
    classId: p.classId || 'HYPERCAR_GTP',
    livery: p.livery,
    ready: p.ready,
    isHost: p.isHost,
    isSpectator: p.isSpectator,
    pingMs: p.pingMs,
    eloRating: p.elo,
    safetyRating: p.safetyRating,
  }));
  const players: Record<string, typeof peersList[0]> = {};
  for (const p of peersList) {
    players[p.peerId] = p;
  }
  const trackId = String(cfg?.trackId || 'monza');
  return {
    code: room.code,
    hostId: room.hostId,
    name: room.lobbyName,
    isPublic: room.isPublic,
    config: room.config,
    customTrack: cfg?.customTrack,
    started: room.started,
    peers: peersList,
    players,
    bannedPeerIds: Array.from(room.bannedPeerIds),
    playlist: normalizePlaylist(cfg?.playlist),
    playlistIndex: Number.isFinite(Number(cfg?.playlistIndex)) ? Math.max(0, Math.floor(Number(cfg?.playlistIndex))) : 0,
    leaderboard: getTrackLeaderboard(trackId).slice(0, 20),
    chatMessages: room.chatMessages,
    trackVotes: room.trackVotes,
  };
}

function serializeLobbySummary(room: RoomRecord) {
  const host = room.peers.get(room.hostId);
  const cfg = room.config as Record<string, unknown>;
  const activeDrivers = Array.from(room.peers.values()).filter((p) => !p.isSpectator).length;
  const activeClasses = Array.isArray(cfg?.activeClasses) ? cfg.activeClasses : ['HYPERCAR_GTP'];
  return {
    code: room.code,
    name: room.lobbyName,
    hostName: host?.name || 'Host',
    trackId: String(cfg?.trackId || 'monza'),
    activeClasses,
    playerCount: activeDrivers,
    maxPlayers: Math.max(2, Number(cfg?.maxPlayers || 12)),
    started: room.started,
  };
}

function broadcastRoom(room: RoomRecord, payload: unknown, excludePeerId?: string) {
  const raw = JSON.stringify(payload);
  for (const peer of room.peers.values()) {
    if (excludePeerId && peer.peerId === excludePeerId) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(raw);
    }
  }
}

function broadcastBinaryRoom(room: RoomRecord, data: Buffer | ArrayBuffer | Buffer[], excludePeerId?: string) {
  for (const peer of room.peers.values()) {
    if (excludePeerId && peer.peerId === excludePeerId) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(data, { binary: true });
    }
  }
}

function pushSystemChat(room: RoomRecord, text: string) {
  const entry: ChatEntry = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderId: 'system',
    senderName: 'RACE CONTROL',
    text: sanitizeText(text, 140),
    timestamp: Date.now(),
    isSystem: true,
  };
  room.chatMessages.push(entry);
  if (room.chatMessages.length > 40) {
    room.chatMessages.splice(0, room.chatMessages.length - 40);
  }
  broadcastRoom(room, { type: 'room:chat', message: entry });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  app.get(['/api/health', '/Apex-Miniature/api/health'], (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.get(['/api/rooms', '/Apex-Miniature/api/rooms'], (_req, res) => {
    const publicLobbies = Array.from(rooms.values())
      .filter((r) => r.isPublic && r.peers.size > 0)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .map(serializeLobbySummary);
    res.json({ rooms: publicLobbies });
  });

  app.get(['/api/rooms/:code', '/Apex-Miniature/api/rooms/:code'], (req, res) => {
    const code = String(req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(serializeRoom(room));
  });

  app.get(['/api/leaderboard', '/Apex-Miniature/api/leaderboard'], (req, res) => {
    const trackId = typeof req.query.trackId === 'string' ? sanitizeText(req.query.trackId, 64) : undefined;
    const classId = typeof req.query.classId === 'string' ? sanitizeText(req.query.classId, 24) : undefined;
    res.json({ entries: getTrackLeaderboard(trackId, classId) });
  });

  app.post(['/api/leaderboard', '/Apex-Miniature/api/leaderboard'], (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const trackId = sanitizeText(body.trackId, 64) || 'monza';
    const elapsed = Number(body.elapsed ?? body.lapTimeSeconds);
    const trackLength = resolveServerTrackLength(
      trackId,
      body.customTrack,
      Number.isFinite(Number(body.trackLength)) ? Number(body.trackLength) : undefined,
    );
    const entry: ServerLeaderboardEntry = {
      trackId,
      classId: sanitizeText(body.classId, 24) || 'HYPERCAR_GTP',
      peerId: sanitizeText(body.peerId, 32) || `anon-${Math.random().toString(36).slice(2, 8)}`,
      driverName: sanitizeText(body.driverName, 24) || 'Driver',
      carId: sanitizeText(body.carId, 48) || 'ferrari-499p',
      lapTimeSeconds: elapsed,
      trackLengthMeters: Math.round(trackLength),
      recordedAt: Date.now(),
    };
    const result = recordValidatedFastestLap(entry);
    if (!result.accepted) {
      res.status(400).json({
        error: `Lap time failed minimum physics sanity check (${elapsed}s < ${(result.minValidSeconds).toFixed(2)}s for ${Math.round(trackLength)}m).`,
        minValidSeconds: result.minValidSeconds,
      });
      return;
    }
    res.status(201).json({ success: true, entry, entries: getTrackLeaderboard(trackId) });
  });

  app.get(['/api/tracks', '/Apex-Miniature/api/tracks'], (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const sort = req.query.sort === 'newest' ? 'newest' : 'top';
    let list = Array.from(communityTracks.values());
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          t.country.toLowerCase().includes(q) ||
          t.scenery.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) =>
      sort === 'newest'
        ? b.createdAt - a.createdAt
        : b.upvotes - a.upvotes || b.createdAt - a.createdAt,
    );
    res.json({ tracks: list });
  });

  app.get(['/api/tracks/:id', '/Apex-Miniature/api/tracks/:id'], (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    const entry = communityTracks.get(id);
    if (!entry) {
      res.status(404).json({ error: 'Community track not found' });
      return;
    }
    res.json({ track: entry });
  });

  app.post(['/api/tracks', '/Apex-Miniature/api/tracks'], (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const rawTrack = (body.track && typeof body.track === 'object' ? body.track : body) as Record<string, unknown>;
      if (!isValidTrackSpecObject(rawTrack)) {
        res.status(400).json({ error: 'Invalid track payload: must include name and at least 4 waypoints.' });
        return;
      }
      const cleanName = sanitizeText(rawTrack.name, 40) || 'Community Circuit';
      const author = sanitizeText(body.author ?? rawTrack.author, 24) || 'Track Designer';
      const now = Date.now();
      const rawId = sanitizeText(rawTrack.id, 64);
      const needsFreshId = !rawId || rawId.startsWith('template-') || communityTracks.has(rawId);
      const id = needsFreshId ? `trk-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}` : rawId;

      const builtSpec: StudioTrackSpec = createCustomTrackSpec({
        id,
        name: cleanName,
        country: sanitizeText(rawTrack.country, 24) || 'Global',
        scenery: (rawTrack.scenery as TrackSpec['scenery']) || 'stadium',
        trackWidth:
          typeof rawTrack.trackWidth === 'number' && Number.isFinite(rawTrack.trackWidth)
            ? Math.max(12, Math.min(24, rawTrack.trackWidth))
            : 17,
        kerbPrimary: sanitizeText(rawTrack.kerbPrimary, 16) || '#ef4444',
        kerbSecondary: sanitizeText(rawTrack.kerbSecondary, 16) || '#f8fafc',
        pitSide: rawTrack.pitSide === 'right' ? 'right' : 'left',
        startNodeIndex:
          typeof rawTrack.startNodeIndex === 'number' && Number.isFinite(rawTrack.startNodeIndex)
            ? Math.max(0, Math.floor(rawTrack.startNodeIndex))
            : 0,
        waypoints: rawTrack.waypoints,
      });
      if (Array.isArray(rawTrack.sectorSplits) && rawTrack.sectorSplits.length === 2) {
        builtSpec.sectorSplits = [Number(rawTrack.sectorSplits[0]) || 0.33, Number(rawTrack.sectorSplits[1]) || 0.67];
      }

      const analysis = analyzeTrackGeometry(builtSpec.waypoints, builtSpec.trackWidth);
      const entry: CommunityTrackEntry = {
        id,
        name: builtSpec.name,
        author,
        country: builtSpec.country,
        scenery: builtSpec.scenery,
        lengthMeters: analysis.totalLengthMeters,
        corners: analysis.cornerCount,
        targetLapSeconds: builtSpec.targetLapSeconds,
        upvotes: 1,
        createdAt: now,
        updatedAt: now,
        trackSpec: builtSpec,
      };
      communityTracks.set(id, entry);
      saveCommunityTracksStore();
      res.status(201).json({ success: true, track: entry });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to publish community track' });
    }
  });

  app.post(['/api/tracks/:id/upvote', '/Apex-Miniature/api/tracks/:id/upvote'], (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    const entry = communityTracks.get(id);
    if (!entry) {
      res.status(404).json({ error: 'Community track not found' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const voterId = sanitizeText(body.voterId, 64);
    if (voterId) {
      let voters = trackUpvoters.get(id);
      if (!voters) {
        voters = new Set();
        trackUpvoters.set(id, voters);
      }
      if (!voters.has(voterId)) {
        voters.add(voterId);
        entry.upvotes += 1;
        entry.updatedAt = Date.now();
        saveCommunityTracksStore();
      }
    } else {
      entry.upvotes += 1;
      entry.updatedAt = Date.now();
      saveCommunityTracksStore();
    }
    res.json({ success: true, upvotes: entry.upvotes, track: entry });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  // Heartbeat + Idle Room TTL sweeper
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const client of wss.clients) {
      const sock = client as TrackedSocket;
      if (sock.isAlive === false) {
        sock.terminate();
        continue;
      }
      sock.isAlive = false;
      try {
        sock.ping();
      } catch {
        sock.terminate();
      }
    }
    for (const [code, room] of rooms.entries()) {
      if (room.peers.size === 0 || now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        for (const p of room.peers.values()) {
          try {
            p.ws.close(1000, 'Room expired due to inactivity');
          } catch {
            // ignore
          }
        }
        rooms.delete(code);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  sweepTimer.unref?.();

  const isDev = process.env.NODE_ENV !== 'production';
  const viteHmrEnabled = isDev && process.env.DISABLE_HMR !== 'true';

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/ws' || pathname.endsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (!isDev) {
      socket.destroy();
    }
  });

  wss.on('connection', (rawWs) => {
    const ws = rawWs as TrackedSocket;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let joinedRoomCode: string | null = null;
    let currentPeerId: string | null = null;

    // Simple per-socket token bucket rate limiters
    let telemetryTokens = 70;
    let controlTokens = 20;
    let lastRefillMs = Date.now();

    const consumeToken = (bucket: 'telemetry' | 'control'): boolean => {
      const now = Date.now();
      const dtSec = Math.max(0, (now - lastRefillMs) / 1000);
      if (dtSec > 0.02) {
        telemetryTokens = Math.min(75, telemetryTokens + dtSec * 65);
        controlTokens = Math.min(24, controlTokens + dtSec * 12);
        lastRefillMs = now;
      }
      if (bucket === 'telemetry') {
        if (telemetryTokens < 1) return false;
        telemetryTokens -= 1;
        return true;
      }
      if (controlTokens < 1) return false;
      controlTokens -= 1;
      return true;
    };

    const cleanup = () => {
      if (!joinedRoomCode || !currentPeerId) return;
      const room = rooms.get(joinedRoomCode);
      const departingPeerId = currentPeerId;
      joinedRoomCode = null;
      if (!room) return;
      const leaving = room.peers.get(departingPeerId);
      room.peers.delete(departingPeerId);
      delete room.trackVotes[departingPeerId];
      room.lastActivityAt = Date.now();
      if (room.peers.size === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === departingPeerId) {
          const nextHost =
            Array.from(room.peers.values()).find((p) => !p.isSpectator) ||
            room.peers.values().next().value;
          if (nextHost) {
            nextHost.isHost = true;
            room.hostId = nextHost.peerId;
            pushSystemChat(room, `${nextHost.name} is now Race Director.`);
          }
        }
        if (leaving) {
          pushSystemChat(room, `${leaving.name} left the lobby.`);
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      }
    };

    ws.on('message', (rawBuf, isBinary) => {
      ws.isAlive = true;

      // Fast-path: raw binary telemetry frame relay (magic 0x41 0x58 = 'AX')
      if (isBinary) {
        if (!joinedRoomCode || !currentPeerId) return;
        if (!consumeToken('telemetry')) return;
        const room = rooms.get(joinedRoomCode);
        if (!room) return;
        const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf as ArrayBuffer);
        if (buf.byteLength < 12 || buf.byteLength > 256) return;
        if (buf[0] !== 0x41 || buf[1] !== 0x58) return;
        room.lastActivityAt = Date.now();
        broadcastBinaryRoom(room, buf, currentPeerId);
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      // NTP-style clock sync & RTT ping
      if (type === 'clock:ping') {
        const clientTime = Number(msg.clientTime) || Date.now();
        if (joinedRoomCode && currentPeerId && typeof msg.measuredPingMs === 'number' && Number.isFinite(msg.measuredPingMs)) {
          const room = rooms.get(joinedRoomCode);
          const peer = room?.peers.get(currentPeerId);
          if (peer) {
            peer.pingMs = Math.max(0, Math.min(2000, Math.round(msg.measuredPingMs)));
          }
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clock:pong', clientTime, serverTime: Date.now() }));
        }
        return;
      }

      if (type === 'race:telemetry') {
        if (!joinedRoomCode || !currentPeerId) return;
        if (!consumeToken('telemetry')) return;
        const room = rooms.get(joinedRoomCode);
        if (!room) return;
        if (!isValidTelemetryData(msg.data)) return;
        room.lastActivityAt = Date.now();
        broadcastRoom(
          room,
          {
            type: 'race:peer_telemetry',
            peerId: currentPeerId,
            data: msg.data,
            serverTime: Date.now(),
          },
          currentPeerId,
        );
        return;
      }

      if (!consumeToken('control')) return;

      if (type === 'room:create') {
        cleanup();
        const code = generateRoomCode();
        const peerId = sanitizeText(msg.peerId, 32) || `p-${Math.random().toString(36).slice(2, 8)}`;
        const sessionToken = sanitizeText(msg.sessionToken, 64) || undefined;
        const hostName = sanitizeText(msg.name, 24) || 'Host Driver';
        const isPublic = msg.isPublic !== false;
        const lobbyName = sanitizeText(msg.lobbyName, 36) || `${hostName}'s Paddock`;
        const now = Date.now();
        const room: RoomRecord = {
          code,
          hostId: peerId,
          isPublic,
          lobbyName,
          config: sanitizeRoomConfig((msg.config as Record<string, unknown>) || {}),
          peers: new Map(),
          bannedPeerIds: new Set(),
          bannedSessionTokens: new Set(),
          bannedTokenByPeer: new Map(),
          chatMessages: [],
          trackVotes: {},
          started: false,
          raceRoundAdvancedForCurrentStart: false,
          createdAt: now,
          lastActivityAt: now,
        };
        room.peers.set(peerId, {
          peerId,
          sessionToken,
          name: hostName,
          carId: sanitizeText(msg.carId, 48) || 'ferrari-499p',
          classId: sanitizeText(msg.classId, 24) || 'HYPERCAR_GTP',
          livery: msg.livery || {},
          ready: true,
          isHost: true,
          isSpectator: false,
          pingMs: 0,
          elo: Number.isFinite(Number(msg.eloRating ?? msg.elo)) ? Math.round(Number(msg.eloRating ?? msg.elo)) : 1200,
          safetyRating: Number.isFinite(Number(msg.safetyRating)) ? Math.round(Number(msg.safetyRating)) : 80,
          ws,
        });
        rooms.set(code, room);
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: 'room:state', room: serializeRoom(room), peerId }));
        return;
      }

      if (type === 'room:join') {
        const code = sanitizeText(msg.code, 10).toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'room:error', message: `Room "${code}" not found.` }));
          return;
        }
        const peerId = sanitizeText(msg.peerId, 32) || `p-${Math.random().toString(36).slice(2, 8)}`;
        const sessionToken = sanitizeText(msg.sessionToken, 64) || undefined;
        if (
          room.bannedPeerIds.has(peerId) ||
          (sessionToken && room.bannedSessionTokens.has(sessionToken))
        ) {
          ws.send(
            JSON.stringify({
              type: 'room:error',
              code: 'BANNED',
              message: 'You have been banned from this room by the Race Director.',
            }),
          );
          return;
        }
        cleanup();
        const guestName = sanitizeText(msg.name, 24) || 'Guest Driver';
        // Join-in-progress automatically places joiner as spectator unless room hasn't started
        const wantsSpectator = Boolean(msg.isSpectator) || room.started;
        // Idempotent guard: overwrite existing socket for same peerId
        room.peers.set(peerId, {
          peerId,
          sessionToken,
          name: guestName,
          carId: sanitizeText(msg.carId, 48) || 'porsche-963',
          classId: sanitizeText(msg.classId, 24) || 'HYPERCAR_GTP',
          livery: msg.livery || {},
          ready: wantsSpectator,
          isHost: room.hostId === peerId,
          isSpectator: wantsSpectator,
          pingMs: 0,
          elo: Number.isFinite(Number(msg.eloRating ?? msg.elo)) ? Math.round(Number(msg.eloRating ?? msg.elo)) : 1200,
          safetyRating: Number.isFinite(Number(msg.safetyRating)) ? Math.round(Number(msg.safetyRating)) : 80,
          ws,
        });
        room.lastActivityAt = Date.now();
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: 'room:state', room: serializeRoom(room), peerId }));
        pushSystemChat(room, `${guestName} joined${wantsSpectator ? ' as spectator' : ''}.`);
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) }, peerId);
        return;
      }

      if (!joinedRoomCode || !currentPeerId) return;
      const room = rooms.get(joinedRoomCode);
      if (!room) return;
      room.lastActivityAt = Date.now();

      if (type === 'room:configure' && room.hostId === currentPeerId) {
        if (typeof msg.isPublic === 'boolean') room.isPublic = msg.isPublic;
        if (typeof msg.lobbyName === 'string') {
          const clean = sanitizeText(msg.lobbyName, 36);
          if (clean) room.lobbyName = clean;
        }
        if (msg.config && typeof msg.config === 'object') {
          room.config = sanitizeRoomConfig({ ...room.config, ...(msg.config as Record<string, unknown>) });
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      } else if (type === 'room:peer_update') {
        const peer = room.peers.get(currentPeerId);
        if (peer) {
          if (msg.carId) peer.carId = sanitizeText(msg.carId, 48);
          if (msg.classId) peer.classId = sanitizeText(msg.classId, 24);
          if (msg.livery) peer.livery = msg.livery;
          if (typeof msg.ready === 'boolean') peer.ready = msg.ready;
          if (typeof msg.isSpectator === 'boolean' && !room.started) peer.isSpectator = msg.isSpectator;
          if (msg.name) peer.name = sanitizeText(msg.name, 24) || peer.name;
          const incomingElo = msg.eloRating ?? msg.elo;
          if (typeof incomingElo === 'number' && Number.isFinite(incomingElo)) peer.elo = Math.round(incomingElo);
          if (typeof msg.safetyRating === 'number' && Number.isFinite(msg.safetyRating)) {
            peer.safetyRating = Math.max(0, Math.min(100, Math.round(msg.safetyRating)));
          }
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      } else if (type === 'room:start' && room.hostId === currentPeerId) {
        room.started = true;
        room.raceRoundAdvancedForCurrentStart = false;
        room.trackVotes = {};
        broadcastRoom(room, { type: 'room:started', room: serializeRoom(room), serverTime: Date.now() }, currentPeerId);
      } else if (type === 'room:return_to_lobby' && room.hostId === currentPeerId) {
        room.started = false;
        for (const p of room.peers.values()) {
          p.ready = p.isHost;
        }
        if (!room.raceRoundAdvancedForCurrentStart) {
          advanceRoomTrackOrPlaylist(room);
          room.raceRoundAdvancedForCurrentStart = true;
        }
        pushSystemChat(room, 'Host returned the session to the paddock.');
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      } else if (type === 'room:advance_playlist' && room.hostId === currentPeerId) {
        advanceRoomTrackOrPlaylist(room);
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      } else if (type === 'room:chat') {
        const peer = room.peers.get(currentPeerId);
        const text = sanitizeText(msg.text, 140);
        if (peer && text.length > 0) {
          const entry: ChatEntry = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: peer.peerId,
            senderName: peer.name,
            text,
            timestamp: Date.now(),
          };
          room.chatMessages.push(entry);
          if (room.chatMessages.length > 40) {
            room.chatMessages.splice(0, room.chatMessages.length - 40);
          }
          broadcastRoom(room, { type: 'room:chat', message: entry });
        }
      } else if (type === 'room:vote_track') {
        const trackId = sanitizeText(msg.trackId, 48);
        if (trackId) {
          room.trackVotes[currentPeerId] = trackId;
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      } else if (type === 'room:kick' && room.hostId === currentPeerId) {
        const targetId = sanitizeText(msg.targetPeerId, 32);
        if (targetId && targetId !== currentPeerId) {
          const target = room.peers.get(targetId);
          if (target) {
            if (target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ type: 'room:kicked', reason: 'Removed by Race Director' }));
            }
            room.peers.delete(targetId);
            delete room.trackVotes[targetId];
            pushSystemChat(room, `${target.name} was removed by Race Director.`);
            broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
          }
        }
      } else if (type === 'room:ban' && room.hostId === currentPeerId) {
        const targetId = sanitizeText(msg.targetPeerId, 32);
        if (targetId && targetId !== currentPeerId) {
          room.bannedPeerIds.add(targetId);
          const target = room.peers.get(targetId);
          if (target) {
            if (target.sessionToken) {
              room.bannedSessionTokens.add(target.sessionToken);
              room.bannedTokenByPeer.set(targetId, target.sessionToken);
            }
            if (target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(
                JSON.stringify({
                  type: 'room:kicked',
                  banned: true,
                  reason: 'Banned from this lobby by Race Director',
                }),
              );
            }
            room.peers.delete(targetId);
            delete room.trackVotes[targetId];
            pushSystemChat(room, `${target.name} was banned by Race Director.`);
          } else {
            pushSystemChat(room, `Driver ${targetId} was added to room ban list.`);
          }
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      } else if (type === 'room:unban' && room.hostId === currentPeerId) {
        const targetId = sanitizeText(msg.targetPeerId, 32);
        if (targetId) {
          room.bannedPeerIds.delete(targetId);
          const mappedToken = room.bannedTokenByPeer.get(targetId);
          if (mappedToken) {
            room.bannedSessionTokens.delete(mappedToken);
            room.bannedTokenByPeer.delete(targetId);
          }
          pushSystemChat(room, `Ban lifted for ${targetId}.`);
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      } else if (type === 'race:lap_complete') {
        const peer = room.peers.get(currentPeerId);
        if (!peer || peer.isSpectator) return;
        const cfg = room.config as Record<string, unknown>;
        const trackId = sanitizeText(msg.trackId, 64) || String(cfg?.trackId || 'monza');
        const trackLength = resolveServerTrackLength(
          trackId,
          cfg?.customTrack,
          typeof msg.trackLength === 'number' ? msg.trackLength : undefined,
        );
        const elapsed = Number(msg.elapsed);
        const entry: ServerLeaderboardEntry = {
          trackId,
          classId: sanitizeText(msg.classId, 24) || peer.classId || 'HYPERCAR_GTP',
          peerId: peer.peerId,
          driverName: peer.name,
          carId: sanitizeText(msg.carId, 48) || peer.carId,
          lapTimeSeconds: elapsed,
          trackLengthMeters: Math.round(trackLength),
          recordedAt: Date.now(),
        };
        const check = recordValidatedFastestLap(entry);
        if (!check.accepted) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                code: 'INVALID_LAP_TIME',
                message: `Lap rejected by server sanity check (${elapsed}s < ${check.minValidSeconds.toFixed(2)}s min).`,
              }),
            );
          }
          return;
        }
        broadcastRoom(room, {
          type: 'race:leaderboard_update',
          trackId,
          entries: getTrackLeaderboard(trackId).slice(0, 20),
        });
      } else if (type === 'race:submit_result' && room.hostId === currentPeerId) {
        const cfg = room.config as Record<string, unknown>;
        const trackId = sanitizeText(msg.trackId, 64) || String(cfg?.trackId || 'monza');
        const trackLength = resolveServerTrackLength(
          trackId,
          cfg?.customTrack,
          typeof msg.trackLength === 'number' ? msg.trackLength : undefined,
        );
        const rawResults = Array.isArray(msg.results) ? (msg.results as Array<Record<string, unknown>>) : [];
        const totalRacers = Math.max(2, rawResults.length);
        let rejectedAny = false;

        for (const r of rawResults) {
          const targetPeerId = sanitizeText(r.peerId, 32);
          if (!targetPeerId) continue;
          const bestLap = r.bestLapTime;
          if (bestLap !== undefined && bestLap !== null) {
            const elapsed = Number(bestLap);
            if (!isValidFastestLapTime(elapsed, trackLength)) {
              rejectedAny = true;
              continue;
            }
          }
          const peer = room.peers.get(targetPeerId);
          if (bestLap !== undefined && bestLap !== null) {
            recordValidatedFastestLap({
              trackId,
              classId: sanitizeText(r.classId, 24) || peer?.classId || 'HYPERCAR_GTP',
              peerId: targetPeerId,
              driverName: sanitizeText(r.driverName, 24) || peer?.name || 'Driver',
              carId: sanitizeText(r.carId, 48) || peer?.carId || 'ferrari-499p',
              lapTimeSeconds: Number(bestLap),
              trackLengthMeters: Math.round(trackLength),
              recordedAt: Date.now(),
            });
          }
          if (peer) {
            const pos = Math.max(1, Math.min(totalRacers, Number(r.position) || totalRacers));
            const incidents = Math.max(0, Number(r.incidents) || 0);
            const cleanLaps = Math.max(0, Number(r.cleanLaps) || 0);
            const normalizedPerf = 1 - (pos - 1) / (totalRacers - 1);
            const eloDelta = Math.round((normalizedPerf - 0.5) * 44);
            const srDelta = Math.round(cleanLaps * 1.5 - incidents * 4);
            peer.elo = Math.max(400, Math.min(3500, peer.elo + eloDelta));
            peer.safetyRating = Math.max(0, Math.min(100, peer.safetyRating + srDelta));
          }
        }

        if (rejectedAny && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'room:error',
              code: 'INVALID_LAP_TIME',
              message: `One or more results failed minimum lap-time sanity check (min ${(trackLength / 135).toFixed(2)}s). Leaderboard & Elo updates skipped for invalid entries.`,
            }),
          );
        }

        if (msg.advancePlaylist !== false && !room.raceRoundAdvancedForCurrentStart) {
          advanceRoomTrackOrPlaylist(room);
          room.raceRoundAdvancedForCurrentStart = true;
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      } else if (type === 'race:ai_sync' && room.hostId === currentPeerId) {
        // Host-authoritative AI traffic state relay
        broadcastRoom(
          room,
          {
            type: 'race:ai_sync',
            cars: msg.cars,
            serverTime: Date.now(),
          },
          currentPeerId,
        );
      } else if (type === 'room:leave') {
        cleanup();
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  app.post(['/api/telemetry', '/Apex-Miniature/api/telemetry'], (req, res) => {
    try {
      const demo = req.body;
      if (
        !demo ||
        typeof demo.carId !== 'string' ||
        typeof demo.trackId !== 'string' ||
        !Array.isArray(demo.samples) ||
        demo.samples.length === 0
      ) {
        res.status(400).json({ error: 'Invalid telemetry payload' });
        return;
      }
      const auditDir = path.resolve(__dirname, 'audit');
      if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true });
      }
      fs.appendFileSync(path.join(auditDir, 'human_demos.jsonl'), JSON.stringify(demo) + '\n', 'utf-8');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save telemetry demo' });
    }
  });

  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
        hmr: viteHmrEnabled,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/Apex-Miniature', express.static(distPath));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Apex Miniature server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
