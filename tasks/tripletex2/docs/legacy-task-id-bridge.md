# Legacy Tripletex1 Task-ID Bridge

Purpose: map legacy `tx_task_id` attribution into stable `tripletex2` task ids without pretending the old evidence is cleaner than it is.

## Legacy evidence surfaces used

- `../tripletex/src/main.ts`
  - Confirms the legacy attribution algorithm and the meaning of `unique_attempt_delta`, `ambiguous`, `metadata_changed`, and `no_change_detected`.
- `../tripletex/data/production/runs/*/task-attribution.json`
  - Primary per-run source for `tx_task_id` and `inference_status`.
- `../tripletex/data/prompt-task-labels.jsonl`
  - Append-only ledger of attributed `tx_task_id` values across runs.
- `../tripletex/data/production/runs/*/scripts/*.ts`
  - Sanity-check surface for what the run actually tried to do.
- `../tripletex/data/production/runs/*/manifest.json`
  - Confirms which script directory belongs to each run.

## Bridge module

See `src/registry/legacy-tripletex1-task-bridge.ts`.

The module provides:

- a canonical task registry seed with stable semantic `tripletex2` task ids,
- an explicit bridge table from legacy `tx_task_id` to canonical task id,
- a `bridgeLegacyTripletex1TaskAttribution(...)` helper that returns `RunAttributionInfo`-shaped output for future ingest.

## Registry seeding status

The canonical registry seed is broader than the currently implemented task folders on purpose.

- Canonical tasks that do not yet have a real `src/tasks/task-.../` implementation are still registered in `tripletex2` as explicit placeholders.
- Placeholder entries publish only stable identity, summary, and provenance notes. They use `implementationStatus: "placeholder"` and intentionally do not expose fake strategies or fabricated extraction schemas.
- Only tasks with `implementationStatus !== "placeholder"` are required to appear in `configs/active-strategies.json`.

## Provenance rules

- The bridge maps task identity only. It does not invent legacy strategy identity.
- `tx_task_id` `05` remains unmapped because no checked-in uniquely attributed run identifies it.
- Legacy ids `04`, `09`, and `17` are mapped with only `medium` confidence because the checked-in prompt/task ledger contains semantic outliers for those ids.
- `metadata_changed`, `ambiguous`, and `no_change_detected` legacy outcomes are preserved as low-confidence or unmatched attribution states rather than upgraded to fake certainty.

## Future ingest expectation

When a legacy ingest step reads `task-attribution.json` or `prompt-task-labels.jsonl`, it should:

1. pass `tx_task_id` plus `inference_status` into `bridgeLegacyTripletex1TaskAttribution(...)`,
2. copy the returned canonical task id only when the bridge result is mapped,
3. preserve the returned attribution confidence and evidence notes in the canonical run artifact.
