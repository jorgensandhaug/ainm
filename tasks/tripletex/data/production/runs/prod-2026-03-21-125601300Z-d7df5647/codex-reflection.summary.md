# Codex Reflection: prod-2026-03-21-125601300Z-d7df5647

## 1. Task
**Task 24** — Correct 4 ledger errors in the general ledger for January and February 2026:
1. Wrong account: 7300 used instead of 7000, amount 1650 NOK
2. Duplicate voucher: account 6500, amount 3100 NOK
3. Missing VAT line: account 6540, amount excl. 20950 NOK, missing VAT on account 2710
4. Incorrect amount: account 6340, 18100 NOK posted instead of 6050 NOK

## 2. Reflection
**Score: 0/1 correctness, 0 normalized_score. 0/0 checks passed. Completion reason: timeout (321s).**

The run was a complete failure. The agent:
1. Spent excessive time planning and reading openapi.json before writing the first script
2. Used `GET /ledger/posting?fields=*` which returns account objects as **sparse link stubs** (only `id` and `url`, no `number` or `name`)
3. The discovery script ran but every account number showed as `undefined` — the error analysis found zero matches
4. The agent timed out at 321s without creating a single correction voucher

**What went well:** Nothing. No correction vouchers were created.

**What went poorly:** Everything. The single discovery GET returned data but it was unusable because nested account objects were not expanded.

## 3. Call Efficiency
**The run was NOT minimal-call. It completed 1 API call (the discovery GET) but that call produced unusable data.**

**Wasted calls:** The 1 GET call was not itself wasted — it was the correct endpoint — but the wrong `fields` parameter made it useless.

**Correct lower-call path (6 calls total, proven in sandbox):**
1. `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=*,postings(*,account(*),vatType(*))&count=1000` — discover all vouchers with expanded account data
2. `GET /ledger/account?number=7000,2710&fields=*` — fetch account IDs for accounts not found in existing postings
3. `PUT /ledger/voucher/{duplicateId}/:reverse?date=2026-03-21` — reverse the duplicate voucher
4. `POST /ledger/voucher?sendToLedger=true` — correction: credit 7300, debit 7000 for 1650
5. `POST /ledger/voucher?sendToLedger=true` — correction: debit 2710 for 5237.50 (25% of 20950), credit contra
6. `POST /ledger/voucher?sendToLedger=true` — correction: credit 6340 for 12050 (18100-6050), debit contra

## 4. Root Causes
1. **Primary: `fields=*` sparse-link trap.** `fields=*` on `/ledger/posting` and `/ledger/voucher` returns nested objects (account, vatType, voucher) as link stubs with only `id` and `url`. The agent needed `fields=*,account(*)` or `fields=*,postings(*,account(*))`. The common-endpoints.md already documented `fields=*,account(*)` for the posting analysis branch, but the agent didn't consult it.
2. **No playbook.** This was a new task shape (task 24) with no existing playbook. The agent had to discover the approach from scratch, wasting time reading openapi.json.
3. **Excessive planning.** The agent spent too long reading schemas and planning before writing the first script, leaving insufficient time for error recovery after the `fields=*` issue was discovered.
4. **Used `/ledger/posting` instead of `/ledger/voucher`.** The voucher endpoint with `fields=*,postings(*,account(*),vatType(*))` is more structured for this task — it returns voucher descriptions (useful for identifying duplicates) and voucher IDs (needed for reverse).

## 5. Sandbox Verification
**Persistent sandbox 2026-03-21** confirmed the full 6-call correction flow:
- Created 4 error vouchers as test data (separate setup calls, not part of the scored path)
- Call 1: `GET /ledger/voucher?fields=*,postings(*,account(*),vatType(*))` → correctly returned all vouchers with fully expanded account numbers and names
- Call 2: `GET /ledger/account?number=7000,2710` → fetched the 2 accounts not in existing vouchers
- Call 3: `PUT /ledger/voucher/608942006/:reverse?date=2026-03-21` → 200, created reversal voucher 608942770
- Call 4: `POST /ledger/voucher` → 201, wrong-account correction voucher 608942773
- Call 5: `POST /ledger/voucher` → 201, missing-VAT correction voucher 608942775
- Call 6: `POST /ledger/voucher` → 201, incorrect-amount correction voucher 608942776
- **Zero 4xx errors. All 6 calls succeeded.**

Key sandbox findings:
- `fields=*` returns `account: { id: 424191173, url: "..." }` — no `number`, no `name`
- `fields=*,account(*)` returns full account object with `number`, `name`, `type`, etc.
- `fields=*,postings(*,account(*),vatType(*))` on `/ledger/voucher` gives complete nested expansion
- Account 2400 (Leverandørgjeld) requires `supplier: { id }` on postings — use 1920 (bank) or the actual contra account from the original voucher
- `PUT /:reverse?date=` requires the date query parameter (required by the API)
- All correction voucher postings need explicit `row: 1` and `row: 2`

## 6. Playbook Changes
**Created:**
- `./task-playbooks/correct-ledger-errors.md` — new playbook for ledger error correction tasks (wrong account, duplicate, missing VAT, incorrect amount)

**Updated:**
- `./trusted-standards/common-endpoints.md` — added CRITICAL field expansion note under Ledger Posting (documenting the `fields=*` sparse-link trap that caused the production failure); added ledger correction standard note under Ledger Voucher with the proven 6-call path
- `./AGENTS.md` — added new playbook entry to the Task Playbooks table

## 7. Commit
- **Hash:** `7103604d`
- **Message:** `tripletex playbook: add correct-ledger-errors playbook, document critical fields=* sparse-link pitfall`
- **Files changed:** `AGENTS.md`, `trusted-standards/common-endpoints.md`, `task-playbooks/correct-ledger-errors.md`

## 8. Reusable Heuristics
1. **Always use nested field expansion on posting/voucher reads.** `fields=*` is NEVER sufficient for account-level analysis. Use `fields=*,account(*)` on `/ledger/posting` or `fields=*,postings(*,account(*),vatType(*))` on `/ledger/voucher`.
2. **Prefer `/ledger/voucher` over `/ledger/posting` for error-correction tasks.** Voucher endpoint provides descriptions (for duplicate identification), voucher IDs (for reverse), and natural grouping.
3. **For duplicate vouchers, use `PUT /ledger/voucher/{id}/:reverse?date=<runDate>`.** Cleaner than a manual correction voucher and is the standard Norwegian accounting approach.
4. **For correction vouchers, use the contra account from the original error voucher.** Don't guess the contra account; extract it from the original voucher's postings (the line with negative amountGross that is not the expense account).
5. **Account 2400 postings require `supplier: { id }`.** If the error voucher uses 2400 as contra with a supplier, the correction must also include the supplier reference.
6. **VAT for Norwegian expenses is 25%.** For missing-VAT corrections: VAT = net_amount × 0.25. The correction debits account 2710 (input VAT) and credits the contra account.
7. **Consult trusted standards BEFORE writing API scripts.** The `fields=*,account(*)` pattern was already documented in common-endpoints.md but was not consulted.
8. **Don't over-plan.** For a 300s budget, start the first API call within 60s. Use the playbook directly if one exists.
