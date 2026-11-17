import json
import os
import subprocess
import numpy as np

WEIGHTS_PATH = "src/game/aiPolicyWeights.json"
BOP_OUT_PATH = "src/game/bopConfig.json"
BENCH_TRACK_INDICES = [0, 1, 2]  # Evaluates across first 3 circuits for speed + aero balance


def load_policy(path: str):
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    return {
        "w0": np.array(d["w0"], dtype=np.float32),
        "b0": np.array(d["b0"], dtype=np.float32),
        "w1": np.array(d["w1"], dtype=np.float32),
        "b1": np.array(d["b1"], dtype=np.float32),
        "w2": np.array(d["w2"], dtype=np.float32),
        "b2": np.array(d["b2"], dtype=np.float32),
    }


def forward_policy(policy: dict, obs: list) -> list:
    x = np.array(obs, dtype=np.float32)
    in_dim = policy["w0"].shape[1]
    if len(x) > in_dim:
        x = x[:in_dim]
    elif len(x) < in_dim:
        x = np.pad(x, (0, in_dim - len(x)))

    h0 = np.tanh(policy["w0"] @ x + policy["b0"])
    h1 = np.tanh(policy["w1"] @ h0 + policy["b1"])
    out = np.clip(policy["w2"] @ h1 + policy["b2"], -1.0, 1.0)
    return out.tolist()


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
        return json.loads(self.proc.stdout.readline())

    def close(self):
        self.proc.terminate()


def measure_lap_time(sim: SimClient, policy: dict, car_id: str, track_idx: int, bop: dict) -> float:
    res = sim.rpc({
        "type": "reset",
        "carId": car_id,
        "trackIndex": track_idx,
        "skill": 1.0,
        "solo": True,
        "startAtLine": True,
        "bop": bop,
    })
    obs = res["obs"]
    progress = 0.0
    ticks = 0
    max_ticks = 60 * 180  # 3-minute cap

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
    if not os.path.exists(WEIGHTS_PATH):
        raise FileNotFoundError(f"Missing {WEIGHTS_PATH} — run trainAiPolicy.py first.")

    policy = load_policy(WEIGHTS_PATH)
    sim = SimClient()

    try:
        meta = sim.rpc({"type": "list_cars"})
        cars = meta["cars"]
        num_tracks = meta["numTracks"]
        tracks = [t for t in BENCH_TRACK_INDICES if t < num_tracks] or [0]

        by_class: dict[str, list[dict]] = {}
        for c in cars:
            cls_key = c.get("carClass") or c.get("category") or c.get("class") or "UNKNOWN"
            by_class.setdefault(cls_key, []).append(c)

        bop_table: dict[str, dict] = {}
        for c in cars:
            bop_table[c["id"]] = {
                "topSpeedMult": 1.0,
                "gripMult": 1.0,
                "downforceMult": 1.0,
                "brakingMult": 1.0,
            }

        # 4 evolutionary / proportional BoP calibration passes per class
        for iteration in range(4):
            print(f"\n=== BoP Calibration Pass {iteration + 1}/4 ===")
            for cls_name, cls_cars in by_class.items():
                if len(cls_cars) < 2:
                    continue

                lap_times: dict[str, float] = {}
                for c in cls_cars:
                    times = [
                        measure_lap_time(sim, policy, c["id"], t_idx, bop_table[c["id"]])
                        for t_idx in tracks
                    ]
                    lap_times[c["id"]] = float(np.mean(times))

                valid_times = [t for t in lap_times.values() if t < 175.0]
                if not valid_times:
                    continue
                target_time = float(np.median(valid_times))
                spread = max(valid_times) - min(valid_times)
                print(f"[{cls_name}] Target: {target_time:.2f}s | Spread: {spread:.2f}s")

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

        os.makedirs(os.path.dirname(BOP_OUT_PATH), exist_ok=True)
        with open(BOP_OUT_PATH, "w", encoding="utf-8") as f:
            json.dump(bop_table, f, indent=2)
        print(f"\nSaved calibrated Balance of Performance table to {BOP_OUT_PATH}!")
    finally:
        sim.close()


if __name__ == "__main__":
    main()