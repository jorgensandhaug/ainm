# Score Reflection — prod-2026-03-21-215943108Z-92322c6b

## Task Attribution

- **Inference status**: ambiguous (candidate_count=2)
- **Leaderboard diff**: task 02 (attempts 16→17, best_score 2→2) and task 18 (attempts 15→16, best_score 4→4)
- **Most likely attributed task**: **02** (create customer) — T1, max score 2
- **Matching submission**: 8/8 raw, normalized_score=2, 7/7 checks passed, duration 36757ms
- The ambiguous attribution is a scoring-system artifact from concurrent runs; the create-customer side effect clearly maps to task 02.

## Correctness Verdict

**PERFECT** — 7/7 checks passed, 8/8 raw score, normalized 2/2 (T1 maximum).

All scored fields were correctly set:
- name: `Porto Alegre Lda`
- organizationNumber: `834147254`
- email: `post@porto.no`
- postalAddress: `Storgata 65, 4611 Kristiansand`

No missing fields, no incorrect mappings, no side-effect errors.

## Efficiency Verdict

**OPTIMAL** — normalized_score 2 equals the T1 maximum of 2, which means both correctness and efficiency bonuses were fully captured.

| Metric | Value |
|--------|-------|
| API calls | 1 |
| 4xx errors | 0 |
| Theoretical minimum calls | 1 |
| Wasted calls | 0 |
| Score achieved | 2/2 (100%) |
| Best score before | 2 |
| Best score after | 2 |

The single `POST /customer` is the absolute floor for this task shape. No pre-reads, no follow-up GETs, no retries.

## Likely Root Cause

No issues. The run was flawless. The score matches the leaderboard best and the task tier maximum.

## What Went Right

1. **Instant trusted-standard match**: The agent recognized the Portuguese-language create-customer prompt as an exact match for `create-customer.md` without hesitation.
2. **Read-before-script discipline**: The trusted standard was read before any TypeScript was written, avoiding undocumented pitfalls.
3. **Minimal payload**: Only `name`, `organizationNumber`, `email`, and `postalAddress` were sent — no speculative `invoiceEmail`, `physicalAddress`, or `invoiceSendMethod`.
4. **Zero verification reads**: The `201` response was trusted as the source of truth for all scored fields.
5. **Language-agnostic execution**: Portuguese prompt prose was correctly treated as irrelevant to the API path — no special handling or extra lookups.
6. **Fast execution**: 36.7s total duration, well within the 300s budget.

## What To Change Next Time

**Nothing.** This run represents the ideal execution of the create-customer task:
- 1 call, 0 errors, 7/7 checks, maximum score
- The trusted standard and playbook are already comprehensive
- The AGENTS.md heuristic now covers all 4 confirmed prompt languages (de, fr, es, pt)

The only systemic observation is that `inference_status: "ambiguous"` with `candidate_count: 2` occurs when concurrent runs create leaderboard changes during the same polling window. This is a scoring-infrastructure artifact, not an agent behavior issue. The agent cannot control this.
