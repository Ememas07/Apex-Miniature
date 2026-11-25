import * as THREE from 'three';
import { CarClassId, HeadlightTint, LiveryConfig, PaintFinish, RimFinish } from '../game/types';
import {
  createCarbonTexture,
  createContactShadowTexture,
  createLiveryTexture,
  createWindshieldBannerTexture,
} from './proceduralTextures';

export type TrackDisposable = <T extends { dispose: () => void }>(item: T) => T;

export function createCarGlassMaterial(
  tintColor: THREE.ColorRepresentation = 0x0b1220,
  opacity = 0.46,
  name = 'GLASS',
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    name,
    color: tintColor,
    roughness: 0.08,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  mat.userData.isGlass = true;
  return mat;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;
export function getShadowTexture(): THREE.CanvasTexture {
  if (!sharedShadowTex) sharedShadowTex = createContactShadowTexture();
  return sharedShadowTex;
}

export function getRimColorAndMetalness(finish: RimFinish, primaryColor: string): {
  color: string;
  metalness: number;
  roughness: number;
} {
  switch (finish) {
    case 'gloss-black':
      return { color: '#1e242e', metalness: 0.72, roughness: 0.18 };
    case 'silver':
      return { color: '#d4d8df', metalness: 0.9, roughness: 0.2 };
    case 'gold-bronze':
      return { color: '#c89b3c', metalness: 0.85, roughness: 0.24 };
    case 'white':
      return { color: '#f1f5f9', metalness: 0.25, roughness: 0.28 };
    case 'body-matched':
      return { color: primaryColor, metalness: 0.55, roughness: 0.24 };
  }
}

export function getHeadlightHex(tint: HeadlightTint, classId: CarClassId): number {
  if (classId === CarClassId.GT3 && tint === 'crystal-white') {
    return 0xfacc15;
  }
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

export interface PaintFinishPreset {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export function getPaintFinishPreset(finish: PaintFinish | undefined): PaintFinishPreset {
  switch (finish ?? 'gloss') {
    case 'metallic':
      return { roughness: 0.22, metalness: 0.72, clearcoat: 0.9, clearcoatRoughness: 0.14 };
    case 'matte':
      return { roughness: 0.78, metalness: 0.06, clearcoat: 0.0, clearcoatRoughness: 0.85 };
    case 'satin':
      return { roughness: 0.44, metalness: 0.35, clearcoat: 0.28, clearcoatRoughness: 0.42 };
    case 'chrome':
      return { roughness: 0.08, metalness: 0.96, clearcoat: 1.0, clearcoatRoughness: 0.06 };
    case 'carbon-weave':
      return { roughness: 0.36, metalness: 0.32, clearcoat: 0.65, clearcoatRoughness: 0.22 };
    case 'pearlescent':
      return { roughness: 0.18, metalness: 0.52, clearcoat: 1.0, clearcoatRoughness: 0.08 };
    default:
      return { roughness: 0.24, metalness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.12 };
  }
}

export interface CarMaterialSet {
  bodyMat: THREE.MeshPhysicalMaterial;
  primaryMat: THREE.MeshPhysicalMaterial;
  secondaryMat: THREE.MeshPhysicalMaterial;
  tertiaryMat: THREE.MeshStandardMaterial;
  carbonMat: THREE.MeshStandardMaterial;
  matteTrimMat: THREE.MeshStandardMaterial;
  titaniumMat: THREE.MeshStandardMaterial;
  canopyMat: THREE.MeshPhysicalMaterial;
  tireMat: THREE.MeshStandardMaterial;
  tireGrooveMat: THREE.MeshStandardMaterial;
  chromeMat: THREE.MeshStandardMaterial;
  rotorMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshStandardMaterial;
  bannerMat: THREE.MeshStandardMaterial;
  headlightMats: THREE.MeshStandardMaterial[];
  headlightHex: number;
  brakeLightMat: THREE.MeshStandardMaterial;
  rainLightMat: THREE.MeshStandardMaterial;
  caliperMat: THREE.MeshStandardMaterial;
}

/**
 * Builds the full PBR material palette for a procedural car rig and registers all
 * created textures/materials with the caller's disposable tracker.
 */
export function createCarMaterials(
  livery: LiveryConfig,
  classId: CarClassId,
  maxAniso: number,
  caliperColorHex: string,
  track: TrackDisposable,
): CarMaterialSet {
  let liveryTex: THREE.Texture;
  if (livery.customTexture) {
    try {
      const loader = new THREE.TextureLoader();
      liveryTex = track(loader.load(livery.customTexture));
      liveryTex.colorSpace = THREE.SRGBColorSpace;
      liveryTex.wrapS = THREE.RepeatWrapping;
      liveryTex.wrapT = THREE.RepeatWrapping;
      liveryTex.anisotropy = maxAniso;
    } catch {
      liveryTex = track(createLiveryTexture(livery, classId, maxAniso));
    }
  } else {
    liveryTex = track(createLiveryTexture(livery, classId, maxAniso));
  }
  const bannerTex = track(createWindshieldBannerTexture(livery.windshieldBanner, livery.secondaryColor, maxAniso));
  const carbonTex = track(createCarbonTexture(maxAniso));

  const finishPreset = getPaintFinishPreset(livery.paintFinish);

  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: livery.paintFinish === 'carbon-weave' ? carbonTex : liveryTex,
      roughness: finishPreset.roughness,
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat,
      clearcoatRoughness: finishPreset.clearcoatRoughness,
      iridescence: livery.paintFinish === 'pearlescent' ? 0.85 : 0,
      iridescenceIOR: 1.45,
    }),
  );

  const primaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.primaryColor),
      roughness: finishPreset.roughness,
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat,
      clearcoatRoughness: finishPreset.clearcoatRoughness,
      iridescence: livery.paintFinish === 'pearlescent' ? 0.85 : 0,
    }),
  );

  const secondaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.secondaryColor),
      roughness: Math.min(0.85, finishPreset.roughness + 0.04),
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat * 0.85,
    }),
  );

  const tertiaryMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(livery.tertiaryColor),
      roughness: 0.35,
      metalness: 0.3,
    }),
  );

  const carbonMat = track(
    new THREE.MeshStandardMaterial({
      map: carbonTex,
      roughness: 0.45,
      metalness: 0.25,
    }),
  );

  const matteTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.82,
      metalness: 0.1,
    }),
  );

  const titaniumMat = track(
    new THREE.MeshStandardMaterial({
      name: 'TITANIUM_HALO',
      color: 0x9ca3af,
      roughness: 0.26,
      metalness: 0.88,
    }),
  );

  const canopySpec = (() => {
    switch (livery.windowTint ?? 'smoke') {
      case 'clear':
        return { hex: 0x1e293b, op: 0.52 };
      case 'dark':
        return { hex: 0x05080f, op: 0.94 };
      case 'mirror':
        return { hex: 0x38bdf8, op: 0.88 };
      default:
        return { hex: 0x0a111d, op: 0.84 };
    }
  })();
  const canopyMat = track(createCarGlassMaterial(canopySpec.hex, canopySpec.op, 'CANOPY_GLASS'));
  if (livery.windowTint === 'mirror') {
    canopyMat.metalness = 0.92;
    canopyMat.roughness = 0.06;
  }

  const tireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x171a20,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );

  const tireGrooveMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x07090c,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );

  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.95,
      roughness: 0.12,
    }),
  );

  const rotorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a3f48,
      emissive: 0xff3b00,
      emissiveIntensity: 0,
      metalness: 0.92,
      roughness: 0.25,
    }),
  );

  const rimInfo = getRimColorAndMetalness(livery.rimFinish, livery.primaryColor);
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(rimInfo.color),
      metalness: rimInfo.metalness,
      roughness: rimInfo.roughness,
    }),
  );

  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.3,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const headlightHex = getHeadlightHex(livery.headlightTint, classId);
  const headlightMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 2; i++) {
    const hm = track(
      new THREE.MeshStandardMaterial({
        color: headlightHex,
        emissive: headlightHex,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    headlightMats.push(hm);
  }

  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.75,
      roughness: 0.22,
    }),
  );

  const rainLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xff1e1e,
      emissive: 0xff1e1e,
      emissiveIntensity: 0.3,
      roughness: 0.2,
    }),
  );

  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(caliperColorHex),
      roughness: 0.32,
      metalness: 0.45,
    }),
  );

  return {
    bodyMat,
    primaryMat,
    secondaryMat,
    tertiaryMat,
    carbonMat,
    matteTrimMat,
    titaniumMat,
    canopyMat,
    tireMat,
    tireGrooveMat,
    chromeMat,
    rotorMat,
    rimMat,
    bannerMat,
    headlightMats,
    headlightHex,
    brakeLightMat,
    rainLightMat,
    caliperMat,
  };
}
