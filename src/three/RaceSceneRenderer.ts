import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildBroadcastCameraStations,
  BroadcastCameraStation,
  computeCameraFrame,
  DEFAULT_CHASE_CAMERA,
  selectBroadcastStation,
} from '../game/camera';
import { resolveCarSpecial } from '../game/cars';
import { GamepadController, GamepadInputState } from '../game/gamepad';
import { CarSimState, computeRoadSurfaceTilt, SPEED_KMH_FACTOR } from '../game/physics';
import { ReplayBookmark } from '../game/replay';
import { GameSettings, getSemanticPalette, ShadowQuality } from '../game/settings';
import { telemetryRecorder } from '../game/telemetryRecorder';
import { blendAllDrivingInputs, touchInputStore } from '../game/touchControls';
import { sampleTrackAtT } from '../game/tracks';
import {
  CameraMode,
  CarClassId,
  GamePhase,
  PhotoFilterId,
  SpectatorCameraMode,
} from '../game/types';
import { MotorsportAudioEngine } from './audioEngine';
import { BuiltCarRig } from './carBuilder';
import {
  CarNametagHandle,
  computeNametagDistanceStyle,
  createCarNametagSprite,
} from './nametagSprite';
import {
  buildCarRigAsync,
  preloadCarModels,
  prewarmCarShaderMaterials,
} from './objCarLoader';
import { RacePostProcessor } from './postProcessing';
import {
  isTrackSegmentTunnel,
  RaceSimulationEngine,
} from './RaceSimulationEngine';
import { RaceVfxManager } from './raceVfx';
import {
  buildTrackEnvironment,
  BuiltTrackScene,
  TrackPropCarState,
} from './trackBuilder';

export interface RendererPhotoState {
  active: boolean;
  fov: number;
  rollDeg: number;
  exposure: number;
  contrast: number;
  saturation: number;
  tiltShift: boolean;
  tiltShiftStrength: number;
  filter: PhotoFilterId;
  watermark: boolean;
}

export interface RendererReplayState {
  active: boolean;
  playing: boolean;
  time: number;
  duration: number;
  speed: number;
  focusCarId: string;
  cameraMode: CameraMode;
  cars: Array<{ id: string; name: string }>;
  bookmarks: ReplayBookmark[];
}

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function normalizeAngleRad(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

const SHADOW_MAP_SIZE_BY_QUALITY: Record<ShadowQuality, number> = {
  off: 0,
  low: 512,
  medium: 1024,
  high: 2048,
};

const MIRROR_RT_WIDTH = 320;
const MIRROR_RT_HEIGHT = 84;
const MIRROR_INTERVAL_MS = 33; // ~30Hz rear-view mirror scene render pass

// Zero-GC scratch objects
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();
const _camCurrPos = new THREE.Vector3();
const _camCurrLook = new THREE.Vector3();
const _particleDummy = new THREE.Object3D();
const _freecamEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _freecamQuat = new THREE.Quaternion();
const _freecamFwd = new THREE.Vector3();
const _freecamRight = new THREE.Vector3();
const _orbitLookFwd = new THREE.Vector3();
const _orbitUp = new THREE.Vector3();
const _listenerFwd = new THREE.Vector3();
const _listenerUp = new THREE.Vector3();
const _mirrorLookAt = new THREE.Vector3();
const _rendererSize = new THREE.Vector2();

export class RaceSceneRenderer {
  public readonly container: HTMLElement;
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly maxAniso: number;
  public readonly postProcessor: RacePostProcessor;
  public readonly vfx: RaceVfxManager;
  public readonly hemi: THREE.HemisphereLight;
  public readonly sun: THREE.DirectionalLight;
  public readonly rim: THREE.DirectionalLight;

  public trackScene: BuiltTrackScene | null = null;
  public carRigs = new Map<string, BuiltCarRig>();
  public carNametags = new Map<string, CarNametagHandle>();
  public zoneMarkersGroup: THREE.Group | null = null;
  public broadcastStations: BroadcastCameraStation[] = [];

  // Camera & interactive state
  public chaseHeading = 0;
  public chaseLookYaw = 0;
  public orbitYawOffset = 0;
  public orbitWorldYaw = Math.PI;
  public targetOrbitWorldYaw = Math.PI;
  public orbitPitch = DEFAULT_CHASE_CAMERA.pitch;
  public orbitDist = DEFAULT_CHASE_CAMERA.distance;
  public targetOrbitPitch = DEFAULT_CHASE_CAMERA.pitch;
  public targetOrbitDist = DEFAULT_CHASE_CAMERA.distance;
  public orbitRoll = 0;
  public targetOrbitRoll = 0;
  public orbitRollLastInteractTime = 0;
  public isDraggingOrbit = false;
  public orbitLastInteractTime = 0;
  public hoodLookYaw = 0;
  public hoodLookPitch = 0;
  public lastCameraMode: CameraMode = 'orbit';
  public spectatorCameraMode: SpectatorCameraMode = 'spectate';
  public freecamPos = new THREE.Vector3(0, 18, 0);
  public freecamYaw = 0;
  public freecamPitch = -0.32;
  public freecamSpeed = 42;
  public freecamFov = 58;
  public freecamShiftScrollAt = 0;
  public isDraggingFreecam = false;

  public replay = {
    active: false,
    playing: true,
    time: 0,
    speed: 1,
    focusCarId: 'player',
    cameraMode: 'tv-broadcast' as CameraMode,
  };

  public photo = {
    active: false,
    fov: 44,
    rollDeg: 0,
    exposure: 1.0,
    contrast: 1.04,
    saturation: 1.06,
    tiltShift: true,
    tiltShiftStrength: 0.45,
    filter: 'none' as PhotoFilterId,
    watermark: true,
    camPos: new THREE.Vector3(),
    camYaw: 0,
    camPitch: -0.18,
  };

  public lightningFlash = 0;
  public fpsSmoothed = 60;
  public adaptiveDprLowFrames = 0;
  public lastReplayEmitAt = 0;

  // Pooled particle & ghost meshes
  private slipstreamMesh: THREE.InstancedMesh;
  private slipGeo: THREE.BoxGeometry;
  private slipMat: THREE.MeshBasicMaterial;
  private readonly slipCount = 48;

  private rainMesh: THREE.InstancedMesh;
  private rainGeo: THREE.BoxGeometry;
  private rainMat: THREE.MeshBasicMaterial;
  private readonly rainCount = 120;

  private debrisMesh: THREE.InstancedMesh;
  private debrisGeo: THREE.BoxGeometry;
  private debrisMat: THREE.MeshStandardMaterial;
  private readonly debrisCount = 36;
  private debrisPool: Array<{
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    life: number;
    maxLife: number;
  }>;
  private debrisCursor = 0;

  private smokeMesh: THREE.InstancedMesh;
  private smokeGeo: THREE.DodecahedronGeometry;
  private smokeMat: THREE.MeshBasicMaterial;
  private readonly smokeCount = 32;
  private smokePool: Array<{
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }>;
  private smokeCursor = 0;

  private ghostCarGroup: THREE.Group;
  private propCarStatesScratch: TrackPropCarState[] = [];

  // 3D Virtual Rear-View Mirror resources
  private mirrorCamera: THREE.PerspectiveCamera;
  private mirrorTarget: THREE.WebGLRenderTarget;
  private mirrorBlitScene: THREE.Scene;
  private mirrorBlitCam: THREE.OrthographicCamera;
  private mirrorBlitGeo: THREE.PlaneGeometry;
  private mirrorBlitMat: THREE.MeshBasicMaterial;
  private lastMirrorRenderAt = -1000;
  private hasMirrorFrame = false;

  // Resize & Pointer Listeners
  private ro: ResizeObserver;
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private disposed = false;

  private getPhase: () => GamePhase;
  private getSessionMode: () => string | undefined;
  private getCameraMode: () => CameraMode;
  private getCars: () => CarSimState[];
  private getSpectatedCarId: () => string | null;
  private onAudioUnlock: () => void;
  private onSpectatorCameraModeChange?: (mode: SpectatorCameraMode) => void;

  constructor(params: {
    container: HTMLElement;
    settings: GameSettings;
    initialCameraMode: CameraMode;
    initialSpectatorMode: SpectatorCameraMode;
    getPhase: () => GamePhase;
    getSessionMode: () => string | undefined;
    getCameraMode: () => CameraMode;
    getCars: () => CarSimState[];
    getSpectatedCarId: () => string | null;
    onAudioUnlock: () => void;
    onSpectatorCameraModeChange?: (mode: SpectatorCameraMode) => void;
  }) {
    this.container = params.container;
    this.lastCameraMode = params.initialCameraMode;
    this.spectatorCameraMode = params.initialSpectatorMode;
    this.getPhase = params.getPhase;
    this.getSessionMode = params.getSessionMode;
    this.getCameraMode = params.getCameraMode;
    this.getCars = params.getCars;
    this.getSpectatedCarId = params.getSpectatedCarId;
    this.onAudioUnlock = params.onAudioUnlock;
    this.onSpectatorCameraModeChange = params.onSpectatorCameraModeChange;

    this.isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, params.settings.renderScale),
    );
    renderer.shadowMap.enabled = !this.isSoftwareGl && params.settings.shadowQuality !== 'off';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || this.container.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(rect.height || this.container.clientHeight || window.innerHeight));
    renderer.setSize(w, h, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.12, 950);

    // Warm Sun + Cool Sky Hemisphere Fill + Tight 85x85m Player-Centered Shadow Frustum
    this.hemi = new THREE.HemisphereLight(0xbbe1ff, 0x2f3b2f, 0.68);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.55);
    sun.position.set(120, 180, 90);
    sun.castShadow = !this.isSoftwareGl && params.settings.shadowQuality !== 'off';
    const initialShadowSize = Math.max(512, SHADOW_MAP_SIZE_BY_QUALITY[params.settings.shadowQuality] || 1024);
    sun.shadow.mapSize.set(initialShadowSize, initialShadowSize);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 340;
    sun.shadow.camera.left = -42.5;
    sun.shadow.camera.right = 42.5;
    sun.shadow.camera.top = 42.5;
    sun.shadow.camera.bottom = -42.5;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.rim = new THREE.DirectionalLight(0x93c5fd, 0.4);
    this.rim.position.set(-140, 80, -120);
    scene.add(this.rim);

    // VFX & Post-Processing
    this.vfx = new RaceVfxManager(this.isSoftwareGl ? 'low' : params.settings.particleDensity);
    scene.add(this.vfx.root);
    this.postProcessor = new RacePostProcessor(renderer, scene, this.camera, w, h, this.isSoftwareGl);
    this.postProcessor.updateConfig({
      bloomEnabled: !this.isSoftwareGl && params.settings.bloomEnabled,
      tiltShiftEnabled: !this.isSoftwareGl && params.settings.tiltShiftEnabled,
      speedEffectsEnabled: !params.settings.reducedMotion && params.settings.speedBlurEnabled,
    });

    // Pooled InstancedMeshes
    this.slipGeo = new THREE.BoxGeometry(0.08, 0.08, 1.4);
    this.slipMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.slipstreamMesh = new THREE.InstancedMesh(this.slipGeo, this.slipMat, this.slipCount);
    this.slipstreamMesh.frustumCulled = false;
    scene.add(this.slipstreamMesh);

    this.rainGeo = new THREE.BoxGeometry(0.04, 1.6, 0.04);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(this.rainGeo, this.rainMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    this.debrisGeo = new THREE.BoxGeometry(0.16, 0.05, 0.24);
    this.debrisMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.4,
    });
    this.debrisMesh = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, this.debrisCount);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.visible = false;
    scene.add(this.debrisMesh);
    this.debrisPool = Array.from({ length: this.debrisCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      life: 0,
      maxLife: 1,
    }));

    this.smokeGeo = new THREE.DodecahedronGeometry(0.28, 0);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, this.smokeCount);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.visible = false;
    scene.add(this.smokeMesh);
    this.smokePool = Array.from({ length: this.smokeCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.7,
    }));

    // Ghost Car Silhouette
    this.ghostCarGroup = new THREE.Group();
    this.ghostCarGroup.visible = false;
    const ghostShellMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const ghostWireMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const ghostHullGeo = new THREE.BoxGeometry(1.94, 0.48, 4.55);
    const ghostHull = new THREE.Mesh(ghostHullGeo, ghostShellMat);
    ghostHull.position.set(0, 0.44, 0);
    const ghostHullWire = new THREE.Mesh(ghostHullGeo, ghostWireMat);
    ghostHullWire.position.set(0, 0.44, 0);
    const ghostNose = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.28, 1.1), ghostShellMat);
    ghostNose.position.set(0, 0.34, 2.3);
    const ghostCanopy = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 1.85), ghostShellMat);
    ghostCanopy.position.set(0, 0.84, -0.1);
    const ghostWing = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.12, 0.48), ghostShellMat);
    ghostWing.position.set(0, 1.02, -2.02);
    const ghostDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 0.32), ghostWireMat);
    ghostDiffuser.position.set(0, 0.26, -2.22);
    this.ghostCarGroup.add(ghostHull, ghostHullWire, ghostNose, ghostCanopy, ghostWing, ghostDiffuser);
    scene.add(this.ghostCarGroup);

    // 3D Virtual Rear-View Mirror (render target + scissor blit quad)
    this.mirrorCamera = new THREE.PerspectiveCamera(52, MIRROR_RT_WIDTH / MIRROR_RT_HEIGHT, 0.25, 450);
    this.mirrorTarget = new THREE.WebGLRenderTarget(MIRROR_RT_WIDTH, MIRROR_RT_HEIGHT, {
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.mirrorBlitScene = new THREE.Scene();
    this.mirrorBlitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mirrorBlitGeo = new THREE.PlaneGeometry(2, 2);
    // Flip horizontal UV so rear camera renders as a true mirror
    const uvAttr = this.mirrorBlitGeo.getAttribute('uv');
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setX(i, 1 - uvAttr.getX(i));
      }
      uvAttr.needsUpdate = true;
    }
    this.mirrorBlitMat = new THREE.MeshBasicMaterial({
      map: this.mirrorTarget.texture,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const blitMesh = new THREE.Mesh(this.mirrorBlitGeo, this.mirrorBlitMat);
    this.mirrorBlitScene.add(blitMesh);

    // Attach pointer, wheel & resize listeners
    renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(this.container);
  }

  private disposeGroupResources(grp: THREE.Group): void {
    grp.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  private buildZoneMarkers(
    engine: RaceSimulationEngine,
    showAttackModeZone: boolean,
    showDrsZones: boolean,
  ): THREE.Group {
    const grp = new THREE.Group();
    const compiled = engine.compiledTrack;
    const zones = engine.specialZones;
    const halfW = compiled.spec.trackWidth * 0.5;

    if (showAttackModeZone) {
      const az = zones.attackModeZone;
      const steps = 10;
      const azSpan = az.endT >= az.startT ? az.endT - az.startT : 1 - az.startT + az.endT;
      const chevGeo = new THREE.PlaneGeometry(halfW * 0.46, 1.4);
      const chevMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const borderMat = new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const latCenter = az.side * halfW * ((az.lateralMinRatio + az.lateralMaxRatio) * 0.5);
      for (let i = 0; i < steps; i++) {
        const t = (az.startT + (azSpan * (i + 0.5)) / steps) % 1;
        const sp = sampleTrackAtT(compiled, t);
        const mesh = new THREE.Mesh(chevGeo, i === 0 || i === steps - 1 ? borderMat : chevMat);
        mesh.position.set(sp.x + sp.nx * latCenter, sp.y + 0.055, sp.z + sp.nz * latCenter);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = Math.atan2(sp.tx, sp.tz);
        mesh.rotation.x = -Math.PI / 2;
        grp.add(mesh);
      }
    }

    if (showDrsZones) {
      const drsLineGeo = new THREE.PlaneGeometry(halfW * 1.9, 0.55);
      const drsLineMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      for (const dz of zones.drsZones) {
        const sp = sampleTrackAtT(compiled, dz.activationStartT);
        const line = new THREE.Mesh(drsLineGeo, drsLineMat);
        line.position.set(sp.x, sp.y + 0.05, sp.z);
        line.rotation.order = 'YXZ';
        line.rotation.y = Math.atan2(sp.tx, sp.tz);
        line.rotation.x = -Math.PI / 2;
        grp.add(line);
      }
    }
    return grp;
  }

  public applySettings(
    settings: GameSettings,
    compiledTrack: RaceSimulationEngine['compiledTrack'],
    trackWetness = 0,
  ): void {
    this.vfx.setDensity(this.isSoftwareGl ? 'low' : settings.particleDensity);
    const nextPal = getSemanticPalette(settings.colorblindMode);
    this.vfx.syncRacingLine(
      compiledTrack,
      this.getPhase() === 'title' ? 'off' : settings.racingLineMode,
      trackWetness,
      {
        racingLineFast: parseInt(nextPal.good.replace('#', ''), 16),
        racingLineCoast: parseInt(nextPal.warn.replace('#', ''), 16),
        racingLineBrake: parseInt(nextPal.danger.replace('#', ''), 16),
      },
    );
    if (!this.photo.active) {
      this.postProcessor.updateConfig({
        bloomEnabled: !this.isSoftwareGl && settings.bloomEnabled,
        tiltShiftEnabled: !this.isSoftwareGl && settings.tiltShiftEnabled,
        speedEffectsEnabled: !settings.reducedMotion && settings.speedBlurEnabled,
      });
    }
    if (!this.isSoftwareGl) {
      const dprCap = Math.min(window.devicePixelRatio, settings.renderScale);
      this.renderer.setPixelRatio(dprCap);
      const targetSize = SHADOW_MAP_SIZE_BY_QUALITY[settings.shadowQuality];
      this.renderer.shadowMap.enabled = targetSize > 0;
      this.sun.castShadow = targetSize > 0;
      if (
        targetSize > 0 &&
        (this.sun.shadow.mapSize.x !== targetSize || this.sun.shadow.mapSize.y !== targetSize)
      ) {
        this.sun.shadow.mapSize.set(targetSize, targetSize);
        if (this.sun.shadow.map) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
      }
    }
  }

  public resetGameplayCamera(targetCar?: CarSimState | null, preservePitchAndDist = false): void {
    const h = targetCar?.heading ?? this.chaseHeading;
    this.chaseHeading = h;
    this.chaseLookYaw = 0;
    this.orbitYawOffset = 0;
    this.orbitWorldYaw = this.targetOrbitWorldYaw = h + Math.PI;
    if (!preservePitchAndDist) {
      this.orbitPitch = this.targetOrbitPitch = DEFAULT_CHASE_CAMERA.pitch;
      this.orbitDist = this.targetOrbitDist = DEFAULT_CHASE_CAMERA.distance;
    }
    this.orbitRoll = this.targetOrbitRoll = 0;
    this.orbitRollLastInteractTime = 0;
    this.orbitLastInteractTime = 0;
  }

  private initFreecamFromCurrentCamera(): void {
    this.freecamPos.copy(this.camera.position);
    _freecamEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.freecamYaw = _freecamEuler.y;
    this.freecamPitch = Math.max(-1.45, Math.min(1.45, _freecamEuler.x));
    this.freecamFov = 58;
  }

  public setSpectatorCameraMode(nextMode: SpectatorCameraMode): void {
    if (this.spectatorCameraMode === nextMode) return;
    if (nextMode === 'freecam') {
      this.initFreecamFromCurrentCamera();
    } else {
      const cars = this.getCars();
      const target = cars.find((c) => c.id === this.getSpectatedCarId()) ?? cars[0];
      if (target) this.resetGameplayCamera(target, true);
    }
    this.spectatorCameraMode = nextMode;
    this.onSpectatorCameraModeChange?.(nextMode);
  }

  public rebuildVisuals(
    engine: RaceSimulationEngine,
    opts: {
      isTitle: boolean;
      isAiRace: boolean;
      showFeAttackZone: boolean;
      showDrsZones: boolean;
      settings: GameSettings;
      cameraMode: CameraMode;
      spectatorMode?: SpectatorCameraMode;
    },
  ): void {
    const worldVersion = engine.worldVersion;
    const compiled = engine.compiledTrack;

    if (this.trackScene) {
      this.scene.remove(this.trackScene.group);
      this.trackScene.dispose();
    }
    const builtTrack = buildTrackEnvironment(compiled, this.maxAniso);
    this.trackScene = builtTrack;
    this.scene.add(builtTrack.group);

    if (this.zoneMarkersGroup) {
      this.scene.remove(this.zoneMarkersGroup);
      this.disposeGroupResources(this.zoneMarkersGroup);
      this.zoneMarkersGroup = null;
    }
    if (!opts.isTitle) {
      const zm = this.buildZoneMarkers(engine, opts.showFeAttackZone, opts.showDrsZones);
      this.zoneMarkersGroup = zm;
      this.scene.add(zm);
    }

    this.broadcastStations = buildBroadcastCameraStations(
      compiled.samples,
      compiled.spec.trackWidth,
    );
    this.replay.active = false;
    this.photo.active = false;
    this.hasMirrorFrame = false;

    const pal = getSemanticPalette(opts.settings.colorblindMode);
    this.vfx.syncRacingLine(
      compiled,
      opts.isTitle ? 'off' : opts.settings.racingLineMode,
      engine.trackWetness,
      {
        racingLineFast: parseInt(pal.good.replace('#', ''), 16),
        racingLineCoast: parseInt(pal.warn.replace('#', ''), 16),
        racingLineBrake: parseInt(pal.danger.replace('#', ''), 16),
      },
    );

    for (let i = 0; i < this.debrisPool.length; i++) this.debrisPool[i].active = false;
    for (let i = 0; i < this.smokePool.length; i++) this.smokePool[i].active = false;
    this.debrisMesh.visible = false;
    this.smokeMesh.visible = false;
    this.ghostCarGroup.visible = false;

    this.scene.background = new THREE.Color(builtTrack.skyColor);
    this.scene.fog = new THREE.FogExp2(builtTrack.fogColor, 0.0017);

    this.carRigs.forEach((rig) => {
      this.scene.remove(rig.root);
      rig.dispose();
    });
    this.carRigs.clear();
    this.carNametags.forEach((tag) => {
      this.scene.remove(tag.sprite);
      tag.dispose();
    });
    this.carNametags.clear();

    for (const c of engine.cars) {
      if (!c.isPlayer && !opts.isTitle) {
        const carHeight = c.carSpec.dimensions?.height ?? 1.25;
        const tag = createCarNametagSprite(
          {
            id: c.id,
            driverName: c.name,
            classId: c.carSpec.classId,
            isHumanPeer: c.isHumanPeer,
            accentColor: c.livery.primaryColor,
          },
          carHeight,
          this.maxAniso,
        );
        tag.sprite.position.set(c.x, c.y + tag.baseHeightOffset, c.z);
        this.scene.add(tag.sprite);
        this.carNametags.set(c.id, tag);
      }
    }

    const carsSnapshot = [...engine.cars];
    preloadCarModels(carsSnapshot.map((c) => c.carSpec))
      .then(() =>
        Promise.all(
          carsSnapshot.map((c) =>
            buildCarRigAsync(c.carSpec, c.livery, this.maxAniso).then((rig) => ({ car: c, rig })),
          ),
        ),
      )
      .then(async (builtList) => {
        if (this.disposed || worldVersion !== engine.worldVersion) {
          for (const item of builtList) item.rig.dispose();
          return;
        }
        for (const { car: c, rig } of builtList) {
          rig.root.position.set(c.x, c.y, c.z);
          rig.root.rotation.y = c.heading;
          this.scene.add(rig.root);
          this.carRigs.set(c.id, rig);
        }
        if (!this.isSoftwareGl) {
          await prewarmCarShaderMaterials(this.renderer, this.scene, this.camera);
        }
        if (!this.disposed && worldVersion === engine.worldVersion) {
          engine.loadingAssets = false;
        }
      })
      .catch(() => {
        if (worldVersion === engine.worldVersion) {
          engine.loadingAssets = false;
        }
      });

    this.spectatorCameraMode = opts.isAiRace ? opts.spectatorMode ?? 'spectate' : 'spectate';

    const playerAnchor = engine.cars.find((c) => c.isPlayer);
    const anchor = playerAnchor ?? engine.cars[0];
    if (anchor) {
      this.resetGameplayCamera(anchor);
      if (opts.isTitle) {
        const initNow = performance.now();
        const orbitAngle = initNow * 0.00024;
        const dist = 28 + Math.sin(initNow * 0.00017) * 7;
        const elev = 14 + Math.cos(initNow * 0.00021) * 5;
        _camCurrPos.set(
          anchor.x + Math.cos(orbitAngle) * dist,
          anchor.y + elev,
          anchor.z + Math.sin(orbitAngle) * dist,
        );
        _camCurrLook.set(anchor.x, anchor.y + 0.6, anchor.z);
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(_camCurrPos);
        this.camera.lookAt(_camCurrLook);
      } else {
        const initSample = sampleTrackAtT(compiled, anchor.trackT);
        const initTilt = computeRoadSurfaceTilt(initSample, anchor.heading);
        const initFrame = computeCameraFrame(
          opts.isAiRace ? 'orbit' : opts.cameraMode,
          anchor,
          anchor.pitch ?? initTilt.pitchRad,
          anchor.roll ?? initTilt.rollRad,
        );
        _camCurrPos.set(initFrame.position.x, initFrame.position.y, initFrame.position.z);
        _camCurrLook.set(initFrame.lookAt.x, initFrame.lookAt.y, initFrame.lookAt.z);
        if (initFrame.up) {
          this.camera.up.set(initFrame.up.x, initFrame.up.y, initFrame.up.z);
        } else {
          this.camera.up.set(0, 1, 0);
        }
        this.camera.position.copy(_camCurrPos);
        this.camera.lookAt(_camCurrLook);
      }
      this.initFreecamFromCurrentCamera();
      this.freecamPos.y = Math.max(anchor.y + 12, this.freecamPos.y + 8);
    }
  }

  public enterPhotoMode(): RendererPhotoState {
    this.photo.active = true;
    this.photo.camPos.copy(this.camera.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.photo.camYaw = Math.atan2(dir.x, dir.z);
    this.photo.camPitch = Math.asin(Math.max(-0.95, Math.min(0.95, dir.y)));
    this.postProcessor.updateConfig({
      exposure: this.photo.exposure,
      contrast: this.photo.contrast,
      saturation: this.photo.saturation,
      tiltShiftEnabled: this.photo.tiltShift,
      tiltShiftStrength: this.photo.tiltShiftStrength,
      filter: this.photo.filter,
    });
    return this.getPhotoState();
  }

  public exitPhotoMode(settings: GameSettings): RendererPhotoState {
    this.photo.active = false;
    this.postProcessor.updateConfig({
      exposure: 1.0,
      contrast: 1.04,
      saturation: 1.06,
      tiltShiftEnabled: !this.isSoftwareGl && settings.tiltShiftEnabled,
      tiltShiftStrength: 0.55,
      filter: 'none',
    });
    return this.getPhotoState();
  }

  public updatePhotoSettings(patch: Partial<RendererPhotoState>): RendererPhotoState {
    Object.assign(this.photo, patch);
    this.postProcessor.updateConfig({
      exposure: this.photo.exposure,
      contrast: this.photo.contrast,
      saturation: this.photo.saturation,
      tiltShiftEnabled: this.photo.tiltShift,
      tiltShiftStrength: this.photo.tiltShiftStrength,
      filter: this.photo.filter,
    });
    return this.getPhotoState();
  }

  public getPhotoState(): RendererPhotoState {
    return {
      active: this.photo.active,
      fov: this.photo.fov,
      rollDeg: this.photo.rollDeg,
      exposure: this.photo.exposure,
      contrast: this.photo.contrast,
      saturation: this.photo.saturation,
      tiltShift: this.photo.tiltShift,
      tiltShiftStrength: this.photo.tiltShiftStrength,
      filter: this.photo.filter,
      watermark: this.photo.watermark,
    };
  }

  public capturePhoto(withWatermark: boolean, audio: MotorsportAudioEngine): void {
    try {
      this.postProcessor.render();
      const srcCanvas = this.renderer.domElement;
      const out = document.createElement('canvas');
      out.width = srcCanvas.width;
      out.height = srcCanvas.height;
      const ctx2d = out.getContext('2d');
      if (!ctx2d) return;
      ctx2d.drawImage(srcCanvas, 0, 0);
      if (withWatermark) {
        ctx2d.save();
        ctx2d.font = '900 22px "Oxanium", system-ui, sans-serif';
        ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
        ctx2d.shadowColor = 'rgba(0,0,0,0.8)';
        ctx2d.shadowBlur = 8;
        ctx2d.textAlign = 'right';
        ctx2d.fillText('APEX MINIATURE', out.width - 28, out.height - 28);
        ctx2d.restore();
      }
      const url = out.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `apex-miniature-photo-${Date.now()}.png`;
      a.click();
      audio.playBeep(920, 0.09);
    } catch {
      // ignore canvas capture errors
    }
  }

  public getReplayState(engine: RaceSimulationEngine): RendererReplayState {
    const dur = engine.replayRecorder.getDuration();
    return {
      active: this.replay.active,
      playing: this.replay.playing,
      time: Math.max(0, this.replay.time - dur.start),
      duration: Math.max(0.1, dur.end - dur.start),
      speed: this.replay.speed,
      focusCarId: this.replay.focusCarId,
      cameraMode: this.replay.cameraMode,
      cars: engine.cars.map((c) => ({ id: c.id, name: c.name })),
      bookmarks: engine.replayRecorder.getBookmarks().map((bm) => ({
        ...bm,
        time: Math.max(0, bm.time - dur.start),
      })),
    };
  }

  public renderFrame(params: {
    dt: number;
    nowMs: number;
    phase: GamePhase;
    cameraMode: CameraMode;
    sessionMode?: string;
    totalLaps: number;
    spectatorCameraMode?: SpectatorCameraMode;
    settings: GameSettings;
    keysPressed: Set<string>;
    gp: GamepadInputState;
    touchMove: { moveForward: number; moveRight: number; moveUp: number };
    throttle: number;
    brake: number;
    engine: RaceSimulationEngine;
    audio: MotorsportAudioEngine;
    ghostPose: { visible: boolean; x: number; y: number; z: number; heading: number; pitch: number; roll: number };
    onReplayTick?: (state: RendererReplayState) => void;
    onRumble?: (weak: number, strong: number, durationMs: number) => void;
  }): void {
    const {
      dt,
      nowMs,
      phase,
      cameraMode,
      sessionMode,
      totalLaps,
      settings,
      keysPressed,
      gp,
      touchMove,
      throttle,
      brake,
      engine,
      audio,
      ghostPose,
    } = params;

    const isTitle = phase === 'title';
    const isAiRace = phase === 'playing' && sessionMode === 'ai-race';
    const playerCar = engine.cars.find((c) => c.isPlayer) ?? null;

    if (isAiRace && params.spectatorCameraMode && params.spectatorCameraMode !== this.spectatorCameraMode) {
      this.setSpectatorCameraMode(params.spectatorCameraMode);
    }
    const spectatedCar = isAiRace
      ? engine.cars.find((c) => c.id === engine.spectatedCarId) ?? engine.cars[0] ?? null
      : null;
    const focusCar = playerCar ?? spectatedCar;

    // 1. Update Start Gantry Lights & Rain Mesh Visibility
    if (!isTitle && (phase === 'playing' || phase === 'qualifying')) {
      this.rainMesh.visible = engine.weatherSystem.rainIntensity > 0.08;
      this.rainMat.opacity = Math.min(0.65, 0.16 + engine.weatherSystem.rainIntensity * 0.48);

      if (this.trackScene) {
        const totalCountdown = engine.activeStartType === 'rolling' ? 3.2 : 2.0;
        const litCount =
          engine.countdown > 0
            ? Math.min(
                5,
                Math.max(1, Math.ceil(((totalCountdown - engine.countdown) / totalCountdown) * 5)),
              )
            : 0;
        this.trackScene.startLightMats.forEach((m, idx) => {
          if (engine.countdown <= 0) {
            m.emissive.setHex(0x22c55e);
            m.emissiveIntensity = nowMs % 3000 < 1500 ? 0.5 : 0;
          } else if (engine.activeStartType === 'rolling') {
            m.emissive.setHex(0xf59e0b);
            m.emissiveIntensity = idx < litCount ? 2.0 : 0.15;
          } else {
            m.emissive.setHex(0xef4444);
            m.emissiveIntensity = idx < litCount ? 2.2 : 0.05;
          }
        });
      }
    }

    // 2. Ghost Car Pose
    if (ghostPose.visible) {
      this.ghostCarGroup.visible = true;
      this.ghostCarGroup.position.set(ghostPose.x, ghostPose.y, ghostPose.z);
      this.ghostCarGroup.rotation.order = 'YXZ';
      this.ghostCarGroup.rotation.set(-ghostPose.pitch, ghostPose.heading, -ghostPose.roll);
    } else {
      this.ghostCarGroup.visible = false;
    }

    // 3. Camera Update & Engine Audio
    let isLookingBack = false;
    if (isTitle) {
      const lead = engine.cars[0];
      if (lead) {
        const orbitAngle = nowMs * 0.00024;
        const dist = 28 + Math.sin(nowMs * 0.00017) * 7;
        const elev = 14 + Math.cos(nowMs * 0.00021) * 5;
        _camDesiredPos.set(
          lead.x + Math.cos(orbitAngle) * dist,
          lead.y + elev,
          lead.z + Math.sin(orbitAngle) * dist,
        );
        _camDesiredLook.set(lead.x, lead.y + 0.6, lead.z);
        const damp = 1 - Math.exp(-3.5 * dt);
        _camCurrPos.lerp(_camDesiredPos, damp);
        _camCurrLook.lerp(_camDesiredLook, damp);
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(_camCurrPos);
        this.camera.lookAt(_camCurrLook);
      }
      audio.updateEngine(0, 0, 'v8-hybrid', false);
    } else if ((phase === 'playing' || phase === 'qualifying') && !this.photo.active && !this.replay.active) {
      if (isAiRace && this.spectatorCameraMode === 'freecam') {
        if (Math.abs(this.camera.near - 0.25) > 0.01) {
          this.camera.near = 0.25;
          this.camera.updateProjectionMatrix();
        }
        if (Math.abs(this.camera.fov - this.freecamFov) > 0.05) {
          this.camera.fov += (this.freecamFov - this.camera.fov) * Math.min(1, dt * 12);
          this.camera.updateProjectionMatrix();
        }
        const arrowYaw =
          (keysPressed.has('ArrowLeft') ? 1 : 0) - (keysPressed.has('ArrowRight') ? 1 : 0);
        const arrowPitch =
          (keysPressed.has('ArrowUp') ? 1 : 0) - (keysPressed.has('ArrowDown') ? 1 : 0);
        this.freecamYaw += (arrowYaw * 1.9 - gp.cameraX * 2.2) * dt;
        this.freecamPitch = Math.max(
          -1.45,
          Math.min(1.45, this.freecamPitch + (arrowPitch * 1.5 - gp.cameraY * 1.6) * dt),
        );

        _freecamEuler.set(this.freecamPitch, this.freecamYaw, 0, 'YXZ');
        _freecamQuat.setFromEuler(_freecamEuler);
        _freecamFwd.set(0, 0, -1).applyQuaternion(_freecamQuat);
        _freecamRight.set(1, 0, 0).applyQuaternion(_freecamQuat);

        const kbFwd = (keysPressed.has('KeyW') ? 1 : 0) - (keysPressed.has('KeyS') ? 1 : 0);
        const kbRight = (keysPressed.has('KeyD') ? 1 : 0) - (keysPressed.has('KeyA') ? 1 : 0);
        const moveFwd = Math.max(-1, Math.min(1, kbFwd - gp.leftStickY + touchMove.moveForward));
        const moveRight = Math.max(-1, Math.min(1, kbRight + gp.steer + touchMove.moveRight));
        const kbUp =
          (keysPressed.has('Space') || keysPressed.has('KeyE') ? 1 : 0) -
          (keysPressed.has('KeyQ') || keysPressed.has('ControlLeft') ? 1 : 0);
        const gpUp = (gp.rbPressed ? 1 : 0) - (gp.lbPressed ? 1 : 0) + (gp.throttle - gp.brake);
        const moveUp = Math.max(-1, Math.min(1, kbUp + gpUp + touchMove.moveUp));

        this.freecamPos.addScaledVector(_freecamFwd, moveFwd * this.freecamSpeed * dt);
        this.freecamPos.addScaledVector(_freecamRight, moveRight * this.freecamSpeed * dt);
        this.freecamPos.y += moveUp * this.freecamSpeed * dt;
        const minFloorY = (spectatedCar?.y ?? 0) + 0.6;
        if (this.freecamPos.y < Math.min(minFloorY, -2)) {
          this.freecamPos.y = Math.min(minFloorY, -2);
        }
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(this.freecamPos);
        this.camera.quaternion.copy(_freecamQuat);

        let nearestCar: CarSimState | null = null;
        let nearestDistSq = 85 * 85;
        for (const c of engine.cars) {
          const dSq =
            (c.x - this.freecamPos.x) ** 2 +
            (c.y - this.freecamPos.y) ** 2 +
            (c.z - this.freecamPos.z) ** 2;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestCar = c;
          }
        }
        if (nearestCar && engine.countdown <= 0) {
          const aiLoad =
            nearestCar.speed < 2.0 ? 0.04 : Math.min(0.65, 0.18 + nearestCar.rpmNormalized * 0.45);
          audio.updateEngine(
            nearestCar.rpmNormalized,
            aiLoad,
            nearestCar.carSpec.engineType,
            true,
            nearestCar.carSpec.classId,
            false,
            Math.round(nearestCar.speed * SPEED_KMH_FACTOR),
            nearestCar.carSpec.id,
            nearestCar.lateralSlip,
            nearestCar.onKerb,
            nearestCar.gear,
            nearestCar.carSpec.soundProfile,
            nearestCar.revLimiterActive,
          );
        } else {
          audio.updateEngine(0, 0, 'v8-hybrid', false);
        }
      } else if (focusCar) {
        const mode: CameraMode = isAiRace ? 'orbit' : cameraMode;
        const targetNear = mode === 'hood' ? 0.14 : 0.4;
        if (Math.abs(this.camera.near - targetNear) > 0.01) {
          this.camera.near = targetNear;
          this.camera.updateProjectionMatrix();
        }

        const trkSample = sampleTrackAtT(engine.compiledTrack, focusCar.trackT);
        const fallbackTilt = computeRoadSurfaceTilt(trkSample, focusCar.heading);
        const pPitch = focusCar.pitch ?? fallbackTilt.pitchRad;
        const pRoll = focusCar.roll ?? fallbackTilt.rollRad;

        if (mode !== this.lastCameraMode) {
          this.lastCameraMode = mode;
          this.resetGameplayCamera(focusCar);
        }

        if (mode === 'orbit') {
          const isRightStickOrbiting = gp.cameraX !== 0 || gp.cameraY !== 0;
          if (isRightStickOrbiting) {
            this.targetOrbitWorldYaw -= gp.cameraX * 2.4 * dt;
            this.targetOrbitPitch = Math.max(
              DEFAULT_CHASE_CAMERA.minPitch,
              Math.min(DEFAULT_CHASE_CAMERA.maxPitch, this.targetOrbitPitch + gp.cameraY * 1.6 * dt),
            );
            this.orbitLastInteractTime = nowMs;
            this.orbitRollLastInteractTime = nowMs;
          }

          const isManuallyAdjustingOrbit = this.isDraggingOrbit || isRightStickOrbiting;
          const lowSpeedFactor = Math.max(0, Math.min(1, (34 - focusCar.speed) / 24));
          const weaveFactor = Math.max(
            0,
            Math.min(
              1,
              (Math.abs(focusCar.yawRate ?? 0) - 0.25) / 1.1 + Math.abs(focusCar.steerAngle) * 0.75,
            ),
          );
          const centerLockBoost = Math.max(lowSpeedFactor, weaveFactor);

          if (isManuallyAdjustingOrbit) {
            this.orbitYawOffset = normalizeAngleRad(
              this.targetOrbitWorldYaw - (focusCar.heading + Math.PI),
            );
          } else {
            const desiredWorldYaw = focusCar.heading + Math.PI + this.orbitYawOffset;
            const yawDiff = normalizeAngleRad(desiredWorldYaw - this.targetOrbitWorldYaw);
            const yawFollowRate = 9.5 + centerLockBoost * 20.5;
            this.targetOrbitWorldYaw += yawDiff * (1 - Math.exp(-yawFollowRate * dt));
            if (centerLockBoost > 0.25 && Math.abs(this.orbitYawOffset) < 0.08) {
              const postDiff = normalizeAngleRad(desiredWorldYaw - this.targetOrbitWorldYaw);
              const maxLag = 0.16 - centerLockBoost * 0.11;
              if (Math.abs(postDiff) > maxLag) {
                this.targetOrbitWorldYaw = desiredWorldYaw - Math.sign(postDiff) * maxLag;
              }
            }
          }

          const isRollIdle =
            !isManuallyAdjustingOrbit &&
            (this.orbitRollLastInteractTime === 0 ||
              nowMs - this.orbitRollLastInteractTime > DEFAULT_CHASE_CAMERA.rollResetDelayMs);
          if (
            isRollIdle &&
            (Math.abs(this.targetOrbitRoll) > 0.0001 || Math.abs(this.orbitRoll) > 0.0001)
          ) {
            const rollResetDamp = 1 - Math.exp(-DEFAULT_CHASE_CAMERA.rollResetDampRate * dt);
            this.targetOrbitRoll += (0 - this.targetOrbitRoll) * rollResetDamp;
            if (Math.abs(this.targetOrbitRoll) < 0.0005) this.targetOrbitRoll = 0;
          }

          const angRate = 16 + centerLockBoost * 18;
          const angDamp = this.isDraggingOrbit ? 1.0 : 1 - Math.exp(-angRate * dt);
          const worldDiff = normalizeAngleRad(this.targetOrbitWorldYaw - this.orbitWorldYaw);
          this.orbitWorldYaw += worldDiff * angDamp;
          this.orbitPitch += (this.targetOrbitPitch - this.orbitPitch) * angDamp;
          this.orbitDist += (this.targetOrbitDist - this.orbitDist) * (1 - Math.exp(-16 * dt));
          this.orbitRoll += (this.targetOrbitRoll - this.orbitRoll) * angDamp;
          if (Math.abs(this.orbitRoll) < 0.0002 && this.targetOrbitRoll === 0) this.orbitRoll = 0;

          const cosP = Math.cos(this.orbitPitch);
          const sinP = Math.sin(this.orbitPitch);
          const sinY = Math.sin(this.orbitWorldYaw);
          const cosY = Math.cos(this.orbitWorldYaw);

          const pivotX = focusCar.x;
          const pivotY = focusCar.y + DEFAULT_CHASE_CAMERA.pivotHeight;
          const pivotZ = focusCar.z;

          const rawCamX = pivotX + sinY * cosP * this.orbitDist;
          const rawCamY = pivotY + sinP * this.orbitDist;
          const rawCamZ = pivotZ + cosY * cosP * this.orbitDist;
          const clampedCamY = Math.max(focusCar.y + DEFAULT_CHASE_CAMERA.minHeightAboveCar, rawCamY);

          _camCurrPos.set(rawCamX, clampedCamY, rawCamZ);
          _camCurrLook.set(pivotX, pivotY, pivotZ);

          if (Math.abs(this.orbitRoll) > 0.0001) {
            _orbitLookFwd.subVectors(_camCurrLook, _camCurrPos).normalize();
            _orbitUp.set(0, 1, 0).applyAxisAngle(_orbitLookFwd, this.orbitRoll);
            this.camera.up.copy(_orbitUp);
          } else {
            this.camera.up.set(0, 1, 0);
          }
          this.camera.position.copy(_camCurrPos);
          this.camera.lookAt(_camCurrLook);

          const targetFov = 52 + Math.min(10, (focusCar.speed / 60) * 8);
          if (Math.abs(this.camera.fov - targetFov) > 0.1) {
            this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
            this.camera.updateProjectionMatrix();
          }
        } else {
          let lookOffset: { yaw: number; pitch: number } | undefined;
          if (mode === 'hood') {
            const targetHoodYaw = gp.cameraX * 0.95;
            const targetHoodPitch = gp.cameraY * 0.26;
            const lookDamp = 1 - Math.exp(-12 * dt);
            this.hoodLookYaw += (targetHoodYaw - this.hoodLookYaw) * lookDamp;
            this.hoodLookPitch += (targetHoodPitch - this.hoodLookPitch) * lookDamp;
            if (Math.abs(this.hoodLookYaw) < 0.001 && targetHoodYaw === 0) this.hoodLookYaw = 0;
            if (Math.abs(this.hoodLookPitch) < 0.001 && targetHoodPitch === 0) this.hoodLookPitch = 0;
            if (this.hoodLookYaw !== 0 || this.hoodLookPitch !== 0) {
              lookOffset = { yaw: this.hoodLookYaw, pitch: this.hoodLookPitch };
            }
          }
          const focusRig = this.carRigs.get(focusCar.id);
          isLookingBack = keysPressed.has(settings.keybinds.lookBack) || gp.lookBackPressed;
          const broadcastStation =
            mode === 'tv-broadcast'
              ? selectBroadcastStation(this.broadcastStations, focusCar.x, focusCar.z)
              : undefined;
          const camFrame = computeCameraFrame(
            mode,
            {
              x: focusCar.x,
              y: focusCar.y,
              z: focusCar.z,
              heading: focusCar.heading,
              pitch: focusCar.pitch,
              roll: focusCar.roll,
              speed: focusCar.speed,
              hoodMount: focusRig?.hoodMount,
              carSpec: focusCar.carSpec,
            },
            pPitch,
            pRoll,
            lookOffset,
            {
              fovOffset: settings.fovOffset,
              chaseDistanceOffset: settings.chaseDistanceOffset,
              chaseHeightOffset: settings.chaseHeightOffset,
              lookToApex: settings.lookToApex,
              steerAngle: focusCar.steerAngle,
              lookBack: isLookingBack,
              broadcastStation,
            },
          );

          if (camFrame.isLocked) {
            _camCurrPos.set(camFrame.position.x, camFrame.position.y, camFrame.position.z);
            _camCurrLook.set(camFrame.lookAt.x, camFrame.lookAt.y, camFrame.lookAt.z);
            if (camFrame.up) {
              this.camera.up.set(camFrame.up.x, camFrame.up.y, camFrame.up.z);
            } else {
              this.camera.up.set(0, 1, 0);
            }
            this.camera.position.copy(_camCurrPos);
            this.camera.lookAt(_camCurrLook);
            if (Math.abs(this.camera.fov - camFrame.fov) > 0.05) {
              this.camera.fov = camFrame.fov;
              this.camera.updateProjectionMatrix();
            }
          } else {
            _camDesiredPos.set(camFrame.position.x, camFrame.position.y, camFrame.position.z);
            _camDesiredLook.set(camFrame.lookAt.x, camFrame.lookAt.y, camFrame.lookAt.z);
            const dampPos = 1 - Math.exp(-8.5 * dt);
            const dampLook = 1 - Math.exp(-12 * dt);
            _camCurrPos.lerp(_camDesiredPos, dampPos);
            _camCurrLook.lerp(_camDesiredLook, dampLook);
            this.camera.up.set(0, 1, 0);
            this.camera.position.copy(_camCurrPos);
            this.camera.lookAt(_camCurrLook);
            if (Math.abs(this.camera.fov - camFrame.fov) > 0.1) {
              this.camera.fov += (camFrame.fov - this.camera.fov) * Math.min(1, dt * 6);
              this.camera.updateProjectionMatrix();
            }
          }
        }

        if (engine.trauma > 0.005) {
          const isHoodShake = mode === 'hood';
          const shake = engine.trauma * engine.trauma * (isHoodShake ? 0.1 : 0.45);
          const dx = (Math.random() - 0.5) * shake;
          const rawDy = (Math.random() - 0.5) * shake;
          this.camera.position.x += dx;
          this.camera.position.y += isHoodShake ? Math.max(-0.04, rawDy) : rawDy;
          engine.trauma = Math.max(0, engine.trauma - dt * 2.4);
        }

        const liveSpeedKmh = Math.round(focusCar.speed * SPEED_KMH_FACTOR);
        if (!focusCar.isPlayer && engine.countdown > 0 && engine.activeStartType !== 'rolling') {
          audio.updateEngine(0, 0, focusCar.carSpec.engineType, false);
        } else {
          const engineLoad = focusCar.isPlayer
            ? focusCar.gear === -1 && focusCar.transmissionMode !== 'manual'
              ? brake
              : throttle
            : focusCar.speed < 2.0
            ? 0.04
            : Math.min(0.82, 0.24 + focusCar.rpmNormalized * 0.56);
          audio.updateEngine(
            focusCar.rpmNormalized,
            engineLoad,
            focusCar.carSpec.engineType,
            true,
            focusCar.carSpec.classId,
            focusCar.isPlayer ? brake > 0 : false,
            liveSpeedKmh,
            focusCar.carSpec.id,
            focusCar.lateralSlip,
            focusCar.onKerb,
            focusCar.gear,
            focusCar.carSpec.soundProfile,
            focusCar.revLimiterActive,
          );
        }
      }
    } else {
      audio.updateEngine(0, 0, 'v8-hybrid', false);
    }

    // 4. Sync Car 3D Rigs, Wheels, Damage, Lights, Debris & Smoke
    this.syncCarRigsAndParticles(dt, nowMs, phase, engine);

    // 5. Sync Nametags, Slipstream Streaks & Rain
    this.syncNametagsAndAtmosphere(nowMs, phase, sessionMode, playerCar, engine);

    // 7. Time-of-Day Sky/Shadows (tight ~85x85m focus frustum), Track Props, Audio Listener, VFX & Post-Processing
    if (phase === 'playing' || phase === 'qualifying') {
      const hr = engine.timeOfDayHours;
      const sunElev = Math.sin(((hr - 6) / 12) * Math.PI);
      const dayBlend = Math.max(0, Math.min(1, (sunElev + 0.15) / 0.85));
      const nightBlend = 1 - dayBlend;
      const goldenBlend = Math.max(0, 1 - Math.abs(sunElev - 0.14) / 0.28);

      if (engine.weatherSystem.rainIntensity > 0.72 && Math.random() < dt * 0.16) {
        this.lightningFlash = 1.0;
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 5.5);
      }

      const sunAngle = ((hr - 6) / 12) * Math.PI;
      const focusAnchor = playerCar ?? engine.cars[0];
      if (focusAnchor) {
        this.sun.target.position.set(focusAnchor.x, focusAnchor.y, focusAnchor.z);
        this.sun.position.set(
          focusAnchor.x + Math.cos(sunAngle) * 140,
          focusAnchor.y + Math.max(32, Math.sin(sunAngle) * 175),
          focusAnchor.z + 85,
        );
        this.sun.target.updateMatrixWorld();
        this.sun.shadow.camera.updateProjectionMatrix();
      }
      this.sun.intensity = Math.max(0.28, dayBlend * 1.95) + this.lightningFlash * 2.2;
      if (goldenBlend > 0.35) {
        this.sun.color.setHex(0xffa75e);
      } else if (nightBlend > 0.65) {
        this.sun.color.setHex(0x8bb4ff);
      } else {
        this.sun.color.setHex(0xfff1d6);
      }
      this.hemi.intensity = Math.max(0.32, 0.32 + dayBlend * 0.55) + this.lightningFlash * 0.6;
      this.trackScene?.setNightLights(nightBlend);

      if (this.trackScene?.roadMat) {
        this.trackScene.roadMat.roughness = Math.max(0.18, 0.86 - engine.trackWetness * 0.64);
        this.trackScene.roadMat.metalness = 0.04 + engine.trackWetness * 0.24;
      }

      const yellowSectors: number[] = [];
      engine.raceControl.sectorFlags.forEach((f, idx) => {
        if (f === 'yellow') yellowSectors.push(idx + 1);
      });
      this.trackScene?.updateMarshalFlags(
        engine.raceControl.globalFlag,
        engine.raceElapsed,
        yellowSectors,
      );

      // Update living trackside scenery & knockable apex bollards
      if (this.trackScene?.updateTrackProps) {
        const cars = engine.cars;
        while (this.propCarStatesScratch.length < cars.length) {
          this.propCarStatesScratch.push({ x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, lap: 1 });
        }
        this.propCarStatesScratch.length = cars.length;
        let maxLap = 1;
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          const p = this.propCarStatesScratch[i];
          p.x = c.x;
          p.y = c.y;
          p.z = c.z;
          p.vx = c.vx;
          p.vz = c.vz;
          p.speed = c.speed;
          p.lap = c.lap;
          if (c.lap > maxLap) maxLap = c.lap;
        }
        const isFinalLap =
          totalLaps > 0 && maxLap >= totalLaps && sessionMode !== 'practice' && sessionMode !== 'time-trial';
        this.trackScene.updateTrackProps(
          dt,
          this.propCarStatesScratch,
          isFinalLap || engine.timedFinalLapAnnounced,
        );
      }

      // Sync Web Audio 3D listener pose directly from active camera
      this.camera.getWorldDirection(_listenerFwd);
      _listenerUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
      const listenerPose = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
        forwardX: _listenerFwd.x,
        forwardY: _listenerFwd.y,
        forwardZ: _listenerFwd.z,
        upX: _listenerUp.x,
        upY: _listenerUp.y,
        upZ: _listenerUp.z,
      };
      audio.updateListenerPose(listenerPose);

      if (focusAnchor) {
        this.vfx.update(
          dt,
          {
            x: focusAnchor.x,
            y: focusAnchor.y,
            z: focusAnchor.z,
            heading: focusAnchor.heading,
            speed: focusAnchor.speed,
            inSlipstream: focusAnchor.inSlipstream,
          },
          engine.weatherSystem.rainIntensity,
        );

        const oppInputs = engine.cars
          .filter((c) => c.id !== focusAnchor.id)
          .map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            z: c.z,
            vx: c.vx,
            vz: c.vz,
            rpmNormalized: c.rpmNormalized,
            speedMs: c.speed,
            cylinders: c.carSpec.classId === CarClassId.F1_2005 ? 10 : 8,
            isElectric: c.carSpec.classId === CarClassId.FORMULA_E,
          }));
        audio.updateOpponentEngines(
          oppInputs,
          focusAnchor.x,
          focusAnchor.z,
          focusAnchor.vx,
          focusAnchor.vz,
          focusAnchor.heading,
          listenerPose,
        );

        const inTunnel = isTrackSegmentTunnel(engine.compiledTrack, focusAnchor.trackT);
        const streetCanyon = engine.compiledTrack.spec.scenery === 'street-night' ? 0.65 : 0;
        audio.updateEnvironmentFoley({
          speedKmh: focusAnchor.speed * SPEED_KMH_FACTOR,
          wetness: engine.trackWetness,
          surface: focusAnchor.surfaceType,
          inCockpit: cameraMode === 'cockpit',
          inTunnel,
          streetCanyon,
        });

        if ((focusAnchor.lastCollisionImpact ?? 0) > 2.2) {
          audio.playImpact(Math.min(1, (focusAnchor.lastCollisionImpact ?? 0) / 14), 'car');
          params.onRumble?.(0.85, 0.75, 220);
          focusAnchor.lastCollisionImpact = 0;
        } else if ((focusAnchor.lastWallImpact ?? 0) > 2.5) {
          audio.playImpact(Math.min(1, (focusAnchor.lastWallImpact ?? 0) / 16), 'wall');
          params.onRumble?.(0.95, 0.65, 260);
          focusAnchor.lastWallImpact = 0;
        } else if (focusAnchor.isPlayer && focusAnchor.onKerb && focusAnchor.speed > 14) {
          params.onRumble?.(0.22, 0.35, 60);
        } else if (focusAnchor.isPlayer && (focusAnchor.brakeLockupIntensity ?? 0) > 0.35) {
          params.onRumble?.(0.42, 0.18, 70);
        }

        if (!this.photo.active) {
          const speedKmh = focusAnchor.speed * SPEED_KMH_FACTOR;
          const spdSens = Math.max(0, Math.min(1, (speedKmh - 170) / 170));
          const isVisorCam =
            cameraMode === 'hood' || cameraMode === 'cockpit' || cameraMode === 'bumper';
          const raindropIntensity =
            isVisorCam && engine.trackWetness > 0.35 && !settings.reducedMotion
              ? Math.min(1, (engine.trackWetness - 0.35) / 0.55)
              : 0;
          this.postProcessor.updateConfig({
            speedIntensity: settings.reducedMotion ? 0 : spdSens,
            speedKmh,
            inSlipstream: Boolean(focusAnchor.inSlipstream),
            speedEffectsEnabled: !settings.reducedMotion && settings.speedBlurEnabled,
            raindropIntensity,
            rainTime: engine.raceElapsed,
          });
        }
      }
    }

    // 8. Replay Playback Override
    if (this.replay.active) {
      const dur = engine.replayRecorder.getDuration();
      if (this.replay.playing && !this.photo.active) {
        this.replay.time += dt * this.replay.speed;
        if (this.replay.time > dur.end) this.replay.time = dur.start;
      }
      const frames = engine.replayRecorder.sampleAtTime(this.replay.time);
      if (frames && frames.length > 0) {
        for (const rf of frames) {
          const rig = this.carRigs.get(rf.id);
          if (!rig) continue;
          rig.root.position.set(rf.x, rf.y + 0.02, rf.z);
          rig.root.rotation.order = 'YXZ';
          rig.root.rotation.y = rf.heading;
          rig.root.rotation.x = -rf.pitch;
          rig.root.rotation.z = -rf.roll;
          for (const fw of rig.frontWheels) fw.rotation.y = -rf.steerAngle;
        }
        if (!this.photo.active) {
          const focusRf = frames.find((f) => f.id === this.replay.focusCarId) ?? frames[0];
          const focusRig = this.carRigs.get(focusRf.id);
          const focusSimCar = engine.cars.find((c) => c.id === focusRf.id);
          const bStation =
            this.replay.cameraMode === 'tv-broadcast'
              ? selectBroadcastStation(this.broadcastStations, focusRf.x, focusRf.z)
              : undefined;
          const rFrame = computeCameraFrame(
            this.replay.cameraMode,
            {
              x: focusRf.x,
              y: focusRf.y,
              z: focusRf.z,
              heading: focusRf.heading,
              pitch: focusRf.pitch,
              roll: focusRf.roll,
              speed: focusRf.speed,
              hoodMount: focusRig?.hoodMount,
              carSpec: focusSimCar?.carSpec,
            },
            0,
            0,
            undefined,
            { broadcastStation: bStation, steerAngle: focusRf.steerAngle },
          );
          this.camera.position.set(rFrame.position.x, rFrame.position.y, rFrame.position.z);
          this.camera.lookAt(rFrame.lookAt.x, rFrame.lookAt.y, rFrame.lookAt.z);
          this.camera.up.set(0, 1, 0);
          if (Math.abs(this.camera.fov - rFrame.fov) > 0.1) {
            this.camera.fov = rFrame.fov;
            this.camera.updateProjectionMatrix();
          }
        }
      }
      if (nowMs - this.lastReplayEmitAt > 120) {
        this.lastReplayEmitAt = nowMs;
        params.onReplayTick?.(this.getReplayState(engine));
      }
    }

    // 9. Photo Mode Free-Camera
    if (this.photo.active) {
      const moveSpd = 16 * dt;
      const fwdX = Math.sin(this.photo.camYaw);
      const fwdZ = Math.cos(this.photo.camYaw);
      const rightX = Math.cos(this.photo.camYaw);
      const rightZ = -Math.sin(this.photo.camYaw);
      if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
        this.photo.camPos.x += fwdX * moveSpd;
        this.photo.camPos.z += fwdZ * moveSpd;
      }
      if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
        this.photo.camPos.x -= fwdX * moveSpd;
        this.photo.camPos.z -= fwdZ * moveSpd;
      }
      if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
        this.photo.camPos.x -= rightX * moveSpd;
        this.photo.camPos.z -= rightZ * moveSpd;
      }
      if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
        this.photo.camPos.x += rightX * moveSpd;
        this.photo.camPos.z += rightZ * moveSpd;
      }
      if (keysPressed.has('KeyE')) this.photo.camPos.y += moveSpd * 0.7;
      if (keysPressed.has('KeyQ')) {
        this.photo.camPos.y = Math.max(0.4, this.photo.camPos.y - moveSpd * 0.7);
      }
      this.camera.position.copy(this.photo.camPos);
      const lookDist = 10;
      const lx =
        this.photo.camPos.x +
        Math.sin(this.photo.camYaw) * Math.cos(this.photo.camPitch) * lookDist;
      const ly = this.photo.camPos.y + Math.sin(this.photo.camPitch) * lookDist;
      const lz =
        this.photo.camPos.z +
        Math.cos(this.photo.camYaw) * Math.cos(this.photo.camPitch) * lookDist;
      this.camera.up.set(
        Math.sin((this.photo.rollDeg * Math.PI) / 180),
        Math.cos((this.photo.rollDeg * Math.PI) / 180),
        0,
      );
      this.camera.lookAt(lx, ly, lz);
      if (Math.abs(this.camera.fov - this.photo.fov) > 0.1) {
        this.camera.fov = this.photo.fov;
        this.camera.updateProjectionMatrix();
      }
    }

    // 10. FPS & Adaptive DPR
    if (dt > 0.001) {
      const instFps = Math.min(240, 1 / dt);
      this.fpsSmoothed = this.fpsSmoothed * 0.92 + instFps * 0.08;
      if (!this.isSoftwareGl && settings.adaptiveDpr && this.fpsSmoothed < 42) {
        this.adaptiveDprLowFrames++;
        if (this.adaptiveDprLowFrames > 90) {
          this.renderer.setPixelRatio(Math.max(0.75, this.renderer.getPixelRatio() * 0.85));
          this.adaptiveDprLowFrames = 0;
        }
      } else {
        this.adaptiveDprLowFrames = 0;
      }
    }

    // 11. Main Render Pass + Optional Top-Center 3D Virtual Rear-View Mirror (~30Hz)
    this.postProcessor.render();
    this.renderVirtualRearViewMirror({
      nowMs,
      phase,
      cameraMode,
      isAiRace,
      isLookingBack,
      settings,
      focusCar,
    });
  }

  private renderVirtualRearViewMirror(params: {
    nowMs: number;
    phase: GamePhase;
    cameraMode: CameraMode;
    isAiRace: boolean;
    isLookingBack: boolean;
    settings: GameSettings;
    focusCar: CarSimState | null;
  }): void {
    const { nowMs, phase, cameraMode, isAiRace, isLookingBack, settings, focusCar } = params;
    const isHighOrUltra =
      settings.graphicsPreset === 'high' || settings.graphicsPreset === 'ultra';
    const isCockpitMirrorMode =
      cameraMode === 'hood' || cameraMode === 'bumper' || cameraMode === 'cockpit';
    const mirrorActive =
      !this.isSoftwareGl &&
      (phase === 'playing' || phase === 'qualifying') &&
      !isAiRace &&
      !this.replay.active &&
      !this.photo.active &&
      !isLookingBack &&
      settings.showVirtualMirror &&
      isHighOrUltra &&
      isCockpitMirrorMode &&
      focusCar !== null;

    if (!mirrorActive || !focusCar) return;

    this.renderer.getSize(_rendererSize);
    const canvasW = Math.max(1, _rendererSize.x);
    const canvasH = Math.max(1, _rendererSize.y);

    // Sync scissor viewport with RaceHUD's virtual-mirror-frame bezel when mounted, else top-center fallback
    let vx = Math.round((canvasW - Math.min(MIRROR_RT_WIDTH, Math.round(canvasW * 0.25))) * 0.5);
    let vw = Math.min(MIRROR_RT_WIDTH, Math.max(160, Math.round(canvasW * 0.25)));
    let vh = Math.min(MIRROR_RT_HEIGHT, Math.max(42, Math.round(vw * (MIRROR_RT_HEIGHT / MIRROR_RT_WIDTH))));
    let vy = Math.max(0, canvasH - 12 - vh);

    if (typeof document !== 'undefined') {
      const bezel = document.querySelector('[data-testid="virtual-mirror-frame"]');
      if (bezel) {
        const bRect = bezel.getBoundingClientRect();
        const cRect = this.renderer.domElement.getBoundingClientRect();
        if (bRect.width > 24 && bRect.height > 12 && cRect.width > 0 && cRect.height > 0) {
          vw = Math.min(MIRROR_RT_WIDTH, Math.max(48, Math.round(bRect.width)));
          vh = Math.min(MIRROR_RT_HEIGHT, Math.max(20, Math.round(bRect.height)));
          vx = Math.max(0, Math.min(canvasW - vw, Math.round(bRect.left - cRect.left)));
          vy = Math.max(0, Math.min(canvasH - vh, Math.round(cRect.bottom - bRect.bottom)));
        }
      }
    }

    if (nowMs - this.lastMirrorRenderAt >= MIRROR_INTERVAL_MS || !this.hasMirrorFrame) {
      this.lastMirrorRenderAt = nowMs;
      this.hasMirrorFrame = true;
      const sinH = Math.sin(focusCar.heading);
      const cosH = Math.cos(focusCar.heading);
      this.mirrorCamera.aspect = vw / Math.max(1, vh);
      this.mirrorCamera.updateProjectionMatrix();
      this.mirrorCamera.position.set(
        focusCar.x - sinH * 1.4,
        focusCar.y + 1.24,
        focusCar.z - cosH * 1.4,
      );
      _mirrorLookAt.set(
        focusCar.x - sinH * 28,
        focusCar.y + 0.95,
        focusCar.z - cosH * 28,
      );
      this.mirrorCamera.up.set(0, 1, 0);
      this.mirrorCamera.lookAt(_mirrorLookAt);

      const focusRig = this.carRigs.get(focusCar.id);
      const prevVisible = focusRig ? focusRig.root.visible : true;
      if (focusRig) focusRig.root.visible = false;
      const prevShadow = this.renderer.shadowMap.enabled;
      this.renderer.shadowMap.enabled = false;
      try {
        this.renderer.setRenderTarget(this.mirrorTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.mirrorCamera);
      } finally {
        this.renderer.setRenderTarget(null);
        this.renderer.shadowMap.enabled = prevShadow;
        if (focusRig) focusRig.root.visible = prevVisible;
      }
    }

    if (!this.hasMirrorFrame) return;

    const prevAutoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(vx, vy, vw, vh);
      this.renderer.setScissor(vx, vy, vw, vh);
      this.renderer.clearDepth();
      this.renderer.render(this.mirrorBlitScene, this.mirrorBlitCam);
    } finally {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, canvasW, canvasH);
      this.renderer.autoClear = prevAutoClear;
    }
  }

  private syncCarRigsAndParticles(
    dt: number,
    nowMs: number,
    phase: GamePhase,
    engine: RaceSimulationEngine,
  ): void {
    for (let i = 0; i < engine.cars.length; i++) {
      const c = engine.cars[i];
      const rig = this.carRigs.get(c.id);
      if (!rig) continue;

      const trkSample = sampleTrackAtT(engine.compiledTrack, c.trackT);
      const fallbackTilt = computeRoadSurfaceTilt(trkSample, c.heading);
      const roadPitch = c.pitch ?? fallbackTilt.pitchRad;
      const roadRoll = c.roll ?? fallbackTilt.rollRad;
      const heaveLift = (c.suspensionHeave ?? 0) * 0.14 + (c.sausageKerbHop ?? 0) * 0.18;

      rig.root.position.set(c.x, c.y + 0.02 + Math.max(-0.04, heaveLift), c.z);
      rig.root.rotation.order = 'YXZ';
      rig.root.rotation.y = c.heading;
      rig.root.rotation.x = -roadPitch;
      rig.root.rotation.z = -roadRoll;

      const flatSpotJitter =
        (c.flatSpotVibration ?? 0) > 0.05 && c.speed > 8
          ? Math.sin(nowMs * 0.055 + i) * (c.flatSpotVibration ?? 0) * 0.015
          : 0;
      const suspTilt =
        (c.damage?.suspensionPullDir ?? 0) * ((c.damage?.suspension ?? 0) / 100) * 0.14;
      rig.bodyGroup.rotation.z =
        -c.steerAngle * Math.min(1, c.speed / 30) * 0.09 + flatSpotJitter + suspTilt;

      const wheelSpin = (((c.gear === -1 ? -1 : 1) * c.speed) / 0.35) * dt;
      for (const w of rig.allWheels) w.rotation.x += wheelSpin;
      for (const fw of rig.frontWheels) fw.rotation.y = -c.steerAngle;

      if (rig.headlightMats.length > 0) {
        const broken = Boolean(c.damage?.headlightBroken);
        for (let hIdx = 0; hIdx < rig.headlightMats.length; hIdx++) {
          const hMat = rig.headlightMats[hIdx];
          if (broken) {
            const flicker = ((Math.floor(nowMs / 90) + hIdx * 3 + i) % 7) === 0;
            hMat.emissiveIntensity = hIdx === 0 ? 0.02 : flicker ? 0.9 : 0.12;
          } else if (hMat.emissiveIntensity < 0.8) {
            hMat.emissiveIntensity = 1.4;
          }
        }
      }

      if (rig.brakeLightMat) {
        if (c.specialActive || c.attackModeTimer > 0) {
          const pulse = nowMs % 260 < 130;
          rig.brakeLightMat.emissive.setHex(c.attackModeTimer > 0 ? 0x38bdf8 : 0xf59e0b);
          rig.brakeLightMat.emissiveIntensity = pulse ? 3.2 : 0.8;
        } else {
          rig.brakeLightMat.emissive.setHex(0xef4444);
          rig.brakeLightMat.emissiveIntensity =
            (c.lastInputBrake ?? 0) > 0.1 ||
            (c.brakeLockupIntensity ?? 0) > 0.1 ||
            c.pitStopRemaining > 0
              ? 2.6
              : 0.55;
        }
      }
      if (rig.brakeRotorMat) {
        const bt = Math.max(c.brakeTempFront ?? 240, c.brakeTempRear ?? 220);
        rig.brakeRotorMat.emissiveIntensity =
          bt > 460 ? Math.min(2.8, ((bt - 460) / 360) * 2.8) : 0;
      }
      if (rig.rainLightMat) {
        const wetBlink =
          engine.trackWetness > 0.25 || c.ersMode === 'harvest' || c.pitStopRemaining > 0;
        rig.rainLightMat.emissiveIntensity = wetBlink ? (nowMs % 380 < 190 ? 2.8 : 0.15) : 0.15;
      }
      if (rig.headlightCones && rig.headlightCones.length > 0) {
        const nightFactor = engine.timeOfDayHours < 6.5 || engine.timeOfDayHours > 18.8;
        for (const cone of rig.headlightCones) {
          cone.visible = nightFactor && !c.damage?.headlightBroken;
        }
      }

      if (phase === 'playing' || phase === 'qualifying') {
        const prevG = engine.prevCarGears.get(c.id) ?? c.gear;
        if (c.gear < prevG && c.speed > 20 && c.carSpec.classId !== CarClassId.FORMULA_E) {
          this.vfx.spawnExhaustBackfire(
            c.x,
            c.y,
            c.z,
            c.heading,
            c.carSpec.classId !== CarClassId.F1_2005,
          );
        }
        engine.prevCarGears.set(c.id, c.gear);

        if ((c.brakeLockupIntensity ?? 0) > 0.22 || c.lateralSlip > 0.42) {
          this.vfx.spawnParticle(
            'smoke',
            c.x + (Math.random() - 0.5) * 1.1,
            c.y + 0.18,
            c.z + (Math.random() - 0.5) * 1.1,
            (Math.random() - 0.5) * 1.6,
            0.8 + Math.random() * 0.6,
            (Math.random() - 0.5) * 1.6,
            0.55,
            0.38,
            1.35,
            0xd1d5db,
          );
          if (c.speed > 12) this.vfx.addSkidmark(c.x, c.y, c.z, c.heading, 1.4);
        }
        if (engine.trackWetness > 0.22 && c.speed > 18 && Math.random() < engine.trackWetness * 0.55) {
          this.vfx.spawnParticle(
            'spray',
            c.x - Math.sin(c.heading) * 2.1 + (Math.random() - 0.5) * 1.2,
            c.y + 0.28,
            c.z - Math.cos(c.heading) * 2.1 + (Math.random() - 0.5) * 1.2,
            -Math.sin(c.heading) * c.speed * 0.22,
            1.6 + Math.random() * 1.1,
            -Math.cos(c.heading) * c.speed * 0.22,
            0.42,
            0.45,
            1.6,
            0xcbd5e1,
          );
        }
        if ((c.surfaceType === 'gravel' || c.surfaceType === 'grass') && c.speed > 8 && Math.random() < 0.5) {
          this.vfx.spawnParticle(
            'dust',
            c.x + (Math.random() - 0.5) * 1.3,
            c.y + 0.2,
            c.z + (Math.random() - 0.5) * 1.3,
            (Math.random() - 0.5) * 2.2,
            1.2 + Math.random(),
            (Math.random() - 0.5) * 2.2,
            0.6,
            0.4,
            1.5,
            0xb4966e,
          );
        }
        if (
          c.speed > 62 &&
          (c.carSpec.classId === CarClassId.F1_2026 ||
            c.carSpec.classId === CarClassId.F1_2021 ||
            c.carSpec.classId === CarClassId.F1_2005 ||
            c.carSpec.classId === CarClassId.HYPERCAR_GTP) &&
          (c.onKerb || (c.crestLoadFactor ?? 1) > 1.12) &&
          Math.random() < 0.35
        ) {
          this.vfx.spawnFloorSparks(c.x, c.y, c.z, c.heading, c.speed, 3);
        }
        if (c.mecachromeActive && Math.random() < 0.75) {
          this.vfx.spawnParticle(
            'mecachrome',
            c.x - Math.sin(c.heading) * 1.4,
            c.y + 0.58,
            c.z - Math.cos(c.heading) * 1.4,
            (Math.random() - 0.5) * 2.0,
            2.2 + Math.random() * 1.4,
            (Math.random() - 0.5) * 2.0,
            0.95,
            0.6,
            2.6,
            0xe2e8f0,
          );
        }
      }

      if (rig.rearWingFlap) {
        if (c.damage?.rearWingDetached) {
          rig.rearWingFlap.visible = false;
        } else {
          rig.rearWingFlap.visible = true;
          rig.rearWingFlap.rotation.z = ((c.damage?.rearWing ?? 0) / 100) * 0.25;
          const spType = resolveCarSpecial(c.carSpec).specialType;
          if (spType === 'active-aero' || spType === 'drs') {
            const targetRear = c.specialActive ? 0.02 : 0.42;
            rig.rearWingFlap.rotation.x +=
              (targetRear - rig.rearWingFlap.rotation.x) * Math.min(1, dt * 14);
          }
        }
      }
      if (rig.frontWingFlap) {
        if (c.damage?.frontWingDetached) {
          rig.frontWingFlap.visible = false;
        } else {
          rig.frontWingFlap.visible = true;
          rig.frontWingFlap.rotation.z = -((c.damage?.frontWing ?? 0) / 100) * 0.22;
          if (resolveCarSpecial(c.carSpec).specialType === 'active-aero') {
            const targetFront = c.specialActive ? 0.02 : 0.28;
            rig.frontWingFlap.rotation.x +=
              (targetFront - rig.frontWingFlap.rotation.x) * Math.min(1, dt * 14);
          }
        }
      }

      if ((c.debrisBurstIntensity ?? 0) > 0.12) {
        const burst = Math.min(6, Math.ceil((c.debrisBurstIntensity ?? 0) * 5));
        for (let b = 0; b < burst; b++) {
          const pItem = this.debrisPool[this.debrisCursor];
          this.debrisCursor = (this.debrisCursor + 1) % this.debrisCount;
          pItem.active = true;
          pItem.x = c.x + (Math.random() - 0.5) * 1.4;
          pItem.y = c.y + 0.5 + Math.random() * 0.4;
          pItem.z = c.z + (Math.random() - 0.5) * 1.4;
          pItem.vx = (Math.random() - 0.5) * 11;
          pItem.vy = 3.5 + Math.random() * 6.5;
          pItem.vz = (Math.random() - 0.5) * 11;
          pItem.rx = Math.random() * Math.PI;
          pItem.ry = Math.random() * Math.PI;
          pItem.life = 0;
          pItem.maxLife = 0.75 + Math.random() * 0.65;
        }
        c.debrisBurstIntensity = 0;
      }

      if ((c.brakeLockupIntensity ?? 0) > 0.28 && c.speed > 10 && Math.random() < 0.65) {
        const sItem = this.smokePool[this.smokeCursor];
        this.smokeCursor = (this.smokeCursor + 1) % this.smokeCount;
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        const side = Math.random() < 0.5 ? -0.75 : 0.75;
        sItem.active = true;
        sItem.x = c.x + sinH * 1.2 + cosH * side;
        sItem.y = c.y + 0.22;
        sItem.z = c.z + cosH * 1.2 - sinH * side;
        sItem.vx = -sinH * 2.0 + (Math.random() - 0.5) * 1.2;
        sItem.vy = 0.9 + Math.random() * 0.8;
        sItem.vz = -cosH * 2.0 + (Math.random() - 0.5) * 1.2;
        sItem.life = 0;
        sItem.maxLife = 0.48 + Math.random() * 0.28;
      }
    }

    let anyDebris = false;
    for (let i = 0; i < this.debrisCount; i++) {
      const d = this.debrisPool[i];
      if (!d.active) {
        _particleDummy.position.set(0, -999, 0);
        _particleDummy.scale.set(0.001, 0.001, 0.001);
        _particleDummy.updateMatrix();
        this.debrisMesh.setMatrixAt(i, _particleDummy.matrix);
        continue;
      }
      d.life += dt;
      if (d.life >= d.maxLife) {
        d.active = false;
        _particleDummy.position.set(0, -999, 0);
        _particleDummy.scale.set(0.001, 0.001, 0.001);
        _particleDummy.updateMatrix();
        this.debrisMesh.setMatrixAt(i, _particleDummy.matrix);
        continue;
      }
      anyDebris = true;
      d.vy -= 18 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.rx += 7 * dt;
      d.ry += 5 * dt;
      _particleDummy.position.set(d.x, d.y, d.z);
      _particleDummy.rotation.set(d.rx, d.ry, 0);
      _particleDummy.scale.setScalar(Math.max(0.1, 1 - d.life / d.maxLife));
      _particleDummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, _particleDummy.matrix);
    }
    this.debrisMesh.visible = anyDebris;
    if (anyDebris) this.debrisMesh.instanceMatrix.needsUpdate = true;

    let anySmoke = false;
    for (let i = 0; i < this.smokeCount; i++) {
      const s = this.smokePool[i];
      if (!s.active) {
        _particleDummy.position.set(0, -999, 0);
        _particleDummy.scale.set(0.001, 0.001, 0.001);
        _particleDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, _particleDummy.matrix);
        continue;
      }
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        _particleDummy.position.set(0, -999, 0);
        _particleDummy.scale.set(0.001, 0.001, 0.001);
        _particleDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, _particleDummy.matrix);
        continue;
      }
      anySmoke = true;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      _particleDummy.position.set(s.x, s.y, s.z);
      _particleDummy.rotation.set(s.life * 2, s.life * 1.5, 0);
      _particleDummy.scale.setScalar(0.55 + (s.life / s.maxLife) * 1.45);
      _particleDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _particleDummy.matrix);
    }
    this.smokeMesh.visible = anySmoke;
    if (anySmoke) this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  private syncNametagsAndAtmosphere(
    nowMs: number,
    phase: GamePhase,
    sessionMode: string | undefined,
    playerCar: CarSimState | null,
    engine: RaceSimulationEngine,
  ): void {
    const isAiRaceFrame = sessionMode === 'ai-race';
    const showNametags = phase === 'playing' || phase === 'qualifying' || phase === 'paused';
    for (let i = 0; i < engine.cars.length; i++) {
      const c = engine.cars[i];
      const tag = this.carNametags.get(c.id);
      if (!tag) continue;
      const hideSpectatedTag =
        isAiRaceFrame && this.spectatorCameraMode === 'spectate' && c.id === engine.spectatedCarId;
      if (!showNametags || c.isPlayer || hideSpectatedTag) {
        tag.sprite.visible = false;
        continue;
      }
      const dx = c.x - this.camera.position.x;
      const dy = c.y + tag.baseHeightOffset - this.camera.position.y;
      const dz = c.z - this.camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const style = computeNametagDistanceStyle(dist, tag.isHumanPeer);
      tag.sprite.visible = style.visible;
      if (style.visible) {
        tag.sprite.position.set(c.x, c.y + tag.baseHeightOffset + style.heightLift, c.z);
        tag.sprite.scale.set(style.scaleY * tag.aspect, style.scaleY, 1);
        tag.material.opacity = style.opacity;
      }
    }

    if (playerCar && (phase === 'playing' || phase === 'qualifying')) {
      const showSlip = playerCar.inSlipstream && playerCar.speed > 18;
      this.slipstreamMesh.visible = showSlip;
      if (showSlip) {
        const tNow = nowMs * 0.012;
        for (let i = 0; i < this.slipCount; i++) {
          const side = i % 2 === 0 ? -1.1 : 1.1;
          const ph = (tNow + i * 0.45) % 8;
          const localZ = 3.5 - ph * 1.1;
          const sinH = Math.sin(playerCar.heading);
          const cosH = Math.cos(playerCar.heading);
          _particleDummy.position.set(
            playerCar.x + sinH * localZ + cosH * side,
            playerCar.y + 0.55 + (i % 3) * 0.18,
            playerCar.z + cosH * localZ - sinH * side,
          );
          _particleDummy.rotation.set(0, playerCar.heading, 0);
          _particleDummy.scale.set(1, 1, 1);
          _particleDummy.updateMatrix();
          this.slipstreamMesh.setMatrixAt(i, _particleDummy.matrix);
        }
        this.slipstreamMesh.instanceMatrix.needsUpdate = true;
      }

      if (this.rainMesh.visible) {
        const tRain = nowMs * 0.035;
        for (let i = 0; i < this.rainCount; i++) {
          const rx = ((i * 37) % 60) - 30;
          const rz = ((i * 53) % 60) - 30;
          const ry = 22 - ((tRain + i * 1.7) % 22);
          _particleDummy.position.set(playerCar.x + rx, playerCar.y + ry, playerCar.z + rz);
          _particleDummy.rotation.set(0, 0, 0.12);
          _particleDummy.scale.set(1, 1, 1);
          _particleDummy.updateMatrix();
          this.rainMesh.setMatrixAt(i, _particleDummy.matrix);
        }
        this.rainMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      this.slipstreamMesh.visible = false;
    }
  }

  private getPinchDistance(): number | null {
    if (this.activePointers.size < 2) return null;
    const pts = Array.from(this.activePointers.values());
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  private isFreecamMode(): boolean {
    return (
      this.getPhase() === 'playing' &&
      this.getSessionMode() === 'ai-race' &&
      this.spectatorCameraMode === 'freecam'
    );
  }

  private isInteractiveOrbitMode(): boolean {
    const ph = this.getPhase();
    return (
      (ph === 'playing' || ph === 'qualifying') &&
      (this.getCameraMode() === 'orbit' ||
        (this.getSessionMode() === 'ai-race' && this.spectatorCameraMode === 'spectate'))
    );
  }

  private onPointerDown = (e: PointerEvent) => {
    this.onAudioUnlock();
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size >= 2) {
      this.lastPinchDist = this.getPinchDistance();
      this.isDraggingFreecam = false;
      this.isDraggingOrbit = false;
      return;
    }
    if (this.photo.active) {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else if (this.isFreecamMode()) {
      this.isDraggingFreecam = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else if (this.isInteractiveOrbitMode()) {
      this.isDraggingOrbit = true;
      this.orbitLastInteractTime = performance.now();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (this.activePointers.size >= 2) {
      const dist = this.getPinchDistance();
      if (dist !== null && this.lastPinchDist !== null) {
        const delta = dist - this.lastPinchDist;
        if (this.isFreecamMode()) {
          this.freecamFov = Math.max(18, Math.min(95, this.freecamFov - delta * 0.14));
        } else if (this.isInteractiveOrbitMode()) {
          this.targetOrbitDist = Math.max(
            DEFAULT_CHASE_CAMERA.minDistance,
            Math.min(DEFAULT_CHASE_CAMERA.maxDistance, this.targetOrbitDist - delta * 0.045),
          );
        }
      }
      this.lastPinchDist = dist;
      return;
    }
    if (this.photo.active && this.activePointers.size === 1) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.photo.camYaw -= dx * 0.0055;
      this.photo.camPitch = Math.max(-1.42, Math.min(1.42, this.photo.camPitch - dy * 0.0055));
      return;
    }
    if (this.isDraggingFreecam && this.isFreecamMode()) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.freecamYaw -= dx * 0.0055;
      this.freecamPitch = Math.max(-1.45, Math.min(1.45, this.freecamPitch - dy * 0.0055));
      return;
    }
    if (this.isDraggingOrbit && this.isInteractiveOrbitMode()) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.targetOrbitWorldYaw -= dx * 0.008;
      this.targetOrbitPitch = Math.max(
        DEFAULT_CHASE_CAMERA.minPitch,
        Math.min(DEFAULT_CHASE_CAMERA.maxPitch, this.targetOrbitPitch + dy * 0.006),
      );
      const nowInteract = performance.now();
      this.orbitLastInteractTime = nowInteract;
      this.orbitRollLastInteractTime = nowInteract;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) this.lastPinchDist = null;
    if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastMouseX = remaining.x;
      this.lastMouseY = remaining.y;
      return;
    }
    if (this.isDraggingOrbit) {
      this.isDraggingOrbit = false;
      const nowInteract = performance.now();
      this.orbitLastInteractTime = nowInteract;
      this.orbitRollLastInteractTime = nowInteract;
    }
    this.isDraggingFreecam = false;
  };

  private onDoubleClick = () => {
    if (this.isFreecamMode() || !this.isInteractiveOrbitMode()) return;
    const cars = this.getCars();
    const targetCar =
      cars.find((c) => c.isPlayer) ??
      cars.find((c) => c.id === this.getSpectatedCarId()) ??
      cars[0];
    this.resetGameplayCamera(targetCar);
  };

  private onWheel = (e: WheelEvent) => {
    if (this.isFreecamMode()) {
      e.preventDefault();
      const scrollDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (e.shiftKey) {
        this.freecamSpeed = Math.max(8, Math.min(140, this.freecamSpeed - scrollDelta * 0.035));
        this.freecamShiftScrollAt = performance.now();
      } else {
        this.freecamFov = Math.max(18, Math.min(95, this.freecamFov + scrollDelta * 0.035));
      }
      return;
    }
    if (this.isInteractiveOrbitMode()) {
      e.preventDefault();
      this.targetOrbitDist = Math.max(
        DEFAULT_CHASE_CAMERA.minDistance,
        Math.min(DEFAULT_CHASE_CAMERA.maxDistance, this.targetOrbitDist + e.deltaY * 0.015),
      );
    }
  };

  private onResize = () => {
    const rw = Math.max(1, Math.floor(this.container.clientWidth || window.innerWidth));
    const rh = Math.max(1, Math.floor(this.container.clientHeight || window.innerHeight));
    this.camera.aspect = rw / rh;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rw, rh, false);
    this.postProcessor.setSize(rw, rh);
    this.postProcessor.render();
  };

  public dispose(): void {
    this.disposed = true;
    this.ro.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);

    this.carRigs.forEach((rig) => rig.dispose());
    this.carRigs.clear();
    this.carNametags.forEach((tag) => {
      this.scene.remove(tag.sprite);
      tag.dispose();
    });
    this.carNametags.clear();
    this.trackScene?.dispose();
    if (this.zoneMarkersGroup) {
      this.scene.remove(this.zoneMarkersGroup);
      this.disposeGroupResources(this.zoneMarkersGroup);
      this.zoneMarkersGroup = null;
    }
    this.scene.remove(this.ghostCarGroup);
    this.disposeGroupResources(this.ghostCarGroup);
    this.debrisGeo.dispose();
    this.debrisMat.dispose();
    this.smokeGeo.dispose();
    this.smokeMat.dispose();
    this.slipGeo.dispose();
    this.slipMat.dispose();
    this.rainGeo.dispose();
    this.rainMat.dispose();
    this.mirrorTarget.dispose();
    this.mirrorBlitGeo.dispose();
    this.mirrorBlitMat.dispose();
    this.vfx.dispose();
    this.postProcessor.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export interface ViewportInputCallbacks {
  getPhase: () => GamePhase;
  getSessionMode: () => string | undefined;
  getSettings: () => GameSettings;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onCycleMfd: () => void;
  onBrakeBalance: (delta: number) => void;
  onCycleErs: () => void;
  onCycleTc: () => void;
  onFlashback: () => void;
  onTogglePhotoMode: () => void;
  onExportTelemetry: () => void;
  onSetAudioVolume: (v: number) => void;
  onSetAudioMuted: (m: boolean) => void;
  onAudioUnlock: () => void;
}

export class ViewportInputController {
  public readonly keysPressed = new Set<string>();
  public readonly gamepad = new GamepadController();
  private specialJustPressed = false;
  private shiftUpJustPressed = false;
  private shiftDownJustPressed = false;
  private cb: ViewportInputCallbacks;
  private engine: RaceSimulationEngine;
  private renderer: RaceSceneRenderer;

  constructor(
    engine: RaceSimulationEngine,
    renderer: RaceSceneRenderer,
    initialSettings: GameSettings,
    cb: ViewportInputCallbacks,
  ) {
    this.engine = engine;
    this.renderer = renderer;
    this.cb = cb;
    this.applySettings(initialSettings);
    this.gamepad.attach(window);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.clearKeys);
    window.addEventListener('pointerdown', this.unlockAudio, { capture: true, passive: true });
    window.addEventListener('touchstart', this.unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', this.unlockAudio, { capture: true, passive: true });
    window.addEventListener('apex-audio-volume', this.onAudioVol);
    window.addEventListener('apex-audio-mute', this.onAudioMute);
  }

  public applySettings(s: GameSettings): void {
    this.gamepad.setEnabled(s.controllerEnabled);
    this.gamepad.updateConfig({
      steerDeadzone: s.steerDeadzone,
      steerLinearity: s.steerLinearity,
      steerSensitivity: s.steerSensitivity,
      wheelLockDegrees: s.wheelLockDegrees,
      rumbleIntensity: s.rumbleIntensity,
      splitPedalAxes: s.splitPedalAxes,
    });
  }

  private unlockAudio = () => this.cb.onAudioUnlock();

  private onAudioVol = (e: Event) => {
    const custom = e as CustomEvent<{ volume: number }>;
    if (custom.detail && typeof custom.detail.volume === 'number') {
      this.cb.onSetAudioVolume(custom.detail.volume);
    }
  };

  private onAudioMute = (e: Event) => {
    const custom = e as CustomEvent<{ muted: boolean }>;
    if (custom.detail && typeof custom.detail.muted === 'boolean') {
      this.cb.onSetAudioMuted(custom.detail.muted);
    }
  };

  private clearKeys = () => {
    this.keysPressed.clear();
    this.specialJustPressed = false;
    this.shiftUpJustPressed = false;
    this.shiftDownJustPressed = false;
    this.gamepad.resetEdgeState();
    touchInputStore.reset();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    const code = e.code;
    const settings = this.cb.getSettings();
    const kb = settings.keybinds;
    const curPhase = this.cb.getPhase();
    const isAiRace = this.cb.getSessionMode() === 'ai-race';

    if (code === 'Escape' || code === kb.pause) {
      if (curPhase === 'playing' || curPhase === 'qualifying' || curPhase === 'paused') {
        e.preventDefault();
        this.cb.onTogglePause();
      }
      return;
    }
    if (code === kb.camera && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
      if (isAiRace) {
        this.renderer.setSpectatorCameraMode(
          this.renderer.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate',
        );
      } else {
        this.cb.onCycleCamera();
      }
      return;
    }
    if (code === 'KeyF' && !e.repeat && curPhase === 'playing' && isAiRace) {
      this.renderer.setSpectatorCameraMode(
        this.renderer.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate',
      );
      return;
    }
    if (
      (code === kb.brakeBiasDown || code === kb.brakeBiasUp) &&
      !e.repeat &&
      (curPhase === 'playing' || curPhase === 'qualifying') &&
      this.engine.cars.length > 0
    ) {
      if (isAiRace) {
        const dir = code === kb.brakeBiasUp ? 1 : -1;
        const idx = this.engine.cars.findIndex((c) => c.id === this.engine.spectatedCarId);
        const nextIdx = idx < 0 ? 0 : (idx + dir + this.engine.cars.length) % this.engine.cars.length;
        const nextCar = this.engine.cars[nextIdx];
        this.engine.spectatedCarId = nextCar.id;
        this.renderer.resetGameplayCamera(nextCar, true);
      } else {
        this.cb.onBrakeBalance(code === kb.brakeBiasUp ? 0.5 : -0.5);
      }
      return;
    }
    if (code === kb.ersMode && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying') && !isAiRace) {
      this.cb.onCycleErs();
      return;
    }
    if (code === kb.resetCamera && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
      if (!(isAiRace && this.renderer.spectatorCameraMode === 'freecam')) {
        const target =
          this.engine.cars.find((c) => c.isPlayer) ??
          this.engine.cars.find((c) => c.id === this.engine.spectatedCarId) ??
          this.engine.cars[0];
        this.renderer.resetGameplayCamera(target);
      }
      return;
    }
    if (code === kb.mute && !e.repeat) {
      this.cb.onToggleMute();
      return;
    }
    if (
      code === kb.photoMode &&
      !e.repeat &&
      (curPhase === 'playing' || curPhase === 'qualifying' || curPhase === 'paused')
    ) {
      e.preventDefault();
      this.cb.onTogglePhotoMode();
      return;
    }
    if (code === 'F8' && !e.repeat) {
      e.preventDefault();
      if (telemetryRecorder.exportManual(true)) this.cb.onExportTelemetry();
      return;
    }
    if (code === kb.flashback && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying') && !isAiRace) {
      this.cb.onFlashback();
      return;
    }
    if (code === kb.tcToggle && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
      this.cb.onCycleTc();
      return;
    }
    if (code === kb.mfdCycle && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
      e.preventDefault();
      this.cb.onCycleMfd();
      return;
    }
    if (
      (settings.transmissionMode === 'manual' || settings.transmissionMode === 'semi-auto') &&
      !e.repeat &&
      (curPhase === 'playing' || curPhase === 'qualifying')
    ) {
      if (code === kb.shiftUp) this.shiftUpJustPressed = true;
      else if (code === kb.shiftDown) this.shiftDownJustPressed = true;
    }
    if (code === kb.special && !e.repeat) this.specialJustPressed = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      if (curPhase === 'playing' || curPhase === 'qualifying') e.preventDefault();
    }
    this.keysPressed.add(code);
    this.cb.onAudioUnlock();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  public pollFrame(settings: GameSettings) {
    const gp = this.gamepad.poll();
    const touchIn = touchInputStore.consumeFrame();
    const phase = this.cb.getPhase();
    const isAiRace = this.cb.getSessionMode() === 'ai-race';

    if (phase === 'paused') {
      this.specialJustPressed = false;
      touchInputStore.reset();
      if (gp.pauseJustPressed) this.cb.onTogglePause();
    } else if (phase !== 'playing' && phase !== 'qualifying') {
      this.specialJustPressed = false;
      this.gamepad.resetEdgeState();
      touchInputStore.reset();
    } else if (!this.renderer.photo.active && !this.renderer.replay.active) {
      if (gp.hasAnyInput || touchIn.active) this.cb.onAudioUnlock();
      if (gp.pauseJustPressed) this.cb.onTogglePause();
      if (gp.cameraJustPressed) {
        if (isAiRace) {
          this.renderer.setSpectatorCameraMode(
            this.renderer.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate',
          );
        } else {
          this.cb.onCycleCamera();
        }
      }
      if (gp.resetCameraJustPressed && !(isAiRace && this.renderer.spectatorCameraMode === 'freecam')) {
        const target =
          this.engine.cars.find((c) => c.isPlayer) ??
          this.engine.cars.find((c) => c.id === this.engine.spectatedCarId) ??
          this.engine.cars[0];
        this.renderer.resetGameplayCamera(target);
      }
      if (
        (gp.lbJustPressed || gp.rbJustPressed) &&
        isAiRace &&
        this.renderer.spectatorCameraMode === 'spectate' &&
        this.engine.cars.length > 0
      ) {
        const dir = gp.rbJustPressed ? 1 : -1;
        const idx = this.engine.cars.findIndex((c) => c.id === this.engine.spectatedCarId);
        const nextIdx = idx < 0 ? 0 : (idx + dir + this.engine.cars.length) % this.engine.cars.length;
        const nextCar = this.engine.cars[nextIdx];
        this.engine.spectatedCarId = nextCar.id;
        this.renderer.resetGameplayCamera(nextCar, true);
      }
    }

    const kb = settings.keybinds;
    const boundSet = new Set(Object.values(kb));
    const kbThrottle =
      this.keysPressed.has(kb.throttle) || (!boundSet.has('ArrowUp') && this.keysPressed.has('ArrowUp'))
        ? 1
        : 0;
    const kbBrake =
      this.keysPressed.has(kb.brake) || (!boundSet.has('ArrowDown') && this.keysPressed.has('ArrowDown'))
        ? 1
        : 0;
    const kbSteer =
      (this.keysPressed.has(kb.steerRight) ||
      (!boundSet.has('ArrowRight') && this.keysPressed.has('ArrowRight'))
        ? 1
        : 0) -
      (this.keysPressed.has(kb.steerLeft) ||
      (!boundSet.has('ArrowLeft') && this.keysPressed.has('ArrowLeft'))
        ? 1
        : 0);

    const blended = blendAllDrivingInputs(
      { throttle: kbThrottle, brake: kbBrake, steer: kbSteer },
      gp,
      touchIn,
    );

    const specialJustPressed =
      this.specialJustPressed || gp.specialJustPressed || touchIn.specialJustPressed;
    const specialPressed =
      specialJustPressed ||
      this.keysPressed.has(kb.special) ||
      gp.specialPressed ||
      touchIn.specialPressed;
    const shiftUp =
      settings.transmissionMode === 'manual' &&
      (this.shiftUpJustPressed || (!isAiRace && gp.rbJustPressed));
    const shiftDown =
      settings.transmissionMode === 'manual' &&
      (this.shiftDownJustPressed || (!isAiRace && gp.lbJustPressed));

    this.specialJustPressed = false;
    this.shiftUpJustPressed = false;
    this.shiftDownJustPressed = false;

    return {
      gp,
      touchIn,
      throttle: blended.throttle,
      brake: blended.brake,
      steer: blended.steer,
      specialPressed,
      specialJustPressed,
      shiftUp,
      shiftDown,
    };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('visibilitychange', this.clearKeys);
    window.removeEventListener('pointerdown', this.unlockAudio, { capture: true });
    window.removeEventListener('touchstart', this.unlockAudio, { capture: true });
    window.removeEventListener('keydown', this.unlockAudio, { capture: true });
    window.removeEventListener('apex-audio-volume', this.onAudioVol);
    window.removeEventListener('apex-audio-mute', this.onAudioMute);
    this.gamepad.detach(window);
  }
}

export function scheduleSoftwareGlFrame(
  renderer: THREE.WebGLRenderer,
  isDisposed: () => boolean,
  onSetTimer: (id: number) => void,
  cb: () => void,
): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    if (isDisposed()) return;
    const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (status === gl.UNSIGNALED) {
      onSetTimer(window.setTimeout(poll, 5));
    } else {
      if (sync) gl.deleteSync(sync);
      onSetTimer(window.setTimeout(cb, 80));
    }
  };
  onSetTimer(window.setTimeout(poll, 5));
}
