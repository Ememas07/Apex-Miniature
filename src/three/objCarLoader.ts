import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { CarSpec, HeadlightTint, LiveryConfig, RimFinish } from '../game/types';
import {
  applySixZoneCarUVs,
  buildDiecastCar,
  BuiltCarRig,
  createCarGlassMaterial,
  getRealWorldCarLength,
} from './carBuilder';
import { createContactShadowTexture } from './proceduralTextures';

export interface LowPolyCarManifestEntry {
  id: string;
  folder: string;
  obj: string;
  mtl: string | null;
}

interface LowPolyCarManifest {
  cars: LowPolyCarManifestEntry[];
}

function getModelsBaseUrl(): string {
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');
  return `${base}models/lowpoly-cars/`;
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
      if (!entry || typeof entry.folder !== 'string' || typeof entry.obj !== 'string') continue;
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
}

export async function findLowPolyModelForCar(carId: string): Promise<LowPolyCarManifestEntry | null> {
  const map = await getLowPolyManifestMap();
  const key = normalizeCarKey(carId);
  const direct = map.get(key);
  if (direct) return direct;

  // Single-model class fallback aliases
  if (key.includes('oreca07') || key === 'lmp2' || key.includes('ligier')) {
    return map.get('oreca07united') ?? map.get('oreca07ao') ?? map.get('oreca07europol') ?? null;
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

async function loadObjTemplate(entry: LowPolyCarManifestEntry): Promise<THREE.Group> {
  const cacheKey = `${entry.folder}/${entry.obj}`;
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;

  const loaderPromise = (async () => {
    const folderUrl = `${getModelsBaseUrl()}${encodeURIComponent(entry.folder)}/`;
    const objRes = await fetch(`${folderUrl}${encodeURIComponent(entry.obj)}`);
    if (!objRes.ok) {
      throw new Error(`Failed to fetch OBJ "${entry.obj}" (${objRes.status})`);
    }
    const objText = await objRes.text();

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
      } catch (err) {
        console.warn(`[objCarLoader] Failed to load MTL for ${entry.folder}:`, err);
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

  const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
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

  if (/lights?_?glass_?rear|taillight|brake_?light|rear_?light/i.test(lowerMat)) {
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
  } else if (/tyre|tire|rubber/i.test(lowerMat)) {
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: srcColor.multiplyScalar(0.85),
      roughness: 0.86,
      metalness: 0.04,
    });
  } else if (
    isWheelMesh &&
    /rim|magnesium|alum|alloy|chrome|steel|wheel|hub|nut|spoke|centerlock/i.test(lowerMat) &&
    !/disc|caliper|tyre|tire/i.test(lowerMat)
  ) {
    const rim = resolveRimFinish(ctx.livery.rimFinish, ctx.livery.primaryColor);
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: rim.color,
      roughness: rim.roughness,
      metalness: rim.metalness,
    });
  } else if (isWheelMesh) {
    // Strictly isolate wheel meshes from body livery textures/colors
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: srcColor,
      roughness: /disc|brake/i.test(lowerMat) ? 0.34 : 0.65,
      metalness: /disc|brake/i.test(lowerMat) ? 0.78 : 0.25,
    });
  } else if (
    /(?:car_?paint|body_?paint|chassis_?paint|^paint|ext_chassis|_ext_carpaint|ext_body|^body$|^chassis$|skin\d*|livery)/i.test(
      lowerMat,
    )
  ) {
    const customizedPrimary =
      ctx.livery.primaryColor.toLowerCase() !== ctx.carSpec.defaultLivery.primaryColor.toLowerCase();
    const paintColor =
      isNeutralColor(srcColor) || customizedPrimary
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
      } catch (err) {
        console.warn('Failed to load custom livery texture:', err);
      }
    }

    built = new THREE.MeshPhysicalMaterial({
      name: matName,
      color: liveryTexture ? (customizedPrimary ? paintColor : 0xffffff) : paintColor,
      map: liveryTexture,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    });
  } else if (/chrome|mirror|steel|alum|magnesium|metal|exhaust/i.test(lowerMat)) {
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
    });
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

  template.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const meshName = mesh.name || 'PART';
    const isWheelMesh = isWheelObjectName(meshName);
    const isGlassMesh = GLASS_OBJ_OR_MAT_RE.test(meshName);
    let clonedGeo = track(sanitizeBufferGeometry(mesh.geometry.clone()));
    if (uniformScale !== 1.0) {
      clonedGeo.scale(uniformScale, uniformScale, uniformScale);
    }

    const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    if (isWheelMesh) {
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
              convertSourceMaterial(m, 'BODY', false, {
                carSpec,
                livery,
                track,
                headlightMats,
                brakeLightMats,
                materialCache,
              }),
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
              (m) =>
                convertSourceMaterial(m, meshName, true, {
                  carSpec,
                  livery,
                  track,
                  headlightMats,
                  brakeLightMats,
                  materialCache,
                }),
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

      const mappedMats = rawMats.map((m) =>
        convertSourceMaterial(m, meshName, true, {
          carSpec,
          livery,
          track,
          headlightMats,
          brakeLightMats,
          materialCache,
        }),
      );
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
      wheelMesh.castShadow = true;
      wheelMesh.receiveShadow = true;
      spinGroup.add(wheelMesh);

      root.add(steeringPivot);
      allWheels.push(spinGroup);
      if (isFrontWheelObjectName(meshName, wheelCenter.z)) {
        frontWheels.push(steeringPivot);
      }
    } else {
      // Legacy OBJs with out-of-bounds UVs get clean deterministic 6-zone UVs for Livery Studio
      if (!isV2Pipeline && !isGlassMesh && clonedGeo.groups.length <= 1 && hasOutOfBoundsUVs(clonedGeo)) {
        const isAero = /wing|spoiler|aero|splitter|diffuser/i.test(meshName);
        clonedGeo = track(applySixZoneCarUVs(clonedGeo, scaledCarBounds, { isAero }));
      }
      const mappedMats = rawMats.map((m) =>
        convertSourceMaterial(m, meshName, false, {
          carSpec,
          livery,
          track,
          headlightMats,
          brakeLightMats,
          materialCache,
        }),
      );
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
    }
  });

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

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    frontWingFlap: null,
    rearWingFlap: null,
    headlightMats,
    brakeLightMat: fallbackBrakeMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export async function buildCarRigAsync(
  carSpec: CarSpec,
  livery: LiveryConfig,
  maxAniso = 4,
): Promise<BuiltCarRig> {
  const modelTarget = carSpec.modelId || carSpec.id;
  const entry = await findLowPolyModelForCar(modelTarget);
  if (entry) {
    try {
      const template = await loadObjTemplate(entry);
      return instantiateObjRig(template, carSpec, livery, maxAniso);
    } catch (err) {
      console.warn(`[objCarLoader] Falling back to procedural mesh for "${carSpec.id}":`, err);
    }
  }
  return buildDiecastCar(carSpec.silhouette, carSpec.classId, livery, maxAniso, carSpec.id);
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
        if (pColor) mat.color.copy(pColor);
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
