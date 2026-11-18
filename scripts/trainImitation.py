import argparse
import glob
import json
import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

WEIGHTS_PATH = "src/game/aiPolicyWeights.json"
ROLLING_CKPT = "checkpoints/bc_rolling.pt"
OBS_DIM = 43
ACT_DIM = 3


class PolicyNet(nn.Module):
    def __init__(self, obs_dim: int = OBS_DIM, act_dim: int = ACT_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, 64),
            nn.Tanh(),
            nn.Linear(64,64),
            nn.Tanh(),
            nn.Linear(64, act_dim),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def load_json_weights(model: PolicyNet, path: str) -> bool:
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if d.get("obsDim") != OBS_DIM:
        return False
    layers = [m for m in model.net if isinstance(m, nn.Linear)]
    with torch.no_grad():
        layers[0].weight.copy_(torch.tensor(d["w0"], dtype=torch.float32))
        layers[0].bias.copy_(torch.tensor(d["b0"], dtype=torch.float32))
        layers[1].weight.copy_(torch.tensor(d["w1"], dtype=torch.float32))
        layers[1].bias.copy_(torch.tensor(d["b1"], dtype=torch.float32))
        layers[2].weight.copy_(torch.tensor(d["w2"], dtype=torch.float32))
        layers[2].bias.copy_(torch.tensor(d["b2"], dtype=torch.float32))
    return True


def export_json_weights(model: PolicyNet, path: str):
    layers = [m for m in model.net if isinstance(m, nn.Linear)]
    payload = {
        "obsDim": OBS_DIM,
        "actDim": ACT_DIM,
        "w0": layers[0].weight.detach().cpu().numpy().tolist(),
        "b0": layers[0].bias.detach().cpu().numpy().tolist(),
        "w1": layers[1].weight.detach().cpu().numpy().tolist(),
        "b1": layers[1].bias.detach().cpu().numpy().tolist(),
        "w2": layers[2].weight.detach().cpu().numpy().tolist(),
        "b2": layers[2].bias.detach().cpu().numpy().tolist(),
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)


def load_telemetry_files(pattern: str):
    files = sorted(glob.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No player telemetry files matched '{pattern}'")

    obs_list, act_list, weight_list = [], [], []
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            if fp.endswith(".jsonl"):
                records = [json.loads(line) for line in f if line.strip()]
            else:
                raw = json.load(f)
                records = raw if isinstance(raw, list) else [raw]

        for rec in records:
            # New TelemetryLapDemo format: samples = [[...obs43, steer, thrAct, brkAct], ...]
            if isinstance(rec, dict) and "samples" in rec:
                for row in rec["samples"]:
                    if len(row) != OBS_DIM + ACT_DIM:
                        continue
                    obs_vec = list(row[:OBS_DIM])
                    obs_vec[42] = 1.0
                    steer = float(np.clip(row[43], -1.0, 1.0))
                    thr = float(np.clip(row[44], -1.0, 1.0))
                    brk = float(np.clip(row[45], -1.0, 1.0))
                    obs_list.append(obs_vec)
                    act_list.append([steer, thr, brk])
                    weight_list.append(1.0 + 1.5 * abs(steer) + 1.5 * max(0.0, (brk + 1.0) * 0.5))
                continue

            # Legacy frame-object format fallback
            frames = rec if isinstance(rec, list) else rec.get("frames", [])
            lap_skill = float(rec.get("skill", 1.0)) if isinstance(rec, dict) else 1.0
            for fr in frames:
                obs = fr.get("obs") or fr.get("observation")
                act = fr.get("action")
                if not obs or len(obs) != OBS_DIM or not act or len(act) != ACT_DIM:
                    continue
                obs_vec = list(obs)
                obs_vec[42] = max(obs_vec[42], lap_skill)
                steer = float(np.clip(act[0], -1.0, 1.0))
                thr_raw, brk_raw = float(act[1]), float(act[2])
                thr = thr_raw * 2.0 - 1.0 if 0.0 <= thr_raw <= 1.0 and fr.get("normalized", True) else thr_raw
                brk = brk_raw * 2.0 - 1.0 if 0.0 <= brk_raw <= 1.0 and fr.get("normalized", True) else brk_raw
                obs_list.append(obs_vec)
                act_list.append([steer, np.clip(thr, -1.0, 1.0), np.clip(brk, -1.0, 1.0)])
                weight_list.append(1.0 + 1.5 * abs(steer) + 1.5 * max(0.0, (brk + 1.0) * 0.5))

    if not obs_list:
        raise ValueError("Telemetry files contained 0 valid 43-dim frames.")

    print(f"Loaded {len(obs_list):,} human frames from {len(files)} file(s).")
    return (
        np.array(obs_list, dtype=np.float32),
        np.array(act_list, dtype=np.float32),
        np.array(weight_list, dtype=np.float32),
    )


def main():
    parser = argparse.ArgumentParser(description="Behavioral Cloning from player telemetry")
    parser.add_argument("--data", default="telemetry/*.json", help="Glob path to exported telemetry JSONs")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--scratch", action="store_true", help="Train from scratch instead of warm-starting")
    args = parser.parse_args()

    obs_np, act_np, w_np = load_telemetry_files(args.data)

    # Augment with small lateral/heading jitter so cloned policy recovers if nudged off-line
    aug_obs = obs_np.copy()
    aug_act = act_np.copy()
    aug_w = w_np.copy()
    rng = np.random.default_rng(42)
    aug_obs[:, 2] = np.clip(aug_obs[:, 2] + rng.normal(0.0, 0.04, size=len(aug_obs)), -1.2, 1.2)
    aug_obs[:, 3] = np.clip(aug_obs[:, 3] + rng.normal(0.0, 0.015, size=len(aug_obs)), -1.0, 1.0)
    # Corrective counter-steer label proportional to injected lateral/heading perturbation
    aug_act[:, 0] = np.clip(
        aug_act[:, 0] - (aug_obs[:, 2] - obs_np[:, 2]) * 0.65 - (aug_obs[:, 3] - obs_np[:, 3]) * 1.4,
        -1.0,
        1.0,
    )

    all_obs = torch.tensor(np.concatenate([obs_np, aug_obs], axis=0))
    all_act = torch.tensor(np.concatenate([act_np, aug_act], axis=0))
    all_w = torch.tensor(np.concatenate([w_np, aug_w], axis=0))

    ds = TensorDataset(all_obs, all_act, all_w)
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PolicyNet().to(device)
    if not args.scratch and load_json_weights(model, WEIGHTS_PATH):
        print(f"Warm-started from existing {WEIGHTS_PATH}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        for bx, by, bw in loader:
            bx, by, bw = bx.to(device), by.to(device), bw.to(device)
            pred = model(bx)
            per_sample = ((pred - by) ** 2).mean(dim=1)
            loss = (per_sample * bw).mean()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(bx)
        scheduler.step()
        if epoch % 10 == 0 or epoch == 1:
            print(f"Epoch {epoch:02d}/{args.epochs} | Weighted MSE: {total_loss / len(ds):.5f}")

    os.makedirs(os.path.dirname(ROLLING_CKPT), exist_ok=True)
    torch.save(model.state_dict(), ROLLING_CKPT)
    export_json_weights(model, WEIGHTS_PATH)
    print(f"Exported cloned policy weights to {WEIGHTS_PATH} (rolling ckpt: {ROLLING_CKPT})")


if __name__ == "__main__":
    main()