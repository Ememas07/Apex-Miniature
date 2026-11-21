#!/usr/bin/env python3
"""
Apex Miniature — Unified Reinforcement Learning Policy Trainer (PPO)

Trains neural driving policies across full circuits and multi-class car grids.
Unified 2-generation model architecture (+ dedicated starts specialist):
  - v1     : 59-dim Advanced Physics Master (former V9.2 spec, 3x192 ResMLP+LN+ObsNorm)
  - v2     : 59-dim Section 4 Racecraft & Turn-1 Master (3x192 ResMLP+LN+ObsNorm)
  - starts : Dedicated Standing/Rolling Grid Launch & Turn-1 Braking Specialist (2x128 ResMLP)
"""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
import os
import shutil
import struct
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

LOOKAHEAD_V5_DEFAULT = [10, 24, 45, 75, 115, 165, 230, 310]
LOOKAHEAD_V7_TECHNICAL = [8, 20, 38, 65, 105, 155, 225, 310]

OBS_CONFIG_V5_DEFAULT = {
    "lookaheadMeters": LOOKAHEAD_V5_DEFAULT,
    "curvatureMode": "window_tanh",
    "curvatureScale": 14.0,
}

OBS_CONFIG_V7_TECHNICAL = {
    "lookaheadMeters": LOOKAHEAD_V7_TECHNICAL,
    "curvatureMode": "window_tanh",
    "curvatureScale": 14.0,
}

VARIANTS = {
    "v1": {
        "name": "v1_physics_master",
        "description": "V1 Physics Master (former V9.2): 59-dim obs (4-wheel tires, brakes/fade/lock-up, dirty air, wet/puddles, damage, crest load, blue flags), 3x192 ResMLP LN+ObsNorm, tuned for Ryzen 9800X3D + RTX 4060",
        "obs_dim": 59,
        "hidden_dim": 192,
        "num_hidden_layers": 3,
        "layer_norm": True,
        "residual": True,
        "activation": "tanh",
        "ortho_init": True,
        "use_obs_norm": True,
        "obs_config": OBS_CONFIG_V7_TECHNICAL,
        "default_envs": 96,
        "default_steps": 512,
        "default_workers": 12,
        "default_updates": 2500,
        "gamma": 0.997,
        "gae_lambda": 0.96,
        "actor_lr_start": 2.6e-4,
        "critic_lr_start": 4.8e-4,
        "lr_end": 1.2e-5,
        "lr_schedule": "cosine",
        "ent_start": 0.010,
        "ent_end": 0.001,
        "max_std_start": 0.45,
        "max_std_end": 0.08,
        "action_bound_coef": 0.02,
        "vf_clip": 0.2,
        "target_kl": 0.022,
        "adaptive_tracks": True,
        "checkpoint_metric": "composite",
        "weights": os.path.join("src", "game", "aiPolicyWeights_v1.json"),
        "backup": os.path.join("audit", "aiPolicyWeights_v1.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v1.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v1.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v1"),
        "curriculum": "v1_physics_3phase",
        "env_options": {
            "obsDim": 59,
            "advancedPhysicsRandomization": True,
            "wetEpisodeRatio": 0.30,
            "brakingZoneSpawnRatio": 0.38,
            "tightPackRatio": 0.25,
            "multiLineTrafficRatio": 0.55,
            "startScenarioRatio": 0.14,
            "rollingStartRatio": 0.45,
            "technicalTrackBoost": 2.5,
            "spawnGhostSeconds": 1.8,
            "enableCarPhysicsCollisions": True,
        },
        "rewards": {
            "forwardProgress": 0.52,
            "closeProximity": 0.11,
            "minSpeedThreshold": 14.0,
            "minSpeedPenalty": 0.10,
            "floorSpeedThreshold": 7.5,
            "floorSpeedPenalty": 0.40,
            "offTrackBase": 1.65,
            "offTrackSlope": 0.52,
            "steerJerk": 0.09,
            "throttleBrakeOverlap": 0.26,
            "carCrash": 26.0,
            "wallCrash": 32.0,
            "wallScrapeBase": 1.45,
            "wallScrapeDamageScale": 0.90,
            "wallScrapeCap": 5.0,
            "maxWallScrapes": 3,
            "lapCompletionBonus": 25.0,
            "cornerSurvivalBonus": 0.11,
            "cleanOvertakeBonus": 4.6,
            "alternateLineOvertakeBonus": 2.9,
            "bumpDraftBonus": 0.14,
            "ghostOverlapPenalty": 2.0,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.42,
            "brakeLockupPenalty": 0.25,
            "tireOverheatPenalty": 0.15,
            "gravelPenalty": 0.85,
        },
    },
    "v2": {
        "name": "v2_racecraft_master",
        "description": "V2 Section 4 Racecraft & Turn-1 Master: 59-dim obs, 3x192 ResMLP LN+ObsNorm, Turn-1 cold-tire braking discipline, multi-class traffic & blue-flag passing, defensive racecraft & wet crossovers",
        "obs_dim": 59,
        "hidden_dim": 192,
        "num_hidden_layers": 3,
        "layer_norm": True,
        "residual": True,
        "activation": "tanh",
        "ortho_init": True,
        "use_obs_norm": True,
        "obs_config": OBS_CONFIG_V7_TECHNICAL,
        "default_envs": 96,
        "default_steps": 512,
        "default_workers": 12,
        "default_updates": 2500,
        "gamma": 0.997,
        "gae_lambda": 0.96,
        "actor_lr_start": 2.4e-4,
        "critic_lr_start": 4.6e-4,
        "lr_end": 1.0e-5,
        "lr_schedule": "cosine",
        "ent_start": 0.0095,
        "ent_end": 0.0009,
        "max_std_start": 0.42,
        "max_std_end": 0.075,
        "action_bound_coef": 0.02,
        "vf_clip": 0.2,
        "target_kl": 0.020,
        "adaptive_tracks": True,
        "checkpoint_metric": "composite",
        "weights": os.path.join("src", "game", "aiPolicyWeights_v2.json"),
        "backup": os.path.join("audit", "aiPolicyWeights_v2.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_v2.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_v2.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_v2"),
        "curriculum": "v2_racecraft_3phase",
        "env_options": {
            "obsDim": 59,
            "advancedPhysicsRandomization": True,
            "wetEpisodeRatio": 0.32,
            "brakingZoneSpawnRatio": 0.42,
            "tightPackRatio": 0.34,
            "multiLineTrafficRatio": 0.65,
            "startScenarioRatio": 0.24,
            "rollingStartRatio": 0.40,
            "technicalTrackBoost": 2.7,
            "spawnGhostSeconds": 1.7,
            "enableCarPhysicsCollisions": True,
        },
        "rewards": {
            "forwardProgress": 0.52,
            "closeProximity": 0.13,
            "minSpeedThreshold": 14.0,
            "minSpeedPenalty": 0.10,
            "floorSpeedThreshold": 7.5,
            "floorSpeedPenalty": 0.40,
            "offTrackBase": 1.85,
            "offTrackSlope": 0.58,
            "steerJerk": 0.10,
            "throttleBrakeOverlap": 0.28,
            "carCrash": 29.0,
            "wallCrash": 35.0,
            "wallScrapeBase": 1.60,
            "wallScrapeDamageScale": 0.95,
            "wallScrapeCap": 5.2,
            "maxWallScrapes": 3,
            "lapCompletionBonus": 26.0,
            "cornerSurvivalBonus": 0.13,
            "cleanOvertakeBonus": 5.2,
            "alternateLineOvertakeBonus": 3.4,
            "bumpDraftBonus": 0.15,
            "ghostOverlapPenalty": 2.2,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.50,
            "brakeLockupPenalty": 0.30,
            "tireOverheatPenalty": 0.16,
            "gravelPenalty": 0.95,
        },
    },
    "starts": {
        "name": "starts_grid_launch",
        "description": "Dedicated Race Starts Specialist: 2x128 ResMLP LN+ObsNorm trained on 2x2 standing (0 m/s) & rolling formation starts with clean Turn-1 braking survival",
        "obs_dim": 43,
        "hidden_dim": 128,
        "num_hidden_layers": 2,
        "layer_norm": True,
        "residual": True,
        "activation": "tanh",
        "ortho_init": True,
        "use_obs_norm": True,
        "obs_config": OBS_CONFIG_V5_DEFAULT,
        "default_envs": 48,
        "default_steps": 512,
        "default_workers": 8,
        "default_updates": 1200,
        "gamma": 0.992,
        "gae_lambda": 0.95,
        "actor_lr_start": 3e-4,
        "critic_lr_start": 5e-4,
        "lr_end": 2e-5,
        "lr_schedule": "cosine",
        "ent_start": 0.011,
        "ent_end": 0.0015,
        "max_std_start": 0.45,
        "max_std_end": 0.10,
        "action_bound_coef": 0.02,
        "vf_clip": 0.2,
        "target_kl": 0.025,
        "adaptive_tracks": True,
        "checkpoint_metric": "composite",
        "weights": os.path.join("src", "game", "aiPolicyWeights_starts.json"),
        "backup": os.path.join("audit", "aiPolicyWeights_starts.best.json"),
        "metrics": os.path.join("audit", "ppo_metrics_starts.jsonl"),
        "data_js": os.path.join("audit", "ppo_data_starts.js"),
        "pool_dir": os.path.join("audit", "selfplay_pool_starts"),
        "curriculum": False,
        "traffic_mix": {"soloRatio": 0.05, "scriptedRatio": 0.55, "selfplayRatio": 0.40},
        "env_options": {
            "startScenarioRatio": 0.94,
            "rollingStartRatio": 0.40,
            "maxEpisodeSteps": 850,
            "brakingZoneSpawnRatio": 0.06,
            "tightPackRatio": 0.12,
            "technicalTrackBoost": 1.8,
            "spawnGhostSeconds": 1.8,
            "enableCarPhysicsCollisions": True,
        },
        "rewards": {
            "forwardProgress": 0.50,
            "launchAccelBonus": 0.42,
            "closeProximity": 0.12,
            "minSpeedThreshold": 14.0,
            "minSpeedPenalty": 0.14,
            "floorSpeedThreshold": 6.0,
            "floorSpeedPenalty": 0.45,
            "offTrackBase": 1.90,
            "offTrackSlope": 0.55,
            "steerJerk": 0.10,
            "throttleBrakeOverlap": 0.28,
            "carCrash": 28.0,
            "wallCrash": 32.0,
            "wallScrapeBase": 1.45,
            "wallScrapeDamageScale": 0.85,
            "wallScrapeCap": 4.8,
            "maxWallScrapes": 3,
            "lapCompletionBonus": 12.0,
            "cornerSurvivalBonus": 0.14,
            "cleanOvertakeBonus": 3.2,
            "ghostOverlapPenalty": 2.2,
            "stallStopSpeed": 2.0,
            "ttcPenalty": 0.55,
        },
    },
}

# Alias map for convenient variant naming
VARIANT_ALIASES = {
    "1": "v1", "v1": "v1", "v1_physics_master": "v1", "v9_2": "v1", "physics": "v1",
    "2": "v2", "v2": "v2", "v2_racecraft_master": "v2", "racecraft": "v2", "s4": "v2",
    "starts": "starts", "start": "starts", "starts_grid_launch": "starts", "launch": "starts", "grid": "starts",
}


class RunningMeanStd:
    """Online running mean/std normalizer (Chan parallel Welford algorithm) exported cleanly to JSON."""

    def __init__(self, shape: int = OBS_DIM, clip: float = 10.0, eps: float = 1e-4):
        self.mean = np.zeros(shape, dtype=np.float64)
        self.var = np.ones(shape, dtype=np.float64)
        self.count = float(eps)
        self.clip = float(clip)

    def update(self, x: np.ndarray) -> None:
        arr = np.asarray(x, dtype=np.float64)
        if arr.ndim == 1:
            arr = arr[None, :]
        batch_mean = np.mean(arr, axis=0)
        batch_var = np.var(arr, axis=0)
        batch_count = float(arr.shape[0])
        delta = batch_mean - self.mean
        tot_count = self.count + batch_count
        new_mean = self.mean + delta * (batch_count / tot_count)
        m_a = self.var * self.count
        m_b = batch_var * batch_count
        m2 = m_a + m_b + (delta ** 2) * (self.count * batch_count / tot_count)
        self.mean = new_mean
        self.var = np.maximum(m2 / tot_count, 1e-6)
        self.count = tot_count

    def std(self) -> np.ndarray:
        return np.sqrt(np.maximum(self.var, 1e-6))

    def normalize(self, x: np.ndarray) -> np.ndarray:
        norm = (x - self.mean.astype(np.float32)) / self.std().astype(np.float32)
        return np.clip(norm, -self.clip, self.clip).astype(np.float32)

    def to_dict(self) -> dict:
        return {
            "mean": [round(float(v), 6) for v in self.mean],
            "std": [round(float(v), 6) for v in self.std()],
            "clip": self.clip,
        }

    def load_dict(self, d: dict) -> bool:
        try:
            m = np.array(d["mean"], dtype=np.float64)
            s = np.array(d["std"], dtype=np.float64)
            if m.shape == self.mean.shape and s.shape == self.var.shape and np.all(np.isfinite(m)) and np.all(s > 0):
                self.mean = m
                self.var = s ** 2
                self.clip = float(d.get("clip", self.clip))
                self.count = max(self.count, 10000.0)
                return True
        except Exception:
            pass
        return False


def _ortho_init_linear(layer: nn.Linear, gain: float) -> None:
    nn.init.orthogonal_(layer.weight, gain=gain)
    nn.init.constant_(layer.bias, 0.0)


class ResidualMLP(nn.Module):
    """Flexible 2- or 3-hidden-layer MLP supporting optional LayerNorm, residual skips, and Tanh/SiLU."""

    def __init__(
        self,
        in_dim: int,
        hidden_dim: int,
        out_dim: int,
        num_hidden_layers: int = 2,
        layer_norm: bool = False,
        residual: bool = False,
        activation: str = "tanh",
        ortho_init: bool = False,
        out_gain: float = 0.01,
        init_out_bias: list[float] | None = None,
    ):
        super().__init__()
        self.num_hidden_layers = num_hidden_layers
        self.use_layer_norm = layer_norm
        self.use_residual = residual
        self.activation_name = activation

        self.linears = nn.ModuleList()
        self.norms = nn.ModuleList()
        for k in range(num_hidden_layers):
            din = in_dim if k == 0 else hidden_dim
            lin = nn.Linear(din, hidden_dim)
            if ortho_init:
                _ortho_init_linear(lin, math.sqrt(2.0))
            self.linears.append(lin)
            if layer_norm:
                self.norms.append(nn.LayerNorm(hidden_dim))

        self.out_linear = nn.Linear(hidden_dim, out_dim)
        if ortho_init:
            _ortho_init_linear(self.out_linear, out_gain)
            if init_out_bias is not None and len(init_out_bias) == out_dim:
                with torch.no_grad():
                    self.out_linear.bias.copy_(torch.tensor(init_out_bias, dtype=torch.float32))

        self.act = nn.SiLU() if activation == "silu" else nn.Tanh()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = x
        for k in range(self.num_hidden_layers):
            z = self.linears[k](h)
            if self.use_layer_norm:
                z = self.norms[k](z)
            z = self.act(z)
            if self.use_residual and k >= 1:
                h = z + h
            else:
                h = z
        return self.out_linear(h)


class ActorCritic(nn.Module):
    def __init__(
        self,
        obs_dim: int = OBS_DIM,
        act_dim: int = ACT_DIM,
        hidden_dim: int = 64,
        init_log_std: float = -0.7,
        num_hidden_layers: int = 2,
        layer_norm: bool = False,
        residual: bool = False,
        activation: str = "tanh",
        ortho_init: bool = False,
    ):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_hidden_layers = num_hidden_layers
        self.use_layer_norm = layer_norm
        self.use_residual = residual
        self.activation_name = activation
        self.is_extended = (
            num_hidden_layers != 2
            or layer_norm
            or residual
            or activation != "tanh"
            or ortho_init
        )

        if not self.is_extended:
            # Exact legacy v1..v4 architecture
            self.actor = nn.Sequential(
                nn.Linear(obs_dim, hidden_dim),
                nn.Tanh(),
                nn.Linear(hidden_dim, hidden_dim),
                nn.Tanh(),
                nn.Linear(hidden_dim, act_dim),
            )
            self.critic = nn.Sequential(
                nn.Linear(obs_dim, hidden_dim),
                nn.Tanh(),
                nn.Linear(hidden_dim, hidden_dim),
                nn.Tanh(),
                nn.Linear(hidden_dim, 1),
            )
        else:
            # Start with mild forward-throttle / off-brake bias so step-1 rollouts accelerate cleanly
            self.actor = ResidualMLP(
                in_dim=obs_dim,
                hidden_dim=hidden_dim,
                out_dim=act_dim,
                num_hidden_layers=num_hidden_layers,
                layer_norm=layer_norm,
                residual=residual,
                activation=activation,
                ortho_init=ortho_init,
                out_gain=0.01,
                init_out_bias=[0.0, 0.30, -0.50],
            )
            self.critic = ResidualMLP(
                in_dim=obs_dim,
                hidden_dim=hidden_dim,
                out_dim=1,
                num_hidden_layers=num_hidden_layers,
                layer_norm=layer_norm,
                residual=residual,
                activation=activation,
                ortho_init=ortho_init,
                out_gain=1.0,
            )

        self.log_std = nn.Parameter(torch.full((act_dim,), init_log_std))

    def get_actor_linears(self) -> list[nn.Linear]:
        if isinstance(self.actor, ResidualMLP):
            return list(self.actor.linears) + [self.actor.out_linear]
        return [m for m in self.actor if isinstance(m, nn.Linear)]

    def get_actor_norms(self) -> list[nn.LayerNorm]:
        if isinstance(self.actor, ResidualMLP) and self.actor.use_layer_norm:
            return list(self.actor.norms)
        return []

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


def load_actor_from_json(
    model: ActorCritic,
    path: str,
    hidden_dim: int,
    obs_rms: RunningMeanStd | None = None,
) -> tuple[bool, float]:
    if not os.path.exists(path):
        return False, -1e9
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        if d.get("version", 1) < 2:
            print(f"Skipping {path}: legacy v1 tanh-bounded weights incompatible with full-pedal v2/v3 policy")
            return False, -1e9
        if len(d.get("w0", [])) != hidden_dim:
            print(f"Skipping {path}: hidden dim {len(d.get('w0', []))} != {hidden_dim}")
            return False, -1e9
        file_hidden_layers = int(d.get("numHiddenLayers", 3 if ("w3" in d and "b3" in d) else 2))
        if file_hidden_layers != model.num_hidden_layers:
            print(f"Skipping {path}: numHiddenLayers {file_hidden_layers} != {model.num_hidden_layers}")
            return False, -1e9
        file_has_ln = "ln0Weight" in d and "ln0Bias" in d
        if file_has_ln != model.use_layer_norm:
            print(f"Skipping {path}: layerNorm mismatch ({file_has_ln} != {model.use_layer_norm})")
            return False, -1e9

        layers = model.get_actor_linears()
        with torch.no_grad():
            for idx, lin in enumerate(layers):
                lin.weight.copy_(torch.tensor(d[f"w{idx}"], dtype=torch.float32))
                lin.bias.copy_(torch.tensor(d[f"b{idx}"], dtype=torch.float32))
            norms = model.get_actor_norms()
            for idx, ln in enumerate(norms):
                ln.weight.copy_(torch.tensor(d[f"ln{idx}Weight"], dtype=torch.float32))
                ln.bias.copy_(torch.tensor(d[f"ln{idx}Bias"], dtype=torch.float32))
        if obs_rms is not None and isinstance(d.get("obsNorm"), dict):
            obs_rms.load_dict(d["obsNorm"])
        prev_best = float(d.get("meta", {}).get("checkpointScore", d.get("meta", {}).get("meanStepReward", -1e9)))
        return True, prev_best
    except Exception as e:
        print(f"Error loading {path}: {e}")
        return False, -1e9


def export_actor_to_json(
    model: ActorCritic,
    path: str,
    metadata: dict,
    variant_name: str,
    hidden_dim: int,
    backup_path: str | None = None,
    obs_rms: RunningMeanStd | None = None,
    obs_config: dict | None = None,
):
    layers = model.get_actor_linears()
    norms = model.get_actor_norms()
    meta_with_ts = dict(metadata)
    meta_with_ts["variant"] = variant_name
    meta_with_ts["savedAt"] = datetime.now(timezone.utc).isoformat()

    is_v3 = model.is_extended or (obs_rms is not None) or (obs_config is not None)
    obs_dim_export = int(layers[0].in_features)
    payload: dict = {
        "version": 3 if is_v3 else 2,
        "obsDim": obs_dim_export,
        "actDim": ACT_DIM,
        "hiddenDim": hidden_dim,
    }
    for idx, lin in enumerate(layers):
        payload[f"w{idx}"] = lin.weight.detach().cpu().tolist()
        payload[f"b{idx}"] = lin.bias.detach().cpu().tolist()

    if is_v3:
        payload["numHiddenLayers"] = model.num_hidden_layers
        payload["activation"] = model.activation_name
        payload["residual"] = model.use_residual
        for idx, ln in enumerate(norms):
            payload[f"ln{idx}Weight"] = ln.weight.detach().cpu().tolist()
            payload[f"ln{idx}Bias"] = ln.bias.detach().cpu().tolist()
        if obs_rms is not None:
            payload["obsNorm"] = obs_rms.to_dict()
        if obs_config is not None:
            payload["obsConfig"] = obs_config
            meta_with_ts["obsConfig"] = obs_config

    payload["meta"] = meta_with_ts

    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    os.replace(tmp_path, path)
    if backup_path:
        os.makedirs(os.path.dirname(os.path.abspath(backup_path)), exist_ok=True)
        shutil.copy2(path, backup_path)

    # Also write compact ANB1 binary companion (.bin) (~4x smaller, zero JSON float-parsing overhead)
    try:
        bin_path = os.path.splitext(path)[0] + ".bin"
        export_actor_to_bin(
            model=model,
            bin_path=bin_path,
            metadata=meta_with_ts,
            hidden_dim=hidden_dim,
            obs_rms=obs_rms,
            obs_config=obs_config,
        )
        # Keep public/models/policies/ mirrored for runtime browser ANB1 hot-loading
        norm_p = os.path.normpath(path).replace("\\", "/")
        if norm_p.startswith("src/game/aiPolicyWeights_"):
            public_dir = os.path.join("public", "models", "policies")
            os.makedirs(public_dir, exist_ok=True)
            shutil.copy2(bin_path, os.path.join(public_dir, os.path.basename(bin_path)))
    except Exception:
        pass


def export_actor_to_bin(
    model: ActorCritic,
    bin_path: str,
    metadata: dict,
    hidden_dim: int,
    obs_rms: RunningMeanStd | None = None,
    obs_config: dict | None = None,
):
    """Exports policy weights into compact ANB1 binary format matching decodePolicyWeightsBinary()."""
    layers = model.get_actor_linears()
    norms = model.get_actor_norms()
    has_ln = len(norms) > 0
    has_obs_norm = obs_rms is not None
    obs_dim_export = int(layers[0].in_features)
    header = {
        "version": 3,
        "obsDim": obs_dim_export,
        "hiddenDim": hidden_dim,
        "actDim": ACT_DIM,
        "numHiddenLayers": model.num_hidden_layers,
        "activation": model.activation_name,
        "residual": bool(model.use_residual),
        "hasLn": has_ln,
        "hasObsNorm": has_obs_norm,
        "obsNormClip": float(obs_rms.clip) if obs_rms is not None else 10.0,
        "obsConfig": obs_config,
        "meta": metadata,
    }
    header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    pad_len = (-len(header_bytes)) % 4

    tensors: list[np.ndarray] = []
    if has_obs_norm and obs_rms is not None:
        tensors.append(obs_rms.mean.astype("<f4", copy=False))
        tensors.append(obs_rms.std().astype("<f4", copy=False))
    for idx in range(model.num_hidden_layers):
        lin = layers[idx]
        tensors.append(lin.weight.detach().cpu().numpy().astype("<f4", copy=False).ravel())
        tensors.append(lin.bias.detach().cpu().numpy().astype("<f4", copy=False).ravel())
        if has_ln:
            ln = norms[idx]
            tensors.append(ln.weight.detach().cpu().numpy().astype("<f4", copy=False).ravel())
            tensors.append(ln.bias.detach().cpu().numpy().astype("<f4", copy=False).ravel())
    out_lin = layers[model.num_hidden_layers]
    tensors.append(out_lin.weight.detach().cpu().numpy().astype("<f4", copy=False).ravel())
    tensors.append(out_lin.bias.detach().cpu().numpy().astype("<f4", copy=False).ravel())

    tmp_bin = bin_path + ".tmp"
    with open(tmp_bin, "wb") as f:
        f.write(b"ANB1")
        f.write(struct.pack("<I", len(header_bytes)))
        f.write(header_bytes)
        if pad_len:
            f.write(b"\x00" * pad_len)
        for arr in tensors:
            f.write(arr.tobytes())
    os.replace(tmp_bin, bin_path)


def save_selfplay_snapshot(
    model: ActorCritic,
    pool_dir: str,
    update: int,
    metadata: dict,
    variant_name: str,
    hidden_dim: int,
    obs_rms: RunningMeanStd | None = None,
    obs_config: dict | None = None,
):
    os.makedirs(pool_dir, exist_ok=True)
    ts = int(time.time())
    snap_name = f"snap_{ts}_u{update:05d}.json"
    snap_path = os.path.join(pool_dir, snap_name)
    export_actor_to_json(
        model,
        snap_path,
        metadata,
        variant_name,
        hidden_dim,
        backup_path=None,
        obs_rms=obs_rms,
        obs_config=obs_config,
    )
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


def compute_curriculum_state(
    update: int,
    total_updates: int,
    curriculum_mode,
    base_rewards: dict,
    base_traffic_mix: dict | None = None,
    base_env_options: dict | None = None,
) -> tuple[int, dict[str, float], dict | None, dict | None]:
    """Computes (phase, traffic_mix, optional reward_patch, optional env_options_patch)."""
    if not curriculum_mode:
        mix = dict(base_traffic_mix) if base_traffic_mix else {"soloRatio": 0.20, "scriptedRatio": 0.35, "selfplayRatio": 0.45}
        return 1, mix, None, None

    if curriculum_mode in ("v1_physics_3phase", "v9_master_3phase"):
        p1_end = max(1, int(round(0.25 * total_updates)))
        p2_end = max(p1_end + 1, int(round(0.60 * total_updates)))
        if update <= p1_end:
            # Phase 1: Technical Track Survival & Physics Foundation (85% solo / 15% scripted, heavy braking zones)
            rew = dict(base_rewards)
            rew["forwardProgress"] = 0.46
            rew["wallCrash"] = 32.0
            rew["wallScrapeBase"] = 1.5
            rew["cornerSurvivalBonus"] = 0.12
            rew["bumpDraftBonus"] = 0.08
            eo = dict(base_env_options or {})
            eo["brakingZoneSpawnRatio"] = 0.42
            eo["multiLineTrafficRatio"] = 0.30
            eo["startScenarioRatio"] = 0.08
            eo["spawnGhostSeconds"] = 2.0
            eo["enableCarPhysicsCollisions"] = True
            return 1, {"soloRatio": 0.85, "scriptedRatio": 0.15, "selfplayRatio": 0.0}, rew, eo
        if update <= p2_end:
            # Phase 2: Multi-Line Racecraft, Alternate Lines & Straightaway Bump-Drafting
            ramp = max(0.0, min(1.0, (update - p1_end) / max(1, p2_end - p1_end)))
            scripted = round(0.20 + 0.15 * ramp, 4)
            selfplay = round(0.30 * ramp, 4)
            solo = round(max(0.35, 1.0 - scripted - selfplay), 4)
            rew = dict(base_rewards)
            rew["forwardProgress"] = 0.52
            rew["wallCrash"] = 30.0
            rew["carCrash"] = 24.0
            rew["cleanOvertakeBonus"] = 4.5
            rew["alternateLineOvertakeBonus"] = 2.5
            rew["bumpDraftBonus"] = 0.12
            eo = dict(base_env_options or {})
            eo["brakingZoneSpawnRatio"] = 0.30
            eo["multiLineTrafficRatio"] = 0.55
            eo["startScenarioRatio"] = 0.12
            eo["spawnGhostSeconds"] = 1.9
            eo["enableCarPhysicsCollisions"] = True
            return 2, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}, rew, eo
        # Phase 3: Full Physics Mastery (Dense Selfplay + Multi-Line Battles + Bump-Drafting + Max Pace)
        ramp = max(0.0, min(1.0, (update - p2_end) / max(1, total_updates - p2_end)))
        selfplay = round(0.30 + 0.20 * ramp, 4)
        scripted = round(0.35 - 0.10 * ramp, 4)
        solo = round(max(0.25, 1.0 - scripted - selfplay), 4)
        rew = dict(base_rewards)
        rew["forwardProgress"] = 0.52
        rew["wallCrash"] = 32.0
        rew["carCrash"] = 26.0
        rew["cleanOvertakeBonus"] = 5.0
        rew["alternateLineOvertakeBonus"] = 3.0
        rew["bumpDraftBonus"] = 0.14
        rew["ghostOverlapPenalty"] = 2.2
        eo = dict(base_env_options or {})
        eo["brakingZoneSpawnRatio"] = 0.28
        eo["multiLineTrafficRatio"] = 0.60
        eo["startScenarioRatio"] = 0.16
        eo["spawnGhostSeconds"] = 1.6
        eo["enableCarPhysicsCollisions"] = True
        return 3, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}, rew, eo

    if curriculum_mode == "v2_racecraft_3phase":
        p1_end = max(1, int(round(0.22 * total_updates)))
        p2_end = max(p1_end + 1, int(round(0.58 * total_updates)))
        if update <= p1_end:
            # Phase 1: Turn-1 Cold-Tire Braking Discipline & Heavy-Braking Corner Survival
            rew = dict(base_rewards)
            rew["forwardProgress"] = 0.45
            rew["wallCrash"] = 36.0
            rew["offTrackBase"] = 1.95
            rew["brakeLockupPenalty"] = 0.32
            rew["cornerSurvivalBonus"] = 0.15
            eo = dict(base_env_options or {})
            eo["brakingZoneSpawnRatio"] = 0.48
            eo["startScenarioRatio"] = 0.20
            eo["multiLineTrafficRatio"] = 0.35
            eo["spawnGhostSeconds"] = 1.9
            eo["enableCarPhysicsCollisions"] = True
            return 1, {"soloRatio": 0.72, "scriptedRatio": 0.28, "selfplayRatio": 0.0}, rew, eo
        if update <= p2_end:
            # Phase 2: Multi-Class Passing, Blue-Flag Traffic & Clean Alternate-Line Overtaking
            ramp = max(0.0, min(1.0, (update - p1_end) / max(1, p2_end - p1_end)))
            scripted = round(0.28 + 0.12 * ramp, 4)
            selfplay = round(0.32 * ramp, 4)
            solo = round(max(0.28, 1.0 - scripted - selfplay), 4)
            rew = dict(base_rewards)
            rew["forwardProgress"] = 0.52
            rew["wallCrash"] = 34.0
            rew["carCrash"] = 28.0
            rew["cleanOvertakeBonus"] = 5.4
            rew["alternateLineOvertakeBonus"] = 3.5
            rew["ttcPenalty"] = 0.50
            eo = dict(base_env_options or {})
            eo["brakingZoneSpawnRatio"] = 0.38
            eo["startScenarioRatio"] = 0.24
            eo["multiLineTrafficRatio"] = 0.65
            eo["tightPackRatio"] = 0.36
            eo["spawnGhostSeconds"] = 1.7
            eo["enableCarPhysicsCollisions"] = True
            return 2, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}, rew, eo
        # Phase 3: Full Racecraft Mastery (Dense Self-Play Packs, Standing Starts -> Turn 1, Wet Crossovers)
        ramp = max(0.0, min(1.0, (update - p2_end) / max(1, total_updates - p2_end)))
        selfplay = round(0.34 + 0.22 * ramp, 4)
        scripted = round(0.38 - 0.10 * ramp, 4)
        solo = round(max(0.18, 1.0 - scripted - selfplay), 4)
        rew = dict(base_rewards)
        rew["forwardProgress"] = 0.53
        rew["wallCrash"] = 35.0
        rew["carCrash"] = 30.0
        rew["cleanOvertakeBonus"] = 5.8
        rew["alternateLineOvertakeBonus"] = 3.8
        rew["bumpDraftBonus"] = 0.16
        rew["ghostOverlapPenalty"] = 2.4
        eo = dict(base_env_options or {})
        eo["brakingZoneSpawnRatio"] = 0.32
        eo["startScenarioRatio"] = 0.26
        eo["multiLineTrafficRatio"] = 0.70
        eo["tightPackRatio"] = 0.40
        eo["spawnGhostSeconds"] = 1.5
        eo["enableCarPhysicsCollisions"] = True
        return 3, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}, rew, eo

    # Fallback 2-phase ramp
    phase1_end = max(1, int(round(0.45 * total_updates)))
    if update <= phase1_end:
        return 1, {"soloRatio": 1.0, "scriptedRatio": 0.0, "selfplayRatio": 0.0}, None, None
    ramp = max(0.0, min(1.0, (update - phase1_end) / max(1, total_updates - phase1_end)))
    scripted = round(0.35 * ramp, 4)
    selfplay = round(0.45 * ramp, 4)
    solo = round(max(0.0, 1.0 - scripted - selfplay), 4)
    return 2, {"soloRatio": solo, "scriptedRatio": scripted, "selfplayRatio": selfplay}, None, None


def compute_traffic_mix(update: int, total_updates: int, is_curriculum: bool) -> tuple[int, dict[str, float]]:
    """Backwards-compatible wrapper for legacy callers."""
    phase, mix, _, _ = compute_curriculum_state(update, total_updates, is_curriculum, {})
    return phase, mix


def spawn_env_worker(binary_ipc: bool = True):
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [npx_cmd, "tsx", "scripts/headlessEnv.ts"]
    if binary_ipc:
        cmd.append("--binary-ipc")
    return subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=not binary_ipc,
        bufsize=0 if binary_ipc else 1,
    )


def _read_exact(stream, n: int) -> bytes:
    chunks: list[bytes] = []
    remaining = n
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            raise RuntimeError("headlessEnv worker closed unexpectedly during binary IPC read")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks) if len(chunks) > 1 else chunks[0]


def _write_bin_frame(stream, msg_type: int, payload: bytes) -> None:
    stream.write(struct.pack("<II", msg_type, len(payload)))
    if payload:
        stream.write(payload)
    stream.flush()


def _read_bin_frame(stream) -> tuple[int, bytes]:
    hdr = _read_exact(stream, 8)
    msg_type, payload_len = struct.unpack("<II", hdr)
    payload = _read_exact(stream, payload_len) if payload_len > 0 else b""
    return msg_type, payload


class VectorEnvPool:
    """Shards N parallel slots across W independent headlessEnv Node processes for multi-core CPU speed."""

    def __init__(self, num_envs: int, num_workers: int = 1, binary_ipc: bool = True, obs_dim: int = OBS_DIM):
        self.num_envs = num_envs
        self.num_workers = max(1, min(num_workers, num_envs))
        self.binary_ipc = binary_ipc
        self.obs_dim = obs_dim
        base = num_envs // self.num_workers
        rem = num_envs % self.num_workers
        self.slices: list[tuple[int, int]] = []
        offset = 0
        for w in range(self.num_workers):
            cnt = base + (1 if w < rem else 0)
            self.slices.append((offset, offset + cnt))
            offset += cnt
        self.workers = [spawn_env_worker(binary_ipc=binary_ipc) for _ in range(self.num_workers)]

    def init(self, init_payload_base: dict) -> np.ndarray:
        for w_idx, (s0, s1) in enumerate(self.slices):
            payload = dict(init_payload_base)
            payload["cmd"] = "init"
            payload["numEnvs"] = s1 - s0
            if self.binary_ipc:
                _write_bin_frame(self.workers[w_idx].stdin, 1, json.dumps(payload).encode("utf-8"))
            else:
                self.workers[w_idx].stdin.write(json.dumps(payload) + "\n")
                self.workers[w_idx].stdin.flush()

        obs_parts = []
        for w_idx in range(self.num_workers):
            if self.binary_ipc:
                _, raw = _read_bin_frame(self.workers[w_idx].stdout)
                resp = json.loads(raw.decode("utf-8"))
            else:
                line = self.workers[w_idx].stdout.readline()
                if not line:
                    raise RuntimeError(f"headlessEnv worker #{w_idx} closed unexpectedly on init")
                resp = json.loads(line)
            obs_parts.append(np.array(resp["obs"], dtype=np.float32))
        return np.concatenate(obs_parts, axis=0)

    def step(
        self,
        actions_clipped: np.ndarray,
        traffic_mix: dict | None = None,
        reward_weights: dict | None = None,
        env_options: dict | None = None,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list, list]:
        if self.binary_ipc:
            patch_dict: dict = {}
            if traffic_mix is not None:
                patch_dict["trafficMix"] = traffic_mix
            if reward_weights is not None:
                patch_dict["rewardWeights"] = reward_weights
            if env_options is not None:
                patch_dict["envOptions"] = env_options
            patch_bytes = json.dumps(patch_dict, separators=(",", ":")).encode("utf-8") if patch_dict else b""
            actions_f32 = np.ascontiguousarray(actions_clipped, dtype="<f4")

            for w_idx, (s0, s1) in enumerate(self.slices):
                n_w = s1 - s0
                act_bytes = actions_f32[s0:s1].tobytes()
                req_payload = struct.pack("<II", n_w, len(patch_bytes)) + patch_bytes + act_bytes
                _write_bin_frame(self.workers[w_idx].stdin, 2, req_payload)

            obs_parts, rew_parts, done_parts, trunc_parts = [], [], [], []
            final_obs_all: list = []
            infos_all: list = []
            for w_idx, (s0, s1) in enumerate(self.slices):
                _, raw = _read_bin_frame(self.workers[w_idx].stdout)
                mv = memoryview(raw)
                off = 0
                (n_w,) = struct.unpack_from("<I", mv, off)
                off += 4
                obs_len = n_w * self.obs_dim * 4
                obs_arr = np.frombuffer(mv[off:off + obs_len], dtype="<f4").reshape(n_w, self.obs_dim).copy()
                off += obs_len
                rew_len = n_w * 4
                rew_arr = np.frombuffer(mv[off:off + rew_len], dtype="<f4").copy()
                off += rew_len
                done_arr = np.frombuffer(mv[off:off + n_w], dtype=np.uint8).astype(np.float32)
                off += n_w
                trunc_arr = np.frombuffer(mv[off:off + n_w], dtype=np.uint8).astype(np.float32)
                off += n_w
                (fobs_count,) = struct.unpack_from("<I", mv, off)
                off += 4
                fobs_w: list = [None] * n_w
                for _ in range(fobs_count):
                    (env_idx,) = struct.unpack_from("<I", mv, off)
                    off += 4
                    fobs_w[env_idx] = np.frombuffer(mv[off:off + self.obs_dim * 4], dtype="<f4").copy()
                    off += self.obs_dim * 4
                (info_len,) = struct.unpack_from("<I", mv, off)
                off += 4
                info_list = json.loads(bytes(mv[off:off + info_len]).decode("utf-8"))

                obs_parts.append(obs_arr)
                rew_parts.append(rew_arr)
                done_parts.append(done_arr)
                trunc_parts.append(trunc_arr)
                final_obs_all.extend(fobs_w)
                infos_all.extend(info_list)

            return (
                np.concatenate(obs_parts, axis=0),
                np.concatenate(rew_parts, axis=0),
                np.concatenate(done_parts, axis=0),
                np.concatenate(trunc_parts, axis=0),
                final_obs_all,
                infos_all,
            )

        # Legacy JSON-lines transport fallback
        for w_idx, (s0, s1) in enumerate(self.slices):
            req: dict = {"cmd": "step", "actions": actions_clipped[s0:s1].tolist()}
            if traffic_mix is not None:
                req["trafficMix"] = traffic_mix
            if reward_weights is not None:
                req["rewardWeights"] = reward_weights
            if env_options is not None:
                req["envOptions"] = env_options
            self.workers[w_idx].stdin.write(json.dumps(req) + "\n")
            self.workers[w_idx].stdin.flush()

        obs_parts, rew_parts, done_parts, trunc_parts = [], [], [], []
        final_obs_all: list = []
        infos_all: list = []
        for w_idx, (s0, s1) in enumerate(self.slices):
            line = self.workers[w_idx].stdout.readline()
            if not line:
                raise RuntimeError(f"headlessEnv worker #{w_idx} closed unexpectedly on step")
            resp = json.loads(line)
            obs_parts.append(np.array(resp["obs"], dtype=np.float32))
            rew_parts.append(np.array(resp["rewards"], dtype=np.float32))
            done_parts.append(np.array(resp["dones"], dtype=np.float32))
            if "truncated" in resp:
                trunc_parts.append(np.array(resp["truncated"], dtype=np.float32))
            else:
                trunc_parts.append(np.zeros(s1 - s0, dtype=np.float32))
            fobs = resp.get("finalObs")
            if fobs is not None:
                final_obs_all.extend(fobs)
            else:
                final_obs_all.extend([None] * (s1 - s0))
            infos_all.extend(resp.get("info") or resp.get("infos") or [])

        return (
            np.concatenate(obs_parts, axis=0),
            np.concatenate(rew_parts, axis=0),
            np.concatenate(done_parts, axis=0),
            np.concatenate(trunc_parts, axis=0),
            final_obs_all,
            infos_all,
        )

    def terminate(self) -> None:
        for w in self.workers:
            try:
                w.terminate()
            except Exception:
                pass


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


def schedule_value(start: float, end: float, progress: float, mode: str = "linear") -> float:
    p = max(0.0, min(1.0, progress))
    if mode == "cosine":
        return end + 0.5 * (start - end) * (1.0 + math.cos(math.pi * p))
    return start + p * (end - start)


def run_bc_warmstart(
    model: ActorCritic,
    obs_rms: RunningMeanStd | None,
    dataset_path: str,
    obs_dim: int,
    device: torch.device,
    epochs: int = 12,
    lr: float = 5e-4,
) -> int:
    """Supervised Behavioral Cloning warm-start from exported HumanTelemetryRecorder JSONL laps."""
    if not dataset_path or not os.path.exists(dataset_path):
        print(f"[BC] Dataset file not found: {dataset_path}")
        return 0
    obs_rows: list[np.ndarray] = []
    act_rows: list[list[float]] = []
    with open(dataset_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(rec, dict) or rec.get("type") == "header":
                continue
            # Format A: TelemetryLapDemo exported by HumanTelemetryRecorder ({ samples: [[...obs, steer, thrAct, brkAct]] })
            lap_samples = rec.get("samples")
            if isinstance(lap_samples, list):
                for row in lap_samples:
                    if not isinstance(row, list) or len(row) < 46:
                        continue
                    raw_o = row[:-3]
                    vec = np.zeros(obs_dim, dtype=np.float32)
                    copy_n = min(obs_dim, len(raw_o))
                    vec[:copy_n] = np.asarray(raw_o[:copy_n], dtype=np.float32)
                    if not np.all(np.isfinite(vec)):
                        continue
                    act_rows.append([
                        max(-1.0, min(1.0, float(row[-3]))),
                        max(-1.0, min(1.0, float(row[-2]))),
                        max(-1.0, min(1.0, float(row[-1]))),
                    ])
                    obs_rows.append(vec)
                continue
            # Format B: Per-frame JSONL record ({ obs: [...], steer, throttle, brake })
            raw_obs = rec.get("obs")
            if not isinstance(raw_obs, list) or len(raw_obs) < 43:
                continue
            vec = np.zeros(obs_dim, dtype=np.float32)
            copy_n = min(obs_dim, len(raw_obs))
            vec[:copy_n] = np.asarray(raw_obs[:copy_n], dtype=np.float32)
            if not np.all(np.isfinite(vec)):
                continue
            steer = float(rec.get("steer", 0.0))
            throttle = float(rec.get("throttle", 0.0))
            brake = float(rec.get("brake", 0.0))
            # Convert [0, 1] throttle/brake into tanh-space [-1, 1] targets matching actor mean output
            act_rows.append([
                max(-1.0, min(1.0, steer)),
                max(-1.0, min(1.0, throttle * 2.0 - 1.0)),
                max(-1.0, min(1.0, brake * 2.0 - 1.0)),
            ])
            obs_rows.append(vec)
    if len(obs_rows) < 32:
        print(f"[BC] Not enough valid frames ({len(obs_rows)}) in {dataset_path} — skipping BC warm-start.")
        return 0

    X = np.stack(obs_rows, axis=0)
    Y = np.asarray(act_rows, dtype=np.float32)
    if obs_rms is not None:
        obs_rms.update(X)
        X = obs_rms.normalize(X)

    x_t = torch.from_numpy(X).to(device)
    y_t = torch.from_numpy(Y).to(device)
    opt = torch.optim.Adam(model.actor.parameters(), lr=lr, eps=1e-5)
    batch_size = min(256, len(obs_rows))
    model.train()
    last_loss = 0.0
    for ep in range(1, max(1, epochs) + 1):
        perm = torch.randperm(x_t.shape[0], device=device)
        ep_loss = 0.0
        n_batches = 0
        for start in range(0, x_t.shape[0], batch_size):
            idx = perm[start : start + batch_size]
            pred = model.actor(x_t[idx])
            loss = torch.mean((pred - y_t[idx]) ** 2)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.actor.parameters(), 1.0)
            opt.step()
            ep_loss += float(loss.item())
            n_batches += 1
        last_loss = ep_loss / max(1, n_batches)
    print(f"[BC] Warm-started actor on {len(obs_rows):,} human frames ({epochs} epochs) | Final MSE: {last_loss:.5f}")
    return len(obs_rows)


def train_single_variant(var_key: str, args):
    cfg = VARIANTS[var_key]
    var_name = cfg["name"]
    obs_dim = int(cfg.get("obs_dim", OBS_DIM))
    hidden_dim = args.hidden_dim if args.hidden_dim is not None else cfg["hidden_dim"]
    num_hidden_layers = int(cfg.get("num_hidden_layers", 2))
    use_layer_norm = bool(cfg.get("layer_norm", False))
    use_residual = bool(cfg.get("residual", False))
    activation = str(cfg.get("activation", "tanh"))
    ortho_init = bool(cfg.get("ortho_init", False))
    use_obs_norm = bool(cfg.get("use_obs_norm", False))
    obs_config = cfg.get("obs_config", None)
    base_env_options = dict(cfg.get("env_options", {})) if cfg.get("env_options") else None
    adaptive_tracks = bool(cfg.get("adaptive_tracks", False))
    checkpoint_metric = str(cfg.get("checkpoint_metric", "mean_rew"))

    num_envs = args.envs if args.envs is not None else int(cfg.get("default_envs", 64))
    steps_per_update = args.steps if args.steps is not None else int(cfg.get("default_steps", 512))
    total_updates = 400 if getattr(args, "quick", False) else (
        args.updates if args.updates is not None else int(cfg.get("default_updates", 2500))
    )
    default_workers = int(cfg.get("default_workers", 8))
    cpu_cap = max(1, os.cpu_count() or 1)
    num_workers = args.workers if args.workers is not None else min(default_workers, num_envs, cpu_cap)
    # Prevent PyTorch OpenMP thread oversubscription when running many Node worker processes
    if num_workers >= 4:
        os.environ.setdefault("OMP_NUM_THREADS", "2")
        os.environ.setdefault("MKL_NUM_THREADS", "2")
        try:
            torch.set_num_threads(2)
        except Exception:
            pass
    # Keep args.envs and args.updates synced for downstream references in this function
    args.envs = num_envs
    args.updates = total_updates

    weights_path = args.weights if args.weights else cfg["weights"]
    backup_weights_path = args.backup if args.backup else cfg["backup"]
    metrics_path = args.metrics if args.metrics else cfg["metrics"]
    data_js_path = args.data_js if args.data_js else cfg["data_js"]
    pool_dir = args.pool_dir if args.pool_dir else cfg["pool_dir"]
    curriculum_mode = args.curriculum if args.curriculum is not None else cfg["curriculum"]
    is_curriculum = bool(curriculum_mode)
    reward_weights = dict(cfg["rewards"])
    base_traffic_mix = cfg.get("traffic_mix", None)

    device = resolve_device(getattr(args, "device", "auto"))
    dev_name_str = ""
    if device.type == "cuda" and torch.cuda.is_available() and torch.cuda.device_count() > 0:
        torch.set_float32_matmul_precision("high")
        dev_idx = device.index if device.index is not None else 0
        if dev_idx < torch.cuda.device_count():
            dev_name_str = f" ({torch.cuda.get_device_name(dev_idx)})"

    arch_desc = f"{obs_dim}in->{num_hidden_layers}x{hidden_dim}"
    if use_layer_norm:
        arch_desc += "+LN"
    if use_residual:
        arch_desc += "+Res"
    if use_obs_norm:
        arch_desc += "+ObsNorm"

    print(f"\n{'='*70}")
    print(f"[{var_name}] Launching PPO training on device: {device}{dev_name_str}")
    print(f"[{var_name}] Envs: {args.envs} ({num_workers} worker(s)) | Steps: {steps_per_update} | Updates: {args.updates} | Arch: {arch_desc}")
    print(f"[{var_name}] Target Weights: {weights_path}")
    print(f"{'='*70}")

    init_source_path = args.init_from if args.init_from else weights_path
    from_scratch = args.scratch or not os.path.exists(init_source_path)
    init_log_std = -0.7 if from_scratch else -1.6
    model = ActorCritic(
        obs_dim=obs_dim,
        act_dim=ACT_DIM,
        hidden_dim=hidden_dim,
        init_log_std=init_log_std,
        num_hidden_layers=num_hidden_layers,
        layer_norm=use_layer_norm,
        residual=use_residual,
        activation=activation,
        ortho_init=ortho_init,
    ).to(device)
    obs_rms = RunningMeanStd(obs_dim, clip=10.0) if use_obs_norm else None

    loaded, prev_best = (False, -1e9) if from_scratch else load_actor_from_json(model, init_source_path, hidden_dim, obs_rms=obs_rms)
    if loaded:
        print(f"[{var_name}] Warm-started actor from {init_source_path} (previous best score: {prev_best:+.4f})")
    else:
        from_scratch = True
        print(f"[{var_name}] Training from scratch -> {weights_path}")

    if getattr(args, "bc_dataset", None):
        bc_frames = run_bc_warmstart(
            model,
            obs_rms,
            args.bc_dataset,
            obs_dim,
            device,
            epochs=getattr(args, "bc_epochs", 12),
        )
        if bc_frames > 0:
            from_scratch = False

    os.makedirs("audit", exist_ok=True)
    os.makedirs(pool_dir, exist_ok=True)
    if not any(f.endswith(".json") for f in os.listdir(pool_dir)):
        save_selfplay_snapshot(
            model,
            pool_dir,
            0,
            {"source": f"{var_name}_seed", "update": 0},
            var_name,
            hidden_dim,
            obs_rms=obs_rms,
            obs_config=obs_config,
        )
        print(f"[{var_name}] Seeded empty self-play pool in {pool_dir}")

    if os.path.exists(metrics_path):
        os.remove(metrics_path)

    cfg_actor_lr = float(cfg.get("actor_lr_start", 3e-4))
    cfg_critic_lr = float(cfg.get("critic_lr_start", 3e-4))
    critic_lr_start = args.critic_lr if args.critic_lr else cfg_critic_lr
    actor_lr_start = args.actor_lr if args.actor_lr else (cfg_actor_lr if from_scratch else min(cfg_actor_lr, 8e-5))
    lr_end = float(cfg.get("lr_end", 2e-5))
    critic_lr_end = max(lr_end, critic_lr_start * 0.08)
    lr_schedule = str(cfg.get("lr_schedule", "linear"))
    ent_start = float(cfg.get("ent_start", 0.012)) if from_scratch else min(float(cfg.get("ent_start", 0.004)), 0.004)
    ent_end = args.ent_end if args.ent_end is not None else float(cfg.get("ent_end", 0.0015))
    max_std_start = float(cfg.get("max_std_start", 0.50)) if from_scratch else min(float(cfg.get("max_std_start", 0.20)), 0.20)
    max_std_end = args.max_std_end if args.max_std_end is not None else float(cfg.get("max_std_end", 0.12))
    action_bound_coef = float(cfg.get("action_bound_coef", 0.0))
    vf_clip = cfg.get("vf_clip", None)
    target_kl = cfg.get("target_kl", None)

    optimizer = torch.optim.Adam([
        {"params": list(model.actor.parameters()) + [model.log_std], "lr": actor_lr_start},
        {"params": model.critic.parameters(), "lr": critic_lr_start},
    ], eps=1e-5)

    cur_phase_init, initial_mix, init_rew_patch, init_eo_patch = compute_curriculum_state(
        1, args.updates, curriculum_mode, reward_weights, base_traffic_mix, base_env_options
    )
    active_rewards = init_rew_patch if init_rew_patch is not None else reward_weights
    active_env_options = init_eo_patch if init_eo_patch is not None else base_env_options

    use_binary_ipc = not getattr(args, "no_binary_ipc", False)
    pool = VectorEnvPool(args.envs, num_workers=num_workers, binary_ipc=use_binary_ipc, obs_dim=obs_dim)
    init_payload: dict = {
        "tracks": args.tracks,
        "cars": args.cars,
        "rewardWeights": active_rewards,
        "trafficMix": initial_mix,
        "weightsPath": weights_path,
        "poolDir": pool_dir,
    }
    if obs_config is not None:
        init_payload["obsConfig"] = obs_config
    if active_env_options is not None:
        init_payload["envOptions"] = active_env_options

    raw_obs = pool.init(init_payload)

    gamma = float(cfg.get("gamma", 0.992))
    gae_lambda = float(cfg.get("gae_lambda", 0.95))
    clip_coef = float(cfg.get("clip_coef", 0.2))
    vf_coef = float(cfg.get("vf_coef", 0.5))
    epochs = int(cfg.get("epochs", 6))
    minibatch_size = max(1, (args.envs * steps_per_update) // 8)
    critic_warmup_updates = 0 if from_scratch else 60

    use_reset_best = args.reset_best and not args.no_reset_best
    best_score = -1e9 if (from_scratch or use_reset_best or args.init_from) else prev_best
    best_laps_track_class: dict[tuple[str, str], float] = {}
    best_laps_class: dict[str, tuple[float, str]] = {}
    peak_speed_class: dict[str, float] = {}
    track_crash_ema: dict[str, float] = {}
    history: list[dict] = []
    last_phase = cur_phase_init
    t0 = time.time()

    try:
        for update in range(1, args.updates + 1):
            cur_phase, traffic_mix, rew_patch, eo_patch = compute_curriculum_state(
                update, args.updates, curriculum_mode, reward_weights, base_traffic_mix, base_env_options
            )

            phase_changed = is_curriculum and cur_phase != last_phase
            if phase_changed:
                save_selfplay_snapshot(
                    model,
                    pool_dir,
                    update - 1,
                    {"source": f"{var_name}_phase{last_phase}_grad", "update": update - 1, "curriculumPhase": last_phase},
                    var_name,
                    hidden_dim,
                    obs_rms=obs_rms,
                    obs_config=obs_config,
                )
                best_score = -1e9
                print(
                    f"[{var_name}] Entering Phase {cur_phase} at update {update}/{args.updates} "
                    f"(snapshot pooled, checkpoint baseline reset)"
                )
                last_phase = cur_phase

            progress = (update - 1) / max(1, args.updates - 1)
            cur_actor_lr = schedule_value(actor_lr_start, lr_end, progress, lr_schedule)
            cur_critic_lr = schedule_value(critic_lr_start, critic_lr_end, progress, lr_schedule)
            cur_ent_coef = schedule_value(ent_start, ent_end, progress, "linear")
            cur_max_std = schedule_value(max_std_start, max_std_end, progress, "linear")

            # Preserve independent actor & critic learning rates (fixes critic LR clobber bug)
            optimizer.param_groups[0]["lr"] = cur_actor_lr
            optimizer.param_groups[1]["lr"] = cur_critic_lr

            with torch.no_grad():
                model.log_std.clamp_(max=math.log(cur_max_std))

            obs_buf = np.zeros((steps_per_update, args.envs, obs_dim), dtype=np.float32)
            act_buf = np.zeros((steps_per_update, args.envs, ACT_DIM), dtype=np.float32)
            logp_buf = np.zeros((steps_per_update, args.envs), dtype=np.float32)
            rew_buf = np.zeros((steps_per_update, args.envs), dtype=np.float32)
            val_buf = np.zeros((steps_per_update, args.envs), dtype=np.float32)
            done_buf = np.zeros((steps_per_update, args.envs), dtype=np.float32)

            speed_samples: list[float] = []
            lap_times: list[float] = []
            off_track_count = 0
            car_crash_count = 0
            wall_crash_count = 0
            ghost_overlap_count = 0

            track_stats: dict[str, dict] = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0})
            class_stats: dict[str, dict] = defaultdict(lambda: {"speeds": [], "laps": [], "off": 0, "crashes": 0, "carCrashes": 0, "wallCrashes": 0})

            # Prepare optional per-update env patch (curriculum phase or adaptive track weights)
            step0_mix = traffic_mix if (is_curriculum and (phase_changed or update % 20 == 1)) else None
            step0_rew = rew_patch if (rew_patch is not None and (phase_changed or update == 1)) else None
            step0_eo: dict | None = None
            if eo_patch is not None and (phase_changed or update == 1):
                step0_eo = dict(eo_patch)
            if adaptive_tracks and update >= 10 and update % 10 == 0 and len(track_crash_ema) >= 5:
                vals = np.array(list(track_crash_ema.values()), dtype=np.float64)
                mean_cr = max(0.25, float(np.mean(vals)))
                tw = {
                    tid: round(float(max(0.6, min(4.0, (cr + 0.25) / (mean_cr + 0.25)))), 3)
                    for tid, cr in track_crash_ema.items()
                }
                step0_eo = dict(step0_eo or {})
                step0_eo["trackWeights"] = tw

            for step in range(steps_per_update):
                if obs_rms is not None:
                    obs_rms.update(raw_obs)
                    obs_proc = obs_rms.normalize(raw_obs)
                else:
                    obs_proc = raw_obs

                obs_buf[step] = obs_proc
                obs_t = torch.tensor(obs_proc, dtype=torch.float32, device=device)
                with torch.no_grad():
                    action_t, logp_t, _, val_t, _ = model.get_action_and_value(obs_t)

                act_buf[step] = action_t.cpu().numpy()
                logp_buf[step] = logp_t.cpu().numpy()
                val_buf[step] = val_t.cpu().numpy()

                actions_clipped = np.clip(act_buf[step], -1.0, 1.0)
                raw_obs, rewards, dones, truncated, final_obs_list, infos = pool.step(
                    actions_clipped,
                    traffic_mix=step0_mix if step == 0 else None,
                    reward_weights=step0_rew if step == 0 else None,
                    env_options=step0_eo if step == 0 else None,
                )

                # Properly bootstrap value on time/lap truncations (prevents finish-line value cliff)
                trunc_indices = [
                    i for i in range(args.envs)
                    if truncated[i] > 0.5 and final_obs_list[i] is not None
                ]
                if trunc_indices:
                    f_arr = np.array([final_obs_list[i] for i in trunc_indices], dtype=np.float32)
                    if obs_rms is not None:
                        f_arr = obs_rms.normalize(f_arr)
                    with torch.no_grad():
                        _, _, f_vals = model.forward(torch.tensor(f_arr, dtype=torch.float32, device=device))
                        f_vals_np = f_vals.cpu().numpy()
                    for idx_pos, env_i in enumerate(trunc_indices):
                        rewards[env_i] += gamma * float(f_vals_np[idx_pos])

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

                    if info.get("ghostOverlap"):
                        ghost_overlap_count += 1

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
                next_obs_proc = obs_rms.normalize(raw_obs) if obs_rms is not None else raw_obs
                next_obs_t = torch.tensor(next_obs_proc, dtype=torch.float32, device=device)
                _, _, next_val_t = model.forward(next_obs_t)
                next_value = next_val_t.cpu().numpy()

            advantages = np.zeros_like(rew_buf)
            last_gae = 0.0
            for t in reversed(range(steps_per_update)):
                next_non_terminal = 1.0 - done_buf[t]
                next_val = next_value if t == steps_per_update - 1 else val_buf[t + 1]
                delta = rew_buf[t] + gamma * next_val * next_non_terminal - val_buf[t]
                last_gae = delta + gamma * gae_lambda * next_non_terminal * last_gae
                advantages[t] = last_gae
            returns = advantages + val_buf

            y_pred = val_buf.reshape(-1)
            y_true = returns.reshape(-1)
            var_y = float(np.var(y_true))
            explained_var = 0.0 if var_y < 1e-8 else float(1.0 - np.var(y_true - y_pred) / var_y)

            b_obs = torch.tensor(obs_buf.reshape(-1, obs_dim), dtype=torch.float32, device=device)
            b_act = torch.tensor(act_buf.reshape(-1, ACT_DIM), dtype=torch.float32, device=device)
            b_logp = torch.tensor(logp_buf.reshape(-1), dtype=torch.float32, device=device)
            b_adv = torch.tensor(advantages.reshape(-1), dtype=torch.float32, device=device)
            b_ret = torch.tensor(returns.reshape(-1), dtype=torch.float32, device=device)
            b_val = torch.tensor(val_buf.reshape(-1), dtype=torch.float32, device=device)

            b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)

            batch_size = args.envs * steps_per_update
            inds = np.arange(batch_size)
            approx_kl_val = 0.0
            clip_fracs: list[float] = []

            if update > critic_warmup_updates:
                early_stop = False
                for _ in range(epochs):
                    np.random.shuffle(inds)
                    for start in range(0, batch_size, minibatch_size):
                        m_inds = inds[start : start + minibatch_size]
                        _, new_logp, entropy, new_val, new_mean = model.get_action_and_value(b_obs[m_inds], b_act[m_inds])
                        logratio = new_logp - b_logp[m_inds]
                        ratio = torch.exp(logratio)

                        with torch.no_grad():
                            approx_kl_val = float(((ratio - 1.0) - logratio).mean().item())
                            clip_fracs.append(float(((ratio - 1.0).abs() > clip_coef).float().mean().item()))

                        pg_loss1 = -b_adv[m_inds] * ratio
                        pg_loss2 = -b_adv[m_inds] * torch.clamp(ratio, 1.0 - clip_coef, 1.0 + clip_coef)
                        pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                        if vf_clip is not None:
                            v_loss_unclipped = (new_val - b_ret[m_inds]) ** 2
                            v_clipped = b_val[m_inds] + torch.clamp(new_val - b_val[m_inds], -float(vf_clip), float(vf_clip))
                            v_loss_clipped = (v_clipped - b_ret[m_inds]) ** 2
                            v_loss = 0.5 * torch.max(v_loss_unclipped, v_loss_clipped).mean()
                        else:
                            v_loss = 0.5 * ((new_val - b_ret[m_inds]) ** 2).mean()

                        ent_loss = entropy.mean()
                        bound_loss = 0.0
                        if action_bound_coef > 0.0:
                            bound_loss = action_bound_coef * torch.relu(new_mean.abs() - 1.0).pow(2).mean()

                        loss = pg_loss + vf_coef * v_loss - cur_ent_coef * ent_loss + bound_loss

                        optimizer.zero_grad()
                        loss.backward()
                        nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                        optimizer.step()

                        if target_kl is not None and approx_kl_val > float(target_kl) * 1.5:
                            early_stop = True
                            break
                    if early_stop:
                        break
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

            total_steps = args.envs * steps_per_update
            total_n = max(1, len(speed_samples) if speed_samples else total_steps)
            mean_rew = float(np.mean(rew_buf))
            mean_spd = float(np.mean(speed_samples)) if speed_samples else 0.0
            off_pct = (100.0 * off_track_count / total_n)
            car_crashes_1k = (1000.0 * car_crash_count / total_n)
            wall_crashes_1k = (1000.0 * wall_crash_count / total_n)
            ghost_overlaps_1k = (1000.0 * ghost_overlap_count / total_n)
            cur_std_avg = float(torch.exp(torch.clamp(model.log_std, -2.5, 0.2)).mean().item())
            clip_frac_avg = float(np.mean(clip_fracs)) if clip_fracs else 0.0
            best_lap = f"{min(lap_times):.2f}s" if lap_times else "none"
            elapsed_total = time.time() - t0
            sps = int(batch_size * update / max(1e-3, elapsed_total))

            per_track_summary = {}
            for tid, ts in track_stats.items():
                n = len(ts["speeds"])
                w_cr_1k = 1000.0 * ts["wallCrashes"] / max(1, n)
                if adaptive_tracks and n >= 30:
                    prev_ema = track_crash_ema.get(tid, w_cr_1k)
                    track_crash_ema[tid] = 0.80 * prev_ema + 0.20 * w_cr_1k
                per_track_summary[tid] = {
                    "avgSpeed": round(float(np.mean(ts["speeds"])), 1),
                    "bestLap": round(float(min(ts["laps"])), 2) if ts["laps"] else None,
                    "offTrackPct": round(100.0 * ts["off"] / max(1, n), 1),
                    "crashesPer1k": round(1000.0 * ts["crashes"] / max(1, n), 2),
                    "carCrashesPer1k": round(1000.0 * ts["carCrashes"] / max(1, n), 2),
                    "wallCrashesPer1k": round(w_cr_1k, 2),
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

            if checkpoint_metric == "composite":
                # Rewards clean survival + fast pace rather than suicidal straight-line crashes or ghost-overlap abuse
                cur_score = (
                    mean_rew
                    - 0.12 * wall_crashes_1k
                    - 0.10 * car_crashes_1k
                    - 0.03 * ghost_overlaps_1k
                    - 0.015 * off_pct
                    + 0.04 * min(10, len(lap_times))
                )
            else:
                cur_score = mean_rew

            record = {
                "variant": var_name,
                "curriculumPhase": cur_phase,
                "trafficMix": traffic_mix,
                "update": update,
                "totalUpdates": args.updates,
                "meanRew": round(mean_rew, 4),
                "checkpointScore": round(cur_score, 4),
                "meanSpeed": round(mean_spd, 1),
                "offTrackPct": round(off_pct, 1),
                "carCrashesPer1k": round(car_crashes_1k, 2),
                "wallCrashesPer1k": round(wall_crashes_1k, 2),
                "ghostOverlapsPer1k": round(ghost_overlaps_1k, 2),
                "lapsCompleted": len(lap_times),
                "explainedVar": round(explained_var, 3),
                "approxKl": round(approx_kl_val, 4),
                "clipFrac": round(clip_frac_avg, 3),
                "std": round(cur_std_avg, 3),
                "lr": cur_actor_lr,
                "criticLr": cur_critic_lr,
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
            nominal_min = max(15, critic_warmup_updates + 1)
            min_save_update = min(args.updates, max(1, critic_warmup_updates + 1)) if args.updates <= 15 else nominal_min
            if update >= min_save_update and cur_score > best_score:
                best_score = cur_score
                export_actor_to_json(
                    model,
                    weights_path,
                    {
                        "source": f"{var_name}_scratch" if from_scratch else f"{var_name}_finetune",
                        "curriculumPhase": cur_phase,
                        "trafficMix": traffic_mix,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "checkpointScore": round(cur_score, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                        "wallCrashesPer1k": round(wall_crashes_1k, 2),
                        "explainedVar": round(explained_var, 3),
                    },
                    var_name,
                    hidden_dim,
                    backup_path=backup_weights_path,
                    obs_rms=obs_rms,
                    obs_config=obs_config,
                )
                saved_tag = " [SAVED]"

            if update % SELFPLAY_SNAPSHOT_INTERVAL == 0:
                save_selfplay_snapshot(
                    model,
                    pool_dir,
                    update,
                    {
                        "source": f"{var_name}_snapshot",
                        "curriculumPhase": cur_phase,
                        "update": update,
                        "meanStepReward": round(mean_rew, 4),
                        "checkpointScore": round(cur_score, 4),
                        "meanSpeedKmh": round(mean_spd, 1),
                    },
                    var_name,
                    hidden_dim,
                    obs_rms=obs_rms,
                    obs_config=obs_config,
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
                f"Spd: {mean_spd:5.1f} km/h | EV:{explained_var:+.2f} | {sps:,} steps/s{warmup_tag}{saved_tag}"
            )
            line2 = (
                f"  Total Avg: {mean_spd:5.1f} km/h | Classes: [{classes_display}] | BestLap: {best_lap:>7} (Laps:{len(lap_times)})"
            )
            print(f"{line1}\n{line2}")
    finally:
        pool.terminate()


def main():
    parser = argparse.ArgumentParser(description="Apex Miniature: Unified Reinforcement Learning Policy Trainer (PPO)")
    parser.add_argument("--variant", "-v", default="v1", help="Policy variant: v1 (Physics Master), v2 (Section 4 Racecraft Master), starts, or all (v1 + v2)")
    parser.add_argument("--all", action="store_true", help="Sequentially train v1 and v2")
    parser.add_argument("--envs", type=int, default=None, help="Number of parallel env slots (default: 96 for v1/v2, 48 for starts)")
    parser.add_argument("--workers", type=int, default=None, help="Number of headlessEnv OS worker processes (default: 12 for v1/v2, 8 for starts)")
    parser.add_argument("--steps", type=int, default=None, help="Rollout steps per env before PPO update (default: 512)")
    parser.add_argument("--updates", type=int, default=None, help="Total PPO updates (default: 2500 for v1/v2, 1200 for starts)")
    parser.add_argument("--quick", action="store_true", help="Quick smoke/validation run (400 updates)")
    parser.add_argument("--tracks", nargs="*", default=None, help="Optional subset of track IDs for targeted fine-tuning")
    parser.add_argument("--cars", nargs="*", default=None, help="Optional subset of car IDs for targeted fine-tuning")
    parser.add_argument("--scratch", action="store_true", help="Ignore existing weights and train from zero")
    parser.add_argument("--init-from", default=None, help="Optional weights JSON path to warm-start actor & obsNorm from")
    parser.add_argument("--bc-dataset", default=None, help="Optional HumanTelemetryRecorder .jsonl file for Behavioral Cloning warm-start")
    parser.add_argument("--bc-epochs", type=int, default=12, help="Number of supervised BC warm-start epochs (default: 12)")
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
    parser.add_argument("--curriculum", action="store_true", default=None, help="Enable curriculum training")
    parser.add_argument("--no-curriculum", action="store_false", dest="curriculum", help="Disable curriculum training")
    parser.add_argument("--no-binary-ipc", action="store_true", help="Disable binary IPC transport and use legacy JSON-lines pipes")
    parser.add_argument("--device", default="auto", help="Compute device for PPO model: auto, cpu, cuda, or cuda:<idx> (default: auto)")
    args = parser.parse_args()

    v_arg = args.variant.lower()
    if args.all or v_arg == "all":
        selected_variants = ["v1", "v2"]
    elif v_arg in ("all-with-starts", "everything"):
        selected_variants = ["v1", "v2", "starts"]
    else:
        norm_key = VARIANT_ALIASES.get(v_arg, v_arg)
        if norm_key not in VARIANTS:
            print(f"Unknown variant '{args.variant}'. Valid choices: v1, v2, starts, all, or all-with-starts.")
            sys.exit(1)
        selected_variants = [norm_key]

    base_envs = args.envs
    base_updates = args.updates
    for v_key in selected_variants:
        args.envs = base_envs
        args.updates = base_updates
        train_single_variant(v_key, args)


if __name__ == "__main__":
    main()
