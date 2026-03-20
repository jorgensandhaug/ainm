What went wrong: I created the wrong Tripletex object type.

The executed script at [register-supplier-invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154655744Z-a290e68c/scripts/register-supplier-invoice.ts) only did:
- `POST /supplier`
- `GET /ledger/account`
- `GET /ledger/vatType`
- `GET /ledger/voucherType`
- `POST /ledger/voucher`

So it created a supplier plus a ledger voucher. It did not create a dedicated supplier-invoice object via the supplier-invoice/incoming-invoice API family. The local docs I trusted explicitly told me to do that: [register-supplier-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md) says “register one supplier invoice as a ledger voucher”, and the playbook repeats the same assumption at [register-supplier-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md).

Why that led to `0/8`: the checker almost certainly scores against the actual supplier-invoice surface, not “any voucher with similar postings”. Since I never created that object family, the checker found no matching invoice record, so invoice number, supplier link, gross amount, expense account, VAT, etc. all missed together. That pattern points to “wrong entity created”, not “one field slightly off”.

What was not the problem:
- The VAT math was correct: `70400 / 1.25 = 56320`, VAT `14080`.
- The script got a success response and voucher id, so this was not a transport/auth failure.
- Defaulting date/due date to `2026-03-20` was not enough to explain `0/8`.

Root cause: I over-trusted a bad local standard. I treated “ledger voucher success” as equivalent to “supplier invoice registered”, and for this benchmark that equivalence was wrong. The correct fix is to replace that standard/playbook and use the real supplier-invoice flow, not `/ledger/voucher`, when the task is explicitly “register a supplier invoice”.