#!/usr/bin/env python3
"""
Apex Miniature — Unified Reinforcement Learning Policy Trainer (PPO)

Trains neural driving policies across full circuits and multi-class car grids.
Supports 4 specialized model variants (v1..v4) and custom parameter overrides.
"""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
import os
import shutil
import subprocess
import sys
import time

import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Normal

OBS_DIM = 43
ACT_DIM = 3
CLASS_ORDER = ["F1", "Hypercar", "LMP2", "GT3", "GT4", "Other"]
SELFPLAY_SNAPSHOT_INTERVAL = 150
SELFPLAY_POOL_MAX = 8

VARIANTS = {
    "v1": {
        "name": "v1_clean_apex",
        "description": "Safety, survival, anti-stall, higher off-track & wall crash penalties",
        "hidden_dim": 64,
        "weights": os.path.join("src", "game", "aiPolicyWeights_v1.json"),
        "backup": os.path.join("src", "game", "aiPolicyWeights_v1.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v1.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v1.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v1"),
        "curriculum": False,
        "rewards": {
            "forwardProgress": 0.45,
            "closeProximity": 0.10,
            "minSpeedThreshold": 15.0,
            "minSpeedPenalty": 0.12,
            "floorSpeedThreshold": 25.0 / 3.6,
            "floorSpeedPenalty": 0.45,
            "offTrackBase": 1.2,
            "offTrackSlope": 0.40,
            "steerJerk": 0.06,
            "throttleBrakeOverlap": 0.15,
            "carCrash": 8.5,
            "wallCrash": 9.0,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.35,
        },
    },
    "v2": {
        "name": "v2_momentum",
        "description": "Minimum speed preservation, jerk reduction, throttle/brake overlap penalty",
        "hidden_dim": 64,
        "weights": os.path.join("src", "game", "aiPolicyWeights_v2.json"),
        "backup": os.path.join("src", "game", "aiPolicyWeights_v2.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v2.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v2.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v2"),
        "curriculum": False,
        "rewards": {
            "forwardProgress": 0.50,
            "closeProximity": 0.06,
            "minSpeedThreshold": 18.0,
            "minSpeedPenalty": 0.14,
            "floorSpeedThreshold": 10.0,
            "floorSpeedPenalty": 0.35,
            "decelThreshold": 0.40,
            "decelPenalty": 0.25,
            "offTrackBase": 1.0,
            "offTrackSlope": 0.30,
            "steerJerk": 0.22,
            "throttleBrakeOverlap": 0.30,
            "carCrash": 4.5,
            "wallCrash": 7.5,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.20,
        },
    },
    "v3": {
        "name": "v3_aggressive_pace",
        "description": "128-hidden unit MLP, high apex speed, kerb-riding tolerance",
        "hidden_dim": 128,
        "weights": os.path.join("src", "game", "aiPolicyWeights_v3.json"),
        "backup": os.path.join("src", "game", "aiPolicyWeights_v3.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v3.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v3.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v3"),
        "curriculum": False,
        "rewards": {
            "forwardProgress": 0.60,
            "closeProximity": 0.06,
            "minSpeedThreshold": 15.0,
            "minSpeedPenalty": 0.08,
            "offTrackBase": 0.8,
            "offTrackSlope": 0.22,
            "steerJerk": 0.04,
            "throttleBrakeOverlap": 0.15,
            "carCrash": 4.5,
            "wallCrash": 5.0,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.12,
        },
    },
    "v4": {
        "name": "v4_curriculum",
        "description": "2-phase curriculum: 45-60% solo hotlap followed by traffic ramp",
        "hidden_dim": 64,
        "weights": os.path.join("src", "game", "aiPolicyWeights_v4.json"),
        "backup": os.path.join("src", "game", "aiPolicyWeights_v4.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v4.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v4.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v4"),
        "curriculum": True,
        "rewards": {
            "forwardProgress": 0.45,
            "closeProximity": 0.06,
            "minSpeedThreshold": 15.0,
            "minSpeedPenalty": 0.08,
            "offTrackBase": 1.0,
            "offTrackSlope": 0.35,
            "steerJerk": 0.06,
            "throttleBrakeOverlap": 0.15,
            "carCrash": 4.5,
            "wallCrash": 5.0,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.18,
        },
    },
}

# Alias map for convenient variant naming
VARIANT_ALIASES = {
    "1": "v1", "v1": "v1", "v1_clean_apex": "v1", "clean_apex": "v1",
    "2": "v2", "v2": "v2", "v2_momentum": "v2", "momentum": "v2",
    "3": "v3", "v3": "v3", "v3_aggressive_pace": "v3", "aggressive_pace": "v3",
    "4": "v4", "v4": "v4", "v4_curriculum": "v4", "curriculum": "v4",
}


class ActorCritic(nn.Module):
    def __init__(self, obs_dim: int = OBS_DIM, act_dim: int = ACT_DIM, hidden_dim: int = 64, init_log_std: float = -0.7):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.actor = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, act_dim),
        )
        self.log_std = nn.Parameter(torch.full((act_dim,), init_log_std))

        self.critic = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, obs: torch.Tensor):
        mean = self.actor(obs)
        std = torch.exp(torch.clamp(self.log_std, -2.5, 0.2))
        value = self.critic(obs).squeeze(-1)
        return mean, std, value

    def get_action_and_value(self, obs: torch.Tensor, action: torch.Tensor | None = None):
        mean, std, value = self.forward(obs)
        dist = Normal(mean, std)
        if action is None:
            action = dist.sample()
        log_prob = dist.log_prob(action).sum(dim=-1)
        entropy = dist.entropy().sum(dim=-1)
        return action, log_prob, entropy, value, mean


def load_actor_from_json(model: ActorCritic, path: str, hidden_dim: int) -> tuple[bool, float]:
    if not os.path.exists(path):
        return False, -1e9
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        if d.get("version", 1) < 2:
            print(f"Skipping {path}: legacy v1 tanh-bounded weights incompatible with full-pedal v2 policy")
            return False, -1e9
        if len(d.get("w0", [])) != hidden_dim:
            print(f"Skipping {path}: hidden dim {len(d.get('w0', []))} != {hidden_dim}")
            return False, -1e9
        layers = [m for m in model.actor if isinstance(m, nn.Linear)]
        with torch.no_grad():
            layers[0].weight.copy_(torch.tensor(d["w0"], dtype=torch.float32))
            layers[0].bias.copy_(torch.tensor(d["b0"], dtype=torch.float32))
            layers[1].weight.copy_(torch.tensor(d["w1"], dtype=torch.float32))
            layers[1].bias.copy_(torch.tensor(d["b1"], dtype=torch.float32))
            layers[2].weight.copy_(torch.tensor(d["w2"], dtype=torch.float32))
            layers[2].bias.copy_(torch.tensor(d["b2"], dtype=torch.float32))
        prev_best = float(d.get("meta", {}).get("meanStepReward", -1e9))
        return True, prev_best
    except Exception as e:
        print(f"Error loading {path}: {e}")
        return False, -1e9


def export_actor_to_json(model: ActorCritic, path: str, metadata: dict, variant_name: str, hidden_dim: int, backup_path: str | None = None):
    layers = [m for m in model.actor if isinstance(m, nn.Linear)]
    meta_with_ts = dict(metadata)
    meta_with_ts["variant"] = variant_name
    meta_with_ts["savedAt"] = datetime.now(timezone.utc).isoformat()
    payload = {
        "version": 2,
        "obsDim": OBS_DIM,
        "actDim": ACT_DIM,
        "hiddenDim": hidden_dim,
        "w0": layers[0].weight.detach().cpu().tolist(),
        "b0": layers[0].bias.detach().cpu().tolist(),
        "w1": layers[1].weight.detach().cpu().tolist(),
        "b1": layers[1].bias.detach().cpu().tolist(),
        "w2": layers[2].weight.detach().cpu().tolist(),
        "b2": layers[2].bias.detach().cpu().tolist(),
        "meta": meta_with_ts,
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    os.replace(tmp_path, path)
    if backup_path:
        os.makedirs(os.path.dirname(os.path.abspath(backup_path)), exist_ok=True)
        shutil.copy2(path, backup_path)


def save_selfplay_snapshot(model: ActorCritic, pool_dir: str, update: int, metadata: dict, variant_name: str, hidden_dim: int):
    os.makedirs(pool_dir, exist_ok=True)
    ts = int(time.time())
    snap_name = f"snap_{ts}_u{update:05d}.json"
    snap_path = os.path.join(pool_dir, snap_name)
    export_actor_to_json(model, snap_path, metadata, variant_name, hidden_dim, backup_path=None)
    snaps = sorted(f for f in os.listdir(pool_dir) if f.endswith(".json"))
    while len(snaps) > SELFPLAY_POOL_MAX:
        oldest = snaps.pop(0)
        try:
            os.remove(os.path.join(pool_dir, oldest))
        except OSError:
            pass


def write_dashboard_data(
    data_js_path: str,
    variant_name: str,
    history: list[dict],
    best_laps_track_class: dict[tuple[str, str], float],
    best_laps_class: dict[str, tuple[float, str]],
    peak_speed_class: dict[str, float],
):
    os.makedirs(os.path.dirname(os.path.abspath(data_js_path)), exist_ok=True)
    best_laps_track: dict[str, dict] = {}
    for (tid, cid), lt in best_laps_track_class.items():
        if tid not in best_laps_track or lt < best_laps_track[tid]["time"]:
            best_laps_track[tid] = {"time": round(lt, 2), "carClass": cid}

    payload = {
        "variant": variant_name,
        "history": history[-250:],
        "bestLapsClass": {
            cid: {"time": round(lt, 2), "track": tid}
            for cid, (lt, tid) in best_laps_class.items()
        },
        "bestLapsTrack": best_laps_track,
        "peakSpeedsClass": {
            cid: round(spd, 1)
            for cid, spd in peak_speed_class.items()
        },
    }

    tmp_path = data_js_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write("window.PPO_DATA = ")
        json.dump(payload, f)
        f.write(";\n")
    os.replace(tmp_path, data_js_path)


def compute_traffic_mix(update: int, total_updates: int, is_curriculum: bool) -> tuple[int, dict[str, float]]:
    if not is_curriculum:
        return 1, {"soloRatio": 0.20, "scriptedRatio": 0.35, "selfplayRatio": 0.45}

    phase1_frac = 0.60
    target_scripted = 0.35
    target_selfplay = 0.45

    phase1_end = max(1, int(round(phase1_frac * total_updates)))
    if update <= phase1_end:
        return 1, {"soloRatio": 1.0, "scriptedRatio": 0.0, "selfplayRatio": 0.0}

    ramp = (update - phase1_end) / max(1, total_updates - phase1_end)
    ramp = max(0.0, min(1.0, ramp))
    scripted = round(target_scripted * ramp, 4)
    selfplay = round(target_selfplay * ramp, 4)
    solo = round(max(0.0, 1.0 - scripted - selfplay), 4)
    return 2, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}


def spawn_env_worker():
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    return subprocess.Popen(
        [npx_cmd, "tsx", "scripts/headlessEnv.ts"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def resolve_device(dev_str: str | None) -> torch.device:
    dev = (dev_str or "auto").strip().lower()
    cuda_available = torch.cuda.is_available() and torch.cuda.device_count() > 0

    if dev == "auto":
        return torch.device("cuda" if cuda_available else "cpu")

    if dev == "cpu":
        return torch.device("cpu")

    if dev.startswith("cuda"):
        if not cuda_available:
            print(f"[Warning] Requested device '{dev_str}' but no CUDA devices are available. Falling back to CPU.")
            return torch.device("cpu")
        if ":" in dev:
            try:
                idx = int(dev.split(":")[1])
                if idx >= torch.cuda.device_count() or idx < 0:
                    print(f"[Warning] CUDA device index {idx} out of range (device_count={torch.cuda.device_count()}). Falling back to cuda:0.")
                    return torch.device("cuda:0")
                return torch.device(f"cuda:{idx}")
            except ValueError:
                print(f"[Warning] Invalid CUDA device specification '{dev_str}'. Falling back to cuda:0.")
                return torch.device("cuda:0")
        return torch.device("cuda")

    try:
        return torch.device(dev)
    except Exception as e:
        print(f"[Warning] Could not parse device '{dev_str}' ({e}). Falling back to CPU.")
        return torch.device("cpu")


def train_single_variant(var_key: str, args):
    cfg = VARIANTS[var_key]
    var_name = cfg["name"]
    hidden_dim = args.hidden_dim if args.hidden_dim is not None else cfg["hidden_dim"]
    weights_path = args.weights if args.weights else cfg["weights"]
    backup_weights_path = args.backup if args.backup else cfg["backup"]
    metrics_path = args.metrics if args.metrics else cfg["metrics"]
    data_js_path = args.data_js if args.data_js else cfg["data_js"]
    pool_dir = args.pool_dir if args.pool_dir else cfg["pool_dir"]
    is_curriculum = args.curriculum if args.curriculum is not None else cfg["curriculum"]
    reward_weights = cfg["rewards"]

    device = resolve_device(getattr(args, "device", "auto"))
    dev_name_str = ""
    if device.type == "cuda" and torch.cuda.is_available() and torch.cuda.device_count() > 0:
        dev_idx = device.index if device.index is not None else 0
        if dev_idx < torch.cuda.device_count():
            dev_name_str = f" ({torch.cuda.get_device_name(dev_idx)})"

    print(f"\n{'='*70}")
    print(f"[{var_name}] Launching PPO training on device: {device}{dev_name_str}")
    print(f"[{var_name}] Envs: {args.envs} | Steps: {args.steps} | Updates: {args.updates} | HiddenDim: {hidden_dim}")
    print(f"[{var_name}] Target Weights: {weights_path}")
    print(f"{'='*70}")

    from_scratch = args.scratch or not os.path.exists(weights_path)
    init_log_std = -0.7 if from_scratch else -1.6
    model = ActorCritic(obs_dim=OBS_DIM, act_dim=ACT_DIM, hidden_dim=hidden_dim, init_log_std=init_log_std).to(device)

    loaded, prev_best = (False, -1e9) if from_scratch else load_actor_from_json(model, weights_path, hidden_dim)
    if loaded:
        print(f"[{var_name}] Warm-started actor from {weights_path} (previous best reward: {prev_best:+.4f})")
    else:
        from_scratch = True
        print(f"[{var_name}] Training from scratch -> {weights_path}")

    os.makedirs("audit", exist_ok=True)
    os.makedirs(pool_dir, exist_ok=True)
    if not any(f.endswith(".json") for f in os.listdir(pool_dir)):
        save_selfplay_snapshot(model, pool_dir, 0, {"source": f"{var_name}_seed", "update": 0}, var_name, hidden_dim)
        print(f"[{var_name}] Seeded empty self-play pool in {pool_dir}")

    if os.path.exists(metrics_path):
        os.remove(metrics_path)

    critic_lr_start = args.critic_lr if args.critic_lr else 3e-4
    actor_lr_start = args.actor_lr if args.actor_lr else (3e-4 if from_scratch else 8e-5)
    lr_end = 2e-5
    ent_start = 0.012 if from_scratch else 0.004
    ent_end = args.ent_end if args.ent_end is not None else 0.0015
    max_std_start = 0.50 if from_scratch else 0.20
    max_std_end = args.max_std_end if args.max_std_end is not None else 0.12

    optimizer = torch.optim.Adam([
        {"params": list(model.actor.parameters()) + [model.log_std], "lr": actor_lr_start},
        {"params": model.critic.parameters(), "lr": critic_lr_start},
    ], eps=1e-5)

    _, initial_mix = compute_traffic_mix(1, args.updates, is_curriculum)

    worker = spawn_env_worker()
    worker.stdin.write(json.dumps({
        "cmd": "init",
        "numEnvs": args.envs,
        "tracks": args.tracks,
        "cars": args.cars,
        "rewardWeights": reward_weights,
        "trafficMix": initial_mix,
        "weightsPath": weights_path,
        "poolDir": pool_dir,
    }) + "\n")
    worker.stdin.flush()
    init_resp = json.loads(worker.stdout.readline())
    obs = np.array(init_resp["obs"], dtype=np.float32)

    gamma = 0.992
    gae_lambda = 0.95
    clip_coef = 0.2
    vf_coef = 0.5
    epochs = 6
    minibatch_size = max(1, (args.envs * args.steps) // 8)
    critic_warmup_updates = 0 if from_scratch else 60
    phase1_end = max(1, int(round(0.60 * args.updates))) if is_curriculum else 0

    use_reset_best = args.reset_best and not args.no_reset_best
    best_reward = -1e9 if (from_scratch or use_reset_best) else prev_best
    best_laps_track_class: dict[tuple[str, str], float] = {}
    best_laps_class: dict[str, tuple[float, str]] = {}
    peak_speed_class: dict[str, float] = {}
    history: list[dict] = []
    entered_phase2 = False
    t0 = time.time()

    try:
        for update in range(1, args.updates + 1):
            cur_phase, traffic_mix = compute_traffic_mix(update, args.updates, is_curriculum)

            if is_curriculum and cur_phase == 2 and not entered_phase2:
                entered_phase2 = True
                save_selfplay_snapshot(
                    model, pool_dir, update - 1,
                    {"source": f"{var_name}_phase1_grad", "update": update - 1, "curriculumPhase": 1},
                    var_name, hidden_dim,
                )
                best_reward = -1e9
                print(f"[{var_name}] Entering Phase 2 traffic ramp at update {update}/{args.updates} (snapshot pooled, traffic baseline reset)")

            progress = (update - 1) / max(1, args.updates - 1)
            cur_lr = actor_lr_start + progress * (lr_end - actor_lr_start)
            cur_ent_coef = ent_start + progress * (ent_end - ent_start)
            cur_max_std = max_std_start + progress * (max_std_end - max_std_start)

            for param_group in optimizer.param_groups:
                param_group["lr"] = cur_lr

            with torch.no_grad():
                model.log_std.clamp_(max=math.log(cur_max_std))

            obs_buf = np.zeros((args.steps, args.envs, OBS_DIM), dtype=np.float32)
            act_buf = np.zeros((args.steps, args.envs, ACT_DIM), dtype=np.float32)
            logp_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            rew_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            val_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            done_buf = np.zeros((args.steps, args.envs), dtype=np.float32)

            speed_samples: list[float] = []
            lap_times: list[float] = []
            off_track_count = 0
            car_crash_count = 0
            wall_crash_count = 0

            track_stats: dict[str, dict] = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0})
            class_stats: dict[str, dict] = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0})

            for step in range(args.steps):
                obs_buf[step] = obs
                obs_t = torch.tensor(obs, dtype=torch.float32, device=device)
                with torch.no_grad():
                    action_t, logp_t, _, val_t, _ = model.get_action_and_value(obs_t)

                act_buf[step] = action_t.cpu().numpy()
                logp_buf[step] = logp_t.cpu().numpy()
                val_buf[step] = val_t.cpu().numpy()

                actions_clipped = np.clip(act_buf[step], -1.0, 1.0).tolist()
                step_req = {"cmd": "step", "actions": actions_clipped}
                if is_curriculum and update % 20 == 1 and step == 0:
                    step_req["trafficMix"] = traffic_mix

                worker.stdin.write(json.dumps(step_req) + "\n")
                worker.stdin.flush()
                step_resp = json.loads(worker.stdout.readline())

                obs = np.array(step_resp["obs"], dtype=np.float32)
                rewards = np.array(step_resp["rewards"], dtype=np.float32)
                dones = np.array(step_resp["dones"], dtype=np.float32)
                infos = step_resp.get("info") or step_resp.get("infos") or []

                rew_buf[step] = rewards
                done_buf[step] = dones

                for info in infos:
                    spd = float(info.get("speedKmh", info.get("speed", 0.0) * 3.6))
                    tid = info.get("trackId", "unknown")
                    cid = info.get("carClass", "Other")

                    speed_samples.append(spd)
                    track_stats[tid]["speeds"].append(spd)
                    class_stats[cid]["speeds"].append(spd)

                    if info.get("offTrack") or info.get("off_track"):
                        off_track_count += 1
                        track_stats[tid]["off"] += 1
                        class_stats[cid]["off"] += 1

                    if info.get("crashed"):
                        track_stats[tid]["crashes"] += 1
                        class_stats[cid]["crashes"] += 1

                    if info.get("carCrash") or info.get("car_crash"):
                        car_crash_count += 1
                        track_stats[tid]["carCrashes"] += 1
                        class_stats[cid]["carCrashes"] += 1

                    if info.get("wallCrash") or info.get("wall_crash"):
                        wall_crash_count += 1
                        track_stats[tid]["wallCrashes"] += 1
                        class_stats[cid]["wallCrashes"] += 1

                    if info.get("lapTime") is not None:
                        lt = info["lapTime"]
                        lap_times.append(lt)
                        track_stats[tid]["laps"].append(lt)
                        class_stats[cid]["laps"].append(lt)
                        key = (tid, cid)
                        if key not in best_laps_track_class or lt < best_laps_track_class[key]:
                            best_laps_track_class[key] = lt
                        if cid not in best_laps_class or lt < best_laps_class[cid][0]:
                            best_laps_class[cid] = (lt, tid)

                    if cid not in peak_speed_class or spd > peak_speed_class[cid]:
                        peak_speed_class[cid] = spd

            with torch.no_grad():
                next_obs_t = torch.tensor(obs, dtype=torch.float32, device=device)
                _, _, next_val_t = model.forward(next_obs_t)
                next_value = next_val_t.cpu().numpy()

            advantages = np.zeros_like(rew_buf)
            last_gae = 0.0
            for t in reversed(range(args.steps)):
                next_non_terminal = 1.0 - (done_buf[t] if t == args.steps - 1 else done_buf[t])
                next_val = next_value if t == args.steps - 1 else val_buf[t + 1]
                delta = rew_buf[t] + gamma * next_val * next_non_terminal - val_buf[t]
                last_gae = delta + gamma * gae_lambda * next_non_terminal * last_gae
                advantages[t] = last_gae
            returns = advantages + val_buf

            b_obs = torch.tensor(obs_buf.reshape(-1, OBS_DIM), dtype=torch.float32, device=device)
            b_act = torch.tensor(act_buf.reshape(-1, ACT_DIM), dtype=torch.float32, device=device)
            b_logp = torch.tensor(logp_buf.reshape(-1), dtype=torch.float32, device=device)
            b_adv = torch.tensor(advantages.reshape(-1), dtype=torch.float32, device=device)
            b_ret = torch.tensor(returns.reshape(-1), dtype=torch.float32, device=device)

            b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)

            batch_size = args.envs * args.steps
            inds = np.arange(batch_size)

            if update > critic_warmup_updates:
                for _ in range(epochs):
                    np.random.shuffle(inds)
                    for start in range(0, batch_size, minibatch_size):
                        m_inds = inds[start : start + minibatch_size]
                        _, new_logp, entropy, new_val, _ = model.get_action_and_value(b_obs[m_inds], b_act[m_inds])
                        logratio = new_logp - b_logp[m_inds]
                        ratio = torch.exp(logratio)

                        pg_loss1 = -b_adv[m_inds] * ratio
                        pg_loss2 = -b_adv[m_inds] * torch.clamp(ratio, 1.0 - clip_coef, 1.0 + clip_coef)
                        pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                        v_loss = 0.5 * ((new_val - b_ret[m_inds]) ** 2).mean()
                        ent_loss = entropy.mean()

                        loss = pg_loss + vf_coef * v_loss - cur_ent_coef * ent_loss

                        optimizer.zero_grad()
                        loss.backward()
                        nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                        optimizer.step()
            else:
                for _ in range(epochs):
                    np.random.shuffle(inds)
                    for start in range(0, batch_size, minibatch_size):
                        m_inds = inds[start : start + minibatch_size]
                        _, _, _, new_val, _ = model.get_action_and_value(b_obs[m_inds], b_act[m_inds])
                        v_loss = 0.5 * ((new_val - b_ret[m_inds]) ** 2).mean()
                        optimizer.zero_grad()
                        v_loss.backward()
                        nn.utils.clip_grad_norm_(model.critic.parameters(), 0.5)
                        optimizer.step()

            total_steps = args.envs * args.steps
            total_n = max(1, len(speed_samples) if speed_samples else total_steps)
            mean_rew = float(np.mean(rew_buf))
            mean_spd = float(np.mean(speed_samples)) if speed_samples else 0.0
            off_pct = (100.0 * off_track_count / total_n)
            car_crashes_1k = (1000.0 * car_crash_count / total_n)
            wall_crashes_1k = (1000.0 * wall_crash_count / total_n)
            cur_std_avg = float(torch.exp(torch.clamp(model.log_std, -2.5, 0.2)).mean().item())
            best_lap = f"{min(lap_times):.2f}s" if lap_times else "none"
            elapsed_total = time.time() - t0
            sps = int(batch_size * update / max(1e-3, elapsed_total))

            per_track_summary = {}
            for tid, ts in track_stats.items():
                n = len(ts["speeds"])
                per_track_summary[tid] = {
                    "avgSpeed": round(float(np.mean(ts["speeds"])), 1),
                    "bestLap": round(float(min(ts["laps"])), 2) if ts["laps"] else None,
                    "offTrackPct": round(100.0 * ts["off"] / max(1, n), 1),
                    "crashesPer1k": round(1000.0 * ts["crashes"] / max(1, n), 2),
                    "carCrashesPer1k": round(1000.0 * ts["carCrashes"] / max(1, n), 2),
                    "wallCrashesPer1k": round(1000.0 * ts["wallCrashes"] / max(1, n), 2),
                    "samples": n,
                }

            per_class_summary = {}
            for cid, cs in class_stats.items():
                n = len(cs["speeds"])
                per_class_summary[cid] = {
                    "avgSpeed": round(float(np.mean(cs["speeds"])), 1),
                    "maxSpeed": round(float(np.max(cs["speeds"])), 1),
                    "offTrackPct": round(100.0 * cs["off"] / max(1, n), 1),
                    "crashesPer1k": round(1000.0 * cs["crashes"] / max(1, n), 2),
                    "carCrashesPer1k": round(1000.0 * cs["carCrashes"] / max(1, n), 2),
                    "wallCrashesPer1k": round(1000.0 * cs["wallCrashes"] / max(1, n), 2),
                    "samples": n,
                }

            record = {
                "variant": var_name,
                "curriculumPhase": cur_phase,
                "trafficMix": traffic_mix,
                "update": update,
                "totalUpdates": args.updates,
                "meanRew": round(mean_rew, 4),
                "meanSpeed": round(mean_spd, 1),
                "offTrackPct": round(off_pct, 1),
                "carCrashesPer1k": round(car_crashes_1k, 2),
                "wallCrashesPer1k": round(wall_crashes_1k, 2),
                "std": round(cur_std_avg, 3),
                "lr": cur_lr,
                "sps": sps,
                "tracks": per_track_summary,
                "classes": per_class_summary,
            }
            history.append(record)
            with open(metrics_path, "a", encoding="utf-8") as mf:
                mf.write(json.dumps(record) + "\n")

            if update == 1 or update % 2 == 0:
                write_dashboard_data(data_js_path, var_name, history, best_laps_track_class, best_laps_class, peak_speed_class)

            saved_tag = ""
            nominal_min = max(15, critic_warmup_updates + 1) if (not is_curriculum or cur_phase == 1) else phase1_end + 5
            min_save_update = min(args.updates, max(1, critic_warmup_updates + 1)) if args.updates <= 15 else nominal_min
            if update >= min_save_update and mean_rew > best_reward:
                best_reward = mean_rew
                export_actor_to_json(
                    model,
                    weights_path,
                    {
                        "source": f"{var_name}_scratch" if from_scratch else f"{var_name}_finetune",
                        "curriculumPhase": cur_phase,
                        "trafficMix": traffic_mix,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                    var_name,
                    hidden_dim,
                    backup_path=backup_weights_path,
                )
                saved_tag = " [SAVED]"

            if update % SELFPLAY_SNAPSHOT_INTERVAL == 0:
                save_selfplay_snapshot(
                    model, pool_dir, update,
                    {
                        "source": f"{var_name}_snapshot",
                        "curriculumPhase": cur_phase,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                    var_name,
                    hidden_dim,
                )
                saved_tag += " [POOL]"

            cls_tags_map = {
                "F1_2005": "F1", "F1_2021": "F1", "F1_2026": "F1", "F1": "F1",
                "HYPERCAR_GTP": "HY", "Hypercar": "HY",
                "LMP2": "P2",
                "GT3": "GT3",
                "GT4": "GT4",
                "FORMULA_E": "FE",
                "SUPERCAR": "SUP",
                "TRACK_COUPE": "TC",
            }
            cls_tag_speeds = defaultdict(list)
            for cid, cs in class_stats.items():
                if cs["speeds"]:
                    tag = cls_tags_map.get(cid, cid[:4])
                    cls_tag_speeds[tag].extend(cs["speeds"])

            cls_str = " ".join(
                f"{tag}:{float(np.mean(speeds)):5.1f}"
                for tag, speeds in sorted(cls_tag_speeds.items())
            )
            classes_display = cls_str if cls_str else f"all:{mean_spd:5.1f}"
            warmup_tag = " (critic warmup)" if update <= critic_warmup_updates else ""
            mix_tag = (
                f" P{cur_phase}(solo:{int(round(traffic_mix['soloRatio']*100))}%/scr:{int(round(traffic_mix['scriptedRatio']*100))}%/sp:{int(round(traffic_mix['selfplayRatio']*100))}%)"
                if is_curriculum
                else ""
            )
            line1 = (
                f"[{var_name}] Update {update:04d}/{args.updates}{mix_tag} | Rew: {mean_rew:+.3f} | "
                f"Off: {off_pct:4.1f}% | Cr(Car/Wall): {car_crashes_1k:.2f}/{wall_crashes_1k:.2f} | "
                f"Spd: {mean_spd:5.1f} km/h | {sps:,} steps/s{warmup_tag}{saved_tag}"
            )
            line2 = (
                f"  Total Avg: {mean_spd:5.1f} km/h | Classes: [{classes_display}] | BestLap: {best_lap:>7}"
            )
            print(f"{line1}\n{line2}")
    finally:
        worker.terminate()


def main():
    parser = argparse.ArgumentParser(description="Apex Miniature: Unified Reinforcement Learning Policy Trainer (PPO)")
    parser.add_argument("--variant", "-v", default="v1", help="Policy variant preset: v1, v2, v3, v4, or all (default: v1)")
    parser.add_argument("--all", action="store_true", help="Sequentially train all 4 policy variants (v1..v4)")
    parser.add_argument("--envs", type=int, default=32, help="Number of parallel headlessEnv subprocess workers (default: 32)")
    parser.add_argument("--steps", type=int, default=256, help="Rollout steps per worker before PPO update (default: 256)")
    parser.add_argument("--updates", type=int, default=1000, help="Total PPO updates (default: 1000)")
    parser.add_argument("--tracks", nargs="*", default=None, help="Optional subset of track IDs for targeted fine-tuning")
    parser.add_argument("--cars", nargs="*", default=None, help="Optional subset of car IDs for targeted fine-tuning")
    parser.add_argument("--scratch", action="store_true", help="Ignore existing weights and train from zero")
    parser.add_argument("--reset-best", action="store_true", help="Allow overwriting checkpoint even if reward baseline changed")
    parser.add_argument("--no-reset-best", action="store_true", help="Disallow overwriting checkpoint if reward baseline changed")
    parser.add_argument("--actor-lr", type=float, default=None, help="Override starting actor learning rate")
    parser.add_argument("--critic-lr", type=float, default=None, help="Override starting critic learning rate")
    parser.add_argument("--hidden-dim", type=int, default=None, help="Override hidden units in actor and critic MLPs")
    parser.add_argument("--ent-end", type=float, default=None, help="Override floor entropy bonus coefficient")
    parser.add_argument("--max-std-end", type=float, default=None, help="Override exploration std floor")
    parser.add_argument("--weights", default=None, help="Override target weights JSON path")
    parser.add_argument("--backup", default=None, help="Override backup weights JSON path")
    parser.add_argument("--metrics", default=None, help="Override metrics JSONL path")
    parser.add_argument("--data-js", default=None, help="Override dashboard JS path")
    parser.add_argument("--pool-dir", default=None, help="Override selfplay snapshot directory")
    parser.add_argument("--curriculum", action="store_true", default=None, help="Enable 2-phase curriculum training")
    parser.add_argument("--no-curriculum", action="store_false", dest="curriculum", help="Disable curriculum training")
    parser.add_argument("--device", default="auto", help="Compute device for PPO model: auto, cpu, cuda, or cuda:<idx> (default: auto)")
    args = parser.parse_args()

    if args.all or args.variant.lower() == "all":
        selected_variants = ["v1", "v2", "v3", "v4"]
    else:
        norm_key = VARIANT_ALIASES.get(args.variant.lower(), args.variant.lower())
        if norm_key not in VARIANTS:
            print(f"Unknown variant '{args.variant}'. Valid choices: {', '.join(VARIANTS.keys())}, or 'all'.")
            sys.exit(1)
        selected_variants = [norm_key]

    for v_key in selected_variants:
        train_single_variant(v_key, args)


if __name__ == "__main__":
    main()
