import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CONFIG_PATH = 'src/game/tuningConfig.json';
const TSX_CLI_PATH = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

const BOUNDS = {
  downforceScale: [0.55, 1.35],
  brakeForceScale: [0.55, 1.35],
  dragScale: [0.65, 1.45],
  lowSpeedGripScale: [0.65, 1.30],
  aiCornerSpeedScale: [0.75, 1.00], // Strictly capped at 100% of physical tire grip
  aiBrakeMarginScale: [0.85, 1.40], // Cannot brake later than physical stopping distance
};

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

function evaluate(config, opts = {}) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  const flags = ['--json'];
  if (opts.classId) flags.push(`--class=${opts.classId}`);
  if (opts.trackId) flags.push(`--track=${opts.trackId}`);
  if (opts.onlyOutliers) flags.push('--only-outliers');
  if (opts.margin) flags.push(`--margin=${opts.margin}`);

  const args = [TSX_CLI_PATH, 'scripts/benchmarkPhysicsAndAi.ts', ...flags];
  const raw = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const jsonLine =
    raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).find((l) => l.startsWith('[')) || raw.trim();
  const rows = JSON.parse(jsonLine);

  let totalErr = 0;
  let matched = 0;
  const classErrors = {};

  for (const target of IRL_TARGETS) {
    if (opts.classId && target.carClass !== opts.classId && target.car !== opts.classId.toLowerCase()) continue;
    if (opts.trackId && target.track !== opts.trackId) continue;
    const row = rows.find((r) => r.track === target.track && (r.carClass === target.carClass || r.carClass === target.car));
    if (!row) continue;
    matched++;
    const lapErr = Math.abs(row.lapSec - target.targetLapSec) / target.targetLapSec;
    const trapErr = Math.abs(row.trapKmh - target.targetTrapKmh) / target.targetTrapKmh;
    const penalty = (row.wallHits || 0) * 1.0 + ((row.offTrackPct || 0) > 0.5 ? 0.5 : 0);
    const err = lapErr * 0.75 + trapErr * 0.25 + penalty;
    totalErr += err;

    if (!classErrors[target.carClass]) classErrors[target.carClass] = [];
    classErrors[target.carClass].push(err);
  }

  const avgClassErrors = {};
  for (const [cls, errs] of Object.entries(classErrors)) {
    avgClassErrors[cls] = errs.reduce((a, b) => a + b, 0) / errs.length;
  }

  return {
    err: matched > 0 ? totalErr / matched : Infinity,
    rows,
    classErrors: avgClassErrors,
  };
}

const classArg = process.argv.find((a) => a.startsWith('--class='))?.split('=')[1]?.toUpperCase();
const trackArg = process.argv.find((a) => a.startsWith('--track='))?.split('=')[1]?.toLowerCase();
const ALL_CLASSES = Array.from(new Set(IRL_TARGETS.map((t) => t.carClass)));
const targetClasses = classArg ? [classArg] : ALL_CLASSES;

let bestConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Initial baseline parallel verification
console.log(`Running parallel baseline benchmark${classArg ? ` [class=${classArg}]` : ''}${trackArg ? ` [track=${trackArg}]` : ''}...`);
const baseResult = evaluate(bestConfig, { classId: classArg, trackId: trackArg });
let bestErr = baseResult.err;
console.log(`Baseline Overall Error: ${(bestErr * 100).toFixed(2)}%`);
for (const [cls, err] of Object.entries(baseResult.classErrors)) {
  console.log(`  - ${cls}: ${(err * 100).toFixed(2)}%`);
}

const paramKeys = Object.keys(BOUNDS);
const stepsArg = process.argv.find((a) => a.startsWith('--steps='));
const ITERATIONS = stepsArg ? Math.max(1, Number(stepsArg.split('=')[1]) || 60) : 60;

for (let i = 1; i <= ITERATIONS; i++) {
  // Focus perturbations on out-of-margin classes
  const targetClass = targetClasses[(i - 1) % targetClasses.length];
  const paramKey = paramKeys[Math.floor((i - 1) / targetClasses.length) % paramKeys.length];

  const maxStep = i < 30 ? 0.04 : 0.015;
  const delta = (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * maxStep);

  const [minVal, maxVal] = BOUNDS[paramKey] || [0.5, 1.5];
  const currentVal = bestConfig.classes?.[targetClass]?.[paramKey] ?? bestConfig.global?.[paramKey] ?? 1.0;
  const rawVal = currentVal * (1 + delta);
  const clampedVal = Math.min(Math.max(rawVal, minVal), maxVal);

  const candidate = JSON.parse(JSON.stringify(bestConfig));
  if (!candidate.classes) candidate.classes = {};
  if (!candidate.classes[targetClass]) candidate.classes[targetClass] = { ...candidate.global };
  candidate.classes[targetClass][paramKey] = Number(clampedVal.toFixed(4));

  try {
    // 1. Fast class-scoped check focusing on outliers
    const quickRes = evaluate(candidate, {
      classId: targetClass,
      trackId: trackArg,
      onlyOutliers: true,
      margin: 1.5,
    });

    const prevClassErr = baseResult.classErrors[targetClass] ?? bestErr;
    if (quickRes.err < prevClassErr) {
      // 2. Regression Guard: Full parallel verification pass
      const fullRes = evaluate(candidate, { classId: classArg, trackId: trackArg });
      if (fullRes.err < bestErr) {
        bestErr = fullRes.err;
        bestConfig = candidate;
        baseResult.classErrors[targetClass] = fullRes.classErrors[targetClass];
        console.log(
          `[${i}/${ITERATIONS}] [${targetClass}] ${paramKey} -> ${candidate.classes[targetClass][paramKey]} | Overall Error: ${(bestErr * 100).toFixed(2)}%`,
        );
      } else {
        // Revert candidate
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
      }
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
    }
  } catch (e) {
    console.warn(`[${i}/${ITERATIONS}] Step failed: ${e.message}`);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
  }
}

fs.writeFileSync(CONFIG_PATH, JSON.stringify(bestConfig, null, 2));
console.log('\nOptimal config saved to src/game/tuningConfig.json');
