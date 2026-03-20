## 1. Task
Post-run learning pass for task `15`: set fixed price `375250 NOK` on project `Desarrollo e-commerce` for customer `Estrella SL` (`816896770`), set manager `Laura Rodríguez <laura.rodriguez@example.org>`, then invoice `33%` as an unsent partial billing.

## 2. Reflection
- The production attempt did not execute the Tripletex task flow. First call was `GET /project?...` and it returned proxy `403 Invalid or expired proxy token...`.
- Stopping after that `403` was correct per instructions, but it also guaranteed the required DB state would remain mostly unchanged.
- The later `2/8` score means the untouched baseline state already matched roughly two scored fields. It does not imply the write flow partially succeeded.
- The useful learning is not about payload repair on production; it is about recognizing this proxy-token `403` as a hard credential block and not over-interpreting partial correctness afterward.

## 3. Call Efficiency
- This run was not minimal-call for the required outcome, because it never reached a successful task-completion path.
- Wasted Tripletex calls: none after the first blocked `403`. I did not burn extra calls on alternate auth or endpoint guesses.
- Exact lower-call successful path for this task shape, when the first `GET /project` already proves project + customer + manager:
  1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
  2. `PUT /project/{id}`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
  4. `POST /order`
  5. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
- Conditional extra calls only if needed:
  - `GET /customer` if project read does not already prove customer
  - `POST /customer` only if missing
  - `GET /employee` if project read does not already prove manager
  - `/ledger/account` repair only after the specific missing-bank-account `422`

## 4. Root Causes
- Unusable production credentials: proxy rejected the token before any Tripletex-side task work.
- Weak follow-up interpretation: I initially treated the blocked run as simply “no side effects”, but the `2/8` score shows that a no-op can still inherit partial correctness from pre-existing DB state.
- No evidence points to a wrong fixed-price/order/invoice payload on production, because no write call was reached.

## 5. Sandbox Verification
- I re-proved the task shape in persistent sandbox with a prompt-like fixture for `Estrella SL` / `816896770` / `Desarrollo e-commerce`.
- The exact manager `Laura Rodríguez` was not present in sandbox, so I used an existing assignable manager fixture only for sandbox proof. This does not change the production path logic.
- After fixture setup, the measured successful path was exactly `5` calls:
  - `GET /project`
  - `PUT /project`
  - `GET /ledger/vatType`
  - `POST /order`
  - `PUT /order/:invoice`
- Proof result:
  - `projectId=401969688`
  - `orderId=401969690`
  - `invoiceId=2147544010`
  - `amountExcludingVatCurrency=123832.5`
  - `amountCurrencyOutstanding=123832.5`
  - filtered VAT row was `id=6`, `percentage=0`
- This confirms `375250 * 0.33 = 123832.5` is accepted directly and no follow-up `GET /invoice/{id}` is needed in the fast path.

## 6. Playbook Changes
- Updated existing files; created no new files.
- Changed [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
  - Added explicit handling for proxy `403 Invalid or expired proxy token...` as a hard credential block.
- Changed [set-project-fixed-price-and-invoice-partial-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md)
  - Added sandbox re-proof for the `375250` / `33%` shape and confirmed the 5-call path plus accepted amount `123832.5`.
- Changed [set-project-fixed-price-and-invoice-partial-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md)
  - Added the same prompt-shape re-proof and exact observed invoice totals.

## 7. Commit
- Commit hash: `d7ebc7c082dc9d587c7a0b8b53a8e0f49e19ecd8`
- Commit message: `tripletex playbook: refine blocked-token handling and partial billing proof`

## 8. Reusable Heuristics
- Treat proxy `403 Invalid or expired proxy token...` exactly like invalid session credentials: stop immediately, no retries, no auth variations.
- Do not infer successful writes from partial correctness after a blocked/no-op run; baseline state can already satisfy some scorer fields.
- For fixed-price partial-billing updates, try `GET /project?fields=*,customer(*),projectManager(*)` first; it can collapse project/customer/manager resolution into one read.
- Reuse the existing project `startDate` on `PUT /project/{id}`.
- Send percentage-derived milestone amounts as real decimals, e.g. `123832.5`; do not round to whole NOK.
- Keep `/ledger/account` out of the default path unless the invoice write proves the missing-bank-account branch.