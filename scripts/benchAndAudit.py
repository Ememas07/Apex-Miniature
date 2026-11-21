#!/usr/bin/env python3
"""
Apex Miniature — Unified AI Benchmark & Audit Suite
Evaluates trained AI policy weights (v1, v2, starts) deterministically across all
tracks and cars, saves raw JSON metrics, and generates a condensed Markdown audit report.

Usage:
  python -u scripts/benchAndAudit.py --variant v1
  python -u scripts/benchAndAudit.py --variant v2
  python -u scripts/benchAndAudit.py --all
  python -u scripts/benchAndAudit.py --variant v2 --tracks spa-francorchamps monza monaco --cars ferrari-499p porsche-911-gt3-r
  python -u scripts/benchAndAudit.py --variant v2 --baseline audit/bench_results/latest_v1.json
"""

import argparse
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
    total_stalls = sum(r.get("stalls", 0) for r in results)

    summary = {
        "weightPath": weight_path,
        "totalPairs": total,
        "cleanCompleted": clean_completed,
        "completionRatePct": round(completion_rate, 2),
        "avgSpeedKmh": round(avg_speed, 2),
        "avgOffTrackPct": round(avg_off_track, 2),
        "totalWallCrashes": total_crashes,
        "totalStalls": total_stalls,
    }

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
            "stalls": sum(r.get("stalls", 0) for r in c_list),
        }

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
            "stalls": sum(r.get("stalls", 0) for r in t_list),
        }

    worst_pairs = sorted(
        results,
        key=lambda r: (
            0 if r["completed"] else 1,
            r.get("wallCrash", 0) + r.get("stalls", 0),
            r.get("stalls", 0),
            r.get("offTrackPct", 0.0),
            -r.get("avgSpeedKmh", 0.0),
        ),
        reverse=True,
    )[:10]

    return summary, per_class, per_track, worst_pairs


def print_summary_table(summary: dict, per_class: dict, per_track: dict, worst_pairs: list[dict]):
    print("\n" + "=" * 88)
    print("                     APEX MINIATURE — AI BENCHMARK & AUDIT")
    print("=" * 88)
    print(f"Weights File:        {summary.get('weightPath')}")
    print(f"Total Pairs Tested:  {summary.get('totalPairs')}")
    print(
        f"Clean Laps Finished: {summary.get('cleanCompleted')} / {summary.get('totalPairs')} "
        f"({summary.get('completionRatePct')}%)"
    )
    print(f"Average Speed:       {summary.get('avgSpeedKmh')} km/h")
    print(f"Average Off-Track:   {summary.get('avgOffTrackPct')}%")
    print(f"Total Wall Crashes:  {summary.get('totalWallCrashes')}")
    print(f"Total Stalls:        {summary.get('totalStalls')}")

    print("\n" + "-" * 88)
    print("                              PER-CLASS PERFORMANCE")
    print("-" * 88)
    print(
        f" {'Class':<18} {'Pairs':<7} {'Clean (%)':<11} {'Avg km/h':<11} {'Off-Trk %':<11} {'Crashes':<9} {'Stalls'}"
    )
    print("-" * 88)
    for c_cls, stats in per_class.items():
        print(
            f" {c_cls:<18} {stats['pairs']:<7} {stats['completionRatePct']:<11.1f} "
            f"{stats['avgSpeedKmh']:<11.1f} {stats['avgOffTrackPct']:<11.1f} {stats['wallCrashes']:<9} {stats.get('stalls', 0)}"
        )

    print("\n" + "-" * 88)
    print("                                TOP 10 WORST PAIRS")
    print("-" * 88)
    for idx, r in enumerate(worst_pairs, 1):
        clean_str = "YES" if r["completed"] else "NO"
        print(
            f" {idx:<2} {r['trackId']:<18} {r['carId']:<24} {r['carClass']:<13} "
            f"{clean_str:<5} cr={r['wallCrash']:<3} st={r.get('stalls', 0):<3} off={r['offTrackPct']:.1f}%"
        )
    print("=" * 88 + "\n")


def build_markdown_audit(all_evaluations: list[dict], baseline_summary: dict | None = None, top_outliers: int = 8) -> str:
    lines = [
        "# Apex Miniature — AI Benchmark & Audit Report",
        f"_Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
        "## Overview",
        "| Model | Pairs | Clean Laps | Avg Speed | Off-Track | Wall Crashes | Stalls |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for ev in all_evaluations:
        s = ev["summary"]
        name = os.path.basename(s.get("weightPath", "unknown"))
        delta = ""
        if baseline_summary:
            d_comp = s.get("completionRatePct", 0) - baseline_summary.get("completionRatePct", 0)
            d_spd = s.get("avgSpeedKmh", 0) - baseline_summary.get("avgSpeedKmh", 0)
            delta = f" ({d_comp:+.1f}% clean, {d_spd:+.1f} km/h)"
        lines.append(
            f"| `{name}`{delta} | {s['totalPairs']} | {s['cleanCompleted']} ({s['completionRatePct']}%) | "
            f"{s['avgSpeedKmh']} km/h | {s['avgOffTrackPct']}% | {s['totalWallCrashes']} | {s['totalStalls']} |"
        )

    for ev in all_evaluations:
        s = ev["summary"]
        name = os.path.basename(s.get("weightPath", "unknown"))
        lines.extend([
            "",
            f"## {name} — Class Breakdown",
            "| Class | Pairs | Clean % | Avg km/h | Off-Track % | Crashes | Stalls |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ])
        for cls, st in ev["perClass"].items():
            lines.append(
                f"| {cls} | {st['pairs']} | {st['completionRatePct']}% | {st['avgSpeedKmh']} | "
                f"{st['avgOffTrackPct']}% | {st['wallCrashes']} | {st['stalls']} |"
            )

        worst_tracks = sorted(
            ev["perTrack"].items(),
            key=lambda kv: (kv[1]["completionRatePct"], -kv[1]["wallCrashes"], -kv[1]["avgOffTrackPct"]),
        )[:top_outliers]
        lines.extend([
            "",
            f"### {name} — Lowest Completion / Outlier Tracks",
            "| Track | Clean % | Avg km/h | Off-Track % | Crashes | Stalls |",
            "|---|---:|---:|---:|---:|---:|",
        ])
        for tid, st in worst_tracks:
            lines.append(
                f"| `{tid}` | {st['completionRatePct']}% | {st['avgSpeedKmh']} | "
                f"{st['avgOffTrackPct']}% | {st['wallCrashes']} | {st['stalls']} |"
            )

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Apex Miniature: Unified AI Benchmark & Markdown Audit Runner (v1 / v2 / starts)"
    )
    parser.add_argument(
        "--variant",
        "-v",
        default=None,
        help="Model slot to evaluate: v1, v2, or starts",
    )
    parser.add_argument("--weights", default=None, help="Explicit path to policy weights JSON or .bin")
    parser.add_argument("--all", action="store_true", help="Benchmark all present unified models (v1, v2)")
    parser.add_argument("--envs", type=int, default=16, help="Parallel evaluation batch size")
    parser.add_argument("--max-steps", type=int, default=6000, help="Max steps per episode")
    parser.add_argument("--all-liveries", action="store_true", help="Test all selectable liveries")
    parser.add_argument("--tracks", nargs="*", default=None, help="Optional subset of track IDs")
    parser.add_argument("--cars", nargs="*", default=None, help="Optional subset of car IDs")
    parser.add_argument("--baseline", default=None, help="Optional baseline benchmark JSON for diff comparison")
    parser.add_argument("--out", default=None, help="Output JSON path (default: audit/bench_results/<ts>.json)")
    parser.add_argument("--md-out", default=None, help="Output Markdown audit path (default: audit/audit_result_<ts>.md)")
    args = parser.parse_args()

    weight_candidates: list[str] = []
    if args.weights:
        weight_candidates = [args.weights]
    elif args.all:
        for slot in ["v1", "v2"]:
            p = os.path.join("src", "game", f"aiPolicyWeights_{slot}.json")
            if os.path.exists(p):
                weight_candidates.append(p)
    else:
        slot = (args.variant or "v1").lower()
        p = os.path.join("src", "game", f"aiPolicyWeights_{slot}.json")
        weight_candidates = [p]

    weight_candidates = [w for w in weight_candidates if os.path.exists(w)]
    if not weight_candidates:
        print("Error: No trained weights found to benchmark. Run scripts/trainPPO.py first.")
        sys.exit(1)

    baseline_summary = None
    if args.baseline and os.path.exists(args.baseline):
        try:
            with open(args.baseline, "r", encoding="utf-8") as bf:
                bdata = json.load(bf)
            if isinstance(bdata.get("evaluations"), list) and bdata["evaluations"]:
                baseline_summary = bdata["evaluations"][0].get("summary")
        except Exception:
            pass

    print("Launching headlessEnv worker for deterministic benchmark & audit...")
    worker = spawn_env_worker()

    try:
        catalog = query_catalog(worker)
        all_tracks = [t["id"] for t in catalog.get("tracks", [])]
        car_pool = catalog.get("selectableCars" if args.all_liveries else "baseCars", [])
        all_cars = [c["id"] for c in car_pool]

        eval_tracks = [t for t in all_tracks if (not args.tracks or t in args.tracks)]
        eval_cars = [c for c in all_cars if (not args.cars or c in args.cars)]
        pairs = [{"trackId": t, "carId": c} for t in eval_tracks for c in eval_cars]

        print(f"Catalog loaded: {len(eval_tracks)} tracks x {len(eval_cars)} cars = {len(pairs)} pairs.")
        if not pairs:
            print("Error: No matching (track, car) pairs.")
            return

        all_evaluations = []
        for w_path in weight_candidates:
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

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_path = args.out or os.path.join("audit", "bench_results", f"bench_{ts}.json")
        md_path = args.md_out or os.path.join("audit", f"audit_result_{ts}.md")
        os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
        os.makedirs(os.path.dirname(os.path.abspath(md_path)), exist_ok=True)

        with open(json_path, "w", encoding="utf-8") as jf:
            json.dump(
                {"evaluatedAt": datetime.now(timezone.utc).isoformat(), "evaluations": all_evaluations},
                jf,
                indent=2,
            )
        md_text = build_markdown_audit(all_evaluations, baseline_summary=baseline_summary)
        with open(md_path, "w", encoding="utf-8") as mf:
            mf.write(md_text)

        print(f"Saved JSON report     -> {json_path}")
        print(f"Saved Markdown audit  -> {md_path}")
    finally:
        try:
            worker.terminate()
            worker.wait(timeout=3)
        except Exception:
            pass


if __name__ == "__main__":
    main()
