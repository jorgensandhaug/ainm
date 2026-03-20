## 1. Task

Post-run learning pass for the scored Tripletex task: register supplier invoice `INV-2026-7606` for `Lumière SARL` (`913175212`), `72350 NOK` gross, account `6300`, deductible VAT `25%`.

## 2. Reflection

What went well:
- Original run used the correct trusted supplier-invoice family: supplier resolve, expense-account read, incoming-VAT read, XML import, partial voucher update.
- No avoidable `4xx` happened.
- Final write response was used as proof; no wasteful verification read.

What went poorly:
- The production script did not log whether it hit the existing-supplier branch or the zero-hit create branch.
- Because of that, the exact realized production call count is not provable after the fact.
- The run depended on the already-known XML template shape but did not explicitly record the branch taken.

Correct approach:
- Keep the same standard path.
- Log branch + call count in proof scripts during reflection.
- Do not change the supplier-invoice standard away from lookup-first.

## 3. Call Efficiency

Minimal-call audit:
- The original run was structurally minimal for the exact safe task shape.
- Minimal safe path is:
  - `5` calls if supplier already exists:
    1. `GET /supplier?organizationNumber=...&fields=*`
    2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
    3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`
    4. `POST /ledger/voucher/importDocument`
    5. `PUT /ledger/voucher/{id}?sendToLedger=false`
  - `6` calls if supplier lookup returns zero hits:
    1. `GET /supplier?...`
    2. `POST /supplier`
    3. `GET /ledger/account?...`
    4. `GET /ledger/vatType?...`
    5. `POST /ledger/voucher/importDocument`
    6. `PUT /ledger/voucher/{id}?sendToLedger=false`

Wasted calls:
- None in the designed flow.
- Audit gap only: production script did not log whether it actually used 5 or 6.

Lower-call path for next agent:
- None lower than lookup-first is realism-safe.
- Do not skip the initial supplier lookup just because the account looks fresh.

## 4. Root Causes

- Main weakness was observability, not API strategy.
- I did not preserve branch/call-count evidence from the production script.
- Supplier existence is the only branch that changes call count here; without logging it, post-run efficiency proof is partial.

## 5. Sandbox Verification

Persistent sandbox proof used only sandbox credentials and succeeded.

Verified exact same task shape:
- supplier `Lumière SARL`
- org `913175212`
- description `services de bureau`
- gross `72350`
- net `57880`
- VAT `14470`
- account `6300`

Measured result:
- supplier lookup returned zero hits
- branch used: create-supplier branch
- call count: `6`
- voucher id: `608864697`
- supplier id: `108282442`
- VAT id: `1`
- no extra `GET /supplierInvoice` or `GET /ledger/voucher/{id}` needed

## 6. Playbook Changes

Updated existing docs; created no new files.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md`

What changed:
- Added exact French-office-services proof.
- Recorded that zero-hit supplier branch is `6` calls.
- Reaffirmed no default verification read after final voucher write.
- Reaffirmed lookup-first supplier rule.

## 7. Commit

Commit hash:
- `833fbc82d80ab8f4e3f9ec9081da81e7adc4275f`

Commit message:
- `tripletex playbook: refine supplier invoice proof path`

## 8. Reusable Heuristics

- For real supplier-invoice scoring, optimize for a real `supplierInvoice` object, not just a balanced voucher.
- Trusted path stays: supplier lookup, account read, incoming VAT read, XML import, partial voucher update.
- If supplier lookup is zero-hit, create supplier once and reuse returned `supplier.ledgerAccount.id`; do not restart resolution.
- Do not replace lookup-first with direct `POST /supplier`; duplicate-supplier risk is real.
- Do not add `GET /ledger/voucherType`, `GET /supplierInvoice`, or `GET /ledger/voucher/{id}` by default.
- Keep imported-voucher `PUT` limited to `version` plus `postings`.
- Keep `sendToLedger=false`.
- If production proof matters later, log branch and call count inside the run script.