"""Average weights of multiple YOLO checkpoints (SWA-like)."""
from __future__ import annotations
import argparse
import torch
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--alphas", type=float, nargs="*", default=None,
                        help="Mixing weights (default: equal)")
    args = parser.parse_args()

    checkpoints = [torch.load(str(w), map_location="cpu", weights_only=False) for w in args.weights]

    n = len(checkpoints)
    if args.alphas is None:
        alphas = [1.0 / n] * n
    else:
        total = sum(args.alphas)
        alphas = [a / total for a in args.alphas]

    print(f"Merging {n} checkpoints with weights {alphas}")

    # Use first checkpoint as base
    merged = checkpoints[0]
    state_dict = merged["model"].float().state_dict()

    for key in state_dict:
        state_dict[key] = state_dict[key] * alphas[0]
        for i in range(1, n):
            other_sd = checkpoints[i]["model"].float().state_dict()
            if key in other_sd:
                state_dict[key] = state_dict[key] + other_sd[key] * alphas[i]

    merged["model"].float().load_state_dict(state_dict)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(merged, str(args.out))
    print(f"Saved merged checkpoint to {args.out}")


if __name__ == "__main__":
    main()
