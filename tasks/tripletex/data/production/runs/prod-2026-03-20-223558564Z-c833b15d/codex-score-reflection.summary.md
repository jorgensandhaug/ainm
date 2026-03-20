# Task Attribution

`task-attribution.json` did not contain a resolved `tx_task_id`; `inference_status` stayed `ambiguous`.

Local evidence still makes the likely attribution clear:

- `leaderboard.diff.json` shows only task `02` and task `03` changed
- historical local run artifacts map create-customer prompts to `tx_task_id = "02"` and create-product prompts to `tx_task_id = "03"`
- this prompt was an exact create-customer task
- the task `02` leaderboard timestamp `2026-03-20T22:36:25.582496+00:00` exactly matches submission `b60b151c-8eaa-4d36-a73e-a4ffad3a933a` in `submissions.after.json`

Likely attributed task id: `02`.

# Correctness Verdict

Correctness was perfect.

Evidence:

- the matched submission shows `score_raw = 8`, `score_max = 8`
- feedback says `7/7 checks passed`
- `normalized_score = 2`

So this was not a wrong-state run. The final Tripletex state matched the task.

# Efficiency Verdict

No efficiency problem is visible.

- likely attributed task: `02`
- leaderboard best for task `02` before run: `2`
- leaderboard best for task `02` after run: `2`
- matched submission `normalized_score`: `2`

The run matched the task leaderboard best, so there is no score-based sign of wasted API calls, retries, or avoidable 4xxs.

# Likely Root Cause

There was no task-execution failure. The only ambiguity was in score attribution plumbing, not in the Tripletex work itself.

`submission-score.json` stayed ambiguous because multiple submissions completed in the same polling window. The run itself still appears clean:

- prior reflection already identified a one-call path
- `codex-trace.readable.md` shows one trusted-standard read, one script write, and one `bun` execution
- the production response returned the exact created customer `id=108284978`
- no 4xx branch, retry, or follow-up GET appears in the trace

# What Went Right

- The run recognized an exact trusted-standard match and did not re-open `openapi.json`.
- It mapped the French prompt correctly to the standard customer payload: `name`, `email`, `organizationNumber`, `postalAddress`.
- It preserved the prompt fields exactly, including the address and email.
- It used the lowest realistic API path: one `POST /customer`.
- It reused the write response as proof and avoided unnecessary verification reads.
- The resulting submission achieved full correctness and matched the leaderboard best for the task.

# What To Change Next Time

- Change nothing in the Tripletex execution path for this task shape. Keep the exact one-call branch.
- Continue treating create-customer prompts with ordinary Norwegian fields as task `02`, even when prompt prose is French.
- Do not add duplicate-check reads, post-create reads, or speculative invoice/delivery fields.
- For score follow-up, prefer resolving ambiguous submission windows by combining:
  - leaderboard diff timestamps
  - local historical task-to-prompt mapping
  - check-count pattern from `submissions.after.json`

For this exact run shape, the next agent should make the same API decision again: one `POST /customer`, then stop.