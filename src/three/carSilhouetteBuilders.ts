import * as THREE from 'three';
import { LiveryConfig, SafetyCarPhase } from '../game/types';
import { CarMaterialSet, createCarGlassMaterial, getShadowTexture, TrackDisposable } from './carMaterials';
import {
  applySixZoneCarUVs,
  buildCabinStations,
  buildHullStations,
  CabinStyle,
  createAeroMirrorGroup,
  createAirfoilWingGeometry,
  createDiecastWheel,
  createFormulaSidepodGeometry,
  createLoftedFormulaHullGeometry,
  createLoftedGreenhouseGeometry,
  createLoftedHullGeometry,
  createSharkFinGeometry,
  createSwanNeckPylonGeometry,
  createVenturiDiffuserGroup,
  createWingEndplateGeometry,
  FormulaHullStationSpec,
  FormulaSidepodStationSpec,
  HullStationSpec,
} from './carGeometryHelpers';

export interface ClosedWheelDesign {
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
    | 'w1-longtail';
  exhaustStyle: 'rear-dual' | 'rear-center' | 'top-exit' | 'side-exit' | 'clio-center-twin';
  sharkFinStyle: 'none' | 'tall-proto' | 'curved-lmh' | 'roof-scoop';
  caliperColor?: string;
}

export const CLOSED_WHEEL_DESIGNS: Record<string, ClosedWheelDesign> = {
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
  'oreca-07': {
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
  'oreca-07-united-autosports': {
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
  'united-autosports': {
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
  'oreca-07-inter-europol': {
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
  'inter-europol': {
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
  'oreca-07-ao-racing': {
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
  'ao-racing': {
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
  'oreca-07-af-corse': {
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
    caliperColor: '#dc2626',
  },
  'af-corse': {
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
    caliperColor: '#dc2626',
  },
  'oreca-07-cool': {
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
    caliperColor: '#0055b8',
  },
  'oreca-07-cool-racing': {
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
    caliperColor: '#0055b8',
  },
  'cool-racing': {
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
    caliperColor: '#0055b8',
  },
  'oreca-07-algarve': {
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
    caliperColor: '#ea580c',
  },
  'oreca-07-algarve-pro': {
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
    caliperColor: '#ea580c',
  },
  'algarve-pro': {
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
    caliperColor: '#ea580c',
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
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 0.99,
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

export function resolveClosedWheelDesign(
  carId: string | undefined,
  isProto: boolean,
  isLmp2: boolean,
  isGT3: boolean,
  isGT4: boolean,
  isStreetCar: boolean,
): ClosedWheelDesign {
  return (
    CLOSED_WHEEL_DESIGNS[carId ?? ''] ??
    (carId && (carId.includes('oreca') || carId.includes('lmp2')) ? CLOSED_WHEEL_DESIGNS['oreca-07'] : undefined) ?? {
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
      noseHeightRatio: isLmp2 ? 0.54 : 0.62,
      tailHeightRatio: isStreetCar ? 0.90 : 0.84,
      widthScale: 1.0,
      lengthScale: 1.0,
      grilleStyle: isProto ? 'lmp-intake' : 'none',
      headlightStyle: 'blade',
      sidepodStyle: isProto ? 'undercut' : 'clean-street',
      rearDeckStyle: isStreetCar ? 'active-lip' : 'strut-race',
      exhaustStyle: isStreetCar ? 'rear-dual' : 'top-exit',
      sharkFinStyle: isProto ? 'tall-proto' : 'none',
    }
  );
}

export interface FormulaBodyBuildParams {
  bodyGroup: THREE.Group;
  materials: CarMaterialSet;
  livery: LiveryConfig;
  width: number;
  wheelBaseZ: number;
  trackHalfX: number;
  isFormulaE: boolean;
  isF1_2026: boolean;
  isF1_2021: boolean;
  isF1_2005: boolean;
  track: TrackDisposable;
}

export function buildFormulaCarBody(params: FormulaBodyBuildParams): {
  frontWingFlap: THREE.Mesh | null;
  rearWingFlap: THREE.Mesh | null;
} {
  const {
    bodyGroup,
    materials,
    livery,
    width,
    wheelBaseZ,
    trackHalfX,
    isFormulaE,
    isF1_2026,
    isF1_2021,
    isF1_2005,
    track,
  } = params;
  const {
    bodyMat,
    secondaryMat,
    tertiaryMat,
    carbonMat,
    matteTrimMat,
    titaniumMat,
    canopyMat,
    chromeMat,
    headlightMats,
    brakeLightMat,
    rainLightMat,
  } = materials;

  let frontWingFlap: THREE.Mesh | null = null;
  let rearWingFlap: THREE.Mesh | null = null;

  // Slim tapered carbon floor plank strictly within sidepod footprint (never clips open wheels)
  const floorHalfW = isF1_2021 ? 0.64 : isFormulaE ? 0.56 : 0.54;
  const plankGeo = track(new THREE.BoxGeometry(floorHalfW * 2, 0.04, 2.08));
  const plankMesh = new THREE.Mesh(plankGeo, carbonMat);
  plankMesh.position.set(0, 0.142, -0.44);
  plankMesh.castShadow = true;
  bodyGroup.add(plankMesh);

  // Sculpted Rear Venturi Diffuser + Central FIA Rain-Light Diffuser Pod
  const diffGroup = createVenturiDiffuserGroup({
    width: isF1_2021 ? 0.88 : isFormulaE ? 0.78 : 0.82,
    depth: 0.34,
    height: 0.15,
    strakeCount: 5,
    rainLightMat,
    carbonMat,
    matteTrimMat,
    track,
    hasRainPod: true,
  });
  diffGroup.position.set(0, 0.145, -1.62);
  bodyGroup.add(diffGroup);

  if (isFormulaE) {
    // ================= FORMULA E GEN3 EVO SCULPTED DELTA SILHOUETTE =================
    const feStations: FormulaHullStationSpec[] = [
      { z: -1.64, halfW: 0.18, yBottom: 0.22, yShoulder: 0.44, yDeck: 0.52, cockpitDepth: 0, cockpitHalfW: 0.06 },
      { z: -1.05, halfW: 0.28, yBottom: 0.20, yShoulder: 0.50, yDeck: 0.62, cockpitDepth: 0, cockpitHalfW: 0.10 },
      { z: -0.35, halfW: 0.34, yBottom: 0.18, yShoulder: 0.56, yDeck: 0.67, cockpitDepth: 0.02, cockpitHalfW: 0.18 },
      { z: -0.06, halfW: 0.36, yBottom: 0.18, yShoulder: 0.58, yDeck: 0.66, cockpitDepth: 0.16, cockpitHalfW: 0.21 },
      { z: 0.40, halfW: 0.30, yBottom: 0.18, yShoulder: 0.54, yDeck: 0.61, cockpitDepth: 0.14, cockpitHalfW: 0.18 },
      { z: 0.62, halfW: 0.24, yBottom: 0.19, yShoulder: 0.50, yDeck: 0.56, cockpitDepth: 0, cockpitHalfW: 0.12 },
      { z: 1.25, halfW: 0.16, yBottom: 0.20, yShoulder: 0.36, yDeck: 0.42, cockpitDepth: 0, cockpitHalfW: 0.08 },
      { z: 1.84, halfW: 0.08, yBottom: 0.20, yShoulder: 0.25, yDeck: 0.28, cockpitDepth: 0, cockpitHalfW: 0.04 },
    ];
    const feHullGeo = track(createLoftedFormulaHullGeometry(feStations));
    const feHullMesh = new THREE.Mesh(feHullGeo, bodyMat);
    feHullMesh.castShadow = true;
    feHullMesh.receiveShadow = true;
    bodyGroup.add(feHullMesh);

    // Sculpted Gen3 Evo delta wedge sidepods
    const feSidepodStations: FormulaSidepodStationSpec[] = [
      { z: -1.35, xInner: 0.18, xOuterFloor: 0.26, xOuterShoulder: 0.32, yFloor: 0.18, yMid: 0.34, yTop: 0.48 },
      { z: -0.68, xInner: 0.24, xOuterFloor: 0.48, xOuterShoulder: 0.60, yFloor: 0.17, yMid: 0.38, yTop: 0.54 },
      { z: 0.26, xInner: 0.25, xOuterFloor: 0.46, xOuterShoulder: 0.58, yFloor: 0.17, yMid: 0.38, yTop: 0.53 },
      { z: 0.72, xInner: 0.20, xOuterFloor: 0.30, xOuterShoulder: 0.38, yFloor: 0.18, yMid: 0.34, yTop: 0.46 },
    ];
    for (const sx of [-1, 1] as const) {
      const spGeo = track(createFormulaSidepodGeometry(feSidepodStations, sx));
      const spMesh = new THREE.Mesh(spGeo, bodyMat);
      spMesh.castShadow = true;
      bodyGroup.add(spMesh);
    }

    // Contoured enclosed front wheel aero fairings (Gen3 Evo regulation shrouds)
    const shroudShape = new THREE.Shape();
    shroudShape.moveTo(-0.42, -0.13);
    shroudShape.lineTo(0.36, -0.14);
    shroudShape.quadraticCurveTo(0.46, 0.02, 0.28, 0.14);
    shroudShape.lineTo(-0.34, 0.14);
    shroudShape.closePath();
    const rawShroudGeo = new THREE.ExtrudeGeometry(shroudShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    rawShroudGeo.rotateY(Math.PI / 2);
    rawShroudGeo.translate(-0.17, 0, 0);
    const shroudGeo = track(applySixZoneCarUVs(rawShroudGeo, undefined, { isAero: true }));
    rawShroudGeo.dispose();
    for (const sx of [-trackHalfX, trackHalfX]) {
      const fairing = new THREE.Mesh(shroudGeo, secondaryMat);
      fairing.position.set(sx * 0.96, 0.40, wheelBaseZ + 0.10);
      fairing.rotation.y = sx < 0 ? 0.08 : -0.08;
      fairing.castShadow = true;
      bodyGroup.add(fairing);
    }

    // Clean Titanium Halo + Front V-Stem (strictly z <= +0.52 so Hood Cam stays clear)
    const haloMat = livery.carbonHood ? carbonMat : titaniumMat;
    const haloCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.23, 0.67, -0.06),
      new THREE.Vector3(-0.18, 0.81, 0.22),
      new THREE.Vector3(0, 0.82, 0.44),
      new THREE.Vector3(0.18, 0.81, 0.22),
      new THREE.Vector3(0.23, 0.67, -0.06),
    ]);
    const haloMesh = new THREE.Mesh(track(new THREE.TubeGeometry(haloCurve, 16, 0.026, 8, false)), haloMat);
    bodyGroup.add(haloMesh);

    const feStemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.82, 0.44),
      new THREE.Vector3(0, 0.68, 0.49),
      new THREE.Vector3(0, 0.52, 0.52),
    ]);
    const feStemMesh = new THREE.Mesh(track(new THREE.TubeGeometry(feStemCurve, 6, 0.024, 8, false)), haloMat);
    bodyGroup.add(feStemMesh);

    // Driver helmet with dark tinted visor band
    const feHelmetGeo = track(new THREE.SphereGeometry(0.155, 14, 12));
    const feHelmetUv = feHelmetGeo.getAttribute('uv');
    for (let i = 0; i < feHelmetUv.count; i++) {
      feHelmetUv.setXY(i, Math.min(1, Math.max(0, feHelmetUv.getX(i))), Math.min(1, Math.max(0, feHelmetUv.getY(i))));
    }
    const helmet = new THREE.Mesh(feHelmetGeo, tertiaryMat);
    helmet.position.set(0, 0.69, 0.12);
    bodyGroup.add(helmet);
    const visor = new THREE.Mesh(track(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 12, 1, true, -0.9, 1.8)), canopyMat);
    visor.position.set(0, 0.70, 0.12);
    bodyGroup.add(visor);

    // Aero Mirror Stalks
    for (const sx of [-1, 1] as const) {
      const mirror = createAeroMirrorGroup({
        sideSign: sx,
        stalkLen: 0.16,
        bodyMat: secondaryMat,
        trimMat: matteTrimMat,
        mirrorGlassMat: chromeMat,
        track,
      });
      mirror.position.set(sx * 0.30, 0.58, 0.32);
      bodyGroup.add(mirror);
    }

    // Multi-element Gen3 Evo Front Wing + Swept Endplates
    const fwMain = new THREE.Mesh(track(createAirfoilWingGeometry(1.66, 0.32, 0.044)), carbonMat);
    fwMain.position.set(0, 0.185, 1.72);
    fwMain.castShadow = true;
    bodyGroup.add(fwMain);

    const fwUpper = new THREE.Mesh(track(createAirfoilWingGeometry(1.56, 0.16, 0.032)), secondaryMat);
    fwUpper.position.set(0, 0.24, 1.64);
    fwUpper.rotation.x = 0.22;
    bodyGroup.add(fwUpper);
    frontWingFlap = fwUpper;

    const feEndplateGeo = track(createWingEndplateGeometry(0.20, 0.42, 0.028, 0.07));
    for (const sx of [-0.83, 0.83]) {
      const ep = new THREE.Mesh(feEndplateGeo, tertiaryMat);
      ep.position.set(sx, 0.245, 1.70);
      bodyGroup.add(ep);
    }

    // Sculpted Gen3 Evo rear wheel aero pods & winglets
    const wingletProfile = new THREE.Shape();
    wingletProfile.moveTo(-0.30, 0.0);
    wingletProfile.lineTo(0.26, 0.0);
    wingletProfile.lineTo(0.14, 0.22);
    wingletProfile.lineTo(-0.26, 0.34);
    wingletProfile.closePath();
    const rawWingletGeo = new THREE.ExtrudeGeometry(wingletProfile, {
      depth: 0.075,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.012,
      bevelSegments: 1,
    });
    rawWingletGeo.rotateY(Math.PI / 2);
    const wingletGeo = track(applySixZoneCarUVs(rawWingletGeo, undefined, { isAero: true }));
    rawWingletGeo.dispose();
    for (const sx of [-0.62, 0.545]) {
      const winglet = new THREE.Mesh(wingletGeo, secondaryMat);
      winglet.position.set(sx, 0.54, -1.52);
      winglet.castShadow = true;
      bodyGroup.add(winglet);
    }

    [-0.12, 0.12].forEach((hx, idx) => {
      const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.04, 0.045)), headlightMats[idx]);
      hl.position.set(hx, 0.32, 1.80);
      bodyGroup.add(hl);
    });
  } else {
    // ================= F1 SPEC ERA SCULPTED MONOCOQUE SILHOUETTES (2026 / 2021 / 2005) =================
    const f1Stations: FormulaHullStationSpec[] = [
      { z: -1.68, halfW: 0.14, yBottom: 0.22, yShoulder: 0.42, yDeck: 0.50, cockpitDepth: 0, cockpitHalfW: 0.05 },
      { z: -1.05, halfW: 0.22, yBottom: 0.19, yShoulder: 0.48, yDeck: 0.62, cockpitDepth: 0, cockpitHalfW: 0.08 },
      { z: -0.32, halfW: 0.30, yBottom: 0.17, yShoulder: 0.55, yDeck: 0.67, cockpitDepth: 0.02, cockpitHalfW: 0.18 },
      { z: -0.06, halfW: 0.32, yBottom: 0.17, yShoulder: 0.56, yDeck: 0.65, cockpitDepth: 0.18, cockpitHalfW: 0.21 },
      { z: 0.42, halfW: 0.29, yBottom: 0.18, yShoulder: 0.53, yDeck: 0.61, cockpitDepth: 0.16, cockpitHalfW: 0.18 },
      { z: 0.66, halfW: 0.24, yBottom: 0.19, yShoulder: 0.48, yDeck: 0.56, cockpitDepth: 0, cockpitHalfW: 0.11 },
      { z: 1.24, halfW: isF1_2005 ? 0.16 : 0.18, yBottom: isF1_2005 ? 0.26 : 0.21, yShoulder: 0.36, yDeck: 0.41, cockpitDepth: 0, cockpitHalfW: 0.08 },
      { z: 1.78, halfW: isF1_2005 ? 0.11 : 0.13, yBottom: isF1_2005 ? 0.28 : 0.20, yShoulder: 0.25, yDeck: 0.28, cockpitDepth: 0, cockpitHalfW: 0.05 },
    ];
    const hullGeo = track(createLoftedFormulaHullGeometry(f1Stations));
    const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    bodyGroup.add(hullMesh);

    // Sculpted Era-Accurate Undercut Sidepods + Recessed Radiator Intakes
    const spMaxW = isF1_2021 ? 0.66 : isF1_2005 ? 0.60 : 0.56;
    const spFloorW = isF1_2021 ? 0.54 : isF1_2005 ? 0.46 : 0.41;
    const f1SidepodStations: FormulaSidepodStationSpec[] = [
      { z: -1.28, xInner: 0.16, xOuterFloor: 0.22, xOuterShoulder: 0.26, yFloor: 0.17, yMid: 0.32, yTop: 0.45 },
      { z: -0.68, xInner: 0.22, xOuterFloor: spFloorW * 0.85, xOuterShoulder: spMaxW * 0.88, yFloor: 0.165, yMid: 0.37, yTop: 0.53 },
      { z: 0.12, xInner: 0.24, xOuterFloor: spFloorW, xOuterShoulder: spMaxW, yFloor: 0.165, yMid: 0.39, yTop: 0.56 },
      { z: 0.46, xInner: 0.22, xOuterFloor: spFloorW * 0.84, xOuterShoulder: spMaxW * 0.94, yFloor: 0.19, yMid: 0.39, yTop: 0.55 },
    ];
    for (const sx of [-1, 1] as const) {
      const spGeo = track(createFormulaSidepodGeometry(f1SidepodStations, sx));
      const spMesh = new THREE.Mesh(spGeo, bodyMat);
      spMesh.castShadow = true;
      bodyGroup.add(spMesh);

      const inlet = new THREE.Mesh(track(new THREE.BoxGeometry(spMaxW * 0.44, 0.16, 0.06)), matteTrimMat);
      inlet.position.set(sx * (spMaxW * 0.64), 0.44, 0.45);
      inlet.rotation.y = sx * -0.14;
      bodyGroup.add(inlet);
    }

    // Sculpted tapered F1 roll-hoop airbox + engine cover shark fin
    const engineCoverProfile = new THREE.Shape();
    engineCoverProfile.moveTo(-0.08, 0.0);
    engineCoverProfile.lineTo(1.36, 0.0);
    engineCoverProfile.lineTo(1.38, 0.12);
    engineCoverProfile.lineTo(0.55, 0.27);
    engineCoverProfile.lineTo(0.06, 0.42);
    engineCoverProfile.lineTo(-0.08, 0.36);
    engineCoverProfile.closePath();
    const rawAirboxGeo = new THREE.ExtrudeGeometry(engineCoverProfile, {
      depth: 0.17,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.025,
      bevelSegments: 1,
    });
    rawAirboxGeo.rotateY(Math.PI / 2);
    rawAirboxGeo.translate(-0.085, 0.52, -0.12);
    const airboxGeo = track(applySixZoneCarUVs(rawAirboxGeo, undefined, { isAero: true }));
    rawAirboxGeo.dispose();
    const airboxMesh = new THREE.Mesh(airboxGeo, secondaryMat);
    airboxMesh.castShadow = true;
    bodyGroup.add(airboxMesh);

    // Recessed dark airbox intake + Onboard T-Cam pod (2026 / 2021)
    const scoopMouth = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.11, 0.055)), matteTrimMat);
    scoopMouth.position.set(0, 0.85, -0.02);
    bodyGroup.add(scoopMouth);

    if (!isF1_2005) {
      const tCamPost = new THREE.Mesh(track(new THREE.BoxGeometry(0.036, 0.075, 0.06)), carbonMat);
      tCamPost.position.set(0, 0.96, -0.11);
      bodyGroup.add(tCamPost);
      const tCamBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.028, 0.055)), carbonMat);
      tCamBar.position.set(0, 0.995, -0.11);
      bodyGroup.add(tCamBar);
    }

    // Driver Helmet + Tinted Visor + Cockpit Steering Wheel
    const f1HelmetGeo = track(new THREE.SphereGeometry(0.165, 14, 12));
    const f1HelmetUv = f1HelmetGeo.getAttribute('uv');
    for (let i = 0; i < f1HelmetUv.count; i++) {
      f1HelmetUv.setXY(i, Math.min(1, Math.max(0, f1HelmetUv.getX(i))), Math.min(1, Math.max(0, f1HelmetUv.getY(i))));
    }
    const helmet = new THREE.Mesh(f1HelmetGeo, tertiaryMat);
    helmet.position.set(0, 0.69, 0.13);
    bodyGroup.add(helmet);
    const visor = new THREE.Mesh(track(new THREE.CylinderGeometry(0.168, 0.168, 0.058, 12, 1, true, -0.9, 1.8)), canopyMat);
    visor.position.set(0, 0.70, 0.13);
    bodyGroup.add(visor);

    const wheelRim = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.12, 0.03)), matteTrimMat);
    wheelRim.name = 'cockpit_wheel';
    wheelRim.position.set(0, 0.56, 0.34);
    wheelRim.rotation.x = -0.35;
    bodyGroup.add(wheelRim);

    if (isF1_2005) {
      const coaming = new THREE.Mesh(track(new THREE.BoxGeometry(0.38, 0.15, 0.50)), secondaryMat);
      coaming.position.set(0, 0.68, -0.08);
      bodyGroup.add(coaming);

      for (const sx of [-0.46, 0.46]) {
        const chimney = new THREE.Mesh(track(new THREE.CylinderGeometry(0.038, 0.056, 0.22, 8)), matteTrimMat);
        chimney.position.set(sx, 0.68, -0.32);
        bodyGroup.add(chimney);
      }
    } else {
      const haloMat = livery.carbonHood ? carbonMat : titaniumMat;
      const haloCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.23, 0.66, -0.05),
        new THREE.Vector3(-0.18, 0.80, 0.22),
        new THREE.Vector3(0, 0.81, 0.44),
        new THREE.Vector3(0.18, 0.80, 0.22),
        new THREE.Vector3(0.23, 0.66, -0.05),
      ]);
      const haloMesh = new THREE.Mesh(track(new THREE.TubeGeometry(haloCurve, 16, 0.026, 8, false)), haloMat);
      bodyGroup.add(haloMesh);

      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.81, 0.44),
        new THREE.Vector3(0, 0.68, 0.49),
        new THREE.Vector3(0, 0.54, 0.52),
      ]);
      const stemMesh = new THREE.Mesh(track(new THREE.TubeGeometry(stemCurve, 6, 0.024, 8, false)), haloMat);
      bodyGroup.add(stemMesh);
    }

    // Sidepod-shoulder aero mirrors on stalks
    for (const sx of [-1, 1] as const) {
      const mirror = createAeroMirrorGroup({
        sideSign: sx,
        stalkLen: 0.18,
        bodyMat: secondaryMat,
        trimMat: matteTrimMat,
        mirrorGlassMat: chromeMat,
        track,
      });
      mirror.position.set(sx * 0.30, 0.58, 0.34);
      bodyGroup.add(mirror);
    }

    if (isF1_2021) {
      const bbGeo = track(new THREE.BoxGeometry(0.045, 0.34, 0.62));
      const floorWingGeo = track(new THREE.BoxGeometry(0.15, 0.036, 1.34));
      for (const sx of [-0.64, 0.64]) {
        const bb = new THREE.Mesh(bbGeo, carbonMat);
        bb.position.set(sx * 0.90, 0.38, 0.54);
        bb.rotation.y = sx < 0 ? 0.16 : -0.16;
        bodyGroup.add(bb);

        const fWing = new THREE.Mesh(floorWingGeo, carbonMat);
        fWing.position.set(sx * 1.12, 0.19, -0.20);
        bodyGroup.add(fWing);
      }
    }

    // Multi-Element Front Wing + Sculpted Endplates
    const fwWidth = isF1_2005 ? 1.72 : isF1_2026 ? 1.82 : 1.94;
    const fwMat = livery.carbonSplitter ? carbonMat : secondaryMat;
    const fwMesh = new THREE.Mesh(track(createAirfoilWingGeometry(fwWidth, 0.28, 0.044)), fwMat);
    fwMesh.position.set(0, 0.185, 1.76);
    fwMesh.castShadow = true;
    bodyGroup.add(fwMesh);

    if (!isF1_2005) {
      const fwMidMesh = new THREE.Mesh(track(createAirfoilWingGeometry(fwWidth * 0.96, 0.16, 0.034)), fwMat);
      fwMidMesh.position.set(0, 0.225, 1.66);
      fwMidMesh.rotation.x = 0.12;
      bodyGroup.add(fwMidMesh);
    }

    const fwUpperMesh = new THREE.Mesh(track(createAirfoilWingGeometry(fwWidth * 0.92, 0.14, 0.030)), tertiaryMat);
    fwUpperMesh.position.set(0, 0.265, 1.58);
    fwUpperMesh.rotation.x = 0.22;
    bodyGroup.add(fwUpperMesh);
    if (isF1_2026) {
      frontWingFlap = fwUpperMesh;
    }

    const fweGeo = track(createWingEndplateGeometry(0.22, 0.44, 0.034, 0.08));
    for (const sx of [-fwWidth * 0.5, fwWidth * 0.5]) {
      const fwe = new THREE.Mesh(fweGeo, tertiaryMat);
      fwe.position.set(sx, 0.255, 1.70);
      bodyGroup.add(fwe);
    }

    // Rear Wing: Swan-Neck Pylons (2026) / Twin Struts + Mainplane + DRS Flap + Beam Wing + Sculpted Endplates
    const rwWidth = isF1_2005 ? 0.96 : isF1_2026 ? 1.14 : 1.24;
    const rwHeight = isF1_2005 ? 1.06 : 0.95;
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;

    if (isF1_2026) {
      const swanGeo = track(createSwanNeckPylonGeometry(rwHeight - 0.44, 0.20, 0.032));
      for (const sx of [-0.26, 0.26]) {
        const swan = new THREE.Mesh(swanGeo, carbonMat);
        swan.position.set(sx, 0.44, -1.48);
        bodyGroup.add(swan);
      }
    } else {
      const rwStrutGeo = track(new THREE.BoxGeometry(0.038, isF1_2005 ? 0.62 : 0.52, 0.22));
      for (const sx of [-0.36, 0.36]) {
        const strut = new THREE.Mesh(rwStrutGeo, matteTrimMat);
        strut.position.set(sx, (rwHeight + 0.42) * 0.5, -1.66);
        bodyGroup.add(strut);
      }
    }

    if (!isF1_2005) {
      const beamWing = new THREE.Mesh(track(createAirfoilWingGeometry(rwWidth * 0.84, 0.16, 0.034)), carbonMat);
      beamWing.position.set(0, 0.44, -1.66);
      beamWing.rotation.x = 0.18;
      bodyGroup.add(beamWing);
    }

    const rwMain = new THREE.Mesh(track(createAirfoilWingGeometry(rwWidth, 0.26, 0.048)), wingMat);
    rwMain.position.set(0, rwHeight, -1.68);
    rwMain.castShadow = true;
    bodyGroup.add(rwMain);

    rearWingFlap = new THREE.Mesh(track(createAirfoilWingGeometry(rwWidth * 0.96, 0.19, 0.038)), tertiaryMat);
    rearWingFlap.position.set(0, rwHeight + 0.075, -1.75);
    rearWingFlap.rotation.x = isF1_2026 ? 0.36 : 0.32;
    bodyGroup.add(rearWingFlap);

    const rweGeo = track(createWingEndplateGeometry(0.36, 0.42, 0.032, 0.08));
    for (const sx of [-rwWidth * 0.5, rwWidth * 0.5]) {
      const rwe = new THREE.Mesh(rweGeo, secondaryMat);
      rwe.position.set(sx, rwHeight - 0.01, -1.69);
      bodyGroup.add(rwe);
    }

    const rainLight = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.085, 0.03)), brakeLightMat);
    rainLight.position.set(0, 0.40, -1.76);
    bodyGroup.add(rainLight);

    const hlGeo = track(new THREE.BoxGeometry(0.09, 0.045, 0.045));
    [-0.14, 0.14].forEach((hx, idx) => {
      const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
      hl.position.set(hx, 0.31, 1.76);
      bodyGroup.add(hl);
    });
  }

  return { frontWingFlap, rearWingFlap };
}

export interface ClosedWheelBodyBuildParams {
  bodyGroup: THREE.Group;
  materials: CarMaterialSet;
  design: ClosedWheelDesign;
  livery: LiveryConfig;
  carId?: string;
  length: number;
  width: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelBaseZ: number;
  trackHalfX: number;
  isProto: boolean;
  isLmp2: boolean;
  isGT3: boolean;
  isGT4: boolean;
  isStreetCar: boolean;
  track: TrackDisposable;
}

export function buildClosedWheelCarBody(params: ClosedWheelBodyBuildParams): {
  rearWingFlap: THREE.Mesh | null;
} {
  const {
    bodyGroup,
    materials,
    design,
    livery,
    carId,
    length,
    width,
    wheelRadius,
    wheelWidth,
    wheelBaseZ,
    trackHalfX,
    isProto,
    isLmp2,
    isGT3,
    isGT4,
    isStreetCar,
    track,
  } = params;
  const {
    bodyMat,
    primaryMat,
    secondaryMat,
    tertiaryMat,
    carbonMat,
    matteTrimMat,
    canopyMat,
    chromeMat,
    bannerMat,
    headlightMats,
    brakeLightMat,
    rainLightMat,
  } = materials;

  let rearWingFlap: THREE.Mesh | null = null;

  const bodyWidth = width * (isProto ? 0.97 : 1.01);
  const bodyLen = length * 0.94;
  const cabinStyle: CabinStyle =
    design.cabinStyle ?? (isProto ? 'proto-teardrop' : isStreetCar ? 'grand-tourer' : 'mid-engine-buttress');

  // 1. Unified Parametric Hull with Recessed Wheel Wells & Swept Fenders
  const hullStations = buildHullStations(
    bodyLen,
    bodyWidth,
    wheelBaseZ,
    wheelRadius,
    trackHalfX,
    wheelWidth,
    { ...design, cabinStyle },
    isProto,
    isStreetCar,
  );
  const bodyGeo = track(createLoftedHullGeometry(hullStations, bodyWidth, bodyLen));
  const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  bodyGroup.add(mainBody);

  // Helper to query exact lofted hull surface height/width at any z
  const sampleHullAtZ = (zQuery: number): HullStationSpec => {
    for (let i = 0; i < hullStations.length - 1; i++) {
      const a = hullStations[i];
      const b = hullStations[i + 1];
      if (zQuery >= a.z && zQuery <= b.z) {
        const f = (zQuery - a.z) / Math.max(1e-4, b.z - a.z);
        return {
          z: zQuery,
          halfW: a.halfW + (b.halfW - a.halfW) * f,
          xInnerFloor: a.xInnerFloor + (b.xInnerFloor - a.xInnerFloor) * f,
          yFloor: a.yFloor + (b.yFloor - a.yFloor) * f,
          ySill: a.ySill + (b.ySill - a.ySill) * f,
          yBelt: a.yBelt + (b.yBelt - a.yBelt) * f,
          wBelt: a.wBelt + (b.wBelt - a.wBelt) * f,
          yCrown: a.yCrown + (b.yCrown - a.yCrown) * f,
          wCrown: a.wCrown + (b.wCrown - a.wCrown) * f,
        };
      }
    }
    return zQuery <= hullStations[0].z ? hullStations[0] : hullStations[hullStations.length - 1];
  };

  // Dark recessed upper wheel-arch inner backing + curved upper barrel liner (seals wheel wells cleanly above axle)
  const backingGeo = track(new THREE.CircleGeometry(wheelRadius * 0.92, 14, 0, Math.PI));
  const archLinerGeo = track(
    new THREE.CylinderGeometry(wheelRadius + 0.040, wheelRadius + 0.040, wheelWidth * 1.12, 12, 1, true, 0, Math.PI),
  );
  archLinerGeo.rotateZ(Math.PI / 2);
  const linerBackMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 0.94,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  const linerCenterX = Math.max(0.38, trackHalfX - wheelWidth * 0.5 - 0.024);
  for (const sz of [-wheelBaseZ, wheelBaseZ]) {
    for (const side of [-1, 1]) {
      const backing = new THREE.Mesh(backingGeo, linerBackMat);
      backing.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      backing.position.set(side * linerCenterX, wheelRadius, sz);
      bodyGroup.add(backing);

      const archBarrel = new THREE.Mesh(archLinerGeo, linerBackMat);
      archBarrel.position.set(side * (trackHalfX - 0.012), wheelRadius, sz);
      bodyGroup.add(archBarrel);
    }
  }

  // 2. Clean Underbody Chassis Tray (strictly inside track width between axles, never clips tires)
  const trayGeo = track(new THREE.BoxGeometry(trackHalfX * 1.44, 0.055, bodyLen * 0.90));
  const trayMesh = new THREE.Mesh(trayGeo, matteTrimMat);
  trayMesh.position.set(0, 0.145, 0);
  bodyGroup.add(trayMesh);

  // 3. Two-Layer Framed Cockpit: Sleek Thin Painted Roof Skin + Flush Pillars + Recessed Tinted Glass
  const cabinStations = buildCabinStations(
    cabinStyle,
    design.cabinOffsetZ,
    design.cabinScaleW,
    design.cabinScaleH,
    design.cabinScaleL,
    isProto,
  );

  // Thin painted roof cap covering from rear header (st[1]) to windshield header (st[N-2])
  const roofStations = cabinStations.length >= 4 ? cabinStations.slice(1, cabinStations.length - 1) : cabinStations;
  const roofShellMat = livery.carbonHood ? carbonMat : primaryMat;
  if (roofStations.length >= 2) {
    const roofCapStations = roofStations.map((st) => ({
      ...st,
      yBase: st.yRoof - 0.008,
      wBase: st.wRoof * 1.005,
      yRoof: st.yRoof + 0.006,
    }));
    const roofCapGeo = track(createLoftedGreenhouseGeometry(roofCapStations, bodyWidth, bodyLen, 0));
    const roofCapMesh = new THREE.Mesh(roofCapGeo, roofShellMat);
    roofCapMesh.castShadow = true;
    bodyGroup.add(roofCapMesh);
  }

  // Flush A-pillars & C-pillars seamlessly meeting roof cap corners at st[1] and st[N-2]
  if (cabinStations.length >= 4) {
    const stFrontBtm = cabinStations[cabinStations.length - 1];
    const stFrontTop = cabinStations[cabinStations.length - 2];
    const stRearBtm = cabinStations[0];
    const stRearTop = cabinStations[1];

    for (const sideSign of [-1, 1]) {
      const aP0 = new THREE.Vector3(sideSign * stFrontBtm.wBase * 0.91, stFrontBtm.yBase, stFrontBtm.z);
      const aP1 = new THREE.Vector3(sideSign * stFrontTop.wRoof * 0.97, stFrontTop.yRoof + 0.004, stFrontTop.z);
      const aDir = new THREE.Vector3().subVectors(aP1, aP0);
      const aLen = aDir.length();
      const aPillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.028, aLen, 0.034)), roofShellMat);
      aPillar.position.copy(aP0).addScaledVector(aDir, 0.5);
      aPillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aDir.normalize());
      bodyGroup.add(aPillar);

      const cP0 = new THREE.Vector3(sideSign * stRearBtm.wBase * 0.91, stRearBtm.yBase, stRearBtm.z);
      const cP1 = new THREE.Vector3(sideSign * stRearTop.wRoof * 0.97, stRearTop.yRoof + 0.004, stRearTop.z);
      const cDir = new THREE.Vector3().subVectors(cP1, cP0);
      const cLen = cDir.length();
      const cPillar = new THREE.Mesh(
        track(new THREE.BoxGeometry(cabinStyle === 'mid-engine-buttress' ? 0.068 : 0.042, cLen, 0.065)),
        roofShellMat,
      );
      cPillar.position.copy(cP0).addScaledVector(cDir, 0.5);
      cPillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cDir.normalize());
      bodyGroup.add(cPillar);
    }
  }

  // Flush Recessed Dark-Tinted Glass Greenhouse + Interior Cockpit Silhouette & Wiper
  const glassGeo = track(createLoftedGreenhouseGeometry(cabinStations, bodyWidth, bodyLen, 0.012));
  const glassMesh = new THREE.Mesh(glassGeo, canopyMat);
  glassMesh.castShadow = true;
  bodyGroup.add(glassMesh);

  if (cabinStations.length >= 3) {
    const midSt = cabinStations[Math.floor(cabinStations.length * 0.5)];
    const seatGeo = track(new THREE.BoxGeometry(0.32, 0.24, 0.10));
    const seat = new THREE.Mesh(seatGeo, matteTrimMat);
    seat.name = 'cockpit_seat';
    seat.position.set(isProto ? 0 : -0.18, midSt.yBase + 0.14, midSt.z - 0.06);
    seat.rotation.x = -0.18;
    bodyGroup.add(seat);

    const rollBar = new THREE.Mesh(
      track(new THREE.BoxGeometry(midSt.wRoof * 1.48, 0.032, 0.036)),
      matteTrimMat,
    );
    rollBar.name = 'interior_rollbar';
    rollBar.position.set(0, midSt.yRoof - 0.05, midSt.z - 0.08);
    bodyGroup.add(rollBar);

    const stFrontBtm = cabinStations[cabinStations.length - 1];
    const wiper = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.016, 0.020)), matteTrimMat);
    wiper.name = 'wiper';
    wiper.position.set(0.06, stFrontBtm.yBase + 0.045, stFrontBtm.z - 0.06);
    wiper.rotation.y = -0.28;
    bodyGroup.add(wiper);
  }

  // Side Aero Wing Mirrors on Swept Stalks (for Prototypes, GT3, GT4, Supercars & Coupes)
  if (cabinStations.length >= 2) {
    const mirrorZ = cabinStations[cabinStations.length - 1].z - (isProto ? 0.22 : 0.14);
    const mirrorBaseHull = sampleHullAtZ(mirrorZ);
    const mirrorY = isProto ? mirrorBaseHull.yBelt + 0.065 : mirrorBaseHull.yBelt + 0.055;
    for (const sx of [-1, 1] as const) {
      const mirror = createAeroMirrorGroup({
        sideSign: sx,
        stalkLen: isProto ? 0.075 : 0.085,
        bodyMat: isProto ? carbonMat : secondaryMat,
        trimMat: matteTrimMat,
        mirrorGlassMat: chromeMat,
        track,
      });
      mirror.position.set(sx * mirrorBaseHull.wBelt, mirrorY, mirrorZ);
      bodyGroup.add(mirror);
    }
  }

  // 4. Flush Integrated Brand Grilles (strictly bounded below yCrown & inside nose width)
  const noseSt = sampleHullAtZ(bodyLen * 0.482);
  const noseFasciaZ = bodyLen * 0.484;
  const maxGrilleW = Math.max(0.44, noseSt.wBelt * 1.18);
  const maxGrilleH = Math.max(0.055, noseSt.yCrown - noseSt.ySill - 0.03);
  const noseMidY = noseSt.ySill + Math.min(maxGrilleH * 0.55 + 0.015, (noseSt.yCrown - noseSt.ySill) * 0.48);

  if (design.grilleStyle === 'bentley-matrix') {
    const gw = Math.min(0.84, maxGrilleW);
    const gh = Math.min(0.16, maxGrilleH);
    const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), chromeMat);
    bezel.position.set(0, noseMidY, noseFasciaZ - 0.014);
    bezel.rotation.x = 0.18;
    bodyGroup.add(bezel);
    const meshInner = new THREE.Mesh(track(new THREE.BoxGeometry(gw * 0.90, gh * 0.76, 0.045)), matteTrimMat);
    meshInner.position.set(0, noseMidY, noseFasciaZ - 0.008);
    meshInner.rotation.x = 0.18;
    bodyGroup.add(meshInner);
  } else if (design.grilleStyle === 'bmw-kidney') {
    const gh = Math.min(0.14, maxGrilleH);
    for (const gx of [-0.14, 0.14]) {
      const trim = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, gh, 0.04)), chromeMat);
      trim.position.set(gx, noseMidY, noseFasciaZ - 0.014);
      trim.rotation.x = 0.16;
      bodyGroup.add(trim);
      const k = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, gh * 0.78, 0.045)), matteTrimMat);
      k.position.set(gx, noseMidY, noseFasciaZ - 0.008);
      k.rotation.x = 0.16;
      bodyGroup.add(k);
    }
  } else if (design.grilleStyle === 'merc-panamericana') {
    const gw = Math.min(0.76, maxGrilleW);
    const gh = Math.min(0.13, maxGrilleH);
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
    frame.position.set(0, noseMidY, noseFasciaZ - 0.012);
    frame.rotation.x = 0.18;
    bodyGroup.add(frame);
    for (let gx = -gw * 0.38; gx <= gw * 0.38; gx += 0.11) {
      const slat = new THREE.Mesh(track(new THREE.BoxGeometry(0.020, gh * 0.84, 0.045)), chromeMat);
      slat.position.set(gx, noseMidY, noseFasciaZ - 0.006);
      slat.rotation.x = 0.18;
      bodyGroup.add(slat);
    }
  } else if (design.grilleStyle === 'audi-singleframe') {
    const gw = Math.min(0.74, maxGrilleW);
    const gh = Math.min(0.15, maxGrilleH);
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
    frame.position.set(0, noseMidY, noseFasciaZ - 0.012);
    frame.rotation.x = 0.16;
    bodyGroup.add(frame);
    const ringBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.026, 0.045)), chromeMat);
    ringBar.position.set(0, noseMidY + gh * 0.18, noseFasciaZ - 0.006);
    bodyGroup.add(ringBar);
  } else if (design.grilleStyle === 'aston-wings') {
    const gw = Math.min(0.76, maxGrilleW);
    const gh = Math.min(0.08, maxGrilleH * 0.78);
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
    mesh.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.014);
    mesh.rotation.x = 0.20;
    bodyGroup.add(mesh);
    const bar = new THREE.Mesh(track(new THREE.BoxGeometry(gw * 0.88, 0.018, 0.045)), tertiaryMat);
    bar.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.008);
    bodyGroup.add(bar);
  } else if (design.grilleStyle === 'mustang-pony' || design.grilleStyle === 'gtr-v' || design.grilleStyle === 'lexus-spindle') {
    const gw = Math.min(0.72, maxGrilleW);
    const gh = Math.min(0.14, maxGrilleH);
    const intake = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
    intake.position.set(0, noseMidY, noseFasciaZ - 0.012);
    intake.rotation.x = 0.16;
    bodyGroup.add(intake);
    if (design.grilleStyle === 'mustang-pony') {
      const hoodVent = new THREE.Mesh(track(new THREE.BoxGeometry(0.54, 0.022, 0.34)), carbonMat);
      const ventSt = sampleHullAtZ(bodyLen * 0.24);
      hoodVent.position.set(0, ventSt.yCrown + 0.004, bodyLen * 0.24);
      bodyGroup.add(hoodVent);
    }
  } else if (design.grilleStyle === 'clio-hatch' || design.grilleStyle === 'civic-fl5' || design.grilleStyle === 'porsche-992') {
    const gw = Math.min(0.78, maxGrilleW);
    const gh = Math.min(0.075, maxGrilleH * 0.72);
    const intake = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
    intake.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.016);
    intake.rotation.x = 0.14;
    bodyGroup.add(intake);
  } else if (design.grilleStyle !== 'none') {
    const gh = Math.min(0.07, maxGrilleH * 0.7);
    for (const gx of [-noseSt.wBelt * 0.45, noseSt.wBelt * 0.45]) {
      const intake = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, gh, 0.04)), matteTrimMat);
      intake.position.set(gx, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.018);
      intake.rotation.y = gx < 0 ? -0.14 : 0.14;
      bodyGroup.add(intake);
    }
  }

  // 5. Flush Sculpted Side Intakes & Louvers (strictly flush with door skin — no sticking-out bricks)
  if (design.sidepodStyle === 'clio-side-scoop' || design.sidepodStyle === 'sculpted-intake') {
    const doorZ = design.sidepodStyle === 'clio-side-scoop' ? -0.28 : -0.20;
    const doorSt = sampleHullAtZ(doorZ);
    for (const sx of [-1, 1]) {
      const pocket = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.22, 0.48)), matteTrimMat);
      pocket.position.set(sx * (doorSt.halfW * 0.99), doorSt.ySill + 0.16, doorZ);
      pocket.rotation.y = sx * -0.05;
      bodyGroup.add(pocket);

      const strake = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.05, 0.20, 0.08)),
        design.sidepodStyle === 'clio-side-scoop' ? secondaryMat : tertiaryMat,
      );
      strake.position.set(sx * (doorSt.halfW * 1.00), doorSt.ySill + 0.16, doorZ + 0.20);
      bodyGroup.add(strake);
    }
  } else if (design.sidepodStyle === 'venturi-tunnel' || design.sidepodStyle === 'undercut') {
    const doorSt = sampleHullAtZ(0.0);
    for (const sx of [-1, 1]) {
      const undercut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.14, 1.12)), matteTrimMat);
      undercut.position.set(sx * (doorSt.halfW * 0.96), 0.22, 0.02);
      bodyGroup.add(undercut);
    }
  } else if (design.sidepodStyle === 'louvered') {
    const fSt = sampleHullAtZ(wheelBaseZ);
    for (const sx of [-1, 1]) {
      const louver = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.024, 0.36)), matteTrimMat);
      louver.position.set(sx * (fSt.wBelt * 0.72), fSt.yBelt + 0.01, wheelBaseZ);
      bodyGroup.add(louver);
    }
  }

  // 6. Tapered ExtrudeGeometry Prototype Shark Fin / Roof Air Scoop
  if (design.sharkFinStyle === 'tall-proto' || design.sharkFinStyle === 'curved-lmh') {
    const finH = isLmp2 ? 0.32 : design.sharkFinStyle === 'curved-lmh' ? 0.26 : 0.30;
    const finGeo = track(createSharkFinGeometry(1.02, finH));
    const fin = new THREE.Mesh(finGeo, secondaryMat);
    fin.position.set(0, 0.62, -1.52);
    fin.castShadow = true;
    bodyGroup.add(fin);
  } else if (design.sharkFinStyle === 'roof-scoop') {
    const scoopGeo = track(createSharkFinGeometry(0.62, 0.14));
    const scoop = new THREE.Mesh(scoopGeo, carbonMat);
    const roofPeak = cabinStations[Math.floor(cabinStations.length * 0.5)]?.yRoof ?? 0.88;
    scoop.position.set(0, roofPeak - 0.02, design.cabinOffsetZ - 0.65);
    scoop.castShadow = true;
    bodyGroup.add(scoop);
    if (isProto) {
      const finGeo = track(createSharkFinGeometry(0.92, 0.24));
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(0, 0.62, -1.52);
      bodyGroup.add(fin);
    }
  }

  // GT3 / GT4 Dive-Plane Canards (tucked neatly at front bumper corners)
  if (isGT3 || isGT4) {
    const cSt = sampleHullAtZ(bodyLen * 0.44);
    const canardGeo = track(new THREE.BoxGeometry(0.12, 0.025, 0.14));
    for (const sx of [-1, 1]) {
      for (const cy of isGT3 ? [0.28, 0.38] : [0.32]) {
        const canard = new THREE.Mesh(canardGeo, carbonMat);
        canard.position.set(sx * (cSt.halfW + 0.01), cy, bodyLen * 0.45);
        canard.rotation.z = sx * -0.18;
        canard.rotation.x = -0.12;
        bodyGroup.add(canard);
      }
    }
  }

  // Windshield Banner (hugging flush with windshield glass slope)
  if (!isStreetCar && cabinStations.length >= 2) {
    const stTop = cabinStations[cabinStations.length - 2];
    const stBtm = cabinStations[cabinStations.length - 1];
    const t0 = 0.05;
    const t1 = 0.28;
    const lerpSt = (t: number) => ({
      z: stTop.z + (stBtm.z - stTop.z) * t,
      w: (stTop.wRoof + (stBtm.wRoof - stTop.wRoof) * t) * 0.90,
      y: stTop.yRoof + (stBtm.yRoof - stTop.yRoof) * t,
    });
    const rTop = lerpSt(t0);
    const rBtm = lerpSt(t1);
    const liftY = 0.008;
    const liftZ = 0.008;
    const crownLift = 0.024;
    const bPos = new Float32Array([
      -rTop.w, rTop.y + liftY, rTop.z + liftZ,
      0, rTop.y + crownLift + liftY, rTop.z + liftZ,
      rTop.w, rTop.y + liftY, rTop.z + liftZ,
      -rBtm.w, rBtm.y + liftY, rBtm.z + liftZ,
      0, rBtm.y + crownLift + liftY, rBtm.z + liftZ,
      rBtm.w, rBtm.y + liftY, rBtm.z + liftZ,
    ]);
    const bUv = new Float32Array([
      0, 1, 0.5, 1, 1, 1,
      0, 0, 0.5, 0, 1, 0,
    ]);
    const bannerGeo = track(new THREE.BufferGeometry());
    bannerGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    bannerGeo.setAttribute('uv', new THREE.BufferAttribute(bUv, 2));
    bannerGeo.setIndex([0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2]);
    bannerGeo.computeVertexNormals();
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bodyGroup.add(bannerMesh);
  }

  // 7. Front Chin Splitter + Endplate Flicks & Rear Venturi Diffuser + Rain-Light Diffuser Pod
  const splitterWidth = noseSt.halfW * 2.04;
  const splitterLen = isGT3 ? 0.17 : isGT4 ? 0.13 : isProto ? 0.19 : 0.12;
  const splitterMat = livery.carbonSplitter || isGT3 || isGT4 ? carbonMat : tertiaryMat;
  const splitterMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(splitterWidth, 0.034, splitterLen)),
    splitterMat,
  );
  splitterMesh.position.set(0, 0.152, bodyLen * 0.495);
  bodyGroup.add(splitterMesh);

  if (isGT3 || isProto) {
    const sfGeo = track(createWingEndplateGeometry(0.11, splitterLen * 1.15, 0.022, 0.03));
    for (const sx of [-splitterWidth * 0.5, splitterWidth * 0.5]) {
      const flick = new THREE.Mesh(sfGeo, splitterMat);
      flick.position.set(sx, 0.19, bodyLen * 0.492);
      bodyGroup.add(flick);
    }
  }

  const rearSt = sampleHullAtZ(-bodyLen * 0.48);
  const diffGroup = createVenturiDiffuserGroup({
    width: rearSt.halfW * 1.68,
    depth: isProto || isGT3 ? 0.24 : 0.19,
    height: isProto ? 0.145 : 0.12,
    strakeCount: isProto || isGT3 ? 6 : 5,
    rainLightMat,
    carbonMat,
    matteTrimMat,
    track,
    hasRainPod: true,
  });
  diffGroup.position.set(0, 0.145, -bodyLen * 0.485);
  bodyGroup.add(diffGroup);

  // 8. Exhaust Tips per Architecture
  if (design.exhaustStyle === 'clio-center-twin') {
    const exGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 12));
    exGeo.rotateX(Math.PI / 2);
    for (const ex of [-0.065, 0.065]) {
      const exhaust = new THREE.Mesh(exGeo, chromeMat);
      exhaust.position.set(ex, 0.24, -bodyLen * 0.505);
      bodyGroup.add(exhaust);
    }
  } else if (design.exhaustStyle === 'rear-dual') {
    const exGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 10));
    exGeo.rotateX(Math.PI / 2);
    for (const ex of [-0.36, -0.26, 0.26, 0.36]) {
      const exhaust = new THREE.Mesh(exGeo, chromeMat);
      exhaust.position.set(ex, 0.23, -bodyLen * 0.505);
      bodyGroup.add(exhaust);
    }
  } else if (design.exhaustStyle === 'rear-center') {
    const exGeo = track(new THREE.CylinderGeometry(0.048, 0.048, 0.10, 10));
    exGeo.rotateX(Math.PI / 2);
    for (const ex of [-0.085, 0.085]) {
      const exhaust = new THREE.Mesh(exGeo, chromeMat);
      exhaust.position.set(ex, 0.26, -bodyLen * 0.505);
      bodyGroup.add(exhaust);
    }
  } else if (design.exhaustStyle === 'top-exit') {
    const exGeo = track(new THREE.CylinderGeometry(0.042, 0.052, 0.08, 10));
    for (const ex of [-0.15, 0.15]) {
      const exhaust = new THREE.Mesh(exGeo, chromeMat);
      exhaust.position.set(ex, 0.58, -bodyLen * 0.18);
      bodyGroup.add(exhaust);
    }
  } else if (design.exhaustStyle === 'side-exit') {
    const exGeo = track(new THREE.CylinderGeometry(0.038, 0.038, 0.08, 10));
    exGeo.rotateZ(Math.PI / 2);
    const exSt = sampleHullAtZ(-0.35);
    for (const sx of [-1, 1]) {
      const exhaust = new THREE.Mesh(exGeo, chromeMat);
      exhaust.position.set(sx * (exSt.halfW + 0.01), 0.21, -0.35);
      bodyGroup.add(exhaust);
    }
  }

  // 9. Detailed Cambered Multi-Element Rear Wing / Swan-Neck & Sculpted Endplates
  const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
  if (design.rearDeckStyle === 'roof-spoiler-hatch') {
    const roofEdge = cabinStations[1] ?? cabinStations[0];
    const spoilerZ = (roofEdge?.z ?? -1.1) - 0.04;
    const spoilerY = (roofEdge?.yRoof ?? 1.0) + 0.025;
    const spoilerW = Math.min(bodyWidth * 0.72, (roofEdge?.wRoof ?? 0.5) * 2.15);
    const spoilerGeo = track(createAirfoilWingGeometry(spoilerW, 0.18, 0.038));
    const spoiler = new THREE.Mesh(spoilerGeo, wingMat);
    spoiler.position.set(0, spoilerY, spoilerZ);
    spoiler.castShadow = true;
    bodyGroup.add(spoiler);
  } else if (design.rearDeckStyle === 'w1-longtail') {
    const wingW = bodyWidth * 0.94;
    const deckSt = sampleHullAtZ(-bodyLen * 0.42);
    const swanGeo = track(createSwanNeckPylonGeometry(0.84 - deckSt.yCrown, 0.18, 0.034));
    for (const sx of [-0.40, 0.40]) {
      const swan = new THREE.Mesh(swanGeo, matteTrimMat);
      swan.position.set(sx, deckSt.yCrown - 0.02, -bodyLen * 0.42);
      bodyGroup.add(swan);
    }
    const w1Wing = new THREE.Mesh(track(createAirfoilWingGeometry(wingW, 0.30, 0.052)), wingMat);
    w1Wing.position.set(0, 0.84, -bodyLen * 0.50);
    w1Wing.castShadow = true;
    bodyGroup.add(w1Wing);
    const epGeo = track(createWingEndplateGeometry(0.18, 0.34, 0.028, 0.06));
    for (const sx of [-wingW * 0.5, wingW * 0.5]) {
      const ep = new THREE.Mesh(epGeo, carbonMat);
      ep.position.set(sx, 0.83, -bodyLen * 0.50);
      bodyGroup.add(ep);
    }
    rearWingFlap = w1Wing;
  } else if (design.rearDeckStyle === 'wingless-9x8') {
    const lowLip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.90, 0.18, 0.04)), carbonMat);
    lowLip.position.set(0, 0.65, -bodyLen * 0.47);
    bodyGroup.add(lowLip);
  } else if (design.rearDeckStyle === 'split-499p') {
    const wingWidth = bodyWidth * 0.96;
    const pylonGeo = track(createWingEndplateGeometry(0.46, 0.36, 0.038, 0.08));
    for (const sx of [-wingWidth * 0.48, wingWidth * 0.48]) {
      const endPylon = new THREE.Mesh(pylonGeo, secondaryMat);
      endPylon.position.set(sx, 0.78, -bodyLen * 0.45);
      endPylon.castShadow = true;
      bodyGroup.add(endPylon);
    }
    const mainWing = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.28, 0.052)), wingMat);
    mainWing.position.set(0, 0.97, -bodyLen * 0.46);
    mainWing.castShadow = true;
    bodyGroup.add(mainWing);
    const upperFlap = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth * 0.96, 0.14, 0.032)), tertiaryMat);
    upperFlap.position.set(0, 1.02, -bodyLen * 0.50);
    upperFlap.rotation.x = 0.24;
    bodyGroup.add(upperFlap);
    rearWingFlap = upperFlap;
  } else if (design.rearDeckStyle === 'active-lip') {
    const deckSt = sampleHullAtZ(-bodyLen * 0.46);
    const lip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.78, 0.15, 0.036)), wingMat);
    lip.position.set(0, deckSt.yCrown + 0.04, -bodyLen * 0.46);
    bodyGroup.add(lip);
    rearWingFlap = lip;
  } else if (design.rearDeckStyle === 'deck-tunnel') {
    const deckSt = sampleHullAtZ(-bodyLen * 0.46);
    const lip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.82, 0.16, 0.038)), wingMat);
    lip.position.set(0, deckSt.yCrown + 0.05, -bodyLen * 0.46);
    bodyGroup.add(lip);
    rearWingFlap = lip;
  } else if (design.rearDeckStyle === 'ducktail-rs') {
    const deckSt = sampleHullAtZ(-bodyLen * 0.44);
    const duckMesh = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.82, 0.06, 0.18)), primaryMat);
    duckMesh.position.set(0, deckSt.yCrown + 0.03, -bodyLen * 0.44);
    duckMesh.rotation.x = 0.34;
    duckMesh.castShadow = true;
    bodyGroup.add(duckMesh);

    if (carId === 'porsche-911-gt3-rs') {
      const wingWidth = bodyWidth * 0.95;
      const swanGeo = track(createSwanNeckPylonGeometry(0.36, 0.18, 0.034));
      for (const sx of [-0.38, 0.38]) {
        const strut = new THREE.Mesh(swanGeo, matteTrimMat);
        strut.position.set(sx, 0.62, -bodyLen * 0.37);
        bodyGroup.add(strut);
      }
      const rsWing = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.26, 0.05)), wingMat);
      rsWing.position.set(0, 0.97, -bodyLen * 0.45);
      rsWing.castShadow = true;
      bodyGroup.add(rsWing);
      const epGeo = track(createWingEndplateGeometry(0.20, 0.34, 0.030, 0.07));
      for (const sx of [-wingWidth * 0.5, wingWidth * 0.5]) {
        const ep = new THREE.Mesh(epGeo, tertiaryMat);
        ep.position.set(sx, 0.97, -bodyLen * 0.45);
        bodyGroup.add(ep);
      }
      rearWingFlap = rsWing;
    } else {
      rearWingFlap = duckMesh;
    }
  } else {
    // swan-neck or strut-race
    const isSwan = design.rearDeckStyle === 'swan-neck';
    const wingY = isGT4 ? 0.92 : 0.98;
    const deckSt = sampleHullAtZ(-bodyLen * 0.39);
    if (isSwan) {
      const swanGeo = track(createSwanNeckPylonGeometry(Math.max(0.28, wingY - deckSt.yCrown), 0.19, 0.034));
      for (const sx of [-0.44, 0.44]) {
        const strut = new THREE.Mesh(swanGeo, matteTrimMat);
        strut.position.set(sx, deckSt.yCrown - 0.02, -bodyLen * 0.39);
        bodyGroup.add(strut);
      }
    } else {
      const strutGeo = track(new THREE.BoxGeometry(0.04, 0.32, 0.18));
      for (const sx of [-0.44, 0.44]) {
        const strut = new THREE.Mesh(strutGeo, matteTrimMat);
        strut.position.set(sx, wingY - 0.18, -bodyLen * 0.44);
        bodyGroup.add(strut);
      }
    }

    const wingWidth = bodyWidth * (isGT3 ? 1.00 : isGT4 ? 0.94 : 0.95);
    const wingMesh = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.27, 0.050)), wingMat);
    wingMesh.position.set(0, wingY, -bodyLen * 0.46);
    wingMesh.castShadow = true;
    bodyGroup.add(wingMesh);
    rearWingFlap = wingMesh;

    if (isProto || isGT3) {
      const gurneyFlap = new THREE.Mesh(
        track(createAirfoilWingGeometry(wingWidth * 0.96, 0.12, 0.028)),
        tertiaryMat,
      );
      gurneyFlap.position.set(0, wingY + 0.045, -bodyLen * 0.49);
      gurneyFlap.rotation.x = 0.26;
      bodyGroup.add(gurneyFlap);
    }

    const epGeo = track(createWingEndplateGeometry(isGT4 ? 0.18 : 0.24, isGT4 ? 0.30 : 0.38, 0.030, 0.07));
    for (const sx of [-wingWidth * 0.5, wingWidth * 0.5]) {
      const ep = new THREE.Mesh(epGeo, tertiaryMat);
      ep.position.set(sx, wingY, -bodyLen * 0.46);
      bodyGroup.add(ep);
    }
  }

  // 10. Flush Door Number Plates (integrated directly onto UV canvas via procedural textures)

  // 11. Flush Sculpted Headlights & Rear LED Light Bar (recessed into front/rear fender fascia with dark housing bezel)
  const hlSample = sampleHullAtZ(bodyLen * 0.455);
  const hlZ = bodyLen * 0.468;
  const hlBaseX = Math.min(0.64, hlSample.wBelt * 0.72);
  [-hlBaseX, hlBaseX].forEach((hx, idx) => {
    if (design.headlightStyle === 'bentley-quad') {
      for (const [xMul, rad, yOff] of [[1.04, 0.095, 0.04], [0.70, 0.072, 0.02]] as const) {
        const bezel = new THREE.Mesh(track(new THREE.CylinderGeometry(rad * 1.15, rad * 1.15, 0.04, 14)), matteTrimMat);
        bezel.rotation.x = Math.PI / 2 - 0.16;
        bezel.position.set(hx * xMul, hlSample.yBelt * 0.88 + yOff, hlZ - 0.016);
        bodyGroup.add(bezel);
        const lamp = new THREE.Mesh(track(new THREE.CylinderGeometry(rad, rad, 0.05, 14)), headlightMats[idx]);
        lamp.rotation.x = Math.PI / 2 - 0.16;
        lamp.position.set(hx * xMul, hlSample.yBelt * 0.88 + yOff, hlZ - 0.01);
        bodyGroup.add(lamp);
      }
    } else if (design.headlightStyle === 'c-blade-rs01') {
      const upperBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.045, 0.05)), headlightMats[idx]);
      upperBlade.position.set(hx * 0.96, hlSample.yBelt * 0.92, hlZ);
      upperBlade.rotation.y = hx < 0 ? -0.18 : 0.18;
      bodyGroup.add(upperBlade);

      const dropBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.048, 0.17, 0.05)), headlightMats[idx]);
      dropBlade.position.set(hx * 1.06, hlSample.yBelt * 0.76, hlZ);
      bodyGroup.add(dropBlade);
    } else if (design.headlightStyle === 'vertical-stack') {
      const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.09, 0.22, 0.05)), headlightMats[idx]);
      hl.position.set(hx * 1.04, hlSample.yBelt * 0.84, hlZ);
      hl.rotation.x = -0.16;
      bodyGroup.add(hl);
    } else if (design.headlightStyle === 'round-911') {
      const bezel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.132, 0.132, 0.04, 16)), matteTrimMat);
      bezel.rotation.x = Math.PI / 2 - 0.34;
      bezel.position.set(hx * 1.00, hlSample.yBelt * 0.96, hlZ - 0.036);
      bodyGroup.add(bezel);
      const hl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.112, 0.112, 0.05, 16)), headlightMats[idx]);
      hl.rotation.x = Math.PI / 2 - 0.34;
      hl.position.set(hx * 1.00, hlSample.yBelt * 0.96, hlZ - 0.03);
      bodyGroup.add(hl);
    } else if (design.headlightStyle === 'fang') {
      const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.085, 0.04)), matteTrimMat);
      bezel.position.set(hx, hlSample.yBelt * 0.88, hlZ - 0.008);
      bezel.rotation.z = hx < 0 ? 0.22 : -0.22;
      bezel.rotation.y = hx < 0 ? -0.16 : 0.16;
      bodyGroup.add(bezel);
      const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 0.06, 0.05)), headlightMats[idx]);
      hl.position.set(hx, hlSample.yBelt * 0.88, hlZ);
      hl.rotation.z = hx < 0 ? 0.22 : -0.22;
      hl.rotation.y = hx < 0 ? -0.16 : 0.16;
      bodyGroup.add(hl);
    } else {
      const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.085, 0.04)), matteTrimMat);
      bezel.position.set(hx, hlSample.yBelt * 0.88, hlZ - 0.008);
      bezel.rotation.y = hx < 0 ? -0.16 : 0.16;
      bodyGroup.add(bezel);
      const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 0.06, 0.05)), headlightMats[idx]);
      hl.position.set(hx, hlSample.yBelt * 0.88, hlZ);
      hl.rotation.y = hx < 0 ? -0.16 : 0.16;
      bodyGroup.add(hl);
    }
  });

  const tailBar = new THREE.Mesh(
    track(new THREE.BoxGeometry(rearSt.wBelt * 1.66, 0.068, 0.045)),
    brakeLightMat,
  );
  tailBar.position.set(0, rearSt.yBelt * 0.84, -bodyLen * 0.498);
  bodyGroup.add(tailBar);

  return { rearWingFlap };
}

export interface SafetyCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Group[];
  allWheels: THREE.Group[];
  lightbarLeftMat: THREE.MeshStandardMaterial;
  lightbarCenterMat: THREE.MeshStandardMaterial;
  lightbarRightMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  tailLightMat: THREE.MeshStandardMaterial;
  update: (phase: SafetyCarPhase, timeSec: number) => void;
  dispose: () => void;
}

const SC_AMBER_HEX = 0xf59e0b;
const SC_GREEN_HEX = 0x22c55e;

/**
 * Builds a lightweight miniature GT Safety Car 3D rig grounded at y = 0 with
 * an aerodynamic amber/green flashing roof lightbar driven by `update(phase, timeSec)`.
 */
export function buildSafetyCarRig(): SafetyCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const length = 4.56;
  const width = 1.94;
  const bodyLen = length * 0.94;
  const bodyWidth = width * 0.99;
  const wheelRadius = 0.32;
  const wheelWidth = 0.25;
  const wheelBaseZ = length * 0.285;
  const trackHalfX = Math.min(0.78, width * 0.445 - wheelWidth * 0.5);

  // Materials (lightweight metallic silver/titanium + safety crimson accents, no heavy canvas allocs)
  const paintMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbe2ea,
      roughness: 0.20,
      metalness: 0.74,
      clearcoat: 1.0,
      clearcoatRoughness: 0.10,
    }),
  );
  const accentMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xdc2626,
      roughness: 0.28,
      metalness: 0.32,
      clearcoat: 0.85,
    }),
  );
  const trimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.80,
      metalness: 0.12,
    }),
  );
  const glassMat = track(createCarGlassMaterial(0x0b1220, 0.84, 'SAFETY_CAR_GLASS'));
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e242e,
      metalness: 0.75,
      roughness: 0.20,
    }),
  );
  const tireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x171a20,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.32,
      metalness: 0.45,
    }),
  );
  const rotorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a3f48,
      metalness: 0.90,
      roughness: 0.26,
    }),
  );

  const headlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xf8fafc,
      emissiveIntensity: 1.5,
      roughness: 0.18,
    }),
  );
  const tailLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      roughness: 0.22,
    }),
  );

  const lightbarLeftMat = track(
    new THREE.MeshStandardMaterial({
      color: SC_AMBER_HEX,
      emissive: SC_AMBER_HEX,
      emissiveIntensity: 0.12,
      roughness: 0.18,
      metalness: 0.15,
    }),
  );
  const lightbarCenterMat = track(
    new THREE.MeshStandardMaterial({
      color: SC_GREEN_HEX,
      emissive: SC_GREEN_HEX,
      emissiveIntensity: 0.08,
      roughness: 0.18,
      metalness: 0.15,
    }),
  );
  const lightbarRightMat = track(
    new THREE.MeshStandardMaterial({
      color: SC_AMBER_HEX,
      emissive: SC_AMBER_HEX,
      emissiveIntensity: 0.12,
      roughness: 0.18,
      metalness: 0.15,
    }),
  );

  // Contact shadow disc
  const shadowGeo = track(new THREE.PlaneGeometry(2.6, 4.4));
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

  // Sculpted GT coupe hull
  const hullStations = buildHullStations(
    bodyLen,
    bodyWidth,
    wheelBaseZ,
    wheelRadius,
    trackHalfX,
    wheelWidth,
    {
      noseHeightRatio: 0.64,
      tailHeightRatio: 0.90,
      hoodStyle: 'power-dome',
      cabinStyle: 'grand-tourer',
    },
    false,
    true,
  );
  const hullGeo = track(createLoftedHullGeometry(hullStations, bodyWidth, bodyLen));
  const hullMesh = new THREE.Mesh(hullGeo, paintMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);

  // Contoured racing safety stripe hugging the lofted hull crown
  const stripeStations = hullStations.filter((st) => Math.abs(st.z) <= bodyLen * 0.455);
  if (stripeStations.length >= 2) {
    const sPos = new Float32Array(stripeStations.length * 2 * 3);
    const sIdx: number[] = [];
    const halfStripeW = 0.13;
    for (let i = 0; i < stripeStations.length; i++) {
      const st = stripeStations[i];
      const y = st.yCrown + 0.004;
      sPos[i * 6] = -halfStripeW;
      sPos[i * 6 + 1] = y;
      sPos[i * 6 + 2] = st.z;
      sPos[i * 6 + 3] = halfStripeW;
      sPos[i * 6 + 4] = y;
      sPos[i * 6 + 5] = st.z;
      if (i < stripeStations.length - 1) {
        const r0 = i * 2;
        const r1 = (i + 1) * 2;
        sIdx.push(r0, r1, r1 + 1, r0, r1 + 1, r0 + 1);
      }
    }
    const stripeGeo = track(new THREE.BufferGeometry());
    stripeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    stripeGeo.setIndex(sIdx);
    stripeGeo.computeVertexNormals();
    const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
    bodyGroup.add(stripeMesh);
  }

  // Underbody tray, front splitter & rear diffuser
  const trayMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(trackHalfX * 1.44, 0.05, bodyLen * 0.90)),
    trimMat,
  );
  trayMesh.position.set(0, 0.145, 0);
  bodyGroup.add(trayMesh);

  const noseSt = hullStations[hullStations.length - 1];
  const splitterMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(noseSt.halfW * 2.02, 0.036, 0.14)),
    accentMat,
  );
  splitterMesh.position.set(0, 0.155, bodyLen * 0.49);
  bodyGroup.add(splitterMesh);

  const rearSt = hullStations[0];
  const diffuserMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(rearSt.halfW * 1.72, 0.10, 0.16)),
    trimMat,
  );
  diffuserMesh.position.set(0, 0.19, -bodyLen * 0.48);
  bodyGroup.add(diffuserMesh);

  // Greenhouse cabin + painted roof skin
  const cabinStations = buildCabinStations('grand-tourer', -0.18, 1.0, 1.0, 0.96, false);
  const roofStations = cabinStations.slice(1, cabinStations.length - 1);
  if (roofStations.length >= 2) {
    const roofCapStations = roofStations.map((st) => ({
      ...st,
      yBase: st.yRoof - 0.008,
      wBase: st.wRoof * 1.005,
      yRoof: st.yRoof + 0.006,
    }));
    const roofMesh = new THREE.Mesh(
      track(createLoftedGreenhouseGeometry(roofCapStations, bodyWidth, bodyLen, 0)),
      paintMat,
    );
    roofMesh.castShadow = true;
    bodyGroup.add(roofMesh);
  }
  const glassMesh = new THREE.Mesh(
    track(createLoftedGreenhouseGeometry(cabinStations, bodyWidth, bodyLen, 0.012)),
    glassMat,
  );
  glassMesh.castShadow = true;
  bodyGroup.add(glassMesh);

  // Rear GT airfoil wing
  const wingWidth = bodyWidth * 0.92;
  const wingMesh = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.24, 0.046)), trimMat);
  wingMesh.position.set(0, 0.90, -bodyLen * 0.45);
  wingMesh.castShadow = true;
  bodyGroup.add(wingMesh);

  const strutGeo = track(new THREE.BoxGeometry(0.04, 0.26, 0.16));
  const epGeo = track(new THREE.BoxGeometry(0.03, 0.18, 0.30));
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(strutGeo, trimMat);
    strut.position.set(sx * 0.40, 0.76, -bodyLen * 0.43);
    bodyGroup.add(strut);

    const endplate = new THREE.Mesh(epGeo, accentMat);
    endplate.position.set(sx * wingWidth * 0.5, 0.90, -bodyLen * 0.45);
    bodyGroup.add(endplate);
  }

  // Front grille, headlights, and rear LED tailbar
  const grilleMesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.11, 0.04)), trimMat);
  grilleMesh.position.set(0, 0.28, bodyLen * 0.484);
  grilleMesh.rotation.x = 0.16;
  bodyGroup.add(grilleMesh);

  const hlGeo = track(new THREE.BoxGeometry(0.24, 0.058, 0.05));
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(sx * 0.56, 0.44, bodyLen * 0.468);
    hl.rotation.y = sx < 0 ? -0.16 : 0.16;
    bodyGroup.add(hl);
  }

  const tailBar = new THREE.Mesh(track(new THREE.BoxGeometry(rearSt.wBelt * 1.62, 0.064, 0.045)), tailLightMat);
  tailBar.position.set(0, rearSt.yBelt * 0.84, -bodyLen * 0.495);
  bodyGroup.add(tailBar);

  // Aerodynamic roof lightbar mounted cleanly at roof crown
  const roofPeakStation = roofStations[Math.floor(roofStations.length * 0.5)] ?? cabinStations[2];
  const lightbarY = (roofPeakStation?.yRoof ?? 1.04) + 0.056;
  const lightbarZ = roofPeakStation?.z ?? -0.16;

  const lightbarGroup = new THREE.Group();
  lightbarGroup.position.set(0, lightbarY, lightbarZ);

  const barBase = new THREE.Mesh(track(new THREE.BoxGeometry(0.74, 0.028, 0.15)), trimMat);
  barBase.position.y = -0.018;
  lightbarGroup.add(barBase);

  const podGeo = track(new THREE.BoxGeometry(0.21, 0.042, 0.12));
  const leftPod = new THREE.Mesh(podGeo, lightbarLeftMat);
  leftPod.position.set(-0.24, 0.012, 0);
  lightbarGroup.add(leftPod);

  const centerPod = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.042, 0.12)), lightbarCenterMat);
  centerPod.position.set(0, 0.012, 0);
  lightbarGroup.add(centerPod);

  const rightPod = new THREE.Mesh(podGeo, lightbarRightMat);
  rightPod.position.set(0.24, 0.012, 0);
  lightbarGroup.add(rightPod);

  const barHousingMat = track(createCarGlassMaterial(0x1e293b, 0.34, 'SC_LIGHTBAR_HOUSING'));
  const barHousing = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 0.056, 0.16)), barHousingMat);
  barHousing.position.y = 0.010;
  lightbarGroup.add(barHousing);

  bodyGroup.add(lightbarGroup);

  // 4 rotating & steering diecast wheels
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
      wc.x < 0 ? -1 : 1,
      track,
    );
    steerPivot.add(wheelMesh);
    root.add(steerPivot);
    allWheels.push(wheelMesh);
    if (wc.isFront) frontWheels.push(steerPivot);
  }

  const update = (phase: SafetyCarPhase, timeSec: number) => {
    const t = Number.isFinite(timeSec) ? timeSec : 0;

    if (phase === 'deployed') {
      // FIA double-flash alternating amber strobe
      const cycle = ((t % 0.64) + 0.64) % 0.64;
      const leftOn = (cycle >= 0.0 && cycle < 0.08) || (cycle >= 0.14 && cycle < 0.22);
      const rightOn = (cycle >= 0.32 && cycle < 0.40) || (cycle >= 0.46 && cycle < 0.54);

      lightbarLeftMat.color.setHex(SC_AMBER_HEX);
      lightbarLeftMat.emissive.setHex(SC_AMBER_HEX);
      lightbarLeftMat.emissiveIntensity = leftOn ? 2.8 : 0.12;

      lightbarRightMat.color.setHex(SC_AMBER_HEX);
      lightbarRightMat.emissive.setHex(SC_AMBER_HEX);
      lightbarRightMat.emissiveIntensity = rightOn ? 2.8 : 0.12;

      lightbarCenterMat.color.setHex(SC_AMBER_HEX);
      lightbarCenterMat.emissive.setHex(SC_AMBER_HEX);
      lightbarCenterMat.emissiveIntensity = 0.25;

      headlightMat.emissiveIntensity = leftOn || rightOn ? 2.0 : 1.3;
    } else if (phase === 'in-this-lap' || phase === 'restarting') {
      // FIA Safety Car withdrawing: flashing green lightbar
      const freqHz = phase === 'restarting' ? 8 : 5;
      const greenOn = Math.sin(t * Math.PI * 2 * freqHz) > 0;
      const intensity = greenOn ? 2.8 : 0.28;

      lightbarLeftMat.color.setHex(SC_GREEN_HEX);
      lightbarLeftMat.emissive.setHex(SC_GREEN_HEX);
      lightbarLeftMat.emissiveIntensity = intensity;

      lightbarCenterMat.color.setHex(SC_GREEN_HEX);
      lightbarCenterMat.emissive.setHex(SC_GREEN_HEX);
      lightbarCenterMat.emissiveIntensity = intensity;

      lightbarRightMat.color.setHex(SC_GREEN_HEX);
      lightbarRightMat.emissive.setHex(SC_GREEN_HEX);
      lightbarRightMat.emissiveIntensity = intensity;

      headlightMat.emissiveIntensity = 1.6;
    } else {
      // Standby / VSC / none
      lightbarLeftMat.color.setHex(SC_AMBER_HEX);
      lightbarLeftMat.emissive.setHex(SC_AMBER_HEX);
      lightbarLeftMat.emissiveIntensity = 0.06;

      lightbarCenterMat.color.setHex(SC_GREEN_HEX);
      lightbarCenterMat.emissive.setHex(SC_GREEN_HEX);
      lightbarCenterMat.emissiveIntensity = 0.06;

      lightbarRightMat.color.setHex(SC_AMBER_HEX);
      lightbarRightMat.emissive.setHex(SC_AMBER_HEX);
      lightbarRightMat.emissiveIntensity = 0.06;

      headlightMat.emissiveIntensity = 1.4;
    }
  };

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    lightbarLeftMat,
    lightbarCenterMat,
    lightbarRightMat,
    headlightMat,
    tailLightMat,
    update,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Alias of `buildSafetyCarRig()` for convenience when mounting the Safety Car mesh. */
export function buildSafetyCarMesh(): SafetyCarRig {
  return buildSafetyCarRig();
}
