# Apex Miniature — Vehicle Catalog, Schema & Procedural 3D Mesh Specification

This document provides the complete, authoritative export of the vehicle registry, TypeScript schemas, Three.js procedural car mesh builder, livery and canvas texture generation pipelines, coordinate conventions, kinematic handles, and the full catalog of all 57 cars across 9 motorsport classes in Apex Miniature.

---

## 1. Exact Vehicle Schema & Architecture Files

### Exact File Paths in Codebase
- **Core Interfaces & Vehicle Types:** [`src/game/types.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/types.ts)
- **Vehicle Catalog & Balance of Performance (BoP):** [`src/game/cars.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/cars.ts)
- **3D Three.js Car Mesh Builder & Rig Assembler:** [`src/three/carBuilder.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/three/carBuilder.ts)
- **Procedural Canvas Textures (Liveries, Plates, Carbon):** [`src/three/proceduralTextures.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/three/proceduralTextures.ts)
- **Race Simulation & Animation Controller:** [`src/three/RaceViewport.tsx`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/three/RaceViewport.tsx)
- **3D Garage Inspector Viewport:** [`src/three/GarageViewport.tsx`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/three/GarageViewport.tsx)

---

### Exact TypeScript Interfaces (Verbatim)

```typescript
// ==========================================
// From src/game/types.ts (Lines 1-94)
// ==========================================

export enum CarClassId {
  HYPERCAR_GTP = 'HYPERCAR_GTP',
  LMP2 = 'LMP2',
  GT3 = 'GT3',
  F1_2026 = 'F1_2026',
  F1_2021 = 'F1_2021',
  F1_2005 = 'F1_2005',
  FORMULA_E = 'FORMULA_E',
  TRACK_COUPE = 'TRACK_COUPE',
  SUPERCAR = 'SUPERCAR',
}

export type BodySilhouette = 'prototype' | 'lmp2' | 'gt' | 'formula' | 'coupe' | 'supercar';

export type ClassSpecialType =
  | 'none'
  | 'active-aero'
  | 'attack-mode'
  | 'ers-overtake'
  | 'v10-overboost'
  | 'rich-fuel-overboost'
  | 'high-beam-flash'
  | 'hybrid-deploy';

export interface BoPAttributes {
  topSpeed: number; // 1-100
  acceleration: number; // 1-100
  corneringGrip: number; // 1-100
  braking: number; // 1-100
  efficiency: number; // 1-100 (tire & fuel/energy life)
}

export interface CarClassMeta {
  id: CarClassId;
  name: string;
  shortName: string;
  category: 'Endurance' | 'Single-Seater' | 'Production';
  plateColor: string;
  badgeTextColor: string;
  basePaceIndex: number; // Class speed tier (higher = faster overall lap)
  forwardGears: number; // Standard forward gear count for this class
  specialType: ClassSpecialType;
  specialLabel: string;
  defaultHeadlightTint: HeadlightTint;
}

export type RimFinish = 'gloss-black' | 'silver' | 'gold-bronze' | 'white' | 'body-matched';

export type LiveryTemplate =
  | 'racing-stripes'
  | 'two-tone'
  | 'geometric'
  | 'heritage';

export type NumberPlateStyle =
  | 'auto'
  | 'gtp-red'
  | 'lmp2-blue'
  | 'gt3-green'
  | 'gtd-amber'
  | 'formula-white';

export type HeadlightTint = 'crystal-white' | 'endurance-yellow' | 'ice-blue';

export interface LiveryConfig {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  rimFinish: RimFinish;
  template: LiveryTemplate;
  carbonHood: boolean;
  carbonWing: boolean;
  carbonSplitter: boolean;
  driverNumber: string; // 1-3 digits
  numberPlateStyle: NumberPlateStyle;
  headlightTint: HeadlightTint;
  windshieldBanner: string;
}

export interface CarSpec {
  id: string;
  name: string;
  manufacturer: string;
  classId: CarClassId;
  silhouette: BodySilhouette;
  attributes: BoPAttributes;
  tradeoffNote: string;
  engineType: 'v6-hybrid' | 'v8-hybrid' | 'v10' | 'v12' | 'flat6' | 'electric' | 'turbo-i6';
  gears?: number; // per-car transmission gear override (e.g. Cadillac GTP = 6 gears)
  specialTypeOverride?: ClassSpecialType;
  specialLabelOverride?: string;
  defaultLivery: LiveryConfig;
}

```

```typescript
// ==========================================
// From src/game/cars.ts (CAR_CLASSES & Helper)
// ==========================================

export const CAR_CLASSES: Record<CarClassId, CarClassMeta> = {
  [CarClassId.HYPERCAR_GTP]: {
    id: CarClassId.HYPERCAR_GTP,
    name: 'WEC Hypercar / IMSA GTP',
    shortName: 'GTP',
    category: 'Endurance',
    plateColor: '#dc2626',
    badgeTextColor: '#ffffff',
    basePaceIndex: 1.04,
    forwardGears: 7,
    specialType: 'ers-overtake',
    specialLabel: 'Hybrid Overtake',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.LMP2]: {
    id: CarClassId.LMP2,
    name: 'LMP2 Prototype',
    shortName: 'LMP2',
    category: 'Endurance',
    plateColor: '#2563eb',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.96,
    forwardGears: 6,
    specialType: 'high-beam-flash',
    specialLabel: 'High-Beam Flash',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.GT3]: {
    id: CarClassId.GT3,
    name: 'GTD Pro / LMGT3',
    shortName: 'GT3',
    category: 'Endurance',
    plateColor: '#16a34a',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.87,
    forwardGears: 6,
    specialType: 'high-beam-flash',
    specialLabel: 'High-Beam Flash',
    defaultHeadlightTint: 'endurance-yellow',
  },
  [CarClassId.F1_2026]: {
    id: CarClassId.F1_2026,
    name: 'Formula 1 — 2026 Spec',
    shortName: 'F1 26',
    category: 'Single-Seater',
    plateColor: '#f8fafc',
    badgeTextColor: '#0f172a',
    basePaceIndex: 1.15,
    forwardGears: 8,
    specialType: 'active-aero',
    specialLabel: 'Active Aero',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.F1_2021]: {
    id: CarClassId.F1_2021,
    name: 'Formula 1 — 2021 Spec',
    shortName: 'F1 21',
    category: 'Single-Seater',
    plateColor: '#e2e8f0',
    badgeTextColor: '#0f172a',
    basePaceIndex: 1.18,
    forwardGears: 8,
    specialType: 'ers-overtake',
    specialLabel: 'ERS Overtake',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.F1_2005]: {
    id: CarClassId.F1_2005,
    name: 'Formula 1 — 2005 V10',
    shortName: 'F1 05',
    category: 'Single-Seater',
    plateColor: '#fef08a',
    badgeTextColor: '#1e293b',
    basePaceIndex: 1.14,
    forwardGears: 7,
    specialType: 'v10-overboost',
    specialLabel: 'V10 Overboost',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.FORMULA_E]: {
    id: CarClassId.FORMULA_E,
    name: 'Formula E (GEN3 Evo)',
    shortName: 'FE GEN3',
    category: 'Single-Seater',
    plateColor: '#06b6d4',
    badgeTextColor: '#082f49',
    basePaceIndex: 0.94,
    forwardGears: 1,
    specialType: 'attack-mode',
    specialLabel: 'Attack Mode AWD',
    defaultHeadlightTint: 'ice-blue',
  },
  [CarClassId.TRACK_COUPE]: {
    id: CarClassId.TRACK_COUPE,
    name: 'Production Track Coupes',
    shortName: 'COUPE',
    category: 'Production',
    plateColor: '#f59e0b',
    badgeTextColor: '#111827',
    basePaceIndex: 0.78,
    forwardGears: 6,
    specialType: 'high-beam-flash',
    specialLabel: 'High-Beam Flash',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.SUPERCAR]: {
    id: CarClassId.SUPERCAR,
    name: 'Production Supercars & Hypercars',
    shortName: 'HYPER',
    category: 'Production',
    plateColor: '#a855f7',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.89,
    forwardGears: 7,
    specialType: 'high-beam-flash',
    specialLabel: 'High-Beam Flash',
    defaultHeadlightTint: 'crystal-white',
  },
};

function makeLivery(
  primaryColor: string,
  secondaryColor: string,
  tertiaryColor: string,
  driverNumber: string,
  opts: Partial<LiveryConfig> = {},
): LiveryConfig {
  return {
    primaryColor,
    secondaryColor,
    tertiaryColor,
    rimFinish: opts.rimFinish ?? 'gloss-black',
    template: opts.template ?? 'racing-stripes',
    carbonHood: opts.carbonHood ?? false,
    carbonWing: opts.carbonWing ?? true,
    carbonSplitter: opts.carbonSplitter ?? true,
    driverNumber,
    numberPlateStyle: opts.numberPlateStyle ?? 'auto',
    headlightTint: opts.headlightTint ?? 'crystal-white',
    windshieldBanner: opts.windshieldBanner ?? 'APEX',
  };
}

/**
 * Computes balanced intra-class lap equilibrium index from the 5 BoP attributes.
 * Every car in the same class stays within ~0.5% equilibrium while having distinct trade-offs.
 */
export function computeBoPEquilibriumScore(attrs: BoPAttributes): number {
  return (
    attrs.topSpeed * 0.22 +
    attrs.acceleration * 0.23 +
    attrs.corneringGrip * 0.28 +
    attrs.braking * 0.17 +
    attrs.efficiency * 0.10
  );
}
```

```typescript
// ==========================================
// From src/three/carBuilder.ts (Rig Handles & Design Schema)
// ==========================================

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
```

---

## 2. Coordinate Conventions, Hierarchy & Three.js Car Mesh Builder

### 3D Coordinate Conventions

| Axis | World Direction | Vehicle Semantic | Notes |
|---|---|---|---|
| **+Z** | Forward | **Front / Nose** | `c.heading` aligns car facing along local `+Z`. Front axle is located at `+wheelBaseZ`. Headlights, front splitter, and nose cone face `+Z`. |
| **-Z** | Backward | **Rear / Tail** | Rear axle is located at `-wheelBaseZ`. Rear diffuser, wing, and exhaust tips face `-Z`. |
| **+X** | Right | **Right Flank** | Lateral axis. Right wheels positioned at `+trackHalfX`. Right number plate located at `+bodyWidth * 0.555`. |
| **-X** | Left | **Left Flank** | Lateral axis. Left wheels positioned at `-trackHalfX`. Left number plate located at `-bodyWidth * 0.555`. |
| **+Y** | Up | **Vertical / Elevation** | **Ground Datum:** `y = 0.0` represents the asphalt road surface / tire contact patch. |

#### Key Geometric Benchmarks relative to `y = 0.0` Ground Datum:
- **Contact Shadow Plane:** `y = 0.025` (slight offset to prevent z-fighting with asphalt)
- **Floor Undertray / Skid Block:** `y = 0.20`
- **Wheel Axle Center:** `y = wheelRadius` (`0.35m` for closed-wheel, `0.36m` for formula)
- **Lower Splitter / Diffuser Edge:** `y = 0.18` to `y = 0.22`
- **Main Body Waistline:** `y = 0.24` to `y = 0.72`
- **Canopy / Cockpit Greenhouse:** `y = 0.56` to `y = 1.06`
- **Rear Wing Mainplane:** `y = 0.70` (Street active lip) to `y = 0.98m - 1.10m` (GT3 / F1)

---

### Required Hierarchy, Mesh Groups & Kinematic Handles (`BuiltCarRig`)

When the car mesh is constructed, `buildDiecastCar()` returns a `BuiltCarRig` object containing references to specific Three.js nodes required by the physics and rendering loops:

```
root (THREE.Group)
 │   [World translation: position.set(c.x, c.y, c.z)]
 │   [World yaw heading: rotation.y = c.heading]
 ├── shadowMesh (Mesh, y = 0.025, Contact Shadow)
 ├── bodyGroup (THREE.Group)
 │    │   [Chassis Roll: rotation.z = -c.steerAngle * min(1, c.speed / 30) * 0.09]
 │    ├── floorMesh (Undertray)
 │    ├── mainBody / feHull / formulaHull (Extruded aerodynamic shell)
 │    ├── cabin (Cockpit canopy / greenhouse)
 │    ├── aero: front splitter, rear diffuser, canards, sidepods, shark fin
 │    ├── frontWingFlap (Mesh | null, Active Aero Articulation)
 │    ├── rearWingFlap (Mesh | null, DRS / Active Aero Articulation)
 │    ├── headlights (Mesh with headlightMats[0..1], Dynamic Flashing)
 │    ├── taillightBar / rainLight (Mesh with brakeLightMat, Dynamic Braking Glow)
 │    └── suspensions (Wishbone rods for open-wheelers)
 ├── frontWheels[0] (THREE.Group, Left Front Steer Pivot, pos: -trackHalfX, wheelRadius, +wheelBaseZ)
 │    └── wheelMesh (Rotating Tire + Rim + Spokes, rotation.x += wheelSpin)
 ├── frontWheels[1] (THREE.Group, Right Front Steer Pivot, pos: +trackHalfX, wheelRadius, +wheelBaseZ)
 │    └── wheelMesh (Rotating Tire + Rim + Spokes, rotation.x += wheelSpin)
 ├── rearWheelLeftPivot (THREE.Group, pos: -trackHalfX, wheelRadius, -wheelBaseZ)
 │    └── wheelMesh (allWheels[2], rotation.x += wheelSpin)
 └── rearWheelRightPivot (THREE.Group, pos: +trackHalfX, wheelRadius, -wheelBaseZ)
      └── wheelMesh (allWheels[3], rotation.x += wheelSpin)
```

#### Runtime Animation Hookup in `RaceViewport.tsx`:
```typescript
// Sync Car 3D Transforms, Rotating Wheels, Active Aero Flap & Lights
rig.root.position.set(c.x, c.y, c.z);
rig.root.rotation.y = c.heading;

// Chassis Cornering Body Roll
rig.bodyGroup.rotation.z = -c.steerAngle * Math.min(1, c.speed / 30) * 0.09;

// Wheel Spin (Pitch rotation around local X)
const wheelSpin = (c.speed / 0.35) * dt;
for (const w of rig.allWheels) {
  w.rotation.x += wheelSpin;
}

// Front Wheel Steering (Yaw rotation around local Y)
for (const fw of rig.frontWheels) {
  fw.rotation.y = -c.steerAngle;
}

// Active Aero Wing Flaps (F1 2026 Articulation)
if (isF1_2026) {
  const targetRear = c.specialActive ? -0.18 : 0.38;
  const targetFront = c.specialActive ? 0.04 : 0.22;
  if (rig.rearWingFlap) {
    rig.rearWingFlap.rotation.x += (targetRear - rig.rearWingFlap.rotation.x) * Math.min(1, dt * 14);
  }
  if (rig.frontWingFlap) {
    rig.frontWingFlap.rotation.x += (targetFront - rig.frontWingFlap.rotation.x) * Math.min(1, dt * 14);
  }
}

// Headlight Flashing (Prototypes)
const flashIntensity = c.flashingHeadlights ? 4.5 : 1.4;
for (const hm of rig.headlightMats) {
  hm.emissiveIntensity = flashIntensity;
}

// Taillight / Brake Glow
rig.brakeLightMat.emissiveIntensity = c.isBraking ? 2.8 : 0.7;
```

---

### Procedural Canvas Texture & Material Pipeline

Liveries in Apex Miniature are generated procedurally on HTML5 `<canvas>` elements at runtime and wrapped into `THREE.CanvasTexture` instances with high anisotropic filtering:

1. **Body Livery Canvas (`createLiveryTexture`, 512×512):**
   - **Base:** Flood filled with `livery.primaryColor`.
   - **Templates:**
     - `racing-stripes`: Dual longitudinal centerline stripes in `secondaryColor` flanked by `tertiaryColor` accent pinstripes and rocker trims.
     - `two-tone`: Diagonal front-to-rear color block split with accent pinstripes.
     - `geometric`: Angular motorsport side pods, chevron nose stripes, and hood contrast blocks.
     - `heritage`: Triple horizontal and longitudinal bands with center racing stripe.
   - **Exposed Carbon Fiber Hood:** When `livery.carbonHood === true`, a woven carbon fiber matrix is drawn over UV region `[130, 315, 252, 175]`.
   - **Diecast Panel Shutlines:** Semi-transparent dark seam lines around hood and doors.
   - **Hood Number Plate:** High-contrast bordered rectangular plate with bold driver number rendered in `Oxanium` / `Arial Black`.
   - **Material Application:** Applied to `bodyMat` using `THREE.MeshPhysicalMaterial` with `clearcoat: 1.0`, `clearcoatRoughness: 0.12`, `roughness: 0.24`, `metalness: 0.18`.

2. **Door & Nose Racing Number Plates (`createNumberPlateTexture`, 256×192):**
   - Sanctioned series background colors: GTP (Red `#dc2626`), LMP2 (Blue `#2563eb`), GT3 (Green `#16a34a`), GTD (Amber `#f59e0b`), Formula (White `#f8fafc`).
   - Inner 10px white border, centered 112px font for 1 to 3 digit driver numbers.
   - Applied to planar meshes on both doors and nose cone.

3. **Windshield Sunstrip Banner (`createWindshieldBannerTexture`, 256×64):**
   - Matte dark visor bar with accent lower border and centered bold text (e.g., `"APEX"`).

4. **Carbon Fiber Weave Texture (`createCarbonTexture`, 128×128, repeat 3×3):**
   - Procedural twill weave pattern with anisotropic filtering for splitters, diffusers, rear wings, and canards.

5. **Wheel Rims & Finishes (`getRimColorAndMetalness`):**
   - `gloss-black`: `#14171c`, metalness 0.45, roughness 0.22
   - `silver`: `#d4d8df`, metalness 0.90, roughness 0.20
   - `gold-bronze`: `#c89b3c`, metalness 0.85, roughness 0.24
   - `white`: `#f1f5f9`, metalness 0.25, roughness 0.28
   - `body-matched`: primaryColor, metalness 0.55, roughness 0.24

---

### Verbatim Procedural Texture Pipeline Implementation

```typescript
// ==========================================
// From src/three/proceduralTextures.ts (Lines 1-226)
// ==========================================

import * as THREE from 'three';
import { resolveNumberPlateColors, validateDriverNumber } from '../game/cars';
import { CarClassId, LiveryConfig } from '../game/types';

function drawCarbonWeave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#181b20';
  ctx.fillRect(x, y, w, h);
  const cell = 8;
  for (let py = y; py < y + h; py += cell) {
    for (let px = x; px < x + w; px += cell) {
      const even = ((Math.floor(px / cell) + Math.floor(py / cell)) % 2) === 0;
      ctx.fillStyle = even ? '#262b33' : '#121519';
      ctx.fillRect(px, py, cell * 0.5, cell);
      ctx.fillStyle = even ? '#1c2026' : '#2d333d';
      ctx.fillRect(px + cell * 0.5, py, cell * 0.5, cell);
    }
  }
  ctx.restore();
}

export function createCarbonTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  drawCarbonWeave(ctx, 0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Creates a crisp 512x512 top/side body livery CanvasTexture matching the active template,
 * 3 colors, carbon hood toggle, and hood racing number plate.
 */
export function createLiveryTexture(
  livery: LiveryConfig,
  classId: CarClassId,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const { primaryColor, secondaryColor, tertiaryColor, template } = livery;

  // Base primary coat
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 512, 512);

  if (template === 'racing-stripes') {
    // Classic twin center racing stripes + side rocker accent
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(204, 0, 42, 512);
    ctx.fillRect(266, 0, 42, 512);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(192, 0, 8, 512);
    ctx.fillRect(312, 0, 8, 512);
    // Subtle lower rocker trim
    ctx.fillRect(0, 0, 10, 512);
    ctx.fillRect(502, 0, 10, 512);
  } else if (template === 'two-tone') {
    // Front/rear diagonal split + sharp secondary flank
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(512, 175);
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 250);
    ctx.lineTo(512, 165);
    ctx.lineTo(512, 185);
    ctx.lineTo(0, 270);
    ctx.closePath();
    ctx.fill();
  } else if (template === 'geometric') {
    // Bold angular motorsport blocks
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(190, 0);
    ctx.lineTo(80, 340);
    ctx.lineTo(0, 340);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.lineTo(322, 0);
    ctx.lineTo(432, 340);
    ctx.lineTo(512, 340);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(150, 512);
    ctx.lineTo(256, 330);
    ctx.lineTo(362, 512);
    ctx.closePath();
    ctx.fill();

    // Nose chevron
    ctx.fillRect(216, 42, 80, 14);
  } else if (template === 'heritage') {
    // Iconic horizontal/longitudinal triple heritage bands
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(0, 185, 512, 120);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(0, 168, 512, 14);
    ctx.fillRect(0, 308, 512, 14);
    // Center pinstripe
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(248, 0, 16, 512);
  }

  // Exposed carbon fiber hood panel (upper hood UV area)
  if (livery.carbonHood) {
    drawCarbonWeave(ctx, 130, 315, 252, 175);
    ctx.strokeStyle = tertiaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(130, 315, 252, 175);
  }

  // Subtle panel shutlines for die-cast scale realism
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(118, 305, 276, 192);

  // Hood racing number plate
  const num = validateDriverNumber(livery.driverNumber);
  const plate = resolveNumberPlateColors(classId, livery.numberPlateStyle);
  ctx.save();
  ctx.fillStyle = plate.bg;
  ctx.fillRect(202, 348, 108, 86);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(202, 348, 108, 86);

  ctx.fillStyle = plate.text;
  ctx.font = '800 50px "Oxanium", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 256, 394);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createNumberPlateTexture(
  livery: LiveryConfig,
  classId: CarClassId,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const plate = resolveNumberPlateColors(classId, livery.numberPlateStyle);
  const num = validateDriverNumber(livery.driverNumber);

  ctx.fillStyle = plate.bg;
  ctx.fillRect(0, 0, 256, 192);

  // Crisp inner white border + class header strip
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 244, 180);

  ctx.fillStyle = plate.text;
  ctx.font = '800 112px "Oxanium", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 128, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createWindshieldBannerTexture(
  bannerText: string,
  accentColor: string,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f131a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 52, 256, 12);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 32px "Oxanium", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((bannerText || 'APEX').toUpperCase().slice(0, 10), 128, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

```

---

### Verbatim Three.js Car Builder Implementation

```typescript
// ==========================================
// From src/three/carBuilder.ts (Lines 59-1581)
// ==========================================

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

```

---

## 3. Complete Vehicle Catalog (All 57 Cars)

The table below lists every car registered in `src/game/cars.ts`, including exact dimensions (derived from base chassis parameters and design scaling), wheelbase, wheel specs, livery color schemes, driver numbers, and engine types.

| # | Car ID | Make & Model | Series / Class | Category | Silhouette | Dimensions (L × W × H) | Wheelbase | Wheel (R × W) | Livery Colors (1° / 2° / 3°) | No. | Template | Rim Finish | Engine |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `ferrari-499p` | **Ferrari 499P** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.83m × 1.90m × 0.99m | 2.36m | 0.35m / 0.30m | `#c8102e` / `#facc15` / `#ffffff` | **#51** | `racing-stripes` | `gold-bronze` | `v6-hybrid` |
| 2 | `toyota-gr010` | **Toyota GR010 Hybrid** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.76m × 1.94m × 0.98m | 2.36m | 0.35m / 0.30m | `#111827` / `#ef4444` / `#ffffff` | **#7** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 3 | `porsche-963` | **Porsche 963** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.80m × 1.90m × 0.98m | 2.36m | 0.35m / 0.30m | `#dc2626` / `#ffffff` / `#0f172a` | **#6** | `heritage` | `gloss-black` | `v8-hybrid` |
| 4 | `cadillac-vseries-r` | **Cadillac V-Series.R** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.83m × 1.92m × 0.98m | 2.36m | 0.35m / 0.30m | `#facc15` / `#0f172a` / `#ef4444` | **#01** | `geometric` | `gloss-black` | `v8-hybrid` |
| 5 | `bmw-m-hybrid-v8` | **BMW M Hybrid V8** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.76m × 1.94m × 0.98m | 2.36m | 0.35m / 0.30m | `#ffffff` / `#1d4ed8` / `#dc2626` | **#24** | `geometric` | `silver` | `v8-hybrid` |
| 6 | `acura-arx-06` | **Acura ARX-06** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.80m × 1.86m × 0.98m | 2.36m | 0.35m / 0.30m | `#1e293b` / `#ef4444` / `#38bdf8` | **#10** | `two-tone` | `silver` | `v6-hybrid` |
| 7 | `alpine-a424` | **Alpine A424** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.87m × 1.88m × 0.98m | 2.36m | 0.35m / 0.30m | `#1d4ed8` / `#ef4444` / `#ffffff` | **#35** | `racing-stripes` | `gloss-black` | `v6-hybrid` |
| 8 | `peugeot-9x8` | **Peugeot 9X8** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.83m × 1.94m × 0.98m | 2.36m | 0.35m / 0.30m | `#cbd5e1` / `#84cc16` / `#0f172a` | **#93** | `geometric` | `gloss-black` | `v6-hybrid` |
| 9 | `aston-valkyrie-lmh` | **Aston Martin Valkyrie AMR-LMH** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.80m × 1.82m × 1.03m | 2.36m | 0.35m / 0.30m | `#065f46` / `#a3e635` / `#ffffff` | **#007** | `racing-stripes` | `gold-bronze` | `v12` |
| 10 | `lamborghini-sc63` | **Lamborghini SC63** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.83m × 1.92m × 1.03m | 2.36m | 0.35m / 0.30m | `#65a30d` / `#111827` / `#ef4444` | **#63** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 11 | `genesis-gmr-001` | **Genesis GMR-001** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.87m × 1.90m × 0.98m | 2.36m | 0.35m / 0.30m | `#ea580c` / `#18181b` / `#f8fafc` | **#88** | `heritage` | `gloss-black` | `v8-hybrid` |
| 12 | `glickenhaus-scg-007` | **Glickenhaus SCG 007** | WEC Hypercar / IMSA GTP (`GTP`) | Endurance | `prototype` | 3.72m × 1.86m × 1.03m | 2.36m | 0.35m / 0.30m | `#0284c7` / `#ffffff` / `#dc2626` | **#708** | `heritage` | `white` | `v8-hybrid` |
| 13 | `oreca-07-united` | **Oreca 07 Gibson (Low-Drag)** | LMP2 Prototype (`LMP2`) | Endurance | `lmp2` | 3.76m × 1.90m × 0.98m | 2.36m | 0.35m / 0.30m | `#f97316` / `#0f172a` / `#ffffff` | **#22** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 14 | `oreca-07-europol` | **Oreca 07 Gibson (High-DF)** | LMP2 Prototype (`LMP2`) | Endurance | `lmp2` | 3.76m × 1.90m × 0.98m | 2.36m | 0.35m / 0.30m | `#eab308` / `#15803d` / `#ffffff` | **#34** | `geometric` | `silver` | `v8-hybrid` |
| 15 | `oreca-07-ao` | **Oreca 07 Gibson (Endurance)** | LMP2 Prototype (`LMP2`) | Endurance | `lmp2` | 3.76m × 1.90m × 0.98m | 2.36m | 0.35m / 0.30m | `#7c3aed` / `#22d3ee` / `#ffffff` | **#99** | `racing-stripes` | `white` | `v8-hybrid` |
| 16 | `porsche-911-gt3-r` | **Porsche 911 GT3 R (992)** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.51m × 1.91m × 1.06m | 2.36m | 0.35m / 0.30m | `#f8fafc` / `#16a34a` / `#111827` | **#911** | `heritage` | `gold-bronze` | `flat6` |
| 17 | `ferrari-296-gt3` | **Ferrari 296 GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.59m × 1.99m × 1.06m | 2.36m | 0.35m / 0.30m | `#dc2626` / `#facc15` / `#ffffff` | **#62** | `racing-stripes` | `gloss-black` | `v6-hybrid` |
| 18 | `corvette-z06-gt3r` | **Chevrolet Corvette Z06 GT3.R** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.70m × 2.01m × 1.06m | 2.36m | 0.35m / 0.30m | `#facc15` / `#18181b` / `#dc2626` | **#3** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 19 | `bmw-m4-gt3` | **BMW M4 GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.77m × 1.99m × 1.06m | 2.36m | 0.35m / 0.30m | `#ffffff` / `#2563eb` / `#ef4444` | **#1** | `geometric` | `gloss-black` | `turbo-i6` |
| 20 | `ford-mustang-gt3` | **Ford Mustang GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.77m × 1.97m × 1.06m | 2.36m | 0.35m / 0.30m | `#1d4ed8` / `#ffffff` / `#ef4444` | **#64** | `racing-stripes` | `gloss-black` | `v8-hybrid` |
| 21 | `aston-vantage-gt3` | **Aston Martin Vantage GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.66m × 1.99m × 1.06m | 2.36m | 0.35m / 0.30m | `#047857` / `#bef264` / `#111827` | **#27** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 22 | `lamborghini-temerario-gt3` | **Lamborghini Temerario GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.66m × 2.01m × 1.06m | 2.36m | 0.35m / 0.30m | `#84cc16` / `#0f172a` / `#ffffff` | **#19** | `geometric` | `gloss-black` | `v10` |
| 23 | `mercedes-amg-gt3` | **Mercedes-AMG GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.81m × 2.01m × 1.06m | 2.36m | 0.35m / 0.30m | `#94a3b8` / `#06b6d4` / `#0f172a` | **#57** | `heritage` | `silver` | `v8-hybrid` |
| 24 | `lexus-rcf-gt3` | **Lexus RC F GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.73m × 1.95m × 1.06m | 2.36m | 0.35m / 0.30m | `#0f172a` / `#2563eb` / `#f8fafc` | **#14** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 25 | `mclaren-720s-gt3` | **McLaren 720S GT3** | GTD Pro / LMGT3 (`GT3`) | Endurance | `gt` | 3.62m × 1.99m × 1.06m | 2.36m | 0.35m / 0.30m | `#f97316` / `#0f172a` / `#38bdf8` | **#59** | `geometric` | `gloss-black` | `v8-hybrid` |
| 26 | `f1-26-ferrari` | **Scuderia Ferrari SF-26** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#dc2626` / `#ffffff` / `#facc15` | **#16** | `racing-stripes` | `gloss-black` | `v6-hybrid` |
| 27 | `f1-26-mclaren` | **McLaren MCL40 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#f97316` / `#0f172a` / `#38bdf8` | **#4** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 28 | `f1-26-mercedes` | **Mercedes-AMG W17 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#111827` / `#14b8a6` / `#cbd5e1` | **#63** | `geometric` | `gloss-black` | `v6-hybrid` |
| 29 | `f1-26-redbull` | **Red Bull RB22 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#1e1b4b` / `#ef4444` / `#facc15` | **#1** | `heritage` | `gloss-black` | `v6-hybrid` |
| 30 | `f1-26-aston` | **Aston Martin AMR26** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#065f46` / `#a3e635` / `#ffffff` | **#14** | `racing-stripes` | `gloss-black` | `v6-hybrid` |
| 31 | `f1-26-williams` | **Williams FW48 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#1d4ed8` / `#38bdf8` / `#f97316` | **#23** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 32 | `f1-26-alpine` | **Alpine A526 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#0284c7` / `#ec4899` / `#0f172a` | **#10** | `geometric` | `gloss-black` | `v6-hybrid` |
| 33 | `f1-26-haas` | **Haas VF-26 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#f8fafc` / `#dc2626` / `#111827` | **#87** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 34 | `f1-26-audi` | **Audi R26 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#cbd5e1` / `#ef4444` / `#0f172a` | **#27** | `geometric` | `gloss-black` | `v6-hybrid` |
| 35 | `f1-26-cadillac` | **Cadillac F1 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#0f172a` / `#facc15` / `#2563eb` | **#11** | `racing-stripes` | `gold-bronze` | `v6-hybrid` |
| 36 | `f1-26-racing-bulls` | **Racing Bulls VCARB 03 (2026)** | Formula 1 — 2026 Spec (`F1 26`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#f8fafc` / `#2563eb` / `#ef4444` | **#22** | `heritage` | `white` | `v6-hybrid` |
| 37 | `f1-21-mercedes` | **Mercedes W12 (2021)** | Formula 1 — 2021 Spec (`F1 21`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#0f172a` / `#14b8a6` / `#e2e8f0` | **#44** | `heritage` | `gloss-black` | `v6-hybrid` |
| 38 | `f1-21-redbull` | **Red Bull RB16B (2021)** | Formula 1 — 2021 Spec (`F1 21`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#1e1b4b` / `#facc15` / `#dc2626` | **#33** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 39 | `f1-21-ferrari` | **Ferrari SF21 (2021)** | Formula 1 — 2021 Spec (`F1 21`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#991b1b` / `#dc2626` / `#16a34a` | **#55** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 40 | `f1-21-mclaren` | **McLaren MCL35M (2021)** | Formula 1 — 2021 Spec (`F1 21`) | Single-Seater | `formula` | 3.92m × 1.88m × 0.98m | 2.52m | 0.36m / 0.38m | `#f97316` / `#0284c7` / `#111827` | **#3** | `racing-stripes` | `gloss-black` | `v6-hybrid` |
| 41 | `f1-05-renault` | **Renault R25 V10 (2005)** | Formula 1 — 2005 V10 (`F1 05`) | Single-Seater | `formula` | 3.92m × 1.88m × 1.10m | 2.52m | 0.36m / 0.38m | `#38bdf8` / `#facc15` / `#1e3a8a` | **#5** | `two-tone` | `silver` | `v10` |
| 42 | `f1-05-mclaren` | **McLaren MP4-20 V10 (2005)** | Formula 1 — 2005 V10 (`F1 05`) | Single-Seater | `formula` | 3.92m × 1.88m × 1.10m | 2.52m | 0.36m / 0.38m | `#cbd5e1` / `#111827` / `#ef4444` | **#9** | `geometric` | `silver` | `v10` |
| 43 | `f1-05-ferrari` | **Ferrari F2005 V10 (2005)** | Formula 1 — 2005 V10 (`F1 05`) | Single-Seater | `formula` | 3.92m × 1.88m × 1.10m | 2.52m | 0.36m / 0.38m | `#dc2626` / `#ffffff` / `#111827` | **#1** | `racing-stripes` | `silver` | `v10` |
| 44 | `f1-05-williams` | **Williams FW27 BMW V10 (2005)** | Formula 1 — 2005 V10 (`F1 05`) | Single-Seater | `formula` | 3.92m × 1.88m × 1.10m | 2.52m | 0.36m / 0.38m | `#ffffff` / `#1e3a8a` / `#38bdf8` | **#7** | `heritage` | `white` | `v10` |
| 45 | `fe-porsche-99x` | **Porsche 99X Electric GEN3 Evo** | Formula E (GEN3 Evo) (`FE GEN3`) | Single-Seater | `formula` | 3.70m × 1.88m × 0.88m | 2.52m | 0.36m / 0.38m | `#ffffff` / `#dc2626` / `#0f172a` | **#94** | `geometric` | `gloss-black` | `electric` |
| 46 | `fe-jaguar-itype7` | **Jaguar I-Type 7 GEN3 Evo** | Formula E (GEN3 Evo) (`FE GEN3`) | Single-Seater | `formula` | 3.70m × 1.88m × 0.88m | 2.52m | 0.36m / 0.38m | `#111827` / `#f8fafc` / `#eab308` | **#9** | `two-tone` | `gloss-black` | `electric` |
| 47 | `fe-nissan-e4orce` | **Nissan e-4ORCE 05** | Formula E (GEN3 Evo) (`FE GEN3`) | Single-Seater | `formula` | 3.70m × 1.88m × 0.88m | 2.52m | 0.36m / 0.38m | `#ef4444` / `#ffffff` / `#1e293b` | **#23** | `heritage` | `gloss-black` | `electric` |
| 48 | `fe-maserati-folgore` | **Maserati Tipo Folgore** | Formula E (GEN3 Evo) (`FE GEN3`) | Single-Seater | `formula` | 3.70m × 1.88m × 0.88m | 2.52m | 0.36m / 0.38m | `#1d4ed8` / `#f8fafc` / `#38bdf8` | **#7** | `racing-stripes` | `gloss-black` | `electric` |
| 49 | `bmw-m2-cs` | **BMW M2 CS** | Production Track Coupes (`COUPE`) | Production | `coupe` | 3.48m × 1.86m × 1.11m | 2.36m | 0.35m / 0.30m | `#1d4ed8` / `#111827` / `#ef4444` | **#21** | `racing-stripes` | `gold-bronze` | `turbo-i6` |
| 50 | `porsche-911-gt3-rs` | **Porsche 911 GT3 RS** | Production Track Coupes (`COUPE`) | Production | `coupe` | 3.51m × 1.88m × 1.07m | 2.36m | 0.35m / 0.30m | `#f8fafc` / `#ef4444` / `#111827` | **#992** | `heritage` | `gloss-black` | `flat6` |
| 51 | `corvette-z06-coupe` | **Chevrolet Corvette Z06** | Production Track Coupes (`COUPE`) | Production | `coupe` | 3.66m × 1.92m × 1.02m | 2.36m | 0.35m / 0.30m | `#ea580c` / `#18181b` / `#ffffff` | **#06** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 52 | `nissan-gtr-nismo` | **Nissan GT-R NISMO** | Production Track Coupes (`COUPE`) | Production | `coupe` | 3.70m × 1.88m × 1.11m | 2.36m | 0.35m / 0.30m | `#cbd5e1` / `#111827` / `#dc2626` | **#23** | `two-tone` | `gloss-black` | `v6-hybrid` |
| 53 | `ferrari-296-gtb` | **Ferrari 296 GTB** | Production Supercars & Hypercars (`HYPER`) | Production | `supercar` | 3.51m × 1.90m × 1.02m | 2.36m | 0.35m / 0.30m | `#dc2626` / `#facc15` / `#111827` | **#296** | `racing-stripes` | `silver` | `v6-hybrid` |
| 54 | `mclaren-750s` | **McLaren 750S** | Production Supercars & Hypercars (`HYPER`) | Production | `supercar` | 3.59m × 1.92m × 1.01m | 2.36m | 0.35m / 0.30m | `#f97316` / `#111827` / `#f8fafc` | **#750** | `two-tone` | `gloss-black` | `v8-hybrid` |
| 55 | `ferrari-sf90` | **Ferrari SF90 Stradale** | Production Supercars & Hypercars (`HYPER`) | Production | `supercar` | 3.70m × 1.94m × 1.02m | 2.36m | 0.35m / 0.30m | `#991b1b` / `#cbd5e1` / `#facc15` | **#90** | `heritage` | `gold-bronze` | `v8-hybrid` |
| 56 | `porsche-918-spyder` | **Porsche 918 Spyder** | Production Supercars & Hypercars (`HYPER`) | Production | `supercar` | 3.62m × 1.90m × 1.00m | 2.36m | 0.35m / 0.30m | `#cbd5e1` / `#84cc16` / `#111827` | **#918** | `racing-stripes` | `gloss-black` | `v8-hybrid` |
| 57 | `aston-valkyrie-road` | **Aston Martin Valkyrie (Road Spec)** | Production Supercars & Hypercars (`HYPER`) | Production | `supercar` | 3.66m × 1.80m × 1.01m | 2.36m | 0.35m / 0.30m | `#065f46` / `#a3e635` / `#111827` | **#12** | `geometric` | `gold-bronze` | `v12` |

---

## 4. Full Machine-Readable JSON Catalog

The JSON payload below contains every vehicle in the catalog with complete numerical dimensions, wheel coordinates, livery configuration, BoP performance attributes, and procedural 3D styling parameters:

```json
[
  {
    "id": "ferrari-499p",
    "name": "Ferrari 499P",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.835, "width": 1.9, "height": 0.99, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#c8102e", "secondaryColor": "#facc15", "tertiaryColor": "#ffffff", "driverNumber": "51", "template": "racing-stripes", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":88,"acceleration":87,"corneringGrip":85,"braking":84,"efficiency":81},
    "designParams": {"cabinOffsetZ":0.06,"cabinScaleW":0.94,"cabinScaleH":0.96,"cabinScaleL":1,"noseHeightRatio":0.56,"tailHeightRatio":0.8,"widthScale":1,"lengthScale":1.02,"grilleStyle":"lmp-intake","headlightStyle":"blade","sidepodStyle":"undercut","rearDeckStyle":"split-499p","exhaustStyle":"top-exit","sharkFinStyle":"curved-lmh"}
  },
  {
    "id": "toyota-gr010",
    "name": "Toyota GR010 Hybrid",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.76, "width": 1.938, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#111827", "secondaryColor": "#ef4444", "tertiaryColor": "#ffffff", "driverNumber": "7", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":84,"acceleration":85,"corneringGrip":86,"braking":86,"efficiency":91},
    "designParams": {"cabinOffsetZ":0.04,"cabinScaleW":1,"cabinScaleH":1.02,"cabinScaleL":1.02,"noseHeightRatio":0.62,"tailHeightRatio":0.84,"widthScale":1.02,"lengthScale":1,"grilleStyle":"lmp-intake","headlightStyle":"twin-pod","sidepodStyle":"sculpted-intake","rearDeckStyle":"strut-race","exhaustStyle":"top-exit","sharkFinStyle":"tall-proto"}
  },
  {
    "id": "porsche-963",
    "name": "Porsche 963",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.798, "width": 1.9, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#dc2626", "secondaryColor": "#ffffff", "tertiaryColor": "#0f172a", "driverNumber": "6", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":85,"acceleration":86,"corneringGrip":86,"braking":87,"efficiency":85},
    "designParams": {"cabinOffsetZ":0.05,"cabinScaleW":0.96,"cabinScaleH":0.98,"cabinScaleL":0.98,"noseHeightRatio":0.58,"tailHeightRatio":0.82,"widthScale":1,"lengthScale":1.01,"grilleStyle":"porsche-992","headlightStyle":"twin-pod","sidepodStyle":"undercut","rearDeckStyle":"swan-neck","exhaustStyle":"top-exit","sharkFinStyle":"tall-proto"}
  },
  {
    "id": "cadillac-vseries-r",
    "name": "Cadillac V-Series.R",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.835, "width": 1.919, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#facc15", "secondaryColor": "#0f172a", "tertiaryColor": "#ef4444", "driverNumber": "01", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":89,"acceleration":89,"corneringGrip":82,"braking":84,"efficiency":83},
    "designParams": {"cabinOffsetZ":0.02,"cabinScaleW":0.98,"cabinScaleH":1,"cabinScaleL":1,"noseHeightRatio":0.52,"tailHeightRatio":0.82,"widthScale":1.01,"lengthScale":1.02,"grilleStyle":"lmp-intake","headlightStyle":"vertical-stack","sidepodStyle":"sculpted-intake","rearDeckStyle":"strut-race","exhaustStyle":"top-exit","sharkFinStyle":"curved-lmh"}
  },
  {
    "id": "bmw-m-hybrid-v8",
    "name": "BMW M Hybrid V8",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.76, "width": 1.938, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#ffffff", "secondaryColor": "#1d4ed8", "tertiaryColor": "#dc2626", "driverNumber": "24", "template": "geometric", "rimFinish": "silver" },
    "bop": {"topSpeed":87,"acceleration":86,"corneringGrip":84,"braking":87,"efficiency":82},
    "designParams": {"cabinOffsetZ":0.02,"cabinScaleW":0.98,"cabinScaleH":1,"cabinScaleL":0.98,"noseHeightRatio":0.6,"tailHeightRatio":0.84,"widthScale":1.02,"lengthScale":1,"grilleStyle":"bmw-kidney","headlightStyle":"fang","sidepodStyle":"undercut","rearDeckStyle":"swan-neck","exhaustStyle":"top-exit","sharkFinStyle":"tall-proto"}
  },
  {
    "id": "acura-arx-06",
    "name": "Acura ARX-06",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.798, "width": 1.862, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#1e293b", "secondaryColor": "#ef4444", "tertiaryColor": "#38bdf8", "driverNumber": "10", "template": "two-tone", "rimFinish": "silver" },
    "bop": {"topSpeed":83,"acceleration":88,"corneringGrip":88,"braking":85,"efficiency":82},
    "designParams": {"cabinOffsetZ":0.08,"cabinScaleW":0.9,"cabinScaleH":0.96,"cabinScaleL":0.98,"noseHeightRatio":0.5,"tailHeightRatio":0.78,"widthScale":0.98,"lengthScale":1.01,"grilleStyle":"lmp-intake","headlightStyle":"c-clamp","sidepodStyle":"louvered","rearDeckStyle":"swan-neck","exhaustStyle":"top-exit","sharkFinStyle":"tall-proto"}
  },
  {
    "id": "alpine-a424",
    "name": "Alpine A424",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.873, "width": 1.881, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#1d4ed8", "secondaryColor": "#ef4444", "tertiaryColor": "#ffffff", "driverNumber": "35", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":87,"acceleration":84,"corneringGrip":86,"braking":85,"efficiency":85},
    "designParams": {"cabinOffsetZ":0.05,"cabinScaleW":0.95,"cabinScaleH":0.98,"cabinScaleL":1,"noseHeightRatio":0.55,"tailHeightRatio":0.78,"widthScale":0.99,"lengthScale":1.03,"grilleStyle":"lmp-intake","headlightStyle":"blade","sidepodStyle":"undercut","rearDeckStyle":"strut-race","exhaustStyle":"top-exit","sharkFinStyle":"tall-proto"}
  },
  {
    "id": "peugeot-9x8",
    "name": "Peugeot 9X8",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.835, "width": 1.938, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#cbd5e1", "secondaryColor": "#84cc16", "tertiaryColor": "#0f172a", "driverNumber": "93", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":83,"acceleration":84,"corneringGrip":89,"braking":86,"efficiency":86},
    "designParams": {"cabinOffsetZ":0.07,"cabinScaleW":0.92,"cabinScaleH":0.92,"cabinScaleL":1.02,"noseHeightRatio":0.52,"tailHeightRatio":0.7,"widthScale":1.02,"lengthScale":1.02,"grilleStyle":"lmp-intake","headlightStyle":"fang","sidepodStyle":"sculpted-intake","rearDeckStyle":"wingless-9x8","exhaustStyle":"top-exit","sharkFinStyle":"curved-lmh"}
  },
  {
    "id": "aston-valkyrie-lmh",
    "name": "Aston Martin Valkyrie AMR-LMH",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v12",
    "dimensions": { "length": 3.798, "width": 1.824, "height": 1.03, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#065f46", "secondaryColor": "#a3e635", "tertiaryColor": "#ffffff", "driverNumber": "007", "template": "racing-stripes", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":90,"acceleration":84,"corneringGrip":87,"braking":83,"efficiency":80},
    "designParams": {"cabinOffsetZ":0.09,"cabinScaleW":0.84,"cabinScaleH":0.9,"cabinScaleL":0.96,"noseHeightRatio":0.48,"tailHeightRatio":0.68,"widthScale":0.96,"lengthScale":1.01,"grilleStyle":"aston-wings","headlightStyle":"blade","sidepodStyle":"venturi-tunnel","rearDeckStyle":"swan-neck","exhaustStyle":"top-exit","sharkFinStyle":"roof-scoop"}
  },
  {
    "id": "lamborghini-sc63",
    "name": "Lamborghini SC63",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.835, "width": 1.919, "height": 1.03, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#65a30d", "secondaryColor": "#111827", "tertiaryColor": "#ef4444", "driverNumber": "63", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":86,"acceleration":85,"corneringGrip":85,"braking":88,"efficiency":83},
    "designParams": {"cabinOffsetZ":0.06,"cabinScaleW":0.94,"cabinScaleH":0.96,"cabinScaleL":1,"noseHeightRatio":0.5,"tailHeightRatio":0.8,"widthScale":1.01,"lengthScale":1.02,"grilleStyle":"lmp-intake","headlightStyle":"fang","sidepodStyle":"louvered","rearDeckStyle":"swan-neck","exhaustStyle":"top-exit","sharkFinStyle":"roof-scoop"}
  },
  {
    "id": "genesis-gmr-001",
    "name": "Genesis GMR-001",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.873, "width": 1.9, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#ea580c", "secondaryColor": "#18181b", "tertiaryColor": "#f8fafc", "driverNumber": "88", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":86,"acceleration":87,"corneringGrip":85,"braking":84,"efficiency":86},
    "designParams": {"cabinOffsetZ":0.05,"cabinScaleW":0.96,"cabinScaleH":0.98,"cabinScaleL":1.02,"noseHeightRatio":0.54,"tailHeightRatio":0.78,"widthScale":1,"lengthScale":1.03,"grilleStyle":"lmp-intake","headlightStyle":"blade","sidepodStyle":"sculpted-intake","rearDeckStyle":"strut-race","exhaustStyle":"top-exit","sharkFinStyle":"curved-lmh"}
  },
  {
    "id": "glickenhaus-scg-007",
    "name": "Glickenhaus SCG 007",
    "classId": "HYPERCAR_GTP",
    "series": "WEC Hypercar / IMSA GTP",
    "category": "Endurance",
    "silhouette": "prototype",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.722, "width": 1.862, "height": 1.03, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#0284c7", "secondaryColor": "#ffffff", "tertiaryColor": "#dc2626", "driverNumber": "708", "template": "heritage", "rimFinish": "white" },
    "bop": {"topSpeed":88,"acceleration":83,"corneringGrip":85,"braking":86,"efficiency":89},
    "designParams": {"cabinOffsetZ":0.03,"cabinScaleW":0.92,"cabinScaleH":1.02,"cabinScaleL":0.96,"noseHeightRatio":0.56,"tailHeightRatio":0.76,"widthScale":0.98,"lengthScale":0.99,"grilleStyle":"lmp-intake","headlightStyle":"round-911","sidepodStyle":"louvered","rearDeckStyle":"strut-race","exhaustStyle":"side-exit","sharkFinStyle":"roof-scoop"}
  },
  {
    "id": "oreca-07-united",
    "name": "Oreca 07 Gibson (Low-Drag)",
    "classId": "LMP2",
    "series": "LMP2 Prototype",
    "category": "Endurance",
    "silhouette": "lmp2",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.76, "width": 1.9, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#f97316", "secondaryColor": "#0f172a", "tertiaryColor": "#ffffff", "driverNumber": "22", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":84,"acceleration":80,"corneringGrip":80,"braking":81,"efficiency":84},
    "designParams": {"openWheelEra":"Spec Prototype","aeroFeatures":["Twin-keel stepped nose cone","Tall dorsal shark fin","High downforce swan-neck wing"]}
  },
  {
    "id": "oreca-07-europol",
    "name": "Oreca 07 Gibson (High-DF)",
    "classId": "LMP2",
    "series": "LMP2 Prototype",
    "category": "Endurance",
    "silhouette": "lmp2",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.76, "width": 1.9, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#eab308", "secondaryColor": "#15803d", "tertiaryColor": "#ffffff", "driverNumber": "34", "template": "geometric", "rimFinish": "silver" },
    "bop": {"topSpeed":78,"acceleration":82,"corneringGrip":85,"braking":83,"efficiency":80},
    "designParams": {"openWheelEra":"Spec Prototype","aeroFeatures":["Twin-keel stepped nose cone","Tall dorsal shark fin","High downforce swan-neck wing"]}
  },
  {
    "id": "oreca-07-ao",
    "name": "Oreca 07 Gibson (Endurance)",
    "classId": "LMP2",
    "series": "LMP2 Prototype",
    "category": "Endurance",
    "silhouette": "lmp2",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.76, "width": 1.9, "height": 0.98, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#7c3aed", "secondaryColor": "#22d3ee", "tertiaryColor": "#ffffff", "driverNumber": "99", "template": "racing-stripes", "rimFinish": "white" },
    "bop": {"topSpeed":81,"acceleration":81,"corneringGrip":82,"braking":82,"efficiency":88},
    "designParams": {"openWheelEra":"Spec Prototype","aeroFeatures":["Twin-keel stepped nose cone","Tall dorsal shark fin","High downforce swan-neck wing"]}
  },
  {
    "id": "porsche-911-gt3-r",
    "name": "Porsche 911 GT3 R (992)",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "flat6",
    "dimensions": { "length": 3.514, "width": 1.911, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#f8fafc", "secondaryColor": "#16a34a", "tertiaryColor": "#111827", "driverNumber": "911", "template": "heritage", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":74,"acceleration":79,"corneringGrip":81,"braking":82,"efficiency":79},
    "designParams": {"cabinOffsetZ":-0.18,"cabinScaleW":0.96,"cabinScaleH":1.04,"cabinScaleL":1.02,"noseHeightRatio":0.58,"tailHeightRatio":0.9,"widthScale":0.98,"lengthScale":0.96,"grilleStyle":"porsche-992","headlightStyle":"round-911","sidepodStyle":"louvered","rearDeckStyle":"swan-neck","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "ferrari-296-gt3",
    "name": "Ferrari 296 GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.587, "width": 1.989, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#dc2626", "secondaryColor": "#facc15", "tertiaryColor": "#ffffff", "driverNumber": "62", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":77,"acceleration":78,"corneringGrip":81,"braking":79,"efficiency":78},
    "designParams": {"cabinOffsetZ":0.08,"cabinScaleW":0.98,"cabinScaleH":0.92,"cabinScaleL":0.96,"noseHeightRatio":0.52,"tailHeightRatio":0.84,"widthScale":1.02,"lengthScale":0.98,"grilleStyle":"ferrari-split","headlightStyle":"blade","sidepodStyle":"sculpted-intake","rearDeckStyle":"swan-neck","exhaustStyle":"rear-dual","sharkFinStyle":"none"}
  },
  {
    "id": "corvette-z06-gt3r",
    "name": "Chevrolet Corvette Z06 GT3.R",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.697, "width": 2.009, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#facc15", "secondaryColor": "#18181b", "tertiaryColor": "#dc2626", "driverNumber": "3", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":79,"acceleration":80,"corneringGrip":77,"braking":79,"efficiency":80},
    "designParams": {"cabinOffsetZ":0.12,"cabinScaleW":0.96,"cabinScaleH":0.9,"cabinScaleL":0.94,"noseHeightRatio":0.5,"tailHeightRatio":0.86,"widthScale":1.03,"lengthScale":1.01,"grilleStyle":"corvette-wedge","headlightStyle":"blade","sidepodStyle":"sculpted-intake","rearDeckStyle":"swan-neck","exhaustStyle":"rear-dual","sharkFinStyle":"none"}
  },
  {
    "id": "bmw-m4-gt3",
    "name": "BMW M4 GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "turbo-i6",
    "dimensions": { "length": 3.77, "width": 1.989, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#ffffff", "secondaryColor": "#2563eb", "tertiaryColor": "#ef4444", "driverNumber": "1", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":78,"acceleration":77,"corneringGrip":79,"braking":81,"efficiency":81},
    "designParams": {"cabinOffsetZ":-0.24,"cabinScaleW":1.02,"cabinScaleH":1.06,"cabinScaleL":1.02,"noseHeightRatio":0.72,"tailHeightRatio":0.94,"widthScale":1.02,"lengthScale":1.03,"grilleStyle":"bmw-kidney","headlightStyle":"fang","sidepodStyle":"louvered","rearDeckStyle":"swan-neck","exhaustStyle":"side-exit","sharkFinStyle":"none"}
  },
  {
    "id": "ford-mustang-gt3",
    "name": "Ford Mustang GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.77, "width": 1.97, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#1d4ed8", "secondaryColor": "#ffffff", "tertiaryColor": "#ef4444", "driverNumber": "64", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":81,"acceleration":79,"corneringGrip":76,"braking":78,"efficiency":80},
    "designParams": {"cabinOffsetZ":-0.26,"cabinScaleW":1.02,"cabinScaleH":1.06,"cabinScaleL":1,"noseHeightRatio":0.74,"tailHeightRatio":0.94,"widthScale":1.01,"lengthScale":1.03,"grilleStyle":"mustang-pony","headlightStyle":"fang","sidepodStyle":"louvered","rearDeckStyle":"strut-race","exhaustStyle":"side-exit","sharkFinStyle":"none"}
  },
  {
    "id": "aston-vantage-gt3",
    "name": "Aston Martin Vantage GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.66, "width": 1.989, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#047857", "secondaryColor": "#bef264", "tertiaryColor": "#111827", "driverNumber": "27", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":77,"acceleration":78,"corneringGrip":79,"braking":80,"efficiency":81},
    "designParams": {"cabinOffsetZ":-0.22,"cabinScaleW":1,"cabinScaleH":0.98,"cabinScaleL":0.96,"noseHeightRatio":0.64,"tailHeightRatio":0.88,"widthScale":1.02,"lengthScale":1,"grilleStyle":"aston-wings","headlightStyle":"blade","sidepodStyle":"undercut","rearDeckStyle":"swan-neck","exhaustStyle":"rear-dual","sharkFinStyle":"none"}
  },
  {
    "id": "lamborghini-temerario-gt3",
    "name": "Lamborghini Temerario GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v10",
    "dimensions": { "length": 3.66, "width": 2.009, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#84cc16", "secondaryColor": "#0f172a", "tertiaryColor": "#ffffff", "driverNumber": "19", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":78,"acceleration":80,"corneringGrip":79,"braking":78,"efficiency":76},
    "designParams": {"cabinOffsetZ":0.14,"cabinScaleW":0.98,"cabinScaleH":0.88,"cabinScaleL":0.98,"noseHeightRatio":0.48,"tailHeightRatio":0.84,"widthScale":1.03,"lengthScale":1,"grilleStyle":"corvette-wedge","headlightStyle":"fang","sidepodStyle":"sculpted-intake","rearDeckStyle":"swan-neck","exhaustStyle":"rear-center","sharkFinStyle":"roof-scoop"}
  },
  {
    "id": "mercedes-amg-gt3",
    "name": "Mercedes-AMG GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.806, "width": 2.009, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#94a3b8", "secondaryColor": "#06b6d4", "tertiaryColor": "#0f172a", "driverNumber": "57", "template": "heritage", "rimFinish": "silver" },
    "bop": {"topSpeed":76,"acceleration":77,"corneringGrip":80,"braking":82,"efficiency":82},
    "designParams": {"cabinOffsetZ":-0.3,"cabinScaleW":1,"cabinScaleH":0.98,"cabinScaleL":0.94,"noseHeightRatio":0.68,"tailHeightRatio":0.86,"widthScale":1.03,"lengthScale":1.04,"grilleStyle":"merc-panamericana","headlightStyle":"twin-pod","sidepodStyle":"louvered","rearDeckStyle":"strut-race","exhaustStyle":"side-exit","sharkFinStyle":"none"}
  },
  {
    "id": "lexus-rcf-gt3",
    "name": "Lexus RC F GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.733, "width": 1.95, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#0f172a", "secondaryColor": "#2563eb", "tertiaryColor": "#f8fafc", "driverNumber": "14", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":79,"acceleration":77,"corneringGrip":77,"braking":80,"efficiency":83},
    "designParams": {"cabinOffsetZ":-0.22,"cabinScaleW":1.02,"cabinScaleH":1.04,"cabinScaleL":1,"noseHeightRatio":0.7,"tailHeightRatio":0.92,"widthScale":1,"lengthScale":1.02,"grilleStyle":"lexus-spindle","headlightStyle":"c-clamp","sidepodStyle":"louvered","rearDeckStyle":"strut-race","exhaustStyle":"side-exit","sharkFinStyle":"none"}
  },
  {
    "id": "mclaren-720s-gt3",
    "name": "McLaren 720S GT3",
    "classId": "GT3",
    "series": "GTD Pro / LMGT3",
    "category": "Endurance",
    "silhouette": "gt",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.623, "width": 1.989, "height": 1.06, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#f97316", "secondaryColor": "#0f172a", "tertiaryColor": "#38bdf8", "driverNumber": "59", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":76,"acceleration":78,"corneringGrip":82,"braking":79,"efficiency":76},
    "designParams": {"cabinOffsetZ":0.14,"cabinScaleW":0.94,"cabinScaleH":0.9,"cabinScaleL":0.98,"noseHeightRatio":0.5,"tailHeightRatio":0.82,"widthScale":1.02,"lengthScale":0.99,"grilleStyle":"mclaren-eye","headlightStyle":"c-clamp","sidepodStyle":"undercut","rearDeckStyle":"swan-neck","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "f1-26-ferrari",
    "name": "Scuderia Ferrari SF-26",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#dc2626", "secondaryColor": "#ffffff", "tertiaryColor": "#facc15", "driverNumber": "16", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":93,"acceleration":94,"corneringGrip":91,"braking":92,"efficiency":88},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-mclaren",
    "name": "McLaren MCL40 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#f97316", "secondaryColor": "#0f172a", "tertiaryColor": "#38bdf8", "driverNumber": "4", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":91,"acceleration":92,"corneringGrip":95,"braking":93,"efficiency":90},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-mercedes",
    "name": "Mercedes-AMG W17 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#111827", "secondaryColor": "#14b8a6", "tertiaryColor": "#cbd5e1", "driverNumber": "63", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":93,"acceleration":93,"corneringGrip":92,"braking":94,"efficiency":91},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-redbull",
    "name": "Red Bull RB22 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#1e1b4b", "secondaryColor": "#ef4444", "tertiaryColor": "#facc15", "driverNumber": "1", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":94,"acceleration":93,"corneringGrip":93,"braking":91,"efficiency":87},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-aston",
    "name": "Aston Martin AMR26",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#065f46", "secondaryColor": "#a3e635", "tertiaryColor": "#ffffff", "driverNumber": "14", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":90,"acceleration":93,"corneringGrip":94,"braking":92,"efficiency":90},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-williams",
    "name": "Williams FW48 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#1d4ed8", "secondaryColor": "#38bdf8", "tertiaryColor": "#f97316", "driverNumber": "23", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":96,"acceleration":92,"corneringGrip":89,"braking":91,"efficiency":89},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-alpine",
    "name": "Alpine A526 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#0284c7", "secondaryColor": "#ec4899", "tertiaryColor": "#0f172a", "driverNumber": "10", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":92,"acceleration":91,"corneringGrip":92,"braking":93,"efficiency":91},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-haas",
    "name": "Haas VF-26 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#f8fafc", "secondaryColor": "#dc2626", "tertiaryColor": "#111827", "driverNumber": "87", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":93,"acceleration":93,"corneringGrip":90,"braking":92,"efficiency":89},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-audi",
    "name": "Audi R26 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#cbd5e1", "secondaryColor": "#ef4444", "tertiaryColor": "#0f172a", "driverNumber": "27", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":91,"acceleration":94,"corneringGrip":92,"braking":92,"efficiency":90},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-cadillac",
    "name": "Cadillac F1 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#0f172a", "secondaryColor": "#facc15", "tertiaryColor": "#2563eb", "driverNumber": "11", "template": "racing-stripes", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":94,"acceleration":92,"corneringGrip":91,"braking":91,"efficiency":89},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-26-racing-bulls",
    "name": "Racing Bulls VCARB 03 (2026)",
    "classId": "F1_2026",
    "series": "Formula 1 — 2026 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#f8fafc", "secondaryColor": "#2563eb", "tertiaryColor": "#ef4444", "driverNumber": "22", "template": "heritage", "rimFinish": "white" },
    "bop": {"topSpeed":91,"acceleration":92,"corneringGrip":94,"braking":93,"efficiency":89},
    "designParams": {"openWheelEra":"2026 Active-Aero","aeroFeatures":["Articulating active aero front wing flap","Articulating active aero rear wing flap","Titanium Halo"]}
  },
  {
    "id": "f1-21-mercedes",
    "name": "Mercedes W12 (2021)",
    "classId": "F1_2021",
    "series": "Formula 1 — 2021 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#0f172a", "secondaryColor": "#14b8a6", "tertiaryColor": "#e2e8f0", "driverNumber": "44", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":94,"acceleration":94,"corneringGrip":97,"braking":96,"efficiency":88},
    "designParams": {"openWheelEra":"2021 High-DF","aeroFeatures":["Bargeboards","Floor boomerang vanes","Titanium Halo"]}
  },
  {
    "id": "f1-21-redbull",
    "name": "Red Bull RB16B (2021)",
    "classId": "F1_2021",
    "series": "Formula 1 — 2021 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#1e1b4b", "secondaryColor": "#facc15", "tertiaryColor": "#dc2626", "driverNumber": "33", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":92,"acceleration":95,"corneringGrip":98,"braking":96,"efficiency":89},
    "designParams": {"openWheelEra":"2021 High-DF","aeroFeatures":["Bargeboards","Floor boomerang vanes","Titanium Halo"]}
  },
  {
    "id": "f1-21-ferrari",
    "name": "Ferrari SF21 (2021)",
    "classId": "F1_2021",
    "series": "Formula 1 — 2021 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#991b1b", "secondaryColor": "#dc2626", "tertiaryColor": "#16a34a", "driverNumber": "55", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":91,"acceleration":94,"corneringGrip":97,"braking":97,"efficiency":90},
    "designParams": {"openWheelEra":"2021 High-DF","aeroFeatures":["Bargeboards","Floor boomerang vanes","Titanium Halo"]}
  },
  {
    "id": "f1-21-mclaren",
    "name": "McLaren MCL35M (2021)",
    "classId": "F1_2021",
    "series": "Formula 1 — 2021 Spec",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 0.98, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#f97316", "secondaryColor": "#0284c7", "tertiaryColor": "#111827", "driverNumber": "3", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":96,"acceleration":93,"corneringGrip":95,"braking":95,"efficiency":89},
    "designParams": {"openWheelEra":"2021 High-DF","aeroFeatures":["Bargeboards","Floor boomerang vanes","Titanium Halo"]}
  },
  {
    "id": "f1-05-renault",
    "name": "Renault R25 V10 (2005)",
    "classId": "F1_2005",
    "series": "Formula 1 — 2005 V10",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v10",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 1.1, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#38bdf8", "secondaryColor": "#facc15", "tertiaryColor": "#1e3a8a", "driverNumber": "5", "template": "two-tone", "rimFinish": "silver" },
    "bop": {"topSpeed":92,"acceleration":96,"corneringGrip":92,"braking":91,"efficiency":87},
    "designParams": {"openWheelEra":"2005 V10","aeroFeatures":["High rear wing (1.10m)","Sidepod chimneys & flip-ups","Grooved tires","No halo"]}
  },
  {
    "id": "f1-05-mclaren",
    "name": "McLaren MP4-20 V10 (2005)",
    "classId": "F1_2005",
    "series": "Formula 1 — 2005 V10",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v10",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 1.1, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#cbd5e1", "secondaryColor": "#111827", "tertiaryColor": "#ef4444", "driverNumber": "9", "template": "geometric", "rimFinish": "silver" },
    "bop": {"topSpeed":95,"acceleration":94,"corneringGrip":93,"braking":90,"efficiency":84},
    "designParams": {"openWheelEra":"2005 V10","aeroFeatures":["High rear wing (1.10m)","Sidepod chimneys & flip-ups","Grooved tires","No halo"]}
  },
  {
    "id": "f1-05-ferrari",
    "name": "Ferrari F2005 V10 (2005)",
    "classId": "F1_2005",
    "series": "Formula 1 — 2005 V10",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v10",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 1.1, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#dc2626", "secondaryColor": "#ffffff", "tertiaryColor": "#111827", "driverNumber": "1", "template": "racing-stripes", "rimFinish": "silver" },
    "bop": {"topSpeed":93,"acceleration":93,"corneringGrip":92,"braking":93,"efficiency":89},
    "designParams": {"openWheelEra":"2005 V10","aeroFeatures":["High rear wing (1.10m)","Sidepod chimneys & flip-ups","Grooved tires","No halo"]}
  },
  {
    "id": "f1-05-williams",
    "name": "Williams FW27 BMW V10 (2005)",
    "classId": "F1_2005",
    "series": "Formula 1 — 2005 V10",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "v10",
    "dimensions": { "length": 3.92, "width": 1.88, "height": 1.1, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#ffffff", "secondaryColor": "#1e3a8a", "tertiaryColor": "#38bdf8", "driverNumber": "7", "template": "heritage", "rimFinish": "white" },
    "bop": {"topSpeed":96,"acceleration":94,"corneringGrip":90,"braking":91,"efficiency":86},
    "designParams": {"openWheelEra":"2005 V10","aeroFeatures":["High rear wing (1.10m)","Sidepod chimneys & flip-ups","Grooved tires","No halo"]}
  },
  {
    "id": "fe-porsche-99x",
    "name": "Porsche 99X Electric GEN3 Evo",
    "classId": "FORMULA_E",
    "series": "Formula E (GEN3 Evo)",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "electric",
    "dimensions": { "length": 3.7, "width": 1.88, "height": 0.88, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#ffffff", "secondaryColor": "#dc2626", "tertiaryColor": "#0f172a", "driverNumber": "94", "template": "geometric", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":76,"acceleration":92,"corneringGrip":83,"braking":85,"efficiency":86},
    "designParams": {"openWheelEra":"Formula E GEN3 Evo","aeroFeatures":["Enclosed wheel fairings","Halo","Twin wheel winglets"]}
  },
  {
    "id": "fe-jaguar-itype7",
    "name": "Jaguar I-Type 7 GEN3 Evo",
    "classId": "FORMULA_E",
    "series": "Formula E (GEN3 Evo)",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "electric",
    "dimensions": { "length": 3.7, "width": 1.88, "height": 0.88, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#111827", "secondaryColor": "#f8fafc", "tertiaryColor": "#eab308", "driverNumber": "9", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":77,"acceleration":90,"corneringGrip":84,"braking":84,"efficiency":87},
    "designParams": {"openWheelEra":"Formula E GEN3 Evo","aeroFeatures":["Enclosed wheel fairings","Halo","Twin wheel winglets"]}
  },
  {
    "id": "fe-nissan-e4orce",
    "name": "Nissan e-4ORCE 05",
    "classId": "FORMULA_E",
    "series": "Formula E (GEN3 Evo)",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "electric",
    "dimensions": { "length": 3.7, "width": 1.88, "height": 0.88, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#ef4444", "secondaryColor": "#ffffff", "tertiaryColor": "#1e293b", "driverNumber": "23", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":75,"acceleration":93,"corneringGrip":84,"braking":84,"efficiency":84},
    "designParams": {"openWheelEra":"Formula E GEN3 Evo","aeroFeatures":["Enclosed wheel fairings","Halo","Twin wheel winglets"]}
  },
  {
    "id": "fe-maserati-folgore",
    "name": "Maserati Tipo Folgore",
    "classId": "FORMULA_E",
    "series": "Formula E (GEN3 Evo)",
    "category": "Single-Seater",
    "silhouette": "formula",
    "engineType": "electric",
    "dimensions": { "length": 3.7, "width": 1.88, "height": 0.88, "wheelbase": 2.52, "wheelRadius": 0.36, "wheelWidth": 0.38 },
    "livery": { "primaryColor": "#1d4ed8", "secondaryColor": "#f8fafc", "tertiaryColor": "#38bdf8", "driverNumber": "7", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":78,"acceleration":89,"corneringGrip":84,"braking":86,"efficiency":85},
    "designParams": {"openWheelEra":"Formula E GEN3 Evo","aeroFeatures":["Enclosed wheel fairings","Halo","Twin wheel winglets"]}
  },
  {
    "id": "bmw-m2-cs",
    "name": "BMW M2 CS",
    "classId": "TRACK_COUPE",
    "series": "Production Track Coupes",
    "category": "Production",
    "silhouette": "coupe",
    "engineType": "turbo-i6",
    "dimensions": { "length": 3.477, "width": 1.862, "height": 1.11, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#1d4ed8", "secondaryColor": "#111827", "tertiaryColor": "#ef4444", "driverNumber": "21", "template": "racing-stripes", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":68,"acceleration":71,"corneringGrip":71,"braking":73,"efficiency":82},
    "designParams": {"cabinOffsetZ":-0.18,"cabinScaleW":1.04,"cabinScaleH":1.12,"cabinScaleL":1.04,"noseHeightRatio":0.74,"tailHeightRatio":0.96,"widthScale":0.98,"lengthScale":0.95,"grilleStyle":"bmw-kidney","headlightStyle":"fang","sidepodStyle":"clean-street","rearDeckStyle":"active-lip","exhaustStyle":"rear-dual","sharkFinStyle":"none"}
  },
  {
    "id": "porsche-911-gt3-rs",
    "name": "Porsche 911 GT3 RS",
    "classId": "TRACK_COUPE",
    "series": "Production Track Coupes",
    "category": "Production",
    "silhouette": "coupe",
    "engineType": "flat6",
    "dimensions": { "length": 3.514, "width": 1.881, "height": 1.068, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#f8fafc", "secondaryColor": "#ef4444", "tertiaryColor": "#111827", "driverNumber": "992", "template": "heritage", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":70,"acceleration":72,"corneringGrip":75,"braking":75,"efficiency":76},
    "designParams": {"cabinOffsetZ":-0.18,"cabinScaleW":0.96,"cabinScaleH":1.02,"cabinScaleL":1,"noseHeightRatio":0.58,"tailHeightRatio":0.9,"widthScale":0.99,"lengthScale":0.96,"grilleStyle":"porsche-992","headlightStyle":"round-911","sidepodStyle":"louvered","rearDeckStyle":"ducktail-rs","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "corvette-z06-coupe",
    "name": "Chevrolet Corvette Z06",
    "classId": "TRACK_COUPE",
    "series": "Production Track Coupes",
    "category": "Production",
    "silhouette": "coupe",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.66, "width": 1.919, "height": 1.018, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#ea580c", "secondaryColor": "#18181b", "tertiaryColor": "#ffffff", "driverNumber": "06", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":74,"acceleration":74,"corneringGrip":70,"braking":71,"efficiency":77},
    "designParams": {"cabinOffsetZ":0.12,"cabinScaleW":0.96,"cabinScaleH":0.9,"cabinScaleL":0.94,"noseHeightRatio":0.52,"tailHeightRatio":0.88,"widthScale":1.01,"lengthScale":1,"grilleStyle":"corvette-wedge","headlightStyle":"blade","sidepodStyle":"sculpted-intake","rearDeckStyle":"ducktail-rs","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "nissan-gtr-nismo",
    "name": "Nissan GT-R NISMO",
    "classId": "TRACK_COUPE",
    "series": "Production Track Coupes",
    "category": "Production",
    "silhouette": "coupe",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.697, "width": 1.881, "height": 1.11, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#cbd5e1", "secondaryColor": "#111827", "tertiaryColor": "#dc2626", "driverNumber": "23", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":72,"acceleration":76,"corneringGrip":70,"braking":71,"efficiency":78},
    "designParams": {"cabinOffsetZ":-0.18,"cabinScaleW":1.04,"cabinScaleH":1.12,"cabinScaleL":1.04,"noseHeightRatio":0.74,"tailHeightRatio":0.98,"widthScale":0.99,"lengthScale":1.01,"grilleStyle":"gtr-v","headlightStyle":"blade","sidepodStyle":"clean-street","rearDeckStyle":"strut-race","exhaustStyle":"rear-dual","sharkFinStyle":"none"}
  },
  {
    "id": "ferrari-296-gtb",
    "name": "Ferrari 296 GTB",
    "classId": "SUPERCAR",
    "series": "Production Supercars & Hypercars",
    "category": "Production",
    "silhouette": "supercar",
    "engineType": "v6-hybrid",
    "dimensions": { "length": 3.514, "width": 1.9, "height": 1.018, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#dc2626", "secondaryColor": "#facc15", "tertiaryColor": "#111827", "driverNumber": "296", "template": "racing-stripes", "rimFinish": "silver" },
    "bop": {"topSpeed":84,"acceleration":85,"corneringGrip":78,"braking":79,"efficiency":79},
    "designParams": {"cabinOffsetZ":0.09,"cabinScaleW":0.96,"cabinScaleH":0.9,"cabinScaleL":0.94,"noseHeightRatio":0.52,"tailHeightRatio":0.86,"widthScale":1,"lengthScale":0.96,"grilleStyle":"ferrari-split","headlightStyle":"blade","sidepodStyle":"sculpted-intake","rearDeckStyle":"active-lip","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "mclaren-750s",
    "name": "McLaren 750S",
    "classId": "SUPERCAR",
    "series": "Production Supercars & Hypercars",
    "category": "Production",
    "silhouette": "supercar",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.587, "width": 1.919, "height": 1.01, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#f97316", "secondaryColor": "#111827", "tertiaryColor": "#f8fafc", "driverNumber": "750", "template": "two-tone", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":86,"acceleration":84,"corneringGrip":79,"braking":78,"efficiency":77},
    "designParams": {"cabinOffsetZ":0.14,"cabinScaleW":0.94,"cabinScaleH":0.88,"cabinScaleL":0.96,"noseHeightRatio":0.5,"tailHeightRatio":0.84,"widthScale":1.01,"lengthScale":0.98,"grilleStyle":"mclaren-eye","headlightStyle":"c-clamp","sidepodStyle":"undercut","rearDeckStyle":"active-lip","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "ferrari-sf90",
    "name": "Ferrari SF90 Stradale",
    "classId": "SUPERCAR",
    "series": "Production Supercars & Hypercars",
    "category": "Production",
    "silhouette": "supercar",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.697, "width": 1.938, "height": 1.018, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#991b1b", "secondaryColor": "#cbd5e1", "tertiaryColor": "#facc15", "driverNumber": "90", "template": "heritage", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":87,"acceleration":89,"corneringGrip":76,"braking":78,"efficiency":74},
    "designParams": {"cabinOffsetZ":0.08,"cabinScaleW":0.98,"cabinScaleH":0.9,"cabinScaleL":0.98,"noseHeightRatio":0.5,"tailHeightRatio":0.88,"widthScale":1.02,"lengthScale":1.01,"grilleStyle":"ferrari-split","headlightStyle":"c-clamp","sidepodStyle":"sculpted-intake","rearDeckStyle":"deck-tunnel","exhaustStyle":"rear-center","sharkFinStyle":"none"}
  },
  {
    "id": "porsche-918-spyder",
    "name": "Porsche 918 Spyder",
    "classId": "SUPERCAR",
    "series": "Production Supercars & Hypercars",
    "category": "Production",
    "silhouette": "supercar",
    "engineType": "v8-hybrid",
    "dimensions": { "length": 3.623, "width": 1.9, "height": 1.001, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#cbd5e1", "secondaryColor": "#84cc16", "tertiaryColor": "#111827", "driverNumber": "918", "template": "racing-stripes", "rimFinish": "gloss-black" },
    "bop": {"topSpeed":83,"acceleration":86,"corneringGrip":79,"braking":80,"efficiency":82},
    "designParams": {"cabinOffsetZ":0.08,"cabinScaleW":0.96,"cabinScaleH":0.86,"cabinScaleL":0.9,"noseHeightRatio":0.54,"tailHeightRatio":0.84,"widthScale":1,"lengthScale":0.99,"grilleStyle":"porsche-992","headlightStyle":"twin-pod","sidepodStyle":"undercut","rearDeckStyle":"active-lip","exhaustStyle":"top-exit","sharkFinStyle":"none"}
  },
  {
    "id": "aston-valkyrie-road",
    "name": "Aston Martin Valkyrie (Road Spec)",
    "classId": "SUPERCAR",
    "series": "Production Supercars & Hypercars",
    "category": "Production",
    "silhouette": "supercar",
    "engineType": "v12",
    "dimensions": { "length": 3.66, "width": 1.805, "height": 1.01, "wheelbase": 2.36, "wheelRadius": 0.35, "wheelWidth": 0.3 },
    "livery": { "primaryColor": "#065f46", "secondaryColor": "#a3e635", "tertiaryColor": "#111827", "driverNumber": "12", "template": "geometric", "rimFinish": "gold-bronze" },
    "bop": {"topSpeed":90,"acceleration":83,"corneringGrip":81,"braking":77,"efficiency":74},
    "designParams": {"cabinOffsetZ":0.1,"cabinScaleW":0.82,"cabinScaleH":0.88,"cabinScaleL":0.94,"noseHeightRatio":0.48,"tailHeightRatio":0.68,"widthScale":0.95,"lengthScale":1,"grilleStyle":"aston-wings","headlightStyle":"blade","sidepodStyle":"venturi-tunnel","rearDeckStyle":"active-lip","exhaustStyle":"top-exit","sharkFinStyle":"roof-scoop"}
  }
]
```
