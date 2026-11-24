import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CarSpec, HeadlightTint, LiveryConfig, RimFinish } from '../game/types';
import {
  applySixZoneCarUVs,
  buildDiecastCar,
  BuiltCarRig,
  computeRigHoodMount,
  createCarGlassMaterial,
  getRealWorldCarLength,
} from './carBuilder';
import {
  createContactShadowTexture,
  createLiveryTexture,
  createNumberPlateTexture,
} from './proceduralTextures';

export interface LowPolyCarManifestEntry {
  id: string;
  folder: string;
  obj: string | null;
  mtl: string | null;
  glb?: string | null;
}

interface LowPolyCarManifest {
  cars: LowPolyCarManifestEntry[];
}

export interface AssetLoadProgress {
  active: boolean;
  phase: 'idle' | 'manifest' | 'downloading' | 'compiling' | 'done';
  completed: number;
  total: number;
  percent: number;
  currentAsset: string | null;
}

type AssetProgressListener = (progress: AssetLoadProgress) => void;

let assetLoadState: AssetLoadProgress = {
  active: false,
  phase: 'idle',
  completed: 0,
  total: 0,
  percent: 0,
  currentAsset: null,
};

const assetProgressListeners = new Set<AssetProgressListener>();
let preloadBatchDepth = 0;

function emitAssetLoadProgress(patch: Partial<AssetLoadProgress>): void {
  assetLoadState = {
    ...assetLoadState,
    ...patch,
  };
  const snapshot: AssetLoadProgress = { ...assetLoadState };
  for (const listener of assetProgressListeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore UI listener errors so asset loading never aborts
    }
  }
}

export function getAssetLoadProgress(): AssetLoadProgress {
  return { ...assetLoadState };
}

export function subscribeAssetLoadProgress(listener: AssetProgressListener): () => void {
  assetProgressListeners.add(listener);
  try {
    listener({ ...assetLoadState });
  } catch {
    // Ignore UI listener errors
  }
  return () => {
    assetProgressListeners.delete(listener);
  };
}

let customDracoDecoderPath: string | null = null;

export function setDracoDecoderPath(decoderPath: string): void {
  customDracoDecoderPath = decoderPath;
  gltfLoaderPromise = null;
}

function getBaseUrl(): string {
  return (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');
}

function getModelsBaseUrl(): string {
  return `${getBaseUrl()}models/lowpoly-cars/`;
}

function normalizeCarKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let manifestPromise: Promise<Map<string, LowPolyCarManifestEntry>> | null = null;

async function fetchManifestMap(): Promise<Map<string, LowPolyCarManifestEntry>> {
  const map = new Map<string, LowPolyCarManifestEntry>();
  try {
    const res = await fetch(`${getModelsBaseUrl()}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return map;
    const data = (await res.json()) as Partial<LowPolyCarManifest>;
    const entries = Array.isArray(data?.cars) ? data.cars : [];
    for (const entry of entries) {
      if (!entry || typeof entry.folder !== 'string') continue;
      if (typeof entry.obj !== 'string' && typeof entry.glb !== 'string') continue;
      if (entry.id) {
        map.set(normalizeCarKey(entry.id), entry);
      }
      map.set(normalizeCarKey(entry.folder), entry);
      const withoutKs = entry.folder.replace(/^ks_/i, '');
      const strippedKey = normalizeCarKey(withoutKs);
      if (!map.has(strippedKey)) {
        map.set(strippedKey, entry);
      }
    }
  } catch {
    // Manifest absent or offline -> fall back to procedural builder cleanly
  }
  return map;
}

export function getLowPolyManifestMap(): Promise<Map<string, LowPolyCarManifestEntry>> {
  if (!manifestPromise) {
    manifestPromise = fetchManifestMap();
  }
  return manifestPromise;
}

export function clearLowPolyModelCache(): void {
  manifestPromise = null;
  templateCache.clear();
  gltfLoaderPromise = null;
}

export async function findLowPolyModelForCar(carId: string): Promise<LowPolyCarManifestEntry | null> {
  const map = await getLowPolyManifestMap();
  const key = normalizeCarKey(carId);
  const direct = map.get(key);
  if (direct) return direct;

  // Single-model class fallback aliases
  if (
    key.includes('oreca') ||
    key === 'lmp2' ||
    key.includes('ligier') ||
    key.includes('united') ||
    key.includes('europol') ||
    key.includes('aoracing') ||
    key.includes('spike') ||
    key.includes('afcorse') ||
    key.includes('coolracing') ||
    key.includes('algarve')
  ) {
    return (
      map.get('oreca07') ??
      map.get('oreca07united') ??
      map.get('oreca07ao') ??
      map.get('oreca07europol') ??
      null
    );
  }
  if (key.startsWith('f126') || key === 'f12026') {
    return map.get('f126mercedes') ?? null;
  }
  if (key.startsWith('f121') || key === 'f12021') {
    return map.get('f121mercedes') ?? null;
  }
  return null;
}

const templateCache = new Map<string, Promise<THREE.Group>>();
let gltfLoaderPromise: Promise<GLTFLoader> | null = null;

function getConfiguredGltfLoader(): Promise<GLTFLoader> {
  if (gltfLoaderPromise) return gltfLoaderPromise;
  gltfLoaderPromise = (async () => {
    const loader = new GLTFLoader();
    try {
      await MeshoptDecoder.ready;
      if (MeshoptDecoder.supported) {
        loader.setMeshoptDecoder(MeshoptDecoder);
      }
    } catch {
      // Non-fatal: uncompressed GLBs or OBJ fallback will still work
    }
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(customDracoDecoderPath ?? `${getBaseUrl()}draco/`);
      loader.setDRACOLoader(dracoLoader);
    } catch {
      // Non-fatal in headless / offline environments without Draco WASM
    }
    return loader;
  })();
  return gltfLoaderPromise;
}

async function readResponseBytesWithProgress(
  res: Response,
  onFraction?: (fraction: number) => void,
): Promise<Uint8Array> {
  const totalHeader = Number(res.headers?.get?.('content-length') || 0);
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader || !Number.isFinite(totalHeader) || totalHeader <= 0 || !onFraction) {
    const ab = await res.arrayBuffer();
    if (onFraction) onFraction(1);
    return new Uint8Array(ab);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReported = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      chunks.push(value);
      received += value.byteLength;
      const frac = Math.min(0.98, received / totalHeader);
      if (frac - lastReported >= 0.04) {
        lastReported = frac;
        onFraction(frac);
      }
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onFraction(1);
  return merged;
}

async function loadGlbTemplate(
  entry: LowPolyCarManifestEntry,
  onFraction?: (fraction: number) => void,
): Promise<THREE.Group> {
  if (!entry.glb) {
    throw new Error(`No GLB entry for "${entry.folder}"`);
  }
  const cacheKey = `glb:${entry.folder}/${entry.glb}`;
  const cached = templateCache.get(cacheKey);
  if (cached) {
    if (onFraction) {
      void cached.then(() => onFraction(1)).catch(() => undefined);
    }
    return cached;
  }

  const loaderPromise = (async () => {
    const folderUrl = `${getModelsBaseUrl()}${encodeURIComponent(entry.folder)}/`;
    const glbUrl = `${folderUrl}${encodeURIComponent(entry.glb!)}`;
    const res = await fetch(glbUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch GLB "${entry.glb}" (${res.status})`);
    }
    const bytes = await readResponseBytesWithProgress(res, onFraction);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const loader = await getConfiguredGltfLoader();
    const gltf = await loader.parseAsync(buffer, folderUrl);
    const sceneGroup = gltf.scene || new THREE.Group();
    const isV2 = Boolean(
      sceneGroup.userData?.apexPipelineV2 ??
        gltf.userData?.apexPipelineV2 ??
        gltf.asset?.extras?.apexPipelineV2,
    );
    sceneGroup.userData.apexPipelineV2 = isV2;
    return sceneGroup;
  })().catch((err) => {
    templateCache.delete(cacheKey);
    throw err;
  });

  templateCache.set(cacheKey, loaderPromise);
  return loaderPromise;
}

async function loadObjTemplate(
  entry: LowPolyCarManifestEntry,
  onFraction?: (fraction: number) => void,
): Promise<THREE.Group> {
  if (!entry.obj) {
    throw new Error(`No OBJ entry for "${entry.folder}"`);
  }
  const cacheKey = `obj:${entry.folder}/${entry.obj}`;
  const cached = templateCache.get(cacheKey);
  if (cached) {
    if (onFraction) {
      void cached.then(() => onFraction(1)).catch(() => undefined);
    }
    return cached;
  }

  const loaderPromise = (async () => {
    const folderUrl = `${getModelsBaseUrl()}${encodeURIComponent(entry.folder)}/`;
    const objRes = await fetch(`${folderUrl}${encodeURIComponent(entry.obj!)}`);
    if (!objRes.ok) {
      throw new Error(`Failed to fetch OBJ "${entry.obj}" (${objRes.status})`);
    }
    const objBytes = await readResponseBytesWithProgress(objRes, onFraction);
    const objText = new TextDecoder('utf-8').decode(objBytes);

    let materialsCreator: MTLLoader.MaterialCreator | null = null;
    if (entry.mtl) {
      try {
        const mtlRes = await fetch(`${folderUrl}${encodeURIComponent(entry.mtl)}`);
        if (mtlRes.ok) {
          const mtlText = await mtlRes.text();
          const mtlLoader = new MTLLoader();
          mtlLoader.setResourcePath(folderUrl);
          materialsCreator = mtlLoader.parse(mtlText, folderUrl);
          materialsCreator.preload();
        }
      } catch {
        // Ignore missing MTL; OBJ will use fallback PBR materials
      }
    }

    const objLoader = new OBJLoader();
    if (materialsCreator) {
      objLoader.setMaterials(materialsCreator);
    }
    const parsed = objLoader.parse(objText);
    parsed.userData.apexPipelineV2 = /^#\s*Apex-Pipeline:\s*v2\b/m.test(objText);
    return parsed;
  })().catch((err) => {
    templateCache.delete(cacheKey);
    throw err;
  });

  templateCache.set(cacheKey, loaderPromise);
  return loaderPromise;
}

async function loadModelTemplate(
  entry: LowPolyCarManifestEntry,
  onFraction?: (fraction: number) => void,
): Promise<THREE.Group> {
  if (entry.glb) {
    try {
      return await loadGlbTemplate(entry, onFraction);
    } catch (glbErr) {
      if (!entry.obj) throw glbErr;
      console.warn(`[objCarLoader] GLB load failed for "${entry.folder}", falling back to OBJ:`, glbErr);
    }
  }
  return loadObjTemplate(entry, onFraction);
}

function resolveRimFinish(finish: RimFinish, primaryColor: string): { color: string; metalness: number; roughness: number } {
  switch (finish) {
    case 'silver':
      return { color: '#d4d8df', metalness: 0.88, roughness: 0.22 };
    case 'gold-bronze':
      return { color: '#c89b3c', metalness: 0.85, roughness: 0.24 };
    case 'white':
      return { color: '#f1f5f9', metalness: 0.25, roughness: 0.28 };
    case 'body-matched':
      return { color: primaryColor, metalness: 0.55, roughness: 0.24 };
    case 'gloss-black':
    default:
      return { color: '#14171c', metalness: 0.45, roughness: 0.24 };
  }
}

function resolveHeadlightHex(tint: HeadlightTint): number {
  switch (tint) {
    case 'endurance-yellow':
      return 0xfacc15;
    case 'ice-blue':
      return 0x38bdf8;
    case 'crystal-white':
    default:
      return 0xf8fafc;
  }
}

function isNeutralColor(color: THREE.Color): boolean {
  const maxC = Math.max(color.r, color.g, color.b);
  const minC = Math.min(color.r, color.g, color.b);
  return maxC - minC < 0.12;
}

interface MaterialConversionContext {
  carSpec: CarSpec;
  livery: LiveryConfig;
  maxAniso: number;
  isV2Pipeline: boolean;
  getProceduralLiveryTexture: () => THREE.Texture;
  track: <T extends { dispose: () => void }>(res: T) => T;
  headlightMats: THREE.MeshStandardMaterial[];
  brakeLightMats: THREE.MeshStandardMaterial[];
  materialCache: Map<string, THREE.Material>;
}

const GLASS_OBJ_OR_MAT_RE =
  /glass|windshield|windscreen|window|glazing|canopy|visor|cockpit_glass|headlight_glass|lens|lcover/i;
const NON_WHEEL_SUBMAT_RE =
  /led|glow|lamp|light|caliper|body|car_?paint|skin|livery|mirror|seat|interior/i;

function sanitizeBufferGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count === 0) return geo;

  const posArr = posAttr.array as Float32Array;
  let hadNonFinite = false;
  for (let i = 0; i < posArr.length; i++) {
    if (!Number.isFinite(posArr[i])) {
      posArr[i] = 0;
      hadNonFinite = true;
    }
  }
  if (hadNonFinite) posAttr.needsUpdate = true;

  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (uvAttr) {
    const uvArr = uvAttr.array as Float32Array;
    let uvFixed = false;
    for (let i = 0; i < uvArr.length; i++) {
      if (!Number.isFinite(uvArr[i])) {
        uvArr[i] = 0;
        uvFixed = true;
      }
    }
    if (uvFixed) uvAttr.needsUpdate = true;
  }

  let normAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  let recomputeNorms = !normAttr || normAttr.count !== posAttr.count;
  if (normAttr && !recomputeNorms) {
    const nArr = normAttr.array as Float32Array;
    for (let i = 0; i < nArr.length; i++) {
      if (!Number.isFinite(nArr[i])) {
        recomputeNorms = true;
        break;
      }
    }
  }
  if (recomputeNorms) {
    geo.computeVertexNormals();
    normAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  }

  // Repair zero-length or globally inverted vertex normals so DoubleSide shading is never inside-out
  if (normAttr && posAttr.count >= 3) {
    const nArr = normAttr.array as Float32Array;
    const idxAttr = geo.getIndex();
    const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
    let areaWeightedDot = 0;
    let totalArea2 = 0;
    let normalsModified = false;

    for (let t = 0; t < triCount; t++) {
      const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

      const ax = posArr[i0 * 3], ay = posArr[i0 * 3 + 1], az = posArr[i0 * 3 + 2];
      const bx = posArr[i1 * 3], by = posArr[i1 * 3 + 1], bz = posArr[i1 * 3 + 2];
      const cx = posArr[i2 * 3], cy = posArr[i2 * 3 + 1], cz = posArr[i2 * 3 + 2];

      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      const area2 = Math.hypot(fnx, fny, fnz);
      if (area2 < 1e-10) continue;

      const unx = fnx / area2;
      const uny = fny / area2;
      const unz = fnz / area2;

      for (const vi of [i0, i1, i2]) {
        const o = vi * 3;
        const vx = nArr[o], vy = nArr[o + 1], vz = nArr[o + 2];
        const vLen = Math.hypot(vx, vy, vz);
        if (vLen < 1e-4) {
          nArr[o] = unx;
          nArr[o + 1] = uny;
          nArr[o + 2] = unz;
          normalsModified = true;
          areaWeightedDot += area2;
        } else {
          areaWeightedDot += ((vx * fnx + vy * fny + vz * fnz) / vLen);
        }
        totalArea2 += area2;
      }
    }

    if (totalArea2 > 1e-8 && areaWeightedDot < -0.25 * totalArea2) {
      for (let i = 0; i < nArr.length; i++) {
        nArr[i] = -nArr[i];
      }
      normalsModified = true;
    }

    if (normalsModified) {
      normAttr.needsUpdate = true;
    }
  }
  return geo;
}

function hasOutOfBoundsUVs(geo: THREE.BufferGeometry): boolean {
  const uvAttr = geo.getAttribute('uv');
  if (!uvAttr || uvAttr.count === 0) return true;
  const sampleStep = Math.max(1, Math.floor(uvAttr.count / 256));
  for (let i = 0; i < uvAttr.count; i += sampleStep) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) {
      return true;
    }
  }
  return false;
}

function extractMaterialSubGeometry(
  sourceGeo: THREE.BufferGeometry,
  keepGroupIndices: number[],
  srcMats: THREE.Material[],
): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] } | null {
  if (keepGroupIndices.length === 0) return null;
  const posAttr = sourceGeo.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = sourceGeo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uvAttr = sourceGeo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const idxAttr = sourceGeo.getIndex();

  const outPos: number[] = [];
  const outNorm: number[] = [];
  const outUV: number[] = [];
  const outGeo = new THREE.BufferGeometry();
  const outMats: THREE.Material[] = [];
  let cursor = 0;

  for (const gi of keepGroupIndices) {
    const g = sourceGeo.groups[gi];
    const start = g.start;
    const end = g.start + g.count;
    const matIdx = outMats.length;
    outMats.push(srcMats[g.materialIndex ?? 0] ?? srcMats[0]);
    for (let k = start; k < end; k++) {
      const vi = idxAttr ? idxAttr.getX(k) : k;
      outPos.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
      if (normAttr) outNorm.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
      if (uvAttr) outUV.push(uvAttr.getX(vi), uvAttr.getY(vi));
    }
    outGeo.addGroup(cursor, g.count, matIdx);
    cursor += g.count;
  }

  outGeo.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  if (outNorm.length === outPos.length) {
    outGeo.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3));
  } else {
    outGeo.computeVertexNormals();
  }
  if (outUV.length > 0) {
    outGeo.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2));
  }
  return { geo: outGeo, mat: outMats.length === 1 ? outMats[0] : outMats };
}

function convertSourceMaterial(
  srcMat: THREE.Material | undefined,
  meshName: string,
  isWheelMesh: boolean,
  ctx: MaterialConversionContext,
): THREE.Material {
  const matName = srcMat?.name || 'default';
  const cacheKey = `${isWheelMesh ? 'W' : 'B'}:${meshName === 'GLASS' ? 'G' : 'S'}:${matName}`;
  const existing = ctx.materialCache.get(cacheKey);
  if (existing) return existing;

  const phong = srcMat as THREE.MeshPhongMaterial | undefined;
  const srcColor = phong?.color ? phong.color.clone() : new THREE.Color(0xcbd5e1);
  const srcOpacity = typeof srcMat?.opacity === 'number' ? srcMat.opacity : 1.0;
  const lowerMat = matName.toLowerCase();
  const isGlassObject = GLASS_OBJ_OR_MAT_RE.test(meshName);
  const isTransparentGlassMat =
    !isWheelMesh &&
    (GLASS_OBJ_OR_MAT_RE.test(lowerMat) ||
      isGlassObject ||
      ((srcOpacity < 0.95 || srcMat?.transparent === true) &&
        !/badge|logo|decal|sticker|plate|number|grill|mesh|net|shadow|brake|tail|turn|indicator|carbon|seat|belt|tire|tyre|rim/i.test(
          lowerMat,
        )));

  let built: THREE.Material;

  const isAcuraNsxPaint =
    ctx.carSpec.id === 'acura-nsx-gt3' &&
    (lowerMat === 'material_#968' || lowerMat === 'material_#907' || lowerMat === 'material_#906');
  const isPrimaryBodyPaint =
    isAcuraNsxPaint ||
    (!/interior|cockpit|under|bottom|shadow|glass|window|grill|carbon|plastic|rubber|tyre|tire|rim|wheel|brake|disc|caliper/i.test(
      lowerMat,
    ) &&
      /(?:car_?paint|body_?paint|chassis_?paint|^paint|_paint(?:$|_)|ext_chassis|_ext_carpaint|ext_body|^body$|^chassis$|^chasis$|car_chassis|skin\d*|livery|wccarbody|carbody|wc_team_body1|_body$|^body_lowshine$|^exterior$|carrosserie)/i.test(
        lowerMat,
      ));

  if (/lights?_?glass_?rear|taillight|brake_?light|rear_?light|redlight|_tlight$/i.test(lowerMat)) {
    const mat = new THREE.MeshStandardMaterial({
      name: matName,
      color: 0xef4444,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.9,
      roughness: 0.22,
      metalness: 0.1,
    });
    ctx.brakeLightMats.push(mat);
    built = mat;
  } else if (
    /headlight|lights?_?projector|lights?_?glass(?:_int|_pattern)?$|front_?light|drl/i.test(lowerMat) &&
    !/rear|turn|reverse|plate/i.test(lowerMat)
  ) {
    const hlHex = resolveHeadlightHex(ctx.livery.headlightTint);
    const mat = new THREE.MeshStandardMaterial({
      name: matName,
      color: hlHex,
      emissive: new THREE.Color(hlHex),
      emissiveIntensity: 1.4,
      roughness: 0.16,
      metalness: 0.08,
      transparent: srcOpacity < 0.99,
      opacity: srcOpacity < 0.99 ? Math.max(0.7, srcOpacity) : 1.0,
    });
    ctx.headlightMats.push(mat);
    built = mat;
  } else if (isTransparentGlassMat) {
    built = createCarGlassMaterial(
      isNeutralColor(srcColor) ? 0x0b1220 : srcColor,
      Math.min(0.62, Math.max(0.36, srcOpacity < 0.95 ? srcOpacity : 0.46)),
      matName,
    );
  } else if (
    /tyre|tire|rubber|tread|gomes|pneu|slick|sidewall/i.test(lowerMat) ||
    (isWheelMesh && /^(?:ext_)?wheel$/i.test(lowerMat))
  ) {
    // Clamp bright/missing-MTL tyre diffuse values (e.g. SCG_TYRE 0.61, missing MTL 0xffffff)
    // to realistic dark vulcanized racing rubber so tyres never render white or silver.
    const lum = 0.2126 * srcColor.r + 0.7152 * srcColor.g + 0.0722 * srcColor.b;
    const rubberColor =
      !phong?.color || lum > 0.025
        ? new THREE.Color(0x1b1d21)
        : srcColor.clone().multiplyScalar(0.85);
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: rubberColor,
      roughness: 0.88,
      metalness: 0.04,
    });
  } else if (
    isWheelMesh &&
    /rim|magnesium|alum|alloy|chrome|steel|wheel_?(?:hub|rim|nut|center|cap)|hub|nut|spoke|centerlock/i.test(lowerMat) &&
    !/disc|caliper|tyre|tire|rubber|tread|gomes/i.test(lowerMat)
  ) {
    const rim = resolveRimFinish(ctx.livery.rimFinish, ctx.livery.primaryColor);
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: rim.color,
      roughness: rim.roughness,
      metalness: rim.metalness,
    });
  } else if (isWheelMesh) {
    // Strictly isolate wheel meshes from body livery textures/colors and guard missing-MTL pure white
    const isBrakeDisc = /disc|brake/i.test(lowerMat);
    const lum = 0.2126 * srcColor.r + 0.7152 * srcColor.g + 0.0722 * srcColor.b;
    const isMissingWhite = (!phong?.color || (lum > 0.75 && isNeutralColor(srcColor))) &&
      !/logo|badge|emblem|label|cap|chrome/i.test(lowerMat);
    const wheelPartColor = isMissingWhite
      ? new THREE.Color(isBrakeDisc ? 0x7c828c : 0x22252a)
      : srcColor;
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: wheelPartColor,
      roughness: isBrakeDisc ? 0.34 : 0.65,
      metalness: isBrakeDisc ? 0.78 : 0.25,
    });
  } else if (isPrimaryBodyPaint) {
    const paintColor = ctx.livery.primaryColor
      ? new THREE.Color(ctx.livery.primaryColor)
      : isNeutralColor(srcColor)
      ? new THREE.Color(ctx.livery.primaryColor)
      : srcColor;

    let liveryTexture: THREE.Texture | null = null;
    if (ctx.livery.customTexture) {
      try {
        const loader = new THREE.TextureLoader();
        liveryTexture = ctx.track(loader.load(ctx.livery.customTexture));
        liveryTexture.colorSpace = THREE.SRGBColorSpace;
        liveryTexture.wrapS = THREE.RepeatWrapping;
        liveryTexture.wrapT = THREE.RepeatWrapping;
        liveryTexture.anisotropy = ctx.maxAniso;
      } catch {
        // Ignore broken custom livery texture; fallback to paint color
      }
    } else if (ctx.isV2Pipeline) {
      liveryTexture = ctx.getProceduralLiveryTexture();
    }

    built = new THREE.MeshPhysicalMaterial({
      name: matName,
      color: liveryTexture ? 0xffffff : paintColor,
      map: liveryTexture,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    });
  } else if (/(?:chassis2|wc_team_body2|redbull_detail|color_light_green|accent|secondary)/i.test(lowerMat)) {
    const accentColor = ctx.livery.secondaryColor
      ? new THREE.Color(ctx.livery.secondaryColor)
      : srcColor;
    built = new THREE.MeshPhysicalMaterial({
      name: matName,
      color: accentColor,
      roughness: 0.28,
      metalness: 0.22,
      clearcoat: 0.9,
      clearcoatRoughness: 0.15,
    });
  } else if (/^mirror$|^mirrors$/i.test(lowerMat)) {
    const mirrorColor = ctx.livery.tertiaryColor
      ? new THREE.Color(ctx.livery.tertiaryColor)
      : ctx.livery.secondaryColor
      ? new THREE.Color(ctx.livery.secondaryColor)
      : srcColor;
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: mirrorColor,
      roughness: 0.22,
      metalness: 0.78,
    });
  } else if (/numberplate|num_plate|^plate$|^numpan\d*$|^numberdigi\d*$/i.test(lowerMat)) {
    if (ctx.isV2Pipeline) {
      // V2 pipeline models remap all body/plate sub-meshes into SIX_ZONE_UV_ATLAS;
      // binding a full-quad plate texture would stretch/crop giant distorted digits.
      let atlasTex: THREE.Texture | null = null;
      if (ctx.livery.customTexture) {
        try {
          const loader = new THREE.TextureLoader();
          atlasTex = ctx.track(loader.load(ctx.livery.customTexture));
          atlasTex.colorSpace = THREE.SRGBColorSpace;
          atlasTex.wrapS = THREE.RepeatWrapping;
          atlasTex.wrapT = THREE.RepeatWrapping;
          atlasTex.anisotropy = ctx.maxAniso;
        } catch {
          atlasTex = ctx.getProceduralLiveryTexture();
        }
      } else {
        atlasTex = ctx.getProceduralLiveryTexture();
      }
      built = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: 0xffffff,
        map: atlasTex,
        roughness: 0.28,
        metalness: 0.14,
        clearcoat: 0.9,
        clearcoatRoughness: 0.14,
      });
    } else {
      const plateTexture = ctx.track(
        createNumberPlateTexture(
          ctx.livery,
          ctx.carSpec.classId,
          ctx.maxAniso,
        ),
      );
      built = new THREE.MeshStandardMaterial({
        name: matName,
        map: plateTexture,
        roughness: 0.35,
        metalness: 0.05,
      });
    }
  } else if (/chrome|steel|alum|magnesium|metal|exhaust/i.test(lowerMat)) {
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: srcColor,
      roughness: /chrome|mirror|polished/i.test(lowerMat) ? 0.18 : 0.34,
      metalness: /chrome|mirror|polished/i.test(lowerMat) ? 0.92 : 0.72,
    });
  } else {
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: srcColor,
      roughness: 0.62,
      metalness: 0.12,
      transparent: srcOpacity < 0.99,
      opacity: srcOpacity,
      side: THREE.DoubleSide,
    });
  }

  // Prevent transparent/see-through backface-culling holes on open cockpits, interiors, body shells & open rims
  if (!isTransparentGlassMat && built instanceof THREE.Material) {
    built.side = THREE.DoubleSide;
  }

  ctx.track(built);
  ctx.materialCache.set(cacheKey, built);
  return built;
}

function isWheelObjectName(name: string): boolean {
  return /^(?:WHEEL|TYRE|TIRE)(?:[_\-\s]|$)/i.test(name);
}

function isFrontWheelObjectName(name: string, centerZ: number): boolean {
  if (/(?:_LF|_FL|_RF|_FR|FRONT)/i.test(name)) return true;
  if (/(?:_LR|_RL|_RR|REAR)/i.test(name)) return false;
  return centerZ > 0;
}

function instantiateObjRig(
  template: THREE.Group,
  carSpec: CarSpec,
  livery: LiveryConfig,
  maxAniso: number,
): BuiltCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const headlightMats: THREE.MeshStandardMaterial[] = [];
  const brakeLightMats: THREE.MeshStandardMaterial[] = [];
  const materialCache = new Map<string, THREE.Material>();

  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];

  const fullBounds = new THREE.Box3();
  const templateBounds = new THREE.Box3();
  template.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      templateBounds.union(mesh.geometry.boundingBox);
    }
  });

  const isV2Pipeline = Boolean(template.userData?.apexPipelineV2);
  let cachedProceduralLiveryTex: THREE.Texture | null = null;
  const getProceduralLiveryTexture = (): THREE.Texture => {
    if (!cachedProceduralLiveryTex) {
      cachedProceduralLiveryTex = track(createLiveryTexture(livery, carSpec.classId, maxAniso));
    }
    return cachedProceduralLiveryTex;
  };
  const matCtx: MaterialConversionContext = {
    carSpec,
    livery,
    maxAniso,
    isV2Pipeline,
    getProceduralLiveryTexture,
    track,
    headlightMats,
    brakeLightMats,
    materialCache,
  };

  const templateSize = templateBounds.isEmpty()
    ? new THREE.Vector3(1.9, 1.3, 4.6)
    : templateBounds.getSize(new THREE.Vector3());
  const targetRealLength = getRealWorldCarLength(carSpec.id, carSpec.classId);
  const uniformScale =
    !isV2Pipeline && templateSize.z > 0.5 && Math.abs(templateSize.z - targetRealLength) > 0.08
      ? targetRealLength / templateSize.z
      : 1.0;

  const scaledCarBounds = templateBounds.clone();
  if (uniformScale !== 1.0 && !scaledCarBounds.isEmpty()) {
    scaledCarBounds.min.multiplyScalar(uniformScale);
    scaledCarBounds.max.multiplyScalar(uniformScale);
  }

  const wheelBox = new THREE.Box3();
  const wheelCenter = new THREE.Vector3();

  const registerSingleWheelMesh = (mesh: THREE.Mesh, meshName: string) => {
    const isGlassMesh = GLASS_OBJ_OR_MAT_RE.test(meshName);
    let clonedGeo = track(sanitizeBufferGeometry(mesh.geometry.clone()));
    if (uniformScale !== 1.0) {
      clonedGeo.scale(uniformScale, uniformScale, uniformScale);
    }
    const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    // Split out any non-wheel material groups (e.g. stray LED/caliper/body parts) so wheel centroid stays true
    if (clonedGeo.groups.length > 1) {
      const wheelGroupIndices: number[] = [];
      const strayGroupIndices: number[] = [];
      for (let gi = 0; gi < clonedGeo.groups.length; gi++) {
        const gMat = rawMats[clonedGeo.groups[gi].materialIndex ?? 0];
        const gMatName = gMat?.name || '';
        if (NON_WHEEL_SUBMAT_RE.test(gMatName)) {
          strayGroupIndices.push(gi);
        } else {
          wheelGroupIndices.push(gi);
        }
      }
      if (strayGroupIndices.length > 0 && wheelGroupIndices.length > 0) {
        const strayExtracted = extractMaterialSubGeometry(clonedGeo, strayGroupIndices, rawMats);
        if (strayExtracted) {
          const strayGeo = track(strayExtracted.geo);
          const strayRawMats = Array.isArray(strayExtracted.mat) ? strayExtracted.mat : [strayExtracted.mat];
          const strayMapped = strayRawMats.map((m) =>
            convertSourceMaterial(m, 'BODY', false, matCtx),
          );
          const strayMesh = new THREE.Mesh(
            strayGeo,
            Array.isArray(strayExtracted.mat) ? strayMapped : strayMapped[0],
          );
          strayMesh.name = `${meshName}_BODY_TRIM`;
          strayMesh.castShadow = true;
          strayMesh.receiveShadow = true;
          bodyGroup.add(strayMesh);
        }
        const wheelExtracted = extractMaterialSubGeometry(clonedGeo, wheelGroupIndices, rawMats);
        if (wheelExtracted) {
          clonedGeo = track(wheelExtracted.geo);
          const wheelMapped = (Array.isArray(wheelExtracted.mat) ? wheelExtracted.mat : [wheelExtracted.mat]).map(
            (m) => convertSourceMaterial(m, meshName, true, matCtx),
          );
          const finalWheelMat = Array.isArray(wheelExtracted.mat) ? wheelMapped : wheelMapped[0];
          clonedGeo.computeBoundingBox();
          wheelBox.copy(clonedGeo.boundingBox!);
          wheelBox.getCenter(wheelCenter);
          fullBounds.expandByPoint(wheelBox.min);
          fullBounds.expandByPoint(wheelBox.max);

          clonedGeo.translate(-wheelCenter.x, -wheelCenter.y, -wheelCenter.z);

          const steeringPivot = new THREE.Group();
          steeringPivot.name = `${meshName}_STEERING_PIVOT`;
          steeringPivot.position.copy(wheelCenter);

          const wheelMesh = new THREE.Mesh(clonedGeo, finalWheelMat);
          wheelMesh.name = meshName;
          wheelMesh.castShadow = true;
          wheelMesh.receiveShadow = true;

          const spinGroup = new THREE.Group();
          spinGroup.name = `${meshName}_SPIN`;
          spinGroup.add(wheelMesh);
          steeringPivot.add(spinGroup);

          root.add(steeringPivot);
          allWheels.push(spinGroup);
          if (isFrontWheelObjectName(meshName, wheelCenter.z)) {
            frontWheels.push(steeringPivot);
          }
          return;
        }
      }
    }

    const mappedMats = rawMats.map((m) => convertSourceMaterial(m, meshName, true, matCtx));
    const finalMat = Array.isArray(mesh.material) ? mappedMats : mappedMats[0];

    clonedGeo.computeBoundingBox();
    if (clonedGeo.boundingBox) {
      wheelBox.copy(clonedGeo.boundingBox);
    } else {
      wheelBox.setFromBufferAttribute(clonedGeo.getAttribute('position') as THREE.BufferAttribute);
    }
    wheelBox.getCenter(wheelCenter);
    fullBounds.expandByPoint(wheelBox.min);
    fullBounds.expandByPoint(wheelBox.max);

    clonedGeo.translate(-wheelCenter.x, -wheelCenter.y, -wheelCenter.z);

    const steeringPivot = new THREE.Group();
    steeringPivot.name = `${meshName}_STEERING_PIVOT`;
    steeringPivot.position.copy(wheelCenter);

    const spinGroup = new THREE.Group();
    spinGroup.name = `${meshName}_SPIN`;
    steeringPivot.add(spinGroup);

    const wheelMesh = new THREE.Mesh(clonedGeo, finalMat);
    wheelMesh.name = meshName;
    wheelMesh.castShadow = !isGlassMesh;
    wheelMesh.receiveShadow = !isGlassMesh;
    spinGroup.add(wheelMesh);

    root.add(steeringPivot);
    allWheels.push(spinGroup);
    if (isFrontWheelObjectName(meshName, wheelCenter.z)) {
      frontWheels.push(steeringPivot);
    }
  };

  const registerWheelGroup = (wheelGroup: THREE.Object3D, wheelName: string) => {
    const partEntries: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; name: string }> = [];
    const combinedWheelBox = new THREE.Box3();
    const tmpBox = new THREE.Box3();

    wheelGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      let clonedGeo = track(sanitizeBufferGeometry(mesh.geometry.clone()));
      if (uniformScale !== 1.0) {
        clonedGeo.scale(uniformScale, uniformScale, uniformScale);
      }
      const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const allNonWheel = rawMats.length > 0 && rawMats.every((m) => NON_WHEEL_SUBMAT_RE.test(m?.name || ''));
      if (allNonWheel) {
        const strayMapped = rawMats.map((m) => convertSourceMaterial(m, 'BODY', false, matCtx));
        const strayMesh = new THREE.Mesh(clonedGeo, Array.isArray(mesh.material) ? strayMapped : strayMapped[0]);
        strayMesh.name = `${wheelName}_BODY_TRIM`;
        strayMesh.castShadow = true;
        strayMesh.receiveShadow = true;
        bodyGroup.add(strayMesh);
        return;
      }

      clonedGeo.computeBoundingBox();
      if (clonedGeo.boundingBox) {
        tmpBox.copy(clonedGeo.boundingBox);
      } else {
        tmpBox.setFromBufferAttribute(clonedGeo.getAttribute('position') as THREE.BufferAttribute);
      }
      combinedWheelBox.union(tmpBox);

      const mappedMats = rawMats.map((m) => convertSourceMaterial(m, wheelName, true, matCtx));
      partEntries.push({
        geo: clonedGeo,
        mat: Array.isArray(mesh.material) ? mappedMats : mappedMats[0],
        name: mesh.name || wheelName,
      });
    });

    if (partEntries.length === 0 || combinedWheelBox.isEmpty()) return;
    combinedWheelBox.getCenter(wheelCenter);
    fullBounds.expandByPoint(combinedWheelBox.min);
    fullBounds.expandByPoint(combinedWheelBox.max);

    const steeringPivot = new THREE.Group();
    steeringPivot.name = `${wheelName}_STEERING_PIVOT`;
    steeringPivot.position.copy(wheelCenter);

    const spinGroup = new THREE.Group();
    spinGroup.name = `${wheelName}_SPIN`;
    steeringPivot.add(spinGroup);

    for (const part of partEntries) {
      part.geo.translate(-wheelCenter.x, -wheelCenter.y, -wheelCenter.z);
      const wheelMesh = new THREE.Mesh(part.geo, part.mat);
      wheelMesh.name = part.name;
      wheelMesh.castShadow = true;
      wheelMesh.receiveShadow = true;
      spinGroup.add(wheelMesh);
    }

    root.add(steeringPivot);
    allWheels.push(spinGroup);
    if (isFrontWheelObjectName(wheelName, wheelCenter.z)) {
      frontWheels.push(steeringPivot);
    }
  };

  const registerBodyMesh = (mesh: THREE.Mesh, meshName: string, parentName: string) => {
    const isGlassMesh = GLASS_OBJ_OR_MAT_RE.test(meshName) || GLASS_OBJ_OR_MAT_RE.test(parentName);
    let clonedGeo = track(sanitizeBufferGeometry(mesh.geometry.clone()));
    if (uniformScale !== 1.0) {
      clonedGeo.scale(uniformScale, uniformScale, uniformScale);
    }
    const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    // Legacy OBJs with out-of-bounds UVs get clean deterministic 6-zone UVs for Livery Studio
    if (!isV2Pipeline && !isGlassMesh && clonedGeo.groups.length <= 1 && hasOutOfBoundsUVs(clonedGeo)) {
      const isAero = /wing|spoiler|aero|splitter|diffuser/i.test(meshName);
      clonedGeo = track(applySixZoneCarUVs(clonedGeo, scaledCarBounds, { isAero }));
    }
    const mappedMats = rawMats.map((m) => convertSourceMaterial(m, meshName, false, matCtx));
    const finalMat = Array.isArray(mesh.material) ? mappedMats : mappedMats[0];

    clonedGeo.computeBoundingBox();
    if (clonedGeo.boundingBox) {
      fullBounds.union(clonedGeo.boundingBox);
    }
    const isGlass =
      isGlassMesh ||
      mappedMats.some((m) => Boolean(m.userData?.isGlass));
    const bodyMesh = new THREE.Mesh(clonedGeo, finalMat);
    bodyMesh.name = meshName;
    bodyMesh.castShadow = !isGlass;
    bodyMesh.receiveShadow = !isGlass;
    bodyGroup.add(bodyMesh);
  };

  const visitTemplateNode = (node: THREE.Object3D, parentName: string) => {
    const nodeName = node.name || '';
    const mesh = node as THREE.Mesh;
    if (isWheelObjectName(nodeName)) {
      if (mesh.isMesh && mesh.geometry) {
        registerSingleWheelMesh(mesh, nodeName);
      } else {
        registerWheelGroup(node, nodeName);
      }
      return;
    }
    if (mesh.isMesh && mesh.geometry) {
      registerBodyMesh(mesh, nodeName || parentName || 'PART', parentName);
      return;
    }
    for (const child of node.children) {
      visitTemplateNode(child, nodeName || parentName);
    }
  };

  for (const child of template.children) {
    visitTemplateNode(child, '');
  }

  // Ground contact shadow matching car footprint
  const size = fullBounds.isEmpty()
    ? new THREE.Vector3(1.9, 1.3, 3.75)
    : fullBounds.getSize(new THREE.Vector3());
  const shadowGeo = track(new THREE.PlaneGeometry(Math.max(2.0, size.x * 1.34), Math.max(3.6, size.z * 1.18)));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowTex = track(createContactShadowTexture());
  shadowTex.anisotropy = maxAniso;
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  const fallbackBrakeMat =
    brakeLightMats[0] ??
    track(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 0.9,
      }),
    );

  const hoodMount = computeRigHoodMount(root, bodyGroup, carSpec.classId, carSpec.dimensions);

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    frontWingFlap: null,
    rearWingFlap: null,
    headlightMats,
    brakeLightMat: fallbackBrakeMat,
    hoodMount,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

const LOD1_CULL_TRIM_RE =
  /caliper|disc|rotor|brake|mirror|wiper|antenna|badge|decal|cockpit|interior|exhaust|grille|nut|bolt|light_bulb|glow|trim/i;

export function wrapRigInLOD(
  rig: BuiltCarRig,
  carSpec: CarSpec,
  livery: LiveryConfig,
): BuiltCarRig {
  if (rig.root.getObjectByName('CAR_LOD')) {
    return rig;
  }

  const lodDisposables: Array<{ dispose: () => void }> = [];
  const trackLod = <T extends { dispose: () => void }>(res: T): T => {
    lodDisposables.push(res);
    return res;
  };

  // Keep contact shadow quad directly on rig.root so footprint shadow stays active across LODs
  const childrenToMove: THREE.Object3D[] = [];
  for (const child of rig.root.children) {
    const asMesh = child as THREE.Mesh;
    const isContactShadow =
      asMesh.isMesh &&
      child !== rig.bodyGroup &&
      !Array.isArray(asMesh.material) &&
      (asMesh.material as THREE.MeshBasicMaterial)?.depthWrite === false;
    if (!isContactShadow) {
      childrenToMove.push(child);
    }
  }

  const bounds = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  for (const child of childrenToMove) {
    child.updateMatrixWorld(true);
    tmpBox.setFromObject(child);
    if (!tmpBox.isEmpty()) {
      bounds.union(tmpBox);
    }
  }
  const size = bounds.isEmpty()
    ? new THREE.Vector3(1.9, 1.2, getRealWorldCarLength(carSpec.id, carSpec.classId))
    : bounds.getSize(new THREE.Vector3());
  const center = bounds.isEmpty()
    ? new THREE.Vector3(0, size.y * 0.5, 0)
    : bounds.getCenter(new THREE.Vector3());

  // Tier 0 (0 - 35m): Full detail body + articulated wheels
  const lod0 = new THREE.Group();
  lod0.name = 'LOD0_FULL';
  for (const child of childrenToMove) {
    lod0.add(child);
  }

  // Tier 1 (35 - 110m): Simplified chassis (small trim/caliper/interior culled) + cylinder wheel proxies
  const lod1 = new THREE.Group();
  lod1.name = 'LOD1_SIMPLIFIED';

  let largestBodyMesh: THREE.Mesh | null = null;
  let largestBodyDiag = -1;
  let keptLod1Count = 0;

  const cloneSimplifiedBodyNode = (src: THREE.Object3D): THREE.Object3D | null => {
    const mesh = src as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const diag = mesh.geometry.boundingBox
        ? mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length() *
          Math.max(Math.abs(mesh.scale.x), Math.abs(mesh.scale.y), Math.abs(mesh.scale.z))
        : 0;
      if (diag > largestBodyDiag) {
        largestBodyDiag = diag;
        largestBodyMesh = mesh;
      }

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matNames = mats.map((m) => m?.name || '').join(' ');
      const isTrim =
        LOD1_CULL_TRIM_RE.test(mesh.name || '') ||
        LOD1_CULL_TRIM_RE.test(matNames) ||
        (diag > 0 && diag < 0.38);
      if (isTrim) return null;

      const proxyMesh = new THREE.Mesh(mesh.geometry, mesh.material);
      proxyMesh.name = mesh.name;
      proxyMesh.position.copy(mesh.position);
      proxyMesh.rotation.copy(mesh.rotation);
      proxyMesh.scale.copy(mesh.scale);
      proxyMesh.castShadow = mesh.castShadow;
      proxyMesh.receiveShadow = false;
      keptLod1Count++;
      return proxyMesh;
    }

    const group = new THREE.Group();
    group.name = src.name;
    group.position.copy(src.position);
    group.rotation.copy(src.rotation);
    group.scale.copy(src.scale);
    for (const child of src.children) {
      const clonedChild = cloneSimplifiedBodyNode(child);
      if (clonedChild) group.add(clonedChild);
    }
    return group.children.length > 0 ? group : null;
  };

  const lod1Body = cloneSimplifiedBodyNode(rig.bodyGroup) ?? new THREE.Group();
  lod1Body.name = 'LOD1_BODY';
  if (keptLod1Count === 0 && largestBodyMesh) {
    const fallbackMesh = largestBodyMesh as THREE.Mesh;
    const proxyMesh = new THREE.Mesh(fallbackMesh.geometry, fallbackMesh.material);
    proxyMesh.name = fallbackMesh.name;
    proxyMesh.castShadow = true;
    proxyMesh.receiveShadow = false;
    lod1Body.add(proxyMesh);
  }
  lod1.add(lod1Body);

  if (rig.allWheels.length > 0) {
    const unitWheelGeo = trackLod(new THREE.CylinderGeometry(1, 1, 1, 10));
    unitWheelGeo.rotateZ(Math.PI / 2);
    const wheelProxyMat = trackLod(
      new THREE.MeshStandardMaterial({
        color: 0x1b1d21,
        roughness: 0.85,
        metalness: 0.08,
      }),
    );

    const seenPivots = new Set<THREE.Object3D>();
    for (const spinOrWheel of rig.allWheels) {
      const pivot = spinOrWheel.parent && spinOrWheel.parent !== lod0 ? spinOrWheel.parent : spinOrWheel;
      if (seenPivots.has(pivot)) continue;
      seenPivots.add(pivot);

      tmpBox.setFromObject(pivot);
      const wSize = tmpBox.isEmpty() ? new THREE.Vector3(0.3, 0.65, 0.65) : tmpBox.getSize(new THREE.Vector3());
      const wCenter = tmpBox.isEmpty() ? pivot.position : tmpBox.getCenter(new THREE.Vector3());
      const radius = Math.max(0.18, Math.max(wSize.y, wSize.z) * 0.5);
      const width = Math.max(0.14, wSize.x);

      const wProxy = new THREE.Mesh(unitWheelGeo, wheelProxyMat);
      wProxy.position.copy(wCenter);
      wProxy.scale.set(width, radius, radius);
      wProxy.castShadow = false;
      wProxy.receiveShadow = false;
      lod1.add(wProxy);
    }
  }

  // Tier 2 (> 110m): Ultra-low-poly proxy silhouette (~60 tris)
  const lod2 = new THREE.Group();
  lod2.name = 'LOD2_PROXY';
  const unitBoxGeo = trackLod(new THREE.BoxGeometry(1, 1, 1));
  const proxyBodyMat = trackLod(
    new THREE.MeshStandardMaterial({
      color: livery.primaryColor || '#dc2626',
      roughness: 0.38,
      metalness: 0.2,
    }),
  );
  const proxyCabinMat = trackLod(
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.25,
      metalness: 0.15,
    }),
  );
  const proxyWheelMat = trackLod(
    new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.9,
      metalness: 0.05,
    }),
  );

  const hullMesh = new THREE.Mesh(unitBoxGeo, proxyBodyMat);
  hullMesh.scale.set(size.x * 0.94, Math.max(0.24, size.y * 0.44), size.z * 0.96);
  hullMesh.position.set(center.x, Math.max(0.22, bounds.min.y + size.y * 0.34), center.z);
  lod2.add(hullMesh);

  const cabinMesh = new THREE.Mesh(unitBoxGeo, proxyCabinMat);
  cabinMesh.scale.set(size.x * 0.58, Math.max(0.18, size.y * 0.30), size.z * 0.40);
  cabinMesh.position.set(center.x, Math.max(0.42, bounds.min.y + size.y * 0.66), center.z - size.z * 0.04);
  lod2.add(cabinMesh);

  if (!/ROAD|HATCH|COUPE/i.test(carSpec.classId)) {
    const wingMesh = new THREE.Mesh(unitBoxGeo, proxyBodyMat);
    wingMesh.scale.set(size.x * 0.88, 0.08, 0.26);
    wingMesh.position.set(center.x, Math.max(0.50, bounds.min.y + size.y * 0.74), center.z - size.z * 0.44);
    lod2.add(wingMesh);
  }

  for (const zSign of [1, -1]) {
    const axleBlock = new THREE.Mesh(unitBoxGeo, proxyWheelMat);
    axleBlock.scale.set(size.x * 0.96, Math.max(0.28, size.y * 0.38), Math.max(0.42, size.z * 0.13));
    axleBlock.position.set(center.x, bounds.min.y + Math.max(0.16, size.y * 0.20), center.z + zSign * size.z * 0.31);
    lod2.add(axleBlock);
  }

  const lod = new THREE.LOD();
  lod.name = 'CAR_LOD';
  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, 35);
  lod.addLevel(lod2, 110);
  rig.root.add(lod);

  const origDispose = rig.dispose;
  rig.dispose = () => {
    origDispose();
    for (const d of lodDisposables) {
      d.dispose();
    }
  };

  return rig;
}

export async function buildCarRigAsync(
  carSpec: CarSpec,
  livery: LiveryConfig,
  maxAniso = 4,
): Promise<BuiltCarRig> {
  const modelTarget = carSpec.modelId || carSpec.id;
  const isStandalone = preloadBatchDepth === 0;
  if (isStandalone) {
    emitAssetLoadProgress({
      active: true,
      phase: 'manifest',
      completed: 0,
      total: 1,
      percent: 0,
      currentAsset: modelTarget,
    });
  }

  try {
    const entry = await findLowPolyModelForCar(modelTarget);
    if (entry) {
      try {
        const template = await loadModelTemplate(entry, (fraction) => {
          if (isStandalone) {
            emitAssetLoadProgress({
              active: true,
              phase: 'downloading',
              completed: fraction >= 1 ? 1 : 0,
              total: 1,
              percent: Math.round(fraction * 100),
              currentAsset: entry.glb || entry.obj || modelTarget,
            });
          }
        });
        const rig = instantiateObjRig(template, carSpec, livery, maxAniso);
        return wrapRigInLOD(rig, carSpec, livery);
      } catch {
        // Silently fall back to procedural diecast mesh if GLB/OBJ load fails
      }
    }
    const fallbackRig = buildDiecastCar(carSpec.silhouette, carSpec.classId, livery, maxAniso, carSpec.id);
    return wrapRigInLOD(fallbackRig, carSpec, livery);
  } finally {
    if (isStandalone) {
      emitAssetLoadProgress({
        active: false,
        phase: 'done',
        completed: 1,
        total: 1,
        percent: 100,
        currentAsset: null,
      });
    }
  }
}

/**
 * Preloads the low-poly manifest and deduplicated GLB/OBJ templates for all car specs in a grid
 * so race start has zero mid-frame asset/shader stalls, emitting progress for UI loading overlays.
 */
export async function preloadCarModels(carSpecs: ReadonlyArray<CarSpec>): Promise<void> {
  const seenTargets = new Set<string>();
  const uniqueTargets: string[] = [];
  for (let i = 0; i < carSpecs.length; i++) {
    const target = carSpecs[i].modelId || carSpecs[i].id;
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    uniqueTargets.push(target);
  }

  const total = uniqueTargets.length;
  preloadBatchDepth++;
  emitAssetLoadProgress({
    active: true,
    phase: 'manifest',
    completed: 0,
    total,
    percent: 0,
    currentAsset: 'manifest.json',
  });

  try {
    await getLowPolyManifestMap();
    if (total === 0) {
      emitAssetLoadProgress({
        active: false,
        phase: 'done',
        completed: 0,
        total: 0,
        percent: 100,
        currentAsset: null,
      });
      return;
    }

    const fractions = new Map<string, number>();
    let completed = 0;

    const updateBatchProgress = (assetName: string | null) => {
      let sum = 0;
      for (const f of fractions.values()) sum += f;
      const percent = Math.min(100, Math.round((sum / total) * 100));
      emitAssetLoadProgress({
        active: completed < total,
        phase: completed < total ? 'downloading' : 'done',
        completed,
        total,
        percent,
        currentAsset: assetName,
      });
    };

    emitAssetLoadProgress({
      active: true,
      phase: 'downloading',
      completed: 0,
      total,
      percent: 0,
      currentAsset: uniqueTargets[0] ?? null,
    });

    await Promise.all(
      uniqueTargets.map((target) =>
        findLowPolyModelForCar(target)
          .then((entry) =>
            entry
              ? loadModelTemplate(entry, (frac) => {
                  fractions.set(target, frac);
                  updateBatchProgress(entry.glb || entry.obj || target);
                }).then(() => undefined)
              : undefined,
          )
          .catch(() => undefined)
          .finally(() => {
            fractions.set(target, 1);
            completed++;
            updateBatchProgress(completed < total ? target : null);
          }),
      ),
    );

    emitAssetLoadProgress({
      active: false,
      phase: 'done',
      completed: total,
      total,
      percent: 100,
      currentAsset: null,
    });
  } finally {
    preloadBatchDepth = Math.max(0, preloadBatchDepth - 1);
  }
}

/**
 * Pre-warms WebGL shaders for all loaded car rigs (including all 3 LOD tiers)
 * via `renderer.compileAsync` on session boot to prevent first-frame shader hitching.
 */
export async function prewarmCarShaderMaterials(
  renderer: THREE.WebGLRenderer | null | undefined,
  scene: THREE.Scene,
  camera: THREE.Camera,
  targetObject?: THREE.Object3D,
): Promise<void> {
  if (!renderer) return;
  const compileTarget = targetObject ?? scene;
  const restoredVisibility: Array<{ obj: THREE.Object3D; visible: boolean }> = [];

  compileTarget.traverse((obj) => {
    if (obj instanceof THREE.LOD) {
      for (const level of obj.levels) {
        if (!level.object.visible) {
          restoredVisibility.push({ obj: level.object, visible: level.object.visible });
          level.object.visible = true;
        }
      }
    }
  });

  const emitCompiling = preloadBatchDepth === 0;
  if (emitCompiling) {
    emitAssetLoadProgress({
      active: true,
      phase: 'compiling',
      currentAsset: 'shaders',
    });
  }

  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(compileTarget, camera, targetObject ? scene : undefined);
    } else if (typeof renderer.compile === 'function') {
      renderer.compile(compileTarget, camera, targetObject ? scene : undefined);
    }
  } catch {
    // Non-fatal in headless / context-lost environments
  } finally {
    for (const item of restoredVisibility) {
      item.obj.visible = item.visible;
    }
    if (emitCompiling) {
      emitAssetLoadProgress({
        active: false,
        phase: 'done',
        currentAsset: null,
      });
    }
  }
}

export function applyCustomTextureToRig(
  rig: BuiltCarRig,
  textureOrCanvas: HTMLCanvasElement | THREE.Texture | string,
  primaryColor?: string,
): void {
  let texture: THREE.Texture;
  if (typeof textureOrCanvas === 'string') {
    const loader = new THREE.TextureLoader();
    texture = loader.load(textureOrCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  } else if (textureOrCanvas instanceof THREE.Texture) {
    texture = textureOrCanvas;
  } else {
    texture = new THREE.CanvasTexture(textureOrCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  const pColor = primaryColor ? new THREE.Color(primaryColor) : null;

  rig.bodyGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (GLASS_OBJ_OR_MAT_RE.test(mesh.name || '') || isWheelObjectName(mesh.name || '')) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      const lower = (mat.name || '').toLowerCase();
      const isGlass =
        Boolean(mat.userData?.isGlass) ||
        GLASS_OBJ_OR_MAT_RE.test(lower) ||
        (mat.transparent && mat.opacity < 0.95);
      const isLight = /light|emissive/i.test(lower);
      if (!isGlass && !isLight) {
        mat.map = texture;
        mat.color.set(0xffffff);
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    }
  });
}

export function renderUVWireframeToCanvas(
  meshOrGroup: THREE.Object3D,
  canvas: HTMLCanvasElement,
  options?: { strokeStyle?: string; lineWidth?: number; fillBackground?: string },
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const w = canvas.width;
  const h = canvas.height;

  if (options?.fillBackground) {
    ctx.fillStyle = options.fillBackground;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.strokeStyle = options?.strokeStyle || 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = options?.lineWidth || 1;

  const clampUV = (val: number) => (val < 0 ? 0 : val > 1 ? 1 : val);

  let drawnCount = 0;
  meshOrGroup.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (GLASS_OBJ_OR_MAT_RE.test(mesh.name || '') || isWheelObjectName(mesh.name || '')) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.length > 0 && mats.every((m) => Boolean(m?.userData?.isGlass))) return;

    const geo = mesh.geometry;
    const uvAttr = geo.getAttribute('uv');
    if (!uvAttr || uvAttr.count === 0) return;

    const indexAttr = geo.getIndex();
    ctx.beginPath();

    const drawTri = (i0: number, i1: number, i2: number) => {
      const u0 = clampUV(uvAttr.getX(i0));
      const v0 = 1 - clampUV(uvAttr.getY(i0));
      const u1 = clampUV(uvAttr.getX(i1));
      const v1 = 1 - clampUV(uvAttr.getY(i1));
      const u2 = clampUV(uvAttr.getX(i2));
      const v2 = 1 - clampUV(uvAttr.getY(i2));

      ctx.moveTo(u0 * w, v0 * h);
      ctx.lineTo(u1 * w, v1 * h);
      ctx.lineTo(u2 * w, v2 * h);
      ctx.closePath();
      drawnCount++;
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        drawTri(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
      }
    } else {
      for (let i = 0; i < uvAttr.count; i += 3) {
        drawTri(i, i + 1, i + 2);
      }
    }
    ctx.stroke();
  });

  return drawnCount > 0;
}
