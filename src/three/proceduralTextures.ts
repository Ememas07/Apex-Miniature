import * as THREE from 'three';
import { resolveNumberPlateColors, validateDriverNumber } from '../game/cars';
import { CarClassId, LiveryConfig } from '../game/types';

function drawCarbonWeave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#181b20';
  ctx.fillRect(x, y, w, h);
  const cell = 8;
  for (let py = y; py < y + h; py += cell) {
    for (let px = x; px < x + w; px += cell) {
      const even = ((Math.floor(px / cell) + Math.floor(py / cell)) % 2) === 0;
      ctx.fillStyle = even ? '#262b33' : '#121519';
      ctx.fillRect(px, py, cell * 0.5, cell);
      ctx.fillStyle = even ? '#1c2026' : '#2d333d';
      ctx.fillRect(px + cell * 0.5, py, cell * 0.5, cell);
    }
  }
  ctx.restore();
}

export function createCarbonTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  drawCarbonWeave(ctx, 0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Creates a crisp 512x512 UV-atlas livery CanvasTexture mapped 1:1 to SIX_ZONE_UV_ATLAS.
 * Correctly renders the active template, 3 color channels, exposed carbon panels,
 * authentic single-seater nose numbers, and endurance/GT/touring class numberplates directly on the UV atlas.
 */
export function createLiveryTexture(
  livery: LiveryConfig,
  classId: CarClassId,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const { primaryColor, secondaryColor, tertiaryColor, template } = livery;

  // 1. Base primary coat across entire UV canvas
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 512, 512);

  // 2. Atlas-Aligned Livery Patterns
  // TOP zone: x: 10..225 (center 118), y: 10..502 (front/nose < 180, roof 180..330, rear > 330)
  // LEFT_SIDE zone: x: 236..502, y: 10..123
  // RIGHT_SIDE zone: x: 236..502, y: 133..246
  // FRONT bumper: x: 236..364, y: 256..374
  // REAR bumper: x: 374..502, y: 256..374
  // WINGS / AERO: x: 236..502, y: 384..502

  if (template === 'racing-stripes') {
    // Twin center longitudinal racing stripes down TOP zone
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(104, 10, 11, 492);
    ctx.fillRect(121, 10, 11, 492);

    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(99, 10, 3, 492);
    ctx.fillRect(134, 10, 3, 492);

    // Front & rear bumper stripe continuations
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(295, 256, 10, 118);
    ctx.fillRect(433, 256, 10, 118);

    // Flank rocker / side accent stripes
    ctx.fillRect(240, 102, 255, 12);
    ctx.fillRect(240, 226, 255, 12);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(240, 98, 255, 3);
    ctx.fillRect(240, 222, 255, 3);
  } else if (template === 'two-tone') {
    // Top zone diagonal / longitudinal split
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(10, 220);
    ctx.lineTo(225, 150);
    ctx.lineTo(225, 502);
    ctx.lineTo(10, 502);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(10, 214);
    ctx.lineTo(225, 144);
    ctx.lineTo(225, 150);
    ctx.lineTo(10, 220);
    ctx.closePath();
    ctx.fill();

    // Side flanks two-tone fill
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(330, 10);
    ctx.lineTo(502, 10);
    ctx.lineTo(502, 123);
    ctx.lineTo(280, 123);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(330, 133);
    ctx.lineTo(502, 133);
    ctx.lineTo(502, 246);
    ctx.lineTo(280, 246);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(240, 115, 260, 6);
    ctx.fillRect(240, 238, 260, 6);
  } else if (template === 'geometric') {
    // Bold angular motorsport blocks on hood, roof & flank wedges
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(25, 30);
    ctx.lineTo(118, 140);
    ctx.lineTo(80, 260);
    ctx.lineTo(10, 260);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(210, 30);
    ctx.lineTo(118, 140);
    ctx.lineTo(156, 260);
    ctx.lineTo(225, 260);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(60, 320);
    ctx.lineTo(118, 240);
    ctx.lineTo(176, 320);
    ctx.lineTo(118, 290);
    ctx.closePath();
    ctx.fill();

    // Flank geometric chevrons
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(260, 10);
    ctx.lineTo(380, 10);
    ctx.lineTo(330, 123);
    ctx.lineTo(236, 123);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(260, 133);
    ctx.lineTo(380, 133);
    ctx.lineTo(330, 246);
    ctx.lineTo(236, 246);
    ctx.closePath();
    ctx.fill();
  } else if (template === 'heritage') {
    // Iconic triple heritage band across center of TOP zone
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(94, 10, 48, 492);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(86, 10, 6, 492);
    ctx.fillRect(144, 10, 6, 492);

    // Side heritage bands
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(240, 55, 255, 26);
    ctx.fillRect(240, 178, 255, 26);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(240, 48, 255, 5);
    ctx.fillRect(240, 83, 255, 5);
    ctx.fillRect(240, 171, 255, 5);
    ctx.fillRect(240, 206, 255, 5);
  }

  // 3. Exposed carbon fiber hood panel (in TOP zone hood region)
  if (livery.carbonHood) {
    drawCarbonWeave(ctx, 42, 35, 152, 140);
    ctx.strokeStyle = tertiaryColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 35, 152, 140);
  }

  // 4. Competition Racing Numbers & Class Numberplates
  const isSingleSeater =
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    classId === CarClassId.F1_2005 ||
    classId === CarClassId.FORMULA_E;
  const isRoadSupercar = classId === CarClassId.SUPERCAR;
  const num = validateDriverNumber(livery.driverNumber);
  const plateStyle = livery.numberPlateStyle ?? 'auto';

  if (plateStyle !== 'none') {
    if (isSingleSeater) {
      // Single-seaters (F1 / Formula E): Bold stylized racing number on the nose cone facing forward
      // TOP UV zone has +Z (nose) at top of canvas (cy=13) and +X (left) at left of canvas (cx=13),
      // so rotating 180 deg makes the nose number read right-side-up when viewed from the front.
      ctx.save();
      ctx.translate(118, 86);
      ctx.rotate(Math.PI);
      ctx.font = '900 42px "Oxanium", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Crisp contrast outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeText(num, 0, 0, 72);

      // Inner number color
      ctx.fillStyle = tertiaryColor.toLowerCase() !== primaryColor.toLowerCase() ? tertiaryColor : '#ffffff';
      ctx.fillText(num, 0, 0, 72);
      ctx.restore();
    } else if (!isRoadSupercar || plateStyle !== 'auto') {
      // Endurance / GT / Prototype / Touring (GT3, GT4, LMP2, GTP, Track Coupe): Boxed category numberplates
      // Top / Hood Numberplate (centered on hood, rotated 180 deg so it reads upright from the front)
      drawNumberplateToContext(ctx, 90, 82, 56, 44, classId, plateStyle, num, {
        rotateRad: Math.PI,
      });

      // Left Door Numberplate (LEFT_SIDE zone: u increases tail->nose while outside view goes nose->tail, so flipX)
      // Placed at y=60..100 (nv ~0.18..0.56) so it sits cleanly on the door/sidepod below side windows.
      drawNumberplateToContext(ctx, 345, 60, 48, 40, classId, plateStyle, num, {
        flipX: true,
      });

      // Right Door Numberplate (RIGHT_SIDE zone: u increases nose->tail while outside view goes tail->nose, so flipX)
      // Placed at y=183..223 (nv ~0.18..0.56) so it sits cleanly on the door/sidepod below side windows.
      drawNumberplateToContext(ctx, 345, 183, 48, 40, classId, plateStyle, num, {
        flipX: true,
      });
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export interface NumberplateTransform {
  flipX?: boolean;
  flipY?: boolean;
  rotateRad?: number;
}

/**
 * Draws an authentic motorsport category numberplate onto any 2D canvas context.
 */
export function drawNumberplateToContext(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  pw: number,
  ph: number,
  classId: CarClassId,
  plateStyle: LiveryConfig['numberPlateStyle'] = 'auto',
  driverNumber = '1',
  transform?: NumberplateTransform,
): void {
  ctx.save();
  if (transform && (transform.flipX || transform.flipY || transform.rotateRad)) {
    const cx = px + pw * 0.5;
    const cy = py + ph * 0.5;
    ctx.translate(cx, cy);
    if (transform.rotateRad) ctx.rotate(transform.rotateRad);
    ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
  }

  const plate = resolveNumberPlateColors(classId, plateStyle);
  const num = validateDriverNumber(driverNumber);
  const categoryLabel =
    classId === CarClassId.HYPERCAR_GTP
      ? 'GTP'
      : classId === CarClassId.LMP2
      ? 'LMP2'
      : classId === CarClassId.GT3
      ? 'GT3'
      : classId === CarClassId.GT4
      ? 'GT4'
      : 'PRO';

  // White plate background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px, py, pw, ph);

  // Dark outer stroke
  ctx.strokeStyle = '#0a0d14';
  ctx.lineWidth = Math.max(2, Math.round(pw * 0.04));
  ctx.strokeRect(px, py, pw, ph);

  // Top category colored header strip
  const headerH = Math.round(ph * 0.28);
  ctx.fillStyle = plate.bg;
  ctx.fillRect(px, py, pw, headerH);

  // Header label
  ctx.fillStyle = plate.text;
  ctx.font = `800 ${Math.max(8, Math.round(headerH * 0.72))}px "Oxanium", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(categoryLabel, px + pw * 0.5, py + headerH * 0.52, pw - 6);

  // Driver number in lower plate area (clamped to inner width so 3-digit numbers never overflow)
  ctx.fillStyle = '#0a0d14';
  ctx.font = `900 ${Math.max(12, Math.round(ph * 0.56))}px "Oxanium", "Arial Black", sans-serif`;
  ctx.fillText(num, px + pw * 0.5, py + headerH + (ph - headerH) * 0.54, pw - 8);
  ctx.restore();
}

export function createNumberPlateTexture(
  livery: LiveryConfig,
  classId: CarClassId,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const plate = resolveNumberPlateColors(classId, livery.numberPlateStyle);
  const num = validateDriverNumber(livery.driverNumber);

  ctx.fillStyle = plate.bg;
  ctx.fillRect(0, 0, 256, 192);

  // Crisp inner white border + class header strip
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 244, 180);

  ctx.fillStyle = plate.text;
  ctx.font = '800 112px "Oxanium", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 128, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createWindshieldBannerTexture(
  bannerText: string,
  accentColor: string,
  maxAniso = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f131a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 52, 256, 12);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 32px "Oxanium", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((bannerText || 'APEX').toUpperCase().slice(0, 10), 128, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createAsphaltTexture(baseHex: string, maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Aggregate mineral grain
  for (let i = 0; i < 3200; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137 + Math.floor(i / 256) * 29) % 256;
    const bright = (i % 3 === 0);
    ctx.fillStyle = bright ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle racing line darker rubber center band
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.03, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.04, 'rgba(0,0,0,0)');
  grad.addColorStop(0.32, 'rgba(0,0,0,0.12)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.68, 'rgba(0,0,0,0.12)');
  grad.addColorStop(0.96, 'rgba(0,0,0,0)');
  grad.addColorStop(0.97, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createKerbTexture(primaryHex: string, secondaryHex: string, maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = secondaryHex;
  ctx.fillRect(0, 64, 128, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createStartLineTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const size = 16;
  for (let y = 0; y < 64; y += size) {
    for (let x = 0; x < 256; x += size) {
      const white = ((x / size + y / size) % 2) === 0;
      ctx.fillStyle = white ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBrakingBoardTexture(meters: number, maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 192, 128);

  // Red motorsport outer frame + top/bottom stripes
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 182, 118);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 72px "Oxanium", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(meters), 96, 60);

  ctx.fillStyle = '#dc2626';
  ctx.font = '800 18px "Oxanium", sans-serif';
  ctx.fillText('METERS', 96, 104);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}
