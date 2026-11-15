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
  rearWingFlap: THREE.Mesh | null;
  headlightMats: THREE.MeshStandardMaterial[];
  brakeLightMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

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

function getHeadlightHex(tint: HeadlightTint): number {
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

/**
 * Creates a stylized, chunky die-cast wheel assembly (stepped rubber tire + metallic rim + spokes)
 */
function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Tire drum
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  // Inner metallic rim barrel
  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rimMesh);

  // 5-spoke star hub so rotation is visibly readable
  const spokeGeo = new THREE.BoxGeometry(width + 0.04, radius * 1.12, radius * 0.14);
  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (s * Math.PI) / 3;
    wheelGroup.add(spoke);
  }

  return wheelGroup;
}

/**
 * Builds a composite 8–12 part die-cast miniature 3D car rig grounded at y = 0.
 * Forward direction is +Z (matching car heading convention: vx = sin(h)*v, vz = cos(h)*v).
 */
export function buildDiecastCar(
  silhouette: BodySilhouette,
  classId: CarClassId,
  livery: LiveryConfig,
  maxAniso = 4,
): BuiltCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Textures & PBR Materials
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
      color: 0xffffff,
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
      color: 0xffffff,
      map: numberPlateTex,
      roughness: 0.38,
      metalness: 0.05,
    }),
  );

  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bannerTex,
      roughness: 0.3,
      metalness: 0.1,
    }),
  );

  const headlightHex = getHeadlightHex(livery.headlightTint);
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

  // Grounding contact shadow disc
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

  // Dimensions tuned for stylized chunky die-cast proportions
  const isFormula = silhouette === 'formula';
  const isProto = silhouette === 'prototype' || silhouette === 'lmp2';
  const length = isFormula ? 3.9 : 3.65;
  const width = isFormula ? 1.88 : 1.92;
  const wheelRadius = isFormula ? 0.36 : 0.35;
  const wheelWidth = isFormula ? 0.38 : 0.30;
  const wheelBaseZ = 1.18;
  const trackHalfX = isFormula ? 0.84 : 0.82;

  // 1. Primary Chassis / Floor Undertray
  const floorGeo = track(new THREE.BoxGeometry(width * 0.94, 0.14, length * 0.94));
  const floorMesh = new THREE.Mesh(floorGeo, matteTrimMat);
  floorMesh.position.y = 0.22;
  floorMesh.castShadow = true;
  bodyGroup.add(floorMesh);

  let rearWingFlap: THREE.Mesh | null = null;

  if (isFormula) {
    // === SINGLE-SEATER DIE-CAST FORMULA SILHOUETTE ===
    // Tapered extruded sidepod & monocoque body
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.32, -1.65);
    hullShape.lineTo(-0.62, -0.65);
    hullShape.lineTo(-0.66, 0.45);
    hullShape.lineTo(-0.24, 1.72);
    hullShape.lineTo(0.24, 1.72);
    hullShape.lineTo(0.66, 0.45);
    hullShape.lineTo(0.62, -0.65);
    hullShape.lineTo(0.32, -1.65);
    hullShape.closePath();

    const hullGeo = track(
      new THREE.ExtrudeGeometry(hullShape, {
        depth: 0.36,
        bevelEnabled: true,
        bevelThickness: 0.07,
        bevelSize: 0.06,
        bevelSegments: 2,
      }),
    );
    hullGeo.rotateX(Math.PI / 2);
    // Normalize UVs for top-down livery projection
    const posAttr = hullGeo.attributes.position;
    const uvAttr = hullGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const pz = posAttr.getZ(i);
      uvAttr.setXY(i, (px + 0.9) / 1.8, (pz + 1.8) / 3.6);
    }
    const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
    hullMesh.position.y = 0.62;
    hullMesh.castShadow = true;
    bodyGroup.add(hullMesh);

    // Engine airbox & shark fin
    const airboxGeo = track(new THREE.BoxGeometry(0.34, 0.38, 1.15));
    const airboxMesh = new THREE.Mesh(airboxGeo, secondaryMat);
    airboxMesh.position.set(0, 0.78, -0.58);
    airboxMesh.castShadow = true;
    bodyGroup.add(airboxMesh);

    // Helmet + Cockpit rim
    const helmetGeo = track(new THREE.SphereGeometry(0.19, 16, 14));
    const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
    helmet.position.set(0, 0.76, 0.14);
    bodyGroup.add(helmet);

    // Titanium Halo (TubeGeometry)
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

    // Front Wing
    const fwGeo = track(new THREE.BoxGeometry(1.88, 0.08, 0.42));
    const fwMat = livery.carbonSplitter ? carbonMat : secondaryMat;
    const fwMesh = new THREE.Mesh(fwGeo, fwMat);
    fwMesh.position.set(0, 0.22, 1.72);
    fwMesh.castShadow = true;
    bodyGroup.add(fwMesh);

    // Front Wing Endplates
    const fweGeo = track(new THREE.BoxGeometry(0.06, 0.22, 0.46));
    for (const sx of [-0.94, 0.94]) {
      const fwe = new THREE.Mesh(fweGeo, tertiaryMat);
      fwe.position.set(sx, 0.28, 1.72);
      bodyGroup.add(fwe);
    }

    // Rear Wing Pillars + Active Aero Flap
    const rwStrutGeo = track(new THREE.BoxGeometry(0.06, 0.56, 0.34));
    for (const sx of [-0.48, 0.48]) {
      const strut = new THREE.Mesh(rwStrutGeo, matteTrimMat);
      strut.position.set(sx, 0.72, -1.68);
      bodyGroup.add(strut);
    }
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
    const rwMainGeo = track(new THREE.BoxGeometry(1.18, 0.07, 0.28));
    const rwMain = new THREE.Mesh(rwMainGeo, wingMat);
    rwMain.position.set(0, 0.98, -1.68);
    rwMain.castShadow = true;
    bodyGroup.add(rwMain);

    const rwFlapGeo = track(new THREE.BoxGeometry(1.14, 0.05, 0.2));
    rearWingFlap = new THREE.Mesh(rwFlapGeo, tertiaryMat);
    rearWingFlap.position.set(0, 1.07, -1.75);
    rearWingFlap.rotation.x = 0.38;
    bodyGroup.add(rearWingFlap);

    // Nose Number Plate
    const nosePlateGeo = track(new THREE.PlaneGeometry(0.36, 0.28));
    nosePlateGeo.rotateX(-Math.PI / 2 + 0.14);
    const nosePlate = new THREE.Mesh(nosePlateGeo, plateMat);
    nosePlate.position.set(0, 0.64, 1.15);
    bodyGroup.add(nosePlate);

    // Subtle F1 rain light + tiny front LEDs
    const rainGeo = track(new THREE.BoxGeometry(0.14, 0.12, 0.06));
    const rainLight = new THREE.Mesh(rainGeo, brakeLightMat);
    rainLight.position.set(0, 0.42, -1.85);
    bodyGroup.add(rainLight);

    // Small front nose LEDs (also used for class lighting)
    const hlGeo = track(new THREE.BoxGeometry(0.12, 0.06, 0.06));
    [-0.18, 0.18].forEach((hx, idx) => {
      const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
      hl.position.set(hx, 0.34, 1.88);
      bodyGroup.add(hl);
    });
  } else {
    // === CLOSED-WHEEL DIE-CAST (PROTOTYPE / GT / COUPE / SUPERCAR) ===
    // 2. Main Sculpted Body Shell
    const bodyWidth = width * 0.96;
    const bodyLen = length * 0.94;
    const bodyHeight = isProto ? 0.38 : 0.48;

    const profile = new THREE.Shape();
    profile.moveTo(-bodyLen * 0.5, 0);
    profile.lineTo(-bodyLen * 0.49, bodyHeight * 0.85);
    profile.lineTo(-bodyLen * 0.25, bodyHeight);
    profile.lineTo(bodyLen * 0.25, bodyHeight);
    profile.lineTo(bodyLen * 0.47, bodyHeight * 0.65);
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
    // Extrude is in XY extruded along +Z. Rotate so length is Z, width is X, height is Y
    bodyGeo.rotateY(-Math.PI / 2);
    bodyGeo.translate(bodyWidth * 0.5, 0.24, 0);

    // Map top-down XZ UVs cleanly so racing stripes / two-tone / carbon hood render crisply!
    const posAttr = bodyGeo.attributes.position;
    const uvAttr = bodyGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const pz = posAttr.getZ(i);
      uvAttr.setXY(
        i,
        (px + bodyWidth * 0.55) / (bodyWidth * 1.1),
        1 - (pz + bodyLen * 0.52) / (bodyLen * 1.04),
      );
    }

    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // Wheel Arch Flares (Sculpted die-cast fenders)
    const archGeo = track(new THREE.CylinderGeometry(0.42, 0.44, 0.2, 14, 1, false, 0, Math.PI));
    archGeo.rotateZ(Math.PI / 2);
    for (const sx of [-bodyWidth * 0.48, bodyWidth * 0.48]) {
      for (const sz of [-wheelBaseZ, wheelBaseZ]) {
        const arch = new THREE.Mesh(archGeo, secondaryMat);
        arch.position.set(sx, 0.36, sz);
        arch.castShadow = true;
        bodyGroup.add(arch);
      }
    }

    // 3. Sculpted Sloped Cockpit Canopy / Greenhouse
    const cabinW = isProto ? 0.94 : 1.18;
    const cabinH = isProto ? 0.36 : 0.40;
    const cabinL = isProto ? 1.68 : 1.72;
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-cabinL * 0.5, 0);
    cabinShape.lineTo(-cabinL * 0.42, cabinH * 0.72);
    cabinShape.lineTo(-cabinL * 0.12, cabinH);
    cabinShape.lineTo(cabinL * 0.20, cabinH);
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
    cabinGeo.translate(cabinW * 0.5, isProto ? 0.56 : 0.64, isProto ? 0.02 : -0.1);
    const cabin = new THREE.Mesh(cabinGeo, canopyMat);
    cabin.castShadow = true;
    bodyGroup.add(cabin);

    // Prototype Dorsal Shark Fin
    if (isProto) {
      const finGeo = track(new THREE.BoxGeometry(0.06, 0.30, 0.95));
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(0, 0.80, -0.95);
      bodyGroup.add(fin);
    }

    // Windshield Banner Sunstrip
    const bannerGeo = track(new THREE.PlaneGeometry(cabinW * 0.92, 0.14));
    bannerGeo.rotateX(-0.62);
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, isProto ? 0.84 : 0.94, isProto ? 0.62 : 0.54);
    bodyGroup.add(bannerMesh);

    // 4. Front Splitter (carbon or tertiary accent)
    const splitterGeo = track(new THREE.BoxGeometry(bodyWidth * 1.04, 0.06, 0.32));
    const splitterMesh = new THREE.Mesh(splitterGeo, livery.carbonSplitter ? carbonMat : tertiaryMat);
    splitterMesh.position.set(0, 0.18, bodyLen * 0.5 + 0.05);
    bodyGroup.add(splitterMesh);

    // 5. Rear Diffuser + Exhausts
    const diffGeo = track(new THREE.BoxGeometry(bodyWidth * 0.88, 0.12, 0.2));
    const diffMesh = new THREE.Mesh(diffGeo, matteTrimMat);
    diffMesh.position.set(0, 0.22, -bodyLen * 0.5);
    bodyGroup.add(diffMesh);

    // 6. Rear Wing (except coupe without large wing, though track coupes have GT wings)
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
    const strutGeo = track(new THREE.BoxGeometry(0.07, 0.38, 0.24));
    for (const sx of [-0.52, 0.52]) {
      const strut = new THREE.Mesh(strutGeo, matteTrimMat);
      strut.position.set(sx, 0.76, -bodyLen * 0.44);
      bodyGroup.add(strut);
    }
    const wingGeo = track(new THREE.BoxGeometry(bodyWidth * 0.96, 0.07, 0.34));
    const wingMesh = new THREE.Mesh(wingGeo, wingMat);
    wingMesh.position.set(0, 0.96, -bodyLen * 0.46);
    wingMesh.castShadow = true;
    bodyGroup.add(wingMesh);
    rearWingFlap = wingMesh;

    // Wing Endplates
    const epGeo = track(new THREE.BoxGeometry(0.05, 0.24, 0.42));
    for (const sx of [-bodyWidth * 0.48, bodyWidth * 0.48]) {
      const ep = new THREE.Mesh(epGeo, tertiaryMat);
      ep.position.set(sx, 0.96, -bodyLen * 0.46);
      bodyGroup.add(ep);
    }

    // 7. Side Door Number Plates (left & right)
    const doorPlateGeo = track(new THREE.PlaneGeometry(0.62, 0.44));
    const leftPlate = new THREE.Mesh(doorPlateGeo, plateMat);
    leftPlate.rotation.y = -Math.PI / 2;
    leftPlate.position.set(-bodyWidth * 0.555, 0.48, 0.05);
    bodyGroup.add(leftPlate);

    const rightPlate = new THREE.Mesh(doorPlateGeo, plateMat);
    rightPlate.rotation.y = Math.PI / 2;
    rightPlate.position.set(bodyWidth * 0.555, 0.48, 0.05);
    bodyGroup.add(rightPlate);

    // 8. Headlights & Taillight Bar
    const hlGeo = track(new THREE.BoxGeometry(0.28, 0.11, 0.08));
    [-0.64, 0.64].forEach((hx, idx) => {
      const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
      hl.position.set(hx, 0.42, bodyLen * 0.5 + 0.02);
      bodyGroup.add(hl);
    });

    const tailGeo = track(new THREE.BoxGeometry(bodyWidth * 0.84, 0.09, 0.07));
    const tailBar = new THREE.Mesh(tailGeo, brakeLightMat);
    tailBar.position.set(0, 0.48, -bodyLen * 0.5 - 0.02);
    bodyGroup.add(tailBar);
  }

  // 9. Four Rotating & Steering Die-Cast Wheels
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
    const wheelMesh = createDiecastWheel(wheelRadius, wheelWidth, rimMat, tireMat);
    steerPivot.add(wheelMesh);
    root.add(steerPivot);
    allWheels.push(wheelMesh);
    if (wc.isFront) {
      frontWheels.push(steerPivot);
    }
  }

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    rearWingFlap,
    headlightMats,
    brakeLightMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
