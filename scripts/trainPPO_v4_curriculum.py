import argparse
import json
import math
import os
import shutil
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone
import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Normal

VARIANT_NAME = "v4_curriculum"
OBS_DIM = 43
ACT_DIM = 3
HIDDEN_DIM = 64
WEIGHTS_PATH = os.path.join("src", "game", "aiPolicyWeights_v4.json")
BACKUP_WEIGHTS_PATH = os.path.join("src", "game", "aiPolicyWeights_v4.best.json")
METRICS_PATH = os.path.join("audit", "ppo_metrics_v4.jsonl")
DATA_JS_PATH = os.path.join("audit", "ppo_data_v4.js")
SELFPLAY_POOL_DIR = os.path.join("audit", "selfplay_pool_v4")
SELFPLAY_SNAPSHOT_INTERVAL = 150
SELFPLAY_POOL_MAX = 8

# 2-phase curriculum:
# - Phase 1 (first 45% of updates): 100% solo hotlapping to lock in clean racing lines & braking markers
# - Phase 2 (remaining 55% of updates): linearly ramp in scripted multiclass & neural self-play traffic
PHASE1_FRAC = 0.60
TARGET_SCRIPTED_RATIO = 0.35
TARGET_SELFPLAY_RATIO = 0.45

REWARD_WEIGHTS = {
    "forwardProgress": 0.45,
    "closeProximity": 0.06,
    "minSpeedThreshold": 15.0,
    "minSpeedPenalty": 0.08,
    "offTrackBase": 1.5,
    "offTrackSlope": 0.45,
    "steerJerk": 0.06,
    "throttleBrakeOverlap": 0.15,
    "carCrash": 4.5,
    "wallCrash": 5.0,
    "ttcPenalty": 0.18,
}


def compute_curriculum_mix(update: int, total_updates: int) -> tuple[int, dict[str, float]]:
    phase1_end = max(1, int(round(PHASE1_FRAC * total_updates)))
    if update <= phase1_end:
        return 1, {"soloRatio": 1.0, "scriptedRatio": 0.0, "selfplayRatio": 0.0}
    ramp = (update - phase1_end) / max(1, total_updates - phase1_end)
    ramp = max(0.0, min(1.0, ramp))
    scripted = round(TARGET_SCRIPTED_RATIO * ramp, 4)
    selfplay = round(TARGET_SELFPLAY_RATIO * ramp, 4)
    solo = round(max(0.0, 1.0 - scripted - selfplay), 4)
    return 2, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}


class ActorCritic(nn.Module):
    def __init__(self, obs_dim: int = OBS_DIM, act_dim: int = ACT_DIM, init_log_std: float = -0.7):
        super().__init__()
        self.actor = nn.Sequential(
            nn.Linear(obs_dim, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, act_dim),
        )
        self.log_std = nn.Parameter(torch.full((act_dim,), init_log_std))

        self.critic = nn.Sequential(
            nn.Linear(obs_dim, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, 1),
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


def load_actor_from_json(model: ActorCritic, path: str) -> tuple[bool, float]:
    if not os.path.exists(path):
        return False, -1e9
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if d.get("version", 1) < 2:
        print(f"Skipping {path}: legacy v1 tanh-bounded weights incompatible with full-pedal v2 policy")
        return False, -1e9
    if len(d.get("w0", [])) != HIDDEN_DIM:
        print(f"Skipping {path}: hidden dim {len(d.get('w0', []))} != {HIDDEN_DIM}")
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


def export_actor_to_json(model: ActorCritic, path: str, metadata: dict, update_backup: bool = True):
    layers = [m for m in model.actor if isinstance(m, nn.Linear)]
    meta_with_ts = dict(metadata)
    meta_with_ts["variant"] = VARIANT_NAME
    meta_with_ts["savedAt"] = datetime.now(timezone.utc).isoformat()
    payload = {
        "version": 2,
        "obsDim": OBS_DIM,
        "actDim": ACT_DIM,
        "hiddenDim": HIDDEN_DIM,
        "w0": layers[0].weight.detach().cpu().tolist(),
        "b0": layers[0].bias.detach().cpu().tolist(),
        "w1": layers[1].weight.detach().cpu().tolist(),
        "b1": layers[1].bias.detach().cpu().tolist(),
        "w2": layers[2].weight.detach().cpu().tolist(),
        "b2": layers[2].bias.detach().cpu().tolist(),
        "meta": meta_with_ts,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    os.replace(tmp_path, path)
    if update_backup:
        shutil.copy2(path, BACKUP_WEIGHTS_PATH)


def save_selfplay_snapshot(model: ActorCritic, update: int, metadata: dict):
    os.makedirs(SELFPLAY_POOL_DIR, exist_ok=True)
    ts = int(time.time())
    snap_name = f"snap_{ts}_u{update:05d}.json"
    snap_path = os.path.join(SELFPLAY_POOL_DIR, snap_name)
    export_actor_to_json(model, snap_path, metadata, update_backup=False)
    snaps = sorted(f for f in os.listdir(SELFPLAY_POOL_DIR) if f.endswith(".json"))
    while len(snaps) > SELFPLAY_POOL_MAX:
        oldest = snaps.pop(0)
        try:
            os.remove(os.path.join(SELFPLAY_POOL_DIR, oldest))
        except OSError:
            pass


def write_dashboard_data(
    history: list[dict],
    best_laps_track_class: dict[tuple[str, str], float],
    best_laps_class: dict[str, tuple[float, str]],
    peak_speed_class: dict[str, float],
):
    os.makedirs(os.path.dirname(DATA_JS_PATH), exist_ok=True)

    best_laps_track: dict[str, dict] = {}
    for (tid, cid), lt in best_laps_track_class.items():
        if tid not in best_laps_track or lt < best_laps_track[tid]["time"]:
            best_laps_track[tid] = {"time": round(lt, 2), "carClass": cid}

    payload = {
        "variant": VARIANT_NAME,
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

    tmp_path = DATA_JS_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write("window.PPO_DATA = ")
        json.dump(payload, f)
        f.write(";\n")
    os.replace(tmp_path, DATA_JS_PATH)


def spawn_env_worker():
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    return subprocess.Popen(
        [npx_cmd, "tsx", "scripts/headlessEnv.ts"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def main():
    parser = argparse.ArgumentParser(description="PPO v4: 2-Phase Curriculum (45% solo hotlap -> 55% traffic ramp)")
    parser.add_argument("--envs", type=int, default=32)
    parser.add_argument("--steps", type=int, default=256)
    parser.add_argument("--updates", type=int, default=1000)
    parser.add_argument("--tracks", nargs="*", default=None)
    parser.add_argument("--cars", nargs="*", default=None)
    parser.add_argument("--scratch", action="store_true", help=f"Ignore existing {WEIGHTS_PATH} and train from zero")
    parser.add_argument("--reset-best", action="store_true", help="Allow overwriting checkpoint even if reward baseline changed")
    parser.add_argument("--no-reset-best", action="store_true", help="Disallow overwriting checkpoint if reward baseline changed")
    parser.add_argument("--actor-lr", type=float, default=None, help="Override actor_lr_start")
    parser.add_argument("--ent-end", type=float, default=None, help="Override ent_end")
    parser.add_argument("--max-std-end", type=float, default=None, help="Override max_std_end")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[{VARIANT_NAME}] Training PPO on device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    from_scratch = args.scratch or not os.path.exists(WEIGHTS_PATH)
    init_log_std = -0.7 if from_scratch else -1.6
    model = ActorCritic(init_log_std=init_log_std).to(device)

    loaded, prev_best = (False, -1e9) if from_scratch else load_actor_from_json(model, WEIGHTS_PATH)
    if loaded:
        print(f"[{VARIANT_NAME}] Warm-started actor from {WEIGHTS_PATH} (previous best reward: {prev_best:+.4f})")
    else:
        from_scratch = True
        print(f"[{VARIANT_NAME}] Training from scratch -> {WEIGHTS_PATH}")

    os.makedirs("audit", exist_ok=True)
    os.makedirs(SELFPLAY_POOL_DIR, exist_ok=True)
    if not any(f.endswith(".json") for f in os.listdir(SELFPLAY_POOL_DIR)):
        save_selfplay_snapshot(model, 0, {"source": f"{VARIANT_NAME}_seed", "update": 0})
        print(f"[{VARIANT_NAME}] Seeded empty self-play pool in {SELFPLAY_POOL_DIR}")

    if os.path.exists(METRICS_PATH):
        os.remove(METRICS_PATH)

    critic_lr_start = 3e-4
    actor_lr_start = 3e-4 if from_scratch else 8e-5
    if args.actor_lr is not None:
        actor_lr_start = args.actor_lr
    lr_end = 2e-5
    ent_start = 0.012 if from_scratch else 0.004
    ent_end = 0.0015
    if args.ent_end is not None:
        ent_end = args.ent_end
    max_std_start = 0.50 if from_scratch else 0.20
    max_std_end = 0.12
    if args.max_std_end is not None:
        max_std_end = args.max_std_end

    optimizer = torch.optim.Adam([
        {"params": list(model.actor.parameters()) + [model.log_std], "lr": actor_lr_start},
        {"params": model.critic.parameters(), "lr": critic_lr_start},
    ], eps=1e-5)

    _, initial_mix = compute_curriculum_mix(1, args.updates)

    worker = spawn_env_worker()
    worker.stdin.write(json.dumps({
        "cmd": "init",
        "numEnvs": args.envs,
        "tracks": args.tracks,
        "cars": args.cars,
        "rewardWeights": REWARD_WEIGHTS,
        "trafficMix": initial_mix,
        "weightsPath": WEIGHTS_PATH,
        "poolDir": SELFPLAY_POOL_DIR,
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
    phase1_end = max(1, int(round(PHASE1_FRAC * args.updates)))

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
            cur_phase, traffic_mix = compute_curriculum_mix(update, args.updates)

            # On transition from Phase 1 (solo) -> Phase 2 (traffic), snapshot Phase 1 policy into selfplay pool
            # and reset best_reward baseline so traffic-trained checkpoints continue saving to WEIGHTS_PATH
            if cur_phase == 2 and not entered_phase2:
                entered_phase2 = True
                save_selfplay_snapshot(
                    model,
                    update - 1,
                    {
                        "source": f"{VARIANT_NAME}_phase1_grad",
                        "update": update - 1,
                        "curriculumPhase": 1,
                    },
                )
                best_reward = -1e9
                print(f"[{VARIANT_NAME}] Entering Phase 2 traffic ramp at update {update}/{args.updates} (snapshot pooled, traffic baseline reset)")

            if cur_phase == 2:
                worker.stdin.write(json.dumps({"cmd": "config", "trafficMix": traffic_mix}) + "\n")
                worker.stdin.flush()
                _ = json.loads(worker.stdout.readline())

            frac = (update - 1) / max(1, args.updates - 1)
            cos_decay = 0.5 * (1.0 + math.cos(math.pi * frac))
            actor_ramp = 1.0 if from_scratch else min(1.0, max(0.0, (update - critic_warmup_updates) / 40.0))
            cur_actor_lr = (lr_end + (actor_lr_start - lr_end) * cos_decay) * actor_ramp
            cur_critic_lr = lr_end + (critic_lr_start - lr_end) * cos_decay
            cur_ent = ent_end + (ent_start - ent_end) * cos_decay
            cur_max_std = max_std_end + (max_std_start - max_std_end) * cos_decay

            optimizer.param_groups[0]["lr"] = cur_actor_lr
            optimizer.param_groups[1]["lr"] = cur_critic_lr
            cur_lr = cur_actor_lr if update > critic_warmup_updates else cur_critic_lr

            with torch.no_grad():
                model.log_std.clamp_(max=math.log(cur_max_std))

            obs_buf = np.zeros((args.steps, args.envs, OBS_DIM), dtype=np.float32)
            act_buf = np.zeros((args.steps, args.envs, ACT_DIM), dtype=np.float32)
            logp_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            rew_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            done_buf = np.zeros((args.steps, args.envs), dtype=np.float32)
            val_buf = np.zeros((args.steps, args.envs), dtype=np.float32)

            speeds = []
            lap_times = []
            off_count = 0
            car_crash_count = 0
            wall_crash_count = 0
            track_stats = defaultdict(
                lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0}
            )
            class_stats = defaultdict(
                lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0}
            )

            for step in range(args.steps):
                obs_buf[step] = obs
                obs_t = torch.from_numpy(obs).to(device)
                with torch.no_grad():
                    action, logp, _, value, _ = model.get_action_and_value(obs_t)

                raw_act_np = action.cpu().numpy()
                env_act_np = np.clip(raw_act_np, -1.0, 1.0)
                act_buf[step] = raw_act_np
                logp_buf[step] = logp.cpu().numpy()
                val_buf[step] = value.cpu().numpy()

                worker.stdin.write(json.dumps({"cmd": "step", "actions": env_act_np.tolist()}) + "\n")
                worker.stdin.flush()
                step_resp = json.loads(worker.stdout.readline())

                obs = np.array(step_resp["obs"], dtype=np.float32)
                rew_buf[step] = np.array(step_resp["rewards"], dtype=np.float32)
                done_buf[step] = np.array(step_resp["dones"], dtype=np.float32)

                for inf in step_resp["info"]:
                    spd = inf["speed"] * 3.6
                    tid = inf.get("trackId", "unknown")
                    cid = inf.get("carClass", "Other")
                    speeds.append(spd)

                    if cid not in peak_speed_class or spd > peak_speed_class[cid]:
                        peak_speed_class[cid] = spd

                    ts = track_stats[tid]
                    ts["speeds"].append(spd)

                    cs = class_stats[cid]
                    cs["speeds"].append(spd)

                    if inf.get("offTrack"):
                        off_count += 1
                        ts["off"] += 1
                        cs["off"] += 1
                    if inf.get("crashed"):
                        ts["crashes"] += 1
                        cs["crashes"] += 1
                    if inf.get("carCrash"):
                        car_crash_count += 1
                        ts["carCrashes"] += 1
                        cs["carCrashes"] += 1
                    if inf.get("wallCrash"):
                        wall_crash_count += 1
                        ts["wallCrashes"] += 1
                        cs["wallCrashes"] += 1
                    if inf["lapTime"] is not None:
                        lt = inf["lapTime"]
                        lap_times.append(lt)
                        ts["laps"].append(lt)
                        cs["laps"].append(lt)

                        key = (tid, cid)
                        if key not in best_laps_track_class or lt < best_laps_track_class[key]:
                            best_laps_track_class[key] = lt
                        if cid not in best_laps_class or lt < best_laps_class[cid][0]:
                            best_laps_class[cid] = (lt, tid)

            with torch.no_grad():
                _, _, next_value = model.forward(torch.from_numpy(obs).to(device))
                next_value = next_value.cpu().numpy()

            adv_buf = np.zeros_like(rew_buf)
            last_gae = 0.0
            for t in reversed(range(args.steps)):
                next_non_terminal = 1.0 - done_buf[t]
                next_val = next_value if t == args.steps - 1 else val_buf[t + 1]
                delta = rew_buf[t] + gamma * next_val * next_non_terminal - val_buf[t]
                last_gae = delta + gamma * gae_lambda * next_non_terminal * last_gae
                adv_buf[t] = last_gae
            ret_buf = adv_buf + val_buf

            b_obs = torch.from_numpy(obs_buf.reshape(-1, OBS_DIM)).to(device)
            b_act = torch.from_numpy(act_buf.reshape(-1, ACT_DIM)).to(device)
            b_logp = torch.from_numpy(logp_buf.reshape(-1)).to(device)
            b_adv = torch.from_numpy(adv_buf.reshape(-1)).to(device)
            b_ret = torch.from_numpy(ret_buf.reshape(-1)).to(device)

            b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)

            total_samples = args.envs * args.steps
            indices = np.arange(total_samples)

            for _ in range(epochs):
                np.random.shuffle(indices)
                for start in range(0, total_samples, minibatch_size):
                    mb_idx = indices[start : start + minibatch_size]
                    _, new_logp, entropy, new_val, new_mean = model.get_action_and_value(b_obs[mb_idx], b_act[mb_idx])
                    ratio = torch.exp(new_logp - b_logp[mb_idx])

                    pg_loss1 = -b_adv[mb_idx] * ratio
                    pg_loss2 = -b_adv[mb_idx] * torch.clamp(ratio, 1.0 - clip_coef, 1.0 + clip_coef)
                    pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                    v_loss = 0.5 * ((new_val - b_ret[mb_idx]) ** 2).mean()
                    mean_reg = 1e-4 * (new_mean.pow(2)).mean()
                    if update <= critic_warmup_updates:
                        loss = vf_coef * v_loss
                    else:
                        loss = pg_loss - cur_ent * entropy.mean() + vf_coef * v_loss + mean_reg

                    optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                    optimizer.step()

            mean_rew = float(rew_buf.mean())
            mean_spd = float(np.mean(speeds))
            total_n = max(1, len(speeds))
            off_pct = 100.0 * off_count / total_n
            car_crashes_1k = 1000.0 * car_crash_count / total_n
            wall_crashes_1k = 1000.0 * wall_crash_count / total_n
            best_lap = f"{min(lap_times):.2f}s" if lap_times else "n/a"
            sps = int((update * args.envs * args.steps) / max(1e-3, time.time() - t0))
            cur_std_avg = float(torch.exp(model.log_std).mean().item())

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
                "variant": VARIANT_NAME,
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
            with open(METRICS_PATH, "a", encoding="utf-8") as mf:
                mf.write(json.dumps(record) + "\n")

            if update == 1 or update % 2 == 0:
                write_dashboard_data(history, best_laps_track_class, best_laps_class, peak_speed_class)

            saved_tag = ""
            min_save_update = max(15, critic_warmup_updates + 1) if cur_phase == 1 else phase1_end + 5
            if update >= min_save_update and mean_rew > best_reward:
                best_reward = mean_rew
                export_actor_to_json(
                    model,
                    WEIGHTS_PATH,
                    {
                        "source": f"{VARIANT_NAME}_scratch" if from_scratch else f"{VARIANT_NAME}_finetune",
                        "curriculumPhase": cur_phase,
                        "trafficMix": traffic_mix,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                )
                saved_tag = " [SAVED]"

            if update % SELFPLAY_SNAPSHOT_INTERVAL == 0:
                save_selfplay_snapshot(
                    model,
                    update,
                    {
                        "source": f"{VARIANT_NAME}_snapshot",
                        "curriculumPhase": cur_phase,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                )
                saved_tag += " [POOL]"

            cls_str = " ".join(
                f"{tag}:{per_class_summary[cid]['avgSpeed']:5.1f}"
                for cid, tag in [("F1", "F1"), ("Hypercar", "HY"), ("LMP2", "P2"), ("GT3", "GT3"), ("GT4", "GT4")]
                if cid in per_class_summary
            )
            warmup_tag = " (critic warmup)" if update <= critic_warmup_updates else ""
            mix_tag = f"P{cur_phase}(solo:{int(round(traffic_mix['soloRatio']*100))}%/scr:{int(round(traffic_mix['scriptedRatio']*100))}%/sp:{int(round(traffic_mix['selfplayRatio']*100))}%)"
            print(
                f"[{VARIANT_NAME}] Update {update:04d}/{args.updates} {mix_tag} | Rew: {mean_rew:+.3f} | "
                f"Avg: {mean_spd:5.1f} [{cls_str}] | "
                f"Off: {off_pct:4.1f}% | Cr(Car/Wall): {car_crashes_1k:.2f}/{wall_crashes_1k:.2f} | "
                f"BestLap: {best_lap:>7} | {sps:,} steps/s{warmup_tag}{saved_tag}"
            )
    finally:
        worker.terminate()


if __name__ == "__main__":
    main()
