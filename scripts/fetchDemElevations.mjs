import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

// Prefer IPv4 on Windows to avoid connect timeouts on IPv6
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.resolve(__dirname, '.dem_cache.json');

const CIRCUIT_GEO = {
  // Flagships & Europe
  "spa-francorchamps": { lat: 50.4369, lon: 5.9720, rotDeg: 0 },
  "le-mans":           { lat: 47.9378, lon: 0.2255, rotDeg: 0 },
  "silverstone":       { lat: 52.0733, lon: -1.0147, rotDeg: 0 },
  "portimao":          { lat: 37.2315, lon: -8.6283, rotDeg: 0 },
  "monza":             { lat: 45.6206, lon: 9.2855, rotDeg: 0 },
  "monaco":            { lat: 43.7347, lon: 7.4206, rotDeg: 0 },
  "imola":             { lat: 44.3439, lon: 11.7167, rotDeg: 0 },
  "barcelona":         { lat: 41.5700, lon: 2.2611, rotDeg: 0 },
  "madring":           { lat: 40.4658, lon: -3.6164, rotDeg: 0 },
  "red-bull-ring":     { lat: 47.2197, lon: 14.7647, rotDeg: 0 },
  "hungaroring":       { lat: 47.5817, lon: 19.2506, rotDeg: 0 },
  "zandvoort":         { lat: 52.3888, lon: 4.5409, rotDeg: 0 },
  "paul-ricard":       { lat: 43.2506, lon: 5.7917, rotDeg: 0 },
  "baku":              { lat: 40.3725, lon: 49.8533, rotDeg: 0 },

  // North & South America
  "daytona-road":      { lat: 29.1856, lon: -81.0705, rotDeg: 165 },
  "laguna-seca":       { lat: 36.5842, lon: -121.7533, rotDeg: 0 },
  "cota":              { lat: 30.1328, lon: -97.6411, rotDeg: 0 },
  "sebring":           { lat: 27.4547, lon: -81.3483, rotDeg: 0 },
  "long-beach":        { lat: 33.7652, lon: -118.1893, rotDeg: 0 },
  "detroit-street":    { lat: 42.3294, lon: -83.0401, rotDeg: 0 },
  "mid-ohio":          { lat: 40.6894, lon: -82.6367, rotDeg: 0 },
  "watkins-glen":      { lat: 42.3369, lon: -76.9272, rotDeg: 0 },
  "mosport":           { lat: 44.0481, lon: -78.6756, rotDeg: 0 },
  "lime-rock":         { lat: 41.9278, lon: -73.3836, rotDeg: 0 },
  "road-america":      { lat: 43.7989, lon: -87.9953, rotDeg: 0 },
  "vir":               { lat: 36.5669, lon: -79.2067, rotDeg: 0 },
  "indianapolis-road": { lat: 39.7950, lon: -86.2347, rotDeg: 0 },
  "road-atlanta":      { lat: 34.1458, lon: -83.8178, rotDeg: 0 },
  "montreal":          { lat: 45.5006, lon: -73.5228, rotDeg: 0 },
  "miami":             { lat: 25.9581, lon: -80.2389, rotDeg: 0 },
  "las-vegas":         { lat: 36.1147, lon: -115.1628, rotDeg: 0 },
  "mexico-city":       { lat: 19.4042, lon: -99.0907, rotDeg: 0 },
  "interlagos":        { lat: -23.7036, lon: -46.6997, rotDeg: 0 },

  // Asia, Middle East & Oceania
  "suzuka":            { lat: 34.8431, lon: 136.5419, rotDeg: 0 },
  "fuji":              { lat: 35.3717, lon: 138.9267, rotDeg: 0 },
  "shanghai":          { lat: 31.3389, lon: 121.2197, rotDeg: 0 },
  "singapore":         { lat: 1.2914, lon: 103.8640, rotDeg: 0 },
  "sepang":            { lat: 2.7608, lon: 101.7383, rotDeg: 0 },
  "bahrain":           { lat: 26.0325, lon: 50.5106, rotDeg: 0 },
  "jeddah":            { lat: 21.6319, lon: 39.1044, rotDeg: 0 },
  "lusail":            { lat: 25.4900, lon: 51.4542, rotDeg: 0 },
  "yas-marina":        { lat: 24.4672, lon: 54.6031, rotDeg: 0 },
  "albert-park":       { lat: -37.8497, lon: 144.9680, rotDeg: 0 },
};

function readTrackSvgs() {
  const filePath = path.resolve(__dirname, '../src/game/trackSvgs.ts');
  const code = fs.readFileSync(filePath, 'utf8');

  // Parse CCW_CIRCUIT_IDS
  const ccwMatch = code.match(/export const CCW_CIRCUIT_IDS = new Set\(\[([\s\S]*?)\]\);/);
  const ccwIds = new Set();
  if (ccwMatch) {
    for (const m of ccwMatch[1].matchAll(/'([^']+)'/g)) {
      ccwIds.add(m[1]);
    }
  }

  // Parse TRACK_SVG_REGISTRY
  const regMatch = code.match(/export const TRACK_SVG_REGISTRY: Record<string, string> = {([\s\S]*?)};/);
  const svgRegistry = {};
  if (regMatch) {
    const entryRegex = /'([a-z0-9-]+)':\s*[\r\n\s]*'([^']+)'/g;
    for (const m of regMatch[1].matchAll(entryRegex)) {
      svgRegistry[m[1]] = m[2];
    }
  }

  // Parse REAL_TRACK_METRICS
  const metricMatch = code.match(/export const REAL_TRACK_METRICS: Record<string, RealTrackMetric> = {([\s\S]*?)};/);
  const metrics = {};
  if (metricMatch) {
    const entryRegex = /'([a-z0-9-]+)':\s*\{\s*lengthMeters:\s*(\d+),\s*trackWidth:\s*([\d.]+),\s*targetLapSeconds:\s*(\d+)\s*\}/g;
    for (const m of metricMatch[1].matchAll(entryRegex)) {
      metrics[m[1]] = {
        lengthMeters: Number(m[2]),
        trackWidth: Number(m[3]),
        targetLapSeconds: Number(m[4]),
      };
    }
  }

  return { ccwIds, svgRegistry, metrics };
}

function calculateSvgPathArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area;
}

function parseSvgVertices(svgD) {
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

function getScaledTrackLoop(trackId, svgPathD, ccwIds, metrics) {
  const isCCW = ccwIds.has(trackId);
  const metric = metrics[trackId];
  const targetLengthMeters = metric?.lengthMeters ?? 5000;

  let rawVerts = parseSvgVertices(svgPathD);
  if (rawVerts.length < 3) return [];

  // Enforce correct physical driving winding
  const curArea = calculateSvgPathArea(rawVerts.map((v) => ({ x: v[0], y: v[1] })));
  if (isCCW && curArea > 0) {
    rawVerts.reverse();
  } else if (!isCCW && trackId !== 'suzuka' && curArea < 0) {
    rawVerts.reverse();
  }

  // Remove duplicate/near-coincident adjacent vertices (<7 units)
  const filtered = [];
  for (let i = 0; i < rawVerts.length; i++) {
    const v = rawVerts[i];
    if (filtered.length > 0) {
      const prev = filtered[filtered.length - 1];
      if (Math.hypot(v[0] - prev[0], v[1] - prev[1]) < 7) continue;
    }
    filtered.push(v);
  }

  // Remove duplicate closing vertex
  while (filtered.length > 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 7) {
      filtered.pop();
    } else {
      break;
    }
  }

  const n = filtered.length;
  let sumX = 0;
  let sumZ = 0;
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
  const scale = targetLengthMeters / Math.max(100, rawLen);
  const scaled = centered.map((v) => [v[0] * scale, v[1] * scale]);

  return scaled;
}

function resampleLoop(scaled, numSamples = 200) {
  const N = scaled.length;
  const segLens = [];
  let totalLen = 0;
  for (let i = 0; i < N; i++) {
    const p1 = scaled[i];
    const p2 = scaled[(i + 1) % N];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    segLens.push(len);
    totalLen += len;
  }

  const resampled = [];
  let curSeg = 0;
  let accumulatedDist = 0;

  for (let k = 0; k < numSamples; k++) {
    const targetDist = (k / numSamples) * totalLen;
    while (curSeg < N && accumulatedDist + segLens[curSeg] < targetDist) {
      accumulatedDist += segLens[curSeg];
      curSeg++;
    }
    const p1 = scaled[curSeg % N];
    const p2 = scaled[(curSeg + 1) % N];
    const segLen = segLens[curSeg % N];
    const frac = segLen > 1e-6 ? (targetDist - accumulatedDist) / segLen : 0;
    const x = p1[0] + (p2[0] - p1[0]) * frac;
    const z = p1[1] + (p2[1] - p1[1]) * frac;
    resampled.push({ x, z });
  }

  return resampled;
}

function projectToGps(x, z, centerLat, centerLon, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180;
  const eastMeters = x * Math.cos(rad) - z * Math.sin(rad);
  const southMeters = x * Math.sin(rad) + z * Math.cos(rad);
  const lat = centerLat - southMeters / 111320;
  const lon = centerLon + eastMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return { lat, lon };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchElevationBatch(coords, maxRetries = 10) {
  const lats = coords.map((c) => c.lat.toFixed(6)).join(',');
  const lons = coords.map((c) => c.lon.toFixed(6)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        const resetHeader = res.headers.get('x-ratelimit-reset');
        let waitSec = 15;
        if (retryAfter) {
          waitSec = Math.max(2, Number(retryAfter) + 1);
        } else if (resetHeader) {
          const resetEpoch = Number(resetHeader);
          const nowEpoch = Math.floor(Date.now() / 1000);
          waitSec = Math.max(3, resetEpoch - nowEpoch + 1);
        }
        console.warn(`  [HTTP 429] Rate limit reached. Waiting ${waitSec}s for quota reset (attempt ${attempt}/${maxRetries})...`);
        await sleep(waitSec * 1000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      const resetHeader = res.headers.get('x-ratelimit-reset');

      const data = await res.json();
      if (!data || !Array.isArray(data.elevation)) {
        throw new Error(`Invalid response format from Open-Meteo: ${JSON.stringify(data)}`);
      }

      // Proactively pause if quota is nearly exhausted (< 100 points remaining for next batch)
      if (!isNaN(remaining) && remaining < 100 && resetHeader) {
        const resetEpoch = Number(resetHeader);
        const nowEpoch = Math.floor(Date.now() / 1000);
        const waitSec = Math.max(2, resetEpoch - nowEpoch + 1);
        console.log(`  [Quota] Low quota remaining (${remaining}). Proactively waiting ${waitSec}s for reset...`);
        await sleep(waitSec * 1000);
      }

      return data.elevation;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`  [Network Warning] ${err.message}. Retrying in 2000ms...`);
      await sleep(2000);
    }
  }
}

function circularGaussianSmooth(arr, passes = 3) {
  const kernel = [0.05, 0.12, 0.20, 0.26, 0.20, 0.12, 0.05];
  const N = arr.length;
  let current = [...arr];
  for (let p = 0; p < passes; p++) {
    const next = new Array(N);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const idx = (i + k + N) % N;
        sum += current[idx] * kernel[k + 3];
      }
      next[i] = sum;
    }
    current = next;
  }
  return current;
}

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

async function main() {
  console.log('--- Fetching Real-World DEM Elevations for All 43 Circuits ---');
  const { ccwIds, svgRegistry, metrics } = readTrackSvgs();

  const circuitIds = Object.keys(CIRCUIT_GEO);
  console.log(`Loaded ${circuitIds.length} circuits from CIRCUIT_GEO.`);

  const demResults = loadCache();
  const cachedCount = Object.keys(demResults).length;
  if (cachedCount > 0) {
    console.log(`Loaded ${cachedCount} already-fetched circuits from cache.`);
  }

  for (let idx = 0; idx < circuitIds.length; idx++) {
    const trackId = circuitIds[idx];

    if (demResults[trackId] && demResults[trackId].length === 200) {
      const cached = demResults[trackId];
      const minElev = Math.min(...cached);
      const maxElev = Math.max(...cached);
      const span = maxElev - minElev;
      console.log(
        `[${String(idx + 1).padStart(2)}/43] (Cached) ${trackId.padEnd(20)} span: ${span.toFixed(1)}m (min: ${minElev.toFixed(1)}m, max: ${maxElev.toFixed(1)}m)`
      );
      continue;
    }

    const geo = CIRCUIT_GEO[trackId];
    const svgD = svgRegistry[trackId];

    if (!svgD) {
      throw new Error(`Missing SVG path for circuit: ${trackId}`);
    }

    const scaled = getScaledTrackLoop(trackId, svgD, ccwIds, metrics);
    const resampled = resampleLoop(scaled, 200);

    const gpsPoints = resampled.map((pt) => projectToGps(pt.x, pt.z, geo.lat, geo.lon, geo.rotDeg));

    // Split 200 points into two batches of 100
    const batch1Coords = gpsPoints.slice(0, 100);
    const batch2Coords = gpsPoints.slice(100, 200);

    const b1 = await fetchElevationBatch(batch1Coords);
    await sleep(250); // 250ms delay between batches

    const b2 = await fetchElevationBatch(batch2Coords);
    await sleep(250); // 250ms delay between batches

    const rawElevations = [...b1, ...b2];
    if (rawElevations.length !== 200) {
      throw new Error(`Expected 200 samples for ${trackId}, got ${rawElevations.length}`);
    }

    // 1. Closed-Loop Gaussian Smoothing (3 passes)
    const smoothed = circularGaussianSmooth(rawElevations, 3);

    // 2. Normalize to Start/Finish Datum (elevations[0] = 0.0m)
    const datum = smoothed[0];
    let normalized = smoothed.map((v) => v - datum);

    // 3. Bridge / Overpass Preservation for Suzuka (cosine bridge deck over t = 0.16..0.40)
    if (trackId === 'suzuka') {
      for (let i = 0; i < 200; i++) {
        const t = i / 200;
        if (t >= 0.24 && t <= 0.32) {
          normalized[i] += 10.5;
        } else if (t >= 0.16 && t < 0.24) {
          const u = (t - 0.16) / 0.08;
          normalized[i] += (1 - Math.cos(u * Math.PI)) * 0.5 * 10.5;
        } else if (t > 0.32 && t <= 0.40) {
          const u = (t - 0.32) / 0.08;
          normalized[i] += (1 + Math.cos(u * Math.PI)) * 0.5 * 10.5;
        }
      }
    }

    // Round to 1 decimal place and force S/F datum to exactly 0.0
    const processed = normalized.map((v) => Math.round(v * 10) / 10);
    processed[0] = 0.0;

    demResults[trackId] = processed;
    saveCache(demResults);

    const minElev = Math.min(...processed);
    const maxElev = Math.max(...processed);
    const span = maxElev - minElev;
    console.log(
      `[${String(idx + 1).padStart(2)}/43] ${trackId.padEnd(20)} span: ${span.toFixed(1)}m (min: ${minElev.toFixed(1)}m, max: ${maxElev.toFixed(1)}m)`
    );
  }

  // Write output to src/game/trackElevations.ts
  const outputPath = path.resolve(__dirname, '../src/game/trackElevations.ts');
  let fileContent = `/**\n * Real-World Satellite Digital Elevation Model (DEM) Profiles (200 samples per circuit)\n * Fetched from Open-Meteo Copernicus DEM & smoothed for 3D track simulation.\n * Normalized so Start/Finish datum = 0.0m.\n */\n\n`;
  fileContent += `export const REAL_DEM_ELEVATIONS: Record<string, number[]> = {\n`;

  for (const trackId of circuitIds) {
    const arr = demResults[trackId];
    fileContent += `  "${trackId}": [\n    ${arr.join(', ')}\n  ],\n`;
  }
  fileContent += `};\n`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`\nSuccessfully wrote all ${circuitIds.length} REAL_DEM_ELEVATIONS to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error fetching DEM elevations:', err);
  process.exit(1);
});
