from __future__ import annotations

import argparse
import ast
import csv
import html
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
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


def load_decisions(path: Path) -> dict[int, dict]:
    out: dict[int, dict] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        out[int(row["queue_index"])] = row
    return out


def render_panel(row: dict, out_path: Path, decision: dict | None) -> None:
    image_path = Path(row["image_path"])
    with Image.open(image_path) as im:
        image = im.convert("RGB")
        width, height = image.size

    fig_w = max(8.0, min(16.0, width / 250.0))
    fig_h = max(6.0, min(12.0, height / 250.0))
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=120)
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

    gt_label = f"GT {row['gt_class_id']}: {row.get('gt_class_name', '')}".strip()
    pd_label = f"PRED {row['pred_class_id']}: {row.get('pred_class_name', '')}".strip()
    ax.text(gx1, max(0.0, gy1 - 10), gt_label, color="#00c853", fontsize=9, weight="bold")
    ax.text(px1, min(float(height - 5), py2 + 14), pd_label, color="#ff1744", fontsize=9, weight="bold")

    status = "unresolved" if decision is None else f"resolved:{decision['action']}"
    title = (
        f"idx={row['queue_index']} {status} | type={row['issue_type']} priority={row['priority']:.3f}\n"
        f"iou={row['iou']:.3f} score={row['pred_score']:.3f} image_id={row['image_id']} "
        f"line_idx={row['label_line_index']}"
    )
    ax.set_title(title, fontsize=10)

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)


def build_html_index(rows: list[dict], decisions: dict[int, dict], out_dir: Path, limit: int) -> None:
    html_path = out_dir / "index.html"
    blocks: list[str] = []
    for row in rows[:limit]:
        idx = row["queue_index"]
        png_name = f"idx_{idx:04d}.png"
        decision = decisions.get(idx)
        status = "unresolved" if decision is None else f"resolved: {decision['action']}"
        note = "" if decision is None else html.escape(str(decision.get("note", "")))
        blocks.append(
            f"""
            <div class="card">
              <img src="{html.escape(png_name)}" alt="idx {idx}">
              <div class="meta">
                <div><b>idx</b> {idx} | <b>{html.escape(status)}</b></div>
                <div><b>type</b> {html.escape(row['issue_type'])} | <b>priority</b> {row['priority']:.3f}</div>
                <div><b>gt</b> {row['gt_class_id']} ({html.escape(row.get('gt_class_name', ''))})</div>
                <div><b>pred</b> {row['pred_class_id']} ({html.escape(row.get('pred_class_name', ''))})</div>
                <div><b>iou</b> {row['iou']:.3f} | <b>score</b> {row['pred_score']:.3f}</div>
                <div><b>image</b> {html.escape(row['image_path'])}</div>
                <div><b>label</b> {html.escape(row['label_path'])} @ line {row['label_line_index']}</div>
                <div><b>label_line</b> <code>{html.escape(row['label_line'])}</code></div>
                <div><b>suggested_action</b> {html.escape(row.get('suggested_action', ''))}</div>
                <div><b>note</b> {note}</div>
              </div>
            </div>
            """
        )

    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Label Review Panels</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 16px; background: #f4f6f8; }}
    h1 {{ margin: 0 0 8px 0; }}
    .hint {{ margin-bottom: 16px; color: #555; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 14px; }}
    .card {{ background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
    .card img {{ width: 100%; display: block; }}
    .meta {{ padding: 10px 12px; font-size: 13px; line-height: 1.4; }}
    code {{ background: #f0f0f0; padding: 1px 4px; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>Label Review Panels</h1>
  <div class="hint">Review images here, then record decisions with annotate_review_queue.py.</div>
  <div class="grid">
    {''.join(blocks)}
  </div>
</body>
</html>
"""
    html_path.write_text(html_doc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export headless annotated panels for review queue.")
    parser.add_argument("--queue-csv", type=Path, default=Path("sweep_results/label_review_queue.csv"))
    parser.add_argument(
        "--decisions-jsonl",
        type=Path,
        default=Path("sweep_results/label_review_decisions.jsonl"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("sweep_results/review_panels"),
        help="Directory containing PNGs and index.html",
    )
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--only-unresolved", action="store_true")
    args = parser.parse_args()

    rows = load_queue(args.queue_csv)
    decisions = load_decisions(args.decisions_jsonl)
    if args.only_unresolved:
        rows = [r for r in rows if r["queue_index"] not in decisions]

    rows = rows[: args.limit]
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for row in rows:
        idx = row["queue_index"]
        png_path = args.output_dir / f"idx_{idx:04d}.png"
        render_panel(row=row, out_path=png_path, decision=decisions.get(idx))

    build_html_index(rows=rows, decisions=decisions, out_dir=args.output_dir, limit=len(rows))
    print(f"Wrote {len(rows)} panels to: {args.output_dir}")
    print(f"Open HTML index: {args.output_dir / 'index.html'}")


if __name__ == "__main__":
    main()
