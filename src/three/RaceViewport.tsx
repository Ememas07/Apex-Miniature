import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeCameraFrame, DEFAULT_CHASE_CAMERA } from '../game/camera';
import { CAR_CLASSES, CARS, getCarById, resolveCarSpecial } from '../game/cars';
import { GamepadController } from '../game/gamepad';
import { getGameSettings, subscribeGameSettings } from '../game/settings';
import { blendAllDrivingInputs, touchInputStore } from '../game/touchControls';
import { MultiplayerClient } from '../game/multiplayer';
import { computeNeuralAIControl } from '../game/aiNeuralPolicy';
import {
  CarSimState,
  computeRoadSurfaceTilt,
  computeRollingFormationControl,
  computeStandings,
  createCarSimState,
  getRollingFormationSpeedMs,
  requestOnTrackPitStop,
  resolveCarCollisions,
  SPEED_KMH_FACTOR,
  stepCarPhysics,
} from '../game/physics';
import { compileTrack, getTrackById, sampleTrackAtT } from '../game/tracks';
import {
  AIPersonality,
  CameraMode,
  CarClassId,
  GamePhase,
  HudSnapshot,
  PitServiceAction,
  PitStrategy,
  RaceConfig,
  RaceStartType,
  RoomPeer,
  SpectatorCameraMode,
  TireCompound,
} from '../game/types';
import { MotorsportAudioEngine } from './audioEngine';
import { BuiltCarRig } from './carBuilder';
import {
  CarNametagHandle,
  computeNametagDistanceStyle,
  createCarNametagSprite,
} from './nametagSprite';
import { buildCarRigAsync } from './objCarLoader';
import { buildTrackEnvironment, BuiltTrackScene } from './trackBuilder';
import { telemetryRecorder } from '../game/telemetryRecorder';
import {
  computeTrackSpecialZones,
  createRaceControlState,
  createWeatherSystemState,
  cycleErsMode,
  evaluateStandingStartLaunch,
  LAUNCH_RPM_SWEET_SPOT,
  RaceControlState,
  sampleLocalTrackSurfaceWeather,
  stepRaceControl,
  stepWeatherSystem,
  TrackSpecialZones,
  WeatherSystemState,
} from '../game/raceSystems';
import { DEFAULT_CAR_SETUP, normalizeCarSetup } from '../game/carSetup';

export interface SpectateControls {
  cycleCar: (dir: 1 | -1) => void;
  selectCar: (carId: string) => void;
  setCameraMode: (mode: SpectatorCameraMode) => void;
  toggleCameraMode: () => void;
}

export interface InRaceTelemetryControls {
  cycleErsMode: () => void;
  adjustBrakeBalance: (delta: number) => void;
}

interface RaceViewportProps {
  phase: GamePhase;
  raceConfig: RaceConfig;
  cameraMode: CameraMode;
  spectatorCameraMode?: SpectatorCameraMode;
  muted: boolean;
  pitStrategy: PitStrategy;
  runNonce: number;
  mpClient: MultiplayerClient;
  roomPeers: RoomPeer[];
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRaceFinish: (snapshot: HudSnapshot) => void;
  onQualifyingFinish: (qualiTime: number, gridPos: number) => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onSpectatorCameraModeChange?: (mode: SpectatorCameraMode) => void;
  onToggleMute: () => void;
  onPitHandlerReady?: (handler: (action: PitServiceAction, nextCompound?: TireCompound) => boolean) => void;
  onSpectateControlsReady?: (controls: SpectateControls) => void;
  onInRaceControlsReady?: (controls: InRaceTelemetryControls) => void;
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

const PERSONALITIES: AIPersonality[] = [
  'Late-Braker',
  'Metronome',
  'Tire-Saver',
  'Traffic-Smart',
];

const AI_NAMES = [
  'Marco Rossi', 'Liam Vance', 'Kenji Tanaka', 'Soren Lindqvist', 'Antoine Moreau', 'Julian Alboni',
  'Dieter Kruger', 'Rafael Navarro', 'Takuma Sato', 'Callum Bennett', 'Fabio Bellini', 'Niklas Becker',
  'Etienne Laurent', 'Pedro Silva', 'Henrik Weber', 'Gianni Conti', 'Bruno Vance', 'Oskar Lind',
  'Viktor Novak', 'Yuki Takahashi', 'Ryan Mercer', 'Ivan Volkov', 'Jules Mercier', 'Lorenzo Conti',
];

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

const ATTRACT_SCENARIOS: Array<{ trackId: string; classes: CarClassId[] }> = [
  { trackId: 'suzuka', classes: [CarClassId.F1_2026] },
  { trackId: 'le-mans', classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3] },
  { trackId: 'laguna-seca', classes: [CarClassId.GT3, CarClassId.GT4, CarClassId.TRACK_COUPE] },
  { trackId: 'monaco', classes: [CarClassId.FORMULA_E, CarClassId.F1_2021] },
  { trackId: 'las-vegas', classes: [CarClassId.SUPERCAR, CarClassId.GT3] },
  { trackId: 'interlagos', classes: [CarClassId.F1_2026, CarClassId.F1_2021] },
  { trackId: 'daytona-road', classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3] },
  { trackId: 'zandvoort', classes: [CarClassId.GT3, CarClassId.GT4] },
  { trackId: 'monza', classes: [CarClassId.SUPERCAR, CarClassId.F1_2021] },
  { trackId: 'spa-francorchamps', classes: [CarClassId.HYPERCAR_GTP, CarClassId.GT3] },
];

const ATTRACT_FADE_OUT_MS = 700;
const ATTRACT_HOLD_MS = 180;
const ATTRACT_FADE_IN_MS = 750;

function normalizeAngleRad(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export function RaceViewport(props: RaceViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [attractFaded, setAttractFaded] = useState(false);
  const setAttractFadedRef = useRef(setAttractFaded);
  setAttractFadedRef.current = setAttractFaded;

  const simRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    maxAniso: number;
    audio: MotorsportAudioEngine;
    trackScene: BuiltTrackScene | null;
    compiledTrack: ReturnType<typeof compileTrack>;
    cars: CarSimState[];
    carRigs: Map<string, BuiltCarRig>;
    carNametags: Map<string, CarNametagHandle>;
    countdown: number;
    activeStartType: RaceStartType;
    rollingFormationSpeed: number;
    rollingFormationLanes: Map<string, number>;
    raceElapsed: number;
    greenFlagFlash: number;
    trackWetness: number;
    rainTimer: number;
    weatherSystem: WeatherSystemState;
    raceControl: RaceControlState;
    specialZones: TrackSpecialZones;
    launchStatus: 'none' | 'perfect' | 'jump-start';
    launchStatusTimer: number;
    jumpStartTriggered: boolean;
    trauma: number;
    qualiTime: number | null;
    qualiGridPos: number | null;
    finishEmitted: boolean;
    lastHudTime: number;
    lastTelemetryTime: number;
    slipstreamMesh: THREE.InstancedMesh | null;
    rainMesh: THREE.InstancedMesh | null;
    zoneMarkersGroup: THREE.Group | null;
    keysPressed: Set<string>;
    specialJustPressed: boolean;
    worldVersion: number;
    chaseHeading: number;
    chaseLookYaw: number;
    orbitYawOffset: number;
    orbitWorldYaw: number;
    targetOrbitWorldYaw: number;
    orbitPitch: number;
    orbitDist: number;
    targetOrbitPitch: number;
    targetOrbitDist: number;
    orbitRoll: number;
    targetOrbitRoll: number;
    orbitRollLastInteractTime: number;
    isDraggingOrbit: boolean;
    orbitLastInteractTime: number;
    hoodLookYaw: number;
    hoodLookPitch: number;
    isoYawOffset: number;
    isoPitchOffset: number;
    isoLastInteractTime: number;
    lastCameraMode: CameraMode;
    spectatedCarId: string | null;
    spectatorCameraMode: SpectatorCameraMode;
    freecamPos: THREE.Vector3;
    freecamYaw: number;
    freecamPitch: number;
    freecamSpeed: number;
    freecamFov: number;
    freecamShiftScrollAt: number;
    isDraggingFreecam: boolean;
    attractIndex: number;
    attractFocusPassedHalfway: boolean;
    attractTransitionState: 'idle' | 'fading-out' | 'holding' | 'fading-in';
    attractTransitionAt: number;
    rebuildWorld: () => void;
  } | null>(null);

  // One-time WebGL mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isSoftwareGl,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || container.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(rect.height || container.clientHeight || window.innerHeight));
    renderer.setSize(w, h, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.12, 950);

    // Warm Sun + Cool Sky Hemisphere Fill
    const hemi = new THREE.HemisphereLight(0xbbe1ff, 0x2f3b2f, 0.78);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    sun.position.set(120, 180, 90);
    sun.castShadow = !isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 480;
    sun.shadow.camera.left = -190;
    sun.shadow.camera.right = 190;
    sun.shadow.camera.top = 190;
    sun.shadow.camera.bottom = -190;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rim.position.set(-140, 80, -120);
    scene.add(rim);

    // Pooled InstancedMesh for Slipstream Airflow Trails & Rain
    const slipGeo = new THREE.BoxGeometry(0.08, 0.08, 1.4);
    const slipMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const slipCount = 48;
    const slipstreamMesh = new THREE.InstancedMesh(slipGeo, slipMat, slipCount);
    slipstreamMesh.frustumCulled = false;
    scene.add(slipstreamMesh);

    const rainGeo = new THREE.BoxGeometry(0.04, 1.6, 0.04);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const rainCount = 120;
    const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    scene.add(rainMesh);

    // Pooled InstancedMesh for Carbon-Fiber Impact Debris & Brake Lock-Up Tire Smoke
    const debrisGeo = new THREE.BoxGeometry(0.16, 0.05, 0.24);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.4,
    });
    const debrisCount = 36;
    const debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, debrisCount);
    debrisMesh.frustumCulled = false;
    debrisMesh.visible = false;
    scene.add(debrisMesh);
    const debrisPool = Array.from({ length: debrisCount }, () => ({
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
    let debrisCursor = 0;

    const smokeGeo = new THREE.DodecahedronGeometry(0.28, 0);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const smokeCount = 32;
    const smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
    smokeMesh.frustumCulled = false;
    smokeMesh.visible = false;
    scene.add(smokeMesh);
    const smokePool = Array.from({ length: smokeCount }, () => ({
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
    let smokeCursor = 0;

    // Miniature 3D Safety Car with Flashing Amber/Green Roof Lightbar
    const safetyCarGroup = new THREE.Group();
    safetyCarGroup.visible = false;
    const scBodyGeo = new THREE.BoxGeometry(1.92, 0.56, 4.45);
    const scBodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.65, roughness: 0.28 });
    const scBody = new THREE.Mesh(scBodyGeo, scBodyMat);
    scBody.position.set(0, 0.52, 0);
    scBody.castShadow = !isSoftwareGl;
    safetyCarGroup.add(scBody);

    const scCabinGeo = new THREE.BoxGeometry(1.48, 0.42, 2.0);
    const scCabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.2 });
    const scCabin = new THREE.Mesh(scCabinGeo, scCabinMat);
    scCabin.position.set(0, 0.96, -0.15);
    safetyCarGroup.add(scCabin);

    const scStripeGeo = new THREE.BoxGeometry(1.95, 0.14, 4.47);
    const scStripeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.2 });
    const scStripe = new THREE.Mesh(scStripeGeo, scStripeMat);
    scStripe.position.set(0, 0.42, 0);
    safetyCarGroup.add(scStripe);

    const scLightGeo = new THREE.BoxGeometry(0.46, 0.14, 0.22);
    const scLeftLightMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.2,
    });
    const scRightLightMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.2,
    });
    const scLeftLight = new THREE.Mesh(scLightGeo, scLeftLightMat);
    scLeftLight.position.set(-0.28, 1.24, -0.1);
    const scRightLight = new THREE.Mesh(scLightGeo, scRightLightMat);
    scRightLight.position.set(0.28, 1.24, -0.1);
    safetyCarGroup.add(scLeftLight, scRightLight);
    scene.add(safetyCarGroup);

    const disposeGroupResources = (grp: THREE.Group) => {
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
    };

    const buildZoneMarkers = (compiled: ReturnType<typeof compileTrack>, zones: TrackSpecialZones): THREE.Group => {
      const grp = new THREE.Group();
      const halfW = compiled.spec.trackWidth * 0.5;

      // Illuminated off-line Formula E Attack Mode Activation Loop (cyan/magenta chevrons)
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

      // DRS Activation Start Line Markers (crisp motorsport emerald strip across track)
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
      return grp;
    };

    const audio = new MotorsportAudioEngine();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const keysPressed = new Set<string>();

    const initialTrackSpec = propsRef.current.raceConfig.customTrack || getTrackById(propsRef.current.raceConfig.trackId);
    const initialCompiled = compileTrack(initialTrackSpec);
    const initialWeatherSystem = createWeatherSystemState({
      weatherMode: propsRef.current.raceConfig.weather,
      weatherPreset: propsRef.current.raceConfig.weatherPreset,
      customTimeline: propsRef.current.raceConfig.weatherTimeline,
      compiledTrack: initialCompiled,
      totalLaps: propsRef.current.raceConfig.totalLaps,
    });
    const sim = {
      scene,
      camera,
      renderer,
      maxAniso,
      audio,
      trackScene: null as BuiltTrackScene | null,
      compiledTrack: initialCompiled,
      cars: [] as CarSimState[],
      carRigs: new Map<string, BuiltCarRig>(),
      carNametags: new Map<string, CarNametagHandle>(),
      countdown: 3.0,
      activeStartType: 'standing' as RaceStartType,
      rollingFormationSpeed: 28,
      rollingFormationLanes: new Map<string, number>(),
      raceElapsed: 0,
      greenFlagFlash: 0,
      trackWetness: initialWeatherSystem.trackWetness,
      rainTimer: 0,
      weatherSystem: initialWeatherSystem,
      raceControl: createRaceControlState(),
      specialZones: computeTrackSpecialZones(initialCompiled),
      launchStatus: 'none' as 'none' | 'perfect' | 'jump-start',
      launchStatusTimer: 0,
      jumpStartTriggered: false,
      trauma: 0,
      qualiTime: null as number | null,
      qualiGridPos: null as number | null,
      finishEmitted: false,
      lastHudTime: 0,
      lastTelemetryTime: 0,
      slipstreamMesh,
      rainMesh,
      zoneMarkersGroup: null as THREE.Group | null,
      keysPressed,
      specialJustPressed: false,
      worldVersion: 0,
      chaseHeading: 0,
      chaseLookYaw: 0,
      orbitYawOffset: 0,
      orbitWorldYaw: Math.PI,
      targetOrbitWorldYaw: Math.PI,
      orbitPitch: DEFAULT_CHASE_CAMERA.pitch,
      orbitDist: DEFAULT_CHASE_CAMERA.distance,
      targetOrbitPitch: DEFAULT_CHASE_CAMERA.pitch,
      targetOrbitDist: DEFAULT_CHASE_CAMERA.distance,
      orbitRoll: 0,
      targetOrbitRoll: 0,
      orbitRollLastInteractTime: 0,
      isDraggingOrbit: false,
      orbitLastInteractTime: 0,
      hoodLookYaw: 0,
      hoodLookPitch: 0,
      isoYawOffset: 0,
      isoPitchOffset: 0,
      isoLastInteractTime: 0,
      lastCameraMode: propsRef.current.cameraMode,
      spectatedCarId: null as string | null,
      spectatorCameraMode: (propsRef.current.spectatorCameraMode ?? 'spectate') as SpectatorCameraMode,
      freecamPos: new THREE.Vector3(0, 18, 0),
      freecamYaw: 0,
      freecamPitch: -0.32,
      freecamSpeed: 42,
      freecamFov: 58,
      freecamShiftScrollAt: 0,
      isDraggingFreecam: false,
      attractIndex: Math.floor(Math.random() * ATTRACT_SCENARIOS.length),
      attractFocusPassedHalfway: false,
      attractTransitionState: 'idle' as 'idle' | 'fading-out' | 'holding' | 'fading-in',
      attractTransitionAt: 0,
      rebuildWorld: () => {},
    };

    const resetGameplayCamera = (targetCar?: CarSimState | null, preservePitchAndDist = false) => {
      const h = targetCar?.heading ?? sim.chaseHeading;
      sim.chaseHeading = h;
      sim.chaseLookYaw = 0;
      sim.orbitYawOffset = 0;
      sim.orbitWorldYaw = sim.targetOrbitWorldYaw = h + Math.PI;
      if (!preservePitchAndDist) {
        sim.orbitPitch = sim.targetOrbitPitch = DEFAULT_CHASE_CAMERA.pitch;
        sim.orbitDist = sim.targetOrbitDist = DEFAULT_CHASE_CAMERA.distance;
      }
      sim.orbitRoll = sim.targetOrbitRoll = 0;
      sim.orbitRollLastInteractTime = 0;
      sim.orbitLastInteractTime = 0;
      sim.isoYawOffset = 0;
      sim.isoPitchOffset = 0;
      sim.isoLastInteractTime = 0;
    };

    const initFreecamFromCurrentCamera = () => {
      sim.freecamPos.copy(camera.position);
      _freecamEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      sim.freecamYaw = _freecamEuler.y;
      sim.freecamPitch = Math.max(-1.45, Math.min(1.45, _freecamEuler.x));
      sim.freecamFov = 58;
    };

    const setSpectatorCameraMode = (nextMode: SpectatorCameraMode) => {
      if (sim.spectatorCameraMode === nextMode) return;
      if (nextMode === 'freecam') {
        initFreecamFromCurrentCamera();
      } else {
        const target =
          sim.cars.find((c) => c.id === sim.spectatedCarId) ?? sim.cars[0];
        if (target) {
          resetGameplayCamera(target, true);
        }
      }
      sim.spectatorCameraMode = nextMode;
      propsRef.current.onSpectatorCameraModeChange?.(nextMode);
    };

    propsRef.current.onPitHandlerReady?.((action: PitServiceAction, nextCompound?: TireCompound) => {
      const pCar = sim.cars.find((c) => c.isPlayer);
      if (!pCar) return false;
      const ok = requestOnTrackPitStop(pCar, action, nextCompound);
      if (ok) sim.audio.playBeep(560, 0.08);
      return ok;
    });

    const cyclePlayerErsMode = () => {
      const pCar = sim.cars.find((c) => c.isPlayer);
      if (!pCar) return;
      pCar.ersMode = cycleErsMode(pCar.ersMode ?? 'balanced');
      sim.audio.playBeep(640, 0.05);
    };

    const adjustPlayerBrakeBalance = (delta: number) => {
      const pCar = sim.cars.find((c) => c.isPlayer);
      if (!pCar) return;
      const cur = pCar.setup ?? { ...DEFAULT_CAR_SETUP };
      const next = Math.max(46, Math.min(68, Math.round((cur.brakeBalance + delta) * 2) / 2));
      pCar.setup = normalizeCarSetup({ ...cur, brakeBalance: next });
      sim.audio.playBeep(500 + (next - 46) * 8, 0.04);
    };

    propsRef.current.onInRaceControlsReady?.({
      cycleErsMode: cyclePlayerErsMode,
      adjustBrakeBalance: adjustPlayerBrakeBalance,
    });

    propsRef.current.onSpectateControlsReady?.({
      cycleCar: (dir: 1 | -1) => {
        if (sim.cars.length === 0) return;
        const idx = sim.cars.findIndex((c) => c.id === sim.spectatedCarId);
        const nextIdx =
          idx < 0
            ? 0
            : (idx + dir + sim.cars.length) % sim.cars.length;
        const nextCar = sim.cars[nextIdx];
        sim.spectatedCarId = nextCar.id;
        resetGameplayCamera(nextCar, true);
        if (sim.spectatorCameraMode === 'freecam') {
          setSpectatorCameraMode('spectate');
        }
      },
      selectCar: (carId: string) => {
        const nextCar = sim.cars.find((c) => c.id === carId);
        if (nextCar) {
          sim.spectatedCarId = carId;
          resetGameplayCamera(nextCar, true);
          if (sim.spectatorCameraMode === 'freecam') {
            setSpectatorCameraMode('spectate');
          }
        }
      },
      setCameraMode: setSpectatorCameraMode,
      toggleCameraMode: () => {
        setSpectatorCameraMode(sim.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate');
      },
    });

    const rebuildWorld = () => {
      sim.worldVersion++;
      const worldVersion = sim.worldVersion;
      const cfg = propsRef.current.raceConfig;
      const currentPhase = propsRef.current.phase;
      const isTitle = currentPhase === 'title';
      const attract = ATTRACT_SCENARIOS[sim.attractIndex % ATTRACT_SCENARIOS.length];
      const trackSpec = isTitle
        ? getTrackById(attract.trackId)
        : cfg.customTrack || getTrackById(cfg.trackId);
      const compiled = compileTrack(trackSpec);
      sim.compiledTrack = compiled;

      if (sim.trackScene) {
        scene.remove(sim.trackScene.group);
        sim.trackScene.dispose();
      }
      const builtTrack = buildTrackEnvironment(compiled, maxAniso);
      sim.trackScene = builtTrack;
      scene.add(builtTrack.group);

      // Rebuild DRS & Attack Mode track zone markers
      if (sim.zoneMarkersGroup) {
        scene.remove(sim.zoneMarkersGroup);
        disposeGroupResources(sim.zoneMarkersGroup);
        sim.zoneMarkersGroup = null;
      }
      sim.specialZones = computeTrackSpecialZones(compiled);
      if (!isTitle) {
        const zm = buildZoneMarkers(compiled, sim.specialZones);
        sim.zoneMarkersGroup = zm;
        scene.add(zm);
      }

      // Initialize dynamic weather & Race Control for this session
      sim.weatherSystem = createWeatherSystemState({
        weatherMode: isTitle ? 'dry' : cfg.weather,
        weatherPreset: isTitle ? 'clear-dry' : cfg.weatherPreset,
        customTimeline: isTitle ? undefined : cfg.weatherTimeline,
        compiledTrack: compiled,
        totalLaps: cfg.totalLaps,
      });
      sim.raceControl = createRaceControlState();
      sim.launchStatus = 'none';
      sim.launchStatusTimer = 0;
      sim.jumpStartTriggered = false;
      safetyCarGroup.visible = false;
      for (let i = 0; i < debrisPool.length; i++) debrisPool[i].active = false;
      for (let i = 0; i < smokePool.length; i++) smokePool[i].active = false;
      debrisMesh.visible = false;
      smokeMesh.visible = false;

      scene.background = new THREE.Color(builtTrack.skyColor);
      scene.fog = new THREE.FogExp2(builtTrack.fogColor, 0.0017);

      // Clear old cars & dispose nametag textures/sprites
      sim.carRigs.forEach((rig) => {
        scene.remove(rig.root);
        rig.dispose();
      });
      sim.carRigs.clear();
      sim.carNametags.forEach((tag) => {
        scene.remove(tag.sprite);
        tag.dispose();
      });
      sim.carNametags.clear();
      sim.cars = [];

      const isQuali = currentPhase === 'qualifying';
      const isPractice = currentPhase === 'playing' && cfg.sessionMode === 'practice';
      const isAiRace = currentPhase === 'playing' && cfg.sessionMode === 'ai-race';
      const activeClasses = isTitle
        ? attract.classes
        : cfg.activeClasses.length > 0
        ? cfg.activeClasses
        : [getCarById(cfg.playerCarId).classId];
      const allowedCars = CARS.filter((c) => activeClasses.includes(c.classId));
      const poolCars = allowedCars.length > 0 ? allowedCars : CARS;

      // Sort classes fastest first for multi-class grid order
      const sortedPool = [...poolCars].sort(
        (a, b) => CAR_CLASSES[b.classId].basePaceIndex - CAR_CLASSES[a.classId].basePaceIndex,
      );

      const newCars: CarSimState[] = [];
      const playerSpec = getCarById(cfg.playerCarId);

      // Determine grid slot for player and peers (Practice & Qualifying are strictly solo local sessions; Host AI Race is all-AI)
      const peers =
        isQuali || isPractice || isAiRace
          ? []
          : propsRef.current.roomPeers.filter((p) => p.peerId !== propsRef.current.mpClient.peerId);
      const aiCount =
        isQuali || isPractice
          ? 0
          : isAiRace
          ? Math.max(2, Math.min(24, cfg.aiBotCount ?? cfg.gridSize ?? 12))
          : cfg.noAi
          ? 0
          : cfg.aiBotCount !== undefined
          ? Math.max(0, Math.min(23, cfg.aiBotCount))
          : Math.max(0, cfg.gridSize - 1 - peers.length);
      const totalGrid =
        isQuali || isPractice
          ? 1
          : isTitle
          ? 10
          : isAiRace
          ? aiCount
          : Math.max(1, 1 + peers.length + aiCount);
      const playerSlot =
        isQuali || isPractice
          ? 0
          : isAiRace
          ? -1
          : sim.qualiGridPos !== null
          ? Math.min(totalGrid - 1, sim.qualiGridPos - 1)
          : Math.min(totalGrid - 1, Math.floor(totalGrid * 0.45));

      const aiPaceMult = 1.0 * (cfg.aiDifficulty === 'Rookie' ? 0.84 : cfg.aiDifficulty === 'Amateur' ? 0.92 : cfg.aiDifficulty === 'Pro' ? 1.0 : 1.07);

      const useRollingStart = !isQuali && !isPractice && !isTitle && cfg.startType === 'rolling';
      const formationPoolSpecs = [
        ...(!isTitle && !isAiRace ? [{ carSpec: playerSpec }] : []),
        ...sortedPool.map((carSpec) => ({ carSpec })),
      ];
      const formationSpeedMs = getRollingFormationSpeedMs(formationPoolSpecs);
      const gridStartType: RaceStartType = useRollingStart ? 'rolling' : 'standing';
      sim.rollingFormationLanes.clear();

      let peerCursor = 0;
      let aiCursor = 0;
      for (let slot = 0; slot < totalGrid; slot++) {
        if (slot === playerSlot && !isTitle && !isAiRace) {
          const pCar = createCarSimState({
            id: 'player',
            name: 'You',
            isPlayer: true,
            carId: playerSpec.id,
            livery: cfg.playerLivery,
            gridSlot: isQuali || isPractice ? 0 : slot,
            compiledTrack: compiled,
            compound: cfg.startingCompound,
            startType: gridStartType,
            rollingSpeed: formationSpeedMs,
            setup: cfg.carSetup,
            damageLevel: cfg.damageLevel ?? 'light',
            absLevel: cfg.absLevel ?? 'low',
          });
          if (isQuali || isPractice) {
            // Flying hotlap start: place just before final corner at clean rolling speed
            const sp = sampleTrackAtT(compiled, 0.88);
            pCar.trackT = 0.88;
            pCar.prevTrackT = 0.88;
            pCar.x = sp.x;
            pCar.y = sp.y;
            pCar.z = sp.z;
            pCar.heading = Math.atan2(sp.tx, sp.tz);
            pCar.speed = isQuali ? 38 : 34;
            pCar.totalDistance = -0.12;
          }
          sim.rollingFormationLanes.set(pCar.id, pCar.lateralOffset);
          newCars.push(pCar);
        } else if (peerCursor < peers.length && currentPhase !== 'title' && !isQuali && !isPractice) {
          const peer = peers[peerCursor++];
          const peerCar = createCarSimState({
            id: peer.peerId,
            name: peer.name,
            isPlayer: false,
            isHumanPeer: true,
            carId: peer.carId,
            livery: peer.livery,
            gridSlot: slot,
            compiledTrack: compiled,
            compound: cfg.startingCompound,
            startType: gridStartType,
            rollingSpeed: formationSpeedMs,
            damageLevel: cfg.damageLevel ?? 'light',
          });
          sim.rollingFormationLanes.set(peerCar.id, peerCar.lateralOffset);
          newCars.push(peerCar);
        } else {
          // Fill remaining grid slots with AI Bots across active classes
          const pick = sortedPool[(aiCursor * 3 + slot) % sortedPool.length];
          const personality = PERSONALITIES[aiCursor % PERSONALITIES.length];
          // Genuine per-driver pace variance (wider spread on Alien so the field isn't an identical pace train)
          const spreadSlot = ((aiCursor * 17 + slot * 5) % 9) / 8; // 0..1 deterministic distribution
          const jitter =
            cfg.aiDifficulty === 'Alien'
              ? 0.925 + spreadSlot * 0.115
              : 0.965 + spreadSlot * 0.065;
          let aiLivery = {
            ...pick.defaultLivery,
            driverNumber: String(((aiCursor + 2) * 7) % 98 + 1),
          };
          const botName = AI_NAMES[aiCursor % AI_NAMES.length];

          // If car has multiple team liveries (F1 2026, F1 2021, LMP2), cycle through them across the AI grid
          if (pick.liveries && pick.liveries.length > 0) {
            const preset = pick.liveries[aiCursor % pick.liveries.length];
            aiLivery = { ...preset.livery };
          }

          const bot = createCarSimState({
            id: `ai-${aiCursor}`,
            name: botName,
            isPlayer: false,
            carId: pick.id,
            livery: aiLivery,
            gridSlot: slot,
            compiledTrack: compiled,
            compound:
              sim.weatherSystem.trackWetness > 0.30 || (cfg.weather === 'dynamic-rain' && aiCursor % 3 === 0)
                ? 'wet'
                : 'medium',
            personality,
            aiPaceMultiplier: aiPaceMult * jitter,
            startType: gridStartType,
            rollingSpeed: formationSpeedMs,
            damageLevel: cfg.damageLevel ?? 'light',
            absLevel: 'low',
          });
          if (currentPhase === 'title') {
            // Spread title cars gracefully around the track for a live world showcase!
            // Start focus car (slot 0) cleanly past the S/F line so lap completion triggers after 1 full lap.
            const t = (0.015 + slot / totalGrid) % 1;
            const sp = sampleTrackAtT(compiled, t);
            bot.trackT = t;
            bot.prevTrackT = t;
            bot.x = sp.x + sp.nx * ((slot % 2 === 0 ? -1 : 1) * 2.5);
            bot.y = sp.y;
            bot.z = sp.z + sp.nz * ((slot % 2 === 0 ? -1 : 1) * 2.5);
            bot.heading = Math.atan2(sp.tx, sp.tz);
            bot.speed = 34;
            bot.lap = 1;
            bot.totalDistance = t;
          }
          sim.rollingFormationLanes.set(bot.id, bot.lateralOffset);
          newCars.push(bot);
          aiCursor++;
        }
      }

      // Brief spawn ghosting on multi-car launches prevents gridlock & pileups (longer on rolling to cover formation)
      if (newCars.length > 1 && !isQuali && !isPractice && currentPhase !== 'title') {
        const ghostSec = useRollingStart ? 5.5 : 2.5;
        for (const c of newCars) {
          c.spawnGhostTimer = ghostSec;
        }
      }

      sim.cars = newCars;
      for (const c of newCars) {
        buildCarRigAsync(c.carSpec, c.livery, maxAniso).then((rig) => {
          if (disposed || worldVersion !== sim.worldVersion) {
            rig.dispose();
            return;
          }
          rig.root.position.set(c.x, c.y, c.z);
          rig.root.rotation.y = c.heading;
          scene.add(rig.root);
          sim.carRigs.set(c.id, rig);
        });

        // Create floating billboarded nametag ONCE on spawn for all remote players & AI (hide on local player's car)
        if (!c.isPlayer && currentPhase !== 'title') {
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
            maxAniso,
          );
          tag.sprite.position.set(c.x, c.y + tag.baseHeightOffset, c.z);
          scene.add(tag.sprite);
          sim.carNametags.set(c.id, tag);
        }
      }

      const isAutostart = typeof window !== 'undefined' && window.location.search.includes('autostart=1');
      sim.activeStartType = gridStartType;
      sim.rollingFormationSpeed = formationSpeedMs;
      sim.raceElapsed = 0;
      sim.greenFlagFlash = 0;
      sim.countdown =
        currentPhase === 'playing' && !isPractice && !isAutostart
          ? useRollingStart
            ? 3.2
            : 2.0
          : 0;
      sim.trackWetness = sim.weatherSystem.trackWetness;
      sim.rainTimer = 0;
      sim.trauma = 0;
      sim.finishEmitted = false;
      sim.spectatedCarId = newCars[0]?.id ?? null;
      sim.spectatorCameraMode = isAiRace ? (propsRef.current.spectatorCameraMode ?? 'spectate') : 'spectate';

      // Reset behavioral cloning telemetry recorder for playable sessions
      const playerAnchor = newCars.find((c) => c.isPlayer);
      if (playerAnchor && !isTitle) {
        telemetryRecorder.resetSession();
      }

      sim.attractFocusPassedHalfway = false;

      // Position camera initially behind player or lead car
      const anchor = playerAnchor ?? newCars[0];
      if (anchor) {
        resetGameplayCamera(anchor);
        if (isTitle) {
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
          camera.up.set(0, 1, 0);
          camera.position.copy(_camCurrPos);
          camera.lookAt(_camCurrLook);
        } else {
          const initSample = sampleTrackAtT(compiled, anchor.trackT);
          const initTilt = computeRoadSurfaceTilt(initSample, anchor.heading);
          const initFrame = computeCameraFrame(
            isAiRace ? 'orbit' : propsRef.current.cameraMode,
            anchor,
            anchor.pitch ?? initTilt.pitchRad,
            anchor.roll ?? initTilt.rollRad,
          );
          _camCurrPos.set(initFrame.position.x, initFrame.position.y, initFrame.position.z);
          _camCurrLook.set(initFrame.lookAt.x, initFrame.lookAt.y, initFrame.lookAt.z);
          if (initFrame.up) {
            camera.up.set(initFrame.up.x, initFrame.up.y, initFrame.up.z);
          } else {
            camera.up.set(0, 1, 0);
          }
          camera.position.copy(_camCurrPos);
          camera.lookAt(_camCurrLook);
        }
        initFreecamFromCurrentCamera();
        sim.freecamPos.y = Math.max(anchor.y + 12, sim.freecamPos.y + 8);
      }
    };

    sim.rebuildWorld = rebuildWorld;
    simRef.current = sim;
    rebuildWorld();

    // Unified keyboard input listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const code = e.code;
      const curPhase = propsRef.current.phase;

      if (code === 'Escape' || code === 'KeyP') {
        if (curPhase === 'playing' || curPhase === 'qualifying' || curPhase === 'paused') {
          e.preventDefault();
          propsRef.current.onTogglePause();
        }
        return;
      }
      if (code === 'KeyC' && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
        if (propsRef.current.raceConfig.sessionMode === 'ai-race') {
          setSpectatorCameraMode(sim.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate');
        } else {
          propsRef.current.onCycleCamera();
        }
        return;
      }
      if (code === 'KeyF' && !e.repeat && curPhase === 'playing' && propsRef.current.raceConfig.sessionMode === 'ai-race') {
        setSpectatorCameraMode(sim.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate');
        return;
      }
      if (
        (code === 'BracketLeft' || code === 'BracketRight') &&
        !e.repeat &&
        (curPhase === 'playing' || curPhase === 'qualifying') &&
        sim.cars.length > 0
      ) {
        if (propsRef.current.raceConfig.sessionMode === 'ai-race') {
          const dir = code === 'BracketRight' ? 1 : -1;
          const idx = sim.cars.findIndex((c) => c.id === sim.spectatedCarId);
          const nextIdx = idx < 0 ? 0 : (idx + dir + sim.cars.length) % sim.cars.length;
          const nextCar = sim.cars[nextIdx];
          sim.spectatedCarId = nextCar.id;
          resetGameplayCamera(nextCar, true);
        } else {
          adjustPlayerBrakeBalance(code === 'BracketRight' ? 0.5 : -0.5);
        }
        return;
      }
      if (
        code === 'KeyB' &&
        !e.repeat &&
        (curPhase === 'playing' || curPhase === 'qualifying') &&
        propsRef.current.raceConfig.sessionMode !== 'ai-race'
      ) {
        cyclePlayerErsMode();
        return;
      }
      if (code === 'KeyR' && !e.repeat && (curPhase === 'playing' || curPhase === 'qualifying')) {
        if (!(propsRef.current.raceConfig.sessionMode === 'ai-race' && sim.spectatorCameraMode === 'freecam')) {
          const targetCar =
            sim.cars.find((c) => c.isPlayer) ??
            sim.cars.find((c) => c.id === sim.spectatedCarId) ??
            sim.cars[0];
          resetGameplayCamera(targetCar);
        }
        return;
      }
      if (code === 'KeyM' && !e.repeat) {
        propsRef.current.onToggleMute();
        return;
      }
      if (code === 'F9' && !e.repeat) {
        e.preventDefault();
        const exported = telemetryRecorder.exportManual(true);
        if (exported) sim.audio.playBeep(880, 0.08);
        return;
      }
      if ((code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyE') && !e.repeat) {
        sim.specialJustPressed = true;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        if (curPhase === 'playing' || curPhase === 'qualifying') e.preventDefault();
      }
      keysPressed.add(code);
      sim.audio.init();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };

    const gamepadController = new GamepadController();
    gamepadController.setEnabled(getGameSettings().controllerEnabled);
    const unsubscribeGameSettings = subscribeGameSettings((next) => {
      gamepadController.setEnabled(next.controllerEnabled);
    });
    gamepadController.attach(window);

    const clearKeys = () => {
      keysPressed.clear();
      sim.specialJustPressed = false;
      gamepadController.resetEdgeState();
      touchInputStore.reset();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);

    let lastMouseX = 0;
    let lastMouseY = 0;
    const activeCanvasPointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist: number | null = null;

    const getPinchDistance = (): number | null => {
      if (activeCanvasPointers.size < 2) return null;
      const pts = Array.from(activeCanvasPointers.values());
      return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    };

    const isFreecamMode = () =>
      propsRef.current.phase === 'playing' &&
      propsRef.current.raceConfig.sessionMode === 'ai-race' &&
      sim.spectatorCameraMode === 'freecam';

    const isInteractiveOrbitMode = () =>
      (propsRef.current.phase === 'playing' || propsRef.current.phase === 'qualifying') &&
      (propsRef.current.cameraMode === 'orbit' ||
        (propsRef.current.raceConfig.sessionMode === 'ai-race' && sim.spectatorCameraMode === 'spectate'));

    const onPointerDown = (e: PointerEvent) => {
      sim.audio.init();
      activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeCanvasPointers.size >= 2) {
        lastPinchDist = getPinchDistance();
        sim.isDraggingFreecam = false;
        sim.isDraggingOrbit = false;
        return;
      }
      if (isFreecamMode()) {
        sim.isDraggingFreecam = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      } else if (isInteractiveOrbitMode()) {
        sim.isDraggingOrbit = true;
        sim.orbitLastInteractTime = performance.now();
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activeCanvasPointers.has(e.pointerId)) {
        activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activeCanvasPointers.size >= 2) {
        const dist = getPinchDistance();
        if (dist !== null && lastPinchDist !== null) {
          const delta = dist - lastPinchDist;
          if (isFreecamMode()) {
            sim.freecamFov = Math.max(18, Math.min(95, sim.freecamFov - delta * 0.14));
          } else if (isInteractiveOrbitMode()) {
            sim.targetOrbitDist = Math.max(
              DEFAULT_CHASE_CAMERA.minDistance,
              Math.min(DEFAULT_CHASE_CAMERA.maxDistance, sim.targetOrbitDist - delta * 0.045),
            );
          }
        }
        lastPinchDist = dist;
        return;
      }
      if (sim.isDraggingFreecam && isFreecamMode()) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        sim.freecamYaw -= dx * 0.0055;
        sim.freecamPitch = Math.max(-1.45, Math.min(1.45, sim.freecamPitch - dy * 0.0055));
        return;
      }
      if (sim.isDraggingOrbit && isInteractiveOrbitMode()) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        sim.targetOrbitWorldYaw -= dx * 0.008;
        sim.targetOrbitPitch = Math.max(
          DEFAULT_CHASE_CAMERA.minPitch,
          Math.min(DEFAULT_CHASE_CAMERA.maxPitch, sim.targetOrbitPitch + dy * 0.006),
        );
        const nowInteract = performance.now();
        sim.orbitLastInteractTime = nowInteract;
        sim.orbitRollLastInteractTime = nowInteract;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activeCanvasPointers.delete(e.pointerId);
      if (activeCanvasPointers.size < 2) {
        lastPinchDist = null;
      }
      if (activeCanvasPointers.size === 1) {
        const remaining = Array.from(activeCanvasPointers.values())[0];
        lastMouseX = remaining.x;
        lastMouseY = remaining.y;
        return;
      }
      if (sim.isDraggingOrbit) {
        sim.isDraggingOrbit = false;
        const nowInteract = performance.now();
        sim.orbitLastInteractTime = nowInteract;
        sim.orbitRollLastInteractTime = nowInteract;
      }
      sim.isDraggingFreecam = false;
    };

    const onDoubleClick = () => {
      if (isFreecamMode()) return;
      if (!isInteractiveOrbitMode()) return;
      const targetCar =
        sim.cars.find((c) => c.isPlayer) ??
        sim.cars.find((c) => c.id === sim.spectatedCarId) ??
        sim.cars[0];
      resetGameplayCamera(targetCar);
    };

    const onWheel = (e: WheelEvent) => {
      if (isFreecamMode()) {
        e.preventDefault();
        // Shift+Scroll on some OSes maps wheel delta to deltaX; read whichever axis carries the scroll
        const scrollDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const isShift = e.shiftKey || keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight');
        if (isShift) {
          sim.freecamSpeed = Math.max(8, Math.min(140, sim.freecamSpeed - scrollDelta * 0.035));
          sim.freecamShiftScrollAt = performance.now();
        } else {
          // Scroll up (negative delta) zooms in (narrower FOV); scroll down zooms out (wider FOV)
          sim.freecamFov = Math.max(18, Math.min(95, sim.freecamFov + scrollDelta * 0.035));
        }
        return;
      }
      if (isInteractiveOrbitMode()) {
        e.preventDefault();
        sim.targetOrbitDist = Math.max(
          DEFAULT_CHASE_CAMERA.minDistance,
          Math.min(DEFAULT_CHASE_CAMERA.maxDistance, sim.targetOrbitDist + e.deltaY * 0.015),
        );
      }
    };

    const onAudioVol = (e: Event) => {
      const custom = e as CustomEvent<{ volume: number }>;
      if (custom.detail && typeof custom.detail.volume === 'number') {
        sim.audio.setVolume(custom.detail.volume);
      }
    };

    const onAudioMute = (e: Event) => {
      const custom = e as CustomEvent<{ muted: boolean }>;
      if (custom.detail && typeof custom.detail.muted === 'boolean') {
        sim.audio.setMuted(custom.detail.muted);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('apex-audio-volume', onAudioVol);
    window.addEventListener('apex-audio-mute', onAudioMute);

    const onResize = () => {
      const rw = Math.max(1, Math.floor(container.clientWidth || window.innerWidth));
      const rh = Math.max(1, Math.floor(container.clientHeight || window.innerHeight));
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh, false);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Continuous Game Loop with Software-WebGL afterDraw pacing
    let frameId = 0;
    let lastTime = performance.now();
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const p = propsRef.current;
      const activePhase = p.phase;
      sim.audio.setMuted(p.muted);

      const playerCar = sim.cars.find((c) => c.isPlayer) ?? null;

      if (activePhase === 'paused') {
        sim.specialJustPressed = false;
        touchInputStore.reset();
        const gpPaused = gamepadController.poll();
        if (gpPaused.pauseJustPressed) {
          p.onTogglePause();
        }
      } else if (activePhase !== 'playing' && activePhase !== 'qualifying') {
        sim.specialJustPressed = false;
        gamepadController.resetEdgeState();
        touchInputStore.reset();
      }

      if (activePhase !== 'title' && sim.attractTransitionState !== 'idle') {
        sim.attractTransitionState = 'idle';
        setAttractFadedRef.current(false);
      }

      if (activePhase === 'title') {
        // Live world tour: AI cars race smoothly around the circuit while camera glides!
        for (let i = 0; i < sim.cars.length; i++) {
          const c = sim.cars[i];
          const aiIn = computeNeuralAIControl(c, sim.compiledTrack, sim.cars, dt, 0, 'Alien');
          stepCarPhysics(c, aiIn, sim.compiledTrack, dt, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: sim.cars,
          });
        }
        resolveCarCollisions(sim.cars);

        // Cycle to the next attract track only after the focus car has completed a full lap,
        // using a smooth fade-out -> track switch -> fade-in transition.
        const focusLead = sim.cars[0];
        if (sim.attractTransitionState === 'idle' && focusLead) {
          if (focusLead.trackT >= 0.4 && focusLead.trackT <= 0.75) {
            sim.attractFocusPassedHalfway = true;
          }
          if (sim.attractFocusPassedHalfway && focusLead.lap >= 2) {
            sim.attractTransitionState = 'fading-out';
            sim.attractTransitionAt = now + ATTRACT_FADE_OUT_MS;
            setAttractFadedRef.current(true);
          }
        } else if (sim.attractTransitionState === 'fading-out' && now >= sim.attractTransitionAt) {
          sim.attractIndex = (sim.attractIndex + 1) % ATTRACT_SCENARIOS.length;
          rebuildWorld();
          sim.attractTransitionState = 'holding';
          sim.attractTransitionAt = now + ATTRACT_HOLD_MS;
        } else if (sim.attractTransitionState === 'holding' && now >= sim.attractTransitionAt) {
          sim.attractTransitionState = 'fading-in';
          sim.attractTransitionAt = now + ATTRACT_FADE_IN_MS;
          setAttractFadedRef.current(false);
        } else if (sim.attractTransitionState === 'fading-in' && now >= sim.attractTransitionAt) {
          sim.attractTransitionState = 'idle';
        }

        // Smooth camera flyover following focus car
        const lead = sim.cars[0];
        if (lead) {
          const orbitAngle = now * 0.00024;
          const dist = 28 + Math.sin(now * 0.00017) * 7;
          const elev = 14 + Math.cos(now * 0.00021) * 5;
          _camDesiredPos.set(
            lead.x + Math.cos(orbitAngle) * dist,
            lead.y + elev,
            lead.z + Math.sin(orbitAngle) * dist,
          );
          _camDesiredLook.set(lead.x, lead.y + 0.6, lead.z);
          const damp = 1 - Math.exp(-3.5 * dt);
          _camCurrPos.lerp(_camDesiredPos, damp);
          _camCurrLook.lerp(_camDesiredLook, damp);
          camera.up.set(0, 1, 0);
          camera.position.copy(_camCurrPos);
          camera.lookAt(_camCurrLook);
        }
        sim.audio.updateEngine(0, 0, 'v8-hybrid', false);
      } else if (activePhase === 'playing' || activePhase === 'qualifying') {
        const isQuali = activePhase === 'qualifying';
        const isPractice = activePhase === 'playing' && p.raceConfig.sessionMode === 'practice';
        if (sim.countdown > 0) {
          const prevCeil = Math.ceil(sim.countdown);
          const countdownStep = Math.min(Math.max(rawDt, 0.001), 0.35);
          sim.countdown = Math.max(0, sim.countdown - countdownStep);
          const nextCeil = Math.ceil(sim.countdown);
          if (nextCeil < prevCeil && nextCeil > 0) {
            sim.audio.playBeep(520, 0.12);
          } else if (sim.countdown === 0 && prevCeil > 0) {
            sim.audio.playBeep(880, 0.28);
            sim.greenFlagFlash = 1.4;
            // Standing-start launch & jump-start evaluation at lights out
            if (sim.activeStartType === 'standing' && playerCar && !isQuali && !isPractice) {
              const launchEval = evaluateStandingStartLaunch({
                rpmNormalized: playerCar.rpmNormalized,
                jumpStartTriggered: sim.jumpStartTriggered && p.raceConfig.jumpStartEnabled !== false,
              });
              sim.launchStatus = launchEval.status;
              sim.launchStatusTimer = launchEval.status === 'none' ? 0 : 3.2;
              if (launchEval.launchBoostSeconds > 0) {
                playerCar.launchBoostTimer = launchEval.launchBoostSeconds;
                sim.raceControl.message = 'PERFECT LAUNCH! OPTIMAL RPM ENGAGEMENT';
                sim.raceControl.messageTimer = 2.6;
              } else if (launchEval.postRacePenaltySeconds > 0) {
                playerCar.postRacePenaltySeconds =
                  (playerCar.postRacePenaltySeconds ?? 0) + launchEval.postRacePenaltySeconds;
                playerCar.penaltyReason = 'jump-start';
                playerCar.penaltyType = 'time-penalty';
                sim.raceControl.message = `JUMP START DETECTED — +${launchEval.postRacePenaltySeconds}s TIME PENALTY`;
                sim.raceControl.messageTimer = 4.2;
              }
            }
          }
        } else if (sim.greenFlagFlash > 0) {
          sim.greenFlagFlash = Math.max(0, sim.greenFlagFlash - dt);
        }
        if (sim.launchStatusTimer > 0) {
          sim.launchStatusTimer = Math.max(0, sim.launchStatusTimer - dt);
          if (sim.launchStatusTimer <= 0) sim.launchStatus = 'none';
        }

        // Update gantry lights (red buildup for standing start, amber formation pulse for rolling start)
        if (sim.trackScene) {
          const totalCountdown = sim.activeStartType === 'rolling' ? 3.2 : 2.0;
          const litCount =
            sim.countdown > 0
              ? Math.min(5, Math.max(1, Math.ceil(((totalCountdown - sim.countdown) / totalCountdown) * 5)))
              : 0;
          sim.trackScene.startLightMats.forEach((m, idx) => {
            if (sim.countdown <= 0) {
              m.emissive.setHex(0x22c55e);
              m.emissiveIntensity = now % 3000 < 1500 ? 0.5 : 0;
            } else if (sim.activeStartType === 'rolling') {
              m.emissive.setHex(0xf59e0b);
              m.emissiveIntensity = idx < litCount ? 2.0 : 0.15;
            } else {
              m.emissive.setHex(0xef4444);
              m.emissiveIntensity = idx < litCount ? 2.2 : 0.05;
            }
          });
        }

        // Dynamic Weather & Track Evolution (replaces old sine wave)
        {
          let leaderDist = 0;
          for (let i = 0; i < sim.cars.length; i++) {
            if (sim.cars[i].totalDistance > leaderDist) leaderDist = sim.cars[i].totalDistance;
          }
          const raceProgress =
            !isQuali && !isPractice && p.raceConfig.totalLaps > 0
              ? Math.max(0, Math.min(1, leaderDist / Math.max(1, p.raceConfig.totalLaps)))
              : undefined;
          stepWeatherSystem(
            sim.weatherSystem,
            dt,
            sim.compiledTrack.spec.scenery,
            sim.cars.length,
            raceProgress,
          );
          sim.trackWetness = sim.weatherSystem.trackWetness;
          rainMesh.visible = sim.weatherSystem.rainIntensity > 0.08;
          rainMat.opacity = Math.min(0.65, 0.16 + sim.weatherSystem.rainIntensity * 0.48);
        }

        // Read keyboard + gamepad (PS4/DualShock/Xbox/Mobile) + mobile touchpad controls
        const kbThrottle = keysPressed.has('KeyW') || keysPressed.has('ArrowUp') ? 1 : 0;
        const kbBrake = keysPressed.has('KeyS') || keysPressed.has('ArrowDown') ? 1 : 0;
        const kbSteer =
          (keysPressed.has('KeyD') || keysPressed.has('ArrowRight') ? 1 : 0) -
          (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft') ? 1 : 0);

        const gp = gamepadController.poll();
        const touchIn = touchInputStore.consumeFrame();
        if (gp.hasAnyInput || touchIn.active) {
          sim.audio.init();
        }

        // Controller utility buttons (Start/Options Pause, Y/Triangle Camera, Share/R3 Reset, L1/R1 Spectate)
        if (gp.pauseJustPressed) {
          p.onTogglePause();
        }
        if (gp.cameraJustPressed) {
          if (p.raceConfig.sessionMode === 'ai-race') {
            setSpectatorCameraMode(sim.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate');
          } else {
            p.onCycleCamera();
          }
        }
        if (gp.resetCameraJustPressed) {
          if (!(p.raceConfig.sessionMode === 'ai-race' && sim.spectatorCameraMode === 'freecam')) {
            const targetCar =
              sim.cars.find((c) => c.isPlayer) ??
              sim.cars.find((c) => c.id === sim.spectatedCarId) ??
              sim.cars[0];
            resetGameplayCamera(targetCar);
          }
        }
        if (
          (gp.lbJustPressed || gp.rbJustPressed) &&
          p.raceConfig.sessionMode === 'ai-race' &&
          sim.spectatorCameraMode === 'spectate' &&
          sim.cars.length > 0
        ) {
          const dir = gp.rbJustPressed ? 1 : -1;
          const idx = sim.cars.findIndex((c) => c.id === sim.spectatedCarId);
          const nextIdx = idx < 0 ? 0 : (idx + dir + sim.cars.length) % sim.cars.length;
          const nextCar = sim.cars[nextIdx];
          sim.spectatedCarId = nextCar.id;
          resetGameplayCamera(nextCar, true);
        }

        const { throttle, brake, steer } = blendAllDrivingInputs(
          { throttle: kbThrottle, brake: kbBrake, steer: kbSteer },
          gp,
          touchIn,
        );

        // Edge-triggered special toggle from keyboard (Space/Shift/E), Gamepad Cross/A, or Touch Special button
        const specialJustPressed =
          sim.specialJustPressed || gp.specialJustPressed || touchIn.specialJustPressed;
        const specialPressed =
          specialJustPressed ||
          keysPressed.has('ShiftLeft') ||
          keysPressed.has('ShiftRight') ||
          keysPressed.has('KeyE') ||
          keysPressed.has('Space') ||
          gp.specialPressed ||
          touchIn.specialPressed;

        if (sim.countdown <= 0) {
          sim.raceElapsed += dt;
          const isRealRace = !isQuali && !isPractice && activePhase === 'playing';
          stepRaceControl(sim.raceControl, sim.cars, sim.compiledTrack, sim.specialZones, dt, {
            totalLaps: p.raceConfig.totalLaps,
            isRace: isRealRace,
            safetyCarEnabled: p.raceConfig.safetyCarEnabled !== false,
          });

          const scSpeedLimit =
            sim.raceControl.safetyCar.phase === 'sc' ||
            sim.raceControl.safetyCar.phase === 'sc-ending' ||
            sim.raceControl.safetyCar.phase === 'vsc'
              ? sim.raceControl.safetyCar.speedLimitMs
              : undefined;
          const roadHalfW = sim.compiledTrack.spec.trackWidth * 0.5;
          const dmgLvl = p.raceConfig.damageLevel ?? 'light';
          const absLvl = p.raceConfig.absLevel ?? 'low';

          const startCtx =
            !isQuali && !isPractice
              ? { raceElapsed: sim.raceElapsed, startType: sim.activeStartType }
              : undefined;
          for (let i = 0; i < sim.cars.length; i++) {
            const c = sim.cars[i];
            if (c.isPlayer) {
              c.pitStrategy = p.pitStrategy;
              const localW = sampleLocalTrackSurfaceWeather(
                sim.weatherSystem,
                c.trackT,
                c.lateralOffset,
                roadHalfW,
              );
              const playerInput = {
                throttle,
                brake,
                steer,
                specialPressed,
                specialJustPressed,
              };
              stepCarPhysics(
                c,
                playerInput,
                sim.compiledTrack,
                dt,
                {
                  trackWetness: sim.trackWetness,
                  localWetness: localW.localWetness,
                  puddleIntensity: localW.puddleIntensity,
                  trackRubber: sim.weatherSystem.trackRubber,
                  trackTempC: localW.trackTempC,
                  safetyCarSpeedLimitMs: scSpeedLimit,
                  drsZoneEnforced: isRealRace,
                  damageLevel: dmgLvl,
                  absLevel: absLvl,
                  totalLaps: p.raceConfig.totalLaps,
                  isQualifying: isQuali,
                  isPractice,
                  allCars: sim.cars,
                },
              );
              telemetryRecorder.recordStep(c, sim.compiledTrack, sim.cars, playerInput, dt);
              sim.specialJustPressed = false;
            } else if (c.isHumanPeer) {
              const pkt = p.mpClient.peerTelemetry.get(c.id);
              if (pkt) {
                c.x += (pkt.x - c.x) * Math.min(1, dt * 15);
                c.y += (pkt.y - c.y) * Math.min(1, dt * 15);
                c.z += (pkt.z - c.z) * Math.min(1, dt * 15);
                c.heading = pkt.heading;
                c.speed = pkt.speed;
                c.steerAngle = pkt.steerAngle;
                c.lap = pkt.lap;
                c.trackT = pkt.trackT;
                c.totalDistance = pkt.totalDistance;
                c.specialActive = pkt.specialActive;
              }
            } else {
              const localW = sampleLocalTrackSurfaceWeather(
                sim.weatherSystem,
                c.trackT,
                c.lateralOffset,
                roadHalfW,
              );
              const aiIn = computeNeuralAIControl(
                c,
                sim.compiledTrack,
                sim.cars,
                dt,
                localW.localWetness,
                p.raceConfig.aiDifficulty,
                startCtx,
              );
              stepCarPhysics(c, aiIn, sim.compiledTrack, dt, {
                trackWetness: sim.trackWetness,
                localWetness: localW.localWetness,
                puddleIntensity: localW.puddleIntensity,
                trackRubber: sim.weatherSystem.trackRubber,
                trackTempC: localW.trackTempC,
                safetyCarSpeedLimitMs: scSpeedLimit,
                drsZoneEnforced: isRealRace,
                damageLevel: dmgLvl,
                absLevel: 'low',
                totalLaps: p.raceConfig.totalLaps,
                isQualifying: isQuali,
                isPractice,
                allCars: sim.cars,
              });
            }
          }

          resolveCarCollisions(sim.cars);
          // Only apply crash camera shake when the PLAYER's own car collides with another car or wall
          if (playerCar) {
            const playerImpact = Math.max(
              playerCar.lastCollisionImpact ?? 0,
              playerCar.lastWallImpact ?? 0,
            );
            if (playerImpact > 5) {
              sim.trauma = Math.min(1, sim.trauma + playerImpact * 0.045);
            }
          }
        } else {
          // Discard buffered toggle triggers during starting-lights / rolling-formation countdown
          sim.specialJustPressed = false;
          if (sim.activeStartType === 'rolling') {
            // Rolling Start: advance the entire 2x2 grid at controlled formation speed until GREEN FLAG
            for (let i = 0; i < sim.cars.length; i++) {
              const c = sim.cars[i];
              if (c.isHumanPeer) {
                const pkt = p.mpClient.peerTelemetry.get(c.id);
                if (pkt) {
                  c.x += (pkt.x - c.x) * Math.min(1, dt * 15);
                  c.y += (pkt.y - c.y) * Math.min(1, dt * 15);
                  c.z += (pkt.z - c.z) * Math.min(1, dt * 15);
                  c.heading = pkt.heading;
                  c.speed = pkt.speed;
                  c.steerAngle = pkt.steerAngle;
                  c.lap = pkt.lap;
                  c.trackT = pkt.trackT;
                  c.totalDistance = pkt.totalDistance;
                  c.specialActive = pkt.specialActive;
                }
                continue;
              }
              const laneLat = sim.rollingFormationLanes.get(c.id);
              const formCtrl = computeRollingFormationControl(
                c,
                sim.compiledTrack,
                sim.cars,
                sim.rollingFormationSpeed,
                laneLat,
              );
              const appliedInput = c.isPlayer
                ? {
                    // Allow subtle player weave in-lane while autopilot maintains clean formation pace
                    steer: Math.max(-1, Math.min(1, formCtrl.steer * 0.78 + steer * 0.22)),
                    throttle: formCtrl.throttle,
                    brake: formCtrl.brake,
                    specialPressed: false,
                  }
                : formCtrl;
              stepCarPhysics(c, appliedInput, sim.compiledTrack, dt, {
                trackWetness: sim.trackWetness,
                totalLaps: p.raceConfig.totalLaps,
                isQualifying: isQuali,
                isPractice,
                allCars: sim.cars,
              });
            }
          } else if (playerCar) {
            // Standing Start: grid staging / neutral launch revving during starting-lights countdown
            const targetGridRpm = throttle > 0.05 ? Math.min(1.0, 0.18 + throttle * 0.84) : 0.18;
            const rate = throttle > 0.05 ? 4.5 : 3.0;
            const nextRpm =
              playerCar.rpmNormalized < targetGridRpm
                ? Math.min(targetGridRpm, playerCar.rpmNormalized + dt * rate)
                : Math.max(targetGridRpm, playerCar.rpmNormalized - dt * rate);
            playerCar.rpmNormalized = nextRpm;

            // Jump-start detection: pinning full throttle past redline right before lights out without holding brake
            if (
              p.raceConfig.jumpStartEnabled !== false &&
              !isQuali &&
              !isPractice &&
              sim.countdown < 0.75 &&
              throttle > 0.94 &&
              brake < 0.1 &&
              playerCar.rpmNormalized > 0.96
            ) {
              sim.jumpStartTriggered = true;
            }
          }
        }

        // Send multiplayer telemetry at 20Hz if connected in a room
        if (playerCar && p.mpClient.room && now - sim.lastTelemetryTime > 50) {
          sim.lastTelemetryTime = now;
          p.mpClient.sendTelemetry({
            x: playerCar.x,
            y: playerCar.y,
            z: playerCar.z,
            heading: playerCar.heading,
            speed: playerCar.speed,
            steerAngle: playerCar.steerAngle,
            lap: playerCar.lap,
            trackT: playerCar.trackT,
            totalDistance: playerCar.totalDistance,
            specialActive: playerCar.specialActive,
          });
        }

        const isAiRace = activePhase === 'playing' && p.raceConfig.sessionMode === 'ai-race';
        if (isAiRace && p.spectatorCameraMode && p.spectatorCameraMode !== sim.spectatorCameraMode) {
          setSpectatorCameraMode(p.spectatorCameraMode);
        }

        const spectatedCar = isAiRace
          ? sim.cars.find((c) => c.id === sim.spectatedCarId) ?? sim.cars[0] ?? null
          : null;
        const focusCar = playerCar ?? spectatedCar;

        // Camera Rig: Freecam (in Host AI Race), Fixed Spherical Chase-Orbit, Hood Cam, or Isometric Cam
        if (isAiRace && sim.spectatorCameraMode === 'freecam') {
          if (Math.abs(camera.near - 0.25) > 0.01) {
            camera.near = 0.25;
            camera.updateProjectionMatrix();
          }
          if (Math.abs(camera.fov - sim.freecamFov) > 0.05) {
            camera.fov += (sim.freecamFov - camera.fov) * Math.min(1, dt * 12);
            camera.updateProjectionMatrix();
          }

          // Keyboard look fallback with Arrow keys + Gamepad right-stick
          const arrowYaw =
            (keysPressed.has('ArrowLeft') ? 1 : 0) - (keysPressed.has('ArrowRight') ? 1 : 0);
          const arrowPitch =
            (keysPressed.has('ArrowUp') ? 1 : 0) - (keysPressed.has('ArrowDown') ? 1 : 0);
          sim.freecamYaw += (arrowYaw * 1.9 - gp.cameraX * 2.2) * dt;
          sim.freecamPitch = Math.max(
            -1.45,
            Math.min(1.45, sim.freecamPitch + (arrowPitch * 1.5 - gp.cameraY * 1.6) * dt),
          );

          _freecamEuler.set(sim.freecamPitch, sim.freecamYaw, 0, 'YXZ');
          _freecamQuat.setFromEuler(_freecamEuler);
          _freecamFwd.set(0, 0, -1).applyQuaternion(_freecamQuat);
          _freecamRight.set(1, 0, 0).applyQuaternion(_freecamQuat);

          const kbFwd = (keysPressed.has('KeyW') ? 1 : 0) - (keysPressed.has('KeyS') ? 1 : 0);
          const kbRight = (keysPressed.has('KeyD') ? 1 : 0) - (keysPressed.has('KeyA') ? 1 : 0);
          const moveFwd = Math.max(-1, Math.min(1, kbFwd - gp.leftStickY + touchIn.moveForward));
          const moveRight = Math.max(-1, Math.min(1, kbRight + gp.steer + touchIn.moveRight));
          const kbUp =
            (keysPressed.has('Space') || keysPressed.has('KeyE') ? 1 : 0) -
            (keysPressed.has('KeyQ') || keysPressed.has('ControlLeft') ? 1 : 0);
          const gpUp = (gp.rbPressed ? 1 : 0) - (gp.lbPressed ? 1 : 0) + (gp.throttle - gp.brake);
          const moveUp = Math.max(-1, Math.min(1, kbUp + gpUp + touchIn.moveUp));

          const speed = sim.freecamSpeed;
          sim.freecamPos.addScaledVector(_freecamFwd, moveFwd * speed * dt);
          sim.freecamPos.addScaledVector(_freecamRight, moveRight * speed * dt);
          sim.freecamPos.y += moveUp * speed * dt;
          const minFloorY = (spectatedCar?.y ?? 0) + 0.6;
          if (sim.freecamPos.y < Math.min(minFloorY, -2)) {
            sim.freecamPos.y = Math.min(minFloorY, -2);
          }

          camera.up.set(0, 1, 0);
          camera.position.copy(sim.freecamPos);
          camera.quaternion.copy(_freecamQuat);

          // Subtle ambient audio for nearest car to freecam (quiet idle during countdown)
          let nearestCar: CarSimState | null = null;
          let nearestDistSq = 85 * 85;
          for (const c of sim.cars) {
            const dSq =
              (c.x - sim.freecamPos.x) ** 2 +
              (c.y - sim.freecamPos.y) ** 2 +
              (c.z - sim.freecamPos.z) ** 2;
            if (dSq < nearestDistSq) {
              nearestDistSq = dSq;
              nearestCar = c;
            }
          }
          if (nearestCar && sim.countdown <= 0) {
            const aiLoad = nearestCar.speed < 2.0 ? 0.04 : Math.min(0.65, 0.18 + nearestCar.rpmNormalized * 0.45);
            sim.audio.updateEngine(
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
            sim.audio.updateEngine(0, 0, 'v8-hybrid', false);
          }
        } else if (focusCar) {
          const mode: CameraMode = isAiRace ? 'orbit' : p.cameraMode;
          const targetNear = mode === 'hood' ? 0.14 : 0.4;
          if (Math.abs(camera.near - targetNear) > 0.01) {
            camera.near = targetNear;
            camera.updateProjectionMatrix();
          }

          const trkSample = sampleTrackAtT(sim.compiledTrack, focusCar.trackT);
          const fallbackTilt = computeRoadSurfaceTilt(trkSample, focusCar.heading);
          const pPitch = focusCar.pitch ?? fallbackTilt.pitchRad;
          const pRoll = focusCar.roll ?? fallbackTilt.rollRad;

          if (mode !== sim.lastCameraMode) {
            sim.lastCameraMode = mode;
            resetGameplayCamera(focusCar);
          }

          if (mode === 'orbit') {
            // Gamepad Right Stick (axes[2], axes[3]) camera orbit control
            const isRightStickOrbiting = gp.cameraX !== 0 || gp.cameraY !== 0;
            if (isRightStickOrbiting) {
              const STICK_YAW_SPEED = 2.4;
              const STICK_PITCH_SPEED = 1.6;
              sim.targetOrbitWorldYaw -= gp.cameraX * STICK_YAW_SPEED * dt;
              sim.targetOrbitPitch = Math.max(
                DEFAULT_CHASE_CAMERA.minPitch,
                Math.min(DEFAULT_CHASE_CAMERA.maxPitch, sim.targetOrbitPitch + gp.cameraY * STICK_PITCH_SPEED * dt),
              );
              sim.orbitLastInteractTime = now;
              sim.orbitRollLastInteractTime = now;
            }

            const isManuallyAdjustingOrbit = sim.isDraggingOrbit || isRightStickOrbiting;
            if (isManuallyAdjustingOrbit) {
              // Capture manual yaw offset relative to car's heading without fighting active drags
              sim.orbitYawOffset = normalizeAngleRad(sim.targetOrbitWorldYaw - (focusCar.heading + Math.PI));
            } else {
              // Follow car heading at preserved manual yaw/pitch offsets (never snap pitch or yaw back)
              const desiredWorldYaw = focusCar.heading + Math.PI + sim.orbitYawOffset;
              const yawDiff = normalizeAngleRad(desiredWorldYaw - sim.targetOrbitWorldYaw);
              sim.targetOrbitWorldYaw += yawDiff * (1 - Math.exp(-9.5 * dt));
            }

            // Roll-only reset back to 0 after ~2.5s idle delay using smooth damping (leave pitch & yaw alone)
            const isRollIdle =
              !isManuallyAdjustingOrbit &&
              (sim.orbitRollLastInteractTime === 0 ||
                now - sim.orbitRollLastInteractTime > DEFAULT_CHASE_CAMERA.rollResetDelayMs);
            if (isRollIdle && (Math.abs(sim.targetOrbitRoll) > 0.0001 || Math.abs(sim.orbitRoll) > 0.0001)) {
              const rollResetDamp = 1 - Math.exp(-DEFAULT_CHASE_CAMERA.rollResetDampRate * dt);
              sim.targetOrbitRoll += (0 - sim.targetOrbitRoll) * rollResetDamp;
              if (Math.abs(sim.targetOrbitRoll) < 0.0005) {
                sim.targetOrbitRoll = 0;
              }
            }

            const angDamp = sim.isDraggingOrbit ? 1.0 : 1 - Math.exp(-16 * dt);
            const worldDiff = normalizeAngleRad(sim.targetOrbitWorldYaw - sim.orbitWorldYaw);
            sim.orbitWorldYaw += worldDiff * angDamp;
            sim.orbitPitch += (sim.targetOrbitPitch - sim.orbitPitch) * angDamp;
            sim.orbitDist += (sim.targetOrbitDist - sim.orbitDist) * (1 - Math.exp(-16 * dt));
            sim.orbitRoll += (sim.targetOrbitRoll - sim.orbitRoll) * angDamp;
            if (Math.abs(sim.orbitRoll) < 0.0002 && sim.targetOrbitRoll === 0) {
              sim.orbitRoll = 0;
            }

            const cosP = Math.cos(sim.orbitPitch);
            const sinP = Math.sin(sim.orbitPitch);
            const sinY = Math.sin(sim.orbitWorldYaw);
            const cosY = Math.cos(sim.orbitWorldYaw);

            // Clean target-centered spherical orbit locked on the car's elevated center pivot
            const pivotX = focusCar.x;
            const pivotY = focusCar.y + DEFAULT_CHASE_CAMERA.pivotHeight;
            const pivotZ = focusCar.z;

            const rawCamX = pivotX + sinY * cosP * sim.orbitDist;
            const rawCamY = pivotY + sinP * sim.orbitDist;
            const rawCamZ = pivotZ + cosY * cosP * sim.orbitDist;

            // Ground-plane clamping: prevent clipping through track/grass plane
            const clampedCamY = Math.max(focusCar.y + DEFAULT_CHASE_CAMERA.minHeightAboveCar, rawCamY);

            _camCurrPos.set(rawCamX, clampedCamY, rawCamZ);
            _camCurrLook.set(pivotX, pivotY, pivotZ);

            if (Math.abs(sim.orbitRoll) > 0.0001) {
              _orbitLookFwd.subVectors(_camCurrLook, _camCurrPos).normalize();
              _orbitUp.set(0, 1, 0).applyAxisAngle(_orbitLookFwd, sim.orbitRoll);
              camera.up.copy(_orbitUp);
            } else {
              camera.up.set(0, 1, 0);
            }
            camera.position.copy(_camCurrPos);
            camera.lookAt(_camCurrLook);

            const targetFov = 52 + Math.min(10, (focusCar.speed / 60) * 8);
            if (Math.abs(camera.fov - targetFov) > 0.1) {
              camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
              camera.updateProjectionMatrix();
            }
          } else {
            let lookOffset: { yaw: number; pitch: number } | undefined;
            if (mode === 'hood') {
              // Right-stick smooth glance left/right and up/down from hood cam, auto-centering when released
              const targetHoodYaw = gp.cameraX * 0.95;
              const targetHoodPitch = gp.cameraY * 0.26;
              const lookDamp = 1 - Math.exp(-12 * dt);
              sim.hoodLookYaw += (targetHoodYaw - sim.hoodLookYaw) * lookDamp;
              sim.hoodLookPitch += (targetHoodPitch - sim.hoodLookPitch) * lookDamp;
              if (Math.abs(sim.hoodLookYaw) < 0.001 && targetHoodYaw === 0) sim.hoodLookYaw = 0;
              if (Math.abs(sim.hoodLookPitch) < 0.001 && targetHoodPitch === 0) sim.hoodLookPitch = 0;
              if (sim.hoodLookYaw !== 0 || sim.hoodLookPitch !== 0) {
                lookOffset = { yaw: sim.hoodLookYaw, pitch: sim.hoodLookPitch };
              }
            }
            const focusRig = sim.carRigs.get(focusCar.id);
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
            );

            if (camFrame.isLocked) {
              // Hood Cam: locked rigidly to car's full 3D orientation (pitch & roll), zero velocity lag
              _camCurrPos.set(camFrame.position.x, camFrame.position.y, camFrame.position.z);
              _camCurrLook.set(camFrame.lookAt.x, camFrame.lookAt.y, camFrame.lookAt.z);
              if (camFrame.up) {
                camera.up.set(camFrame.up.x, camFrame.up.y, camFrame.up.z);
              } else {
                camera.up.set(0, 1, 0);
              }
              camera.position.copy(_camCurrPos);
              camera.lookAt(_camCurrLook);
              if (Math.abs(camera.fov - camFrame.fov) > 0.05) {
                camera.fov = camFrame.fov;
                camera.updateProjectionMatrix();
              }
            } else {
              _camDesiredPos.set(camFrame.position.x, camFrame.position.y, camFrame.position.z);
              _camDesiredLook.set(camFrame.lookAt.x, camFrame.lookAt.y, camFrame.lookAt.z);

              const dampPos = 1 - Math.exp(-8.5 * dt);
              const dampLook = 1 - Math.exp(-12 * dt);
              _camCurrPos.lerp(_camDesiredPos, dampPos);
              _camCurrLook.lerp(_camDesiredLook, dampLook);

              camera.up.set(0, 1, 0);
              camera.position.copy(_camCurrPos);
              camera.lookAt(_camCurrLook);

              if (Math.abs(camera.fov - camFrame.fov) > 0.1) {
                camera.fov += (camFrame.fov - camera.fov) * Math.min(1, dt * 6);
                camera.updateProjectionMatrix();
              }
            }
          }

          if (sim.trauma > 0.005) {
            const isHoodShake = mode === 'hood';
            const shake = sim.trauma * sim.trauma * (isHoodShake ? 0.10 : 0.45);
            const dx = (Math.random() - 0.5) * shake;
            const rawDy = (Math.random() - 0.5) * shake;
            camera.position.x += dx;
            // Prevent collision shake from shoving hood camera downward through the hood surface
            camera.position.y += isHoodShake ? Math.max(-0.04, rawDy) : rawDy;
            sim.trauma = Math.max(0, sim.trauma - dt * 2.4);
          }

          // Engine audio synthesis (follows player or spectated AI car)
          const liveSpeedKmh = Math.round(focusCar.speed * SPEED_KMH_FACTOR);
          if (!focusCar.isPlayer && sim.countdown > 0 && sim.activeStartType !== 'rolling') {
            // Silent/quiet grid before lights out on standing start in AI Race mode (prevents constant rev drone)
            sim.audio.updateEngine(0, 0, focusCar.carSpec.engineType, false);
          } else {
            const engineLoad = focusCar.isPlayer
              ? focusCar.gear === -1 && focusCar.transmissionMode !== 'manual'
                ? brake
                : throttle
              : focusCar.speed < 2.0
              ? 0.04
              : Math.min(0.82, 0.24 + focusCar.rpmNormalized * 0.56);
            sim.audio.updateEngine(
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
        // Paused or Gameover: silence engine
        sim.audio.updateEngine(0, 0, 'v8-hybrid', false);
      }

      // Sync Car 3D Transforms, Rotating Wheels, Active Aero Flap, Visual Damage & Rival Boost LEDs
      for (let i = 0; i < sim.cars.length; i++) {
        const c = sim.cars[i];
        const rig = sim.carRigs.get(c.id);
        if (!rig) continue;

        const trkSample = sampleTrackAtT(sim.compiledTrack, c.trackT);
        const fallbackTilt = computeRoadSurfaceTilt(trkSample, c.heading);
        const roadPitch = c.pitch ?? fallbackTilt.pitchRad;
        const roadRoll = c.roll ?? fallbackTilt.rollRad;
        const heaveLift = (c.suspensionHeave ?? 0) * 0.14 + (c.sausageKerbHop ?? 0) * 0.18;

        rig.root.position.set(c.x, c.y + 0.02 + Math.max(-0.04, heaveLift), c.z);
        rig.root.rotation.order = 'YXZ';
        rig.root.rotation.y = c.heading;
        rig.root.rotation.x = -roadPitch;
        rig.root.rotation.z = -roadRoll;

        // Subtle die-cast suspension roll in corners + flat-spot vibration + bent suspension tilt
        const flatSpotJitter =
          (c.flatSpotVibration ?? 0) > 0.05 && c.speed > 8
            ? Math.sin(now * 0.055 + i) * (c.flatSpotVibration ?? 0) * 0.015
            : 0;
        const suspTilt = (c.damage?.suspensionPullDir ?? 0) * ((c.damage?.suspension ?? 0) / 100) * 0.14;
        rig.bodyGroup.rotation.z =
          -c.steerAngle * Math.min(1, c.speed / 30) * 0.09 + flatSpotJitter + suspTilt;

        const wheelSpin = (((c.gear === -1 ? -1 : 1) * c.speed) / 0.35) * dt;
        for (const w of rig.allWheels) {
          w.rotation.x += wheelSpin;
        }
        for (const fw of rig.frontWheels) {
          fw.rotation.y = -c.steerAngle;
        }

        // Visual damage cues: broken/flickering headlights + detached/bent aero wing flaps
        if (rig.headlightMats.length > 0) {
          const broken = Boolean(c.damage?.headlightBroken);
          for (let hIdx = 0; hIdx < rig.headlightMats.length; hIdx++) {
            const hMat = rig.headlightMats[hIdx];
            if (broken) {
              const flicker = ((Math.floor(now / 90) + hIdx * 3 + i) % 7) === 0;
              hMat.emissiveIntensity = hIdx === 0 ? 0.02 : flicker ? 0.9 : 0.12;
            } else if (hMat.emissiveIntensity < 0.8) {
              hMat.emissiveIntensity = 1.4;
            }
          }
        }

        // Rival boost / Push-to-Pass / Attack Mode LED & rain-light indicator on rear brakeLightMat
        if (rig.brakeLightMat) {
          if (c.specialActive || c.attackModeTimer > 0) {
            const pulse = (now % 260) < 130;
            rig.brakeLightMat.emissive.setHex(
              c.attackModeTimer > 0 ? 0x38bdf8 : 0xf59e0b,
            );
            rig.brakeLightMat.emissiveIntensity = pulse ? 3.2 : 0.8;
          } else {
            rig.brakeLightMat.emissive.setHex(0xef4444);
            rig.brakeLightMat.emissiveIntensity =
              (c.brakeLockupIntensity ?? 0) > 0.1 || c.pitStopRemaining > 0 ? 2.6 : 0.55;
          }
        }

        // Active Aero / DRS Wing Flaps + visual damage detachment/bend
        if (rig.rearWingFlap) {
          if (c.damage?.rearWingDetached) {
            rig.rearWingFlap.visible = false;
          } else {
            rig.rearWingFlap.visible = true;
            const wingBend = ((c.damage?.rearWing ?? 0) / 100) * 0.25;
            rig.rearWingFlap.rotation.z = wingBend;
            if (resolveCarSpecial(c.carSpec).specialType === 'active-aero') {
              const targetRear = c.specialActive ? 0.02 : 0.42;
              rig.rearWingFlap.rotation.x += (targetRear - rig.rearWingFlap.rotation.x) * Math.min(1, dt * 14);
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
              rig.frontWingFlap.rotation.x += (targetFront - rig.frontWingFlap.rotation.x) * Math.min(1, dt * 14);
            }
          }
        }

        // Spawn pooled carbon-fiber impact debris burst on heavy contact
        if ((c.debrisBurstIntensity ?? 0) > 0.12) {
          const burst = Math.min(6, Math.ceil((c.debrisBurstIntensity ?? 0) * 5));
          for (let b = 0; b < burst; b++) {
            const pItem = debrisPool[debrisCursor];
            debrisCursor = (debrisCursor + 1) % debrisCount;
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

        // Spawn pooled tire lock-up white smoke puffs under heavy braking lock-up
        if ((c.brakeLockupIntensity ?? 0) > 0.28 && c.speed > 10 && Math.random() < 0.65) {
          const sItem = smokePool[smokeCursor];
          smokeCursor = (smokeCursor + 1) % smokeCount;
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

      // Sync 3D Safety Car mesh & alternating flashing roof lightbar
      const scState = sim.raceControl.safetyCar;
      const showSc = scState.active && (scState.phase === 'sc' || scState.phase === 'sc-ending');
      safetyCarGroup.visible = showSc;
      if (showSc) {
        const scSample = sampleTrackAtT(sim.compiledTrack, scState.trackT);
        const scTilt = computeRoadSurfaceTilt(scSample, scState.heading);
        safetyCarGroup.position.set(scState.x, scState.y + 0.02, scState.z);
        safetyCarGroup.rotation.order = 'YXZ';
        safetyCarGroup.rotation.y = scState.heading;
        safetyCarGroup.rotation.x = -scTilt.pitchRad;
        safetyCarGroup.rotation.z = -scTilt.rollRad;
        const flashA = Math.floor(now / 180) % 2 === 0;
        const lightHex = scState.phase === 'sc-ending' ? 0x22c55e : 0xf59e0b;
        scLeftLightMat.color.setHex(lightHex);
        scLeftLightMat.emissive.setHex(lightHex);
        scRightLightMat.color.setHex(lightHex);
        scRightLightMat.emissive.setHex(lightHex);
        scLeftLightMat.emissiveIntensity = flashA ? 3.2 : 0.12;
        scRightLightMat.emissiveIntensity = flashA ? 0.12 : 3.2;
      }

      // Step pooled carbon debris & brake lock-up smoke InstancedMeshes
      let anyDebris = false;
      for (let i = 0; i < debrisCount; i++) {
        const d = debrisPool[i];
        if (!d.active) {
          _particleDummy.position.set(0, -999, 0);
          _particleDummy.scale.set(0.001, 0.001, 0.001);
          _particleDummy.updateMatrix();
          debrisMesh.setMatrixAt(i, _particleDummy.matrix);
          continue;
        }
        d.life += dt;
        if (d.life >= d.maxLife) {
          d.active = false;
          _particleDummy.position.set(0, -999, 0);
          _particleDummy.scale.set(0.001, 0.001, 0.001);
          _particleDummy.updateMatrix();
          debrisMesh.setMatrixAt(i, _particleDummy.matrix);
          continue;
        }
        anyDebris = true;
        d.vy -= 18 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += 7 * dt;
        d.ry += 5 * dt;
        const fadeScale = Math.max(0.1, 1 - d.life / d.maxLife);
        _particleDummy.position.set(d.x, d.y, d.z);
        _particleDummy.rotation.set(d.rx, d.ry, 0);
        _particleDummy.scale.setScalar(fadeScale);
        _particleDummy.updateMatrix();
        debrisMesh.setMatrixAt(i, _particleDummy.matrix);
      }
      debrisMesh.visible = anyDebris;
      if (anyDebris) debrisMesh.instanceMatrix.needsUpdate = true;

      let anySmoke = false;
      for (let i = 0; i < smokeCount; i++) {
        const s = smokePool[i];
        if (!s.active) {
          _particleDummy.position.set(0, -999, 0);
          _particleDummy.scale.set(0.001, 0.001, 0.001);
          _particleDummy.updateMatrix();
          smokeMesh.setMatrixAt(i, _particleDummy.matrix);
          continue;
        }
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _particleDummy.position.set(0, -999, 0);
          _particleDummy.scale.set(0.001, 0.001, 0.001);
          _particleDummy.updateMatrix();
          smokeMesh.setMatrixAt(i, _particleDummy.matrix);
          continue;
        }
        anySmoke = true;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        const grow = 0.55 + (s.life / s.maxLife) * 1.45;
        _particleDummy.position.set(s.x, s.y, s.z);
        _particleDummy.rotation.set(s.life * 2, s.life * 1.5, 0);
        _particleDummy.scale.setScalar(grow);
        _particleDummy.updateMatrix();
        smokeMesh.setMatrixAt(i, _particleDummy.matrix);
      }
      smokeMesh.visible = anySmoke;
      if (anySmoke) smokeMesh.instanceMatrix.needsUpdate = true;

      // Sync Floating Billboarded Nametags (position, distance scaling & opacity fade — zero per-frame texture creation)
      const isAiRaceFrame = p.raceConfig.sessionMode === 'ai-race';
      const showNametags = activePhase === 'playing' || activePhase === 'qualifying' || activePhase === 'paused';
      for (let i = 0; i < sim.cars.length; i++) {
        const c = sim.cars[i];
        const tag = sim.carNametags.get(c.id);
        if (!tag) continue;
        const hideSpectatedTag = isAiRaceFrame && sim.spectatorCameraMode === 'spectate' && c.id === sim.spectatedCarId;
        if (!showNametags || c.isPlayer || hideSpectatedTag) {
          tag.sprite.visible = false;
          continue;
        }
        const dx = c.x - camera.position.x;
        const dy = c.y + tag.baseHeightOffset - camera.position.y;
        const dz = c.z - camera.position.z;
        const dist = Math.hypot(dx, dy, dz);
        const style = computeNametagDistanceStyle(dist, tag.isHumanPeer);
        tag.sprite.visible = style.visible;
        if (style.visible) {
          tag.sprite.position.set(c.x, c.y + tag.baseHeightOffset + style.heightLift, c.z);
          tag.sprite.scale.set(style.scaleY * tag.aspect, style.scaleY, 1);
          tag.material.opacity = style.opacity;
        }
      }

      // Update Pooled Slipstream Airflow Streaks around player
      if (playerCar && (activePhase === 'playing' || activePhase === 'qualifying')) {
        const showSlip = playerCar.inSlipstream && playerCar.speed > 18;
        slipstreamMesh.visible = showSlip;
        if (showSlip) {
          const tNow = now * 0.012;
          for (let i = 0; i < slipCount; i++) {
            const side = i % 2 === 0 ? -1.1 : 1.1;
            const phase = (tNow + i * 0.45) % 8;
            const localZ = 3.5 - phase * 1.1;
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
            slipstreamMesh.setMatrixAt(i, _particleDummy.matrix);
          }
          slipstreamMesh.instanceMatrix.needsUpdate = true;
        }

        if (rainMesh.visible) {
          const tRain = now * 0.035;
          for (let i = 0; i < rainCount; i++) {
            const rx = ((i * 37) % 60) - 30;
            const rz = ((i * 53) % 60) - 30;
            const ry = 22 - ((tRain + i * 1.7) % 22);
            _particleDummy.position.set(playerCar.x + rx, playerCar.y + ry, playerCar.z + rz);
            _particleDummy.rotation.set(0, 0, 0.12);
            _particleDummy.scale.set(1, 1, 1);
            _particleDummy.updateMatrix();
            rainMesh.setMatrixAt(i, _particleDummy.matrix);
          }
          rainMesh.instanceMatrix.needsUpdate = true;
        }
      } else {
        slipstreamMesh.visible = false;
      }

      // Render Scene
      renderer.render(scene, camera);

      // Throttled HUD Snapshot (~12Hz)
      const isAiRaceHud = activePhase === 'playing' && p.raceConfig.sessionMode === 'ai-race';
      const hudFocusCar =
        playerCar ??
        (isAiRaceHud ? sim.cars.find((c) => c.id === sim.spectatedCarId) ?? sim.cars[0] ?? null : null);

      if ((activePhase === 'playing' || activePhase === 'qualifying') && hudFocusCar && now - sim.lastHudTime > 80) {
        sim.lastHudTime = now;
        const standings = computeStandings(sim.cars, sim.compiledTrack);
        const focusStanding = standings.find((s) => s.id === hudFocusCar.id) ?? standings[0];
        const pIdx = standings.findIndex((s) => s.id === hudFocusCar.id);
        const behind = pIdx >= 0 && pIdx + 1 < standings.length ? standings[pIdx + 1] : null;
        const classCars = standings.filter((s) => s.classId === hudFocusCar.carSpec.classId).length;

        const speedKmh = Math.round(hudFocusCar.speed * SPEED_KMH_FACTOR);

        const snapshot: HudSnapshot = {
          phase: activePhase,
          countdown: sim.countdown,
          startType: sim.activeStartType,
          greenFlagFlash: sim.greenFlagFlash,
          speedKmh,
          gear: hudFocusCar.gear,
          rpmNormalized: hudFocusCar.rpmNormalized,
          lap: hudFocusCar.lap,
          totalLaps: activePhase === 'qualifying' ? 1 : p.raceConfig.totalLaps,
          position: focusStanding.position,
          totalCars: standings.length,
          classPosition: focusStanding.classPosition,
          classCars,
          currentLapTime: hudFocusCar.currentLapTime,
          bestLapTime: hudFocusCar.bestLapTime,
          lastLapTime: hudFocusCar.lastLapTime,
          intervalAhead: pIdx > 0 ? focusStanding.intervalToAhead : null,
          intervalBehind: behind ? behind.intervalToAhead : null,
          tireWear: Math.round(hudFocusCar.tireWear),
          tireTemp: Math.round(hudFocusCar.tireTemp),
          compound: hudFocusCar.compound,
          fuel: Math.round(hudFocusCar.fuel),
          fuelLapsRemaining: hudFocusCar.fuelLapsRemaining,
          attackModeUsesRemaining: hudFocusCar.attackModeUsesRemaining,
          attackModeTimer: hudFocusCar.attackModeTimer,
          aeroDamage: Math.round(hudFocusCar.aeroDamage),
          specialCharge: Math.round(hudFocusCar.specialCharge),
          specialActive: hudFocusCar.specialActive,
          inSlipstream: hudFocusCar.inSlipstream,
          trackWetness: sim.trackWetness,
          warningCount: hudFocusCar.warningCount,
          penaltyTimeRemaining: hudFocusCar.penaltyTimeRemaining,
          isStoppedOnTrack: !isAiRaceHud && hudFocusCar.speed < 1.5 && !hudFocusCar.finished,
          pitStopRemaining: hudFocusCar.pitStopRemaining,
          pitStopTotal: hudFocusCar.pitStopTotal,
          pitActiveTask: hudFocusCar.pitActiveTask,
          pitQueue: [...hudFocusCar.pitQueue],
          pitStrategy: hudFocusCar.pitStrategy,
          cameraMode: p.cameraMode,
          standings,
          minimapDots: [
            ...sim.cars.map((c) => ({
              id: c.id,
              x: c.x,
              z: c.z,
              classId: c.carSpec.classId,
              isPlayer: isAiRaceHud ? c.id === hudFocusCar.id : c.isPlayer,
              isHumanPeer: c.isHumanPeer,
            })),
            ...(sim.raceControl.safetyCar.active &&
            (sim.raceControl.safetyCar.phase === 'sc' || sim.raceControl.safetyCar.phase === 'sc-ending')
              ? [
                  {
                    id: 'safety-car',
                    x: sim.raceControl.safetyCar.x,
                    z: sim.raceControl.safetyCar.z,
                    classId: CarClassId.SUPERCAR,
                    isPlayer: false,
                    isHumanPeer: false,
                    isSafetyCar: true,
                  },
                ]
              : []),
          ],
          qualiResultTime: sim.qualiTime,
          qualiGridPos: sim.qualiGridPos,
          sessionMode: p.raceConfig.sessionMode ?? 'race',
          spectatorCameraMode: isAiRaceHud ? sim.spectatorCameraMode : undefined,
          spectatedCarId: isAiRaceHud ? hudFocusCar.id : undefined,
          spectatedDriverName: isAiRaceHud ? hudFocusCar.name : undefined,
          spectatedCarName: isAiRaceHud ? hudFocusCar.carSpec.name : undefined,
          currentSector: hudFocusCar.currentSector ?? 1,
          sectorTimes: hudFocusCar.sectorTimes ? [...hudFocusCar.sectorTimes] : [null, null, null],
          bestSectorTimes: hudFocusCar.bestSectorTimes ? [...hudFocusCar.bestSectorTimes] : [null, null, null],
          lastLapSectorTimes: hudFocusCar.lastLapSectorTimes ? [...hudFocusCar.lastLapSectorTimes] : [null, null, null],
          // Section 1.2: Race Control, Flags, Safety Car, Penalties & Standing Start
          raceFlag: sim.raceControl.globalFlag,
          sectorFlags: [...sim.raceControl.sectorFlags] as ['green' | 'yellow', 'green' | 'yellow', 'green' | 'yellow'],
          blueFlagActive: Boolean(hudFocusCar.blueFlagActive),
          safetyCarPhase: sim.raceControl.safetyCar.phase,
          safetyCarSpeedLimitKmh:
            sim.raceControl.safetyCar.phase !== 'none'
              ? Math.round(sim.raceControl.safetyCar.speedLimitMs * SPEED_KMH_FACTOR)
              : undefined,
          raceControlMessage: sim.raceControl.message,
          postRacePenaltySeconds: hudFocusCar.postRacePenaltySeconds ?? 0,
          penaltyReason: hudFocusCar.penaltyReason ?? null,
          penaltyType: hudFocusCar.penaltyType ?? null,
          launchStatus: sim.launchStatus,
          launchRpmSweetSpot: LAUNCH_RPM_SWEET_SPOT,
          // Section 1.3: Class-specific mechanics
          ersMode: hudFocusCar.ersMode ?? 'balanced',
          drsEligible: Boolean(hudFocusCar.drsEligible),
          inDrsZone: Boolean(hudFocusCar.inDrsZone),
          inAttackModeZone: Boolean(hudFocusCar.inAttackModeZone),
          // Section 1.4: Dynamic weather & track evolution
          weatherCondition: sim.weatherSystem.condition,
          weatherNextLabel: sim.weatherSystem.nextForecastLabel,
          ambientTempC: Math.round(sim.weatherSystem.ambientTempC),
          trackTempC: Math.round(sim.weatherSystem.trackTempC),
          trackRubber: sim.weatherSystem.trackRubber,
          racingLineWetness: sim.weatherSystem.racingLineWetness,
          offLineWetness: sim.weatherSystem.offLineWetness,
          // Section 2.1-2.3: 4-wheel tires, brakes, dirty air, surface, setup & localized damage
          tires: hudFocusCar.tires
            ? {
                fl: { ...hudFocusCar.tires.fl },
                fr: { ...hudFocusCar.tires.fr },
                rl: { ...hudFocusCar.tires.rl },
                rr: { ...hudFocusCar.tires.rr },
              }
            : undefined,
          brakeTempFront: Math.round(hudFocusCar.brakeTempFront ?? 280),
          brakeTempRear: Math.round(hudFocusCar.brakeTempRear ?? 250),
          brakeFade: hudFocusCar.brakeFade ?? 0,
          brakeLockup: hudFocusCar.brakeLockupIntensity ?? 0,
          brakeBalance: hudFocusCar.setup?.brakeBalance ?? DEFAULT_CAR_SETUP.brakeBalance,
          dirtyAirStrength: hudFocusCar.dirtyAirStrength ?? 0,
          surfaceType: hudFocusCar.surfaceType ?? 'asphalt',
          crestLoadFactor: hudFocusCar.crestLoadFactor ?? 1,
          damage: hudFocusCar.damage ? { ...hudFocusCar.damage } : undefined,
          damageLevel: p.raceConfig.damageLevel ?? 'light',
        };

        p.onHudUpdate(snapshot);

        // Check Qualifying, Player Race, or Host AI Race Completion
        // In AI Race mode, wait until EVERY car on track has crossed the finish line so all final gaps are real.
        const shouldFinish = isAiRaceHud
          ? sim.cars.length > 0 && sim.cars.every((c) => c.finished)
          : Boolean(playerCar?.finished);
        if (shouldFinish && !sim.finishEmitted) {
          sim.finishEmitted = true;
          if (activePhase === 'qualifying' && playerCar) {
            const qTime = playerCar.bestLapTime ?? playerCar.lastLapTime ?? 38.5;
            const targetLap = sim.compiledTrack.spec.targetLapSeconds / CAR_CLASSES[playerCar.carSpec.classId].basePaceIndex;
            const ratio = qTime / targetLap;
            const gridSize = Math.max(4, p.raceConfig.gridSize);
            const gridPos = Math.max(1, Math.min(gridSize, Math.round((ratio - 0.92) * gridSize * 3.5) + 1));
            sim.qualiTime = qTime;
            sim.qualiGridPos = gridPos;
            p.onQualifyingFinish(qTime, gridPos);
          } else {
            p.onRaceFinish(snapshot);
          }
        }
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      unsubscribeGameSettings();
      gamepadController.detach(window);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('apex-audio-volume', onAudioVol);
      window.removeEventListener('apex-audio-mute', onAudioMute);
      sim.carRigs.forEach((rig) => rig.dispose());
      sim.carNametags.forEach((tag) => {
        scene.remove(tag.sprite);
        tag.dispose();
      });
      sim.carNametags.clear();
      sim.trackScene?.dispose();
      if (sim.zoneMarkersGroup) {
        scene.remove(sim.zoneMarkersGroup);
        disposeGroupResources(sim.zoneMarkersGroup);
        sim.zoneMarkersGroup = null;
      }
      scene.remove(safetyCarGroup);
      disposeGroupResources(safetyCarGroup);
      debrisGeo.dispose();
      debrisMat.dispose();
      smokeGeo.dispose();
      smokeMat.dispose();
      slipGeo.dispose();
      slipMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      audio.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      simRef.current = null;
    };
  }, []);

  const lastRebuildKeyRef = useRef<string>('');

  // Rebuild track & grid when entering title or starting a new race/qualifying session (title attract mode rotates independently of raceConfig)
  useEffect(() => {
    if (!simRef.current) return;
    if (props.phase === 'paused' || props.phase === 'gameover') return;
    const isTitle = props.phase === 'title';
    const sessionPhase = isTitle ? 'title' : props.phase === 'qualifying' ? 'qualifying' : 'race';
    const ct = props.raceConfig.customTrack;
    const ctSig = ct ? `${ct.waypoints.length}:${ct.createdAt ?? 0}` : '';
    const modeSig = props.raceConfig.sessionMode ?? 'race';
    const key = isTitle
      ? 'title'
      : `${sessionPhase}:${modeSig}:${props.raceConfig.trackId}:${ctSig}:${props.runNonce}`;
    if (key === lastRebuildKeyRef.current) return;
    lastRebuildKeyRef.current = key;
    if (isTitle) {
      simRef.current.attractFocusPassedHalfway = false;
      simRef.current.attractTransitionState = 'idle';
      setAttractFaded(false);
    } else {
      simRef.current.attractTransitionState = 'idle';
      setAttractFaded(false);
    }
    simRef.current.rebuildWorld();
  }, [props.raceConfig.trackId, props.raceConfig.customTrack, props.raceConfig.sessionMode, props.runNonce, props.phase]);

  return (
    <>
      <div
        ref={containerRef}
        data-testid="race-viewport"
        className="fixed inset-0 w-full h-full min-h-0 overflow-hidden touch-none"
        aria-label="3D Miniature Motorsport Race Viewport"
      />
      <div
        aria-hidden="true"
        data-testid="attract-fade-overlay"
        className={`fixed inset-0 z-[5] pointer-events-none bg-[#0b0e13] transition-opacity duration-700 ease-in-out ${
          attractFaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}
