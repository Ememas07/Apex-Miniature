# Apex Miniature — Exhaustive Game Improvement Roadmap

> A comprehensive, codebase-grounded catalog of gameplay, physics, AI/ML, visual, audio, HUD/UX, camera, studio, multiplayer, progression, accessibility, performance, and architectural improvements for **Apex Miniature**.

---

## Table of Contents

1. [Core Gameplay, Race Rules & Motorsport Systems](#1-core-gameplay-race-rules--motorsport-systems)
2. [Driving Physics, Car Setup & Handling Realism](#2-driving-physics-car-setup--handling-realism)
3. [Game Modes, Replayability & Progression](#3-game-modes-replayability--progression)
4. [AI Drivers, Neural Policy Pipeline & Racecraft](#4-ai-drivers-neural-policy-pipeline--racecraft)
5. [Graphics, Visual Polish, VFX & Track Atmosphere](#5-graphics-visual-polish-vfx--track-atmosphere)
6. [Camera System, Replay Suite & Photo Mode](#6-camera-system-replay-suite--photo-mode)
7. [Audio Engine, Spatial Soundscape & Race Radio](#7-audio-engine-spatial-soundscape--race-radio)
8. [HUD, Telemetry, Track Awareness & Race Feedback](#8-hud-telemetry-track-awareness--race-feedback)
9. [Controls, Driving Assists, Input & Settings](#9-controls-driving-assists-input--settings)
10. [Multiplayer, Netcode & Competitive Online Play](#10-multiplayer-netcode--competitive-online-play)
11. [Creative Studios (Track, Livery & Sound)](#11-creative-studios-track-livery--sound)
12. [UI/UX, Onboarding & Quality of Life](#12-uiux-onboarding--quality-of-life)
13. [Performance, Asset Pipeline & Codebase Architecture](#13-performance-asset-pipeline--codebase-architecture)
14. [Prioritized Implementation Matrix (Quick Wins vs. Flagship Milestones)](#14-prioritized-implementation-matrix-quick-wins-vs-flagship-milestones)

---

## 1. Core Gameplay, Race Rules & Motorsport Systems

### 1.1 Physical Pit Lanes & Full Pit-Stop Experience
- **Dedicated Pit Lane Geometry & Pit Entry/Exit Triggers:** Currently pit stops are triggered via on-track stop (`requestOnTrackPitStop` in `src/game/physics.ts`). Add physical pit-lane splines (using `TrackSpec.pitSide`), pit entry/exit blend lines, pit boxes, and pit wall barriers in `trackBuilder.ts`.
- **Pit Speed Limiter & Speeding Penalties:** Enforce a 60–80 km/h pit lane limit with an optional manual limiter toggle (`L` / gamepad button) or automatic assist; speeding triggers a time penalty or drive-through.
- **Aero & Mechanical Damage Repairs:** Add `'repair'` to `PitServiceAction` (currently only `'tyres' | 'fuel'`) so players can choose whether to spend extra seconds fixing `aeroDamage` or leave it to protect track position.
- **Pre-Pit Strategy Presets & Multi-Stop Planner:** Allow queueing compound + target fuel load + damage repair *before* entering the pit lane via an in-race MFD (Multi-Function Display) so drivers don't have to stop first to pick options.
- **Animated Pit Crew & Interactive Pit Minigame (Optional Arcade Mode):** Render pit crew silhouettes/jacks/wheel guns in the box; optionally add a timing-based release/jack prompt to shave 0.3–0.6s off pit time.
- **Unsafe Release & Pit Traffic Avoidance:** Ghost cars slightly in pit stalls or enforce safe-release hold when another car is passing in the fast lane.

### 1.2 Authentic Flag Rules, Race Control & Penalties ✅
- [x] **Full Flag System (Yellow, Local Yellow, Blue, Green, Black, White, Checkered):**
  - [x] **Local Yellow Flags:** Trigger when a car spins, stops, or crashes in a sector; penalize overtaking under yellow.
  - [x] **Blue Flags (Crucial for Multi-Class Racing!):** Alert GT3/GT4/LMP2 cars when faster Hypercars/F1 cars are lapping them, and make slower AI classes yield off the racing line cleanly.
  - [x] **White Flag (Final Lap)** & **Black-and-White Flag** (unsportsmanlike driving warning before time penalty).
- [x] **Safety Car (SC) & Virtual Safety Car (VSC):**
  - [x] Trigger SC/VSC on severe multi-car pileups or stopped cars, bunching the pack for dramatic restarts and opening strategic "cheap pit stop" windows.
  - [x] Include a miniature safety car model with flashing amber/green roof lightbar.
- [x] **Stewarding & Penalty Variety:**
  - [x] Differentiate track-limit corner cutting (`warningCount` → slow-down or +3s/+5s post-race penalty) from car-to-car avoidable contact penalties.
  - [x] Add **Drive-Through** and **Stop-and-Go** penalty options for serious infractions, plus a clear visual "Slow Down to Serve Penalty" zone indicator.
- [x] **Jump-Start Detection on Standing Starts:** Allow players to rev the engine during the 5-red-light sequence and launch manually on lights out; launching early triggers a false-start penalty, while nailing the RPM sweet spot grants a launch traction boost.

### 1.3 Deeper Class-Specific Mechanics ✅
- [x] **DRS Zones (Track-Defined Detection & Activation Lines):** For F1 eras (`F1_2026`, `F1_2021`) and `active-aero`, define genuine DRS detection/activation zones per circuit (<1.0s gap to car ahead) in addition to or replacing generic boost cooldowns.
- [x] **Energy Deployment Modes (ERS / Hybrid / Formula E):** Let players cycle battery modes (`Quali / Overtake / Balanced / Harvest`) in-race via hotkeys or MFD instead of a single binary boost button.
- [x] **Attack Mode Activation Zone (Formula E):** Render an illuminated off-line Attack Mode loop on track that cars must drive through to arm `attackModeTimer`, mirroring real Formula E strategy.
- [x] **Push-to-Pass Counter:** For prototype/open-wheel classes, show remaining push-to-pass seconds/uses clearly and display a visual LED/light cue on rivals when they deploy boost.

### 1.4 Dynamic Weather & Track Evolution ✅
- [x] **Richer Weather States Beyond `dry` / `dynamic-rain`:** Add `overcast`, `light-drizzle`, `heavy-storm`, `drying-track`, and customizable **Weather Forecast Timeline** (e.g., dry start → mid-race shower → dry finish) instead of a deterministic sine wave (`Math.sin(sim.rainTimer * 0.08)` in `RaceViewport.tsx`).
- [x] **Drying Racing Line & Standing Water Puddles:** Simulate faster drying along the rubbered-in racing line while off-line stays wet (rewarding wet-weather off-line karting lines vs. dry-line risk on slicks).
- [x] **Track Rubbering / Grip Evolution:** Gradually increase asphalt grip across laps in Practice, Qualifying, and Race sessions; wash away rubber when heavy rain hits.
- [x] **Ambient & Track Temperature Simulation:** Tie track temp to time-of-day and cloud cover, directly impacting `tireTemp` warm-up, graining, and overheating.

---

## 2. Driving Physics, Car Setup & Handling Realism ✅

### 2.1 Tire, Suspension & Chassis Dynamics ✅
- [x] **Per-Corner Tire Modeling (FL / FR / RL / RR):** Upgrade single scalar `tireWear` & `tireTemp` (`CarSimState`) into 4 individual wheels so front-left graining on clockwise tracks, rear-tire spin overheating, and lock-up flat spots feel tangible and strategic.
- [x] **Brake Temperature & Fade / Lock-Up Physics:** Model brake disc temperature (cold brakes = poor bite; overheated brakes = fade) and wheel lock-up under heavy braking without ABS, with visual lock-up smoke and flat-spot vibration.
- [x] **Weight Transfer & Pitch/Roll Coupling:** Link longitudinal acceleration/braking and lateral G-forces directly to front/rear grip bias (trail-braking rotates the nose into apexes; abrupt lift-off induces manageable oversteer).
- [x] **Dirty Air / Turbulent Wake:** Alongside positive straight-line `slipstreamStrength`, add realistic high-speed cornering front-downforce loss when following high-downforce cars (`F1_*`, `HYPERCAR_GTP`) closely through fast sweepers.
- [x] **Surface-Specific Physics Beyond Asphalt & Kerb:** Differentiate grass, gravel traps (progressive deceleration + sinking), painted sausage kerbs (chassis upset/hop), wet astroturf (ice-like grip), and concrete runoff.
- [x] **Elevation & Crest Unloading:** Use the existing `computeRoadSurfaceTilt` / `trackElevations.ts` slope derivatives to reduce vertical load over crests (e.g., Eau Rouge/Raidillon, Laguna Seca Corkscrew) and increase compression grip in dips.

### 2.2 Garage Car Setup & Tuning Workbench ✅
- [x] **Per-Track Car Setup Editor:** Let players tune a concise, approachable set of sim-cade parameters (with presets like *Low Downforce / Monza*, *Balanced*, *High Downforce / Monaco*, *Wet*):
  - [x] Front & Rear Aero Wing Angle (top speed vs. cornering grip tradeoff)
  - [x] Brake Balance (Front/Rear % — adjustable live in-race!)
  - [x] Gear Ratio Final Drive (Short/Acceleration vs. Tall/Top Speed)
  - [x] Suspension Stiffness / Anti-Roll Bar Balance (Understeer vs. Oversteer)
  - [x] Differential Locking (Entry stability vs. Exit traction)
  - [x] Starting Fuel Load & Tire Pressures
- [x] **Save / Share Setup Codes:** Export/import car setups per `(carId, trackId)` just like Track Studio's `APXTRK:` share codes.
- [x] **Live BoP Inspector & Custom BoP Sandboxes:** Expose `bopConfig.json` overrides in a dedicated Race Director / Custom League drawer so players can adjust class parity or create custom BoP series.

### 2.3 Mechanical & Visual Damage System ✅
- [x] **Localized Damage Zones:** Split `aeroDamage` into Front Wing/Splitter (understeer), Rear Wing (top-speed instability), Engine/Cooling (reduced power/overheating), and Suspension (steering pull/alignment offset).
- [x] **Configurable Damage Realism:** Offer `Off / Visual Only / Light (Sim-Cade) / Realistic (Simulation)` in Race Setup.
- [x] **Visual Damage & Debris:** Detachable endplates/spoilers, scuffed/dented paint overlays, headlight flicker/breakage in night races, and temporary carbon debris particles on heavy impacts.

---

## 3. Game Modes, Replayability & Progression

### 3.1 Single-Player Career & Championships
- **Championship / Season Mode:**
  - Multi-round calendars (e.g., *WEC Endurance Cup*, *IMSA WeatherTech Series*, *F1 World Championship*, *GT3 Sprint Cup*, *Formula E Street Tour*, or Custom Season Builder).
  - Real motorsport points tables (25-18-15-12-10-8-6-4-2-1 + Fastest Lap bonus + Pole Position point), Drivers' & Constructors'/Teams' standings, and persistent multi-round save state.
- **Custom Weekend Format:** Full race weekend flow: `Free Practice → Knockout Qualifying (Q1/Q2/Q3 or Superpole) → Sprint Race → Feature Race`.
- **Timed Endurance Races:** Add time-based race durations (`15m`, `30m`, `60m`, `2.4h` accelerated 24-hour day/night cycle) in addition to fixed `totalLaps` (currently capped at 1–20 laps).
- **Career Mode / Miniature Collector Progression (Optional Toggle):**
  - Earn credits/reputation from clean racing, overtakes, podiums, and fastest laps.
  - Unlock die-cast display shelves, rare heritage liveries, special helmets/banners, and championship invitations (keeping Sandbox/Free Play 100% unlocked for players who want immediate access).

### 3.2 Time Trial, Ghost Racing & Hotlap Leaderboards
- **Ghost Car System:** Record and replay the player's own Personal Best lap as a translucent/wireframe 3D ghost car on track, plus optional **Class Target Ghosts** (Bronze / Silver / Gold / Alien medal times) for every circuit!
- **Persistent Personal Records Matrix:** Save best lap times, best sector times, top speed, and compound used per `(trackId, carId)` and `(trackId, classId)` in `localStorage` (and optional backend/cloud leaderboard).
- **Live Delta-to-Best Bar:** Real-time ±0.000s split bar (green = gaining, red = losing) interpolated along `trackT` against session best or personal best ghost.
- **Daily / Weekly Hotlap Challenges:** Deterministic daily `(car, track, weather)` combo seeded by date with Bronze/Silver/Gold target times and shareable result cards.

### 3.3 Arcade, Scenario & Training Modes
- **Race Scenarios / Driving Challenges:** Bite-sized scripted scenarios — e.g., *"Last-to-First in 3 Laps at Spa"*, *"Survive Sudden Downpour on Slicks"*, *"Multiclass Traffic Gauntlet at Le Mans Night"*, *"Fuel-Save Finish on 2% Fuel"*.
- **License Tests / Driving School:** Short sector mastery drills (trail braking, chicane kerbs, wet-line control, slipstream timing, standing-start launch) teaching Apex Miniature's physics to new players.
- **Elimination / Knockout Mode:** Every lap (or every 30s), the last-place car is eliminated until one winner remains.
- **AI Director / Fantasy Manager Mode (Expanding `ai-race`):** Build on the existing `Host AI Race` spectator mode by letting players act as **Race Engineer** — calling pit stops, tire compounds, fuel targets, push/conserve pace orders, and ERS deployment for a chosen AI driver or 2-car team!

---

## 4. AI Drivers, Neural Policy Pipeline & Racecraft

### 4.1 In-Race AI Intelligence & Racecraft
- **Smarter Multi-Class Traffic Etiquette:** Teach neural + heuristic policies explicit class-differential behavior: faster prototypes project decisive dive/outside passes without braking behind GT3 cars on straights, while GT3/GT4 cars hold predictable lines and yield under blue flags.
- **Authentic AI Pit Strategy & Weather Reactivity:** Currently AI compound choices are largely fixed at spawn (`compound: ... aiCursor % 3 === 0 ? 'wet' : 'medium'` in `RaceViewport.tsx`). Give AI full race-strategy logic:
  - Pit when `tireWear` crosses cliff thresholds or fuel drops below 1.2 laps.
  - React dynamically to `trackWetness` crossovers (pitting for `wet` tyres when rain intensifies, switching back to `soft`/`medium` as track dries).
  - Execute undercut/overcut strategies based on traffic gaps and personality (`Tire-Saver` vs. `Late-Braker`).
- **Driver Roster & Persistent AI Personalities:** Give AI drivers memorable names, nationalities, team pairings (2 cars per team sharing coordinated liveries), skill/aggression/consistency/wet-skill ratings, and championship rivalries.
- **Human-Like Mistakes & Realism:** Occasional realistic brake lock-ups, slight apex misses under heavy defensive pressure, or grass dips — making battles feel alive rather than robotic, scaled by `AIDifficulty`.
- **Defensive Racecraft (One-Move Rule):** Allow defending AI cars to cover the inside line approaching heavy braking zones when a rival is within ~18m behind, then open up cleanly on corner exit.
- **Stuck / Crash Recovery Polish:** Ensure spun or wall-wedged AI cars execute clean 3-point reverse recoveries or ghost temporarily if blocked for >3s so they never cause permanent chicanes.

### 4.2 Neural Policy Pipeline & Tooling (`aiNeuralPolicy.ts` / `trainPPO.py`)
- **Complete `starts` & `v9` Training & Ship Binary `.bin` Weights:** Migrate runtime browser loading from verbose JSON policy files to compact `ANB1` `.bin` payloads (already implemented in `encodePolicyWeightsBinary`/`decodePolicyWeightsBinary`) to slash bundle/load size by ~4×.
- **Archive/Prune Legacy Weight Snapshots from `src/game/`:** There are currently ~20 `aiPolicyWeights*.json` files (`v1`–`v8`, `.best`, `.ppo`, `.pytorch`, `.safe_backup`) inside `src/game/`. Move unused training checkpoints to a `models/archive/` folder outside Vite's build tree and dynamically lazy-load active policy binaries on demand.
- **In-Game AI Telemetry & Neural Visualizer (Debug/Pro Mode):** Add an optional overlay in AI Race / Practice showing a selected AI car's radar slots, lookahead curvature points, policy throttle/brake/steer output bars, and active `starts`→`v9` crossfade weight.
- **Per-Personality Policy Blending:** Map each `AIPersonality` (`Late-Braker`, `Metronome`, `Tire-Saver`, `Traffic-Smart`) to distinct neural policy blend weights + aggression/braking offsets rather than purely heuristic modifiers.
- **Behavioral Cloning Loop from `telemetryRecorder.ts`:** Add a one-click UI workflow in Practice/Results to review recorded clean laps (`HumanTelemetryRecorder`), filter out off-track laps, and export directly into a `datasets/` bundle ready for `trainPPO.py` warm-starting.

---

## 5. Graphics, Visual Polish, VFX & Track Atmosphere

### 5.1 Die-Cast Miniature Identity & Visual Signatures
- **Tilt-Shift Miniature Depth-of-Field Mode (Optional Toggle):** Reinforce the *"Apex Miniature"* brand with an optional subtle tilt-shift blur shader (top & bottom frame bokeh) that makes cars and circuits look like hyper-detailed 1:43 scale die-cast models on a tabletop diorama!
- **Die-Cast Paint Materials & Clearcoat PBR:** Upgrade car body materials in `carBuilder.ts` / `objCarLoader.ts` with `MeshPhysicalMaterial` (`clearcoat: 1.0`, `clearcoatRoughness`, metallic flake normal map, matte/satin/chrome/iridescent finish options).
- **Dynamic Garage Diorama & Display Turntable:** Enhance `GarageViewport.tsx` with selectable display environments (Collector Display Case, Pit Garage, Sunset Grid, Wind Tunnel with airflow streamlines).

### 5.2 Dynamic Lighting, Time-of-Day & Weather Atmosphere
- **Full Time-of-Day & 24-Hour Endurance Cycle:** Support `Dawn`, `Midday`, `Golden Hour`, `Dusk`, `Night`, and `Dynamic 24h Cycle` (configurable time-acceleration: 1×, 10×, 30×, 60×) with smoothly interpolating sun elevation, sky dome/gradient, fog color, and shadow angles.
- **Real Headlight Cones & Track Floodlights at Night:** Add real projected light cones/decals (or lightweight spotlights + volumetric glow cones) from cars' `headlightTint` (`crystal-white`, `endurance-yellow`, `ice-blue`), glowing brake light reflections on wet asphalt, illuminated apex distance boards, and stadium floodlight towers.
- **Wet Track Reflections & Specular Puddles:** Dynamically modulate asphalt roughness/envMapIntensity with `trackWetness`, plus screen-space or planar puddle sheen so wet races look dramatically different from dry races.
- **Upgraded Weather Visuals:** Replace the 120 simple `BoxGeometry` rain drops (`RaceViewport.tsx:284`) with velocity-streaked rain ribbons, camera-lens raindrop droplets in Hood Cam, volumetric mist/fog density scaling, and occasional distant lightning flashes during storms.

### 5.3 Racing VFX & Micro-Details (Massive Immersion Boost!)
- **Persistent Tire Skidmarks & Rubber Ribbons:** Render pooled instanced/ribbon skidmark decals onto the track surface under heavy braking lock-ups, high `lateralSlip`, and off-track grass/gravel excursions.
- **Tire Smoke, Gravel Dust & Wet Rooster-Tail Spray:**
  - White/grey tire smoke clouds during lock-ups, standing-start wheelspin, and heavy drifts.
  - Dense translucent water spray rooster-tails behind every car when `trackWetness > 0.25` (reducing visibility behind packs just like real motorsport!).
  - Dirt/gravel/grass kick-up particles when wheels drop off-track.
- **Exhaust Backfire Flames & Titanium Floor Sparks:**
  - Brief blue/orange exhaust pops on aggressive downshifts, rev-limiter bounces, and lift-off crackles (synced directly with `audioEngine.ts` crackle/pop events!).
  - Bright orange spark showers under F1/Hypercar floors over heavy bumps, Eau Rouge compressions, and kerb strikes.
- **Glowing Carbon Brake Discs:** Emissive orange-red glow inside wheel hubs proportional to braking energy and speed, especially dramatic at night and twilight.
- **Animated Car Sub-Parts:**
  - Visible steering front wheels, speed-synced rotating rims/brake calipers, working DRS/active-aero rear wing flaps opening when `specialActive` is true, glowing rain-light LEDs pulsing on the rear diffuser in wet/ERS harvesting conditions.
  - Suspension heave/pitch/roll visibly articulated between chassis and wheel hubs.
- **High-Speed Visual Feedback:** Subtle speed-lines/radial motion blur or FOV stretch at >280 km/h, slipstream wind-ribbon streaks when `inSlipstream` is true, and gentle camera micro-shake over kerbs, high speeds, and collisions.

### 5.4 Post-Processing & Shadow Quality
- **Selective Post-Processing Pipeline (Configurable in Settings):** Add an optional `EffectComposer` pass with lightweight **UnrealBloom** (for brake lights, exhaust flames, sparks, headlights, and gantry lights), **ACES Filmic Tone Mapping**, **FXAA/SMAA**, and subtle vignette.
- **Cascaded or Player-Centered High-Res Shadows:** Currently `sun.shadow.mapSize` is fixed at `1024×1024` over a wide `380×380m` frustum (`RaceViewport.tsx:257–263`), causing blocky car shadows. Tightly center a 2048×2048 shadow frustum around the focus car (with soft `PCFSoftShadowMap`) and add baked/blob contact ambient-occlusion shadows directly under every car chassis so cars look grounded even on Low graphics.

### 5.5 Circuit Scenery & Living Trackside World
- **Trackside Race Furniture:** Add 150m / 100m / 50m corner braking marker boards (huge gameplay aid!), marshal posts waving colored flags, apex bollards (knockable physics props!), tire barrier stacks, catch fencing, gantry starting lights that physically count down 5 red LEDs → lights out, and working trackside timing towers.
- **Animated Environment Elements:** Fluttering trackside flags/banners (reacting to wind), rotating Ferris wheels/helicopters/blimps on flagship circuits, animated crowd stands that cheer on the final lap, and distinct biome props per `SceneryTheme` (`stadium`, `forest`, `desert`, `street-night`, `coastal`, `parkland`).
- **Elevation-Aware Terrain Skirt & Horizons:** Improve surrounding terrain/horizon backdrops (mountains for Spa/Red Bull Ring, ocean/harbor for Monaco/Miami, skyline silhouettes for night street circuits) so tracks never feel like floating ribbons in fog.

---

## 6. Camera System, Replay Suite & Photo Mode

### 6.1 Expanded Camera Views
Currently `CameraMode` supports `'orbit' | 'hood'` (plus `spectate` / `freecam` in AI Race). Add:
- **Bumper Cam** (ultra-low, high speed sensation, unobstructed track view)
- **Cockpit / Halo T-Cam** (authentic F1 broadcast T-Cam offset + Prototype/GT interior dash frame with working steering wheel & shift LEDs)
- **Far Chase & Near Chase** (distinct FOV and spring-damping presets)
- **Top-Down / Isometric Micro-Machines Cam** (classic arcade miniature camera!)
- **Dynamic TV Broadcast Trackside Cameras:** Auto-switching trackside pan/zoom cameras placed along apexes, chicanes, and straights — incredible for `Host AI Race`, Attract Mode, and Replays!
- **Look-Back / Look-Left / Look-Right Quick Glance:** Dedicated instant rear-view button (`B` / right-stick click / R3) and left/right glance in addition to smooth stick look.
- **Virtual Rear-View Mirror (for Hood / Bumper / Cockpit Cams):** Optional toggleable top-center rear-view mirror (secondary low-res render target or lightweight proximity radar).

### 6.2 Instant Replay & Full Race Replay System
- **Ring-Buffer Race Recorder:** Capture compressed car transform + wheel/steer/brake/special snapshots at 20–30Hz for the entire race (minimal memory footprint — ~2–4 MB for a 20-car, 10-minute race).
- **Post-Race & Pause Replay Viewer:** Scrubbable timeline, play/pause, slow-motion (`0.1×`, `0.25×`, `0.5×`, `1×`, `2×`, `4×`), switch focus to any car on the grid, and cycle between TV Broadcast, Chase, Hood, Onboard, and Freecam.
- **Highlight Reel Auto-Detector:** Automatically bookmark overtakes, fastest laps, closest finishes, and big incidents on the replay timeline.
- **Flashback / Rewind (Optional Single-Player Assist):** Allow rewinding 5–10 seconds in Practice or Casual Single-Player races to retry a tricky corner or avoid an unlucky lap-1 crash.

### 6.3 Dedicated Photo Mode
- **Pause-to-Photo Mode (`F9` or Pause Menu button):** Freeze the 3D scene while unlocking free orbital/dolly camera movement with:
  - Focal Length / FOV, Roll/Dutch Angle, Aperture / Depth-of-Field (including miniature tilt-shift!), Shutter Speed (wheel/background motion blur), Exposure, Contrast, Saturation, and Color Grading Filters (*Broadcast*, *Kodachrome Vintage*, *Night Neon*, *B&W Motorsport*).
  - Optional Apex Miniature watermark toggle and one-click high-res PNG capture.

---

## 7. Audio Engine, Spatial Soundscape & Race Radio

### 7.1 Multi-Car 3D Spatial Audio
- **Proximity Rival Engine Audio:** Currently `MotorsportAudioEngine` synthesizes only the single focus car (`RaceViewport.tsx:1504,1717`). Add a lightweight 3–5 voice pooled spatial synth (using Web Audio `PannerNode` with `HRTF` or equal-power stereo panning + Doppler pitch shift) for the nearest surrounding cars — hearing a V10 F1 or Cadillac V8 Hypercar scream past your right ear in multi-class traffic will transform immersion!
- **Trackside Fly-By Doppler Effects:** When watching in TV Broadcast cam, Freecam, or AI Race spectator mode, apply authentic distance attenuation, low-pass air absorption, and Doppler shift as the pack blasts past.

### 7.2 Environmental, Mechanical & Collision Foley
- **Surface & Impact Audio Layer:**
  - Distinct audio for gravel traps (crunching stones), grass (soft rustle), painted kerbs (rhythmic thump scaled by speed), chassis scrapes, carbon-fiber crunch vs. tire-barrier thud, and aerodynamic wind roar at >250 km/h.
  - Wet-weather rain hiss on chassis + tire water-spray sizzle when `trackWetness > 0.2`.
  - Pit lane ambient sound: air-wrench wheel gun bursts, pit-limiter stutter bounce, engine idle reverb inside pit boxes.
- **Camera-Aware Acoustic Filtering:** Slightly muffle high frequencies and boost transmission whine + cabin resonance in Hood/Cockpit views vs. raw open exhaust bark in Chase/Broadcast views.
- **Trackside Reverb / Tunnel Acoustics:** Add a lightweight `ConvolverNode` impulse response boost when passing through tunnels (e.g., Monaco tunnel), under bridges, or between tight street-circuit walls!

### 7.3 Race Engineer / Spotter & Audio Mixing
- **Dynamic Race Engineer & Spotter Callouts (Web Speech / Synthesized Radio Clips with Radio Bandpass Filter):**
  - Spotter cues: *"Car right"*, *"Three wide"*, *"Clear left"*, *"Faster class approaching"*.
  - Strategy cues: *"Rain expected in 2 laps"*, *"Box this lap for wets"*, *"Best sector 2!"*, *"Final lap, push now!"*, *"Fuel critical — lift and coast"*.
  - Toggleable verbosity (`Off / Spotter Only / Full Engineer`) and text subtitle ticker for muted/accessibility play.
- **Granular Audio Mixer in Settings:** Split the single `apex_audio_volume` slider into independent sliders: `Master`, `Player Engine`, `Opponents`, `Tires & Surfaces`, `Effects & Collisions`, `Race Engineer`, and `UI / Menu Music`.
- **Optional Dynamic Menu & Pre-Grid Music:** Subtle, toggleable motorsport synth/electronic paddock soundtrack that fades smoothly on green flag.

---

## 8. HUD, Telemetry, Track Awareness & Race Feedback

### 8.1 Situational Awareness & Wheel-to-Wheel Aids
- **Proximity Car Radar (iRacing / ACC Style):** Compact circular/oval radar near bottom-center that fades in automatically whenever another car is within ~12m, showing exact relative lateral/longitudinal bounding boxes and class colors — essential for clean racing in Hood Cam!
- **Directional Blind-Spot Arrows:** Subtle left/right/rear edge chevrons that turn amber (approaching) and red (alongside).
- **Dynamic Racing Line & Braking Zone Guide (Toggleable Assist):** Project a 3D spline ribbon onto the track surface colored Green (throttle) → Yellow (lift/coast) → Red (brake), dynamically adapting to car speed, class braking power, and `trackWetness`.
- **Upcoming Corner Callout Badge:** Minimalist corner direction + severity icon (`Left 3`, `Hairpin Right`, `Chicane`) plus distance-to-braking cue for unfamiliar circuits (with 43 tracks, this dramatically lowers the learning curve!).

### 8.2 Broadcast-Grade Telemetry & Strategy Displays
- **Live Sector Timing & Purple/Green/Yellow Delta Indicators:** `HudSnapshot` already tracks `sectorTimes`, `bestSectorTimes`, and `lastLapSectorTimes` — surface them cleanly with official motorsport color coding (Purple = Overall Session Best, Green = Personal Best, Yellow = Slower) plus a live continuous lap delta bar.
- **Multi-Class Relative Timing Box:** Add a toggleable iRacing-style **Relative Leaderboard** (showing the 3 cars directly ahead and 3 cars directly behind on *track position* in seconds, color-coded for same lap / lapped / lapping you) alongside the overall standings tower.
- **In-Race Multi-Function Display (MFD):** Compact switchable corner widget (cycled with `Tab` / D-Pad) with pages for:
  1. **Pit Strategy** (pre-select next compound, fuel target, damage repair)
  2. **Tire & Brake Temps** (4-wheel visual diagram + wear %)
  3. **Weather Radar & Forecast** (upcoming rain intensity graph)
  4. **Car Adjustments** (live Brake Bias, ERS/Boost mode, TC level)
- **Live Input Telemetry Graph (Pedal Trace):** Optional tiny scrolling throttle (green) / brake (red) / steering trace widget — beloved by sim racers for improving trail-braking and throttle modulation.
- **Expanded Post-Race Analytics (`ResultsModal.tsx`):**
  - Lap-by-lap position chart (race progression spaghetti graph)
  - Lap time consistency chart & sector breakdown (Theoretical Best Lap = Best S1 + Best S2 + Best S3)
  - Race stats: overtakes made, clean laps %, top speed trap (km/h), average pit time, distance driven, incidents count, and multi-class podium tabs.

### 8.3 Customizable & Clean HUD
- **HUD Presets & Layout Editor:** Let players toggle `Full Sim HUD`, `Minimal Broadcast`, `Immersive (No HUD)`, scale HUD size (`75%–125%`), toggle individual widgets (minimap, leaderboard, radar, delta, virtual mirror), and switch **Units (`KM/H` vs. `MPH`, `°C` vs. `°F`)**.
- **Enhanced Track Minimap:** Show Start/Finish line, Sector 1/2/3 boundaries, pit lane indicator, active yellow-flag zones, and optionally rotate-with-car vs. fixed-north modes.

---

## 9. Controls, Driving Assists, Input & Settings

### 9.1 Driving Assists & Transmission Control
- **Expose Manual / Sequential Gearbox in UI & Settings:** `CarSimState.transmissionMode` (`'auto' | 'manual'`) and `ControlInput.shiftUp` / `shiftDown` already exist in `physics.ts`! Add a clear toggle in Race Setup / Settings (`Automatic`, `Semi-Auto`, `Full Manual`) with customizable upshift/downshift keys & paddle triggers (`LB/RB`, `Q/E`, `Shift/Ctrl`) plus an audible/visual shift-beep indicator.
- **Granular Driving Assists (Configurable & Balanced):**
  - **ABS (Anti-Lock Braking):** `Off / Low / High`
  - **Traction Control (TC):** `Off / Low / High` (class-authentic defaults: GT3/Hypercar have TC; F1 2026 has TC Off)
  - **Stability Control / Counter-Steer Assist:** Helps keyboard and casual players catch oversteer smoothly without spinning out.
  - **Steering Sensitivity & Speed-Sensitive Steering Curve (Keyboard):** Crucial for keyboard `A/D` players so tapping keys at 300 km/h makes smooth micro-corrections instead of twitchy snaps.
  - **Racing Line Assist:** `Off / Corners Only / Full Track`
  - **Auto-Pit Limiter & Auto-Recovery:** Optional helpers for beginners.

### 9.2 Controller, Steering Wheel & Haptics
- **Gamepad Vibration / Haptic Feedback (`gamepad.vibrationActuator`):** Trigger dual-rumble pulses for:
  - Kerb rumble strips (`car.onKerb`, frequency proportional to speed!)
  - Tire slip / ABS lock-up vibration (`car.lateralSlip` / `understeerFactor`)
  - Gear shifts (crisp micro-thump)
  - Wall & car-to-car impacts (`lastWallImpact`, `lastCollisionImpact`)
- **Full Keybinding & Gamepad Remapping UI:** Let players rebind every keyboard key and gamepad button, and calibrate deadzones (`steerDeadzone`, `triggerDeadzone`, `cameraDeadzone`), steering linearity, and trigger saturation in `SettingsModal.tsx` (with a live visual axis tester!).
- **Steering Wheel & Pedal Support (WebHID / Extended Gamepad API):** Add dedicated presets and 270°–900° lock calibration for common wheels (Logitech G29/G923, Thrustmaster T300, Fanatec) with split/combined pedal axis auto-detection.
- **Mobile Touch Controls Upgrades (`TouchControlsOverlay.tsx`):**
  - Add **Gyroscope / Tilt Steering** option (`DeviceOrientationEvent`) alongside `pad` and `buttons`.
  - Add optional **Auto-Accelerate** mode for one-handed mobile play and customizable button opacity/size/positions.

### 9.3 Comprehensive Settings Modal (`SettingsModal.tsx`)
Currently `SettingsModal.tsx` only covers controller toggle, touch controls, and master volume. Expand into tabbed categories:
1. **Gameplay & Assists:** Units (`km/h` / `mph`), transmission, ABS/TC/stability, racing line, damage level, AI HUD labels/nametags toggle.
2. **Controls & Input:** Keybindings, gamepad deadzones/curves/rumble, touch layout, steering wheel calibration.
3. **Graphics & Performance:** Quality Preset (`Ultra / High / Medium / Low / Potato`), Resolution Scale (`0.5×–1.0×` DPR), Shadow Quality (`Off / 1024 / 2048`), Post-Processing/Bloom toggle, Particle Density, Draw Distance, Tilt-Shift toggle, Target FPS / Frame-rate counter toggle.
4. **Camera:** Default camera mode, Hood/Chase FOV sliders, camera shake intensity, look-to-apex intensity, rear-view mirror toggle.
5. **Audio:** Multi-channel mixer sliders, spatial rival audio toggle, spotter/engineer verbosity.
6. **Accessibility:** Colorblind palettes (Protanopia / Deuteranopia / Tritanopia — affecting class badges, sector deltas, flags, and racing line), high-contrast HUD mode, reduced screen-shake/flashing lights toggle, subtitles for radio callouts.

---

## 10. Multiplayer, Netcode & Competitive Online Play

### 10.1 Netcode, Synchronization & Collision Fairness
- **Timestamped Snapshot Interpolation & Dead-Reckoning:** Upgrade `PeerTelemetryPacket` (`src/game/multiplayer.ts`) to include `timestamp`, `vx`, `vz`, `yawRate`, `pitch`, `roll`, `gear`, `rpmNormalized`, `brake`, `compound`, and `pitState`. Buffer incoming packets (~80–100ms interpolation buffer) using Hermite/cubic spline interpolation so remote peers glide smoothly with zero stutter even on jittery Wi-Fi!
- **Synchronized Race Clock & Green-Flag Alignment:** Perform NTP-style clock-offset handshakes (`ping`/`pong`) on room join so every client starts the countdown, dynamic weather timer (`rainTimer`), and lap clocks at the exact same server timestamp.
- **Deterministic AI Sync in Mixed Human+AI Lobbies:** Currently each client simulates AI cars locally, which causes AI positions to diverge between players! Make the **Host** (or server) authoritative for AI car telemetry packets (broadcasting compact binary/delta AI frames at 15–20Hz) so every player battles the exact same AI pack.
- **Lag-Aware Collision & Ghosting Safeguards:** Auto-ghost cars with high packet loss (>350ms ping), lapped/stopped cars on track, or backwards drivers to prevent netcode griefing and warp-crashes.
- **Binary WebSocket Framing for Telemetry:** Switch high-frequency 20–30Hz `telemetry` packets in `server.ts` / `multiplayer.ts` from JSON strings to compact binary `ArrayBuffer` / `DataView` structs (~48 bytes vs. ~280 bytes JSON) — cutting bandwidth & GC overhead by >80%.

### 10.2 Lobby Discovery, Social Features & League Tools
- **Public Lobby Browser & Quick Matchmaking:** Add a public/private toggle when creating rooms so players can browse active open lobbies (showing track, classes, player count, ping, session phase) instead of relying solely on 5-character room codes.
- **Join-in-Progress / Live Spectator Slots:** Allow late joiners to connect directly as spectators (watching via Broadcast/Chase/Freecam) and automatically enter the grid for the next race.
- **Lobby & In-Race Text Chat + Quick-Chat Macros:** Add lobby chat plus one-tap racing quick-chat (`"Good luck!"`, `"Sorry!"`, `"Nice pass!"`, `"Pitting this lap"`, `"Pass left/right"`).
- **Live Ping / Connection Quality Indicators:** Display per-peer latency (ms) in the lobby and scoreboard.
- **Host Race Director Tools:** Kick/ban griefers, force-ready countdown, swap tracks without disbanding the room, save multi-race championship playlists, vote-for-next-track between races, and configure mandatory pit stop rules.
- **Server Hardening & Room Lifecycle (`server.ts`):**
  - Add WebSocket heartbeat (`ping`/`pong`) cleanup for zombie sockets, idle room TTL eviction (currently `rooms` map can retain stale rooms), rate limiting on messages, and server-side lap-time sanity checks against impossible speed hacks.
  - Persistent player profiles (username, saved favorite liveries, Elo Skill Rating & Cleanliness/Safety Rating) for competitive matchmaking.

---

## 11. Creative Studios (Track, Livery & Sound)

### 11.1 Track Studio (`TrackStudioModal.tsx` & `customTracks.ts`)
- **Undo / Redo History Stack & Keyboard Shortcuts:** Essential for spline editing (`Ctrl+Z` / `Ctrl+Y`, `Delete` node, snap-to-grid, smooth-all-nodes).
- **Visual Elevation & Banking Profile Graph:** Add a 2D side-elevation strip chart at the bottom of Track Studio showing height (`y`), gradient %, and banking (`deg`) along the circuit loop with draggable control points and auto-smoothing.
- **Pit Lane & Sector Marker Placement:** Let creators explicitly set Start/Finish position, Sector 1/2/3 split lines, DRS activation zones, and pit-lane entry/exit nodes.
- **Track Validation & Real-Time Physics Warnings:** Auto-detect self-intersecting track ribbons, impossible hairpin radii, excessive slopes/banking jumps, and display estimated lap time by class + AI test-drive simulation preview right inside the studio!
- **Scenery Prop Painting & Surface Zones:** Allow placing grandstands, trees, bridges, tunnels, kerbs (custom inner/outer kerb painting), and runoff types (gravel/grass/asphalt) per segment.
- **SVG / GPX / Real-World Map Trace Importer:** Let users upload a circuit image or SVG outline as a semi-transparent tracing underlay to recreate their favorite real-world tracks in minutes.
- **Track Thumbnails & Community Gallery:** Auto-capture 3D preview cards for saved custom tracks and allow browsing/upvoting/cloning community-shared `APXTRK:` circuits.

### 11.2 Livery Studio (`LiveryStudioModal.tsx`)
- **Multi-Layer Decal & Sponsor System:** Move beyond fixed templates (`racing-stripes`, `two-tone`, `geometric`, `heritage`) to a layer stack with draggable/scalable/rotatable geometric shapes, racing stripes, country flags, manufacturer badges, and fictional motorsport sponsor logos (with symmetry mirroring Left↔Right).
- **Paint Finish Materials:** Let users pick per-color finish: `Gloss`, `Metallic`, `Matte`, `Satin`, `Chrome`, `Carbon Weave`, or `Pearlescent`.
- **Save Multiple Custom Liveries per Car:** Build a persistent Livery Garage (`localStorage` + share codes `APXLIV:...`) so players can keep multiple paint schemes per car and share them in Multiplayer (currently custom texture data URLs can bloat WebSocket payloads — optimize with compact vector layer recipes!).
- **Helmet, Pit Crew & Wheel Rim Customization:** Add wheel rim spoke styles, brake caliper colors, window tint, and custom windshield banner fonts.

### 11.3 Sound Studio (`SoundEditorModal.tsx` & `audioAutoFitter.ts`)
- **Preset Library & Shareable Sound Profiles:** Save/export custom `AcousticProfile` presets (`APXSND:...`) and let players assign custom sound profiles to any car.
- **Interactive Dyno / On-Track Preview Mode:** Add an automated "Full-Throttle Gear Sweep (1st→8th + Downshift Blips)" test button alongside manual RPM scrubbing, plus a live FFT spectrogram overlay comparing synthesized audio against reference audio in `audioAutoFitter.ts`.
- **Exhaust Pop / Crackle & Turbo Flutter Fine-Tuning:** Expose deceleration burble intensity, shift-cut bark, turbo blow-off flutter, and straight-cut gearbox whine volume as dedicated sliders.

---

## 12. UI/UX, Onboarding & Quality of Life

### 12.1 First-Time User Experience (FTUE) & Discoverability
- **Interactive Controls Card & Pre-Race Briefing:** Show a compact, dismissible control overlay (auto-adapting to Keyboard / Xbox / PlayStation / Touch) on the grid before the first race, plus a brief explanation of the selected car's `ClassSpecialType` (e.g., *"Hold SPACE for Active Aero"* vs. *"Tap SPACE for ERS Overtake"*).
- **Persist User Preferences Across Reloads:** Remember the user's last selected car, livery, track, race config, camera mode, and preferred classes in `localStorage` so returning players don't always reset to `INITIAL_CONFIG` (Ferrari 499P at Spa).
- **Smart Car & Track Filtering + Favorites:** With 57 cars and 43 circuits, add search bars, favorites/bookmarks, "Recently Raced", "Surprise Me / Random Race" button (leveraging existing `randomScenario.ts`!), and side-by-side car stat comparison in `CarsShowcaseModal.tsx` and `TracksShowcaseModal.tsx`.

### 12.2 Visual & Interaction Polish
- **Full Gamepad Menu Navigation:** Allow navigating Title Overlay, Race Menu, Pause, and Results screens completely with controller D-Pad / `A` / `B` without reaching for a mouse.
- **Keyboard Shortcuts Everywhere:** Quick-restart race (`Shift+R`), toggle HUD (`H`), toggle nametags (`N`), toggle pit request, instant photo mode, and `Esc` cleanly closing nested modals.
- **Loading Progress & Smooth Scene Transitions:** Show track map outline, circuit trivia (`circuitInfo`), class tips, and real asset-loading progress bars while compiling large circuits/OBJ car models so heavy swaps never feel frozen.
- **Mobile & Responsive Refinements:** Add landscape-orientation recommendation banner on portrait phones, PWA Web App Manifest + Service Worker caching so mobile/desktop players can install Apex Miniature like a native app and play single-player offline.

---

## 13. Performance, Asset Pipeline & Codebase Architecture

### 13.1 Rendering & Runtime Performance
- **3D Model Pipeline Optimization (`objCarLoader.ts` & `carBuilder.ts`):**
  - Migrate raw `.obj` car assets to compressed **glTF / GLB with Draco/Meshopt compression** — drastically faster network fetches, smaller payload sizes, and instant GPU upload compared to text-based OBJ parsing.
  - Add **LOD (Level of Detail)** meshes (High for player/close cars, Medium >40m, Low/Billboards >120m) so full 24-car grids lock smoothly at 60–120 FPS even on integrated GPUs and mobile devices.
  - Pre-warm shaders & cache parsed geometries/textures across race restarts (`runNonce` increments) instead of rebuilding static geometries from scratch.
- **Instanced Trackside Props & Batched Draw Calls (`trackBuilder.ts`):** Audit draw call counts per track and merge/instance static grandstands, trees, barriers, light poles, and kerb segments (`InstancedMesh`) to keep draw calls under ~100–150 per frame.
- **Object Pooling & Zero-GC Hot Loops:** Audit `RaceViewport.tsx` and `physics.ts` tick loops to eliminate any remaining per-frame object/array allocations (e.g., `hud.standings` / `minimapDots` throttling at 15–20Hz React state updates while 3D rendering runs freely at display refresh rate, and pooling particle matrices).
- **Dynamic Adaptive Resolution Scaling:** Optional "Auto Performance Mode" that watches frame time and smoothly scales renderer pixel ratio (`0.65×`–`1.0×`) to hold a rock-solid 60 FPS during chaotic 24-car wet Lap 1 starts.

### 13.2 Bundle Size & Lazy Loading
- **Code-Split Heavy Studios & Modals:** Lazy-load `TrackStudioModal.tsx` (1,812 lines), `LiveryStudioModal.tsx` (1,269 lines), `SoundEditorModal.tsx` (1,555 lines), `CarsShowcaseModal.tsx`, and `TracksShowcaseModal.tsx` via `React.lazy` + `Suspense` so initial page boot only ships the Title Screen & Core Engine.
- **Lazy-Load Neural Policy Weights & Track Data:** Fetch non-default AI policy `.bin` weights and unused track geometry/elevation datasets asynchronously on demand instead of statically bundling all 20 weight JSONs and 43 tracks in the initial JS chunk.

### 13.3 Maintainability, Refactoring & Automated Testing
- **Decompose Monolithic Files:**
  - Split `src/three/carBuilder.ts` (3,555 lines) into per-silhouette builders (`prototype.ts`, `formula.ts`, `gt.ts`, `materials.ts`, `liveryCanvas.ts`).
  - Split `src/game/physics.ts` (2,742 lines) into focused modules (`tires.ts`, `aero.ts`, `drivetrain.ts`, `collisions.ts`, `pitstops.ts`, `aiHeuristic.ts`, `standings.ts`).
  - Split `src/three/RaceViewport.tsx` (2,032 lines) into a headless simulation controller class (`RaceSimulationController.ts`), a Three.js scene/VFX manager (`RaceSceneManager.ts`), and a thin React wrapper component.
- **Shared Core Simulation Determinism & Web Worker Option:** Keep simulation stepping decoupled from Three.js scene objects so physics + neural AI inference can optionally run in a dedicated Web Worker or headless Node server for authoritative multiplayer.
- **Expanded Automated Testing & Telemetry Benchmarks:**
  - Add headless soak tests across all 43 circuits & all 10 classes verifying zero NaN states, no track-surface fall-throughs, clean standing/rolling starts, and BoP lap-time parity within target margins.
  - Add Playwright/headless-browser smoke tests for UI modals, WebGL initialization, and Multiplayer room join/sync flows.

---

## 14. Prioritized Implementation Matrix (Quick Wins vs. Flagship Milestones)

| Priority | Improvement | Impact | Effort | Primary Files |
| :--- | :--- | :---: | :---: | :--- |
| **P0 — Quick Win** | **Proximity Car Radar + Live Lap Delta Bar + Purple/Green/Yellow Sectors** | Very High | Low | `RaceHUD.tsx`, `RaceViewport.tsx` |
| **P0 — Quick Win** | **Expose Manual Transmission Toggle + Driving Assists (ABS/TC/Racing Line) + Units (`km/h`/`mph`)** | Very High | Low–Med | `settings.ts`, `SettingsModal.tsx`, `physics.ts`, `RaceHUD.tsx` |
| **P0 — Quick Win** | **Gamepad Rumble/Haptics (Kerbs, Slip, Impacts, Shifts) + Deadzone/FOV/Graphics Settings** | High | Low | `gamepad.ts`, `SettingsModal.tsx`, `RaceViewport.tsx` |
| **P0 — Quick Win** | **Racing VFX Pack #1: Tire Smoke, Wet Spray Rooster-Tails, Exhaust Backfire, Brake Glow, Skidmarks** | Very High | Medium | `RaceViewport.tsx`, `carBuilder.ts` |
| **P0 — Quick Win** | **Persist Last Race Config, Personal Best Lap Records Matrix & Favorite Cars/Tracks** | High | Low | `App.tsx`, `RaceMenuModal.tsx`, `ResultsModal.tsx` |
| **P0 — Quick Win** | **Lazy-Load Modals/Studios + Switch Active AI Policies to Compact `.bin` & Prune Legacy JSONs** | High | Low | `App.tsx`, `aiNeuralPolicy.ts` |
| **P1 — High Impact** | **Ghost Car Time Trial + Bronze/Silver/Gold/Alien Track Medals** | Very High | Medium | `RaceViewport.tsx`, `physics.ts`, `RaceMenuModal.tsx` |
| **P1 — High Impact** | **Multiplayer Netcode Upgrade: Binary Telemetry, Interpolation Buffer & Host-Authoritative AI Sync** | Very High | Medium | `server.ts`, `multiplayer.ts`, `RaceViewport.tsx` |
| **P1 — High Impact** | **Physical Pit Lanes, Pit Speed Limiter, Aero Repair & Dynamic AI Pit/Weather Strategy** | Very High | Medium–High | `trackBuilder.ts`, `physics.ts`, `RaceViewport.tsx` |
| **P1 — High Impact** | **Time-of-Day / 24h Endurance Cycle + Night Headlight Cones + Player-Centered 2048 Shadows** | Very High | Medium–High | `RaceViewport.tsx`, `trackBuilder.ts`, `carBuilder.ts` |
| **P1 — High Impact** | **Spatial Multi-Car Rival Audio + Race Engineer / Spotter Callouts + Granular Audio Mixer** | Very High | Medium | `audioEngine.ts`, `RaceViewport.tsx`, `SettingsModal.tsx` |
| **P1 — High Impact** | **Full Flag System (Yellow / Blue Flags) + Safety Car / VSC + Jump-Start Launch** | High | Medium | `physics.ts`, `RaceViewport.tsx`, `RaceHUD.tsx` |
| **P2 — Flagship** | **Championship / Season Mode (Points Tables, Multi-Round Calendars, Q1/Q2/Q3 Weekends)** | Very High | High | New `championship.ts`, `RaceMenuModal.tsx`, `ResultsModal.tsx` |
| **P2 — Flagship** | **Instant Replay Suite + Dynamic TV Broadcast Cameras + Photo Mode (with Miniature Tilt-Shift)** | Very High | High | `RaceViewport.tsx`, `camera.ts`, new Replay/Photo UI |
| **P2 — Flagship** | **Per-Track Car Setup Workbench + 4-Wheel Tire/Brake Thermal Physics** | High | High | `physics.ts`, `RaceMenuModal.tsx`, `RaceHUD.tsx` |
| **P2 — Flagship** | **Public Multiplayer Lobby Browser, Live Spectator Join, Chat & Elo/Safety Rating** | High | High | `server.ts`, `multiplayer.ts`, `MultiplayerModal.tsx` |
| **P2 — Flagship** | **Studio 2.0: Decal Layer Editor (Livery), Elevation Graph & Prop Painter (Track), glTF/LOD Pipeline** | High | High | `LiveryStudioModal.tsx`, `TrackStudioModal.tsx`, `objCarLoader.ts` |
| **P3 — Polish** | **AI Race Engineer / Team Manager Mode, Scenario Challenges, PWA Offline Install & Refactoring** | Medium–High | Medium–High | `physics.ts`, `carBuilder.ts`, `RaceViewport.tsx` |
