# Overnight Changes & Audit Log

This document summarizes the camera improvements, main menu UI finalization, AI neural policy/weight audit, and verification checks completed across the Apex Miniature codebase.

---

## 1. Chase & Spectate Camera Improvements

### Higher Default Camera Height & Pitch Angle
- **`src/game/camera.ts`**
  - Added exported `DEFAULT_CHASE_CAMERA` constants:
    - `pitch: 0.42` (~24° downward look angle for a clearer view down the track ahead)
    - `distance: 12.2`
    - `pivotHeight: 1.35` (elevated pivot slightly above car roofline)
    - `minHeightAboveCar: 0.65`
    - `minPitch: 0.1`, `maxPitch: 1.28`
    - `minDistance: 5.5`, `maxDistance: 28.0`
    - `rollResetDelayMs: 2500`, `rollResetDampRate: 3.5`
  - Updated `computeCameraFrame('orbit', ...)` to use `DEFAULT_CHASE_CAMERA` so chase/spectate frames start at the elevated angle and keep `lookAt` centered on the car (`isLocked: true`).

### Roll-Only Idle Reset (Manual Pitch & Yaw Preserved)
- **`src/three/RaceViewport.tsx`**
  - Preserved manual camera `orbitYawOffset` and `targetOrbitPitch` after mouse drag or gamepad right-stick adjustments (`onPointerMove`, `onPointerUp`, and the right-stick branch in `tick`) instead of snapping back toward default pitch/yaw after idle.
  - Added `orbitRoll`, `targetOrbitRoll`, and `orbitRollLastInteractTime` state along with `_orbitLookFwd` / `_orbitUp` scratch vectors so **only camera roll** smoothly damps back to `0` after `DEFAULT_CHASE_CAMERA.rollResetDelayMs` (2.5 seconds) of camera inactivity.
  - Added `resetGameplayCamera(targetCar, preservePitchAndDist)` so explicit resets (`KeyR`, canvas double-click `dblclick`, or camera mode switch) recenter chase/spectate cleanly without interfering with Freecam flight controls or the 120Hz physics loop.
  - Removed the previous 2.2-second auto-snap timer in `isometric` mode so manual right-stick isometric framing also remains where placed.

---

## 2. Main Menu UI Finalization (Modern UI Kept, Toggle Removed)

- **`src/components/TitleOverlay.tsx`**
  - Removed the `"Modern Version"` toggle button (`btn-toggle-modern-menu`), `localStorage` toggle state (`apex_modern_menu_v2`), and the legacy Classic menu fallback branch.
  - Kept the transparent/translucent Modern UI exclusively:
    - Full-bleed 3D attract-mode track & cars remain visible behind the menu with no black background gradient and no dark dock bar at the bottom.
    - Top-left `ApexLogo` lockup and optional top-right active multiplayer room badge.
    - Translucent Paddock Control card (`Race & Practice`, `Host AI Race`, `Multiplayer`), Selected Car & Track preview cards, and dockless bottom Showcase/Studio buttons (`Cars Showcase`, `Tracks Showcase`, `Livery Studio`, `Sound Studio`, `Track Studio`).

---

## 3. AI Weights & Neural Policy Audit

### Shipped Weight File Verification (`src/game/aiPolicyWeights*.json`)
Verified all 5 primary policy files and their `.best.json` counterparts (`obsDim: 43`, `actDim: 3`, `version: 2`, zero `NaN`/`Infinity` entries, matching layer matrix dimensions):
- `aiPolicyWeights.json` (`base`): `hiddenDim: 64`, update 606 (~212 km/h)
- `aiPolicyWeights_v1.json` (`v1 Clean Apex`): `hiddenDim: 64`, update 1028 (~177 km/h)
- `aiPolicyWeights_v2.json` (`v2 Momentum`): `hiddenDim: 64`, update 515 (~166 km/h)
- `aiPolicyWeights_v3.json` (`v3 Aggressive Pace`): `hiddenDim: 128`, update 127 (~199 km/h)
- `aiPolicyWeights_v4.json` (`v4 Curriculum`): `hiddenDim: 64`, update 551 (~201 km/h)

### Hardening & Performance Improvements
- **`src/game/aiNeuralPolicy.ts`**
  - **Strict Matrix & Finiteness Validation**: Upgraded `validatePolicyWeights()` with `isFiniteNumberVector()` and `isFiniteNumberMatrix()` checks so jagged inner row lengths (`w0[i].length !== 43`, `w1[i].length !== hiddenDim`, `w2[i].length !== hiddenDim`) or non-finite (`NaN`/`Infinity`) weights/biases are rejected cleanly instead of corrupting inference.
  - **NaN-Safe Forward Inference**: Added finite checks on input observations (`obs`), biases, and intermediate sums in `evaluateNeuralPolicy()`. If any non-finite value is detected, inference safely returns `null` (falling back cleanly to the heuristic controller) rather than propagating `NaN` through `Math.max(-1, Math.min(1, NaN))`.
  - **Zero-Allocation Inference Scratch Buffers**: Replaced per-step `new Float32Array(hiddenDim)` / `new Float32Array(3)` allocations inside `evaluateNeuralPolicy()` with cached per-`hiddenDim` scratch buffers (`SCRATCH_BUFFERS`), eliminating typed-array GC churn across 120Hz multi-car AI grids.
  - **Checkpoint Metadata Exposure**: Exposed `meta` on `AiPolicyVariantInfo` for loaded policy variants.
- **`src/components/AiPolicyMixPanel.tsx`**
  - Guarded numeric percentage input parsing against `NaN` when clearing the number field (`Number.isFinite(rawVal)`).
  - Displayed each loaded variant's trained mean speed metadata (`~XXX km/h`) alongside its hidden-layer size (`64h` / `128h`).

---

## 4. Verification & Test Coverage

- **`src/game/rules.test.ts`**
  - Added tests covering all 5 shipped policy variants (`base`, `v1`–`v4`, including `64h` and `128h` architectures), blended neural evaluation, jagged/NaN weight rejection, NaN observation fallback, and elevated `DEFAULT_CHASE_CAMERA` frame geometry.
- Verified with `npx tsc --noEmit`, `npm test`, `compile_applet`, and `lint_applet`.
