# Tripletex2 Dataset Layout

This repository now contains a local, reproducible snapshot of the Tripletex production run material from `/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs`.

## Current Snapshot

- 18 source runs were imported into `data/raw/runs/`.
- 12 runs include `scripts/`, Codex trace artifacts, and reflection artifacts.
- 6 runs contain only the base request/manifest/prompt launcher files.
- `manifest.attachments` is empty for every imported run.
- `request.json.files` is empty for every imported run.
- All 18 prompts are unique by SHA-256 over normalized prompt text, so no curated examples were dropped.

## Layout

```text
data/
  raw/
    runs/<run_id>/...          # copied source run directories, preserved verbatim
  curated/
    examples.jsonl             # one normalized example row per imported run
    request_dataset_v1/        # optional request-only curation output if generated separately
  manifests/
    raw-runs.jsonl             # one manifest row per imported run
    dataset-summary.json       # snapshot-level counts and dedupe policy
  attachments/
    attachment-manifest.json   # copied attachment inventory
    README.md                  # current attachment status
  request_training_dataset/    # optional request-focused derived dataset if generated separately
```

`data/raw/runs/` is the provenance-preserving layer. It keeps the original source filenames, including `request.json`, `manifest.json`, prompt files, launch scripts, and any trace/reflection artifacts present in the source run.

`data/curated/examples.jsonl` is the fast-experimentation layer. Each row contains:

- `example_id` and `source_run_id`
- `created_at`
- the prompt text
- `prompt_sha256`
- booleans for scripts, trace bundle, and reflection bundle
- the discovered script filenames for that run

`data/manifests/raw-runs.jsonl` is the bridge between the raw copy and the curated rows. It records the raw run path, file inventory summary, and prompt hash for each imported run.

`data/attachments/` is reserved for material referenced through `manifest.attachments` or `request.files`. The current snapshot has zero copied items, but the directory and manifest are present so future imports do not need a layout change.

Other request-only derived outputs may coexist under `data/`, including `data/curated/request_dataset_v1/` and `data/request_training_dataset/`. Those are separate from the raw import snapshot and are not rewritten by `dataset_tool.py`.

## Provenance And Safety Notes

- The importer copies from the sibling `tripletex` task and does not mutate the source runs.
- Raw manifests preserve source metadata such as the original absolute `run_dir` recorded by the producer.
- Imported `request.json` files already contain `session_token: "REDACTED"` in the current snapshot.
- The source prompts are multilingual. The raw layer preserves them exactly as captured.

## Dedupe Expectations

- Never dedupe `data/raw/runs/`. Raw imports should remain one directory per source `run_id`.
- Dedupe only at the curated layer, and only intentionally.
- When deduping curated examples in the future, keep explicit provenance by storing all contributing `source_run_id` values.
- The current `examples.jsonl` intentionally keeps all 18 runs because the prompt hashes are unique.

## Regeneration

Run these commands from `/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex2`:

```bash
python3 scripts/dataset_tool.py sync
python3 scripts/dataset_tool.py stats
python3 scripts/dataset_tool.py validate
```

`sync` rewrites only the files managed by `dataset_tool.py`:

- `data/raw/runs/`
- `data/curated/examples.jsonl`
- `data/manifests/raw-runs.jsonl`
- `data/manifests/dataset-summary.json`
- generated attachment copies and manifests under `data/attachments/`

It does not clear unrelated derived artifacts such as `data/curated/request_dataset_v1/`.
