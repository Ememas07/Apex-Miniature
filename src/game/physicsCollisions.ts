import { getRealWorldCarDimensions } from './cars';
import type { CarSimState } from './physics';
import { CarClassId, LocalizedDamageState } from './types';

export const SPEED_KMH_FACTOR = 3.6;

export function createInitialLocalizedDamage(): LocalizedDamageState {
  return {
    frontWing: 0,
    rearWing: 0,
    engine: 0,
    suspension: 0,
    suspensionPullDir: 0,
    headlightBroken: false,
    frontWingDetached: false,
    rearWingDetached: false,
  };
}

/**
 * Resolves car contact against barriers, guardrails and invisible pit walls:
 * 1. Depenetration: pushes car out of wall collision normal (normal * depth + 0.05m) every frame
 * 2. Tangent wall-damping: dt-normalized heavy barrier scraping friction + normal-impact scrub and low restitution (0.10) so cars lose speed noticeably instead of sliding cleanly along walls
 * 3. Outward yaw alignment toward wall tangent so car glances off smoothly instead of sticking dead
 * 4. Damage: ignores impacts < 25 km/h (0 damage); heavy impacts accumulated at 0.25x rate with 0.5s cooldown
 */
export function resolveWallContact(
  car: CarSimState,
  sample: { nx: number; nz: number; tx: number; tz: number },
  wallLat: number,
  side: 1 | -1, // 1 = car struck right wall (+lateral), -1 = car struck left wall (-lateral)
  dt: number,
): void {
  const penetration = side === 1 ? car.lateralOffset - wallLat : wallLat - car.lateralOffset;
  if (penetration <= 0) return;

  // Depenetration: push car out along collision normal (-side * n)
  const pushDist = penetration + 0.05;
  car.x -= sample.nx * (side * pushDist);
  car.z -= sample.nz * (side * pushDist);
  car.lateralOffset = side === 1 ? wallLat - 0.05 : wallLat + 0.05;

  // Heavy dt-normalized barrier friction + normal-impact scrub and low restitution (0.10)
  // Consistent across browser 60Hz (dt=1/60) and headlessEnv 120Hz substeps (dt=1/120)
  const vNorm = side * (car.vx * sample.nx + car.vz * sample.nz);
  const vTan = car.vx * sample.tx + car.vz * sample.tz;

  const scrapeRetention = Math.exp(-8.5 * Math.max(dt, 1 / 240));
  const impactRetention = Math.max(0.74, 1.0 - Math.max(0, vNorm - 3.0) * 0.016);
  const vSlide = vTan * scrapeRetention * impactRetention;
  const vBounce = vNorm > 0 ? -0.10 * vNorm : 0;

  car.vx = vSlide * sample.tx + (side * vBounce) * sample.nx;
  car.vz = vSlide * sample.tz + (side * vBounce) * sample.nz;
  car.speed = Math.max(0, Math.min(car.speed, Math.abs(vSlide)));
  car.yawRate = (car.yawRate ?? 0) * 0.15;

  // Outward yaw alignment toward wall tangent so car glances off instead of pinning
  const wallHeading = Math.atan2(sample.tx, sample.tz);
  let headingDiff = wallHeading - car.heading;
  while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
  while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
  car.heading += headingDiff * Math.min(1.0, dt * 10.5);

  // Collision damage threshold & cooldown:
  // Ignore low-speed grazing impacts below 25 km/h (6.944 m/s) -> 0 damage
  const impactSpeed = Math.max(0, vNorm);
  const DAMAGE_THRESHOLD_SPEED = 25 / SPEED_KMH_FACTOR; // 6.944 m/s
  if (impactSpeed >= DAMAGE_THRESHOLD_SPEED && (!car.wallCollisionCooldown || car.wallCollisionCooldown <= 0)) {
    const heavyDmg = Math.min(5.0, (impactSpeed - DAMAGE_THRESHOLD_SPEED) * 0.25);
    const noseAngle = Math.abs(headingDiff);
    const zone: 'front' | 'side' | 'rear' =
      noseAngle > 0.45 ? 'front' : noseAngle > 2.3 ? 'rear' : 'side';
    applyLocalizedImpactDamage(car, zone, heavyDmg, impactSpeed, side);
    car.wallCollisionCooldown = 0.5;
    car.lastWallImpact = Math.max(car.lastWallImpact ?? 0, impactSpeed);
  }
}

/**
 * Applies localized damage to front wing, rear wing, engine, and suspension while keeping
 * aggregate `car.aeroDamage` synced and respecting `car.damageLevel` ('off' | 'visual-only' | 'light' | 'realistic').
 */
export function applyLocalizedImpactDamage(
  car: CarSimState,
  zone: 'front' | 'rear' | 'side',
  baseDmg: number,
  impactSpeedMs: number,
  lateralSide: number = 0,
): void {
  const level = car.damageLevel ?? 'light';
  if (level === 'off') return;
  if (!car.damage) car.damage = createInitialLocalizedDamage();

  const scale = level === 'realistic' ? 1.85 : level === 'visual-only' ? 0.65 : 1.0;
  const scaled = Math.min(18.0, baseDmg * scale);
  const d = car.damage;

  if (zone === 'front') {
    d.frontWing = Math.min(100, d.frontWing + scaled * 1.45);
    d.engine = Math.min(100, d.engine + scaled * 0.35);
    d.suspension = Math.min(100, d.suspension + scaled * 0.30);
    if (impactSpeedMs > 12.0 || d.frontWing > 32) {
      d.headlightBroken = true;
    }
    if (d.frontWing > 58) {
      d.frontWingDetached = true;
    }
  } else if (zone === 'rear') {
    d.rearWing = Math.min(100, d.rearWing + scaled * 1.45);
    d.engine = Math.min(100, d.engine + scaled * 0.55);
    if (d.rearWing > 58) {
      d.rearWingDetached = true;
    }
  } else {
    d.suspension = Math.min(100, d.suspension + scaled * 1.35);
    d.frontWing = Math.min(100, d.frontWing + scaled * 0.45);
    d.rearWing = Math.min(100, d.rearWing + scaled * 0.35);
    if (lateralSide !== 0) {
      d.suspensionPullDir = Math.max(-1, Math.min(1, d.suspensionPullDir + Math.sign(lateralSide) * 0.25));
    }
  }

  // Emit visual carbon debris particle cue on meaningful impacts
  if (impactSpeedMs > 8.5) {
    car.debrisBurstIntensity = Math.min(1, Math.max(car.debrisBurstIntensity ?? 0, (impactSpeedMs - 7.0) / 14.0));
  }

  // Sync aggregate aeroDamage for HUD/legacy consumers (0 performance impact in visual-only mode handled in stepCarPhysics)
  car.aeroDamage = Math.min(100, car.aeroDamage + (level === 'realistic' ? baseDmg * 1.6 : baseDmg));
}

export const CAR_COLLISION_CONSTANTS = {
  BASE_RESTITUTION: 0.08,
  BUMP_DRAFT_RESTITUTION: 0.0,
  BUMP_DRAFT_MAX_CLOSING_SPEED: 8.0, // m/s (~29 km/h)
  BUMP_DRAFT_MIN_HEADING_DOT: 0.88,
  BUMP_DRAFT_MIN_NORMAL_DOT: 0.78,
  BUMP_DRAFT_MIN_FORWARD_SPEED: 5.0,
  TANGENTIAL_FRICTION_MU: 0.20,
  PENETRATION_SLOP: 0.015,
  BUMP_DRAFT_SLOP: 0.03,
  POSITION_CORRECTION_PERCENT: 0.72,
  BUMP_DRAFT_CORRECTION_PERCENT: 0.45,
  MAX_POSITION_CORRECTION_PER_STEP: 0.25,
  MAX_LINEAR_DV_PER_STEP: 14.0,
  MAX_ANGULAR_DW_PER_STEP: 2.6,
  MAX_YAW_RATE: 4.5,
  DAMAGE_THRESHOLD_SPEED: 25 / SPEED_KMH_FACTOR, // 6.944 m/s (25 km/h)
} as const;

interface CarCollisionBody {
  x: number;
  z: number;
  fwdX: number;
  fwdZ: number;
  rightX: number;
  rightZ: number;
  halfW: number;
  halfL: number;
  mass: number;
  invMass: number;
  invInertia: number;
}

interface ObbContactManifold {
  nx: number;
  nz: number;
  penetration: number;
  cx: number;
  cz: number;
}

function getCarCollisionMassKg(classId: CarClassId): number {
  switch (classId) {
    case CarClassId.F1_2026:
    case CarClassId.F1_2021:
      return 798;
    case CarClassId.F1_2005:
      return 720;
    case CarClassId.HYPERCAR_GTP:
      return 1030;
    case CarClassId.LMP2:
      return 930;
    case CarClassId.GT3:
      return 1300;
    case CarClassId.GT4:
      return 1420;
    case CarClassId.FORMULA_E:
      return 860;
    case CarClassId.TRACK_COUPE:
      return 1450;
    default:
      return 1400;
  }
}

function getCarCollisionBody(car: CarSimState): CarCollisionBody {
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const dims = car.carSpec.dimensions ?? getRealWorldCarDimensions(car.carSpec.id, car.carSpec.classId);
  const halfW = Math.max(0.85, Math.min(1.15, (dims.width ?? 1.98) * 0.48));
  const halfL = Math.max(2.0, Math.min(2.9, (dims.length ?? 4.75) * 0.485));
  const wheelbase = Math.max(2.4, Math.min(3.7, dims.wheelbase ?? 2.8));
  const mass = getCarCollisionMassKg(car.carSpec.classId);
  const isGTP = car.carSpec.classId === CarClassId.HYPERCAR_GTP || car.carSpec.classId === CarClassId.LMP2;
  const inertia = (isGTP ? 0.19 : 0.20) * mass * wheelbase * wheelbase;

  return {
    x: car.x,
    z: car.z,
    fwdX: sinH,
    fwdZ: cosH,
    rightX: -cosH,
    rightZ: sinH,
    halfW,
    halfL,
    mass,
    invMass: 1 / mass,
    invInertia: 1 / Math.max(400, inertia),
  };
}

function projectObbRadius(body: CarCollisionBody, ax: number, az: number): number {
  return (
    Math.abs(body.rightX * ax + body.rightZ * az) * body.halfW +
    Math.abs(body.fwdX * ax + body.fwdZ * az) * body.halfL
  );
}

/**
 * 2D Sutherland-Hodgman clip of segment (p0, p1) against half-space dot(p, n) <= limit.
 */
function clipSegmentToHalfSpace(
  p0x: number,
  p0z: number,
  p1x: number,
  p1z: number,
  nx: number,
  nz: number,
  limit: number,
): Array<{ x: number; z: number }> {
  const d0 = p0x * nx + p0z * nz - limit;
  const d1 = p1x * nx + p1z * nz - limit;
  const out: Array<{ x: number; z: number }> = [];

  if (d0 <= 0) out.push({ x: p0x, z: p0z });
  if (d1 <= 0) out.push({ x: p1x, z: p1z });

  if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
    const t = d0 / (d0 - d1);
    out.push({
      x: p0x + t * (p1x - p0x),
      z: p0z + t * (p1z - p0z),
    });
  }
  return out;
}

/**
 * 4-axis SAT OBB overlap test + clipped contact manifold point computation.
 * Normal (nx, nz) always points from body A toward body B.
 */
function computeObbCollision(a: CarCollisionBody, b: CarCollisionBody): ObbContactManifold | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;

  // 4 SAT axes: 0 = A.right, 1 = A.fwd, 2 = B.right, 3 = B.fwd
  const axesX = [a.rightX, a.fwdX, b.rightX, b.fwdX];
  const axesZ = [a.rightZ, a.fwdZ, b.rightZ, b.fwdZ];

  let minOverlap = Infinity;
  let bestAxisIndex = 0;
  let bestNx = 1;
  let bestNz = 0;

  for (let i = 0; i < 4; i++) {
    let ax = axesX[i];
    let az = axesZ[i];
    const centerProj = dx * ax + dz * az;
    const ra = projectObbRadius(a, ax, az);
    const rb = projectObbRadius(b, ax, az);
    const overlap = ra + rb - Math.abs(centerProj);
    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxisIndex = i;
      if (centerProj < 0) {
        ax = -ax;
        az = -az;
      }
      bestNx = ax;
      bestNz = az;
    }
  }

  // Reference body owns bestAxisIndex; incident body is the other
  const refIsA = bestAxisIndex < 2;
  const ref = refIsA ? a : b;
  const inc = refIsA ? b : a;
  const refAlongRight = bestAxisIndex === 0 || bestAxisIndex === 2;

  // Outward normal of the reference face (points from ref toward inc)
  const refNx = refIsA ? bestNx : -bestNx;
  const refNz = refIsA ? bestNz : -bestNz;
  const refExtentN = refAlongRight ? ref.halfW : ref.halfL;
  const refTx = refAlongRight ? ref.fwdX : ref.rightX;
  const refTz = refAlongRight ? ref.fwdZ : ref.rightZ;
  const refExtentT = refAlongRight ? ref.halfL : ref.halfW;

  const refFaceCx = ref.x + refNx * refExtentN;
  const refFaceCz = ref.z + refNz * refExtentN;

  // Find the incident face whose outward normal is most anti-parallel to refN
  const incNormals = [
    { nx: inc.rightX, nz: inc.rightZ, extN: inc.halfW, tx: inc.fwdX, tz: inc.fwdZ, extT: inc.halfL },
    { nx: -inc.rightX, nz: -inc.rightZ, extN: inc.halfW, tx: inc.fwdX, tz: inc.fwdZ, extT: inc.halfL },
    { nx: inc.fwdX, nz: inc.fwdZ, extN: inc.halfL, tx: inc.rightX, tz: inc.rightZ, extT: inc.halfW },
    { nx: -inc.fwdX, nz: -inc.fwdZ, extN: inc.halfL, tx: inc.rightX, tz: inc.rightZ, extT: inc.halfW },
  ];

  let incFace = incNormals[0];
  let minDot = Infinity;
  for (let i = 0; i < 4; i++) {
    const dot = incNormals[i].nx * refNx + incNormals[i].nz * refNz;
    if (dot < minDot) {
      minDot = dot;
      incFace = incNormals[i];
    }
  }

  const incCx = inc.x + incFace.nx * incFace.extN;
  const incCz = inc.z + incFace.nz * incFace.extN;
  let seg = [
    { x: incCx - incFace.tx * incFace.extT, z: incCz - incFace.tz * incFace.extT },
    { x: incCx + incFace.tx * incFace.extT, z: incCz + incFace.tz * incFace.extT },
  ];

  // Clip incident edge against both side planes of the reference face
  const sidePosLimit = refFaceCx * refTx + refFaceCz * refTz + refExtentT;
  const sideNegLimit = -(refFaceCx * refTx + refFaceCz * refTz) + refExtentT;

  seg = clipSegmentToHalfSpace(seg[0].x, seg[0].z, seg[1].x, seg[1].z, refTx, refTz, sidePosLimit);
  if (seg.length >= 2) {
    seg = clipSegmentToHalfSpace(seg[0].x, seg[0].z, seg[1].x, seg[1].z, -refTx, -refTz, sideNegLimit);
  }

  // Keep points penetrating (behind or on) the reference face plane
  const refPlaneOffset = refFaceCx * refNx + refFaceCz * refNz;
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (let i = 0; i < seg.length; i++) {
    const sep = seg[i].x * refNx + seg[i].z * refNz - refPlaneOffset;
    if (sep <= 0.025) {
      sumX += seg[i].x;
      sumZ += seg[i].z;
      count++;
    }
  }

  const cx = count > 0 ? sumX / count : 0.5 * (a.x + b.x);
  const cz = count > 0 ? sumZ / count : 0.5 * (a.z + b.z);

  return {
    nx: bestNx,
    nz: bestNz,
    penetration: minOverlap,
    cx,
    cz,
  };
}

function recordAvoidablePuntStewarding(offender: CarSimState, closingSpeed: number): void {
  offender.warningCount += 1;
  offender.penaltyReason = 'avoidable-contact';
  offender.lastAvoidableContactImpact = Math.max(offender.lastAvoidableContactImpact ?? 0, closingSpeed);
  if (offender.warningCount >= 3) {
    offender.penaltyType = 'time-penalty';
    offender.postRacePenaltySeconds = (offender.postRacePenaltySeconds ?? 0) + 5;
  }
}

/**
 * Resolves car-to-car collisions with 2D rigid-body OBB impulse physics:
 * 1. 4-axis SAT OBB overlap + clipped contact manifold point (lever arms rA, rB)
 * 2. Low-restitution (0.08) mass-weighted linear impulse & lever-arm yaw torque (PIT maneuvers)
 * 3. Bump-drafting detection: aligned low-closing-speed nose-to-tail drops restitution to 0.0 with gentle slop
 * 4. Clamped Coulomb tangential rubbing friction (mu = 0.20)
 * 5. Strictly separate positional depenetration & anti-fling linear/angular impulse clamps
 */
export function resolveCarCollisions(cars: CarSimState[]): number {
  let maxImpact = 0;
  const C = CAR_COLLISION_CONSTANTS;
  for (let i = 0; i < cars.length; i++) {
    cars[i].lastCollisionImpact = 0;
  }

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (
        a.pitStopRemaining > 0 ||
        b.pitStopRemaining > 0 ||
        (a.spawnGhostTimer ?? 0) > 0 ||
        (b.spawnGhostTimer ?? 0) > 0
      ) {
        continue;
      }

      // Quick broadphase reject (> 6.5m center distance cannot touch)
      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      if (cdx * cdx + cdz * cdz > 42.25) continue;

      const bodyA = getCarCollisionBody(a);
      const bodyB = getCarCollisionBody(b);
      const manifold = computeObbCollision(bodyA, bodyB);
      if (!manifold) continue;

      const { nx, nz, penetration, cx, cz } = manifold;
      const invMassSum = bodyA.invMass + bodyB.invMass;

      // Lever arms from each car's center of mass to contact point
      const rAx = cx - a.x;
      const rAz = cz - a.z;
      const rBx = cx - b.x;
      const rBz = cz - b.z;

      const yawA = a.yawRate ?? 0;
      const yawB = b.yawRate ?? 0;

      // Contact-point velocities: v_p = v + omega x r (omega = (0, yawRate, 0))
      const vApX = a.vx + yawA * rAz;
      const vApZ = a.vz - yawA * rAx;
      const vBpX = b.vx + yawB * rBz;
      const vBpZ = b.vz - yawB * rBx;

      const relVx = vBpX - vApX;
      const relVz = vBpZ - vApZ;
      const relVNorm = relVx * nx + relVz * nz;
      const closingSpeed = Math.max(0, -relVNorm);

      // Detect bump-drafting: aligned headings, nose-to-tail normal, low relative closing speed
      const headingDot = bodyA.fwdX * bodyB.fwdX + bodyA.fwdZ * bodyB.fwdZ;
      const avgFwdLen = Math.hypot(bodyA.fwdX + bodyB.fwdX, bodyA.fwdZ + bodyB.fwdZ);
      const avgFwdX = avgFwdLen > 1e-4 ? (bodyA.fwdX + bodyB.fwdX) / avgFwdLen : bodyA.fwdX;
      const avgFwdZ = avgFwdLen > 1e-4 ? (bodyA.fwdZ + bodyB.fwdZ) / avgFwdLen : bodyA.fwdZ;
      const normalAlongHeading = Math.abs(nx * avgFwdX + nz * avgFwdZ);
      const aFwdSpd = a.vx * bodyA.fwdX + a.vz * bodyA.fwdZ;
      const bFwdSpd = b.vx * bodyB.fwdX + b.vz * bodyB.fwdZ;

      const isBumpDraft =
        headingDot >= C.BUMP_DRAFT_MIN_HEADING_DOT &&
        normalAlongHeading >= C.BUMP_DRAFT_MIN_NORMAL_DOT &&
        closingSpeed <= C.BUMP_DRAFT_MAX_CLOSING_SPEED &&
        aFwdSpd >= C.BUMP_DRAFT_MIN_FORWARD_SPEED &&
        bFwdSpd >= C.BUMP_DRAFT_MIN_FORWARD_SPEED;

      // 1. Pure positional depenetration (strictly separate from velocity impulse)
      const slop = isBumpDraft ? C.BUMP_DRAFT_SLOP : C.PENETRATION_SLOP;
      const posPct = isBumpDraft ? C.BUMP_DRAFT_CORRECTION_PERCENT : C.POSITION_CORRECTION_PERCENT;
      const corrMag = Math.min(
        C.MAX_POSITION_CORRECTION_PER_STEP,
        Math.max(0, penetration - slop) * posPct,
      );
      if (corrMag > 0) {
        const shareA = bodyA.invMass / invMassSum;
        const shareB = bodyB.invMass / invMassSum;
        a.x -= nx * corrMag * shareA;
        a.z -= nz * corrMag * shareA;
        b.x += nx * corrMag * shareB;
        b.z += nz * corrMag * shareB;
      }

      // 2. Mass-weighted normal impulse with rotational lever-arm torque
      let jN = 0;
      const maxInvMass = Math.max(bodyA.invMass, bodyB.invMass);
      const maxLinearImpulse = C.MAX_LINEAR_DV_PER_STEP / maxInvMass;

      if (relVNorm < 0) {
        const restitution = isBumpDraft ? C.BUMP_DRAFT_RESTITUTION : C.BASE_RESTITUTION;
        // 2D cross product (r x n)_y = r.z * n.x - r.x * n.z
        const rACrossN = rAz * nx - rAx * nz;
        const rBCrossN = rBz * nx - rBx * nz;
        const denomN =
          invMassSum +
          rACrossN * rACrossN * bodyA.invInertia +
          rBCrossN * rBCrossN * bodyB.invInertia;

        if (denomN > 1e-6) {
          jN = (-(1 + restitution) * relVNorm) / denomN;
          jN = Math.max(0, Math.min(maxLinearImpulse, jN));

          const jNx = jN * nx;
          const jNz = jN * nz;

          a.vx -= jNx * bodyA.invMass;
          a.vz -= jNz * bodyA.invMass;
          b.vx += jNx * bodyB.invMass;
          b.vz += jNz * bodyB.invMass;

          const dYawA = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP, (-rACrossN * jN) * bodyA.invInertia),
          );
          const dYawB = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP, (rBCrossN * jN) * bodyB.invInertia),
          );
          a.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, yawA + dYawA));
          b.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, yawB + dYawB));
        }
      }

      // 3. Clamped Coulomb tangential friction (door-to-door rubbing + rotational shear)
      if (jN > 0) {
        const tx = -nz;
        const tz = nx;
        const curYawA = a.yawRate ?? 0;
        const curYawB = b.yawRate ?? 0;
        const vApX2 = a.vx + curYawA * rAz;
        const vApZ2 = a.vz - curYawA * rAx;
        const vBpX2 = b.vx + curYawB * rBz;
        const vBpZ2 = b.vz - curYawB * rBx;
        const relVTan = (vBpX2 - vApX2) * tx + (vBpZ2 - vApZ2) * tz;

        const rACrossT = rAz * tx - rAx * tz;
        const rBCrossT = rBz * tx - rBx * tz;
        const denomT =
          invMassSum +
          rACrossT * rACrossT * bodyA.invInertia +
          rBCrossT * rBCrossT * bodyB.invInertia;

        if (denomT > 1e-6 && Math.abs(relVTan) > 1e-4) {
          const maxFriction = Math.min(C.TANGENTIAL_FRICTION_MU * jN, maxLinearImpulse * 0.5);
          const jT = Math.max(-maxFriction, Math.min(maxFriction, -relVTan / denomT));
          const jTx = jT * tx;
          const jTz = jT * tz;

          a.vx -= jTx * bodyA.invMass;
          a.vz -= jTz * bodyA.invMass;
          b.vx += jTx * bodyB.invMass;
          b.vz += jTz * bodyB.invMass;

          const dYawTanA = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP * 0.5,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP * 0.5, (-rACrossT * jT) * bodyA.invInertia),
          );
          const dYawTanB = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP * 0.5,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP * 0.5, (rBCrossT * jT) * bodyB.invInertia),
          );
          a.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, curYawA + dYawTanA));
          b.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, curYawB + dYawTanB));
        }
      }

      // 4. Sync longitudinal speed scalar along each car's heading (never convert sideways impact into forward speed)
      const aProj = a.vx * bodyA.fwdX + a.vz * bodyA.fwdZ;
      const bProj = b.vx * bodyB.fwdX + b.vz * bodyB.fwdZ;
      a.speed = Math.max(0, a.gear === -1 ? -aProj : aProj);
      b.speed = Math.max(0, b.gear === -1 ? -bProj : bProj);

      // 5. Localized damage only above 25 km/h closing speed, capped at 3.5% per contact (light default)
      if (closingSpeed >= C.DAMAGE_THRESHOLD_SPEED) {
        maxImpact = Math.max(maxImpact, closingSpeed);
        a.lastCollisionImpact = Math.max(a.lastCollisionImpact ?? 0, closingSpeed);
        b.lastCollisionImpact = Math.max(b.lastCollisionImpact ?? 0, closingSpeed);
        const dmg = Math.min(3.5, (closingSpeed - C.DAMAGE_THRESHOLD_SPEED) * 0.25);

        // Determine hit zone on A and B using contact lever arm projected onto each car's heading
        const aLocalFwd = rAx * bodyA.fwdX + rAz * bodyA.fwdZ;
        const aLocalLat = rAx * (-bodyA.fwdZ) + rAz * bodyA.fwdX;
        const zoneA: 'front' | 'rear' | 'side' =
          aLocalFwd > bodyA.halfL * 0.45 ? 'front' : aLocalFwd < -bodyA.halfL * 0.45 ? 'rear' : 'side';

        const bLocalFwd = rBx * bodyB.fwdX + rBz * bodyB.fwdZ;
        const bLocalLat = rBx * (-bodyB.fwdZ) + rBz * bodyB.fwdX;
        const zoneB: 'front' | 'rear' | 'side' =
          bLocalFwd > bodyB.halfL * 0.45 ? 'front' : bLocalFwd < -bodyB.halfL * 0.45 ? 'rear' : 'side';

        applyLocalizedImpactDamage(a, zoneA, dmg, closingSpeed, aLocalLat);
        applyLocalizedImpactDamage(b, zoneB, dmg, closingSpeed, bLocalLat);

        // Avoidable-contact stewarding: rear-ending another car at high closing speed triggers warning/penalty
        if (closingSpeed > 12.5 && !isBumpDraft) {
          if (zoneA === 'front' && zoneB === 'rear') {
            recordAvoidablePuntStewarding(a, closingSpeed);
          } else if (zoneB === 'front' && zoneA === 'rear') {
            recordAvoidablePuntStewarding(b, closingSpeed);
          }
        }
      }
    }
  }
  return maxImpact;
}
