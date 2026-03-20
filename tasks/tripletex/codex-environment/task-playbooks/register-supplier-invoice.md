# Register Supplier Invoice

## Scope

Use for tasks like:
- register one supplier invoice
- prompt gives supplier identity such as name and organization number
- prompt gives invoice number, gross amount, expense account, and VAT rate
- invoice should be booked as a payable supplier voucher, not paid yet

Do not use for:
- payment/remittance tasks after the invoice is already booked
- attachment-upload / inbox-processing tasks where the prompt explicitly depends on scanned documents
- outgoing customer invoice flows

## Verified Findings

Persistent-sandbox verification on 2026-03-20 showed:
- the exact create-like path for a `21100` gross / `6300` expense / `25%` VAT supplier invoice succeeded end-to-end in `5` API calls with no follow-up verification read:
  - `POST /supplier`
  - `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
  - `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
  - `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
  - `POST /ledger/voucher`
- `POST /incomingInvoice` is not a safe default path for this task shape
  - a production attempt first failed with `422` because `orderLines[].externalId` was required
  - after fixing that field, the same endpoint failed with `403 You do not have permission to access this feature.`
  - therefore `/incomingInvoice` is a restricted/pilot path and should not be the default supplier-invoice registration flow on ordinary accounts
- `POST /ledger/voucher` succeeded when the voucher used:
  - `voucherType = Leverandørfaktura`
  - one expense posting on account `7000`
  - one supplier liability posting on the supplier ledger account `2400`
  - gross and net amounts only; Tripletex auto-generated the VAT posting
- `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*` returned the standard deductible 25% input VAT code:
  - `id=1`
  - `number="1"`
  - `displayName="1: (25%) Fradrag inngående avgift, høy sats"`
- `GET /ledger/vatType?typeOfVat=INCOMING_INVOICE&vatDate=2026-03-20&fields=*` did **not** return that standard 25% deductible code
  - therefore `INCOMING_INVOICE` is the wrong VAT lookup for ledger-voucher supplier-invoice booking
- `POST /ledger/voucher` request mapping rejected `amountVat` with:
  - `422`
  - `Request mapping failed`
  - `amountVat: Feltet eksisterer ikke i objektet.`
- `POST /supplier` returned the supplier ledger account link needed for the payable line:
  - `supplier.ledgerAccount.id` was present in the create response
  - therefore the fast path does not need an extra `GET /ledger/account?number=2400`
- the successful `POST /ledger/voucher` response and follow-up verification showed the correct accounting shape:
  - row `1`: account `7000`, VAT code `1`, `amount=50280`, `amountGross=62850`
  - row `2`: account `2400`, linked `supplier.id`, `amount=-62850`, `invoiceNumber=<prompt invoice number>`, `termOfPayment=<due date>`
  - row `0`: system-generated VAT posting on account `2710`, `amount=12570`
- the successful `POST /ledger/voucher` response was only partially expanded:
  - it already proved the fast path by ids and amounts
  - `account.number`, `vatType.number`, and `supplier.organizationNumber` stayed sparse/null in the write response
  - therefore write-response verification should key off known ids and amounts, not human-readable linked fields
- sending root-level `voucher.vendorInvoiceNumber` did not persist that value in sandbox verification
  - the reliable place for the supplier invoice number in this flow is the supplier posting field `invoiceNumber`
- persistent sandbox re-check on 2026-03-20 also proved the existing-supplier branch in `5` API calls for the same `6300 / 25% / 59800` voucher shape:
  - `GET /supplier?organizationNumber=321000002&fields=*`
  - `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
  - `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
  - `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
  - `POST /ledger/voucher`
- a production miss on 2026-03-20 showed why the existing-supplier branch must be the default for ordinary supplier-invoice prompts:
  - direct `POST /supplier` booked the invoice against a newly created duplicate supplier instead of the intended existing supplier
  - the run then got `0/8` correctness even though the voucher accounting shape itself was valid
  - the prompt wording `from the supplier ...` was not enough evidence that the supplier was absent
  - the corrected rule is: resolve by `organizationNumber` first, create only on a zero-hit lookup
- a different production miss on 2026-03-20 showed an extra failure mode after a supplier create:
  - the first script attempt created the supplier successfully, then aborted before the voucher write because the VAT resolver assumed the filtered `INCOMING` list would contain exactly one `25%` row
  - the rerun then searched suppliers by `organizationNumber`, found duplicates, and guessed with a newest-id heuristic
  - that heuristic is not correctness-safe for scored runs because the prompt did not identify the supplier by Tripletex id
  - the correct repair is to keep the fallback inside the original script, reuse the already-created `supplier.id`, and finish the voucher write without a second supplier-resolution phase

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `POST /supplier` or `GET /supplier`
   - `GET /ledger/account`
   - `GET /ledger/vatType`
   - `GET /ledger/voucherType`
   - `POST /ledger/voucher`
   - optional `GET /ledger/voucher/{id}`
2. Resolve or create the supplier
  - for ordinary prompts phrased as invoice from `the supplier <name>`, start with `GET /supplier?organizationNumber=...&fields=*`
  - if that lookup returns one exact hit, reuse it directly and do not create a supplier
  - if that lookup returns zero hits, `POST /supplier` once and reuse `supplier.id` and `supplier.ledgerAccount.id` from the write response
  - if that lookup returns several hits, continue only if exact `organizationNumber` plus exact `name` leaves one unique candidate; otherwise treat the run state as ambiguous
  - if a later branch fails after a supplier write, keep the repair inside the same process; do not restart from scratch and do not replace the captured supplier id with a search result
3. Resolve the expense account
  - usually `GET /ledger/account?number=<account-number>&isApplicableForSupplierInvoice=true&fields=*`
4. Resolve a valid incoming VAT type for the voucher date
  - `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<voucher-date>&fields=*`
  - choose the requested percentage
   - if several same-percentage candidates exist, prefer the plain numeric base code over derived codes such as `TAP-1`
5. Resolve the supplier-invoice voucher type
   - `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
   - exact-match the returned `name`
6. Create the voucher
   - `POST /ledger/voucher`
   - use one expense posting and one supplier liability posting
   - do not send `amountVat`
   - if the prompt omits both invoice date and due date, use the run date for both voucher `date` and supplier posting `termOfPayment`
7. Verify from the write response first
   - reuse `voucherType.id`
   - verify posting count
   - verify the expense posting by account id, VAT id, net amount, and gross amount
   - verify the supplier posting by supplier-ledger account id, `supplier.id`, negative gross amount, `invoiceNumber`, and `termOfPayment`
   - verify that Tripletex auto-generated one additional VAT posting
   - do not require `account.number`, `vatType.number`, or `supplier.organizationNumber` in the fast-path write response check
8. Only if the write response unexpectedly omits a scored field, do one decisive read
   - `GET /ledger/voucher/{id}?fields=*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))`

## Recommended Payload Shape

For a 25% input-VAT supplier invoice of `62850` gross booked to account `7000`:

```json
{
  "date": "2026-03-20",
  "description": "kontortenester",
  "voucherType": { "id": 9744845 },
  "postings": [
    {
      "row": 1,
      "date": "2026-03-20",
      "description": "kontortenester",
      "account": { "id": 424191158 },
      "vatType": { "id": 1 },
      "currency": { "id": 1 },
      "amount": 50280,
      "amountCurrency": 50280,
      "amountGross": 62850,
      "amountGrossCurrency": 62850
    },
    {
      "row": 2,
      "date": "2026-03-20",
      "description": "kontortenester",
      "account": { "id": 424190921 },
      "supplier": { "id": 108244534 },
      "currency": { "id": 1 },
      "amount": -62850,
      "amountCurrency": -62850,
      "amountGross": -62850,
      "amountGrossCurrency": -62850,
      "invoiceNumber": "INV-2026-4995",
      "termOfPayment": "2026-03-20"
    }
  ]
}
```

In real tasks, replace the IDs with the values resolved in the current account. Do not hardcode the sandbox IDs above.

## Amount Rules

- For 25% VAT:
  - `net = gross / 1.25`
  - `vat = gross - net`
- For the expense posting:
  - send the net amount in `amount` / `amountCurrency`
  - send the gross amount in `amountGross` / `amountGrossCurrency`
- For the supplier liability posting:
  - send the full gross amount as a negative liability
- Do not send `amountVat`
- Do not try to create the VAT posting manually when the standard VAT code can generate it automatically

## Invoice Number Rules

- Put the supplier invoice number on the supplier liability posting field `invoiceNumber`
- Do not rely on root-level `voucher.vendorInvoiceNumber` for this flow
- If the prompt gives no due date and the task does not score it separately, using the voucher date as `termOfPayment` is the conservative fallback

## Exact-Match Fast Path

- For a prompt that gives:
  - one supplier name and organization number
  - one supplier invoice number
  - one gross amount
  - one expense account number
  - one explicit VAT percentage
- the winning flow is minimal-call for the common existing-supplier shape:
  1. `GET /supplier?organizationNumber=...&fields=*`
  2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`
  4. `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
  5. `POST /ledger/voucher`
- only switch to `POST /supplier` when that first supplier lookup returns zero hits
- do not skip the supplier lookup just because the account is otherwise fresh-seeming; the prompt may still target an already-existing supplier
- do not restart the script after a successful supplier create just because a later local resolver needs refinement; keep that refinement in-script and preserve the captured supplier id
- stop from the write response if it already proves the scored fields by ids and amounts
- do not spend an automatic verification `GET` unless the response is unexpectedly sparse

## Avoidable Mistakes

- Do not default to `POST /incomingInvoice`; it can be unavailable even when the voucher path works
- Do not default to `POST /supplier` for an ordinary register-supplier-invoice prompt when the prompt identifies `the supplier` by organization number; that can create a duplicate and miss the intended target supplier
- Do not use `typeOfVat=INCOMING_INVOICE` for ledger-voucher VAT selection
- Do not send `amountVat` on `POST /ledger/voucher`
- Do not place the supplier invoice number only on root `voucher.vendorInvoiceNumber`
- Do not create the supplier liability posting without `supplier: { "id": ... }`
- Do not book the supplier liability line to a general liability account without also linking the supplier object
- Do not skip a decisive `GET /supplier?organizationNumber=...&fields=*` when the task is to register an invoice from a named supplier and the prompt does not explicitly say the supplier must be created
- Do not restart from scratch after `POST /supplier` succeeds; keep later repair branches such as VAT-type disambiguation inside the same script
- Do not search suppliers and guess by newest id, active flag, or name tie-break once duplicate prompt-matching suppliers exist; that state is ambiguous unless you already captured the exact supplier id earlier in the same run

## Verification Shape

- Expect `201 Created`
- Expect a wrapper of shape `{"value": {...}}`
- The `POST /ledger/voucher` response can already prove:
  - voucher `id`
  - voucher type id
  - posting count
  - expense posting account id and VAT id
  - supplier posting account id and supplier id
  - invoice number and due date on the supplier posting
  - the auto-generated VAT posting
- The same write response may still omit expanded linked fields such as `account.number`, `vatType.number`, and `supplier.organizationNumber`
- Reuse that response instead of doing `GET /ledger/voucher/{id}` unless the write response unexpectedly omits a scored field
