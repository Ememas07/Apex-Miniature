# Apex Miniature — AI Training Guide (New Per-Class & Unified ANB1 `.bin` Models)

This guide covers everything you need to train, warm-start, benchmark, and ship the **new binary (`ANB1 .bin`) neural driving models** using `scripts/trainPPO.py` and `scripts/benchAndAudit.py`.

---

## 1. Current Model Lineup & What Goes Where

All runtime policies live in `public/models/policies/` as compact `ANB1` binary files. Vite automatically generates `/models/policies/manifest.json` from that folder (both in dev and on `npm run build`), so **any new `.bin` file saved there is picked up automatically by the game**.

### A. Per-Class Pace Specialists (`--variant class_pace`, default)
- **Architecture**: 59-dim physics-aware observations → `3 × 192` ResMLP with LayerNorm + ObsNorm → **signed zero-overlap pedal** (`steer`, signed `throttle/brake`)
- **Saved to**: `public/models/policies/class_<slug>.bin` (best backup in `audit/class_<slug>.best.bin`)
- **All 10 Car Classes**:
  | Class ID | Output Binary | Status |
  | :--- | :--- | :--- |
  | `HYPERCAR_GTP` | `class_hypercar_gtp.bin` | Trained (good warm-start base) |
  | `LMP2` | `class_lmp2.bin` | Needs training |
  | `GT3` | `class_gt3.bin` | Needs training |
  | `GT4` | `class_gt4.bin` | Needs training |
  | `F1_2026` | `class_f1_2026.bin` | Needs training |
  | `F1_2021` | `class_f1_2021.bin` | Needs training |
  | `F1_2005` | `class_f1_2005.bin` | Needs training |
  | `FORMULA_E` | `class_formula_e.bin` | Needs training |
  | `TRACK_COUPE` | `class_track_coupe.bin` | Needs training |
  | `SUPERCAR` | `class_supercar.bin` | Needs training |

### B. Unified Multi-Class & Specialist Models
- **`v1`** → `public/models/policies/aiPolicyWeights_v1.bin` — 59-dim Physics Master (`3 × 192` ResMLP, dry/wet, wear, brakes, damage)
- **`v2`** → `public/models/policies/aiPolicyWeights_v2.bin` — 59-dim Racecraft & Turn-1 Master (tight packs, multi-class traffic, blue flags, cold-tire braking)
- **`starts`** → `public/models/policies/aiPolicyWeights_starts.bin` — 43-dim Grid Launch & Turn-1 Specialist (`2 × 128` ResMLP, standing & rolling starts)

---

## 2. One-Time Environment Setup (Windows PowerShell)

Run these commands from the project root folder (where `package.json` lives):

```powershell
# 1. Install Node.js dependencies (Node 20+ or 22+)
npm install

# 2. Create & activate Python 3.12 virtual environment
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
# (If blocked by execution policy, run once: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned)

# 3. Install NumPy + CUDA-enabled PyTorch (for NVIDIA RTX GPUs)
python -m pip install --upgrade pip
pip install numpy
pip install torch --index-url https://download.pytorch.org/whl/cu124

# 4. Confirm CUDA GPU visibility
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

---

## 3. Training Workflows (Step-by-Step)

Always activate `.venv` first (`.\.venv\Scripts\Activate.ps1`). Use `python -u` so logs flush immediately.

### Step 1 — Quick Smoke Test (verify pipeline & GPU speed)
Runs 400 updates (~10–15 min) on a single class:
```powershell
python -u scripts/trainPPO.py --car-class GT3 --quick --device cuda
```

### Step 2 — Train Individual Per-Class Models (Recommended: Transfer from `class_hypercar_gtp.bin`)
Warm-starting new classes from your already-trained `class_hypercar_gtp.bin` skips the slow early "learning to stay on track" phase and converges much faster:

```powershell
# Example: train GT3 (warm-started from Hypercar GTP)
python -u scripts/trainPPO.py --car-class GT3 --init-from public/models/policies/class_hypercar_gtp.bin --updates 1500 --device cuda

# Example: train F1 2026
python -u scripts/trainPPO.py --car-class F1_2026 --init-from public/models/policies/class_hypercar_gtp.bin --updates 1500 --device cuda

# Example: train LMP2
python -u scripts/trainPPO.py --car-class LMP2 --init-from public/models/policies/class_hypercar_gtp.bin --updates 1500 --device cuda
```

Repeat for the remaining classes (`GT4`, `F1_2021`, `F1_2005`, `FORMULA_E`, `TRACK_COUPE`, `SUPERCAR`), or use the batch command below.

### Step 3 — Overnight Batch: Train All 10 Classes Sequentially
```powershell
python -u scripts/trainPPO.py --car-class all --updates 1500 --device cuda
```
*(By default, any class that already has a `.bin` file will resume from it rather than starting from zero. Add `--scratch` only if you want to discard existing weights for a target.)*

### Optional A — Behavioral Cloning (BC) Warm-Start from Human Telemetry
If you recorded human laps (`.jsonl` telemetry files in the project root or `audit/human_demos.jsonl`), you can pre-train the actor via sector-filtered Behavioral Cloning before PPO fine-tuning:

```powershell
python -u scripts/trainPPO.py --car-class HYPERCAR_GTP --bc-dataset telemetry_spa-francorchamps_ferrari-499p.jsonl   --bc-epochs 18  --bc-anchor-coef 0.08 --updates 1500 --device cuda
```

### Optional B — Two-Stage Track Mastery (Single-Track Solo → All Tracks)
To dial in pure pace on one flagship circuit first, then generalize to all 43 circuits:
```powershell
# Stage 1: Solo full-lap pace on Spa
python -u scripts/trainPPO.py --car-class GT3 --solo-only --tracks spa-francorchamps --updates 800 --device cuda

# Stage 2: Generalize across all tracks & traffic
python -u scripts/trainPPO.py --car-class GT3 --init-from public/models/policies/class_gt3.bin --updates 1500 --device cuda
```

### Optional C — Retrain / Fine-Tune Unified `v1`, `v2`, or `starts`
```powershell
# Retrain v2 (multi-class racecraft, Turn-1 discipline, wet crossovers)
python -u scripts/trainPPO.py --variant v2 --updates 2500 --device cuda

# Retrain v1 (physics master)
python -u scripts/trainPPO.py --variant v1 --updates 2500 --device cuda

# Retrain starts (standing/rolling grid launches)
python -u scripts/trainPPO.py --variant starts --updates 1200 --device cuda

# Train both v1 and v2 sequentially
python -u scripts/trainPPO.py --variant all --device cuda
```

---

## 4. Pausing, Resuming & Hardware Tuning

- **Safe Pause**: Press `Ctrl+C` at any time. Checkpoints are written atomically to `public/models/policies/<model>.bin` (and best backup in `audit/`).
- **Resume**: Run the exact same command **without** `--scratch` and `--init-from`; `trainPPO.py` automatically loads the existing `.bin` and continues training.
- **Default Hardware Settings** (tuned for Ryzen 7 9800X3D + RTX 4060):
  - `class_pace`: `--envs 64 --workers 12 --steps 1024 --updates 1500`
  - `v1` / `v2`: `--envs 96 --workers 12 --steps 512 --updates 2500`
  - `starts`: `--envs 48 --workers 8 --steps 512 --updates 1200`
- **If CPU usage is below ~80%**, increase `--workers` / `--envs` (e.g. `--workers 14 --envs 80`). If RAM/CPU is saturated, lower `--workers 8 --envs 48`.
- **Fallback IPC**: Binary IPC is enabled by default for maximum speed. Only add `--no-binary-ipc` if debugging pipe issues.

---

## 5. Benchmarking & Auditing Trained Models

After training a model, run deterministic benchmarks with `scripts/benchAndAudit.py` to check lap times, off-track %, crash %, and average speed:

```powershell
# Audit a single class across benchmark circuits
python -u scripts/benchAndAudit.py --car-class GT3

# Audit a single class on one specific track
python -u scripts/benchAndAudit.py --car-class HYPERCAR_GTP --tracks spa-francorchamps

# Audit all trained per-class models
python -u scripts/benchAndAudit.py --all-classes

# Audit unified v1 / v2 / starts models
python -u scripts/benchAndAudit.py --all
```

Reports and JSON metrics are saved under `audit/`.

---

## 6. Loading the New Models In-Game

1. Confirm your new `.bin` files exist in `public/models/policies/` (for example `class_gt3.bin`, `class_f1_2026.bin`, etc.).
2. Refresh the browser in `npm run dev` (or run `npm run build` for production) — the Vite policy manifest plugin automatically updates `/models/policies/manifest.json`.
3. Open **Race Setup → AI Policy Mix** to verify the newly trained class models are active and select your preferred mix.
