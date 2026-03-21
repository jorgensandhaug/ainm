# Score-Aware Reflection

## Task Attribution
- **Attributed task**: T02 (create customer) — T1 tier, max 2 points
- **Inference status**: ambiguous (3 candidates: 02, 19, 26), but timing match confirms task 02: leaderboard diff shows task 02 attempt at 22:28:57, matching submission `51304ad1` completed at 22:28:57
- **Prompt**: "Opprett kunden Nordlys AS med organisasjonsnummer 951285463. Adressa er Parkveien 45, 5003 Bergen. E-post: post@nordlys.no."

## Correctness Verdict
**Perfect.** 8/8 raw score, 7/7 checks passed, normalized_score = 2.0 (T1 maximum).

All scored fields correct: name, organizationNumber, email, postalAddress (addressLine1, postalCode, city). No missing or incorrect side effects.

## Efficiency Verdict
**Optimal.** 1 API call, 0 errors, 0 wasted calls, 35.5s wall time.

- normalized_score = 2.0 = T1 max → full efficiency bonus achieved
- best_score for task 02 was already 2.0 before this run; this run matched it
- 1 call is the theoretical minimum for create-customer (single POST /customer)
- No 4xx errors, no retries, no unnecessary reads

There is no room for improvement on this task shape. The run achieved the ceiling.

## Likely Root Cause
N/A — no failures or inefficiencies to diagnose.

## What Went Right
1. **Instant trusted-standard match**: agent recognized create-customer shape immediately, read `trusted-standards/create-customer.md` before scripting
2. **Minimal payload**: only `name`, `organizationNumber`, `email`, `postalAddress` — no speculative fields like `physicalAddress` or `invoiceEmail`
3. **No pre-read**: no `GET /customer` check before creating
4. **No post-read**: verified from 201 response body, no follow-up `GET /customer/{id}`
5. **No openapi.json consultation**: trusted standard was sufficient, saved time
6. **Unicode preserved**: no transliteration of Norwegian characters
7. **Fast execution**: 35.5s total including queue time

## What To Change Next Time
Nothing. This is the canonical perfect execution for the create-customer task shape:

1. Read `trusted-standards/create-customer.md`
2. Write one script: `POST /customer` with minimal payload
3. Run it
4. Verify from 201 response
5. Stop

This pattern is now confirmed across 10+ production runs (nb, en, de, fr, es, pt) with consistent 7/7 checks, 1 call, 0 errors, normalized_score = 2.0. The trusted standard and playbook are comprehensive and accurate. No documentation changes needed.
