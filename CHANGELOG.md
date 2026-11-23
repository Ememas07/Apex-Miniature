# Changelog

All notable changes to **Apex Miniature** are documented in this file, ordered from newest to oldest.

---

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

## 2026-11-21 04:00
- Raised the default Chase and Spectate camera angle for a clearer view down the road ahead, preserving manual mouse/stick pitch and yaw while smoothly auto-leveling only camera roll after idle.
- Finalized the translucent, full-bleed Modern Main Menu UI so the live 3D attract-mode circuit remains unobstructed behind paddock controls.
- Hardened neural policy loading with strict matrix/NaN validation and zero-allocation runtime buffers.
