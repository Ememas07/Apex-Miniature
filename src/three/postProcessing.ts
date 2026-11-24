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
    uniform int uFilterMode;
    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;

      // 1. Miniature Tilt-Shift vertical bokeh blur (top & bottom of frame)
      if (uTiltShift > 0.01) {
        float distY = abs(vUv.y - uFocusY);
        float blurBand = smoothstep(0.14, 0.48, distY) * uTiltShift;
        if (blurBand > 0.005) {
          float r = blurBand * 4.2;
          vec3 acc = col * 0.24;
          acc += texture2D(tDiffuse, vUv + vec2(r, 0.0) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, vUv - vec2(r, 0.0) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, vUv + vec2(0.0, r) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, vUv - vec2(0.0, r) * texel).rgb * 0.11;
          acc += texture2D(tDiffuse, vUv + vec2(r * 0.7, r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, vUv + vec2(-r * 0.7, r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, vUv + vec2(r * 0.7, -r * 0.7) * texel).rgb * 0.08;
          acc += texture2D(tDiffuse, vUv + vec2(-r * 0.7, -r * 0.7) * texel).rgb * 0.08;
          col = acc;
        }
      }

      // 2. Subtle high-speed radial edge stretch (>280 km/h)
      if (uSpeedBlur > 0.01) {
        vec2 dir = vUv - vec2(0.5);
        float edge = smoothstep(0.28, 0.72, length(dir));
        float amt = edge * uSpeedBlur * 0.012;
        vec3 s1 = texture2D(tDiffuse, vUv - dir * amt).rgb;
        vec3 s2 = texture2D(tDiffuse, vUv - dir * amt * 2.0).rgb;
        col = mix(col, (col + s1 + s2) / 3.0, edge * 0.55);
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

  public updateConfig(patch: Partial<PostProcessConfig>): void {
    Object.assign(this.config, patch);
    if (this.bloomPass) {
      this.bloomPass.enabled = this.config.bloomEnabled;
    }
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u.uTiltShift.value = this.config.tiltShiftEnabled ? this.config.tiltShiftStrength : 0.0;
      u.uFocusY.value = this.config.tiltShiftFocusY;
      u.uExposure.value = this.config.exposure;
      u.uContrast.value = this.config.contrast;
      u.uSaturation.value = this.config.saturation;
      u.uVignette.value = this.config.vignette;
      u.uSpeedBlur.value = this.config.speedIntensity;
      u.uFilterMode.value = FILTER_TO_INT[this.config.filter] ?? 0;
    }
  }

  public isPostActive(): boolean {
    if (this.isSoftwareGl || !this.composer) return false;
    const c = this.config;
    return (
      c.bloomEnabled ||
      c.tiltShiftEnabled ||
      c.filter !== 'none' ||
      c.speedIntensity > 0.02 ||
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
