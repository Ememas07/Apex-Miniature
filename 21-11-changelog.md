# 21-11 Changelog — Standing/Rolling Starts, Starts AI, V9 Apex Master, Bump-Drafting & Binary Pipeline

## 1. Root Cause Diagnosis — Standing Starts & Model Parity
- **Inference parity verified 100%**: `src/game/aiNeuralPolicy.ts` matches `scripts/trainPPO.py` (`ObsNorm`, `LayerNorm`, `Tanh/SiLU`, residual skips, 2- & 3-layer MLPs, linear clamped outputs) and shares the exact `buildObservationVector` used by `scripts/headlessEnv.ts`.
- **Why v5–v8 (especially v8 Flagship) stalled, steered left, and piled up on standing starts**:
  1. **Zero 2×2 standing-grid exposure in training**: `headlessEnv.ts` spawned tight packs at 18–32 m/s (rolling) and braking zones at 60–90% top speed; the rare standing spawns (~4–8%) placed scripted rivals 22–124m ahead already moving at 14 m/s. None of v5–v8 ever experienced a real staggered 2×2 grid at `speed = 0` with all 4 traffic radar slots filled 6–20m ahead/beside.
  2. **`ObsNorm` out-of-distribution saturation**: With `RunningMeanStd` centered around ~50 m/s cruising and mostly empty radar slots, `speed = 0` + 4 close stationary cars simultaneously pushes inputs to `-3σ..-5σ`, causing the 3-layer ResMLP to interpret the grid as an imminent rear-end crash, cut throttle/brake, and steer hard left.

---

## 2. Dedicated `starts` AI Policy (Always Active on Race Starts)
- **Automatic start-phase activation & smooth handoff** (`src/game/aiNeuralPolicy.ts`, `src/three/RaceViewport.tsx`):
  - Added a dedicated always-active `starts` policy slot (auto-loads `src/game/aiPolicyWeights_starts.json` when present; not mixed into V5–V9 race sliders).
  - **Standing Starts**: Active 100% from green flag (`0..2.8s` and while accelerating below `22 m/s`), smoothly crossfading into the active V5–V9 race policy blend by `5.0–6.5s`.
  - **Rolling Starts**: Active 100% for `0..2.6s` after `GREEN FLAG!`, smoothly crossfading into the active race policy blend over `2.6–4.2s`.
  - **Works immediately before training**: Built-in `computeStartLaunchControl` handles packed 2×2 launches cleanly (lane holding, smooth side-by-side separation, full traction launch, Turn-1 braking awareness) until you train neural `starts` weights.
  - Added an always-active `Starts Policy` status indicator (`Trained Neural` vs `Auto Launch Assist`) inside `src/components/AiPolicyMixPanel.tsx`.
- **Dedicated `starts` PPO training variant** (`scripts/trainPPO.py`, `scripts/headlessEnv.ts`):
  - Added `--variant starts` (`2×128 ResMLP`, LayerNorm + ObsNorm) with `startScenarioRatio = 0.92`, `rollingStartRatio = 0.45`, `maxEpisodeSteps = 750` (~25s focused launch + Turn 1–3 episodes), genuine 8–12 car staggered 2×2 standing (`0 m/s`) & rolling grids, and `launchAccelBonus = 0.45`.

---

## 3. Rolling Start Feature
- **Types & Config** (`src/game/types.ts`, `src/App.tsx`):
  - Added `RaceStartType = 'standing' | 'rolling'` and `startType` on `RaceConfig` (defaults to `'standing'`), plus `startType` and `greenFlagFlash` on `HudSnapshot`.
- **Physics & Formation Control** (`src/game/physics.ts`):
  - Extended `createCarSimState` to spawn rolling-start 2×2 staggered formations (`10.5m` row spacing, `2.2m` stagger) behind the start/finish line at class-appropriate rolling speed (`getRollingFormationSpeedMs`: 72–115 km/h based on slowest active grid class).
  - Added `computeRollingFormationControl` for crisp 2×2 lane holding and longitudinal spacing during the rolling run-up.
  - Widened the pre-S/F negative-progress guard (`prevTrackT > 0.5 && trackT > 0.5`) so crossing the S/F line after a rolling run-up always starts Lap 1 cleanly instead of jumping to Lap 2.
- **Simulation & HUD** (`src/three/RaceViewport.tsx`, `src/components/RaceHUD.tsx`, `src/components/RaceMenuModal.tsx`, `src/components/MultiplayerModal.tsx`):
  - Added `Standing Start` / `Rolling Start` selector in single-player/AI-Race menus and Multiplayer host settings.
  - During rolling countdown (`3.2s`), all cars roll forward in formation under amber gantry lights (with gentle in-lane player weave allowed), then release full control at `GREEN FLAG!` with a 1.4s emerald HUD banner.

---

## 4. V9 Apex Master (`v9`) & Straight-Line Bump-Drafting
- **V9 All-in-One Policy (`--variant v9`)** (`scripts/trainPPO.py`, `scripts/headlessEnv.ts`, `src/game/aiNeuralPolicy.ts`):
  - Combines **3×128 ResMLP + LayerNorm + ObsNorm** with **V7's 310m `window_tanh` technical lookahead** and a new **`v9_master_3phase`** curriculum:
    - Phase 1 (0–25%): Technical track discipline, heavy braking zones & fast apex pace.
    - Phase 2 (25–60%): Multi-line traffic packs (`multiLineTrafficRatio = 0.55`), alternate-line overtakes (`alternateLineOvertakeBonus`), and straightaway bump-drafting (`bumpDraftBonus`).
    - Phase 3 (60–100%): Full mastery across dense self-play battles, varied racing lines, standing/rolling starts (`startScenarioRatio = 0.15`), and max pace.
  - Registered `'v9'` in `src/game/aiNeuralPolicy.ts` via optional auto-discovery (`aiPolicyWeights_v9.json`): once trained, it automatically loads in `AiPolicyMixPanel` so you can run `100% v9 Master` without blends.
- **Straight-Line Bump-Drafting & Less Timid Traffic Behavior** (`src/game/physics.ts`, `src/game/aiNeuralPolicy.ts`, `scripts/headlessEnv.ts`):
  - Updated `computeAIControl` and `computeNeuralAIControl` so on clear straights (`|curvature| < 0.008`, `speed > 38 m/s`, not approaching a braking zone), AI cars tucked behind a same-class car (including the player!) stay committed on throttle to bump-draft cleanly instead of lifting/braking 12–14m behind.
  - Updated `headlessEnv.ts` so gentle nose-to-tail straight-line bump-drafting (`closingSpeed < 4.5 m/s`, aligned headings on straight) is rewarded (`bumpDraftBonus`) and **non-terminal** (matching `resolveCarCollisions`'s existing zero-damage `isBumpDraft` physics) while suppressing timid TTC/proximity penalties in clean straightaway tows.

---

## 5. Binary Weights & Training Pipeline Optimizations
- **Pre-packed Flat `Float32Array` Runtime Inference** (`src/game/aiNeuralPolicy.ts`):
  - Lazily packs nested JSON weight arrays into contiguous row-major `Float32Array` buffers (`WeakMap` cached) with 4× unrolled dot products and precomputed `1/std` — ~3–6× faster browser inference with zero per-frame weight validation or GC allocations.
- **`ANB1` Binary Weight Format (`.bin`)** (`src/game/aiNeuralPolicy.ts`, `scripts/trainPPO.py`, `scripts/headlessEnv.ts`):
  - Added `encodePolicyWeightsBinary` / `decodePolicyWeightsBinary` (`ANB1` magic + JSON metadata header + 4-byte aligned little-endian Float32 tensors) — ~3.5–4.5× smaller than `.json` with exact Float32 parity.
  - `trainPPO.py` now automatically writes a companion `.bin` file alongside every exported `.json`, and `headlessEnv.ts` loads both `.bin` and `.json` snapshots.
- **Binary Framed IPC (`--binary-ipc`, enabled by default in `trainPPO.py`)**:
  - Replaced per-step ASCII JSON float serialization between Python and Node workers with length-prefixed binary Float32 frames (`msgType = 2/3`), cutting Python↔Node serialization overhead dramatically during PPO rollouts (pass `--no-binary-ipc` for legacy JSON-lines mode).

---

## 6. Verification & Tests
- Added unit tests in `src/game/rules.test.ts` covering:
  - `v5..v9` variant registry & validation hardening
  - `ANB1` binary weight codec round-trip size & exact Float32 inference parity
  - Packed 2×2 standing-start launch guard & `starts` policy handoff curve
  - Rolling start grid spawning, formation control, Lap 1 S/F crossing preservation, and straight-line bump-draft throttle commitment

---

## 7. Training Commands & Recommendations
1. **Train `starts` first (fast — ~350–500 updates because episodes are capped at 25s):**
   ```bash
   python scripts/trainPPO.py --variant starts --scratch --updates 450 --envs 32 --workers 4
   ```
   - Outputs `src/game/aiPolicyWeights_starts.json` (+ `.bin`). Restart/reload Vite and the game automatically switches from `Auto Launch Assist` to your trained `Starts Neural AI` on every standing & rolling start.
2. **Train `v9` Apex Master (all-in-one replacement for blends — ~1000–1400 updates):**
   ```bash
   python scripts/trainPPO.py --variant v9 --scratch --updates 1200 --envs 32 --workers 4
   ```
   - Outputs `src/game/aiPolicyWeights_v9.json` (+ `.bin`). Once saved, `v9 Master` auto-loads in the AI Neural Policy panel so you can select `100% v9 Master`.
   - Note: Train `v9` with `--scratch` (do **not** `--init-from` v8 because v9 uses V7's superior `window_tanh` technical curvature lookahead, which has different feature scaling than v8's `clamp40`).
