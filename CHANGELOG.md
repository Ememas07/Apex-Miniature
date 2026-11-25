# Changelog

All notable changes to **Apex Miniature** are documented in this file, ordered from newest to oldest.

---

## 2026-11-25 08:58
- Added an in-game **Changelog** button in the top-right paddock header that opens a searchable **Changelog & Git History** modal displaying the full git commit log (with category badges, commit hashes, authors, timestamps, and merge filtering) alongside curated Release Notes.
- Backfilled `CHANGELOG.md` with all previously missing historical commits and milestones from the project's initial launch on 2026-11-15 through 2026-11-22.

## 2026-11-25 08:54
- Made the AI telemetry export button always visible in both the Pause menu and the Post-Race Results screen (falling back to exporting the current/last telemetry buffer when no completed clean laps are listed yet), alongside the existing `F8` quick-export shortcut.

## 2026-11-25 08:00
- Removed the upcoming corner callout badge (such as "Sharp Right") from the race HUD and Settings menu.
- Decluttered the in-race HUD to eliminate overlapping panels (stacking the virtual mirror, status flags, radio subtitles, live inputs, MFD, on-track service crew, FPS/time badge, and proximity radar cleanly) and added drag-grip handles to every HUD widget with saved positions and a "Reset HUD Positions" button in Settings.
- Removed Safety Cars and Virtual Safety Cars completely while preserving local sector yellow flags for on-track incidents.
- Removed Drive-Through and Stop-and-Go penalties (replacing repeated infractions with slow-down yields and post-race time penalties) and removed pit-lane entry/exit corridor markings from Track Studio while keeping trackside pit walls and on-track stops for tyres, fuel, and repairs.
- Set Spotter/Engineer radio chatter and the Dynamic Racing Line ("ideal line") to Off by default.
- Overhauled Traction Control so it is much gentler across all levels (especially TC 1), triggers only on rear-axle slide for RWD cars or front-axle slip for FWD cars, and is completely disabled on cars without TC in real life (F1 2026, F1 2021, Formula E, and Renault Clio V6).

## 2026-11-25 07:41
- Added Safety Car (with a miniature 3D Safety Car and flashing amber/green roof lightbar) and Virtual Safety Car periods during multi-car pileups, plus serveable on-track Drive-Through and Stop-and-Go penalties with clear HUD instructions and deadline tracking.
- Upgraded trackside atmosphere and graphics with player-centered up to 2048×2048 sun shadows, Start/Finish timing towers, final-lap grandstand crowd movement, themed moving landmarks (Ferris wheels, helicopters, blimps), knockable chicane bollards, high-speed motion streaks, hood visor raindrops, and an optional live 3D virtual rear-view mirror in hood, bumper, and cockpit cameras.
- Upgraded audio spatialization to full 3D HRTF positioning synced with the camera and added procedural tunnel reverberation acoustics.
- Added steering wheel calibration presets (Logitech G29/G923, Thrustmaster T300, Fanatec, and Combined Pedals), pedal polarity/combined-axis toggles, full D-Pad/A/B controller navigation across all menus, and an async track/car loading progress overlay.
- Added multiplayer host ban/unban moderation, multi-race circuit playlists, a mandatory on-track service stop rule, minimum valid lap-time anti-cheat bounds, per-segment shoulder/prop painting in Track Studio, and a shareable community circuit gallery (`/api/tracks`).
- Upgraded car models to Meshopt-compressed `.glb` assets with 3-tier distance LODs and shader pre-warming, added code-split lazy loading for circuit geometry/elevation data, split core car/physics/viewport modules with an optional Web Worker simulation mode, crafted sculpted custom procedural 3D meshes across all flagship racing classes, and added a 43-circuit × 10-class soak suite plus HTTP/WebSocket server smoke tests.

## 2026-11-25 08:00
- Removed the upcoming corner callout badge (such as "Sharp Right") from the race HUD and Settings menu.
- Decluttered the in-race HUD to eliminate overlapping panels (stacking the virtual mirror, status flags, radio subtitles, live inputs, MFD, on-track service crew, FPS/time badge, and proximity radar cleanly) and added drag-grip handles to every HUD widget with saved positions and a "Reset HUD Positions" button in Settings.
- Removed Safety Cars and Virtual Safety Cars completely while preserving local sector yellow flags for on-track incidents.
- Removed Drive-Through and Stop-and-Go penalties (replacing repeated infractions with slow-down yields and post-race time penalties) and removed pit-lane entry/exit corridor markings from Track Studio while keeping trackside pit walls and on-track stops for tyres, fuel, and repairs.
- Set Spotter/Engineer radio chatter and the Dynamic Racing Line ("ideal line") to Off by default.
- Overhauled Traction Control so it is much gentler across all levels (especially TC 1), triggers only on rear-axle slide for RWD cars or front-axle slip for FWD cars, and is completely disabled on cars without TC in real life (F1 2026, F1 2021, Formula E, and Renault Clio V6).

## 2026-11-25 07:41
- Added Safety Car (with a miniature 3D Safety Car and flashing amber/green roof lightbar) and Virtual Safety Car periods during multi-car pileups, plus serveable on-track Drive-Through and Stop-and-Go penalties with clear HUD instructions and deadline tracking.
- Upgraded trackside atmosphere and graphics with player-centered up to 2048×2048 sun shadows, Start/Finish timing towers, final-lap grandstand crowd movement, themed moving landmarks (Ferris wheels, helicopters, blimps), knockable chicane bollards, high-speed motion streaks, hood visor raindrops, and an optional live 3D virtual rear-view mirror in hood, bumper, and cockpit cameras.
- Upgraded audio spatialization to full 3D HRTF positioning synced with the camera and added procedural tunnel reverberation acoustics.
- Added steering wheel calibration presets (Logitech G29/G923, Thrustmaster T300, Fanatec, and Combined Pedals), pedal polarity/combined-axis toggles, full D-Pad/A/B controller navigation across all menus, and an async track/car loading progress overlay.
- Added multiplayer host ban/unban moderation, multi-race circuit playlists, a mandatory on-track service stop rule, minimum valid lap-time anti-cheat bounds, per-segment shoulder/prop painting in Track Studio, and a shareable community circuit gallery (`/api/tracks`).
- Upgraded car models to Meshopt-compressed `.glb` assets with 3-tier distance LODs and shader pre-warming, added code-split lazy loading for circuit geometry/elevation data, split core car/physics/viewport modules with an optional Web Worker simulation mode, crafted sculpted custom procedural 3D meshes across all flagship racing classes, and added a 43-circuit × 10-class soak suite plus HTTP/WebSocket server smoke tests.

## 2026-11-23 06:30
- Added full Time-of-Day lighting (`Midday`, `Dawn`, `Golden Hour`, `Dusk`, `Night`, and accelerated `Dynamic 24h` cycles) with automatic night headlight cones, trackside floodlights, glowing carbon brake rotors, FIA wet rain lights, storm lightning, wet road sheen, and player-centered shadows.
- Added a pooled racing VFX and post-processing suite featuring tyre smoke, gravel dust, wet rooster-tail spray, exhaust backfires, floor sparks, persistent skidmarks, dynamic 3D racing line, animated marshal flags, selective HDR bloom, miniature tilt-shift depth-of-field, and high-speed peripheral blur.
- Expanded the camera system to 7 views (`Chase Near`, `Chase Far`, `T-Cam`, `Cockpit`, `Hood`, `Bumper`, and `TV Broadcast` trackside director) with Look-to-Apex, Look Back (`V`), and customizable FOV and offsets.
- Added Instant Replay Theater with automatic highlight bookmarks, 5.5-second mid-race Flashback rewind (`F`), and free-cam Photo Mode (`F9`) with lens controls, tilt-shift, color grading filters, optional watermark, and one-click PNG export.
- Added 3D spatial Doppler opponent engine audio, road/kerb/wet/wind/tunnel foley, a 7-channel audio mixer, ambient menu music, and a Pit Wall Race Engineer Radio with live subtitles and optional spoken voice callouts.
- Upgraded the in-race HUD with a 4-page Multi-Function Display (`Tab`), virtual rear-view & blind-spot arrows, upcoming corner callout badge, live pedal trace, FPS/time chip, HUD density presets (`H`), metric/imperial units, colorblind palettes, and an SVG lap-by-lap position chart on the Results screen.
- Rebuilt the Settings screen into a 6-tab Motorsport Settings Suite with Semi-Auto & Manual shifting, Traction Control (`TC 0–3`), Stability Control, gamepad/wheel calibration with a live axis tester and haptic rumble, gyroscope/auto-accelerate mobile touch controls, and full keybind remapping.
- Upgraded Online Multiplayer with a Public Lobby Browser, Quick Match, Spectator join-in-progress, Elo & Safety Rating badges, live ping and clock sync, low-bandwidth binary telemetry interpolation with auto-ghosting, track voting, lobby chat, and host moderation.
- Upgraded Creative Studios 2.0: Track Studio now has Undo/Redo, 10m Snap-to-Grid, Smooth All, SVG/image trace underlays, an interactive elevation & banking profile chart, per-node props/runoff/DRS zones, and sector splits; Livery Studio adds PBR paint finishes, caliper colors, window tints, a multi-layer decal stack with L↔R mirroring, diorama lighting switcher, saved per-car slots, and `APXLIV:` share codes; Sound Studio adds a 1st–8th gear dyno sweep with downshift blips, saved preset library, and `APXSND:` share codes.
- Added the "Get Mecachrome'd" player-only engine reliability event (a rare 5-second power loss with smoke plumes, warning banner, and radio alert that recovers automatically), pre-race adaptive controls briefing, global QoL hotkeys (`Shift+R`, `H`, `N`, `Esc`), lazy-loaded studios, and installable offline Progressive Web App (PWA) support.
- Fixed a PPO training script crash when loading binary policy checkpoints across pedal modes and resolved a duplicate braking-board geometry declaration in the track builder.

## 2026-11-22 16:10
- Added a persistent Personal Records Matrix that automatically saves best lap times, sector splits, top speeds, tyre compounds, and earned track medals (Bronze, Silver, Gold, Alien) for every car and circuit combination.

## 2026-11-22 15:35
- Upgraded AI racecraft with multi-class traffic etiquette so faster prototypes pass GT traffic cleanly while slower classes hold predictable lines and yield under blue flags.
- Added a 24-driver, 12-team AI roster with coordinated liveries, driver nationalities, and distinct driving personalities (`Late-Braker`, `Metronome`, `Tire-Saver`, `Traffic-Smart`) that blend neural policies and strategy choices.
- Added dynamic AI on-track service strategy for tyre wear, low fuel, damage repairs, and wet/dry weather crossovers, plus realistic human-like braking mistakes, one-move defending, Turn-1 cold-tyre braking guards, and stuck-car recovery.

## 2026-11-22 14:55
- Added an in-game AI Neural Telemetry Visualizer overlay showing live steering/pedal outputs, lookahead curvature probes, proximity radar slots, and active maneuvers.
- Added one-click driving telemetry `.jsonl` dataset recording and export from the Pause and Post-Race screens for training neural AI via behavioral cloning.

## 2026-11-22 11:41
- Unified the neural AI model lineup into three clean slots (`v1` Physics Master, `v2` Racecraft Master, and `starts` Grid Launch Specialist), pruned legacy checkpoints, and added compact binary `.bin` model loading with per-personality policy blending.

## 2026-11-22 11:27
- Implemented full motorsport race rules and flags (Local Yellow with overtake enforcement, Blue Flags, White Flag, Black-and-White warnings, Safety Car / Virtual Safety Car deployments, and Drive-Through / Stop-and-Go penalties).
- Added manual standing-start launch control with RPM sweet-spot boosts and jump-start detection.
- Added class-specific racing systems: track-defined DRS detection and activation zones, multi-mode hybrid ERS battery management (`Harvest`, `Balanced`, `Overtake`, `Quali`), Formula E illuminated off-line Attack Mode loops, and Push-to-Pass tracking.
- Upgraded weather from a simple rain loop to multi-stage forecast timelines (`Clear`, `Overcast`, `Light Drizzle`, `Rain`, `Heavy Storm`, `Drying Track`) with a faster-drying racing line, standing puddles, asphalt rubbering, and track temperature simulation.

## 2026-11-22 10:56
- Added per-class trained neural AI policy support (`public/models/policies/class_*.bin`) alongside the AI Policy Mix panel so each racing class can use its own specialized driving model.

## 2026-11-22 07:28
- Upgraded vehicle physics with individual 4-wheel tyre wear, temperatures, flat-spots, and graining; brake disc heating, fade, and wheel lock-ups; weight transfer, dirty-air aero wash, crest unloading over hills, and surface-specific physics for gravel, grass, astroturf, and sausage kerbs.
- Added localized mechanical and visual damage (Front Wing, Rear Wing, Engine, Suspension) with configurable damage realism levels and on-track repair stops.
- Launched the Per-Track Car Setup Workbench with shareable setup codes, live in-race brake balance adjustment, and a Balance of Performance (BoP) inspector.
- Added Championship / Season Mode (multi-round calendars, full race weekends, timed endurance races, points tables, and optional Collector progression), Ghost Car Time Trials with live delta bars and Daily Hotlap Challenges, 6 curated Race Scenarios, 5 License Tests, Elimination mode, and AI Race Engineer mode.
- Added a proximity car radar, official purple/green/yellow sector timing splits, favorite cars/tracks bookmarking, and automatic persistence of race preferences.

## 2026-11-21 22:00
- Added Rolling Starts with 2×2 staggered formations, amber formation countdowns, and smooth green-flag releases alongside Standing Starts.
- Introduced a dedicated `starts` AI policy and launch assist to eliminate lap-1 standing-start stalls and pileups, plus straight-line bump-drafting so AI cars commit to slipstream tows without lifting early.
- Upgraded neural AI inference to flat typed-array math and added compact `ANB1` binary weights and binary worker IPC for faster training and zero-stutter runtime performance.

## 2026-11-21 17:20
- Added custom keyboard binding remapping and improved AI wet-weather driving grip and braking behavior.

## 2026-11-21 04:00
- Raised the default Chase and Spectate camera angle for a clearer view down the road ahead, preserving manual mouse/stick pitch and yaw while smoothly auto-leveling only camera roll after idle.
- Finalized the translucent, full-bleed Modern Main Menu UI so the live 3D attract-mode circuit remains unobstructed behind paddock controls.
- Hardened neural policy loading with strict matrix/NaN validation and zero-allocation runtime buffers.

## 2026-11-20 18:56
- Added Balance of Performance (BoP) tuning across car classes, safe-area inset padding, and compact short-viewport menu layouts.
- Added automated geometric hood camera mounting so every car class gets a clean, unobstructed forward sightline, alongside smoother camera transitions and re-exported low-poly car meshes.
- Upgraded the neural AI architecture with physics-aware policy improvements and consolidated training weights.

## 2026-11-19 21:38
- Replaced the separate garage/setup screens with the Unified Race Menu, added Solo Practice mode, and introduced Host AI Race & Spectator camera modes.
- Added rigid-body car-to-car collision physics, improved high-speed steering stability, and refined vehicle numberplate meshes and normals.
- Added full controller/gamepad support with `X` button special mapping, implemented blended neural AI policies with self-play snapshots, and fixed multiplayer room creation and lobby state handling.

## 2026-11-18 14:49
- Launched Sound Studio (`SoundEditorModal`) for live engine acoustic synthesis tuning, added multiplayer room lobbies, subpath routing (`/Apex-Miniature`), and pit management controls.
- Added driving telemetry recording and expanded low-poly vehicle imports including LMP2 Oreca 07 and Porsche 963 updates.

## 2026-11-17 22:48
- Converted `.kn5` race car models into low-poly 3D OBJ/MTL meshes, consolidated F1 2026, F1 2021, and LMP2 into shared models with selectable team liveries, and launched 3D Livery Studio with UV export.
- Added Car and Track search bars, implemented 3D track surface projection, and introduced per-class physics tuning profiles and multi-class BoP benchmarks.

## 2026-11-16 22:42
- Integrated real-world RacingCircuits.info SVG layouts for all 43 circuits and Copernicus DEM real-world elevation profiles.
- Added the GT4 racing class and expanded the vehicle roster to 76 bespoke cars with 1:1 metric track scaling, wall-sliding, pit walls, corner banking, and kerb collision fixes.

## 2026-11-15 21:27
- Initial release of **Apex Miniature** featuring 3D miniature motorsport racing, Track Studio custom circuit builder, vehicle physics engine, real-time WebSocket multiplayer sync, and hub navigation.
