import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  X,
  RotateCw,
  Eye,
  Camera,
  Brush,
  Eraser,
  Download,
  Upload,
  Undo,
  Check,
  Palette,
  Sparkles,
  Sliders,
  Paintbrush,
  ArrowLeft,
} from 'lucide-react';
import { CARS, getCarById } from '../game/cars';
import {
  CarSpec,
  HeadlightTint,
  LiveryConfig,
  NumberPlateStyle,
  RimFinish,
} from '../game/types';
import { BuiltCarRig } from '../three/carBuilder';
import {
  applyCustomTextureToRig,
  buildCarRigAsync,
  renderUVWireframeToCanvas,
} from '../three/objCarLoader';
import {
  drawNumberplateToContext,
  getNumberplatePlacements,
} from '../three/proceduralTextures';

interface LiveryStudioModalProps {
  initialCarId: string;
  initialLivery: LiveryConfig;
  onApplyLivery: (carId: string, livery: LiveryConfig) => void;
  onClose: () => void;
}

const COLOR_SWATCHES = [
  '#dc2626', '#ea580c', '#facc15', '#16a34a', '#06b6d4', '#2563eb',
  '#7c3aed', '#ec4899', '#f8fafc', '#94a3b8', '#334155', '#111827',
  '#065f46', '#84cc16', '#1e1b4b', '#475569', '#b91c1c', '#0284c7',
];

const RIM_OPTIONS: Array<{ id: RimFinish; label: string; swatch: string }> = [
  { id: 'gloss-black', label: 'Gloss Black', swatch: '#14171c' },
  { id: 'silver', label: 'Silver Alloy', swatch: '#d4d8df' },
  { id: 'gold-bronze', label: 'Gold / Bronze', swatch: '#c89b3c' },
  { id: 'white', label: 'Motorsport White', swatch: '#f1f5f9' },
  { id: 'body-matched', label: 'Body-Matched', swatch: 'linear-gradient(135deg,#ef4444,#3b82f6)' },
];

const HEADLIGHT_OPTIONS: Array<{ id: HeadlightTint; label: string; hex: string }> = [
  { id: 'crystal-white', label: 'Crystal White', hex: '#f8fafc' },
  { id: 'endurance-yellow', label: 'Yellow (GT)', hex: '#facc15' },
  { id: 'ice-blue', label: 'Ice Blue (EV)', hex: '#38bdf8' },
];

const PLATE_OPTIONS: Array<{ id: NumberPlateStyle; label: string; color: string }> = [
  { id: 'auto', label: 'Auto Class', color: '#475569' },
  { id: 'gtp-red', label: 'GTP Red', color: '#dc2626' },
  { id: 'lmp2-blue', label: 'LMP2 Blue', color: '#2563eb' },
  { id: 'gt3-green', label: 'GT3 Green', color: '#16a34a' },
  { id: 'gt4-cyan', label: 'GT4 Cyan', color: '#0284c7' },
  { id: 'formula-white', label: 'Formula White', color: '#f8fafc' },
];

type StudioTab = 'paint' | 'uv-painter' | 'trim';
type CameraPreset = 'hero' | 'front' | 'side' | 'top' | 'rear';

export function LiveryStudioModal({
  initialCarId,
  initialLivery,
  onApplyLivery,
  onClose,
}: LiveryStudioModalProps) {
  const [selectedCarId, setSelectedCarId] = useState(initialCarId);
  const [livery, setLivery] = useState<LiveryConfig>({ ...initialLivery });
  const [activeTab, setActiveTab] = useState<StudioTab>('paint');
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('hero');
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(16);
  const [brushTool, setBrushTool] = useState<'brush' | 'eraser'>('brush');
  const [showUvOverlay, setShowUvOverlay] = useState(true);
  const [hasCustomTexture, setHasCustomTexture] = useState<boolean>(Boolean(initialLivery.customTexture));

  const carSpec = useMemo(() => getCarById(selectedCarId) ?? CARS[0], [selectedCarId]);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const wireframeModeRef = useRef(wireframeMode);
  wireframeModeRef.current = wireframeMode;
  const skipNextPaintRebuildRef = useRef(false);

  // 3D Viewport refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const carRigRef = useRef<BuiltCarRig | null>(null);
  const carAnchorRef = useRef<THREE.Group | null>(null);

  // Orbit state
  const orbitRef = useRef({
    isDragging: false,
    prevX: 0,
    prevY: 0,
    yaw: 0.75,
    pitch: 0.35,
    distance: 6.2,
    targetYaw: 0.75,
    targetPitch: 0.35,
    targetDistance: 6.2,
  });

  // 2D Livery Painter refs
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);

  // Apply camera preset angles
  const applyCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    const o = orbitRef.current;
    switch (preset) {
      case 'hero':
        o.targetYaw = 0.75;
        o.targetPitch = 0.35;
        o.targetDistance = 6.2;
        break;
      case 'front':
        o.targetYaw = 0.0;
        o.targetPitch = 0.15;
        o.targetDistance = 5.5;
        break;
      case 'side':
        o.targetYaw = Math.PI * 0.5;
        o.targetPitch = 0.15;
        o.targetDistance = 5.8;
        break;
      case 'top':
        o.targetYaw = 0.0;
        o.targetPitch = Math.PI * 0.48;
        o.targetDistance = 6.8;
        break;
      case 'rear':
        o.targetYaw = Math.PI;
        o.targetPitch = 0.2;
        o.targetDistance = 5.5;
        break;
    }
  }, []);

  // Initialize Three.js viewport
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || container.clientWidth || 1));
    const h = Math.max(1, Math.floor(rect.height || container.clientHeight || 1));
    renderer.setSize(w, h, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1017);
    scene.fog = new THREE.Fog(0x0c1017, 12, 35);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 60);
    cameraRef.current = camera;

    // Automotive Studio Lighting
    const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.4);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xf8fafc, 1.0);
    fillLight.position.set(0, 3, 7);
    scene.add(fillLight);

    // Showroom Floor with reflective grid
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.5,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.005;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
    grid.position.y = 0.001;
    scene.add(grid);

    const carAnchor = new THREE.Group();
    scene.add(carAnchor);
    carAnchorRef.current = carAnchor;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const nw = Math.floor(container.clientWidth);
      const nh = Math.floor(container.clientHeight);
      if (nw <= 0 || nh <= 0) return;
      cameraRef.current.aspect = nw / nh;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(nw, nh, false);
    });
    ro.observe(container);

    // Animation Loop
    let animId = 0;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const o = orbitRef.current;

      if (autoRotateRef.current) {
        o.targetYaw += 0.006;
      }

      // Smooth damped orbit easing
      o.yaw += (o.targetYaw - o.yaw) * 0.12;
      o.pitch += (o.targetPitch - o.pitch) * 0.12;
      o.distance += (o.targetDistance - o.distance) * 0.12;

      const pClamped = Math.max(0.04, Math.min(Math.PI * 0.48, o.pitch));
      const cy = Math.sin(pClamped) * o.distance;
      const horizontalDist = Math.cos(pClamped) * o.distance;
      const cx = Math.sin(o.yaw) * horizontalDist;
      const cz = Math.cos(o.yaw) * horizontalDist;

      camera.position.set(cx, cy + 0.35, cz);
      camera.lookAt(0, 0.55, 0);

      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Load / rebuild car rig when selected car or livery changes
  useEffect(() => {
    if (skipNextPaintRebuildRef.current) {
      skipNextPaintRebuildRef.current = false;
      return;
    }

    let active = true;
    const anchor = carAnchorRef.current;
    if (!anchor) return;

    buildCarRigAsync(carSpec, livery, 4).then((rig) => {
      if (!active) {
        rig.dispose();
        return;
      }

      // Dispose old rig
      if (carRigRef.current) {
        anchor.remove(carRigRef.current.root);
        carRigRef.current.dispose();
      }

      carRigRef.current = rig;
      anchor.add(rig.root);

      // Apply wireframe mode if active
      if (wireframeModeRef.current) {
        rig.root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => ((m as THREE.MeshStandardMaterial).wireframe = true));
          }
        });
      }

      // Extract and render UV wireframe for 2D painter
      if (uvCanvasRef.current) {
        renderUVWireframeToCanvas(rig.bodyGroup, uvCanvasRef.current, {
          fillBackground: '#090d16',
          strokeStyle: 'rgba(56, 189, 248, 0.45)',
          lineWidth: 1,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [
    carSpec,
    livery.primaryColor,
    livery.secondaryColor,
    livery.tertiaryColor,
    livery.rimFinish,
    livery.template,
    livery.carbonHood,
    livery.carbonWing,
    livery.carbonSplitter,
    livery.driverNumber,
    livery.numberPlateStyle,
    livery.headlightTint,
    livery.windshieldBanner,
    livery.customTexture,
  ]);

  // Toggle wireframe on active rig
  useEffect(() => {
    const rig = carRigRef.current;
    if (!rig) return;
    rig.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => ((m as THREE.MeshStandardMaterial).wireframe = wireframeMode));
      }
    });
  }, [wireframeMode]);

  // Handle Orbit Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    orbitRef.current.isDragging = true;
    orbitRef.current.prevX = e.clientX;
    orbitRef.current.prevY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!orbitRef.current.isDragging) return;
    const dx = e.clientX - orbitRef.current.prevX;
    const dy = e.clientY - orbitRef.current.prevY;
    orbitRef.current.prevX = e.clientX;
    orbitRef.current.prevY = e.clientY;

    if (e.buttons === 1) {
      orbitRef.current.targetYaw -= dx * 0.008;
      orbitRef.current.targetPitch += dy * 0.008;
      orbitRef.current.targetPitch = Math.max(0.04, Math.min(Math.PI * 0.48, orbitRef.current.targetPitch));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    orbitRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    orbitRef.current.targetDistance += e.deltaY * 0.005;
    orbitRef.current.targetDistance = Math.max(2.8, Math.min(14.0, orbitRef.current.targetDistance));
  };

  // Sync 2D Paint Canvas to 3D Car Model in Real-Time
  const syncCanvasToCarRig = useCallback(() => {
    const paintCanvas = paintCanvasRef.current;
    const rig = carRigRef.current;
    if (!paintCanvas || !rig) return;

    applyCustomTextureToRig(rig, paintCanvas, livery.primaryColor);
    setHasCustomTexture(true);
  }, [livery.primaryColor]);

  // 2D Canvas Painting Handlers
  const handlePaintStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    isPaintingRef.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    if (brushTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();

    syncCanvasToCarRig();
  };

  const handlePaintMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current) return;
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();

    syncCanvasToCarRig();
  };

  const handlePaintEnd = () => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    const canvas = paintCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      if (carRigRef.current) skipNextPaintRebuildRef.current = true;
      setLivery((prev) => ({ ...prev, customTexture: dataUrl }));
      syncCanvasToCarRig();
    }
  };

  // Preset Livery Stamps (Stripes, Chevrons, Number Plate)
  const applyPresetStamp = (type: 'stripes' | 'chevrons' | 'plate' | 'fill') => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.globalCompositeOperation = 'source-over';

    if (type === 'fill') {
      ctx.fillStyle = brushColor;
      ctx.fillRect(0, 0, w, h);
    } else if (type === 'stripes') {
      ctx.fillStyle = brushColor;
      const stripeW = w * 0.04;
      const gap = w * 0.015;
      const center = w * 0.5;
      ctx.fillRect(center - stripeW - gap * 0.5, 0, stripeW, h);
      ctx.fillRect(center + gap * 0.5, 0, stripeW, h);
    } else if (type === 'chevrons') {
      ctx.fillStyle = brushColor;
      for (let i = 0; i < 4; i++) {
        const off = i * (w * 0.06);
        ctx.beginPath();
        ctx.moveTo(w * 0.15 + off, h * 0.2);
        ctx.lineTo(w * 0.25 + off, h * 0.5);
        ctx.lineTo(w * 0.20 + off, h * 0.5);
        ctx.lineTo(w * 0.10 + off, h * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(w * 0.85 - off, h * 0.2);
        ctx.lineTo(w * 0.75 - off, h * 0.5);
        ctx.lineTo(w * 0.80 - off, h * 0.5);
        ctx.lineTo(w * 0.90 - off, h * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    } else if (type === 'plate') {
      // Stamp compact motorsport category numberplates onto verified flat hood and sidepod/door panels
      const num = livery.driverNumber || '99';
      const layout = getNumberplatePlacements(carSpec.classId);
      const sx = w / 512;
      const sy = h / 512;
      for (const spot of [layout.hood, layout.left, layout.right]) {
        drawNumberplateToContext(
          ctx,
          spot.px * sx,
          spot.py * sy,
          spot.pw * sx,
          spot.ph * sy,
          carSpec.classId,
          livery.numberPlateStyle,
          num,
          spot.transform,
        );
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    if (carRigRef.current) skipNextPaintRebuildRef.current = true;
    setLivery((prev) => ({ ...prev, customTexture: dataUrl }));
    syncCanvasToCarRig();
  };

  // Upload external livery image
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (carRigRef.current) skipNextPaintRebuildRef.current = true;
        setLivery((prev) => ({ ...prev, customTexture: dataUrl }));
        setHasCustomTexture(true);
        syncCanvasToCarRig();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Download UV Wireframe as PNG template
  const handleDownloadUVTemplate = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const rig = carRigRef.current;
    if (!rig) return;

    renderUVWireframeToCanvas(rig.bodyGroup, canvas, {
      fillBackground: '#0a0f1d',
      strokeStyle: '#38bdf8',
      lineWidth: 1.5,
    });

    const a = document.createElement('a');
    a.download = `${selectedCarId}-uv-template.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  // Download user painted livery texture as PNG
  const handleDownloadLivery = () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${selectedCarId}-custom-livery.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  // Clear paint
  const handleClearPaint = () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    skipNextPaintRebuildRef.current = false;
    setLivery((prev) => {
      const copy = { ...prev };
      delete copy.customTexture;
      return copy;
    });
    setHasCustomTexture(false);
  };

  // Save & Apply
  const handleSaveAndApply = () => {
    try {
      localStorage.setItem(`apex_livery_${selectedCarId}`, JSON.stringify(livery));
    } catch {
      // Storage quota or private browsing
    }
    onApplyLivery(selectedCarId, livery);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 md:p-6 overflow-hidden">
      <div className="relative w-full max-w-7xl h-[100dvh] sm:h-[94dvh] bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-6 py-2.5 sm:py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shrink-0">
              <Paintbrush className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
                <span>LIVERY STUDIO</span>
                <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  3D UV Studio
                </span>
              </h2>
              <p className="hidden sm:block text-xs text-slate-400">
                Paint custom liveries, inspect 3D models with orbit controls, and export/import UV textures.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (hasCustomTexture) {
                  if (window.confirm('Discard unsaved livery edits and return to menu?')) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 transition-colors cursor-pointer"
              title="Discard changes and return to menu"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Menu (Discard)
            </button>
            <button
              onClick={handleSaveAndApply}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/30 transition-all text-sm"
            >
              <Check className="w-4 h-4" />
              Apply to Race
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* 3D Viewport Column */}
          <div className="h-[38vh] min-h-[240px] lg:h-auto lg:flex-1 lg:min-h-0 shrink-0 lg:shrink flex flex-col relative bg-gradient-to-b from-slate-950 to-slate-900 overflow-hidden">
            {/* Viewport Overlay Controls */}
            <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
              <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1.5 flex items-center gap-1 shadow-xl">
                {(['hero', 'front', 'side', 'top', 'rear'] as CameraPreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyCameraPreset(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      cameraPreset === p
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setAutoRotate((v) => !v)}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl ${
                  autoRotate
                    ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Turntable Auto-Rotate"
              >
                <RotateCw className={`w-4 h-4 ${autoRotate ? 'animate-spin' : ''}`} />
                Spin
              </button>

              <button
                onClick={() => setWireframeMode((v) => !v)}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl ${
                  wireframeMode
                    ? 'bg-amber-600/30 border-amber-400 text-amber-300'
                    : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Toggle Mesh Wireframe"
              >
                <Eye className="w-4 h-4" />
                Wireframe
              </button>
            </div>

            {/* Car Name Badge Overlay */}
            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 rounded-xl px-4 py-2.5 shadow-xl pointer-events-none">
              <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                {carSpec.classId}
              </div>
              <div className="text-base font-bold text-white tracking-tight">
                {carSpec.name}
              </div>
              <div className="text-[11px] text-slate-400">
                Left-Click + Drag to Orbit • Scroll to Zoom
              </div>
            </div>

            {/* Three.js Canvas Container */}
            <div
              ref={viewportRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              className="w-full h-full min-h-0 overflow-hidden cursor-grab active:cursor-grabbing select-none"
            />
          </div>

          {/* Right Control & Painting Panel */}
          <div className="w-full lg:w-[460px] min-h-0 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
            {/* Studio Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-900/60 p-2 gap-2">
              <button
                onClick={() => setActiveTab('paint')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'paint'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Palette className="w-4 h-4" />
                Color & Finishes
              </button>

              <button
                onClick={() => setActiveTab('uv-painter')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'uv-painter'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Brush className="w-4 h-4" />
                UV Livery Painter
              </button>

              <button
                onClick={() => setActiveTab('trim')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'trim'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Sliders className="w-4 h-4" />
                Number & Trim
              </button>
            </div>

            {/* Scrollable Tool Panel */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Car Selection Dropdown */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">
                  Select 3D Car Model
                </label>
                <select
                  value={selectedCarId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedCarId(newId);
                    const newCar = getCarById(newId);
                    if (newCar) {
                      setLivery({ ...newCar.defaultLivery });
                      setHasCustomTexture(false);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-medium focus:outline-none focus:border-indigo-500"
                >
                  {CARS.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.classId}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tab 1: Colors & Paint */}
              {activeTab === 'paint' && (
                <div className="space-y-6">
                  {/* Official Team & Factory Liveries (for single-chassis classes) */}
                  {carSpec.liveries && carSpec.liveries.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Team & Factory Liveries ({carSpec.liveries.length})
                        </span>
                        <span className="text-[11px] text-slate-400">1-click apply</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                        {carSpec.liveries.map((preset) => {
                          const isCurrent =
                            livery.primaryColor.toLowerCase() === preset.livery.primaryColor.toLowerCase() &&
                            livery.secondaryColor.toLowerCase() === preset.livery.secondaryColor.toLowerCase() &&
                            livery.driverNumber === preset.livery.driverNumber;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setLivery({ ...preset.livery });
                                setHasCustomTexture(false);
                              }}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-slate-800 border-indigo-500 text-white shadow-sm'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                              }`}
                            >
                              <div className="flex -space-x-1 shrink-0">
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                                  style={{ backgroundColor: preset.livery.primaryColor }}
                                />
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                                  style={{ backgroundColor: preset.livery.secondaryColor }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate leading-tight">{preset.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">#{preset.livery.driverNumber}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Primary Color Picker */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Primary Body Color
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{livery.primaryColor}</span>
                        <input
                          type="color"
                          value={livery.primaryColor}
                          onChange={(e) =>
                            setLivery((prev) => ({ ...prev, primaryColor: e.target.value }))
                          }
                          className="w-7 h-7 rounded-lg border border-slate-700 cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          onClick={() => setLivery((prev) => ({ ...prev, primaryColor: swatch }))}
                          style={{ backgroundColor: swatch }}
                          className={`h-9 rounded-lg border transition-transform hover:scale-105 ${
                            livery.primaryColor.toLowerCase() === swatch.toLowerCase()
                              ? 'border-white ring-2 ring-indigo-500 scale-105'
                              : 'border-slate-700/80 opacity-90 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Secondary Color Picker */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Secondary / Accent Color
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{livery.secondaryColor}</span>
                        <input
                          type="color"
                          value={livery.secondaryColor}
                          onChange={(e) =>
                            setLivery((prev) => ({ ...prev, secondaryColor: e.target.value }))
                          }
                          className="w-7 h-7 rounded-lg border border-slate-700 cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          onClick={() => setLivery((prev) => ({ ...prev, secondaryColor: swatch }))}
                          style={{ backgroundColor: swatch }}
                          className={`h-9 rounded-lg border transition-transform hover:scale-105 ${
                            livery.secondaryColor.toLowerCase() === swatch.toLowerCase()
                              ? 'border-white ring-2 ring-indigo-500 scale-105'
                              : 'border-slate-700/80 opacity-90 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Rim Finish */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 block">
                      Wheel Rim Finish
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {RIM_OPTIONS.map((rim) => (
                        <button
                          key={rim.id}
                          onClick={() => setLivery((prev) => ({ ...prev, rimFinish: rim.id }))}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            livery.rimFinish === rim.id
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div
                            className="w-5 h-5 rounded-full border border-slate-600 shadow-sm"
                            style={{ background: rim.swatch }}
                          />
                          <span>{rim.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Headlight Tint */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 block">
                      Headlight Lens Tint
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {HEADLIGHT_OPTIONS.map((hl) => (
                        <button
                          key={hl.id}
                          onClick={() => setLivery((prev) => ({ ...prev, headlightTint: hl.id }))}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                            livery.headlightTint === hl.id
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: hl.hex }}
                          />
                          <span>{hl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Interactive UV Livery Painter & Exporter */}
              {activeTab === 'uv-painter' && (
                <div className="space-y-5">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        UV Layout & Painting Tools
                      </span>
                      <button
                        onClick={handleDownloadUVTemplate}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors"
                        title="Download wireframe template for Photoshop / GIMP"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download UV Template
                      </button>
                    </div>

                    {/* Paint Tools Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setBrushTool('brush')}
                        className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                          brushTool === 'brush'
                            ? 'bg-indigo-600 border-indigo-400 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title="Brush"
                      >
                        <Brush className="w-4 h-4" />
                        Brush
                      </button>

                      <button
                        onClick={() => setBrushTool('eraser')}
                        className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                          brushTool === 'eraser'
                            ? 'bg-indigo-600 border-indigo-400 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title="Eraser"
                      >
                        <Eraser className="w-4 h-4" />
                        Eraser
                      </button>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[11px] text-slate-400">Color:</span>
                        <input
                          type="color"
                          value={brushColor}
                          onChange={(e) => setBrushColor(e.target.value)}
                          className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>

                    {/* Brush Size Slider */}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs text-slate-400 w-16">Size: {brushSize}px</span>
                      <input
                        type="range"
                        min="2"
                        max="64"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Quick Decal Stamps */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-400 mr-1">Decals:</span>
                      <button
                        onClick={() => applyPresetStamp('stripes')}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        Dual Stripes
                      </button>
                      <button
                        onClick={() => applyPresetStamp('chevrons')}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        Chevrons
                      </button>
                      <button
                        onClick={() => applyPresetStamp('plate')}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        Roundel #{livery.driverNumber}
                      </button>
                      <button
                        onClick={() => applyPresetStamp('fill')}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        Fill
                      </button>
                    </div>
                  </div>

                  {/* 2D Canvas Area with Overlay */}
                  <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-950 aspect-square shadow-inner">
                    {/* Background UV Wireframe Canvas */}
                    <canvas
                      ref={uvCanvasRef}
                      width={1024}
                      height={1024}
                      className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity ${
                        showUvOverlay ? 'opacity-80' : 'opacity-0'
                      }`}
                    />

                    {/* Interactive Paint Canvas */}
                    <canvas
                      ref={paintCanvasRef}
                      width={1024}
                      height={1024}
                      onPointerDown={handlePaintStart}
                      onPointerMove={handlePaintMove}
                      onPointerUp={handlePaintEnd}
                      onPointerLeave={handlePaintEnd}
                      className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                    />

                    {/* Canvas Controls Overlay */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                      <button
                        onClick={() => setShowUvOverlay((v) => !v)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold backdrop-blur-md border ${
                          showUvOverlay
                            ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                            : 'bg-slate-900/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        UV Wireframe
                      </button>
                    </div>
                  </div>

                  {/* Livery File Import / Export */}
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Import Livery Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleUploadImage}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={handleDownloadLivery}
                      disabled={!hasCustomTexture}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Livery PNG
                    </button>

                    <button
                      onClick={handleClearPaint}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors"
                      title="Clear Paint"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Driver Number & Plate Styling */}
              {activeTab === 'trim' && (
                <div className="space-y-6">
                  {/* Driver Number */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 block">
                      Driver Competition Number (1-3 Digits)
                    </label>
                    <input
                      type="text"
                      maxLength={3}
                      value={livery.driverNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setLivery((prev) => ({ ...prev, driverNumber: val || '1' }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-lg font-mono font-bold text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Number Plate Style */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 block">
                      Number Plate Category Style
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLATE_OPTIONS.map((plate) => (
                        <button
                          key={plate.id}
                          onClick={() => setLivery((prev) => ({ ...prev, numberPlateStyle: plate.id }))}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                            livery.numberPlateStyle === plate.id
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-full shadow-sm"
                            style={{ backgroundColor: plate.color }}
                          />
                          <span>{plate.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Windshield Banner Text */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 block">
                      Windshield Banner Text
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      value={livery.windshieldBanner}
                      onChange={(e) =>
                        setLivery((prev) => ({
                          ...prev,
                          windshieldBanner: e.target.value.toUpperCase(),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-semibold tracking-wider uppercase text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/70 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  const defaultLivery = carSpec.defaultLivery;
                  setLivery({ ...defaultLivery });
                  handleClearPaint();
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Reset to Factory
              </button>

              <button
                onClick={handleSaveAndApply}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all"
              >
                <Check className="w-4 h-4" />
                Save & Apply Livery
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
