#!/usr/bin/env node
/**
 * Batch Assetto Corsa .kn5 -> game-ready low-poly .obj/.mtl converter for Apex Miniature.
 *
 * Aligns output models with src/three/carBuilder.ts:
 *   - Forward axis: +Z (nose), Rear: -Z (tail)
 *   - Lateral axis: +X / -X centered at 0.0
 *   - Vertical axis: +Y (up), ground plane at y = 0.0 (tire contact patch)
 *   - Length normalized to ~3.75m along Z (configurable via --target-length / --scale)
 *   - Separable wheel groups preserved as distinct `o` objects (WHEEL_LF, WHEEL_RF, WHEEL_LR, WHEEL_RR)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

let MeshoptSimplifier;
try {
  ({ MeshoptSimplifier } = await import('meshoptimizer'));
} catch {
  ({ MeshoptSimplifier } = await import('three/examples/jsm/libs/meshopt_simplifier.module.js'));
}
await MeshoptSimplifier.ready;

const DEFAULT_INPUT_DIR = 'models/raw-cars';
const DEFAULT_OUTPUT_DIR = 'models/lowpoly-cars';
const DEFAULT_TRIS = 12000;
const DEFAULT_WELD_EPSILON = 1e-4;
const LEGACY_TARGET_LENGTH = 3.75;
const DEFAULT_CREASE_ANGLE = 42;
const DEFAULT_MAX_ERROR = 0.012;

const STRIP_HELPER_RE =
  /(?:^|[_\-\s.])(COCKPIT|STEER(?:ING)?|DRIVER|SHADOW|COLLIDER|COLLISION|COL|PHYS(?:ICS)?|HITBOX|BLUR(?:RED)?|DAMAGE(?:D)?|DMG|LOD_?(?:[BCD]|[1-9])|INT|CABIN|INTERIOR|SEAT|ROLLCAGE|DASH|ELECTRONICS|GAUGE|BUTTONS|PEDAL|HELMET|OCCLUSION)(?:$|[_\-\s.\d])/i;
const STRIP_MAT_RE =
  /(?:^|[_\-\s.])(INT|COCKPIT|STEER(?:ING)?|SEAT|ROLLCAGE|DASH|ELECTRONICS|DISPLAY|GAUGE|BUTTONS|PEDAL|HELMET|OCCLUSION|DAMAGE(?:D)?|DMG|BLUR(?:RED)?)(?:$|[_\-\s.\d])/i;
const LEGACY_GLASS_RE =
  /(?:^|[_\-\s.])(GLASS|WINDSHIELD|WINDSCREEN|WINDOW|WINDOWS|GLAZING|CANOPY_GLASS)(?:$|[_\-\s.\d])/i;
const GLASS_NAME_RE =
  /(?:^|[_\-\s.])(GLASS|WINDSCREEN|WINDSHIELD|WINDOW|WINDOWS|GLAZING|CANOPY|VISOR|COCKPIT_GLASS|HEADLIGHT_GLASS|LENS|LCOVER|LCOVERS|LIGHT_COVER|PLEXI|LEXAN|PERSPEX)(?:$|[_\-\s.\d])|(?:windscreen|windshield|cockpit_glass|headlight_glass|glass_clear|internal_glass)/i;
const NON_GLASS_DECAL_OR_TRIM_RE =
  /(?:badge|logo|decal|sticker|plate|number|grill|mesh|net|shadow|brake|tail|turn|indicator|carbon|seat|belt|tire|tyre|rim|paint|projector|bulb|reflector|glow)/i;
const NON_WHEEL_ATTACHMENT_RE =
  /(?:^|[_\-\s.])(CALIPER|KNUCKLE|UPRIGHT|SUSP|SUSPENSION|WISHBONE|ARM|ROD|LINK|DUCT|SHROUD|COVER|FENDER|ARCH|WHEELHOUSE|WHEEL_HOUSE|WHEEL_ARCH|LED|LIGHT|GLOW|LAMP|MUDFLAP|SENSOR)(?:$|[_\-\s.\d])/i;
const NON_WHEEL_MAT_RE =
  /(?:led|glow|lamp|light|caliper|body|car_?paint|carpaint|skin|livery|mirror|seat|interior)/i;
const AERO_WING_RE =
  /(?:^|[_\-\s.])(WING|REAR_WING|FRONT_WING|SPOILER|AERO|SPLITTER|DIFFUSER|ENDPLATE|CANARD)(?:$|[_\-\s.\d])/i;
const AERO_TRIM_UV_RE =
  /(?:wing|spoiler|splitter|diffuser|aero|flap|endplate|canard|undertray|bottom|floor|trim|grille|carbon|exhaust|mirror|intake|plank|halo|wishbone|suspension|caliper)/i;

export const REAL_WORLD_CAR_DIMENSIONS = {
  // WEC Hypercar / IMSA GTP (~4.90 - 5.05 m)
  'ferrari-499p': 5.00,
  'toyota-gr010': 4.90,
  'porsche-963': 5.02,
  'cadillac-vseries-r': 5.03,
  'bmw-m-hybrid-v8': 5.02,
  'acura-arx-06': 5.00,
  'alpine-a424': 5.00,
  'peugeot-9x8': 4.995,
  'aston-valkyrie-lmh': 5.00,
  'lamborghini-sc63': 5.00,
  'genesis-gmr-001': 5.00,
  'glickenhaus-scg-007': 4.99,

  // LMP2 (~4.75 m)
  'oreca-07': 4.75,
  'oreca-07-united': 4.75,
  'oreca-07-europol': 4.75,
  'oreca-07-ao': 4.75,
  'oreca-07-af-corse': 4.75,
  'oreca-07-cool': 4.75,
  'oreca-07-algarve': 4.75,
  'ligier-js-p217': 4.75,

  // GT3 (~4.55 - 4.78 m)
  'porsche-911-gt3-r': 4.62,
  'ferrari-296-gt3': 4.565,
  'corvette-z06-gt3r': 4.71,
  'bmw-m4-gt3': 4.75,
  'ford-mustang-gt3': 4.78,
  'aston-vantage-gt3': 4.55,
  'lamborghini-temerario-gt3': 4.70,
  'mercedes-amg-gt3': 4.746,
  'lexus-rcf-gt3': 4.75,
  'mclaren-720s-gt3': 4.664,
  'renault-rs01-gt3': 4.71,
  'bentley-continental-gt3': 4.76,
  'audi-r8-lms-gt3': 4.568,
  'acura-nsx-gt3': 4.612,

  // GT4 (~4.25 - 4.78 m)
  'porsche-cayman-gt4-rs': 4.456,
  'bmw-m4-gt4': 4.76,
  'aston-vantage-gt4': 4.49,
  'toyota-supra-gt4': 4.46,
  'mclaren-artura-gt4': 4.54,
  'mercedes-amg-gt4': 4.62,
  'alpine-a110-gt4': 4.25,
  'ford-mustang-gt4': 4.78,

  // Production Coupes & Hatchbacks (Clio V6 ~3.84 m .. GT-R ~4.71 m)
  'renault-clio-v6': 3.84,
  'bmw-m2-cs': 4.58,
  'porsche-911-gt3-rs': 4.57,
  'honda-civic-type-r': 4.59,
  'corvette-z06-coupe': 4.69,
  'nissan-gtr-nismo': 4.71,

  // Supercars & Hypercars (~4.50 - 4.84 m)
  'aston-valkyrie-road': 4.50,
  'ferrari-296-gtb': 4.565,
  'mclaren-750s': 4.569,
  'koenigsegg-jesko': 4.61,
  'mclaren-w1': 4.635,
  'porsche-918-spyder': 4.643,
  'ferrari-sf90': 4.71,
  'ferrari-f80': 4.84,

  // Formula E (~5.02 m)
  'fe-porsche-99x': 5.02,
  'fe-jaguar-itype7': 5.02,
  'fe-nissan-e4orce': 5.02,
  'fe-maserati-folgore': 5.02,

  // Formula 1 (~4.65 - 5.63 m)
  'f1-26-mercedes': 5.50,
  'f1-26-ferrari': 5.50,
  'f1-26-redbull': 5.50,
  'f1-26-mclaren': 5.50,
  'f1-26-aston': 5.50,
  'f1-26-alpine': 5.50,
  'f1-26-williams': 5.50,
  'f1-26-haas': 5.50,
  'f1-26-audi': 5.50,
  'f1-26-racing-bulls': 5.50,
  'f1-26-cadillac': 5.50,
  'f1-21-mercedes': 5.63,
  'f1-21-redbull': 5.63,
  'f1-21-ferrari': 5.63,
  'f1-21-mclaren': 5.63,
  'f1-21-alpine': 5.63,
  'f1-21-alphatauri': 5.63,
  'f1-21-aston': 5.63,
  'f1-21-williams': 5.63,
  'f1-21-alfa': 5.63,
  'f1-21-haas': 5.63,
  'f1-05-renault': 4.65,
  'f1-05-mclaren': 4.65,
  'f1-05-ferrari': 4.65,
  'f1-05-williams': 4.65,
};

export const SIX_ZONE_UV_ATLAS = {
  TOP: { uMin: 0.02, uMax: 0.44, vMin: 0.02, vMax: 0.98 },
  LEFT_SIDE: { uMin: 0.46, uMax: 0.98, vMin: 0.76, vMax: 0.98 },
  RIGHT_SIDE: { uMin: 0.46, uMax: 0.98, vMin: 0.52, vMax: 0.74 },
  FRONT: { uMin: 0.46, uMax: 0.71, vMin: 0.27, vMax: 0.50 },
  REAR: { uMin: 0.73, uMax: 0.98, vMin: 0.27, vMax: 0.50 },
  WINGS_AERO_TRIM: { uMin: 0.46, uMax: 0.98, vMin: 0.02, vMax: 0.25 },
  WINGS_AERO_SUB: { uMin: 0.46, uMax: 0.71, vMin: 0.02, vMax: 0.25 },
  UNDERSIDE_SUB: { uMin: 0.73, uMax: 0.98, vMin: 0.02, vMax: 0.25 },
};

export const CANONICAL_CAR_NAMES = {
  acf_genesis_gmr_001: 'genesis-gmr-001',
  acura_nsx_gt3: 'acura-nsx-gt3',
  bentley_continental_gt3_18_acc: 'bentley-continental-gt3',
  bmw_m4_gt3: 'bmw-m4-gt3',
  corvette_z06_gt3r: 'corvette-z06-gt3r',
  exmods_ferrari_f80_26: 'ferrari-f80',
  g87: 'bmw-m2-cs',
  lexus_rcf_gt3: 'lexus-rcf-gt3',
  rs_01_gt3: 'renault-rs01-gt3',
  trr_ford_mustang_gt3: 'ford-mustang-gt3',
};

export function resolveCanonicalCarName(rawName) {
  return CANONICAL_CAR_NAMES[rawName] || rawName;
}

function printHelp() {
  console.log(`
Apex Miniature — Batch .KN5 / .OBJ Car -> Low-Poly .OBJ Converter

Usage:
  npm run convert:cars
  npm run convert:cars -- <inputFolder> <outputFolder> [options]
  node scripts/objToLowPoly.mjs [inputFolder] [outputFolder] [options]

Defaults:
  inputFolder   ${DEFAULT_INPUT_DIR}
  outputFolder  ${DEFAULT_OUTPUT_DIR}

Options:
  --tris <n>             Target triangle budget per car (default: ${DEFAULT_TRIS})
  --ratio <0..1>         Target decimation ratio (overrides --tris)
  --weld-epsilon <eps>   Vertex weld tolerance (scaled to mesh bbox diagonal, default: ${DEFAULT_WELD_EPSILON})
  --crease-angle <deg>   Crease angle in degrees for smooth/sharp normal splits (default: ${DEFAULT_CREASE_ANGLE})
  --max-error <err>      Max MeshoptSimplifier geometric error ratio (default: ${DEFAULT_MAX_ERROR})
  --flat / --no-flat     Split vertices & compute flat face normals (default: false / crease normals)
  --filter <pattern>     Convert only cars matching name pattern (e.g. --filter oreca)
  --exclude-glass        Strip glass/windshield/window nodes & materials
  --scale <factor>       Additional uniform scale multiplier (default: 1.0)
  --length <meters>      Override real-world car length along +Z in meters
  --target-length <m>    Alias for --length <meters>
  --forward <axis>       Force input forward axis (+z, -z, +x, -x) before aligning to +Z
  --no-normalize         Skip auto-centering, ground alignment, axis & scale normalization
  --legacy               Use previous converter pipeline (3.75m length, legacy UV/glass/simplify)
  -h, --help             Show this help message
`);
}

function parseArgs(argv) {
  const opts = {
    inputDir: DEFAULT_INPUT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    tris: DEFAULT_TRIS,
    ratio: null,
    weldEpsilon: DEFAULT_WELD_EPSILON,
    creaseAngle: DEFAULT_CREASE_ANGLE,
    maxError: null,
    flat: false,
    filter: null,
    excludeGlass: false,
    scale: 1.0,
    targetLength: null,
    forward: null,
    normalize: true,
    legacy: false,
    help: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--legacy') {
      opts.legacy = true;
    } else if (arg === '--tris' && i + 1 < argv.length) {
      opts.tris = Math.max(4, Math.floor(Number(argv[++i])));
    } else if (arg.startsWith('--tris=')) {
      opts.tris = Math.max(4, Math.floor(Number(arg.slice(7))));
    } else if (arg === '--ratio' && i + 1 < argv.length) {
      opts.ratio = Math.min(1, Math.max(0.001, Number(argv[++i])));
    } else if (arg.startsWith('--ratio=')) {
      opts.ratio = Math.min(1, Math.max(0.001, Number(arg.slice(8))));
    } else if (arg === '--weld-epsilon' && i + 1 < argv.length) {
      opts.weldEpsilon = Math.max(0, Number(argv[++i]));
    } else if (arg.startsWith('--weld-epsilon=')) {
      opts.weldEpsilon = Math.max(0, Number(arg.slice(15)));
    } else if (arg === '--crease-angle' && i + 1 < argv.length) {
      opts.creaseAngle = Math.max(0, Math.min(180, Number(argv[++i])));
    } else if (arg.startsWith('--crease-angle=')) {
      opts.creaseAngle = Math.max(0, Math.min(180, Number(arg.slice(15))));
    } else if (arg === '--max-error' && i + 1 < argv.length) {
      opts.maxError = Math.max(1e-4, Number(argv[++i]));
    } else if (arg.startsWith('--max-error=')) {
      opts.maxError = Math.max(1e-4, Number(arg.slice(12)));
    } else if (arg === '--flat') {
      opts.flat = true;
    } else if (arg === '--no-flat' || arg === '--flat=false') {
      opts.flat = false;
    } else if (arg === '--flat=true') {
      opts.flat = true;
    } else if ((arg === '--filter' || arg === '--car') && i + 1 < argv.length) {
      opts.filter = argv[++i].toLowerCase();
    } else if (arg.startsWith('--filter=') || arg.startsWith('--car=')) {
      opts.filter = arg.split('=')[1].toLowerCase();
    } else if (arg === '--exclude-glass') {
      opts.excludeGlass = true;
    } else if (arg === '--scale' && i + 1 < argv.length) {
      opts.scale = Number(argv[++i]);
    } else if (arg.startsWith('--scale=')) {
      opts.scale = Number(arg.slice(8));
    } else if ((arg === '--length' || arg === '--target-length') && i + 1 < argv.length) {
      opts.targetLength = Number(argv[++i]);
    } else if (arg.startsWith('--length=')) {
      opts.targetLength = Number(arg.slice(9));
    } else if (arg.startsWith('--target-length=')) {
      opts.targetLength = Number(arg.slice(16));
    } else if (arg === '--forward' && i + 1 < argv.length) {
      opts.forward = argv[++i].toLowerCase();
    } else if (arg.startsWith('--forward=')) {
      opts.forward = arg.slice(10).toLowerCase();
    } else if (arg === '--no-normalize') {
      opts.normalize = false;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length >= 1) opts.inputDir = positional[0];
  if (positional.length >= 2) opts.outputDir = positional[1];

  if (!Number.isFinite(opts.tris) || opts.tris <= 0) {
    throw new Error('--tris must be a positive number');
  }
  if (opts.ratio !== null && (!Number.isFinite(opts.ratio) || opts.ratio <= 0 || opts.ratio > 1)) {
    throw new Error('--ratio must be in (0, 1]');
  }
  if (!Number.isFinite(opts.weldEpsilon) || opts.weldEpsilon < 0) {
    throw new Error('--weld-epsilon must be >= 0');
  }
  if (!Number.isFinite(opts.creaseAngle) || opts.creaseAngle < 0 || opts.creaseAngle > 180) {
    throw new Error('--crease-angle must be in [0, 180]');
  }
  if (opts.maxError !== null && (!Number.isFinite(opts.maxError) || opts.maxError <= 0)) {
    throw new Error('--max-error must be > 0');
  }
  if (!Number.isFinite(opts.scale) || opts.scale <= 0) {
    throw new Error('--scale must be > 0');
  }
  if (opts.targetLength !== null && (!Number.isFinite(opts.targetLength) || opts.targetLength <= 0)) {
    throw new Error('--length / --target-length must be > 0');
  }
  if (opts.forward && !['+z', '-z', '+x', '-x'].includes(opts.forward)) {
    throw new Error('--forward must be one of +z, -z, +x, -x');
  }

  return opts;
}

function classifyWheelCorner(name) {
  const n = name.toUpperCase();
  if (NON_WHEEL_ATTACHMENT_RE.test(n)) return null;
  const isWheelPart =
    /(?:^|[_\-\s.])(WHEEL|RIM|TYRE|TIRE|DISC|HUB)(?:$|[_\-\s.\d])/i.test(n) ||
    /(WHEEL|RIM|TYRE|TIRE)/i.test(n);
  if (!isWheelPart) return null;

  if (/(?:^|[_\-\s.])(LF|FL|FRONT_LEFT|LEFT_FRONT)(?:$|[_\-\s.\d])/i.test(n)) return 'LF';
  if (/(?:^|[_\-\s.])(RF|FR|FRONT_RIGHT|RIGHT_FRONT)(?:$|[_\-\s.\d])/i.test(n)) return 'RF';
  if (/(?:^|[_\-\s.])(LR|RL|BL|REAR_LEFT|LEFT_REAR|BACK_LEFT)(?:$|[_\-\s.\d])/i.test(n)) return 'LR';
  if (/(?:^|[_\-\s.])(RR|BR|REAR_RIGHT|RIGHT_RIGHT|RIGHT_REAR|BACK_RIGHT)(?:$|[_\-\s.\d])/i.test(n)) return 'RR';
  return 'GENERIC';
}

function isGlassNameLegacy(name) {
  return Boolean(name && LEGACY_GLASS_RE.test(name));
}

function detectGlassMaterialOrNode({ nodeName, matName, kn5Mat, isTransparent, mtlEntry, legacy }) {
  if (legacy) {
    return isGlassNameLegacy(nodeName) || isGlassNameLegacy(matName);
  }
  if (isGlassNameLegacy(nodeName) || isGlassNameLegacy(matName)) return true;

  const shader = (kn5Mat?.shaderName || '').toLowerCase();
  const blendMode = kn5Mat?.blendMode ?? 0;
  const combinedName = `${nodeName || ''} ${matName || ''}`.trim();

  if (shader === 'kswindscreen' || shader.includes('windscreen')) {
    return true;
  }

  if (GLASS_NAME_RE.test(combinedName)) {
    // Allow headlight covers / lenses / canopy / visor, exclude solid inner bulbs/projectors
    if (!/projector|bulb|reflector|emissive/i.test(combinedName)) {
      return true;
    }
  }

  if (mtlEntry && ((mtlEntry.d !== null && mtlEntry.d < 0.95) || (mtlEntry.Tr !== null && mtlEntry.Tr > 0.05))) {
    if (!NON_GLASS_DECAL_OR_TRIM_RE.test(combinedName)) {
      return true;
    }
  }

  const isAlphaShader =
    shader === 'ksperpixelreflection' ||
    shader === 'ksperpixelat' ||
    shader.includes('perpixelreflection') ||
    shader.includes('perpixelat');
  if ((blendMode > 0 || isTransparent || (isAlphaShader && (blendMode > 0 || isTransparent))) &&
      !NON_GLASS_DECAL_OR_TRIM_RE.test(combinedName)) {
    return true;
  }

  return false;
}

function isAeroWingName(name) {
  if (!name) return false;
  if (/mirror/i.test(name)) return false;
  return AERO_WING_RE.test(name);
}

/**
 * Samples an approximate diffuse RGB color from an embedded KN5 texture buffer
 * (supports rgba<hex> names, DXT1/DXT3/DXT5 DDS, and 32-bit uncompressed DDS).
 */
function sampleEmbeddedTextureColor(texName, data) {
  if (!texName) return null;

  const rgbaMatch = texName.match(/^rgba([0-9a-f]{6})/i);
  if (rgbaMatch) {
    const hex = rgbaMatch[1];
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }

  if (!data || data.length < 128 || data.subarray(0, 4).toString('ascii') !== 'DDS ') {
    return null;
  }

  const height = data.readInt32LE(12);
  const width = data.readInt32LE(16);
  const pfFlags = data.readInt32LE(80);
  const fourCC = data.subarray(84, 88).toString('ascii');
  const rgb565 = (c) => [((c >> 11) & 31) / 31, ((c >> 5) & 63) / 63, (c & 31) / 31];

  let r = 0,
    g = 0,
    b = 0,
    count = 0;

  if (fourCC === 'DXT1' || fourCC === 'DXT3' || fourCC === 'DXT5') {
    const blockSize = fourCC === 'DXT1' ? 8 : 16;
    const colorOff = fourCC === 'DXT1' ? 0 : 8;
    const bw = Math.max(1, Math.ceil(width / 4));
    const bh = Math.max(1, Math.ceil(height / 4));
    const totalBlocks = bw * bh;
    const step = Math.max(1, Math.floor(totalBlocks / 512));

    for (let bi = 0; bi < totalBlocks; bi += step) {
      const bo = 128 + bi * blockSize + colorOff;
      if (bo + 4 > data.length) break;
      const raw0 = data.readUInt16LE(bo);
      const raw1 = data.readUInt16LE(bo + 2);
      if (raw0 === 0 && raw1 === 0) continue; // skip empty UV background padding
      const c0 = rgb565(raw0);
      const c1 = rgb565(raw1);
      r += (c0[0] + c1[0]) * 0.5;
      g += (c0[1] + c1[1]) * 0.5;
      b += (c0[2] + c1[2]) * 0.5;
      count++;
    }
  } else if ((pfFlags & 0x40) !== 0 && data.readInt32LE(88) === 32) {
    const pxCount = Math.max(1, width * height);
    const step = Math.max(1, Math.floor(pxCount / 512));
    for (let pi = 0; pi < pxCount; pi += step) {
      const po = 128 + pi * 4;
      if (po + 4 > data.length) break;
      const a = data[po + 3];
      if (a === 0) continue;
      b += data[po] / 255;
      g += data[po + 1] / 255;
      r += data[po + 2] / 255;
      count++;
    }
  }

  return count > 0 ? [r / count, g / count, b / count] : null;
}

function inferMaterialEntry(kn5Mat, textures, legacy = false) {
  const txDiffuseName =
    kn5Mat.texMaps.find((t) => t.sampler === 'txDiffuse')?.tName ?? kn5Mat.texMaps[0]?.tName ?? '';
  const texData = txDiffuseName ? textures.get(txDiffuseName) : null;
  let kd = sampleEmbeddedTextureColor(txDiffuseName, texData);

  const n = kn5Mat.name.toLowerCase();
  const ksDiff = Number.isFinite(kn5Mat.ksDiffuse) ? Math.max(0.05, Math.min(1, kn5Mat.ksDiffuse)) : 0.65;

  if (!kd) {
    if (/brake|tail|stop|red/.test(n)) kd = [0.82, 0.08, 0.08];
    else if (/turn|amber|indicator/.test(n)) kd = [0.92, 0.58, 0.06];
    else if (/glass|window|windshield|windscreen|canopy|visor|lcover/.test(n)) kd = [0.12, 0.16, 0.22];
    else if (/tyre|tire|rubber/.test(n)) kd = [0.12, 0.12, 0.13];
    else if (/carbon/.test(n)) kd = [0.15, 0.16, 0.18];
    else if (/chrome|metal|alu|rim|disc/.test(n)) kd = [0.76, 0.78, 0.82];
    else if (/plastic|grille|trim|matte/.test(n)) kd = [0.16, 0.17, 0.19];
    else if (/paint/.test(n)) kd = [0.78, 0.78, 0.8];
    else {
      const v = Math.max(0.2, Math.min(0.85, ksDiff));
      kd = [v, v, v];
    }
  }

  const safeName = kn5Mat.name.replace(/\s+/g, '_') || 'default_mat';
  const isGlassByMat = detectGlassMaterialOrNode({
    nodeName: '',
    matName: kn5Mat.name,
    kn5Mat,
    isTransparent: false,
    mtlEntry: null,
    legacy,
  });
  const entry = {
    name: safeName,
    Kd: kd,
    Ks: [0.25, 0.25, 0.25],
    Ns: 32,
    d: isGlassByMat ? 0.42 : null,
    Tr: null,
  };
  return entry;
}

function mulMat4(a, b) {
  // Column-major 4x4 multiplication (identical to Three.js Matrix4.multiply(a, b))
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4Det3(m) {
  return (
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[1] * (m[4] * m[10] - m[6] * m[8]) +
    m[2] * (m[4] * m[9] - m[5] * m[8])
  );
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function parseKn5File(kn5Path, opts) {
  const excludeGlass = Boolean(opts?.excludeGlass);
  const legacy = Boolean(opts?.legacy);
  const baseName = path.basename(kn5Path, path.extname(kn5Path));
  const buf = fs.readFileSync(kn5Path);

  if (buf.length < 18) {
    throw new Error('File too small to be a valid .kn5');
  }

  let off = 0;
  const magic = buf.subarray(0, 6).toString('ascii');
  off += 6;
  if (magic !== 'sc6969') {
    throw new Error(`Unsupported or encrypted .kn5 (header "${magic}")`);
  }

  const version = buf.readInt32LE(off);
  off += 4;
  if (version > 5) {
    // KN5 v6 adds an extra 4-byte unknown int32
    off += 4;
  }

  const readStr = () => {
    const len = buf.readInt32LE(off);
    off += 4;
    if (len < 0 || off + len > buf.length) {
      throw new Error(`Corrupt string length (${len}) at offset ${off - 4}`);
    }
    const s = buf.subarray(off, off + len).toString('utf8');
    off += len;
    return s;
  };

  // 1. Textures
  const texCount = buf.readInt32LE(off);
  off += 4;
  const textures = new Map();
  for (let i = 0; i < texCount; i++) {
    off += 4; // active flag
    const texName = readStr();
    const dataLen = buf.readInt32LE(off);
    off += 4;
    if (dataLen < 0 || off + dataLen > buf.length) {
      throw new Error(`Corrupt texture length (${dataLen}) for ${texName}`);
    }
    textures.set(texName, buf.subarray(off, off + dataLen));
    off += dataLen;
  }

  // 2. Materials
  const matCount = buf.readInt32LE(off);
  off += 4;
  const kn5Materials = [];
  const objMaterials = new Map();

  for (let i = 0; i < matCount; i++) {
    const name = readStr();
    const shaderName = readStr();
    const blendMode = buf.readUInt8(off);
    off += 1;
    const alphaTested = buf.readUInt8(off);
    off += 1;
    const depthMode = buf.readInt32LE(off);
    off += 4;

    const propCount = buf.readInt32LE(off);
    off += 4;
    let ksDiffuse = 0.65;
    for (let p = 0; p < propCount; p++) {
      const propName = readStr();
      const valA = buf.readFloatLE(off);
      off += 40; // float + vec2 + vec3 + vec4
      if (propName === 'ksDiffuse') ksDiffuse = valA;
    }

    const texMapCount = buf.readInt32LE(off);
    off += 4;
    const texMaps = [];
    for (let t = 0; t < texMapCount; t++) {
      const sampler = readStr();
      const slot = buf.readInt32LE(off);
      off += 4;
      const tName = readStr();
      texMaps.push({ sampler, slot, tName });
    }

    const kn5Mat = { name, shaderName, blendMode, alphaTested, depthMode, ksDiffuse, texMaps };
    kn5Materials.push(kn5Mat);
    const mtlEntry = inferMaterialEntry(kn5Mat, textures, legacy);
    objMaterials.set(mtlEntry.name, mtlEntry);
  }

  // 3. Recursive Node Tree
  const positions = []; // flat [x, y, z, ...]
  const texcoords = []; // flat [u, v, ...]
  const keptGroups = new Map();
  let totalInputTris = 0;

  const identity = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  function addMeshTriangles(groupName, matName, meshVerts, meshUVs, meshIndices, worldMat) {
    const baseV = positions.length / 3;
    const baseVT = texcoords.length / 2;

    for (let i = 0; i < meshVerts.length; i += 3) {
      const [wx, wy, wz] = transformPoint(worldMat, meshVerts[i], meshVerts[i + 1], meshVerts[i + 2]);
      positions.push(
        Number.isFinite(wx) ? wx : 0,
        Number.isFinite(wy) ? wy : 0,
        Number.isFinite(wz) ? wz : 0,
      );
    }
    for (let i = 0; i < meshUVs.length; i += 2) {
      const u = meshUVs[i];
      const v = meshUVs[i + 1];
      texcoords.push(Number.isFinite(u) ? u : 0, Number.isFinite(v) ? v : 0);
    }

    let list = keptGroups.get(groupName);
    if (!list) {
      list = [];
      keptGroups.set(groupName, list);
    }

    const maxV = meshVerts.length / 3;
    const maxVT = meshUVs.length / 2;
    const flipWinding = mat4Det3(worldMat) < 0;
    for (let i = 0; i < meshIndices.length; i += 3) {
      const i0 = meshIndices[i];
      const i1 = flipWinding ? meshIndices[i + 2] : meshIndices[i + 1];
      const i2 = flipWinding ? meshIndices[i + 1] : meshIndices[i + 2];
      if (i0 >= maxV || i1 >= maxV || i2 >= maxV) continue;
      if (i0 === i1 || i1 === i2 || i2 === i0) continue;

      list.push({
        v0: baseV + i0,
        v1: baseV + i1,
        v2: baseV + i2,
        vt0: i0 < maxVT ? baseVT + i0 : -1,
        vt1: i1 < maxVT ? baseVT + i1 : -1,
        vt2: i2 < maxVT ? baseVT + i2 : -1,
        material: matName,
      });
    }
  }

  function resolveGroupForMesh(nodeName, matName, kn5Mat, isTransparent, curWheel, curWing, curGlass) {
    const mtlEntry = objMaterials.get(matName) ?? null;
    const isGlass =
      curGlass ||
      detectGlassMaterialOrNode({
        nodeName,
        matName,
        kn5Mat,
        isTransparent,
        mtlEntry,
        legacy,
      });
    if (isGlass) {
      // Ensure .mtl encodes translucency for any detected glass material
      if (!legacy && mtlEntry && mtlEntry.d === null) {
        mtlEntry.d = 0.42;
      }
      return { groupName: 'GLASS', isGlass: true };
    }
    if (curWheel) {
      if (!legacy && (NON_WHEEL_ATTACHMENT_RE.test(nodeName) || NON_WHEEL_MAT_RE.test(matName))) {
        return { groupName: 'BODY', isGlass: false };
      }
      return { groupName: curWheel, isGlass: false };
    }
    if (curWing || (!legacy && isAeroWingName(matName))) {
      return { groupName: 'AERO_WING', isGlass: false };
    }
    return { groupName: 'BODY', isGlass: false };
  }

  function readNode(parentMat, inheritedStrip, inheritedWheel, inheritedWing, inheritedGlass) {
    const nodeClass = buf.readInt32LE(off);
    off += 4;
    const name = readStr();
    const childCount = buf.readInt32LE(off);
    off += 4;
    const active = buf.readUInt8(off);
    off += 1;

    const strippedByName = STRIP_HELPER_RE.test(name);
    const shouldStrip = inheritedStrip || active === 0 || strippedByName;

    const isNonWheelAttachment = !legacy && NON_WHEEL_ATTACHMENT_RE.test(name);
    const wheelCorner = isNonWheelAttachment ? null : classifyWheelCorner(name);
    const curWheel = isNonWheelAttachment
      ? null
      : (inheritedWheel ??
        (wheelCorner && wheelCorner !== 'GENERIC' ? `WHEEL_${wheelCorner}` : wheelCorner === 'GENERIC' ? name : null));
    const curWing = inheritedWing || (!curWheel && isAeroWingName(name));
    const curGlass =
      inheritedGlass ||
      detectGlassMaterialOrNode({
        nodeName: name,
        matName: '',
        kn5Mat: null,
        isTransparent: false,
        mtlEntry: null,
        legacy,
      });

    let currentMat = parentMat;

    if (nodeClass === 1) {
      const localMat = new Float64Array(16);
      for (let i = 0; i < 16; i++) {
        localMat[i] = buf.readFloatLE(off);
        off += 4;
      }
      currentMat = mulMat4(parentMat, localMat);
    } else if (nodeClass === 2) {
      off += 1; // castShadows
      const isVisible = buf.readUInt8(off);
      off += 1;
      const isTransparent = buf.readUInt8(off) !== 0;
      off += 1;

      const vCount = buf.readInt32LE(off);
      off += 4;

      const meshVerts = new Float32Array(vCount * 3);
      const meshUVs = new Float32Array(vCount * 2);
      for (let v = 0; v < vCount; v++) {
        meshVerts[v * 3] = buf.readFloatLE(off);
        meshVerts[v * 3 + 1] = buf.readFloatLE(off + 4);
        meshVerts[v * 3 + 2] = buf.readFloatLE(off + 8);
        // skip normal (12 bytes at +12)
        meshUVs[v * 2] = buf.readFloatLE(off + 24);
        // Flip V from DirectX top-left UV convention to OBJ/OpenGL bottom-left
        meshUVs[v * 2 + 1] = 1 - buf.readFloatLE(off + 28);
        off += 44;
      }

      const iCount = buf.readInt32LE(off);
      off += 4;
      const meshIndices = new Uint16Array(iCount);
      for (let i = 0; i < iCount; i++) {
        meshIndices[i] = buf.readUInt16LE(off);
        off += 2;
      }

      const matId = buf.readInt32LE(off);
      off += 4;
      off += 4; // layer
      off += 4; // lodIn
      off += 4; // lodOut
      off += 16; // bounding sphere (center + radius)
      const isRenderable = buf.readUInt8(off);
      off += 1;

      const triCount = Math.floor(iCount / 3);
      totalInputTris += triCount;

      const kn5Mat = matId >= 0 && matId < kn5Materials.length ? kn5Materials[matId] : null;
      const matName = kn5Mat ? kn5Mat.name.replace(/\s+/g, '_') : '';
      const { groupName, isGlass } = resolveGroupForMesh(
        name,
        matName,
        kn5Mat,
        isTransparent,
        curWheel,
        curWing,
        curGlass,
      );
      const isMatStripped = STRIP_MAT_RE.test(matName);

      if (
        !shouldStrip &&
        !isMatStripped &&
        isVisible !== 0 &&
        isRenderable !== 0 &&
        triCount > 0 &&
        !(excludeGlass && isGlass)
      ) {
        addMeshTriangles(groupName, matName, meshVerts, meshUVs, meshIndices, currentMat);
      }
    } else if (nodeClass === 3) {
      off += 1; // castShadows
      const isVisible = buf.readUInt8(off);
      off += 1;
      const isTransparent = buf.readUInt8(off) !== 0;
      off += 1;

      const boneCount = buf.readInt32LE(off);
      off += 4;
      for (let b = 0; b < boneCount; b++) {
        readStr();
        off += 64;
      }

      const vCount = buf.readInt32LE(off);
      off += 4;
      const meshVerts = new Float32Array(vCount * 3);
      const meshUVs = new Float32Array(vCount * 2);
      for (let v = 0; v < vCount; v++) {
        meshVerts[v * 3] = buf.readFloatLE(off);
        meshVerts[v * 3 + 1] = buf.readFloatLE(off + 4);
        meshVerts[v * 3 + 2] = buf.readFloatLE(off + 8);
        meshUVs[v * 2] = buf.readFloatLE(off + 24);
        meshUVs[v * 2 + 1] = 1 - buf.readFloatLE(off + 28);
        off += 76;
      }

      const iCount = buf.readInt32LE(off);
      off += 4;
      const meshIndices = new Uint16Array(iCount);
      for (let i = 0; i < iCount; i++) {
        meshIndices[i] = buf.readUInt16LE(off);
        off += 2;
      }

      const matId = buf.readInt32LE(off);
      off += 4;
      off += 12; // layer, lodIn, lodOut

      const triCount = Math.floor(iCount / 3);
      totalInputTris += triCount;

      const kn5Mat = matId >= 0 && matId < kn5Materials.length ? kn5Materials[matId] : null;
      const matName = kn5Mat ? kn5Mat.name.replace(/\s+/g, '_') : '';
      const { groupName, isGlass } = resolveGroupForMesh(
        name,
        matName,
        kn5Mat,
        isTransparent,
        curWheel,
        curWing,
        curGlass,
      );
      const isMatStripped = STRIP_MAT_RE.test(matName);

      if (
        !shouldStrip &&
        !isMatStripped &&
        isVisible !== 0 &&
        triCount > 0 &&
        !(excludeGlass && isGlass)
      ) {
        addMeshTriangles(groupName, matName, meshVerts, meshUVs, meshIndices, currentMat);
      }
    } else {
      throw new Error(`Unknown KN5 node class ${nodeClass} ("${name}") at offset ${off}`);
    }

    for (let c = 0; c < childCount; c++) {
      readNode(currentMat, shouldStrip, curWheel, curWing, curGlass);
    }
  }

  readNode(identity, false, null, false, false);

  return {
    baseName,
    positions,
    texcoords,
    materials: objMaterials,
    keptGroups,
    totalInputTris,
  };
}

function parseMtlFile(mtlPath) {
  const materials = new Map();
  if (!fs.existsSync(mtlPath)) return materials;
  const lines = fs.readFileSync(mtlPath, 'utf8').split(/\r?\n/);
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const kw = parts[0];
    if (kw === 'newmtl' && parts[1]) {
      const name = parts.slice(1).join('_');
      current = { name, Kd: [0.75, 0.75, 0.75], Ks: [0.25, 0.25, 0.25], Ns: 32, d: null, Tr: null };
      materials.set(name, current);
    } else if (current) {
      if (kw === 'Kd' && parts.length >= 4) {
        current.Kd = [Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0];
      } else if (kw === 'Ks' && parts.length >= 4) {
        current.Ks = [Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0];
      } else if (kw === 'Ns' && parts.length >= 2) {
        current.Ns = Number(parts[1]) || 32;
      } else if (kw === 'd' && parts.length >= 2) {
        const val = Number(parts[1]);
        if (Number.isFinite(val)) current.d = val;
      } else if (kw === 'Tr' && parts.length >= 2) {
        const val = Number(parts[1]);
        if (Number.isFinite(val)) {
          current.Tr = val;
          if (current.d === null) current.d = 1 - val;
        }
      }
    }
  }
  return materials;
}

export function parseObjFile(objPath, opts) {
  const excludeGlass = Boolean(opts?.excludeGlass);
  const legacy = Boolean(opts?.legacy);
  const baseName = path.basename(objPath, path.extname(objPath));
  const dir = path.dirname(objPath);
  const lines = fs.readFileSync(objPath, 'utf8').split(/\r?\n/);

  const positions = [];
  const texcoords = [];
  const objMaterials = new Map();
  const keptGroups = new Map();
  let curObjName = 'BODY';
  let curMatName = 'default_mat';
  let totalInputTris = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const kw = parts[0];

    if (kw === 'mtllib' && parts.length >= 2) {
      const mtlPath = path.resolve(dir, parts.slice(1).join(' '));
      for (const [k, v] of parseMtlFile(mtlPath).entries()) {
        objMaterials.set(k, v);
      }
    } else if (kw === 'v' && parts.length >= 4) {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      positions.push(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
    } else if (kw === 'vt' && parts.length >= 3) {
      const u = Number(parts[1]);
      const v = Number(parts[2]);
      texcoords.push(Number.isFinite(u) ? u : 0, Number.isFinite(v) ? v : 0);
    } else if (kw === 'o' || kw === 'g') {
      curObjName = parts.slice(1).join('_') || 'BODY';
    } else if (kw === 'usemtl') {
      curMatName = parts.slice(1).join('_') || 'default_mat';
      if (!objMaterials.has(curMatName)) {
        objMaterials.set(curMatName, {
          name: curMatName,
          Kd: [0.75, 0.75, 0.75],
          Ks: [0.25, 0.25, 0.25],
          Ns: 32,
          d: null,
          Tr: null,
        });
      }
    } else if (kw === 'f' && parts.length >= 4) {
      const vCount = positions.length / 3;
      const vtCount = texcoords.length / 2;
      const verts = [];
      for (let i = 1; i < parts.length; i++) {
        const [vStr, vtStr] = parts[i].split('/');
        let vi = parseInt(vStr, 10);
        if (!Number.isFinite(vi)) continue;
        vi = vi < 0 ? vCount + vi : vi - 1;
        let vti = -1;
        if (vtStr) {
          const parsedVt = parseInt(vtStr, 10);
          if (Number.isFinite(parsedVt)) {
            vti = parsedVt < 0 ? vtCount + parsedVt : parsedVt - 1;
          }
        }
        if (vi >= 0 && vi < vCount) {
          verts.push({ vi, vti });
        }
      }
      if (verts.length < 3) continue;

      const strippedByName = STRIP_HELPER_RE.test(curObjName) || STRIP_MAT_RE.test(curMatName);
      const mtlEntry = objMaterials.get(curMatName) ?? null;
      const isGlass = detectGlassMaterialOrNode({
        nodeName: curObjName,
        matName: curMatName,
        kn5Mat: null,
        isTransparent: false,
        mtlEntry,
        legacy,
      });

      totalInputTris += verts.length - 2;
      if (strippedByName || (excludeGlass && isGlass)) continue;

      let groupName = 'BODY';
      if (isGlass) {
        groupName = 'GLASS';
        if (!legacy && mtlEntry && mtlEntry.d === null) mtlEntry.d = 0.42;
      } else {
        const wheelCorner = !legacy && (NON_WHEEL_ATTACHMENT_RE.test(curObjName) || NON_WHEEL_MAT_RE.test(curMatName))
          ? null
          : classifyWheelCorner(curObjName);
        if (wheelCorner) {
          groupName = wheelCorner !== 'GENERIC' ? `WHEEL_${wheelCorner}` : curObjName;
        } else if (isAeroWingName(curObjName) || (!legacy && isAeroWingName(curMatName))) {
          groupName = 'AERO_WING';
        }
      }

      let list = keptGroups.get(groupName);
      if (!list) {
        list = [];
        keptGroups.set(groupName, list);
      }
      for (let t = 1; t < verts.length - 1; t++) {
        const a = verts[0];
        const b = verts[t];
        const c = verts[t + 1];
        if (a.vi === b.vi || b.vi === c.vi || c.vi === a.vi) continue;
        list.push({
          v0: a.vi,
          v1: b.vi,
          v2: c.vi,
          vt0: a.vti,
          vt1: b.vti,
          vt2: c.vti,
          material: curMatName,
        });
      }
    }
  }

  return {
    baseName,
    positions,
    texcoords,
    materials: objMaterials,
    keptGroups,
    totalInputTris,
  };
}

function computeUsedVertexBounds(positions, keptGroups) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let count = 0;

  for (const tris of keptGroups.values()) {
    for (const tri of tris) {
      for (const idx of [tri.v0, tri.v1, tri.v2]) {
        const x = positions[idx * 3];
        const y = positions[idx * 3 + 1];
        const z = positions[idx * 3 + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
        count++;
      }
    }
  }

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    sizeX: maxX - minX,
    sizeY: maxY - minY,
    sizeZ: maxZ - minZ,
    count,
  };
}

function computeGroupCentroid(positions, tris) {
  let sx = 0,
    sy = 0,
    sz = 0,
    n = 0;
  for (const tri of tris) {
    for (const idx of [tri.v0, tri.v1, tri.v2]) {
      sx += positions[idx * 3];
      sy += positions[idx * 3 + 1];
      sz += positions[idx * 3 + 2];
      n++;
    }
  }
  return n > 0 ? [sx / n, sy / n, sz / n] : [0, 0, 0];
}

function rotatePositionsAroundXNeg90(positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const z = positions[i + 2];
    positions[i + 1] = z;
    positions[i + 2] = -y;
  }
}

function rotatePositionsY(positions, quarterTurnsCCW) {
  const q = ((quarterTurnsCCW % 4) + 4) % 4;
  if (q === 0) return;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    if (q === 1) {
      positions[i] = z;
      positions[i + 2] = -x;
    } else if (q === 2) {
      positions[i] = -x;
      positions[i + 2] = -z;
    } else if (q === 3) {
      positions[i] = -z;
      positions[i + 2] = x;
    }
  }
}

function detectInputUnits(rawLength) {
  if (rawLength > 1500) return { unit: 'mm', toMeters: 0.001 };
  if (rawLength > 150) return { unit: 'cm', toMeters: 0.01 };
  if (rawLength > 15) return { unit: 'dm', toMeters: 0.1 };
  if (rawLength > 0 && rawLength < 0.1) return { unit: 'scaled-up', toMeters: 100 };
  return { unit: 'm', toMeters: 1.0 };
}

function resolveTargetCarLength(canonicalName, rawBounds, opts) {
  if (opts.targetLength !== null) {
    return opts.targetLength * opts.scale;
  }
  if (opts.legacy) {
    return LEGACY_TARGET_LENGTH * opts.scale;
  }

  const key = canonicalName.toLowerCase().replace(/_/g, '-');
  if (REAL_WORLD_CAR_DIMENSIONS[key]) {
    return REAL_WORLD_CAR_DIMENSIONS[key] * opts.scale;
  }
  if (key.includes('clio')) return 3.84 * opts.scale;
  if (key.startsWith('f1-05')) return 4.65 * opts.scale;
  if (key.startsWith('f1-21')) return 5.63 * opts.scale;
  if (key.startsWith('f1-26') || key.startsWith('f1-')) return 5.50 * opts.scale;
  if (key.startsWith('fe-')) return 5.02 * opts.scale;
  if (key.includes('oreca') || key.includes('ligier') || key.includes('lmp2')) return 4.75 * opts.scale;
  if (key.includes('499p') || key.includes('963') || key.includes('gr010') || key.includes('9x8') || key.includes('arx') || key.includes('v8') || key.includes('a424') || key.includes('sc63') || key.includes('gmr') || key.includes('valkyrie-lmh')) {
    return 5.00 * opts.scale;
  }
  if (key.includes('gt4')) return 4.55 * opts.scale;
  if (key.includes('gt3')) return 4.68 * opts.scale;

  const { toMeters } = detectInputUnits(rawBounds.sizeZ);
  const rawMeters = rawBounds.sizeZ * toMeters;
  if (rawMeters >= 3.4 && rawMeters <= 6.2) {
    return rawMeters * opts.scale;
  }
  return 4.65 * opts.scale;
}

function normalizeCarTransform(parsed, canonicalName, opts) {
  const { positions, keptGroups } = parsed;
  if (keptGroups.size === 0) return { diag: 4.5, targetLength: LEGACY_TARGET_LENGTH };

  // Sanitize any non-finite positions upfront
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) positions[i] = 0;
  }

  const initialBounds = computeUsedVertexBounds(positions, keptGroups);
  if (initialBounds.count === 0) return { diag: 4.5, targetLength: LEGACY_TARGET_LENGTH };

  if (!opts.normalize) {
    if (opts.scale !== 1.0) {
      for (let i = 0; i < positions.length; i++) {
        positions[i] *= opts.scale;
      }
    }
    const b = computeUsedVertexBounds(positions, keptGroups);
    return {
      diag: Math.hypot(b.sizeX, b.sizeY, b.sizeZ) || 4.5,
      targetLength: b.sizeZ || 4.5,
    };
  }

  // 1. Handle Z-up exports if Z is clearly the shortest (height) axis
  if (
    initialBounds.sizeZ > 0 &&
    initialBounds.sizeZ < initialBounds.sizeY * 0.75 &&
    initialBounds.sizeZ < initialBounds.sizeX * 0.75
  ) {
    rotatePositionsAroundXNeg90(positions);
  }

  // 2. Align forward axis to +Z
  if (opts.forward) {
    if (opts.forward === '-z') rotatePositionsY(positions, 2);
    else if (opts.forward === '+x') rotatePositionsY(positions, 3);
    else if (opts.forward === '-x') rotatePositionsY(positions, 1);
  } else {
    const frontCentroids = [];
    const rearCentroids = [];
    for (const [name, tris] of keptGroups.entries()) {
      const corner = classifyWheelCorner(name);
      if (corner === 'LF' || corner === 'RF') {
        frontCentroids.push(computeGroupCentroid(positions, tris));
      } else if (corner === 'LR' || corner === 'RR') {
        rearCentroids.push(computeGroupCentroid(positions, tris));
      }
    }

    if (frontCentroids.length > 0 && rearCentroids.length > 0) {
      const avg = (arr) =>
        arr.reduce(
          (acc, c) => [acc[0] + c[0] / arr.length, acc[1] + c[1] / arr.length, acc[2] + c[2] / arr.length],
          [0, 0, 0],
        );
      const fc = avg(frontCentroids);
      const rc = avg(rearCentroids);
      const dx = fc[0] - rc[0];
      const dz = fc[2] - rc[2];

      if (Math.abs(dz) >= Math.abs(dx)) {
        if (dz < 0) rotatePositionsY(positions, 2);
      } else {
        if (dx > 0) rotatePositionsY(positions, 3);
        else rotatePositionsY(positions, 1);
      }
    } else {
      const b = computeUsedVertexBounds(positions, keptGroups);
      if (b.sizeX > b.sizeZ * 1.15) {
        rotatePositionsY(positions, 3);
      }
    }
  }

  // 3. Scale uniformly to real-world car length (or 3.75m in --legacy mode) * user --scale
  const rotBounds = computeUsedVertexBounds(positions, keptGroups);
  const currentLength = Math.max(1e-6, rotBounds.sizeZ);
  const targetLength = resolveTargetCarLength(canonicalName, rotBounds, opts);
  const scaleFactor = targetLength / currentLength;
  for (let i = 0; i < positions.length; i++) {
    positions[i] *= scaleFactor;
  }

  // 4. Center X and Z at 0, place ground contact patch at Y = 0.0
  const scaledBounds = computeUsedVertexBounds(positions, keptGroups);
  const offsetX = (scaledBounds.minX + scaledBounds.maxX) * 0.5;
  const offsetY = scaledBounds.minY;
  const offsetZ = (scaledBounds.minZ + scaledBounds.maxZ) * 0.5;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= offsetX;
    positions[i + 1] -= offsetY;
    positions[i + 2] -= offsetZ;
  }

  // 5. In upgraded mode, consolidate any GENERIC wheel parts (e.g. disc_bl, wheel_0) into WHEEL_LF/RF/LR/RR by centroid
  if (!opts.legacy) {
    for (const [name, tris] of [...keptGroups.entries()]) {
      const corner = classifyWheelCorner(name);
      if (corner === 'GENERIC' && tris.length > 0) {
        const [cx, , cz] = computeGroupCentroid(positions, tris);
        // Standardize to WHEEL_LF / WHEEL_RF / WHEEL_LR / WHEEL_RR (+X left, -X right in +Z forward)
        const lr = cx >= 0 ? 'L' : 'R';
        const fr = cz >= 0 ? 'F' : 'R';
        const targetGroup = `WHEEL_${lr}${fr}`;
        if (targetGroup !== name) {
          let dest = keptGroups.get(targetGroup);
          if (!dest) {
            dest = [];
            keptGroups.set(targetGroup, dest);
          }
          dest.push(...tris);
          keptGroups.delete(name);
        }
      }
    }
  }

  const finalBounds = computeUsedVertexBounds(positions, keptGroups);
  return {
    diag: Math.hypot(finalBounds.sizeX, finalBounds.sizeY, finalBounds.sizeZ) || 4.5,
    targetLength,
  };
}

/**
 * Welds co-located vertices within `effectiveEpsilon` (scaled to bounding-box diagonal in upgraded mode)
 * and strips unneeded `vt`/`vn` splits prior to decimation so MeshoptSimplifier sees clean manifold topology.
 */
function buildWeldedSubmesh(positions, texcoords, tris, weldEpsilon, meshDiag = 4.5, legacy = false) {
  const effectiveEps = legacy
    ? weldEpsilon
    : weldEpsilon > 0
      ? weldEpsilon * Math.max(1e-4, meshDiag / 4.5)
      : 1e-6 * Math.max(1e-4, meshDiag / 4.5);

  const eps = Math.max(1e-8, effectiveEps);
  const invEps = 1 / eps;
  const buckets = new Map();

  const weldedPositions = [];
  const weldedUVs = [];
  const hasAnyUV = tris.some((t) => t.vt0 >= 0 && t.vt1 >= 0 && t.vt2 >= 0);
  const origToWelded = new Map();

  function getOrCreateWeldedVertex(vIdx, vtIdx) {
    const x = positions[vIdx * 3];
    const y = positions[vIdx * 3 + 1];
    const z = positions[vIdx * 3 + 2];

    if (effectiveEps > 0) {
      const gx = Math.round(x * invEps);
      const gy = Math.round(y * invEps);
      const gz = Math.round(z * invEps);
      const epsSq = effectiveEps * effectiveEps;

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const key = `${gx + dx},${gy + dy},${gz + dz}`;
            const bucket = buckets.get(key);
            if (!bucket) continue;
            for (const candIdx of bucket) {
              const cx = weldedPositions[candIdx * 3];
              const cy = weldedPositions[candIdx * 3 + 1];
              const cz = weldedPositions[candIdx * 3 + 2];
              const ddx = x - cx;
              const ddy = y - cy;
              const ddz = z - cz;
              if (ddx * ddx + ddy * ddy + ddz * ddz <= epsSq) {
                return candIdx;
              }
            }
          }
        }
      }

      const newIdx = weldedPositions.length / 3;
      weldedPositions.push(x, y, z);
      if (hasAnyUV) {
        if (vtIdx >= 0) {
          weldedUVs.push(texcoords[vtIdx * 2], texcoords[vtIdx * 2 + 1]);
        } else {
          weldedUVs.push(0, 0);
        }
      }
      const centerKey = `${gx},${gy},${gz}`;
      let list = buckets.get(centerKey);
      if (!list) {
        list = [];
        buckets.set(centerKey, list);
      }
      list.push(newIdx);
      return newIdx;
    } else {
      const existing = origToWelded.get(vIdx);
      if (existing !== undefined) return existing;
      const newIdx = weldedPositions.length / 3;
      weldedPositions.push(x, y, z);
      if (hasAnyUV) {
        if (vtIdx >= 0) {
          weldedUVs.push(texcoords[vtIdx * 2], texcoords[vtIdx * 2 + 1]);
        } else {
          weldedUVs.push(0, 0);
        }
      }
      origToWelded.set(vIdx, newIdx);
      return newIdx;
    }
  }

  const indexList = [];
  for (const tri of tris) {
    const a = getOrCreateWeldedVertex(tri.v0, tri.vt0);
    const b = getOrCreateWeldedVertex(tri.v1, tri.vt1);
    const c = getOrCreateWeldedVertex(tri.v2, tri.vt2);
    if (a === b || b === c || c === a) continue;
    indexList.push(a, b, c);
  }

  return {
    positions: new Float32Array(weldedPositions),
    uvs: hasAnyUV ? new Float32Array(weldedUVs) : null,
    indices: new Uint32Array(indexList),
  };
}

function filterDegenerateTris(indices, positions) {
  const out = [];
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;

    const ax = positions[i0 * 3],
      ay = positions[i0 * 3 + 1],
      az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3],
      by = positions[i1 * 3 + 1],
      bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3],
      cy = positions[i2 * 3 + 1],
      cz = positions[i2 * 3 + 2];

    if (
      !Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
      !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz) ||
      !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)
    ) {
      continue;
    }

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    if (nx * nx + ny * ny + nz * nz < 1e-16) continue;

    out.push(i0, i1, i2);
  }
  return new Uint32Array(out);
}

const SKIP_DECIMATION_TRIM_MAT_RE =
  /(?:trim|caliper|mirror|window|frame|gasket|rubber|chrome|grille|mesh|badge|logo|emblem|light|lamp|lens|exhaust|carbon|door|wing|splitter|diffuser|brake|disc|hub|lug|bolt|nut)/i;

function shouldSkipDecimation(submesh, opts = {}) {
  if (opts.legacy || opts.ratio !== null && opts.ratio !== undefined) return false;
  const inTris = submesh.inTris ?? (submesh.welded?.indices?.length ?? submesh.indices?.length ?? 0) / 3;
  const g = (submesh.groupName || '').toUpperCase();
  const mat = (submesh.material || '');
  if (inTris <= 350) return true;
  if (g.startsWith('WHEEL_') && inTris <= 900) return true;
  if (g === 'GLASS' && inTris <= 600) return true;
  if (SKIP_DECIMATION_TRIM_MAT_RE.test(mat) && inTris <= 700) return true;
  return false;
}

function simplifySubmesh(submesh, targetTris, opts = {}) {
  if (targetTris <= 0) return new Uint32Array(0);
  const inTris = submesh.indices.length / 3;
  if (inTris === 0 || targetTris >= inTris) {
    return filterDegenerateTris(submesh.indices, submesh.positions);
  }

  const clampedTargetTris = Math.max(1, targetTris);
  const targetIndexCount = clampedTargetTris * 3;
  const legacy = Boolean(opts.legacy);
  const maxErr = opts.maxError ?? (legacy ? 0.08 : DEFAULT_MAX_ERROR);

  const errorSteps = legacy
    ? [0.01, 0.02, 0.03, 0.05, 0.08]
    : [0.001, 0.0025, 0.005, 0.008, 0.012].filter((e) => e <= maxErr + 1e-9);
  if (errorSteps.length === 0) errorSteps.push(maxErr);

  // Progressive simplification with conservative error thresholds & LockBorder
  // so open wheel-arch, mirror, window, and panel boundaries do not implode.
  let bestIndices = submesh.indices;
  for (const targetError of errorSteps) {
    const [simplified] = MeshoptSimplifier.simplify(
      submesh.indices,
      submesh.positions,
      3,
      targetIndexCount,
      targetError,
      ['LockBorder'],
    );
    if (simplified && simplified.length >= 3) {
      bestIndices = simplified;
      if (simplified.length <= targetIndexCount * 1.1) {
        break;
      }
    }
  }

  return filterDegenerateTris(bestIndices, submesh.positions);
}

function allocateBudgets(submeshes, totalTargetTris, opts = {}) {
  const totalInTris = submeshes.reduce((s, m) => s + m.inTris, 0);
  if (totalInTris === 0) return submeshes.map(() => 0);
  if (totalTargetTris >= totalInTris) return submeshes.map((m) => m.inTris);

  const locked = submeshes.map((m) => shouldSkipDecimation(m, opts));
  let lockedTris = 0;
  let decimatableInTris = 0;
  for (let i = 0; i < submeshes.length; i++) {
    if (locked[i]) lockedTris += submeshes[i].inTris;
    else decimatableInTris += submeshes[i].inTris;
  }

  const remainingTarget = Math.max(0, totalTargetTris - lockedTris);
  const targets = submeshes.map((m, idx) => {
    if (locked[idx]) return m.inTris;
    if (decimatableInTris === 0) return m.inTris;
    const prop = Math.round((m.inTris / decimatableInTris) * remainingTarget);
    const g = (m.groupName || '').toUpperCase();
    const mat = (m.material || '').toUpperCase();

    let floor = 0;
    if (g.startsWith('WHEEL_')) {
      if (mat.includes('TYRE') || mat.includes('TIRE')) {
        floor = Math.min(m.inTris, Math.max(360, Math.floor(totalTargetTris * 0.03)));
      } else if (mat.includes('RIM') || mat.includes('WHEEL')) {
        floor = Math.min(m.inTris, Math.max(360, Math.floor(totalTargetTris * 0.03)));
      } else {
        floor = Math.min(m.inTris, Math.max(120, Math.floor(totalTargetTris * 0.01)));
      }
    } else if (g === 'BODY') {
      if (mat.includes('CARPAINT') || mat.includes('BODY') || mat.includes('CHASSIS') || mat.includes('SKIN')) {
        floor = Math.min(m.inTris, Math.max(2000, Math.floor(totalTargetTris * 0.35)));
      } else {
        floor = Math.min(m.inTris, Math.max(120, Math.floor(totalTargetTris * 0.01)));
      }
    } else if (g === 'AERO_WING') {
      floor = Math.min(m.inTris, Math.max(150, Math.floor(totalTargetTris * 0.015)));
    } else if (g === 'GLASS') {
      floor = Math.min(m.inTris, Math.max(120, Math.floor(totalTargetTris * 0.015)));
    }

    return Math.min(m.inTris, Math.max(floor, prop));
  });

  // Adjust delta on largest decimatable submeshes without shrinking locked small/dense parts
  let diff = targets.reduce((s, v) => s + v, 0) - totalTargetTris;
  const order = submeshes
    .map((m, idx) => ({ idx, inTris: m.inTris, groupName: m.groupName, material: m.material, locked: locked[idx] }))
    .filter((item) => !item.locked)
    .sort((a, b) => b.inTris - a.inTris);

  let guard = 0;
  while (diff !== 0 && guard++ < 20000) {
    let changed = false;
    for (const item of order) {
      if (diff === 0) break;
      const idx = item.idx;
      const isTyreOrRim = item.groupName.startsWith('WHEEL_') && /(TYRE|TIRE|RIM)/i.test(item.material);
      const minFloor = isTyreOrRim ? 300 : 100;
      if (diff > 0 && targets[idx] > minFloor) {
        targets[idx]--;
        diff--;
        changed = true;
      } else if (diff < 0 && targets[idx] < submeshes[idx].inTris) {
        targets[idx]++;
        diff++;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return targets;
}

function fmtNum(n) {
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function computeBodyBoundsForUV(groupOutputs) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let count = 0;

  for (const grp of groupOutputs) {
    if (grp.name === 'GLASS' || grp.name.startsWith('WHEEL_')) continue;
    for (const batch of grp.batches) {
      const { positions, indices } = batch;
      for (let i = 0; i < indices.length; i++) {
        const vi = indices[i];
        const x = positions[vi * 3];
        const y = positions[vi * 3 + 1];
        const z = positions[vi * 3 + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
        count++;
      }
    }
  }

  if (count === 0) {
    return { minX: -1, maxX: 1, minY: 0, maxY: 1.3, minZ: -2.3, maxZ: 2.3 };
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function classifyAndProjectSixZoneUV(ax, ay, az, bx, by, bz, cx, cy, cz, groupName, matName, bounds) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  let fnx = e1y * e2z - e1z * e2y;
  let fny = e1z * e2x - e1x * e2z;
  let fnz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(fnx, fny, fnz) || 1;
  fnx /= len;
  fny /= len;
  fnz /= len;

  const isAeroMat = groupName === 'AERO_WING' || AERO_TRIM_UV_RE.test(matName || '');
  const isUnderside = fny < -0.55;
  let zone;
  if (isAeroMat || isUnderside) {
    zone = 'WINGS_AERO_TRIM';
  } else {
    const absX = Math.abs(fnx);
    const absY = Math.abs(fny);
    const absZ = Math.abs(fnz);
    if (absY >= absX && absY >= absZ) {
      zone = 'TOP';
    } else if (absX >= absY && absX >= absZ) {
      zone = fnx >= 0 ? 'LEFT_SIDE' : 'RIGHT_SIDE';
    } else {
      zone = fnz >= 0 ? 'FRONT' : 'REAR';
    }
  }

  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
  const spanZ = Math.max(1e-4, bounds.maxZ - bounds.minZ);
  let rect = SIX_ZONE_UV_ATLAS[zone];
  if (zone === 'WINGS_AERO_TRIM') {
    rect = isUnderside ? SIX_ZONE_UV_ATLAS.UNDERSIDE_SUB : SIX_ZONE_UV_ATLAS.WINGS_AERO_SUB;
  }

  const innerPad = 0.006;
  const uLo = rect.uMin + innerPad;
  const uHi = rect.uMax - innerPad;
  const vLo = rect.vMin + innerPad;
  const vHi = rect.vMax - innerPad;

  const projPt = (x, y, z) => {
    let nu = 0.5;
    let nv = 0.5;
    if (zone === 'TOP' || zone === 'WINGS_AERO_TRIM') {
      nu = (bounds.maxX - x) / spanX;
      nv = (z - bounds.minZ) / spanZ;
    } else if (zone === 'LEFT_SIDE') {
      nu = (z - bounds.minZ) / spanZ;
      nv = (y - bounds.minY) / spanY;
    } else if (zone === 'RIGHT_SIDE') {
      nu = (bounds.maxZ - z) / spanZ;
      nv = (y - bounds.minY) / spanY;
    } else if (zone === 'FRONT') {
      nu = (bounds.maxX - x) / spanX;
      nv = (y - bounds.minY) / spanY;
    } else {
      nu = (x - bounds.minX) / spanX;
      nv = (y - bounds.minY) / spanY;
    }
    return [uLo + clamp01(nu) * (uHi - uLo), vLo + clamp01(nv) * (vHi - vLo)];
  };

  return [projPt(ax, ay, az), projPt(bx, by, bz), projPt(cx, cy, cz)];
}

function writeObjAndMtl(outObjPath, outMtlPath, carName, groupOutputs, parsedMaterials, opts = {}) {
  const flat = Boolean(opts.flat);
  const legacy = Boolean(opts.legacy);
  const creaseAngleDeg = opts.creaseAngle ?? DEFAULT_CREASE_ANGLE;
  const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180);

  const usedMaterials = new Set();
  for (const grp of groupOutputs) {
    for (const batch of grp.batches) {
      if (batch.material) usedMaterials.add(batch.material);
    }
  }

  const hasMtl = usedMaterials.size > 0;
  const objLines = [
    `# Exported by Apex Miniature objToLowPoly.mjs (.kn5/.obj -> low-poly .obj)`,
    `# Car: ${carName}`,
    legacy ? `# Apex-Pipeline: v1-legacy` : `# Apex-Pipeline: v2`,
    `# Coordinate convention: +Z forward, +Y up, y=0 ground plane`,
  ];
  if (hasMtl) {
    objLines.push(`mtllib ${path.basename(outMtlPath)}`);
  }

  const bodyBounds = legacy ? null : computeBodyBoundsForUV(groupOutputs);

  let vOffset = 1;
  let vtOffset = 1;
  let vnOffset = 1;
  let totalOutTris = 0;

  for (const grp of groupOutputs) {
    const grpHasTris = grp.batches.some((b) => b.indices.length >= 3);
    if (!grpHasTris) continue;

    objLines.push(`o ${grp.name}`);
    const isBodyLiveryGroup = grp.name !== 'GLASS' && !grp.name.startsWith('WHEEL_');

    for (const batch of grp.batches) {
      const { indices, positions, uvs, material } = batch;
      const triCount = indices.length / 3;
      if (triCount === 0) continue;
      totalOutTris += triCount;

      if (flat) {
        for (let t = 0; t < indices.length; t += 3) {
          const i0 = indices[t];
          const i1 = indices[t + 1];
          const i2 = indices[t + 2];

          const ax = positions[i0 * 3],
            ay = positions[i0 * 3 + 1],
            az = positions[i0 * 3 + 2];
          const bx = positions[i1 * 3],
            by = positions[i1 * 3 + 1],
            bz = positions[i1 * 3 + 2];
          const cx = positions[i2 * 3],
            cy = positions[i2 * 3 + 1],
            cz = positions[i2 * 3 + 2];

          const e1x = bx - ax,
            e1y = by - ay,
            e1z = bz - az;
          const e2x = cx - ax,
            e2y = cy - ay,
            e2z = cz - az;
          let nx = e1y * e2z - e1z * e2y;
          let ny = e1z * e2x - e1x * e2z;
          let nz = e1x * e2y - e1y * e2x;
          const len = Math.hypot(nx, ny, nz) || 1;
          nx /= len;
          ny /= len;
          nz /= len;

          objLines.push(`v ${fmtNum(ax)} ${fmtNum(ay)} ${fmtNum(az)}`);
          objLines.push(`v ${fmtNum(bx)} ${fmtNum(by)} ${fmtNum(bz)}`);
          objLines.push(`v ${fmtNum(cx)} ${fmtNum(cy)} ${fmtNum(cz)}`);

          if (!legacy && isBodyLiveryGroup) {
            const [uv0, uv1, uv2] = classifyAndProjectSixZoneUV(
              ax, ay, az, bx, by, bz, cx, cy, cz, grp.name, material, bodyBounds,
            );
            objLines.push(`vt ${fmtNum(uv0[0])} ${fmtNum(uv0[1])}`);
            objLines.push(`vt ${fmtNum(uv1[0])} ${fmtNum(uv1[1])}`);
            objLines.push(`vt ${fmtNum(uv2[0])} ${fmtNum(uv2[1])}`);
          } else if (uvs) {
            const c0 = legacy ? [uvs[i0 * 2], uvs[i0 * 2 + 1]] : [clamp01(uvs[i0 * 2]), clamp01(uvs[i0 * 2 + 1])];
            const c1 = legacy ? [uvs[i1 * 2], uvs[i1 * 2 + 1]] : [clamp01(uvs[i1 * 2]), clamp01(uvs[i1 * 2 + 1])];
            const c2 = legacy ? [uvs[i2 * 2], uvs[i2 * 2 + 1]] : [clamp01(uvs[i2 * 2]), clamp01(uvs[i2 * 2 + 1])];
            objLines.push(`vt ${fmtNum(c0[0])} ${fmtNum(c0[1])}`);
            objLines.push(`vt ${fmtNum(c1[0])} ${fmtNum(c1[1])}`);
            objLines.push(`vt ${fmtNum(c2[0])} ${fmtNum(c2[1])}`);
          }

          objLines.push(`vn ${fmtNum(nx)} ${fmtNum(ny)} ${fmtNum(nz)}`);
        }

        if (material) {
          objLines.push(`usemtl ${material}`);
        }

        const emitUVs = (!legacy && isBodyLiveryGroup) || Boolean(uvs);
        for (let t = 0; t < triCount; t++) {
          const v0 = vOffset + t * 3;
          const v1 = v0 + 1;
          const v2 = v0 + 2;
          const vn = vnOffset + t;
          if (emitUVs) {
            const vt0 = vtOffset + t * 3;
            const vt1 = vt0 + 1;
            const vt2 = vt0 + 2;
            objLines.push(`f ${v0}/${vt0}/${vn} ${v1}/${vt1}/${vn} ${v2}/${vt2}/${vn}`);
          } else {
            objLines.push(`f ${v0}//${vn} ${v1}//${vn} ${v2}//${vn}`);
          }
        }

        vOffset += triCount * 3;
        if (emitUVs) vtOffset += triCount * 3;
        vnOffset += triCount;
      } else if (legacy) {
        const compactMap = new Map();
        const usedVerts = [];
        for (let i = 0; i < indices.length; i++) {
          const orig = indices[i];
          if (!compactMap.has(orig)) {
            compactMap.set(orig, usedVerts.length);
            usedVerts.push(orig);
          }
        }

        const vertNormals = new Float32Array(usedVerts.length * 3);
        for (let t = 0; t < indices.length; t += 3) {
          const i0 = indices[t];
          const i1 = indices[t + 1];
          const i2 = indices[t + 2];

          const ax = positions[i0 * 3],
            ay = positions[i0 * 3 + 1],
            az = positions[i0 * 3 + 2];
          const bx = positions[i1 * 3],
            by = positions[i1 * 3 + 1],
            bz = positions[i1 * 3 + 2];
          const cx = positions[i2 * 3],
            cy = positions[i2 * 3 + 1],
            cz = positions[i2 * 3 + 2];

          const e1x = bx - ax,
            e1y = by - ay,
            e1z = bz - az;
          const e2x = cx - ax,
            e2y = cy - ay,
            e2z = cz - az;
          const nx = e1y * e2z - e1z * e2y;
          const ny = e1z * e2x - e1x * e2z;
          const nz = e1x * e2y - e1y * e2x;

          for (const orig of [i0, i1, i2]) {
            const ci = compactMap.get(orig);
            vertNormals[ci * 3] += nx;
            vertNormals[ci * 3 + 1] += ny;
            vertNormals[ci * 3 + 2] += nz;
          }
        }

        for (let i = 0; i < usedVerts.length; i++) {
          const orig = usedVerts[i];
          objLines.push(
            `v ${fmtNum(positions[orig * 3])} ${fmtNum(positions[orig * 3 + 1])} ${fmtNum(positions[orig * 3 + 2])}`,
          );
          if (uvs) {
            objLines.push(`vt ${fmtNum(uvs[orig * 2])} ${fmtNum(uvs[orig * 2 + 1])}`);
          }
          const nx = vertNormals[i * 3];
          const ny = vertNormals[i * 3 + 1];
          const nz = vertNormals[i * 3 + 2];
          const len = Math.hypot(nx, ny, nz) || 1;
          objLines.push(`vn ${fmtNum(nx / len)} ${fmtNum(ny / len)} ${fmtNum(nz / len)}`);
        }

        if (material) {
          objLines.push(`usemtl ${material}`);
        }

        for (let t = 0; t < indices.length; t += 3) {
          const c0 = compactMap.get(indices[t]);
          const c1 = compactMap.get(indices[t + 1]);
          const c2 = compactMap.get(indices[t + 2]);
          const aV = vOffset + c0,
            bV = vOffset + c1,
            cV = vOffset + c2;
          const aN = vnOffset + c0,
            bN = vnOffset + c1,
            cN = vnOffset + c2;
          if (uvs) {
            const aT = vtOffset + c0,
              bT = vtOffset + c1,
              cT = vtOffset + c2;
            objLines.push(`f ${aV}/${aT}/${aN} ${bV}/${bT}/${bN} ${cV}/${cT}/${cN}`);
          } else {
            objLines.push(`f ${aV}//${aN} ${bV}//${bN} ${cV}//${cN}`);
          }
        }

        vOffset += usedVerts.length;
        if (uvs) vtOffset += usedVerts.length;
        vnOffset += usedVerts.length;
      } else {
        // Upgraded mode: compact vertices, crease-angle split normals, and 6-zone split UVs
        const compactMap = new Map();
        const usedVerts = [];
        for (let i = 0; i < indices.length; i++) {
          const orig = indices[i];
          if (!compactMap.has(orig)) {
            compactMap.set(orig, usedVerts.length);
            usedVerts.push(orig);
          }
        }

        const triAreaNormals = new Float32Array(triCount * 3);
        const triUnitNormals = new Float32Array(triCount * 3);
        const vertToTris = Array.from({ length: usedVerts.length }, () => []);

        for (let t = 0; t < triCount; t++) {
          const i0 = indices[t * 3];
          const i1 = indices[t * 3 + 1];
          const i2 = indices[t * 3 + 2];

          const ax = positions[i0 * 3],
            ay = positions[i0 * 3 + 1],
            az = positions[i0 * 3 + 2];
          const bx = positions[i1 * 3],
            by = positions[i1 * 3 + 1],
            bz = positions[i1 * 3 + 2];
          const cx = positions[i2 * 3],
            cy = positions[i2 * 3 + 1],
            cz = positions[i2 * 3 + 2];

          const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
          const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
          const nx = e1y * e2z - e1z * e2y;
          const ny = e1z * e2x - e1x * e2z;
          const nz = e1x * e2y - e1y * e2x;
          const len = Math.hypot(nx, ny, nz) || 1;

          triAreaNormals[t * 3] = nx;
          triAreaNormals[t * 3 + 1] = ny;
          triAreaNormals[t * 3 + 2] = nz;
          triUnitNormals[t * 3] = nx / len;
          triUnitNormals[t * 3 + 1] = ny / len;
          triUnitNormals[t * 3 + 2] = nz / len;

          vertToTris[compactMap.get(i0)].push(t);
          vertToTris[compactMap.get(i1)].push(t);
          vertToTris[compactMap.get(i2)].push(t);
        }

        for (let i = 0; i < usedVerts.length; i++) {
          const orig = usedVerts[i];
          objLines.push(
            `v ${fmtNum(positions[orig * 3])} ${fmtNum(positions[orig * 3 + 1])} ${fmtNum(positions[orig * 3 + 2])}`,
          );
        }

        const emitUVs = isBodyLiveryGroup || Boolean(uvs);
        const uvDedup = new Map();
        const uvList = [];
        const normDedup = new Map();
        const normList = [];
        const faceCornerRecords = new Array(triCount * 3);

        for (let t = 0; t < triCount; t++) {
          const i0 = indices[t * 3];
          const i1 = indices[t * 3 + 1];
          const i2 = indices[t * 3 + 2];

          let triUVs = null;
          if (isBodyLiveryGroup) {
            triUVs = classifyAndProjectSixZoneUV(
              positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
              positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
              positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
              grp.name,
              material,
              bodyBounds,
            );
          } else if (uvs) {
            triUVs = [
              [clamp01(uvs[i0 * 2]), clamp01(uvs[i0 * 2 + 1])],
              [clamp01(uvs[i1 * 2]), clamp01(uvs[i1 * 2 + 1])],
              [clamp01(uvs[i2 * 2]), clamp01(uvs[i2 * 2 + 1])],
            ];
          }

          const ux = triUnitNormals[t * 3];
          const uy = triUnitNormals[t * 3 + 1];
          const uz = triUnitNormals[t * 3 + 2];
          const triVerts = [i0, i1, i2];

          for (let c = 0; c < 3; c++) {
            const orig = triVerts[c];
            const ci = compactMap.get(orig);

            let snx = 0, sny = 0, snz = 0;
            for (const nt of vertToTris[ci]) {
              const dot =
                ux * triUnitNormals[nt * 3] +
                uy * triUnitNormals[nt * 3 + 1] +
                uz * triUnitNormals[nt * 3 + 2];
              if (dot >= cosCrease) {
                snx += triAreaNormals[nt * 3];
                sny += triAreaNormals[nt * 3 + 1];
                snz += triAreaNormals[nt * 3 + 2];
              }
            }
            const sLen = Math.hypot(snx, sny, snz) || 1;
            const fnx = snx / sLen;
            const fny = sny / sLen;
            const fnz = snz / sLen;
            const nKey = `${Math.round(fnx * 1e4)},${Math.round(fny * 1e4)},${Math.round(fnz * 1e4)}`;
            let nIdx = normDedup.get(nKey);
            if (nIdx === undefined) {
              nIdx = normList.length;
              normList.push([fnx, fny, fnz]);
              normDedup.set(nKey, nIdx);
            }

            let tIdx = -1;
            if (emitUVs && triUVs) {
              const uVal = triUVs[c][0];
              const vVal = triUVs[c][1];
              const uvKey = `${Math.round(uVal * 1e5)},${Math.round(vVal * 1e5)}`;
              tIdx = uvDedup.get(uvKey);
              if (tIdx === undefined) {
                tIdx = uvList.length;
                uvList.push([uVal, vVal]);
                uvDedup.set(uvKey, tIdx);
              }
            }

            faceCornerRecords[t * 3 + c] = { v: vOffset + ci, vt: vtOffset + tIdx, vn: vnOffset + nIdx };
          }
        }

        for (const [uVal, vVal] of uvList) {
          objLines.push(`vt ${fmtNum(uVal)} ${fmtNum(vVal)}`);
        }
        for (const [fnx, fny, fnz] of normList) {
          objLines.push(`vn ${fmtNum(fnx)} ${fmtNum(fny)} ${fmtNum(fnz)}`);
        }

        if (material) {
          objLines.push(`usemtl ${material}`);
        }

        for (let t = 0; t < triCount; t++) {
          const r0 = faceCornerRecords[t * 3];
          const r1 = faceCornerRecords[t * 3 + 1];
          const r2 = faceCornerRecords[t * 3 + 2];
          if (emitUVs) {
            objLines.push(`f ${r0.v}/${r0.vt}/${r0.vn} ${r1.v}/${r1.vt}/${r1.vn} ${r2.v}/${r2.vt}/${r2.vn}`);
          } else {
            objLines.push(`f ${r0.v}//${r0.vn} ${r1.v}//${r1.vn} ${r2.v}//${r2.vn}`);
          }
        }

        vOffset += usedVerts.length;
        vtOffset += uvList.length;
        vnOffset += normList.length;
      }
    }
  }

  fs.writeFileSync(outObjPath, objLines.join('\n') + '\n', 'utf8');

  if (hasMtl) {
    const mtlLines = [`# Exported by Apex Miniature objToLowPoly.mjs`];
    for (const matName of usedMaterials) {
      const m = parsedMaterials.get(matName);
      const kd = m?.Kd ?? [0.75, 0.75, 0.75];
      mtlLines.push('');
      mtlLines.push(`newmtl ${matName}`);
      mtlLines.push(`Kd ${fmtNum(kd[0])} ${fmtNum(kd[1])} ${fmtNum(kd[2])}`);
      if (m?.Ks) mtlLines.push(`Ks ${fmtNum(m.Ks[0])} ${fmtNum(m.Ks[1])} ${fmtNum(m.Ks[2])}`);
      if (m?.Ns !== null && m?.Ns !== undefined) mtlLines.push(`Ns ${fmtNum(m.Ns)}`);
      if (m?.d !== null && m?.d !== undefined) mtlLines.push(`d ${fmtNum(m.d)}`);
    }
    fs.writeFileSync(outMtlPath, mtlLines.join('\n') + '\n', 'utf8');
  }

  return totalOutTris;
}

export function convertCarFile(inputPath, outputDir, opts = {}) {
  const fullOpts = {
    tris: DEFAULT_TRIS,
    ratio: null,
    weldEpsilon: DEFAULT_WELD_EPSILON,
    creaseAngle: DEFAULT_CREASE_ANGLE,
    maxError: null,
    flat: false,
    excludeGlass: false,
    scale: 1.0,
    targetLength: null,
    forward: null,
    normalize: true,
    legacy: false,
    ...opts,
  };

  const ext = path.extname(inputPath).toLowerCase();
  const parsed = ext === '.obj' ? parseObjFile(inputPath, fullOpts) : parseKn5File(inputPath, fullOpts);
  const { baseName, positions, texcoords, materials, keptGroups, totalInputTris } = parsed;
  const canonicalName = resolveCanonicalCarName(baseName);

  if (keptGroups.size === 0) {
    return {
      car: canonicalName,
      inTris: totalInputTris,
      outTris: 0,
      wheels: 0,
      lengthM: 0,
      status: 'SKIPPED (no kept geometry)',
    };
  }

  const { diag, targetLength } = normalizeCarTransform(parsed, canonicalName, fullOpts);

  // Build welded submeshes per (group, material)
  const submeshes = [];
  for (const [groupName, tris] of keptGroups.entries()) {
    if (tris.length === 0) continue;
    const byMat = new Map();
    for (const tri of tris) {
      let arr = byMat.get(tri.material);
      if (!arr) {
        arr = [];
        byMat.set(tri.material, arr);
      }
      arr.push(tri);
    }

    for (const [material, matTris] of byMat.entries()) {
      const welded = buildWeldedSubmesh(
        positions,
        texcoords,
        matTris,
        fullOpts.weldEpsilon,
        diag,
        fullOpts.legacy,
      );
      const inTris = welded.indices.length / 3;
      if (inTris === 0) continue;
      submeshes.push({
        groupName,
        material,
        welded,
        inTris,
      });
    }
  }

  if (submeshes.length === 0) {
    return {
      car: canonicalName,
      inTris: totalInputTris,
      outTris: 0,
      wheels: 0,
      lengthM: 0,
      status: 'SKIPPED (degenerate)',
    };
  }

  const totalKeptInTris = submeshes.reduce((s, m) => s + m.inTris, 0);
  const targetTotalTris =
    fullOpts.ratio !== null
      ? Math.max(1, Math.round(totalKeptInTris * fullOpts.ratio))
      : Math.min(totalKeptInTris, fullOpts.tris);

  const budgets = allocateBudgets(submeshes, targetTotalTris, fullOpts);

  const groupedOut = new Map();
  const wheelGroupsSeen = new Set();
  const wheelCornersSeen = new Set();
  let postMinY = Infinity;

  for (let i = 0; i < submeshes.length; i++) {
    const sm = submeshes[i];
    const simplifiedIndices = simplifySubmesh(sm.welded, budgets[i], fullOpts);
    if (simplifiedIndices.length < 3) continue;

    if (fullOpts.normalize) {
      for (let j = 0; j < simplifiedIndices.length; j++) {
        const vi = simplifiedIndices[j];
        const y = sm.welded.positions[vi * 3 + 1];
        if (y < postMinY) postMinY = y;
      }
    }

    let grp = groupedOut.get(sm.groupName);
    if (!grp) {
      grp = { name: sm.groupName, batches: [] };
      groupedOut.set(sm.groupName, grp);
    }
    grp.batches.push({
      material: sm.material,
      positions: sm.welded.positions,
      uvs: sm.welded.uvs,
      indices: simplifiedIndices,
    });

    const corner = classifyWheelCorner(sm.groupName);
    if (corner) {
      wheelGroupsSeen.add(sm.groupName);
      if (corner !== 'GENERIC') wheelCornersSeen.add(corner);
    }
  }

  // Snap simplified mesh so tire bottom rests cleanly at y = 0.0
  if (fullOpts.normalize && Number.isFinite(postMinY) && Math.abs(postMinY) > 1e-6) {
    const adjusted = new Set();
    for (const grp of groupedOut.values()) {
      for (const batch of grp.batches) {
        if (adjusted.has(batch.positions)) continue;
        adjusted.add(batch.positions);
        for (let k = 1; k < batch.positions.length; k += 3) {
          batch.positions[k] -= postMinY;
        }
      }
    }
  }

  const carOutDir = path.join(outputDir, canonicalName);
  fs.mkdirSync(carOutDir, { recursive: true });

  // Clean up any legacy flat files from earlier converter versions
  for (const legacyFile of [`${baseName}.obj`, `${baseName}.mtl`, `${canonicalName}.obj`, `${canonicalName}.mtl`]) {
    const legacyPath = path.join(outputDir, legacyFile);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      fs.unlinkSync(legacyPath);
    }
  }

  const outObjPath = path.join(carOutDir, `${canonicalName}.obj`);
  const outMtlPath = path.join(carOutDir, `${canonicalName}.mtl`);
  const outTris = writeObjAndMtl(
    outObjPath,
    outMtlPath,
    canonicalName,
    [...groupedOut.values()],
    materials,
    fullOpts,
  );

  const wheelCount = wheelCornersSeen.size > 0 ? wheelCornersSeen.size : wheelGroupsSeen.size;
  return {
    car: canonicalName,
    inTris: totalInputTris,
    outTris,
    wheels: wheelCount,
    lengthM: +targetLength.toFixed(2),
    status: fullOpts.legacy ? 'OK (legacy)' : 'OK',
  };
}

function printSummaryTable(rows) {
  const headers = {
    car: 'Car',
    inTris: 'In Tris',
    outTris: 'Out Tris',
    wheels: 'Wheels',
    lengthM: 'Len(m)',
    status: 'Status',
  };

  const formatted = rows.map((r) => ({
    car: r.car,
    inTris: r.inTris.toLocaleString('en-US'),
    outTris: r.outTris.toLocaleString('en-US'),
    wheels: String(r.wheels),
    lengthM: r.lengthM ? r.lengthM.toFixed(2) : '-',
    status: r.status,
  }));

  const widths = {
    car: Math.max(headers.car.length, ...formatted.map((r) => r.car.length)),
    inTris: Math.max(headers.inTris.length, ...formatted.map((r) => r.inTris.length)),
    outTris: Math.max(headers.outTris.length, ...formatted.map((r) => r.outTris.length)),
    wheels: Math.max(headers.wheels.length, ...formatted.map((r) => r.wheels.length)),
    lengthM: Math.max(headers.lengthM.length, ...formatted.map((r) => r.lengthM.length)),
    status: Math.max(headers.status.length, ...formatted.map((r) => r.status.length)),
  };

  const line = (r) =>
    `${r.car.padEnd(widths.car)}  ${r.inTris.padStart(widths.inTris)}  ${r.outTris.padStart(widths.outTris)}  ${r.wheels.padStart(widths.wheels)}  ${r.lengthM.padStart(widths.lengthM)}  ${r.status}`;

  console.log('');
  console.log(line(headers));
  console.log('-'.repeat(widths.car + widths.inTris + widths.outTris + widths.wheels + widths.lengthM + widths.status + 10));
  for (const r of formatted) {
    console.log(line(r));
  }
  console.log('');
}

function writeManifest(outputDir) {
  const dirs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cars = [];
  for (const dir of dirs) {
    const folderPath = path.join(outputDir, dir.name);
    const files = fs.readdirSync(folderPath);
    const preferredObj = `${dir.name}.obj`;
    const objFile = files.includes(preferredObj)
      ? preferredObj
      : files.find((f) => f.toLowerCase().endsWith('.obj'));
    if (!objFile) continue;

    const preferredMtl = `${dir.name}.mtl`;
    const matchingMtl = objFile.replace(/\.obj$/i, '.mtl');
    const mtlFile = files.includes(preferredMtl)
      ? preferredMtl
      : files.includes(matchingMtl)
        ? matchingMtl
        : (files.find((f) => f.toLowerCase().endsWith('.mtl')) ?? null);

    cars.push({
      id: dir.name.toLowerCase().replace(/_/g, '-'),
      folder: dir.name,
      obj: objFile,
      mtl: mtlFile,
    });
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ cars }, null, 2) + '\n', 'utf8');
  return manifestPath;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    printHelp();
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const inputDir = path.resolve(process.cwd(), opts.inputDir);
  const outputDir = path.resolve(process.cwd(), opts.outputDir);

  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = fs.readdirSync(inputDir, { withFileTypes: true });
  const carInputFiles = entries
    .filter((e) => e.isFile() && /\.(kn5|obj)$/i.test(e.name))
    .map((e) => path.join(inputDir, e.name))
    .filter((p) => {
      if (!opts.filter) return true;
      const base = path.basename(p, path.extname(p)).toLowerCase();
      return base.includes(opts.filter);
    })
    .sort((a, b) => a.localeCompare(b));

  if (carInputFiles.length === 0) {
    console.log(`No .kn5 or .obj files found in "${inputDir}".`);
    console.log(`Drop your Assetto Corsa .kn5 or raw .obj car files into:`);
    console.log(`  ${inputDir}`);
    console.log(`Then re-run: npm run convert:cars`);
    process.exit(0);
  }

  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) {
    console.error('Error: WebAssembly MeshoptSimplifier is not supported in this Node environment.');
    process.exit(1);
  }

  const results = [];
  for (const inputPath of carInputFiles) {
    try {
      results.push(convertCarFile(inputPath, outputDir, opts));
    } catch (err) {
      results.push({
        car: path.basename(inputPath, path.extname(inputPath)),
        inTris: 0,
        outTris: 0,
        wheels: 0,
        lengthM: 0,
        status: `ERROR: ${err.message}`,
      });
    }
  }

  writeManifest(outputDir);
  printSummaryTable(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
