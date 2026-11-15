# Apex Miniature 🏎️✨

**Apex Miniature** is a 3D die-cast miniature sim-cade motorsport racing game inspired by iRacing and classic arcade racers. Built with React, Three.js, Tailwind CSS, and WebSocket multiplayer, created with **Gemini 4 Hydrogen** in Google AI Studio.

🕹️ **Play Live**: [https://marc-mas.ddns.net/Apex-Miniature/](https://marc-mas.ddns.net/Apex-Miniature/)  
🏠 **Hub**: [Marc's Gemini Studio Hub](https://marc-mas.ddns.net/)

---

## 🏁 Key Features

- **57 Unique Cars & 43 Circuits**: Multi-class racing spanning Modern Prototypes, GT3, Classic Open-Wheel, F1 eras, and Rallycross.
- **Physics & Simulation**: Tire wear, fuel consumption, drafting, aerodynamic downforce, and dynamic weather conditions.
- **Full Pit Strategy**: Plan tire compound changes (Soft/Medium/Hard/Wet) and refueling stops.
- **Interactive Garage & Livery Studio**: Customize car paints, sponsor decals, finishes, and tuning setups.
- **Adaptive AI Evolution**: Grid AI drivers dynamically adapt and balance to player skill and race aggression.
- **Real-Time Multiplayer**: WebSocket room-code matchmaking for peer-to-peer competitive races.

---

## 🎮 Controls

| Action | Key / Input |
|---|---|
| **Steer & Throttle** | `W` `A` `S` `D` or `Arrow Keys` |
| **Brake / Reverse** | `S` or `Down Arrow` |
| **Class Special / Boost** | `Spacebar` |
| **Cycle Camera** | `C` |
| **Toggle Audio** | `M` |
| **Pause Race** | `P` or `Esc` |

---

## 🛠️ Tech Stack

- **Framework:** React 19 + TypeScript + Vite
- **3D Graphics:** Three.js with custom procedural PBR shaders and dynamic lighting
- **Styling:** Tailwind CSS v4
- **Multiplayer:** Node.js WebSocket Server (`ws`)
- **Engine Sound:** Web Audio API Procedural Synthesizer