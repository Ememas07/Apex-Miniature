import argparse
import json
import os
import subprocess
import gymnasium as gym
import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import SubprocVecEnv

WEIGHTS_PATH = "src/game/aiPolicyWeights.json"
ROLLING_CKPT = "checkpoints/ppo_rolling.zip"
OBS_DIM = 43
ACT_DIM = 3


class ApexSimEnv(gym.Env):
    def __init__(self):
        super().__init__()
        self.observation_space = gym.spaces.Box(low=-5.0, high=5.0, shape=(OBS_DIM,), dtype=np.float32)
        self.action_space = gym.spaces.Box(low=-1.0, high=1.0, shape=(ACT_DIM,), dtype=np.float32)
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
        return json.loads(self.proc.stdout.readline())

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        res = self._rpc({"type": "reset"})
        return np.array(res["obs"], dtype=np.float32), {}

    def step(self, action):
        res = self._rpc({"type": "step", "action": action.tolist()})
        obs = np.array(res["obs"], dtype=np.float32)
        reward = float(res["reward"])
        # Extra high-speed apex/straightaway bonus when skillTarget is high
        speed_ms = float(res.get("speed", 0.0))
        if obs[42] >= 0.95 and speed_ms > 35.0:
            reward += (speed_ms - 35.0) * 0.012
        return obs, reward, bool(res["terminated"]), bool(res["truncated"]), {}

    def close(self):
        if self.proc:
            self.proc.terminate()


def load_json_into_ppo(model: PPO, path: str) -> bool:
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if d.get("obsDim") != OBS_DIM:
        return False

    pi_net = model.policy.mlp_extractor.policy_net
    action_net = model.policy.action_net
    with torch.no_grad():
        pi_net[0].weight.copy_(torch.tensor(d["w0"], dtype=torch.float32))
        pi_net[0].bias.copy_(torch.tensor(d["b0"], dtype=torch.float32))
        pi_net[2].weight.copy_(torch.tensor(d["w1"], dtype=torch.float32))
        pi_net[2].bias.copy_(torch.tensor(d["b1"], dtype=torch.float32))
        action_net.weight.copy_(torch.tensor(d["w2"], dtype=torch.float32))
        action_net.bias.copy_(torch.tensor(d["b2"], dtype=torch.float32))
    return True


def export_ppo_to_json(model: PPO, path: str):
    pi_net = model.policy.mlp_extractor.policy_net
    action_net = model.policy.action_net
    payload = {
        "obsDim": OBS_DIM,
        "actDim": ACT_DIM,
        "w0": pi_net[0].weight.detach().cpu().numpy().tolist(),
        "b0": pi_net[0].bias.detach().cpu().numpy().tolist(),
        "w1": pi_net[2].weight.detach().cpu().numpy().tolist(),
        "b1": pi_net[2].bias.detach().cpu().numpy().tolist(),
        "w2": action_net.weight.detach().cpu().numpy().tolist(),
        "b2": action_net.bias.detach().cpu().numpy().tolist(),
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)


class RollingExportCallback(BaseCallback):
    def __init__(self, save_freq: int):
        super().__init__()
        self.save_freq = save_freq

    def _on_step(self) -> bool:
        if self.n_calls % self.save_freq == 0:
            os.makedirs(os.path.dirname(ROLLING_CKPT), exist_ok=True)
            self.model.save(ROLLING_CKPT)
            export_ppo_to_json(self.model, WEIGHTS_PATH)
        return True


def main():
    parser = argparse.ArgumentParser(description="Train/Fine-tune PPO racing policy")
    parser.add_argument("--steps", type=int, default=3_000_000)
    parser.add_argument("--envs", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1.2e-4)
    parser.add_argument("--resume", action="store_true", help="Warm-start from aiPolicyWeights.json")
    args = parser.parse_args()

    vec_env = SubprocVecEnv([lambda: ApexSimEnv() for _ in range(args.envs)])
    try:
        model = PPO(
            "MlpPolicy",
            vec_env,
            learning_rate=args.lr,
            n_steps=2048,
            batch_size=512,
            n_epochs=6,
            gamma=0.992,
            gae_lambda=0.95,
            clip_range=0.18,
            ent_coef=0.003,
            policy_kwargs=dict(net_arch=dict(pi=[128, 128], vf=[128, 128]), activation_fn=torch.nn.Tanh),
            verbose=1,
        )

        if args.resume and load_json_into_ppo(model, WEIGHTS_PATH):
            # Lower initial exploration std so fine-tuning refines human lines without forgetting braking
            with torch.no_grad():
                model.policy.log_std.fill_(-1.4)
            print(f"Resumed PPO policy from {WEIGHTS_PATH} with tight exploration std")

        model.learn(total_timesteps=args.steps, callback=RollingExportCallback(save_freq=50_000))
        model.save(ROLLING_CKPT)
        export_ppo_to_json(model, WEIGHTS_PATH)
        print(f"Saved final weights to {WEIGHTS_PATH} and single rolling checkpoint {ROLLING_CKPT}")
    finally:
        vec_env.close()


if __name__ == "__main__":
    main()