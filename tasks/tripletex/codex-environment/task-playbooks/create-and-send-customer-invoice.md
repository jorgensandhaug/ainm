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

The same no-VAT branch also covers Spanish wording such as `sin IVA`. The 2026-03-21 production run for `Río Verde SL` / `894012358` / `Sesión de formación` / `29100` used 6 calls (with bank-account repair) and confirmed `amountExcludingVatCurrency=amountCurrency=29100`:

1. `POST /customer` with `invoiceSendMethod: "MANUAL"` (parallel with step 2)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` (found 0% at code 5)
3. `POST /invoice` (422 — missing company bank account)
4. `GET /ledger/account?isBankAccount=true&fields=*`
5. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"`
6. `POST /invoice` (201 — success)

## Key Finding: Company Bank Account Registration Is A Repair Branch

If `POST /invoice` fails with:

`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`

then the practical fix is:

1. Find the company bank ledger account with:
   `GET /ledger/account?isBankAccount=true&fields=*`
2. Pick the existing invoice account:
   usually account `1920`
   must have `isInvoiceAccount=true`
3. Register the bank account number on that account:

```http
PUT /ledger/account/{id}
{
  "bankAccountNumber": "12345678903"
}
```

This was verified in sandbox:
- invoice creation failed before this update
- invoice creation succeeded after this update
- the known-good minimal payload on the existing invoice account is `{ "bankAccountNumber": "12345678903" }`
- do not burn calls on an improvised locally generated bank-account number unless this exact minimal repair itself fails
- if you do need a different number, use a valid Norwegian mod-11 checksum with weights `5,4,3,2,7,6,5,4,3,2` across the first ten digits; the wrong weight order only burns a `422`
- once that repair branch has already identified the invoice `account.id`, reuse it directly; do not spend a second `/ledger/account` read after a local repair-payload mistake
- if the customer create already succeeded and you later lose local process state, resume on the existing-customer branch instead of repeating `POST /customer`

## Key Finding: Resolve VAT Type Dynamically

Do not hardcode invoice line `vatType.id = 3`.

Use:

`GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`

and choose from the filtered result for the actual invoice date.

This was re-verified in sandbox on 2026-03-19:
- `POST /invoice` failed with `Ugyldig mva-kode.` when line VAT was hardcoded to `3`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6`
- invoice creation succeeded after using the dynamically resolved VAT type from that filtered result

## Key Finding: Omitting Line VAT Is A Fake Optimization

Do not try to save the `GET /ledger/vatType` call for a simple direct service line by omitting `orderLines[].vatType`.

Persistent sandbox re-verification on 2026-03-20 showed:
- `POST /invoice` without line `vatType` still succeeded
- the resulting invoice had `amountExcludingVatCurrency=28500` and `amountCurrency=28500`
- in that sandbox account, the filtered outgoing VAT result for the same date only exposed VAT code `6` (`0%`)
- hardcoding `vatType.id = 3` still failed with `422 ... Ugyldig mva-kode.`

So the lower-call omission path can silently create a no-VAT invoice instead of the intended taxable-service invoice. For this task shape, the dynamic filtered VAT lookup remains the minimum safe path.

For exact direct-line no-VAT prompts, the same rule still applies:

- do not omit `orderLines[].vatType`
- resolve the filtered outgoing `0%` VAT row that actually exists in the current account

Persistent sandbox re-verification on 2026-03-20 for `Porto Alegre Lda` / `826870192` / `Design web` / `22700` showed:

- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6`
- `POST /invoice` with that resolved `vatType.id=6` succeeded
- the write response already proved the intended no-VAT outcome with `amountExcludingVatCurrency=22700` and `amountCurrency=22700`

The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` and the same-day persistent sandbox re-check on analogous org `842889155` reconfirmed the same branch:

- direct `POST /customer`
- filtered outgoing VAT read returning code `6` (`0%`)
- direct `POST /invoice`
- no customer pre-read
- no explicit `PUT /invoice/{id}/:send`

For ordinary direct-line service prompts that are explicitly priced excluding VAT / MVA, the same dynamic rule becomes an exact `25%` selector:

- use the filtered outgoing VAT read
- choose an exact `25%` row, not the first returned row
- if the filtered result exposes only `0%`, treat the run as blocked in that account instead of downgrading the invoice to `0%`
- French `hors TVA` and Norwegian `eksklusiv MVA` belong to this taxed ex-VAT branch. Do not misread them as `sans TVA` / `0%`.

This was re-confirmed on 2026-03-20 across production plus persistent sandbox:

- the production run for `Snøhetta AS` / `871844062` / `Webdesign` / `20100` succeeded in `3` calls: direct `POST /customer`, filtered outgoing VAT read, then `POST /invoice`
- the French production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` also succeeded in the same `3` calls and confirms the same taxed branch
- the later same-day French production run for `Lumière SARL` / `959714320` / `Stockage cloud` / `34100` again used the same exact `3` calls and preserved the Unicode customer name exactly as prompted
- the production invoice write already proved the taxed outcome with `amountExcludingVatCurrency=20100` and `amountCurrency=25125`
- the persistent sandbox on the same date still exposed only VAT code `6` (`0%`)
- on that sandbox account, omitting `vatType` for the same `20100` / `Webdesign` line silently created `amountCurrency=20100`
- on that sandbox account, hardcoded `vatType.id=3` still failed with `422 ... Ugyldig mva-kode.`
- on the analogous sandbox probe `944164341` / `Service reseau` / `44750`, omission again created a wrong untaxed `44750` total and hardcoded `vatType.id=3` again failed with `422 ... Ugyldig mva-kode.`
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
2. Resolve a valid outgoing VAT type for the invoice date when the line VAT is not already safely implied by the resolved product/account setup
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   - use a VAT type that actually exists in that filtered response
   - do not omit direct-line `vatType` just because the write may still succeed; that can silently produce a no-VAT invoice
   - this also applies to explicit no-VAT direct-line prompts; resolve the filtered outgoing `0%` row instead of assuming omission is equivalent
   - for ordinary service prompts priced excluding VAT / MVA, require an exact `25%` row from that filtered result; if `25%` is absent, stop as blocked for that account
3. Create invoice and let the default `sendToCustomer=true` perform the send in the same write
   - include required dates
   - include `orders`
   - include `orderLines` inside the order, not directly on invoice input
   - once customer resolution and filtered VAT resolution have succeeded, keep `customer.id` and `vatType.id` in memory; a local request-construction bug is not a reason to repeat either call in the same run
4. If `POST /invoice` fails with the company-bank-account validation, repair that prerequisite once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - update the existing invoice account with `PUT /ledger/account/{id}` and minimal payload `{ "bankAccountNumber": "12345678903" }`
   - only if that exact value collides or is otherwise unusable, generate another checksum-valid unique number with the same `5,4,3,2,7,6,5,4,3,2` mod-11 rule
   - if that repair branch already resolved the invoice `account.id`, reuse it instead of repeating the same `/ledger/account` read
   - retry the invoice write once
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

In real tasks, replace `6` with the VAT type resolved from the filtered `GET /ledger/vatType` response for the invoice date. Do not assume the same code is valid across accounts.

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
- Do not preemptively add `GET /ledger/account` to every create-and-send flow to avoid the bank-account 422; sandbox verification on 2026-03-21 showed the preemptive approach costs 4 calls in the happy case (vs 3 sequential) with no wall-clock benefit, making it worse ~70% of the time
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
