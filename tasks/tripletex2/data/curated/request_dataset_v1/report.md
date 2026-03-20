# Tripletex Request Dataset Curation Report

## Summary
- Input root: `/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs`
- Output root: `/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex2/data/curated/request_dataset_v1`
- Source runs scanned: `18`
- Curated examples written: `18`
- Total attached files across sources: `0`
- Duplicate groups: `0`
- Duplicate source runs: `0`
- Dataset fingerprint: `8626384ccc2df93fd267ef2708846d02f87f87737d5cd88eaa300c178053d2a3`

## Dedupe Strategy
- Exclude request-level credentials and all run-specific execution artifacts from the fingerprint.
- Normalize prompt text with Unicode NFKC, LF-only newlines, trailing-whitespace trimming, and outer trimming.
- Normalize attachment metadata conservatively and fingerprint attachment bytes with SHA-256 while preserving file order.
- Apply exact-duplicate dedupe only after the conservative normalization above; no near-duplicate pruning is applied.

## Result
- No duplicate groups were found in the current production corpus.
- Stable example ids are derived from the curated request fingerprint (`ttxreq_<sha256-prefix>`).
- `examples.jsonl` contains one representative record per unique fingerprint plus full source provenance.
- `source_index.jsonl` maps every scanned production run to its curated example id.
