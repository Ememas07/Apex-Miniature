import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CIRCUIT_GEO } from './fetchDemElevations.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AUDIT_DIR = path.join(ROOT_DIR, 'audit');
const CACHE_DIR = path.join(AUDIT_DIR, '.osm-cache');

fs.mkdirSync(AUDIT_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Extract TRACK_SVG_PATHS and REAL_TRACK_METRICS from src/game/trackSvgs.ts cleanly
function loadExistingTrackData() {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'src/game/trackSvgs.ts'), 'utf8');
  const svgPaths = {};
  const svgRegex = /"([a-z0-9-]+)":\s*"(M\s+[^"]+)"/g;
  let m;
  while ((m = svgRegex.exec(src)) !== null) {
    svgPaths[m[1]] = m[2];
  }

  const metrics = {};
  const metRegex = /'([a-z0-9-]+)':\s*\{\s*lengthMeters:\s*([\d.]+),\s*trackWidth:\s*([\d.]+),\s*targetLapSeconds:\s*([\d.]+)\s*\}/g;
  while ((m = metRegex.exec(src)) !== null) {
    metrics[m[1]] = {
      lengthMeters: Number(m[2]),
      trackWidth: Number(m[3]),
      targetLapSeconds: Number(m[4]),
    };
  }
  return { svgPaths, metrics };
}

function parseSvgVertices(svgD) {
  const regex = /([a-df-z])([^a-df-z]*)/gi;
  let match;
  const vertices = [];
  while ((match = regex.exec(svgD)) !== null) {
    const cmd = match[1].toUpperCase();
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < args.length; i += 2) vertices.push([args[i], args[i + 1]]);
    } else if (cmd === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        vertices.push([args[i + 2], args[i + 3]]);
        vertices.push([args[i + 4], args[i + 5]]);
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i < args.length; i += 4) {
        vertices.push([args[i], args[i + 1]]);
        vertices.push([args[i + 2], args[i + 3]]);
      }
    }
  }
  return vertices;
}

const BACINGER_MAP = {
  'albert-park': 'au-1953',
  bahrain: 'bh-2002',
  baku: 'az-2016',
  barcelona: 'es-1991',
  cota: 'us-2012',
  hungaroring: 'hu-1986',
  imola: 'it-1953',
  'indianapolis-road': 'us-1909',
  interlagos: 'br-1940',
  jeddah: 'sa-2021',
  'las-vegas': 'us-2023',
  lusail: 'qa-2004',
  madring: 'es-2026',
  'mexico-city': 'mx-1962',
  miami: 'us-2022',
  monaco: 'mc-1929',
  montreal: 'ca-1978',
  monza: 'it-1922',
  'paul-ricard': 'fr-1969',
  portimao: 'pt-2008',
  'red-bull-ring': 'at-1969',
  sepang: 'my-1999',
  shanghai: 'cn-2004',
  silverstone: 'gb-1948',
  singapore: 'sg-2008',
  'spa-francorchamps': 'be-1925',
  suzuka: 'jp-1962',
  'watkins-glen': 'us-1956',
  'yas-marina': 'ae-2009',
  zandvoort: 'nl-1948',
};

let bacingerCache = null;
async function loadBacingerGeoJson() {
  if (bacingerCache) return bacingerCache;
  const cacheFile = path.join(CACHE_DIR, '_f1_circuits.geojson');
  if (fs.existsSync(cacheFile)) {
    try {
      bacingerCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return bacingerCache;
    } catch {}
  }
  const res = await fetch(
    'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson',
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching f1-circuits.geojson`);
  bacingerCache = await res.json();
  fs.writeFileSync(cacheFile, JSON.stringify(bacingerCache));
  return bacingerCache;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function queryOverpass(id, lat, lon) {
  const cacheFile = path.join(CACHE_DIR, `${id}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && Array.isArray(cached.elements) && cached.elements.length > 0) {
        return cached;
      }
    } catch {}
  }

  const radius = id === 'le-mans' ? 4800 : 2500;
  const query = `[out:json][timeout:10];(way["highway"="raceway"](around:${radius},${lat},${lon});relation["highway"="raceway"](around:${radius},${lat},${lon}););out body;>;out skel qt;`;

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'ApexMiniatureTrackAudit/1.0 (https://apexminiature.local)',
          Accept: 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(8500),
      });
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.elements) && json.elements.length > 0) {
          fs.writeFileSync(cacheFile, JSON.stringify(json));
          return json;
        }
        return json;
      }
      lastErr = new Error(`HTTP ${res.status} from ${endpoint}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Fallback: Official OpenStreetMap API v0.6 map.json by bounding box around track center
  const dLat = id === 'le-mans' ? 0.042 : 0.016;
  const dLon = dLat / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  const bbox = `${(lon - dLon).toFixed(4)},${(lat - dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + dLat).toFixed(4)}`;
  try {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, {
      headers: {
        'User-Agent': 'ApexMiniatureTrackAudit/1.0 (https://apexminiature.local)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = await res.json();
      const filtered = {
        elements: (json.elements || []).filter(
          (el) =>
            el.type === 'node' ||
            (el.type === 'way' && (el.tags?.highway === 'raceway' || el.tags?.sport === 'motor')) ||
            (el.type === 'relation' && (el.tags?.highway === 'raceway' || el.tags?.route === 'raceway' || el.tags?.sport === 'motor')),
        ),
      };
      if (filtered.elements.some((e) => e.type === 'way')) {
        fs.writeFileSync(cacheFile, JSON.stringify(filtered));
        return filtered;
      }
    }
  } catch (e) {
    lastErr = e;
  }
  throw lastErr || new Error(`Overpass/OSM failed for ${id}`);
}

function latLonToLocalMeters(lat, lon, lat0, lon0) {
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  return [
    (lon - lon0) * cosLat * 111320,
    -(lat - lat0) * 111320, // SVG +Y = South
  ];
}

function polylineLength(pts, closed = false) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  if (closed && pts.length > 2) {
    len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  }
  return len;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    a += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return a;
}

function isBadTrackWay(tags = {}) {
  if (!tags) return false;
  if (tags.service === 'pit_lane' || tags.raceway === 'pit_lane' || tags.highway === 'service') return true;
  const text = `${tags.name || ''} ${tags.description || ''} ${tags.raceway || ''}`.toLowerCase();
  if (/\b(pit\s*lane|pitlane|kart|karting|go-kart|rallycross|drag|drift|skid|paddock|access|service)\b/.test(text)) {
    return true;
  }
  return false;
}

/**
 * Stitch ordered/unordered ways into closed loops, scoring against targetLengthMeters.
 */
function extractBestCircuitLoop(osmJson, lat0, lon0, targetLengthMeters) {
  const nodes = new Map();
  const ways = [];
  const relations = [];

  for (const el of osmJson.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, latLonToLocalMeters(el.lat, el.lon, lat0, lon0));
    } else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      ways.push(el);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      relations.push(el);
    }
  }

  const wayMap = new Map(ways.map((w) => [w.id, w]));
  const candidateLoops = [];

  const stitchWayList = (wayList) => {
    const segs = [];
    for (const w of wayList) {
      const coords = w.nodes.map((nid) => nodes.get(nid)).filter(Boolean);
      if (coords.length < 2) continue;
      // Single closed way directly
      if (w.nodes[0] === w.nodes[w.nodes.length - 1] && coords.length >= 6) {
        candidateLoops.push({ pts: coords.slice(0, -1), source: `closed-way:${w.id}`, tags: w.tags });
      }
      segs.push({ id: w.id, nodeIds: [...w.nodes], coords, tags: w.tags || {} });
    }

    // Build graph of open & closed segments to stitch multi-way loops
    // Cluster node coordinates within 6m so slightly disconnected ways join cleanly
    const endpointKey = (pt) => `${Math.round(pt[0] / 4)}:${Math.round(pt[1] / 4)}`;
    const adj = new Map(); // nodeId -> list of { segIdx, reverse }
    const addAdj = (nid, entry) => {
      if (!adj.has(nid)) adj.set(nid, []);
      adj.get(nid).push(entry);
    };

    segs.forEach((s, idx) => {
      const n0 = s.nodeIds[0];
      const n1 = s.nodeIds[s.nodeIds.length - 1];
      if (n0 === n1) return;
      addAdj(n0, { idx, rev: false });
      addAdj(n1, { idx, rev: true });
    });

    // Also link endpoints geometrically if node IDs don't match within 8m
    for (let i = 0; i < segs.length; i++) {
      const sa = segs[i];
      if (sa.nodeIds[0] === sa.nodeIds[sa.nodeIds.length - 1]) continue;
      const endsA = [
        { nid: sa.nodeIds[0], pt: sa.coords[0] },
        { nid: sa.nodeIds[sa.nodeIds.length - 1], pt: sa.coords[sa.coords.length - 1] },
      ];
      for (let j = i + 1; j < segs.length; j++) {
        const sb = segs[j];
        if (sb.nodeIds[0] === sb.nodeIds[sb.nodeIds.length - 1]) continue;
        const endsB = [
          { nid: sb.nodeIds[0], pt: sb.coords[0], isEnd: true },
          { nid: sb.nodeIds[sb.nodeIds.length - 1], pt: sb.coords[sb.coords.length - 1], isEnd: false },
        ];
        for (const ea of endsA) {
          for (const eb of endsB) {
            if (ea.nid !== eb.nid && Math.hypot(ea.pt[0] - eb.pt[0], ea.pt[1] - eb.pt[1]) < 8.0) {
              // Bridge virtual adjacency
              addAdj(ea.nid, { idx: j, rev: eb.isEnd ? false : true });
              addAdj(eb.nid, { idx: i, rev: ea.nid === sa.nodeIds[0] ? false : true });
            }
          }
        }
      }
    }

    // Trace tangent-continuous loops starting from top 18 longest segments
    const sortedSegIndices = segs
      .map((s, idx) => ({ idx, len: polylineLength(s.coords, false) }))
      .filter((s) => s.len > 10 && segs[s.idx].nodeIds[0] !== segs[s.idx].nodeIds[segs[s.idx].nodeIds.length - 1])
      .sort((a, b) => b.len - a.len)
      .slice(0, 24)
      .map((s) => s.idx);

    const seenSignatures = new Set();
    for (const startIdx of sortedSegIndices) {
      const startSeg = segs[startIdx];
      const startNode = startSeg.nodeIds[0];
      const startPt = startSeg.coords[0];

      // Greedy tangent-guided walk with max 80 segments, trying small branch variations
      const tryWalk = (preferTurnBias) => {
        const used = new Set([startIdx]);
        const pts = [...startSeg.coords];
        let currNode = startSeg.nodeIds[startSeg.nodeIds.length - 1];
        let currPt = pts[pts.length - 1];
        let prevPt = pts[pts.length - 2];
        let totalLen = polylineLength(pts, false);

        for (let step = 0; step < 90; step++) {
          if (
            used.size >= 2 &&
            (currNode === startNode || Math.hypot(currPt[0] - startPt[0], currPt[1] - startPt[1]) < 15.0)
          ) {
            const sig = Array.from(used).sort((a, b) => a - b).join(',');
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              candidateLoops.push({ pts, source: `stitched-${used.size}-ways` });
            }
            return;
          }
          if (totalLen > targetLengthMeters * 1.45) return;

          const dirX = currPt[0] - prevPt[0];
          const dirY = currPt[1] - prevPt[1];
          const dLen = Math.hypot(dirX, dirY) || 1;
          const ux = dirX / dLen;
          const uy = dirY / dLen;

          const cands = [];
          const directEdges = adj.get(currNode) || [];
          for (const e of directEdges) {
            if (used.has(e.idx)) continue;
            const seg = segs[e.idx];
            const coords = e.rev ? [...seg.coords].reverse() : seg.coords;
            const nextNode = e.rev ? seg.nodeIds[0] : seg.nodeIds[seg.nodeIds.length - 1];
            const p0 = coords[0];
            const p1 = coords[1];
            const nx = p1[0] - p0[0];
            const ny = p1[1] - p0[1];
            const nLen = Math.hypot(nx, ny) || 1;
            const dot = (ux * nx + uy * ny) / nLen;
            const cross = (ux * ny - uy * nx) / nLen;
            if (dot < -0.55) continue; // never U-turn sharply back along junction
            const score = dot + preferTurnBias * cross * 0.35 + (isBadTrackWay(seg.tags) ? -1.5 : 0);
            cands.push({ idx: e.idx, coords, nextNode, score });
          }

          if (cands.length === 0) return;
          cands.sort((a, b) => b.score - a.score);
          const pick = cands[0];
          used.add(pick.idx);
          for (let k = 1; k < pick.coords.length; k++) pts.push(pick.coords[k]);
          totalLen = polylineLength(pts, false);
          currNode = pick.nextNode;
          currPt = pts[pts.length - 1];
          prevPt = pts[pts.length - 2];
        }
      };

      tryWalk(0);
      tryWalk(1);
      tryWalk(-1);
    }
  };

  // First try explicit raceway/circuit relations if any exist
  for (const rel of relations) {
    const relWays = rel.members
      .filter((m) => m.type === 'way' && m.role !== 'pit_lane' && wayMap.has(m.ref))
      .map((m) => wayMap.get(m.ref));
    if (relWays.length > 0) {
      stitchWayList(relWays);
    }
  }

  // Next stitch filtered primary raceway ways (excluding pit lanes / karting)
  const cleanRaceways = ways.filter((w) => w.tags?.highway === 'raceway' && !isBadTrackWay(w.tags));
  if (cleanRaceways.length > 0) stitchWayList(cleanRaceways);

  // Fallback to all ways if needed
  if (candidateLoops.length === 0 && ways.length > 0) {
    stitchWayList(ways);
  }

  if (candidateLoops.length === 0) return null;

  // Score candidate loops primarily by proximity to real lengthMeters
  let best = null;
  let bestScore = Infinity;
  for (const c of candidateLoops) {
    const len = polylineLength(c.pts, true);
    if (len < targetLengthMeters * 0.45 || len > targetLengthMeters * 1.65) continue;
    const lenErr = Math.abs(len - targetLengthMeters) / targetLengthMeters;
    // Slight bonus for non-pit-lane & realistic bounding extent
    const xs = c.pts.map((p) => p[0]);
    const ys = c.pts.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (span < 150) continue;
    const score = lenErr;
    if (score < bestScore) {
      bestScore = score;
      best = { ...c, len };
    }
  }

  // If none fell inside 0.45..1.65, pick closest length
  if (!best) {
    for (const c of candidateLoops) {
      const len = polylineLength(c.pts, true);
      if (len < 600) continue;
      const err = Math.abs(len - targetLengthMeters) / targetLengthMeters;
      if (err < bestScore) {
        bestScore = err;
        best = { ...c, len };
      }
    }
  }

  return best;
}

function rdpSimplify(pts, eps) {
  if (pts.length <= 4) return pts;
  let maxDist = 0;
  let idx = 0;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const t = Math.max(0, Math.min(1, ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / lenSq));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const d = Math.hypot(pts[i][0] - px, pts[i][1] - py);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  if (maxDist > eps) {
    const left = rdpSimplify(pts.slice(0, idx + 1), eps);
    const right = rdpSimplify(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

function normalizeToSvgBox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scale = 880 / Math.max(w, h);
  const ox = 500 - ((minX + maxX) * 0.5) * scale;
  const oy = 500 - ((minY + maxY) * 0.5) * scale;
  return pts.map(([x, y]) => [Math.round((x * scale + ox) * 10) / 10, Math.round((y * scale + oy) * 10) / 10]);
}

function resampleClosedLoop(pts, count = 160) {
  const n = pts.length;
  const cum = [0];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  const out = [];
  let cursor = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (cursor < n - 1 && cum[cursor + 1] < target) cursor++;
    const d0 = cum[cursor];
    const d1 = cum[cursor + 1];
    const a = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const p0 = pts[cursor];
    const p1 = pts[(cursor + 1) % n];
    out.push([p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a]);
  }
  return out;
}

function normalizeZeroMeanUnitScale(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  const centered = pts.map(([x, y]) => [x - mx, y - my]);
  let rms = 0;
  for (const [x, y] of centered) rms += x * x + y * y;
  rms = Math.sqrt(rms / centered.length) || 1;
  return centered.map(([x, y]) => [x / rms, y / rms]);
}

function bidirectionalChamfer(ptsA, ptsB) {
  const meanNearest = (src, dst) => {
    let sum = 0;
    for (const [ax, ay] of src) {
      let best = Infinity;
      for (const [bx, by] of dst) {
        const d = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
        if (d < best) best = d;
      }
      sum += Math.sqrt(best);
    }
    return sum / src.length;
  };
  return 0.5 * (meanNearest(ptsA, ptsB) + meanNearest(ptsB, ptsA));
}

function getAspectRatio(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) / Math.max(1, maxY - minY);
}

function countSharpCorners(pts, degThreshold = 32) {
  const n = pts.length;
  let count = 0;
  const radThresh = (degThreshold * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1];
    const bx = p2[0] - p1[0], by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    if (Math.acos(dot) >= radThresh) count++;
  }
  return count;
}

function compareLayouts(curSvg, osmPtsRaw) {
  const curVerts = parseSvgVertices(curSvg);
  const curRes = resampleClosedLoop(curVerts, 160);
  const osmRes = resampleClosedLoop(osmPtsRaw, 160);

  const curNorm = normalizeZeroMeanUnitScale(curRes);
  const osmNorm = normalizeZeroMeanUnitScale(osmRes);

  const rawChamfer = bidirectionalChamfer(curNorm, osmNorm);

  let bestChamfer = Infinity;
  let bestRotDeg = 0;
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const rot = osmNorm.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const d = bidirectionalChamfer(curNorm, rot);
    if (d < bestChamfer) {
      bestChamfer = d;
      bestRotDeg = deg;
    }
  }

  const rad = (bestRotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const osmAlignedRaw = osmPtsRaw.map(([x, y]) => [x * c - y * s, x * s + y * c]);

  const arCur = getAspectRatio(curVerts);
  const arOsm = getAspectRatio(osmAlignedRaw);
  const arDiff = Math.abs(Math.log(Math.max(0.1, arCur) / Math.max(0.1, arOsm)));

  const cornersCur = countSharpCorners(rdpSimplify(curRes, 18), 32);
  const cornersOsm = countSharpCorners(rdpSimplify(osmRes, 18), 32);
  const cornerDiff = Math.abs(cornersCur - cornersOsm);

  const curCCW = signedArea(curVerts) < 0;
  const osmCCW = signedArea(osmPtsRaw) < 0;

  // Composite geometric discrepancy score (independent of map rotation alignment)
  const score = bestChamfer * 100 + arDiff * 14 + cornerDiff * 0.6;
  const severity = score >= 18 ? 'HIGH' : score >= 10 ? 'MEDIUM' : 'LOW';

  return {
    rawChamfer: Number((rawChamfer * 100).toFixed(2)),
    rotAlignedChamfer: Number((bestChamfer * 100).toFixed(2)),
    bestRotDeg,
    arCur: Number(arCur.toFixed(2)),
    arOsm: Number(arOsm.toFixed(2)),
    cornersCur,
    cornersOsm,
    curDir: curCCW ? 'CCW' : 'CW',
    osmDir: osmCCW ? 'CCW' : 'CW',
    score: Number(score.toFixed(2)),
    severity,
  };
}

async function main() {
  const { svgPaths, metrics } = loadExistingTrackData();
  const ids = Object.keys(svgPaths);
  const osmCandidates = {};
  const comparisons = [];

  let f1Geo = null;
  try {
    f1Geo = await loadBacingerGeoJson();
    console.log(`Loaded OSM f1-circuits GeoJSON (${f1Geo.features?.length || 0} circuits).`);
  } catch (e) {
    console.warn(`Could not load f1-circuits GeoJSON (${e.message}), using Overpass directly.`);
  }

  console.log(`Auditing ${ids.length} circuits against OpenStreetMap reference geometry...`);
  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx];
    const geo = CIRCUIT_GEO[id];
    const metric = metrics[id];
    const curSvg = svgPaths[id];

    if (!geo || !metric) {
      console.warn(`[${idx + 1}/${ids.length}] ${id}: missing geo or metrics`);
      continue;
    }

    try {
      let loop = null;
      let elementCount = 0;

      const bId = BACINGER_MAP[id];
      const bFeat = bId && f1Geo?.features?.find((f) => f.properties?.id === bId);
      if (bFeat && Array.isArray(bFeat.geometry?.coordinates)) {
        const coords =
          bFeat.geometry.type === 'MultiLineString'
            ? bFeat.geometry.coordinates.flat()
            : bFeat.geometry.coordinates;
        const pts = coords.map(([lon, lat]) => latLonToLocalMeters(lat, lon, geo.lat, geo.lon));
        if (pts.length >= 8) {
          const len = polylineLength(pts, true);
          loop = { pts, len, source: `osm-f1-circuits:${bId}` };
        }
      }

      if (!loop) {
        const osmJson = await queryOverpass(id, geo.lat, geo.lon);
        elementCount = osmJson.elements?.length || 0;
        loop = extractBestCircuitLoop(osmJson, geo.lat, geo.lon, metric.lengthMeters);
      }

      if (!loop || loop.pts.length < 8) {
        console.warn(`[${idx + 1}/${ids.length}] ${id}: OSM loop not cleanly stitched (elements=${elementCount})`);
        osmCandidates[id] = {
          svgPath: null,
          osmLengthMeters: 0,
          source: 'unavailable',
          notes: `No closed highway=raceway/circuit loop found near (${geo.lat}, ${geo.lon})`,
        };
        comparisons.push({
          id,
          status: 'OSM_INCOMPLETE',
          severity: 'MEDIUM',
          score: 14,
          notes: `Street/partial OSM coverage (${elementCount} elements); manual RacingCircuits.info check recommended`,
          metricLen: metric.lengthMeters,
        });
      } else {
        const boxPts = normalizeToSvgBox(loop.pts);
        const simplified = rdpSimplify(boxPts, 3.2);
        const svgD =
          'M ' +
          simplified.map(([x, y]) => `${x} ${y}`).join(' L ') +
          ' Z';
        const cmp = compareLayouts(curSvg, simplified);
        osmCandidates[id] = {
          svgPath: svgD,
          osmLengthMeters: Math.round(loop.len),
          source: loop.source,
          nodeCount: simplified.length,
        };
        comparisons.push({
          id,
          status: 'MATCHED',
          metricLen: metric.lengthMeters,
          osmLen: Math.round(loop.len),
          lenErrPct: Number((((loop.len - metric.lengthMeters) / metric.lengthMeters) * 100).toFixed(1)),
          ...cmp,
        });
        console.log(
          `[${idx + 1}/${ids.length}] ${id}: osmLen=${Math.round(loop.len)}m (ref=${metric.lengthMeters}m), alignedErr=${cmp.rotAlignedChamfer}, rot=${cmp.bestRotDeg}°, severity=${cmp.severity}`,
        );
      }
    } catch (err) {
      console.error(`[${idx + 1}/${ids.length}] ${id}: ERROR ${err.message}`);
      osmCandidates[id] = {
        svgPath: null,
        osmLengthMeters: 0,
        source: 'error',
        notes: err.message,
      };
      comparisons.push({
        id,
        status: 'ERROR',
        severity: 'MEDIUM',
        score: 15,
        notes: err.message,
        metricLen: metric.lengthMeters,
      });
    }

    // Respect Overpass fair-use rate limits when uncached
    const cacheFile = path.join(CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(cacheFile)) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 1. Write audit/osmCandidateSvgs.ts
  const tsLines = [
    '/**',
    ' * Independent OpenStreetMap Overpass API reference SVGs (1000x1000 normalized viewBox)',
    ' * Generated strictly for offline track layout auditing — never overwrites TRACK_SVG_PATHS.',
    ' */',
    '',
    'export interface OsmCandidateEntry {',
    '  svgPath: string | null;',
    '  osmLengthMeters: number;',
    '  source: string;',
    '  nodeCount?: number;',
    '  notes?: string;',
    '}',
    '',
    'export const OSM_CANDIDATE_SVGS: Record<string, OsmCandidateEntry> = ' + JSON.stringify(osmCandidates, null, 2) + ';',
    '',
  ];
  fs.writeFileSync(path.join(AUDIT_DIR, 'osmCandidateSvgs.ts'), tsLines.join('\n'));

  // 2. Sort comparisons Highest Discrepancy -> Lowest Discrepancy
  comparisons.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const high = comparisons.filter((c) => c.severity === 'HIGH');
  const med = comparisons.filter((c) => c.severity === 'MEDIUM');
  const low = comparisons.filter((c) => c.severity === 'LOW');

  const md = [
    '# Track Layout Discrepancy Audit (Independent OpenStreetMap Overpass vs `TRACK_SVG_PATHS`)',
    '',
    `Generated against **${ids.length} circuits** using live OpenStreetMap Overpass API geometry centered on verified GPS coordinates (\`CIRCUIT_GEO\`).`,
    'Notice: `TRACK_SVG_PATHS` and `trackElevations.ts` were **NOT modified**; all OSM reference SVGs live strictly in `audit/osmCandidateSvgs.ts`.',
    '',
    '## Summary',
    `- **HIGH Discrepancy**: ${high.length} circuits (notable geometric shape, corner sequence, or aspect ratio mismatch even after optimal rotation alignment)`,
    `- **MEDIUM Discrepancy / Incomplete OSM**: ${med.length} circuits (moderate shape divergence, chicane/hairpin detail drift, or temporary street circuit lacking continuous \`highway=raceway\` tags in OSM)`,
    `- **LOW Discrepancy (Faithful Shape)**: ${low.length} circuits (strong structural agreement after rotation alignment)`,
    '',
    '> **Score Guide:** Rotation-aligned Chamfer distance is normalized to a unit-RMS shape (`~5–10` = very close, `10–18` = noticeable corner/straight proportion drift, `>= 18` = major structural mismatch). `BestRot` shows map orientation offset relative to North-up OSM.',
    '',
    '## Full Ranked Audit Table (Highest → Lowest Discrepancy)',
    '',
    '| Rank | Track ID | Severity | Score | Aligned Shape Err | Raw Err | BestRot | Aspect (Cur / OSM) | Corners (Cur / OSM) | Len (Ref / OSM) | Notes |',
    '|---:|---|---|---:|---:|---:|---:|---|---|---|---|',
  ];

  comparisons.forEach((c, idx) => {
    if (c.status !== 'MATCHED') {
      md.push(
        `| ${idx + 1} | \`${c.id}\` | **${c.severity}** | ${c.score} | — | — | — | — | — | ${c.metricLen}m / — | ${c.notes || c.status} |`,
      );
    } else {
      const notes = [];
      if (Math.abs(c.lenErrPct) > 15) notes.push(`OSM loop ${c.lenErrPct > 0 ? '+' : ''}${c.lenErrPct}% len (alt layout/club split)`);
      if (c.bestRotDeg >= 20 && c.bestRotDeg <= 340) notes.push(`Map rotated ~${c.bestRotDeg}° vs North-up`);
      if (c.arCur / Math.max(0.1, c.arOsm) > 1.25 || c.arOsm / Math.max(0.1, c.arCur) > 1.25) notes.push('Aspect ratio stretched');
      if (Math.abs(c.cornersCur - c.cornersOsm) >= 5) notes.push('Corner density/chicane detail differs');
      md.push(
        `| ${idx + 1} | \`${c.id}\` | **${c.severity}** | ${c.score} | ${c.rotAlignedChamfer} | ${c.rawChamfer} | ${c.bestRotDeg}° | ${c.arCur} / ${c.arOsm} | ${c.cornersCur} / ${c.cornersOsm} | ${c.metricLen}m / ${c.osmLen}m | ${notes.join('; ') || 'Good silhouette match'} |`,
      );
    }
  });

  fs.writeFileSync(path.join(AUDIT_DIR, 'track-layout-discrepancies.md'), md.join('\n') + '\n');

  // 3. Write interactive HTML side-by-side comparison viewer
  const cardsData = comparisons.map((c) => ({
    ...c,
    curSvg: svgPaths[c.id],
    osmSvg: osmCandidates[c.id]?.svgPath || null,
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Apex Miniature — Track Layout OSM Audit Viewer</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f17; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .sub { color: #94a3b8; margin-bottom: 20px; font-size: 13px; }
  .legend { display: flex; gap: 20px; margin-bottom: 20px; font-size: 13px; align-items: center; }
  .dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 16px; }
  .card { background: #131a26; border: 1px solid #243044; border-radius: 10px; padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .title { font-weight: 700; font-size: 15px; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
  .HIGH { background: #7f1d1d; color: #fecaca; }
  .MEDIUM { background: #78350f; color: #fde68a; }
  .LOW { background: #14532d; color: #bbf7d0; }
  .svgs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .box { background: #0a0e16; border: 1px solid #1e293b; border-radius: 6px; padding: 4px; text-align: center; }
  .box span { display: block; font-size: 10px; color: #94a3b8; margin-bottom: 2px; }
  svg { width: 100%; height: 125px; display: block; }
  .meta { font-size: 11px; color: #94a3b8; margin-top: 8px; line-height: 1.45; }
</style>
</head>
<body>
  <h1>Apex Miniature — Track Layout Discrepancy Viewer (43 Circuits)</h1>
  <div class="sub">Ranked Highest → Lowest Discrepancy. Current <code>TRACK_SVG_PATHS</code> vs Independent OpenStreetMap Overpass Reference (<code>audit/osmCandidateSvgs.ts</code>).</div>
  <div class="legend">
    <div><span class="dot" style="background:#38bdf8"></span>Current Game SVG</div>
    <div><span class="dot" style="background:#f59e0b"></span>OSM Reference (North-up)</div>
    <div><span class="dot" style="background:#a78bfa"></span>Overlay (Cyan = Current, Amber = OSM)</div>
  </div>
  <div class="grid">
    ${cardsData
      .map(
        (c, i) => `
    <div class="card">
      <div class="head">
        <div class="title">#${i + 1} ${c.id}</div>
        <span class="badge ${c.severity}">${c.severity} (${c.score})</span>
      </div>
      <div class="svgs">
        <div class="box">
          <span>Current SVG</span>
          <svg viewBox="0 0 1000 1000"><path d="${c.curSvg}" fill="none" stroke="#38bdf8" stroke-width="26" stroke-linejoin="round"/></svg>
        </div>
        <div class="box">
          <span>OSM Reference</span>
          ${
            c.osmSvg
              ? `<svg viewBox="0 0 1000 1000"><path d="${c.osmSvg}" fill="none" stroke="#f59e0b" stroke-width="26" stroke-linejoin="round"/></svg>`
              : `<div style="height:125px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b">No closed OSM raceway</div>`
          }
        </div>
        <div class="box">
          <span>Overlay</span>
          <svg viewBox="0 0 1000 1000">
            <path d="${c.curSvg}" fill="none" stroke="#38bdf8" stroke-width="24" stroke-opacity="0.8"/>
            ${c.osmSvg ? `<path d="${c.osmSvg}" fill="none" stroke="#f59e0b" stroke-width="20" stroke-opacity="0.75"/>` : ''}
          </svg>
        </div>
      </div>
      <div class="meta">
        ${
          c.status === 'MATCHED'
            ? `Aligned Err: <b>${c.rotAlignedChamfer}</b> | Raw Err: ${c.rawChamfer} | Rot: ${c.bestRotDeg}° | Aspect: ${c.arCur} vs ${c.arOsm} | Len: ${c.metricLen}m vs ${c.osmLen}m (${c.lenErrPct > 0 ? '+' : ''}${c.lenErrPct}%)`
            : `${c.notes}`
        }
      </div>
    </div>`,
      )
      .join('\n')}
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(AUDIT_DIR, 'track-comparison.html'), html);
  console.log('Saved audit/osmCandidateSvgs.ts, audit/track-layout-discrepancies.md, and audit/track-comparison.html');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
