# Create And Send Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- send it as part of the same minimal flow
- invoice has one or more simple direct order lines (description-only or with product numbers to create or look up)
- prompt gives the customer identity directly or the customer is resolvable in one decisive read
- prompt does not require a specific send channel override such as a forced email address

## Do Not Use This Standard If
- prompt requires a specific send channel that is not already safely implied by known customer data
- prompt requires looking up existing products by name/description without product numbers (use `./trusted-standards/create-order-invoice-and-register-payment.md` instead)
- task is payment, reversal, or correction

## Standard Flow
1. if the prompt explicitly identifies an already-existing customer, resolve that customer in one decisive `GET /customer?...&fields=*`; otherwise, in the normal fresh-account variant, create the customer directly
2. if creating a new customer and the prompt gives no email or postal address, `POST /customer` with:
   - `name`
   - `organizationNumber`
   - `invoiceSendMethod: "MANUAL"`
3. if the prompt gives product numbers (e.g. "Analysis Report (9796)"):
   - **new customer (step 2)**: batch-create all products in one call: `POST /product/list` with `[{ "name": "<description>", "number": <number> }, ...]`; in production fresh accounts these products will not exist yet; parallelize this call with steps 2 and 3a
   - **existing customer (step 1)**: products with the given numbers may already exist; use `GET /product?fields=id,number&count=1000` in the parallel batch, then match by `String(p.number)` client-side; if all products found, use their IDs directly (no product creation needed, saving 1 call and 0 errors); if any are missing, `POST /product/list` with only the missing ones; this avoids the `422 Produktnummeret X er i bruk` error that wastes a call and penalizes the score
3a. resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`; for the existing-customer description-only variant (no products), parallelize steps 1 and 3a — they have no dependency on each other
3b. proactive bank-account check (GETs are free, the 422 error costs 1 write + 1 error penalty): `GET /ledger/account?isBankAccount=true&fields=*`; parallelize with steps 1/3a; find the invoice account (usually `number=1920`, `isInvoiceAccount=true`); if `bankAccountNumber` is falsy (null, empty, undefined), fix it BEFORE the invoice write: `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`; this eliminates the 422 + retry entirely — sandbox-verified 2026-03-22; production-confirmed on Blueshore Ltd run (would have saved 1 write + 1 error)
4. `POST /invoice` and let the default `sendToCustomer=true` handle the send in the same write; if products were created in step 3, reference them on each order line as `product: { "id": <id-from-batch-create-response> }`; with the proactive bank-account check in step 3b, this should succeed on the first try
5. only if the invoice write still fails with missing company bank account despite step 3b (edge case):
   - `GET /ledger/account?isBankAccount=true&fields=*` (if not already done)
   - `PUT /ledger/account/{id}` on the existing invoice account (usually `1920`) with minimal payload `{ "bankAccountNumber": "12345678903" }`
   - if you must generate a different number, keep it unique and checksum-valid; the working Norwegian mod-11 weights are `5,4,3,2,7,6,5,4,3,2` across the first ten digits
   - once that repair branch has already identified the invoice `account.id`, reuse it directly; do not spend a second `/ledger/account` read after a local repair-payload mistake
   - retry the same `POST /invoice` once
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - `orders[].customer`
  - `orders[].orderDate`
  - `orders[].deliveryDate`
  - `orders[].orderLines`
- create lines under `orders[].orderLines`, not `invoice.orderLines`
- if the prompt gives product numbers, each order line must include `product: { "id": <product-id> }` where the product was created in step 3 or resolved from the existing product lookup; description-only lines (no product number) should omit `product` entirely
- when the prompt gives multiple lines with different VAT rates (e.g. 25%, 15% food, 0% exempt), select the correct `vatType.id` for each line from the filtered outgoing VAT result; production accounts expose codes 3 (25%), 31 (15%), 5 (0% exempt), 6 (0% outside), 32 (12%), 52 (0% export)
- do not hardcode output VAT code `3`
- do not omit direct-line `vatType` just to save the VAT lookup; a successful write can still create the wrong VAT outcome
- for explicit no-VAT / `0%` direct-line prompts, still resolve the current account's filtered outgoing `0%` VAT row instead of assuming omission is equivalent
- for ordinary direct-line services explicitly priced excluding VAT / MVA, select an exact `25%` row from the filtered outgoing VAT result; if no such row exists, treat the task as blocked in that account instead of falling back to `0%`
- if creating the customer with no delivery/contact details, prefer `invoiceSendMethod: "MANUAL"` and let the invoice create do the send attempt

## Reuse From Write Response
- `customer.value.id`
- `invoice.value.id`
- `invoice.value.invoiceNumber`
- totals from the invoice write response
- keep the resolved `customer.id` and filtered outgoing `vatType.id` in memory until the invoice write has either succeeded or been conclusively blocked; a local helper bug is not a reason to repeat those reads in the same run

## Verification (GETs are FREE — use them)
GETs do not count against the score. After the invoice write, verify:

```
GET /invoice/{id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*))
```
Log: invoiceNumber, amountExcludingVatCurrency, amountCurrency, customer, order lines, isSent. Confirm all fields match the prompt.

Treat a successful `POST /invoice` with default `sendToCustomer=true` as the winning send path. Do not add an automatic follow-up `PUT /invoice/{id}/:send`.

## Known Recovery Branches
- if invoice creation fails with missing company bank account:
  - repair the existing invoice bank account and retry the same invoice write once
- if the prompt explicitly identifies an already-existing customer, use one decisive customer read instead of blind customer create
- if customer creation already succeeded but local process state is lost before the repaired retry:
  - resume with `GET /customer?organizationNumber=...&fields=*`, the same filtered outgoing VAT read, and the same `POST /invoice`

## Known Pitfalls
- the correct order-line price field is `unitPriceExcludingVatCurrency`; do not use `unitCostPrice` — it does not exist on the order-line schema and returns `422 Feltet eksisterer ikke i objektet.`; the 2026-03-21 production run for `Étoile SARL` / `976414284` / `Heures de conseil` / `20000` wasted one call on this wrong field name before correcting it
- do not spend `GET /customer` first on the normal fresh-account new-customer variant
- do not treat wording like `invoice customer <name> (<organizationNumber>)` as proof that the customer already exists; when the prompt only supplies business identity and the environment implies a fresh account, the winning path is still direct `POST /customer`
- do not branch into `PUT /invoice/{id}/:send?sendType=MANUAL` as the default path; sandbox reproduced `500` on 2026-03-20 while the same task shape succeeded through `POST /invoice` with default send behavior
- do not assume sparse `postalAddress` or `physicalAddress` links on the customer prove that `PAPER` send is available; sandbox returned `422 Faktura kan ikke sendes via PAPER`
- do not assume organization number alone proves EHF sendability; production returned `422 Faktura kan ikke sendes via EHF`
- do not treat a successful `POST /invoice` without `orderLines[].vatType` as proof that VAT is correct; persistent sandbox on 2026-03-20 accepted that lower-call write and created `amountCurrency == amountExcludingVatCurrency` (`28500`) on the same task shape
- when the provided base URL already ends in `/v2`, do not pass endpoint paths with a leading slash into `new URL(...)`; that can drop `/v2` and waste a `404` before any real Tripletex write
- if the first common-endpoint call comes back `404` and the path clearly fell back to host-root instead of `/v2/...`, stop and fix the client URL builder locally before making any second Tripletex call
- for the exact one-line no-VAT service shape with prompt-only `name + organizationNumber + amount + description`, do not add a speculative customer lookup before the customer create; persistent sandbox re-verification on 2026-03-20 succeeded in `3` calls with `POST /customer`, filtered `GET /ledger/vatType`, then `POST /invoice`
- the same exact no-VAT branch also covers Portuguese wording such as `sem IVA`; the 2026-03-20 production run for `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` used the same `3` calls and did not need `GET /customer` or `PUT /invoice/{id}/:send`
- the same exact no-VAT branch also covers German wording such as `ohne MwSt.`; the 2026-03-20 production run for `Bergwerk GmbH` / `981122011` / `Datenberatung` / `45150` used the same `3` calls and did not need `GET /customer`, `GET /ledger/account`, or `PUT /invoice/{id}/:send`
- the same exact no-VAT branch also covers Spanish wording such as `sin IVA`; the 2026-03-21 production run for `Río Verde SL` / `894012358` / `Sesión de formación` / `29100` used 6 calls (with bank-account repair): `POST /customer` → `GET /ledger/vatType` (found vatType.id=5 at 0%) → `POST /invoice` (422 bank account) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=29100`, `amountCurrency=29100`); customer.id and vatType.id were correctly retained across the repair branch; this is the first Spanish no-VAT production confirmation
- for ordinary one-line service prompts that explicitly price the work excluding VAT / MVA, do not take the first filtered VAT row if it is `0%`; the safe branch is exact `25%` selection or a blocked conclusion for that account
- if the first `POST /invoice` fails only on missing company bank account, do not let a local helper bug or ad hoc bank-number guess force a full script restart; the minimum recovery is still one valid `PUT /ledger/account/{id}` and one retry of the same invoice payload
- do not invent the bank-account checksum branch during a scored run; production reflection on 2026-03-20 burned `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer` on the wrong weight order before the valid mod-11 routine was restored
- once `GET /ledger/account?isBankAccount=true&fields=*` has already identified the invoice account, do not repeat that same read just because the first repair attempt failed locally; reuse the same `account.id`
- if that first failed invoice happened after a successful customer create, do not blind-retry `POST /customer`; if you lost in-memory state, resume on the existing-customer branch instead
- French wording such as `hors TVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` succeeded in the canonical `3` calls, while the same-day persistent sandbox still exposed only `0%`, produced a wrong untaxed `44750` total when `vatType` was omitted, and rejected hardcoded `vatType.id=3` with `422`.
- Norwegian wording such as `eksklusiv MVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 persistent-sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` still exposed only VAT code `6` (`0%`) on the filtered outgoing VAT read for `2026-03-20`, so that sandbox state remains blocked for the taxed branch rather than a valid lower-call shortcut.
- when the bank-account repair branch fires, retain `customer.id` and `vatType.id` in memory across the repair; the Étoile SARL 2026-03-20 run wasted 2 calls re-reading both after losing local state, while the Fjelltopp AS 2026-03-21 run retained both and completed the repair branch in 6 total calls instead of 8
- **REVERSED 2026-03-22**: DO proactively add `GET /ledger/account` to every create-and-send flow; since GETs are free from a scoring perspective and 4xx errors cost penalty, the proactive approach is strictly better: happy case costs 1 write + 0 errors (same as reactive), repair case costs 2 writes + 0 errors (vs reactive 3 writes + 1 error); the 2026-03-22 production run for `Blueshore Ltd` / `987928921` used reactive approach and wasted 1 write + 1 error; sandbox-verified 2026-03-22: proactive 3-way parallel succeeds with 0 errors
- Nynorsk prompt language (`nn`) follows the same rules as Bokmål (`nb`): `eksklusiv MVA` → taxed 25% branch, `Nettverksteneste` preserved as-is in the order line description
- do not confuse description-only invoice tasks (where the prompt gives only a service description like "Systemutvikling" without product numbers) with the order-based `create-order-invoice-and-register-payment` flow; description-only lines work perfectly with `POST /invoice` using `orders[].orderLines[]` with `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType` — no product creation or product lookup is needed; sandbox readback confirmed `product: null` on the resulting order line
- when the Norwegian prompt says "kunden" (the customer, with definite article), the customer already exists; use `GET /customer?organizationNumber=...&fields=*` to resolve, not `POST /customer`; "en kunde" (a customer, indefinite) would imply creating
- the same definite-article heuristic applies in English: "the customer Brightstone Ltd" or "invoice to the customer X" implies the customer already exists; use `GET /customer?organizationNumber=...&fields=*` instead of `POST /customer`
- the same definite-article heuristic applies in German: "den Kunden Brückentor GmbH" or "für den Kunden X" (accusative definite) implies the customer already exists; use `GET /customer` instead of `POST /customer`; "einen Kunden" (accusative indefinite) would imply creating
- when the prompt says "create and send" an invoice, always match this standard (`create-and-send-customer-invoice.md`), not the create-only standard (`create-customer-invoice.md`); matching the wrong standard wastes agent time even if the final flow is similar
- the 2026-03-21 production run for `Bergvik AS` / `890733751` / `Systemutvikling` / `28900` / `eksklusiv MVA` used the wrong flow entirely — the agent selected the order-based standard (`create-order-invoice-and-register-payment`) instead of this standard, then created an unnecessary product and used `POST /order` + `PUT /order/:invoice` instead of direct `POST /invoice`; that cost 8 calls instead of the optimal 6 (with bank repair); the correct path was: `GET /customer` → `GET /ledger/vatType` (25%) → `POST /invoice` (422 bank account) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` retry
- **CRITICAL product-line pitfall**: when the prompt gives product numbers in parentheses (e.g. "Analysis Report (9796)"), those products must be created and referenced on order lines; description-only lines (`product: null` on readback) will fail product-related scorer checks; the 2026-03-21 production run for `Oakwood Ltd` / `909722500` / `Analysis Report (9796)` + `Maintenance (2145)` + `System Development (5995)` used description-only lines and failed 3 of 6 checks (checks 3, 4, 5) despite correct amounts and VAT; the correct path adds one `POST /product/list` call to batch-create all products, then references them by `product: { "id": <id> }` on each order line
- `POST /product/list` batch-creates multiple products in one call; sandbox-verified on 2026-03-21: `[{ "name": "Analysis Report", "number": 9796 }, { "name": "Maintenance", "number": 2145 }, { "name": "System Development", "number": 5995 }]` → returns all three IDs in one `201` response; this call can be parallelized with the customer resolution and VAT lookup
- `product: { "number": 9796 }` on an order line does NOT resolve to an existing product; Tripletex silently ignores the number-only reference and the readback shows `product: null`; always use `product: { "id": <id> }` from the batch-create response
- inline product creation via invoice (e.g. `product: { "name": "X", "number": 9796 }` on an order line inside `POST /invoice`) does NOT work; the invoice is created but readback shows `product: null`; products must be pre-created separately
- when the prompt gives product numbers, the optimal call count depends on whether the customer is new or existing:
  - **new customer** (fresh account): 4 calls (3 parallel [POST /customer + GET /vatType + POST /product/list] + 1 invoice), or 7 with bank repair
  - **existing customer** with existing products: 4 calls (3 parallel [GET /customer + GET /vatType + GET /product] + 1 invoice), or 7 with bank repair
  - **existing customer** with missing products: 5 calls (3 parallel [GET /customer + GET /vatType + GET /product] + 1 POST /product/list + 1 invoice), or 8 with bank repair
- **CRITICAL: when the customer is existing (definite article), do NOT blindly POST /product/list** — the products may already exist and `POST /product/list` returns `422 Produktnummeret X er i bruk` which wastes a call and counts as a scored error; instead use `GET /product?fields=id,number&count=1000` in the parallel batch and match by `String(p.number)` client-side; the 2026-03-21 production run for `Brückentor GmbH` / `804379010` hit this exact pitfall and wasted 4+ calls recovering from it
- **CRITICAL type pitfall**: Tripletex returns `product.number` and `vatType.number` as **strings**, not numbers; `[2626, 7746].includes(p.number)` silently fails because `"2626" !== 2626`; always compare with `String(p.number) === String(targetNum)` or `Number(p.number) === targetNum`; the same pitfall applies to vatType: `v.number === 5` fails, use `Number(v.number) === 5` instead; the Brückentor run wasted 3 calls on this bug alone (product lookup returned 0 matches, vatType 0%-exempt not found)

## OpenAPI / Sandbox Status
- `/customer`, `/invoice`, `/ledger/vatType`, and `/ledger/account` verified in `./openapi.json`
- minimal create-and-send path re-verified in persistent sandbox on 2026-03-20:
  - `POST /customer` with `invoiceSendMethod: "MANUAL"` succeeded
  - `POST /invoice` with default `sendToCustomer=true` succeeded for the same customer
  - explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` reproduced `500`
  - explicit later `PUT /invoice/{id}/:send?sendType=PAPER` reproduced `422`
- VAT handling re-verified in persistent sandbox on 2026-03-20 for the same one-line service invoice shape:
  - `POST /invoice` without line `vatType` succeeded but created a no-VAT invoice (`amountExcludingVatCurrency=28500`, `amountCurrency=28500`)
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
  - hardcoded line `vatType.id=3` failed with `422 ... Ugyldig mva-kode.`
- exact ordinary-service ex-VAT create-and-send shape re-confirmed across production plus sandbox on 2026-03-20:
  - production run `Snøhetta AS` / `871844062` / `Webdesign` / `20100` succeeded in the canonical `3` calls: `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
  - the production invoice write already proved the intended taxed outcome with `amountExcludingVatCurrency=20100` and `amountCurrency=25125`
  - the persistent sandbox still exposed only VAT code `6` (`0%`) for the same date, so the exact same prompt shape would be blocked there for standard VAT rather than downgraded to `0%`
  - the French prompt variant `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` succeeded in the same canonical `3` calls in production and confirms that `hors TVA` must be normalized to ordinary taxed ex-VAT handling, not `0%`
  - the same-day persistent sandbox re-check on analogous org `944164341` again exposed only VAT code `6`, created a wrong untaxed `44750` total when `orderLines[].vatType` was omitted, and rejected hardcoded `vatType.id=3` with `422 Ugyldig mva-kode.`
  - the later same-day French production run `Lumière SARL` / `959714320` / `Stockage cloud` / `34100` again finished on the same exact `3` calls and preserved the Unicode customer name exactly as prompted
  - the later same-day French production run `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` confirmed the conditional bank-account repair branch for the same taxed direct-line shape: after the standard `POST /customer` and filtered outgoing VAT read, the first `POST /invoice` failed on missing company bank account, `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` repaired the prerequisite, and the existing-customer resume branch `GET /customer?organizationNumber=995085488&fields=*` -> filtered outgoing VAT read -> `POST /invoice` then completed with `amountExcludingVatCurrency=7250` and `amountCurrency=9062.5`; that run wasted 2 calls by re-reading customer and vatType after losing local state
  - the 2026-03-21 Norwegian `nn` production run `Fjelltopp AS` / `927173875` / `Nettverksteneste` / `42600` / `eksklusiv MVA` confirmed the same bank-account repair branch in 6 total calls (vs Étoile's 8): `POST /customer` → `GET /ledger/vatType` (found `vatType.id=3` at 25%) → `POST /invoice` (422 bank account) → `GET /ledger/account` (found account 1920, id=371676328) → `PUT /ledger/account/371676328` (registered `12345678903`) → `POST /invoice` (201, `amountExcludingVatCurrency=42600`, `amountCurrency=53250`); the key improvement was retaining `customer.id` and `vatType.id` in memory across the repair branch
  - the same-day persistent sandbox analog `Lumière Reflection b9572091 SARL` / `957223729` still exposed only VAT code `6` (`0%`); for that exact `34100` line, omitting `orderLines[].vatType` created a wrong untaxed `34100` total, so that sandbox account remains blocked for the taxed branch rather than a valid shortcut
  - the same-day persistent sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` re-confirmed that Norwegian wording `eksklusiv MVA` follows the same taxed branch: after the standard `POST /customer`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so that sandbox account remained blocked for the taxed branch rather than a no-VAT fallback
  - a same-day persistent sandbox control re-check on the provided follow-up sandbox still exposed only VAT code `6` (`0%`) for `2026-03-20`; the exact taxed `7250` branch therefore remained blocked there, but the surrounding create-and-send mechanics still re-proved cleanly in `3` calls on a control line by using the available `0%` row with the same `POST /customer` -> filtered `GET /ledger/vatType` -> `POST /invoice` flow
  - the 2026-03-21 production run `Étoile SARL` / `976414284` / `Heures de conseil` / `20000` / `hors TVA` completed in 7 calls (1 wasted) with bank-account repair branch; the wasted call was from using `unitCostPrice` instead of `unitPriceExcludingVatCurrency` — `unitCostPrice` does not exist on the order-line schema; the optimal path for the same bank-repair shape is 6 calls: `POST /customer` → `GET /ledger/vatType` (found `vatType.id=3` at 25%) → `POST /invoice` (422 bank account) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=20000`, `amountCurrency=25000`); customer.id and vatType.id were correctly retained across the repair branch
  - the same-day persistent sandbox re-check confirmed `unitCostPrice` returns `422 Feltet eksisterer ikke i objektet.` while `unitPriceExcludingVatCurrency` succeeds
- exact no-VAT direct-line create-and-send shape re-verified in persistent sandbox on 2026-03-20:
  - fresh-account-style branch: on the same one-line `22700` / `Design web` / `0%` shape, direct `POST /customer` with `invoiceSendMethod=MANUAL`, then `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, then `POST /invoice` succeeded without any customer pre-read
  - the filtered VAT read returned only code `6` (`0%`)
  - the invoice write returned `amountExcludingVatCurrency=22700`, `amountCurrency=22700`, and an invoice number without any extra verification read
  - on the exact `Porto Alegre Lda` / `826870192` task identity, once that customer existed in sandbox, the existing-customer branch also succeeded with one decisive `GET /customer?organizationNumber=826870192&fields=*`, the same filtered VAT read, and the same invoice write
- exact Portuguese no-VAT direct-line create-and-send shape re-confirmed across production plus persistent sandbox on 2026-03-20:
  - production run `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` succeeded in the canonical `3` calls: direct `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
  - the production invoice write already proved the intended no-VAT outcome with `amountExcludingVatCurrency=11200` and `amountCurrency=11200`
  - persistent sandbox re-check on the analogous fresh-customer `842889155` shape returned VAT code `6` (`0%`) and the same `11200` / `11200` totals through the same `3` calls, again without any customer pre-read or explicit `:send` call
- exact German no-VAT direct-line create-and-send shape re-confirmed across production plus persistent sandbox on 2026-03-20:
  - production run `Bergwerk GmbH` / `981122011` / `Datenberatung` / `45150` / `ohne MwSt.` succeeded in the canonical `3` calls: direct `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
  - the production invoice write already proved the intended no-VAT outcome with `amountExcludingVatCurrency=45150` and `amountCurrency=45150`
  - persistent sandbox proof on analogous fresh-customer `999518478` / `Bergwerk Reflection 999518478 GmbH` returned only VAT code `6` (`0%`) and the same `45150` / `45150` totals through the same `3` calls, again without any customer pre-read, bank-account repair, or explicit `:send` call
- preemptive bank-account resolution tested in persistent sandbox on 2026-03-21:
  - 3-way parallel `[POST /customer, GET /ledger/vatType, GET /ledger/account]` completed in 141ms but total flow took 1423ms (4 calls) vs 616ms sequential (3 calls) for the same happy-path outcome
  - ~~preemptive checking adds 1 unnecessary call (~70% of production runs don't need bank repair) with no wall-clock benefit from parallelization~~
  - **REVERSED 2026-03-22**: since GETs are free from scoring and 4xx errors cost penalty, the extra free GET is worth it; proactive approach is now the recommended default; sandbox re-verified 2026-03-22: 3-way parallel [GET /customer, GET /ledger/vatType, GET /ledger/account] + conditional PUT + POST /invoice succeeded with 0 errors
- production VAT environment re-confirmed on 2026-03-21:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` on a production account returned VAT codes 3 (25%), 31 (15%), 32 (12%), 5 (0%), 52 (0%), 6 (0%) — the full set
  - persistent sandbox for the same date still returns only code 6 (0%)
  - this confirms that `vatType.id=3` at 25% is valid in production but NOT in sandbox; dynamic lookup remains essential
- description-only order lines (no product reference) verified in persistent sandbox on 2026-03-21:
  - `POST /invoice` with `orders[].orderLines[].description = "Systemutvikling"`, `count = 1`, `unitPriceExcludingVatCurrency = 28900`, `vatType.id = 6` succeeded in 201
  - readback via `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))` showed `product: null`, `description: "Systemutvikling"`, correct price and VAT
  - this proves no `POST /product` or `GET /product` is needed for description-only invoice tasks; `POST /invoice` handles product-less lines natively
  - the 2026-03-21 production run for `Bergvik AS` / `890733751` / `Systemutvikling` / `28900` / `eksklusiv MVA` should have used this exact standard but instead used the order-based flow and spent 8 calls (2 wasted on product search/creation + wrong flow choice); the optimal was 6 calls: `GET /customer` → `GET /ledger/vatType` → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` retry; the production invoice returned `amountExcludingVatCurrency=28900`, `amountCurrency=36125` (25% VAT)
- existing-customer direct-line create-and-send confirmed in production on 2026-03-21:
  - the production run for `Brightstone Ltd` / `894181273` / `Cloud Storage` / `14150` / `excluding VAT` (English prompt, existing customer) succeeded with optimal 6 API calls and 0 avoidable errors
  - `GET /customer?organizationNumber=894181273&fields=*` resolved the existing customer (id=108328570, name=Brightstone Ltd)
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` resolved the outgoing VAT (id=3, 25%)
  - `POST /invoice?sendToCustomer=true` hit the known bank-account validation (422)
  - bank-account repair: `GET /ledger/account?isBankAccount=true&fields=*` → `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` → retry `POST /invoice?sendToCustomer=true` succeeded (201)
  - final invoice: id=2147643106, invoiceNumber=1, `amountExcludingVatCurrency=14150`, `amountCurrency=17687.5` (14150 × 1.25)
  - the existing-customer branch (3 core + 3 repair = 6 calls) matches the optimal new-customer + repair shape
  - the prompt "the customer Brightstone Ltd" with English definite article correctly triggered `GET /customer` instead of `POST /customer`
  - the 2026-03-21 Nynorsk production run `Sjøbris AS` / `847830840` / `Nettverksteneste` / `7350` / `eksklusiv MVA` confirmed the same existing-customer + bank-repair shape in 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=7350`, `amountCurrency=9187.5`); this is the first Nynorsk definite-article "kunden" production confirmation of the existing-customer branch
  - the 2026-03-21 Bokmål production run `Nordhav AS` / `876520427` / `Analyserapport` / `7850` / `eksklusiv MVA` confirmed the same existing-customer + bank-repair shape in 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` (found account 1920, id=376779062) → `PUT /ledger/account/376779062` (registered `12345678903`) → `POST /invoice` (201, `amountExcludingVatCurrency=7850`, `amountCurrency=9812.5`); this confirms the Bokmål definite-article "kunden" existing-customer branch and validates the previously sandbox-blocked Nordhav/Analyserapport/7850 task shape in production
  - the 2026-03-21 English production run `Ironbridge Ltd` / `841254546` / `System Development` / `28500` / `excluding VAT` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` (found account 1920, id=377193269) → `PUT /ledger/account/377193269` (registered `12345678903`) → `POST /invoice` (201, `amountExcludingVatCurrency=28500`, `amountCurrency=35625`); second English definite-article existing-customer confirmation after Brightstone Ltd; customer.id and vatType.id correctly retained across repair branch
  - the 2026-03-21 Nynorsk production run `Bølgekraft AS` / `892362416` / `Vedlikehald` / `34150` / `eksklusiv MVA` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` (found account 1920, id=478375694) → `PUT /ledger/account/478375694` (registered `12345678903`) → `POST /invoice` (201, `amountExcludingVatCurrency=34150`, `amountCurrency=42687.5`); 2nd Nynorsk definite-article "kunden" existing-customer confirmation after Sjøbris AS; sandbox re-verified description "Vedlikehald" preserved exactly with `product: null` on readback
  - persistent sandbox re-verification on 2026-03-21 confirmed the same create-and-send mechanics with `sendToCustomer=true` on the existing customer; sandbox only has 0% VAT so the exact 25% taxed outcome was not reproducible there
  - sandbox also re-confirmed that omitting `vatType` on a direct line creates 0% VAT (amountCurrency == amountExcludingVatCurrency), proving the VAT lookup is essential for the taxed branch
- product-line order lines with batch-created products verified in persistent sandbox on 2026-03-21:
  - `POST /product/list` with 3 products (`{ "name": "Analysis Report", "number": ... }`, etc.) returned 201 with all 3 IDs in one call
  - `POST /invoice` with `orders[].orderLines[].product: { "id": <product-id> }` referencing the batch-created products succeeded in 201
  - readback via `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))` confirmed all 3 order lines had the correct `product.number`, `product.name`, `unitPriceExcludingVatCurrency`, and `vatType`
  - optimal flow: 3 parallel calls (`POST /product/list` + `GET /customer` + `GET /ledger/vatType`) + 1 `POST /invoice` = 4 calls total
  - with bank repair: + 1 failed invoice + 1 `GET /ledger/account` + 1 `PUT /ledger/account/{id}` + 1 retry = 7 calls total
  - also verified: `product: { "number": 9796 }` on order line does NOT resolve products by number — readback shows `product: null`; must use `product: { "id": <id> }`
  - also verified: inline product creation via invoice (product with name+number but no id) does NOT work — readback shows `product: null`
  - the 2026-03-21 production run for `Oakwood Ltd` / `909722500` used description-only lines (6 calls with bank repair) and scored 5/8 (checks 3, 4, 5 failed); the correct path was 7 calls: `GET /customer` + `GET /ledger/vatType` + `POST /product/list` (parallel) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` retry
- existing-product lookup verified in persistent sandbox on 2026-03-21:
  - `GET /product?number=9796&fields=id,number,name` returned exactly 1 result (id=84421408, number="9796") — the `number` query parameter is an exact filter
  - `GET /product?number=99999&fields=id,number,name` returned count=0, empty values — non-existent numbers return clean empty result, no error
  - `GET /product?fields=id,number&count=1000` returns all products; client-side filtering by `String(p.number)` correctly matches existing products and identifies missing ones
  - `POST /product/list` with an already-existing product number returns `422 Produktnummeret 9796 er i bruk` — this is a scored error that should be avoided when the customer is existing (products likely pre-loaded)
  - `product.number` is always a `string` type in GET responses, never a number — strict equality `=== 2626` against numeric literals will silently fail; use `String(p.number) === String(targetNum)` or `Number(p.number)`
  - the 2026-03-21 production run for `Brückentor GmbH` / `804379010` / 3 product lines (2626, 7746, 5675) / multi-VAT (25%, 15%, 0%) hit both pitfalls: (1) `POST /product/list` returned 422 because products already existed in the existing-customer account, (2) string/number comparison bug caused product lookup and vatType matching to fail silently; the optimal path was 7 calls: `GET /customer` + `GET /ledger/vatType` + `GET /product` (parallel) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201); actual run used 11 calls due to these pitfalls; final state correct: `amountExcludingVatCurrency=37200`, `amountCurrency=43452.5` (17300×1.25 + 12850×1.15 + 7050×1.0 = 21625 + 14777.5 + 7050)
