# Score-Aware Reflection

## Task Attribution

- **Run ID:** prod-2026-03-21-223252659Z-849e049c
- **Attributed task:** T02 (create-customer)
- **Task tier:** T1 (max score 2)
- **Prompt language:** French
- **Prompt:** Create customer Montagne SARL, org 931564153, Kirkegata 19 4611 Kristiansand, post@montagne.no

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, normalized_score = 2/2 (full marks for T1).

All 7 checks passed. No missing or incorrect fields.

## Efficiency Verdict

**Optimal.** 1 API call, 0 errors, 0 wasted calls.

- Leaderboard before: T02 best_score = 2 (20 attempts)
- Leaderboard after: T02 best_score = 2 (21 attempts — this run)
- This run matched the existing best score at 2/2, which is the theoretical maximum for T1.
- The single `POST /customer` is the minimum possible call count for this task shape. No efficiency gap exists.

## Likely Root Cause

No issues. The run was both correct and maximally efficient. The trusted standard was an exact match and was executed without deviation.

## What Went Right

1. **Trusted standard recognition was immediate.** The agent read `trusted-standards/create-customer.md` first, recognized the exact-match conditions (single Norwegian customer, one address, one email, no special delivery), and proceeded directly to the write.
2. **No OpenAPI exploration.** The trusted standard explicitly says to skip `./openapi.json` for exact matches, and the agent obeyed.
3. **No pre-reads or post-reads.** Zero unnecessary GETs — the `201` response body was trusted for verification.
4. **Correct field mapping from French prompt.** `E-mail :` → `email`, `numéro d'organisation` → `organizationNumber`, `L'adresse` → `postalAddress`. No `invoiceEmail`, no `physicalAddress`, no speculative fields.
5. **Minimal payload.** Only `name`, `organizationNumber`, `email`, `postalAddress` — exactly what the prompt asked for.
6. **Unicode preserved.** No transliteration of the company name or address.

## What To Change Next Time

Nothing needs to change for this task shape. The create-customer path is fully optimized at 1 call / 0 errors and has now been confirmed 10 times in production across 6 languages (nb, nn, en, es, fr, pt, de). The trusted standard and playbook are comprehensive and accurate.

The only marginal improvement would be reducing agent thinking time (i.e., reading the trusted standard faster), but the API call path itself is already at the theoretical minimum.
