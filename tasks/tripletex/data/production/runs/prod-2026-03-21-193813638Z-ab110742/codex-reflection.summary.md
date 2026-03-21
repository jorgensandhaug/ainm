# Codex Reflection Summary

## 1. Task
Simplified year-end closing for 2025 (French prompt): depreciate 3 fixed assets (Programvare 111950/9yr, Kontormaskiner 351450/9yr, Inventar 418800/10yr) with expense account 6010 and accumulated depreciation 1209, reverse prepaid expenses (79750 on account 1700), calculate and book 22% tax provision on 8700/2920. Each depreciation as a separate voucher.

## 2. Reflection
**What went well:**
- Exact trusted-standard match identified immediately — no time wasted on spec reading
- Script written correctly on first attempt following the standard exactly
- All 8 API calls succeeded on first attempt, 0 errors
- 2-decimal rounding correctly applied (12438.89, 39050.00, 41880.00)
- Post-then-read approach for balance sheet correctly avoids manual adjustment
- French prompt correctly interpreted without language-related issues
- Missing accounts (1209, 8700) correctly identified and batch-created

**What went poorly:**
- Nothing. The run was clean and optimal.

**Mistakes:**
- None. All calls succeeded, all calculations correct.

## 3. Call Efficiency
**The run was minimal-call.** 8 calls is the theoretical minimum for this task shape when accounts 1209 and 8700 are missing (which they always are in fresh Tripletex instances).

| # | Call | Purpose | Status |
|---|------|---------|--------|
| 1 | GET /ledger/account?number=1209,6010,1700,6300,8700,2920 | Resolve account IDs, check which exist | 200 |
| 2 | POST /ledger/account/list | Batch create missing 1209+8700 | 201 |
| 3 | POST /ledger/voucher | Depreciation Programvare 12438.89 | 201 |
| 4 | POST /ledger/voucher | Depreciation Kontormaskiner 39050.00 | 201 |
| 5 | POST /ledger/voucher | Depreciation Inventar 41880.00 | 201 |
| 6 | POST /ledger/voucher | Prepaid reversal 79750 (1700→6300) | 201 |
| 7 | GET /balanceSheet | Tax calculation (post-then-read) | 200 |
| 8 | POST /ledger/voucher | Tax 272747 (22% of 1239757.26) | 201 |

**Wasted calls:** 0
**Lower-call path:** None exists. 8 calls is irreducible because:
- Account IDs must be resolved (1 GET) — `account: { number, name }` without `id` returns 422
- Missing accounts must be created (1 POST) — 1209 and 8700 never exist in fresh instances
- 3 depreciation vouchers must be separate (3 POST) — task requires "eget bilag"
- Prepaid reversal is a separate voucher (1 POST)
- Balance sheet must be read for tax calculation (1 GET) — no other way to get the pre-tax profit
- Tax voucher is the final posting (1 POST)

## 4. Root Causes
No errors or suboptimal behavior. The trusted standard was followed exactly and produced the optimal result. The standard has been validated across 3 production runs (Norwegian, Portuguese, French prompts) with consistent 8-call, 0-error execution.

## 5. Sandbox Verification
Confirmed in sandbox `kkpqfuj-amager.tripletex.dev`:
- `account: { number, name }` without `id` on voucher postings → `422 "Internt felt (account): Feltet må fylles ut."` — account IDs are always required, so the initial GET cannot be skipped
- `account: { id }` alone (without number/name) works fine for voucher postings
- No alternative lower-call path exists

## 6. Playbook Changes
- **Updated**: `./trusted-standards/simplified-year-end-closing.md` — added 3rd production verification (run 3, French prompt, ab110742)
- **Updated**: `./task-playbooks/simplified-year-end-closing.md` — added 3rd production verification (run 3, French prompt, ab110742)
- No flow or logic changes needed — the standard is already optimal

## 7. Commit
- Hash: `e24067b6`
- Message: `tripletex playbook: simplified-year-end-closing — add 3rd production confirmation (ab110742, French prompt, Programvare/Kontormaskiner/Inventar, 8 calls 0 errors), confirm post-then-read approach and 8-call minimum with missing accounts`

## 8. Reusable Heuristics
1. **Post-then-read is safer than parallel GETs with manual adjustment**: Reading the balance sheet AFTER posting all vouchers means no manual subtraction is needed — the BS already includes the posted entries. Both approaches use the same call count (8), but post-then-read eliminates a class of arithmetic errors.
2. **Account IDs are always required**: `account: { number, name }` without `id` in voucher postings always fails with 422. The initial GET /ledger/account cannot be skipped.
3. **Accounts 1209 and 8700 are always missing**: In all 3 production runs, these accounts did not exist and had to be batch-created. Always include them in the initial account lookup and be prepared to create them.
4. **Prompt language doesn't affect the flow**: The same trusted standard works identically for Norwegian, Portuguese, and French prompts. Only the asset names/amounts/lifetimes vary between runs.
5. **2-decimal rounding is critical**: Always use `Math.round(cost / life * 100) / 100`, never `Math.round(cost / life)`. Integer rounding has caused scoring failures in earlier runs.
6. **8 calls is the irreducible minimum**: For the standard year-end closing task shape with 3 assets and missing accounts, 8 calls cannot be improved upon. The only way to get 7 calls would be if all accounts already existed (which never happens in practice).
