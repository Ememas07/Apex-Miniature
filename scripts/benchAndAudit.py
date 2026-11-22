#!/usr/bin/env python3
"""
Apex Miniature — Unified & Per-Class AI Benchmark & Audit Suite (ANB1 .bin)
Evaluates trained AI policy binaries (per-class class_<slug>.bin or unified v1/v2/starts)
deterministically across tracks and cars, saves raw JSON metrics, and generates a Markdown audit.

Usage:
  python -u scripts/benchAndAudit.py --car-class HYPERCAR_GTP
  python -u scripts/benchAndAudit.py --car-class HYPERCAR_GTP --tracks spa-francorchamps
  python -u scripts/benchAndAudit.py --all-classes
  python -u scripts/benchAndAudit.py --variant v1
  python -u scripts/benchAndAudit.py --all
  python -u scripts/benchAndAudit.py --weights public/models/policies/class_hypercar_gtp.bin --tracks spa-francorchamps
"""

import argparse
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
import time

POLICIES_BIN_DIR = os.path.join("public", "models", "policies")

CAR_CLASS_IDS = [
    "HYPERCAR_GTP",
    "LMP2",
    "GT3",
    "GT4",
    "F1_2026",
    "F1_2021",
    "F1_2005",
    "FORMULA_E",
    "TRACK_COUPE",
    "SUPERCAR",
]

CAR_CLASS_ALIASES = {
    "gtp": "HYPERCAR_GTP",
    "hypercar": "HYPERCAR_GTP",
    "hypercar_gtp": "HYPERCAR_GTP",
    "lmh": "HYPERCAR_GTP",
    "lmdh": "HYPERCAR_GTP",
    "lmp2": "LMP2",
    "gt3": "GT3",
    "gt4": "GT4",
    "f1_2026": "F1_2026",
    "f12026": "F1_2026",
    "f1_2021": "F1_2021",
    "f12021": "F1_2021",
    "f1_2005": "F1_2005",
    "f12005": "F1_2005",
    "formula_e": "FORMULA_E",
    "fe": "FORMULA_E",
    "track_coupe": "TRACK_COUPE",
    "coupe": "TRACK_COUPE",
    "supercar": "SUPERCAR",
}


def resolve_car_class(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower().replace("-", "_")
    if key in CAR_CLASS_ALIASES:
        return CAR_CLASS_ALIASES[key]
    upper = raw.strip().upper().replace("-", "_")
    if upper in CAR_CLASS_IDS:
        return upper
    raise ValueError(f"Unknown car class '{raw}'. Valid classes: {', '.join(CAR_CLASS_IDS)}")


def class_bin_path(car_class: str) -> str:
    return os.path.join(POLICIES_BIN_DIR, f"class_{car_class.lower()}.bin")


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
        avg_ovl = sum(r.get("pedalOverlapPct", 0) for r in results) / done_count
        avg_fthr = sum(r.get("fullThrottlePct", 0) for r in results) / done_count

        sys.stdout.write(
            f"\r[{done_count:4d}/{total_pairs:4d}] {pct:5.1f}% | "
            f"Clean: {compl_pct:5.1f}% | Avg: {avg_spd:5.1f} km/h | "
            f"FullThr: {avg_fthr:4.1f}% | Ovl: {avg_ovl:4.1f}% | {elapsed:5.1f}s"
        )
        sys.stdout.flush()

    sys.stdout.write("\n")
    return results


def summarize_results(weight_path: str, results: list[dict], car_class: str | None = None):
    total = len(results)
    if total == 0:
        return {}, {}, {}, []

    clean_completed = sum(1 for r in results if r["completed"])
    completion_rate = (clean_completed / total) * 100
    avg_speed = sum(r["avgSpeedKmh"] for r in results) / total
    avg_max_speed = sum(r.get("maxSpeedKmh", 0.0) for r in results) / total
    avg_off_track = sum(r["offTrackPct"] for r in results) / total
    avg_full_thr = sum(r.get("fullThrottlePct", 0.0) for r in results) / total
    avg_overlap = sum(r.get("pedalOverlapPct", 0.0) for r in results) / total
    avg_str_brk = sum(r.get("straightBrakePct", 0.0) for r in results) / total
    total_crashes = sum(r["wallCrash"] for r in results)
    total_stalls = sum(r.get("stalls", 0) for r in results)

    summary = {
        "weightPath": weight_path,
        "carClass": car_class,
        "totalPairs": total,
        "cleanCompleted": clean_completed,
        "completionRatePct": round(completion_rate, 2),
        "avgSpeedKmh": round(avg_speed, 2),
        "avgMaxSpeedKmh": round(avg_max_speed, 1),
        "avgOffTrackPct": round(avg_off_track, 2),
        "avgFullThrottlePct": round(avg_full_thr, 1),
        "avgPedalOverlapPct": round(avg_overlap, 2),
        "avgStraightBrakePct": round(avg_str_brk, 1),
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
            "avgMaxSpeedKmh": round(sum(r.get("maxSpeedKmh", 0.0) for r in c_list) / n, 1),
            "avgOffTrackPct": round(sum(r["offTrackPct"] for r in c_list) / n, 1),
            "avgFullThrottlePct": round(sum(r.get("fullThrottlePct", 0.0) for r in c_list) / n, 1),
            "avgPedalOverlapPct": round(sum(r.get("pedalOverlapPct", 0.0) for r in c_list) / n, 2),
            "avgStraightBrakePct": round(sum(r.get("straightBrakePct", 0.0) for r in c_list) / n, 1),
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
            "avgMaxSpeedKmh": round(sum(r.get("maxSpeedKmh", 0.0) for r in t_list) / n, 1),
            "avgOffTrackPct": round(sum(r["offTrackPct"] for r in t_list) / n, 1),
            "avgFullThrottlePct": round(sum(r.get("fullThrottlePct", 0.0) for r in t_list) / n, 1),
            "avgPedalOverlapPct": round(sum(r.get("pedalOverlapPct", 0.0) for r in t_list) / n, 2),
            "avgStraightBrakePct": round(sum(r.get("straightBrakePct", 0.0) for r in t_list) / n, 1),
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
    print("\n" + "=" * 106)
    print("                             APEX MINIATURE — AI BENCHMARK & AUDIT (ANB1)")
    print("=" * 106)
    print(f"Weights File:        {summary.get('weightPath')}")
    if summary.get("carClass"):
        print(f"Target Class:        {summary.get('carClass')}")
    print(f"Total Pairs Tested:  {summary.get('totalPairs')}")
    print(
        f"Clean Laps Finished: {summary.get('cleanCompleted')} / {summary.get('totalPairs')} "
        f"({summary.get('completionRatePct')}%)"
    )
    print(
        f"Speed (Avg / Max):   {summary.get('avgSpeedKmh')} km/h  /  {summary.get('avgMaxSpeedKmh')} km/h"
    )
    print(
        f"Pedal Quality:       Full-Thr {summary.get('avgFullThrottlePct')}% | "
        f"Overlap {summary.get('avgPedalOverlapPct')}% | Straight-Brk {summary.get('avgStraightBrakePct')}%"
    )
    print(f"Average Off-Track:   {summary.get('avgOffTrackPct')}%")
    print(f"Total Wall Crashes:  {summary.get('totalWallCrashes')}")
    print(f"Total Stalls:        {summary.get('totalStalls')}")

    print("\n" + "-" * 106)
    print("                                        PER-CLASS PERFORMANCE")
    print("-" * 106)
    print(
        f" {'Class':<15} {'Pairs':<6} {'Clean%':<8} {'AvgSpd':<8} {'MaxSpd':<8} "
        f"{'FullThr%':<9} {'Ovlp%':<7} {'StrBrk%':<8} {'Off%':<7} {'Crsh':<5} {'Stl'}"
    )
    print("-" * 106)
    for c_cls, stats in per_class.items():
        print(
            f" {c_cls:<15} {stats['pairs']:<6} {stats['completionRatePct']:<8.1f} "
            f"{stats['avgSpeedKmh']:<8.1f} {stats.get('avgMaxSpeedKmh', 0.0):<8.1f} "
            f"{stats.get('avgFullThrottlePct', 0.0):<9.1f} {stats.get('avgPedalOverlapPct', 0.0):<7.2f} "
            f"{stats.get('avgStraightBrakePct', 0.0):<8.1f} {stats['avgOffTrackPct']:<7.1f} "
            f"{stats['wallCrashes']:<5} {stats.get('stalls', 0)}"
        )

    print("\n" + "-" * 106)
    print("                                          TOP 10 WORST PAIRS")
    print("-" * 106)
    for idx, r in enumerate(worst_pairs, 1):
        clean_str = "YES" if r["completed"] else "NO"
        print(
            f" {idx:<2} {r['trackId']:<18} {r['carId']:<23} {r['carClass']:<13} "
            f"{clean_str:<4} avg={r['avgSpeedKmh']:5.1f} max={r.get('maxSpeedKmh', 0):5.1f} "
            f"ovl={r.get('pedalOverlapPct', 0):4.1f}% cr={r['wallCrash']:<2} off={r['offTrackPct']:.1f}%"
        )
    print("=" * 106 + "\n")


def build_markdown_audit(all_evaluations: list[dict], baseline_summary: dict | None = None, top_outliers: int = 8) -> str:
    lines = [
        "# Apex Miniature — AI Benchmark & Audit Report",
        f"_Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
        "## Overview",
        "| Model | Pairs | Clean Laps | Avg Speed | Max Speed | Full-Thr % | Overlap % | Straight-Brk % | Off-Track | Crashes | Stalls |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
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
            f"{s['avgSpeedKmh']} km/h | {s.get('avgMaxSpeedKmh', 0)} km/h | "
            f"{s.get('avgFullThrottlePct', 0)}% | {s.get('avgPedalOverlapPct', 0)}% | "
            f"{s.get('avgStraightBrakePct', 0)}% | {s['avgOffTrackPct']}% | "
            f"{s['totalWallCrashes']} | {s['totalStalls']} |"
        )

    for ev in all_evaluations:
        s = ev["summary"]
        name = os.path.basename(s.get("weightPath", "unknown"))
        lines.extend([
            "",
            f"## {name} — Class Breakdown",
            "| Class | Pairs | Clean % | Avg km/h | Max km/h | Full-Thr % | Overlap % | Str-Brk % | Off-Track % | Crashes | Stalls |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ])
        for cls, st in ev["perClass"].items():
            lines.append(
                f"| {cls} | {st['pairs']} | {st['completionRatePct']}% | {st['avgSpeedKmh']} | "
                f"{st.get('avgMaxSpeedKmh', 0)} | {st.get('avgFullThrottlePct', 0)}% | "
                f"{st.get('avgPedalOverlapPct', 0)}% | {st.get('avgStraightBrakePct', 0)}% | "
                f"{st['avgOffTrackPct']}% | {st['wallCrashes']} | {st['stalls']} |"
            )

        worst_tracks = sorted(
            ev["perTrack"].items(),
            key=lambda kv: (kv[1]["completionRatePct"], -kv[1]["wallCrashes"], -kv[1]["avgOffTrackPct"]),
        )[:top_outliers]
        lines.extend([
            "",
            f"### {name} — Lowest Completion / Outlier Tracks",
            "| Track | Clean % | Avg km/h | Max km/h | Full-Thr % | Overlap % | Str-Brk % | Off-Track % | Crashes | Stalls |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ])
        for tid, st in worst_tracks:
            lines.append(
                f"| `{tid}` | {st['completionRatePct']}% | {st['avgSpeedKmh']} | {st.get('avgMaxSpeedKmh', 0)} | "
                f"{st.get('avgFullThrottlePct', 0)}% | {st.get('avgPedalOverlapPct', 0)}% | "
                f"{st.get('avgStraightBrakePct', 0)}% | {st['avgOffTrackPct']}% | "
                f"{st['wallCrashes']} | {st['stalls']} |"
            )

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Apex Miniature: Per-Class & Unified AI Benchmark & Markdown Audit Runner (ANB1 .bin)"
    )
    parser.add_argument(
        "--car-class",
        default=None,
        help="Evaluate a per-class model against its class cars (e.g. HYPERCAR_GTP, GT3, F1_2026)",
    )
    parser.add_argument(
        "--all-classes",
        action="store_true",
        help="Benchmark all present per-class models in public/models/policies/class_*.bin",
    )
    parser.add_argument(
        "--variant",
        "-v",
        default=None,
        help="Unified fallback slot to evaluate: v1, v2, or starts",
    )
    parser.add_argument("--weights", default=None, help="Explicit path to ANB1 .bin (or legacy .json) policy file")
    parser.add_argument("--all", action="store_true", help="Benchmark all present unified models (v1, v2) and per-class models")
    parser.add_argument("--envs", type=int, default=16, help="Parallel evaluation batch size")
    parser.add_argument("--max-steps", type=int, default=6000, help="Max steps per episode")
    parser.add_argument("--all-liveries", action="store_true", help="Test all selectable liveries")
    parser.add_argument("--tracks", nargs="*", default=None, help="Optional subset of track IDs")
    parser.add_argument("--cars", nargs="*", default=None, help="Optional subset of car IDs")
    parser.add_argument("--baseline", default=None, help="Optional baseline benchmark JSON for diff comparison")
    parser.add_argument("--out", default=None, help="Output JSON path (default: audit/bench_results/<ts>.json)")
    parser.add_argument("--md-out", default=None, help="Output Markdown audit path (default: audit/audit_result_<ts>.md)")
    args = parser.parse_args()

    # Each target is (weight_path, optional_class_filter)
    eval_targets: list[tuple[str, str | None]] = []
    explicit_class = resolve_car_class(args.car_class) if args.car_class else None

    if args.weights:
        eval_targets.append((args.weights, explicit_class))
    elif explicit_class:
        p = class_bin_path(explicit_class)
        if os.path.exists(p):
            eval_targets.append((p, explicit_class))
        else:
            print(f"Error: Per-class model not found at {p}. Train it first with:")
            print(f"  python -u scripts/trainPPO.py --car-class {explicit_class} --tracks spa-francorchamps --solo-only")
            sys.exit(1)
    elif args.all_classes:
        for cls in CAR_CLASS_IDS:
            p = class_bin_path(cls)
            if os.path.exists(p):
                eval_targets.append((p, cls))
    elif args.all:
        for slot in ["v1", "v2"]:
            p = os.path.join(POLICIES_BIN_DIR, f"aiPolicyWeights_{slot}.bin")
            if os.path.exists(p):
                eval_targets.append((p, None))
        for cls in CAR_CLASS_IDS:
            p = class_bin_path(cls)
            if os.path.exists(p):
                eval_targets.append((p, cls))
    else:
        slot = (args.variant or "v1").lower()
        p = os.path.join(POLICIES_BIN_DIR, f"aiPolicyWeights_{slot}.bin")
        eval_targets.append((p, None))

    eval_targets = [(w, cls) for (w, cls) in eval_targets if os.path.exists(w)]
    if not eval_targets:
        print(f"Error: No trained ANB1 .bin weights found in {POLICIES_BIN_DIR}. Run scripts/trainPPO.py first.")
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
        eval_tracks = [t for t in all_tracks if (not args.tracks or t in args.tracks)]

        all_evaluations = []
        for w_path, cls_filter in eval_targets:
            if args.cars:
                eval_cars = [c["id"] for c in car_pool if c["id"] in args.cars]
            elif cls_filter:
                eval_cars = [c["id"] for c in car_pool if c.get("classId") == cls_filter]
            else:
                eval_cars = [c["id"] for c in car_pool]

            pairs = [{"trackId": t, "carId": c} for t in eval_tracks for c in eval_cars]
            print(
                f"Target '{os.path.basename(w_path)}'"
                f"{f' [{cls_filter}]' if cls_filter else ''}: "
                f"{len(eval_tracks)} tracks x {len(eval_cars)} cars = {len(pairs)} pairs."
            )
            if not pairs:
                print("Warning: No matching (track, car) pairs for target; skipping.")
                continue

            results = run_evaluation(worker, w_path, pairs, args.envs, args.max_steps)
            summary, per_class, per_track, worst_pairs = summarize_results(w_path, results, car_class=cls_filter)
            print_summary_table(summary, per_class, per_track, worst_pairs)
            all_evaluations.append({
                "summary": summary,
                "perClass": per_class,
                "perTrack": per_track,
                "worstPairs": worst_pairs,
                "results": results,
            })

        if not all_evaluations:
            print("No evaluations completed.")
            return

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
