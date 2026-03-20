## 1. Task

Reflect on the production run that created product `Pão integral` with product number `1871`, price `28350 NOK` excluding VAT, and exact food VAT `15%`; audit call efficiency; verify the correct path in sandbox; update the Tripletex learning docs; commit those doc changes.

## 2. Reflection

What went well:
- The production run used the correct API shape: one filtered VAT lookup, then one `POST /product`.
- The production write reused the `201` response directly, so there was no wasteful follow-up `GET /product`.
- The production run preserved exact prompt strings and used the proven writable fields `name`, `number`, `priceExcludingVatCurrency`, and `vatType.id`.

What went poorly:
- I still re-opened the playbook and `openapi.json` even though this was an exact trusted-standard match. That did not cost API calls, but it was unnecessary local work.
- The trusted standard itself had a misleading payload field name, `salesPriceExcludingVatCurrency`, even though the proven writable field is `priceExcludingVatCurrency`.
- The docs did not state clearly enough that if the filtered `OUTGOING` VAT list omits the requested percentage, the task is blocked in that account and the agent must not guess from the broader VAT catalog.

Correct approach:
- For this exact task shape, use the trusted standard directly.
- Call `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date>&fields=*`.
- Pick the exact requested percentage from that filtered result only.
- Call `POST /product` with only `name`, `number`, `priceExcludingVatCurrency`, and `vatType: { id }`.
- Trust the `201` write response for verification.
- If the filtered `OUTGOING` list does not contain the requested percentage, stop and treat the task as blocked in that account.

## 3. Call Efficiency

The production run was minimal-call for this exact task shape.

- API calls used: `2`
- Wasted API calls: `0`
- Minimal path for the next agent:
  1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date-or-today>&fields=*`
  2. `POST /product` with `name`, `number`, `priceExcludingVatCurrency`, `vatType: { id }`

No lower-call replacement exists for this exact task shape when the prompt scores an exact VAT percentage. A one-call `POST /product` is only safe when VAT is not exact or is truly implied by account defaults; that was not this task.

Pitfalls to avoid:
- Do not hardcode VAT code `3`.
- Do not use `GET /ledger/vatType?fields=*` or `typeOfVat=LEDGER` to choose product VAT.
- Do not send `salesPriceExcludingVatCurrency`; use `priceExcludingVatCurrency`.
- Do not spend `GET /product` before or after a standard create.
- Do not try a broader-catalog same-percentage VAT code after `OUTGOING` already showed that percentage is unavailable.

## 4. Root Causes

- Over-caution: I re-checked playbook/spec material even though the trusted standard already covered the exact run shape.
- Documentation gap: the trusted standard had the wrong price field name.
- Documentation gap: the blocked-path rule for missing `OUTGOING` VAT percentages was implicit, not explicit.

## 5. Sandbox Verification

Sandbox base URL used: `https://kkpqfuj-amager.tripletex.dev/v2`

Verified facts:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` with `0%`.
- `GET /ledger/vatType?fields=*` still exposed `15%` VAT entries, including outgoing code `31` (`Utgående avgift, middels sats`).
- A controlled sandbox `POST /product` using `vatType: { id: 31 }` failed with `422` and `Internt felt (vatTypeId): Ugyldig mva-kode.`

Proof from that:
- The broader VAT catalog can expose same-percentage codes that are still invalid for product creation.
- The filtered `OUTGOING` VAT list is the authoritative candidate set for `POST /product`.
- If the requested percentage is missing from filtered `OUTGOING`, the safe path is to stop as blocked, not to probe guessed VAT ids.

## 6. Playbook Changes

Updated existing docs; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-product.md`
- `task-playbooks/create-product.md`

What changed:
- Fixed the trusted-standard payload field from `salesPriceExcludingVatCurrency` to `priceExcludingVatCurrency`.
- Added the explicit blocked-path rule when the requested VAT percentage is absent from filtered `OUTGOING`.
- Added persistent-sandbox evidence that broad-catalog `15%` code `31` still fails `POST /product` when `OUTGOING` omits `15%`.
- Added the same rule to common endpoints and AGENTS gotchas so future agents do not burn avoidable `422`s.

## 7. Commit

- Commit hash: `ae28db3`
- Commit message: `tripletex playbook: tighten create-product VAT rules`

## 8. Reusable Heuristics

- For product creation, `OUTGOING` VAT on the real task date is the only trusted VAT resolver.
- If exact VAT is scored, absence from filtered `OUTGOING` means blocked account, not invitation to guess.
- For create-only product tasks, the write response is enough; avoid follow-up reads.
- Search parameter names are not always writable field names; for products, query `productNumber` is not the create field `number`.