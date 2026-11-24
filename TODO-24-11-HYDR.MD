# Apex Miniature — Pending Engineering Backlog (`TODO-24-11-HYDR.MD`)

> Grounded action plan of every **unimplemented or partially implemented** item from `game_improvements.md` verified against the codebase on `2026-11-24`.  
> **Global Guardrails:**
> - **No Pit Lanes Rule:** Physical pit lanes / pit speed limiters remain intentionally excluded (`requestOnTrackPitStop` stationary on-track service only).
> - **Physics & AI Guardrails:** Never alter calibrated defaults in `src/game/tuningConfig.json` or break `scripts/trainPPO.py` / `scripts/benchAndAudit.py` / `scripts/headlessEnv.ts`.
> - **AI Model Rule:** Strictly maintain `v1`, `v2`, and `starts` slots only (`ANB1` `.bin`).
> - **Changelog Rule:** Log user-facing batches in `CHANGELOG.md` and run `npx tsc --noEmit && npm test && npm run build` once per completed batch.

---

## Batch A — Race Control, Penalties & Flag Depth (Section 1.2)
- [ ] **Safety Car (SC) & Virtual Safety Car (VSC) Deployment + 3D SC Model**
  - **Files:** `src/game/types.ts`, `src/game/raceSystems.ts`, `src/three/carBuilder.ts`, `src/three/RaceViewport.tsx`, `src/components/RaceHUD.tsx`
  - **Scope:**
    - Add SC/VSC trigger logic in `stepRaceControl()` on multi-car pileups (`>= 2` heavy impacts or stopped cars within tight proximity/short window) when `isRace && totalLaps >= 3`.
    - VSC enforces delta/speed cap across all cars (`globalFlag = 'vsc'`, HUD banner + marshal yellow/VSC flash).
    - Full SC spawns a lightweight miniature Safety Car mesh (amber/green flashing roof lightbar) ahead of `leader` at controlled pace (`~115–135 km/h`), bunches the pack single-file (no overtaking except wave-bys / on-track service), and withdraws with green-flag restart.
    - Add unit tests in `src/game/rules.test.ts` verifying SC/VSC triggers, speed caps, and green-flag restart release.
- [ ] **Serveable Heavy Penalties (`drive-through` & `stop-and-go`)**
  - **Files:** `src/game/types.ts`, `src/game/raceSystems.ts`, `src/game/physics.ts`, `src/components/RaceHUD.tsx`
  - **Scope:**
    - Wire `'drive-through'` and `'stop-and-go'` (already typed on `PenaltyType` in `src/game/types.ts#L336`) for repeated severe corner cutting (`>= 3` major cuts) or avoidable heavy punting collisions.
    - Since the game has no pit lanes, implement serving cleanly via a dedicated HUD prompt + on-track penalty slowdown / stationary hold (`3.0s` hold off-line for stop-and-go; `4.0s` speed-capped 60 km/h zone/hold for drive-through) within 3 laps or auto-convert to post-race `+15s`/`+25s` / DSQ.

---

## Batch B — Trackside Atmosphere, Lighting, Shadows & High-Speed VFX (Section 5 & 6.1)
- [ ] **Dynamic Player-Centered `2048×2048` Sun Shadows**
  - **Files:** `src/three/RaceViewport.tsx`, `src/game/settings.ts`
  - **Scope:**
    - Upgrade `sun.shadow.mapSize` (`RaceViewport.tsx#L398`) dynamically based on `settings.shadowQuality` (`low: 512`, `medium: 1024`, `high: 2048` + `PCFSoftShadowMap`), tightening the directional shadow ortho frustum (`~85×85m`) tightly around the focus car every tick instead of rebuilding or using fixed `1024`.
- [ ] **Living Trackside Scenery & Interactive Props**
  - **Files:** `src/three/trackBuilder.ts`, `src/three/RaceViewport.tsx`
  - **Scope:**
    - Add instanced **timing towers** near Start/Finish, **grandstand animated crowd** shader/bobbing spectators on final lap, and rotating distant landmark accents (**helicopter / blimp / Ferris wheel** keyed by `SceneryTheme`: `stadium`, `street-night`, `coastal`, `forest`, etc.).
    - Add lightweight **knockable apex bollards** at chicane apexes (pooled rigid impulse + reset per lap).
- [ ] **High-Speed Motion Lines / Radial Blur & Hood Cam Raindrops**
  - **Files:** `src/three/postProcessing.ts`, `src/three/RaceViewport.tsx`
  - **Scope:**
    - Add radial speed-vignette / chromatic streak uniform in `RacePostProcessor` activated progressively above `260 km/h` (or in `inSlipstream`, toggleable via graphics/motion settings).
    - Add subtle screen-space raindrop beads on the Hood/Cockpit visor during heavy rain (`trackWetness > 0.35`).
- [ ] **Optional True 3D Virtual Rear-View Mirror Render Target**
  - **Files:** `src/three/RaceViewport.tsx`, `src/components/RaceHUD.tsx`, `src/game/settings.ts`
  - **Scope:**
    - Currently `showVirtualMirror` only shows a text gap/blind-spot pill (`RaceHUD.tsx#L247`). Add an optional secondary low-res `WebGLRenderTarget` (or split-viewport scissor pass at top-center, capped to `320×84` at `30Hz`) active in `hood`, `bumper`, and `cockpit` views when enabled on `high`/`ultra` graphics presets.

---

## Batch C — Audio Engine Precision Upgrade (Section 7)
- [ ] **3D `HRTF` Spatial Panner & `ConvolverNode` Tunnel Impulse Reverb**
  - **Files:** `src/three/audioEngine.ts`
  - **Scope:**
    - Upgrade rival proximity synth voices from stereo `StereoPannerNode` to true 3D `PannerNode` (`panningModel = 'HRTF'` when supported, listener synced to active camera position/forward/up) for sharper front/back and fly-by spatialization in Broadcast/Orbit cams.
    - Replace or supplement the `DelayNode` tunnel echo with a lightweight procedurally generated `ConvolverNode` impulse response for realistic concrete tunnel / street-canyon acoustics.

---

## Batch D — Hardware Wheel Support & Gamepad Menu Navigation (Section 9.2 & 12.2)
- [ ] **Steering Wheel Calibration Presets & Axis Mapping**
  - **Files:** `src/game/gamepad.ts`, `src/game/settings.ts`, `src/components/SettingsModal.tsx`
  - **Scope:**
    - Add named wheel calibration presets (*Logitech G29/G923*, *Thrustmaster T300*, *Fanatec Direct Drive*, *Generic Combined Pedals*) configuring steering lock curve, combined vs. split throttle/brake pedal axis detection, and inverse axis flags.
- [ ] **Full Gamepad UI Menu Navigation**
  - **Files:** `src/game/gamepad.ts`, `src/App.tsx`, `src/components/TitleOverlay.tsx`, `src/components/RaceMenuModal.tsx`, `src/components/PauseModal.tsx`, `src/components/ResultsModal.tsx`
  - **Scope:**
    - Add a clean global `useGamepadMenuNav` focus/D-pad navigator (`D-Pad Up/Down/Left/Right` moves focusable `[data-nav]` / buttons, `A/Cross` clicks focused item, `B/Circle` triggers `onClose`/back) active whenever `phase !== 'playing' && phase !== 'qualifying' || modalOpen`.
- [ ] **Async Loading Progress Overlay**
  - **Files:** `src/three/objCarLoader.ts`, `src/three/RaceViewport.tsx`, `src/App.tsx`
  - **Scope:**
    - Track `.obj`/`.mtl` + circuit compile progress and show a sleek track map + car class tip + real percentage progress bar when loading or switching circuits/large grids.

---

## Batch E — Multiplayer Competitive Hardening & Community Tools (Section 10.2 & 11.1)
- [ ] **Host Director Ban List, Championship Playlists & Mandatory Service Rule**
  - **Files:** `server.ts`, `src/game/types.ts`, `src/game/multiplayer.ts`, `src/components/MultiplayerModal.tsx`
  - **Scope:**
    - Expand `server.ts` room records with `bannedPeerIds` / session tokens so kicked griefers cannot immediately rejoin (`room:kick` already exists), add `mandatoryServiceStop` toggle on room `config`, add multi-track `playlist` rotation advancing automatically after results/votes, and enforce basic server-side lap-time minimum bounds (`elapsed < compiledTrackLen / 135 m/s`) before recording fastest lap / Elo updates.
- [ ] **Track Studio Per-Segment Prop Painting & Community Gallery Export/Browse**
  - **Files:** `src/game/customTracks.ts`, `src/components/TrackStudioModal.tsx`, `src/three/trackBuilder.ts`, `server.ts`
  - **Scope:**
    - Add per-waypoint/segment metadata (`surfaceLeft`, `surfaceRight`, `propType`: grandstands/trees/bridge/tunnel) editable directly on the Track Studio canvas and rendered by `trackBuilder.ts`.
    - Add an optional lightweight `GET/POST /api/tracks` community gallery endpoint in `server.ts` (JSON file / memory backed) + Browse/Upvote/Clone tab in `TrackStudioModal.tsx`.

---

## Batch F — Performance Pipeline, Architecture Decomposition & Testing (Section 13)
- [ ] **Convert Car Assets from `.obj`/`.mtl` to Compressed `.glb` (Draco/Meshopt) + LOD Tiers**
  - **Files:** `scripts/objToLowPoly.mjs` (or pipeline extension), `src/three/objCarLoader.ts`, `public/models/lowpoly-cars/`, `vite.config.ts`
  - **Scope:**
    - Export/pack `public/models/lowpoly-cars/*/*.glb` with Meshopt/Draco compression while retaining `.obj` fallback during transition.
    - Add `THREE.LOD` meshes (`0–35m` full detail, `35–110m` simplified chassis, `>110m` low-poly proxy) + `renderer.compileAsync` shader pre-warming on session boot.
- [ ] **Lazy-Load Track Geometry / Elevation Data**
  - **Files:** `src/game/tracks.ts`, `src/game/trackSvgs.ts`, `src/game/trackElevations.ts`
  - **Scope:**
    - Keep lightweight track metadata (id, name, country, lengthKm, preview curve) in the initial bundle while dynamically splitting/fetching heavy 300-point elevation/waypoint arrays when selecting or compiling a circuit.
- [ ] **Decompose Monolithic Files cleanly (Pure Refactor, Zero Behavior Drift)**
  - **Files & Current Line Counts:**
    - `src/three/carBuilder.ts` (`3,642` lines) $\to$ split into `carMaterials.ts`, `carGeometryHelpers.ts`, `carSilhouetteBuilders.ts`, and slim `carBuilder.ts` entry.
    - `src/game/physics.ts` (`3,785` lines) $\to$ split into `physicsTires.ts`, `physicsAero.ts`, `physicsCollisions.ts`, `physicsStandings.ts`, and slim `physics.ts` barrel/step orchestrator.
    - `src/three/RaceViewport.tsx` (`4,075` lines) $\to$ extract `RaceSimulationEngine.ts` (headless simulation loop & inputs) and `RaceSceneRenderer.ts` (lights/shadows/camera/rigs) leaving `<RaceViewport />` as a thin React mount/lifecycle wrapper.
- [ ] **Web Worker Simulation Option**
  - **Files:** `src/game/simWorker.ts`, `src/three/RaceViewport.tsx`
  - **Scope:**
    - Optional toggle in Settings (`Performance`) running `stepCarPhysics` + `computeNeuralAIControl` in a dedicated Web Worker sending transferable `Float32Array` transforms at 60–120Hz to the Three.js render loop.
- [ ] **Expanded Automated Testing (43×10 Soak Test & Playwright E2E)**
  - **Files:** `src/game/rules.test.ts` (or `npm run test:soak` / `tests/e2e.spec.ts`)
  - **Scope:**
    - Headless soak test stepping representative cars across all 43 circuits × 10 classes for 30s simulated time verifying zero `NaN` states, zero track fall-throughs, and BoP parity.
    - Headless browser (Playwright) smoke suite booting title screen, verifying WebGL canvas non-empty, opening Garage/Track Studio/Multiplayer, and starting a race.

---

## Batch G — Finale Milestone: Bespoke Custom 3D Car Models (Section 15)
- [ ] **Hand-Made (AI-Made) Custom 3D Car Models Across Flagship Classes**
  - **Files:** `src/three/carBuilder.ts`, `public/models/lowpoly-cars/`, `src/game/cars.ts`
  - **Scope:**
    - Scheduled **last** after Batches A–F are complete. Craft bespoke, crisp procedural/AI-authored 3D car meshes for flagship classes (`F1_2026`, `F1_2021`, `HYPERCAR_GTP`, `LMP2`, `GT3`, `GT4`, `FORMULA_E`, `SUPERCAR`) with accurate aero, halos/windscreens, wheel arches, and clean UV atlas seams within tight triangle budgets.
