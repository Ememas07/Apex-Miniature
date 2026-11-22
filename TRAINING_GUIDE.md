# Apex Miniature — `v9_2` Physics-Aware AI Policy Training Guide

This guide walks you through training the **`v9_2`** neural driving policy against the new advanced physics engine on your **AMD Ryzen 7 9800X3D + NVIDIA RTX 4060 (8GB)** rig.

---

## 1. What Makes `v9_2` Different from `v9`?

- **59-Input Physics-Aware Observation Vector** (vs. 43 inputs in `v5`–`v9`):
  - **43 canonical features**: track lookahead curvature, heading/lateral errors, 8-sector traffic radar, speed/slip, car BoP capability.
  - **16 new advanced physics features**:
    1. Per-corner 4-wheel average tire wear & front/rear thermal balance
    2. Tire overheating / cold-bite delta & max flat-spot / graining severity
    3. Front & rear brake temperatures + brake fade factor
    4. Brake wheel lock-up intensity
    5. Dirty air / turbulent wake strength ahead
    6. Local track wetness & standing-water puddle intensity
    7. Track rubbering grip evolution
    8. Surface classification penalty (gravel, grass, sausage kerb, astroturf)
    9. Elevation crest unloading / dip compression load factor
    10. Localized mechanical damage (front wing, rear wing, engine, suspension + steering pull)
    11. Blue Flag yielding & Safety Car / VSC speed-limit compliance
- **Upgraded Network**: `59 → 192 → 192 → 192 → 3` ResMLP with LayerNorm, Observation Normalization (`ObsNorm`), and orthogonal initialization.
- **Domain Randomization in `headlessEnv.ts`**: Episodes randomize dry/wet tracks (30% wet), drying line vs. off-line puddles, track rubbering, track temperature, realistic vs. light damage, ABS (`off` / `low`), and realistic car setup variations.
- **Zero-Friction Game Integration**: As soon as `src/game/aiPolicyWeights_v9_2.json` (and its `.bin` companion) is written by the trainer, refresh or rebuild the game — **`v9_2`** automatically unlocks in the **AI Policy Mix** panel!

---

## 2. Why Your Hardware (9800X3D + RTX 4060) Is Ideal

- **Ryzen 7 9800X3D (8 cores / 16 threads, 96MB 3D V-Cache)**: Physics simulation runs across multiple parallel Node.js (`tsx`) worker processes via binary IPC. The 9800X3D's massive L3 cache keeps the track spline tables and 96 concurrent cars hot in cache. `12` workers with `96` parallel envs saturates the CPU cleanly while leaving headroom for Windows + Python + CUDA.
- **NVIDIA RTX 4060 (8GB VRAM)**: Handles the batched `49,152`-sample PPO updates (`96 envs × 512 steps`) in milliseconds using TF32/high-precision FP32 Tensor Cores (`torch.set_float32_matmul_precision("high")`), using < 1.2 GB VRAM.

---

## 3. One-Time Setup (Windows PowerShell)

Open **PowerShell** in the project root folder (the folder containing `package.json`).

### Step A — Verify Node.js & Install Project Dependencies
```powershell
node -v        # Should be v20.x or v22.x
npm install
```

### Step B — Create a Python Virtual Environment (Python 3.11 or 3.12 recommended)
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```
*(If PowerShell blocks script activation, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and retry.)*

### Step C — Install PyTorch with CUDA 12.4 + NumPy
```powershell
python -m pip install --upgrade pip
pip install numpy
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

### Step D — Verify Your RTX 4060 Is Visible to PyTorch
```powershell
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')"
```
Expected output: `CUDA: True NVIDIA GeForce RTX 4060`

---

## 4. Running `v9_2` Training

Always activate the virtual environment first (`.\.venv\Scripts\Activate.ps1`).

### 1) Fast Smoke Test (~15–20 minutes, 400 updates)
Verifies workers, binary IPC, GPU speed, and checkpoint saving before committing to a long run:
```powershell
python scripts/trainV9_2.py --quick
```

### 2) Full Recommended `v9_2` Training Run (~2–3 hours, 2,500 updates)
```powershell
python scripts/trainV9_2.py
```
Default parameters tuned for 9800X3D + RTX 4060:
- `--envs 96`
- `--workers 12`
- `--steps 512` (49,152 physics policy steps per update)
- `--updates 2500` (~122M total policy steps across 3 curriculum phases!)
- `--device cuda`

### 3) Pausing & Resuming Later
Press `Ctrl+C` safely at any time — the trainer writes `src/game/aiPolicyWeights_v9_2.json` atomically whenever a new best composite score is reached. To resume from where you left off:
```powershell
python scripts/trainV9_2.py --resume --updates 1500
```

### 4) Pushing Harder (Optional Tuning for Your 9800X3D)
If Task Manager shows CPU usage under 80% during rollouts, you can bump workers and envs:
```powershell
python scripts/trainV9_2.py --envs 112 --workers 14 --updates 3000
```

### 5) Targeted Fine-Tuning on Specific Tracks or Cars
```powershell
python scripts/trainV9_2.py --resume --updates 600 --tracks monaco suzuka spa-francorchamps
```

---

## 5. Monitoring Progress & Using `v9_2` In-Game

- **Live Console Logs**: Prints mean speed (km/h), off-track %, crash %, lap completion count, and best composite score every update.
- **Saved Outputs**:
  - `src/game/aiPolicyWeights_v9_2.json` — Loaded automatically by the game.
  - `src/game/aiPolicyWeights_v9_2.best.json` — Backup of highest-scoring checkpoint.
  - `src/game/aiPolicyWeights_v9_2.bin` — Compact binary `ANB1` weights.
  - `audit/ppo_metrics_v9_2.jsonl` — Full training history log.
- **Using in Apex Miniature**:
  1. Once `src/game/aiPolicyWeights_v9_2.json` exists, restart `npm run dev` (or run `npm run build`).
  2. Open **Race Setup → AI Driving Model Mix**.
  3. **`v9_2`** will now show as active — drag its slider to `100%` (or blend with `v9`)!

---

## 6. Copy-Paste Prompt for Web-Search Gemini (Guided Setup & Troubleshooting)

If you hit any Windows, Python, CUDA, or Node.js issue while setting up or running training, copy and paste this prompt into **Gemini (with Web Search enabled)**:

```text
I am training a custom PyTorch PPO reinforcement learning AI driver ("v9_2") for my local TypeScript/Vite racing game ("Apex Miniature").

My PC specs:
- OS: Windows 11 (PowerShell)
- CPU: AMD Ryzen 7 9800X3D (8 cores / 16 threads, 96MB 3D V-Cache)
- GPU: NVIDIA GeForce RTX 4060 (8GB VRAM)

How the training pipeline works:
- Launcher script: `scripts/trainV9_2.py` (wraps `scripts/trainPPO.py --variant v9_2`)
- Physics workers: Spawns 12 parallel `npx tsx scripts/headlessEnv.ts --binary-ipc` Node.js child processes communicating over binary stdin/stdout pipes.
- Model: 59-dim input -> 3x192 ResMLP with LayerNorm + ObsNorm -> 3 continuous actions (steer, throttle, brake), trained on CUDA (`--device cuda`).
- Output files: `src/game/aiPolicyWeights_v9_2.json` and `.bin`.

Please walk me step-by-step through:
1. Checking my NVIDIA driver / CUDA version and installing the right CUDA-enabled PyTorch wheel for my RTX 4060 on Windows PowerShell inside a `.venv` (use web search to confirm the latest stable PyTorch CUDA wheel URL for Python 3.12 if needed).
2. Verifying `node`, `npx tsx`, and `python scripts/trainV9_2.py --quick` run cleanly without Windows pipe/encoding/execution-policy errors.
3. Interpreting the PPO output logs (explained variance, KL divergence, mean speed km/h, crash %) and troubleshooting any error message I paste to you next.

Wait for me to paste my current terminal output or error after giving the initial setup checklist.
```
