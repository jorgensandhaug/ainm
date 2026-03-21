from __future__ import annotations

import argparse
import ast
import csv
import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image


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
            row["priority"] = float(row.get("priority", "0") or 0.0)
            row["image_id"] = int(row.get("image_id", "0") or 0)
            row["label_line_index"] = int(row.get("label_line_index", "0") or 0)
            row["gt_class_id"] = int(row.get("gt_class_id", "0") or 0)
            row["pred_class_id"] = int(row.get("pred_class_id", "0") or 0)
            row["pred_score"] = float(row.get("pred_score", "0") or 0.0)
            row["iou"] = float(row.get("iou", "0") or 0.0)
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
        entry = json.loads(line)
        decisions[int(entry["queue_index"])] = entry
    return decisions


def save_decisions(decisions_jsonl: Path, decisions: dict[int, dict]) -> None:
    decisions_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with decisions_jsonl.open("w") as f:
        for idx in sorted(decisions):
            f.write(json.dumps(decisions[idx]) + "\n")


def draw_row(ax: plt.Axes, row: dict, decision: dict | None, resolved: int, total: int) -> None:
    image_path = Path(row["image_path"])
    with Image.open(image_path) as im:
        image = im.convert("RGB")
        ax.imshow(image)
    ax.set_axis_off()

    gx1, gy1, gx2, gy2 = row["gt_bbox_xyxy"]
    px1, py1, px2, py2 = row["pred_bbox_xyxy"]
    ax.add_patch(
        Rectangle((gx1, gy1), gx2 - gx1, gy2 - gy1, fill=False, edgecolor="#00c853", linewidth=2.0)
    )
    ax.add_patch(
        Rectangle((px1, py1), px2 - px1, py2 - py1, fill=False, edgecolor="#ff1744", linewidth=2.0)
    )

    gt_txt = f"GT {row['gt_class_id']}: {row.get('gt_class_name', '')}".strip()
    pd_txt = f"PRED {row['pred_class_id']}: {row.get('pred_class_name', '')}".strip()
    ax.text(gx1, max(0, gy1 - 8), gt_txt, color="#00c853", fontsize=9, weight="bold")
    ax.text(px1, py2 + 14, pd_txt, color="#ff1744", fontsize=9, weight="bold")

    status = "unresolved"
    if decision is not None:
        status = f"resolved: {decision['action']}"
    title = (
        f"idx={row['queue_index']} | {status} | {resolved}/{total} resolved\n"
        f"type={row['issue_type']} priority={row['priority']:.3f} iou={row['iou']:.3f} score={row['pred_score']:.3f}\n"
        f"image_id={row['image_id']} label_line_index={row['label_line_index']}"
    )
    ax.set_title(title, fontsize=10)


def main() -> None:
    parser = argparse.ArgumentParser(description="Visual annotation helper for label review queue.")
    parser.add_argument("--queue-csv", type=Path, default=Path("sweep_results/label_review_queue.csv"))
    parser.add_argument(
        "--decisions-jsonl",
        type=Path,
        default=Path("sweep_results/label_review_decisions.jsonl"),
    )
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--show-only-unresolved", action="store_true")
    args = parser.parse_args()

    queue = load_queue(args.queue_csv)
    if not queue:
        raise RuntimeError(f"No rows found in queue CSV: {args.queue_csv}")
    decisions = load_decisions(args.decisions_jsonl)

    index = max(0, min(args.start_index, len(queue) - 1))

    if args.show_only_unresolved:
        unresolved = [r["queue_index"] for r in queue if r["queue_index"] not in decisions]
        if not unresolved:
            print("No unresolved rows.")
            return
        index = unresolved[0]

    fig, ax = plt.subplots(figsize=(14, 9))
    plt.subplots_adjust(bottom=0.16)

    help_text = (
        "Keys: [n] next, [p] prev, [u] next unresolved, [1] keep_gt, [2] use_pred_class, "
        "[3] use_pred_box, [4] use_pred_class_box, [5] delete_gt, [0] note_only, [r] clear decision, [q] quit"
    )
    fig.text(0.01, 0.02, help_text, fontsize=9)

    def refresh() -> None:
        ax.clear()
        row = queue[index]
        decision = decisions.get(index)
        draw_row(ax, row=row, decision=decision, resolved=len(decisions), total=len(queue))
        fig.canvas.draw_idle()
        print(
            f"[idx={index}] type={row['issue_type']} gt={row['gt_class_id']} pred={row['pred_class_id']} "
            f"iou={row['iou']:.3f} score={row['pred_score']:.3f} decision={decision['action'] if decision else 'none'}"
        )

    def jump_next_unresolved() -> None:
        nonlocal index
        for i in range(index + 1, len(queue)):
            if i not in decisions:
                index = i
                return
        for i in range(0, index + 1):
            if i not in decisions:
                index = i
                return

    def on_key(event) -> None:  # type: ignore[no-untyped-def]
        nonlocal index
        if event.key == "n":
            index = min(len(queue) - 1, index + 1)
        elif event.key == "p":
            index = max(0, index - 1)
        elif event.key == "u":
            jump_next_unresolved()
        elif event.key == "1":
            decisions[index] = {"queue_index": index, "action": "keep_gt", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "2":
            decisions[index] = {"queue_index": index, "action": "use_pred_class", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "3":
            decisions[index] = {"queue_index": index, "action": "use_pred_box", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "4":
            decisions[index] = {"queue_index": index, "action": "use_pred_class_box", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "5":
            decisions[index] = {"queue_index": index, "action": "delete_gt", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "0":
            decisions[index] = {"queue_index": index, "action": "note_only", "note": ""}
            save_decisions(args.decisions_jsonl, decisions)
            jump_next_unresolved()
        elif event.key == "r":
            decisions.pop(index, None)
            save_decisions(args.decisions_jsonl, decisions)
        elif event.key == "q":
            plt.close(fig)
            return
        refresh()

    fig.canvas.mpl_connect("key_press_event", on_key)
    refresh()
    plt.show()
    print(f"Saved decisions to: {args.decisions_jsonl}")
    print(f"Resolved: {len(decisions)} / {len(queue)}")


if __name__ == "__main__":
    main()
