import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CUSTOM_TRACK_TEMPLATES,
  NODE_COLLIDER_RADIUS_MULTIPLIER,
  NODE_HIT_RADIUS_PX,
  TrackGeometryAnalysis,
  analyzeTrackGeometry,
  exportTrackToJson,
  exportTrackToShareCode,
  findClosestWaypointHit2D,
  findTrackSegmentInsertIndex,
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
  const [editorMode, setEditorMode] = useState<'select' | 'add'>('select');
  const [hoveredNode2d, setHoveredNode2d] = useState<number | null>(null);
  const [hoveredNode3d, setHoveredNode3d] = useState<number | null>(null);
  const [cursor2d, setCursor2d] = useState<'default' | 'grab' | 'grabbing' | 'move' | 'crosshair'>('default');
  const [cursor3d, setCursor3d] = useState<'default' | 'grab' | 'grabbing' | 'move' | 'crosshair'>('default');
  const [cameraView3d, setCameraView3d] = useState<'angled' | 'top'>('angled');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // 2D Canvas interaction state
  const canvas2dContainerRef = useRef<HTMLDivElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas2dSize, setCanvas2dSize] = useState({ width: 1200, height: 800 });
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
        if (index < 0 || index >= prev.waypoints.length) return prev;
        const nextWps = [...prev.waypoints];
        nextWps[index] = { ...nextWps[index], ...patch };
        return { ...prev, waypoints: nextWps };
      });
    },
    [],
  );

  // Insert waypoint at an explicit index
  const insertWaypointAt = useCallback((insertIndex: number, newPoint: TrackWaypoint) => {
    setTrackSpec((prev) => {
      const clampedIdx = Math.max(0, Math.min(prev.waypoints.length, insertIndex));
      const hasPerNodeTension = prev.waypoints.some((w) => w.tension !== undefined);
      const cleanPoint: TrackWaypoint = hasPerNodeTension
        ? newPoint
        : { x: newPoint.x, y: newPoint.y, z: newPoint.z, width: newPoint.width, banking: newPoint.banking };
      const newWps = [...prev.waypoints];
      newWps.splice(clampedIdx, 0, cleanPoint);
      const curSf = prev.startNodeIndex ?? 0;
      const nextSf = curSf >= clampedIdx ? curSf + 1 : curSf;
      return { ...prev, waypoints: newWps, startNodeIndex: nextSf };
    });
    setSelectedNodeIndex(insertIndex);
  }, []);

  // Append waypoint at end of loop
  const appendWaypoint = useCallback((newPoint: TrackWaypoint) => {
    setTrackSpec((prev) => {
      const nextIdx = prev.waypoints.length;
      queueMicrotask(() => setSelectedNodeIndex(nextIdx));
      return { ...prev, waypoints: [...prev.waypoints, newPoint] };
    });
  }, []);

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
      const insertAt = idx + 1;
      newWps.splice(insertAt, 0, newPoint);
      const curSf = prev.startNodeIndex ?? 0;
      const nextSf = curSf >= insertAt ? curSf + 1 : curSf;
      return { ...prev, waypoints: newWps, startNodeIndex: nextSf };
    });
    setSelectedNodeIndex((prev) => prev + 1);
  }, [selectedNodeIndex]);

  // Delete waypoint
  const handleDeleteWaypoint = useCallback(() => {
    if (trackSpec.waypoints.length <= 4) return;
    setTrackSpec((prev) => {
      const newWps = prev.waypoints.filter((_, i) => i !== selectedNodeIndex);
      const curSf = prev.startNodeIndex ?? 0;
      const nextSf = curSf > selectedNodeIndex ? curSf - 1 : curSf === selectedNodeIndex ? 0 : curSf;
      return { ...prev, waypoints: newWps, startNodeIndex: Math.min(nextSf, newWps.length - 1) };
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
    preview3dRef.current?.resetCamera(compileTrack(tmpl).totalLength, cameraView3d);
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

  // Keep default 2D cursor synchronized with editorMode when idle
  useEffect(() => {
    if (draggingNodeRef.current === null && !isPanningRef.current && hoveredNode2d === null) {
      setCursor2d(editorMode === 'add' ? 'crosshair' : 'default');
    }
    if (hoveredNode3d === null) {
      setCursor3d((prev) => (prev === 'grabbing' || prev === 'move' ? prev : editorMode === 'add' ? 'crosshair' : 'default'));
    }
  }, [editorMode, hoveredNode2d, hoveredNode3d]);

  // Keep 2D backing buffer synchronized 1:1 with displayed CSS container dimensions
  useEffect(() => {
    const container = canvas2dContainerRef.current;
    const canvas = canvas2dRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(240, Math.round(rect.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        setCanvas2dSize({ width: w, height: h });
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ----------------------------------------------------
  // 2D Canvas Editor Rendering & Pointer Events
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

        // Pit lane corridor line (ordered smoothly across S/F t=0.88 -> 1.0 -> 0.10)
        const pitSideSign = trackSpec.pitSide === 'right' ? 1 : -1;
        const nSamples = compiledTrack.samples.length;
        const startIdx = Math.floor(nSamples * 0.88);
        const endSpan = Math.floor(nSamples * 0.22);
        ctx.beginPath();
        for (let k = 0; k <= endSpan; k += 2) {
          const s = compiledTrack.samples[(startIdx + k) % nSamples];
          const pitLat = pitSideSign * (trackSpec.trackWidth * 0.5 + 5.2);
          const pt = toScreen(s.x + s.nx * pitLat, s.z + s.nz * pitLat);
          if (k === 0) ctx.moveTo(pt.sx, pt.sy);
          else ctx.lineTo(pt.sx, pt.sy);
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
        const isHovered = idx === hoveredNode2d;
        const isSF = idx === (trackSpec.startNodeIndex ?? 0);
        const elevation = wp.y ?? 0;
        const baseRadius = isSelected ? 10 : 7;
        const handleRadius = isHovered ? baseRadius * 1.25 : baseRadius;

        // Overpass badge if elevation > 4m
        if (elevation >= 4) {
          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, isHovered ? 16 : 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // Hovered halo highlight
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, handleRadius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Handle outer ring
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered
          ? isSF
            ? '#fca5a5'
            : '#7dd3fc'
          : isSelected
            ? '#38bdf8'
            : isSF
              ? '#ef4444'
              : '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = isSelected || isHovered ? '#ffffff' : '#0b0f17';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Node index text label
        ctx.fillStyle = isHovered ? '#e0f2fe' : '#94a3b8';
        ctx.font = isHovered ? 'bold 11px Oxanium, sans-serif' : '10px Oxanium, sans-serif';
        ctx.fillText(`${idx + 1}${elevation > 0 ? ` (+${elevation}m)` : ''}`, pt.sx + 13, pt.sy + 4);
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
  }, [trackSpec, compiledTrack, selectedNodeIndex, hoveredNode2d, pan, zoom, canvas2dSize]);

  const get2dPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      mouseX: (e.clientX - rect.left) * scaleX,
      mouseY: (e.clientY - rect.top) * scaleY,
    };
  };

  // Pointer event listeners for 2D canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const { mouseX, mouseY } = get2dPointerCoords(e, canvas);

    // Right-Click (2) or Middle-Click (1): Camera Pan only
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      isPanningRef.current = true;
      panStartRef.current = { x: mouseX - pan.x, y: mouseY - pan.y };
      canvas.setPointerCapture(e.pointerId);
      setCursor2d('move');
      return;
    }

    // Left-Click (0): Node Selection, Dragging & Placement Only (NEVER pans camera)
    if (e.button !== 0) return;

    const centerX = canvas.width * 0.5 + pan.x;
    const centerY = canvas.height * 0.5 + pan.y;
    const scale = zoom * 1.35;

    const startWindowDrag = (nodeIdx: number) => {
      draggingNodeRef.current = nodeIdx;
      setCursor2d('grabbing');
      const onWinMove = (ev: PointerEvent) => {
        const c = canvas2dRef.current;
        if (!c || draggingNodeRef.current === null) return;
        const rect = c.getBoundingClientRect();
        const scaleX = c.width / rect.width;
        const scaleY = c.height / rect.height;
        const mX = (ev.clientX - rect.left) * scaleX;
        const mY = (ev.clientY - rect.top) * scaleY;
        const cX = c.width * 0.5 + pan.x;
        const cY = c.height * 0.5 + pan.y;
        const sc = zoom * 1.35;
        const tX = Math.round((mX - cX) / sc);
        const tZ = Math.round((mY - cY) / sc);
        updateWaypoint(draggingNodeRef.current, { x: tX, z: tZ });
      };
      const onWinUp = () => {
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        draggingNodeRef.current = null;
        setCursor2d('default');
      };
      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
    };

    // 1. Check hit test against existing waypoint handles (>= 26px generous radius)
    const clickedIndex = findClosestWaypointHit2D(
      trackSpec.waypoints,
      mouseX,
      mouseY,
      centerX,
      centerY,
      scale,
      NODE_HIT_RADIUS_PX,
    );

    if (clickedIndex !== -1) {
      e.stopPropagation();
      setSelectedNodeIndex(clickedIndex);
      startWindowDrag(clickedIndex);
      return;
    }

    const worldX = (mouseX - centerX) / scale;
    const worldZ = (mouseY - centerY) / scale;

    // 2. Check clicking directly on track ribbon/spline OR Shift+Left-Click to insert a node on segment
    const segHit = findTrackSegmentInsertIndex(trackSpec.waypoints, worldX, worldZ, trackSpec.trackWidth);
    const ribbonHitDist = trackSpec.trackWidth * 0.5 + 8 / scale;
    if (e.shiftKey || segHit.distance <= ribbonHitDist) {
      e.stopPropagation();
      insertWaypointAt(segHit.insertIndex, segHit.waypoint);
      startWindowDrag(segHit.insertIndex);
      return;
    }

    // 3. Clicking empty ground in "Add Node" mode appends a new control point and drags it
    if (editorMode === 'add') {
      e.stopPropagation();
      const nextIdx = trackSpec.waypoints.length;
      appendWaypoint({
        x: Math.round(worldX),
        y: 0,
        z: Math.round(worldZ),
        width: trackSpec.trackWidth,
        banking: 0,
      });
      startWindowDrag(nextIdx);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const { mouseX, mouseY } = get2dPointerCoords(e, canvas);

    if (draggingNodeRef.current !== null) {
      const idx = draggingNodeRef.current;
      const centerX = canvas.width * 0.5 + pan.x;
      const centerY = canvas.height * 0.5 + pan.y;
      const scale = zoom * 1.35;
      const trackX = Math.round((mouseX - centerX) / scale);
      const trackZ = Math.round((mouseY - centerY) / scale);
      updateWaypoint(idx, { x: trackX, z: trackZ });
      setCursor2d('grabbing');
      return;
    }

    if (isPanningRef.current && ((e.buttons & 2) !== 0 || (e.buttons & 4) !== 0)) {
      setPan({
        x: mouseX - panStartRef.current.x,
        y: mouseY - panStartRef.current.y,
      });
      setCursor2d('move');
      return;
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
    }

    // Hover feedback against nodes
    const centerX = canvas.width * 0.5 + pan.x;
    const centerY = canvas.height * 0.5 + pan.y;
    const scale = zoom * 1.35;
    const hoverIdx = findClosestWaypointHit2D(
      trackSpec.waypoints,
      mouseX,
      mouseY,
      centerX,
      centerY,
      scale,
      NODE_HIT_RADIUS_PX,
    );
    setHoveredNode2d(hoverIdx !== -1 ? hoverIdx : null);
    setCursor2d(hoverIdx !== -1 ? 'grab' : editorMode === 'add' ? 'crosshair' : 'default');
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

    const { mouseX, mouseY } = get2dPointerCoords(e, canvas);
    const centerX = canvas.width * 0.5 + pan.x;
    const centerY = canvas.height * 0.5 + pan.y;
    const scale = zoom * 1.35;
    const hoverIdx = findClosestWaypointHit2D(
      trackSpec.waypoints,
      mouseX,
      mouseY,
      centerX,
      centerY,
      scale,
      NODE_HIT_RADIUS_PX,
    );
    setHoveredNode2d(hoverIdx !== -1 ? hoverIdx : null);
    setCursor2d(hoverIdx !== -1 ? 'grab' : editorMode === 'add' ? 'crosshair' : 'default');
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.35, Math.min(3.2, z * delta)));
  };

  // ----------------------------------------------------
  // 3D Three.js Persistent Live Environment & Node Editor
  // ----------------------------------------------------
  const waypointsRef = useRef(trackSpec.waypoints);
  const trackWidthRef = useRef(trackSpec.trackWidth);
  const editorModeRef = useRef(editorMode);
  const updateWaypointRef = useRef(updateWaypoint);
  const insertWaypointAtRef = useRef(insertWaypointAt);
  const appendWaypointRef = useRef(appendWaypoint);
  const setSelectedNodeIndexRef = useRef(setSelectedNodeIndex);
  const setHoveredNode3dRef = useRef(setHoveredNode3d);
  const setCursor3dRef = useRef(setCursor3d);

  waypointsRef.current = trackSpec.waypoints;
  trackWidthRef.current = trackSpec.trackWidth;
  editorModeRef.current = editorMode;
  updateWaypointRef.current = updateWaypoint;
  insertWaypointAtRef.current = insertWaypointAt;
  appendWaypointRef.current = appendWaypoint;
  setSelectedNodeIndexRef.current = setSelectedNodeIndex;
  setHoveredNode3dRef.current = setHoveredNode3d;
  setCursor3dRef.current = setCursor3d;

  const preview3dRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemiLight: THREE.HemisphereLight;
    dirLight: THREE.DirectionalLight;
    builtScene: BuiltTrackScene | null;
    nodesGroup: THREE.Group;
    colliderMeshes: THREE.Mesh[];
    cameraInitialized: boolean;
    resetCamera: (totalLength: number, viewMode?: 'angled' | 'top') => void;
    setViewMode: (viewMode: 'angled' | 'top') => void;
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

    const nodesGroup = new THREE.Group();
    nodesGroup.renderOrder = 20;
    scene.add(nodesGroup);

    const applyViewAngle = (dist: number, viewMode: 'angled' | 'top', controls: OrbitControls) => {
      const target = controls.target.clone();
      if (viewMode === 'top') {
        camera.position.set(target.x, target.y + dist * 1.15, target.z + 18);
      } else {
        camera.position.set(
          target.x + Math.sin(0.55) * dist * 0.85,
          target.y + dist * 0.52,
          target.z + Math.cos(0.55) * dist * 0.85,
        );
      }
      camera.lookAt(target);
      controls.update();
    };

    const initDist = Math.max(380, compiledTrack.totalLength * 0.22);
    camera.position.set(Math.sin(0.55) * initDist * 0.85, initDist * 0.52, Math.cos(0.55) * initDist * 0.85);
    camera.lookAt(0, 0, 0);

    const raycaster = new THREE.Raycaster();
    const ndcPointer = new THREE.Vector2();
    const dragIntersectPt = new THREE.Vector3();
    let dragging3dNode: { index: number; plane: THREE.Plane } | null = null;
    let isPanning3d = false;

    const getNdc = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndcPointer.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      ndcPointer.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      return ndcPointer;
    };

    // Register node-interaction handlers in capture phase BEFORE OrbitControls receives pointer events
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = false; // horizontal XZ ground-plane panning
    controls.enableZoom = true;
    controls.minDistance = 70;
    controls.maxDistance = 1200;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.target.set(0, 0, 0);
    controls.update();

    const syncAltRotateMode = (altHeld: boolean) => {
      controls.mouseButtons.RIGHT = altHeld ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    };

    const onKeyDown3d = (e: KeyboardEvent) => {
      if (e.key === 'Alt') syncAltRotateMode(true);
    };
    const onKeyUp3d = (e: KeyboardEvent) => {
      if (e.key === 'Alt') syncAltRotateMode(false);
    };
    const onWindowBlur = () => syncAltRotateMode(false);

    const onPointerDown3d = (e: PointerEvent) => {
      syncAltRotateMode(e.altKey);

      if (e.button === 1 || e.button === 2) {
        isPanning3d = true;
        setCursor3dRef.current('move');
        return;
      }

      if (e.button !== 0) return;

      const pState = preview3dRef.current;
      if (!pState) return;

      raycaster.setFromCamera(getNdc(e), camera);
      const hits = raycaster.intersectObjects(pState.colliderMeshes, false);

      const start3dDrag = (dragInfo: { index: number; plane: THREE.Plane }) => {
        dragging3dNode = dragInfo;
        controls.enabled = false;
        setCursor3dRef.current('grabbing');

        const onWinMove3d = (ev: PointerEvent) => {
          if (!dragging3dNode) return;
          raycaster.setFromCamera(getNdc(ev), camera);
          if (raycaster.ray.intersectPlane(dragging3dNode.plane, dragIntersectPt)) {
            updateWaypointRef.current(dragging3dNode.index, {
              x: Math.round(dragIntersectPt.x),
              z: Math.round(dragIntersectPt.z),
            });
          }
        };

        const onWinUp3d = () => {
          window.removeEventListener('pointermove', onWinMove3d);
          window.removeEventListener('pointerup', onWinUp3d);
          dragging3dNode = null;
          isPanning3d = false;
          controls.enabled = true;
          setCursor3dRef.current('default');
        };

        window.addEventListener('pointermove', onWinMove3d);
        window.addEventListener('pointerup', onWinUp3d);
      };

      if (hits.length > 0) {
        const nodeIdx = hits[0].object.userData.nodeIndex as number;
        const wp = waypointsRef.current[nodeIdx];
        if (wp) {
          e.stopPropagation();
          setSelectedNodeIndexRef.current(nodeIdx);
          start3dDrag({
            index: nodeIdx,
            plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(wp.y ?? 0)),
          });
          return;
        }
      }

      // Check track ribbon / Shift+Left-Click / Add Node mode on XZ plane
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const groundHit = raycaster.ray.intersectPlane(groundPlane, dragIntersectPt);
      if (!groundHit) return;

      const builtHits = pState.builtScene
        ? raycaster.intersectObjects(pState.builtScene.group.children, true)
        : [];
      const exactWorldPt = builtHits.length > 0 ? builtHits[0].point : groundHit;
      const wps = waypointsRef.current;
      const trackW = trackWidthRef.current;
      const segHit = findTrackSegmentInsertIndex(wps, exactWorldPt.x, exactWorldPt.z, trackW);
      const onRibbon = segHit.distance <= trackW * 0.55;

      if (e.shiftKey || onRibbon) {
        e.stopPropagation();
        const insertedIdx = segHit.insertIndex;
        insertWaypointAtRef.current(insertedIdx, segHit.waypoint);
        start3dDrag({
          index: insertedIdx,
          plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(segHit.waypoint.y ?? 0)),
        });
        return;
      }

      if (editorModeRef.current === 'add') {
        e.stopPropagation();
        const newIdx = wps.length;
        appendWaypointRef.current({
          x: Math.round(groundHit.x),
          y: 0,
          z: Math.round(groundHit.z),
          width: trackW,
          banking: 0,
        });
        start3dDrag({
          index: newIdx,
          plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        });
      }
    };

    const onPointerMove3d = (e: PointerEvent) => {
      syncAltRotateMode(e.altKey);

      if (dragging3dNode) {
        e.stopPropagation();
        raycaster.setFromCamera(getNdc(e), camera);
        if (raycaster.ray.intersectPlane(dragging3dNode.plane, dragIntersectPt)) {
          updateWaypointRef.current(dragging3dNode.index, {
            x: Math.round(dragIntersectPt.x),
            z: Math.round(dragIntersectPt.z),
          });
        }
        setCursor3dRef.current('grabbing');
        return;
      }

      if (isPanning3d && ((e.buttons & 2) !== 0 || (e.buttons & 4) !== 0)) {
        setCursor3dRef.current('move');
        return;
      }

      isPanning3d = false;
      const pState = preview3dRef.current;
      if (!pState) return;
      raycaster.setFromCamera(getNdc(e), camera);
      const hits = raycaster.intersectObjects(pState.colliderMeshes, false);
      if (hits.length > 0) {
        const nodeIdx = hits[0].object.userData.nodeIndex as number;
        setHoveredNode3dRef.current(nodeIdx);
        setCursor3dRef.current('grab');
      } else {
        setHoveredNode3dRef.current(null);
        setCursor3dRef.current(editorModeRef.current === 'add' ? 'crosshair' : 'default');
      }
    };

    const onPointerUp3d = (e: PointerEvent) => {
      if (dragging3dNode) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
      dragging3dNode = null;
      isPanning3d = false;
      controls.enabled = true;

      const pState = preview3dRef.current;
      if (pState) {
        raycaster.setFromCamera(getNdc(e), camera);
        const hits = raycaster.intersectObjects(pState.colliderMeshes, false);
        if (hits.length > 0) {
          const nodeIdx = hits[0].object.userData.nodeIndex as number;
          setHoveredNode3dRef.current(nodeIdx);
          setCursor3dRef.current('grab');
          return;
        }
      }
      setHoveredNode3dRef.current(null);
      setCursor3dRef.current(editorModeRef.current === 'add' ? 'crosshair' : 'default');
    };

    canvas.addEventListener('pointerdown', onPointerDown3d, { capture: true });
    window.addEventListener('pointermove', onPointerMove3d, { capture: true });
    window.addEventListener('pointerup', onPointerUp3d, { capture: true });
    window.addEventListener('pointercancel', onPointerUp3d, { capture: true });
    window.addEventListener('keydown', onKeyDown3d);
    window.addEventListener('keyup', onKeyUp3d);
    window.addEventListener('blur', onWindowBlur);

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
      controls.update();
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(animate);
      else animFrame = requestAnimationFrame(animate);
    };

    preview3dRef.current = {
      renderer,
      scene,
      camera,
      controls,
      hemiLight,
      dirLight,
      builtScene: null,
      nodesGroup,
      colliderMeshes: [],
      cameraInitialized: false,
      resetCamera: (totalLength: number, viewMode: 'angled' | 'top' = 'angled') => {
        controls.target.set(0, 0, 0);
        const dist = Math.max(360, totalLength * 0.22);
        applyViewAngle(dist, viewMode, controls);
      },
      setViewMode: (viewMode: 'angled' | 'top') => {
        const dist = camera.position.distanceTo(controls.target) || 400;
        applyViewAngle(dist, viewMode, controls);
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
      canvas.removeEventListener('pointerdown', onPointerDown3d, { capture: true });
      window.removeEventListener('pointermove', onPointerMove3d, { capture: true });
      window.removeEventListener('pointerup', onPointerUp3d, { capture: true });
      window.removeEventListener('pointercancel', onPointerUp3d, { capture: true });
      window.removeEventListener('keydown', onKeyDown3d);
      window.removeEventListener('keyup', onKeyUp3d);
      window.removeEventListener('blur', onWindowBlur);
      controls.dispose();
      const p = preview3dRef.current;
      if (p?.builtScene) {
        scene.remove(p.builtScene.group);
        p.builtScene.dispose();
      }
      preview3dRef.current = null;
      renderer.dispose();
    };
  }, []);

  // Sync 3D visible node handles + invisible hit-sphere colliders (>= 1.8x visible radius)
  useEffect(() => {
    const p = preview3dRef.current;
    if (!p) return;

    // Dispose old node handle meshes cleanly
    while (p.nodesGroup.children.length > 0) {
      const child = p.nodesGroup.children.pop();
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    p.colliderMeshes = [];

    const visRadius = Math.max(4.5, trackSpec.trackWidth * 0.3);
    const hitRadius = visRadius * NODE_COLLIDER_RADIUS_MULTIPLIER;
    const hitGeo = new THREE.SphereGeometry(hitRadius, 12, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const visGeo = new THREE.SphereGeometry(visRadius, 16, 12);

    trackSpec.waypoints.forEach((wp, i) => {
      const isSelected = i === selectedNodeIndex;
      const isHovered = i === hoveredNode3d;
      const isSF = i === (trackSpec.startNodeIndex ?? 0);
      const yPos = (wp.y ?? 0) + visRadius * 0.55;

      const colorHex = isHovered
        ? isSF
          ? 0xfca5a5
          : 0x7dd3fc
        : isSelected
          ? 0x38bdf8
          : isSF
            ? 0xef4444
            : 0xf8fafc;
      const visMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: isHovered ? 0x38bdf8 : isSelected ? 0x0284c7 : isSF ? 0x7f1d1d : 0x1e293b,
        emissiveIntensity: isHovered ? 0.65 : isSelected ? 0.45 : 0.2,
        roughness: 0.35,
        metalness: 0.15,
      });

      const visMesh = new THREE.Mesh(visGeo.clone(), visMat);
      visMesh.position.set(wp.x, yPos, wp.z);
      visMesh.userData = { nodeIndex: i };
      if (isHovered) {
        visMesh.scale.setScalar(1.25);
      }
      p.nodesGroup.add(visMesh);

      // Dedicated invisible collider >= 1.8x visible radius (2.0x)
      const hitMesh = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
      hitMesh.position.set(wp.x, yPos, wp.z);
      hitMesh.userData = { nodeIndex: i };
      p.nodesGroup.add(hitMesh);
      p.colliderMeshes.push(hitMesh);
      p.colliderMeshes.push(visMesh);
    });

    hitGeo.dispose();
    hitMat.dispose();
    visGeo.dispose();
    p.renderer.render(p.scene, p.camera);
  }, [trackSpec.waypoints, trackSpec.trackWidth, trackSpec.startNodeIndex, selectedNodeIndex, hoveredNode3d]);

  // Swap only the 3D track geometry/lighting when splines or scenery change (never reset camera during edits!)
  // Debounce rebuilding heavy environment meshes (trees, lights, grandstands) during active node dragging
  useEffect(() => {
    const p = preview3dRef.current;
    if (!p) return;

    const timer = setTimeout(() => {
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
        if (!p.cameraInitialized) {
          p.cameraInitialized = true;
          p.resetCamera(compiledTrack.totalLength, cameraView3d);
        }
        p.renderer.render(p.scene, p.camera);
      } catch (err) {
        console.warn('TrackStudio 3D preview build warning:', err);
      }
    }, p.builtScene ? 70 : 0);

    return () => clearTimeout(timer);
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
        <div
          ref={canvas2dContainerRef}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 relative flex flex-col bg-[#0b0f16] border-r border-white/10 min-h-[300px]"
        >
          {/* Canvas Floating Toolbar */}
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-[#121824]/95 border border-white/15 px-3 py-1.5 rounded-lg text-xs shadow-lg">
              {/* Editor Interaction Mode */}
              <div className="flex rounded bg-black/40 border border-white/10 p-0.5">
                <button
                  type="button"
                  data-testid="btn-studio-mode-select"
                  onClick={() => setEditorMode('select')}
                  className={`px-2.5 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                    editorMode === 'select' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Select / Drag
                </button>
                <button
                  type="button"
                  data-testid="btn-studio-mode-add"
                  onClick={() => setEditorMode('add')}
                  className={`px-2.5 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                    editorMode === 'add' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  + Add Node
                </button>
              </div>

              <span aria-hidden="true" className="text-slate-600">|</span>

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
                aria-label="Zoom In 2D Canvas"
                onClick={() => setZoom((z) => Math.min(3.0, z * 1.25))}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer font-bold"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom Out 2D Canvas"
                onClick={() => setZoom((z) => Math.max(0.4, z * 0.8))}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer font-bold"
              >
                -
              </button>
              <span className="text-slate-500 font-mono">{Math.round(zoom * 100)}%</span>
              <span aria-hidden="true" className="text-slate-600 hidden md:inline">|</span>
              <span className="text-slate-400 hidden md:inline">
                Left-Drag Nodes · Shift+Click Insert · Right-Drag Pan · Scroll Zoom
              </span>
            </div>
          </div>

          <canvas
            ref={canvas2dRef}
            data-testid="track-studio-2d-canvas"
            width={canvas2dSize.width}
            height={canvas2dSize.height}
            style={{ cursor: cursor2d }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            className="w-full h-full flex-1 touch-none"
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
          {/* Live 3D Interactive Node Viewport */}
          <div
            onContextMenu={(e) => e.preventDefault()}
            className="h-56 xl:h-64 relative bg-[#090d14] border-b border-white/10 shrink-0"
          >
            <canvas
              ref={canvas3dRef}
              data-testid="track-studio-3d-canvas"
              style={{ cursor: cursor3d }}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full touch-none"
            />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              <button
                type="button"
                data-testid="btn-studio-3d-view"
                onClick={() => {
                  const next = cameraView3d === 'angled' ? 'top' : 'angled';
                  setCameraView3d(next);
                  preview3dRef.current?.setViewMode(next);
                }}
                className="px-2 py-0.5 rounded bg-black/75 hover:bg-black/90 border border-white/15 text-[10px] font-semibold text-slate-200 cursor-pointer"
              >
                {cameraView3d === 'angled' ? 'Top-Down' : '3/4 View'}
              </button>
              <button
                type="button"
                data-testid="btn-studio-3d-reset"
                onClick={() => preview3dRef.current?.resetCamera(compiledTrack.totalLength, cameraView3d)}
                className="px-2 py-0.5 rounded bg-black/75 hover:bg-black/90 border border-white/15 text-[10px] font-semibold text-slate-200 cursor-pointer"
              >
                Reset
              </button>
            </div>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-slate-300 pointer-events-none">
              3D · L-Drag Nodes · R-Drag Pan · Alt+R Tilt · Scroll Zoom
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
