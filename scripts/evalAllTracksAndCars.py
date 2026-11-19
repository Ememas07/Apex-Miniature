#!/usr/bin/env python3
"""
Apex Miniature — Deterministic PPO Benchmark & Evaluation Matrix
Evaluates trained AI policy weights across every track and car independently.
"""

import argparse
import csv
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
import time


def spawn_env_worker():
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    return subprocess.Popen(
        [npx_cmd, "tsx", "scripts/headlessEnv.ts"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def query_catalog(worker):
    worker.stdin.write(json.dumps({"cmd": "catalog"}) + "\n")
    worker.stdin.flush()
    line = worker.stdout.readline()
    if not line:
        raise RuntimeError("headlessEnv worker closed unexpectedly on catalog query")
    return json.loads(line)


def run_evaluation(worker, weight_path: str, pairs: list[dict], envs: int, max_steps: int):
    results = []
    total_pairs = len(pairs)
    start_time = time.time()

    print(f"\nEvaluating '{weight_path}' across {total_pairs} (track, car) pairs (batch size {envs})...")

    for i in range(0, total_pairs, envs):
        chunk = pairs[i : i + envs]
        req = {
            "cmd": "eval_batch",
            "pairs": chunk,
            "weightsPath": weight_path,
            "maxSteps": max_steps,
        }
        worker.stdin.write(json.dumps(req) + "\n")
        worker.stdin.flush()

        line = worker.stdout.readline()
        if not line:
            raise RuntimeError(f"headlessEnv worker died during eval batch starting at index {i}")

        resp = json.loads(line)
        chunk_results = resp.get("results", [])
        results.extend(chunk_results)

        done_count = len(results)
        elapsed = time.time() - start_time
        pct = (done_count / total_pairs) * 100
        completed_so_far = sum(1 for r in results if r.get("completed"))
        compl_pct = (completed_so_far / done_count) * 100
        avg_spd = sum(r.get("avgSpeedKmh", 0) for r in results) / done_count

        sys.stdout.write(
            f"\r[{done_count:4d}/{total_pairs:4d}] {pct:5.1f}% | "
            f"Clean Laps: {compl_pct:5.1f}% | Avg Spd: {avg_spd:5.1f} km/h | Elapsed: {elapsed:5.1f}s"
        )
        sys.stdout.flush()

    sys.stdout.write("\n")
    return results


def summarize_results(weight_path: str, results: list[dict]):
    total = len(results)
    if total == 0:
        return {}, {}, {}, []

    clean_completed = sum(1 for r in results if r["completed"])
    completion_rate = (clean_completed / total) * 100
    avg_speed = sum(r["avgSpeedKmh"] for r in results) / total
    avg_off_track = sum(r["offTrackPct"] for r in results) / total
    total_crashes = sum(r["wallCrash"] for r in results)

    summary = {
        "weightPath": weight_path,
        "totalPairs": total,
        "cleanCompleted": clean_completed,
        "completionRatePct": round(completion_rate, 2),
        "avgSpeedKmh": round(avg_speed, 2),
        "avgOffTrackPct": round(avg_off_track, 2),
        "totalWallCrashes": total_crashes,
    }

    # Per-class summary
    per_class = {}
    class_groups = {}
    for r in results:
        c_cls = r.get("carClass", "unknown")
        class_groups.setdefault(c_cls, []).append(r)

    for c_cls, c_list in sorted(class_groups.items()):
        n = len(c_list)
        n_comp = sum(1 for r in c_list if r["completed"])
        per_class[c_cls] = {
            "pairs": n,
            "cleanCompleted": n_comp,
            "completionRatePct": round((n_comp / n) * 100, 1),
            "avgSpeedKmh": round(sum(r["avgSpeedKmh"] for r in c_list) / n, 1),
            "avgOffTrackPct": round(sum(r["offTrackPct"] for r in c_list) / n, 1),
            "wallCrashes": sum(r["wallCrash"] for r in c_list),
        }

    # Per-track summary
    per_track = {}
    track_groups = {}
    for r in results:
        t_id = r.get("trackId", "unknown")
        track_groups.setdefault(t_id, []).append(r)

    for t_id, t_list in sorted(track_groups.items()):
        n = len(t_list)
        n_comp = sum(1 for r in t_list if r["completed"])
        per_track[t_id] = {
            "pairs": n,
            "cleanCompleted": n_comp,
            "completionRatePct": round((n_comp / n) * 100, 1),
            "avgSpeedKmh": round(sum(r["avgSpeedKmh"] for r in t_list) / n, 1),
            "avgOffTrackPct": round(sum(r["offTrackPct"] for r in t_list) / n, 1),
            "wallCrashes": sum(r["wallCrash"] for r in t_list),
        }

    # Top 10 worst pairs
    worst_pairs = sorted(
        results,
        key=lambda r: (
            0 if r["completed"] else 1,
            r.get("wallCrash", 0),
            r.get("offTrackPct", 0.0),
            -r.get("avgSpeedKmh", 0.0),
        ),
        reverse=True,
    )[:10]

    return summary, per_class, per_track, worst_pairs


def print_summary_table(summary: dict, per_class: dict, per_track: dict, worst_pairs: list[dict]):
    print("\n" + "=" * 88)
    print("                     APEX MINIATURE — PPO POLICY EVALUATION")
    print("=" * 88)
    print(f"Weights File:        {summary.get('weightPath')}")
    print(f"Total Pairs Tested:  {summary.get('totalPairs')}")
    print(f"Clean Laps Finished: {summary.get('cleanCompleted')} / {summary.get('totalPairs')} ({summary.get('completionRatePct')}%)")
    print(f"Average Speed:       {summary.get('avgSpeedKmh')} km/h")
    print(f"Average Off-Track:   {summary.get('avgOffTrackPct')}%")
    print(f"Total Wall Crashes:  {summary.get('totalWallCrashes')}")

    print("\n" + "-" * 88)
    print("                                TOP 10 WORST PAIRS")
    print("-" * 88)
    print(f" {'#':<2} {'Track':<18} {'Car':<24} {'Class':<14} {'Clean':<6} {'Crashes':<8} {'Off-Track'}")
    print("-" * 88)
    for idx, r in enumerate(worst_pairs, 1):
        clean_str = "YES" if r["completed"] else "NO"
        print(
            f" {idx:<2} {r['trackId']:<18} {r['carId']:<24} {r['carClass']:<14} "
            f"{clean_str:<6} {r['wallCrash']:<8} {r['offTrackPct']:.1f}%"
        )

    print("\n" + "-" * 88)
    print("                              PER-CLASS PERFORMANCE")
    print("-" * 88)
    print(f" {'Class':<18} {'Pairs':<7} {'Clean Laps (%)':<16} {'Avg Speed (km/h)':<18} {'Off-Track (%)':<15} {'Crashes'}")
    print("-" * 88)
    for c_cls, stats in per_class.items():
        print(
            f" {c_cls:<18} {stats['pairs']:<7} {stats['completionRatePct']:<16.1f} "
            f"{stats['avgSpeedKmh']:<18.1f} {stats['avgOffTrackPct']:<15.1f} {stats['wallCrashes']}"
        )

    print("\n" + "-" * 88)
    print("                              PER-TRACK PERFORMANCE")
    print("-" * 88)
    print(f" {'Track':<18} {'Pairs':<7} {'Clean Laps (%)':<16} {'Avg Speed (km/h)':<18} {'Off-Track (%)':<15} {'Crashes'}")
    print("-" * 88)
    for t_id, stats in per_track.items():
        print(
            f" {t_id:<18} {stats['pairs']:<7} {stats['completionRatePct']:<16.1f} "
            f"{stats['avgSpeedKmh']:<18.1f} {stats['avgOffTrackPct']:<15.1f} {stats['wallCrashes']}"
        )
    print("=" * 88 + "\n")


def save_reports(out_base: str, all_evaluations: list[dict]):
    os.makedirs(os.path.dirname(os.path.abspath(out_base)), exist_ok=True)
    json_path = out_base if out_base.endswith(".json") else f"{out_base}.json"
    csv_path = out_base.replace(".json", ".csv") if out_base.endswith(".json") else f"{out_base}.csv"

    # Save JSON report
    report_json = {
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "evaluations": all_evaluations,
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_json, f, indent=2)
    print(f"Saved evaluation JSON -> {json_path}")

    # Save CSV matrix
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "weights_path",
            "track_id",
            "car_id",
            "car_class",
            "completed",
            "best_lap_time",
            "avg_speed_kmh",
            "off_track_pct",
            "wall_crash",
            "steps",
        ])
        for ev in all_evaluations:
            w_path = ev["summary"].get("weightPath", "")
            for r in ev.get("results", []):
                writer.writerow([
                    w_path,
                    r["trackId"],
                    r["carId"],
                    r["carClass"],
                    "TRUE" if r["completed"] else "FALSE",
                    r["bestLapTime"] if r["bestLapTime"] is not None else "",
                    r["avgSpeedKmh"],
                    r["offTrackPct"],
                    r["wallCrash"],
                    r["steps"],
                ])
    print(f"Saved evaluation CSV  -> {csv_path}")


def main():
    parser = argparse.ArgumentParser(description="Apex Miniature: Deterministic All-Tracks & All-Cars PPO Benchmark")
    parser.add_argument("--weights", default="src/game/aiPolicyWeights_v1.json", help="Path to policy weights JSON")
    parser.add_argument("--all", action="store_true", help="Automatically loop over v1, v2, v3, v4 checkpoints")
    parser.add_argument("--envs", type=int, default=16, help="Parallel evaluation batch size")
    parser.add_argument("--max-steps", type=int, default=6000, help="Max steps per episode (default 6000, 10000 on Le Mans)")
    parser.add_argument("--all-liveries", action="store_true", help="Test all liveries/selectable cars instead of base models")
    parser.add_argument("--tracks", nargs="*", default=None, help="Optional subset of track IDs")
    parser.add_argument("--cars", nargs="*", default=None, help="Optional subset of car IDs")
    parser.add_argument("--out", default="audit/eval_matrix.json", help="Output path (without extension or .json)")
    args = parser.parse_args()

    weight_candidates = []
    if args.all:
        for v in ["v1", "v2", "v3", "v4"]:
            candidate = f"src/game/aiPolicyWeights_{v}.json"
            if os.path.exists(candidate):
                weight_candidates.append(candidate)
            else:
                alt = f"src/game/aiPolicyWeights_{v}.best.json"
                if os.path.exists(alt):
                    weight_candidates.append(alt)
        if not weight_candidates:
            weight_candidates = [args.weights]
    else:
        weight_candidates = [args.weights]

    print(f"Launching headlessEnv worker for deterministic evaluation...")
    worker = spawn_env_worker()

    try:
        catalog = query_catalog(worker)
        all_tracks = [t["id"] for t in catalog.get("tracks", [])]
        car_pool = catalog.get("selectableCars" if args.all_liveries else "baseCars", [])
        all_cars = [c["id"] for c in car_pool]

        eval_tracks = [t for t in all_tracks if (not args.tracks or t in args.tracks)]
        eval_cars = [c for c in all_cars if (not args.cars or c in args.cars)]

        pairs = [{"trackId": t, "carId": c} for t in eval_tracks for c in eval_cars]

        print(f"Catalog loaded: {len(eval_tracks)} tracks × {len(eval_cars)} cars = {len(pairs)} pairs total.")
        if len(pairs) == 0:
            print("Error: No matching (track, car) pairs found.")
            return

        all_evaluations = []
        for w_path in weight_candidates:
            if not os.path.exists(w_path):
                print(f"Warning: Weights file '{w_path}' does not exist, skipping.")
                continue

            results = run_evaluation(worker, w_path, pairs, args.envs, args.max_steps)
            summary, per_class, per_track, worst_pairs = summarize_results(w_path, results)
            print_summary_table(summary, per_class, per_track, worst_pairs)

            all_evaluations.append({
                "summary": summary,
                "perClass": per_class,
                "perTrack": per_track,
                "worstPairs": worst_pairs,
                "results": results,
            })

        if all_evaluations:
            save_reports(args.out, all_evaluations)

    finally:
        try:
            worker.terminate()
            worker.wait(timeout=3)
        except Exception:
            pass


if __name__ == "__main__":
    main()
