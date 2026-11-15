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

function getHeadlightHex(tint: HeadlightTint, classId: CarClassId): number {
  if (classId === CarClassId.GT3 && tint === 'crystal-white') {
    // GT3 default to endurance yellow
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

/**
 * Creates a stylized die-cast wheel assembly with optional grooved tire bands
 */
function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  grooveMat?: THREE.Material,
  isGrooved = false,
): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Outer tire drum
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 22);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  // 2005 F1 regulation: 4 distinct circumferential tread grooves
  if (isGrooved && grooveMat) {
    const grooveOffsets = [-width * 0.32, -width * 0.11, width * 0.11, width * 0.32];
    for (const gx of grooveOffsets) {
      const gGeo = new THREE.CylinderGeometry(radius + 0.002, radius + 0.002, width * 0.08, 22);
      gGeo.rotateZ(Math.PI / 2);
      const gMesh = new THREE.Mesh(gGeo, grooveMat);
      gMesh.position.x = gx;
      wheelGroup.add(gMesh);
    }
  }

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
 * Builds visible double-wishbone suspension arms for open-wheel race cars
 */
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
    // Upper wishbone
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: -0.12, zOff1: 0 },
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: 0.12, zOff1: 0 },
    // Lower wishbone
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: -0.14, zOff1: 0 },
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: 0.14, zOff1: 0 },
    // Pushrod / Pullrod
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
 * Distinct procedural 3D model per archetype & manufacturer:
 * - WEC Hypercar / IMSA GTP (sculpted fenders, enclosed teardrop canopy, tall shark fin, wide wing;
 *   peugeot-9x8 wingless, ferrari-499p split wing, aston-valkyrie-lmh venturi tunnels).
 * - LMP2 (narrower prototype nose, enclosed cockpit, tall dorsal fin).
 * - GT3 / GTD (wide-body coupe, front splitter/canards, swan-neck wing, yellow headlights).
 * - F1 2026 & 2021 (open wheels with suspension arms, multi-element wings, Halo).
 * - F1 2005 (open wheels with suspension arms, NO Halo, grooved tires, high narrow rear wing).
 * - Formula E GEN3 Evo (delta nose cone, enclosed front wheel fairings, twin rear winglets).
 * - Production Coupes & Supercars (clean street silhouette, subtle lip spoiler, dual exhausts, no race fins/wings).
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
      color: 0x0a0c0f,
      roughness: 0.95,
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
  const isStreetCar = classId === CarClassId.TRACK_COUPE || classId === CarClassId.SUPERCAR || silhouette === 'coupe';

  // Manufacturer specifics for Hypercar
  const isPeugeot9X8 = carId === 'peugeot-9x8';
  const isFerrari499P = carId === 'ferrari-499p';
  const isValkyrie = carId === 'aston-valkyrie-lmh';

  // Overall chassis dimensions
  const length = isFormula ? (isFormulaE ? 3.7 : 3.9) : isProto ? 3.75 : 3.65;
  const width = isFormula ? 1.88 : isGT3 ? 1.95 : 1.90;
  const wheelRadius = isFormula ? 0.36 : 0.35;
  const wheelWidth = isFormula ? 0.38 : 0.30;
  const wheelBaseZ = isFormula ? 1.25 : 1.18;
  const trackHalfX = isFormula ? 0.86 : 0.82;

  // Floor / Undertray
  const floorGeo = track(new THREE.BoxGeometry(width * 0.92, 0.12, length * 0.94));
  const floorMesh = new THREE.Mesh(floorGeo, matteTrimMat);
  floorMesh.position.y = 0.20;
  floorMesh.castShadow = true;
  bodyGroup.add(floorMesh);

  let rearWingFlap: THREE.Mesh | null = null;

  if (isFormula) {
    if (isFormulaE) {
      // ================= FORMULA E GEN3 EVO SILHOUETTE =================
      // Sharp fighter-jet delta nose cone + angular monocoque
      const deltaShape = new THREE.Shape();
      deltaShape.moveTo(-0.28, -1.60);
      deltaShape.lineTo(-0.62, -0.60);
      deltaShape.lineTo(-0.62, 0.35);
      deltaShape.lineTo(-0.06, 1.85); // sharp delta point
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
        const px = posAttr.getX(i);
        const pz = posAttr.getZ(i);
        uvAttr.setXY(i, (px + 0.8) / 1.6, (pz + 1.8) / 3.6);
      }
      const feHullMesh = new THREE.Mesh(feHullGeo, bodyMat);
      feHullMesh.position.y = 0.60;
      feHullMesh.castShadow = true;
      bodyGroup.add(feHullMesh);

      // Enclosed front wheel fairings (arrowhead shields)
      const fwFairingGeo = track(new THREE.BoxGeometry(0.36, 0.30, 0.85));
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

      // Driver helmet
      const helmetGeo = track(new THREE.SphereGeometry(0.18, 14, 12));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.74, 0.12);
      bodyGroup.add(helmet);

      // Twin rear winglets / bat-wing fins on rear wheel arches (NO traditional beam wing!)
      const wingletGeo = track(new THREE.BoxGeometry(0.42, 0.28, 0.48));
      for (const sx of [-0.68, 0.68]) {
        const winglet = new THREE.Mesh(wingletGeo, secondaryMat);
        winglet.position.set(sx, 0.74, -1.55);
        winglet.rotation.z = sx < 0 ? -0.22 : 0.22;
        winglet.rotation.x = -0.12;
        winglet.castShadow = true;
        bodyGroup.add(winglet);
      }

      // Small delta nose plate
      const nosePlateGeo = track(new THREE.PlaneGeometry(0.34, 0.26));
      nosePlateGeo.rotateX(-Math.PI / 2 + 0.15);
      const nosePlate = new THREE.Mesh(nosePlateGeo, plateMat);
      nosePlate.position.set(0, 0.62, 1.25);
      bodyGroup.add(nosePlate);

      // Cyan LED accents
      [-0.14, 0.14].forEach((hx, idx) => {
        const hlGeo = track(new THREE.BoxGeometry(0.09, 0.05, 0.05));
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.35, 1.82);
        bodyGroup.add(hl);
      });
    } else {
      // ================= F1 CARS (2026, 2021, 2005) =================
      const hullShape = new THREE.Shape();
      hullShape.moveTo(-0.30, -1.65);
      hullShape.lineTo(-0.64, -0.65);
      hullShape.lineTo(-0.64, 0.42);
      hullShape.lineTo(-0.22, 1.74);
      hullShape.lineTo(0.22, 1.74);
      hullShape.lineTo(0.64, 0.42);
      hullShape.lineTo(0.64, -0.65);
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
        const px = posAttr.getX(i);
        const pz = posAttr.getZ(i);
        uvAttr.setXY(i, (px + 0.9) / 1.8, (pz + 1.8) / 3.6);
      }
      const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
      hullMesh.position.y = 0.62;
      hullMesh.castShadow = true;
      bodyGroup.add(hullMesh);

      // Engine airbox & shark fin
      const airboxGeo = track(new THREE.BoxGeometry(0.32, 0.38, 1.15));
      const airboxMesh = new THREE.Mesh(airboxGeo, secondaryMat);
      airboxMesh.position.set(0, 0.78, -0.58);
      airboxMesh.castShadow = true;
      bodyGroup.add(airboxMesh);

      // Driver helmet
      const helmetGeo = track(new THREE.SphereGeometry(0.19, 16, 14));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.76, 0.14);
      bodyGroup.add(helmet);

      if (isF1_2005) {
        // === 2005 F1: NO HALO, raised cockpit headrest coaming, chimney ducts ===
        const coamingGeo = track(new THREE.BoxGeometry(0.38, 0.16, 0.52));
        const coaming = new THREE.Mesh(coamingGeo, secondaryMat);
        coaming.position.set(0, 0.75, -0.08);
        bodyGroup.add(coaming);

        // Sidepod chimney cooling vents (iconic 2005 feature!)
        for (const sx of [-0.46, 0.46]) {
          const chimneyGeo = track(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 8));
          const chimney = new THREE.Mesh(chimneyGeo, matteTrimMat);
          chimney.position.set(sx, 0.74, -0.32);
          bodyGroup.add(chimney);
        }
      } else {
        // === 2021 & 2026 F1: TITANIUM HALO ===
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

      // Front Wing (wider with cascades on 2021, active aero on 2026, multi-element curved on 2005)
      const fwWidth = isF1_2005 ? 1.75 : 1.90;
      const fwGeo = track(new THREE.BoxGeometry(fwWidth, 0.08, 0.42));
      const fwMat = livery.carbonSplitter ? carbonMat : secondaryMat;
      const fwMesh = new THREE.Mesh(fwGeo, fwMat);
      fwMesh.position.set(0, 0.22, 1.74);
      fwMesh.castShadow = true;
      bodyGroup.add(fwMesh);

      // Front Wing Endplates
      const fweGeo = track(new THREE.BoxGeometry(0.05, 0.22, 0.46));
      for (const sx of [-fwWidth * 0.5, fwWidth * 0.5]) {
        const fwe = new THREE.Mesh(fweGeo, tertiaryMat);
        fwe.position.set(sx, 0.28, 1.74);
        bodyGroup.add(fwe);
      }

      // Rear Wing
      // 2005 F1: narrower, taller rear wing. 2021/2026: wider with active flap.
      const rwWidth = isF1_2005 ? 0.98 : 1.20;
      const rwHeight = isF1_2005 ? 1.08 : 0.98;
      const wingMat = livery.carbonWing ? carbonMat : secondaryMat;

      const rwStrutGeo = track(new THREE.BoxGeometry(0.05, isF1_2005 ? 0.65 : 0.56, 0.32));
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

      const rwFlapGeo = track(new THREE.BoxGeometry(rwWidth * 0.96, 0.05, 0.2));
      rearWingFlap = new THREE.Mesh(rwFlapGeo, tertiaryMat);
      rearWingFlap.position.set(0, rwHeight + 0.08, -1.75);
      rearWingFlap.rotation.x = 0.38;
      bodyGroup.add(rearWingFlap);

      // Rear Wing Endplates
      const rweGeo = track(new THREE.BoxGeometry(0.04, 0.36, 0.44));
      for (const sx of [-rwWidth * 0.5, rwWidth * 0.5]) {
        const rwe = new THREE.Mesh(rweGeo, secondaryMat);
        rwe.position.set(sx, rwHeight, -1.68);
        bodyGroup.add(rwe);
      }

      // Nose Number Plate
      const nosePlateGeo = track(new THREE.PlaneGeometry(0.36, 0.28));
      nosePlateGeo.rotateX(-Math.PI / 2 + 0.14);
      const nosePlate = new THREE.Mesh(nosePlateGeo, plateMat);
      nosePlate.position.set(0, 0.64, 1.15);
      bodyGroup.add(nosePlate);

      // FIA Rain Light
      const rainGeo = track(new THREE.BoxGeometry(0.14, 0.12, 0.06));
      const rainLight = new THREE.Mesh(rainGeo, brakeLightMat);
      rainLight.position.set(0, 0.42, -1.84);
      bodyGroup.add(rainLight);

      // Small nose LEDs
      const hlGeo = track(new THREE.BoxGeometry(0.12, 0.06, 0.06));
      [-0.18, 0.18].forEach((hx, idx) => {
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.34, 1.86);
        bodyGroup.add(hl);
      });
    }
  } else {
    // ================= CLOSED-WHEEL CARS (PROTOTYPE, LMP2, GT3, STREET COUPE/SUPERCAR) =================
    const bodyWidth = width * 0.96;
    const bodyLen = length * 0.94;
    const bodyHeight = isProto ? 0.38 : 0.48;

    // Sculpted profile
    const profile = new THREE.Shape();
    profile.moveTo(-bodyLen * 0.5, 0);
    profile.lineTo(-bodyLen * 0.49, bodyHeight * (isStreetCar ? 0.92 : 0.85));
    profile.lineTo(-bodyLen * 0.25, bodyHeight);
    profile.lineTo(bodyLen * 0.25, bodyHeight);
    profile.lineTo(bodyLen * 0.47, bodyHeight * (isLmp2 ? 0.55 : 0.65));
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
      const px = posAttr.getX(i);
      const pz = posAttr.getZ(i);
      uvAttr.setXY(i, (px + bodyWidth * 0.55) / (bodyWidth * 1.1), 1 - (pz + bodyLen * 0.52) / (bodyLen * 1.04));
    }

    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // Wheel Arch Flares
    const archRadius = isStreetCar ? 0.40 : 0.43;
    const archGeo = track(new THREE.CylinderGeometry(archRadius, archRadius + 0.02, 0.2, 14, 1, false, 0, Math.PI));
    archGeo.rotateZ(Math.PI / 2);
    for (const sx of [-bodyWidth * 0.48, bodyWidth * 0.48]) {
      for (const sz of [-wheelBaseZ, wheelBaseZ]) {
        const arch = new THREE.Mesh(archGeo, secondaryMat);
        arch.position.set(sx, 0.36, sz);
        arch.castShadow = true;
        bodyGroup.add(arch);
      }
    }

    // Cockpit Canopy / Greenhouse
    const cabinW = isProto ? (isLmp2 ? 0.88 : 0.94) : isStreetCar ? 1.24 : 1.18;
    const cabinH = isProto ? 0.36 : 0.42;
    const cabinL = isProto ? 1.68 : isStreetCar ? 1.85 : 1.72;
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

    // Prototype Dorsal Shark Fin (Hypercar & LMP2)
    if (isProto) {
      const finHeight = isLmp2 ? 0.34 : 0.30;
      const finGeo = track(new THREE.BoxGeometry(0.06, finHeight, 1.05));
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(0, 0.82, -0.92);
      bodyGroup.add(fin);
    }

    // Aston Martin Valkyrie: Sculpted Venturi side air tunnels between cockpit & fenders
    if (isValkyrie) {
      const tunnelGeo = track(new THREE.BoxGeometry(0.24, 0.26, 1.4));
      for (const sx of [-0.60, 0.60]) {
        const tunnel = new THREE.Mesh(tunnelGeo, matteTrimMat);
        tunnel.position.set(sx, 0.42, 0.1);
        bodyGroup.add(tunnel);
      }
    }

    // GT3 Aerodynamic Canards (dive planes on front bumper corners)
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
      bannerMesh.position.set(0, isProto ? 0.84 : 0.94, isProto ? 0.62 : 0.54);
      bodyGroup.add(bannerMesh);
    }

    // Front Splitter
    const splitterGeo = track(
      new THREE.BoxGeometry(bodyWidth * (isGT3 ? 1.08 : 1.04), 0.06, isGT3 ? 0.38 : 0.30),
    );
    const splitterMesh = new THREE.Mesh(
      splitterGeo,
      livery.carbonSplitter || isGT3 ? carbonMat : tertiaryMat,
    );
    splitterMesh.position.set(0, 0.18, bodyLen * 0.5 + 0.05);
    bodyGroup.add(splitterMesh);

    // Rear Diffuser
    const diffGeo = track(new THREE.BoxGeometry(bodyWidth * 0.88, 0.12, 0.2));
    const diffMesh = new THREE.Mesh(diffGeo, matteTrimMat);
    diffMesh.position.set(0, 0.22, -bodyLen * 0.5);
    bodyGroup.add(diffMesh);

    // Rear Spoiler / Wing Handling per Archetype & Manufacturer
    if (isPeugeot9X8) {
      // === Peugeot 9X8: Wingless / ultra-low rear deck profile ===
      const lowLipGeo = track(new THREE.BoxGeometry(bodyWidth * 0.94, 0.06, 0.18));
      const lowLip = new THREE.Mesh(lowLipGeo, carbonMat);
      lowLip.position.set(0, 0.68, -bodyLen * 0.48);
      bodyGroup.add(lowLip);
    } else if (isFerrari499P) {
      // === Ferrari 499P: Distinct Split Rear Wing ===
      const halfW = bodyWidth * 0.44;
      const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
      for (const sx of [-0.52, 0.52]) {
        const strutGeo = track(new THREE.BoxGeometry(0.06, 0.40, 0.22));
        const strut = new THREE.Mesh(strutGeo, matteTrimMat);
        strut.position.set(sx, 0.78, -bodyLen * 0.44);
        bodyGroup.add(strut);

        const wingGeo = track(new THREE.BoxGeometry(halfW, 0.07, 0.32));
        const wing = new THREE.Mesh(wingGeo, wingMat);
        wing.position.set(sx > 0 ? halfW * 0.5 + 0.08 : -halfW * 0.5 - 0.08, 0.98, -bodyLen * 0.46);
        wing.castShadow = true;
        bodyGroup.add(wing);
      }
      rearWingFlap = null;
    } else if (isStreetCar) {
      // === Production Track Coupes & Supercars: Subtle lip spoiler, NO giant wings, dual exhausts ===
      const lipGeo = track(new THREE.BoxGeometry(bodyWidth * 0.78, 0.05, 0.12));
      const lipMesh = new THREE.Mesh(lipGeo, livery.carbonWing ? carbonMat : secondaryMat);
      lipMesh.position.set(0, 0.68, -bodyLen * 0.48);
      bodyGroup.add(lipMesh);

      // Dual Street Exhaust Tips
      const exGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10));
      exGeo.rotateX(Math.PI / 2);
      [-0.32, 0.32].forEach((ex) => {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.24, -bodyLen * 0.51);
        bodyGroup.add(exhaust);
      });
    } else {
      // === Standard High-Downforce Race Wing (Hypercar, LMP2, GT3) ===
      const isSwanNeck = isGT3;
      const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
      const strutHeight = isSwanNeck ? 0.44 : 0.38;
      const strutGeo = track(new THREE.BoxGeometry(0.07, strutHeight, 0.24));
      for (const sx of [-0.52, 0.52]) {
        const strut = new THREE.Mesh(strutGeo, matteTrimMat);
        strut.position.set(sx, 0.78, -bodyLen * 0.44);
        bodyGroup.add(strut);
      }
      const wingWidth = bodyWidth * (isGT3 ? 1.02 : 0.96);
      const wingGeo = track(new THREE.BoxGeometry(wingWidth, 0.07, 0.34));
      const wingMesh = new THREE.Mesh(wingGeo, wingMat);
      wingMesh.position.set(0, 0.98, -bodyLen * 0.46);
      wingMesh.castShadow = true;
      bodyGroup.add(wingMesh);
      rearWingFlap = wingMesh;

      // Wing Endplates
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
      leftPlate.position.set(-bodyWidth * 0.555, 0.48, 0.05);
      bodyGroup.add(leftPlate);

      const rightPlate = new THREE.Mesh(doorPlateGeo, plateMat);
      rightPlate.rotation.y = Math.PI / 2;
      rightPlate.position.set(bodyWidth * 0.555, 0.48, 0.05);
      bodyGroup.add(rightPlate);
    }

    // Headlights & Taillights
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

    // Open-wheel suspension wishbones linking chassis to wheel hubs
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
    rearWingFlap,
    headlightMats,
    brakeLightMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
