import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import WebSocket from 'ws';

interface WsQueue {
  next: (predicate?: (msg: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<Record<string, unknown>>;
  close: () => void;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close(() => reject(new Error('Failed to allocate ephemeral port')));
        return;
      }
      const { port } = addr;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, logs: string[]): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server.ts exited prematurely (${child.exitCode}):\n${logs.join('')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // retry until server binds
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for server.ts /api/health:\n${logs.join('')}`);
}

function connectWs(url: string): Promise<{ ws: WebSocket; queue: WsQueue }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const buffered: Record<string, unknown>[] = [];
    const waiters: Array<{
      predicate: (msg: Record<string, unknown>) => boolean;
      resolve: (msg: Record<string, unknown>) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }> = [];

    ws.on('message', (raw) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      const idx = waiters.findIndex((w) => w.predicate(parsed));
      if (idx >= 0) {
        const [waiter] = waiters.splice(idx, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(parsed);
      } else {
        buffered.push(parsed);
      }
    });

    const queue: WsQueue = {
      next: (predicate = () => true, timeoutMs = 5000) => {
        const hitIdx = buffered.findIndex(predicate);
        if (hitIdx >= 0) {
          return Promise.resolve(buffered.splice(hitIdx, 1)[0]);
        }
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            const wIdx = waiters.findIndex((w) => w.resolve === res);
            if (wIdx >= 0) waiters.splice(wIdx, 1);
            rej(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms`));
          }, timeoutMs);
          waiters.push({ predicate, resolve: res, reject: rej, timer });
        });
      },
      close: () => {
        while (waiters.length > 0) {
          const w = waiters.shift()!;
          clearTimeout(w.timer);
          w.reject(new Error('WebSocket closed'));
        }
        try {
          ws.close();
        } catch {
          // ignore
        }
      },
    };

    ws.once('open', () => resolve({ ws, queue }));
    ws.once('error', (err) => reject(err));
  });
}

function snapshotFile(filePath: string): { existed: boolean; content: Buffer | null } {
  if (!fs.existsSync(filePath)) return { existed: false, content: null };
  return { existed: true, content: fs.readFileSync(filePath) };
}

function restoreFile(filePath: string, snap: { existed: boolean; content: Buffer | null }): void {
  try {
    if (snap.existed && snap.content !== null) {
      fs.writeFileSync(filePath, snap.content);
    } else if (!snap.existed && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup error
  }
}

test('E2E Server Smoke: HTTP/WS room create, ban, playlist, lap sanity, tracks gallery & HTML smoke', async () => {
  const repoRoot = process.cwd();
  const tracksFile = path.join(repoRoot, 'audit', 'community_tracks.json');
  const leaderboardFile = path.join(repoRoot, 'audit', 'mp_leaderboard.json');
  const tracksSnap = snapshotFile(tracksFile);
  const leaderboardSnap = snapshotFile(leaderboardFile);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  assert.ok(fs.existsSync(tsxCli), `Expected tsx CLI at ${tsxCli}`);

  const logs: string[] = [];
  const child = spawn(process.execPath, [tsxCli, path.join(repoRoot, 'server.ts')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => logs.push(String(d)));
  child.stderr?.on('data', (d) => logs.push(String(d)));

  let hostConn: { ws: WebSocket; queue: WsQueue } | null = null;
  let guestConn: { ws: WebSocket; queue: WsQueue } | null = null;

  try {
    await waitForHealth(baseUrl, child, logs);

    // 1. Health & HTML smoke (built dist/index.html if present, plus source index.html check)
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; activeRooms: number };
    assert.equal(healthJson.ok, true);

    const distHtmlPath = path.join(repoRoot, 'dist', 'index.html');
    const sourceHtmlPath = path.join(repoRoot, 'index.html');
    const sourceHtml = fs.readFileSync(sourceHtmlPath, 'utf-8');
    assert.ok(sourceHtml.includes('<div id="root">'), 'Expected #root mount in index.html');
    assert.ok(sourceHtml.includes('Apex Miniature'), 'Expected game title in index.html');

    if (fs.existsSync(distHtmlPath)) {
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.status, 200);
      const htmlBody = await htmlRes.text();
      assert.ok(htmlBody.includes('<div id="root">'), 'Expected #root mount in served dist HTML');
      assert.ok(htmlBody.includes('Apex Miniature'), 'Expected game title in served dist HTML');
    }

    // 2. Community Tracks Gallery HTTP endpoints (GET / POST / upvote)
    const listRes = await fetch(`${baseUrl}/api/tracks`);
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as { tracks: Array<{ id: string }> };
    assert.ok(Array.isArray(listJson.tracks) && listJson.tracks.length >= 1);

    const publishRes = await fetch(`${baseUrl}/api/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: 'SmokeTester',
        track: {
          id: 'smoke-ring-test',
          name: 'Smoke Ring',
          country: 'Testland',
          scenery: 'stadium',
          trackWidth: 18,
          waypoints: [
            { x: 0, y: 0, z: -200, surfaceLeft: 'concrete-runoff', surfaceRight: 'gravel', propType: 'grandstand' },
            { x: 240, y: 6, z: 0, propType: 'trees' },
            { x: 0, y: 0, z: 200, propType: 'bridge' },
            { x: -240, y: 0, z: 0, propType: 'tunnel' },
          ],
        },
      }),
    });
    assert.equal(publishRes.status, 201);
    const publishJson = (await publishRes.json()) as {
      success: boolean;
      track: { id: string; upvotes: number; trackSpec: { waypoints: Array<{ surfaceLeft?: string; propType?: string }> } };
    };
    assert.equal(publishJson.success, true);
    const createdTrackId = publishJson.track.id;
    assert.equal(publishJson.track.trackSpec.waypoints[0].surfaceLeft, 'concrete-runoff');
    assert.equal(publishJson.track.trackSpec.waypoints[0].propType, 'grandstand');

    const singleTrackRes = await fetch(`${baseUrl}/api/tracks/${encodeURIComponent(createdTrackId)}`);
    assert.equal(singleTrackRes.status, 200);
    const upvoteRes = await fetch(`${baseUrl}/api/tracks/${encodeURIComponent(createdTrackId)}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: 'smoke-voter-1' }),
    });
    assert.equal(upvoteRes.status, 200);
    const upvoteJson = (await upvoteRes.json()) as { upvotes: number };
    assert.equal(upvoteJson.upvotes, publishJson.track.upvotes + 1);

    // 3. Leaderboard HTTP minimum physics lap sanity check
    const badLapRes = await fetch(`${baseUrl}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackId: 'monza',
        peerId: 'smoke-cheater',
        driverName: 'Cheater',
        carId: 'ferrari-499p',
        elapsed: 5.0,
      }),
    });
    assert.equal(badLapRes.status, 400);

    const goodLapRes = await fetch(`${baseUrl}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackId: 'monza',
        peerId: 'smoke-driver',
        driverName: 'ValidDriver',
        carId: 'ferrari-499p',
        elapsed: 98.5,
      }),
    });
    assert.equal(goodLapRes.status, 201);

    // 4. WebSocket room:create, room:join, room:ban/unban, room:advance_playlist & race:lap_complete sanity
    hostConn = await connectWs(wsUrl);
    guestConn = await connectWs(wsUrl);

    hostConn.ws.send(
      JSON.stringify({
        type: 'room:create',
        peerId: 'host-smoke',
        sessionToken: 'tok-host-smoke',
        name: 'Director',
        isPublic: true,
        lobbyName: 'Smoke Paddock',
        config: {
          trackId: 'monza',
          totalLaps: 3,
          mandatoryServiceStop: true,
          playlist: ['monza', 'spa'],
        },
      }),
    );
    const createdState = await hostConn.queue.next((m) => m.type === 'room:state');
    const createdRoom = createdState.room as {
      code: string;
      config: { mandatoryServiceStop?: boolean; trackId?: string };
      playlist?: string[];
      playlistIndex?: number;
      bannedPeerIds?: string[];
    };
    assert.ok(createdRoom.code && createdRoom.code.length >= 4);
    assert.equal(createdRoom.config.mandatoryServiceStop, true);
    assert.deepEqual(createdRoom.playlist, ['monza', 'spa']);

    // Verify room visible in HTTP /api/rooms
    const roomsRes = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(createdRoom.code)}`);
    assert.equal(roomsRes.status, 200);

    // Guest joins
    guestConn.ws.send(
      JSON.stringify({
        type: 'room:join',
        code: createdRoom.code,
        peerId: 'guest-smoke',
        sessionToken: 'tok-guest-smoke',
        name: 'Guest',
      }),
    );
    const guestJoined = await guestConn.queue.next((m) => m.type === 'room:state');
    assert.equal((guestJoined.room as { peers: unknown[] }).peers.length, 2);

    // Host bans guest
    hostConn.ws.send(JSON.stringify({ type: 'room:ban', targetPeerId: 'guest-smoke' }));
    const kickedMsg = await guestConn.queue.next((m) => m.type === 'room:kicked');
    assert.equal(kickedMsg.banned, true);

    const afterBanState = await hostConn.queue.next(
      (m) => m.type === 'room:state' && Array.isArray((m.room as { bannedPeerIds?: string[] }).bannedPeerIds) &&
        (m.room as { bannedPeerIds: string[] }).bannedPeerIds.includes('guest-smoke'),
    );
    assert.ok((afterBanState.room as { bannedPeerIds: string[] }).bannedPeerIds.includes('guest-smoke'));

    // Banned guest cannot rejoin even with different peerId if using same sessionToken
    guestConn.ws.send(
      JSON.stringify({
        type: 'room:join',
        code: createdRoom.code,
        peerId: 'guest-alt-id',
        sessionToken: 'tok-guest-smoke',
        name: 'GuestAlt',
      }),
    );
    const banErr = await guestConn.queue.next((m) => m.type === 'room:error');
    assert.equal(banErr.code, 'BANNED');

    // Host unbans & guest rejoins
    hostConn.ws.send(JSON.stringify({ type: 'room:unban', targetPeerId: 'guest-smoke' }));
    await hostConn.queue.next(
      (m) => m.type === 'room:state' && (m.room as { bannedPeerIds?: string[] }).bannedPeerIds?.length === 0,
    );

    guestConn.ws.send(
      JSON.stringify({
        type: 'room:join',
        code: createdRoom.code,
        peerId: 'guest-smoke',
        sessionToken: 'tok-guest-smoke',
        name: 'Guest',
      }),
    );
    await guestConn.queue.next((m) => m.type === 'room:state');

    // Host advances playlist from monza (0) -> spa (1)
    hostConn.ws.send(JSON.stringify({ type: 'room:advance_playlist' }));
    const advState = await hostConn.queue.next(
      (m) => m.type === 'room:state' && (m.room as { playlistIndex?: number }).playlistIndex === 1,
    );
    assert.equal((advState.room as { config: { trackId?: string } }).config.trackId, 'spa');

    // WS lap_complete sanity check (rejects 10s lap on Spa, accepts 112.4s lap)
    guestConn.ws.send(
      JSON.stringify({
        type: 'race:lap_complete',
        trackId: 'spa',
        elapsed: 10.0,
      }),
    );
    const lapErr = await guestConn.queue.next((m) => m.type === 'room:error');
    assert.equal(lapErr.code, 'INVALID_LAP_TIME');

    guestConn.ws.send(
      JSON.stringify({
        type: 'race:lap_complete',
        trackId: 'spa',
        elapsed: 112.4,
      }),
    );
    const lbUpdate = await hostConn.queue.next((m) => m.type === 'race:leaderboard_update');
    assert.equal(lbUpdate.trackId, 'spa');
  } finally {
    hostConn?.queue.close();
    guestConn?.queue.close();
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    restoreFile(tracksFile, tracksSnap);
    restoreFile(leaderboardFile, leaderboardSnap);
  }
});
