import argparse
import json
import os
import subprocess
import sys
import numpy as np

BOP_OUT_PATH = "src/game/bopConfig.json"
DEFAULT_TRACK_INDICES = [0, 1, 2]  # Evaluates across first 3 circuits for speed + aero balance


def resolve_weights_path(variant: str | None, explicit_path: str | None) -> str:
    if explicit_path:
        p = os.path.normpath(explicit_path)
        if not os.path.exists(p):
            raise FileNotFoundError(f"Specified weights file not found: {p}")
        return p

    if variant:
        v = variant.strip().lower()
        candidates = [
            os.path.normpath(f"src/game/aiPolicyWeights_{v}.json"),
            os.path.normpath(f"src/game/aiPolicyWeights_{v}.best.json"),
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        raise FileNotFoundError(f"Could not find weights for variant '{variant}'. Checked: {candidates}")

    default_path = os.path.normpath("src/game/aiPolicyWeights.json")
    if os.path.exists(default_path):
        return default_path
    raise FileNotFoundError(f"Default weights file '{default_path}' not found — run trainPPO.py first.")


def load_policy(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)

    version = int(d.get("version", 1))
    num_hidden = int(d.get("numHiddenLayers", 3 if ("w3" in d and "b3" in d) else 2))
    hidden_dim = int(d.get("hiddenDim", len(d.get("w0", []))))
    activation = str(d.get("activation", "tanh")).lower()
    residual = bool(d.get("residual", False))

    policy = {
        "version": version,
        "numHiddenLayers": num_hidden,
        "hiddenDim": hidden_dim,
        "activation": activation,
        "residual": residual,
        "w0": np.array(d["w0"], dtype=np.float32),
        "b0": np.array(d["b0"], dtype=np.float32),
        "w1": np.array(d["w1"], dtype=np.float32),
        "b1": np.array(d["b1"], dtype=np.float32),
    }

    if num_hidden == 3:
        policy["w2"] = np.array(d["w2"], dtype=np.float32)
        policy["b2"] = np.array(d["b2"], dtype=np.float32)
        policy["outW"] = np.array(d["w3"], dtype=np.float32)
        policy["outB"] = np.array(d["b3"], dtype=np.float32)
    else:
        policy["outW"] = np.array(d["w2"], dtype=np.float32)
        policy["outB"] = np.array(d["b2"], dtype=np.float32)

    # Layer normalization
    for i in range(num_hidden):
        lw, lb = f"ln{i}Weight", f"ln{i}Bias"
        if lw in d and lb in d:
            policy[lw] = np.array(d[lw], dtype=np.float32)
            policy[lb] = np.array(d[lb], dtype=np.float32)

    # Observation normalization
    if "obsNorm" in d and isinstance(d["obsNorm"], dict):
        norm = d["obsNorm"]
        policy["obsMean"] = np.array(norm.get("mean", []), dtype=np.float32)
        policy["obsStd"] = np.array(norm.get("std", []), dtype=np.float32)
        policy["obsClip"] = float(norm.get("clip", 10.0))

    if "obsConfig" in d and isinstance(d["obsConfig"], dict):
        policy["obsConfig"] = d["obsConfig"]

    return policy


def apply_layer_norm(x: np.ndarray, gamma: np.ndarray, beta: np.ndarray, eps: float = 1e-5) -> np.ndarray:
    mean = np.mean(x)
    var = np.var(x)
    return (x - mean) / np.sqrt(var + eps) * gamma + beta


def apply_activation(x: np.ndarray, act_type: str) -> np.ndarray:
    if act_type == "silu":
        return x / (1.0 + np.exp(-np.clip(x, -20.0, 20.0)))
    return np.tanh(x)


def forward_policy(policy: dict, obs: list) -> list:
    x = np.array(obs, dtype=np.float32)

    # Observation normalization if active
    if "obsMean" in policy and "obsStd" in policy:
        clip_val = policy.get("obsClip", 10.0)
        std = np.maximum(policy["obsStd"], 1e-6)
        n = min(len(x), len(policy["obsMean"]))
        x[:n] = np.clip((x[:n] - policy["obsMean"][:n]) / std[:n], -clip_val, clip_val)

    in_dim = policy["w0"].shape[1]
    if len(x) > in_dim:
        x = x[:in_dim]
    elif len(x) < in_dim:
        x = np.pad(x, (0, in_dim - len(x)))

    act_type = policy["activation"]
    residual = policy["residual"]

    # Layer 0
    h0 = policy["w0"] @ x + policy["b0"]
    if "ln0Weight" in policy and "ln0Bias" in policy:
        h0 = apply_layer_norm(h0, policy["ln0Weight"], policy["ln0Bias"])
    h0 = apply_activation(h0, act_type)

    # Layer 1
    h1 = policy["w1"] @ h0 + policy["b1"]
    if "ln1Weight" in policy and "ln1Bias" in policy:
        h1 = apply_layer_norm(h1, policy["ln1Weight"], policy["ln1Bias"])
    h1 = apply_activation(h1, act_type)
    if residual:
        h1 = h1 + h0

    final_h = h1

    # Optional Layer 2 (when numHiddenLayers == 3)
    if policy["numHiddenLayers"] == 3:
        h2 = policy["w2"] @ h1 + policy["b2"]
        if "ln2Weight" in policy and "ln2Bias" in policy:
            h2 = apply_layer_norm(h2, policy["ln2Weight"], policy["ln2Bias"])
        h2 = apply_activation(h2, act_type)
        if residual:
            h2 = h2 + h1
        final_h = h2

    # Output layer -> [steer, throttle, brake]
    raw_out = policy["outW"] @ final_h + policy["outB"]
    if policy["version"] >= 2:
        out = np.clip(raw_out, -1.0, 1.0)
    else:
        out = np.clip(np.tanh(raw_out), -1.0, 1.0)

    out_list = out.tolist()
    if len(out_list) < 3:
        out_list += [0.0] * (3 - len(out_list))
    return out_list[:3]


class SimClient:
    def __init__(self):
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

    def rpc(self, payload: dict) -> dict:
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError("Simulation server terminated unexpectedly.")
        return json.loads(line)

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=2)
        except Exception:
            pass


def measure_lap_time(sim: SimClient, policy: dict, car_id: str, track_idx: int, bop: dict, max_ticks: int = 60 * 180) -> float:
    req = {
        "type": "reset",
        "carId": car_id,
        "trackIndex": track_idx,
        "skill": 1.0,
        "solo": True,
        "startAtLine": True,
        "bop": bop,
    }
    if "obsConfig" in policy:
        req["obsConfig"] = policy["obsConfig"]

    res = sim.rpc(req)
    obs = res["obs"]
    progress = 0.0
    ticks = 0

    while progress < 1.0 and ticks < max_ticks:
        action = forward_policy(policy, obs)
        step = sim.rpc({"type": "step", "action": action})
        obs = step["obs"]
        progress += max(0.0, step.get("deltaT", 0.0))
        ticks += 1
        if step.get("terminated"):
            # Penalize crashes so overly twitchy configs get toned down
            return 180.0

    return ticks / 60.0


def main():
    parser = argparse.ArgumentParser(description="Calibrate Balance of Performance (BoP) multipliers using trained AI policies.")
    parser.add_argument("--variant", "-v", type=str, default=None, help="Policy variant tag (e.g. v8, v7, v6, etc.)")
    parser.add_argument("--weights", "-w", type=str, default=None, help="Explicit path to AI policy weights JSON file.")
    parser.add_argument("--out", "-o", type=str, default=BOP_OUT_PATH, help="Output path for calibrated BoP table (default: src/game/bopConfig.json)")
    parser.add_argument("--passes", "-p", type=int, default=4, help="Number of BoP calibration passes (default: 4)")
    parser.add_argument("--tracks", "-t", type=str, default="0,1,2", help="Comma-separated track indices to benchmark (default: 0,1,2)")
    parser.add_argument("--classes", "-c", type=str, default=None, help="Optional comma-separated list of car classes to calibrate (default: all classes)")
    parser.add_argument("--max-ticks", type=int, default=60 * 180, help="Max simulation ticks per lap (default: 10800 = 3 mins)")
    parser.add_argument("--warm-start", action="store_true", help="Start from existing BoP multipliers in output file instead of resetting to 1.0.")
    args = parser.parse_args()

    weights_path = resolve_weights_path(args.variant, args.weights)
    print(f"Loading AI policy weights from: {weights_path}")
    policy = load_policy(weights_path)
    print(
        f"  [Architecture] Version: {policy['version']} | Hidden layers: {policy['numHiddenLayers']} "
        f"| Hidden dim: {policy['hiddenDim']} | Activation: {policy['activation']} "
        f"| Residual: {policy['residual']} | ObsNorm: {'obsMean' in policy}"
    )

    bench_track_indices = [int(t.strip()) for t in args.tracks.split(",") if t.strip().isdigit()]
    if not bench_track_indices:
        bench_track_indices = DEFAULT_TRACK_INDICES

    target_classes = [c.strip().lower().replace("-", "_") for c in args.classes.split(",") if c.strip()] if args.classes else None

    def class_matches(cls_str: str) -> bool:
        if not target_classes:
            return True
        norm = cls_str.lower().replace("-", "_")
        return any(t in norm or norm in t for t in target_classes)

    sim = SimClient()

    try:
        meta = sim.rpc({"type": "list_cars"})
        cars = meta["cars"]
        num_tracks = meta["numTracks"]
        tracks = [t for t in bench_track_indices if t < num_tracks] or [0]

        by_class: dict[str, list[dict]] = {}
        for c in cars:
            cls_key = c.get("carClass") or c.get("category") or c.get("class") or "UNKNOWN"
            if not class_matches(cls_key):
                continue
            by_class.setdefault(cls_key, []).append(c)

        bop_table: dict[str, dict] = {}
        if args.warm_start and os.path.exists(args.out):
            try:
                with open(args.out, "r", encoding="utf-8") as f:
                    bop_table = json.load(f)
                print(f"Warm-started from existing BoP table ({len(bop_table)} entries loaded from {args.out}).")
            except Exception as e:
                print(f"Warning: Failed to load warm-start BoP from {args.out}: {e}. Initializing from 1.0.")
                bop_table = {}

        for c in cars:
            if c["id"] not in bop_table:
                bop_table[c["id"]] = {
                    "topSpeedMult": 1.0,
                    "gripMult": 1.0,
                    "downforceMult": 1.0,
                    "brakingMult": 1.0,
                }

        # Calibration passes per class
        for iteration in range(args.passes):
            print(f"\n=== BoP Calibration Pass {iteration + 1}/{args.passes} ===")
            for cls_name, cls_cars in by_class.items():
                if len(cls_cars) < 2:
                    continue

                lap_times: dict[str, float] = {}
                for c in cls_cars:
                    times = [
                        measure_lap_time(sim, policy, c["id"], t_idx, bop_table[c["id"]], max_ticks=args.max_ticks)
                        for t_idx in tracks
                    ]
                    lap_times[c["id"]] = float(np.mean(times))

                valid_times = [t for t in lap_times.values() if t < 175.0]
                if not valid_times:
                    continue
                target_time = float(np.median(valid_times))
                spread = max(valid_times) - min(valid_times)
                print(f"[{cls_name}] Target: {target_time:.2f}s | Spread: {spread:.2f}s ({len(cls_cars)} cars)")

                for c in cls_cars:
                    cid = c["id"]
                    t = lap_times[cid]
                    if t >= 175.0:
                        # Car crashed/spun -> slightly tame top speed & add grip
                        bop_table[cid]["topSpeedMult"] = round(max(0.92, bop_table[cid]["topSpeedMult"] - 0.015), 4)
                        bop_table[cid]["gripMult"] = round(min(1.08, bop_table[cid]["gripMult"] + 0.015), 4)
                        continue

                    rel_err = (t - target_time) / max(1.0, target_time)
                    # Proportional closed-loop adjustment clamped to +/-8% so car character stays intact
                    adj = float(np.clip(rel_err * 0.45, -0.025, 0.025))
                    b = bop_table[cid]
                    b["topSpeedMult"] = round(float(np.clip(b["topSpeedMult"] + adj * 0.6, 0.92, 1.08)), 4)
                    b["gripMult"] = round(float(np.clip(b["gripMult"] + adj * 0.5, 0.92, 1.08)), 4)
                    b["downforceMult"] = round(float(np.clip(b["downforceMult"] + adj * 0.5, 0.92, 1.08)), 4)
                    b["brakingMult"] = round(float(np.clip(b["brakingMult"] + adj * 0.4, 0.92, 1.08)), 4)

        out_path = os.path.normpath(args.out)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(bop_table, f, indent=2)
        print(f"\nSaved calibrated Balance of Performance table to {out_path}!")
    finally:
        sim.close()


if __name__ == "__main__":
    main()
