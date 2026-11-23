# Apex Miniature

**Apex Miniature** is a 3D die-cast miniature sim-cade motorsport racing game inspired by endurance championship racing, historic Formula 1 eras, and classic arcade racers. Built with React, TypeScript, Three.js, Tailwind CSS, Web Audio synthesis, and real-time WebSocket multiplayer.

- **Play Live:** [https://marc-mas.ddns.net/Apex-Miniature/](https://marc-mas.ddns.net/Apex-Miniature/)
- **Hub:** [Marc's Studio Hub](https://marc-mas.ddns.net/)
- **Release History:** See [`CHANGELOG.md`](./CHANGELOG.md)

---

## Key Features

- **Multi-Class Motorsport Roster & Global Circuits:** Race across Hypercar/GTP, LMP2, GT3, GT4, Historic & Modern Formula 1 eras, Touring, and Cup categories on flagship international circuits and custom tracks.
- **Deep Sim-Cade Physics & Strategy:** Realistic tire and brake thermal modeling, aerodynamic downforce & slipstream drafting, wet/drying track rubbering, hybrid ERS deployment, Traction Control (TC 0–3), Stability Control, brake bias, standing/rolling starts, and on-track tactical pit servicing.
- **7 Camera Views & Broadcast Director:** Cycle between Chase Near, Chase Far, T-Cam / Roll Hoop, Cockpit, Hood, Bumper, and Trackside TV Broadcast cameras, complete with Look-to-Apex, Look Back, and dynamic FOV.
- **Instant Replay Theater, Flashback & Photo Mode:** Rewind 5.5 seconds mid-race (`F`), review full races with automatic highlight bookmarks (overtakes, fastest laps, incidents), and capture watermarked PNG screenshots in free-cam Photo Mode (`F9`) with depth-of-field tilt-shift and color grading filters.
- **Dynamic Time-of-Day & Visual FX:** Midday, Dawn, Golden Hour, Dusk, Night, and Dynamic 24-Hour cycles with glowing brake rotors, FIA rain lights, night headlight cones, pooled tire smoke, sparks, exhaust backfires, wet rooster-tail spray, and optional HDR bloom & miniature tilt-shift post-processing.
- **Race Modes & Progression:** Quick Race, Qualifying, Time Trial with ghost laps, Daily Hotlap Challenges, Multi-Round Championships, Scenarios, License Tests, Elimination, AI-vs-AI Spectator Director, and Collector Career progression.
- **Creative Studios 2.0:**
  - **Track Studio:** 2D spline CAD + live 3D preview with Undo/Redo, 10m Snap-to-Grid, Smooth All, SVG/image reference trace underlay, interactive Elevation & Banking profile strip chart, per-node scenery props/runoff/DRS zones, sector splits, and shareable codes.
  - **Livery Studio:** PBR paint finishes (gloss, metallic, matte, satin, chrome, carbon-weave, pearlescent), caliper colors, window tints, multi-layer decal & sponsor stack with L↔R symmetry mirroring, 2D UV painter, diorama lighting switcher, saved per-car garage slots, and `APXLIV:` share codes.
  - **Sound Studio:** Web Audio procedural engine synthesizer with live FFT spectrogram, 1st–8th gear dyno sweep with downshift blips, in-browser reference audio auto-fitting, custom preset library, and `APXSND:` share codes.
- **Online Multiplayer 2.0:** Public Lobby Browser, Quick Match, private room codes, Spectator join-in-progress, Elo & Safety Rating badges, live ping & NTP clock sync, binary telemetry relay with interpolation/auto-ghosting, track voting, lobby chat, and host moderation.
- **Full Accessibility & PWA Support:** 6-tab Settings Suite (Controls & Aids with Live Gamepad/Wheel Axis Tester, Graphics Presets, 7-Channel Audio Mixer + Race Engineer Radio, Camera, HUD Presets/Units, Colorblind Palettes & High-Contrast HUD), Gyroscope/Touch mobile controls, and installable offline-capable Progressive Web App.

---

## Controls

| Action | Default Key / Input |
|---|---|
| **Throttle / Brake** | `W` / `S` or `Up` / `Down` (Gamepad Triggers / Split Pedals) |
| **Steer** | `A` / `D` or `Left` / `Right` (Stick / Wheel / Touch / Gyro) |
| **Shift Up / Down** | `E` / `Q` (Manual & Semi-Auto modes) |
| **Class Special (DRS / Aero / Boost)** | `Space` |
| **Cycle ERS Mode / Traction Control** | `B` / `T` |
| **Brake Bias Rear / Front** | `[` / `]` |
| **Cycle MFD Telemetry Page** | `Tab` |
| **Cycle Camera (7 Views) / Look Back** | `C` / Hold `V` |
| **Instant Flashback (-5.5s)** | `F` |
| **Photo Mode Studio** | `F9` (`WASD`+`Q`/`E` fly, Drag orbit) |
| **Quick Restart / Cycle HUD / Nametags** | `Shift+R` / `H` / `N` |
| **Mute Audio / Pause Menu** | `M` / `P` or `Esc` |

All keyboard bindings, gamepad deadzones/linearity/rumble, and touch layouts are customizable in **Settings**.

---

## Development

```bash
npm install
npm run dev       # Express + WebSocket + Vite dev server on port 3000
npm test          # Run unit & physics test suite (Vitest)
npm run build     # Production build with PWA service worker generation
npm run lint      # TypeScript typecheck
```

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4
- **3D Rendering:** Three.js (procedural PBR materials, instanced VFX, custom post-processing)
- **Audio:** Web Audio API procedural multi-harmonic engine, spatial Doppler opponent synth & surface foley
- **Multiplayer Backend:** Express + Node.js WebSocket Server (`ws`) with binary telemetry protocol
- **PWA:** `vite-plugin-pwa` (Workbox offline caching & standalone manifest)