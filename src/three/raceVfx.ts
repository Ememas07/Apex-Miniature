import * as THREE from 'three';
import { ParticleDensitySetting, RacingLineMode } from '../game/settings';
import { CompiledTrack } from '../game/tracks';

export type VfxParticleType =
  | 'smoke'
  | 'spray'
  | 'dust'
  | 'spark'
  | 'flame'
  | 'mecachrome';

export interface RacingLineColors {
  racingLineFast: number;
  racingLineCoast: number;
  racingLineBrake: number;
}

export interface VfxFocusAnchor {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  inSlipstream?: boolean;
}

interface ParticleSlot {
  active: boolean;
  type: VfxParticleType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  startSize: number;
  endSize: number;
  colorHex: number;
  gravity: number;
  drag: number;
}

const MAX_PARTICLES = 520;
const MAX_SKIDMARKS = 280;
const RAIN_STREAK_COUNT = 160;
const SLIPSTREAM_STREAK_COUNT = 20;

const DENSITY_LIMITS: Record<ParticleDensitySetting, number> = {
  off: 0,
  low: 140,
  medium: 320,
  high: MAX_PARTICLES,
};

export class RaceVfxManager {
  public readonly root: THREE.Group;

  private density: ParticleDensitySetting;
  private maxActiveParticles: number;

  // Particle instanced pool
  private readonly particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private readonly particleGeo: THREE.BufferGeometry;
  private readonly particleMat: THREE.MeshBasicMaterial;
  private readonly particleMesh: THREE.InstancedMesh;

  // Skidmark instanced pool
  private skidCursor = 0;
  private skidCount = 0;
  private readonly skidGeo: THREE.BufferGeometry;
  private readonly skidMat: THREE.MeshBasicMaterial;
  private readonly skidMesh: THREE.InstancedMesh;

  // Rain streaks
  private readonly rainGeo: THREE.BufferGeometry;
  private readonly rainMat: THREE.LineBasicMaterial;
  private readonly rainLines: THREE.LineSegments;
  private readonly rainPositions: Float32Array;
  private readonly rainSeeds: Float32Array;

  // Slipstream aero streaks
  private readonly slipGeo: THREE.BufferGeometry;
  private readonly slipMat: THREE.LineBasicMaterial;
  private readonly slipLines: THREE.LineSegments;
  private readonly slipPositions: Float32Array;
  private slipPhase = 0;

  // 3D Dynamic Racing Line
  private racingLineMesh: THREE.Mesh | null = null;
  private racingLineCacheKey = '';

  // Reusable scratch objects (zero per-frame GC)
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  constructor(density: ParticleDensitySetting = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'RaceVfxRoot';
    this.density = density;
    this.maxActiveParticles = DENSITY_LIMITS[density] ?? MAX_PARTICLES;

    // 1. Particle pool
    this.particleGeo = new THREE.IcosahedronGeometry(0.5, 0);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_PARTICLES,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.root.add(this.particleMesh);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        type: 'smoke',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 0.5,
        startSize: 0.3,
        endSize: 1.0,
        colorHex: 0xffffff,
        gravity: 0,
        drag: 1.5,
      });
    }

    // 2. Skidmark decal pool (pair of left/right tire marks per entry)
    this.skidGeo = new THREE.PlaneGeometry(0.32, 1.45);
    this.skidGeo.rotateX(-Math.PI / 2);
    this.skidMat = new THREE.MeshBasicMaterial({
      color: 0x111317,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(
      this.skidGeo,
      this.skidMat,
      MAX_SKIDMARKS,
    );
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skidMesh.frustumCulled = false;
    this.skidMesh.count = 0;
    this.root.add(this.skidMesh);

    // 3. Rain streak lines
    this.rainPositions = new Float32Array(RAIN_STREAK_COUNT * 6);
    this.rainSeeds = new Float32Array(RAIN_STREAK_COUNT * 4);
    for (let i = 0; i < RAIN_STREAK_COUNT; i++) {
      this.rainSeeds[i * 4 + 0] = (Math.random() - 0.5) * 48;
      this.rainSeeds[i * 4 + 1] = Math.random() * 18;
      this.rainSeeds[i * 4 + 2] = (Math.random() - 0.5) * 48;
      this.rainSeeds[i * 4 + 3] = 22 + Math.random() * 12;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.root.add(this.rainLines);

    // 4. Slipstream aero streaks
    this.slipPositions = new Float32Array(SLIPSTREAM_STREAK_COUNT * 6);
    this.slipGeo = new THREE.BufferGeometry();
    this.slipGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.slipPositions, 3),
    );
    this.slipMat = new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.slipLines = new THREE.LineSegments(this.slipGeo, this.slipMat);
    this.slipLines.frustumCulled = false;
    this.slipLines.visible = false;
    this.root.add(this.slipLines);
  }

  public setDensity(density: ParticleDensitySetting): void {
    this.density = density;
    this.maxActiveParticles = DENSITY_LIMITS[density] ?? MAX_PARTICLES;
    if (this.maxActiveParticles === 0) {
      for (const p of this.particles) p.active = false;
      this.particleMesh.count = 0;
      this.rainLines.visible = false;
      this.slipLines.visible = false;
    }
  }

  public syncRacingLine(
    compiledTrack: CompiledTrack,
    mode: RacingLineMode,
    wetness = 0,
    colors?: RacingLineColors,
  ): void {
    const fastHex = colors?.racingLineFast ?? 0x22c55e;
    const coastHex = colors?.racingLineCoast ?? 0xf59e0b;
    const brakeHex = colors?.racingLineBrake ?? 0xef4444;
    const wetBucket = Math.round(wetness * 4);
    const cacheKey = `${compiledTrack.spec.id}:${mode}:${wetBucket}:${fastHex}:${coastHex}:${brakeHex}`;

    if (mode === 'off') {
      if (this.racingLineMesh) {
        this.racingLineMesh.visible = false;
      }
      this.racingLineCacheKey = cacheKey;
      return;
    }

    if (this.racingLineMesh && this.racingLineCacheKey === cacheKey) {
      this.racingLineMesh.visible = true;
      return;
    }

    // Dispose previous racing line mesh
    if (this.racingLineMesh) {
      this.root.remove(this.racingLineMesh);
      this.racingLineMesh.geometry.dispose();
      (this.racingLineMesh.material as THREE.Material).dispose();
      this.racingLineMesh = null;
    }

    const samples = compiledTrack.samples;
    const n = samples.length;
    if (n < 6) return;

    const cFast = new THREE.Color(fastHex);
    const cCoast = new THREE.Color(coastHex);
    const cBrake = new THREE.Color(brakeHex);

    // Precompute curvature severity & braking zone lookahead (wetness extends braking zones)
    const lookaheadSteps = Math.max(8, Math.round((14 + wetness * 10) * (n / 480)));
    const severity = new Float32Array(n); // 0 = fast, 0.5 = coast, 1.0 = brake
    for (let i = 0; i < n; i++) {
      let peakAhead = Math.abs(samples[i].curvature);
      for (let k = 1; k <= lookaheadSteps; k++) {
        const idx = (i + k) % n;
        const cAbs = Math.abs(samples[idx].curvature);
        const weight = 1 - (k / (lookaheadSteps + 1)) * 0.35;
        if (cAbs * weight > peakAhead) {
          peakAhead = cAbs * weight;
        }
      }
      // Convert curvature 1/R into normalized braking severity
      const brakeThresh = Math.max(0.012, 0.022 - wetness * 0.005);
      const coastThresh = brakeThresh * 0.48;
      if (peakAhead >= brakeThresh) {
        severity[i] = 1.0;
      } else if (peakAhead >= coastThresh) {
        severity[i] = (peakAhead - coastThresh) / Math.max(1e-5, brakeThresh - coastThresh);
      } else {
        severity[i] = 0;
      }
    }

    const halfRibbonWidth = 0.52;
    const positions: number[] = [];
    const vertColors: number[] = [];
    const tmpCol = new THREE.Color();

    const getCenter = (idx: number) => {
      const s = samples[idx];
      const lat = s.racingLineOffset ?? 0;
      return {
        x: s.x + s.nx * lat,
        y: s.y + 0.08,
        z: s.z + s.nz * lat,
        nx: s.nx,
        nz: s.nz,
      };
    };

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const sevA = severity[i];
      const sevB = severity[j];

      if (mode === 'corners-only' && sevA < 0.15 && sevB < 0.15) {
        continue;
      }

      const pA = getCenter(i);
      const pB = getCenter(j);

      const axL = pA.x - pA.nx * halfRibbonWidth;
      const azL = pA.z - pA.nz * halfRibbonWidth;
      const axR = pA.x + pA.nx * halfRibbonWidth;
      const azR = pA.z + pA.nz * halfRibbonWidth;

      const bxL = pB.x - pB.nx * halfRibbonWidth;
      const bzL = pB.z - pB.nz * halfRibbonWidth;
      const bxR = pB.x + pB.nx * halfRibbonWidth;
      const bzR = pB.z + pB.nz * halfRibbonWidth;

      const evalColor = (sev: number) => {
        if (sev <= 0.5) {
          tmpCol.copy(cFast).lerp(cCoast, sev * 2);
        } else {
          tmpCol.copy(cCoast).lerp(cBrake, (sev - 0.5) * 2);
        }
        return [tmpCol.r, tmpCol.g, tmpCol.b] as const;
      };

      const colA = evalColor(sevA);
      const colB = evalColor(sevB);

      // Two triangles forming the quad
      positions.push(
        axL, pA.y, azL,
        axR, pA.y, azR,
        bxR, pB.y, bzR,
        axL, pA.y, azL,
        bxR, pB.y, bzR,
        bxL, pB.y, bzL,
      );
      vertColors.push(
        colA[0], colA[1], colA[2],
        colA[0], colA[1], colA[2],
        colB[0], colB[1], colB[2],
        colA[0], colA[1], colA[2],
        colB[0], colB[1], colB[2],
        colB[0], colB[1], colB[2],
      );
    }

    if (positions.length === 0) {
      this.racingLineCacheKey = cacheKey;
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(vertColors, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });

    this.racingLineMesh = new THREE.Mesh(geo, mat);
    this.racingLineMesh.frustumCulled = false;
    this.racingLineMesh.renderOrder = 2;
    this.root.add(this.racingLineMesh);
    this.racingLineCacheKey = cacheKey;
  }

  public spawnParticle(
    type: VfxParticleType | string,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    startSize: number,
    endSize: number,
    colorHex: number,
  ): void {
    if (this.maxActiveParticles <= 0) return;

    const slot = this.particles[this.particleCursor % this.maxActiveParticles];
    this.particleCursor = (this.particleCursor + 1) % this.maxActiveParticles;

    const pType = (type as VfxParticleType) || 'smoke';
    slot.active = true;
    slot.type = pType;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.age = 0;
    slot.life = Math.max(0.05, life);
    slot.startSize = Math.max(0.04, startSize);
    slot.endSize = Math.max(0.02, endSize);
    slot.colorHex = colorHex;
    slot.gravity = pType === 'spark' ? -14.5 : pType === 'spray' ? -4.2 : pType === 'dust' ? -2.0 : 0.4;
    slot.drag = pType === 'spark' ? 0.8 : pType === 'flame' ? 2.5 : 1.6;
  }

  public spawnExhaustBackfire(
    x: number,
    y: number,
    z: number,
    heading: number,
    isBlueFlame = true,
  ): void {
    if (this.maxActiveParticles <= 0) return;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const ex = x - sinH * 2.05;
    const ey = y + 0.34;
    const ez = z - cosH * 2.05;
    const primaryCol = isBlueFlame ? 0x38bdf8 : 0xf97316;
    const coreCol = isBlueFlame ? 0xe0f2fe : 0xfef08a;

    this.spawnParticle(
      'flame',
      ex,
      ey,
      ez,
      -sinH * 6.5 + (Math.random() - 0.5) * 0.8,
      0.35,
      -cosH * 6.5 + (Math.random() - 0.5) * 0.8,
      0.13,
      0.26,
      0.06,
      primaryCol,
    );
    this.spawnParticle(
      'flame',
      ex - sinH * 0.25,
      ey,
      ez - cosH * 0.25,
      -sinH * 9.0,
      0.2,
      -cosH * 9.0,
      0.09,
      0.16,
      0.04,
      coreCol,
    );
  }

  public spawnFloorSparks(
    x: number,
    y: number,
    z: number,
    heading: number,
    speed: number,
    count = 3,
  ): void {
    if (this.maxActiveParticles <= 0) return;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const scaledCount =
      this.density === 'low' ? Math.max(1, Math.floor(count * 0.5)) : count;

    for (let i = 0; i < scaledCount; i++) {
      const lateral = (Math.random() - 0.5) * 1.1;
      const sx = x - sinH * 1.4 + cosH * lateral;
      const sz = z - cosH * 1.4 - sinH * lateral;
      const kick = Math.max(8, speed * 0.32);
      this.spawnParticle(
        'spark',
        sx,
        y + 0.1,
        sz,
        -sinH * kick + (Math.random() - 0.5) * 4.5,
        1.8 + Math.random() * 2.6,
        -cosH * kick + (Math.random() - 0.5) * 4.5,
        0.22 + Math.random() * 0.16,
        0.13,
        0.02,
        Math.random() < 0.45 ? 0xfef08a : 0xfb923c,
      );
    }
  }

  public addSkidmark(
    x: number,
    y: number,
    z: number,
    heading: number,
    trackWidthMeters = 1.4,
  ): void {
    if (this.density === 'off') return;
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    const halfTrack = trackWidthMeters * 0.5;

    for (const side of [-1, 1]) {
      const idx = this.skidCursor % MAX_SKIDMARKS;
      this.skidCursor = (this.skidCursor + 1) % MAX_SKIDMARKS;
      this.skidCount = Math.min(MAX_SKIDMARKS, this.skidCount + 1);

      this.dummy.position.set(
        x + cosH * halfTrack * side,
        y + 0.035,
        z - sinH * halfTrack * side,
      );
      this.dummy.rotation.set(0, heading, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.skidMesh.setMatrixAt(idx, this.dummy.matrix);
    }

    this.skidMesh.count = this.skidCount;
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  public update(
    dt: number,
    focus: VfxFocusAnchor,
    rainIntensity = 0,
  ): void {
    const safeDt = Math.min(0.05, Math.max(0, dt));

    // 1. Step particle pool
    let visibleCount = 0;
    const limit = this.maxActiveParticles;
    for (let i = 0; i < limit; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }

      const dragFactor = Math.max(0, 1 - p.drag * safeDt);
      p.vx *= dragFactor;
      p.vz *= dragFactor;
      p.vy += p.gravity * safeDt;
      p.x += p.vx * safeDt;
      p.y = Math.max(0.04, p.y + p.vy * safeDt);
      p.z += p.vz * safeDt;

      const t = p.age / p.life;
      const size = p.startSize + (p.endSize - p.startSize) * t;
      const fadeScale = p.type === 'spark' || p.type === 'flame' ? Math.max(0.15, 1 - t) : 1;
      const finalScale = Math.max(0.02, size * fadeScale);

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(t * 2.1, t * 1.4, 0);
      this.dummy.scale.set(finalScale, finalScale, finalScale);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(visibleCount, this.dummy.matrix);
      this.tmpColor.setHex(p.colorHex);
      this.particleMesh.setColorAt(visibleCount, this.tmpColor);
      visibleCount++;
    }

    this.particleMesh.count = visibleCount;
    this.particleMesh.visible = visibleCount > 0;
    if (visibleCount > 0) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Step rain streaks around focus anchor
    if (rainIntensity > 0.05 && this.density !== 'off') {
      const activeRain = Math.min(
        RAIN_STREAK_COUNT,
        Math.round(
          RAIN_STREAK_COUNT *
            Math.min(1, rainIntensity) *
            (this.density === 'low' ? 0.45 : this.density === 'medium' ? 0.75 : 1),
        ),
      );
      const streakLen = 0.9 + rainIntensity * 0.9;
      for (let i = 0; i < activeRain; i++) {
        const base = i * 4;
        let ry = this.rainSeeds[base + 1] - this.rainSeeds[base + 3] * safeDt;
        if (ry < 0) ry += 18;
        this.rainSeeds[base + 1] = ry;

        const rx = focus.x + this.rainSeeds[base + 0];
        const worldY = focus.y + ry;
        const rz = focus.z + this.rainSeeds[base + 2];

        const posIdx = i * 6;
        this.rainPositions[posIdx + 0] = rx;
        this.rainPositions[posIdx + 1] = worldY;
        this.rainPositions[posIdx + 2] = rz;
        this.rainPositions[posIdx + 3] = rx - 0.18;
        this.rainPositions[posIdx + 4] = worldY - streakLen;
        this.rainPositions[posIdx + 5] = rz - 0.18;
      }
      this.rainGeo.setDrawRange(0, activeRain * 2);
      (this.rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.rainMat.opacity = Math.min(0.5, 0.18 + rainIntensity * 0.34);
      this.rainLines.visible = true;
    } else {
      this.rainLines.visible = false;
    }

    // 3. Step slipstream aero streaks
    if (focus.inSlipstream && focus.speed > 26 && this.density !== 'off') {
      this.slipPhase += safeDt * Math.max(18, focus.speed * 0.9);
      const sinH = Math.sin(focus.heading);
      const cosH = Math.cos(focus.heading);
      for (let i = 0; i < SLIPSTREAM_STREAK_COUNT; i++) {
        const angle = (i / SLIPSTREAM_STREAK_COUNT) * Math.PI * 2;
        const radius = 1.45 + (i % 3) * 0.45;
        const localX = Math.cos(angle) * radius;
        const localY = 0.45 + Math.abs(Math.sin(angle)) * 0.85;
        const cycle = ((this.slipPhase + i * 1.7) % 9.5) - 3.0;
        const tail = cycle - 2.4;

        const p0x = focus.x + cosH * localX + sinH * cycle;
        const p0z = focus.z - sinH * localX + cosH * cycle;
        const p1x = focus.x + cosH * localX + sinH * tail;
        const p1z = focus.z - sinH * localX + cosH * tail;

        const idx = i * 6;
        this.slipPositions[idx + 0] = p0x;
        this.slipPositions[idx + 1] = focus.y + localY;
        this.slipPositions[idx + 2] = p0z;
        this.slipPositions[idx + 3] = p1x;
        this.slipPositions[idx + 4] = focus.y + localY;
        this.slipPositions[idx + 5] = p1z;
      }
      (this.slipGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.slipLines.visible = true;
    } else {
      this.slipLines.visible = false;
    }
  }

  public dispose(): void {
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.skidGeo.dispose();
    this.skidMat.dispose();
    this.rainGeo.dispose();
    this.rainMat.dispose();
    this.slipGeo.dispose();
    this.slipMat.dispose();
    if (this.racingLineMesh) {
      this.racingLineMesh.geometry.dispose();
      (this.racingLineMesh.material as THREE.Material).dispose();
      this.racingLineMesh = null;
    }
    this.root.clear();
  }
}
