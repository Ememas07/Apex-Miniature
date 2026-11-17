import { REAL_DEM_ELEVATIONS } from '../src/game/trackElevations';

const oldSpa = [...REAL_DEM_ELEVATIONS['spa-francorchamps']];
console.log('Old Spa length:', oldSpa.length);

// We need 200 samples.
// Target anchor points for t:
// t = 0.000 (idx 0): 0.0
// t = 0.035 (idx 7): -13.5 (La Source downhill)
// t = 0.082 (idx 16..17): -25.5 (bottom of Eau Rouge)
// t = 0.145 (idx 29): +56.0 (Raidillon crest)
// t = 0.200 (idx 40): +58.8 (Kemmel crest peak)
// t = 0.250 (idx 50): +55.9 (Kemmel straight plateau, connects to old index 50)

// Let's create the aligned array
const newSpa = new Float64Array(200);

// For t in [0.00, 0.082] (idx 0..16): smooth slope from 0.0 to -25.5 passing through ~ -13.5 at idx 7
for (let i = 0; i <= 16; i++) {
  const t = i / 16; // 0..1
  // Smooth cubic Hermite with negative slope at 0 and horizontal at valley bottom
  const y = 0.0 * (1 - t) + (-25.5) * t - 4.5 * Math.sin(t * Math.PI);
  newSpa[i] = Math.round(y * 10) / 10;
}
newSpa[0] = 0.0;
newSpa[7] = -13.5;
newSpa[16] = -25.5;

// For t in [0.082, 0.145] (idx 16..29): steep uphill climb from -25.5 up to +56.0
for (let i = 16; i <= 29; i++) {
  const u = (i - 16) / (29 - 16);
  // smoothstep from -25.5 to +56.0
  const s = u * u * (3 - 2 * u);
  const y = -25.5 + (56.0 - (-25.5)) * s;
  newSpa[i] = Math.round(y * 10) / 10;
}

// For t in [0.145, 0.250] (idx 29..50): Kemmel crest to plateau (+56.0 to +58.8 to +55.9)
for (let i = 29; i <= 50; i++) {
  const u = (i - 29) / (50 - 29);
  // Peak at ~0.5 (idx 40)
  const y = 56.0 + 2.8 * Math.sin(u * Math.PI) - 0.1 * u;
  newSpa[i] = Math.round(y * 10) / 10;
}

// From idx 50 to 199: keep old DEM elevation values (Kemmel, Les Combes, Rivage, Pouhon, Blanchimont)
for (let i = 50; i < 200; i++) {
  newSpa[i] = oldSpa[i];
}

console.log('\nNew Spa Key Points:');
console.log('idx 0 (t=0.000):', newSpa[0]);
console.log('idx 7 (t=0.035):', newSpa[7]);
console.log('idx 16 (t=0.080):', newSpa[16]);
console.log('idx 17 (t=0.085):', newSpa[17]);
console.log('idx 23 (t=0.115):', newSpa[23]);
console.log('idx 29 (t=0.145):', newSpa[29]);
console.log('idx 40 (t=0.200):', newSpa[40]);
console.log('idx 50 (t=0.250):', newSpa[50]);

// Output the full 200 array formatted nicely
let code = '  \'spa-francorchamps\': [\n';
for (let r = 0; r < 20; r++) {
  const slice = Array.from(newSpa.slice(r * 10, (r + 1) * 10)).map(v => v.toFixed(1));
  code += '    ' + slice.join(', ') + ',\n';
}
code += '  ],';
console.log('\n--- CODE ---');
console.log(code);
