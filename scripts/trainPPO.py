import argparse
import json
import math
import os
import subprocess
import time
from collections import defaultdict
import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Normal

OBS_DIM = 43
ACT_DIM = 3
HIDDEN_DIM = 64
WEIGHTS_PATH = os.path.join("src", "game", "aiPolicyWeights.json")
METRICS_PATH = os.path.join("audit", "ppo_metrics.jsonl")
DASHBOARD_PATH = os.path.join("audit", "ppo_dashboard.html")

CLASS_ORDER = ["F1", "Hypercar", "LMP2", "GT3", "GT4", "Other"]


class ActorCritic(nn.Module):
    def __init__(self, obs_dim: int = OBS_DIM, act_dim: int = ACT_DIM, init_log_std: float = -0.6):
        super().__init__()
        self.actor = nn.Sequential(
            nn.Linear(obs_dim, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM),
            nn.Tanh(),
            nn.Linear(HIDDEN_DIM, act_dim),
            nn.Tanh(),
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
        return action, log_prob, entropy, value


def load_actor_from_json(model: ActorCritic, path: str) -> bool:
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if len(d.get("w0", [])) != HIDDEN_DIM:
        print(f"Skipping {path}: hidden dim {len(d.get('w0', []))} != {HIDDEN_DIM}")
        return False
    layers = [m for m in model.actor if isinstance(m, nn.Linear)]
    with torch.no_grad():
        layers[0].weight.copy_(torch.tensor(d["w0"], dtype=torch.float32))
        layers[0].bias.copy_(torch.tensor(d["b0"], dtype=torch.float32))
        layers[1].weight.copy_(torch.tensor(d["w1"], dtype=torch.float32))
        layers[1].bias.copy_(torch.tensor(d["b1"], dtype=torch.float32))
        layers[2].weight.copy_(torch.tensor(d["w2"], dtype=torch.float32))
        layers[2].bias.copy_(torch.tensor(d["b2"], dtype=torch.float32))
    return True


def export_actor_to_json(model: ActorCritic, path: str, metadata: dict):
    layers = [m for m in model.actor if isinstance(m, nn.Linear)]
    payload = {
        "version": 1,
        "obsDim": OBS_DIM,
        "actDim": ACT_DIM,
        "hiddenDim": HIDDEN_DIM,
        "w0": layers[0].weight.detach().cpu().tolist(),
        "b0": layers[0].bias.detach().cpu().tolist(),
        "w1": layers[1].weight.detach().cpu().tolist(),
        "b1": layers[1].bias.detach().cpu().tolist(),
        "w2": layers[2].weight.detach().cpu().tolist(),
        "b2": layers[2].bias.detach().cpu().tolist(),
        "meta": metadata,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)


def write_dashboard_html(
    history: list[dict],
    best_laps_track_class: dict[tuple[str, str], float],
    best_laps_class: dict[str, tuple[float, str]],
):
    os.makedirs(os.path.dirname(DASHBOARD_PATH), exist_ok=True)
    latest = history[-1]

    # Per-class rows
    present_classes = [c for c in CLASS_ORDER if c in latest["classes"]] + [
        c for c in sorted(latest["classes"].keys()) if c not in CLASS_ORDER
    ]
    class_rows = ""
    for cid in present_classes:
        c = latest["classes"][cid]
        best_info = best_laps_class.get(cid)
        best_str = f"{best_info[0]:.2f}s ({best_info[1]})" if best_info is not None else "—"
        off_pct = c["offTrackPct"]
        crash_rate = c["crashesPer1k"]
        status_cls = "good" if off_pct < 8 and crash_rate < 2 else ("warn" if off_pct < 20 else "bad")
        class_rows += f"""
        <tr>
          <td><span class="badge badge-{cid.lower()}">{cid}</span></td>
          <td><strong>{c['avgSpeed']:.1f} km/h</strong></td>
          <td>{c['maxSpeed']:.1f} km/h</td>
          <td class="best">{best_str}</td>
          <td class="{status_cls}">{off_pct:.1f}%</td>
          <td class="{status_cls}">{crash_rate:.2f}</td>
          <td>{c['samples']:,}</td>
        </tr>"""

    # Per-track rows (showing fastest class lap on each track)
    tracks = sorted(latest["tracks"].keys())
    track_rows = ""
    for tid in tracks:
        t = latest["tracks"][tid]
        track_bests = [
            (lt, cls) for (tr, cls), lt in best_laps_track_class.items() if tr == tid
        ]
        if track_bests:
            fastest_lt, fastest_cls = min(track_bests, key=lambda x: x[0])
            best_str = f"{fastest_lt:.2f}s <span class='muted'>({fastest_cls})</span>"
        else:
            best_str = "—"
        cur_best = f"{t['bestLap']:.2f}s" if t["bestLap"] is not None else "—"
        off_pct = t["offTrackPct"]
        crash_rate = t["crashesPer1k"]
        status_cls = "good" if off_pct < 8 and crash_rate < 2 else ("warn" if off_pct < 20 else "bad")
        track_rows += f"""
        <tr>
          <td><strong>{tid}</strong></td>
          <td>{t['avgSpeed']:.1f} km/h</td>
          <td>{cur_best}</td>
          <td class="best">{best_str}</td>
          <td class="{status_cls}">{off_pct:.1f}%</td>
          <td class="{status_cls}">{crash_rate:.2f}</td>
          <td>{t['samples']:,}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="5">
<title>Apex-Miniature PPO Progress</title>
<style>
  body {{ font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 24px; }}
  h1, h2 {{ margin: 0 0 12px; font-weight: 600; }}
  h2 {{ margin-top: 22px; }}
  .sub {{ color: #8b949e; margin-bottom: 20px; font-size: 14px; }}
  .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }}
  .card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px; }}
  .card .label {{ color: #8b949e; font-size: 12px; text-transform: uppercase; }}
  .card .val {{ font-size: 24px; font-weight: 700; margin-top: 4px; color: #58a6ff; }}
  .charts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }}
  .panel {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }}
  .panel h2 {{ margin-top: 0; }}
  canvas {{ width: 100%; height: 230px; display: block; }}
  table {{ width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }}
  th, td {{ padding: 10px 14px; text-align: left; border-bottom: 1px solid #21262d; font-size: 14px; }}
  th {{ background: #1f242c; color: #8b949e; font-weight: 600; }}
  .good {{ color: #3fb950; }} .warn {{ color: #d29922; }} .bad {{ color: #f85149; }} .best {{ color: #79c0ff; font-weight: 600; }}
  .muted {{ color: #8b949e; font-weight: 400; font-size: 12px; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #21262d; }}
  .badge-f1 {{ background: rgba(248,81,73,0.18); color: #ff7b72; }}
  .badge-hypercar {{ background: rgba(88,166,255,0.18); color: #79c0ff; }}
  .badge-lmp2 {{ background: rgba(210,168,255,0.18); color: #d2a8ff; }}
  .badge-gt3 {{ background: rgba(63,185,80,0.18); color: #56d364; }}
  .badge-gt4 {{ background: rgba(255,166,87,0.18); color: #ffa657; }}
</style>
</head>
<body>
  <h1>Apex-Miniature — PPO Training Monitor</h1>
  <div class="sub">Auto-refreshes every 5s &bull; Update {latest['update']} / {latest['totalUpdates']} &bull; {latest['sps']:,} steps/s</div>

  <div class="cards">
    <div class="card"><div class="label">Mean Reward / Step</div><div class="val">{latest['meanRew']:+.3f}</div></div>
    <div class="card"><div class="label">Global Avg Speed</div><div class="val">{latest['meanSpeed']:.1f} km/h</div></div>
    <div class="card"><div class="label">Off-Track Rate</div><div class="val">{latest['offTrackPct']:.1f}%</div></div>
    <div class="card"><div class="label">Policy Noise (Std)</div><div class="val">{latest['std']:.2f}</div></div>
    <div class="card"><div class="label">Learning Rate</div><div class="val">{latest['lr']:.1e}</div></div>
  </div>

  <div class="charts">
    <div class="panel"><h2>Step Reward &amp; Global Avg Speed</h2><canvas id="c1"></canvas></div>
    <div class="panel"><h2>Avg Speed by Car Class (km/h)</h2><canvas id="c2"></canvas></div>
  </div>

  <h2>Per-Class Performance Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Class</th><th>Avg Speed</th><th>Peak Speed</th><th>All-Time Best Lap</th><th>Off-Track %</th><th>Crashes / 1k steps</th><th>Steps</th>
      </tr>
    </thead>
    <tbody>{class_rows}</tbody>
  </table>

  <h2>Per-Track Breakdown (Latest Rollout + All-Time Best Lap)</h2>
  <table>
    <thead>
      <tr>
        <th>Track</th><th>Avg Speed</th><th>Rollout Best Lap</th><th>All-Time Best Lap</th><th>Off-Track %</th><th>Crashes / 1k steps</th><th>Steps</th>
      </tr>
    </thead>
    <tbody>{track_rows}</tbody>
  </table>

<script>
const HISTORY = {json.dumps(history[-250:])};
const CLASS_COLORS = {{
  'F1': '#ff7b72',
  'Hypercar': '#58a6ff',
  'LMP2': '#d2a8ff',
  'GT3': '#3fb950',
  'GT4': '#ffa657',
  'Other': '#8b949e'
}};

function drawSeries(canvasId, seriesList) {{
  const c = document.getElementById(canvasId);
  const dpr = window.devicePixelRatio || 1;
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = c.clientWidth, h = c.clientHeight, pad = 28;
  ctx.clearRect(0, 0, w, h);
  if (!HISTORY.length) return;

  let allVals = [];
  seriesList.forEach(s => allVals.push(...s.data.filter(v => v !== null && v !== undefined)));
  if (!allVals.length) return;
  let minV = Math.min(...allVals), maxV = Math.max(...allVals);
  if (maxV - minV < 1e-4) {{ maxV += 1; minV -= 1; }}

  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {{
    const y = pad + (h - 2 * pad) * (g / 4);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }}

  seriesList.forEach((s) => {{
    ctx.strokeStyle = s.color || '#58a6ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    s.data.forEach((v, i) => {{
      if (v === null || v === undefined) return;
      const x = pad + (w - 2 * pad) * (i / Math.max(1, s.data.length - 1));
      const y = h - pad - (h - 2 * pad) * ((v - minV) / (maxV - minV));
      if (!started) {{ ctx.moveTo(x, y); started = true; }} else ctx.lineTo(x, y);
    }});
    ctx.stroke();
  }});

  let lx = pad;
  ctx.font = '12px system-ui';
  seriesList.forEach((s) => {{
    ctx.fillStyle = s.color || '#58a6ff';
    ctx.fillRect(lx, 8, 10, 10);
    ctx.fillStyle = '#c9d1d9';
    ctx.fillText(s.name, lx + 14, 17);
    lx += ctx.measureText(s.name).width + 28;
  }});
}}

drawSeries('c1', [
  {{ name: 'Global Avg Speed (km/h)', data: HISTORY.map(r => r.meanSpeed), color: '#58a6ff' }},
  {{ name: 'Reward x100', data: HISTORY.map(r => r.meanRew * 100), color: '#3fb950' }},
]);

const classOrder = ['F1', 'Hypercar', 'LMP2', 'GT3', 'GT4', 'Other'];
const activeClasses = classOrder.filter(cid => HISTORY.some(r => r.classes && r.classes[cid]));
drawSeries('c2', activeClasses.map(cid => ({{
  name: cid,
  data: HISTORY.map(r => (r.classes && r.classes[cid]) ? r.classes[cid].avgSpeed : null),
  color: CLASS_COLORS[cid] || '#8b949e'
}})));
</script>
</body>
</html>"""
    with open(DASHBOARD_PATH, "w", encoding="utf-8") as f:
        f.write(html)


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
    parser = argparse.ArgumentParser()
    parser.add_argument("--envs", type=int, default=32)
    parser.add_argument("--steps", type=int, default=256)
    parser.add_argument("--updates", type=int, default=1000)
    parser.add_argument("--tracks", nargs="*", default=None)
    parser.add_argument("--cars", nargs="*", default=None)
    parser.add_argument("--scratch", action="store_true", help="Ignore existing aiPolicyWeights.json and train from zero")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training PPO on device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    from_scratch = args.scratch or not os.path.exists(WEIGHTS_PATH)
    init_log_std = -0.6 if from_scratch else -1.6
    model = ActorCritic(init_log_std=init_log_std).to(device)

    if not from_scratch and load_actor_from_json(model, WEIGHTS_PATH):
        print(f"Warm-started actor from {WEIGHTS_PATH}")
    else:
        from_scratch = True
        print("Training completely from scratch (random initialization + self-annealing schedules).")

    os.makedirs("audit", exist_ok=True)
    if os.path.exists(METRICS_PATH):
        os.remove(METRICS_PATH)

    lr_start = 3e-4 if from_scratch else 1e-4
    lr_end = 2e-5
    ent_start = 0.015 if from_scratch else 0.004
    ent_end = 0.0015
    max_std_start = 0.65 if from_scratch else 0.22
    max_std_end = 0.14

    optimizer = torch.optim.Adam(model.parameters(), lr=lr_start, eps=1e-5)

    worker = spawn_env_worker()
    worker.stdin.write(json.dumps({"cmd": "init", "numEnvs": args.envs, "tracks": args.tracks, "cars": args.cars}) + "\n")
    worker.stdin.flush()
    init_resp = json.loads(worker.stdout.readline())
    obs = np.array(init_resp["obs"], dtype=np.float32)

    gamma = 0.992
    gae_lambda = 0.95
    clip_coef = 0.2
    vf_coef = 0.5
    epochs = 6
    minibatch_size = (args.envs * args.steps) // 8

    best_reward = -1e9
    best_laps_track_class: dict[tuple[str, str], float] = {}
    best_laps_class: dict[str, tuple[float, str]] = {}
    history: list[dict] = []
    t0 = time.time()

    try:
        for update in range(1, args.updates + 1):
            frac = (update - 1) / max(1, args.updates - 1)
            cos_decay = 0.5 * (1.0 + math.cos(math.pi * frac))
            cur_lr = lr_end + (lr_start - lr_end) * cos_decay
            cur_ent = ent_end + (ent_start - ent_end) * cos_decay
            cur_max_std = max_std_end + (max_std_start - max_std_end) * cos_decay

            for pg in optimizer.param_groups:
                pg["lr"] = cur_lr
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
            track_stats = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0})
            class_stats = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0})

            for step in range(args.steps):
                obs_buf[step] = obs
                obs_t = torch.from_numpy(obs).to(device)
                with torch.no_grad():
                    action, logp, _, value = model.get_action_and_value(obs_t)

                act_np = np.clip(action.cpu().numpy(), -1.0, 1.0)
                act_buf[step] = act_np
                logp_buf[step] = logp.cpu().numpy()
                val_buf[step] = value.cpu().numpy()

                worker.stdin.write(json.dumps({"cmd": "step", "actions": act_np.tolist()}) + "\n")
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
                    _, new_logp, entropy, new_val = model.get_action_and_value(b_obs[mb_idx], b_act[mb_idx])
                    ratio = torch.exp(new_logp - b_logp[mb_idx])

                    pg_loss1 = -b_adv[mb_idx] * ratio
                    pg_loss2 = -b_adv[mb_idx] * torch.clamp(ratio, 1.0 - clip_coef, 1.0 + clip_coef)
                    pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                    v_loss = 0.5 * ((new_val - b_ret[mb_idx]) ** 2).mean()
                    loss = pg_loss - cur_ent * entropy.mean() + vf_coef * v_loss

                    optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                    optimizer.step()

            mean_rew = float(rew_buf.mean())
            mean_spd = float(np.mean(speeds))
            off_pct = 100.0 * off_count / max(1, len(speeds))
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
                    "samples": n,
                }

            record = {
                "update": update,
                "totalUpdates": args.updates,
                "meanRew": round(mean_rew, 4),
                "meanSpeed": round(mean_spd, 1),
                "offTrackPct": round(off_pct, 1),
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
                write_dashboard_html(history, best_laps_track_class, best_laps_class)

            saved_tag = ""
            if update >= 15 and mean_rew > best_reward:
                best_reward = mean_rew
                export_actor_to_json(
                    model,
                    WEIGHTS_PATH,
                    {
                        "source": "ppo_scratch" if from_scratch else "ppo_finetune",
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                )
                saved_tag = " [SAVED]"

            f1_spd = per_class_summary.get("F1", {}).get("avgSpeed", 0.0)
            gt3_spd = per_class_summary.get("GT3", {}).get("avgSpeed", 0.0)
            print(
                f"Update {update:04d}/{args.updates} | Rew: {mean_rew:+.3f} | "
                f"Avg: {mean_spd:5.1f} (F1:{f1_spd:5.1f} GT3:{gt3_spd:5.1f}) | "
                f"Off: {off_pct:4.1f}% | BestLap: {best_lap:>7} | {sps:,} steps/s{saved_tag}"
            )
    finally:
        worker.terminate()


if __name__ == "__main__":
    main()