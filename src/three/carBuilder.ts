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

export type CabinStyle =
  | 'proto-teardrop'
  | 'porsche-911'
  | 'mid-engine-buttress'
  | 'grand-tourer'
  | 'hatchback-clio'
  | 'lmp-gt3-hybrid';

interface ClosedWheelDesign {
  cabinStyle?: CabinStyle;
  cabinOffsetZ: number;
  cabinScaleW: number;
  cabinScaleH: number;
  cabinScaleL: number;
  noseHeightRatio: number;
  tailHeightRatio: number;
  widthScale: number;
  lengthScale: number;
  hoodStyle?: 'power-dome' | 'pontoon-channel' | 'standard';
  haunchScale?: number;
  grilleStyle:
    | 'none'
    | 'bmw-kidney'
    | 'bentley-matrix'
    | 'aston-wings'
    | 'mustang-pony'
    | 'merc-panamericana'
    | 'lexus-spindle'
    | 'porsche-992'
    | 'corvette-wedge'
    | 'ferrari-split'
    | 'mclaren-eye'
    | 'gtr-v'
    | 'audi-singleframe'
    | 'clio-hatch'
    | 'civic-fl5'
    | 'supra-nose'
    | 'alpine-arrow'
    | 'jesko-aero'
    | 'f80-blade'
    | 'w1-aero'
    | 'lmp-intake';
  headlightStyle:
    | 'blade'
    | 'vertical-stack'
    | 'round-911'
    | 'bentley-quad'
    | 'c-clamp'
    | 'fang'
    | 'twin-pod'
    | 'c-blade-rs01';
  sidepodStyle:
    | 'undercut'
    | 'venturi-tunnel'
    | 'louvered'
    | 'sculpted-intake'
    | 'clio-side-scoop'
    | 'clean-street';
  rearDeckStyle:
    | 'wingless-9x8'
    | 'split-499p'
    | 'swan-neck'
    | 'strut-race'
    | 'ducktail-rs'
    | 'active-lip'
    | 'deck-tunnel'
    | 'roof-spoiler-hatch'
    | 'jesko-boomerang'
    | 'w1-longtail';
  exhaustStyle: 'rear-dual' | 'rear-center' | 'top-exit' | 'side-exit' | 'clio-center-twin';
  sharkFinStyle: 'none' | 'tall-proto' | 'curved-lmh' | 'roof-scoop';
  caliperColor?: string;
}

const CLOSED_WHEEL_DESIGNS: Record<string, ClosedWheelDesign> = {
  // ================= WEC HYPERCAR / IMSA GTP (12 distinct chassis) =================
  'ferrari-499p': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.80,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'split-499p',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ef4444',
  },
  'toyota-gr010': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 1.0,
    cabinScaleH: 1.02,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.62,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#facc15',
  },
  'porsche-963': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#84cc16',
  },
  'cadillac-vseries-r': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#38bdf8',
  },
  'bmw-m-hybrid-v8': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#2563eb',
  },
  'acura-arx-06': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ef4444',
  },
  'alpine-a424': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.80,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#38bdf8',
  },
  'peugeot-9x8': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.92,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.76,
    widthScale: 1.03,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'fang',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'wingless-9x8',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'aston-valkyrie-lmh': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.88,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.74,
    widthScale: 0.98,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#a3e635',
  },
  'lamborghini-sc63': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.98,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'fang',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#84cc16',
  },
  'genesis-gmr-001': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ea580c',
  },
  'glickenhaus-scg-007': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.92,
    cabinScaleH: 0.98,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#dc2626',
  },

  // ================= LMP2 (Oreca 07 + Ligier JS P217) =================
  'oreca-07-united': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#f97316',
  },
  'oreca-07-europol': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#eab308',
  },
  'oreca-07-ao': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#7c3aed',
  },
  'ligier-js-p217': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#2563eb',
  },

  // ================= GTD Pro / LMGT3 (14 cars) =================
  'porsche-911-gt3-r': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: -0.16,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.98,
    lengthScale: 0.96,
    haunchScale: 1.08,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'ferrari-296-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.92,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'corvette-z06-gt3r': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.86,
    widthScale: 1.03,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'bmw-m4-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.02,
    lengthScale: 1.03,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'ford-mustang-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.26,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.03,
    hoodStyle: 'power-dome',
    grilleStyle: 'mustang-pony',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'aston-vantage-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.88,
    widthScale: 1.02,
    lengthScale: 1.0,
    hoodStyle: 'power-dome',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#a3e635',
  },
  'lamborghini-temerario-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.98,
    cabinScaleH: 0.88,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.84,
    widthScale: 1.03,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'mercedes-amg-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.26,
    cabinScaleW: 1.0,
    cabinScaleH: 1.02,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.70,
    tailHeightRatio: 0.92,
    widthScale: 1.03,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'merc-panamericana',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'lexus-rcf-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'lexus-spindle',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#f97316',
  },
  'mclaren-720s-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#f97316',
  },
  'renault-rs01-gt3': {
    cabinStyle: 'lmp-gt3-hybrid',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.94,
    cabinScaleH: 0.88,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'none',
    headlightStyle: 'c-blade-rs01',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'bentley-continental-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.04,
    cabinScaleH: 1.06,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.76,
    tailHeightRatio: 0.95,
    widthScale: 1.04,
    lengthScale: 1.04,
    hoodStyle: 'power-dome',
    haunchScale: 1.08,
    grilleStyle: 'bentley-matrix',
    headlightStyle: 'bentley-quad',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#22c55e',
  },
  'audi-r8-lms-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'audi-singleframe',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'acura-nsx-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.99,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },

  // ================= GT4 EUROPEAN / IMSA GS (8 cars) =================
  'porsche-cayman-gt4-rs': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.96,
    cabinScaleH: 0.94,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.88,
    widthScale: 0.98,
    lengthScale: 0.95,
    haunchScale: 1.06,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#0284c7',
  },
  'bmw-m4-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.02,
    cabinScaleH: 1.05,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#0284c7',
  },
  'aston-vantage-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.20,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.88,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'power-dome',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'toyota-supra-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.16,
    cabinScaleW: 0.96,
    cabinScaleH: 0.96,
    cabinScaleL: 0.92,
    noseHeightRatio: 0.60,
    tailHeightRatio: 0.90,
    widthScale: 0.99,
    lengthScale: 0.96,
    grilleStyle: 'supra-nose',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'mclaren-artura-gt4': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.96,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.01,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ea580c',
  },
  'mercedes-amg-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.0,
    cabinScaleH: 1.0,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.68,
    tailHeightRatio: 0.92,
    widthScale: 1.02,
    lengthScale: 1.01,
    hoodStyle: 'power-dome',
    grilleStyle: 'merc-panamericana',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'alpine-a110-gt4': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.94,
    cabinScaleH: 0.92,
    cabinScaleL: 0.92,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.86,
    widthScale: 0.96,
    lengthScale: 0.94,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'alpine-arrow',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'ford-mustang-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'mustang-pony',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },

  // ================= PRODUCTION TRACK COUPES (7 cars) =================
  'bmw-m2-cs': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.16,
    cabinScaleW: 1.0,
    cabinScaleH: 1.06,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.70,
    tailHeightRatio: 0.92,
    widthScale: 0.98,
    lengthScale: 0.96,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'porsche-911-gt3-rs': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: -0.18,
    cabinScaleW: 0.96,
    cabinScaleH: 1.02,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.99,
    lengthScale: 0.96,
    haunchScale: 1.10,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'corvette-z06-coupe': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.88,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'nissan-gtr-nismo': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.18,
    cabinScaleW: 1.04,
    cabinScaleH: 1.12,
    cabinScaleL: 1.04,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.98,
    widthScale: 0.99,
    lengthScale: 1.01,
    hoodStyle: 'power-dome',
    grilleStyle: 'gtr-v',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'renault-clio-v6': {
    cabinStyle: 'hatchback-clio',
    cabinOffsetZ: -0.06,
    cabinScaleW: 1.02,
    cabinScaleH: 1.08,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.65,
    tailHeightRatio: 0.94,
    widthScale: 1.02,
    lengthScale: 0.90,
    haunchScale: 1.18,
    grilleStyle: 'clio-hatch',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'clio-side-scoop',
    rearDeckStyle: 'roof-spoiler-hatch',
    exhaustStyle: 'clio-center-twin',
    sharkFinStyle: 'none',
    caliperColor: '#cbd5e1',
  },
  'honda-civic-type-r': {
    cabinStyle: 'hatchback-clio',
    cabinOffsetZ: -0.10,
    cabinScaleW: 1.0,
    cabinScaleH: 1.04,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.66,
    tailHeightRatio: 0.92,
    widthScale: 1.0,
    lengthScale: 0.98,
    haunchScale: 1.06,
    grilleStyle: 'civic-fl5',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#dc2626',
  },
  'toyota-gr-yaris': {
    cabinStyle: 'hatchback-clio',
    cabinOffsetZ: -0.08,
    cabinScaleW: 1.02,
    cabinScaleH: 1.04,
    cabinScaleL: 0.92,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.92,
    widthScale: 1.01,
    lengthScale: 0.91,
    haunchScale: 1.14,
    grilleStyle: 'clio-hatch',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'roof-spoiler-hatch',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#dc2626',
  },

  // ================= PRODUCTION SUPERCARS & HYPERCARS (8 cars) =================
  'ferrari-296-gtb': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.09,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 0.96,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'mclaren-750s': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.94,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.01,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ea580c',
  },
  'ferrari-sf90': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.88,
    widthScale: 1.02,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'deck-tunnel',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'porsche-918-spyder': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.96,
    cabinScaleH: 0.86,
    cabinScaleL: 0.90,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.84,
    widthScale: 1.0,
    lengthScale: 0.99,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'aston-valkyrie-road': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.82,
    cabinScaleH: 0.88,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.68,
    widthScale: 0.95,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#a3e635',
  },
  'koenigsegg-jesko': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.92,
    cabinScaleH: 0.88,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.82,
    widthScale: 1.03,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    haunchScale: 1.10,
    grilleStyle: 'jesko-aero',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'jesko-boomerang',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#16a34a',
  },
  'ferrari-f80': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.94,
    cabinScaleH: 0.86,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'f80-blade',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'mclaren-w1': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.94,
    cabinScaleH: 0.86,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'w1-aero',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'w1-longtail',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#ea580c',
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

export interface HullStationSpec {
  z: number;
  halfW: number;
  yFloor: number;
  ySill: number;
  yBelt: number;
  wBelt: number;
  yCrown: number;
  wCrown: number;
}

export function createLoftedHullGeometry(
  stations: HullStationSpec[],
  uvWidth: number,
  uvLength: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const nStations = stations.length;
  const nPoints = 9;
  const totalVerts = nStations * nPoints;

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i < nStations; i++) {
    const st = stations[i];
    const z = st.z;

    const pts: [number, number, number][] = [
      [-st.halfW, st.yFloor, z],
      [-st.halfW * 1.02, st.ySill, z],
      [-st.wBelt, st.yBelt, z],
      [-st.wCrown, (st.yBelt + st.yCrown) * 0.5, z],
      [0, st.yCrown, z],
      [st.wCrown, (st.yBelt + st.yCrown) * 0.5, z],
      [st.wBelt, st.yBelt, z],
      [st.halfW * 1.02, st.ySill, z],
      [st.halfW, st.yFloor, z],
    ];

    const baseIdx = i * nPoints;
    for (let p = 0; p < nPoints; p++) {
      const vIdx = baseIdx + p;
      const [px, py, pz] = pts[p];
      positions[vIdx * 3] = px;
      positions[vIdx * 3 + 1] = py;
      positions[vIdx * 3 + 2] = pz;

      const u = Math.max(0, Math.min(1, (px + uvWidth * 0.5) / uvWidth));
      const v = Math.max(0, Math.min(1, 1 - (pz + uvLength * 0.5) / uvLength));
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = v;
    }
  }

  for (let i = 0; i < nStations - 1; i++) {
    const r0 = i * nPoints;
    const r1 = (i + 1) * nPoints;

    for (let k = 0; k < 8; k++) {
      const a = r0 + k;
      const b = r1 + k;
      const c = r1 + k + 1;
      const d = r0 + k + 1;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }

    const aFloor = r0 + 8;
    const bFloor = r1 + 8;
    const cFloor = r1 + 0;
    const dFloor = r0 + 0;
    indices.push(aFloor, bFloor, cFloor);
    indices.push(aFloor, cFloor, dFloor);
  }

  // End cap: Rear
  const r0 = 0;
  for (let k = 1; k < 4; k++) {
    indices.push(r0 + 0, r0 + k, r0 + 8 - k);
    indices.push(r0 + k, r0 + k + 1, r0 + 8 - k);
  }
  indices.push(r0 + 3, r0 + 4, r0 + 5);

  // End cap: Front
  const rf = (nStations - 1) * nPoints;
  for (let k = 1; k < 4; k++) {
    indices.push(rf + 0, rf + 8 - k, rf + k);
    indices.push(rf + k, rf + 8 - k, rf + 7 - k);
  }
  indices.push(rf + 3, rf + 5, rf + 4);

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

export function buildHullStations(
  length: number,
  width: number,
  design: {
    noseHeightRatio: number;
    tailHeightRatio: number;
    haunchScale?: number;
    hoodStyle?: 'power-dome' | 'pontoon-channel' | 'standard';
  },
  isProto: boolean,
  isStreetCar: boolean,
): HullStationSpec[] {
  const zRear = -length * 0.5;
  const tPoints = [0.0, 0.07, 0.14, 0.20, 0.28, 0.36, 0.44, 0.52, 0.60, 0.68, 0.76, 0.84, 0.91, 0.96, 1.0];
  const stations: HullStationSpec[] = [];

  const hScale = design.haunchScale ?? (isStreetCar ? 1.03 : 1.0);
  const isPowerDome = design.hoodStyle === 'power-dome';
  const isPontoon = design.hoodStyle === 'pontoon-channel' || isProto;

  for (const t of tPoints) {
    const z = zRear + t * length;
    let halfW = width * 0.45;
    const yFloor = 0.18;
    let ySill = 0.24;
    let yBelt = 0.46;
    let yCrown = 0.48;

    if (t <= 0.07) {
      // Rear bumper / diffuser zone
      halfW = width * (isProto ? (0.43 + t * 0.4) : (0.46 + t * 0.35));
      yBelt = 0.44 * design.tailHeightRatio;
      yCrown = yBelt + 0.04;
    } else if (t <= 0.22) {
      // Rear wheels & flared haunches
      const env = Math.sin(((t - 0.07) / 0.15) * Math.PI);
      const baseHaunch = isProto ? 0.46 : 0.49;
      halfW = width * (baseHaunch + env * (isProto ? 0.065 : 0.04)) * hScale;
      ySill = 0.26;
      yBelt = 0.48 + env * 0.03;
      yCrown = 0.50 + env * 0.02;
    } else if (t <= 0.52) {
      // Coke-bottle waist / cabin door sills
      const pinch = Math.sin(((t - 0.22) / 0.30) * Math.PI);
      const minWFactor = isProto ? 0.40 : isStreetCar ? 0.46 : 0.45;
      const startW = isProto ? 0.47 : 0.49;
      halfW = width * (startW - pinch * (startW - minWFactor));
      ySill = 0.24;
      yBelt = 0.46;
      yCrown = 0.49;
    } else if (t <= 0.80) {
      // Front wheels & front fenders
      const arch = Math.sin(((t - 0.52) / 0.28) * Math.PI);
      const baseFender = isProto ? 0.46 : 0.48;
      halfW = width * (baseFender + arch * (isProto ? 0.045 : 0.04));
      ySill = 0.25;
      yBelt = 0.48 + arch * 0.02;
      if (isPowerDome) {
        yCrown = 0.51 + arch * 0.04;
      } else if (isPontoon) {
        yCrown = 0.44 - arch * 0.03;
      } else {
        yCrown = 0.49;
      }
    } else {
      // Front hood & bumper
      const frac = (t - 0.80) / 0.20;
      const baseNose = isProto ? 0.48 : 0.49;
      halfW = width * (baseNose - frac * (isProto ? 0.13 : 0.08));
      yBelt = (0.48 - frac * 0.18) * design.noseHeightRatio;
      if (isPowerDome) {
        yCrown = (0.52 - frac * 0.20) * design.noseHeightRatio;
      } else if (isPontoon) {
        yCrown = (0.42 - frac * 0.16) * design.noseHeightRatio;
      } else {
        yCrown = (0.48 - frac * 0.18) * design.noseHeightRatio;
      }
    }

    const wBelt = halfW * (isProto ? 0.90 : 0.93);
    const wCrown = halfW * (isProto ? 0.45 : 0.48);
    stations.push({ z, halfW, yFloor, ySill, yBelt, wBelt, yCrown, wCrown });
  }

  return stations;
}

export interface GreenhouseStationSpec {
  z: number;
  wBase: number;
  wRoof: number;
  yBase: number;
  yRoof: number;
}

export function createLoftedGreenhouseGeometry(
  stations: GreenhouseStationSpec[],
  uvWidth: number,
  uvLength: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const nStations = stations.length;
  const nPoints = 5;
  const totalVerts = nStations * nPoints;

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i < nStations; i++) {
    const st = stations[i];
    const z = st.z;
    const pts: [number, number, number][] = [
      [-st.wBase, st.yBase, z],
      [-st.wRoof, st.yRoof, z],
      [0, st.yRoof + 0.025, z],
      [st.wRoof, st.yRoof, z],
      [st.wBase, st.yBase, z],
    ];

    const baseIdx = i * nPoints;
    for (let p = 0; p < nPoints; p++) {
      const vIdx = baseIdx + p;
      const [px, py, pz] = pts[p];
      positions[vIdx * 3] = px;
      positions[vIdx * 3 + 1] = py;
      positions[vIdx * 3 + 2] = pz;

      const u = Math.max(0, Math.min(1, (px + uvWidth * 0.5) / uvWidth));
      const v = Math.max(0, Math.min(1, 1 - (pz + uvLength * 0.5) / uvLength));
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = v;
    }
  }

  for (let i = 0; i < nStations - 1; i++) {
    const r0 = i * nPoints;
    const r1 = (i + 1) * nPoints;
    for (let k = 0; k < 4; k++) {
      const a = r0 + k;
      const b = r1 + k;
      const c = r1 + k + 1;
      const d = r0 + k + 1;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // Rear cap
  indices.push(0, 1, 4);
  indices.push(1, 2, 3);
  indices.push(1, 3, 4);

  // Front cap
  const rf = (nStations - 1) * nPoints;
  indices.push(rf + 0, rf + 4, rf + 1);
  indices.push(rf + 1, rf + 3, rf + 2);
  indices.push(rf + 1, rf + 4, rf + 3);

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

export function buildCabinStations(
  style: CabinStyle,
  cabinOffsetZ: number,
  cabinScaleW: number,
  cabinScaleH: number,
  cabinScaleL: number,
  isProto: boolean,
): GreenhouseStationSpec[] {
  const baseW = (isProto ? 0.44 : 0.56) * cabinScaleW;
  const roofH = (isProto ? 0.88 : 0.94) * cabinScaleH;
  const beltY = isProto ? 0.52 : 0.50;
  const len = (isProto ? 1.70 : 1.78) * cabinScaleL;
  const zRear = cabinOffsetZ - len * 0.5;
  const zFront = cabinOffsetZ + len * 0.5;

  if (style === 'hatchback-clio') {
    return [
      { z: zRear, wBase: baseW * 0.88, wRoof: baseW * 0.72, yBase: beltY + 0.04, yRoof: beltY + 0.12 },
      { z: zRear + 0.08, wBase: baseW * 0.92, wRoof: baseW * 0.78, yBase: beltY + 0.06, yRoof: roofH * 0.98 },
      { z: zRear + len * 0.25, wBase: baseW * 0.96, wRoof: baseW * 0.82, yBase: beltY + 0.02, yRoof: roofH * 1.01 },
      { z: zRear + len * 0.50, wBase: baseW * 0.98, wRoof: baseW * 0.84, yBase: beltY, yRoof: roofH * 1.01 },
      { z: zRear + len * 0.75, wBase: baseW * 0.96, wRoof: baseW * 0.82, yBase: beltY, yRoof: roofH * 0.99 },
      { z: zFront - 0.20, wBase: baseW * 0.92, wRoof: baseW * 0.76, yBase: beltY, yRoof: roofH * 0.94 },
      { z: zFront, wBase: baseW * 0.84, wRoof: baseW * 0.64, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
    ];
  }

  if (style === 'porsche-911') {
    return [
      { z: zRear - 0.15, wBase: baseW * 0.65, wRoof: baseW * 0.35, yBase: beltY + 0.05, yRoof: beltY + 0.09 },
      { z: zRear + len * 0.15, wBase: baseW * 0.80, wRoof: baseW * 0.58, yBase: beltY + 0.04, yRoof: roofH * 0.85 },
      { z: zRear + len * 0.35, wBase: baseW * 0.92, wRoof: baseW * 0.74, yBase: beltY + 0.02, yRoof: roofH * 0.97 },
      { z: zRear + len * 0.55, wBase: baseW * 0.98, wRoof: baseW * 0.80, yBase: beltY, yRoof: roofH * 1.02 },
      { z: zRear + len * 0.75, wBase: baseW * 0.95, wRoof: baseW * 0.78, yBase: beltY, yRoof: roofH * 0.98 },
      { z: zFront - 0.22, wBase: baseW * 0.90, wRoof: baseW * 0.72, yBase: beltY, yRoof: roofH * 0.90 },
      { z: zFront, wBase: baseW * 0.80, wRoof: baseW * 0.60, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
    ];
  }

  if (style === 'grand-tourer') {
    return [
      { z: zRear, wBase: baseW * 0.80, wRoof: baseW * 0.52, yBase: beltY + 0.04, yRoof: beltY + 0.08 },
      { z: zRear + len * 0.20, wBase: baseW * 0.90, wRoof: baseW * 0.70, yBase: beltY + 0.03, yRoof: roofH * 0.90 },
      { z: zRear + len * 0.40, wBase: baseW * 0.98, wRoof: baseW * 0.82, yBase: beltY + 0.01, yRoof: roofH * 1.01 },
      { z: zRear + len * 0.60, wBase: baseW * 0.98, wRoof: baseW * 0.82, yBase: beltY, yRoof: roofH * 1.01 },
      { z: zRear + len * 0.80, wBase: baseW * 0.94, wRoof: baseW * 0.78, yBase: beltY, yRoof: roofH * 0.96 },
      { z: zFront - 0.20, wBase: baseW * 0.88, wRoof: baseW * 0.70, yBase: beltY, yRoof: roofH * 0.88 },
      { z: zFront, wBase: baseW * 0.80, wRoof: baseW * 0.58, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
    ];
  }

  if (style === 'mid-engine-buttress') {
    return [
      { z: zRear, wBase: baseW * 0.86, wRoof: baseW * 0.55, yBase: beltY + 0.04, yRoof: beltY + 0.08 },
      { z: zRear + len * 0.18, wBase: baseW * 0.92, wRoof: baseW * 0.68, yBase: beltY + 0.03, yRoof: roofH * 0.90 },
      { z: zRear + len * 0.38, wBase: baseW * 0.98, wRoof: baseW * 0.78, yBase: beltY + 0.01, yRoof: roofH * 1.00 },
      { z: zRear + len * 0.58, wBase: baseW * 0.98, wRoof: baseW * 0.78, yBase: beltY, yRoof: roofH * 1.00 },
      { z: zRear + len * 0.78, wBase: baseW * 0.94, wRoof: baseW * 0.74, yBase: beltY, yRoof: roofH * 0.94 },
      { z: zFront - 0.20, wBase: baseW * 0.88, wRoof: baseW * 0.66, yBase: beltY, yRoof: roofH * 0.86 },
      { z: zFront, wBase: baseW * 0.78, wRoof: baseW * 0.54, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
    ];
  }

  if (style === 'lmp-gt3-hybrid') {
    return [
      { z: zRear, wBase: baseW * 0.78, wRoof: baseW * 0.44, yBase: beltY + 0.04, yRoof: beltY + 0.08 },
      { z: zRear + len * 0.20, wBase: baseW * 0.88, wRoof: baseW * 0.62, yBase: beltY + 0.02, yRoof: roofH * 0.88 },
      { z: zRear + len * 0.45, wBase: baseW * 0.96, wRoof: baseW * 0.74, yBase: beltY, yRoof: roofH * 0.98 },
      { z: zRear + len * 0.70, wBase: baseW * 0.96, wRoof: baseW * 0.74, yBase: beltY, yRoof: roofH * 0.98 },
      { z: zFront - 0.24, wBase: baseW * 0.88, wRoof: baseW * 0.64, yBase: beltY, yRoof: roofH * 0.86 },
      { z: zFront, wBase: baseW * 0.76, wRoof: baseW * 0.48, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
    ];
  }

  // Default 'proto-teardrop'
  return [
    { z: zRear, wBase: baseW * 0.50, wRoof: baseW * 0.25, yBase: beltY + 0.05, yRoof: beltY + 0.08 },
    { z: zRear + len * 0.20, wBase: baseW * 0.75, wRoof: baseW * 0.50, yBase: beltY + 0.03, yRoof: roofH * 0.86 },
    { z: zRear + len * 0.45, wBase: baseW * 0.95, wRoof: baseW * 0.68, yBase: beltY + 0.01, yRoof: roofH * 1.00 },
    { z: zRear + len * 0.70, wBase: baseW * 0.95, wRoof: baseW * 0.68, yBase: beltY, yRoof: roofH * 1.00 },
    { z: zFront - 0.22, wBase: baseW * 0.84, wRoof: baseW * 0.56, yBase: beltY, yRoof: roofH * 0.88 },
    { z: zFront, wBase: baseW * 0.68, wRoof: baseW * 0.40, yBase: beltY - 0.02, yRoof: beltY + 0.04 },
  ];
}

function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  caliperMat: THREE.Material,
  rotorMat: THREE.Material,
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

  const rimRadius = radius * 0.65;
  const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.02, 18, 1, true);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rimMesh);

  const lipGeo = new THREE.TorusGeometry(rimRadius, 0.016, 8, 20);
  lipGeo.rotateY(Math.PI / 2);
  const lipMesh = new THREE.Mesh(lipGeo, rimMat);
  lipMesh.position.x = (width + 0.02) * 0.5;
  wheelGroup.add(lipMesh);

  const spokeGroup = new THREE.Group();
  spokeGroup.position.x = width * 0.38;
  const spokeGeo = new THREE.BoxGeometry(width * 0.22, rimRadius * 0.95, rimRadius * 0.14);
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (s * 2 * Math.PI) / 5;
    spokeGroup.add(spoke);
  }
  const hubGeo = new THREE.CylinderGeometry(rimRadius * 0.22, rimRadius * 0.22, width * 0.26, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeo, rimMat);
  spokeGroup.add(hubMesh);
  wheelGroup.add(spokeGroup);

  const rotorRadius = rimRadius * 0.85;
  const rotorGeo = new THREE.CylinderGeometry(rotorRadius, rotorRadius, width * 0.12, 16);
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
  rotorMesh.position.x = width * 0.08;
  wheelGroup.add(rotorMesh);

  const caliperGeo = new THREE.BoxGeometry(width * 0.28, rotorRadius * 0.44, rotorRadius * 0.36);
  const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
  caliperMesh.position.set(width * 0.08, rotorRadius * 0.72, rotorRadius * 0.28);
  caliperMesh.rotation.x = -0.42;
  wheelGroup.add(caliperMesh);

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
 * Spec/era-accurate shared open-wheel & LMP2 chassis + 53 distinct sculpted manufacturer silhouettes.
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

  const primaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.primaryColor),
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

  const rotorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a3f48,
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
  const isGT4 = classId === CarClassId.GT4;
  const isStreetCar =
    classId === CarClassId.TRACK_COUPE ||
    classId === CarClassId.SUPERCAR ||
    silhouette === 'coupe' ||
    silhouette === 'supercar';

  const design: ClosedWheelDesign = CLOSED_WHEEL_DESIGNS[carId ?? ''] ?? {
    cabinStyle: isProto
      ? 'proto-teardrop'
      : isGT3 || isGT4
      ? 'grand-tourer'
      : isStreetCar
      ? 'mid-engine-buttress'
      : 'grand-tourer',
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

  const caliperColorHex = design.caliperColor ?? (isGT4 ? '#0284c7' : isGT3 ? '#ef4444' : isProto ? '#facc15' : '#dc2626');
  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(caliperColorHex),
      roughness: 0.32,
      metalness: 0.45,
    }),
  );

  const length = (isFormula ? (isFormulaE ? 3.7 : 3.92) : isProto ? 3.76 : 3.66) * (isFormula ? 1 : design.lengthScale);
  const width = (isFormula ? 1.88 : isGT3 ? 1.95 : 1.90) * (isFormula ? 1 : design.widthScale);
  const wheelRadius = isFormula ? 0.36 : 0.35;
  const wheelWidth = isFormula ? 0.38 : 0.30;
  const wheelBaseZ = (isFormula ? 1.26 : 1.18) * (isFormula ? 1 : Math.min(1.05, Math.max(0.92, design.lengthScale)));
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

      // Twin rear winglets over rear wheels
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
    // ================= BESPOKE LOFTED 3D CLOSED-WHEEL CARS (53 CHASSIS) =================
    const bodyWidth = width * (isProto ? 0.96 : 1.02);
    const bodyLen = length * 0.94;

    // 1. Parametric Lofted Hull Geometry with Coke-Bottle Waist, Flared Haunches & Pontoon Channels
    const hullStations = buildHullStations(bodyLen, bodyWidth, design, isProto, isStreetCar);
    const bodyGeo = track(createLoftedHullGeometry(hullStations, bodyWidth, bodyLen));
    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // 2. Parametric Lofted Cabin / Greenhouse Geometry
    const cabinStyle = design.cabinStyle ?? (isProto ? 'proto-teardrop' : isStreetCar ? 'grand-tourer' : 'mid-engine-buttress');
    const cabinStations = buildCabinStations(
      cabinStyle,
      design.cabinOffsetZ,
      design.cabinScaleW,
      design.cabinScaleH,
      design.cabinScaleL,
      isProto,
    );
    const cabinGeo = track(createLoftedGreenhouseGeometry(cabinStations, bodyWidth, bodyLen));
    const cabin = new THREE.Mesh(cabinGeo, canopyMat);
    cabin.castShadow = true;
    bodyGroup.add(cabin);

    // Sculpted Prototype Wheel Arch Flares (Prototypes only; GT & Coupes use continuous full-width enclosed hull)
    if (isProto) {
      const archRadius = 0.44;
      const archGeo = track(new THREE.CylinderGeometry(archRadius, archRadius + 0.025, 0.22, 14, 1, false, 0, Math.PI));
      archGeo.rotateZ(Math.PI / 2);
      for (const sx of [-bodyWidth * 0.49, bodyWidth * 0.49]) {
        for (const sz of [-wheelBaseZ, wheelBaseZ]) {
          const arch = new THREE.Mesh(archGeo, secondaryMat);
          arch.position.set(sx, 0.36, sz);
          arch.castShadow = true;
          bodyGroup.add(arch);
        }
      }
    }

    // LMP2 Stepped Nose
    if (isLmp2) {
      const noseGeo = track(new THREE.BoxGeometry(0.68, 0.24, 0.72));
      const noseMesh = new THREE.Mesh(noseGeo, secondaryMat);
      noseMesh.position.set(0, 0.42, bodyLen * 0.38);
      noseMesh.castShadow = true;
      bodyGroup.add(noseMesh);
    }

    // Signature Manufacturer Front Grille Sculpting
    const frontZ = bodyLen * 0.5 + 0.03;
    if (design.grilleStyle === 'bentley-matrix') {
      // Bentley Continental GT3 Matrix Grille
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.30, 0.06)), chromeMat);
      frame.position.set(0, 0.38, frontZ);
      bodyGroup.add(frame);
      const innerMesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.96, 0.24, 0.07)), matteTrimMat);
      innerMesh.position.set(0, 0.38, frontZ + 0.01);
      bodyGroup.add(innerMesh);
      const spine = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.28, 0.08)), chromeMat);
      spine.position.set(0, 0.38, frontZ + 0.02);
      bodyGroup.add(spine);
    } else if (design.grilleStyle === 'bmw-kidney') {
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
    } else if (design.grilleStyle === 'audi-singleframe') {
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(0.88, 0.28, 0.06)), matteTrimMat);
      frame.position.set(0, 0.36, frontZ);
      bodyGroup.add(frame);
      const ringBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.04, 0.08)), chromeMat);
      ringBar.position.set(0, 0.44, frontZ + 0.01);
      bodyGroup.add(ringBar);
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
      hoodVent.position.set(0, 0.55, bodyLen * 0.24);
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
    } else if (design.grilleStyle === 'clio-hatch' || design.grilleStyle === 'civic-fl5') {
      const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.82, 0.18, 0.06)), matteTrimMat);
      mesh.position.set(0, 0.33, frontZ);
      bodyGroup.add(mesh);
    } else if (design.grilleStyle === 'supra-nose') {
      const noseBeak = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.18, 0.12)), primaryMat);
      noseBeak.position.set(0, 0.36, frontZ + 0.03);
      bodyGroup.add(noseBeak);
      for (const gx of [-0.42, 0.42]) {
        const intake = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.14, 0.06)), matteTrimMat);
        intake.position.set(gx, 0.30, frontZ);
        bodyGroup.add(intake);
      }
    } else if (design.grilleStyle === 'alpine-arrow') {
      const arrowNose = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.14, 0.10)), primaryMat);
      arrowNose.position.set(0, 0.36, frontZ + 0.02);
      bodyGroup.add(arrowNose);
    } else if (
      design.grilleStyle === 'ferrari-split' ||
      design.grilleStyle === 'mclaren-eye' ||
      design.grilleStyle === 'corvette-wedge' ||
      design.grilleStyle === 'jesko-aero' ||
      design.grilleStyle === 'f80-blade' ||
      design.grilleStyle === 'w1-aero'
    ) {
      for (const gx of [-0.46, 0.46]) {
        const intake = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.14, 0.06)), matteTrimMat);
        intake.position.set(gx, 0.30, frontZ);
        bodyGroup.add(intake);
      }
    }

    // Sidepod / Venturi / Louver Sculpting
    if (design.sidepodStyle === 'clio-side-scoop') {
      // Renault Clio V6 Phase 2 Massive Haunch Cooling Intakes
      const scoopGeo = track(new THREE.BoxGeometry(0.18, 0.26, 0.52));
      for (const sx of [-bodyWidth * 0.54, bodyWidth * 0.54]) {
        const scoop = new THREE.Mesh(scoopGeo, secondaryMat);
        scoop.position.set(sx, 0.44, -wheelBaseZ * 0.45);
        scoop.rotation.y = sx < 0 ? -0.15 : 0.15;
        scoop.castShadow = true;
        bodyGroup.add(scoop);

        const duct = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.20, 0.16)), matteTrimMat);
        duct.position.set(sx * 1.02, 0.44, -wheelBaseZ * 0.45 + 0.18);
        bodyGroup.add(duct);
      }
    } else if (design.sidepodStyle === 'venturi-tunnel') {
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
        louver.position.set(sx, 0.52, wheelBaseZ);
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

    // GT3 / GT4 Aerodynamic Dive-Plane Canards
    if (isGT3 || isGT4) {
      const canardGeo = track(new THREE.BoxGeometry(0.24, 0.04, 0.14));
      for (const sx of [-bodyWidth * 0.48, bodyWidth * 0.48]) {
        for (const cy of isGT3 ? [0.34, 0.46] : [0.38]) {
          const canard = new THREE.Mesh(canardGeo, carbonMat);
          canard.position.set(sx, cy, bodyLen * 0.48);
          canard.rotation.z = sx < 0 ? 0.18 : -0.18;
          canard.rotation.x = -0.12;
          bodyGroup.add(canard);
        }
      }
    }

    // Windshield Banner (Anchored flush onto sloped windshield glass)
    if (!isStreetCar && cabinStations.length >= 2) {
      const stTop = cabinStations[cabinStations.length - 2];
      const stBtm = cabinStations[cabinStations.length - 1];
      const dz = stBtm.z - stTop.z;
      const dy = stBtm.yRoof - stTop.yRoof;
      const bannerWidth = Math.max(0.62, stTop.wRoof * 2 * 0.96);
      const bannerHeight = 0.11;
      const bannerGeo = track(new THREE.PlaneGeometry(bannerWidth, bannerHeight));
      const pitch = -Math.atan2(-dy, dz);
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bannerMesh.rotation.x = pitch;
      const tPos = 0.20;
      const bZ = stTop.z + dz * tPos;
      const bY = stTop.yRoof + dy * tPos + 0.008;
      bannerMesh.position.set(0, bY, bZ);
      bodyGroup.add(bannerMesh);
    }

    // Front Splitter (Tucked flush with lower bumper, compact overhang matching body width)
    const splitterWidth = bodyWidth * (isGT3 ? 1.01 : isGT4 ? 1.00 : isProto ? 1.02 : 0.98);
    const splitterLen = isGT3 ? 0.18 : isGT4 ? 0.14 : isProto ? 0.20 : 0.12;
    const splitterOverhang = isGT3 ? 0.07 : isGT4 ? 0.05 : isProto ? 0.08 : 0.03;
    const splitterGeo = track(
      new THREE.BoxGeometry(splitterWidth, 0.045, splitterLen),
    );
    const splitterMesh = new THREE.Mesh(
      splitterGeo,
      livery.carbonSplitter || isGT3 || isGT4 ? carbonMat : tertiaryMat,
    );
    splitterMesh.position.set(0, 0.18, bodyLen * 0.5 + splitterOverhang);
    bodyGroup.add(splitterMesh);

    // Rear Diffuser
    const diffGeo = track(new THREE.BoxGeometry(bodyWidth * 0.88, 0.12, 0.22));
    const diffMesh = new THREE.Mesh(diffGeo, matteTrimMat);
    diffMesh.position.set(0, 0.22, -bodyLen * 0.5);
    bodyGroup.add(diffMesh);

    // Exhaust Placement per Architecture
    if (design.exhaustStyle === 'clio-center-twin') {
      const exGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.07, 0.07]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.26, -bodyLen * 0.52);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'rear-dual') {
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

    // Rear Wing / Spoiler
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
    if (design.rearDeckStyle === 'roof-spoiler-hatch') {
      // Clio V6 & GR Yaris integrated hatchback roof spoiler
      const spoilerGeo = track(new THREE.BoxGeometry(bodyWidth * 0.88, 0.045, 0.24));
      const spoiler = new THREE.Mesh(spoilerGeo, wingMat);
      spoiler.position.set(0, 0.98, design.cabinOffsetZ - 0.72);
      spoiler.castShadow = true;
      bodyGroup.add(spoiler);
    } else if (design.rearDeckStyle === 'jesko-boomerang') {
      // Koenigsegg Jesko Attack Active Top-Mount Boomerang Wing
      for (const sx of [-0.38, 0.38]) {
        const pylon = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.44, 0.28)), matteTrimMat);
        pylon.position.set(sx, 0.86, -bodyLen * 0.38);
        pylon.rotation.x = 0.22;
        bodyGroup.add(pylon);
      }
      const bWingGeo = track(new THREE.BoxGeometry(bodyWidth * 1.05, 0.06, 0.36));
      const bWing = new THREE.Mesh(bWingGeo, wingMat);
      bWing.position.set(0, 1.05, -bodyLen * 0.46);
      bWing.castShadow = true;
      bodyGroup.add(bWing);
      rearWingFlap = bWing;
    } else if (design.rearDeckStyle === 'w1-longtail') {
      // McLaren W1 Active Longtail Wing
      const w1Wing = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.98, 0.06, 0.34)), wingMat);
      w1Wing.position.set(0, 0.88, -bodyLen * 0.54);
      w1Wing.castShadow = true;
      bodyGroup.add(w1Wing);
      rearWingFlap = w1Wing;
    } else if (design.rearDeckStyle === 'wingless-9x8') {
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
        const buttress = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.18, 0.85)), primaryMat);
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
      const wingWidth = bodyWidth * (isGT3 ? 1.03 : isGT4 ? 0.98 : 0.96);
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

    // Door Number Plates
    if (!isStreetCar) {
      const doorPlateGeo = track(new THREE.PlaneGeometry(0.62, 0.44));
      const leftPlate = new THREE.Mesh(doorPlateGeo, plateMat);
      leftPlate.rotation.y = -Math.PI / 2;
      leftPlate.position.set(-bodyWidth * 0.51, 0.48, 0.05);
      bodyGroup.add(leftPlate);

      const rightPlate = new THREE.Mesh(doorPlateGeo, plateMat);
      rightPlate.rotation.y = Math.PI / 2;
      rightPlate.position.set(bodyWidth * 0.51, 0.48, 0.05);
      bodyGroup.add(rightPlate);
    }

    // Distinct Signature Headlights per Model
    const hlZ = bodyLen * 0.5 + 0.02;
    [-0.64, 0.64].forEach((hx, idx) => {
      if (design.headlightStyle === 'bentley-quad') {
        // Bentley Continental GT3 signature dual round lamps
        const outerLamp = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14)),
          headlightMats[idx],
        );
        outerLamp.rotation.x = Math.PI / 2;
        outerLamp.position.set(hx * 1.04, 0.48, hlZ - 0.01);
        bodyGroup.add(outerLamp);

        const innerLamp = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 14)),
          headlightMats[idx],
        );
        innerLamp.rotation.x = Math.PI / 2;
        innerLamp.position.set(hx * 0.72, 0.46, hlZ - 0.01);
        bodyGroup.add(innerLamp);
      } else if (design.headlightStyle === 'c-blade-rs01') {
        // Renault Sport R.S. 01 C-shaped DRL light blade
        const upperBlade = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.24, 0.06, 0.08)),
          headlightMats[idx],
        );
        upperBlade.position.set(hx * 0.98, 0.48, hlZ);
        bodyGroup.add(upperBlade);

        const dropBlade = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.06, 0.20, 0.08)),
          headlightMats[idx],
        );
        dropBlade.position.set(hx * 1.08, 0.40, hlZ);
        bodyGroup.add(dropBlade);
      } else if (design.headlightStyle === 'vertical-stack') {
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
      caliperMat,
      rotorMat,
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
