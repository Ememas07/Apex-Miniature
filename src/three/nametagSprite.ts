import * as THREE from 'three';
import { CAR_CLASSES } from '../game/cars';
import { CarClassId } from '../game/types';

export interface NametagSpec {
  id: string;
  driverName: string;
  classId: CarClassId;
  isHumanPeer: boolean;
  accentColor?: string;
}

export interface CarNametagHandle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  baseHeightOffset: number;
  aspect: number;
  isHumanPeer: boolean;
  dispose: () => void;
}

export interface NametagLabelData {
  badgeText: string;
  nameText: string;
  classShortText: string;
  classBgColor: string;
  classTextColor: string;
  isHumanPeer: boolean;
}

export interface NametagDistanceStyle {
  visible: boolean;
  opacity: number;
  scaleY: number;
  heightLift: number;
}

const TAG_CANVAS_W = 512;
const TAG_CANVAS_H = 128;

export function getShortNametagClassLabel(classId: CarClassId): string {
  switch (classId) {
    case CarClassId.F1_2026:
    case CarClassId.F1_2021:
    case CarClassId.F1_2005:
      return 'F1';
    case CarClassId.HYPERCAR_GTP:
      return 'GTP';
    case CarClassId.LMP2:
      return 'LMP2';
    case CarClassId.GT3:
      return 'GT3';
    case CarClassId.GT4:
      return 'GT4';
    case CarClassId.FORMULA_E:
      return 'FE';
    case CarClassId.TRACK_COUPE:
      return 'COUPE';
    case CarClassId.SUPERCAR:
      return 'HYPER';
    default:
      return 'RACE';
  }
}

export function formatShortDriverPlateName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'AI Driver';
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  if (parts[0].toUpperCase() === 'AI') return trimmed;
  const initial = parts[0].replace(/\.$/, '').charAt(0).toUpperCase();
  const lastName = parts.slice(1).join(' ');
  return `${initial}. ${lastName}`;
}

export function formatNametagLabel(spec: NametagSpec): NametagLabelData {
  const clsMeta = CAR_CLASSES[spec.classId] ?? CAR_CLASSES[CarClassId.HYPERCAR_GTP];
  const classShortText = getShortNametagClassLabel(spec.classId);
  const rawName = (spec.driverName || (spec.isHumanPeer ? 'Player' : 'AI Driver')).trim();
  const displayName = spec.isHumanPeer ? rawName : formatShortDriverPlateName(rawName);
  const nameText = displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName;

  if (spec.isHumanPeer) {
    return {
      badgeText: 'PLAYER',
      nameText,
      classShortText,
      classBgColor: clsMeta.plateColor,
      classTextColor: clsMeta.badgeTextColor,
      isHumanPeer: true,
    };
  }

  return {
    badgeText: `AI • ${classShortText}`,
    nameText,
    classShortText,
    classBgColor: clsMeta.plateColor,
    classTextColor: clsMeta.badgeTextColor,
    isHumanPeer: false,
  };
}

export function computeNametagDistanceStyle(
  distanceMeters: number,
  isHumanPeer: boolean,
): NametagDistanceStyle {
  const fadeInStart = 1.6;
  const fadeInEnd = 3.2;
  const fadeOutStart = isHumanPeer ? 175 : 115;
  const fadeOutEnd = isHumanPeer ? 235 : 165;

  if (!Number.isFinite(distanceMeters) || distanceMeters <= fadeInStart || distanceMeters >= fadeOutEnd) {
    return { visible: false, opacity: 0, scaleY: 0.7, heightLift: 0 };
  }

  let opacity = 1.0;
  if (distanceMeters < fadeInEnd) {
    opacity = (distanceMeters - fadeInStart) / (fadeInEnd - fadeInStart);
  } else if (distanceMeters > fadeOutStart) {
    opacity = 1.0 - (distanceMeters - fadeOutStart) / (fadeOutEnd - fadeOutStart);
  }

  opacity = Math.max(0, Math.min(1, opacity)) * (isHumanPeer ? 0.98 : 0.88);
  const baseScale = isHumanPeer ? 0.95 : 0.82;
  const distFactor = Math.max(0.72, Math.min(2.65, 0.62 + distanceMeters * 0.02));
  const scaleY = baseScale * distFactor;
  const heightLift = Math.min(1.6, distanceMeters * 0.011);

  return {
    visible: opacity > 0.02,
    opacity,
    scaleY,
    heightLift,
  };
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a single crisp billboarded nametag sprite & CanvasTexture once on car spawn.
 * Call handle.dispose() on world rebuild or race exit to release GPU memory cleanly.
 */
export function createCarNametagSprite(
  spec: NametagSpec,
  carHeightMeters: number,
  maxAniso: number,
): CarNametagHandle {
  const label = formatNametagLabel(spec);

  const canvas = document.createElement('canvas');
  canvas.width = TAG_CANVAS_W;
  canvas.height = TAG_CANVAS_H;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, TAG_CANVAS_W, TAG_CANVAS_H);

    // Measure text widths to size a compact, centered pill
    const badgeFont = '800 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const nameFont = '700 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const classChipFont = '800 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    ctx.font = badgeFont;
    const badgeTextW = ctx.measureText(label.badgeText).width;
    const badgePadX = 16;
    const badgeW = badgeTextW + badgePadX * 2;

    ctx.font = nameFont;
    const nameTextW = ctx.measureText(label.nameText).width;

    let classChipW = 0;
    const chipGap = 12;
    if (label.isHumanPeer) {
      ctx.font = classChipFont;
      classChipW = ctx.measureText(label.classShortText).width + 20;
    }

    const outerPadX = 18;
    const innerGap = 14;
    const totalContentW =
      outerPadX +
      badgeW +
      innerGap +
      nameTextW +
      (label.isHumanPeer ? chipGap + classChipW : 0) +
      outerPadX;

    const pillW = Math.min(TAG_CANVAS_W - 16, Math.max(220, totalContentW));
    const pillH = 74;
    const pillX = (TAG_CANVAS_W - pillW) * 0.5;
    const pillY = 18;

    // Soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Pill background
    drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 16);
    ctx.fillStyle = label.isHumanPeer ? 'rgba(9, 14, 26, 0.90)' : 'rgba(12, 17, 27, 0.80)';
    ctx.fill();
    ctx.restore();

    // Subtle pointer caret underneath pill pointing down toward car roof
    ctx.beginPath();
    ctx.moveTo(TAG_CANVAS_W * 0.5 - 10, pillY + pillH - 1);
    ctx.lineTo(TAG_CANVAS_W * 0.5 + 10, pillY + pillH - 1);
    ctx.lineTo(TAG_CANVAS_W * 0.5, pillY + pillH + 12);
    ctx.closePath();
    ctx.fillStyle = label.isHumanPeer ? '#38bdf8' : 'rgba(148, 163, 184, 0.65)';
    ctx.fill();

    // Crisp outer border
    drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 16);
    ctx.lineWidth = label.isHumanPeer ? 3.5 : 2.2;
    ctx.strokeStyle = label.isHumanPeer ? '#38bdf8' : 'rgba(203, 213, 225, 0.35)';
    ctx.stroke();

    // Badge on left
    const badgeX = pillX + outerPadX;
    const badgeH = 42;
    const badgeY = pillY + (pillH - badgeH) * 0.5;
    drawRoundedRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 10);
    ctx.fillStyle = label.isHumanPeer ? '#10b981' : label.classBgColor;
    ctx.fill();

    ctx.font = badgeFont;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = label.isHumanPeer ? '#022c22' : label.classTextColor;
    ctx.fillText(label.badgeText, badgeX + badgeW * 0.5, pillY + pillH * 0.5 + 1);

    // Driver name
    const nameX = badgeX + badgeW + innerGap;
    const maxNameWidth =
      pillX +
      pillW -
      outerPadX -
      (label.isHumanPeer ? classChipW + chipGap : 0) -
      nameX;

    ctx.font = nameFont;
    ctx.textAlign = 'left';
    ctx.fillStyle = label.isHumanPeer ? '#f8fafc' : '#e2e8f0';
    ctx.fillText(label.nameText, nameX, pillY + pillH * 0.5 + 1, Math.max(40, maxNameWidth));

    // Secondary class plate chip for Human Peers (so both human status and car class read clearly)
    if (label.isHumanPeer) {
      const chipX = pillX + pillW - outerPadX - classChipW;
      const chipH = 36;
      const chipY = pillY + (pillH - chipH) * 0.5;
      drawRoundedRectPath(ctx, chipX, chipY, classChipW, chipH, 8);
      ctx.fillStyle = label.classBgColor;
      ctx.fill();

      ctx.font = classChipFont;
      ctx.textAlign = 'center';
      ctx.fillStyle = label.classTextColor;
      ctx.fillText(label.classShortText, chipX + classChipW * 0.5, pillY + pillH * 0.5 + 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, Math.min(8, maxAniso));
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 0.95,
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  sprite.frustumCulled = true;

  const aspect = TAG_CANVAS_W / TAG_CANVAS_H;
  const baseHeightOffset = Math.max(1.0, carHeightMeters) + 0.95;

  return {
    sprite,
    material,
    texture,
    baseHeightOffset,
    aspect,
    isHumanPeer: spec.isHumanPeer,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}
