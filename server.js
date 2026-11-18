// server.ts
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var rooms = /* @__PURE__ */ new Map();
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}
function serializeRoom(room) {
  const peersList = Array.from(room.peers.values()).map((p) => ({
    peerId: p.peerId,
    name: p.name,
    carId: p.carId,
    classId: p.classId || "HYPERCAR_GTP",
    livery: p.livery,
    ready: p.ready,
    isHost: p.isHost
  }));
  const players = {};
  for (const p of peersList) {
    players[p.peerId] = p;
  }
  return {
    code: room.code,
    hostId: room.hostId,
    config: room.config,
    customTrack: room.config?.customTrack,
    started: room.started,
    peers: peersList,
    players
  };
}
function broadcastRoom(room, payload, excludePeerId) {
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
  app.use(express.json({ limit: "50mb" }));
  app.get(["/api/health", "/Apex-Miniature/api/health"], (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });
  app.get(["/api/rooms/:code", "/Apex-Miniature/api/rooms/:code"], (req, res) => {
    const code = String(req.params.code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json(serializeRoom(room));
  });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/ws" || pathname === "/Apex-Miniature/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  wss.on("connection", (ws) => {
    let joinedRoomCode = null;
    let currentPeerId = null;
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
        broadcastRoom(room, { type: "room:state", room: serializeRoom(room) });
      }
      joinedRoomCode = null;
    };
    ws.on("message", (rawBuf) => {
      let msg;
      try {
        msg = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }
      const type = String(msg.type || "");
      if (type === "room:create") {
        cleanup();
        const code = generateRoomCode();
        const peerId = String(msg.peerId || `p-${Math.random().toString(36).slice(2, 8)}`);
        const room2 = {
          code,
          hostId: peerId,
          config: msg.config || {},
          peers: /* @__PURE__ */ new Map(),
          started: false,
          createdAt: Date.now()
        };
        room2.peers.set(peerId, {
          peerId,
          name: String(msg.name || "Host Driver").slice(0, 24),
          carId: String(msg.carId || "ferrari-499p"),
          classId: String(msg.classId || "HYPERCAR_GTP"),
          livery: msg.livery || {},
          ready: true,
          isHost: true,
          ws
        });
        rooms.set(code, room2);
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: "room:state", room: serializeRoom(room2), peerId }));
        return;
      }
      if (type === "room:join") {
        const code = String(msg.code || "").toUpperCase().trim();
        const room2 = rooms.get(code);
        if (!room2) {
          ws.send(JSON.stringify({ type: "room:error", message: `Room "${code}" not found.` }));
          return;
        }
        cleanup();
        const peerId = String(msg.peerId || `p-${Math.random().toString(36).slice(2, 8)}`);
        room2.peers.set(peerId, {
          peerId,
          name: String(msg.name || "Guest Driver").slice(0, 24),
          carId: String(msg.carId || "porsche-963"),
          classId: String(msg.classId || "HYPERCAR_GTP"),
          livery: msg.livery || {},
          ready: false,
          isHost: room2.hostId === peerId,
          ws
        });
        joinedRoomCode = code;
        currentPeerId = peerId;
        ws.send(JSON.stringify({ type: "room:state", room: serializeRoom(room2), peerId }));
        broadcastRoom(room2, { type: "room:state", room: serializeRoom(room2) }, peerId);
        return;
      }
      if (!joinedRoomCode || !currentPeerId) return;
      const room = rooms.get(joinedRoomCode);
      if (!room) return;
      if (type === "room:configure" && room.hostId === currentPeerId) {
        room.config = { ...room.config, ...msg.config };
        broadcastRoom(room, { type: "room:state", room: serializeRoom(room) });
      } else if (type === "room:peer_update") {
        const peer = room.peers.get(currentPeerId);
        if (peer) {
          if (msg.carId) peer.carId = String(msg.carId);
          if (msg.classId) peer.classId = String(msg.classId);
          if (msg.livery) peer.livery = msg.livery;
          if (typeof msg.ready === "boolean") peer.ready = msg.ready;
          if (msg.name) peer.name = String(msg.name).slice(0, 24);
          broadcastRoom(room, { type: "room:state", room: serializeRoom(room) });
        }
      } else if (type === "room:start" && room.hostId === currentPeerId) {
        room.started = true;
        broadcastRoom(room, { type: "room:started", room: serializeRoom(room) });
      } else if (type === "race:telemetry") {
        broadcastRoom(
          room,
          {
            type: "race:peer_telemetry",
            peerId: currentPeerId,
            data: msg.data
          },
          currentPeerId
        );
      } else if (type === "room:leave") {
        cleanup();
      }
    });
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
  app.post(["/api/telemetry", "/Apex-Miniature/api/telemetry"], (req, res) => {
    try {
      const demo = req.body;
      if (!demo || typeof demo.carId !== "string" || typeof demo.trackId !== "string" || !Array.isArray(demo.samples) || demo.samples.length === 0) {
        res.status(400).json({ error: "Invalid telemetry payload" });
        return;
      }
      const auditDir = path.resolve(__dirname, "audit");
      if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true });
      }
      fs.appendFileSync(path.join(auditDir, "human_demos.jsonl"), JSON.stringify(demo) + "\n", "utf-8");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to save telemetry demo" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use("/Apex-Miniature", express.static(distPath));
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const port = Number(process.env.PORT || 3e3);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Apex Miniature server listening on http://0.0.0.0:${port}`);
  });
}
startServer();
