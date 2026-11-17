import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { CarSpec, HeadlightTint, LiveryConfig, RimFinish } from '../game/types';
import { buildDiecastCar, BuiltCarRig } from './carBuilder';
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
  return map.get(normalizeCarKey(carId)) ?? null;
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
    return objLoader.parse(objText);
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
  const isGlassObject = /glass|windshield|windscreen|window|glazing/i.test(meshName);

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
  } else if (/glass|window|windscreen|windshield/i.test(lowerMat) || isGlassObject) {
    built = new THREE.MeshPhysicalMaterial({
      name: matName,
      color: isNeutralColor(srcColor) ? 0x111827 : srcColor,
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
      transparent: true,
      opacity: Math.min(0.65, Math.max(0.38, srcOpacity < 0.99 ? srcOpacity : 0.48)),
      depthWrite: false,
    });
  } else if (/tyre|tire|rubber/i.test(lowerMat)) {
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: srcColor.multiplyScalar(0.85),
      roughness: 0.86,
      metalness: 0.04,
    });
  } else if (
    isWheelMesh &&
    /rim|magnesium|alum|alloy|chrome|steel|wheel/i.test(lowerMat) &&
    !/disc|caliper|tyre|tire/i.test(lowerMat)
  ) {
    const rim = resolveRimFinish(ctx.livery.rimFinish, ctx.livery.primaryColor);
    built = new THREE.MeshStandardMaterial({
      name: matName,
      color: rim.color,
      roughness: rim.roughness,
      metalness: rim.metalness,
    });
  } else if (/carpaint|body_?paint|chassis_?paint|^paint/i.test(lowerMat)) {
    const customizedPrimary =
      ctx.livery.primaryColor.toLowerCase() !== ctx.carSpec.defaultLivery.primaryColor.toLowerCase();
    const paintColor =
      isNeutralColor(srcColor) || customizedPrimary
        ? new THREE.Color(ctx.livery.primaryColor)
        : srcColor;
    built = new THREE.MeshPhysicalMaterial({
      name: matName,
      color: paintColor,
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
  const wheelBox = new THREE.Box3();
  const wheelCenter = new THREE.Vector3();

  template.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const meshName = mesh.name || 'PART';
    const isWheelMesh = isWheelObjectName(meshName);
    const clonedGeo = track(mesh.geometry.clone());

    const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mappedMats = rawMats.map((m) =>
      convertSourceMaterial(m, meshName, isWheelMesh, {
        carSpec,
        livery,
        track,
        headlightMats,
        brakeLightMats,
        materialCache,
      }),
    );
    const finalMat = Array.isArray(mesh.material) ? mappedMats : mappedMats[0];

    if (isWheelMesh) {
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

      const steerPivot = new THREE.Group();
      steerPivot.name = `${meshName}_PIVOT`;
      steerPivot.position.copy(wheelCenter);

      const spinGroup = new THREE.Group();
      spinGroup.name = `${meshName}_SPIN`;
      steerPivot.add(spinGroup);

      const wheelMesh = new THREE.Mesh(clonedGeo, finalMat);
      wheelMesh.name = meshName;
      wheelMesh.castShadow = true;
      wheelMesh.receiveShadow = true;
      spinGroup.add(wheelMesh);

      root.add(steerPivot);
      allWheels.push(spinGroup);
      if (isFrontWheelObjectName(meshName, wheelCenter.z)) {
        frontWheels.push(steerPivot);
      }
    } else {
      clonedGeo.computeBoundingBox();
      if (clonedGeo.boundingBox) {
        fullBounds.union(clonedGeo.boundingBox);
      }
      const isGlass = /glass|windshield|windscreen|window|glazing/i.test(meshName);
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
  const entry = await findLowPolyModelForCar(carSpec.id);
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
