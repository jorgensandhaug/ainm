# Score-Aware Reflection

## Task Attribution
- **Attributed task**: T14 (create-customer-invoice-credit-note) — inferred from leaderboard diff showing T14 attempt_delta=1, with `last_attempt_after` at `22:19:32.746838` matching this run's completion at `22:19:31Z`
- **Inference status**: ambiguous (2 candidates: T14 and T19), but T14 timing alignment is near-exact
- **Task tier**: T2 (max score 4)
- The completed submission at `22:19:32.746838` shows `score_raw=8, score_max=8, normalized_score=4`, 5/5 checks passed

## Correctness Verdict
**Perfect.** correctness = 1.0 (8/8 raw score). All 5 checks passed. The credit note was correctly created for Nordlicht GmbH / 912435113 / "Webdesign" / 40550 NOK.

## Efficiency Verdict
**Optimal.** normalized_score = 4 = T2 max. The run used exactly 2 API calls with 0 errors — matching the theoretical minimum for this task shape (locate invoice + create credit note). The best_score for T14 was already 4 before this run and remained at 4 — this run tied the best, which is the ceiling.

No wasted calls. No 4xx errors. No retries. No unnecessary reads or verification calls.

## Likely Root Cause
N/A — nothing went wrong. The run achieved a perfect score on both correctness and efficiency axes.

## What Went Right
1. **Immediate trusted-standard recognition**: The German prompt ("Gutschrift", "Rechnung", "reklamiert") was correctly mapped to the `create-customer-invoice-credit-note` trusted standard
2. **Read-before-write discipline**: The agent read the trusted standard `.md` file before writing any script, following AGENTS.md rules
3. **Minimal-call execution**: Exactly 2 API calls — one `GET /invoice?...` to locate, one `PUT /invoice/{id}/:createCreditNote` to create
4. **Zero errors**: No 4xx responses, no retries, no ambiguity resolution needed
5. **Correct filtering**: Properly excluded `isCreditNote=true` and `isCredited=true` invoices in the locate step
6. **Correct parameters**: `date=2026-03-21`, `sendToCustomer=false` — matching the standard exactly
7. **No wasted verification**: Trusted the write response (`isCreditNote=true`, `creditedInvoice` linkage) instead of making a follow-up GET

## What To Change Next Time
Nothing — this run is the template for how all credit note tasks should execute. The two-call path is proven across 12+ production runs spanning Norwegian, English, French, German, and Nynorsk prompts. Continue using the exact same approach.

The only hypothetical improvement would be reducing to 1 call if the prompt ever provides the exact invoice ID directly — but that prompt shape hasn't appeared in production yet.
