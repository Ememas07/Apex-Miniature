import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PeerRecord {
  peerId: string;
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
  chatMessages: ChatEntry[];
  trackVotes: Record<string, string>; // peerId -> trackId
  started: boolean;
  createdAt: number;
  lastActivityAt: number;
}

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
}

const rooms = new Map<string, RoomRecord>();
const ROOM_IDLE_TTL_MS = 45 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 25_000;

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
  return {
    code: room.code,
    hostId: room.hostId,
    name: room.lobbyName,
    isPublic: room.isPublic,
    config: room.config,
    customTrack: (room.config as Record<string, unknown>)?.customTrack,
    started: room.started,
    peers: peersList,
    players,
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

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/ws' || pathname.endsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
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
        const hostName = sanitizeText(msg.name, 24) || 'Host Driver';
        const isPublic = msg.isPublic !== false;
        const lobbyName = sanitizeText(msg.lobbyName, 36) || `${hostName}'s Paddock`;
        const now = Date.now();
        const room: RoomRecord = {
          code,
          hostId: peerId,
          isPublic,
          lobbyName,
          config: (msg.config as Record<string, unknown>) || {},
          peers: new Map(),
          chatMessages: [],
          trackVotes: {},
          started: false,
          createdAt: now,
          lastActivityAt: now,
        };
        room.peers.set(peerId, {
          peerId,
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
        cleanup();
        const peerId = sanitizeText(msg.peerId, 32) || `p-${Math.random().toString(36).slice(2, 8)}`;
        const guestName = sanitizeText(msg.name, 24) || 'Guest Driver';
        // Join-in-progress automatically places joiner as spectator unless room hasn't started
        const wantsSpectator = Boolean(msg.isSpectator) || room.started;
        // Idempotent guard: overwrite existing socket for same peerId
        room.peers.set(peerId, {
          peerId,
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
          room.config = { ...room.config, ...(msg.config as Record<string, unknown>) };
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
        room.trackVotes = {};
        broadcastRoom(room, { type: 'room:started', room: serializeRoom(room), serverTime: Date.now() }, currentPeerId);
      } else if (type === 'room:return_to_lobby' && room.hostId === currentPeerId) {
        room.started = false;
        for (const p of room.peers.values()) {
          p.ready = p.isHost;
        }
        pushSystemChat(room, 'Host returned the session to the paddock.');
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
