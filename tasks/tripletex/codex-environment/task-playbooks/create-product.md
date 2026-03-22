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
- that same broad catalog returned several distinct `15%` rows (`11`, `31`, `551`, `556`), and the first percentage hit was incoming code `11`; broad-catalog "first 15%" selection is therefore unsafe even before the write validation branch
- `POST /product` with `vatType: { "id": 31 }` still failed with `422` and `Internt felt (vatTypeId): Ugyldig mva-kode.`
- therefore, if the requested percentage is absent from the filtered `OUTGOING` result, the task is blocked in that account; do not guess from the broader VAT catalog even when a same-percentage outgoing code exists there

Persistent-sandbox verification on 2026-03-20 also showed:
- `POST /product` without any `vatType` still succeeded and auto-filled the same sandbox default 0% outgoing VAT code `6`
- this is not a trusted shortcut for scored exact-VAT tasks; it only proves that some accounts silently default the VAT on product create

Fresh-account production verification on 2026-03-20 showed:
- an exact "0% VAT for books" product-create task succeeded with the filtered `OUTGOING` 0% row `id=5` / `number="5"` (`Ingen utgående avgift (innenfor mva-loven)`)
- therefore even exact 0% product tasks can map to different valid VAT ids across accounts (`5` in that fresh account, `6` in the persistent sandbox)
- do not search for a book-specific VAT endpoint or hardcode the sandbox's `0%` code; the safe path is still to pick the matching `0%` row from the filtered `OUTGOING` result in the current account

Fresh-account production verification on 2026-03-21 showed:
- an exact "0% VAT for newspapers" product-create task (`Journal quotidien` / `9219` / `3150 NOK`) succeeded with the same 2-call path: `GET /ledger/vatType?typeOfVat=OUTGOING` resolved `id=5` for `0%`, then `POST /product` with explicit `vatType`
- scored 2/2 (perfect correctness + efficiency), confirming that the 2-call path is optimal and no 1-call shortcut exists for explicit 0% VAT in fresh accounts
- the category qualifier ("for newspapers", "for books", etc.) is cosmetic and does not affect VAT resolution

Fresh-account production verification on 2026-03-21 also showed:
- an exact "0% VAT for books" product-create task (`Livro de receitas` / `7946` / `18250 NOK sem IVA`) succeeded with the same 2-call path: `GET /ledger/vatType?typeOfVat=OUTGOING` resolved `id=5` for `0%`, then `POST /product` returned `priceIncludingVatCurrency=18250` and `vatType.id=5`
- 2 calls, 0 errors, confirming the 2-call path is consistently optimal for explicit 0% VAT tasks
- Portuguese `sem IVA` wording correctly maps to `priceExcludingVatCurrency` without needing any special handling

Fresh-account production verification on 2026-03-21 also showed:
- an exact standard-25% product-create task (`Datenberatung` / `7855` / `41550 NOK ohne MwSt.`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=51937.5` and `vatType.id=3`
- 1 call, 0 errors, minimal-call execution
- German `ohne MwSt.` wording correctly maps to `priceExcludingVatCurrency` without needing any special handling
- 7th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape across languages: de/en/es/pt/fr

Fresh-account production verification on 2026-03-21 also showed:
- an exact standard-25% product-create task (`Training Session` / `7908` / `26250 NOK excluding VAT`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=32812.5` and `vatType.id=3`
- 1 call, 0 errors, minimal-call execution
- 8th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape; second English-language confirmation

Fresh-account production verification on 2026-03-21 also showed:
- an exact standard-25% product-create task (`Web Design` / `3766` / `23950 NOK excluding VAT`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=29937.5` and `vatType.id=3`
- 1 call, 0 errors, minimal-call execution
- 9th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape; third English-language confirmation

Fresh-account production verification on 2026-03-21 also showed:
- an exact standard-25% product-create task (`Training Session` / `2451` / `20350 NOK excluding VAT`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=25437.5` and `vatType.id=3`
- 1 call, 0 errors, minimal-call execution
- 10th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape; fourth English-language confirmation
- second confirmation of product name `Training Session` (previously verified with number `7908` / price `26250`)

Fresh-account production verification on 2026-03-21 also showed:
- an exact 15% reduced-rate VAT product-create task (`Eplejuice` / `9026` / `49700 kr eksklusiv MVA` / `15%` for næringsmidler/food) succeeded with the 2-call path
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` resolved `id=31` for `15%` (`Utgående avgift, middels sats`)
- `POST /product` returned `priceIncludingVatCurrency=57155` and `vatType.id=31`
- 2 calls, 0 errors, minimal-call execution for non-default VAT
- Norwegian `eksklusiv MVA` wording correctly maps to `priceExcludingVatCurrency` without needing any special handling
- "næringsmidler" (food) category qualifier is cosmetic and does not change the VAT resolution logic
- first production confirmation of the 2-call path for explicit 15% reduced-rate VAT; extends the proven non-default VAT set from {0%} to {0%, 15%}

Fresh-account production verification on 2026-03-21 also showed:
- an exact 0% VAT product-create task in Nynorsk (`Avis` / `2061` / `4150 kr eksklusiv MVA` / `0%` for newspapers) succeeded with the 2-call path
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` resolved `id=5` for `0%`
- `POST /product` returned `priceIncludingVatCurrency=4150` and `vatType.id=5`
- 2 calls, 0 errors, scored 2/2 (perfect)
- 3rd production confirmation of the 2-call path for explicit 0% VAT; first Nynorsk (`nn`) language confirmation
- Nynorsk `nyttast` (shall be used) is task-level instruction, not a price-field variation; `eksklusiv MVA` still maps to `priceExcludingVatCurrency`

Fresh-account production verification on 2026-03-22 also showed:
- an exact standard-25% product-create task in Nynorsk (`Datarådgjeving` / `4993` / `16250 kr eksklusiv MVA` / standard `25%`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=20312.5` and `vatType.id=3`
- 1 call, 0 errors, minimal-call execution
- 11th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape
- first Nynorsk 25% confirmation; extends proven 25% language set from {de, en, es, pt, fr} to {de, en, es, pt, fr, nn}

Fresh-account production verification on 2026-03-22 also showed:
- an exact 0% VAT product-create task in German (`Fachbuch` / `2237` / `5650 NOK ohne MwSt.` / `0%` for books) succeeded with the 2-call path
- `GET /ledger/vatType?typeOfVat=OUTGOING&fields=*` resolved `id=5` for `0%`
- `POST /product` returned `priceIncludingVatCurrency=5650` and `vatType.id=5`
- 2 calls, 0 errors
- 5th production confirmation of the 2-call path for explicit 0% VAT; first German 0% confirmation
- extends proven 0% language set from {fr, pt, nn} to {de, fr, pt, nn}

Fresh-account production verification on 2026-03-22 also showed:
- an exact standard-25% product-create task in Spanish (`Mantenimiento` / `4508` / `41500 NOK sin IVA` / standard `25%`) succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=51875` and `vatType.id=3`
- 1 write + 1 verification GET, 0 errors, minimal-call execution
- 12th consecutive production confirmation of the one-call path for the exact fresh-account standard-25% shape
- 2nd Spanish 25% confirmation (previously `Mantenimiento` / `7266` / `650`); all 7 languages confirmed: {de, en, es, fr, nn, no, pt}

Persistent-sandbox re-verification on 2026-03-22 (later session) showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` now returns full VAT set: `id=3` (25%), `id=31` (15%), `id=32` (12%), `id=5` (0%), `id=52` (0%), `id=6` (0%)
- sandbox is NO LONGER blocked for 25%/15%/12% VAT verification
- `POST /product` without `vatType` now defaults to 25% (id=3) in the sandbox, matching production fresh-account behavior
- the previous sandbox 0%-only limitation was due to a different account configuration that has since changed

Fresh-account production verification on 2026-03-20 also showed:
- an initial `Stockage cloud` run for the same exact shape succeeded with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` plus `POST /product`
- that earlier run proved that fresh accounts can expose a valid `25%` outgoing row `id=3`, but it did not prove the minimal path
- the `201` write response already proved the created `id`, `name`, `number`, `priceExcludingVatCurrency`, computed `priceIncludingVatCurrency`, and `vatType.id`

Scoring feedback on 2026-03-20 later clarified that the same `Stockage cloud` run was still not minimal-call:
- the extra `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` cost the efficiency half-point
- the lower-call winning path for that exact fresh-account shape was one `POST /product` with `name`, `number`, and `priceExcludingVatCurrency`, omitting explicit `vatType`
- therefore the trusted shortcut for the exact fresh-account standard-`25%` product-create shape is one write call, not two

Fresh-account production verification later on 2026-03-20 confirmed that lower-call path directly:
- the exact prompt `Softwarelizenz`, product number `7986`, `24900 NOK` excluding VAT, standard `25%` VAT succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=31125` and `vatType.id=3`
- therefore the exact fresh-account standard-`25%` create-product shape is now doubly proven as a one-write path, while the earlier VAT read remains documented only as a non-minimal historical branch

Fresh-account production verification later that same day also confirmed the same shortcut for localized Portuguese wording:
- the exact prompt `Sessão de formação`, product number `6378`, `37050 NOK sem IVA`, standard `25%` VAT succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=46312.5` and `vatType.id=3`
- therefore localized excluding-VAT wording such as `sem IVA` does not change the task shape or justify a pre-read

Fresh-account production verification later that same day also confirmed the same shortcut for localized French wording:
- the exact prompt `Maintenance`, product number `1327`, `3700 NOK hors TVA`, standard `25%` VAT succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=4625` and `vatType.id=3`
- therefore localized excluding-VAT wording such as `hors TVA` does not change the task shape or justify a pre-read

Fresh-account production verification later that same day also confirmed the same shortcut for localized Spanish wording:
- the exact prompt `Mantenimiento`, product number `7266`, `650 NOK sin IVA`, standard `25%` VAT succeeded with one `POST /product`
- the `201` write response returned `priceIncludingVatCurrency=812.5` and `vatType.id=3`
- therefore localized excluding-VAT wording such as `sin IVA` does not change the task shape or justify a pre-read

Persistent-sandbox verification on 2026-03-20 also showed:
- `POST /product` without any `vatType` still succeeded and auto-filled sandbox default `0%` VAT code `6`
- the write response showed `priceIncludingVatCurrency == priceExcludingVatCurrency`, proving that the inherited VAT default is account-dependent
- therefore the one-call shortcut must stay scoped to the exact fresh-account standard-`25%` shape and must not be generalized to exact `0%`, reduced-rate, or other non-standard VAT prompts

Persistent-sandbox re-verification later on 2026-03-20 with the same `37050` price and Portuguese naming still showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only `id=6` / `0%`
- `POST /product` without `vatType` again auto-filled `vatType.id=6` and kept `priceIncludingVatCurrency=37050`
- therefore the persistent sandbox still cannot prove the fresh-account standard-`25%` shortcut directly; it only re-proves that the shortcut is account-dependent and must stay narrowly scoped

Persistent-sandbox re-verification later on 2026-03-20 with the same French `Maintenance` / `3700` shape still showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only `id=6` / `0%`
- `POST /product` without `vatType` auto-filled `vatType.id=6` and kept `priceIncludingVatCurrency=3700`
- therefore the persistent sandbox still cannot prove the fresh-account standard-`25%` shortcut directly for that French wording either; it only re-proves the sandbox default-`0%` pitfall

Persistent-sandbox re-verification later on 2026-03-20 with the same Spanish `Mantenimiento` / `650` shape still showed:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only `id=6` / `0%`
- `POST /product` without `vatType` auto-filled `vatType.id=6` and kept `priceIncludingVatCurrency=650`
- therefore the persistent sandbox still cannot prove the fresh-account standard-`25%` shortcut directly for that Spanish wording either; it only re-proves the sandbox default-`0%` pitfall

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
- localized excluding-VAT wording such as `sem IVA`, `sin IVA`, `sans TVA`, or `ohne MwSt.` still belongs to this same fast path when the rest of the prompt is the ordinary standard-`25%` create-one-product shape
- localized French wording such as `hors TVA` also belongs to this same fast path when the rest of the prompt is the ordinary standard-`25%` create-one-product shape
- for an exact trusted-standard match, that one write call is the full path; do not spend an extra `openapi.json` check or a `GET /ledger/vatType` before it
- Do not add a pre-read on `/product` for a pure create task
- Do not fetch the product again if the `201` body already proves the scored fields

## Recommended Payload Shape

Use `number` for the product number. Include `vatType` only on the non-shortcut branch that already proved the needed `OUTGOING` VAT id.

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
- Do not treat Portuguese `sem IVA` phrasing as a reason to abandon the exact trusted-standard shortcut or to search for a different price field
- Do not treat Spanish `sin IVA` phrasing as a reason to abandon the exact trusted-standard shortcut or to search for a different price field
- Do not treat French `hors TVA` phrasing as a reason to abandon the exact trusted-standard shortcut or to search for a different price field
- Do not treat German `ohne MwSt.` phrasing as a reason to abandon the exact trusted-standard shortcut or to search for a different price field
- Do not treat Norwegian `eksklusiv MVA` or `eks. MVA` phrasing as a reason to abandon the exact trusted-standard shortcut or to search for a different price field

## Avoidable Mistakes

- Do not spend a filtered outgoing VAT read on the exact fresh-account standard-`25%` create-product shape; that was the wasted call in the `Stockage cloud` run
- Do not choose `vatType` from the unfiltered VAT catalog just because the percentage matches
- Do not assume `typeOfVat=OUTGOING` and `typeOfVat=LEDGER` are interchangeable for product writes
- Do not filter out valid base VAT codes by checking `!parentType`
- Do not send both excluding-VAT and including-VAT price fields unless the prompt clearly requires it
- Do not burn a `POST /product` on a broader-catalog `15%` or `25%` code after the filtered `OUTGOING` read already proved that percentage is unavailable for product creation in the current account
- Do not assume that "0% for [category]" (books, newspapers, etc.) or "15% for næringsmidler (food)" needs anything more than the current account's filtered outgoing matching-percentage VAT row; the category qualifier is cosmetic
- Do not generalize the one-call omitted-`vatType` shortcut from the exact fresh-account standard-`25%` shape to `0%`, reduced-rate, or other exact-VAT prompts
- Do not pass `vatType: { percentage: 0 }` or `vatType: { number: "5" }` hoping the API will resolve the VAT by those fields — the API silently ignores non-`id` fields and falls back to the account default VAT (sandbox-verified 2026-03-22: `{ percentage: 0 }` returned 201 but applied 25% instead of 0%); only `{ id: X }` works
