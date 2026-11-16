import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CUSTOM_TRACK_TEMPLATES,
  TrackGeometryAnalysis,
  analyzeTrackGeometry,
  exportTrackToJson,
  exportTrackToShareCode,
  importTrackFromString,
  saveCustomTrack,
} from '../game/customTracks';
import { CompiledTrack, compileTrack } from '../game/tracks';
import { SceneryTheme, TrackSpec, TrackWaypoint } from '../game/types';
import { BuiltTrackScene, buildTrackEnvironment } from '../three/trackBuilder';

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

interface TrackStudioModalProps {
  initialTrack?: TrackSpec;
  onClose: () => void;
  onSaveTrack: (track: TrackSpec) => void;
  onTestDrive: (track: TrackSpec) => void;
}

const ENVIRONMENT_PRESETS: Array<{ id: SceneryTheme; label: string; desc: string }> = [
  { id: 'stadium', label: 'GP Circuit', desc: 'Grand prix grandstands & manicured turf' },
  { id: 'street-night', label: 'Night Street', desc: 'Neon cityscape, concrete barriers & floodlights' },
  { id: 'desert', label: 'Desert Dunes', desc: 'Sun-baked canyon tarmac & sand runoff' },
  { id: 'forest', label: 'Forest Green', desc: 'Dense pine tree perimeter & cool air' },
];

const KERB_PRIMARY_OPTIONS = ['#dc2626', '#2563eb', '#16a34a', '#0f172a', '#ea580c'];
const KERB_SECONDARY_OPTIONS = ['#ffffff', '#facc15', '#38bdf8', '#e2e8f0'];

export function TrackStudioModal({
  initialTrack,
  onClose,
  onSaveTrack,
  onTestDrive,
}: TrackStudioModalProps) {
  // Working track definition
  const [trackSpec, setTrackSpec] = useState<TrackSpec>(() => {
    if (initialTrack) {
      return JSON.parse(JSON.stringify(initialTrack));
    }
    return JSON.parse(JSON.stringify(CUSTOM_TRACK_TEMPLATES[0]));
  });

  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // 2D Canvas interaction state
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const draggingNodeRef = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // 3D Preview container
  const canvas3dRef = useRef<HTMLCanvasElement | null>(null);

  // Compiled geometry analysis & validation
  const analysis: TrackGeometryAnalysis = useMemo(() => {
    return analyzeTrackGeometry(trackSpec.waypoints);
  }, [trackSpec.waypoints]);

  const compiledTrack: CompiledTrack = useMemo(() => {
    return compileTrack(trackSpec);
  }, [trackSpec]);

  // Update track waypoint
  const updateWaypoint = useCallback(
    (index: number, patch: Partial<TrackWaypoint>) => {
      setTrackSpec((prev) => {
        const nextWps = [...prev.waypoints];
        nextWps[index] = { ...nextWps[index], ...patch };
        return { ...prev, waypoints: nextWps };
      });
    },
    [],
  );

  // Insert waypoint after selected
  const handleInsertWaypoint = useCallback(() => {
    setTrackSpec((prev) => {
      const idx = selectedNodeIndex;
      const cur = prev.waypoints[idx];
      const nextIdx = (idx + 1) % prev.waypoints.length;
      const next = prev.waypoints[nextIdx];

      const newPoint: TrackWaypoint = {
        x: Math.round((cur.x + next.x) * 0.5),
        y: Math.round(((cur.y ?? 0) + (next.y ?? 0)) * 0.5 * 10) / 10,
        z: Math.round((cur.z + next.z) * 0.5),
        width: Math.round(((cur.width ?? prev.trackWidth) + (next.width ?? prev.trackWidth)) * 0.5),
        banking: Math.round(((cur.banking ?? 0) + (next.banking ?? 0)) * 0.5),
        tension: Math.round((((cur.tension ?? 0.5) + (next.tension ?? 0.5)) * 0.5) * 100) / 100,
      };

      const newWps = [...prev.waypoints];
      newWps.splice(idx + 1, 0, newPoint);
      return { ...prev, waypoints: newWps };
    });
    setSelectedNodeIndex((prev) => prev + 1);
  }, [selectedNodeIndex]);

  // Delete waypoint
  const handleDeleteWaypoint = useCallback(() => {
    if (trackSpec.waypoints.length <= 4) return;
    setTrackSpec((prev) => {
      const newWps = prev.waypoints.filter((_, i) => i !== selectedNodeIndex);
      return { ...prev, waypoints: newWps };
    });
    setSelectedNodeIndex((prev) => Math.max(0, prev - 1));
  }, [selectedNodeIndex, trackSpec.waypoints.length]);

  // Switch template
  const handleLoadTemplate = (templateId: string) => {
    const tmpl = CUSTOM_TRACK_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    setTrackSpec(JSON.parse(JSON.stringify(tmpl)));
    setSelectedNodeIndex(0);
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  };

  const buildFinalizedTrack = useCallback((): TrackSpec => {
    const isTemplateId = !trackSpec.id || trackSpec.id.startsWith('template-');
    const cleanName = trackSpec.name.trim() || 'Custom Circuit';
    const shortName =
      cleanName
        .replace(/[^A-Za-z0-9 ]/g, '')
        .trim()
        .slice(0, 8)
        .toUpperCase() || 'CUSTOM';
    return {
      ...trackSpec,
      id: isTemplateId
        ? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        : trackSpec.id,
      name: cleanName,
      shortName,
      isCustom: true,
      targetLapSeconds: analysis.estimatedLapSeconds,
      corners: analysis.cornerCount,
      createdAt: Date.now(),
    };
  }, [trackSpec, analysis.estimatedLapSeconds, analysis.cornerCount]);

  // Save track handler
  const handleSave = () => {
    const finalized = buildFinalizedTrack();
    setTrackSpec(finalized);
    saveCustomTrack(finalized);
    onSaveTrack(finalized);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2400);
  };

  // Test drive handler
  const handleTestDrive = () => {
    const finalized = buildFinalizedTrack();
    setTrackSpec(finalized);
    saveCustomTrack(finalized);
    onTestDrive(finalized);
  };

  // Import handler
  const handleImportSubmit = () => {
    setImportError(null);
    const result = importTrackFromString(importText);
    if (!result.success || !result.track) {
      setImportError(result.error ?? 'Invalid track JSON or share code');
      return;
    }
    setTrackSpec(result.track);
    setSelectedNodeIndex(0);
    setExportModalOpen(false);
    setImportText('');
  };

  // ----------------------------------------------------
  // 2D Canvas Editor Rendering & Pointer Events
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render2d = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background grid
      ctx.fillStyle = '#0f141c';
      ctx.fillRect(0, 0, width, height);

      const centerX = width * 0.5 + pan.x;
      const centerY = height * 0.5 + pan.y;
      const scale = zoom * 1.35;

      const toScreen = (x: number, z: number) => ({
        sx: centerX + x * scale,
        sy: centerY + z * scale,
      });

      // Grid lines (20m cells)
      ctx.strokeStyle = '#1b2230';
      ctx.lineWidth = 1;
      const gridStep = 40 * scale;
      const startX = (centerX % gridStep) - gridStep;
      const startY = (centerY % gridStep) - gridStep;

      ctx.beginPath();
      for (let x = startX; x < width + gridStep; x += gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height + gridStep; y += gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Axis crosshairs
      ctx.strokeStyle = '#273349';
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Draw compiled smooth track spline ribbon
      if (compiledTrack.samples.length > 1) {
        // Runoff apron outline
        ctx.beginPath();
        for (let i = 0; i < compiledTrack.samples.length; i++) {
          const s = compiledTrack.samples[i];
          const hw = (s.width ? s.width * 0.5 : trackSpec.trackWidth * 0.5) + 3.5;
          const pt = toScreen(s.x + s.nx * hw, s.z + s.nz * hw);
          if (i === 0) ctx.moveTo(pt.sx, pt.sy);
          else ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.closePath();
        ctx.fillStyle = trackSpec.scenery === 'desert' ? 'rgba(196,156,110,0.18)' : 'rgba(59,72,61,0.22)';
        ctx.fill();

        // Main asphalt ribbon
        ctx.beginPath();
        for (let i = 0; i < compiledTrack.samples.length; i++) {
          const s = compiledTrack.samples[i];
          const hw = s.width ? s.width * 0.5 : trackSpec.trackWidth * 0.5;
          const pt = toScreen(s.x + s.nx * hw, s.z + s.nz * hw);
          if (i === 0) ctx.moveTo(pt.sx, pt.sy);
          else ctx.lineTo(pt.sx, pt.sy);
        }
        for (let i = compiledTrack.samples.length - 1; i >= 0; i--) {
          const s = compiledTrack.samples[i];
          const hw = s.width ? s.width * 0.5 : trackSpec.trackWidth * 0.5;
          const pt = toScreen(s.x - s.nx * hw, s.z - s.nz * hw);
          ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.closePath();
        ctx.fillStyle = '#222938';
        ctx.fill();
        ctx.strokeStyle = '#3d485c';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Centerline guide
        ctx.beginPath();
        for (let i = 0; i < compiledTrack.samples.length; i++) {
          const s = compiledTrack.samples[i];
          const pt = toScreen(s.x, s.z);
          if (i === 0) ctx.moveTo(pt.sx, pt.sy);
          else ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Pit lane corridor line
        const pitSideSign = trackSpec.pitSide === 'right' ? 1 : -1;
        ctx.beginPath();
        for (let i = 0; i < compiledTrack.samples.length; i += 2) {
          const s = compiledTrack.samples[i];
          if (s.t >= 0.88 || s.t <= 0.10) {
            const pitLat = pitSideSign * (trackSpec.trackWidth * 0.5 + 5.2);
            const pt = toScreen(s.x + s.nx * pitLat, s.z + s.nz * pitLat);
            if (s.t >= 0.88 && i === Math.floor(compiledTrack.samples.length * 0.88)) {
              ctx.moveTo(pt.sx, pt.sy);
            } else {
              ctx.lineTo(pt.sx, pt.sy);
            }
          }
        }
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Start/Finish line indicator
      const sfIdx = trackSpec.startNodeIndex ?? 0;
      const sfWp = trackSpec.waypoints[sfIdx % trackSpec.waypoints.length];
      if (sfWp) {
        const sfPt = toScreen(sfWp.x, sfWp.z);
        ctx.save();
        ctx.translate(sfPt.sx, sfPt.sy);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px Oxanium, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S/F', 0, 0);
        ctx.restore();
      }

      // Draw Control Point Handles
      trackSpec.waypoints.forEach((wp, idx) => {
        const pt = toScreen(wp.x, wp.z);
        const isSelected = idx === selectedNodeIndex;
        const isSF = idx === (trackSpec.startNodeIndex ?? 0);
        const elevation = wp.y ?? 0;

        // Overpass badge if elevation > 4m
        if (elevation >= 4) {
          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // Handle outer ring
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, isSelected ? 10 : 7, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#38bdf8' : isSF ? '#ef4444' : '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : '#0b0f17';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Node index text label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Oxanium, sans-serif';
        ctx.fillText(`${idx + 1}${elevation > 0 ? ` (+${elevation}m)` : ''}`, pt.sx + 12, pt.sy + 4);
      });

      // Direction chevrons along straight
      if (compiledTrack.samples.length > 20) {
        const chevronSample = compiledTrack.samples[Math.floor(compiledTrack.samples.length * 0.04)];
        const pt = toScreen(chevronSample.x, chevronSample.z);
        const angle = Math.atan2(chevronSample.tz, chevronSample.tx);
        ctx.save();
        ctx.translate(pt.sx, pt.sy);
        ctx.rotate(angle);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -6);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };

    render2d();
  }, [trackSpec, compiledTrack, selectedNodeIndex, pan, zoom]);

  // Pointer event listeners for 2D canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = canvas.width * 0.5 + pan.x;
    const centerY = canvas.height * 0.5 + pan.y;
    const scale = zoom * 1.35;

    // Check hit test against waypoint handles
    let clickedIndex = -1;
    for (let i = 0; i < trackSpec.waypoints.length; i++) {
      const wp = trackSpec.waypoints[i];
      const sx = centerX + wp.x * scale;
      const sy = centerY + wp.z * scale;
      const dist = Math.hypot(mouseX - sx, mouseY - sy);
      if (dist <= 16) {
        clickedIndex = i;
        break;
      }
    }

    if (clickedIndex !== -1) {
      setSelectedNodeIndex(clickedIndex);
      draggingNodeRef.current = clickedIndex;
      canvas.setPointerCapture(e.pointerId);
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: mouseX - pan.x, y: mouseY - pan.y };
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggingNodeRef.current !== null) {
      const idx = draggingNodeRef.current;
      const centerX = canvas.width * 0.5 + pan.x;
      const centerY = canvas.height * 0.5 + pan.y;
      const scale = zoom * 1.35;
      const trackX = Math.round((mouseX - centerX) / scale);
      const trackZ = Math.round((mouseY - centerY) / scale);
      updateWaypoint(idx, { x: trackX, z: trackZ });
    } else if (isPanningRef.current) {
      setPan({
        x: mouseX - panStartRef.current.x,
        y: mouseY - panStartRef.current.y,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    if (draggingNodeRef.current !== null || isPanningRef.current) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }
    draggingNodeRef.current = null;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.35, Math.min(3.2, z * delta)));
  };

  // ----------------------------------------------------
  // 3D Three.js Persistent Live Environment Preview
  // ----------------------------------------------------
  const preview3dRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    hemiLight: THREE.HemisphereLight;
    dirLight: THREE.DirectionalLight;
    builtScene: BuiltTrackScene | null;
    updateCameraExtent: (totalLength: number) => void;
  } | null>(null);

  useEffect(() => {
    const canvas = canvas3dRef.current;
    if (!canvas) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isSoftwareGl,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(canvas.clientWidth || 420, canvas.clientHeight || 240, false);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      45,
      (canvas.clientWidth || 420) / Math.max(1, canvas.clientHeight || 240),
      1,
      2500,
    );

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    dirLight.position.set(220, 340, 180);
    scene.add(dirLight);

    let orbitAngle = 0.5;
    let cameraDist = Math.max(380, compiledTrack.totalLength * 0.22);
    let cameraHeight = Math.max(140, compiledTrack.totalLength * 0.12);
    let isUserDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const onPointerDown3d = (e: MouseEvent) => {
      isUserDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };
    const onPointerMove3d = (e: MouseEvent) => {
      if (!isUserDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      orbitAngle += dx * 0.007;
      cameraHeight = Math.max(30, Math.min(450, cameraHeight + dy * 0.6));
    };
    const onPointerUp3d = () => {
      isUserDragging = false;
    };
    const onWheel3d = (e: WheelEvent) => {
      e.preventDefault();
      cameraDist = Math.max(120, Math.min(950, cameraDist + e.deltaY * 0.45));
    };

    canvas.addEventListener('mousedown', onPointerDown3d);
    window.addEventListener('mousemove', onPointerMove3d);
    window.addEventListener('mouseup', onPointerUp3d);
    canvas.addEventListener('wheel', onWheel3d, { passive: false });

    let disposed = false;
    let animFrame = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          animFrame = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          animFrame = window.setTimeout(cb, 85);
        }
      };
      animFrame = window.setTimeout(poll, 5);
    }

    const animate = () => {
      if (disposed) return;
      if (!isUserDragging) {
        orbitAngle += 0.003;
      }
      camera.position.x = Math.sin(orbitAngle) * cameraDist;
      camera.position.y = cameraHeight;
      camera.position.z = Math.cos(orbitAngle) * cameraDist;
      camera.lookAt(0, 8, 0);

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(animate);
      else animFrame = requestAnimationFrame(animate);
    };

    preview3dRef.current = {
      renderer,
      scene,
      hemiLight,
      dirLight,
      builtScene: null,
      updateCameraExtent: (totalLength: number) => {
        cameraDist = Math.max(360, totalLength * 0.22);
        cameraHeight = Math.max(130, totalLength * 0.11);
      },
    };

    if (isSoftwareGl) afterDraw(animate);
    else animFrame = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrame);
      clearTimeout(animFrame);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', onPointerDown3d);
      window.removeEventListener('mousemove', onPointerMove3d);
      window.removeEventListener('mouseup', onPointerUp3d);
      canvas.removeEventListener('wheel', onWheel3d);
      const p = preview3dRef.current;
      if (p?.builtScene) {
        scene.remove(p.builtScene.group);
        p.builtScene.dispose();
      }
      preview3dRef.current = null;
      renderer.dispose();
    };
  }, []);

  // Swap only the 3D track geometry/lighting when splines or scenery change
  useEffect(() => {
    const p = preview3dRef.current;
    if (!p) return;

    if (p.builtScene) {
      p.scene.remove(p.builtScene.group);
      p.builtScene.dispose();
      p.builtScene = null;
    }

    const isNight = trackSpec.scenery === 'street-night';
    p.renderer.toneMappingExposure = isNight ? 1.25 : 1.05;
    p.hemiLight.color.setHex(isNight ? 0x223355 : 0xffffff);
    p.hemiLight.groundColor.setHex(isNight ? 0x0a101d : 0x444444);
    p.hemiLight.intensity = isNight ? 0.7 : 0.85;
    p.dirLight.color.setHex(isNight ? 0x60a5fa : 0xfffaed);
    p.dirLight.intensity = isNight ? 0.8 : 1.4;

    try {
      const built = buildTrackEnvironment(compiledTrack, 2);
      p.scene.add(built.group);
      p.scene.background = new THREE.Color(built.skyColor);
      p.scene.fog = new THREE.FogExp2(built.fogColor, 0.0016);
      p.builtScene = built;
      p.updateCameraExtent(compiledTrack.totalLength);
    } catch (err) {
      console.warn('TrackStudio 3D preview build warning:', err);
    }
  }, [compiledTrack, trackSpec.scenery]);

  const selectedWp = trackSpec.waypoints[selectedNodeIndex] ?? trackSpec.waypoints[0];
  const isStartFinish = selectedNodeIndex === (trackSpec.startNodeIndex ?? 0);

  return (
    <div
      data-testid="track-studio-modal"
      role="dialog"
      aria-label="Track Studio Circuit Builder"
      className="fixed inset-0 z-50 bg-[#070a0f]/95 flex flex-col overflow-hidden text-slate-100 select-none font-sans"
    >
      {/* Top Header Bar */}
      <header className="h-14 px-4 sm:px-6 bg-[#0d121b] border-b border-white/10 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-display font-extrabold text-sm md:text-base tracking-wider text-white">
              TRACK STUDIO
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
              Spline CAD
            </span>
          </div>

          <input
            type="text"
            value={trackSpec.name}
            onChange={(e) => setTrackSpec((prev) => ({ ...prev, name: e.target.value.slice(0, 36) }))}
            aria-label="Circuit Name"
            className="px-2.5 py-1 text-sm bg-black/40 border border-white/15 focus:border-sky-400 rounded text-white font-medium outline-none w-44 md:w-64"
            placeholder="Circuit Name..."
          />
        </div>

        {/* Template Quick Select & Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleLoadTemplate(e.target.value);
            }}
            aria-label="Load Starter Template"
            className="px-2.5 py-1.5 text-xs bg-[#161c27] border border-white/15 rounded text-slate-300 hover:text-white cursor-pointer outline-none"
          >
            <option value="" disabled>
              Load Preset Template...
            </option>
            {CUSTOM_TRACK_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.waypoints.length} nodes)
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="btn-studio-export-import"
            onClick={() => {
              setImportError(null);
              setExportModalOpen(true);
            }}
            className="px-3 py-1.5 text-xs bg-[#1a2230] hover:bg-[#222c3d] border border-white/15 rounded font-medium text-slate-200 cursor-pointer"
          >
            Share / Import
          </button>

          <button
            type="button"
            data-testid="btn-studio-save"
            onClick={handleSave}
            className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-display font-bold rounded shadow cursor-pointer transition-colors"
          >
            {saveSuccessNotice ? 'Saved!' : 'Save Track'}
          </button>

          <button
            type="button"
            data-testid="btn-studio-test-drive"
            onClick={handleTestDrive}
            className="px-4 py-1.5 text-xs bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold rounded shadow cursor-pointer transition-colors"
          >
            Test Drive
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Studio"
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Left 2D CAD + Right 3D Viewport & Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left: 2D Interactive CAD Canvas */}
        <div className="flex-1 relative flex flex-col bg-[#0b0f16] border-r border-white/10 min-h-[300px]">
          {/* Canvas Floating Toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#121824]/95 border border-white/15 px-3 py-1.5 rounded-lg text-xs shadow-lg">
            <span className="text-slate-400">View:</span>
            <button
              type="button"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1.0);
              }}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
            >
              Reset View
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.0, z * 1.25))}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer font-bold"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z * 0.8))}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer font-bold"
            >
              -
            </button>
            <span className="text-slate-500 font-mono">{Math.round(zoom * 100)}%</span>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <span className="text-slate-400 hidden sm:inline">
              Click & Drag Nodes · Scroll Zoom · Drag Canvas Pan
            </span>
          </div>

          <canvas
            ref={canvas2dRef}
            width={1200}
            height={800}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            className="w-full h-full cursor-crosshair touch-none"
          />

          {/* Bottom Telemetry Bar */}
          <div className="h-11 px-4 bg-[#0d121a] border-t border-white/10 flex items-center justify-between text-xs shrink-0 font-telemetry">
            <div className="flex items-center gap-4 text-slate-300">
              <div>
                <span className="text-slate-500 uppercase mr-1">Length:</span>
                <span className="text-white font-bold">{analysis.totalLengthMeters}m</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase mr-1">Est. Lap:</span>
                <span className="text-emerald-400 font-bold">{analysis.estimatedLapSeconds}s</span>
                <span className="text-slate-500 text-[10px] ml-1">(Target: 35–55s)</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase mr-1">Corners:</span>
                <span className="text-slate-200 font-semibold">{analysis.cornerCount}</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase mr-1">Elevation:</span>
                <span className="text-purple-300 font-semibold">
                  {analysis.elevationRange.min}m – {analysis.elevationRange.max}m
                </span>
              </div>
            </div>

            {/* Validation Badges */}
            <div className="flex items-center gap-2">
              {analysis.isValid ? (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold flex items-center gap-1">
                  ✓ Valid Circuit
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1" title={analysis.warnings.join('\n')}>
                  ⚠ {analysis.warnings.length} Warning{analysis.warnings.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live 3D Preview & Inspector Controls */}
        <div className="w-full lg:w-[410px] xl:w-[460px] flex flex-col bg-[#0f141f] shrink-0 border-t lg:border-t-0 overflow-y-auto">
          {/* Live 3D Orbiting Viewport */}
          <div className="h-56 xl:h-64 relative bg-[#090d14] border-b border-white/10 shrink-0">
            <canvas ref={canvas3dRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-slate-400 pointer-events-none">
              3D Live Preview · Drag to Orbit · Scroll to Zoom
            </div>
          </div>

          {/* Inspector Controls */}
          <div className="p-4 space-y-5 flex-1">
            {/* Selected Node Panel */}
            <div className="bg-[#141a27] border border-white/10 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-200">
                    Control Point #{selectedNodeIndex + 1}
                  </span>
                  {isStartFinish && (
                    <span className="px-1.5 py-0.2 rounded bg-red-600/30 text-red-300 text-[10px] font-bold">
                      Start / Finish Straight
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleInsertWaypoint}
                    className="px-2 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 text-xs font-semibold cursor-pointer"
                  >
                    + Insert
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteWaypoint}
                    disabled={trackSpec.waypoints.length <= 4}
                    className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-300 disabled:opacity-40 text-xs font-semibold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Sliders for Selected Node */}
              <div className="space-y-3 text-xs">
                {/* Elevation (Y height) */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Elevation (Y Height)</span>
                    <span className="font-mono text-purple-300 font-bold">{selectedWp.y ?? 0}m</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.5"
                    value={selectedWp.y ?? 0}
                    onChange={(e) => updateWaypoint(selectedNodeIndex, { y: parseFloat(e.target.value) })}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0m (Ground)</span>
                    <span>10m (Bridge Overpass)</span>
                    <span>24m (Steep Hill)</span>
                  </div>
                </div>

                {/* Track Width */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Segment Track Width</span>
                    <span className="font-mono text-sky-300 font-bold">
                      {selectedWp.width ?? trackSpec.trackWidth}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    value={selectedWp.width ?? trackSpec.trackWidth}
                    onChange={(e) => updateWaypoint(selectedNodeIndex, { width: parseInt(e.target.value, 10) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                {/* Corner Banking Angle (Stored Directly in Degrees) */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Corner Banking Angle</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {Math.round(selectedWp.banking ?? 0)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Corner Banking Angle"
                    min="-15"
                    max="20"
                    step="1"
                    value={Math.round(selectedWp.banking ?? 0)}
                    onChange={(e) =>
                      updateWaypoint(selectedNodeIndex, {
                        banking: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>-15° (Off-Camber)</span>
                    <span>0° (Flat)</span>
                    <span>+14° (Daytona Bank)</span>
                  </div>
                </div>

                {/* Corner Tightness (Catmull-Rom Spline Tension) */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Corner Tightness (Spline Tension)</span>
                    <span className="font-mono text-emerald-300 font-bold">
                      {(selectedWp.tension ?? 0.5).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Corner Tightness"
                    min="0.15"
                    max="0.85"
                    step="0.05"
                    value={selectedWp.tension ?? 0.5}
                    onChange={(e) =>
                      updateWaypoint(selectedNodeIndex, {
                        tension: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0.15 (Sharp Hairpin)</span>
                    <span>0.50 (Standard)</span>
                    <span>0.85 (Sweeping)</span>
                  </div>
                </div>

                {/* Set Start/Finish straight */}
                <button
                  type="button"
                  onClick={() => setTrackSpec((prev) => ({ ...prev, startNodeIndex: selectedNodeIndex }))}
                  className={`w-full py-1.5 rounded font-display font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    isStartFinish
                      ? 'bg-red-600 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-slate-300'
                  }`}
                >
                  {isStartFinish ? '✓ Active Start / Finish Straight' : 'Set as Start / Finish Straight'}
                </button>
              </div>
            </div>

            {/* Global Circuit Environment & Pit Configuration */}
            <div className="bg-[#141a27] border border-white/10 rounded-lg p-3.5 space-y-3 text-xs">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-200 border-b border-white/10 pb-2">
                Environment & Circuit Settings
              </div>

              {/* Scenery Presets */}
              <div>
                <label className="text-slate-300 block mb-1.5 font-medium">Environment Scenery</label>
                <div className="grid grid-cols-2 gap-2">
                  {ENVIRONMENT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTrackSpec((prev) => ({ ...prev, scenery: preset.id }))}
                      className={`p-2 rounded border text-left transition-all cursor-pointer ${
                        trackSpec.scenery === preset.id
                          ? 'border-sky-400 bg-sky-950/40 text-white'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{preset.label}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-1">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pit Lane Side */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300 font-medium">Pit Lane Placement</span>
                <div className="flex rounded bg-black/40 border border-white/10 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTrackSpec((prev) => ({ ...prev, pitSide: 'left' }))}
                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                      (trackSpec.pitSide ?? 'left') === 'left' ? 'bg-sky-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Left Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackSpec((prev) => ({ ...prev, pitSide: 'right' }))}
                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                      trackSpec.pitSide === 'right' ? 'bg-sky-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Right Side
                  </button>
                </div>
              </div>

              {/* Kerb Color Selection */}
              <div>
                <label className="text-slate-300 block mb-1.5 font-medium">Kerb Colors</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Primary:</span>
                    {KERB_PRIMARY_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTrackSpec((prev) => ({ ...prev, kerbPrimary: c }))}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border cursor-pointer ${
                          trackSpec.kerbPrimary === c ? 'border-white scale-110' : 'border-black/50'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Secondary:</span>
                    {KERB_SECONDARY_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTrackSpec((prev) => ({ ...prev, kerbSecondary: c }))}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border cursor-pointer ${
                          trackSpec.kerbSecondary === c ? 'border-white scale-110' : 'border-black/50'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Notice Box */}
            {analysis.warnings.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1">
                  <span>⚠ Circuit Advisory</span>
                </div>
                {analysis.warnings.map((w, idx) => (
                  <div key={idx} className="text-amber-200/90 text-[11px]">
                    · {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export / Import Modal Overlay */}
      {exportModalOpen && (
        <div
          data-testid="studio-export-modal"
          role="dialog"
          aria-label="Export or Import Track"
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg bg-[#111722] border border-white/15 rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-display font-bold text-base text-white">Share & Import Custom Circuit</h3>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Export Section */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Export Track (Share Code or JSON)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="btn-copy-share-code"
                  onClick={() => {
                    const code = exportTrackToShareCode(trackSpec);
                    navigator.clipboard.writeText(code);
                    setCopiedShareCode(true);
                    setTimeout(() => setCopiedShareCode(false), 2000);
                  }}
                  className="flex-1 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs cursor-pointer"
                >
                  {copiedShareCode ? 'Copied Share Code!' : 'Copy Compact Share Code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const json = exportTrackToJson(trackSpec);
                    navigator.clipboard.writeText(json);
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                  className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs cursor-pointer"
                >
                  {copiedJson ? 'Copied JSON!' : 'Copy JSON'}
                </button>
              </div>
            </div>

            {/* Import Section */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Import Circuit (Paste Share Code or JSON)
              </label>
              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportError(null);
                }}
                rows={4}
                placeholder="Paste APXTRK:... code or full track JSON here..."
                className="w-full p-2.5 bg-black/40 border border-white/15 focus:border-sky-400 rounded text-xs font-mono text-slate-200 outline-none resize-none"
              />
              {importError && (
                <div className="text-xs text-red-400 font-medium">Error: {importError}</div>
              )}
              <button
                type="button"
                data-testid="btn-submit-import"
                onClick={handleImportSubmit}
                disabled={!importText.trim()}
                className="w-full py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-display font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
              >
                Validate & Load Circuit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
