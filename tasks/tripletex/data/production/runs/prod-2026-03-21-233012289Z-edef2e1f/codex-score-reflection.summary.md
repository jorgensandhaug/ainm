# Score-Aware Reflection

## Task Attribution
- **Task ID**: T04 (create-supplier)
- **Tier**: T1 (max score 2)
- **Run ID**: prod-2026-03-21-233012289Z-edef2e1f
- **Prompt**: French — "Enregistrez le fournisseur Colline SARL avec le numéro d'organisation 915612865. E-mail : faktura@collinesarl.no."

## Correctness Verdict
**PERFECT** — correctness = 1.0, score_raw = 6/6, all 4/4 checks passed, normalized_score = 2/2.

The final Tripletex state was exactly correct. All scored fields (name, organizationNumber, email, invoiceEmail) were set correctly via a single POST.

## Efficiency Verdict
**OPTIMAL** — 1 API call, 0 errors, 0 wasted calls.

- `normalized_score`: 2 (maximum for T1)
- `best_score` before run: 2; after run: 2 — the run matched the existing best
- The theoretical minimum for this task shape is 1 call (POST /supplier). The agent achieved exactly this.
- No pre-reads, no post-reads, no retries, no 4xx errors.

## Likely Root Cause
No issues to diagnose. The run was both correct and maximally efficient.

## What Went Right
1. **Exact trusted-standard match**: Agent immediately recognized the task as `create-supplier` and read `trusted-standards/create-supplier.md` before writing any code.
2. **`faktura@` mirroring**: Correctly identified the invoice-looking email and mirrored it to both `email` and `invoiceEmail`.
3. **No wasted reads**: No pre-read on `/supplier`, no post-read on `/supplier/{id}`, no spec lookup beyond the trusted standard.
4. **Language independence**: French prompt handled identically to English/Spanish/Portuguese/Norwegian — no extra reads or spec checks added for non-English prompts.
5. **URL construction**: Used string interpolation (`${BASE}/supplier`) instead of `new URL()`, avoiding the `/v2` path-dropping pitfall.
6. **Immediate stop**: Verified from the 201 response body and stopped — no superfluous follow-up calls.

## What To Change Next Time
Nothing. This is the 12th run on this exact standard path (11th in the production score history, plus this score confirmation). The one-call mirrored-email path is the proven optimal approach for this task shape. The trusted standard and playbook are complete and correct.

Maintain the current approach:
- 1 × `POST /supplier` with `{ name, organizationNumber, email, invoiceEmail }`
- Verify from 201 response
- Stop
