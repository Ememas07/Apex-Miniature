import * as THREE from 'three';
import { BodySilhouette, CarClassId, LiveryConfig } from '../game/types';
import {
  REAL_WORLD_CAR_DIMENSIONS,
  REAL_WORLD_CAR_LENGTHS,
  getRealWorldCarDimensions,
  getRealWorldCarLength,
} from '../game/cars';
import { createCarGlassMaterial, createCarMaterials, getShadowTexture } from './carMaterials';
import {
  BuiltCarRig,
  CabinStyle,
  CarUVZone,
  GreenhouseStationSpec,
  HullStationSpec,
  SIX_ZONE_UV_ATLAS,
  UVZoneRect,
  applySixZoneCarUVs,
  buildCabinStations,
  buildHullStations,
  classifyTriangleSixZone,
  computeRigHoodMount,
  createDiecastWheel,
  createLoftedGreenhouseGeometry,
  createLoftedHullGeometry,
  createSuspensionArms,
} from './carGeometryHelpers';
import {
  ClosedWheelDesign,
  SafetyCarRig,
  buildClosedWheelCarBody,
  buildFormulaCarBody,
  buildSafetyCarMesh,
  buildSafetyCarRig,
  resolveClosedWheelDesign,
} from './carSilhouetteBuilders';

export {
  REAL_WORLD_CAR_DIMENSIONS,
  REAL_WORLD_CAR_LENGTHS,
  getRealWorldCarDimensions,
  getRealWorldCarLength,
  createCarGlassMaterial,
  SIX_ZONE_UV_ATLAS,
  classifyTriangleSixZone,
  applySixZoneCarUVs,
  computeRigHoodMount,
  createLoftedHullGeometry,
  buildHullStations,
  createLoftedGreenhouseGeometry,
  buildCabinStations,
  buildSafetyCarRig,
  buildSafetyCarMesh,
};

export type {
  CarUVZone,
  UVZoneRect,
  BuiltCarRig,
  CabinStyle,
  HullStationSpec,
  GreenhouseStationSpec,
  ClosedWheelDesign,
  SafetyCarRig,
};

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

  const design = resolveClosedWheelDesign(carId, isProto, isLmp2, isGT3, isGT4, isStreetCar);

  const caliperColorHex =
    livery.caliperColor ||
    design.caliperColor ||
    (isGT4 ? '#0284c7' : isGT3 ? '#ef4444' : isProto ? '#facc15' : '#dc2626');

  const materials = createCarMaterials(livery, classId, maxAniso, caliperColorHex, track);

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

  const realLength = getRealWorldCarLength(carId, classId);
  const length = isFormula
    ? isFormulaE
      ? 3.70
      : 3.92
    : realLength * (design.lengthScale || 1);
  const width = (isFormula ? 1.88 : isGT3 ? 1.96 : isProto ? 1.99 : 1.88) * (isFormula ? 1 : design.widthScale);
  const wheelRadius = isFormula ? 0.36 : isProto || classId === CarClassId.SUPERCAR ? 0.315 : 0.325;
  const wheelWidth = isFormula ? 0.38 : 0.26;
  const wheelBaseZ = isFormula ? 1.26 : length * 0.285;
  const trackHalfX = isFormula ? 0.86 : Math.min(0.79, width * 0.445 - wheelWidth * 0.5);
  const formulaLengthStretch = isFormula ? realLength / (isFormulaE ? 3.85 : 3.92) : 1.0;

  let frontWingFlap: THREE.Mesh | null = null;
  let rearWingFlap: THREE.Mesh | null = null;

  if (isFormula) {
    const formulaResult = buildFormulaCarBody({
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
    });
    frontWingFlap = formulaResult.frontWingFlap;
    rearWingFlap = formulaResult.rearWingFlap;
  } else {
    const closedResult = buildClosedWheelCarBody({
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
    });
    rearWingFlap = closedResult.rearWingFlap;
  }

  // Apply real-world length stretch to Formula chassis while keeping wheels perfectly circular
  if (isFormula && Math.abs(formulaLengthStretch - 1) > 1e-4) {
    bodyGroup.scale.z = formulaLengthStretch;
  }

  // Four Rotating & Steering Wheels + Wishbones for Open-Wheelers
  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];

  const effWheelBaseZ = isFormula ? wheelBaseZ * formulaLengthStretch : wheelBaseZ;
  const wheelCoords: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: -trackHalfX, z: effWheelBaseZ, isFront: true },
    { x: trackHalfX, z: effWheelBaseZ, isFront: true },
    { x: -trackHalfX, z: -effWheelBaseZ, isFront: false },
    { x: trackHalfX, z: -effWheelBaseZ, isFront: false },
  ];

  for (const wc of wheelCoords) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wc.x, wheelRadius, wc.z);

    const wheelMesh = createDiecastWheel(
      wheelRadius,
      wheelWidth,
      materials.rimMat,
      materials.tireMat,
      materials.caliperMat,
      materials.rotorMat,
      wc.x < 0 ? -1 : 1,
      track,
      materials.tireGrooveMat,
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
        wc.z / formulaLengthStretch,
        wc.x < 0 ? wc.x + wheelWidth * 0.45 : wc.x - wheelWidth * 0.45,
        wheelRadius,
        wc.z / formulaLengthStretch,
        materials.matteTrimMat,
        track,
      );
      bodyGroup.add(suspension);
    }
  }

  const realDims = carId ? getRealWorldCarDimensions(carId, classId) : undefined;
  const hoodMount = computeRigHoodMount(root, bodyGroup, classId, realDims);

  // Night Volumetric Headlight Beam Cones (mounted after computeRigHoodMount so invisible cones never skew hood bounds)
  const headlightCones: THREE.Mesh[] = [];
  if (!isOpenWheel) {
    const coneGeo = track(new THREE.ConeGeometry(1.35, 11.5, 14, 1, true));
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, 5.75);
    const coneMat = track(
      new THREE.MeshBasicMaterial({
        color: materials.headlightHex,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    for (const side of [-0.56, 0.56]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(side, 0.46, length * 0.47);
      cone.visible = false;
      bodyGroup.add(cone);
      headlightCones.push(cone);
    }
  }

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    frontWingFlap,
    rearWingFlap,
    headlightMats: materials.headlightMats,
    brakeLightMat: materials.brakeLightMat,
    brakeRotorMat: materials.rotorMat,
    rainLightMat: materials.rainLightMat,
    headlightCones,
    hoodMount,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
