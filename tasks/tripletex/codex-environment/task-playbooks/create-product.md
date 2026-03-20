# Create Product

## Scope

Use for tasks like:
- create one new product
- prompt gives the product name and product number directly
- prompt gives a price and whether it is excluding or including VAT
- prompt asks for a specific standard VAT rate such as 25%
- no update, delete, inventory, supplier-product, or batch-create flow is requested

## Verified Findings

Fresh-account verification on 2026-03-19 showed:
- `POST /product` succeeded with a minimal payload using `name`, `number`, `priceExcludingVatCurrency`, and `vatType: { "id": ... }`
- the successful `201` response already proved the created `id`, `name`, `number`, `priceExcludingVatCurrency`, computed `priceIncludingVatCurrency`, and `vatType.id`
- for a standard 25% sales-VAT product, the accepted VAT code in that run was `number="3"` / `id=3` (`Utgående avgift, høy sats`)

Persistent-sandbox verification on 2026-03-19 showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6` (`0% Ingen utgående avgift`) in that account
- `POST /product` succeeded when using the VAT code returned by that `OUTGOING` filter
- `POST /product` failed with `422` and `Internt felt (vatTypeId): Ugyldig mva-kode.` when using VAT code `3` picked from the broader unfiltered VAT catalog
- therefore, the unfiltered VAT catalog and `typeOfVat=LEDGER` can contain codes that are not valid for product creation in the current account configuration

Persistent-sandbox verification on 2026-03-20 showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` still returned only VAT code `6` (`0% Ingen utgående avgift`)
- the broader `GET /ledger/vatType?fields=*` catalog still exposed `15%` entries including outgoing code `31` (`Utgående avgift, middels sats`)
- `POST /product` with `vatType: { "id": 31 }` still failed with `422` and `Internt felt (vatTypeId): Ugyldig mva-kode.`
- therefore, if the requested percentage is absent from the filtered `OUTGOING` result, the task is blocked in that account; do not guess from the broader VAT catalog even when a same-percentage outgoing code exists there

Persistent-sandbox verification on 2026-03-20 also showed:
- `POST /product` without any `vatType` still succeeded and auto-filled the same sandbox default 0% outgoing VAT code `6`
- this is not a trusted shortcut for scored exact-VAT tasks; it only proves that some accounts silently default the VAT on product create

Fresh-account production verification on 2026-03-20 showed:
- an exact "0% VAT for books" product-create task succeeded with the filtered `OUTGOING` 0% row `id=5` / `number="5"` (`Ingen utgående avgift (innenfor mva-loven)`)
- therefore even exact 0% product tasks can map to different valid VAT ids across accounts (`5` in that fresh account, `6` in the persistent sandbox)
- do not search for a book-specific VAT endpoint or hardcode the sandbox's `0%` code; the safe path is still to pick the matching `0%` row from the filtered `OUTGOING` result in the current account

Fresh-account production verification on 2026-03-20 also showed:
- an exact create-product prompt for `Stockage cloud`, product number `8912`, `26850 NOK` excluding VAT, and standard `25%` VAT succeeded with exactly two API calls
- the winning path was `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, pick the `25%` row `id=3`, then `POST /product`
- the `201` write response already proved the created `id`, `name`, `number`, `priceExcludingVatCurrency`, computed `priceIncludingVatCurrency`, and `vatType.id`
- therefore this exact task shape does not need `GET /product`, `GET /product/{id}`, or an `openapi.json` re-check once the trusted standard already matches

Scoring feedback on 2026-03-20 later clarified that the same `Stockage cloud` run was still not minimal-call:
- the extra `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` cost the efficiency half-point
- the lower-call winning path for that exact fresh-account shape was one `POST /product` with `name`, `number`, and `priceExcludingVatCurrency`, omitting explicit `vatType`
- therefore the trusted shortcut for the exact fresh-account standard-`25%` product-create shape is one write call, not two

Persistent-sandbox verification on 2026-03-20 also showed:
- `POST /product` without any `vatType` still succeeded and auto-filled sandbox default `0%` VAT code `6`
- the write response showed `priceIncludingVatCurrency == priceExcludingVatCurrency`, proving that the inherited VAT default is account-dependent
- therefore the one-call shortcut must stay scoped to the exact fresh-account standard-`25%` shape and must not be generalized to exact `0%`, reduced-rate, or other non-standard VAT prompts

## Minimal Safe Flow

1. If the task is the exact fresh-account create-one-product shape with standard `25%` VAT wording, do one `POST /product` with only `name`, `number`, and the prompt-required price field
2. Verify directly from `response.value` that the returned `priceIncludingVatCurrency` reflects `25%` VAT and that a `vatType` was assigned
3. Stop
4. Otherwise, if the task is an exact trusted-standard match but the VAT is exact `0%`, reduced-rate, or otherwise non-standard, skip `./openapi.json` re-checking and start with the VAT read below
5. Otherwise confirm `GET /ledger/vatType` and `POST /product` in `./openapi.json`
6. Resolve the product VAT code with one decisive read:
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date-or-today>&fields=*`
7. From that filtered result, select the VAT type that matches the requested percentage
   - if no matching percentage exists there, stop and treat the task as blocked in that account
8. `POST /product` with only the requested fields plus `vatType: { "id": ... }`
9. Verify directly from `response.value`
10. Stop

## Exact-Match Fast Path

- If the prompt asks to create one product with a product number, a price excluding VAT, and standard 25% VAT, the winning flow is usually:
  1. `POST /product` with `name`, `number`, and `priceExcludingVatCurrency`
  2. let the fresh-account default VAT fill the standard `25%` rate
  3. verify from the `201` response that `priceIncludingVatCurrency` is the `25%` computation and that `vatType` was assigned
- for an exact trusted-standard match, that one write call is the full path; do not spend an extra `openapi.json` check or a `GET /ledger/vatType` before it
- Do not add a pre-read on `/product` for a pure create task
- Do not fetch the product again if the `201` body already proves the scored fields

## Recommended Payload Shape

Use `number` for the product number and the VAT code id from the `OUTGOING` lookup.

```json
{
  "name": "Konsulenttimar",
  "number": "3923",
  "priceExcludingVatCurrency": 26400,
  "vatType": { "id": 3 }
}
```

## OpenAPI Navigation Trap

- The search endpoint uses query parameter `productNumber`, but the writable field on the `Product` schema is `number`
- For create-product tasks, trust the schema referenced by `POST /product`: `#/components/schemas/Product`
- Do not infer writable field names from search parameters alone

## VAT Resolution Trap

- Do not resolve product VAT from `GET /ledger/vatType?fields=*`
- Do not resolve product VAT from `typeOfVat=LEDGER`
- Those broader lists can expose VAT codes that still fail product creation in the current account
- For product creation, the authoritative candidate set is the `typeOfVat=OUTGOING` result on the task date
- If the requested percentage is not present in that `OUTGOING` result, do not substitute a same-percentage code from the broader catalog
- If `OUTGOING` omits the requested percentage entirely, treat the create as blocked for that account instead of probing extra VAT variants

## Parent Type Trap

- Do not assume the base standard VAT code has `parentType=null`
- Standard `25%` sales VAT code `3` still has `parentType.id=0`
- If you want the standard 25% code and several `25%` entries appear in the filtered result, prefer the plain numeric code `3` over derived codes such as `UTTAK-3`

## Verification Shape

- Expect `201 Created`
- Expect a wrapper of shape `{"value": {...}}`
- The write response can already prove:
  - product `id`
  - `name`
  - `number`
  - `priceExcludingVatCurrency`
  - computed `priceIncludingVatCurrency`
  - `vatType.id`
- Reuse that response instead of doing `GET /product` unless the response unexpectedly omits a scored field

## When Not To Pre-Read

- Do not `GET /product` first for a standard create task
- Do not add sandbox idempotency checks to a scored create prompt
- Do not spend `GET /ledger/vatType` first for the exact fresh-account standard-`25%` create-product shape; scoring feedback showed that call is wasted there
- Do not browse multiple VAT endpoints once `typeOfVat=OUTGOING` already gives the needed valid code for a non-standard-VAT task
- Do not treat a sandbox success without `vatType` as proof that the inherited VAT value is portable across accounts

## Avoidable Mistakes

- Do not spend a filtered outgoing VAT read on the exact fresh-account standard-`25%` create-product shape; that was the wasted call in the `Stockage cloud` run
- Do not choose `vatType` from the unfiltered VAT catalog just because the percentage matches
- Do not assume `typeOfVat=OUTGOING` and `typeOfVat=LEDGER` are interchangeable for product writes
- Do not filter out valid base VAT codes by checking `!parentType`
- Do not send both excluding-VAT and including-VAT price fields unless the prompt clearly requires it
- Do not burn a `POST /product` on a broader-catalog `15%` or `25%` code after the filtered `OUTGOING` read already proved that percentage is unavailable for product creation in the current account
- Do not assume that "0% for books" needs anything more than the current account's filtered outgoing `0%` VAT row
- Do not generalize the one-call omitted-`vatType` shortcut from the exact fresh-account standard-`25%` shape to `0%`, reduced-rate, or other exact-VAT prompts
