import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeCameraFrame } from '../game/camera';
import { CAR_CLASSES, CARS, getCarById, resolveCarSpecial } from '../game/cars';
import { MultiplayerClient } from '../game/multiplayer';
import {
  CarSimState,
  computeAIControl,
  computeRoadSurfaceTilt,
  computeStandings,
  createCarSimState,
  requestOnTrackPitStop,
  resolveCarCollisions,
  SPEED_KMH_FACTOR,
  stepCarPhysics,
} from '../game/physics';
import { compileTrack, getTrackById, sampleTrackAtT } from '../game/tracks';
import {
  AIPersonality,
  CameraMode,
  GamePhase,
  HudSnapshot,
  PitServiceAction,
  PitStrategy,
  RaceConfig,
  RoomPeer,
  TireCompound,
} from '../game/types';
import { MotorsportAudioEngine } from './audioEngine';
import { BuiltCarRig } from './carBuilder';
import { buildCarRigAsync } from './objCarLoader';
import { buildTrackEnvironment, BuiltTrackScene } from './trackBuilder';
import { telemetryRecorder } from '../game/telemetryRecorder';

interface RaceViewportProps {
  phase: GamePhase;
  raceConfig: RaceConfig;
  cameraMode: CameraMode;
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
  onToggleMute: () => void;
  onPitHandlerReady?: (handler: (action: PitServiceAction, nextCompound?: TireCompound) => boolean) => void;
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
  'M. Rossi', 'L. Vance', 'K. Tanaka', 'S. Lindqvist', 'A. Moreau', 'J. Alboni',
  'D. Kruger', 'R. Navarro', 'T. Sato', 'C. Bennett', 'F. Bellini', 'N. Becker',
  'E. Laurent', 'P. Silva', 'H. Weber', 'G. Conti', 'B. Vance', 'O. Lind',
  'V. Novak', 'Y. Takahashi', 'R. Mercer', 'I. Volkov', 'J. Mercier', 'K. Rossi',
];

// Zero-GC scratch objects
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();
const _camCurrPos = new THREE.Vector3();
const _camCurrLook = new THREE.Vector3();
const _particleDummy = new THREE.Object3D();

export function RaceViewport(props: RaceViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

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
    countdown: number;
    trackWetness: number;
    rainTimer: number;
    trauma: number;
    qualiTime: number | null;
    qualiGridPos: number | null;
    finishEmitted: boolean;
    lastHudTime: number;
    lastTelemetryTime: number;
    slipstreamMesh: THREE.InstancedMesh | null;
    rainMesh: THREE.InstancedMesh | null;
    keysPressed: Set<string>;
    specialJustPressed: boolean;
    worldVersion: number;
    orbitYaw: number;
    orbitPitch: number;
    orbitDist: number;
    targetOrbitYaw: number;
    targetOrbitPitch: number;
    targetOrbitDist: number;
    isDraggingOrbit: boolean;
    orbitUserRotated: boolean;
    lastCameraMode: CameraMode;
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
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

    const audio = new MotorsportAudioEngine();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const keysPressed = new Set<string>();

    const initialTrackSpec = propsRef.current.raceConfig.customTrack || getTrackById(propsRef.current.raceConfig.trackId);
    const initialCompiled = compileTrack(initialTrackSpec);
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
      countdown: 3.0,
      trackWetness: 0,
      rainTimer: 0,
      trauma: 0,
      qualiTime: null as number | null,
      qualiGridPos: null as number | null,
      finishEmitted: false,
      lastHudTime: 0,
      lastTelemetryTime: 0,
      slipstreamMesh,
      rainMesh,
      keysPressed,
      specialJustPressed: false,
      worldVersion: 0,
      orbitYaw: 0,
      orbitPitch: 0.35,
      orbitDist: 12.0,
      targetOrbitYaw: 0,
      targetOrbitPitch: 0.35,
      targetOrbitDist: 12.0,
      isDraggingOrbit: false,
      orbitUserRotated: false,
      lastCameraMode: propsRef.current.cameraMode,
      rebuildWorld: () => {},
    };

    propsRef.current.onPitHandlerReady?.((action: PitServiceAction, nextCompound?: TireCompound) => {
      const pCar = sim.cars.find((c) => c.isPlayer);
      if (!pCar) return false;
      const ok = requestOnTrackPitStop(pCar, action, nextCompound);
      if (ok) sim.audio.playBeep(560, 0.08);
      return ok;
    });

    const rebuildWorld = () => {
      sim.worldVersion++;
      const worldVersion = sim.worldVersion;
      const cfg = propsRef.current.raceConfig;
      const currentPhase = propsRef.current.phase;
      const trackSpec = cfg.customTrack || getTrackById(cfg.trackId);
      const compiled = compileTrack(trackSpec);
      sim.compiledTrack = compiled;

      if (sim.trackScene) {
        scene.remove(sim.trackScene.group);
        sim.trackScene.dispose();
      }
      const builtTrack = buildTrackEnvironment(compiled, maxAniso);
      sim.trackScene = builtTrack;
      scene.add(builtTrack.group);

      scene.background = new THREE.Color(builtTrack.skyColor);
      scene.fog = new THREE.FogExp2(builtTrack.fogColor, 0.0017);

      // Clear old cars
      sim.carRigs.forEach((rig) => {
        scene.remove(rig.root);
        rig.dispose();
      });
      sim.carRigs.clear();
      sim.cars = [];

      const isQuali = currentPhase === 'qualifying';
      const activeClasses = cfg.activeClasses.length > 0 ? cfg.activeClasses : [getCarById(cfg.playerCarId).classId];
      const allowedCars = CARS.filter((c) => activeClasses.includes(c.classId));
      const poolCars = allowedCars.length > 0 ? allowedCars : CARS;

      // Sort classes fastest first for multi-class grid order
      const sortedPool = [...poolCars].sort(
        (a, b) => CAR_CLASSES[b.classId].basePaceIndex - CAR_CLASSES[a.classId].basePaceIndex,
      );

      const newCars: CarSimState[] = [];
      const playerSpec = getCarById(cfg.playerCarId);

      // Determine grid slot for player and peers
      const peers = propsRef.current.roomPeers.filter((p) => p.peerId !== propsRef.current.mpClient.peerId);
      const aiCount = isQuali
        ? 0
        : cfg.noAi
        ? 0
        : cfg.aiBotCount !== undefined
        ? Math.max(0, Math.min(23, cfg.aiBotCount))
        : Math.max(0, cfg.gridSize - 1 - peers.length);
      const totalGrid = isQuali ? 1 : currentPhase === 'title' ? 10 : Math.max(1, 1 + peers.length + aiCount);
      const playerSlot = isQuali
        ? 0
        : sim.qualiGridPos !== null
        ? Math.min(totalGrid - 1, sim.qualiGridPos - 1)
        : Math.min(totalGrid - 1, Math.floor(totalGrid * 0.45));

      const aiPaceMult = (1.0 * (cfg.aiDifficulty === 'Rookie' ? 0.84 : cfg.aiDifficulty === 'Amateur' ? 0.92 : cfg.aiDifficulty === 'Pro' ? 1.0 : 1.07)) + cfg.aiAdaptiveBoost;

      let peerCursor = 0;
      let aiCursor = 0;
      for (let slot = 0; slot < totalGrid; slot++) {
        if (slot === playerSlot && currentPhase !== 'title') {
          const pCar = createCarSimState({
            id: 'player',
            name: 'You',
            isPlayer: true,
            carId: playerSpec.id,
            livery: cfg.playerLivery,
            gridSlot: isQuali ? 0 : slot,
            compiledTrack: compiled,
            compound: cfg.startingCompound,
          });
          if (isQuali) {
            // Flying hotlap start: place just before final corner at speed!
            const sp = sampleTrackAtT(compiled, 0.88);
            pCar.trackT = 0.88;
            pCar.prevTrackT = 0.88;
            pCar.x = sp.x;
            pCar.y = sp.y;
            pCar.z = sp.z;
            pCar.heading = Math.atan2(sp.tx, sp.tz);
            pCar.speed = 38;
            pCar.totalDistance = -0.12;
          }
          newCars.push(pCar);
        } else if (peerCursor < peers.length && currentPhase !== 'title' && !isQuali) {
          const peer = peers[peerCursor++];
          newCars.push(
            createCarSimState({
              id: peer.peerId,
              name: peer.name,
              isPlayer: false,
              isHumanPeer: true,
              carId: peer.carId,
              livery: peer.livery,
              gridSlot: slot,
              compiledTrack: compiled,
              compound: cfg.startingCompound,
            }),
          );
        } else {
          // Fill remaining grid slots with AI Bots across active classes
          const pick = sortedPool[(aiCursor * 3 + slot) % sortedPool.length];
          const personality = PERSONALITIES[aiCursor % PERSONALITIES.length];
          const jitter = 0.985 + ((aiCursor * 17) % 7) * 0.006;
          let aiLivery = {
            ...pick.defaultLivery,
            driverNumber: String(((aiCursor + 2) * 7) % 98 + 1),
          };
          let botName = AI_NAMES[aiCursor % AI_NAMES.length];

          // If car has multiple team liveries (F1 2026, F1 2021, LMP2), cycle through them across the AI grid
          if (pick.liveries && pick.liveries.length > 0) {
            const preset = pick.liveries[aiCursor % pick.liveries.length];
            aiLivery = { ...preset.livery };
            botName = `${preset.name}`;
          }

          const bot = createCarSimState({
            id: `ai-${aiCursor}`,
            name: botName,
            isPlayer: false,
            carId: pick.id,
            livery: aiLivery,
            gridSlot: slot,
            compiledTrack: compiled,
            compound: cfg.weather === 'dynamic-rain' && aiCursor % 3 === 0 ? 'wet' : 'medium',
            personality,
            aiPaceMultiplier: aiPaceMult * jitter,
          });
          if (currentPhase === 'title') {
            // Spread title cars gracefully around the track for a live world showcase!
            const t = (slot / totalGrid) % 1;
            const sp = sampleTrackAtT(compiled, t);
            bot.trackT = t;
            bot.prevTrackT = t;
            bot.x = sp.x + sp.nx * ((slot % 2 === 0 ? -1 : 1) * 2.5);
            bot.y = sp.y;
            bot.z = sp.z + sp.nz * ((slot % 2 === 0 ? -1 : 1) * 2.5);
            bot.heading = Math.atan2(sp.tx, sp.tz);
            bot.speed = 34;
            bot.totalDistance = t;
          }
          newCars.push(bot);
          aiCursor++;
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
      }

      const isAutostart = typeof window !== 'undefined' && window.location.search.includes('autostart=1');
      sim.countdown = currentPhase === 'playing' && !isAutostart ? 2.0 : 0;
      sim.trackWetness = cfg.weather === 'dynamic-rain' ? 0.35 : 0;
      sim.rainTimer = 0;
      sim.trauma = 0;
      sim.finishEmitted = false;

      // Reset behavioral cloning telemetry recorder for playable sessions
      const playerAnchor = newCars.find((c) => c.isPlayer);
      if (playerAnchor && currentPhase !== 'title') {
        telemetryRecorder.resetSession();
      }

      // Position camera initially behind player or lead car
      const anchor = newCars.find((c) => c.isPlayer) ?? newCars[0];
      if (anchor) {
        sim.orbitYaw = sim.targetOrbitYaw = anchor.heading + Math.PI;
        sim.orbitUserRotated = false;
        const initSample = sampleTrackAtT(compiled, anchor.trackT);
        const initTilt = computeRoadSurfaceTilt(initSample, anchor.heading);
        const initFrame = computeCameraFrame(
          propsRef.current.cameraMode,
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
        propsRef.current.onCycleCamera();
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

    const clearKeys = () => {
      keysPressed.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);

    let lastMouseX = 0;
    let lastMouseY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (propsRef.current.cameraMode === 'orbit') {
        sim.isDraggingOrbit = true;
        sim.orbitUserRotated = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (sim.isDraggingOrbit && propsRef.current.cameraMode === 'orbit') {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        sim.targetOrbitYaw -= dx * 0.008;
        sim.targetOrbitPitch = Math.max(0.08, Math.min(1.22, sim.targetOrbitPitch + dy * 0.006));
      }
    };

    const onPointerUp = () => {
      sim.isDraggingOrbit = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (propsRef.current.cameraMode === 'orbit') {
        e.preventDefault();
        sim.targetOrbitDist = Math.max(5.0, Math.min(32.0, sim.targetOrbitDist + e.deltaY * 0.015));
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
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('apex-audio-volume', onAudioVol);
    window.addEventListener('apex-audio-mute', onAudioMute);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', onResize);

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

      if (activePhase === 'title') {
        // Live world tour: AI cars race smoothly around the circuit while camera glides!
        for (let i = 0; i < sim.cars.length; i++) {
          const c = sim.cars[i];
          const aiIn = computeAIControl(c, sim.compiledTrack, sim.cars, dt, 0);
          stepCarPhysics(c, aiIn, sim.compiledTrack, dt, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: sim.cars,
          });
        }
        resolveCarCollisions(sim.cars);

        // Smooth camera flyover following lead pack
        const lead = sim.cars[0];
        if (lead) {
          const orbitAngle = now * 0.00022;
          _camDesiredPos.set(
            lead.x + Math.cos(orbitAngle) * 32,
            lead.y + 18,
            lead.z + Math.sin(orbitAngle) * 32,
          );
          _camDesiredLook.set(lead.x, lead.y + 0.5, lead.z);
          const damp = 1 - Math.exp(-3.5 * dt);
          _camCurrPos.lerp(_camDesiredPos, damp);
          _camCurrLook.lerp(_camDesiredLook, damp);
          camera.position.copy(_camCurrPos);
          camera.lookAt(_camCurrLook);
        }
        sim.audio.updateEngine(0, 0, 'v8-hybrid', false);
      } else if (activePhase === 'playing' || activePhase === 'qualifying') {
        const isQuali = activePhase === 'qualifying';
        if (sim.countdown > 0) {
          const prevCeil = Math.ceil(sim.countdown);
          const countdownStep = Math.min(Math.max(rawDt, 0.001), 0.35);
          sim.countdown = Math.max(0, sim.countdown - countdownStep);
          const nextCeil = Math.ceil(sim.countdown);
          if (nextCeil < prevCeil && nextCeil > 0) {
            sim.audio.playBeep(520, 0.12);
          } else if (sim.countdown === 0 && prevCeil > 0) {
            sim.audio.playBeep(880, 0.28);
          }
        }

        // Update gantry lights
        if (sim.trackScene) {
          const litCount = sim.countdown > 0 ? Math.min(5, Math.max(1, Math.ceil(((2.0 - sim.countdown) / 2.0) * 5))) : 0;
          sim.trackScene.startLightMats.forEach((m, idx) => {
            if (sim.countdown <= 0) {
              m.emissive.setHex(0x22c55e);
              m.emissiveIntensity = now % 3000 < 1500 ? 0.5 : 0;
            } else {
              m.emissive.setHex(0xef4444);
              m.emissiveIntensity = idx < litCount ? 2.2 : 0.05;
            }
          });
        }

        // Dynamic Rain Weather curve
        if (p.raceConfig.weather === 'dynamic-rain') {
          sim.rainTimer += dt;
          sim.trackWetness = 0.42 + Math.sin(sim.rainTimer * 0.08) * 0.35;
          rainMesh.visible = sim.trackWetness > 0.3;
        } else {
          sim.trackWetness = 0;
          rainMesh.visible = false;
        }

        // Read keyboard + gamepad player controls
        let throttle = keysPressed.has('KeyW') || keysPressed.has('ArrowUp') ? 1 : 0;
        let brake = keysPressed.has('KeyS') || keysPressed.has('ArrowDown') ? 1 : 0;
        let steer =
          (keysPressed.has('KeyD') || keysPressed.has('ArrowRight') ? 1 : 0) -
          (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft') ? 1 : 0);
        let specialPressed =
          sim.specialJustPressed ||
          keysPressed.has('ShiftLeft') ||
          keysPressed.has('ShiftRight') ||
          keysPressed.has('KeyE') ||
          keysPressed.has('Space');

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0];
        if (gp) {
          const axisX = gp.axes[0] ?? 0;
          if (Math.abs(axisX) > 0.14) steer = axisX;
          if (gp.buttons[7]?.value > 0.1) throttle = gp.buttons[7].value;
          if (gp.buttons[6]?.value > 0.1) brake = gp.buttons[6].value;
          if (
            gp.buttons[0]?.pressed ||
            gp.buttons[2]?.pressed ||
            gp.buttons[4]?.pressed ||
            gp.buttons[5]?.pressed
          ) {
            specialPressed = true;
            sim.specialJustPressed = true;
          }
        }

        if (sim.countdown <= 0) {
          for (let i = 0; i < sim.cars.length; i++) {
            const c = sim.cars[i];
            if (c.isPlayer) {
              c.pitStrategy = p.pitStrategy;
              const playerInput = {
                throttle,
                brake,
                steer,
                specialPressed,
                specialJustPressed: sim.specialJustPressed,
              };
              stepCarPhysics(
                c,
                playerInput,
                sim.compiledTrack,
                dt,
                {
                  trackWetness: sim.trackWetness,
                  totalLaps: p.raceConfig.totalLaps,
                  isQualifying: isQuali,
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
                c.flashingHeadlights = pkt.flashingHeadlights;
              }
            } else {
              const aiIn = computeAIControl(c, sim.compiledTrack, sim.cars, dt, sim.trackWetness);
              stepCarPhysics(c, aiIn, sim.compiledTrack, dt, {
                trackWetness: sim.trackWetness,
                totalLaps: p.raceConfig.totalLaps,
                isQualifying: isQuali,
                allCars: sim.cars,
              });
            }
          }

          const impact = resolveCarCollisions(sim.cars);
          if (impact > 5) {
            sim.trauma = Math.min(1, sim.trauma + impact * 0.045);
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
            flashingHeadlights: playerCar.flashingHeadlights,
          });
        }

        // Camera Rig: Rigid Hood Cam, Interactive Orbit Cam, or Spring-Damped Chase Cam
        if (playerCar) {
          const mode = p.cameraMode;
          const targetNear = mode === 'hood' ? 0.06 : 0.4;
          if (Math.abs(camera.near - targetNear) > 0.01) {
            camera.near = targetNear;
            camera.updateProjectionMatrix();
          }

          const trkSample = sampleTrackAtT(sim.compiledTrack, playerCar.trackT);
          const fallbackTilt = computeRoadSurfaceTilt(trkSample, playerCar.heading);
          const pPitch = playerCar.pitch ?? fallbackTilt.pitchRad;
          const pRoll = playerCar.roll ?? fallbackTilt.rollRad;

          if (mode !== sim.lastCameraMode) {
            sim.lastCameraMode = mode;
            if (mode === 'orbit') {
              sim.orbitYaw = sim.targetOrbitYaw = playerCar.heading + Math.PI;
              sim.orbitUserRotated = false;
            }
          }

          if (mode === 'orbit') {
            // Only auto-align behind the car before the user drags; once orbiting, stay free of snap-back!
            if (!sim.isDraggingOrbit && !sim.orbitUserRotated && playerCar.speed > 2.0) {
              const desiredYaw = playerCar.heading + Math.PI;
              let diff = desiredYaw - sim.targetOrbitYaw;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              sim.targetOrbitYaw += diff * Math.min(2.5 * dt, 0.15);
            }

            const angDamp = sim.isDraggingOrbit ? 1.0 : 1 - Math.exp(-22 * dt);
            sim.orbitYaw += (sim.targetOrbitYaw - sim.orbitYaw) * angDamp;
            sim.orbitPitch += (sim.targetOrbitPitch - sim.orbitPitch) * angDamp;
            sim.orbitDist += (sim.targetOrbitDist - sim.orbitDist) * (1 - Math.exp(-18 * dt));

            // Lock orbit pivot directly to playerCar post-physics position (zero positional lerp/lag)
            const targetLookX = playerCar.x;
            const targetLookY = playerCar.y + 0.8;
            const targetLookZ = playerCar.z;

            const cosP = Math.cos(sim.orbitPitch);
            const sinP = Math.sin(sim.orbitPitch);
            const sinY = Math.sin(sim.orbitYaw);
            const cosY = Math.cos(sim.orbitYaw);

            const rawCamX = targetLookX + sinY * cosP * sim.orbitDist;
            const rawCamY = targetLookY + sinP * sim.orbitDist;
            const rawCamZ = targetLookZ + cosY * cosP * sim.orbitDist;

            // Ground-plane clamping: prevent clipping through track/grass plane
            const clampedCamY = Math.max(playerCar.y + 0.45, rawCamY);

            _camCurrPos.set(rawCamX, clampedCamY, rawCamZ);
            _camCurrLook.set(targetLookX, targetLookY, targetLookZ);

            camera.up.set(0, 1, 0);
            camera.position.copy(_camCurrPos);
            camera.lookAt(_camCurrLook);

            if (Math.abs(camera.fov - 52) > 0.1) {
              camera.fov += (52 - camera.fov) * Math.min(1, dt * 6);
              camera.updateProjectionMatrix();
            }
          } else {
            const camFrame = computeCameraFrame(mode, playerCar, pPitch, pRoll);

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
            const shake = sim.trauma * sim.trauma * 0.45;
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.y += (Math.random() - 0.5) * shake;
            sim.trauma = Math.max(0, sim.trauma - dt * 2.4);
          }

          // Engine audio synthesis
          const liveSpeedKmh = Math.round(playerCar.speed * SPEED_KMH_FACTOR);
          const engineLoad =
            playerCar.gear === -1 && playerCar.transmissionMode !== 'manual' ? brake : throttle;
          sim.audio.updateEngine(
            playerCar.rpmNormalized,
            engineLoad,
            playerCar.carSpec.engineType,
            sim.countdown <= 0,
            playerCar.carSpec.classId,
            brake > 0,
            liveSpeedKmh,
            playerCar.carSpec.id,
            playerCar.lateralSlip,
            playerCar.onKerb,
            playerCar.gear,
          );
        }
      } else {
        // Paused or Gameover: silence engine
        sim.audio.updateEngine(0, 0, 'v8-hybrid', false);
      }

      // Sync Car 3D Transforms, Rotating Wheels, Active Aero Flap & Lights
      for (let i = 0; i < sim.cars.length; i++) {
        const c = sim.cars[i];
        const rig = sim.carRigs.get(c.id);
        if (!rig) continue;

        const trkSample = sampleTrackAtT(sim.compiledTrack, c.trackT);
        const fallbackTilt = computeRoadSurfaceTilt(trkSample, c.heading);
        const roadPitch = c.pitch ?? fallbackTilt.pitchRad;
        const roadRoll = c.roll ?? fallbackTilt.rollRad;

        rig.root.position.set(c.x, c.y + 0.02, c.z);
        rig.root.rotation.order = 'YXZ';
        rig.root.rotation.y = c.heading;
        rig.root.rotation.x = -roadPitch;
        rig.root.rotation.z = -roadRoll;

        // Subtle die-cast suspension roll in corners
        rig.bodyGroup.rotation.z = -c.steerAngle * Math.min(1, c.speed / 30) * 0.09;

        const wheelSpin = (((c.gear === -1 ? -1 : 1) * c.speed) / 0.35) * dt;
        for (const w of rig.allWheels) {
          w.rotation.x += wheelSpin;
        }
        for (const fw of rig.frontWheels) {
          fw.rotation.y = -c.steerAngle;
        }

        // Active Aero Wing Flaps (F1 2026 Front + Rear Wing Articulation)
        if (resolveCarSpecial(c.carSpec).specialType === 'active-aero') {
          if (rig.rearWingFlap) {
            const targetRear = c.specialActive ? 0.02 : 0.42;
            rig.rearWingFlap.rotation.x += (targetRear - rig.rearWingFlap.rotation.x) * Math.min(1, dt * 14);
          }
          if (rig.frontWingFlap) {
            const targetFront = c.specialActive ? 0.02 : 0.28;
            rig.frontWingFlap.rotation.x += (targetFront - rig.frontWingFlap.rotation.x) * Math.min(1, dt * 14);
          }
        }

        // Prototype Headlight Flashing
        const flashIntensity = c.flashingHeadlights ? 4.5 : 1.4;
        for (const hm of rig.headlightMats) {
          hm.emissiveIntensity = flashIntensity;
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
      if ((activePhase === 'playing' || activePhase === 'qualifying') && playerCar && now - sim.lastHudTime > 80) {
        sim.lastHudTime = now;
        const standings = computeStandings(sim.cars, sim.compiledTrack);
        const playerStanding = standings.find((s) => s.isPlayer) ?? standings[0];
        const pIdx = standings.findIndex((s) => s.isPlayer);
        const behind = pIdx >= 0 && pIdx + 1 < standings.length ? standings[pIdx + 1] : null;
        const classCars = standings.filter((s) => s.classId === playerCar.carSpec.classId).length;

        const speedKmh = Math.round(playerCar.speed * SPEED_KMH_FACTOR);

        const snapshot: HudSnapshot = {
          phase: activePhase,
          countdown: sim.countdown,
          speedKmh,
          gear: playerCar.gear,
          rpmNormalized: playerCar.rpmNormalized,
          lap: playerCar.lap,
          totalLaps: activePhase === 'qualifying' ? 1 : p.raceConfig.totalLaps,
          position: playerStanding.position,
          totalCars: standings.length,
          classPosition: playerStanding.classPosition,
          classCars,
          currentLapTime: playerCar.currentLapTime,
          bestLapTime: playerCar.bestLapTime,
          lastLapTime: playerCar.lastLapTime,
          intervalAhead: pIdx > 0 ? playerStanding.intervalToAhead : null,
          intervalBehind: behind ? behind.intervalToAhead : null,
          tireWear: Math.round(playerCar.tireWear),
          tireTemp: Math.round(playerCar.tireTemp),
          compound: playerCar.compound,
          fuel: Math.round(playerCar.fuel),
          fuelLapsRemaining: playerCar.fuelLapsRemaining,
          attackModeUsesRemaining: playerCar.attackModeUsesRemaining,
          attackModeTimer: playerCar.attackModeTimer,
          aeroDamage: Math.round(playerCar.aeroDamage),
          specialCharge: Math.round(playerCar.specialCharge),
          specialActive: playerCar.specialActive,
          inSlipstream: playerCar.inSlipstream,
          trackWetness: sim.trackWetness,
          warningCount: playerCar.warningCount,
          penaltyTimeRemaining: playerCar.penaltyTimeRemaining,
          isStoppedOnTrack: playerCar.speed < 1.5 && !playerCar.finished,
          pitStopRemaining: playerCar.pitStopRemaining,
          pitStopTotal: playerCar.pitStopTotal,
          pitActiveTask: playerCar.pitActiveTask,
          pitQueue: [...playerCar.pitQueue],
          pitStrategy: playerCar.pitStrategy,
          cameraMode: p.cameraMode,
          standings,
          minimapDots: sim.cars.map((c) => ({
            id: c.id,
            x: c.x,
            z: c.z,
            classId: c.carSpec.classId,
            isPlayer: c.isPlayer,
            isHumanPeer: c.isHumanPeer,
          })),
          qualiResultTime: sim.qualiTime,
          qualiGridPos: sim.qualiGridPos,
        };

        p.onHudUpdate(snapshot);

        // Check Qualifying or Race Completion
        if (playerCar.finished && !sim.finishEmitted) {
          sim.finishEmitted = true;
          if (activePhase === 'qualifying') {
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
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('apex-audio-volume', onAudioVol);
      window.removeEventListener('apex-audio-mute', onAudioMute);
      sim.carRigs.forEach((rig) => rig.dispose());
      sim.trackScene?.dispose();
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

  // Rebuild track & grid only when track changes in title, or when starting a new race/qualifying session (runNonce changes)
  useEffect(() => {
    if (!simRef.current) return;
    if (props.phase === 'paused' || props.phase === 'gameover') return;
    const sessionPhase = props.phase === 'title' ? 'title' : props.phase === 'qualifying' ? 'qualifying' : 'race';
    const ct = props.raceConfig.customTrack;
    const ctSig = ct ? `${ct.waypoints.length}:${ct.createdAt ?? 0}` : '';
    const key = `${sessionPhase}:${props.raceConfig.trackId}:${ctSig}:${props.runNonce}`;
    if (key === lastRebuildKeyRef.current) return;
    lastRebuildKeyRef.current = key;
    simRef.current.rebuildWorld();
  }, [props.raceConfig.trackId, props.raceConfig.customTrack, props.runNonce, props.phase]);

  return (
    <div
      ref={containerRef}
      data-testid="race-viewport"
      className="fixed inset-0 w-full h-full"
      aria-label="3D Miniature Motorsport Race Viewport"
    />
  );
}
