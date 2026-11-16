import * as THREE from 'three';
import { BodySilhouette, CarClassId, HeadlightTint, LiveryConfig, RimFinish } from '../game/types';
import {
  createCarbonTexture,
  createContactShadowTexture,
  createLiveryTexture,
  createNumberPlateTexture,
  createWindshieldBannerTexture,
} from './proceduralTextures';

export interface BuiltCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Group[];
  allWheels: THREE.Group[];
  frontWingFlap: THREE.Mesh | null;
  rearWingFlap: THREE.Mesh | null;
  headlightMats: THREE.MeshStandardMaterial[];
  brakeLightMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

interface ClosedWheelDesign {
  cabinOffsetZ: number;
  cabinScaleW: number;
  cabinScaleH: number;
  cabinScaleL: number;
  noseHeightRatio: number;
  tailHeightRatio: number;
  widthScale: number;
  lengthScale: number;
  grilleStyle:
    | 'none'
    | 'bmw-kidney'
    | 'aston-wings'
    | 'mustang-pony'
    | 'merc-panamericana'
    | 'lexus-spindle'
    | 'porsche-992'
    | 'corvette-wedge'
    | 'ferrari-split'
    | 'mclaren-eye'
    | 'gtr-v'
    | 'lmp-intake';
  headlightStyle: 'blade' | 'vertical-stack' | 'round-911' | 'c-clamp' | 'fang' | 'twin-pod';
  sidepodStyle: 'undercut' | 'venturi-tunnel' | 'louvered' | 'sculpted-intake' | 'clean-street';
  rearDeckStyle:
    | 'wingless-9x8'
    | 'split-499p'
    | 'swan-neck'
    | 'strut-race'
    | 'ducktail-rs'
    | 'active-lip'
    | 'deck-tunnel';
  exhaustStyle: 'rear-dual' | 'rear-center' | 'top-exit' | 'side-exit';
  sharkFinStyle: 'none' | 'tall-proto' | 'curved-lmh' | 'roof-scoop';
}

const CLOSED_WHEEL_DESIGNS: Record<string, ClosedWheelDesign> = {
  // ================= WEC HYPERCAR / IMSA GTP (12 distinct chassis) =================
  'ferrari-499p': {
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.80,
    widthScale: 1.0,
    lengthScale: 1.02,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'split-499p',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
  },
  'toyota-gr010': {
    cabinOffsetZ: 0.04,
    cabinScaleW: 1.0,
    cabinScaleH: 1.02,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.62,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 1.0,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
  },
  'porsche-963': {
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
  },
  'cadillac-vseries-r': {
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.02,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
  },
  'bmw-m-hybrid-v8': {
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.60,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 1.0,
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
  },
  'acura-arx-06': {
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.90,
    cabinScaleH: 0.96,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.78,
    widthScale: 0.98,
    lengthScale: 1.01,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
  },
  'alpine-a424': {
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.95,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.55,
    tailHeightRatio: 0.78,
    widthScale: 0.99,
    lengthScale: 1.03,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
  },
  'peugeot-9x8': {
    cabinOffsetZ: 0.07,
    cabinScaleW: 0.92,
    cabinScaleH: 0.92,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.70,
    widthScale: 1.02,
    lengthScale: 1.02,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'fang',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'wingless-9x8',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
  },
  'aston-valkyrie-lmh': {
    cabinOffsetZ: 0.09,
    cabinScaleW: 0.84,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.68,
    widthScale: 0.96,
    lengthScale: 1.01,
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
  },
  'lamborghini-sc63': {
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.80,
    widthScale: 1.01,
    lengthScale: 1.02,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
  },
  'genesis-gmr-001': {
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.78,
    widthScale: 1.0,
    lengthScale: 1.03,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
  },
  'glickenhaus-scg-007': {
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 1.02,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.76,
    widthScale: 0.98,
    lengthScale: 0.99,
    grilleStyle: 'lmp-intake',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'roof-scoop',
  },

  // ================= GTD Pro / LMGT3 (10 distinct chassis) =================
  'porsche-911-gt3-r': {
    cabinOffsetZ: -0.18,
    cabinScaleW: 0.96,
    cabinScaleH: 1.04,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.98,
    lengthScale: 0.96,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'ferrari-296-gt3': {
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.92,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
  },
  'corvette-z06-gt3r': {
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.86,
    widthScale: 1.03,
    lengthScale: 1.01,
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
  },
  'bmw-m4-gt3': {
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.02,
    lengthScale: 1.03,
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
  },
  'ford-mustang-gt3': {
    cabinOffsetZ: -0.26,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.03,
    grilleStyle: 'mustang-pony',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
  },
  'aston-vantage-gt3': {
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.88,
    widthScale: 1.02,
    lengthScale: 1.0,
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
  },
  'lamborghini-temerario-gt3': {
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.98,
    cabinScaleH: 0.88,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.84,
    widthScale: 1.03,
    lengthScale: 1.0,
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'fang',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'roof-scoop',
  },
  'mercedes-amg-gt3': {
    cabinOffsetZ: -0.30,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.68,
    tailHeightRatio: 0.86,
    widthScale: 1.03,
    lengthScale: 1.04,
    grilleStyle: 'merc-panamericana',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
  },
  'lexus-rcf-gt3': {
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.02,
    cabinScaleH: 1.04,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.70,
    tailHeightRatio: 0.92,
    widthScale: 1.0,
    lengthScale: 1.02,
    grilleStyle: 'lexus-spindle',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
  },
  'mclaren-720s-gt3': {
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.94,
    cabinScaleH: 0.90,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.82,
    widthScale: 1.02,
    lengthScale: 0.99,
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },

  // ================= PRODUCTION TRACK COUPES (4 distinct street silhouettes) =================
  'bmw-m2-cs': {
    cabinOffsetZ: -0.18,
    cabinScaleW: 1.04,
    cabinScaleH: 1.12,
    cabinScaleL: 1.04,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.96,
    widthScale: 0.98,
    lengthScale: 0.95,
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
  },
  'porsche-911-gt3-rs': {
    cabinOffsetZ: -0.18,
    cabinScaleW: 0.96,
    cabinScaleH: 1.02,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.99,
    lengthScale: 0.96,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'corvette-z06-coupe': {
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.88,
    widthScale: 1.01,
    lengthScale: 1.0,
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'nissan-gtr-nismo': {
    cabinOffsetZ: -0.18,
    cabinScaleW: 1.04,
    cabinScaleH: 1.12,
    cabinScaleL: 1.04,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.98,
    widthScale: 0.99,
    lengthScale: 1.01,
    grilleStyle: 'gtr-v',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
  },

  // ================= PRODUCTION SUPERCARS & HYPERCARS (5 distinct street silhouettes) =================
  'ferrari-296-gtb': {
    cabinOffsetZ: 0.09,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 0.96,
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'mclaren-750s': {
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.94,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.01,
    lengthScale: 0.98,
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'ferrari-sf90': {
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.88,
    widthScale: 1.02,
    lengthScale: 1.01,
    grilleStyle: 'ferrari-split',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'deck-tunnel',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
  },
  'porsche-918-spyder': {
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.96,
    cabinScaleH: 0.86,
    cabinScaleL: 0.90,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.84,
    widthScale: 1.0,
    lengthScale: 0.99,
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'none',
  },
  'aston-valkyrie-road': {
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.82,
    cabinScaleH: 0.88,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.68,
    widthScale: 0.95,
    lengthScale: 1.0,
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
  },
};

let sharedShadowTex: THREE.CanvasTexture | null = null;
function getShadowTexture() {
  if (!sharedShadowTex) sharedShadowTex = createContactShadowTexture();
  return sharedShadowTex;
}

function getRimColorAndMetalness(finish: RimFinish, primaryColor: string): {
  color: string;
  metalness: number;
  roughness: number;
} {
  switch (finish) {
    case 'gloss-black':
      return { color: '#14171c', metalness: 0.45, roughness: 0.22 };
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

function getHeadlightHex(tint: HeadlightTint, classId: CarClassId): number {
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

function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  grooveMat?: THREE.Material,
  isGrooved = false,
): THREE.Group {
  const wheelGroup = new THREE.Group();

  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 22);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  if (isGrooved && grooveMat) {
    const grooveOffsets = [-width * 0.32, -width * 0.11, width * 0.11, width * 0.32];
    for (const gx of grooveOffsets) {
      const gGeo = new THREE.CylinderGeometry(radius + 0.003, radius + 0.003, width * 0.08, 22);
      gGeo.rotateZ(Math.PI / 2);
      const gMesh = new THREE.Mesh(gGeo, grooveMat);
      gMesh.position.x = gx;
      wheelGroup.add(gMesh);
    }
  }

  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rimMesh);

  const spokeGeo = new THREE.BoxGeometry(width + 0.04, radius * 1.12, radius * 0.14);
  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (s * Math.PI) / 3;
    wheelGroup.add(spoke);
  }

  return wheelGroup;
}

function createSuspensionArms(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  mat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const wishbones = [
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: -0.12, zOff1: 0 },
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: 0.12, zOff1: 0 },
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: -0.14, zOff1: 0 },
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: 0.14, zOff1: 0 },
    { y0: startY + 0.14, y1: endY - 0.06, zOff0: 0.05, zOff1: 0 },
  ];

  for (const wb of wishbones) {
    const p1 = new THREE.Vector3(startX, wb.y0, startZ + wb.zOff0);
    const p2 = new THREE.Vector3(endX, wb.y1, endZ + wb.zOff1);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const rodGeo = new THREE.CylinderGeometry(0.016, 0.016, len, 6);
    const rod = new THREE.Mesh(rodGeo, mat);
    rod.position.copy(p1).addScaledVector(dir, 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(rod);
  }

  return group;
}

/**
 * Builds a composite procedural 3D miniature car rig grounded at y = 0.
 * Spec/era-accurate shared open-wheel & LMP2 chassis + 31 distinct sculpted manufacturer silhouettes.
 */
export function buildDiecastCar(
  silhouette: BodySilhouette,
  classId: CarClassId,
  livery: LiveryConfig,
  maxAniso = 4,
  carId?: string,
): BuiltCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const liveryTex = track(createLiveryTexture(livery, classId, maxAniso));
  const numberPlateTex = track(createNumberPlateTexture(livery, classId, maxAniso));
  const bannerTex = track(createWindshieldBannerTexture(livery.windshieldBanner, livery.secondaryColor, maxAniso));
  const carbonTex = track(createCarbonTexture(maxAniso));

  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: liveryTex,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    }),
  );

  const secondaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.secondaryColor),
      roughness: 0.28,
      metalness: 0.2,
      clearcoat: 0.85,
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

  const canopyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1.0,
    }),
  );

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

  const rimInfo = getRimColorAndMetalness(livery.rimFinish, livery.primaryColor);
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(rimInfo.color),
      metalness: rimInfo.metalness,
      roughness: rimInfo.roughness,
    }),
  );

  const plateMat = track(
    new THREE.MeshStandardMaterial({
      map: numberPlateTex,
      roughness: 0.38,
      metalness: 0.05,
    }),
  );

  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.3,
      metalness: 0.1,
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
      emissiveIntensity: 0.7,
      roughness: 0.25,
    }),
  );

  // Contact shadow disc
  const shadowGeo = track(new THREE.PlaneGeometry(2.7, 4.5));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  // Archetype flags
  const isF1_2026 = classId === CarClassId.F1_2026;
  const isF1_2021 = classId === CarClassId.F1_2021;
  const isF1_2005 = classId === CarClassId.F1_2005;
  const isFormulaE = classId === CarClassId.FORMULA_E;
  const isFormula = isF1_2026 || isF1_2021 || isF1_2005 || isFormulaE || silhouette === 'formula';
  const isOpenWheel = isF1_2026 || isF1_2021 || isF1_2005;

  const isHypercar = classId === CarClassId.HYPERCAR_GTP;
  const isLmp2 = classId === CarClassId.LMP2 || silhouette === 'lmp2';
  const isProto = isHypercar || isLmp2;
  const isGT3 = classId === CarClassId.GT3 || silhouette === 'gt';
  const isStreetCar = classId === CarClassId.TRACK_COUPE || classId === CarClassId.SUPERCAR || silhouette === 'coupe' || silhouette === 'supercar';

  const design: ClosedWheelDesign = CLOSED_WHEEL_DESIGNS[carId ?? ''] ?? {
    cabinOffsetZ: isProto ? 0.04 : -0.1,
    cabinScaleW: 0.96,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: isLmp2 ? 0.52 : 0.62,
    tailHeightRatio: isStreetCar ? 0.90 : 0.84,
    widthScale: 1.0,
    lengthScale: 1.0,
    grilleStyle: isProto ? 'lmp-intake' : 'none',
    headlightStyle: 'blade',
    sidepodStyle: isProto ? 'undercut' : 'clean-street',
    rearDeckStyle: isStreetCar ? 'active-lip' : 'strut-race',
    exhaustStyle: isStreetCar ? 'rear-dual' : 'top-exit',
    sharkFinStyle: isProto ? 'tall-proto' : 'none',
  };

  const length = (isFormula ? (isFormulaE ? 3.7 : 3.92) : isProto ? 3.76 : 3.66) * (isFormula ? 1 : design.lengthScale);
  const width = (isFormula ? 1.88 : isGT3 ? 1.95 : 1.90) * (isFormula ? 1 : design.widthScale);
  const wheelRadius = isFormula ? 0.36 : 0.35;
  const wheelWidth = isFormula ? 0.38 : 0.30;
  const wheelBaseZ = isFormula ? 1.26 : 1.18;
  const trackHalfX = isFormula ? 0.86 : 0.82;

  const floorGeo = track(new THREE.BoxGeometry(width * 0.92, 0.12, length * 0.94));
  const floorMesh = new THREE.Mesh(floorGeo, matteTrimMat);
  floorMesh.position.y = 0.20;
  floorMesh.castShadow = true;
  bodyGroup.add(floorMesh);

  let frontWingFlap: THREE.Mesh | null = null;
  let rearWingFlap: THREE.Mesh | null = null;

  if (isFormula) {
    if (isFormulaE) {
      // ================= FORMULA E GEN3 EVO SILHOUETTE =================
      const deltaShape = new THREE.Shape();
      deltaShape.moveTo(-0.28, -1.60);
      deltaShape.lineTo(-0.62, -0.60);
      deltaShape.lineTo(-0.62, 0.35);
      deltaShape.lineTo(-0.06, 1.85);
      deltaShape.lineTo(0.06, 1.85);
      deltaShape.lineTo(0.62, 0.35);
      deltaShape.lineTo(0.62, -0.60);
      deltaShape.lineTo(0.28, -1.60);
      deltaShape.closePath();

      const feHullGeo = track(
        new THREE.ExtrudeGeometry(deltaShape, {
          depth: 0.34,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.05,
          bevelSegments: 2,
        }),
      );
      feHullGeo.rotateX(Math.PI / 2);
      const posAttr = feHullGeo.attributes.position;
      const uvAttr = feHullGeo.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        uvAttr.setXY(i, (posAttr.getX(i) + 0.8) / 1.6, (posAttr.getZ(i) + 1.8) / 3.6);
      }
      const feHullMesh = new THREE.Mesh(feHullGeo, bodyMat);
      feHullMesh.position.y = 0.60;
      feHullMesh.castShadow = true;
      bodyGroup.add(feHullMesh);

      // Enclosed front wheel fairings (GEN3 Evo regulation shrouds)
      const fwFairingGeo = track(new THREE.BoxGeometry(0.38, 0.32, 0.88));
      for (const sx of [-trackHalfX, trackHalfX]) {
        const fairing = new THREE.Mesh(fwFairingGeo, secondaryMat);
        fairing.position.set(sx * 0.98, 0.42, wheelBaseZ + 0.12);
        fairing.rotation.y = sx < 0 ? 0.08 : -0.08;
        fairing.castShadow = true;
        bodyGroup.add(fairing);
      }

      // Cockpit Halo
      const haloCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.24, 0.72, -0.05),
        new THREE.Vector3(-0.18, 0.85, 0.25),
        new THREE.Vector3(0, 0.86, 0.48),
        new THREE.Vector3(0.18, 0.85, 0.25),
        new THREE.Vector3(0.24, 0.72, -0.05),
      ]);
      const haloGeo = track(new THREE.TubeGeometry(haloCurve, 16, 0.03, 8, false));
      const haloMesh = new THREE.Mesh(haloGeo, matteTrimMat);
      bodyGroup.add(haloMesh);

      const helmetGeo = track(new THREE.SphereGeometry(0.18, 14, 12));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.74, 0.12);
      bodyGroup.add(helmet);

      // Twin rear winglets over rear wheels (NO central beam wing)
      const wingletGeo = track(new THREE.BoxGeometry(0.42, 0.28, 0.48));
      for (const sx of [-0.68, 0.68]) {
        const winglet = new THREE.Mesh(wingletGeo, secondaryMat);
        winglet.position.set(sx, 0.74, -1.55);
        winglet.rotation.z = sx < 0 ? -0.22 : 0.22;
        winglet.rotation.x = -0.12;
        winglet.castShadow = true;
        bodyGroup.add(winglet);
      }

      const nosePlateGeo = track(new THREE.PlaneGeometry(0.34, 0.26));
      nosePlateGeo.rotateX(-Math.PI / 2 + 0.15);
      const nosePlate = new THREE.Mesh(nosePlateGeo, plateMat);
      nosePlate.position.set(0, 0.62, 1.25);
      bodyGroup.add(nosePlate);

      [-0.14, 0.14].forEach((hx, idx) => {
        const hlGeo = track(new THREE.BoxGeometry(0.09, 0.05, 0.05));
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.35, 1.82);
        bodyGroup.add(hl);
      });
    } else {
      // ================= F1 SPEC ERA SILHOUETTES (2026 / 2021 / 2005) =================
      const hullShape = new THREE.Shape();
      hullShape.moveTo(-0.30, -1.65);
      hullShape.lineTo(isF1_2021 ? -0.70 : -0.60, -0.65);
      hullShape.lineTo(isF1_2021 ? -0.70 : -0.60, 0.42);
      hullShape.lineTo(isF1_2005 ? -0.18 : -0.22, 1.74);
      hullShape.lineTo(isF1_2005 ? 0.18 : 0.22, 1.74);
      hullShape.lineTo(isF1_2021 ? 0.70 : 0.60, 0.42);
      hullShape.lineTo(isF1_2021 ? 0.70 : 0.60, -0.65);
      hullShape.lineTo(0.30, -1.65);
      hullShape.closePath();

      const hullGeo = track(
        new THREE.ExtrudeGeometry(hullShape, {
          depth: 0.35,
          bevelEnabled: true,
          bevelThickness: 0.07,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
      );
      hullGeo.rotateX(Math.PI / 2);
      const posAttr = hullGeo.attributes.position;
      const uvAttr = hullGeo.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        uvAttr.setXY(i, (posAttr.getX(i) + 0.9) / 1.8, (posAttr.getZ(i) + 1.8) / 3.6);
      }
      const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
      hullMesh.position.y = 0.62;
      hullMesh.castShadow = true;
      bodyGroup.add(hullMesh);

      const airboxGeo = track(new THREE.BoxGeometry(0.32, 0.38, 1.15));
      const airboxMesh = new THREE.Mesh(airboxGeo, secondaryMat);
      airboxMesh.position.set(0, 0.78, -0.58);
      airboxMesh.castShadow = true;
      bodyGroup.add(airboxMesh);

      const helmetGeo = track(new THREE.SphereGeometry(0.19, 16, 14));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.76, 0.14);
      bodyGroup.add(helmet);

      if (isF1_2005) {
        // 2005 F1: NO Halo, raised headrest coaming, V10 sidepod chimneys + flip-ups
        const coamingGeo = track(new THREE.BoxGeometry(0.38, 0.16, 0.52));
        const coaming = new THREE.Mesh(coamingGeo, secondaryMat);
        coaming.position.set(0, 0.75, -0.08);
        bodyGroup.add(coaming);

        for (const sx of [-0.46, 0.46]) {
          const chimneyGeo = track(new THREE.CylinderGeometry(0.04, 0.06, 0.24, 8));
          const chimney = new THREE.Mesh(chimneyGeo, matteTrimMat);
          chimney.position.set(sx, 0.75, -0.32);
          bodyGroup.add(chimney);
        }
      } else {
        // 2021 & 2026 F1: Titanium Halo
        const haloCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.24, 0.72, -0.05),
          new THREE.Vector3(-0.18, 0.85, 0.25),
          new THREE.Vector3(0, 0.86, 0.48),
          new THREE.Vector3(0.18, 0.85, 0.25),
          new THREE.Vector3(0.24, 0.72, -0.05),
        ]);
        const haloGeo = track(new THREE.TubeGeometry(haloCurve, 16, 0.032, 8, false));
        const haloMesh = new THREE.Mesh(haloGeo, livery.carbonHood ? carbonMat : matteTrimMat);
        bodyGroup.add(haloMesh);
      }

      if (isF1_2021) {
        // 2021 F1: Intricate multi-vane bargeboards + sidepod boomerang vanes + floor winglets
        const bbGeo = track(new THREE.BoxGeometry(0.05, 0.34, 0.62));
        const floorWingGeo = track(new THREE.BoxGeometry(0.18, 0.04, 1.35));
        for (const sx of [-0.66, 0.66]) {
          const bb = new THREE.Mesh(bbGeo, carbonMat);
          bb.position.set(sx * 0.92, 0.42, 0.52);
          bb.rotation.y = sx < 0 ? 0.14 : -0.14;
          bodyGroup.add(bb);

          const fWing = new THREE.Mesh(floorWingGeo, carbonMat);
          fWing.position.set(sx * 1.18, 0.23, -0.2);
          bodyGroup.add(fWing);
        }
      }

      // Front Wing
      const fwWidth = isF1_2005 ? 1.72 : isF1_2026 ? 1.82 : 1.94;
      const fwGeo = track(new THREE.BoxGeometry(fwWidth, 0.07, 0.38));
      const fwMat = livery.carbonSplitter ? carbonMat : secondaryMat;
      const fwMesh = new THREE.Mesh(fwGeo, fwMat);
      fwMesh.position.set(0, 0.21, 1.74);
      fwMesh.castShadow = true;
      bodyGroup.add(fwMesh);

      if (isF1_2026) {
        // 2026 F1: Articulating Active Aero Front Wing Upper Flap
        const fwFlapGeo = track(new THREE.BoxGeometry(fwWidth * 0.92, 0.045, 0.18));
        frontWingFlap = new THREE.Mesh(fwFlapGeo, tertiaryMat);
        frontWingFlap.position.set(0, 0.28, 1.66);
        frontWingFlap.rotation.x = 0.22;
        bodyGroup.add(frontWingFlap);
      }

      const fweGeo = track(new THREE.BoxGeometry(0.05, 0.22, 0.46));
      for (const sx of [-fwWidth * 0.5, fwWidth * 0.5]) {
        const fwe = new THREE.Mesh(fweGeo, tertiaryMat);
        fwe.position.set(sx, 0.28, 1.74);
        bodyGroup.add(fwe);
      }

      // Rear Wing
      const rwWidth = isF1_2005 ? 0.96 : isF1_2026 ? 1.14 : 1.24;
      const rwHeight = isF1_2005 ? 1.10 : 0.98;
      const wingMat = livery.carbonWing ? carbonMat : secondaryMat;

      const rwStrutGeo = track(new THREE.BoxGeometry(0.05, isF1_2005 ? 0.66 : 0.56, 0.32));
      for (const sx of [-0.42, 0.42]) {
        const strut = new THREE.Mesh(rwStrutGeo, matteTrimMat);
        strut.position.set(sx, (rwHeight + 0.45) * 0.5, -1.68);
        bodyGroup.add(strut);
      }

      const rwMainGeo = track(new THREE.BoxGeometry(rwWidth, 0.07, 0.28));
      const rwMain = new THREE.Mesh(rwMainGeo, wingMat);
      rwMain.position.set(0, rwHeight, -1.68);
      rwMain.castShadow = true;
      bodyGroup.add(rwMain);

      const rwFlapGeo = track(new THREE.BoxGeometry(rwWidth * 0.96, 0.05, 0.22));
      rearWingFlap = new THREE.Mesh(rwFlapGeo, tertiaryMat);
      rearWingFlap.position.set(0, rwHeight + 0.08, -1.75);
      rearWingFlap.rotation.x = isF1_2026 ? 0.38 : 0.34;
      bodyGroup.add(rearWingFlap);

      const rweGeo = track(new THREE.BoxGeometry(0.04, 0.36, 0.44));
      for (const sx of [-rwWidth * 0.5, rwWidth * 0.5]) {
        const rwe = new THREE.Mesh(rweGeo, secondaryMat);
        rwe.position.set(sx, rwHeight, -1.68);
        bodyGroup.add(rwe);
      }

      const nosePlateGeo = track(new THREE.PlaneGeometry(0.36, 0.28));
      nosePlateGeo.rotateX(-Math.PI / 2 + 0.14);
      const nosePlate = new THREE.Mesh(nosePlateGeo, plateMat);
      nosePlate.position.set(0, 0.64, 1.15);
      bodyGroup.add(nosePlate);

      const rainGeo = track(new THREE.BoxGeometry(0.14, 0.12, 0.06));
      const rainLight = new THREE.Mesh(rainGeo, brakeLightMat);
      rainLight.position.set(0, 0.42, -1.84);
      bodyGroup.add(rainLight);

      const hlGeo = track(new THREE.BoxGeometry(0.12, 0.06, 0.06));
      [-0.18, 0.18].forEach((hx, idx) => {
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.34, 1.86);
        bodyGroup.add(hl);
      });
    }
  } else {
    // ================= 31 SCULPTED CLOSED-WHEEL MODELS + LMP2 SPEC =================
    const bodyWidth = width * 0.96;
    const bodyLen = length * 0.94;
    const bodyHeight = isProto ? 0.38 : 0.48;

    const profile = new THREE.Shape();
    profile.moveTo(-bodyLen * 0.5, 0);
    profile.lineTo(-bodyLen * 0.49, bodyHeight * design.tailHeightRatio);
    profile.lineTo(-bodyLen * 0.24, bodyHeight);
    profile.lineTo(bodyLen * 0.24, bodyHeight);
    profile.lineTo(bodyLen * 0.47, bodyHeight * design.noseHeightRatio);
    profile.lineTo(bodyLen * 0.5, 0.06);
    profile.lineTo(bodyLen * 0.5, 0);
    profile.closePath();

    const bodyGeo = track(
      new THREE.ExtrudeGeometry(profile, {
        depth: bodyWidth,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.06,
        bevelSegments: 2,
      }),
    );
    bodyGeo.rotateY(-Math.PI / 2);
    bodyGeo.translate(bodyWidth * 0.5, 0.24, 0);

    const posAttr = bodyGeo.attributes.position;
    const uvAttr = bodyGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      uvAttr.setXY(
        i,
        (posAttr.getX(i) + bodyWidth * 0.55) / (bodyWidth * 1.1),
        1 - (posAttr.getZ(i) + bodyLen * 0.52) / (bodyLen * 1.04),
      );
    }

    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // Sculpted Wheel Arch Flares
    const archRadius = isStreetCar ? 0.40 : 0.44;
    const archGeo = track(new THREE.CylinderGeometry(archRadius, archRadius + 0.025, 0.22, 14, 1, false, 0, Math.PI));
    archGeo.rotateZ(Math.PI / 2);
    for (const sx of [-bodyWidth * 0.49, bodyWidth * 0.49]) {
      for (const sz of [-wheelBaseZ, wheelBaseZ]) {
        const arch = new THREE.Mesh(archGeo, design.sidepodStyle === 'clean-street' ? bodyMat : secondaryMat);
        arch.position.set(sx, 0.36, sz);
        arch.castShadow = true;
        bodyGroup.add(arch);
      }
    }

    // LMP2 Twin-Keel Stepped Nose Cone
    if (isLmp2) {
      const noseGeo = track(new THREE.BoxGeometry(0.68, 0.24, 0.72));
      const noseMesh = new THREE.Mesh(noseGeo, secondaryMat);
      noseMesh.position.set(0, 0.42, bodyLen * 0.38);
      noseMesh.castShadow = true;
      bodyGroup.add(noseMesh);
    }

    // Signature Manufacturer Nose & Front Grille Sculpting
    const frontZ = bodyLen * 0.5 + 0.05;
    if (design.grilleStyle === 'bmw-kidney') {
      const kidneyGeo = track(new THREE.BoxGeometry(0.24, 0.24, 0.06));
      for (const gx of [-0.17, 0.17]) {
        const k = new THREE.Mesh(kidneyGeo, matteTrimMat);
        k.position.set(gx, 0.38, frontZ);
        bodyGroup.add(k);
        const trim = new THREE.Mesh(track(new THREE.BoxGeometry(0.27, 0.27, 0.04)), chromeMat);
        trim.position.set(gx, 0.38, frontZ - 0.01);
        bodyGroup.add(trim);
      }
    } else if (design.grilleStyle === 'merc-panamericana') {
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.22, 0.06)), matteTrimMat);
      frame.position.set(0, 0.36, frontZ);
      bodyGroup.add(frame);
      for (let gx = -0.36; gx <= 0.36; gx += 0.12) {
        const slat = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.20, 0.07)), chromeMat);
        slat.position.set(gx, 0.36, frontZ + 0.01);
        bodyGroup.add(slat);
      }
    } else if (design.grilleStyle === 'aston-wings') {
      const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.96, 0.18, 0.06)), matteTrimMat);
      mesh.position.set(0, 0.32, frontZ);
      bodyGroup.add(mesh);
      const bar = new THREE.Mesh(track(new THREE.BoxGeometry(0.88, 0.03, 0.07)), tertiaryMat);
      bar.position.set(0, 0.34, frontZ + 0.01);
      bodyGroup.add(bar);
    } else if (design.grilleStyle === 'mustang-pony') {
      const hex = new THREE.Mesh(track(new THREE.BoxGeometry(0.84, 0.24, 0.06)), matteTrimMat);
      hex.position.set(0, 0.38, frontZ);
      bodyGroup.add(hex);
      const hoodVent = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.04, 0.42)), carbonMat);
      hoodVent.position.set(0, bodyHeight + 0.24, bodyLen * 0.24);
      bodyGroup.add(hoodVent);
    } else if (design.grilleStyle === 'lexus-spindle') {
      const topSpindle = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.16, 0.06)), matteTrimMat);
      topSpindle.position.set(0, 0.40, frontZ);
      bodyGroup.add(topSpindle);
      const lowSpindle = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.16, 0.06)), matteTrimMat);
      lowSpindle.position.set(0, 0.27, frontZ);
      bodyGroup.add(lowSpindle);
    } else if (design.grilleStyle === 'gtr-v') {
      const gtr = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 0.26, 0.06)), matteTrimMat);
      gtr.position.set(0, 0.36, frontZ);
      bodyGroup.add(gtr);
      const vBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.80, 0.05, 0.07)), chromeMat);
      vBar.position.set(0, 0.42, frontZ + 0.01);
      bodyGroup.add(vBar);
    } else if (design.grilleStyle === 'porsche-992') {
      const intake = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 0.13, 0.06)), matteTrimMat);
      intake.position.set(0, 0.27, frontZ);
      bodyGroup.add(intake);
    } else if (design.grilleStyle === 'ferrari-split' || design.grilleStyle === 'mclaren-eye' || design.grilleStyle === 'corvette-wedge') {
      for (const gx of [-0.46, 0.46]) {
        const intake = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.14, 0.06)), matteTrimMat);
        intake.position.set(gx, 0.30, frontZ);
        bodyGroup.add(intake);
      }
    }

    // Cockpit Canopy / Greenhouse positioned dynamically per engine layout (FR vs MR vs RR)
    const cabinW = (isProto ? (isLmp2 ? 0.88 : 0.94) : isStreetCar ? 1.24 : 1.18) * design.cabinScaleW;
    const cabinH = (isProto ? 0.36 : 0.42) * design.cabinScaleH;
    const cabinL = (isProto ? 1.66 : isStreetCar ? 1.82 : 1.70) * design.cabinScaleL;
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-cabinL * 0.5, 0);
    cabinShape.lineTo(-cabinL * 0.42, cabinH * 0.72);
    cabinShape.lineTo(-cabinL * 0.12, cabinH);
    cabinShape.lineTo(cabinL * 0.22, cabinH);
    cabinShape.lineTo(cabinL * 0.5, 0.04);
    cabinShape.lineTo(cabinL * 0.5, 0);
    cabinShape.closePath();

    const cabinGeo = track(
      new THREE.ExtrudeGeometry(cabinShape, {
        depth: cabinW,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.05,
        bevelSegments: 2,
      }),
    );
    cabinGeo.rotateY(-Math.PI / 2);
    cabinGeo.translate(cabinW * 0.5, isProto ? 0.56 : 0.64, design.cabinOffsetZ);
    const cabin = new THREE.Mesh(cabinGeo, canopyMat);
    cabin.castShadow = true;
    bodyGroup.add(cabin);

    // Sidepod / Venturi / Louver Sculpting
    if (design.sidepodStyle === 'venturi-tunnel') {
      const tunnelGeo = track(new THREE.BoxGeometry(0.24, 0.26, 1.4));
      for (const sx of [-0.62, 0.62]) {
        const tunnel = new THREE.Mesh(tunnelGeo, matteTrimMat);
        tunnel.position.set(sx, 0.42, 0.08);
        bodyGroup.add(tunnel);
      }
    } else if (design.sidepodStyle === 'sculpted-intake') {
      const scoopGeo = track(new THREE.BoxGeometry(0.14, 0.28, 0.76));
      for (const sx of [-bodyWidth * 0.51, bodyWidth * 0.51]) {
        const scoop = new THREE.Mesh(scoopGeo, matteTrimMat);
        scoop.position.set(sx, 0.46, -0.25);
        bodyGroup.add(scoop);
      }
    } else if (design.sidepodStyle === 'louvered') {
      const louverGeo = track(new THREE.BoxGeometry(0.26, 0.04, 0.44));
      for (const sx of [-bodyWidth * 0.36, bodyWidth * 0.36]) {
        const louver = new THREE.Mesh(louverGeo, matteTrimMat);
        louver.position.set(sx, bodyHeight + 0.25, wheelBaseZ);
        bodyGroup.add(louver);
      }
    }

    // Prototype Dorsal Shark Fin / Roof Airbox Snorkel
    if (design.sharkFinStyle === 'tall-proto' || design.sharkFinStyle === 'curved-lmh') {
      const finHeight = isLmp2 ? 0.34 : design.sharkFinStyle === 'curved-lmh' ? 0.28 : 0.32;
      const finGeo = track(new THREE.BoxGeometry(0.06, finHeight, 1.05));
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(0, 0.82, -0.92);
      bodyGroup.add(fin);
    } else if (design.sharkFinStyle === 'roof-scoop') {
      const scoop = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.18, 0.78)), carbonMat);
      scoop.position.set(0, 0.94, design.cabinOffsetZ - 0.55);
      bodyGroup.add(scoop);
      if (isProto) {
        const fin = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.24, 0.86)), secondaryMat);
        fin.position.set(0, 0.80, -0.98);
        bodyGroup.add(fin);
      }
    }

    // GT3 Aerodynamic Dive-Plane Canards
    if (isGT3) {
      const canardGeo = track(new THREE.BoxGeometry(0.24, 0.04, 0.14));
      for (const sx of [-bodyWidth * 0.48, bodyWidth * 0.48]) {
        for (const cy of [0.34, 0.46]) {
          const canard = new THREE.Mesh(canardGeo, carbonMat);
          canard.position.set(sx, cy, bodyLen * 0.48);
          canard.rotation.z = sx < 0 ? 0.18 : -0.18;
          canard.rotation.x = -0.12;
          bodyGroup.add(canard);
        }
      }
    }

    // Windshield Banner
    if (!isStreetCar) {
      const bannerGeo = track(new THREE.PlaneGeometry(cabinW * 0.92, 0.14));
      bannerGeo.rotateX(-0.62);
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bannerMesh.position.set(0, isProto ? 0.84 : 0.94, design.cabinOffsetZ + cabinL * 0.34);
      bodyGroup.add(bannerMesh);
    }

    // Front Splitter
    const splitterGeo = track(
      new THREE.BoxGeometry(bodyWidth * (isGT3 ? 1.08 : isStreetCar ? 1.01 : 1.04), 0.06, isGT3 ? 0.38 : isStreetCar ? 0.20 : 0.32),
    );
    const splitterMesh = new THREE.Mesh(
      splitterGeo,
      livery.carbonSplitter || isGT3 ? carbonMat : tertiaryMat,
    );
    splitterMesh.position.set(0, 0.18, bodyLen * 0.5 + 0.04);
    bodyGroup.add(splitterMesh);

    // Rear Diffuser
    const diffGeo = track(new THREE.BoxGeometry(bodyWidth * 0.88, 0.12, 0.22));
    const diffMesh = new THREE.Mesh(diffGeo, matteTrimMat);
    diffMesh.position.set(0, 0.22, -bodyLen * 0.5);
    bodyGroup.add(diffMesh);

    // Exhaust Placement per Manufacturer Architecture
    if (design.exhaustStyle === 'rear-dual') {
      const exGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.36, -0.25, 0.25, 0.36]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.25, -bodyLen * 0.52);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'rear-center') {
      const exGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.09, 0.09]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.28, -bodyLen * 0.52);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'top-exit') {
      const exGeo = track(new THREE.CylinderGeometry(0.05, 0.06, 0.10, 10));
      for (const ex of [-0.16, 0.16]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.65, -bodyLen * 0.18);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'side-exit') {
      const exGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10));
      exGeo.rotateZ(Math.PI / 2);
      for (const sx of [-bodyWidth * 0.52, bodyWidth * 0.52]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(sx, 0.22, -0.35);
        bodyGroup.add(exhaust);
      }
    }

    // Rear Wing / Spoiler per Model
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
    if (design.rearDeckStyle === 'wingless-9x8') {
      const lowLip = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.94, 0.06, 0.20)), carbonMat);
      lowLip.position.set(0, 0.68, -bodyLen * 0.48);
      bodyGroup.add(lowLip);
    } else if (design.rearDeckStyle === 'split-499p') {
      const halfW = bodyWidth * 0.42;
      for (const sx of [-0.52, 0.52]) {
        const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.42, 0.22)), matteTrimMat);
        strut.position.set(sx, 0.78, -bodyLen * 0.44);
        bodyGroup.add(strut);

        const wing = new THREE.Mesh(track(new THREE.BoxGeometry(halfW, 0.07, 0.32)), wingMat);
        wing.position.set(sx > 0 ? halfW * 0.5 + 0.10 : -halfW * 0.5 - 0.10, 0.99, -bodyLen * 0.46);
        wing.castShadow = true;
        bodyGroup.add(wing);
      }
      const lowerBar = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.92, 0.05, 0.22)), secondaryMat);
      lowerBar.position.set(0, 0.76, -bodyLen * 0.48);
      bodyGroup.add(lowerBar);
    } else if (design.rearDeckStyle === 'active-lip') {
      const lip = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.80, 0.05, 0.14)), wingMat);
      lip.position.set(0, 0.70, -bodyLen * 0.48);
      bodyGroup.add(lip);
      rearWingFlap = lip;
    } else if (design.rearDeckStyle === 'deck-tunnel') {
      for (const sx of [-0.52, 0.52]) {
        const buttress = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.18, 0.85)), bodyMat);
        buttress.position.set(sx, 0.72, -bodyLen * 0.26);
        bodyGroup.add(buttress);
      }
      const lip = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.84, 0.05, 0.16)), wingMat);
      lip.position.set(0, 0.72, -bodyLen * 0.48);
      bodyGroup.add(lip);
    } else if (design.rearDeckStyle === 'ducktail-rs') {
      const wingWidth = bodyWidth * 0.98;
      for (const sx of [-0.46, 0.46]) {
        const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.36, 0.18)), matteTrimMat);
        strut.position.set(sx, 0.80, -bodyLen * 0.44);
        bodyGroup.add(strut);
      }
      const wingMesh = new THREE.Mesh(track(new THREE.BoxGeometry(wingWidth, 0.07, 0.28)), wingMat);
      wingMesh.position.set(0, 0.96, -bodyLen * 0.46);
      wingMesh.castShadow = true;
      bodyGroup.add(wingMesh);
      rearWingFlap = wingMesh;
    } else {
      // swan-neck or strut-race
      const isSwan = design.rearDeckStyle === 'swan-neck';
      const strutGeo = track(new THREE.BoxGeometry(0.07, isSwan ? 0.44 : 0.38, 0.24));
      for (const sx of [-0.52, 0.52]) {
        const strut = new THREE.Mesh(strutGeo, matteTrimMat);
        strut.position.set(sx, isSwan ? 0.82 : 0.76, isSwan ? -bodyLen * 0.41 : -bodyLen * 0.44);
        bodyGroup.add(strut);
      }
      const wingWidth = bodyWidth * (isGT3 ? 1.03 : 0.96);
      const wingMesh = new THREE.Mesh(track(new THREE.BoxGeometry(wingWidth, 0.07, 0.34)), wingMat);
      wingMesh.position.set(0, 0.98, -bodyLen * 0.46);
      wingMesh.castShadow = true;
      bodyGroup.add(wingMesh);
      rearWingFlap = wingMesh;

      const epGeo = track(new THREE.BoxGeometry(0.05, 0.26, 0.44));
      for (const sx of [-wingWidth * 0.5, wingWidth * 0.5]) {
        const ep = new THREE.Mesh(epGeo, tertiaryMat);
        ep.position.set(sx, 0.98, -bodyLen * 0.46);
        bodyGroup.add(ep);
      }
    }

    // Door Number Plates (race cars only)
    if (!isStreetCar) {
      const doorPlateGeo = track(new THREE.PlaneGeometry(0.62, 0.44));
      const leftPlate = new THREE.Mesh(doorPlateGeo, plateMat);
      leftPlate.rotation.y = -Math.PI / 2;
      leftPlate.position.set(-bodyWidth * 0.555, 0.48, 0.05);
      bodyGroup.add(leftPlate);

      const rightPlate = new THREE.Mesh(doorPlateGeo, plateMat);
      rightPlate.rotation.y = Math.PI / 2;
      rightPlate.position.set(bodyWidth * 0.555, 0.48, 0.05);
      bodyGroup.add(rightPlate);
    }

    // Distinct Signature Headlights per Model
    const hlZ = bodyLen * 0.5 + 0.02;
    [-0.64, 0.64].forEach((hx, idx) => {
      if (design.headlightStyle === 'vertical-stack') {
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.26, 0.08)), headlightMats[idx]);
        hl.position.set(hx * 1.06, 0.44, hlZ);
        bodyGroup.add(hl);
      } else if (design.headlightStyle === 'round-911') {
        const hl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12)), headlightMats[idx]);
        hl.rotation.x = Math.PI / 2;
        hl.position.set(hx * 1.02, 0.50, hlZ - 0.02);
        bodyGroup.add(hl);
      } else if (design.headlightStyle === 'fang') {
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.09, 0.08)), headlightMats[idx]);
        hl.position.set(hx, 0.44, hlZ);
        hl.rotation.z = hx < 0 ? 0.25 : -0.25;
        bodyGroup.add(hl);
      } else {
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.10, 0.08)), headlightMats[idx]);
        hl.position.set(hx, 0.42, hlZ);
        bodyGroup.add(hl);
      }
    });

    const tailGeo = track(new THREE.BoxGeometry(bodyWidth * 0.84, 0.09, 0.07));
    const tailBar = new THREE.Mesh(tailGeo, brakeLightMat);
    tailBar.position.set(0, 0.48, -bodyLen * 0.5 - 0.02);
    bodyGroup.add(tailBar);
  }

  // Four Rotating & Steering Wheels + Wishbones for Open-Wheelers
  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];

  const wheelCoords: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: -trackHalfX, z: wheelBaseZ, isFront: true },
    { x: trackHalfX, z: wheelBaseZ, isFront: true },
    { x: -trackHalfX, z: -wheelBaseZ, isFront: false },
    { x: trackHalfX, z: -wheelBaseZ, isFront: false },
  ];

  for (const wc of wheelCoords) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wc.x, wheelRadius, wc.z);

    const wheelMesh = createDiecastWheel(
      wheelRadius,
      wheelWidth,
      rimMat,
      tireMat,
      tireGrooveMat,
      isF1_2005,
    );
    steerPivot.add(wheelMesh);
    root.add(steerPivot);
    allWheels.push(wheelMesh);
    if (wc.isFront) {
      frontWheels.push(steerPivot);
    }

    if (isOpenWheel) {
      const chassisX = wc.x < 0 ? -0.32 : 0.32;
      const suspension = createSuspensionArms(
        chassisX,
        wheelRadius,
        wc.z,
        wc.x < 0 ? wc.x + wheelWidth * 0.45 : wc.x - wheelWidth * 0.45,
        wheelRadius,
        wc.z,
        matteTrimMat,
      );
      bodyGroup.add(suspension);
    }
  }

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    frontWingFlap,
    rearWingFlap,
    headlightMats,
    brakeLightMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
