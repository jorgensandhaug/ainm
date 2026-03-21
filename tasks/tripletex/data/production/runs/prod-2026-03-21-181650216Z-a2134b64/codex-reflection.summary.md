# Reflection Summary — prod-2026-03-21-181650216Z-a2134b64

## 1. Task
2025 simplified year-end closing (Portuguese prompt): record depreciation for 3 fixed assets (IT-utstyr 470650/10yr, Kjøretøy 146700/3yr, Inventar 313500/4yr) as separate vouchers using accounts 6010/1209, reverse 63300 prepaid expenses from account 1700, calculate and book 22% tax provision on accounts 8700/2920.

## 2. Reflection
**What went well:**
- Exact trusted-standard match recognized immediately — no time wasted reading AGENTS.md or openapi.json
- Script written and executed on first attempt with 0 errors
- All 8 API calls succeeded on first try
- Correct 2-decimal rounding used for depreciation (r2 function)
- Parallel GETs for accounts and balance sheet
- Missing accounts (1209, 8700) batch-created in one call
- Portuguese prompt correctly interpreted without language-related errors

**What went poorly:** Nothing. This was a clean execution.

**Mistakes:** None.

## 3. Call Efficiency
**The run was minimal-call.** 8 calls is the proven floor for this task shape when accounts 1209 and 8700 are missing (which they always are in fresh Tripletex instances).

| Call | Endpoint | Purpose |
|------|----------|---------|
| 1 | GET /ledger/account | Resolve account IDs for 1209, 6010, 1700, 6300, 8700, 2920 |
| 2 | GET /balanceSheet | Get pre-tax profit for tax calculation |
| 3 | POST /ledger/account/list | Batch create missing 1209 + 8700 |
| 4 | POST /ledger/voucher | Depreciation IT-utstyr (47065.00) |
| 5 | POST /ledger/voucher | Depreciation Kjøretøy (48900.00) |
| 6 | POST /ledger/voucher | Depreciation Inventar (78375.00) |
| 7 | POST /ledger/voucher | Prepaid reversal (63300, 1700→6300) |
| 8 | POST /ledger/voucher | Tax provision (390552, 8700→2920) |

**Wasted calls:** 0

**Lower-call path:** None exists. Sandbox investigation confirmed:
- Account IDs are always required for voucher postings — `account: { number, name }` without `id` returns `422`
- Batch account create rejects entire batch if any account already exists — must GET first
- Batch voucher creation (`POST /ledger/voucher/list`) returns `400` — each voucher must be individual
- The 5 vouchers cannot be combined (task requires separate depreciation entries)

## 4. Root Causes
No errors or inefficiencies to diagnose. The trusted standard was followed exactly and produced a perfect run.

## 5. Sandbox Verification
Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
- `POST /ledger/voucher` with `account: { number: 6010, name: "Avskrivninger" }` (no id) → `422 "Internt felt (account): Feltet må fylles ut."` — account IDs always required
- `POST /ledger/account/list` with already-existing accounts → `422 "Finnes fra før"` — entire batch rejected
- Mixed batch (existing + new) → also `422` — the first existing account fails the whole batch
- No lower-call alternative to the 2 GET + 1 POST (accounts) + 5 POST (vouchers) = 8 call path

## 6. Playbook Changes
Updated existing trusted standard and playbook (no new files created):
- `./trusted-standards/simplified-year-end-closing.md` — added 2nd production verification (Portuguese prompt, different asset configuration, 8 calls, 0 errors), added sandbox proof that account IDs are always required and batch account create rejects mixed existing+new batches
- `./task-playbooks/simplified-year-end-closing.md` — same additions

## 7. Commit
- Hash: `23a8c37a`
- Message: `tripletex playbook: simplified-year-end-closing — add 2nd production confirmation (Portuguese prompt, 8 calls, 0 errors)`

## 8. Reusable Heuristics
1. **Asset accounts in prompt are informational**: When the task specifies per-asset accounts (1210, 1230, 1240), these identify the asset class but are NOT used in depreciation postings. All depreciation goes through the specified expense account (6010) and accumulated depreciation account (1209).
2. **Account IDs are mandatory for voucher postings**: There is no shortcut via `account: { number, name }`. The GET /ledger/account call cannot be eliminated.
3. **Batch account create is all-or-nothing**: `POST /ledger/account/list` rejects the entire batch if any account already exists. Always GET first to identify which accounts are missing.
4. **Portuguese prompt language does not change the flow**: The same trusted standard applies regardless of prompt language (nb, en, es, pt, nn, de, fr).
5. **8 calls is the hard floor** for this task shape with missing accounts 1209+8700. 7 calls if both already exist.
6. **2-decimal rounding matters even for clean divisions**: Always use `Math.round(v * 100) / 100` rather than `Math.round(v)`, even when the division appears clean — future tasks may have fractional results.
