# tripletex2

This workspace materializes a request-only training dataset from legacy Tripletex production runs.

Use `scripts/ingest_request_dataset.py` to regenerate `data/request_training_dataset` from the source corpus at `/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs`.

The ingestion boundary is strict:
- Import `request.json` prompt data.
- Import safe run metadata from `manifest.json`.
- Redact Tripletex credentials from the stored request JSON.
- Copy request-side attachments when they exist.
- Exclude response-side traces, reflections, generated scripts, launch wrappers, and derived prompts.
