import { TRACK_SVG_PATHS } from '../src/game/trackSvgs';
import { REAL_DEM_ELEVATIONS } from '../src/game/trackElevations';

const raw = TRACK_SVG_PATHS['spa-francorchamps'];
const tokens = raw.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
const pts: [number, number][] = [];
for (let i = 0; i < tokens.length; i += 2) {
  pts.push([tokens[i], tokens[i + 1]]);
}

let total = 0;
const dists: number[] = [0];
for (let i = 0; i < pts.length; i++) {
  const p1 = pts[i];
  const p2 = pts[(i + 1) % pts.length];
  const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  total += d;
  dists.push(total);
}

console.log('Total SVG length:', total);
const landmarks = [
  'Start/Finish (285, 625)',
  'La Source entry (122, 802)',
  'La Source apex (115, 788)',
  'Descente vers Eau Rouge (165, 622)',
  'Eau Rouge bottom kink (262, 455)',
  'Eau Rouge left kink (278, 405)',
  'Raidillon crest (328, 382)',
  'Kemmel entry (425, 255)',
  'Kemmel straight end / Les Combes (715, 72)',
];

for (let i = 0; i < pts.length; i++) {
  const frac = dists[i] / total;
  const name = landmarks[i] || '';
  console.log(`pt[${i}] (${pts[i][0]}, ${pts[i][1]}) frac=${frac.toFixed(4)} dist=${dists[i].toFixed(1)} ${name}`);
}

const spaElev = REAL_DEM_ELEVATIONS['spa-francorchamps'];
console.log('\nCurrent Spa elevation array length:', spaElev.length);
console.log('Sample indices and corresponding t and y:');
for (let i = 0; i < spaElev.length; i += 5) {
  console.log(`idx=${i} t=${(i / spaElev.length).toFixed(3)} y=${spaElev[i]}`);
}
