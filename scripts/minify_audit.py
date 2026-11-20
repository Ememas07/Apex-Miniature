import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import sys

TIMESTAMPED_FILENAME_RE = re.compile(
    r"^(\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_v([1-8])\.json$"
)

STANDARD_SUMMARY_KEYS = {
    "weightPath",
    "totalPairs",
    "cleanCompleted",
    "completionRatePct",
    "avgSpeedKmh",
    "avgOffTrackPct",
    "totalWallCrashes",
    "totalStalls",
}


def parse_file_sort_key(path: Path) -> tuple[datetime, float]:
    """Parse HH-mm-ss-dd-MM-yy prefix for reliable ordering, falling back to mtime."""
    match = TIMESTAMPED_FILENAME_RE.match(path.name)
    if match:
        ts_str = match.group(1)
        try:
            return (datetime.strptime(ts_str, "%H-%M-%S-%d-%m-%y"), path.stat().st_mtime)
        except ValueError:
            pass
    return (datetime.min, path.stat().st_mtime)


def find_latest_variants(
    bench_dir: Path,
    variants: tuple[str, ...] = ("v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"),
) -> list[Path]:
    """Find the latest timestamped <HH-mm-ss-dd-MM-yy>_v{1..8}.json file for each variant."""
    if not bench_dir.is_dir():
        return []

    selected: list[Path] = []
    for var in variants:
        var_num = var.lstrip("v")
        candidates: list[Path] = []
        for p in bench_dir.iterdir():
            if not p.is_file():
                continue
            m = TIMESTAMPED_FILENAME_RE.match(p.name)
            if m and m.group(2) == var_num:
                candidates.append(p)
        if candidates:
            candidates.sort(key=parse_file_sort_key, reverse=True)
            selected.append(candidates[0])
    return selected


def find_matching_baseline_eval(
    ev: dict, baseline_evals: list[dict], fallback_idx: int
) -> dict | None:
    if not baseline_evals:
        return None
    w_path = ev.get("summary", {}).get("weightPath")
    if w_path:
        for b in baseline_evals:
            if b.get("summary", {}).get("weightPath") == w_path:
                return b
    if len(baseline_evals) == 1:
        return baseline_evals[0]
    if fallback_idx < len(baseline_evals):
        return baseline_evals[fallback_idx]
    return baseline_evals[0]


def format_eval(ev: dict, baseline_ev: dict | None = None, top_tracks: int = 8) -> str:
    summary = ev.get("summary", {})
    per_class = ev.get("perClass", {})
    per_track = ev.get("perTrack", {})

    weight_path = summary.get("weightPath", "unknown")
    total = summary.get("totalPairs", 0)
    clean = summary.get("cleanCompleted", 0)
    rate = summary.get("completionRatePct", (clean / total * 100.0) if total else 0.0)
    speed = summary.get("avgSpeedKmh", 0.0)
    off = summary.get("avgOffTrackPct", 0.0)
    walls = summary.get("totalWallCrashes", 0)
    stalls = summary.get("totalStalls", 0)

    # Any extra summary fields beyond the standard set
    extra_summary_parts = []
    for k, v in summary.items():
        if k not in STANDARD_SUMMARY_KEYS:
            if isinstance(v, float):
                extra_summary_parts.append(f"{k}: {v:.2f}")
            else:
                extra_summary_parts.append(f"{k}: {v}")
    extra_str = f" | {' | '.join(extra_summary_parts)}" if extra_summary_parts else ""

    lines = [
        f"## Policy: `{weight_path}`",
        f"- **Overall:** {clean}/{total} clean ({rate:.2f}%) | {speed:.2f} km/h | {off:.2f}% off-track | {walls} wall crashes | {stalls} stalls{extra_str}",
    ]

    if baseline_ev:
        bs = baseline_ev.get("summary", {})
        b_clean = bs.get("cleanCompleted", 0)
        b_total = bs.get("totalPairs", total)
        b_rate = bs.get("completionRatePct", (b_clean / b_total * 100.0) if b_total else 0.0)
        b_speed = bs.get("avgSpeedKmh", 0.0)
        b_off = bs.get("avgOffTrackPct", 0.0)
        b_walls = bs.get("totalWallCrashes", 0)

        delta_parts = [
            f"clean {clean - b_clean:+d} ({rate - b_rate:+.2f} pp)",
            f"speed {speed - b_speed:+.2f} km/h",
            f"off-track {off - b_off:+.2f} pp",
            f"walls {walls - b_walls:+d}",
        ]
        for k in summary:
            if k not in STANDARD_SUMMARY_KEYS and k in bs:
                v = summary[k]
                bv = bs[k]
                if isinstance(v, (int, float)) and isinstance(bv, (int, float)):
                    if isinstance(v, float) or isinstance(bv, float):
                        delta_parts.append(f"{k} {v - bv:+.2f}")
                    else:
                        delta_parts.append(f"{k} {v - bv:+d}")
        lines.append(f"- **Delta vs baseline:** {' | '.join(delta_parts)}")

    # All classes
    lines.append("\n### Per Class")
    b_classes = baseline_ev.get("perClass", {}) if baseline_ev else {}
    for cls_name in sorted(per_class.keys()):
        c = per_class[cls_name]
        c_clean = c.get("cleanCompleted", 0)
        c_pairs = c.get("pairs", 0)
        c_rate = c.get("completionRatePct", (c_clean / c_pairs * 100.0) if c_pairs else 0.0)
        c_spd = c.get("avgSpeedKmh", 0.0)
        c_off = c.get("avgOffTrackPct", 0.0)
        c_wall = c.get("wallCrashes", 0)
        delta_str = ""
        if cls_name in b_classes:
            bc = b_classes[cls_name]
            d_clean = c_clean - bc.get("cleanCompleted", 0)
            d_spd = c_spd - bc.get("avgSpeedKmh", 0.0)
            d_wall = c_wall - bc.get("wallCrashes", 0)
            delta_str = f" (Δ clean {d_clean:+d}, Δ spd {d_spd:+.1f}, Δ walls {d_wall:+d})"
        lines.append(
            f"- **{cls_name}:** {c_clean}/{c_pairs} ({c_rate:.1f}%) | {c_spd:.1f} km/h | off {c_off:.1f}% | walls {c_wall}{delta_str}"
        )

    # Track highlights & worst tracks
    b_tracks = baseline_ev.get("perTrack", {}) if baseline_ev else {}

    def format_track_delta(t_name: str, t_clean: int, t_spd: float, t_wall: int) -> str:
        if t_name in b_tracks:
            bt = b_tracks[t_name]
            d_clean = t_clean - bt.get("cleanCompleted", 0)
            d_spd = t_spd - bt.get("avgSpeedKmh", 0.0)
            d_wall = t_wall - bt.get("wallCrashes", 0)
            return f" (Δ clean {d_clean:+d}, Δ spd {d_spd:+.1f}, Δ walls {d_wall:+d})"
        return ""

    track_items = []
    for t_name, t in per_track.items():
        t_clean = t.get("cleanCompleted", 0)
        t_pairs = t.get("pairs", 0)
        t_rate = t.get("completionRatePct", (t_clean / t_pairs * 100.0) if t_pairs else 0.0)
        t_spd = t.get("avgSpeedKmh", 0.0)
        t_off = t.get("avgOffTrackPct", 0.0)
        t_wall = t.get("wallCrashes", 0)
        track_items.append((t_rate, t_clean, t_pairs, t_spd, t_off, t_wall, t_name))

    clean_tracks = [x for x in track_items if x[1] > 0]
    clean_tracks.sort(key=lambda x: (-x[0], -x[1], -x[3], x[6]))

    worst_tracks = sorted(track_items, key=lambda x: (x[0], -x[5], x[3], x[6]))[:top_tracks]

    lines.append(f"\n### Tracks With Clean Laps ({len(clean_tracks)} total)")
    if clean_tracks:
        for t_rate, t_clean, t_pairs, t_spd, t_off, t_wall, t_name in clean_tracks:
            delta_str = format_track_delta(t_name, t_clean, t_spd, t_wall)
            lines.append(
                f"- **{t_name}:** {t_clean}/{t_pairs} ({t_rate:.1f}%) | {t_spd:.1f} km/h | off {t_off:.1f}% | walls {t_wall}{delta_str}"
            )
    else:
        lines.append("- None")

    lines.append(f"\n### Worst {top_tracks} Tracks (Lowest Clean / Highest Wall Crashes / Lowest Speed)")
    for t_rate, t_clean, t_pairs, t_spd, t_off, t_wall, t_name in worst_tracks:
        delta_str = format_track_delta(t_name, t_clean, t_spd, t_wall)
        lines.append(
            f"- **{t_name}:** {t_clean}/{t_pairs} ({t_rate:.1f}%) | {t_spd:.1f} km/h | off {t_off:.1f}% | walls {t_wall}{delta_str}"
        )

    return "\n".join(lines)


def minify_file(path: Path, baseline_path: Path | None = None, top_tracks: int = 8) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    evals = data.get("evaluations", [])
    eval_at = data.get("evaluatedAt", "unknown")

    baseline_evals = []
    b_eval_at = None
    if baseline_path and baseline_path.exists():
        b_data = json.loads(baseline_path.read_text(encoding="utf-8"))
        baseline_evals = b_data.get("evaluations", [])
        b_eval_at = b_data.get("evaluatedAt")

    header = [f"# Audit Digest: `{path.name}` (evaluatedAt: `{eval_at}`)"]
    if baseline_path:
        b_at_str = f" (evaluatedAt: `{b_eval_at}`)" if b_eval_at else ""
        header.append(f"Baseline: `{baseline_path.name}`{b_at_str}")

    blocks = []
    for idx, ev in enumerate(evals):
        b_ev = find_matching_baseline_eval(ev, baseline_evals, idx)
        blocks.append(format_eval(ev, b_ev, top_tracks=top_tracks))

    return "\n".join(header) + "\n\n" + "\n\n---\n\n".join(blocks)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Minify Apex-Miniature audit JSON files.")
    parser.add_argument("files", nargs="*", help="Audit JSON files to summarize (default: latest files in --dir)")
    parser.add_argument("--dir", default="audit/bench_results", help="Directory to search for benchmark JSONs (default: audit/bench_results)")
    parser.add_argument("--latest", action="store_true", help="Pick the latest timestamped <HH-mm-ss-dd-MM-yy>_v{1..8}.json for each variant")
    parser.add_argument("--baseline", help="Optional baseline audit JSON file for delta comparison")
    parser.add_argument("--top-tracks", "-n", "--worst-n", type=int, default=8, dest="top_tracks", help="Number of worst tracks to show (default: 8)")
    parser.add_argument("-o", "--out", help="Output Markdown path (prints to stdout if omitted)")
    args = parser.parse_args()

    bench_dir = Path(args.dir)
    if args.latest or not args.files:
        target_files = find_latest_variants(bench_dir)
        if not target_files:
            sys.stderr.write(f"No timestamped variant files found in '{bench_dir}'.\n")
            sys.exit(1)
    else:
        target_files = [Path(f) for f in args.files]

    missing = [p for p in target_files if not p.exists()]
    if missing:
        sys.stderr.write(f"Error: file(s) not found: {', '.join(str(p) for p in missing)}\n")
        sys.exit(1)

    base_path = Path(args.baseline) if args.baseline else None
    if base_path and not base_path.exists():
        sys.stderr.write(f"Warning: baseline file not found: {base_path}\n")

    parts = [minify_file(f, baseline_path=base_path, top_tracks=args.top_tracks) for f in target_files]
    out_text = "\n\n===\n\n".join(parts)

    if args.out:
        out_p = Path(args.out)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(out_text, encoding="utf-8")
    else:
        print(out_text)


if __name__ == "__main__":
    main()
