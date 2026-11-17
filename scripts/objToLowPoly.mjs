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
import { MeshoptSimplifier } from 'meshoptimizer';

const DEFAULT_INPUT_DIR = 'models/raw-cars';
const DEFAULT_OUTPUT_DIR = 'models/lowpoly-cars';
const DEFAULT_TRIS = 12000;
const DEFAULT_WELD_EPSILON = 1e-4;
const DEFAULT_TARGET_LENGTH = 3.75; // Matches src/three/carBuilder.ts (~3.68-3.78m)

const STRIP_HELPER_RE =
  /(?:^|[_\-\s.])(COCKPIT|STEER|DRIVER|SHADOW|COLLIDER|BLUR|DAMAGE|LOD_?[BCD]|INT|CABIN|INTERIOR|SEAT|ROLLCAGE|DASH|ELECTRONICS|GAUGE|BUTTONS|PEDAL|HELMET|OCCLUSION)(?:$|[_\-\s.\d])/i;
const STRIP_MAT_RE =
  /(?:^|[_\-\s.])(INT|COCKPIT|STEER|SEAT|ROLLCAGE|DASH|ELECTRONICS|DISPLAY|GAUGE|BUTTONS|PEDAL|HELMET|OCCLUSION)(?:$|[_\-\s.\d])/i;
const GLASS_RE =
  /(?:^|[_\-\s.])(GLASS|WINDSHIELD|WINDSCREEN|WINDOW|WINDOWS|GLAZING|CANOPY_GLASS)(?:$|[_\-\s.\d])/i;
const AERO_WING_RE =
  /(?:^|[_\-\s.])(WING|REAR_WING|FRONT_WING|SPOILER|AERO)(?:$|[_\-\s.\d])/i;

function printHelp() {
  console.log(`
Apex Miniature — Batch .KN5 Car -> Low-Poly .OBJ Converter

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
  --weld-epsilon <eps>   Vertex weld tolerance before simplify (default: ${DEFAULT_WELD_EPSILON})
  --flat / --no-flat     Split vertices & compute flat face normals (default: false / smooth)
  --filter <pattern>     Convert only cars matching name pattern (e.g. --filter oreca)
  --exclude-glass        Strip glass/windshield/window nodes & materials
  --scale <factor>       Additional uniform scale multiplier (default: 1.0)
  --target-length <m>    Normalized car length along +Z in meters (default: ${DEFAULT_TARGET_LENGTH})
  --forward <axis>       Force input forward axis (+z, -z, +x, -x) before aligning to +Z
  --no-normalize         Skip auto-centering, ground alignment, axis & scale normalization
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
    flat: false,
    filter: null,
    excludeGlass: false,
    scale: 1.0,
    targetLength: DEFAULT_TARGET_LENGTH,
    forward: null,
    normalize: true,
    help: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
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
    } else if (arg === '--target-length' && i + 1 < argv.length) {
      opts.targetLength = Number(argv[++i]);
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
  if (!Number.isFinite(opts.scale) || opts.scale <= 0) {
    throw new Error('--scale must be > 0');
  }
  if (!Number.isFinite(opts.targetLength) || opts.targetLength <= 0) {
    throw new Error('--target-length must be > 0');
  }
  if (opts.forward && !['+z', '-z', '+x', '-x'].includes(opts.forward)) {
    throw new Error('--forward must be one of +z, -z, +x, -x');
  }

  return opts;
}

function classifyWheelCorner(name) {
  const n = name.toUpperCase();
  if (/WHEELHOUSE|WHEEL_HOUSE|WHEEL_ARCH/i.test(n)) return null;
  const isWheelPart =
    /(?:^|[_\-\s.])(WHEEL|RIM|TYRE|TIRE|DISC|HUB)(?:$|[_\-\s.\d])/i.test(n) ||
    /(WHEEL|RIM|TYRE|TIRE)/i.test(n);
  if (!isWheelPart) return null;

  if (/(?:^|[_\-\s.])(LF|FL|FRONT_LEFT|LEFT_FRONT)(?:$|[_\-\s.\d])/i.test(n)) return 'LF';
  if (/(?:^|[_\-\s.])(RF|FR|FRONT_RIGHT|RIGHT_FRONT)(?:$|[_\-\s.\d])/i.test(n)) return 'RF';
  if (/(?:^|[_\-\s.])(LR|RL|REAR_LEFT|LEFT_REAR)(?:$|[_\-\s.\d])/i.test(n)) return 'LR';
  if (/(?:^|[_\-\s.])(RR|REAR_RIGHT|RIGHT_REAR)(?:$|[_\-\s.\d])/i.test(n)) return 'RR';
  return 'GENERIC';
}

function isGlassName(name) {
  return Boolean(name && GLASS_RE.test(name));
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

function inferMaterialEntry(kn5Mat, textures) {
  const txDiffuseName =
    kn5Mat.texMaps.find((t) => t.sampler === 'txDiffuse')?.tName ?? kn5Mat.texMaps[0]?.tName ?? '';
  const texData = txDiffuseName ? textures.get(txDiffuseName) : null;
  let kd = sampleEmbeddedTextureColor(txDiffuseName, texData);

  const n = kn5Mat.name.toLowerCase();
  const ksDiff = Number.isFinite(kn5Mat.ksDiffuse) ? Math.max(0.05, Math.min(1, kn5Mat.ksDiffuse)) : 0.65;

  if (!kd) {
    if (/brake|tail|stop|red/.test(n)) kd = [0.82, 0.08, 0.08];
    else if (/turn|amber|indicator/.test(n)) kd = [0.92, 0.58, 0.06];
    else if (/glass|window|windshield/.test(n)) kd = [0.12, 0.16, 0.22];
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
  const entry = {
    name: safeName,
    Kd: kd,
    Ks: [0.25, 0.25, 0.25],
    Ns: 32,
    d: /glass|window|windshield/.test(n) && !/lamp|light|brake/.test(n) ? 0.45 : null,
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

function parseKn5File(kn5Path, excludeGlass) {
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
    off += 1; // blendMode
    off += 1; // alphaTested
    off += 4; // depthMode

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

    const kn5Mat = { name, shaderName, ksDiffuse, texMaps };
    kn5Materials.push(kn5Mat);
    const mtlEntry = inferMaterialEntry(kn5Mat, textures);
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

    const flipWinding = mat4Det3(worldMat) < 0;
    for (let i = 0; i < meshIndices.length; i += 3) {
      const i0 = meshIndices[i];
      const i1 = flipWinding ? meshIndices[i + 2] : meshIndices[i + 1];
      const i2 = flipWinding ? meshIndices[i + 1] : meshIndices[i + 2];
      if (i0 === i1 || i1 === i2 || i2 === i0) continue;

      list.push({
        v0: baseV + i0,
        v1: baseV + i1,
        v2: baseV + i2,
        vt0: baseVT + i0,
        vt1: baseVT + i1,
        vt2: baseVT + i2,
        material: matName,
      });
    }
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

    const wheelCorner = classifyWheelCorner(name);
    const curWheel =
      inheritedWheel ??
      (wheelCorner && wheelCorner !== 'GENERIC' ? `WHEEL_${wheelCorner}` : wheelCorner === 'GENERIC' ? name : null);
    const curWing = inheritedWing || (!curWheel && isAeroWingName(name));
    const curGlass = inheritedGlass || isGlassName(name);

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
      off += 1; // isTransparent

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
      const isGlass = curGlass || isGlassName(matName);
      const isMatStripped = STRIP_MAT_RE.test(matName);

      if (
        !shouldStrip &&
        !isMatStripped &&
        isVisible !== 0 &&
        isRenderable !== 0 &&
        triCount > 0 &&
        !(excludeGlass && isGlass)
      ) {
        const groupName = curWheel ? curWheel : curWing ? 'AERO_WING' : isGlass ? 'GLASS' : 'BODY';
        addMeshTriangles(groupName, matName, meshVerts, meshUVs, meshIndices, currentMat);
      }
    } else if (nodeClass === 3) {
      off += 1; // castShadows
      const isVisible = buf.readUInt8(off);
      off += 1;
      off += 1; // isTransparent

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
      const isGlass = curGlass || isGlassName(matName);
      const isMatStripped = STRIP_MAT_RE.test(matName);

      if (
        !shouldStrip &&
        !isMatStripped &&
        isVisible !== 0 &&
        triCount > 0 &&
        !(excludeGlass && isGlass)
      ) {
        const groupName = curWheel ? curWheel : curWing ? 'AERO_WING' : isGlass ? 'GLASS' : 'BODY';
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

function normalizeCarTransform(parsed, opts) {
  const { positions, keptGroups } = parsed;
  if (keptGroups.size === 0) return;

  const initialBounds = computeUsedVertexBounds(positions, keptGroups);
  if (initialBounds.count === 0) return;

  if (!opts.normalize) {
    if (opts.scale !== 1.0) {
      for (let i = 0; i < positions.length; i++) {
        positions[i] *= opts.scale;
      }
    }
    return;
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

  // 3. Scale uniformly to match carBuilder.ts length (~3.75m along Z) * user --scale
  const rotBounds = computeUsedVertexBounds(positions, keptGroups);
  const currentLength = Math.max(1e-6, rotBounds.sizeZ);
  const scaleFactor = (opts.targetLength / currentLength) * opts.scale;
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
}

/**
 * Welds co-located vertices within `epsilon` for a triangle batch and builds
 * compact typed buffers ready for MeshoptSimplifier.simplify.
 */
function buildWeldedSubmesh(positions, texcoords, tris, weldEpsilon) {
  const eps = Math.max(1e-8, weldEpsilon);
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

    if (weldEpsilon > 0) {
      const gx = Math.round(x * invEps);
      const gy = Math.round(y * invEps);
      const gz = Math.round(z * invEps);
      const epsSq = weldEpsilon * weldEpsilon;

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

function simplifySubmesh(submesh, targetTris) {
  if (targetTris <= 0) return new Uint32Array(0);
  const inTris = submesh.indices.length / 3;
  if (inTris === 0 || targetTris >= inTris) {
    return filterDegenerateTris(submesh.indices, submesh.positions);
  }

  const clampedTargetTris = Math.max(1, targetTris);
  const targetIndexCount = clampedTargetTris * 3;

  // Progressive simplification capped at 0.08m (8cm) max geometric error.
  // Using LockBorder preserves exterior silhouettes, wheel roundness, and boundary edges.
  let bestIndices = submesh.indices;
  for (const targetError of [0.01, 0.02, 0.03, 0.05, 0.08]) {
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

function allocateBudgets(submeshes, totalTargetTris) {
  const totalInTris = submeshes.reduce((s, m) => s + m.inTris, 0);
  if (totalInTris === 0) return submeshes.map(() => 0);
  if (totalTargetTris >= totalInTris) return submeshes.map((m) => m.inTris);

  const targets = submeshes.map((m) => {
    const prop = Math.round((m.inTris / totalInTris) * totalTargetTris);
    const g = (m.groupName || '').toUpperCase();
    const mat = (m.material || '').toUpperCase();

    let floor = 0;
    if (g.startsWith('WHEEL_')) {
      if (mat.includes('TYRE') || mat.includes('TIRE')) {
        floor = Math.min(m.inTris, Math.max(180, Math.floor(totalTargetTris * 0.02)));
      } else if (mat.includes('RIM') || mat.includes('WHEEL')) {
        floor = Math.min(m.inTris, Math.max(180, Math.floor(totalTargetTris * 0.02)));
      } else {
        floor = Math.min(m.inTris, Math.max(40, Math.floor(totalTargetTris * 0.005)));
      }
    } else if (g === 'BODY') {
      if (mat.includes('CARPAINT') || mat.includes('BODY') || mat.includes('CHASSIS') || mat.includes('SKIN')) {
        floor = Math.min(m.inTris, Math.max(1800, Math.floor(totalTargetTris * 0.35)));
      } else {
        floor = Math.min(m.inTris, Math.max(30, Math.floor(totalTargetTris * 0.005)));
      }
    } else if (g === 'AERO_WING') {
      floor = Math.min(m.inTris, Math.max(80, Math.floor(totalTargetTris * 0.015)));
    } else if (g === 'GLASS') {
      floor = Math.min(m.inTris, Math.max(80, Math.floor(totalTargetTris * 0.015)));
    }

    return Math.min(m.inTris, Math.max(floor, prop));
  });

  // Adjust delta on largest submeshes to match totalTargetTris closely
  let diff = targets.reduce((s, v) => s + v, 0) - totalTargetTris;
  const order = submeshes
    .map((m, idx) => ({ idx, inTris: m.inTris, groupName: m.groupName, material: m.material }))
    .sort((a, b) => b.inTris - a.inTris);

  let guard = 0;
  while (diff !== 0 && guard++ < 20000) {
    let changed = false;
    for (const item of order) {
      if (diff === 0) break;
      const idx = item.idx;
      const isTyreOrRim = item.groupName.startsWith('WHEEL_') && /(TYRE|TIRE|RIM)/i.test(item.material);
      const minFloor = isTyreOrRim ? 150 : 20;
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

function writeObjAndMtl(outObjPath, outMtlPath, carName, groupOutputs, parsedMaterials, flat) {
  const usedMaterials = new Set();
  for (const grp of groupOutputs) {
    for (const batch of grp.batches) {
      if (batch.material) usedMaterials.add(batch.material);
    }
  }

  const hasMtl = usedMaterials.size > 0;
  const objLines = [
    `# Exported by Apex Miniature objToLowPoly.mjs (.kn5 -> low-poly .obj)`,
    `# Car: ${carName}`,
    `# Coordinate convention: +Z forward, +Y up, y=0 ground plane`,
  ];
  if (hasMtl) {
    objLines.push(`mtllib ${path.basename(outMtlPath)}`);
  }

  let vOffset = 1;
  let vtOffset = 1;
  let vnOffset = 1;
  let totalOutTris = 0;

  for (const grp of groupOutputs) {
    const grpHasTris = grp.batches.some((b) => b.indices.length >= 3);
    if (!grpHasTris) continue;

    objLines.push(`o ${grp.name}`);

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

          if (uvs) {
            objLines.push(`vt ${fmtNum(uvs[i0 * 2])} ${fmtNum(uvs[i0 * 2 + 1])}`);
            objLines.push(`vt ${fmtNum(uvs[i1 * 2])} ${fmtNum(uvs[i1 * 2 + 1])}`);
            objLines.push(`vt ${fmtNum(uvs[i2 * 2])} ${fmtNum(uvs[i2 * 2 + 1])}`);
          }

          objLines.push(`vn ${fmtNum(nx)} ${fmtNum(ny)} ${fmtNum(nz)}`);
        }

        if (material) {
          objLines.push(`usemtl ${material}`);
        }

        for (let t = 0; t < triCount; t++) {
          const v0 = vOffset + t * 3;
          const v1 = v0 + 1;
          const v2 = v0 + 2;
          const vn = vnOffset + t;
          if (uvs) {
            const vt0 = vtOffset + t * 3;
            const vt1 = vt0 + 1;
            const vt2 = vt0 + 2;
            objLines.push(`f ${v0}/${vt0}/${vn} ${v1}/${vt1}/${vn} ${v2}/${vt2}/${vn}`);
          } else {
            objLines.push(`f ${v0}//${vn} ${v1}//${vn} ${v2}//${vn}`);
          }
        }

        vOffset += triCount * 3;
        if (uvs) vtOffset += triCount * 3;
        vnOffset += triCount;
      } else {
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

function convertCarFile(kn5Path, outputDir, opts) {
  const parsed = parseKn5File(kn5Path, opts.excludeGlass);
  const { baseName, positions, texcoords, materials, keptGroups, totalInputTris } = parsed;

  if (keptGroups.size === 0) {
    return {
      car: baseName,
      inTris: totalInputTris,
      outTris: 0,
      wheels: 0,
      status: 'SKIPPED (no kept geometry)',
    };
  }

  normalizeCarTransform(parsed, opts);

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
      const welded = buildWeldedSubmesh(positions, texcoords, matTris, opts.weldEpsilon);
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
      car: baseName,
      inTris: totalInputTris,
      outTris: 0,
      wheels: 0,
      status: 'SKIPPED (degenerate)',
    };
  }

  const totalKeptInTris = submeshes.reduce((s, m) => s + m.inTris, 0);
  const targetTotalTris =
    opts.ratio !== null
      ? Math.max(1, Math.round(totalKeptInTris * opts.ratio))
      : Math.min(totalKeptInTris, opts.tris);

  const budgets = allocateBudgets(submeshes, targetTotalTris);

  const groupedOut = new Map();
  const wheelGroupsSeen = new Set();
  const wheelCornersSeen = new Set();
  let postMinY = Infinity;

  for (let i = 0; i < submeshes.length; i++) {
    const sm = submeshes[i];
    const simplifiedIndices = simplifySubmesh(sm.welded, budgets[i]);
    if (simplifiedIndices.length < 3) continue;

    if (opts.normalize) {
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
  if (opts.normalize && Number.isFinite(postMinY) && Math.abs(postMinY) > 1e-6) {
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

  const carOutDir = path.join(outputDir, baseName);
  fs.mkdirSync(carOutDir, { recursive: true });

  // Clean up any legacy flat files from earlier converter versions
  for (const legacyFile of [`${baseName}.obj`, `${baseName}.mtl`]) {
    const legacyPath = path.join(outputDir, legacyFile);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      fs.unlinkSync(legacyPath);
    }
  }

  const outObjPath = path.join(carOutDir, `${baseName}.obj`);
  const outMtlPath = path.join(carOutDir, `${baseName}.mtl`);
  const outTris = writeObjAndMtl(
    outObjPath,
    outMtlPath,
    baseName,
    [...groupedOut.values()],
    materials,
    opts.flat,
  );

  const wheelCount = wheelCornersSeen.size > 0 ? wheelCornersSeen.size : wheelGroupsSeen.size;
  return {
    car: baseName,
    inTris: totalInputTris,
    outTris,
    wheels: wheelCount,
    status: 'OK',
  };
}

function printSummaryTable(rows) {
  const headers = {
    car: 'Car',
    inTris: 'In Tris',
    outTris: 'Out Tris',
    wheels: 'Wheels',
    status: 'Status',
  };

  const formatted = rows.map((r) => ({
    car: r.car,
    inTris: r.inTris.toLocaleString('en-US'),
    outTris: r.outTris.toLocaleString('en-US'),
    wheels: String(r.wheels),
    status: r.status,
  }));

  const widths = {
    car: Math.max(headers.car.length, ...formatted.map((r) => r.car.length)),
    inTris: Math.max(headers.inTris.length, ...formatted.map((r) => r.inTris.length)),
    outTris: Math.max(headers.outTris.length, ...formatted.map((r) => r.outTris.length)),
    wheels: Math.max(headers.wheels.length, ...formatted.map((r) => r.wheels.length)),
    status: Math.max(headers.status.length, ...formatted.map((r) => r.status.length)),
  };

  const line = (r) =>
    `${r.car.padEnd(widths.car)}  ${r.inTris.padStart(widths.inTris)}  ${r.outTris.padStart(widths.outTris)}  ${r.wheels.padStart(widths.wheels)}  ${r.status}`;

  console.log('');
  console.log(line(headers));
  console.log('-'.repeat(widths.car + widths.inTris + widths.outTris + widths.wheels + widths.status + 8));
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
  const kn5Files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.kn5'))
    .map((e) => path.join(inputDir, e.name))
    .filter((p) => {
      if (!opts.filter) return true;
      const base = path.basename(p, path.extname(p)).toLowerCase();
      return base.includes(opts.filter);
    })
    .sort((a, b) => a.localeCompare(b));

  if (kn5Files.length === 0) {
    console.log(`No .kn5 files found in "${inputDir}".`);
    console.log(`Drop your Assetto Corsa .kn5 car files into:`);
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
  for (const kn5Path of kn5Files) {
    try {
      results.push(convertCarFile(kn5Path, outputDir, opts));
    } catch (err) {
      results.push({
        car: path.basename(kn5Path, path.extname(kn5Path)),
        inTris: 0,
        outTris: 0,
        wheels: 0,
        status: `ERROR: ${err.message}`,
      });
    }
  }

  writeManifest(outputDir);
  printSummaryTable(results);
}

main();
