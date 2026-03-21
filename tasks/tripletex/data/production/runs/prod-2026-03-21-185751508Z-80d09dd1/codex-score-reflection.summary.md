# Score-Aware Reflection

## Task Attribution
- **tx_task_id**: 04 (T1 tier, max normalized_score = 2)
- **Prompt**: Register the supplier Silveroak Ltd with organization number 889586605. Email: faktura@silveroakltd.no.
- **Inference status**: `unique_attempt_delta` — clean, unambiguous attribution
- **Attempt**: 19th attempt on task 04

## Correctness Verdict
**Perfect.** correctness = 1.0, score_raw = 6/6, all 4/4 checks passed. normalized_score = 2 (T1 maximum). The supplier was created with the correct name, organizationNumber, email, and invoiceEmail fields.

## Efficiency Verdict
**Optimal.** 1 API call (`POST /supplier` → 201), 0 errors, 0 wasted reads. The run achieved normalized_score = 2, which matches the leaderboard best_score of 2 for task 04. This is the theoretical ceiling — there is no higher score achievable and no fewer calls possible (1 write is the floor for creating an entity).

Leaderboard delta: best_score stayed at 2 (already at max before this run). total_attempts incremented 18 → 19. This run tied the best — it cannot do better.

## Likely Root Cause
No issues to diagnose. The run executed the proven one-call `POST /supplier` path with mirrored `invoiceEmail` for the `faktura@` address. This is the 6th consecutive perfect score on the create-supplier trusted standard.

## What Went Right
1. **Exact trusted-standard match recognized immediately** — the agent identified the create-supplier shape and used the playbook's one-call path without hesitation.
2. **Mirrored invoiceEmail** — `faktura@silveroakltd.no` was correctly mapped to both `email` and `invoiceEmail`, which is required for perfect scoring on `faktura@` addresses.
3. **No pre-reads, no post-reads** — zero unnecessary GET calls. The 201 response body contained all scored fields.
4. **No 4xx errors** — clean execution, no retries.
5. **URL construction** — used safe string interpolation (`${BASE}/supplier`) instead of `new URL()`, avoiding the `/v2` path-drop pitfall.
6. **Fast execution** — 32 seconds total including scoring delay.

## What To Change Next Time
Nothing substantive. This task shape is fully converged. For future create-supplier runs:

1. **Read `trusted-standards/create-supplier.md` directly** instead of `task-playbooks/create-supplier.md`. The agent read the playbook in this run, which happened to contain the same info, but AGENTS.md mandates trusted standards first. Reading the trusted standard directly saves one glob + one file read.
2. **Don't attempt to read full AGENTS.md** — it exceeds the 10k token Read limit. For exact trusted-standard matches, the trusted standard alone is sufficient.
3. **Maintain the exact payload shape**: `{ name, organizationNumber, email, invoiceEmail }` with `invoiceEmail` mirroring `email` when the address is `faktura@`-prefixed.
