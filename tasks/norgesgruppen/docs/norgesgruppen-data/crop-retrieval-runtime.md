# Crop Retrieval Runtime

This is the practical runtime surface for `EXP-0003` and `EXP-0004`.

## Current Reality

The system Python in this repo currently has no ML stack:

- no `torch`
- no `Pillow`
- no `numpy`
- no `transformers`
- no `open_clip`

Do not assume model experiments run in the base shell.

Use a dedicated uv-managed env.

## Recommended Local Env

CPU-safe bootstrap:

```bash
./scripts/setup_norgesgruppen_crop_env.sh --venv .venv-crop
```

If running on a CUDA host, replace the last install line with the official CUDA wheel index you actually need.

Example:

```bash
./scripts/setup_norgesgruppen_crop_env.sh --venv .venv-crop --cuda-index-url https://download.pytorch.org/whl/cu124
```

Then run commands as:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh ...
```

## Canonical Runner

Use [run_norgesgruppen_crop_retrieval.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/run_norgesgruppen_crop_retrieval.py).

It does:

- fixed GT-crop query set
- fixed gallery policy
- ranked category predictions by `annotation_id`
- writes `artifacts/rankings.json`
- evaluates immediately on the frozen crop surface unless `--skip-eval`

## Verified Local Status

Already verified on this machine:

- [setup_norgesgruppen_crop_env.sh](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/setup_norgesgruppen_crop_env.sh) created `.venv-crop`
- [run_norgesgruppen_crop_python.sh](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/run_norgesgruppen_crop_python.sh) fixes the NixOS `libstdc++.so.6` issue for wheel-based PyTorch
- `PE-Core` 1-query smoke succeeded:
  - [run-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0003-crop-pe-core/artifacts/pe-core-smoke/artifacts/run-manifest.json)
- public `timm` DINOv3 1-query smoke succeeded:
  - [run-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0004-crop-dinov3/artifacts/dinov3-timm-smoke/artifacts/run-manifest.json)
- `dinov3_transformers` with `facebook/dinov3-vits16-pretrain-lvd1689m` failed here with HF gated-access `401`

## Sanity Command

No ML env needed:

```bash
PYTHONPATH=scripts python scripts/run_norgesgruppen_crop_retrieval.py \
  --backend hash_debug \
  --output-dir data/2026-03-19/experiments/EXP-0002-crop-random-and-nearest-neighbor-floor/artifacts/hash-debug-smoke \
  --experiment-id EXP-0002 \
  --label hash_debug_smoke \
  --limit-queries 32 \
  --skip-eval
```

This proves the runner/backends/path wiring boots cleanly.

For a real full hash baseline, rerun without `--limit-queries` and without `--skip-eval`.

## `PE-Core`

Official model source used here:

- `hf-hub:timm/PE-Core-B-16`

Run shape:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/run_norgesgruppen_crop_retrieval.py \
  --backend pe_core_openclip \
  --model-id hf-hub:timm/PE-Core-B-16 \
  --output-dir data/2026-03-19/experiments/EXP-0003-crop-pe-core \
  --experiment-id EXP-0003 \
  --label pe_core_b16
```

## `DINOv3`

Recommended first practical public checkpoint here:

- `convnext_large.dinov3_lvd1689m`

Run shape:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/run_norgesgruppen_crop_retrieval.py \
  --backend dinov3_timm \
  --model-id convnext_large.dinov3_lvd1689m \
  --output-dir data/2026-03-19/experiments/EXP-0004-crop-dinov3 \
  --experiment-id EXP-0004 \
  --label dinov3_convnext_large
```

If you intentionally use Meta's transformer checkpoints via `dinov3_transformers`, expect HF access / license gating on some repos.

## Promotion Read

Always compare against:

- [REP-0001-baseline-validation-and-crop-floor.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0001-baseline-validation-and-crop-floor.md)
- [DEC-0002-freeze-crop-retrieval-eval-contract.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md)

Strict slice first. Then extended. Then full.
