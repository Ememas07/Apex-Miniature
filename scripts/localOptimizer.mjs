import fs from 'node:fs';
import { execSync } from 'node:child_process';

const CONFIG_PATH = 'src/game/tuningConfig.json';
const BENCHMARK_CMD = 'npx tsx scripts/benchmarkPhysicsAndAi.ts --json';

const BOUNDS = {
  downforceScale: [0.55, 1.35],
  brakeForceScale: [0.55, 1.35],
  dragScale: [0.65, 1.45],
  lowSpeedGripScale: [0.65, 1.30],
  aiCornerSpeedScale: [0.75, 1.00], // Strictly capped at 100% of physical tire grip
  aiBrakeMarginScale: [0.85, 1.40], // Cannot brake later than physical stopping distance
};

const IRL_TARGETS = [
  { track: 'spa-francorchamps', carClass: 'GT3', targetLapSec: 137.5, targetTrapKmh: 280 },
  { track: 'spa-francorchamps', carClass: 'HYPERCAR_GTP', targetLapSec: 123.0, targetTrapKmh: 320 },
  { track: 'monza', carClass: 'GT3', targetLapSec: 107.5, targetTrapKmh: 292 },
  { track: 'suzuka', carClass: 'F1_2026', targetLapSec: 89.5, targetTrapKmh: 332 },
  { track: 'monaco', carClass: 'F1_2026', targetLapSec: 71.0, targetTrapKmh: 292 },
  { track: 'le-mans', carClass: 'HYPERCAR_GTP', targetLapSec: 206.0, targetTrapKmh: 340 },
];

function evaluate(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  const raw = execSync(BENCHMARK_CMD, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const jsonLine = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).find((l) => l.startsWith('[')) || raw.trim();
  const rows = JSON.parse(jsonLine);

  let totalErr = 0;
  let matched = 0;

  for (const target of IRL_TARGETS) {
    const row = rows.find((r) => r.track === target.track && r.carClass === target.carClass);
    if (!row) continue;
    matched++;
    const lapErr = Math.abs(row.lapSec - target.targetLapSec) / target.targetLapSec;
    const trapErr = Math.abs(row.trapKmh - target.targetTrapKmh) / target.targetTrapKmh;
    const penalty = (row.wallHits || 0) * 1.0 + ((row.offTrackPct || 0) > 0.5 ? 0.5 : 0);
    totalErr += lapErr * 0.75 + trapErr * 0.25 + penalty;
  }

  return matched > 0 ? totalErr / matched : Infinity;
}

let bestConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
let bestErr = evaluate(bestConfig);
console.log(`Baseline Error: ${(bestErr * 100).toFixed(2)}%`);

const keys = Object.keys(bestConfig);
const stepsArg = process.argv.find((a) => a.startsWith('--steps='));
const ITERATIONS = stepsArg ? Math.max(1, Number(stepsArg.split('=')[1]) || 60) : 60;

for (let i = 1; i <= ITERATIONS; i++) {
  const key = keys[(i - 1) % keys.length];
  // Step size decays slightly over time for finer convergence
  const maxStep = i < 30 ? 0.04 : 0.015;
  const delta = (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * maxStep);

  const [minVal, maxVal] = BOUNDS[key] || [0.5, 1.5];
  const rawVal = bestConfig[key] * (1 + delta);
  const clampedVal = Math.min(Math.max(rawVal, minVal), maxVal);

  const candidate = {
    ...bestConfig,
    [key]: Number(clampedVal.toFixed(4)),
  };

  try {
    const err = evaluate(candidate);
    if (err < bestErr) {
      bestErr = err;
      bestConfig = candidate;
      console.log(`[${i}/${ITERATIONS}] ${key} -> ${candidate[key]} | Error: ${(bestErr * 100).toFixed(2)}%`);
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
    }
  } catch (e) {
    console.warn(`[${i}/${ITERATIONS}] Eval failed: ${e.message}`);
  }
}

fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
console.log('\nOptimal config saved to src/game/tuningConfig.json:', bestConfig);