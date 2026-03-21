from __future__ import annotations

import argparse
import ast
import csv
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image


def xyxy_to_yolo(
    bbox_xyxy: tuple[float, float, float, float], image_w: int, image_h: int
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox_xyxy
    x1 = max(0.0, min(float(image_w), x1))
    y1 = max(0.0, min(float(image_h), y1))
    x2 = max(0.0, min(float(image_w), x2))
    y2 = max(0.0, min(float(image_h), y2))
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    xc = x1 + (w / 2.0)
    yc = y1 + (h / 2.0)
    return xc / image_w, yc / image_h, w / image_w, h / image_h


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parsed = ast.literal_eval(value)
    if not isinstance(parsed, list | tuple) or len(parsed) != 4:
        raise ValueError(f"Invalid bbox: {value}")
    return float(parsed[0]), float(parsed[1]), float(parsed[2]), float(parsed[3])


def load_queue(queue_csv: Path) -> list[dict]:
    rows: list[dict] = []
    with queue_csv.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["queue_index"] = len(rows)
            row["priority"] = float(row.get("priority", "0") or 0)
            row["image_id"] = int(row.get("image_id", "0") or 0)
            row["label_line_index"] = int(row.get("label_line_index", "0") or 0)
            row["gt_class_id"] = int(row.get("gt_class_id", "0") or 0)
            row["pred_class_id"] = int(row.get("pred_class_id", "0") or 0)
            row["pred_score"] = float(row.get("pred_score", "0") or 0)
            row["iou"] = float(row.get("iou", "0") or 0)
            row["gt_bbox_xyxy"] = parse_bbox(row["gt_bbox_xyxy"])
            row["pred_bbox_xyxy"] = parse_bbox(row["pred_bbox_xyxy"])
            rows.append(row)
    return rows


def load_decisions(decisions_jsonl: Path) -> dict[int, dict]:
    decisions: dict[int, dict] = {}
    if not decisions_jsonl.exists():
        return decisions
    for line in decisions_jsonl.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        decisions[int(row["queue_index"])] = row
    return decisions


def append_decision(decisions_jsonl: Path, decision: dict) -> None:
    decisions_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with decisions_jsonl.open("a") as f:
        f.write(json.dumps(decision) + "\n")


def print_row(row: dict, decision: dict | None) -> None:
    print(f"queue_index: {row['queue_index']}")
    print(f"issue_type:   {row['issue_type']}")
    print(f"priority:     {row['priority']:.4f}")
    print(f"image_id:     {row['image_id']}")
    print(f"image_path:   {row['image_path']}")
    print(f"label_path:   {row['label_path']}")
    print(f"line_index:   {row['label_line_index']}")
    print(f"label_line:   {row['label_line']}")
    print(f"gt_class:     {row['gt_class_id']} ({row.get('gt_class_name', '')})")
    print(f"pred_class:   {row['pred_class_id']} ({row.get('pred_class_name', '')})")
    print(f"pred_score:   {row['pred_score']:.4f}")
    print(f"iou:          {row['iou']:.4f}")
    print(f"gt_bbox_xyxy: {row['gt_bbox_xyxy']}")
    print(f"pd_bbox_xyxy: {row['pred_bbox_xyxy']}")
    print(f"suggestion:   {row.get('suggested_action', '')}")
    if decision is None:
        print("decision:     <none>")
    else:
        print(f"decision:     {decision['action']} (note={decision.get('note', '')!r})")


def action_to_label_line(
    action: str, row: dict, class_id_override: int | None
) -> str | None:
    if action == "delete_gt":
        return None
    if action == "keep_gt" or action == "note_only":
        return row["label_line"]

    new_class = row["gt_class_id"]
    if action in {"use_pred_class", "use_pred_class_box"}:
        new_class = row["pred_class_id"]
    if class_id_override is not None:
        new_class = class_id_override

    if action in {"use_pred_box", "use_pred_class_box"}:
        with Image.open(Path(row["image_path"])) as im:
            image_w, image_h = im.size
        xc, yc, w, h = xyxy_to_yolo(row["pred_bbox_xyxy"], image_w=image_w, image_h=image_h)
    else:
        _, xc, yc, w, h = row["label_line"].split()
        xc, yc, w, h = float(xc), float(yc), float(w), float(h)

    return f"{int(new_class)} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}"


def cmd_next(args: argparse.Namespace) -> None:
    queue = load_queue(args.queue_csv)
    decisions = load_decisions(args.decisions_jsonl)
    for row in queue:
        if row["queue_index"] in decisions:
            continue
        print_row(row, None)
        return
    print("No unresolved queue rows.")


def cmd_show(args: argparse.Namespace) -> None:
    queue = load_queue(args.queue_csv)
    decisions = load_decisions(args.decisions_jsonl)
    if args.index < 0 or args.index >= len(queue):
        raise IndexError(f"index out of range: {args.index}")
    row = queue[args.index]
    print_row(row, decisions.get(args.index))


def cmd_decide(args: argparse.Namespace) -> None:
    queue = load_queue(args.queue_csv)
    if args.index < 0 or args.index >= len(queue):
        raise IndexError(f"index out of range: {args.index}")
    decision = {
        "queue_index": int(args.index),
        "action": args.action,
        "note": args.note or "",
    }
    if args.class_id is not None:
        decision["class_id_override"] = int(args.class_id)
    append_decision(args.decisions_jsonl, decision)
    print("Decision saved.")
    print_row(queue[args.index], decision)


def cmd_stats(args: argparse.Namespace) -> None:
    queue = load_queue(args.queue_csv)
    decisions = load_decisions(args.decisions_jsonl)
    by_action: dict[str, int] = defaultdict(int)
    for row in decisions.values():
        by_action[str(row["action"])] += 1
    print(f"queue_size:   {len(queue)}")
    print(f"resolved:     {len(decisions)}")
    print(f"unresolved:   {len(queue) - len(decisions)}")
    for action, count in sorted(by_action.items()):
        print(f"  {action}: {count}")


def cmd_apply(args: argparse.Namespace) -> None:
    queue = load_queue(args.queue_csv)
    decisions = load_decisions(args.decisions_jsonl)
    by_label: dict[str, list[tuple[int, str | None]]] = defaultdict(list)

    for idx, decision in decisions.items():
        row = queue[idx]
        action = str(decision["action"])
        class_id_override = decision.get("class_id_override")
        new_line = action_to_label_line(action, row, class_id_override)
        by_label[row["label_path"]].append((int(row["label_line_index"]), new_line))

    modified_files = 0
    for label_path, edits in by_label.items():
        path = Path(label_path)
        if not path.exists():
            continue
        lines = path.read_text().splitlines()
        for line_idx, new_line in sorted(edits, key=lambda x: x[0], reverse=True):
            if line_idx < 0 or line_idx >= len(lines):
                continue
            if new_line is None:
                del lines[line_idx]
            else:
                lines[line_idx] = new_line
        if args.dry_run:
            print(f"[dry-run] would update {path}")
            continue
        backup = path.with_suffix(path.suffix + ".bak")
        if args.make_backup and not backup.exists():
            backup.write_text(path.read_text())
        path.write_text("\n".join(lines) + ("\n" if lines else ""))
        modified_files += 1

    if args.dry_run:
        print(f"[dry-run] files affected: {len(by_label)}")
    else:
        print(f"Updated label files: {modified_files}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Annotate and apply decisions from label review queue.")
    parser.add_argument(
        "--queue-csv",
        type=Path,
        default=Path("sweep_results/label_review_queue.csv"),
        help="Queue CSV generated by build_label_review_queue.py",
    )
    parser.add_argument(
        "--decisions-jsonl",
        type=Path,
        default=Path("sweep_results/label_review_decisions.jsonl"),
        help="Decision log file (append-only).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("next", help="Show next unresolved queue row.")

    show_p = sub.add_parser("show", help="Show a specific queue row.")
    show_p.add_argument("--index", type=int, required=True)

    decide_p = sub.add_parser("decide", help="Record a decision for a queue row.")
    decide_p.add_argument("--index", type=int, required=True)
    decide_p.add_argument(
        "--action",
        required=True,
        choices=[
            "keep_gt",
            "use_pred_class",
            "use_pred_box",
            "use_pred_class_box",
            "delete_gt",
            "note_only",
        ],
    )
    decide_p.add_argument("--class-id", type=int, default=None, help="Override class ID for class-changing actions.")
    decide_p.add_argument("--note", default="", help="Optional free-text note.")

    sub.add_parser("stats", help="Show annotation progress stats.")

    apply_p = sub.add_parser("apply", help="Apply all recorded decisions to label files.")
    apply_p.add_argument("--dry-run", action="store_true")
    apply_p.add_argument("--make-backup", action="store_true")

    args = parser.parse_args()
    if args.cmd == "next":
        cmd_next(args)
    elif args.cmd == "show":
        cmd_show(args)
    elif args.cmd == "decide":
        cmd_decide(args)
    elif args.cmd == "stats":
        cmd_stats(args)
    elif args.cmd == "apply":
        cmd_apply(args)


if __name__ == "__main__":
    main()
