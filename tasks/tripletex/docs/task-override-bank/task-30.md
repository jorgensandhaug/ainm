# TASK OVERRIDE — Task 30: Simplified Year-End Closing (Forenklet Årsoppgjør)

**You are running Task 30. The task is already identified. Do not classify.**

## What this task is

Book depreciation, reverse prepaid expenses, and calculate/book tax expense for fiscal year 2025. The prompt will contain:
- 2–4 fixed assets with cost, useful life, and asset accounts
- A prepaid expense reversal (typically account 1700)
- Tax expense at 22% on specified accounts
- "Bokfør hver avskrivning som et eget bilag" = each depreciation as a separate voucher

## What to read and execute

1. **Read ONLY** `./trusted-standards/simplified-year-end-closing.md` — this is the complete, verified flow
2. **Immediately write and execute** a TypeScript script with `bun`. Do NOT read any other files (not AGENTS.md, not openapi.json, not the playbook)
3. The trusted standard has the exact API flow, account numbers, calculation formulas, and pitfalls

## Critical instructions the trusted standard covers but you MUST NOT skip

- **Phase 0: Activate the year-end module FIRST** — `POST /company/salesmodules` with `{ "name": "YEAR_END_REPORTING_AS" }`. This has NEVER been done in any production run. It is the #1 hypothesis for why checks 4+5 always fail.
- **Use `r2()` rounding** — `Math.round(v * 100) / 100` for ALL depreciation amounts. Integer rounding causes scoring failures.
- **Use accounts 8700/2920** for tax expense (as the task specifies)
- **Post-then-read balance sheet** — read the balance sheet AFTER posting depreciation + prepaid vouchers, range 3000–8299 (excludes tax accounts)
- **Result disposition is MANDATORY** — use 8800/2050, NOT 8960
- **Phase 6: Final verification GETs** — `GET /yearEnd`, balance sheet, and vouchers for diagnostics

## Known traps

- Account 1209 does NOT exist in fresh Tripletex — must be created
- `POST /ledger/voucher/list` is PUT-only (returns 400) — post each voucher individually
- Row 0 is system-reserved — start at row 1
- `account: { number: N }` without `id` → 422. Always resolve IDs via `GET /ledger/account` first
- Do NOT batch-create accounts that already exist — 422 "Finnes fra før"
- `dateTo` in balance sheet is exclusive — use `YYYY+1-01-01` to include December

## If the prompt doesn't match

If the incoming prompt is clearly NOT about year-end closing / depreciation / tax booking, say so and stop immediately. Do not attempt to execute.
