# Tripletex2 Run Log Spec

## Purpose

This document freezes the canonical experiment evidence format for `tripletex2`.

The source of truth for research history is append-only, git-friendly JSON run artifacts. We do not use SQLite or any other mutable database as the canonical store.

Derived reports can be regenerated. Run evidence must remain durable, inspectable, and safe to commit.

## Source of truth vs derived state

### Source of truth

The canonical research record is the set of immutable run artifact JSON files committed to git.

Each run artifact captures exactly one concrete execution attempt.

### Derived state

Anything that can be recomputed from run artifacts is derived state. Examples:

- current best-known strategy per task,
- solved vs unsolved task lists,
- score frontiers,
- strategy leaderboards,
- markdown summaries,
- local databases or caches.

Derived state may be deleted and rebuilt.

## Why not SQLite as canonical state

SQLite is fine for local querying, but not as the main git-tracked experiment source when multiple machines may write in parallel.

A binary `.db` file is poor at:

- readable diffs,
- merge conflict resolution,
- partial review,
- append-only collaboration.

JSON artifacts are much better for auditability and git hygiene.

## Artifact location

Runs should live in a dedicated append-only tree.

Recommended shape:

```text
runs/
  2026-03-20/
    run-2026-03-20T18-43-10Z-task07-direct-create.json
    run-2026-03-20T19-02-44Z-task12-lookup-then-create.json
  2026-03-21/
    ...
```

The date partition keeps the folder manageable while preserving a simple flat mental model.

## One run = one canonical JSON file

Each run artifact represents exactly one concrete strategy execution against one concrete submission or replay.

Never append multiple unrelated runs into one artifact file.

The canonical state is one sanitized JSON run artifact per run. Optional sidecars may exist, but they are not a second source of truth.

## Canonical file plus optional sanitized sidecars

The model is:

- one canonical JSON run artifact for comparison, reporting, and durable history,
- zero or more optional sanitized sidecar files for deeper debugging or learning.

Good sidecar candidates:

- sanitized execution trace,
- sanitized reflection summary,
- sanitized attribution evidence snapshot,
- sanitized evaluation evidence snapshot,
- sanitized generated strategy script.

Bad sidecars:

- raw credentials,
- raw prompt files containing tokens or secrets,
- raw request bodies with live tokens,
- raw unsafe traces,
- raw attachment blobs unless a future spec explicitly allows a sanitized variant.

## Immutability rules

Run artifacts are append-only in practice.

Allowed post-write changes:

- redaction of accidentally committed secrets,
- repair of obvious corruption,
- explicit enrichment of the `attribution`, `evaluation`, or `sidecars` sections.

Not allowed:

- rewriting history to make an old strategy look better,
- mutating the core execution record after the fact,
- silently editing API call traces.

The initial write should include all fields known at execution time. Later updates may only fill in the enrichment sections listed above.

## Frozen schema version

The canonical artifact schema version is:

```text
tripletex2.run-artifact.v1
```

Every canonical run file must include:

- `schemaVersion` with the exact literal value above,
- a single top-level JSON object,
- stable field names as defined below.

All timestamps must be ISO 8601 UTC strings.

## Canonical run artifact schema

The implementation target is the following shape:

```ts
interface RunArtifactV1 {
  schemaVersion: "tripletex2.run-artifact.v1";
  runId: string;
  createdAt: string;
  mode: "competition" | "sandbox" | "replay" | "dry-run";
  task: RunTaskInfo;
  strategy: RunStrategyInfo;
  selection: RunSelectionInfo;
  request: RunRequestInfo;
  input: RunInputInfo;
  execution: RunExecutionInfo;
  attribution?: RunAttributionInfo;
  evaluation?: RunEvaluationInfo;
  sidecars?: RunSidecarRef[];
  analysis?: RunAnalysisInfo;
}
```

### Run identity

- `schemaVersion`: required literal string `tripletex2.run-artifact.v1`.
- `runId`: required globally unique run identifier.
- `createdAt`: required artifact creation timestamp.
- `mode`: required run mode. Allowed values:
  - `competition`
  - `sandbox`
  - `replay`
  - `dry-run`

### Task identity

```ts
interface RunTaskInfo {
  taskId: string;
  taskName?: string;
  taskConfidence?: "high" | "medium" | "low";
  taskSource:
    | "llm-classifier"
    | "manual-label"
    | "replay-label"
    | "request-label";
}
```

Rules:

- `task.taskId` is the declared task routed by the runtime.
- `task.taskConfidence` uses the same coarse scale as classifier contracts.
- `task.taskSource` records how the runtime decided the task before execution.

### Strategy identity

```ts
interface RunStrategyInfo {
  strategyId: string;
  strategyName?: string;
  strategyPath: string;
  strategyStatus: "draft" | "active" | "retired" | "superseded" | "baseline";
}
```

Rules:

- `strategy.strategyId` is the primary strategy identity recorded in run history.
- A materially different implementation must get a new `strategyId`.
- Git commit hashes and file hashes are intentionally not required canonical fields.

### Selection context

```ts
interface RunSelectionInfo {
  selectionConfigId: string;
  selectionConfigPath: string;
  requestedTaskId?: string;
}
```

Rules:

- `requestedTaskId` is for replay, manual test targeting, or other predeclared overrides.

### Sanitized request context

```ts
interface RunRequestInfo {
  requestFingerprint: string;
  promptText?: string;
  promptSummary?: string;
  files: RunRequestFile[];
  credentialSource?: string;
}

interface RunRequestFile {
  fileName: string;
  mediaType?: string;
  byteSize?: number;
  sha256?: string;
  extractedFacts?: string[];
}
```

Rules:

- `request.requestFingerprint` is required and should be stable for the sanitized request payload.
- `promptText` is allowed only when it is already sanitized and safe to commit.
- `promptSummary` should be used when the full prompt text is omitted.
- `files` contains metadata only, never raw binary file contents.
- `credentialSource` may describe where credentials came from, but never includes the credentials themselves.

### Extracted structured input

```ts
interface RunInputInfo {
  inputSchemaId: string;
  status: "resolved" | "ambiguous" | "failed";
  source: "llm-extractor" | "manual" | "replay" | "fixture";
  confidence?: "high" | "medium" | "low";
  value?: Record<string, unknown>;
  partialValue?: Record<string, unknown>;
  issues?: RunInputIssue[];
}

interface RunInputIssue {
  code:
    | "ambiguous-task"
    | "no-task-match"
    | "missing-required-field"
    | "ambiguous-field-value"
    | "conflicting-field-values"
    | "invalid-field-value"
    | "unreadable-file"
    | "unsupported-request";
  message: string;
  field?: string;
}
```

Rules:

- `inputSchemaId` is required.
- `status` is required and records whether extraction fully resolved.
- `value` is required when `status` is `resolved`.
- `partialValue` may be used when extraction was ambiguous or failed.
- `issues` should be present for `ambiguous` or `failed` extraction outcomes.

This is part of the experiment record. A strategy failure caused by bad extraction still needs a precise input section.

### Execution trace

```ts
interface RunExecutionInfo {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  deadlineMs?: number;
  runtimeStatus: "not-run" | "completed" | "failed" | "timeout" | "aborted";
  apiCallCount: number;
  api4xxCount: number;
  api5xxCount: number;
  apiCalls: RunApiCall[];
  result?: Record<string, unknown>;
  error?: RunExecutionError;
}

interface RunApiCall {
  index: number;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string | number | boolean | null>;
  requestSummary?: string;
  responseSummary?: string;
  status?: number;
  durationMs?: number;
  entityIds?: Record<string, number>;
  errorCode?: string;
}

interface RunExecutionError {
  code: string;
  message: string;
  retryable?: boolean;
}
```

Rules:

- `execution` is always present, even if extraction failed before strategy code ran.
- Use `runtimeStatus: "not-run"` when no strategy execution happened.
- `apiCalls` is ordered and `index` starts at `1`.
- `apiCallCount` must equal `apiCalls.length`.
- `api4xxCount` and `api5xxCount` count HTTP statuses seen in `apiCalls`.
- `durationMs` should be present when both timestamps are present.
- `result` stores the structured strategy result, not a raw trace dump.

The `apiCalls` list is the normalized comparison trace. It must be sanitized and compact.

### Attribution evidence

The declared runtime task in `task.taskId` is not always enough. Legacy `tripletex` preserved evidence for later post-hoc task attribution, and we keep that value here in a compact normalized form.

```ts
interface RunAttributionInfo {
  status: "pending" | "matched" | "ambiguous" | "unmatched" | "not-needed";
  observedAt?: string;
  attributedTaskId?: string;
  source?:
    | "request-label"
    | "classifier"
    | "replay-label"
    | "leaderboard-diff"
    | "submission-score"
    | "manual";
  confidence?: "high" | "medium" | "low";
  taskIdMatchesDeclared?: boolean;
  evidence?: RunAttributionEvidence;
  evidenceSidecarIds?: string[];
}

interface RunAttributionEvidence {
  leaderboardBeforeFingerprint?: string;
  leaderboardAfterFingerprint?: string;
  leaderboardDiffFingerprint?: string;
  submissionScoreFingerprint?: string;
  matchedSubmissionId?: string;
  notes?: string[];
}
```

Rules:

- `attribution` is optional because some runs do not need a later attribution pass.
- `attributedTaskId` is the post-hoc task inferred from evidence, which may differ from `task.taskId`.
- `taskIdMatchesDeclared` should be set when later evidence confirms or contradicts the declared task.
- `evidenceSidecarIds` must refer to entries in the top-level `sidecars` array.

### Evaluation and scoring evidence

Competition scoring may be known immediately or later. The artifact must support both without making a second canonical file.

```ts
interface RunEvaluationInfo {
  status: "pending" | "scored" | "estimated" | "not-available";
  observedAt?: string;
  source?:
    | "competition-ui"
    | "submission-score"
    | "manual"
    | "local-estimate"
    | "replay";
  scoreTotal?: number;
  correctnessScore?: number;
  tier?: number;
  taskSolved?: boolean;
  efficiencyNotes?: string[];
  rawNotes?: string[];
  evidence?: RunEvaluationEvidence;
  evidenceSidecarIds?: string[];
}

interface RunEvaluationEvidence {
  submissionId?: string;
  leaderboardEntryFingerprint?: string;
  submissionScoreFingerprint?: string;
  notes?: string[];
}
```

Rules:

- `evaluation.status` is required when the block exists.
- `scoreTotal`, `correctnessScore`, `tier`, and `taskSolved` are optional because not every scoring source returns all of them.
- `evidence` stores compact normalized proof of how the score was inferred.
- `evidenceSidecarIds` must refer to entries in the top-level `sidecars` array.

### Sidecar references

Sidecars are optional. They are never required to understand the canonical outcome, but they can preserve useful forensic detail.

```ts
interface RunSidecarRef {
  sidecarId: string;
  kind:
    | "sanitized-trace"
    | "reflection-summary"
    | "attribution-evidence"
    | "evaluation-evidence"
    | "generated-script";
  path: string;
  mediaType: "application/json" | "text/markdown" | "text/plain";
  createdAt: string;
  sha256?: string;
  summary?: string;
}
```

Rules:

- `path` is relative to the canonical run artifact file's directory.
- `sidecarId` must be unique within the run.
- `sha256` is recommended for integrity when a sidecar exists.
- `summary` should stay short and comparison-friendly.

### Analysis notes

```ts
interface RunAnalysisInfo {
  notes?: string[];
  hypothesisCheck?: "supported" | "mixed" | "unsupported";
  failureMode?: string;
  nextIdea?: string;
}
```

This block is optional and intentionally compact.

## Sanitized sidecar file model

Optional sidecar files use their own shared envelope:

```ts
interface RunSidecarFileV1<TPayload = unknown> {
  schemaVersion: "tripletex2.run-sidecar.v1";
  runId: string;
  sidecarId: string;
  kind:
    | "sanitized-trace"
    | "reflection-summary"
    | "attribution-evidence"
    | "evaluation-evidence"
    | "generated-script";
  createdAt: string;
  payload: TPayload;
}
```

The sidecar file itself must remain sanitized. The top-level run artifact links to it through `sidecars[]`.

Minimum payload expectations by `kind`:

- `sanitized-trace`: a compact ordered trace entry list safe to commit.
- `reflection-summary`: a short summary, findings, and next ideas.
- `attribution-evidence`: sanitized attribution snapshots or diffs plus a short conclusion.
- `evaluation-evidence`: sanitized scoring evidence plus a short conclusion.
- `generated-script`: sanitized generated script text or a sanitized script summary.

Sidecars may be JSON, Markdown, or plain text depending on `mediaType`, but the file must always remain sanitized.

## Minimal JSON example

```json
{
  "schemaVersion": "tripletex2.run-artifact.v1",
  "runId": "run-2026-03-20T18-43-10Z-task07-direct-create",
  "createdAt": "2026-03-20T18:43:10Z",
  "mode": "competition",
  "task": {
    "taskId": "task07",
    "taskName": "create-customer",
    "taskConfidence": "high",
    "taskSource": "llm-classifier"
  },
  "strategy": {
    "strategyId": "t07_s01",
    "strategyName": "Direct customer create",
    "strategyPath": "src/tasks/task-07-create-customer/strategies/direct-create.ts",
    "strategyStatus": "active"
  },
  "selection": {
    "selectionConfigId": "active-strategies-2026-03-20-a",
    "selectionConfigPath": "configs/active-strategies.json"
  },
  "request": {
    "requestFingerprint": "req:0dcb9dc5",
    "promptText": "Create customer Solmar SL with org number 967736430.",
    "files": []
  },
  "input": {
    "inputSchemaId": "task07.v1",
    "status": "resolved",
    "source": "llm-extractor",
    "confidence": "high",
    "value": {
      "customerName": "Solmar SL",
      "organizationNumber": "967736430"
    }
  },
  "execution": {
    "startedAt": "2026-03-20T18:43:11Z",
    "completedAt": "2026-03-20T18:43:13Z",
    "durationMs": 1823,
    "deadlineMs": 300000,
    "runtimeStatus": "completed",
    "apiCallCount": 1,
    "api4xxCount": 0,
    "api5xxCount": 0,
    "apiCalls": [
      {
        "index": 1,
        "method": "POST",
        "path": "/customer",
        "requestSummary": "create customer",
        "responseSummary": "customer id 1234",
        "status": 200,
        "entityIds": {
          "customerId": 1234
        }
      }
    ],
    "result": {
      "createdEntityIds": {
        "customerId": 1234
      }
    }
  },
  "attribution": {
    "status": "matched",
    "observedAt": "2026-03-20T18:50:00Z",
    "attributedTaskId": "task07",
    "source": "leaderboard-diff",
    "confidence": "high",
    "taskIdMatchesDeclared": true,
    "evidence": {
      "leaderboardBeforeFingerprint": "lb:before:ad5b",
      "leaderboardAfterFingerprint": "lb:after:62fd",
      "leaderboardDiffFingerprint": "lb:diff:c2f1"
    },
    "evidenceSidecarIds": ["attrib-1"]
  },
  "evaluation": {
    "status": "scored",
    "observedAt": "2026-03-20T18:50:00Z",
    "source": "competition-ui",
    "scoreTotal": 2,
    "correctnessScore": 1,
    "tier": 2,
    "taskSolved": true,
    "evidence": {
      "submissionId": "submission-48392",
      "leaderboardEntryFingerprint": "score:entry:c44f"
    },
    "evidenceSidecarIds": ["score-1"]
  },
  "sidecars": [
    {
      "sidecarId": "attrib-1",
      "kind": "attribution-evidence",
      "path": "run-2026-03-20T18-43-10Z-task07-direct-create.attribution.json",
      "mediaType": "application/json",
      "createdAt": "2026-03-20T18:50:00Z",
      "sha256": "sha256:3ab1...",
      "summary": "Sanitized leaderboard diff snapshot."
    },
    {
      "sidecarId": "score-1",
      "kind": "evaluation-evidence",
      "path": "run-2026-03-20T18-43-10Z-task07-direct-create.evaluation.json",
      "mediaType": "application/json",
      "createdAt": "2026-03-20T18:50:00Z",
      "sha256": "sha256:18af...",
      "summary": "Sanitized score evidence."
    }
  ],
  "analysis": {
    "notes": ["Direct create appears sufficient."],
    "hypothesisCheck": "supported",
    "nextIdea": "Try the same logic with fewer redundant payload fields."
  }
}
```

## Sanitization rules

The artifact format must be safe to commit.

Never store:

- live session tokens,
- raw Basic Auth headers,
- secret API keys,
- raw prompt files with secrets or tokens,
- raw request payloads with unsafe credentials,
- raw unsafe traces,
- full binary attachment contents.

If prompt or file context is relevant, prefer storing:

- sanitized prompt text,
- prompt summary,
- filename,
- MIME type,
- byte size,
- content hash,
- extracted facts,
- compact sanitized evidence fingerprints.

## Derived reports

From the run artifacts we should generate machine-readable summaries such as:

- `reports/task-status.json`
- `reports/best-strategies.json`
- `reports/strategy-comparison.json`
- `reports/open-tasks.json`
- `reports/task-frontiers/task07.json`

Human-readable derived summaries are also fine when they are regenerated from the same canonical artifacts, for example:

- `reports/strategy-comparison.md`

These are derived outputs and should not be hand-edited.

## Queryability without a database

Even without SQLite, the artifact design should support useful scripting.

That means:

- stable field names,
- stable file placement,
- one-run-per-file simplicity,
- no hidden conventions,
- clean JSON suitable for `jq` and TypeScript scripts.

## Acceptance test

If a future session wants to answer:

> Show me all Task 5 runs, grouped by strategy, sorted by score then API calls.

then a simple script over the canonical run artifacts should be enough.

If that feels painful, the artifact format is still under-specified.
