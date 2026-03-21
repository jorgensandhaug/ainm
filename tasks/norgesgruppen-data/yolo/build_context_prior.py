from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def parse_classes(label_path: Path) -> list[int]:
    out: list[int] = []
    for line in label_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(int(float(line.split()[0])))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build class co-occurrence prior from YOLO labels.")
    parser.add_argument("--yolo-root", type=Path, default=Path("data/yolo"))
    parser.add_argument("--output-json", type=Path, default=Path("data/context/class_cooccurrence.json"))
    parser.add_argument("--num-classes", type=int, default=356)
    parser.add_argument("--smoothing", type=float, default=1.0)
    args = parser.parse_args()

    label_dirs = [args.yolo_root / "train" / "labels", args.yolo_root / "val" / "labels"]
    co = np.full((args.num_classes, args.num_classes), float(args.smoothing), dtype=np.float32)
    seen_images = 0

    for d in label_dirs:
        if not d.exists():
            continue
        for lp in sorted(d.glob("*.txt")):
            classes = sorted(set(parse_classes(lp)))
            if not classes:
                continue
            seen_images += 1
            for a in classes:
                if a < 0 or a >= args.num_classes:
                    continue
                for b in classes:
                    if b < 0 or b >= args.num_classes:
                        continue
                    co[a, b] += 1.0

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "num_classes": args.num_classes,
        "images_used": seen_images,
        "smoothing": args.smoothing,
        "cooccurrence": co.tolist(),
    }
    args.output_json.write_text(json.dumps(payload))
    print(f"Wrote context prior to {args.output_json} (images={seen_images}, classes={args.num_classes})")


if __name__ == "__main__":
    main()
