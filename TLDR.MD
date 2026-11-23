Diagnosis: Why V1 & V2 Were Slow & Braking on Straights
Human telemetry vs. V1/V2 on-track simulation: On Spa (Aston Valkyrie LMH), your telemetry hits 317.2 km/h max, 220.8 km/h avg, 85.3% full throttle, 0.00% pedal overlap, and 0.6% straight braking. In the exact same physics loop, V1 overlapped throttle + brake on 28.9–45.6% of steps and braked on 11.3–34.5% of straights; V2 was worse (44.9% overlap, 40.5% straight braking, capped around 201.8 km/h). On Laguna Seca (Porsche 911 GT3 R), your fastest clean sector averaged 183.9 km/h with 91% full throttle and 0.00% overlap vs. V1/V2's 120 km/h and 35–52% overlap.
Root causes fixed:
Independent 2-pedal outputs + Gaussian noise made the policy pull away from ±1.0, causing constant throttle/brake overlap (e.g., 98% throttle + 2% brake on straights).
Risk-aversion rewards (wallCrash: 32–35, offTrackBase: 1.65–1.85/step, and cornerSurvivalBonus paying more reward for spending more steps in corners) rewarded coasting and braking early.
Snippet spawning (brakingZoneSpawnRatio: 0.38–0.48, wetEpisodeRatio: 0.30, short 512-step rollouts) conditioned a defensive reflex instead of full-lap commitment.
One monolithic 10-class model smeared braking points and obsNorm across wildly different downforce/braking classes (GT4 through F1).
What Changed
Pure ANB1 Binary Policies & Per-Class Models: Removed all .json policy bundles (~6.9 MB bloat deleted); all models now train, load, and serve exclusively as compact ANB1 .bin files under public/models/policies/ (with automatic manifest discovery and a Node Buffer.slice byteOffset decoding bug fixed). Each of the 10 car classes maps to public/models/policies/class_<slug>.bin (automatically routed in-game with seamless fallback to v1/v2), plus a Per-Class Binary Models toggle & status grid in the AI Policy panel.
ANB1 v4 Signed Pedal (pedalMode: 'signed'): Collapses longitudinal control into one signed channel (DEADZONE = 0.02, SPAN = 0.88, bound margin 1.25), mathematically enforcing 0.00% throttle/brake overlap and clean 100% full-throttle saturation on straights.
Full-Lap Anti-Caution Training (class_pace + class_full_lap_2phase): Removed cornerSurvivalBonus, lowered wallCrash (12.0) and offTrackBase (0.35), added timeStepPenalty, speedRatioBonus, straightFullThrottleBonus, straightBrakePenalty, and lapPaceBonus, and switched to full-lap flying starts (fullLapMode: true, 1024-step rollouts, 0% rain/snippet spawns during pace training).
Sector-Filtered Human Telemetry BC + Decaying Anchor: Automatically strips wall-hit/off-track/slow windows from your .jsonl telemetry (converting legacy 43-dim telemetry to 59-dim window_tanh + signed pedals on the fly), weights your fastest clean sectors highest, and supports a decaying BC anchor (--bc-anchor-coef) so PPO starts from your pace and improves via full-lap trial-and-error. Updated the telemetry recorder itself to log 59-dim window_tanh + carClass going forward.
Per-Class Benchmarking & Pedal Metrics: Updated scripts/benchAndAudit.py to default to .bin, support --car-class / --all-classes, and report Max Speed, Full-Thr %, Overlap %, and Straight-Brk %.
Personality Rename: Removed "Dive-Bomber" everywhere and renamed it to "Average GTP Driver".

Ready-to-Run Training Workflow (Spa-First -> All Tracks)
Stage 1 — Train GTP on Spa from your Valkyrie telemetry (full laps, solo trial-and-error):
python -u scripts/trainPPO.py --car-class HYPERCAR_GTP --tracks spa-francorchamps --solo-only --bc-dataset telemetry_spa-francorchamps_aston-valkyrie-lmh.jsonl --steps 2048 --updates 400 --envs 32 --workers 8

Benchmark your Spa GTP binary (check lap time, max speed, 0% overlap, straight braking):
python -u scripts/benchAndAudit.py --car-class HYPERCAR_GTP --tracks spa-francorchamps

Stage 2 — Transfer perfected Spa GTP model to all tracks (full-lap pace -> racecraft):
Bash
python -u scripts/trainPPO.py --car-class HYPERCAR_GTP --init-from public/models/policies/class_hypercar_gtp.bin --updates 800 --envs 32 --workers 8


Train GT3 from your Laguna Seca Porsche telemetry (clean fast sectors auto-filtered):
Bash
python -u scripts/trainPPO.py --car-class GT3 --tracks laguna-seca --solo-only --bc-dataset telemetry_laguna-seca_porsche-911-gt3-r.jsonl --steps 2048 --updates 400 --envs 32 --workers 8





All requested fixes, physics/AI updates, UI overhauls, and backlog updates are complete and verified (tsc --noEmit, production build, and all 69 unit tests pass).
Summary of Changes
Preloading, Audio & Core Bugs: Preloaded car models/rigs and compiled shaders upfront before countdown starts (eliminating first-race stutter), stripped noisy console warnings, fixed AudioContext gesture unlock + 60Hz mute-state localStorage spam + NaN guards, fixed multiclass grid partitioning so every active class (including the player's) spawns in proper fastest-to-slowest class bands, and completely removed Safety Car/VSC and jump-start penalties.
Single-Model AI Personalities & Full-Push Pace: Migrated all AI personalities to use the single v2 model with distinct inference-time modifiers (brakeBias, throttleSmoothness, steerAggression, apexOffsetBias, overtakeAggression, defenseIntensity, ersAggression) instead of mixing v1/v2; removed all rubberbanding so AI always runs on full push; made AI deploy ERS aggressively on straights and corner exits.
Physics-Obeying Alien & Target Ghosts: Replaced constant-speed centerline target ghosts with headless simulated flying laps driven through the actual physics and neural AI engine (cached per track/car/tier/wetness).
Tracks, Banking, Thermals & BoP: Fixed Zandvoort's inverted T3 Hugenholtzbocht banking (+15° left-hand banking, -14.5° right-hand T14), revised all 43 circuit widths to authentic racingcircuits.info dimensions (e.g., Monaco 7.5m, Spa 13.5m) and smoothed Spa's Eau Rouge/Raidillon and Blanchimont so they run flat-out, slowed tyre/brake thermal transfer (~3.5× slower brakes, realistic warm-up/cool-down) with meaningful cold/overheated grip & brake-fade penalties, and rebalanced BoP/power/aero toward realistic lap times (GTP Spa ~2:00s).
Flags, Penalties & Timing: Added 18 microsectors (6 per sector) so "YELLOW FLAG IN YOUR SECTOR" and yellow-flag overtaking penalties only trigger inside an active yellow microsector while keeping the general Yellow S1 | Clear S2 | Clear S3 bar; added a clear yield banner showing exact slow-down time and/or position to give back; reset S2/S3 to --- once S1 is crossed on a new lap; fixed relative timing signs/colors so cars behind always show +X.Xs in neutral slate (never green) and cars ahead show -X.Xs in rose.
HUD, Menus & Backlog: Split the driving HUD into 4 distinct modules (Tyres & Brakes, Fuel in liters + % with no fuel temperature, Gear / Speed / RPM, and Damage); removed "Return to Hub" from Pause and Results sub-menus so it appears only in the Main Menu; added "Go to Legacy Version" next to Settings with a confirmation popup ("Low poly assets, different physics, unmaintained") redirecting to https://marc-mas.ddns.net/Apex-Miniature-Legacy/; added "Get Mecachrome'd" (1/1000 player-only 5-second engine failure) to the project backlog without implementing it.
WebSocket Connection Error Investigation (No Code Edited)
What is causing the constant error:
Unconditional auto-connect + infinite 2.5s retry loop: On initial app mount, the app unconditionally creates new MultiplayerClient(), whose constructor immediately opens a WebSocket to wss://<host><basePath>ws (e.g. wss://marc-mas.ddns.net/Apex-Miniature/ws) even when playing single-player. Whenever the handshake fails or closes, socket.onclose schedules another reconnect every 2500ms forever—producing continuous console errors.
Dev-mode note: The custom upgrade handler also destroys any WebSocket upgrade whose path doesn't end in /ws, which breaks Vite's own HMR WebSocket if running in dev mode.
Is it your Caddy reverse proxy setup?
Not a missing WebSocket header: Caddy v2 handles WebSocket Upgrade and Connection headers automatically in reverse_proxy—you do not need manual header_up directives.
Most likely Caddy/deployment causes to check:
Static file_server instead of reverse_proxy: If Caddy serves dist/ statically for /Apex-Miniature/* rather than proxying to your Node server (port 3000), /Apex-Miniature/ws hits the file server and fails with 404/400.
Partial path proxying or path stripping: If Caddy only proxies /Apex-Miniature/api/* (forgetting /Apex-Miniature/ws), or rewrites the path so it no longer ends in /ws, the Node server rejects the upgrade.
Backend process not running: Ensure node server.js is running on port 3000 and that Caddy routes /Apex-Miniature/ws (or all of /Apex-Miniature/*) via reverse_proxy 127.0.0.1:3000 (if using handle_path /Apex-Miniature/*, /Apex-Miniature/ws strips cleanly to /ws, which the server accepts).