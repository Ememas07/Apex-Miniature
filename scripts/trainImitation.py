#!/usr/bin/env python3
"""
Behavioral Cloning (BC) Warm-Start & Imitation Training Script.

Loads recorded clean human driving telemetry from audit/human_demos.jsonl,
warm-starts policy MLP [43 -> 64 -> 64 -> 3] with existing src/game/aiPolicyWeights.json,
trains supervised BC (AdamW + MSELoss) for 10-15 epochs to adopt human apex-hitting
and braking markers, exports updated weights, and supports chaining directly
into scripts/trainAiPolicy.py for PPO reinforcement fine-tuning.
"""

import argparse
import json
import os
import subprocess
import sys
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

OBS_DIM = 43
ACTION_DIM = 3
DEFAULT_DEMOS_PATH = "audit/human_demos.jsonl"
DEFAULT_WEIGHTS_PATH = "src/game/aiPolicyWeights.json"


class DriverMlpPolicy(nn.Module):
    def __init__(self, obs_dim=OBS_DIM, action_dim=ACTION_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, 64),
            nn.Tanh(),
            nn.Linear(64, 64),
            nn.Tanh(),
        )
        self.action_net = nn.Linear(64, action_dim)

    def forward(self, x):
        features = self.net(x)
        return self.action_net(features)


def load_existing_weights(model: DriverMlpPolicy, weights_path: str) -> bool:
    if not os.path.exists(weights_path):
        print(f"No existing weights found at {weights_path}; initializing randomly.")
        return False

    try:
        with open(weights_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        w0 = torch.tensor(data["w0"], dtype=torch.float32)
        b0 = torch.tensor(data["b0"], dtype=torch.float32)
        w1 = torch.tensor(data["w1"], dtype=torch.float32)
        b1 = torch.tensor(data["b1"], dtype=torch.float32)
        w2 = torch.tensor(data["w2"], dtype=torch.float32)
        b2 = torch.tensor(data["b2"], dtype=torch.float32)

        with torch.no_grad():
            old_in = w0.shape[1]
            model.net[0].weight.zero_()
            model.net[0].weight[:, :old_in].copy_(w0)
            if old_in < OBS_DIM:
                model.net[0].weight[:, old_in:].normal_(mean=0.0, std=0.01)
            model.net[0].bias.copy_(b0)
            model.net[2].weight.copy_(w1)
            model.net[2].bias.copy_(b1)
            model.action_net.weight.copy_(w2)
            model.action_net.bias.copy_(b2)

        print(f"Loaded existing weights from {weights_path} (obs_dim: {old_in})")
        return True
    except Exception as e:
        print(f"Warning: Failed to load existing weights from {weights_path}: {e}")
        return False


def export_weights_to_json(model: DriverMlpPolicy, out_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    weights = {
        "obsDim": OBS_DIM,
        "w0": model.net[0].weight.detach().cpu().numpy().round(5).tolist(),
        "b0": model.net[0].bias.detach().cpu().numpy().round(5).tolist(),
        "w1": model.net[2].weight.detach().cpu().numpy().round(5).tolist(),
        "b1": model.net[2].bias.detach().cpu().numpy().round(5).tolist(),
        "w2": model.action_net.weight.detach().cpu().numpy().round(5).tolist(),
        "b2": model.action_net.bias.detach().cpu().numpy().round(5).tolist(),
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(weights, f, indent=2)
    print(f"Exported updated weights to {out_path}")


def load_dataset(demos_path: str):
    if not os.path.exists(demos_path):
        print(f"Notice: Telemetry file {demos_path} does not exist yet.")
        return None, None

    all_obs = []
    all_acts = []

    with open(demos_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                samples = record.get("samples", [])
                for sample in samples:
                    if len(sample) >= OBS_DIM + ACTION_DIM:
                        all_obs.append(sample[:OBS_DIM])
                        all_acts.append(sample[OBS_DIM : OBS_DIM + ACTION_DIM])
            except json.JSONDecodeError:
                continue

    if not all_obs:
        print(f"No valid telemetry samples found in {demos_path}")
        return None, None

    x = torch.tensor(all_obs, dtype=torch.float32)
    y = torch.tensor(all_acts, dtype=torch.float32)
    print(f"Loaded {len(x):,} valid human demonstration samples from {demos_path}")
    return x, y


def train_imitation(
    demos_path: str = DEFAULT_DEMOS_PATH,
    weights_path: str = DEFAULT_WEIGHTS_PATH,
    epochs: int = 12,
    lr: float = 1e-3,
    batch_size: int = 256,
    chain_ppo: bool = False,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = DriverMlpPolicy().to(device)

    load_existing_weights(model, weights_path)

    x, y = load_dataset(demos_path)
    if x is None or len(x) == 0:
        print("Supervised BC: No demonstration dataset available to train.")
        export_weights_to_json(model, weights_path)
        if chain_ppo:
            chain_into_ppo()
        return

    dataset = TensorDataset(x, y)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    loss_fn = nn.MSELoss()

    model.train()
    print(f"Starting Behavioral Cloning for {epochs} epochs on {len(x):,} samples (device: {device})...")
    for epoch in range(1, epochs + 1):
        epoch_loss = 0.0
        batches = 0
        for batch_x, batch_y in dataloader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)

            pred_y = model(batch_x)
            loss = loss_fn(pred_y, batch_y)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item()
            batches += 1

        avg_loss = epoch_loss / max(1, batches)
        print(f"Epoch {epoch:2d}/{epochs:2d} - Loss: {avg_loss:.6f}")

    export_weights_to_json(model, weights_path)

    if chain_ppo:
        chain_into_ppo()


def chain_into_ppo():
    ppo_script = os.path.join(os.path.dirname(__file__), "trainAiPolicy.py")
    if os.path.exists(ppo_script):
        print(f"\nChaining into PPO reinforcement training: {ppo_script}...")
        subprocess.run([sys.executable, ppo_script], check=True)
    else:
        print(f"Error: {ppo_script} not found to chain PPO.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Behavioral Cloning policy trainer")
    parser.add_argument("--demos", default=DEFAULT_DEMOS_PATH, help="Path to human demos jsonl")
    parser.add_argument("--weights", default=DEFAULT_WEIGHTS_PATH, help="Path to weights json")
    parser.add_argument("--epochs", type=int, default=12, help="Number of training epochs (10-15)")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--batch-size", type=int, default=256, help="Batch size")
    parser.add_argument("--chain-ppo", action="store_true", help="Chain into trainAiPolicy.py after BC")
    args = parser.parse_args()

    train_imitation(
        demos_path=args.demos,
        weights_path=args.weights,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        chain_ppo=args.chain_ppo,
    )
