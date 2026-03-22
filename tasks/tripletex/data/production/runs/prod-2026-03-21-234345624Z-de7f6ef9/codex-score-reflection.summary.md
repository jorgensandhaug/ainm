# Score-Aware Reflection

## Task Attribution

- **Run ID:** prod-2026-03-21-234345624Z-de7f6ef9
- **Task ID:** 02 (Create Customer)
- **Tier:** T1 (max score 2)
- **Prompt:** Create the customer Windmill Ltd with organization number 884659876. The address is Parkveien 124, 7010 Trondheim. Email: post@windmill.no.

## Correctness Verdict

**Perfect.** Score 8/8, correctness 1.0, normalized_score 2/2. All 7 checks passed. The final Tripletex state exactly matched what was required.

## Efficiency Verdict

**Optimal.** The run used exactly 1 API call (`POST /customer`) with 0 errors, which is the proven theoretical minimum for this task shape. The leaderboard best_score for task 02 was already 2 before this run (from 24 prior attempts), and this run achieved the same maximum score of 2. The `total_attempts` incremented from 24 to 25, confirming this run was counted.

No wasted calls, no retries, no avoidable 4xx errors. The normalized score of 2 equals the tier maximum, meaning this run was scored at the best possible level for a T1 task.

## Likely Root Cause

No root cause analysis needed — the run was flawless. Correctness = 1.0, efficiency = optimal (1 call, 0 errors), score = maximum possible (2/2).

## What Went Right

1. **Trusted standard matched exactly.** The agent correctly identified the task as an exact match for `./trusted-standards/create-customer.md` and followed it without deviation.
2. **Single-call execution.** One `POST /customer` with the minimal payload (`name`, `organizationNumber`, `email`, `postalAddress`). No pre-reads, no follow-up GETs.
3. **Correct payload mapping.** All prompt fields mapped to the right API fields: street → `postalAddress.addressLine1`, postal code → `postalAddress.postalCode`, city → `postalAddress.city`.
4. **No invented fields.** No `physicalAddress`, no `invoiceEmail`, no `invoiceSendMethod` — only what the prompt specified.
5. **Response reuse.** Verified all scored fields directly from the `201` response body without any additional API calls.
6. **Fast execution.** Total duration ~29 seconds including scoring overhead.

## What To Change Next Time

Nothing. This run represents the optimal execution path for the create-customer task shape. The trusted standard is proven stable across 17+ consecutive production runs in 7 languages (en/nb/nn/es/fr/de/pt). The next agent should continue to follow the same pattern:

1. Read `./trusted-standards/create-customer.md`
2. Confirm exact match
3. Execute single `POST /customer` with only prompt-specified fields
4. Verify from `response.value`
5. Stop
