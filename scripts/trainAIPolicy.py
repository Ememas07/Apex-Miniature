import json
import os
import subprocess
import numpy as np
import torch
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import SubprocVecEnv, VecMonitor
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback, CallbackList

OBS_DIM = 43
ACTION_DIM = 3
WEIGHTS_OUT_PATH = "src/game/aiPolicyWeights.json"


def export_weights_to_json(model: PPO, out_path: str):
    policy = model.policy
    net = policy.mlp_extractor.policy_net
    action_net = policy.action_net

    weights = {
        "obsDim": OBS_DIM,
        "w0": net[0].weight.detach().cpu().numpy().round(5).tolist(),
        "b0": net[0].bias.detach().cpu().numpy().round(5).tolist(),
        "w1": net[2].weight.detach().cpu().numpy().round(5).tolist(),
        "b1": net[2].bias.detach().cpu().numpy().round(5).tolist(),
        "w2": action_net.weight.detach().cpu().numpy().round(5).tolist(),
        "b2": action_net.bias.detach().cpu().numpy().round(5).tolist(),
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(weights, f)


class PeriodicJsonExportCallback(BaseCallback):
    def __init__(self, export_freq_steps: int, out_path: str, verbose: int = 1):
        super().__init__(verbose)
        self.export_freq_steps = export_freq_steps
        self.out_path = out_path
        self.last_export = 0

    def _on_step(self) -> bool:
        if self.num_timesteps - self.last_export >= self.export_freq_steps:
            self.last_export = self.num_timesteps
            export_weights_to_json(self.model, self.out_path)
            if self.verbose:
                print(f"[{self.num_timesteps:,} steps] Updated {self.out_path}")
        return True


class ApexRacingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, worker_id: int = 0):
        super().__init__()
        self.worker_id = worker_id
        self.observation_space = spaces.Box(
            low=-5.0, high=5.0, shape=(OBS_DIM,), dtype=np.float32
        )
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(ACTION_DIM,), dtype=np.float32
        )
        tsx_cli = os.path.abspath("node_modules/tsx/dist/cli.mjs")
        sim_script = os.path.abspath("scripts/rlSimServer.ts")
        self.proc = subprocess.Popen(
            ["node", tsx_cli, sim_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
            shell=False,
        )

    def _rpc(self, payload: dict) -> dict:
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        return json.loads(line)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        res = self._rpc({"type": "reset"})
        return np.array(res["obs"], dtype=np.float32), {}

    def step(self, action):
        res = self._rpc({"type": "step", "action": action.tolist()})
        obs = np.array(res["obs"], dtype=np.float32)
        return (
            obs,
            float(res["reward"]),
            bool(res["terminated"]),
            bool(res["truncated"]),
            {},
        )

    def close(self):
        if self.proc:
            self.proc.terminate()


def make_env(rank: int):
    def _init():
        return ApexRacingEnv(worker_id=rank)
    return _init


def warm_start_from_json(model: PPO, json_path: str):
    """Transfers 26-, 42-, or 43-input weights cleanly into the 43-input skill-calibrated policy."""
    if not os.path.exists(json_path):
        print("No prior weights found — starting fresh.")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    w0_old = torch.tensor(data["w0"], dtype=torch.float32)
    old_in = w0_old.shape[1]
    if old_in not in (26, 42, OBS_DIM):
        print(f"Skipping warm-start: incompatible input dim {old_in}")
        return

    with torch.no_grad():
        net = model.policy.mlp_extractor.policy_net
        action_net = model.policy.action_net

        net[0].weight.zero_()
        net[0].weight[:, :old_in].copy_(w0_old)
        if old_in < OBS_DIM:
            net[0].weight[:, old_in:].normal_(mean=0.0, std=0.01)
        net[0].bias.copy_(torch.tensor(data["b0"], dtype=torch.float32))

        net[2].weight.copy_(torch.tensor(data["w1"], dtype=torch.float32))
        net[2].bias.copy_(torch.tensor(data["b1"], dtype=torch.float32))
        action_net.weight.copy_(torch.tensor(data["w2"], dtype=torch.float32))
        action_net.bias.copy_(torch.tensor(data["b2"], dtype=torch.float32))

    print(f"Warm-started 43-input policy from {json_path} (transferred {old_in} features)!")


if __name__ == "__main__":
    NUM_ENVS = 12
    env = VecMonitor(SubprocVecEnv([make_env(i) for i in range(NUM_ENVS)]))

    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=2e-4,
        n_steps=2048,
        batch_size=512,
        n_epochs=10,
        gamma=0.995,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.004,
        tensorboard_log="./audit/rl_logs/",
        policy_kwargs=dict(net_arch=dict(pi=[64, 64], vf=[64, 64])),
        device="cpu",
        verbose=1,
    )

    warm_start_from_json(model, WEIGHTS_OUT_PATH)

    callbacks = CallbackList([
        CheckpointCallback(
            save_freq=500_000 // NUM_ENVS,
            save_path="./audit/rl_checkpoints/",
            name_prefix="apex_skill_ppo",
        ),
        PeriodicJsonExportCallback(
            export_freq_steps=500_000,
            out_path=WEIGHTS_OUT_PATH,
        ),
    ])

    try:
        model.learn(
            total_timesteps=1_000_000_000,
            callback=callbacks,
            tb_log_name="apex_skill_driver",
            progress_bar=True,
        )
    except KeyboardInterrupt:
        print("\nTraining stopped by user — exporting latest weights...")
    finally:
        export_weights_to_json(model, WEIGHTS_OUT_PATH)
        print(f"Final weights saved to {WEIGHTS_OUT_PATH}")
        env.close()