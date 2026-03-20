#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from eval_norgesgruppen_crop_rankings import evaluate_rankings
from norgesgruppen_crop_benchmark_common import load_crop_eval_context, normalize_relative_path
from norgesgruppen_prep_common import ROOT, write_json
from norgesgruppen_retrieval_backends import build_backend, compute_query_crop_box


def build_gallery_specs(gallery_entries: list[dict[str, object]]) -> list[dict[str, object]]:
    specs = []
    for entry in gallery_entries:
        specs.append(
            {
                "spec_id": f"gallery::{normalize_relative_path(entry['path'])}",
                "source_path": Path(entry["path"]),
                "crop_box": None,
            }
        )
    return specs


def build_query_specs(query_rows: list[dict[str, object]], padding_px: int, padding_frac: float) -> list[dict[str, object]]:
    specs = []
    for row in query_rows:
        specs.append(
            {
                "spec_id": f"query::{row['annotation_id']}",
                "source_path": ROOT / row["image_file"],
                "crop_box": compute_query_crop_box(row, padding_px=padding_px, padding_frac=padding_frac),
                "annotation_id": row["annotation_id"],
            }
        )
    return specs


def slug_fragment(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]+", "-", value).strip("-").lower()


def load_or_compute_embeddings(
    backend,
    specs: list[dict[str, object]],
    cache_path: Path,
    label: str,
):
    if cache_path.exists():
        print(f"[run] loading {label} cache {normalize_relative_path(cache_path)}")
        return backend.load_embeddings_cache(cache_path)
    print(f"[run] computing {label} embeddings")
    embeddings = backend.embed_specs(specs)
    backend.save_embeddings_cache(cache_path, embeddings)
    print(f"[run] wrote {label} cache {normalize_relative_path(cache_path)}")
    return embeddings


def run_retrieval(
    backend_name: str,
    model_id: str | None,
    output_dir: Path,
    gallery_mode: str,
    device: str,
    batch_size: int,
    padding_px: int,
    padding_frac: float,
    limit_queries: int | None,
    experiment_id: str | None,
    label: str | None,
    skip_eval: bool,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = artifacts_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    crop_eval_context = load_crop_eval_context(gallery_mode=gallery_mode)
    full_gallery_entries = crop_eval_context["slice_defs"]["full"]["gallery_entries"]
    query_rows = crop_eval_context["gt_rows"]
    if limit_queries is not None:
        query_rows = query_rows[:limit_queries]
    if limit_queries is not None and not skip_eval:
        raise ValueError("--limit-queries requires --skip-eval to avoid misleading metrics.")

    gallery_specs = build_gallery_specs(full_gallery_entries)
    query_specs = build_query_specs(query_rows, padding_px=padding_px, padding_frac=padding_frac)

    backend = build_backend(
        backend_name=backend_name,
        model_id=model_id,
        device=device,
        batch_size=batch_size,
    )
    model_fragment = slug_fragment(backend.model_id or "none")
    gallery_cache_path = cache_dir / f"gallery-{backend_name}-{model_fragment}-{gallery_mode}.cache"
    query_scope = f"first-{limit_queries}" if limit_queries is not None else "all"
    query_cache_path = cache_dir / (
        f"queries-{backend_name}-{model_fragment}-{gallery_mode}-padpx{padding_px}-padfrac{padding_frac}-{query_scope}.cache"
    )

    print(f"[run] backend={backend_name} model_id={backend.model_id} device={backend.resolved_device()}")
    print(f"[run] gallery_specs={len(gallery_specs)} query_specs={len(query_specs)}")
    gallery_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=gallery_specs,
        cache_path=gallery_cache_path,
        label="gallery",
    )
    query_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=query_specs,
        cache_path=query_cache_path,
        label="query",
    )

    gallery_entries_with_spec_ids = []
    for entry in full_gallery_entries:
        gallery_entries_with_spec_ids.append(
            {
                **entry,
                "spec_id": f"gallery::{normalize_relative_path(entry['path'])}",
            }
        )

    rankings_rows = []
    for index, query_row in enumerate(query_rows, start=1):
        query_spec_id = f"query::{query_row['annotation_id']}"
        ranked_category_ids = backend.rank_categories(
            query_embedding=query_embeddings[query_spec_id],
            gallery_embeddings=gallery_embeddings,
            gallery_entries=gallery_entries_with_spec_ids,
        )
        rankings_rows.append(
            {
                "annotation_id": query_row["annotation_id"],
                "ranked_category_ids": ranked_category_ids,
            }
        )
        if index % 250 == 0 or index == len(query_rows):
            print(f"[run] ranked {index}/{len(query_rows)} queries")

    run_manifest = {
        "experiment_id": experiment_id,
        "label": label or backend_name,
        "backend": backend_name,
        "model_id": backend.model_id,
        "gallery_mode": gallery_mode,
        "padding_px": padding_px,
        "padding_frac": padding_frac,
        "backend_details": backend.describe(),
        "gallery_cache_path": normalize_relative_path(gallery_cache_path),
        "query_cache_path": normalize_relative_path(query_cache_path),
        "query_count": len(query_rows),
        "gallery_image_count": len(full_gallery_entries),
        "gallery_category_count": len({entry["category_id"] for entry in full_gallery_entries}),
        "rankings": rankings_rows,
    }
    rankings_path = output_dir / "artifacts" / "rankings.json"
    write_json(rankings_path, run_manifest)
    write_json(
        artifacts_dir / "gallery-full.json",
        [
            {
                "category_id": entry["category_id"],
                "category_name": entry["category_name"],
                "product_code": entry["product_code"],
                "path": normalize_relative_path(entry["path"]),
                "source": entry["source"],
            }
            for entry in full_gallery_entries
        ],
    )
    write_json(
        artifacts_dir / "run-manifest.json",
        {
            key: value
            for key, value in run_manifest.items()
            if key != "rankings"
        },
    )

    if skip_eval:
        return run_manifest

    print("[run] evaluating rankings")
    evaluate_rankings(
        rankings_path=rankings_path,
        output_dir=output_dir,
        gallery_mode=gallery_mode,
        label=label or backend_name,
        experiment_id=experiment_id,
        model_name=backend.model_id,
    )
    return run_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Run GT-crop retrieval and score it on the fixed NorgesGruppen crop surface.")
    parser.add_argument("--backend", choices=["hash_debug", "pe_core_openclip", "dinov3_timm", "dinov3_transformers"], required=True)
    parser.add_argument("--model-id", default=None)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--gallery-mode", choices=["representative", "all"], default="representative")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--padding-px", type=int, default=0)
    parser.add_argument("--padding-frac", type=float, default=0.0)
    parser.add_argument("--limit-queries", type=int, default=None)
    parser.add_argument("--experiment-id", default=None)
    parser.add_argument("--label", default=None)
    parser.add_argument("--skip-eval", action="store_true")
    args = parser.parse_args()

    result = run_retrieval(
        backend_name=args.backend,
        model_id=args.model_id,
        output_dir=args.output_dir,
        gallery_mode=args.gallery_mode,
        device=args.device,
        batch_size=args.batch_size,
        padding_px=args.padding_px,
        padding_frac=args.padding_frac,
        limit_queries=args.limit_queries,
        experiment_id=args.experiment_id,
        label=args.label,
        skip_eval=args.skip_eval,
    )
    print(json.dumps({key: value for key, value in result.items() if key != "rankings"}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
