# Score Reflection — prod-2026-03-21-222127818Z-3034fea4

## Task Attribution

**Task: T04 (create supplier)** — T1 tier, max score 2.

Attribution confirmed by matching T04 `last_attempt_after` timestamp (22:22:06.287692) to submission `d189ae02` `completed_at` (22:22:06.287692). T04 attempts incremented 20→21 in this batch. The `inference_status: "ambiguous"` was a capture-timing artifact (3 of 4 batch submissions were still processing); the T04 submission had already completed and scored.

Prompt: "Registre el proveedor Dorada SL con número de organización 958363060. Correo electrónico: faktura@doradasl.no." (Spanish)

## Correctness Verdict

**Perfect.** score_raw=6, score_max=6, normalized_score=2 (tier max), 4/4 checks passed.

All scored fields correct:
- name: Dorada SL
- organizationNumber: 958363060
- email: faktura@doradasl.no
- invoiceEmail: faktura@doradasl.no (mirrored from faktura@ pattern)

## Efficiency Verdict

**Optimal.** 1 API call, 0 errors. This is the theoretical minimum for this task shape — a single `POST /supplier` with no pre-reads or post-reads.

- best_score before: 2 (already at tier max)
- best_score after: 2 (maintained)
- No wasted calls. No 4xx errors. No retries.

The normalized_score=2 equals the tier max, confirming both correctness and efficiency bonuses were achieved.

## Likely Root Cause

No issues. The run was flawless. This is the 7th scored run (out of 8 total production runs) using this exact 1-POST-mirrored-email path to achieve a perfect score on T04. The one non-perfect run (Fossekraft AS) was blocked by an invalid/expired proxy token before any API call was made.

## What Went Right

1. **Trusted standard followed exactly.** Read `create-supplier.md` first, identified the exact-match shape, wrote and executed in one step.
2. **faktura@ email mirroring.** Correctly mirrored `faktura@doradasl.no` to both `email` and `invoiceEmail` in the same POST — this is required for 4/4 checks.
3. **Zero unnecessary calls.** No pre-read of `/supplier`, no post-read of `/supplier/{id}`, no spec checks. Straight to the single POST.
4. **URL construction correct.** Used template literal `${BASE}/supplier` avoiding the `new URL()` trap that can drop `/v2`.
5. **Language-agnostic execution.** Spanish prompt handled identically to nb/en/fr — no extra reads or spec checks for non-English.

## What To Change Next Time

**Nothing.** This task shape is fully solved and the trusted standard is mature. The agent should continue to:
- Read the trusted standard before writing any script
- Use exactly 1 `POST /supplier` with `{name, organizationNumber, email, invoiceEmail}` for faktura@ emails
- Trust the 201 response body — no follow-up reads
- Not add any address, phone, or other fields not in the prompt

The create-supplier standard has now achieved 7 perfect scores across 5 languages (nb, en, es, fr, nn). No further investigation or changes are warranted for this task shape.
