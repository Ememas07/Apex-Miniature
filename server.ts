import express from 'express';
import http from 'http';
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
  ws: WebSocket;
}

interface RoomRecord {
  code: string;
  hostId: string;
  config: Record<string, unknown>;
  peers: Map<string, PeerRecord>;
  started: boolean;
  createdAt: number;
}

const rooms = new Map<string, RoomRecord>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
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
  }));
  const players: Record<string, typeof peersList[0]> = {};
  for (const p of peersList) {
    players[p.peerId] = p;
  }
  return {
    code: room.code,
    hostId: room.hostId,
    config: room.config,
    customTrack: (room.config as Record<string, unknown>)?.customTrack,
    started: room.started,
    peers: peersList,
    players,
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

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(serializeRoom(room));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let joinedRoomCode: string | null = null;
    let currentPeerId: string | null = null;

    const cleanup = () => {
      if (!joinedRoomCode || !currentPeerId) return;
      const room = rooms.get(joinedRoomCode);
      if (!room) return;
      room.peers.delete(currentPeerId);
      if (room.peers.size === 0) {
        rooms.delete(joinedRoomCode);
      } else {
        if (room.hostId === currentPeerId) {
          const nextHost = room.peers.values().next().value;
          if (nextHost) {
            nextHost.isHost = true;
            room.hostId = nextHost.peerId;
          }
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      }
      joinedRoomCode = null;
    };

    ws.on('message', (rawBuf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:create') {
        cleanup();
        const code = generateRoomCode();
        const peerId = String(msg.peerId || `p-${Math.random().toString(36).slice(2, 8)}`);
        const room: RoomRecord = {
          code,
          hostId: peerId,
          config: (msg.config as Record<string, unknown>) || {},
          peers: new Map(),
          started: false,
          createdAt: Date.now(),
        };
        room.peers.set(peerId, {
          peerId,
          name: String(msg.name || 'Host Driver').slice(0, 24),
          carId: String(msg.carId || 'ferrari-499p'),
          classId: String(msg.classId || 'HYPERCAR_GTP'),
          livery: msg.livery || {},
          ready: true,
          isHost: true,
          ws,
        });
        rooms.set(code, room);
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: 'room:state', room: serializeRoom(room), peerId }));
        return;
      }

      if (type === 'room:join') {
        const code = String(msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'room:error', message: `Room "${code}" not found.` }));
          return;
        }
        cleanup();
        const peerId = String(msg.peerId || `p-${Math.random().toString(36).slice(2, 8)}`);
        // Idempotent guard: overwrite existing socket for same peerId
        room.peers.set(peerId, {
          peerId,
          name: String(msg.name || 'Guest Driver').slice(0, 24),
          carId: String(msg.carId || 'porsche-963'),
          classId: String(msg.classId || 'HYPERCAR_GTP'),
          livery: msg.livery || {},
          ready: false,
          isHost: room.hostId === peerId,
          ws,
        });
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: 'room:state', room: serializeRoom(room), peerId }));
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) }, peerId);
        return;
      }

      if (!joinedRoomCode || !currentPeerId) return;
      const room = rooms.get(joinedRoomCode);
      if (!room) return;

      if (type === 'room:configure' && room.hostId === currentPeerId) {
        room.config = { ...room.config, ...(msg.config as Record<string, unknown>) };
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      } else if (type === 'room:peer_update') {
        const peer = room.peers.get(currentPeerId);
        if (peer) {
          if (msg.carId) peer.carId = String(msg.carId);
          if (msg.classId) peer.classId = String(msg.classId);
          if (msg.livery) peer.livery = msg.livery;
          if (typeof msg.ready === 'boolean') peer.ready = msg.ready;
          if (msg.name) peer.name = String(msg.name).slice(0, 24);
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      } else if (type === 'room:start' && room.hostId === currentPeerId) {
        room.started = true;
        broadcastRoom(room, { type: 'room:started', room: serializeRoom(room) });
      } else if (type === 'race:telemetry') {
        broadcastRoom(
          room,
          {
            type: 'race:peer_telemetry',
            peerId: currentPeerId,
            data: msg.data,
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
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
