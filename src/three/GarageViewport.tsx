import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CarSpec, LiveryConfig } from '../game/types';
import { buildDiecastCar, BuiltCarRig } from './carBuilder';

export type GarageAngle = 'hero' | 'front' | 'side' | 'rear';

interface GarageViewportProps {
  carSpec: CarSpec;
  livery: LiveryConfig;
  angle: GarageAngle;
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

export function GarageViewport({ carSpec, livery, angle }: GarageViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    carAnchor: THREE.Group;
    carRig: BuiltCarRig | null;
    maxAniso: number;
    yaw: number;
    targetYaw: number;
    pitch: number;
    targetPitch: number;
    requestRender: (immediate?: boolean) => void;
  } | null>(null);

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
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = container.getBoundingClientRect();
    const w = Math.max(300, rect.width || 640);
    const h = Math.max(240, rect.height || 480);
    renderer.setSize(w, h);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10141c);
    scene.fog = new THREE.Fog(0x10141c, 12, 32);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 60);

    // 3-point automotive studio lighting
    const hemi = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.3);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    // Studio Turntable Plinth
    const floorGeo = new THREE.CircleGeometry(18, 48);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x121720,
      roughness: 0.55,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const plinthGeo = new THREE.CylinderGeometry(2.65, 2.8, 0.12, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1c2330,
      roughness: 0.35,
      metalness: 0.5,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.06;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const ringGeo = new THREE.RingGeometry(2.58, 2.66, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.005;
    scene.add(ring);

    const carAnchor = new THREE.Group();
    scene.add(carAnchor);

    let rafId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 4);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 8);
        }
      };
      timerId = window.setTimeout(poll, 4);
    }

    const drawFrame = () => {
      if (disposed) return;
      renderDirty = false;
      const s = stateRef.current;
      if (s) {
        const factor = isSoftwareGl ? 1 : 0.22;
        s.yaw += (s.targetYaw - s.yaw) * factor;
        s.pitch += (s.targetPitch - s.pitch) * factor;
        const dist = 6.2;
        camera.position.set(
          Math.sin(s.yaw) * Math.cos(s.pitch) * dist,
          Math.sin(s.pitch) * dist + 0.72,
          Math.cos(s.yaw) * Math.cos(s.pitch) * dist,
        );
        camera.lookAt(0, 0.48, 0);
        renderer.render(scene, camera);

        if (Math.abs(s.targetYaw - s.yaw) > 0.004 || Math.abs(s.targetPitch - s.pitch) > 0.004) {
          renderDirty = true;
        }
      }
      const done = () => {
        renderBusy = false;
        if (renderDirty && !disposed) requestRender();
      };
      if (isSoftwareGl) afterDraw(done);
      else done();
    };

    const requestRender = (immediate = false) => {
      if (disposed) return;
      if (immediate) {
        cancelAnimationFrame(rafId);
        clearTimeout(timerId);
        renderBusy = true;
        drawFrame();
        return;
      }
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      rafId = requestAnimationFrame(drawFrame);
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    stateRef.current = {
      scene,
      camera,
      renderer,
      carAnchor,
      carRig: null,
      maxAniso,
      yaw: 0.72,
      targetYaw: 0.72,
      pitch: 0.34,
      targetPitch: 0.34,
      requestRender,
    };

    // Drag to orbit turntable
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !stateRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      stateRef.current.targetYaw -= dx * 0.01;
      stateRef.current.targetPitch = Math.max(0.12, Math.min(1.05, stateRef.current.targetPitch + dy * 0.008));
      stateRef.current.requestRender();
    };
    const onPointerUp = () => {
      dragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !stateRef.current) return;
      const nw = Math.max(200, entry.contentRect.width);
      const nh = Math.max(200, entry.contentRect.height);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      requestRender();
    });
    ro.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (stateRef.current?.carRig) {
        stateRef.current.carRig.dispose();
      }
      floorGeo.dispose();
      floorMat.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      if (dom.parentNode === container) container.removeChild(dom);
      stateRef.current = null;
    };
  }, []);

  // Update car mesh & livery live
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.carRig) {
      s.carAnchor.remove(s.carRig.root);
      s.carRig.dispose();
    }
    const built = buildDiecastCar(carSpec.silhouette, carSpec.classId, livery, s.maxAniso, carSpec.id);
    s.carRig = built;
    s.carAnchor.add(built.root);
    s.requestRender(true);
  }, [carSpec, livery]);

  // Update preset camera angle
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (angle === 'hero') {
      s.targetYaw = 0.72;
      s.targetPitch = 0.34;
    } else if (angle === 'front') {
      s.targetYaw = 0.0;
      s.targetPitch = 0.24;
    } else if (angle === 'side') {
      s.targetYaw = Math.PI * 0.5;
      s.targetPitch = 0.22;
    } else if (angle === 'rear') {
      s.targetYaw = Math.PI - 0.35;
      s.targetPitch = 0.3;
    }
    s.requestRender(isSoftwareGlCheck(s));
  }, [angle]);

  return (
    <div
      ref={containerRef}
      data-testid="garage-viewport"
      data-car-id={carSpec.id}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D car livery preview turntable"
    />
  );
}

function isSoftwareGlCheck(s: { renderer: THREE.WebGLRenderer }): boolean {
  return !s.renderer.shadowMap.enabled;
}
