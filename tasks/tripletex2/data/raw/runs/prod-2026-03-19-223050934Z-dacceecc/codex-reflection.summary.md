## Task

Do a post-run learning pass for the product-creation session, verify the right API path in sandbox, update the playbook system, commit only `AGENTS.md` and playbook changes, and write this summary.

## Reflection

What went well:
- Original run achieved the requested side effect with a low-call path: `GET /ledger/vatType` once, then `POST /product`.
- It reused the `POST /product` response for verification instead of doing an unnecessary follow-up `GET`.
- The write payload shape was correct for the fresh-account run: `name`, `number`, `priceExcludingVatCurrency`, `vatType: { id }`.

What went poorly:
- I wasted one non-Tripletex command on `br list`; `br` was not installed in this environment.
- I did broader `openapi.json` searching than needed before narrowing to `/product`, `Product`, and `/ledger/vatType`.
- My VAT-selection heuristic was weak: I initially preferred `percentage === 25 && !parentType`, but standard VAT code `3` still has `parentType.id=0`, so that heuristic was wrong.
- I implicitly assumed the unfiltered VAT catalog and the valid product-VAT set were interchangeable. Sandbox proved they are not.

Corrected approach:
- For product creation with sales VAT, resolve `vatType` only from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date>&fields=*`.
- If that filtered result contains the requested percentage, use that code.
- If it does not, do not substitute a same-percentage code from the broader VAT catalog.

## Root Causes

- I over-trusted schema browsing and under-weighted account-specific validity rules.
- I treated `parentType` like a base/derived discriminator even though Tripletex uses `parentType.id=0` on base VAT codes.
- I did not have a product playbook, so I re-discovered VAT-selection behavior ad hoc.
- Sandbox and fresh-account behavior differ here; the original run succeeded because the fresh account accepted standard outgoing 25% VAT, while sandbox did not.

## Sandbox Verification

Sandbox credentials only were used in follow-up.

Evidence gathered:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6`:
  `Ingen utgående avgift (utenfor mva-loven)`, `0%`.
- `GET /ledger/vatType?fields=*` and broader families exposed VAT code `3`:
  `Utgående avgift, høy sats`, `25%`.
- `POST /product` with VAT code `3` in sandbox failed with:
  `422`, `Internt felt (vatTypeId): Ugyldig mva-kode.`
- `POST /product` with VAT code `6`, taken from the `OUTGOING`-filtered result, succeeded and returned:
  `id=84381760`, `number=9459732933`, `priceExcludingVatCurrency=100`, `priceIncludingVatCurrency=100`, `vatType.id=6`.

Conclusion:
- The sandbox could not reproduce the exact 25% product because that account’s valid outgoing product-VAT set did not include 25%.
- It did prove the important rule: for product writes, trust the `OUTGOING`-filtered VAT set, not the broader VAT catalog.
- The exact original task shape remains: one decisive VAT lookup, then one `POST /product`; in the fresh-account run that valid outgoing 25% code was `id=3`.

## Playbook Changes

Created a new playbook:
- `./task-playbooks/create-product.md`

Updated AGENTS:
- `./AGENTS.md`

What changed:
- Added `Create product` to the Task Playbooks table in `AGENTS.md`.
- Added product-VAT gotchas to `AGENTS.md`.
- Created a dedicated `create-product` playbook covering:
  - minimal payload shape
  - `number` vs `productNumber` trap
  - `OUTGOING` VAT lookup rule
  - broader-catalog VAT trap
  - `parentType.id=0` trap
  - no-pre-read / no-post-read heuristics

## Commit

- Commit hash: `d04de05830f4f75a0dcbe2ce1ecd1a77c5275be6`
- Commit message: `tripletex playbook: add create-product guidance`

## Reusable Heuristics

- For create-product tasks, use `POST /product` with the smallest payload that matches the prompt.
- Writable product number field is `number`, not `productNumber`.
- For product VAT, resolve candidates from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`.
- Do not promote a VAT code from the unfiltered catalog into a product write just because the percentage matches.
- Do not use `!parentType` to identify base VAT codes in Tripletex.
- Reuse the `POST /product` response as verification when it already contains the scored fields.