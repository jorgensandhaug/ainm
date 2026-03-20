## Task

Do a post-run learning pass for the supplier-invoice task from this session, prove the correct path in sandbox, update the Tripletex learning artifacts, commit the doc changes, and summarize the result.

## Reflection

What went well:
- The production side effect itself was correct.
- The chosen accounting path was right: `POST /supplier`, resolve `7300`, resolve incoming 25% VAT, resolve `Leverandørfaktura`, then `POST /ledger/voucher`.
- The booked voucher was correct: expense on `7300`, supplier liability on `2400`, auto-generated VAT on `2710`, invoice number persisted on the supplier posting.

What went poorly:
- My local verification logic after `POST /ledger/voucher` was wrong.
- I verified against expanded linked fields like `account.number`, which were not present in the write response, so the script threw even though the voucher had already been created correctly.
- I carried a weak fallback assumption that I might need an extra `GET /ledger/account?number=2400`; sandbox proof showed `POST /supplier` already returns `supplier.ledgerAccount.id`, so that read is not part of the canonical fast path.

Correct approach:
- Reuse `supplier.ledgerAccount.id` from `POST /supplier`.
- Verify the voucher write response by ids and amounts, not by human-readable linked fields.
- Only do `GET /ledger/voucher/{id}?fields=*` if the task specifically needs expanded linked fields or the write response omits a scored id/amount field.

## Root Causes

- I assumed `POST /ledger/voucher` would expand linked objects enough to expose `account.number`, `vatType.number`, and `supplier.organizationNumber`.
- I mixed two verification layers:
  - fast-path correctness proof by ids and amounts
  - richer human-readable verification that actually requires a read-back
- The trusted-standard/playbook text did not explicitly warn that supplier-invoice voucher write responses can be sparse on linked display fields.
- The common-endpoint guidance did not explicitly tell the agent to reuse `supplier.ledgerAccount.id` from `POST /supplier`.

## Sandbox Verification

I reproduced the task shape in sandbox with:
- `POST /supplier`
- `GET /ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=*`
- `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
- `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
- `POST /ledger/voucher`
- `GET /ledger/voucher/{id}?fields=*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))`

Proven facts:
- `POST /supplier` returned `supplier.ledgerAccount.id=424190921`.
- `POST /ledger/voucher` returned enough to verify by ids/amounts:
  - expense row had `accountId=424191171`, `vatTypeId=1`, `amount=15600`, `amountGross=19500`
  - supplier row had `accountId=424190921`, `supplierId=108245086`, `amount=-19500`, `invoiceNumber=REFLECT-461987`, `termOfPayment=2026-03-20`
  - VAT row had `systemGenerated=true`, `amount=3900`
- The same write response was sparse on human fields:
  - `accountNumber=null`
  - `vatTypeNumber=null`
  - `supplierOrg=null`
- The read-back expanded those fields correctly:
  - `7300`, `2400`, `2710`
  - VAT code `"1"`
  - supplier org `"990461987"`

Key proof booleans from sandbox:
- `supplierCreateReturnedLedgerAccountId=true`
- `postResponseEnoughByIds=true`
- `postResponseEnoughByHumanFields=false`

## Playbook Changes

I updated existing docs and created tracked trusted-standard files.

Changed paths:
- `tasks/tripletex/codex-environment/AGENTS.md`
- `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md`
- `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md`

What changed:
- Updated `AGENTS.md`:
  - added supplier to common endpoints
  - added supplier-invoice gotchas about reusing `supplier.ledgerAccount.id`
  - added guidance that `POST /ledger/voucher` may be sufficient by ids/amounts while linked display fields stay sparse
- Created tracked trusted standard `trusted-standards/register-supplier-invoice.md`:
  - canonical 5-call fast path
  - explicit id-based verification rules
- Created tracked trusted standard `trusted-standards/common-endpoints.md`:
  - supplier endpoint reference
  - voucher verification note about sparse linked fields
- Updated existing playbook `task-playbooks/register-supplier-invoice.md`:
  - documented that `POST /supplier` returns `ledgerAccount.id`
  - documented that `POST /ledger/voucher` is only partially expanded
  - changed verification guidance from human-field checks to id-and-amount checks

## Commit

Commit hash:
- `966a4f671b76ac482318943fbe1b340f808961eb`

Commit message:
- `tripletex playbook: tighten supplier invoice fast-path verification`

## Reusable Heuristics

- For supplier-invoice fast path, assume `POST /supplier` is enough to obtain both `supplier.id` and `supplier.ledgerAccount.id`.
- For Tripletex write responses, separate:
  - id/amount proof
  - expanded linked-field proof
- If a write response already proves scored fields by ids and amounts, stop there.
- Do not verify `account.number`, `vatType.number`, or `supplier.organizationNumber` from `POST /ledger/voucher` unless the response actually includes them.
- When a write response is sparse but not contradictory, prefer one decisive read-back over re-running the write or inventing fallback reads.