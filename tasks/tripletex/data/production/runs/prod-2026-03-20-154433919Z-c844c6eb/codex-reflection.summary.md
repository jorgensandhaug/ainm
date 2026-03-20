## 1. Task

Post-run learning pass for the blocked production task: create an unsent customer invoice for `Floresta Lda` (`919172657`) with three existing-product lines and explicit mixed VAT (`25%`, `15%`, `0%`), then update the Tripletex standards/playbooks accordingly.

## 2. Reflection

What went well:
- The production run stopped immediately after the first decisive API call returned `403 {"error":"Invalid or expired token"}`.
- No wasted production-side fallback calls were spent after credentials were proven unusable.

What went poorly:
- My original implementation logic was proof-oriented, not fully score-oriented: it included an automatic post-create `GET /invoice/{id}` verification step that would have been unnecessary on a valid create-only run if the write response already returned decisive totals.
- I built a full invoice script before confirming credentials. That did not cost extra API calls here, but it did encode a non-minimal default verification habit.

Correct approach:
- On valid credentials, use the minimal create path and stop after `POST /invoice?sendToCustomer=false` when the payload already fixed the line fields and the write response proves totals.
- Reserve `GET /invoice/{id}` for cases where the write response omits decisive totals or later logic truly needs readback-only line details.

## 3. Call Efficiency

Production run minimal-call or not:
- Minimal-call for the blocked-credentials case.

Wasted calls in the actual production run:
- None. One call was realistically necessary because the host/token looked real.
- The first call, `GET /customer?organizationNumber=919172657&fields=*`, returned the credential-blocking `403`.

Exact lower-call path the next agent should use on valid credentials:
1. `GET /customer?organizationNumber=919172657&fields=*`
2. `GET /product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
4. `POST /invoice?sendToCustomer=false`

Stop after step 4 if:
- the payload explicitly set each line’s `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType`
- the write response returns decisive totals matching the intended invoice outcome

Conditional branches only if needed:
- If product lookup is partial: `GET /product?ids=...`, then final fallback `GET /product?count=1000&fields=*`
- If invoice create fails with missing company bank account: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> retry the same `POST /invoice` once
- Do not add `GET /invoice/{id}` by default

## 4. Root Causes

- Root production blocker: unusable session token, proven by first-call `403`.
- Secondary doc issue: the existing invoice playbook still leaned too hard toward immediate readback after create; that is safe for proof, but not minimal for create-only scoring.
- Sandbox limitation: this persistent sandbox account exposes only `0%` filtered `OUTGOING` VAT, so exact mixed `25/15/0` replay is blocked there.

## 5. Sandbox Verification

Sandbox credentials used only.

Findings:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT `id=6`, `0%`.
- Spot checks on `2022-03-20`, `2023-03-20`, `2024-03-20`, `2025-03-20`, and `2026-03-19` also returned only VAT `6`.
- I created or resolved the exact task identifiers in sandbox:
  - customer `Floresta Lda` / `919172657` -> `id=108247681`
  - product `4783` -> `id=84386893`
  - product `3343` -> `id=84386894`
  - product `4380` -> `id=84386895`
- `GET /product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*` returned all three products, but each product `vatType` was still sparse (`id`/`url` only).
- `POST /invoice?sendToCustomer=false` succeeded for a 0% proof invoice:
  - invoice `id=2147530780`, `invoiceNumber=37`
  - write response had sparse `orderLines`
  - write response also had decisive totals: `amountExcludingVatCurrency=54700`, `amountCurrency=54700`
- Immediate `GET /invoice/{id}` confirmed exact readback line details, but was not needed for the minimal create-only path.
- No bank-account repair branch was needed in this sandbox run.

## 6. Playbook Changes

Updated existing files; created no new files; `AGENTS.md` unchanged.

Changed paths:
- [trusted-standards/create-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/create-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md)

What changed:
- Documented that sparse `POST /invoice` `orderLines` do not justify an automatic `GET /invoice/{id}` when write-response totals already prove the outcome.
- Promoted the 4-call exact-VAT create path as the canonical winning path.
- Kept `GET /invoice/{id}` as a conditional proof/readback step only.
- Recorded this exact production run’s credential block.
- Added the new sandbox re-verification with the exact customer/product identifiers and the persistent `0%`-only VAT constraint.

## 7. Commit

- Commit: `cbf94f97eebd56b90b64b1051a9957d08295d466`
- Message: `tripletex playbook: tighten create-customer-invoice call path`

## 8. Reusable Heuristics

- If the first decisive call returns `403 {"error":"Invalid or expired token"}`, stop. That run is already minimal for a real-looking credential set.
- For create-only invoice tasks, do not spend `GET /invoice/{id}` by reflex. First ask whether the payload already fixed the scored line fields and whether the write response totals already prove the financial outcome.
- For explicit-VAT invoice tasks with existing products, the default winning path is `GET customer -> GET product -> GET filtered outgoing VAT -> POST invoice`.
- Product search may return `vatType` only as `id`/`url`; that is not enough to prove explicit VAT percentages.
- Never substitute VAT ids from the broader unfiltered catalog when filtered `OUTGOING` does not expose the requested percentage.
- If filtered `OUTGOING` omits a requested VAT percentage, the task is blocked in that account; do not burn writes on guessed VAT codes.
- Keep bank-account repair strictly conditional on the known validation error; never pre-read `/ledger/account` on invoice create flows.