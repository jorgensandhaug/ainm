## 1. Task
Post-run learning pass for the scored production task: create product `Frokostblanding`, number `1391`, `37450` ex VAT, exact food VAT `15%`.

## 2. Reflection
- Production run itself went well: exact trusted-standard branch chosen, final Tripletex state correct, `0` avoidable `4xx`, and no verification over-reads.
- Production run did not make an API-flow mistake. Exact reduced-VAT product create was not a 1-call task.
- Follow-up doc work found that the main `15%` product learnings were already present in `HEAD`, so the only new durable learning was a narrower pitfall: broad VAT catalog ordering can surface an incoming `15%` row before the outgoing base row.
- Follow-up git hygiene was imperfect: the commit picked up already-staged doc-only invoice-path changes that were in the index before commit.

## 3. Call Efficiency
- Production run was minimal-call.
- Calls used: `2`.
- Wasted calls: none.
- Exact lower-call path for next agent on the same task shape:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date>&fields=*`
  - `POST /product` with `name`, `number`, `priceExcludingVatCurrency`, `vatType: { id: <matching 15% outgoing row> }`
- A 1-call `POST /product` shortcut was not safe here because exact reduced VAT is account-dependent and omitted `vatType` can inherit the wrong default.

## 4. Root Causes
- Exact VAT product tasks depend on the account’s filtered `OUTGOING` VAT set, not on the broad VAT catalog.
- Fresh-account production and persistent sandbox diverge materially on VAT availability.
- Broad-catalog percentage matching is unsafe: same percentage can appear as incoming, outgoing, and derived rows.
- Commit staging risk: I did not re-check the full staged set before commit, so pre-staged doc-only invoice files came along.

## 5. Sandbox Verification
- Sandbox script used: `scripts/sandbox_verify_product_15pct.ts`.
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned no `15%` rows.
- Broad `GET /ledger/vatType?fields=*` returned `15%` rows `11`, `31`, `551`, `556`.
- The first broad `15%` hit was incoming code `11`, which proves “first percentage match” is unsafe.
- `POST /product` with broad outgoing code `31` failed `422 Internt felt (vatTypeId): Ugyldig mva-kode.`
- Conclusion: persistent sandbox is blocked for exact `15%` product create; correct heuristic remains “filtered `OUTGOING` only, and stop if the requested percentage is absent.”

## 6. Playbook Changes
- Updated existing docs, created no new files.
- Intentional updates:
  - `trusted-standards/create-product.md`
  - `trusted-standards/common-endpoints.md`
  - `task-playbooks/create-product.md`
- New rule added: never resolve exact-VAT product creates by taking the first broad-catalog percentage match; for `15%`, broad catalog can surface incoming `11` before outgoing `31`.
- No AGENTS change was needed because the main `15%` product rule was already present in `HEAD`.
- Commit also included already-staged doc-only paths:
  - `trusted-standards/create-and-send-customer-invoice.md`
  - `task-playbooks/create-and-send-customer-invoice.md`

## 7. Commit
- Commit hash: `504c5c342ed35fe7b9f65d33d086ba8d28417bc4`
- Commit message: `tripletex playbook: tighten reduced-vat product selection`

## 8. Reusable Heuristics
- Exact fresh-account standard `25%` product create can be 1 call; exact `0%`, `15%`, or other non-standard VAT product create is not that branch.
- For exact reduced-rate product tasks, use one filtered outgoing VAT read, then one product write, then stop.
- Never use broad `/ledger/vatType?fields=*` as the selector source for product VAT.
- Never pick the first row whose `percentage` matches.
- If filtered `OUTGOING` omits the requested percentage, treat the account as blocked; do not try broad code `31`, derived codes like `UTTAK-31`, or omitted `vatType`.
- Reuse the `POST /product` response for verification; do not add `GET /product` or `GET /product/{id}`.