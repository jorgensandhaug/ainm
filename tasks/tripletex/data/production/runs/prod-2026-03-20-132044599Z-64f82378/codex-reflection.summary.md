## 1. Task

Post-run learning pass for the exact production task: create order for existing customer/products, invoice it, register full payment, then update learning artifacts and commit only doc/playbook changes.

## 2. Reflection

What went well:
- Production execution itself was correct and clean.
- The Tripletex write path used the right dependency order and reused write responses.
- No unnecessary Tripletex verification `GET` was added after `POST /order`, `PUT /order/{id}/:invoice`, or `PUT /invoice/{id}/:payment`.
- Payment amount was taken from invoice outstanding, not from the prompt ex-VAT sum.

What went poorly:
- I wasted local startup time on `br list`; that was irrelevant to a scored Tripletex run.
- I did broader local spec reading than necessary before coding.
- The existing playbook did not state the clean exact-match fast path explicitly enough, so the run relied on judgment instead of a sharper documented default.

Correct approach:
- Treat this task shape as an exact-match playbook run.
- Confirm only the exact endpoint blocks and referenced schemas.
- Use the 6-call Tripletex path when first product-number lookup succeeds.
- Skip generic repo rituals entirely.

## 3. Root Causes

- Instruction collision: a generic repo ritual instruction pulled attention away from the Tripletex project rule that scored runs must avoid unrelated tooling.
- Documentation gap: the order/invoice/payment playbook had the pieces, but it did not explicitly lock in the clean 6-call fast path.
- Process gap: the playbook did not say strongly enough that a successful first `/product?productNumber=...` read should terminate product resolution immediately.

## 4. Sandbox Verification

Sandbox proof used only sandbox credentials and a Bun TypeScript script in the allowed run scripts directory.

Observed facts:
- `POST /order` still returned `orderLines=[]` in the write response.
- `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded directly in current sandbox state.
- Current sandbox `OUTGOING` VAT result was VAT type `id=6`, `number=6`, `percentage=0`.
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable payment type `32813748` `Betalt til bank` with `debitAccount.number=1920` and `creditAccount=null`.
- `PUT /invoice/{id}/:payment` reduced outstanding amount to `0`.

Concrete sandbox result:
- customer `108244354`
- order `401957080`
- invoice `2147526155`
- invoice number `14`
- outstanding before payment `56350`
- remaining after payment `0`

## 5. Playbook Changes

Updated existing artifacts; no new playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [create-order-invoice-and-register-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md)

Changes made:
- Added an explicit rule in `AGENTS.md` to ignore generic repo rituals like `br list` during scored Tripletex runs.
- Updated the order/invoice/payment playbook with the proven clean exact-match path:
  - 6 Tripletex API calls when first product-number lookup succeeds
  - no fallback `/product?ids=...` read if first product-number read already resolves both products
  - explicit reminder that invoice outstanding can differ materially from prompt ex-VAT totals

## 6. Commit

- Commit hash: `e97b31cf92cdaa521c898242d1b5122f2406a3ca`
- Commit message: `tripletex playbook: tighten order invoice payment fast path`

## 7. Reusable Heuristics

- For scored Tripletex runs, project-specific efficiency rules override generic repo rituals.
- Existing customer + existing products + order + invoice + full payment is a playbook task; keep local spec reading narrow.
- If `GET /product?productNumber=...` already resolves all target products, stop immediately.
- Never use prompt ex-VAT totals as payment amount; always pay invoice outstanding from the invoice write response.
- `POST /order` returning `orderLines=[]` is not evidence of failure.
- A payment type with `creditAccount=null` can still be correct; prefer `19xx` debit accounts, especially `isBankAccount=true` or `isInvoiceAccount=true`.