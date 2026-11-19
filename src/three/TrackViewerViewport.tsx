import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { compileTrack } from '../game/tracks';
import { TrackSpec } from '../game/types';
import { BuiltTrackScene, buildTrackEnvironment } from './trackBuilder';

export type TrackViewerAngle = 'overview' | 'top' | 'low';

interface TrackViewerViewportProps {
  trackSpec: TrackSpec;
  angle?: TrackViewerAngle;
  autoRotate?: boolean;
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

export function TrackViewerViewport({
  trackSpec,
  angle = 'overview',
  autoRotate = true,
}: TrackViewerViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const stateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    trackScene: BuiltTrackScene | null;
    maxAniso: number;
    center: THREE.Vector3;
    baseRadius: number;
    yaw: number;
    targetYaw: number;
    pitch: number;
    targetPitch: number;
    zoom: number;
    targetZoom: number;
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
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;

    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || container.clientWidth || 1));
    const h = Math.max(1, Math.floor(rect.height || container.clientHeight || 1));
    renderer.setSize(w, h, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(44, w / h, 2.0, 5000);

    const hemi = new THREE.HemisphereLight(0xcbe8ff, 0x263228, 0.85);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.85);
    sun.position.set(220, 320, 160);
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rim.position.set(-220, 140, -180);
    scene.add(rim);

    let rafId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 24);
        }
      };
      timerId = window.setTimeout(poll, 5);
    }

    const drawFrame = () => {
      if (disposed) return;
      renderDirty = false;
      const s = stateRef.current;
      if (s) {
        if (autoRotateRef.current && !dragging) {
          s.targetYaw += 0.0045;
          renderDirty = true;
        }
        const factor = isSoftwareGl ? 1 : 0.2;
        s.yaw += (s.targetYaw - s.yaw) * factor;
        s.pitch += (s.targetPitch - s.pitch) * factor;
        s.zoom += (s.targetZoom - s.zoom) * factor;

        const dist = s.baseRadius * s.zoom;
        const cosP = Math.cos(s.pitch);
        const sinP = Math.sin(s.pitch);
        camera.position.set(
          s.center.x + Math.sin(s.yaw) * cosP * dist,
          s.center.y + Math.max(12, sinP * dist),
          s.center.z + Math.cos(s.yaw) * cosP * dist,
        );
        camera.lookAt(s.center);
        renderer.render(scene, camera);

        if (
          Math.abs(s.targetYaw - s.yaw) > 0.003 ||
          Math.abs(s.targetPitch - s.pitch) > 0.003 ||
          Math.abs(s.targetZoom - s.zoom) > 0.005
        ) {
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
      trackScene: null,
      maxAniso,
      center: new THREE.Vector3(0, 0, 0),
      baseRadius: 500,
      yaw: 0.65,
      targetYaw: 0.65,
      pitch: 0.56,
      targetPitch: 0.56,
      zoom: 1.55,
      targetZoom: 1.55,
      requestRender,
    };

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
      stateRef.current.targetYaw -= dx * 0.008;
      stateRef.current.targetPitch = Math.max(
        0.16,
        Math.min(1.42, stateRef.current.targetPitch + dy * 0.007),
      );
      stateRef.current.requestRender();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!stateRef.current) return;
      e.preventDefault();
      stateRef.current.targetZoom = Math.max(
        0.55,
        Math.min(2.8, stateRef.current.targetZoom + e.deltaY * 0.0012),
      );
      stateRef.current.requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const rw = Math.max(1, Math.floor(container.clientWidth || 1));
      const rh = Math.max(1, Math.floor(container.clientHeight || 1));
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh, false);
      requestRender(true);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      stateRef.current?.trackScene?.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
  }, []);

  // Swap track environment whenever trackSpec changes
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    const compiled = compileTrack(trackSpec);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const pt of compiled.samples) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    }

    const spanX = Math.max(120, maxX - minX);
    const spanZ = Math.max(120, maxZ - minZ);
    const baseRadius = Math.max(180, Math.hypot(spanX, spanZ) * 0.5);

    s.center.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    s.baseRadius = baseRadius;
    s.camera.far = Math.max(4500, baseRadius * 8);
    s.camera.updateProjectionMatrix();

    if (s.trackScene) {
      s.scene.remove(s.trackScene.group);
      s.trackScene.dispose();
      s.trackScene = null;
    }

    const built = buildTrackEnvironment(compiled, s.maxAniso);
    s.trackScene = built;
    s.scene.add(built.group);
    s.scene.background = new THREE.Color(built.skyColor);
    s.scene.fog = new THREE.Fog(built.fogColor, baseRadius * 2.2, baseRadius * 6.5);
    s.requestRender(true);
  }, [trackSpec]);

  // Camera angle preset updates
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (angle === 'top') {
      s.targetPitch = 1.38;
      s.targetZoom = 1.48;
    } else if (angle === 'low') {
      s.targetPitch = 0.24;
      s.targetZoom = 1.15;
    } else {
      s.targetPitch = 0.56;
      s.targetZoom = 1.55;
    }
    s.requestRender();
  }, [angle]);

  return (
    <div
      ref={containerRef}
      data-testid="track-viewer-viewport"
      className="w-full h-full relative cursor-grab active:cursor-grabbing select-none"
      aria-label={`3D Circuit Preview: ${trackSpec.name}`}
    />
  );
}
