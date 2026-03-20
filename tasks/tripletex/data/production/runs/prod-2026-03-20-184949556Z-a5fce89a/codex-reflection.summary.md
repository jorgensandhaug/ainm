# 1. Task

Reverse the returned bank payment on Floresta Lda (`organizationNumber=818838018`) for the invoice line `"Horas de consultoria"` with lookup amount `8300 NOK` excluding VAT, so the invoice becomes outstanding again.

# 2. Reflection

What went well:
- Final Tripletex state was correct.
- The run used the correct write: `PUT /ledger/voucher/{paymentVoucherId}/:reverse`.
- No visible production `4xx` happened in the preserved trace.

What went poorly:
- Official score feedback says the run was inefficient despite perfect correctness (`8/8`, total `3/4`).
- The preserved trace shows only the successful 2-call path, so the missing efficiency point implies an avoidable extra call or retry happened in the scored path even though it is not visible in the final trace artifact.
- The production script still encoded the known bad fallback rule: it required `account.number=1500` before accepting an untyped payment posting. That is exactly the mistake that previously burned an extra `GET /invoice` on the same task family, and it was still present here.

Correct approach:
- Keep the winning reversal path at 2 calls.
- On the fallback matcher, ignore `account.number` completely.
- If the first decisive invoice read exposes one unique negative `Betaling: ...` posting, reverse that voucher immediately even when `type=null` and `account=null`.

# 3. Call Efficiency

The run was not minimal-call, per official score feedback.

Likely wasted call:
- `1x GET /invoice` locate read was likely wasted on a hidden rerun/retry after the local matcher rejected a correct payment posting because `account.number` was absent.

Why that is the most likely cause:
- The visible production script still required fallback `account.number=1500`.
- Earlier score-aware evidence on the same exact reversal family already proved that this over-strict rule causes one unnecessary extra locate read.
- Persistent sandbox re-proof in this follow-up reproduced the same winning voucher shape with `account=null`.

Exact lower-call path for the next agent:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<task-date>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. Filter locally to the single fully paid invoice matching prompt organization number, ex-VAT amount, and service text.
3. From that same read, accept the unique negative payment-style posting with `description` like `Betaling: ...` even if `type=null` and `account=null`.
4. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`
5. Stop. No default verification read.

# 4. Root Causes

- I trusted a supportive hint (`account.number=1500`) as a requirement.
- I left the fallback matcher stricter than the trusted standard should allow.
- I did not treat the first decisive invoice read as authoritative enough once one unique negative payment posting was already visible.
- The docs were still too soft on this point; they said `1500` was common, but not strongly enough that the matcher should ignore account expansion entirely.

# 5. Sandbox Verification

Used only the persistent sandbox credentials in a Bun TypeScript script under this run’s scripts directory.

Proof fixture:
- Product `84388624`
- Customer `108260584`
- Order `401965212`
- Invoice `2147537237` / invoice number `66`

Proof findings:
- After payment, broad `GET /invoice?...id=2147537237...` still returned `values=[]` in sandbox.
- Direct `GET /invoice/2147537237` exposed the real reverse target as:
  - `type=null`
  - `description="Betaling: Faktura nummer 66 til Reflection Reverse Null Account Customer 1774032887559 (10078)"`
  - `amountCurrency=-1000`
  - `voucherId=608833742`
  - `account=null`
- `PUT /ledger/voucher/608833742/:reverse?date=2026-03-20` returned reverse voucher `608833743`.
- Final direct invoice read showed `amountCurrencyOutstanding=1000` again.

What this proves:
- The correct low-call reversal subpath is still locate once, reverse once.
- The fallback matcher must not depend on `account.number`.
- Sandbox broad `/invoice` lag is real, but it is proof-only noise, not a production reason to add extra resolver calls.

# 6. Playbook Changes

Updated existing docs; created no new trusted standard or playbook.

Changed paths:
- `trusted-standards/reverse-customer-invoice-payment.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/reverse-customer-invoice-payment.md`

What changed:
- Tightened the fallback matcher rule from “`1500` is common” to “ignore `account.number` entirely”.
- Added new sandbox proof with invoice `2147537237` showing the correct reverse target with `account=null`.
- Re-emphasized that sandbox `/invoice` search lag must not be turned into extra production reads.

# 7. Commit

- Commit hash: `efe125a`
- Commit message: `tripletex playbook: tighten reverse payment fallback matcher`

# 8. Reusable Heuristics

- For outgoing payment reversals, use `postings(...)`, never `payments(...)`, on `GET /invoice`.
- Treat prompt ex-VAT amount as a locate key only.
- If one unique negative `Betaling: ...` posting exists, reverse it even when `type=null` and `account=null`.
- Do not add `GET /customer`, `GET /ledger/voucher/{id}`, or a default final `GET /invoice` in an exact-match scored run.
- Do not let sandbox `/invoice` search lag justify extra production resolver calls.
