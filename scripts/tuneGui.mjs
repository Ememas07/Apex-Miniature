import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 4175;
const CONFIG_PATH = 'src/game/tuningConfig.json';
const TSX_CLI_PATH = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

const IRL_TARGETS = [
  // GT3
  { track: 'spa-francorchamps', carClass: 'GT3', car: 'gt3', targetLapSec: 137.5, targetTrapKmh: 280 },
  { track: 'monza', carClass: 'GT3', car: 'gt3', targetLapSec: 107.5, targetTrapKmh: 292 },
  { track: 'laguna-seca', carClass: 'GT3', car: 'gt3', targetLapSec: 84.0, targetTrapKmh: 256 },
  // HYPERCAR_GTP
  { track: 'spa-francorchamps', carClass: 'HYPERCAR_GTP', car: 'hypercar_gtp', targetLapSec: 123.0, targetTrapKmh: 320 },
  { track: 'le-mans', carClass: 'HYPERCAR_GTP', car: 'hypercar_gtp', targetLapSec: 206.0, targetTrapKmh: 340 },
  // LMP2
  { track: 'le-mans', carClass: 'LMP2', car: 'lmp2', targetLapSec: 215.5, targetTrapKmh: 320 },
  { track: 'silverstone', carClass: 'LMP2', car: 'lmp2', targetLapSec: 106.0, targetTrapKmh: 300 },
  // GT4
  { track: 'silverstone', carClass: 'GT4', car: 'gt4', targetLapSec: 129.0, targetTrapKmh: 252 },
  { track: 'laguna-seca', carClass: 'GT4', car: 'gt4', targetLapSec: 91.0, targetTrapKmh: 238 },
  // F1_2026
  { track: 'suzuka', carClass: 'F1_2026', car: 'f1_2026', targetLapSec: 89.5, targetTrapKmh: 332 },
  { track: 'monaco', carClass: 'F1_2026', car: 'f1_2026', targetLapSec: 71.0, targetTrapKmh: 292 },
  // F1_2021
  { track: 'silverstone', carClass: 'F1_2021', car: 'f1_2021', targetLapSec: 87.5, targetTrapKmh: 328 },
  { track: 'monza', carClass: 'F1_2021', car: 'f1_2021', targetLapSec: 80.5, targetTrapKmh: 350 },
  // F1_2005
  { track: 'monza', carClass: 'F1_2005', car: 'f1_2005', targetLapSec: 81.5, targetTrapKmh: 360 },
  { track: 'suzuka', carClass: 'F1_2005', car: 'f1_2005', targetLapSec: 91.5, targetTrapKmh: 326 },
  // FORMULA_E
  { track: 'monaco', carClass: 'FORMULA_E', car: 'formula_e', targetLapSec: 87.5, targetTrapKmh: 255 },
  // SUPERCAR
  { track: 'monza', carClass: 'SUPERCAR', car: 'supercar', targetLapSec: 113.5, targetTrapKmh: 320 },
  { track: 'laguna-seca', carClass: 'SUPERCAR', car: 'supercar', targetLapSec: 88.0, targetTrapKmh: 270 },
  // TRACK_COUPE
  { track: 'silverstone', carClass: 'TRACK_COUPE', car: 'track_coupe', targetLapSec: 134.5, targetTrapKmh: 245 },
  { track: 'laguna-seca', carClass: 'TRACK_COUPE', car: 'track_coupe', targetLapSec: 94.0, targetTrapKmh: 232 },
];

const ALL_CLASSES = [
  'GT3',
  'HYPERCAR_GTP',
  'LMP2',
  'GT4',
  'F1_2026',
  'F1_2021',
  'F1_2005',
  'FORMULA_E',
  'SUPERCAR',
  'TRACK_COUPE',
];

const ALL_TRACKS = Array.from(new Set(IRL_TARGETS.map((t) => t.track)));

const BOUNDS = {
  downforceScale: [0.55, 1.35],
  brakeForceScale: [0.55, 1.35],
  dragScale: [0.65, 1.45],
  lowSpeedGripScale: [0.65, 1.30],
  aiCornerSpeedScale: [0.75, 1.00], // Strictly capped at 100% of physical tire grip
  aiBrakeMarginScale: [0.85, 1.40], // Cannot brake later than physical stopping distance
};

const DEFAULT_PROFILE = {
  downforceScale: 1.0049,
  brakeForceScale: 0.9931,
  dragScale: 1.1652,
  lowSpeedGripScale: 1.0221,
  aiCornerSpeedScale: 1.0,
  aiBrakeMarginScale: 1.0609,
};

const DEFAULT_CONFIG = {
  global: { ...DEFAULT_PROFILE },
  classes: {
    GT3: { ...DEFAULT_PROFILE },
    HYPERCAR_GTP: { ...DEFAULT_PROFILE },
    F1_2026: { ...DEFAULT_PROFILE },
    LMP2: { ...DEFAULT_PROFILE },
    GT4: { ...DEFAULT_PROFILE },
    F1_2021: { ...DEFAULT_PROFILE },
    F1_2005: { ...DEFAULT_PROFILE },
    FORMULA_E: { ...DEFAULT_PROFILE },
    TRACK_COUPE: { ...DEFAULT_PROFILE },
    SUPERCAR: { ...DEFAULT_PROFILE },
  },
};

if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

let loadedConfig;
try {
  loadedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!loadedConfig.classes) {
    loadedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
} catch {
  loadedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

let state = {
  running: false,
  step: 0,
  maxSteps: 100,
  stepStartTime: null,
  currentTestingClass: null,
  currentTestingParam: null,
  subStep: null,
  bestErr: null,
  classErrors: {},
  bestConfig: loadedConfig,
  bestRows: [],
  liveRows: [],
  history: [],
  filterClass: 'ALL',
  filterTrack: 'ALL',
  logs: ['Ready. Click "Start / Resume" to begin parallel physics & AI auto-tuning across 10 classes.'],
};

const clients = new Set();
function broadcast() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) {
    res.write(payload);
    if (typeof res.flush === 'function') res.flush();
  }
}

function log(msg) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (state.logs.length > 50) state.logs.pop();
}

let currentProcess = null;

function evaluateAsync(config, flags = [], onProgress) {
  return new Promise((resolve, reject) => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    const combinedFlags = [...flags];
    if (state.filterClass && state.filterClass !== 'ALL' && !combinedFlags.some((f) => f.startsWith('--class='))) {
      combinedFlags.push(`--class=${state.filterClass}`);
    }
    if (state.filterTrack && state.filterTrack !== 'ALL' && !combinedFlags.some((f) => f.startsWith('--track='))) {
      combinedFlags.push(`--track=${state.filterTrack}`);
    }

    const args = [TSX_CLI_PATH, 'scripts/benchmarkPhysicsAndAi.ts', '--json', ...combinedFlags];
    const child = spawn(process.execPath, args, {
      env: { ...process.env },
    });
    currentProcess = child;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finalRows = null;

    const parseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('PROGRESS:')) {
        try {
          const p = JSON.parse(trimmed.slice('PROGRESS:'.length));
          onProgress?.(p);
        } catch {}
      } else if (trimmed.startsWith('{') && trimmed.includes('"type":"progress"')) {
        try {
          const p = JSON.parse(trimmed);
          onProgress?.(p);
        } catch {}
      } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          finalRows = JSON.parse(trimmed);
        } catch {}
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const l of lines) parseLine(l);
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? '';
      for (const l of lines) parseLine(l);
    });

    child.on('error', (err) => {
      currentProcess = null;
      reject(err);
    });

    child.on('close', (code) => {
      currentProcess = null;
      if (stdoutBuffer.trim()) parseLine(stdoutBuffer.trim());
      if (stderrBuffer.trim()) parseLine(stderrBuffer.trim());

      if (finalRows && Array.isArray(finalRows)) {
        let totalErr = 0;
        let matched = 0;
        const classErrors = {};

        for (const t of IRL_TARGETS) {
          if (state.filterClass && state.filterClass !== 'ALL' && t.carClass !== state.filterClass && t.car !== state.filterClass.toLowerCase()) {
            continue;
          }
          if (state.filterTrack && state.filterTrack !== 'ALL' && t.track !== state.filterTrack) {
            continue;
          }
          const r = finalRows.find((x) => x.track === t.track && (x.carClass === t.carClass || x.carClass === t.car));
          if (!r) continue;
          matched++;
          const lapErr = Math.abs(r.lapSec - t.targetLapSec) / t.targetLapSec;
          const trapErr = Math.abs(r.trapKmh - t.targetTrapKmh) / t.targetTrapKmh;
          const penalty = (r.wallHits || 0) * 1.0 + ((r.offTrackPct || 0) > 0.5 ? 0.5 : 0);
          const err = lapErr * 0.75 + trapErr * 0.25 + penalty;
          totalErr += err;

          if (!classErrors[t.carClass]) classErrors[t.carClass] = [];
          classErrors[t.carClass].push(err);
        }

        const avgClassErrors = {};
        for (const [cls, errs] of Object.entries(classErrors)) {
          avgClassErrors[cls] = errs.reduce((a, b) => a + b, 0) / errs.length;
        }

        resolve({
          err: matched > 0 ? totalErr / matched : Infinity,
          rows: finalRows,
          classErrors: avgClassErrors,
        });
      } else {
        reject(new Error(`Benchmark exited with code ${code}`));
      }
    });
  });
}

function handleProgress(prog) {
  state.subStep = {
    completed: prog.completed,
    total: prog.total,
    track: prog.track,
    car: prog.car,
    carClass: prog.carClass || (prog.car ? prog.car.toUpperCase() : ''),
    carId: prog.carId || '',
    carName: prog.carName || '',
    carsEvaluated: prog.carsEvaluated ?? 1,
    slowestCarId: prog.slowestCarId || '',
    slowestLapSec: prog.slowestLapSec,
    lapTime: prog.lapTime ?? prog.lapSec,
    lapSec: prog.lapSec ?? prog.lapTime,
    trapKmh: prog.trapKmh,
    errorPct: prog.errorPct,
    elapsedMs: prog.elapsedMs,
    cached: prog.cached ?? false,
  };

  if (!state.liveRows) state.liveRows = [];
  const carClassKey = state.subStep.carClass;
  const idx = state.liveRows.findIndex(
    (r) => r.track === prog.track && (r.carClass === carClassKey || r.carClass === prog.car),
  );
  const updatedRow = {
    track: prog.track,
    carClass: carClassKey,
    carId: prog.carId || '',
    carName: prog.carName || '',
    carsEvaluated: prog.carsEvaluated ?? 1,
    slowestCarId: prog.slowestCarId || '',
    slowestLapSec: prog.slowestLapSec,
    lapSec: prog.lapSec ?? prog.lapTime,
    trapKmh: prog.trapKmh,
    wallHits: prog.wallHits ?? 0,
    offTrackPct: prog.offTrackPct ?? 0,
    errorPct: prog.errorPct,
    isLive: true,
  };

  if (idx >= 0) {
    state.liveRows[idx] = updatedRow;
  } else {
    state.liveRows.push(updatedRow);
  }

  broadcast();
}

const targetClasses = ALL_CLASSES;
const paramKeys = Object.keys(BOUNDS);

async function stepLoop() {
  if (!state.running) return;
  if (state.step >= state.maxSteps) {
    state.running = false;
    state.subStep = null;
    state.stepStartTime = null;
    state.currentTestingClass = null;
    state.currentTestingParam = null;
    log(`Completed ${state.maxSteps} iterations. Optimal config saved.`);
    broadcast();
    return;
  }

  try {
    if (state.bestErr === null) {
      state.stepStartTime = Date.now();
      state.subStep = { completed: 0, total: IRL_TARGETS.length, track: 'spa-francorchamps', carClass: 'GT3' };
      broadcast();
      const base = await evaluateAsync(state.bestConfig, [], handleProgress);
      state.bestErr = base.err;
      state.classErrors = base.classErrors;
      state.bestRows = base.rows;
      state.liveRows = [...base.rows];
      state.history.push({ step: 0, err: +(base.err * 100).toFixed(2) });
      log(`Baseline overall error: ${(base.err * 100).toFixed(2)}% (parallel worker pool ready across 20 benchmarks)`);
      state.subStep = null;
      broadcast();
    }

    if (!state.running) return;

    state.step++;
    const activeClasses = state.filterClass && state.filterClass !== 'ALL' ? [state.filterClass] : ALL_CLASSES;
    const targetClass = activeClasses[(state.step - 1) % activeClasses.length];
    const paramKey = paramKeys[Math.floor((state.step - 1) / activeClasses.length) % paramKeys.length];

    const maxStep = state.step < 30 ? 0.045 : 0.015;
    const delta = (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * maxStep);

    const [minVal, maxVal] = BOUNDS[paramKey] || [0.5, 1.5];
    const currentVal =
      state.bestConfig.classes?.[targetClass]?.[paramKey] ??
      state.bestConfig.global?.[paramKey] ??
      1.0;
    const rawVal = currentVal * (1 + delta);
    const clampedVal = Math.min(Math.max(rawVal, minVal), maxVal);

    const candidate = JSON.parse(JSON.stringify(state.bestConfig));
    if (!candidate.classes) candidate.classes = {};
    if (!candidate.classes[targetClass]) candidate.classes[targetClass] = { ...candidate.global };
    candidate.classes[targetClass][paramKey] = Number(clampedVal.toFixed(4));

    state.currentTestingClass = targetClass;
    state.currentTestingParam = `${paramKey} -> ${candidate.classes[targetClass][paramKey]}`;
    state.stepStartTime = Date.now();
    broadcast();

    // 1. Fast class-scoped perturbation testing only outliers
    const quickFlags = [`--class=${targetClass}`, '--only-outliers', '--margin=1.5'];
    if (state.filterTrack && state.filterTrack !== 'ALL') quickFlags.push(`--track=${state.filterTrack}`);
    const quickRes = await evaluateAsync(candidate, quickFlags, handleProgress);

    if (!state.running) return;

    const prevClassErr = state.classErrors[targetClass] ?? state.bestErr;
    if (quickRes.err < prevClassErr) {
      // 2. Regression Guard: Run parallel verification pass
      log(`Candidate improved ${targetClass} (err: ${(quickRes.err * 100).toFixed(2)}%). Running Regression Guard verification...`);
      const fullFlags = [];
      if (state.filterTrack && state.filterTrack !== 'ALL') fullFlags.push(`--track=${state.filterTrack}`);
      const fullRes = await evaluateAsync(candidate, fullFlags, handleProgress);

      if (!state.running) return;

      if (fullRes.err < state.bestErr) {
        state.bestErr = fullRes.err;
        state.classErrors = fullRes.classErrors;
        state.bestConfig = candidate;
        state.bestRows = fullRes.rows;
        state.liveRows = [...fullRes.rows];
        state.history.push({ step: state.step, err: +(fullRes.err * 100).toFixed(2) });
        log(
          `Step ${state.step} [${targetClass}]: ${paramKey} -> ${candidate.classes[targetClass][paramKey]} (Overall Error: ${(fullRes.err * 100).toFixed(2)}%)`,
        );
      } else {
        // Revert candidate
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(state.bestConfig, null, 2));
      }
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(state.bestConfig, null, 2));
    }
  } catch (e) {
    if (state.running) {
      state.running = false;
      log(`Error: ${e.message}`);
    }
  }

  state.subStep = null;
  state.stepStartTime = null;
  state.currentTestingClass = null;
  state.currentTestingParam = null;
  broadcast();

  if (state.running) {
    setTimeout(stepLoop, 20);
  }
}

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Apex Miniature — Live Physics & AI Auto-Tuner</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 20px; }
    h1 { margin: 0 0 12px; font-size: 20px; display: flex; align-items: center; gap: 12px; }
    .controls { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
    button { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #2ea043; }
    button.stop { background: #da3633; }
    button.stop:hover { background: #f85149; }
    button.reset { background: #30363d; }
    button.reset:hover { background: #3c444d; }
    button.bench { background: #1f6feb; }
    button.bench:hover { background: #388bfd; }
    .badge { font-family: monospace; font-size: 14px; padding: 4px 10px; border-radius: 4px; background: #161b22; border: 1px solid #30363d; }
    .filter-label { font-size: 13px; color: #8b949e; display: flex; align-items: center; gap: 6px; font-weight: 500; }
    .filter-select { background: #161b22; color: #e6edf3; border: 1px solid #30363d; padding: 6px 10px; border-radius: 6px; font-size: 13px; font-family: inherit; }
    .grid { display: grid; grid-template-columns: 420px 1fr; gap: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .card h2 { margin: 0 0 10px; font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; }
    .param { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #21262d; font-family: monospace; font-size: 13px; }
    .params-container { max-height: 520px; overflow-y: auto; padding-right: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: monospace; }
    th, td { text-align: right; padding: 7px 9px; border-bottom: 1px solid #21262d; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3) { text-align: left; }
    tr.active-row { background: rgba(56, 139, 253, 0.16) !important; transition: background 0.3s; }
    .good { color: #3fb950; font-weight: 600; }
    .warn { color: #d29922; font-weight: 600; }
    .bad { color: #f85149; font-weight: 600; }
    svg { width: 100%; height: 140px; background: #0d1117; border-radius: 6px; }
    .logs { font-family: monospace; font-size: 12px; max-height: 160px; overflow-y: auto; color: #8b949e; }
    .logs div { padding: 3px 0; border-bottom: 1px dotted #21262d; }

    /* Class Tabs */
    .class-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    .tab-btn { background: #21262d; color: #8b949e; border: 1px solid #30363d; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .tab-btn.active { background: #388bfd22; color: #58a6ff; border-color: #388bfd; }
    .tab-badge { font-size: 10px; padding: 2px 5px; border-radius: 8px; background: #30363d; color: #e6edf3; }
    .tab-badge.locked { background: #23863644; color: #3fb950; border: 1px solid #238636; }

    /* Sub-Step Live Progress Section */
    .substep-card { margin-bottom: 16px; background: #161b22; border: 1px solid #388bfd44; border-radius: 8px; padding: 12px 16px; }
    .substep-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-family: monospace; font-size: 14px; }
    .substep-title { font-weight: 600; color: #58a6ff; display: flex; align-items: center; gap: 8px; }
    .substep-timer { color: #f0883e; font-size: 13px; font-weight: bold; background: #0d1117; padding: 2px 8px; border-radius: 4px; border: 1px solid #30363d; }
    .substep-bar-bg { width: 100%; height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
    .substep-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #238636, #388bfd); transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
    .substep-detail { font-family: monospace; font-size: 12px; color: #8b949e; display: flex; gap: 16px; flex-wrap: wrap; }
    .substep-detail span { color: #e6edf3; }
  </style>
</head>
<body>
  <h1>
    🏎️ Apex Miniature — Live Physics & AI Auto-Tuner
    <span id="status" style="font-size:13px;color:#8b949e;margin-left:auto;"></span>
  </h1>

  <div class="controls">
    <button onclick="cmd('start')">Start / Resume</button>
    <button class="stop" onclick="cmd('stop')">Pause</button>
    <button class="bench" onclick="cmd('benchmark')">Run Benchmark</button>
    <button class="reset" onclick="cmd('reset')">Reset to 1.0</button>

    <label class="filter-label" style="margin-left:8px;">
      Class:
      <select id="filterClassSelect" class="filter-select" onchange="applyFilters()">
        <option value="ALL">All Classes (10)</option>
        <option value="GT3">GT3</option>
        <option value="HYPERCAR_GTP">Hypercar / GTP</option>
        <option value="LMP2">LMP2</option>
        <option value="GT4">GT4</option>
        <option value="F1_2026">F1 2026</option>
        <option value="F1_2021">F1 2021</option>
        <option value="F1_2005">F1 2005</option>
        <option value="FORMULA_E">Formula E</option>
        <option value="SUPERCAR">Supercar</option>
        <option value="TRACK_COUPE">Track Coupe</option>
      </select>
    </label>

    <label class="filter-label">
      Track:
      <select id="filterTrackSelect" class="filter-select" onchange="applyFilters()">
        <option value="ALL">All Tracks (7)</option>
        <option value="spa-francorchamps">Spa-Francorchamps</option>
        <option value="monza">Monza</option>
        <option value="suzuka">Suzuka</option>
        <option value="silverstone">Silverstone</option>
        <option value="laguna-seca">Laguna Seca</option>
        <option value="le-mans">Le Mans</option>
        <option value="monaco">Monaco</option>
      </select>
    </label>

    <span id="testingParamBadge" class="badge" style="color:#58a6ff;display:none;"></span>
    <span id="errBadge" class="badge" style="margin-left:auto;color:#3fb950;font-weight:bold;"></span>
  </div>

  <!-- Live Sub-Step Progress Card -->
  <div class="substep-card" id="subStepCard">
    <div class="substep-header">
      <div class="substep-title" id="subStepTitle">Track 0/20: Waiting to start...</div>
      <div class="substep-timer" id="subStepTimer">Elapsed: 0.00s</div>
    </div>
    <div class="substep-bar-bg">
      <div class="substep-bar-fill" id="subStepFill"></div>
    </div>
    <div class="substep-detail" id="subStepDetail">
      <div>Status: <span>Idle</span></div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Active Multipliers by Class</h2>
      <div class="class-tabs">
        <button class="tab-btn active" id="tab-ALL" onclick="selectClassTab('ALL')">All Classes</button>
        <button class="tab-btn" id="tab-GT3" onclick="selectClassTab('GT3')">GT3 <span class="tab-badge" id="badge-GT3">—</span></button>
        <button class="tab-btn" id="tab-HYPERCAR_GTP" onclick="selectClassTab('HYPERCAR_GTP')">Hypercar <span class="tab-badge" id="badge-HYPERCAR_GTP">—</span></button>
        <button class="tab-btn" id="tab-LMP2" onclick="selectClassTab('LMP2')">LMP2 <span class="tab-badge" id="badge-LMP2">—</span></button>
        <button class="tab-btn" id="tab-GT4" onclick="selectClassTab('GT4')">GT4 <span class="tab-badge" id="badge-GT4">—</span></button>
        <button class="tab-btn" id="tab-F1_2026" onclick="selectClassTab('F1_2026')">F1 2026 <span class="tab-badge" id="badge-F1_2026">—</span></button>
        <button class="tab-btn" id="tab-F1_2021" onclick="selectClassTab('F1_2021')">F1 2021 <span class="tab-badge" id="badge-F1_2021">—</span></button>
        <button class="tab-btn" id="tab-F1_2005" onclick="selectClassTab('F1_2005')">F1 2005 <span class="tab-badge" id="badge-F1_2005">—</span></button>
        <button class="tab-btn" id="tab-FORMULA_E" onclick="selectClassTab('FORMULA_E')">Formula E <span class="tab-badge" id="badge-FORMULA_E">—</span></button>
        <button class="tab-btn" id="tab-SUPERCAR" onclick="selectClassTab('SUPERCAR')">Supercar <span class="tab-badge" id="badge-SUPERCAR">—</span></button>
        <button class="tab-btn" id="tab-TRACK_COUPE" onclick="selectClassTab('TRACK_COUPE')">Track Coupe <span class="tab-badge" id="badge-TRACK_COUPE">—</span></button>
      </div>
      <div class="params-container" id="params"></div>

      <h2 style="margin-top:16px;">Live Tuning Log</h2>
      <div class="logs" id="logs"></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="card">
        <h2>Error Convergence (%)</h2>
        <svg id="chart" viewBox="0 0 600 140"></svg>
      </div>

      <div class="card">
        <h2>Simulated vs. IRL Targets (Parallel Worker Streams across 20 Benchmarks)</h2>
        <table>
          <thead>
            <tr>
              <th>Circuit</th>
              <th>Class</th>
              <th>Leader Car</th>
              <th>Tested</th>
              <th>Sim Lap</th>
              <th>IRL Target</th>
              <th>Delta</th>
              <th>Class Spread (Slowest)</th>
              <th>Sim Trap</th>
              <th>IRL Trap</th>
              <th>Walls</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

<script>
const TARGETS = ${JSON.stringify(IRL_TARGETS)};
const ALL_CLASSES = ${JSON.stringify(ALL_CLASSES)};
const ALL_TRACKS = ${JSON.stringify(ALL_TRACKS)};
const fmt = (s) => (s ? Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0') : '—');

function formatTrack(id) {
  const map = {
    'spa-francorchamps': 'Spa-Francorchamps',
    monza: 'Monza',
    suzuka: 'Suzuka',
    silverstone: 'Silverstone',
    'laguna-seca': 'Laguna Seca',
    'le-mans': 'Le Mans',
    monaco: 'Monaco',
  };
  return map[id] || id;
}

function formatClass(cls) {
  const map = {
    GT3: 'GT3',
    HYPERCAR_GTP: 'Hypercar / GTP',
    LMP2: 'LMP2',
    GT4: 'GT4',
    F1_2026: 'F1 2026',
    F1_2021: 'F1 2021',
    F1_2005: 'F1 2005',
    FORMULA_E: 'Formula E',
    SUPERCAR: 'Supercar',
    TRACK_COUPE: 'Track Coupe',
    gt3: 'GT3',
    hypercar_gtp: 'Hypercar / GTP',
    lmp2: 'LMP2',
    gt4: 'GT4',
    f1_2026: 'F1 2026',
    f1_2021: 'F1 2021',
    f1_2005: 'F1 2005',
    formula_e: 'Formula E',
    supercar: 'Supercar',
    track_coupe: 'Track Coupe',
  };
  return map[cls] || cls;
}

async function cmd(action) {
  await fetch('/api/' + action, { method: 'POST' });
}

function applyFilters() {
  const cls = document.getElementById('filterClassSelect').value;
  const trk = document.getElementById('filterTrackSelect').value;
  fetch('/api/filter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: cls, track: trk }),
  });
}

let latestState = null;
let currentTab = 'ALL';

function selectClassTab(cls) {
  currentTab = cls;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('tab-' + cls);
  if (activeBtn) activeBtn.classList.add('active');
  renderParams();
}

function renderParams() {
  if (!latestState) return;
  const cfg = latestState.bestConfig;
  const container = document.getElementById('params');
  if (!container || !cfg) return;

  const classesToShow = currentTab === 'ALL' ? ALL_CLASSES : [currentTab];
  let html = '';

  for (const cls of classesToShow) {
    const prof = cfg.classes?.[cls] || cfg.global || {};
    const err = latestState.classErrors?.[cls];
    const isTestingThisClass = latestState.running && latestState.currentTestingClass === cls;
    const highlight = isTestingThisClass ? 'border:1px solid #388bfd;background:rgba(56,139,253,0.08);' : '';

    html += '<div style="margin-bottom:12px;padding:8px;border-radius:6px;background:#0d1117;' + highlight + '">';
    html += '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:12px;color:#58a6ff;margin-bottom:4px;">';
    html += '<span>' + formatClass(cls) + '</span>';
    if (err !== undefined) {
      const errCls = err < 0.015 ? 'color:#3fb950;' : 'color:#f0883e;';
      html += '<span style="' + errCls + '">' + (err * 100).toFixed(2) + '% error</span>';
    }
    html += '</div>';

    for (const [k, v] of Object.entries(prof)) {
      const isParamTesting = isTestingThisClass && latestState.currentTestingParam?.startsWith(k);
      const paramStyle = isParamTesting ? 'color:#58a6ff;font-weight:bold;' : '';
      html += '<div class="param" style="' + paramStyle + '"><span>' + k + '</span><strong>' + Number(v).toFixed(4) + '</strong></div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

// 60fps smooth elapsed-time counter
function renderSmoothTimer() {
  if (latestState && latestState.running && latestState.stepStartTime) {
    const elapsedSec = (Date.now() - latestState.stepStartTime) / 1000;
    const timerEl = document.getElementById('subStepTimer');
    if (timerEl) {
      timerEl.textContent = 'Elapsed: ' + elapsedSec.toFixed(2) + 's';
    }
  }
  requestAnimationFrame(renderSmoothTimer);
}
requestAnimationFrame(renderSmoothTimer);

const es = new EventSource('/events');
es.onmessage = (e) => {
  const s = JSON.parse(e.data);
  latestState = s;

  document.getElementById('status').textContent =
    (s.running ? '⚡ RUNNING (Parallel Workers)' : '⏸ IDLE') + ' — Step ' + s.step + '/' + s.maxSteps;

  document.getElementById('errBadge').textContent =
    s.bestErr !== null ? 'Overall Error: ' + (s.bestErr * 100).toFixed(2) + '%' : '';

  const testParamEl = document.getElementById('testingParamBadge');
  if (s.running && s.currentTestingParam) {
    testParamEl.style.display = 'inline-block';
    testParamEl.textContent = 'Testing [' + (s.currentTestingClass || '') + ']: ' + s.currentTestingParam;
  } else {
    testParamEl.style.display = 'none';
  }

  // Update filter dropdowns if changed externally
  const classSelect = document.getElementById('filterClassSelect');
  if (classSelect && s.filterClass && classSelect.value !== s.filterClass) {
    classSelect.value = s.filterClass;
  }
  const trackSelect = document.getElementById('filterTrackSelect');
  if (trackSelect && s.filterTrack && trackSelect.value !== s.filterTrack) {
    trackSelect.value = s.filterTrack;
  }

  // Update class error badges in tabs
  for (const cls of ALL_CLASSES) {
    const badge = document.getElementById('badge-' + cls);
    const err = s.classErrors?.[cls];
    if (badge) {
      if (err !== undefined) {
        badge.textContent = (err * 100).toFixed(1) + '%';
        if (err < 0.015) badge.classList.add('locked');
        else badge.classList.remove('locked');
      } else {
        badge.textContent = '—';
        badge.classList.remove('locked');
      }
    }
  }

  renderParams();

  // Update Logs
  document.getElementById('logs').innerHTML = s.logs.map((l) => '<div>' + l + '</div>').join('');

  // Update Sub-Step Live Progress
  const sub = s.subStep;
  const fillEl = document.getElementById('subStepFill');
  const titleEl = document.getElementById('subStepTitle');
  const detailEl = document.getElementById('subStepDetail');

  const filteredTargets = TARGETS.filter((t) => {
    if (s.filterClass && s.filterClass !== 'ALL' && t.carClass !== s.filterClass && t.car !== s.filterClass.toLowerCase()) {
      return false;
    }
    if (s.filterTrack && s.filterTrack !== 'ALL' && t.track !== s.filterTrack) {
      return false;
    }
    return true;
  });

  if (s.running && sub) {
    const completed = sub.completed ?? 0;
    const total = sub.total ?? filteredTargets.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    fillEl.style.width = pct + '%';

    if (completed > 0) {
      const cachedNote = sub.cached ? ' [Reused Baseline Margin]' : '';
      titleEl.innerHTML = '⏱ Track ' + completed + '/' + total + ': ' + formatTrack(sub.track) + ' ' + formatClass(sub.carClass) + cachedNote;
      
      let spreadInfo = '';
      if (sub.slowestLapSec !== undefined && sub.carsEvaluated > 1) {
        const spreadSec = Math.max(0, sub.slowestLapSec - sub.lapTime);
        spreadInfo = '<div>Class Spread: <span>+' + spreadSec.toFixed(2) + 's (' + (sub.slowestCarId || 'slowest') + ')</span></div>';
      }

      detailEl.innerHTML =
        '<div>Leader: <span>' + (sub.carName || sub.carId || formatClass(sub.carClass)) + '</span></div>' +
        '<div>Evaluated: <span>' + (sub.carsEvaluated ?? 1) + ' cars</span></div>' +
        '<div>Lap: <span>' + fmt(sub.lapTime) + '</span></div>' +
        spreadInfo +
        '<div>Trap: <span>' + (sub.trapKmh ? sub.trapKmh.toFixed(1) + ' km/h' : '—') + '</span></div>' +
        '<div>Sub-Step Error: <span style="color:' + (sub.errorPct < 2.0 ? '#3fb950' : '#f0883e') + '">' + sub.errorPct + '%</span></div>' +
        '<div>Worker Time: <span>' + sub.elapsedMs + 'ms</span></div>';
    } else {
      titleEl.textContent = '🚀 Worker threads running parallel benchmarks across cores...';
      detailEl.innerHTML = '<div>Dispatching parallel workers...</div>';
    }
  } else if (!s.running) {
    fillEl.style.width = '0%';
    titleEl.textContent = 'Track 0/' + filteredTargets.length + ': Idle';
    detailEl.innerHTML = '<div>Status: <span>Optimizer paused or ready.</span></div>';
  }

  // Render SVG Convergence Chart
  if (s.history.length > 0) {
    const maxE = Math.max(...s.history.map((h) => h.err), 1);
    const pts = s.history
      .map((h, i) => {
        const x = s.history.length === 1 ? 300 : (i / (s.history.length - 1)) * 580 + 10;
        const y = 130 - (h.err / maxE) * 110;
        return x + ',' + y;
      })
      .join(' ');
    document.getElementById('chart').innerHTML =
      '<polyline fill="none" stroke="#3fb950" stroke-width="2.5" points="' + pts + '" />';
  }

  // Render Live Benchmark Rows
  const rows = s.liveRows && s.liveRows.length > 0 ? s.liveRows : s.bestRows || [];
  document.getElementById('tbody').innerHTML = filteredTargets.map((t) => {
    const r = rows.find((x) => x.track === t.track && (x.carClass === t.carClass || x.carClass === t.carClass.toLowerCase()));
    const isCurrentlyActive = s.running && sub && sub.track === t.track && (sub.carClass === t.carClass || sub.carClass === t.carClass.toLowerCase());
    const diff = r ? r.lapSec - t.targetLapSec : 0;
    const cls = !r ? '' : Math.abs(diff) < 1.5 ? 'good' : Math.abs(diff) < 4.0 ? 'warn' : 'bad';
    const rowClass = isCurrentlyActive ? 'active-row' : '';

    let spreadHtml = '—';
    if (r) {
      if (r.carsEvaluated && r.carsEvaluated > 1 && r.slowestLapSec !== undefined) {
        const spreadSec = Math.max(0, r.slowestLapSec - r.lapSec);
        const slowestDesc = 'Slowest: ' + (r.slowestCarId || 'Outlier') + ' (' + fmt(r.slowestLapSec) + ')';
        spreadHtml = '<span title="' + slowestDesc + '" style="cursor:help;color:' + (spreadSec > 2.0 ? '#f0883e' : '#8b949e') + ';">+' + spreadSec.toFixed(2) + 's <span style="font-size:11px;color:#8b949e;">(' + (r.slowestCarId || 'tail') + ')</span></span>';
      } else {
        spreadHtml = '<span style="color:#8b949e;">Single spec</span>';
      }
    }

    const leaderCar = r?.carName || r?.carId || '—';
    const testedCars = r ? (r.carsEvaluated ?? 1) + ' car' + ((r.carsEvaluated ?? 1) > 1 ? 's' : '') : '—';

    return (
      '<tr class="' + rowClass + '">' +
      '<td>' + formatTrack(t.track) + '</td>' +
      '<td>' + formatClass(t.carClass) + '</td>' +
      '<td>' + leaderCar + '</td>' +
      '<td>' + testedCars + '</td>' +
      '<td>' + fmt(r?.lapSec) + '</td>' +
      '<td>' + fmt(t.targetLapSec) + '</td>' +
      '<td class="' + cls + '">' + (r ? (diff >= 0 ? '+' : '') + diff.toFixed(2) + 's' : '—') + '</td>' +
      '<td>' + spreadHtml + '</td>' +
      '<td>' + (r ? r.trapKmh.toFixed(1) + ' km/h' : '—') + '</td>' +
      '<td>' + t.targetTrapKmh + ' km/h</td>' +
      '<td>' + (r ? r.wallHits : '—') + '</td>' +
      '</tr>'
    );
  }).join('');
};
</script>
</body>
</html>`;

http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    clients.add(res);
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    req.on('close', () => clients.delete(res));
  } else if (req.url === '/api/start' && req.method === 'POST') {
    if (!state.running) {
      state.running = true;
      log('Started parallel class-scoped optimization loop.');
      stepLoop();
    }
    res.end('ok');
  } else if (req.url === '/api/benchmark' && req.method === 'POST') {
    if (!state.running) {
      log('Running manual parallel benchmark pass...');
      state.stepStartTime = Date.now();
      const filtered = IRL_TARGETS.filter((t) => {
        if (state.filterClass && state.filterClass !== 'ALL' && t.carClass !== state.filterClass && t.car !== state.filterClass.toLowerCase()) return false;
        if (state.filterTrack && state.filterTrack !== 'ALL' && t.track !== state.filterTrack) return false;
        return true;
      });
      state.subStep = { completed: 0, total: filtered.length, track: filtered[0]?.track || 'spa-francorchamps', carClass: filtered[0]?.carClass || 'GT3' };
      broadcast();
      evaluateAsync(state.bestConfig, [], handleProgress)
        .then((result) => {
          state.bestRows = result.rows;
          state.liveRows = [...result.rows];
          state.classErrors = { ...state.classErrors, ...result.classErrors };
          state.bestErr = result.err;
          state.subStep = null;
          state.stepStartTime = null;
          log(`Benchmark pass completed. Error: ${(result.err * 100).toFixed(2)}% across ${result.rows.length} benchmarks.`);
          broadcast();
        })
        .catch((err) => {
          state.subStep = null;
          state.stepStartTime = null;
          log(`Benchmark error: ${err.message}`);
          broadcast();
        });
    }
    res.end('ok');
  } else if (req.url?.startsWith('/api/filter') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (parsed.class !== undefined) state.filterClass = parsed.class;
        if (parsed.track !== undefined) state.filterTrack = parsed.track;
      } catch {
        const u = new URL(req.url, `http://localhost:${PORT}`);
        if (u.searchParams.has('class')) state.filterClass = u.searchParams.get('class');
        if (u.searchParams.has('track')) state.filterTrack = u.searchParams.get('track');
      }
      log(`Filters updated: Class=${state.filterClass}, Track=${state.filterTrack}`);
      broadcast();
      res.end('ok');
    });
  } else if (req.url === '/api/stop' && req.method === 'POST') {
    state.running = false;
    state.subStep = null;
    state.stepStartTime = null;
    state.currentTestingClass = null;
    state.currentTestingParam = null;
    if (currentProcess) {
      try {
        currentProcess.kill();
      } catch {}
      currentProcess = null;
    }
    log('Paused optimization loop.');
    broadcast();
    res.end('ok');
  } else if (req.url === '/api/reset' && req.method === 'POST') {
    state.running = false;
    state.subStep = null;
    state.stepStartTime = null;
    state.currentTestingClass = null;
    state.currentTestingParam = null;
    if (currentProcess) {
      try {
        currentProcess.kill();
      } catch {}
      currentProcess = null;
    }
    state.step = 0;
    state.bestErr = null;
    state.classErrors = {};
    state.bestConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    state.bestRows = [];
    state.liveRows = [];
    state.history = [];
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    log('Reset all class multipliers to default calibrated values.');
    broadcast();
    res.end('ok');
  }
}).listen(PORT, () => console.log(`Auto-Tuner GUI running at http://localhost:${PORT}`));
