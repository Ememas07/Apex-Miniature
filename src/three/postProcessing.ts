import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { PhotoFilterId } from '../game/types';

export interface PostProcessConfig {
  bloomEnabled: boolean;
  tiltShiftEnabled: boolean;
  tiltShiftStrength: number; // 0..1
  tiltShiftFocusY: number; // 0..1 (default 0.5)
  exposure: number; // 0.5..1.8
  contrast: number; // 0.6..1.6
  saturation: number; // 0..1.8
  vignette: number; // 0..0.85
  speedIntensity: number; // 0..1 high-speed edge radial sensation
  chromaticStreak?: number; // 0..1 radial chromatic streak / motion lines (>260 km/h or slipstream)
  speedKmh?: number; // optional speed in km/h to auto-drive >260 km/h radial streak
  inSlipstream?: boolean; // optional slipstream boost for radial streaks
  speedEffectsEnabled?: boolean; // optional toggle for high-speed blur/streaks (default true)
  raindropIntensity?: number; // 0..1 screen-space hood/cockpit raindrop beads
  rainTime?: number; // elapsed seconds for animated raindrop trickle
  filter: PhotoFilterId;
}

export const DEFAULT_POST_CONFIG: PostProcessConfig = {
  bloomEnabled: true,
  tiltShiftEnabled: false,
  tiltShiftStrength: 0.55,
  tiltShiftFocusY: 0.5,
  exposure: 1.0,
  contrast: 1.02,
  saturation: 1.02,
  vignette: 0.14,
  speedIntensity: 0,
  chromaticStreak: 0,
  speedKmh: 0,
  inSlipstream: false,
  speedEffectsEnabled: true,
  raindropIntensity: 0,
  rainTime: 0,
  filter: 'none',
};

const FILTER_TO_INT: Record<PhotoFilterId, number> = {
  none: 0,
  'f1-broadcast': 1,
  kodachrome: 2,
  vintage: 2,
  'film-grain': 3,
  noir: 4,
};

const MiniaturePostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uTiltShift: { value: 0.0 },
    uFocusY: { value: 0.5 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.06 },
    uVignette: { value: 0.18 },
    uSpeedBlur: { value: 0.0 },
    uChromaticStreak: { value: 0.0 },
    uRaindrops: { value: 0.0 },
    uRainTime: { value: 0.0 },
    uFilterMode: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTiltShift;
    uniform float uFocusY;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uSpeedBlur;
    uniform float uChromaticStreak;
    uniform float uRaindrops;
    uniform float uRainTime;
    uniform int uFilterMode;
    varying vec2 vUv;

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    // Procedural screen-space visor raindrop layer returning xy refraction normal and z glint
    vec3 raindropLayer(vec2 uv, float scale, float t) {
      vec2 st = uv * scale;
      st.y += t * 0.45;
      vec2 id = floor(st);
      vec2 gv = fract(st) - 0.5;
      vec2 rnd = hash22(id);
      if (rnd.x < 0.52) return vec3(0.0);
      float localT = t * (0.6 + rnd.y * 0.8) + rnd.x * 6.2831;
      vec2 dropPos = vec2((rnd.x - 0.5) * 0.42 + sin(localT * 1.3) * 0.04, (rnd.y - 0.5) * 0.42 - fract(localT * 0.25) * 0.28 + 0.14);
      vec2 diff = gv - dropPos;
      diff.y *= 0.82;
      float d = length(diff);
      float rad = mix(0.11, 0.21, rnd.y);
      float mask = smoothstep(rad, rad * 0.3, d);
      vec2 norm = (diff / max(rad, 0.001)) * mask;
      float glint = smoothstep(rad * 0.45, 0.0, length(diff - vec2(-rad * 0.28, rad * 0.32))) * mask;
      return vec3(norm, glint);
    }

    void main() {
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec2 sampleUv = vUv;
      float rainGlint = 0.0;

      // 0. Optional screen-space hood/cockpit visor raindrop beads
      if (uRaindrops > 0.01) {
        float aspect = uResolution.x / max(1.0, uResolution.y);
        vec2 aspectUv = vec2(vUv.x * aspect, vUv.y);
        float visorMask = smoothstep(0.12, 0.62, length((vUv - vec2(0.5, 0.46)) * vec2(1.1, 1.25)));
        float strength = uRaindrops * mix(0.35, 1.0, visorMask);
        vec3 r1 = raindropLayer(aspectUv, 14.0, uRainTime);
        vec3 r2 = raindropLayer(aspectUv + vec2(3.7, 1.9), 26.0, uRainTime * 1.25);
        vec2 dropOffset = (r1.xy * 0.014 + r2.xy * 0.008) * strength;
        sampleUv = clamp(sampleUv - dropOffset, vec2(0.001), vec2(0.999));
        rainGlint = (r1.z * 0.26 + r2.z * 0.16) * strength;
      }

      vec4 base = texture2D(tDiffuse, sampleUv);
      vec3 col = base.rgb;

      // 1. Miniature Tilt-Shift vertical bokeh blur (top & bottom of frame)
      if (uTiltShift > 0.01) {
        float distY = abs(vUv.y - uFocusY);
        float blurBand = smoothstep(0.14, 0.48, distY) * uTiltShift;
        if (blurBand > 0.005) {
          float r = blurBand * 4.2;
          vec3 acc = col * 0.24;
          acc += texture2D(tDiffuse, sampleUv + vec2(r, 0.0) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, sampleUv - vec2(r, 0.0) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, sampleUv + vec2(0.0, r) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, sampleUv - vec2(0.0, r) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, sampleUv + vec2(r * 0.7, r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, sampleUv + vec2(-r * 0.7, r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, sampleUv + vec2(r * 0.7, -r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, sampleUv + vec2(-r * 0.7, -r * 0.7) * texel).rgb * 0.08;
          col = acc;
        }
      }

      // 2. High-speed radial edge blur + chromatic streak (>260 km/h or slipstream)
      if (uSpeedBlur > 0.01 || uChromaticStreak > 0.01) {
        vec2 dir = vUv - vec2(0.5);
        float radDist = length(dir);
        float edge = smoothstep(0.24, 0.72, radDist);
        float blurStrength = max(uSpeedBlur, uChromaticStreak * 0.85);
        float amt = edge * blurStrength * 0.014;
        vec3 s1 = texture2D(tDiffuse, clamp(sampleUv - dir * amt, 0.001, 0.999)).rgb;
        vec3 s2 = texture2D(tDiffuse, clamp(sampleUv - dir * amt * 2.0, 0.001, 0.999)).rgb;
        col = mix(col, (col + s1 + s2) / 3.0, edge * clamp(0.45 + blurStrength * 0.25, 0.0, 0.75));

        if (uChromaticStreak > 0.01) {
          float chromaAmt = edge * uChromaticStreak * 0.011;
          float rCh = texture2D(tDiffuse, clamp(sampleUv + dir * chromaAmt, 0.001, 0.999)).r;
          float bCh = texture2D(tDiffuse, clamp(sampleUv - dir * chromaAmt, 0.001, 0.999)).b;
          col.r = mix(col.r, rCh, edge * uChromaticStreak * 0.65);
          col.b = mix(col.b, bCh, edge * uChromaticStreak * 0.65);

          float ang = atan(dir.y, dir.x);
          float streakWave = pow(abs(sin(ang * 44.0 + fract(radDist * 3.0) * 0.35)), 14.0);
          float outerMask = smoothstep(0.36, 0.76, radDist);
          col += vec3(0.85, 0.93, 1.0) * (streakWave * outerMask * uChromaticStreak * 0.085);
        }
      }

      if (rainGlint > 0.001) {
        col += vec3(0.88, 0.94, 1.0) * rainGlint;
      }

      // 3. Exposure, contrast & saturation
      col *= uExposure;
      col = (col - 0.5) * uContrast + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // 4. Photo Mode & Broadcast color grading filters
      if (uFilterMode == 1) {
        // Broadcast motorsport crisp cool highlights + punchy shadows
        col = mix(col, col * vec3(0.98, 1.01, 1.04), 0.35);
      } else if (uFilterMode == 2) {
        // Kodachrome Vintage warm film stock
        col = col * vec3(1.09, 1.01, 0.88) + vec3(0.02, 0.008, -0.01);
      } else if (uFilterMode == 3) {
        // Night Neon electric contrast
        col = pow(max(col, vec3(0.0)), vec3(1.06));
        col *= vec3(0.95, 1.02, 1.12);
      } else if (uFilterMode == 4) {
        // B&W Motorsport high-contrast silver halide
        float bw = dot(col, vec3(0.299, 0.587, 0.114));
        bw = clamp((bw - 0.45) * 1.28 + 0.45, 0.0, 1.0);
        col = vec3(bw);
      }

      // 5. Subtle cinematic vignette
      if (uVignette > 0.005) {
        float d = length((vUv - 0.5) * vec2(1.25, 1.0));
        float vig = smoothstep(0.45, 1.05, d);
        col *= 1.0 - vig * uVignette;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a);
    }
  `,
};

/**
 * Manages optional WebGL post-processing (UnrealBloom + Miniature Tilt-Shift + Photo Grading).
 * Automatically bypasses on software WebGL so headless/VDI environments stay smooth.
 */
export class RacePostProcessor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private manualRainTime = false;
  public config: PostProcessConfig = { ...DEFAULT_POST_CONFIG };

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    isSoftwareGl: boolean,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isSoftwareGl = isSoftwareGl;

    if (!isSoftwareGl) {
      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2))),
        0.16, // subtle glow strictly on emissive brake lights, sparks, flames & night floodlights
        0.25,
        1.28, // high HDR threshold so sunlit barriers, kerbs & white paint never bloom
      );
      composer.addPass(bloomPass);

      const gradePass = new ShaderPass(MiniaturePostShader);
      gradePass.uniforms.uResolution.value.set(Math.max(1, width), Math.max(1, height));
      composer.addPass(gradePass);

      this.composer = composer;
      this.bloomPass = bloomPass;
      this.gradePass = gradePass;
    }
  }

  private resolveSpeedEffects(): { speedBlur: number; chromaticStreak: number } {
    const c = this.config;
    if (c.speedEffectsEnabled === false) {
      return { speedBlur: 0, chromaticStreak: 0 };
    }
    const kmhFactor =
      c.speedKmh !== undefined ? Math.max(0, Math.min(1, (c.speedKmh - 260) / 95)) : 0;
    const slipBoost = c.inSlipstream ? 0.35 : 0;
    const speedBlur = Math.max(
      0,
      Math.min(1, Math.max(c.speedIntensity, kmhFactor * 0.9 + (c.inSlipstream ? 0.2 : 0))),
    );
    let chromaticStreak = 0;
    if (c.chromaticStreak !== undefined && c.chromaticStreak > 0) {
      chromaticStreak = c.chromaticStreak;
    } else if (c.speedKmh !== undefined || c.inSlipstream) {
      chromaticStreak = kmhFactor + slipBoost;
    } else if (c.speedIntensity > 0.52) {
      chromaticStreak = (c.speedIntensity - 0.52) / 0.48;
    }
    return {
      speedBlur,
      chromaticStreak: Math.max(0, Math.min(1, chromaticStreak)),
    };
  }

  public updateConfig(patch: Partial<PostProcessConfig>): void {
    if (patch.rainTime !== undefined) {
      this.manualRainTime = true;
    }
    Object.assign(this.config, patch);
    if (this.bloomPass) {
      this.bloomPass.enabled = this.config.bloomEnabled;
    }
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      const { speedBlur, chromaticStreak } = this.resolveSpeedEffects();
      u.uTiltShift.value = this.config.tiltShiftEnabled ? this.config.tiltShiftStrength : 0.0;
      u.uFocusY.value = this.config.tiltShiftFocusY;
      u.uExposure.value = this.config.exposure;
      u.uContrast.value = this.config.contrast;
      u.uSaturation.value = this.config.saturation;
      u.uVignette.value = this.config.vignette;
      u.uSpeedBlur.value = speedBlur;
      u.uChromaticStreak.value = chromaticStreak;
      u.uRaindrops.value = Math.max(0, Math.min(1, this.config.raindropIntensity ?? 0));
      if (this.manualRainTime) {
        u.uRainTime.value = this.config.rainTime ?? 0;
      }
      u.uFilterMode.value = FILTER_TO_INT[this.config.filter] ?? 0;
    }
  }

  public isPostActive(): boolean {
    if (this.isSoftwareGl || !this.composer) return false;
    const c = this.config;
    const { speedBlur, chromaticStreak } = this.resolveSpeedEffects();
    return (
      c.bloomEnabled ||
      c.tiltShiftEnabled ||
      c.filter !== 'none' ||
      speedBlur > 0.02 ||
      chromaticStreak > 0.02 ||
      (c.raindropIntensity ?? 0) > 0.02 ||
      Math.abs(c.exposure - 1.0) > 0.02 ||
      Math.abs(c.contrast - 1.04) > 0.02 ||
      Math.abs(c.saturation - 1.06) > 0.02
    );
  }

  public setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    }
    if (this.gradePass) {
      this.gradePass.uniforms.uResolution.value.set(w, h);
    }
  }

  public render(): void {
    if (this.isPostActive() && this.composer) {
      if (
        !this.manualRainTime &&
        this.gradePass &&
        (this.config.raindropIntensity ?? 0) > 0.01 &&
        typeof performance !== 'undefined'
      ) {
        this.gradePass.uniforms.uRainTime.value = performance.now() * 0.001;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.gradePass = null;
  }
}
