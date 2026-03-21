# Score-Aware Reflection: Create Supplier — Rivière SARL

## Task Attribution
- **Run ID**: prod-2026-03-21-164423778Z-c52aeb71
- **Task ID**: 04 (T1 — max score 2)
- **Prompt**: Enregistrez le fournisseur Rivière SARL avec le numéro d'organisation 853420409. E-mail : faktura@riviresarl.no.
- **Task shape**: simple supplier create with name, org number, and invoice-looking email

## Correctness Verdict
**PERFECT** — correctness = 1.0, 4/4 checks passed, score_raw = 6/6, normalized_score = 2/2.

All scored fields were correct in the final Tripletex state. The mirrored `invoiceEmail` pattern continues to produce perfect scores for `faktura@...` emails.

## Efficiency Verdict
**OPTIMAL** — the run achieved the maximum normalized score of 2, matching the existing leaderboard best for task 04 (best_score = 2 before, unchanged after). This means the run was at least as efficient as every prior attempt.

- API calls made: 1 (POST /supplier)
- 4xx errors: 0
- Retries: 0
- Pre-reads: 0
- Follow-up reads: 0
- Theoretical minimum: 1 call

No call could be removed. The run hit the absolute floor.

## Likely Root Cause
No deficiency to diagnose. The run executed the exact trusted-standard path: one POST with `{name, organizationNumber, email, invoiceEmail}`, verified from the 201 response, and stopped.

## What Went Right
1. **Instant pattern recognition** — recognized the French prompt as the exact create-supplier trusted-standard shape without wasting time on spec lookups or playbook deep-reads.
2. **Email mirroring** — correctly mirrored `faktura@riviresarl.no` into both `email` and `invoiceEmail`, which is the proven pattern for perfect scoring on `faktura@` addresses.
3. **Unicode preservation** — `Rivière SARL` with the `è` character was sent and returned correctly without any encoding workarounds.
4. **URL construction** — used template literal `${BASE}/supplier` instead of `new URL()`, avoiding the known `/v2` path-drop pitfall.
5. **Zero unnecessary calls** — no pre-read, no follow-up GET, no duplicate check. Trusted the 201 response body.
6. **Fast execution** — 30.8s total duration including scoring pipeline latency.

## What To Change Next Time
**Nothing.** This run is the reference execution for the create-supplier task shape. The exact same approach should be repeated:

1. Match the trusted standard at `./trusted-standards/create-supplier.md`
2. Skip `openapi.json` and playbook deep-reads
3. POST `/supplier` with `{name, organizationNumber, email, invoiceEmail}` (mirror when `faktura@`)
4. Verify from response.value
5. Stop

This is the 4th consecutive perfect-score production run for this task shape (after Silveroak Ltd, Northwave Ltd, Cascade SARL, Sierra SL, and now Rivière SARL). The pattern is fully stabilized.
