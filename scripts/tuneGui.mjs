import http from 'node:http';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const PORT = 4175;
const CONFIG_PATH = 'src/game/tuningConfig.json';
const BENCHMARK_CMD = 'npx tsx scripts/benchmarkPhysicsAndAi.ts --json';

const IRL_TARGETS = [
    { track: 'spa-francorchamps', carClass: 'GT3', targetLapSec: 137.5, targetTrapKmh: 280 },
    { track: 'spa-francorchamps', carClass: 'HYPERCAR_GTP', targetLapSec: 123.0, targetTrapKmh: 320 },
    { track: 'monza', carClass: 'GT3', targetLapSec: 107.5, targetTrapKmh: 292 },
    { track: 'suzuka', carClass: 'F1_2026', targetLapSec: 89.5, targetTrapKmh: 332 },
    { track: 'monaco', carClass: 'F1_2026', targetLapSec: 71.0, targetTrapKmh: 292 },
    { track: 'le-mans', carClass: 'HYPERCAR_GTP', targetLapSec: 206.0, targetTrapKmh: 340 },
];

const BOUNDS = {
  downforceScale: [0.55, 1.35],
  brakeForceScale: [0.55, 1.35],
  dragScale: [0.65, 1.45],
  lowSpeedGripScale: [0.65, 1.30],
  aiCornerSpeedScale: [0.75, 1.00], // Strictly capped at 100% of physical tire grip
  aiBrakeMarginScale: [0.85, 1.40], // Cannot brake later than physical stopping distance
};

const DEFAULT_CONFIG = {
    downforceScale: 1.0,
    brakeForceScale: 1.0,
    dragScale: 1.0,
    lowSpeedGripScale: 1.0,
    aiCornerSpeedScale: 1.0,
    aiBrakeMarginScale: 1.0,
};

if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

let state = {
    running: false,
    step: 0,
    maxSteps: 100,
    bestErr: null,
    bestConfig: JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')),
    bestRows: [],
    history: [],
    logs: ['Ready. Click "Start Tuning" to begin headless optimization.'],
};

const clients = new Set();
function broadcast() {
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    for (const res of clients) res.write(payload);
}

function log(msg) {
    state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (state.logs.length > 40) state.logs.pop();
}

function evaluate(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    const raw = execSync(BENCHMARK_CMD, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const rows = JSON.parse(raw);

    let totalErr = 0;
    let matched = 0;

    for (const t of IRL_TARGETS) {
        const r = rows.find((x) => x.track === t.track && x.carClass === t.carClass);
        if (!r) continue;
        matched++;
        const lapErr = Math.abs(r.lapSec - t.targetLapSec) / t.targetLapSec;
        const trapErr = Math.abs(r.trapKmh - t.targetTrapKmh) / t.targetTrapKmh;
        const penalty = (r.wallHits || 0) * 1.0 + ((r.offTrackPct || 0) > 0.5 ? 0.5 : 0);
        totalErr += lapErr * 0.75 + trapErr * 0.25 + penalty;
    }

    return { err: matched > 0 ? totalErr / matched : Infinity, rows };
}

function stepLoop() {
    if (!state.running) return;
    if (state.step >= state.maxSteps) {
        state.running = false;
        log(`Completed ${state.maxSteps} iterations. Optimal config saved.`);
        broadcast();
        return;
    }

    try {
        if (state.bestErr === null) {
            const base = evaluate(state.bestConfig);
            state.bestErr = base.err;
            state.bestRows = base.rows;
            state.history.push({ step: 0, err: +(base.err * 100).toFixed(2) });
            log(`Baseline error: ${(base.err * 100).toFixed(2)}%`);
        }

        state.step++;
        const keys = Object.keys(state.bestConfig);
        const key = keys[(state.step - 1) % keys.length];
        const maxStep = state.step < 40 ? 0.045 : 0.015;
        const delta = (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * maxStep);

        const [minVal, maxVal] = BOUNDS[key] || [0.5, 1.5];
        const rawVal = state.bestConfig[key] * (1 + delta);
        const clampedVal = Math.min(Math.max(rawVal, minVal), maxVal);

        const candidate = {
            ...state.bestConfig,
            [key]: Number(clampedVal.toFixed(4)),
        };

        const res = evaluate(candidate);
        if (res.err < state.bestErr) {
            state.bestErr = res.err;
            state.bestConfig = candidate;
            state.bestRows = res.rows;
            state.history.push({ step: state.step, err: +(res.err * 100).toFixed(2) });
            log(`Step ${state.step}: ${key} -> ${candidate[key]} (Error: ${(res.err * 100).toFixed(2)}%)`);
        } else {
            // Restore bestConfig on disk after rejected candidate
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(state.bestConfig, null, 2));
        }
    } catch (e) {
        state.running = false;
        log(`Error: ${e.message}`);
    }

    broadcast();
    if (state.running) setTimeout(stepLoop, 20);
}

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Apex Miniature — Live Physics & AI Auto-Tuner</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 20px; }
    h1 { margin: 0 0 12px; font-size: 20px; display: flex; align-items: center; gap: 12px; }
    .controls { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }
    button { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button.stop { background: #da3633; }
    button.reset { background: #30363d; }
    .grid { display: grid; grid-template-columns: 320px 1fr; gap: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px; }
    .card h2 { margin: 0 0 10px; font-size: 14px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }
    .param { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #21262d; font-family: monospace; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: monospace; }
    th, td { text-align: right; padding: 7px 8px; border-bottom: 1px solid #21262d; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
    .good { color: #3fb950; } .warn { color: #d29922; } .bad { color: #f85149; }
    svg { width: 100%; height: 140px; background: #0d1117; border-radius: 6px; }
    .logs { font-family: monospace; font-size: 12px; max-height: 150px; overflow-y: auto; color: #8b949e; }
    .logs div { padding: 2px 0; }
  </style>
</head>
<body>
  <h1>Apex Miniature — Headless Physics & AI Auto-Tuner <span id="status" style="font-size:13px;color:#8b949e;"></span></h1>
  <div class="controls">
    <button onclick="cmd('start')">Start / Resume</button>
    <button class="stop" onclick="cmd('stop')">Pause</button>
    <button class="reset" onclick="cmd('reset')">Reset to 1.0</button>
    <span id="errBadge" style="margin-left:auto;font-family:monospace;font-size:15px;"></span>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Current Multipliers</h2>
      <div id="params"></div>
      <h2 style="margin-top:16px;">Optimizer Log</h2>
      <div class="logs" id="logs"></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="card">
        <h2>Error Convergence (%)</h2>
        <svg id="chart" viewBox="0 0 600 140"></svg>
      </div>
      <div class="card">
        <h2>Simulated vs. IRL Targets</h2>
        <table>
          <thead><tr><th>Circuit</th><th>Class</th><th>Sim Lap</th><th>IRL Lap</th><th>Delta</th><th>Sim Trap</th><th>IRL Trap</th><th>Walls</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  </div>
<script>
const TARGETS = ${JSON.stringify(IRL_TARGETS)};
const fmt = (s) => s ? Math.floor(s/60) + ':' + (s%60).toFixed(2).padStart(5,'0') : '—';
async function cmd(action) { await fetch('/api/' + action, { method: 'POST' }); }

const es = new EventSource('/events');
es.onmessage = (e) => {
  const s = JSON.parse(e.data);
  document.getElementById('status').textContent = (s.running ? 'RUNNING' : 'IDLE') + ' — Step ' + s.step + '/' + s.maxSteps;
  document.getElementById('errBadge').textContent = s.bestErr !== null ? 'Mean Error: ' + (s.bestErr * 100).toFixed(2) + '%' : '';

  document.getElementById('params').innerHTML = Object.entries(s.bestConfig)
    .map(([k, v]) => '<div class="param"><span>' + k + '</span><strong>' + v.toFixed(4) + '</strong></div>').join('');

  document.getElementById('logs').innerHTML = s.logs.map(l => '<div>' + l + '</div>').join('');

  // Render SVG line chart
  if (s.history.length > 0) {
    const maxE = Math.max(...s.history.map(h => h.err), 1);
    const pts = s.history.map((h, i) => {
      const x = s.history.length === 1 ? 300 : (i / (s.history.length - 1)) * 580 + 10;
      const y = 130 - (h.err / maxE) * 110;
      return x + ',' + y;
    }).join(' ');
    document.getElementById('chart').innerHTML = '<polyline fill="none" stroke="#3fb950" stroke-width="2.5" points="' + pts + '" />';
  }

  // Render benchmark table
  document.getElementById('tbody').innerHTML = TARGETS.map(t => {
    const r = (s.bestRows || []).find(x => x.track === t.track && x.carClass === t.carClass);
    const diff = r ? (r.lapSec - t.targetLapSec) : 0;
    const cls = !r ? '' : Math.abs(diff) < 1.5 ? 'good' : Math.abs(diff) < 4.0 ? 'warn' : 'bad';
    return '<tr><td>' + t.track + '</td><td>' + t.carClass + '</td><td>' + fmt(r?.lapSec) + '</td><td>' + fmt(t.targetLapSec) +
      '</td><td class="' + cls + '">' + (r ? (diff >= 0 ? '+' : '') + diff.toFixed(2) + 's' : '—') +
      '</td><td>' + (r ? r.trapKmh.toFixed(1) : '—') + '</td><td>' + t.targetTrapKmh + '</td><td>' + (r ? r.wallHits : '—') + '</td></tr>';
  }).join('');
};
</script>
</body>
</html>`;

http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HTML);
    } else if (req.url === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        clients.add(res);
        res.write(`data: ${JSON.stringify(state)}\n\n`);
        req.on('close', () => clients.delete(res));
    } else if (req.url === '/api/start' && req.method === 'POST') {
        if (!state.running) { state.running = true; log('Started optimization loop.'); stepLoop(); }
        res.end('ok');
    } else if (req.url === '/api/stop' && req.method === 'POST') {
        state.running = false; log('Paused optimization loop.'); broadcast();
        res.end('ok');
    } else if (req.url === '/api/reset' && req.method === 'POST') {
        state.running = false;
        state.step = 0;
        state.bestErr = null;
        state.bestConfig = { ...DEFAULT_CONFIG };
        state.bestRows = [];
        state.history = [];
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        log('Reset multipliers to 1.0000.');
        broadcast();
        res.end('ok');
    }
}).listen(PORT, () => console.log(`Auto-Tuner GUI running at http://localhost:${PORT}`));