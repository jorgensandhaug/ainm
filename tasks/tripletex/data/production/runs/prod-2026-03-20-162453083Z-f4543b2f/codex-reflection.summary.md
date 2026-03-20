## Task

Post-run reflection for the successful production invoice-create run for `Bølgekraft AS` (`827304212`) with product lines `6744` / `2584` / `3739`, then sandbox investigation, doc updates, and one commit.

## Reflection

What went well:
- Production API flow was correct.
- The run used the right invoice shape: existing customer read, existing product read, filtered outgoing VAT read, direct `POST /invoice?sendToCustomer=false`.
- No wasteful follow-up `GET /invoice/{id}` after a write response that already proved totals.

What went poorly:
- Local verification miscomputed gross total.
- I treated `27000 * 25%` as `7150`; correct VAT is `6750`.
- Correct gross total was `60745`, not `61145`.

Correct approach:
- Accept the successful write response as primary evidence.
- Recheck VAT arithmetic before assuming the API result is wrong.
- Never rerun invoice creation after a successful write just because a local assertion was wrong.

## Call Efficiency

The production run was API-minimal for this exact task shape.

Used path:
1. `GET /customer?organizationNumber=827304212&fields=*`
2. `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
4. `POST /invoice?sendToCustomer=false`

Wasted API calls:
- None.

Lower-call path for the next agent:
- Same 4-call path above.
- Do not replace the exact-number product resolver with `GET /product?count=1000&fields=*` when the prompt clearly gives real product numbers.
- Do not add `GET /ledger/account` unless the first invoice write actually fails with the missing-bank-account validation.
- Do not add `GET /invoice/{id}` unless the write response is too thin to prove scored fields.

## Root Causes

- Arithmetic error after the write: wrong gross-total expectation, not API failure.
- Earlier docs over-generalized parenthetical product refs toward catalog scans; this prompt shape had clear exact product numbers, so direct `productNumber` search was the better first resolver.
- Weak post-write discipline: I should have treated the successful invoice response as authoritative before trusting my own manual total.

## Sandbox Verification

Persistent sandbox used:
- `https://kkpqfuj-amager.tripletex.dev/v2`

What I proved:
- Exact-number resolver works in one call:
  - `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*`
- Exact create-only invoice proof path remains 4 calls after setup:
  1. `GET /customer`
  2. `GET /product?productNumber=...`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
  4. `POST /invoice?sendToCustomer=false`
- `POST /invoice` still returned sparse link-only `orderLines`, while totals were decisive.

Sandbox limitation proved:
- Filtered outgoing VAT list exposed only `0%` (`vatType.id=6`).
- Exact mixed `25% / 15% / 0%` replay was blocked in this sandbox account.
- I therefore proved the same resolver/create path with a 0%-only analog invoice on the exact customer/product-number shape.
- Proof invoice returned `amountExcludingVatCurrency=52600`, `amountCurrency=52600`, invoice id `2147531980`, invoice number `44`.

## Playbook Changes

Updated existing files; no new trusted standard or playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md)
- [task-playbooks/create-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md)

What changed:
- Added explicit rule: when the prompt clearly gives exact product numbers, use `GET /product?productNumber=...` first.
- Kept `GET /product?count=1000&fields=*` for ambiguous parenthetical refs only.
- Added this run’s reflection: 4-call production path was already minimal.
- Added caution not to retry after a successful invoice write because of local arithmetic/assertion mistakes.
- Recorded sandbox proof and sandbox VAT limitation for this exact shape.

## Commit

- Commit hash: `03e26af64a86a2d91ad2f382caf3f09682302252`
- Commit message: `tripletex playbook: tighten customer invoice product resolution`

## Reusable Heuristics

- If the prompt gives real exact product numbers, start with `GET /product?productNumber=...`, not a broad catalog scan.
- If product search returns `vatType` only as `id`/`url` and the prompt scores exact VAT, do one filtered outgoing VAT read before writing the invoice.
- For create-only invoices, a successful `POST /invoice` with correct totals is usually enough; sparse `orderLines` are not a failure signal.
- A local math bug after a successful write is a reflection problem, not a reason to spend more production API calls.
- In sandbox follow-up runs, prove the resolver/write path even if the account cannot replay the exact VAT mix; document the account limitation explicitly instead of inventing unsupported VAT codes.