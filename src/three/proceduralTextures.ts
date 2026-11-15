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
 * Creates a crisp 512x512 top/side body livery CanvasTexture matching the active template,
 * 3 colors, carbon hood toggle, and hood racing number plate.
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

  // Base primary coat
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 512, 512);

  if (template === 'racing-stripes') {
    // Classic twin center racing stripes + side rocker accent
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(204, 0, 42, 512);
    ctx.fillRect(266, 0, 42, 512);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(192, 0, 8, 512);
    ctx.fillRect(312, 0, 8, 512);
    // Subtle lower rocker trim
    ctx.fillRect(0, 0, 10, 512);
    ctx.fillRect(502, 0, 10, 512);
  } else if (template === 'two-tone') {
    // Front/rear diagonal split + sharp secondary flank
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(512, 175);
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 250);
    ctx.lineTo(512, 165);
    ctx.lineTo(512, 185);
    ctx.lineTo(0, 270);
    ctx.closePath();
    ctx.fill();
  } else if (template === 'geometric') {
    // Bold angular motorsport blocks
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(190, 0);
    ctx.lineTo(80, 340);
    ctx.lineTo(0, 340);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.lineTo(322, 0);
    ctx.lineTo(432, 340);
    ctx.lineTo(512, 340);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tertiaryColor;
    ctx.beginPath();
    ctx.moveTo(150, 512);
    ctx.lineTo(256, 330);
    ctx.lineTo(362, 512);
    ctx.closePath();
    ctx.fill();

    // Nose chevron
    ctx.fillRect(216, 42, 80, 14);
  } else if (template === 'heritage') {
    // Iconic horizontal/longitudinal triple heritage bands
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(0, 185, 512, 120);
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(0, 168, 512, 14);
    ctx.fillRect(0, 308, 512, 14);
    // Center pinstripe
    ctx.fillStyle = tertiaryColor;
    ctx.fillRect(248, 0, 16, 512);
  }

  // Exposed carbon fiber hood panel (upper hood UV area)
  if (livery.carbonHood) {
    drawCarbonWeave(ctx, 130, 315, 252, 175);
    ctx.strokeStyle = tertiaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(130, 315, 252, 175);
  }

  // Subtle panel shutlines for die-cast scale realism
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(118, 305, 276, 192);

  // Hood racing number plate
  const num = validateDriverNumber(livery.driverNumber);
  const plate = resolveNumberPlateColors(classId, livery.numberPlateStyle);
  ctx.save();
  ctx.fillStyle = plate.bg;
  ctx.fillRect(202, 348, 108, 86);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(202, 348, 108, 86);

  ctx.fillStyle = plate.text;
  ctx.font = '800 50px "Oxanium", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 256, 394);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
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
