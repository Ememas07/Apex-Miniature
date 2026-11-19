import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Georeference Table for All 43 Circuits (Centroid lat, lon, calibrated rotDeg for non-GeoJSON fallback)
// 32 circuits are directly aligned via real-world GPS loops (GeoJSON / OSM) + Cyclic DTW.
// The remaining 11 circuits use exact filleted SVG geometry rotated to their true Start/Finish compass bearing.
export const CIRCUIT_GEO = {
  // Flagships & Europe
  "spa-francorchamps": { lat: 50.4369, lon: 5.9720, rotDeg: 99 },
  "le-mans":           { lat: 47.9378, lon: 0.2255, rotDeg: 134 },
  "silverstone":       { lat: 52.0733, lon: -1.0147, rotDeg: 85 },
  "portimao":          { lat: 37.2315, lon: -8.6283, rotDeg: 76 },
  "monza":             { lat: 45.6206, lon: 9.2855, rotDeg: 80 },
  "monaco":            { lat: 43.7347, lon: 7.4206, rotDeg: 303 },
  "imola":             { lat: 44.3439, lon: 11.7167, rotDeg: 15 },
  "barcelona":         { lat: 41.5700, lon: 2.2611, rotDeg: 295 },
  "madring":           { lat: 40.4658, lon: -3.6164, rotDeg: 285 },
  "red-bull-ring":     { lat: 47.2215, lon: 14.7620, rotDeg: 355 },
  "hungaroring":       { lat: 47.5817, lon: 19.2506, rotDeg: 25 },
  "zandvoort":         { lat: 52.3888, lon: 4.5409, rotDeg: 100 },
  "paul-ricard":       { lat: 43.2506, lon: 5.7917, rotDeg: 345 },
  "baku":              { lat: 40.3725, lon: 49.8533, rotDeg: 345 },

  // North & South America
  "daytona-road":      { lat: 29.1856, lon: -81.0705, rotDeg: 350 },
  "laguna-seca":       { lat: 36.5842, lon: -121.7533, rotDeg: 55 },
  "cota":              { lat: 30.1345, lon: -97.6360, rotDeg: 9 },
  "sebring":           { lat: 27.4547, lon: -81.3483, rotDeg: 207 },
  "long-beach":        { lat: 33.7652, lon: -118.1893, rotDeg: 46 },
  "detroit-street":    { lat: 42.3294, lon: -83.0401, rotDeg: 12 },
  "mid-ohio":          { lat: 40.6894, lon: -82.6367, rotDeg: 83 },
  "watkins-glen":      { lat: 42.3369, lon: -76.9272, rotDeg: 100 },
  "mosport":           { lat: 44.0481, lon: -78.6756, rotDeg: 223 },
  "lime-rock":         { lat: 41.9278, lon: -73.3836, rotDeg: 203 },
  "road-america":      { lat: 43.7989, lon: -87.9953, rotDeg: 88 },
  "vir":               { lat: 36.5669, lon: -79.2067, rotDeg: 43 },
  "indianapolis-road": { lat: 39.7950, lon: -86.2347, rotDeg: 285 },
  "road-atlanta":      { lat: 34.1458, lon: -83.8178, rotDeg: 234 },
  "montreal":          { lat: 45.5006, lon: -73.5228, rotDeg: 75 },
  "miami":             { lat: 25.9581, lon: -80.2389, rotDeg: 5 },
  "las-vegas":         { lat: 36.1147, lon: -115.1628, rotDeg: 80 },
  "mexico-city":       { lat: 19.4042, lon: -99.0907, rotDeg: 345 },
  "interlagos":        { lat: -23.7036, lon: -46.6997, rotDeg: 285 },

  // Asia, Middle East & Oceania
  "suzuka":            { lat: 34.8431, lon: 136.5419, rotDeg: 0 },
  "fuji":              { lat: 35.3717, lon: 138.9267, rotDeg: 0 },
  "shanghai":          { lat: 31.3389, lon: 121.2197, rotDeg: 245 },
  "singapore":         { lat: 1.2914, lon: 103.8640, rotDeg: 10 },
  "sepang":            { lat: 2.7608, lon: 101.7383, rotDeg: 355 },
  "bahrain":           { lat: 26.0325, lon: 50.5106, rotDeg: 75 },
  "jeddah":            { lat: 21.6319, lon: 39.1044, rotDeg: 110 },
  "lusail":            { lat: 25.4900, lon: 51.4542, rotDeg: 335 },
  "yas-marina":        { lat: 24.4672, lon: 54.6031, rotDeg: 260 },
  "albert-park":       { lat: -37.8497, lon: 144.9680, rotDeg: 35 },
};

const F1_GEOJSON_MAP = {
  "albert-park": "au-1953",
  "bahrain": "bh-2002",
  "shanghai": "cn-2004",
  "barcelona": "es-1991",
  "monaco": "mc-1929",
  "montreal": "ca-1978",
  "paul-ricard": "fr-1969",
  "red-bull-ring": "at-1969",
  "silverstone": "gb-1948",
  "hungaroring": "hu-1986",
  "spa-francorchamps": "be-1925",
  "monza": "it-1922",
  "singapore": "sg-2008",
  "suzuka": "jp-1962",
  "cota": "us-2012",
  "mexico-city": "mx-1962",
  "interlagos": "br-1940",
  "yas-marina": "ae-2009",
  "imola": "it-1953",
  "portimao": "pt-2008",
  "sepang": "my-1999",
  "zandvoort": "nl-1948",
  "jeddah": "sa-2021",
  "miami": "us-2022",
  "lusail": "qa-2004",
  "madring": "es-2026",
  "baku": "az-2016",
  "las-vegas": "us-2023",
  "indianapolis-road": "us-1909",
  "watkins-glen": "us-1956",
};

const CCW_CIRCUIT_IDS = new Set([
  "baku",
  "cota",
  "daytona-road",
  "detroit-street",
  "imola",
  "interlagos",
  "jeddah",
  "laguna-seca",
  "las-vegas",
  "miami",
  "singapore",
  "yas-marina",
]);

// 7-tap Gaussian filter kernel across circular closed-loop
const GAUSS_WEIGHTS = [0.05, 0.12, 0.20, 0.26, 0.20, 0.12, 0.05];
const HALF_TAP = 3;

export function gaussianSmooth(arr, passes = 2) {
  let curr = [...arr];
  const n = curr.length;
  for (let p = 0; p < passes; p++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -HALF_TAP; k <= HALF_TAP; k++) {
        const idx = (i + k + n) % n;
        sum += curr[idx] * GAUSS_WEIGHTS[k + HALF_TAP];
      }
      next[i] = sum;
    }
    curr = next;
  }
  return curr;
}

export function parseSvgVertices(svgD) {
  const regex = /([a-df-z])([^a-df-z]*)/gi;
  let match;
  const vertices = [];
  while ((match = regex.exec(svgD)) !== null) {
    const cmd = match[1].toUpperCase();
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < args.length; i += 2) {
        vertices.push([args[i], args[i + 1]]);
      }
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

function signedAreaXZ(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}

function resampleClosed2D(pts, count) {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[cum.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const out = [];
  for (let i = 0; i < count; i++) {
    const targetD = (i / count) * total;
    let idx = 0;
    while (idx < n - 1 && cum[idx + 1] <= targetD) idx++;
    const d0 = cum[idx];
    const d1 = cum[idx + 1];
    const frac = d1 - d0 > 1e-9 ? (targetD - d0) / (d1 - d0) : 0;
    const a = pts[idx];
    const b = pts[(idx + 1) % n];
    out.push([
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
    ]);
  }
  return out;
}

// Mirrors src/game/trackSvgs.ts svgToTrackPoints() filleted XZ geometry and arc-length parameterization
export function resampleTrackLoop(svgD, lengthMeters, samplesCount = 200, trackId = '', trackWidth = 13.5) {
  const rawVerts = parseSvgVertices(svgD);
  if (rawVerts.length < 3) return [];

  const filtered = [];
  for (let i = 0; i < rawVerts.length; i++) {
    const v = rawVerts[i];
    if (filtered.length > 0) {
      const prev = filtered[filtered.length - 1];
      if (Math.hypot(v[0] - prev[0], v[1] - prev[1]) < 7) continue;
    }
    filtered.push(v);
  }
  while (filtered.length > 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 7) {
      filtered.pop();
    } else {
      break;
    }
  }

  const isCCW = CCW_CIRCUIT_IDS.has(trackId);
  if (trackId !== 'suzuka' && filtered.length > 2) {
    const area = signedAreaXZ(filtered);
    if ((isCCW && area > 0) || (!isCCW && area < 0)) {
      const rest = filtered.slice(1).reverse();
      filtered.splice(1, rest.length, ...rest);
    }
  }

  const minSafeRadius = Math.max(9.5, trackWidth * 0.72);
  const n = filtered.length;
  let sumX = 0, sumZ = 0;
  for (const v of filtered) {
    sumX += v[0];
    sumZ += v[1];
  }
  const meanX = sumX / n;
  const meanZ = sumZ / n;

  const centered = filtered.map((v) => [v[0] - meanX, v[1] - meanZ]);
  let rawLen = 0;
  for (let i = 0; i < n; i++) {
    const a = centered[i];
    const b = centered[(i + 1) % n];
    rawLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const scale = lengthMeters / Math.max(100, rawLen);
  const scaled = centered.map((v) => [v[0] * scale, v[1] * scale]);

  const cornerExpanded = [];
  for (let i = 0; i < n; i++) {
    const prev = scaled[(i - 1 + n) % n];
    const curr = scaled[i];
    const next = scaled[(i + 1) % n];

    const inDx = curr[0] - prev[0];
    const inDz = curr[1] - prev[1];
    const inLen = Math.hypot(inDx, inDz) || 1;
    const uInX = inDx / inLen;
    const uInZ = inDz / inLen;

    const outDx = next[0] - curr[0];
    const outDz = next[1] - curr[1];
    const outLen = Math.hypot(outDx, outDz) || 1;
    const uOutX = outDx / outLen;
    const uOutZ = outDz / outLen;

    const dot = Math.max(-0.999, Math.min(0.999, uInX * uOutX + uInZ * uOutZ));
    const phi = Math.acos(dot);

    if (phi < 0.085) {
      cornerExpanded.push([curr[0], curr[1]]);
      continue;
    }

    const r =
      phi >= 1.55
        ? minSafeRadius
        : phi >= 0.75
        ? minSafeRadius * (1.0 + 1.8 * ((1.55 - phi) / 0.8))
        : Math.min(180, minSafeRadius * 2.8 + ((0.75 - phi) / 0.75) * 95);
    const tanHalf = Math.tan(phi * 0.5);
    const maxTrim = 0.42 * Math.min(inLen, outLen);
    const trim = Math.min(r * tanHalf, maxTrim);
    const rEff = trim / Math.max(1e-4, tanHalf);

    const ax = curr[0] - uInX * trim;
    const az = curr[1] - uInZ * trim;
    const bx = curr[0] + uOutX * trim;
    const bz = curr[1] + uOutZ * trim;

    const cross = uInX * uOutZ - uInZ * uOutX;
    const sign = cross >= 0 ? 1 : -1;
    const nAx = -sign * uInZ;
    const nAz = sign * uInX;

    const cx = ax + nAx * rEff;
    const cz = az + nAz * rEff;

    const angA = Math.atan2(az - cz, ax - cx);
    const angB = Math.atan2(bz - cz, bx - cx);
    let dAng = angB - angA;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;

    const arcLen = Math.abs(dAng) * rEff;
    const desiredArcChords = Math.max(2, Math.min(8, Math.round(arcLen / 8.5)));
    const interiorPts = Math.max(1, desiredArcChords - 1);

    cornerExpanded.push([ax, az]);
    for (let k = 1; k <= interiorPts; k++) {
      const frac = k / (interiorPts + 1);
      const theta = angA + dAng * frac;
      cornerExpanded.push([cx + Math.cos(theta) * rEff, cz + Math.sin(theta) * rEff]);
    }
    cornerExpanded.push([bx, bz]);
  }

  const cleaned = [];
  for (let i = 0; i < cornerExpanded.length; i++) {
    const pt = cornerExpanded[i];
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 3.5) {
        prev[0] = (prev[0] + pt[0]) * 0.5;
        prev[1] = (prev[1] + pt[1]) * 0.5;
        continue;
      }
    }
    cleaned.push([pt[0], pt[1]]);
  }

  const gap = 20;
  const dense = [];
  const m = cleaned.length;
  for (let i = 0; i < m; i++) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % m];
    dense.push(a);
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen > gap) {
      const steps = Math.floor(segLen / gap);
      for (let s = 1; s <= steps; s++) {
        const frac = s / (steps + 1);
        dense.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
      }
    }
  }

  return resampleClosed2D(dense, samplesCount);
}

// Extract real-world GPS closed loop [lon, lat][] from local GeoJSON / OSM caches
function loadRealGpsLoops() {
  const loops = {};
  const cacheDir = path.join(ROOT_DIR, 'audit', '.osm-cache');

  // 1. F1 Circuits GeoJSON (30 circuits)
  const gjPath = path.join(cacheDir, '_f1_circuits.geojson');
  if (fs.existsSync(gjPath)) {
    const gj = JSON.parse(fs.readFileSync(gjPath, 'utf8'));
    const byId = new Map();
    for (const f of gj.features || []) {
      if (f?.properties?.id && f?.geometry?.type === 'LineString') {
        byId.set(f.properties.id, f.geometry.coordinates);
      }
    }
    for (const [trackId, gjId] of Object.entries(F1_GEOJSON_MAP)) {
      const raw = byId.get(gjId);
      if (raw && raw.length >= 20) {
        const coords = raw.slice();
        if (Math.hypot(coords[0][0] - coords[coords.length - 1][0], coords[0][1] - coords[coords.length - 1][1]) < 1e-6) {
          coords.pop();
        }
        loops[trackId] = coords;
      }
    }
  }

  // 2. Fuji Speedway OSM closed way 148622740
  const fujiPath = path.join(cacheDir, 'fuji.json');
  if (fs.existsSync(fujiPath)) {
    const d = JSON.parse(fs.readFileSync(fujiPath, 'utf8'));
    const nodeMap = new Map();
    for (const e of d.elements || []) {
      if (e.type === 'node') nodeMap.set(e.id, [e.lon, e.lat]);
    }
    const mainWay = (d.elements || []).find((e) => e.type === 'way' && e.id === 148622740);
    if (mainWay && mainWay.nodes.length >= 50) {
      const coords = mainWay.nodes.map((id) => nodeMap.get(id)).filter(Boolean);
      if (coords.length > 2 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) {
        coords.pop();
      }
      loops['fuji'] = coords;
    }
  }

  // 3. Laguna Seca OSM stitched main raceway loop (all non-Pit-Lane highway=raceway ways)
  const lagunaPath = path.join(cacheDir, 'laguna-seca.json');
  if (fs.existsSync(lagunaPath)) {
    const d = JSON.parse(fs.readFileSync(lagunaPath, 'utf8'));
    const nodeMap = new Map();
    for (const e of d.elements || []) {
      if (e.type === 'node') nodeMap.set(e.id, [e.lon, e.lat]);
    }
    const ways = (d.elements || []).filter(
      (e) => e.type === 'way' && e.tags?.highway === 'raceway' && e.tags?.name !== 'Pit Lane'
    );
    if (ways.length > 0) {
      const remaining = ways.map((w) => w.nodes.slice());
      const chain = remaining.shift();
      let progressed = true;
      while (remaining.length > 0 && progressed) {
        progressed = false;
        const head = chain[0];
        const tail = chain[chain.length - 1];
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          if (seg[0] === tail) {
            chain.push(...seg.slice(1));
            remaining.splice(i, 1);
            progressed = true;
            break;
          } else if (seg[seg.length - 1] === tail) {
            chain.push(...seg.slice(0, -1).reverse());
            remaining.splice(i, 1);
            progressed = true;
            break;
          } else if (seg[seg.length - 1] === head) {
            chain.unshift(...seg.slice(0, -1));
            remaining.splice(i, 1);
            progressed = true;
            break;
          } else if (seg[0] === head) {
            chain.unshift(...seg.slice(1).reverse());
            remaining.splice(i, 1);
            progressed = true;
            break;
          }
        }
      }
      if (chain.length >= 50 && remaining.length === 0) {
        if (chain[0] === chain[chain.length - 1]) chain.pop();
        loops['laguna-seca'] = chain.map((id) => nodeMap.get(id)).filter(Boolean);
      }
    }
  }

  return loops;
}

function gpsToLocalMeters(coords) {
  let lat0 = 0, lon0 = 0;
  for (const [lon, lat] of coords) {
    lat0 += lat;
    lon0 += lon;
  }
  lat0 /= coords.length;
  lon0 /= coords.length;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const xy = coords.map(([lon, lat]) => [
    (lon - lon0) * 111320 * cosLat,
    -(lat - lat0) * 111320, // +z = south (matches SVG +y down)
  ]);
  return { xy, lat0, lon0, cosLat };
}

function resampleGpsLoop(coords, count) {
  const { xy, lat0, lon0, cosLat } = gpsToLocalMeters(coords);
  const resampledXY = resampleClosed2D(xy, count);
  const resampledGps = resampledXY.map(([east, south]) => ({
    lat: lat0 - south / 111320,
    lon: lon0 + east / (111320 * cosLat),
  }));
  return { xy: resampledXY, gps: resampledGps };
}

function normalizeLoop(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length;
  my /= pts.length;
  const centered = pts.map(([x, y]) => [x - mx, y - my]);
  let rms = 0;
  for (const [x, y] of centered) rms += x * x + y * y;
  rms = Math.sqrt(rms / centered.length) || 1;
  return centered.map(([x, y]) => [x / rms, y / rms]);
}

function computeTangents(pts, stride = 2) {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[(i - stride + n) % n];
    const b = pts[(i + stride) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
}

function computeSignedCurvatures(pts, stride = 3) {
  const n = pts.length;
  const raw = pts.map((_, i) => {
    const a = pts[(i - stride + n) % n];
    const b = pts[i];
    const c = pts[(i + stride) % n];
    const v1x = b[0] - a[0], v1y = b[1] - a[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const cross = (v1x * v2y - v1y * v2x) / (l1 * l2);
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    return Math.atan2(cross, dot);
  });
  return gaussianSmooth(raw, 1);
}

// Align normalized game SVG loop S[0..N-1] onto real GPS loop G[0..N-1] using Procrustes + Cyclic DTW
function alignSvgToRealLoop(S_xy, G_xy) {
  const N = S_xy.length;
  const Sn = normalizeLoop(S_xy);
  const Gn = normalizeLoop(G_xy);
  const Ts = computeTangents(Sn, 2);
  const Tg = computeTangents(Gn, 2);
  const Ks = computeSignedCurvatures(Sn, 3);
  const Kg = computeSignedCurvatures(Gn, 3);

  // 1. Find optimal global shift and rotation via closed-form Procrustes
  let bestErr = Infinity;
  let bestShift = 0;
  let bestTheta = 0;

  for (let shift = 0; shift < N; shift++) {
    let cSum = 0, sSum = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + shift) % N;
      const [sx, sy] = Sn[i];
      const [gx, gy] = Gn[j];
      cSum += sx * gx + sy * gy + 0.4 * (Ts[i][0] * Tg[j][0] + Ts[i][1] * Tg[j][1]);
      sSum += sx * gy - sy * gx + 0.4 * (Ts[i][0] * Tg[j][1] - Ts[i][1] * Tg[j][0]);
    }
    const theta = Math.atan2(sSum, cSum);
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    let err = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + shift) % N;
      const rx = Sn[i][0] * ct - Sn[i][1] * st;
      const ry = Sn[i][0] * st + Sn[i][1] * ct;
      const dx = rx - Gn[j][0];
      const dy = ry - Gn[j][1];
      const trx = Ts[i][0] * ct - Ts[i][1] * st;
      const tryy = Ts[i][0] * st + Ts[i][1] * ct;
      const tDot = trx * Tg[j][0] + tryy * Tg[j][1];
      const dk = Ks[i] - Kg[j];
      err += dx * dx + dy * dy + 0.4 * (1 - tDot) + 0.25 * dk * dk;
    }
    if (err < bestErr) {
      bestErr = err;
      bestShift = shift;
      bestTheta = theta;
    }
  }

  // Rotate S into G's frame and gently match principal-axis aspect ratio for DTW scoring
  const ct = Math.cos(bestTheta);
  const st = Math.sin(bestTheta);
  const Srot = Sn.map(([x, y]) => [x * ct - y * st, x * st + y * ct]);
  const Trot = Ts.map(([x, y]) => [x * ct - y * st, x * st + y * ct]);

  // Principal axis of Gn
  let cxx = 0, cyy = 0, cxy = 0;
  for (const [x, y] of Gn) { cxx += x * x; cyy += y * y; cxy += x * y; }
  const paAng = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cp = Math.cos(paAng), sp = Math.sin(paAng);

  let gU2 = 0, gV2 = 0, sU2 = 0, sV2 = 0;
  for (let i = 0; i < N; i++) {
    const gu = Gn[i][0] * cp + Gn[i][1] * sp;
    const gv = -Gn[i][0] * sp + Gn[i][1] * cp;
    gU2 += gu * gu; gV2 += gv * gv;
    const su = Srot[i][0] * cp + Srot[i][1] * sp;
    const sv = -Srot[i][0] * sp + Srot[i][1] * cp;
    sU2 += su * su; sV2 += sv * sv;
  }
  const scaleU = Math.max(0.65, Math.min(1.55, Math.sqrt(gU2 / Math.max(1e-6, sU2))));
  const scaleV = Math.max(0.65, Math.min(1.55, Math.sqrt(gV2 / Math.max(1e-6, sV2))));
  const Sfit = Srot.map(([x, y]) => {
    const u = (x * cp + y * sp) * scaleU;
    const v = (-x * sp + y * cp) * scaleV;
    return [u * cp - v * sp, u * sp + v * cp];
  });
  const Tfit = computeTangents(Sfit, 2);

  // 2. Cyclic Monotonic DTW mapping i in [0..N] -> j in [bestShift..bestShift+N]
  // Band constraint allows up to +-32 samples (+-16% lap length) of local straight/corner warp
  const BAND = 32;
  const W = 2 * BAND + 1;
  const INF = 1e12;

  const costAt = (iIdx, jIdx) => {
    const i = iIdx % N;
    const j = ((jIdx % N) + N) % N;
    const dx = Sfit[i][0] - Gn[j][0];
    const dy = Sfit[i][1] - Gn[j][1];
    const posCost = dx * dx + dy * dy;
    const tDot = Tfit[i][0] * Tg[j][0] + Tfit[i][1] * Tg[j][1];
    const tanCost = 1 - tDot;
    const dk = Ks[i] - Kg[j];
    const curvCost = dk * dk;
    return posCost + 0.55 * tanCost + 0.65 * curvCost;
  };

  // Refine anchor offset around bestShift so start (i=0) isn't artificially pinned if S/F shifted slightly
  let bestAnchorDelta = 0;
  let bestDtwTotal = INF;
  let bestMapping = null;

  for (const anchorDelta of [-12, -8, -4, 0, 4, 8, 12]) {
    const startShift = bestShift + anchorDelta;
    const dp = Array.from({ length: N + 1 }, () => new Float64Array(W).fill(INF));
    const prevMove = Array.from({ length: N + 1 }, () => new Int8Array(W).fill(-1));

    dp[0][BAND] = 0;
    for (let i = 0; i <= N; i++) {
      for (let b = 0; b < W; b++) {
        const cur = dp[i][b];
        if (cur >= INF * 0.5) continue;
        const delta = b - BAND; // j = startShift + i + delta

        // Move 0: diagonal (i+1, j+1) -> delta unchanged
        if (i + 1 <= N) {
          const c = cur + costAt(i + 1, startShift + i + 1 + delta);
          if (c < dp[i + 1][b]) {
            dp[i + 1][b] = c;
            prevMove[i + 1][b] = 0;
          }
        }
        // Move 1: advance i only (i+1, j) -> delta - 1 (SVG longer than real)
        if (i + 1 <= N && b - 1 >= 0) {
          const c = cur + costAt(i + 1, startShift + i + delta) + 0.035;
          if (c < dp[i + 1][b - 1]) {
            dp[i + 1][b - 1] = c;
            prevMove[i + 1][b - 1] = 1;
          }
        }
        // Move 2: advance j only (i, j+1) -> delta + 1 (real longer than SVG)
        if (b + 1 < W) {
          const c = cur + costAt(i, startShift + i + delta + 1) + 0.035;
          if (c < dp[i][b + 1]) {
            dp[i][b + 1] = c;
            prevMove[i][b + 1] = 2;
          }
        }
      }
    }

    const total = dp[N][BAND];
    if (total < bestDtwTotal) {
      bestDtwTotal = total;
      bestAnchorDelta = anchorDelta;

      // Backtrack path and average mapped j-values per SVG index i
      const sumJ = new Float64Array(N);
      const cntJ = new Int32Array(N);
      let ci = N;
      let cb = BAND;
      while (ci > 0 || cb !== BAND) {
        const jVal = startShift + ci + (cb - BAND);
        if (ci < N) {
          sumJ[ci] += jVal;
          cntJ[ci] += 1;
        }
        const mv = prevMove[ci][cb];
        if (mv === 0) {
          ci -= 1;
        } else if (mv === 1) {
          ci -= 1;
          cb += 1;
        } else if (mv === 2) {
          cb -= 1;
        } else {
          break;
        }
      }
      sumJ[0] += startShift;
      cntJ[0] += 1;

      const mapping = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const avgJ = cntJ[i] > 0 ? sumJ[i] / cntJ[i] : startShift + i;
        mapping[i] = ((avgJ % N) + N) % N;
      }
      bestMapping = mapping;
    }
  }

  return {
    mapping: bestMapping,
    bestShift: ((bestShift + bestAnchorDelta) % N + N) % N,
    rotDeg: ((bestTheta * 180) / Math.PI + 360) % 360,
    rmsErr: Math.sqrt(bestErr / N),
    dtwMeanCost: bestDtwTotal / N,
  };
}

function sampleCircularLinear(arr, idxFloat) {
  const n = arr.length;
  const wrapped = ((idxFloat % n) + n) % n;
  const i0 = Math.floor(wrapped) % n;
  const i1 = (i0 + 1) % n;
  const f = wrapped - Math.floor(wrapped);
  return arr[i0] * (1 - f) + arr[i1] * f;
}

// Disk cache v2 (keyed on real GPS loops & calibrated orientations, never reusing stale v1 entries)
const CACHE_FILE = path.join(__dirname, '.dem_cache_v2.json');
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

let openMeteoDisabled = false;

async function fetchElevationBatch(lats, lons) {
  if (!openMeteoDisabled) {
    const openMeteoUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(openMeteoUrl, { headers: { 'User-Agent': 'ApexMiniature/2.0' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.elevation)) {
            return data.elevation;
          }
        }
        if (res.status === 429) {
          openMeteoDisabled = true;
          break;
        }
        if (res.status >= 500) {
          await new Promise((r) => setTimeout(r, attempt * 1800));
          continue;
        }
        break;
      } catch {
        await new Promise((r) => setTimeout(r, attempt * 1200));
      }
    }
  }

  const locs = lats.map((lat, i) => `${lat},${lons[i]}`).join('|');
  const otdUrl = `https://api.opentopodata.org/v1/mapzen?locations=${locs}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(otdUrl, { headers: { 'User-Agent': 'ApexMiniature/2.0' } });
      const data = await res.json();
      if (data && Array.isArray(data.results)) {
        return data.results.map((r) => r.elevation ?? 0);
      }
      if (data && data.error) {
        console.log(`    [OpenTopoData wait: ${data.error}] Backing off 2.5s...`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (err) {
      console.log(`    [OpenTopoData retry ${attempt}]: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Failed to fetch DEM elevations for ${lats.length} points`);
}

async function fetchOrCacheElevations(cache, cacheKey, coords) {
  if (cache[cacheKey] && Array.isArray(cache[cacheKey]) && cache[cacheKey].length === coords.length) {
    return { elevations: cache[cacheKey], cached: true };
  }
  const lats = coords.map((c) => c.lat.toFixed(6));
  const lons = coords.map((c) => c.lon.toFixed(6));
  const b1 = await fetchElevationBatch(lats.slice(0, 100), lons.slice(0, 100));
  await new Promise((r) => setTimeout(r, 350));
  const b2 = await fetchElevationBatch(lats.slice(100, 200), lons.slice(100, 200));
  await new Promise((r) => setTimeout(r, 350));
  const elevations = [...b1, ...b2];
  cache[cacheKey] = elevations;
  saveCache(cache);
  return { elevations, cached: false };
}

async function main() {
  console.log('========================================================================');
  console.log('APEX MINIATURE - REAL-WORLD GPS-ALIGNED SATELLITE DEM EXTRACTOR (v2)');
  console.log('Querying Copernicus 30m DEM along true GPS loops + Cyclic DTW alignment');
  console.log('========================================================================\n');

  const trackSvgsFile = path.join(ROOT_DIR, 'src', 'game', 'trackSvgs.ts');
  const trackSvgsContent = fs.readFileSync(trackSvgsFile, 'utf8');

  const svgMatch = trackSvgsContent.match(/export const TRACK_SVG_PATHS[^{]+(\{[\s\S]*?\n\};)/);
  if (!svgMatch) throw new Error('Could not find TRACK_SVG_PATHS in trackSvgs.ts');
  const TRACK_SVG_PATHS = new Function('return ' + svgMatch[1])();

  const metricsMatch = trackSvgsContent.match(/export const REAL_TRACK_METRICS[^{]+(\{[\s\S]*?\n\};)/);
  if (!metricsMatch) throw new Error('Could not find REAL_TRACK_METRICS in trackSvgs.ts');
  const REAL_TRACK_METRICS = new Function('return ' + metricsMatch[1])();

  const realGpsLoops = loadRealGpsLoops();
  const cache = loadCache();
  const trackIds = Object.keys(TRACK_SVG_PATHS);
  console.log(`Loaded ${trackIds.length} circuit SVGs and ${Object.keys(realGpsLoops).length} real-world GPS loops.\n`);

  const DEM_ELEVATIONS = {};

  for (let idx = 0; idx < trackIds.length; idx++) {
    const trackId = trackIds[idx];
    const svgD = TRACK_SVG_PATHS[trackId];
    const metric = REAL_TRACK_METRICS[trackId];
    const geo = CIRCUIT_GEO[trackId];

    if (!metric || !geo) {
      console.warn(`[WARN] Skipping ${trackId}...`);
      continue;
    }

    const progressStr = `[${(idx + 1).toString().padStart(2, '0')}/${trackIds.length}] ${trackId.padEnd(20)}`;
    const svgLoopXY = resampleTrackLoop(svgD, metric.lengthMeters, 200, trackId, metric.trackWidth ?? 13.5);

    let rawElevations;
    if (realGpsLoops[trackId]) {
      // Mode 1: True real-world GPS loop + Procrustes + Cyclic DTW corner alignment
      let gpsCoords = realGpsLoops[trackId].slice();
      const { xy: rawGxy } = gpsToLocalMeters(gpsCoords);
      const isCCW = CCW_CIRCUIT_IDS.has(trackId);

      if (trackId === 'suzuka') {
        // Test both directions for figure-8 Suzuka and pick the lower-error alignment
        const fwd = resampleGpsLoop(gpsCoords, 200);
        const revCoords = gpsCoords.slice().reverse();
        const rev = resampleGpsLoop(revCoords, 200);
        const aFwd = alignSvgToRealLoop(svgLoopXY, fwd.xy);
        const aRev = alignSvgToRealLoop(svgLoopXY, rev.xy);
        if (aRev.rmsErr < aFwd.rmsErr) gpsCoords = revCoords;
      } else {
        const area = signedAreaXZ(rawGxy);
        if ((isCCW && area > 0) || (!isCCW && area < 0)) {
          gpsCoords.reverse();
        }
      }

      const realLoop = resampleGpsLoop(gpsCoords, 200);
      const align = alignSvgToRealLoop(svgLoopXY, realLoop.xy);
      const cacheKey = `gps:${trackId}`;
      const { elevations: realElevs, cached } = await fetchOrCacheElevations(cache, cacheKey, realLoop.gps);

      rawElevations = new Array(200);
      for (let i = 0; i < 200; i++) {
        rawElevations[i] = sampleCircularLinear(realElevs, align.mapping[i]);
      }

      process.stdout.write(
        `${progressStr} [GPS+DTW${cached ? ' cached' : ' fetched'}] rot=${align.rotDeg.toFixed(0).padStart(3)}° shift=${String(align.bestShift).padStart(3)} err=${align.rmsErr.toFixed(3)} dtw=${align.dtwMeanCost.toFixed(3)}\n`
      );
    } else {
      // Mode 2: Exact filleted SVG geometry rotated to verified Start/Finish compass bearing
      const rad = (geo.rotDeg * Math.PI) / 180;
      const coords = svgLoopXY.map(([x, z]) => {
        const eastMeters = x * Math.cos(rad) - z * Math.sin(rad);
        const southMeters = x * Math.sin(rad) + z * Math.cos(rad);
        const lat = geo.lat - southMeters / 111320;
        const lon = geo.lon + eastMeters / (111320 * Math.cos((geo.lat * Math.PI) / 180));
        return { lat, lon };
      });
      const cacheKey = `svg:${trackId}:rot${geo.rotDeg}`;
      const { elevations, cached } = await fetchOrCacheElevations(cache, cacheKey, coords);
      rawElevations = elevations;
      process.stdout.write(
        `${progressStr} [SVG+ROT${cached ? ' cached' : ' fetched'}] rot=${String(geo.rotDeg).padStart(3)}°\n`
      );
    }

    // Post-processing:
    // A. Overpass Bridge clearance preservation on suzuka figure-8:
    // Underpass occurs at t ≈ 0.400 (idx ~80), Overpass deck crosses at t ≈ 0.808 (idx ~162).
    let elevs = [...rawElevations];
    if (trackId === 'suzuka') {
      const underpassY = elevs[Math.round(0.40 * elevs.length)] ?? elevs[80];
      const bridgeBaseY = elevs[Math.round(0.808 * elevs.length)] ?? elevs[162];
      const targetBoost = Math.max(11.0, underpassY + 10.5 - bridgeBaseY);
      for (let i = 0; i < 200; i++) {
        const t = i / 200;
        let boost = 0;
        if (t >= 0.785 && t <= 0.830) {
          boost = targetBoost;
        } else if (t >= 0.750 && t < 0.785) {
          const u = (t - 0.750) / 0.035;
          boost = (1 - Math.cos(u * Math.PI)) * 0.5 * targetBoost;
        } else if (t > 0.830 && t <= 0.865) {
          const u = (t - 0.830) / 0.035;
          boost = (1 + Math.cos(u * Math.PI)) * 0.5 * targetBoost;
        }
        elevs[i] += boost;
      }
    }

    // B. Closed-Loop 2-Pass 7-Tap Gaussian Smoothing (C2 smooth while preserving real crests/valleys)
    const smoothed = gaussianSmooth(elevs, 2);

    // C. Normalize to Start/Finish Datum: elevations[0] = 0.0m
    const base0 = smoothed[0];
    const normalized = smoothed.map((e) => Math.round((e - base0) * 10) / 10);
    normalized[0] = 0.0;

    DEM_ELEVATIONS[trackId] = normalized;
  }

  // Write output lookup table to src/game/trackElevations.ts
  const outFile = path.join(ROOT_DIR, 'src', 'game', 'trackElevations.ts');
  const header = `/**
 * Real-World Satellite Digital Elevation Model (DEM) lookup table
 * for all 43 circuits fetched from Copernicus DEM via Open-Meteo & OpenTopoData Elevation APIs.
 * 200 samples per closed circuit loop, corner-aligned to real GPS loops via Procrustes + Cyclic DTW,
 * normalized to Start/Finish line (0.0m datum) and filtered with 2 passes of circular 7-tap Gaussian smoothing.
 *
 * Generated by scripts/fetchDemElevations.mjs
 */

export const REAL_DEM_ELEVATIONS: Record<string, number[]> = {\n`;

  let outContent = header;
  for (const [id, profile] of Object.entries(DEM_ELEVATIONS)) {
    outContent += `  '${id}': [\n`;
    for (let i = 0; i < profile.length; i += 10) {
      const slice = profile.slice(i, i + 10);
      outContent += `    ${slice.map((v) => (v === 0 ? '0.0' : v.toFixed(1))).join(', ')},\n`;
    }
    outContent += `  ],\n\n`;
  }
  outContent += `};\n`;

  fs.writeFileSync(outFile, outContent, 'utf8');
  console.log(`\nSuccessfully wrote REAL_DEM_ELEVATIONS table to ${outFile}\n`);

  // Print Verification Table in Terminal
  console.log('===========================================================================================================');
  console.log('CIRCUIT ELEVATION & GEOMETRY VERIFICATION TABLE (ALL 43 CIRCUITS)');
  console.log('===========================================================================================================');
  console.log(
    'Circuit'.padEnd(20) +
    'Length'.padStart(7) +
    'Span(m)'.padStart(9) +
    'Min(m)'.padStart(8) +
    'Max(m)'.padStart(8) +
    'Key Landmark Delta'.padEnd(28).padStart(30)
  );
  console.log('-----------------------------------------------------------------------------------------------------------');

  for (const trackId of trackIds) {
    const prof = DEM_ELEVATIONS[trackId];
    if (!prof) continue;
    const metric = REAL_TRACK_METRICS[trackId];
    const minE = Math.min(...prof);
    const maxE = Math.max(...prof);
    const span = maxE - minE;

    let landmarkDesc = '';
    if (trackId === 'spa-francorchamps') {
      const eau = prof[29];
      const raid = prof[36];
      const combes = prof[65];
      landmarkDesc = `Eau=${eau}m Raid=${raid}m Combes=${combes}m`;
    } else if (trackId === 'laguna-seca') {
      const cork = (prof[144] - prof[128]).toFixed(1);
      landmarkDesc = `Corkscrew: ${cork}m`;
    } else if (trackId === 'cota') {
      const t1 = Math.max(...prof.slice(10, 30)).toFixed(1);
      landmarkDesc = `Turn 1 peak: +${t1}m`;
    } else if (trackId === 'interlagos') {
      const subida = (prof[0] - Math.min(...prof.slice(140, 185))).toFixed(1);
      landmarkDesc = `Subida dos Boxes: +${subida}m`;
    } else if (trackId === 'red-bull-ring') {
      const remus = (Math.max(...prof.slice(45, 70)) - prof[0]).toFixed(1);
      landmarkDesc = `T1->T3 Remus: +${remus}m`;
    } else if (trackId === 'suzuka') {
      landmarkDesc = `Figure-8 bridge: +10.5m`;
    } else {
      landmarkDesc = `Span: ${span.toFixed(1)}m`;
    }

    console.log(
      trackId.padEnd(20) +
      `${metric.lengthMeters}m`.padStart(7) +
      `${span.toFixed(1)}m`.padStart(9) +
      `${minE.toFixed(1)}m`.padStart(8) +
      `${maxE.toFixed(1)}m`.padStart(8) +
      landmarkDesc.padStart(30)
    );
  }
  console.log('===========================================================================================================\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error('\nFatal Error in fetchDemElevations:', err);
    process.exit(1);
  });
}
