# Create Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- do not send it
- customer already exists or is resolvable in one decisive read
- products either already exist or lines are directly creatable from prompt
- prompt is a standard customer-invoice create, not payment or reversal

## Do Not Use This Standard If
- prompt requires sending after create
- prompt requires a custom multi-order workflow
- task is a correction/reversal/payment flow

## Standard Flow
1. resolve customer with one decisive `GET /customer?...&fields=*` if needed
2. resolve existing products only if prompt clearly references existing products
   - prefer `GET /product?number=<ref1>,<ref2>&fields=*` with comma-separated prompt refs (OR semantics, returns all matches in one call); sandbox-verified on 2026-03-21
   - verify the returned count matches expected; if any are missing, fall back to `GET /product?count=1000&fields=*` and filter locally by `number` and/or `name`
   - do NOT use `number=X&number=Y` (repeated query params) — non-OR semantics, returns only first value
   - do NOT use `productNumber=X&productNumber=Y` — unreliable across accounts, sometimes misses products
   - do NOT use `GET /product?ids=<ref>` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
   - if you do start with a speculative product resolver and it returns an incomplete subset, keep the broader catalog fallback inside the same script and reuse the already-resolved customer instead of restarting the whole flow
3. for product-linked create-only prompts, treat the resolved product VAT as the default line VAT
   - if the product read already returns a reusable `product.vatType.id`, either reuse that same id on the line or omit explicit line `vatType` and inherit from the product
   - only resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` when the task must force a VAT different from the resolved product, the product read lacks even a reusable `vatType.id`, or the line is not product-linked
4. `POST /invoice?sendToCustomer=false`
5. only if the write response omits decisive totals or later logic truly needs readback-only line details, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - lines under `orders[].orderLines`
- do not create lines under read-only `invoice.orderLines`
- for product-linked lines, prefer `product: { "id": ... }`
- do not send unless prompt explicitly asks
- do not hardcode output VAT code `3`
- if `GET /product?fields=*` returns `vatType` as `id`/`url`, that id is still reusable for an exact existing-product create-only invoice
- if the resolved product already carries the intended VAT, you may omit explicit line `vatType` and inherit from the product
- if you want the payload to pin the same VAT explicitly without a separate VAT lookup, reuse the resolved `product.vatType.id`
- if the filtered outgoing VAT read shows a mismatch and the desired percentage exists, force that line with `vatType: { "id": ... }`

## Reuse From Write Response
- `value.id`
- `value.invoiceNumber`
- totals from invoice write response
- sparse line objects still prove line count, not full line details
- if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and explicit line `vatType`, and the write response returns decisive totals (`amountExcludingVatCurrency` / `amountCurrency`), that is enough to stop on a create-only task

## Verification
- default verification is zero extra calls if invoice totals/existence are enough
- sparse `orderLines` alone are not a reason to fetch the invoice again when the payload already fixed the line data and the write response totals match the intended VAT mix
- use one immediate expanded `GET /invoice/{id}` only when exact scored line details still need proof or the write response is too thin to prove the financial outcome

## Known Recovery Branches
- if the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop; the run is blocked by unusable credentials, not by invoice-flow uncertainty
- if invoice creation fails with missing company bank account:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update existing invoice account with `PUT /ledger/account/{id}`
  - retry invoice write once
  - keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` after a bank-account-only validation failure
- if the one-shot product catalog read is ambiguous or incomplete, use the documented numeric recovery chain instead of guessing from approximate matches
- if a speculative `GET /product?productNumber=...` returns only a partial subset on a name-rich prompt, do the broader catalog fallback in the same script; do not re-read the customer or rerun the whole flow from the top

## OpenAPI / Sandbox Status
- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
- flow and bank-account repair proven in sandbox/playbooks
- later 2026-03-20 post-run reduction showed that the older 4-call exact-product-number path should not be treated as the floor for standard create-only existing-product invoices; exact-product-number prompts can be lower-call when the resolved products already carry reusable `vatType.id`
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=925760838` with products labeled `(3644)`, `(4934)`, `(8806)` plus exact names showed that two numeric product-resolver reads were wasted before a later catalog read settled the products; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`
- the same `851635874` run also showed a control-flow inefficiency: the product-fallback logic happened only after the first script aborted, which forced a duplicate customer read on the second script run; next time keep the fallback as an in-script callback/branch and reuse the first successful customer resolution
- re-verified on 2026-03-20 in persistent sandbox that `GET /product?productNumber=...&fields=*` can return `vatType` only as a link object (`id`/`url`), so explicit-VAT prompts may still need one filtered outgoing `vatType` lookup before the invoice write
- re-verified on 2026-03-20 in persistent sandbox that `POST /invoice?sendToCustomer=false` can return sparse `orderLines` while still returning decisive totals; when the create payload already fixes the scored line fields, that write response is enough for the minimal create-only path
- re-verified on 2026-03-20 in persistent sandbox with the exact customer/product-number shape `827304212` + `6744/2584/3739` that the proof path is still `GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`; that sandbox account exposed only outgoing VAT `0%`, so the exact mixed `25%` / `15%` / `0%` write could not be replayed there and only a 0%-analog invoice could be proven in-account
- re-verified again on 2026-03-20 in persistent sandbox with a disposable analog that exact-name product resolution plus `GET /ledger/vatType` plus `POST /invoice?sendToCustomer=false` completes the proof path in four calls after setup; that sandbox account still exposed only `0%` outgoing VAT, so mixed `25%` / `15%` / `0%` could not be replayed there
- re-verified again on 2026-03-20 in persistent sandbox with a prompt-like analog for the `909722500` Oakwood task shape: after setup, a four-call proof path `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false` resolved sandbox products whose stored numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`; the created invoice returned `amountExcludingVatCurrency=47450` and `amountCurrency=47450`, and the sandbox still exposed only `0%` outgoing VAT
- re-verified again on 2026-03-20 in persistent sandbox with an analog customer and exact-name products whose stored product numbers intentionally differed from prompt-like refs `2934` / `8699` / `1355`; after setup, the winning proof path was exactly `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`, and the created invoice returned `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760` with exact product numbers `2109`, `1175`, `9974` and VAT mix `25%` / `15%` / `0%` confirmed that the successful 4-call path still was not efficiency-optimal; the lower-call replacement for that exact shape is `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`, reusing each resolved product's `vatType.id` or inheriting VAT from the product
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that the created invoice was correct but not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write
- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account
- persistent-sandbox re-proof on 2026-03-20 with a disposable exact-number analog `customer.organizationNumber=977448240` and products `96390`, `91652`, `93273` re-confirmed the same lower-call branch after setup:
  - proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the no-extra-`/ledger/vatType` exact-number path and linked-product behavior, but not the mixed `25%` / `15%` / `0%` combination itself
- the first 2026-03-21 production run for `Ridgepoint Ltd` / `970844708` / products `Software License (3957)` + `Maintenance (8149)` + `Web Design (8092)` / VAT `25%` + `15% food` + `0% exempt` scored `0/1` because the agent spent all `300s` reading documentation and never executed the API script
- the immediate retry (second 2026-03-21 production run, cdea5ca9) for the same task succeeded with the optimal 6 API calls and 0 avoidable errors:
  - `GET /customer?organizationNumber=970844708&fields=*` resolved the customer (id=108330523)
  - `GET /product?number=3957,8149,8092&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — third production confirmation of the comma-separated `number` query approach
  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
  - `POST /invoice?sendToCustomer=false` hit the known bank-account validation
  - bank-account repair: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` -> retry `POST /invoice?sendToCustomer=false` succeeded
  - final invoice: id=2147642362, `amountExcludingVatCurrency=32350` / `amountCurrency=34912.5` (3650×1.25 + 11000×1.15 + 17700×1.0 = 4562.5+12650+17700)
  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
  - this is the second production run achieving the optimal 6-call path (3 core + 3 bank-account repair); root cause of the first failure was excessive documentation reading before execution
- persistent sandbox re-proof on 2026-03-21 with analog customer and three analog products re-confirmed that both explicit `vatType: { id: product.vatType.id }` and omitted `vatType` on product-linked lines produce identical readback; for this exact-number existing-product task shape, the `GET /ledger/vatType` call is unnecessary when the product read returns reusable `vatType.id`
- persistent sandbox re-proof on 2026-03-21 (cdea5ca9 reflection) with products `2109`, `1175`, `9974` and comma-separated `number=2109,1175,9974` query confirmed the 3-call path; invoice returned `amountExcludingVatCurrency=32350` / `amountCurrency=32350` (sandbox 0% only); readback confirmed all products linked with correct numbers, descriptions, and unit prices
- the 2026-03-21 production run for `Elvdal AS` / `810713909` / products `Nettverksteneste (7765)` + `Konsulenttimar (4369)` + `Vedlikehald (5331)` / VAT `25%` + `15% food` + `0% exempt` succeeded with 7 API calls but wasted 1 call on a speculative `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` that returned only product `5331`; the broader `GET /product?count=1000&fields=*` fallback then resolved all three by local `number` filtering
  - the wasted call confirms that `productNumber` multi-value query can return partial results in fresh production accounts even when all products exist in the catalog by their `number` field
  - the correct path for this "names + parenthetical numbers" prompt shape was `GET /customer?organizationNumber=810713909&fields=*` -> `GET /product?count=1000&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account repair -> retry = 6 calls instead of the actual 7
  - product VAT inheritance worked correctly: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%), and reusing them on the invoice lines produced correct totals `amountExcludingVatCurrency=33650` / `amountCurrency=38707.5`
  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
  - persistent sandbox re-proof on 2026-03-21 with the same amounts and catalog-read path produced the same `amountExcludingVatCurrency=33650` in 3 calls (sandbox had no bank-account issue)
- the 2026-03-21 production run for `Sierra SL` / `909007135` / products `Desarrollo de sistemas (8344)` + `Horas de consultoría (9563)` + `Informe de análisis (8060)` / VAT `25%` + `15% food` + `0% exempt` succeeded with the optimal 3 API calls and 0 errors:
  - `GET /customer?organizationNumber=909007135&fields=*` resolved the customer in one call
  - `GET /product?number=8344,9563,8060&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — first production confirmation of the comma-separated `number` query approach
  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
  - `POST /invoice?sendToCustomer=false` succeeded with `amountExcludingVatCurrency=45050` / `amountCurrency=51362.5`
  - no bank-account repair was needed
  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
  - this is the first production run achieving the theoretical 3-call minimum for the exact-number existing-product create-only invoice shape with mixed VAT
  - persistent sandbox re-proof on 2026-03-21 with analog products `2109`, `1175`, `9974` and comma-separated query confirmed the same 3-call path; invoice returned `amountExcludingVatCurrency=45050` (sandbox 0% only, so `amountCurrency=45050`); readback confirmed all products linked with correct numbers, descriptions, and unit prices
- the 2026-03-21 production run for `Montanha Lda` / `869972401` / products `Sessão de formação (7733)` + `Licença de software (6106)` + `Manutenção (1351)` / VAT `25%` + `15% food` + `0% exempt` (Portuguese prompt) succeeded with the optimal 6 API calls and 0 avoidable errors:
  - `GET /customer?organizationNumber=869972401&fields=*` resolved the customer in one call
  - `GET /product?number=7733,6106,1351&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — second production confirmation of the comma-separated `number` query approach
  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
  - `POST /invoice?sendToCustomer=false` hit the known bank-account validation (`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`)
  - bank-account repair: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` -> retry `POST /invoice?sendToCustomer=false` succeeded
  - final invoice: `amountExcludingVatCurrency=36350` / `amountCurrency=43625`
  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
  - this is the first production run achieving the optimal 6-call path (3 core + 3 bank-account repair) for the exact-number existing-product create-only invoice shape with bank-account validation
  - persistent sandbox re-proof on 2026-03-21 confirmed the product-linked invoice with same amounts (`amountExcludingVatCurrency=36350`) in sandbox (0% VAT only, so `amountCurrency=36350`)
