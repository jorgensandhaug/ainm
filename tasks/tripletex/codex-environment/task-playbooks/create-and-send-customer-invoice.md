# Create and Send Customer Invoice

## Scope

Use for tasks like:
- create an invoice for an existing or new customer
- send the invoice after creation
- invoice has one or more simple order lines

For create-only invoice tasks that should stop before sending, use `./task-playbooks/create-customer-invoice.md`.

## Key Finding: The Winning Send Path Is Usually The Invoice Create Itself

For this task shape, do not default to:

`POST /invoice?sendToCustomer=false`

followed by:

`PUT /invoice/{id}/:send?sendType=...`

Persistent sandbox re-verification on 2026-03-20 showed a lower-call and safer path:

1. create or resolve the customer
2. resolve outgoing VAT
3. `POST /invoice` with the default `sendToCustomer=true`
4. stop

The same sandbox session also showed:
- explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` returned `500`
- explicit later `PUT /invoice/{id}/:send?sendType=PAPER` returned `422 Faktura kan ikke sendes via PAPER`

For the common "new customer, no email/address in prompt" variant, the invoice create itself is the trusted send step.

## Key Finding: Fresh-Account Customer Identity Is Not The Same As Existing-Customer Proof

For exact create-and-send prompts that only give customer business identity such as:

- exact `name`
- exact `organizationNumber`
- no email
- no postal address
- no explicit wording that the customer already exists

do not spend a speculative:

`GET /customer?organizationNumber=...&fields=*`

first.

Persistent sandbox re-verification on 2026-03-20 showed the lower-call path for that fresh-account shape is:

1. `POST /customer` with:
   - `name`
   - `organizationNumber`
   - `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
3. `POST /invoice`

The same sandbox account then re-verified the existing-customer branch with:

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /ledger/vatType?...`
3. `POST /invoice`

So the pre-read is only part of the trusted path when the prompt explicitly implies an already-existing customer or the run context is not the normal fresh-account shape.

The same rule is language-agnostic for explicit no-VAT prompts. The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` also succeeded in the same `3` calls:

1. `POST /customer` with `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

So do not let prompt language push this shape onto an unnecessary existing-customer lookup branch.

The same no-VAT branch also covers German wording such as `ohne MwSt.`. The 2026-03-20 production run for `Bergwerk GmbH` / `981122011` / `Datenberatung` / `45150` and the same-day persistent sandbox analog `Bergwerk Reflection 999518478 GmbH` both succeeded in the same `3` calls with `amountExcludingVatCurrency=amountCurrency=45150`:

1. `POST /customer` with `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

The same no-VAT branch also covers Spanish wording such as `sin IVA`. The 2026-03-21 production run for `Río Verde SL` / `894012358` / `Sesión de formación` / `29100` used 6 calls (with reactive bank-account repair) and confirmed `amountExcludingVatCurrency=amountCurrency=29100`. With the now-recommended proactive approach, the optimal path would have been 5 calls:

1. `POST /customer` with `invoiceSendMethod: "MANUAL"` (parallel with steps 2-3)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` (parallel, found 0% at code 5)
3. `GET /ledger/account?isBankAccount=true&fields=*` (parallel, free)
4. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (conditional, if bankAccountNumber falsy)
5. `POST /invoice` (201 — succeeds on first try, 0 errors)

## Key Finding: Proactive Bank-Account Check (Preferred)

Since GETs are free and 4xx errors cost penalty, **proactively check and fix the bank account BEFORE `POST /invoice`**:

1. `GET /ledger/account?isBankAccount=true&fields=*` (free GET, parallelize with customer/VAT reads)
2. Find the invoice account (usually `number=1920`, `isInvoiceAccount=true`)
3. If `bankAccountNumber` is falsy: `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`
4. Then `POST /invoice` — succeeds on first try, 0 errors

This replaces the old reactive pattern (POST → 422 → GET → PUT → retry POST) which costs 1 extra write and 1 avoidable 422 error. The 2026-03-22 `Blueshore Ltd` production run used reactive and wasted 1 write + 1 error that proactive would have prevented. Sandbox-verified 2026-03-22: proactive 3-way parallel [GET /customer + GET /ledger/vatType + GET /ledger/account] + conditional PUT + POST /invoice succeeded with 0 errors.

## Bank Account Repair — Reactive Fallback

If `POST /invoice` still fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` despite the proactive check:

1. `GET /ledger/account?isBankAccount=true&fields=*` (if not already done)
2. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"`
3. Retry `POST /invoice` once
4. Keep the same invoice payload; do not re-read customer, products, or `vatType`

Known constraints:
- the known-good minimal payload on the existing invoice account is `{ "bankAccountNumber": "12345678903" }`
- do not burn calls on an improvised locally generated bank-account number unless this exact minimal repair itself fails
- if you do need a different number, use a valid Norwegian mod-11 checksum with weights `5,4,3,2,7,6,5,4,3,2` across the first ten digits; the wrong weight order only burns a `422`
- once that repair branch has already identified the invoice `account.id`, reuse it directly; do not spend a second `/ledger/account` read after a local repair-payload mistake
- if the customer create already succeeded and you later lose local process state, resume on the existing-customer branch instead of repeating `POST /customer`

## Key Finding: Hardcode VAT Type IDs — Do NOT Call GET /ledger/vatType

**REVERSED 2026-03-22**: The sandbox now has the full VAT code set. Hardcode vatType IDs directly:

| Rate | vatType.id | Use for |
|------|-----------|---------|
| 25% standard | 3 | "excluding VAT" / "eksklusiv MVA" / "hors TVA" |
| 0% outside MVA | 6 | "sem IVA" / "ohne MwSt." / "sin IVA" |
| 0% exempt | 5 | "avgiftsfri" / "exempt" |
| 15% food | 31 | "næringsmiddel" / "alimentaire" / "alimentos" |
| 12% low | 32 | |
| 0% export | 52 | |

This saves 1 API call vs the old `GET /ledger/vatType` approach.

Sandbox-verified 2026-03-22:
- `POST /invoice` with hardcoded `vatType: { id: 3 }` → 201, `amountExcludingVatCurrency=1000`, `amountCurrency=1250` (correct 25%)
- `POST /invoice` with hardcoded `vatType: { id: 3 }` for 40600 → 201, `amountExcludingVatCurrency=40600`, `amountCurrency=50750` (correct 25%)
- The old "sandbox only has id=6" observation was STALE — sandbox now exposes all 6 outgoing VAT types

**Historical note**: Earlier sandbox tests (2026-03-19 and 2026-03-20) showed only vatType code 6 (0%), and hardcoded id=3 failed with `422 Ugyldig mva-kode.`. This is no longer the case as of 2026-03-22.

## Key Finding: Omitting Line VAT Defaults to 0%

Do not omit `orderLines[].vatType` — it defaults to vatType.id=0 (0%), not 25%.

Sandbox-verified 2026-03-22:
- `POST /invoice` without line `vatType` → 201 but `amountCurrency == amountExcludingVatCurrency` (0% applied)
- Verification GET showed `vatType.id=0` on the order line

Always set `vatType: { id: 3 }` explicitly for 25% standard VAT.

## Key Finding: Language-to-VAT Mapping

- French `hors TVA` and Norwegian `eksklusiv MVA` → taxed 25% branch → `vatType: { id: 3 }`
- Portuguese `sem IVA`, German `ohne MwSt.`, Spanish `sin IVA` → 0% branch → `vatType: { id: 6 }`
- Do not misread `hors TVA` as "without VAT" — it means "excluding VAT" (price stated before tax)
- on the later same-day sandbox analog `Lumière Reflection b9572091 SARL` / `957223729`, the filtered outgoing VAT read still exposed only code `6` (`0%`), and omitting `orderLines[].vatType` on the exact `34100` line again created a wrong untaxed `34100` total, so that sandbox state remained blocked for the taxed branch rather than a lower-call replacement
- on the same-day sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so the exact Norwegian `eksklusiv MVA` branch remained blocked there rather than a valid no-VAT shortcut

## Important Constraints

- The correct order-line price field is `unitPriceExcludingVatCurrency`; do not use `unitCostPrice` — it does not exist on the order-line schema and returns `422 Feltet eksisterer ikke i objektet.`
- Do not assume there is a separate public company-level bank-account endpoint in `openapi.json`
- The public/spec-confirmed path that solved this was `PUT /ledger/account/{id}`
- Do not create a second invoice bank account with the same `bankAccountNumber`
- Duplicate bank account numbers trigger validation errors
- Prefer updating existing `1920` over creating a new invoice account
- Do not hardcode invoice/order-line VAT code `3`
- The authoritative candidate set for invoice lines is the filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` result on the invoice date
- If the provided base URL already ends in `/v2`, do not pass endpoint paths with a leading slash into `new URL(...)`; that can silently escape back to host-root `/customer` or `/invoice` and waste a `404`
- If the first common-endpoint call still comes back `404`, inspect the final request path before spending a second Tripletex call; host-root `/customer` or `/invoice` means the client URL builder is wrong, not that the endpoint changed

## Minimal Flow

1. Find or create the customer
   - for the normal fresh-account new-customer variant, skip the pre-read and `POST /customer` directly
   - if creating a new customer and the prompt gives no email or postal address, prefer `invoiceSendMethod: "MANUAL"`
   - only use `GET /customer?organizationNumber=...&fields=*` when the prompt or environment actually implies an existing customer lookup
   - prompt wording like `invoice customer <name> (<organizationNumber>)` is not, by itself, enough reason to spend that pre-read in a fresh-account run
2. **DO NOT call `GET /ledger/vatType`** — hardcode the VAT type ID directly:
   - 25% standard: `vatType: { id: 3 }` — for "excluding VAT" / "eksklusiv MVA" / "hors TVA"
   - 0% outside: `vatType: { id: 6 }` — for "sem IVA" / "ohne MwSt." / "sin IVA"
   - 0% exempt: `vatType: { id: 5 }` — for "avgiftsfri" / "exempt"
   - 15% food: `vatType: { id: 31 }` — for "næringsmiddel" / "alimentaire"
   - 12% low: `vatType: { id: 32 }`; 0% export: `vatType: { id: 52 }`
   - for product-linked lines, reuse `product.vatType.id` from the product read
   - do not omit `vatType` — omission defaults to 0% (vatType.id=0)
   - sandbox-verified 2026-03-22: hardcoded vatType.id=3 works correctly; saves 1 API call
2b. Proactive bank-account check (GETs are free, 4xx errors cost penalty)
   - `GET /ledger/account?isBankAccount=true&fields=*` — parallelize with step 1
   - find the invoice account (usually `number=1920`, `isInvoiceAccount=true`)
   - if `bankAccountNumber` is falsy: `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`
   - this eliminates the 422 + retry POST entirely
3. Create invoice and let the default `sendToCustomer=true` perform the send in the same write
   - include required dates
   - include `orders`
   - include `orderLines` inside the order, not directly on invoice input
   - keep `customer.id` in memory; vatType IDs are hardcoded constants
   - with the proactive bank check in step 2b, this should succeed on the first try
4. If `POST /invoice` still fails with the company-bank-account validation despite step 2b, repair and retry once (see Bank Account Repair — Reactive Fallback)
5. If you need exact line-level proof and the invoice write response is sparse, do one immediate `GET /invoice/{id}` with expanded `fields`

## Invoice Payload Notes

- `invoiceDueDate` is required
- `orders[].deliveryDate` is required
- `invoice.orderLines` is read-only in the schema
- create lines under `orders[].orderLines`

Example shape:

```json
{
  "invoiceDate": "2026-03-19",
  "invoiceDueDate": "2026-04-02",
  "customer": { "id": 123 },
  "orders": [
    {
      "customer": { "id": 123 },
      "orderDate": "2026-03-19",
      "deliveryDate": "2026-03-19",
      "orderLines": [
        {
          "description": "Analyserapport",
          "count": 1,
          "unitPriceExcludingVatCurrency": 7850,
          "vatType": { "id": 6 }
        }
      ]
    }
  ]
}
```

Use the hardcoded vatType ID table: `3` (25%), `31` (15%), `32` (12%), `5` (0% exempt), `6` (0% outside), `52` (0% export). These IDs are stable across sandbox and production.

For create-and-send tasks, omit `sendToCustomer=false` unless the prompt explicitly requires a separate later send step or send-channel override.

## Sparse Response Trap

- `POST /invoice` can succeed while returning `orderLines` only as link objects with `id` and `url`
- do not treat that as a failed line create
- if the task requires exact line-level proof before sending, do one immediate:
  - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`

## If You Still Need to Probe

- First test in sandbox if available
- Reproduce with one simple zero-VAT or standard-VAT line
- If invoice fails after bank-account registration, use the new validation message as the next branch
- Reuse returned IDs from write responses

## Proven Send-Channel Pitfalls

- Do not assume `PUT /invoice/{id}/:send?sendType=MANUAL` is the safe fallback for customers created without email/address; persistent sandbox reproduced `500` on 2026-03-20
- Do not assume sparse customer address links mean `PAPER` send is available; persistent sandbox reproduced `422 Faktura kan ikke sendes via PAPER`
- Do not assume organization number alone makes EHF available; the production run for this task shape reproduced `422 Faktura kan ikke sendes via EHF`
- Do not assume a successful direct-line invoice write without explicit `vatType` means the VAT is correct; persistent sandbox on 2026-03-20 accepted that shape and produced a no-VAT invoice (`28500` total on a `28500` ex-VAT line)
- Do not spend `GET /customer` first on the exact fresh-account shape that only gives `name + organizationNumber` for a new customer; the 2026-03-20 sandbox re-verification proved the lower-call path is direct `POST /customer`, then filtered `GET /ledger/vatType`, then `POST /invoice`
- If the first `POST /invoice` fails only on missing company bank account, do not turn that branch into a full rerun by guessing a new bank number or restarting from customer creation; the minimum recovery is one valid `PUT /ledger/account/{id}` and one retry of the same invoice payload
- If that failed invoice already came after a successful customer create and you no longer hold the customer id locally, resume with `GET /customer?organizationNumber=...&fields=*`, then the same filtered VAT read, then `POST /invoice`
- When the bank-account repair branch fires, retain `customer.id` and `vatType.id` in memory across the repair; the 2026-03-21 production run for `Fjelltopp AS` completed the repair in 6 total calls by retaining state, while the earlier Étoile SARL run wasted 2 calls re-reading both after losing local state (8 total calls)
- **REVERSED 2026-03-22**: DO proactively add `GET /ledger/account` to every create-and-send flow; since GETs are free from scoring and 4xx errors cost penalty, the proactive approach is strictly better or equal in all cases; the 2026-03-22 `Blueshore Ltd` run wasted 1 write + 1 error by using reactive; sandbox-verified 2026-03-22
- Nynorsk prompt language (`nn`) follows the same rules as Bokmål (`nb`): `eksklusiv MVA` → taxed 25% branch
- Do not use `unitCostPrice` on order lines; the only accepted price field is `unitPriceExcludingVatCurrency`; the 2026-03-21 production run for `Étoile SARL` / `976414284` wasted 1 call on this wrong field name before correcting it
- Do not confuse this task shape with the order-based `create-order-invoice-and-register-payment` flow; if the prompt gives only a description (e.g. "Systemutvikling") without product numbers and does not require payment registration, use `POST /invoice` with direct description-only order lines, not `POST /order` + `PUT /order/:invoice`; the order-based flow wastes calls on unnecessary product creation and the two-step order→invoice conversion
- When the prompt gives only a service description without product numbers, do not spend calls on `GET /product` or `POST /product`; `POST /invoice` with `orders[].orderLines[]` containing only `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType` creates the line correctly with `product: null` on readback; sandbox-verified on 2026-03-21
- The 2026-03-21 production run for `Bergvik AS` / `890733751` / `Systemutvikling` / `28900` / `eksklusiv MVA` incorrectly used the order-based flow with product creation and spent 8 calls (1 error); the correct path was this standard's existing-customer variant with bank repair = 6 calls: `GET /customer` → `GET /ledger/vatType` (25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` retry; final state was correct (`amountExcludingVatCurrency=28900`, `amountCurrency=36125`)
- The 2026-03-21 production run for `Brightstone Ltd` / `894181273` / `Cloud Storage` / `14150` / `excluding VAT` (English prompt, existing customer) confirmed the existing-customer direct-line create-and-send variant with bank repair in optimal 6 calls: `GET /customer?organizationNumber=894181273&fields=*` → `GET /ledger/vatType` (id=3, 25%) → `POST /invoice?sendToCustomer=true` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice?sendToCustomer=true` (201); final: `amountExcludingVatCurrency=14150`, `amountCurrency=17687.5`; English definite article "the customer" correctly triggered `GET /customer` instead of `POST /customer`
- The same English definite-article heuristic applies: "the customer X" or "invoice to the customer X" implies existing customer → `GET /customer?organizationNumber=...&fields=*`; this mirrors Norwegian "kunden" (definite) vs "en kunde" (indefinite)
- The same German definite-article heuristic applies: "den Kunden X" or "für den Kunden X" (accusative definite) implies existing customer; "einen Kunden" (accusative indefinite) would imply creating; the 2026-03-21 production run for `Brückentor GmbH` / `804379010` confirmed this: German "den Kunden" correctly indicated existing customer
- The 2026-03-21 Bokmål production run `Nordhav AS` / `876520427` / `Analyserapport` / `7850` / `eksklusiv MVA` confirmed the existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=7850`, `amountCurrency=9812.5`); Norwegian definite "kunden" correctly triggered existing-customer lookup
- The 2026-03-21 English production run `Ironbridge Ltd` / `841254546` / `System Development` / `28500` / `excluding VAT` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=28500`, `amountCurrency=35625`); second English definite-article confirmation after Brightstone Ltd
- The 2026-03-21 Nynorsk production run `Bølgekraft AS` / `892362416` / `Vedlikehald` / `34150` / `eksklusiv MVA` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=34150`, `amountCurrency=42687.5`); 2nd Nynorsk definite-article "kunden" existing-customer confirmation after Sjøbris AS; 13th consecutive optimal run across en/nb/nn/es/fr/de confirms the standard is fully language-independent and stable

## Key Finding: Product-Line Invoices Require Linked Products

When the prompt gives product numbers in parentheses (e.g. "Analysis Report (9796) at 27700 NOK with 25% VAT"), these are NOT just descriptions — they are product numbers that must appear as linked products on the invoice order lines.

**Description-only lines will fail product-related scorer checks** even if amounts and VAT are correct. The 2026-03-21 production run for `Oakwood Ltd` / `909722500` with 3 product lines (9796, 2145, 5995) used description-only lines and scored 5/8 (checks 3, 4, 5 failed).

### New customer (fresh account) — products don't exist yet

1. `POST /customer` with `invoiceSendMethod: "MANUAL"` (parallel)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
3. `POST /product/list` with `[{ "name": "Analysis Report", "number": 9796 }, ...]` (parallel with 1 and 2)
4. `POST /invoice?sendToCustomer=true` with `product: { "id": <id> }` on each order line

This is 4 calls in the happy path (3 parallel + 1 invoice), or 7 with bank-account repair.

### Existing customer — products may already exist

When the prompt uses a definite article (Norwegian "kunden", English "the customer", German "den Kunden"), the customer already exists AND products with the given numbers may already be pre-loaded. Blindly using `POST /product/list` will return `422 Produktnummeret X er i bruk`, wasting a call and counting as a scored error.

1. `GET /customer?organizationNumber=...&fields=*` (parallel)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
3. `GET /product?fields=id,number&count=1000` (parallel with 1 and 2) — match by `String(p.number)` client-side
4. If all products found → `POST /invoice?sendToCustomer=true` (total: 4 or 7 with bank repair)
5. If any products missing → `POST /product/list` with only missing ones, then `POST /invoice` (total: 5 or 8 with bank repair)

The 2026-03-21 production run for `Brückentor GmbH` / `804379010` hit the existing-product pitfall: the agent used `POST /product/list` which returned 422, then had additional string/number comparison bugs, totaling 11 API calls instead of the optimal 7. The correct path was: `GET /customer` + `GET /vatType` + `GET /product` (parallel) → `POST /invoice` (422 bank) → bank repair → `POST /invoice` retry.

### Sandbox-verified pitfalls
- `product: { "number": 9796 }` on order line does NOT resolve products — readback shows `product: null`; must use `product: { "id": <id> }`
- Inline product creation via invoice (product with name+number but no id in order line) does NOT work — readback shows `product: null`
- Products must be pre-created via `POST /product/list` (batch) or `POST /product` (single), or looked up via `GET /product` if they already exist

### CRITICAL type pitfall: string comparison

Tripletex returns `product.number` and `vatType.number` as **strings**, never numbers. All comparisons must use string-safe equality:
- WRONG: `[2626, 7746].includes(p.number)` — silently returns false because `"2626" !== 2626`
- WRONG: `v.number === 5` — fails because vatType number is `"5"` not `5`
- RIGHT: `String(p.number) === String(targetNum)` or `Number(p.number) === targetNum`

The Brückentor run wasted 3 calls on this bug: product lookup returned 0 matches despite products existing, and vatType 0%-exempt was not found despite being in the response.

## Key Finding: Multi-VAT-Rate Invoices

When the prompt specifies different VAT rates for different lines (e.g. 25%, 15% food, 0% exempt), the single `GET /ledger/vatType?typeOfVat=OUTGOING` call returns ALL available outgoing VAT types. Select the correct one for each line:

- 25% standard: look for `percentage === 25` (production code 3)
- 15% food/drink: look for `percentage === 15` (production code 31)
- 12% low rate: look for `percentage === 12` (production code 32)
- 0% exempt (within VAT law): look for `percentage === 0` AND `Number(v.number) === 5` (avgiftsfri) — remember `v.number` is a string
- 0% outside VAT area: look for `percentage === 0` AND `Number(v.number) === 6`
- 0% export: look for `percentage === 0` AND `Number(v.number) === 52`

When the prompt says "0% VAT (exempt)", prefer code 5 (within VAT law/avgiftsfri). When the prompt says "food" or "mat", select the 15% rate (code 31). One vatType lookup serves all lines.
