# Create Product

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one new product
- prompt directly gives name and price
- product is a standard outgoing-sales product
- task does not require advanced product setup

## Do Not Use This Standard If
- prompt requires inventory/stock behavior
- prompt requires special product accounting fields
- task depends on existing linked entities
- VAT setup is ambiguous and prompt requires an exact percentage not implied by account defaults

## Standard Flow
1. if prompt requires exact output VAT selection, `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
2. `POST /product`
3. verify directly from write response
4. stop

## Payload Rules
- send only prompt-required fields
- usually:
  - `name`
  - `number` when the prompt gives a product number
  - `priceExcludingVatCurrency` or the exact corresponding price field required by prompt/playbook
- if exact VAT is required, resolve `vatType` from filtered outgoing VAT list on the real date
- do not rely on omitting `vatType` even if a sandbox account auto-fills a 0% default
- do not hardcode VAT code `3`
- do not use unfiltered VAT catalog
- do not search for a book-specific product subtype or extra accounting field just because the prompt says "0% for books"; still pick the matching 0% row from the filtered `OUTGOING` result
- if the requested VAT percentage is absent from the filtered `OUTGOING` result, treat the task as blocked in that account; do not substitute a same-percentage code from the broader catalog

## Reuse From Write Response
- `value.id`
- returned product number/name/price/vat fields

## Verification
- zero extra calls if write response proves scored fields
- if a VAT lookup was needed, keep it to one decisive `GET`

## Known Recovery Branches
- if product create rejects VAT type, re-check against filtered `OUTGOING` VAT list only
- if filtered `OUTGOING` still does not contain the requested percentage, stop instead of guessing another `vatType`
- if a sandbox-only shortcut without `vatType` appears to auto-fill the desired VAT, do not promote that to the trusted path for scored exact-VAT tasks

## OpenAPI / Sandbox Status
- `/product` verified in `./openapi.json`
- VAT selection rule proven in sandbox/playbooks
