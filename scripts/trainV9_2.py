#!/usr/bin/env python3
"""
Apex Miniature — v9_2 Physics-Aware AI Policy Trainer Launcher
Pre-tuned for AMD Ryzen 7 9800X3D (8c/16t, 96MB 3D V-Cache) + NVIDIA RTX 4060 (8GB VRAM).

Trains a 59-input ResMLP (3x192 + LayerNorm + ObsNorm) directly against the overhauled
physics engine: 4-wheel tire temps/wear/flat-spots/graining, brake fade & lock-up,
dirty air, wet/drying line & puddles, gravel/sausage kerbs, crest unloading,
localized damage, car setups, and Blue Flag / Safety Car compliance.

Usage:
  python scripts/trainV9_2.py                 # Full recommended 2,500-update run (~2-3 hrs)
  python scripts/trainV9_2.py --quick         # Fast 400-update validation run (~20 mins)
  python scripts/trainV9_2.py --resume        # Continue from existing v9_2 weights
  python scripts/trainV9_2.py --updates 4000 --envs 120 --workers 14
"""

import argparse
import os
import shutil
import subprocess
import sys


def check_environment() -> str:
    """Checks Python/PyTorch CUDA availability and Node/npx availability."""
    device = "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f"[v9_2 Launcher] CUDA GPU detected: {gpu_name} ({vram_gb:.1f} GB VRAM)")
            device = "cuda"
        else:
            print(
                "[v9_2 Launcher] WARNING: PyTorch CUDA not detected — falling back to CPU.\n"
                "  To enable your RTX 4060, install CUDA PyTorch:\n"
                "  pip install --upgrade torch --index-url https://download.pytorch.org/whl/cu124"
            )
    except ImportError:
        print("[v9_2 Launcher] ERROR: PyTorch is not installed. See TRAINING_GUIDE.md.")
        sys.exit(1)

    npx_bin = "npx.cmd" if os.name == "nt" else "npx"
    if shutil.which(npx_bin) is None:
        print(f"[v9_2 Launcher] ERROR: '{npx_bin}' not found on PATH. Install Node.js 20+ first.")
        sys.exit(1)

    return device


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Launch v9_2 physics-aware PPO training tuned for Ryzen 7 9800X3D + RTX 4060"
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Short 400-update smoke/validation run to verify pipeline speed & metrics",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume training from existing src/game/aiPolicyWeights_v9_2.json instead of --scratch",
    )
    parser.add_argument(
        "--updates",
        type=int,
        default=None,
        help="Total PPO updates (default: 2500 full, 400 with --quick)",
    )
    parser.add_argument(
        "--envs",
        type=int,
        default=96,
        help="Total parallel sim environments across workers (default: 96 for 9800X3D)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=12,
        help="OS Node/tsx worker processes (default: 12 for 9800X3D 8c/16t)",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=512,
        help="Rollout steps per env before each PPO update (default: 512)",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="Override compute device: auto, cuda, or cpu",
    )
    parser.add_argument(
        "--tracks",
        nargs="*",
        default=None,
        help="Optional track subset IDs for targeted fine-tuning",
    )
    parser.add_argument(
        "--cars",
        nargs="*",
        default=None,
        help="Optional car subset IDs for targeted fine-tuning",
    )
    args = parser.parse_args()

    detected_device = check_environment()
    device = detected_device if args.device == "auto" else args.device
    updates = args.updates if args.updates is not None else (400 if args.quick else 2500)

    cpu_threads = os.cpu_count() or 8
    workers = max(1, min(args.workers, cpu_threads, args.envs))

    cmd = [
        sys.executable,
        os.path.join("scripts", "trainPPO.py"),
        "--variant",
        "v9_2",
        "--envs",
        str(args.envs),
        "--workers",
        str(workers),
        "--steps",
        str(args.steps),
        "--updates",
        str(updates),
        "--device",
        device,
    ]

    weights_file = os.path.join("src", "game", "aiPolicyWeights_v9_2.json")
    if not args.resume and not os.path.exists(weights_file):
        cmd.append("--scratch")
    elif not args.resume and os.path.exists(weights_file):
        print(
            f"[v9_2 Launcher] Found existing {weights_file} — resuming automatically. "
            "Pass trainPPO.py --scratch directly if you want to wipe and start over."
        )

    if args.tracks:
        cmd.extend(["--tracks", *args.tracks])
    if args.cars:
        cmd.extend(["--cars", *args.cars])

    print(
        f"[v9_2 Launcher] Starting 59-dim physics-aware PPO training:\n"
        f"  Command: {' '.join(cmd)}\n"
        f"  Outputs: src/game/aiPolicyWeights_v9_2.json & .bin\n"
        f"  Tip: Once saved, refresh the game — 'v9_2' unlocks automatically in AI Policy Mix!"
    )

    # Keep PyTorch CPU threads low so the 12 Node physics workers own the 9800X3D cores cleanly
    env = os.environ.copy()
    env.setdefault("OMP_NUM_THREADS", "2")
    env.setdefault("MKL_NUM_THREADS", "2")

    raise SystemExit(subprocess.call(cmd, env=env))


if __name__ == "__main__":
    main()
