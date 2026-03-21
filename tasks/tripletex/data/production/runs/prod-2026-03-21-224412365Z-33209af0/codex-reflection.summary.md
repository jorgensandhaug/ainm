# Codex Reflection Summary

## Task

Create free accounting dimension "Prosjekttype" with values "Eksternt" and "Forskning", then book a voucher on account 7140 for 28850 kr linked to the "Forskning" dimension value. Norwegian prompt.

## Reflection

**What went well:**
- Exact trusted-standard match identified immediately (`create-free-accounting-dimension-and-book-voucher.md`)
- Trusted standard was read before writing any script (as required by AGENTS.md)
- Script followed the proven 5-call path exactly: dimension create → two value creates → account resolve → voucher post
- All 5 calls returned success (201/200) with 0 errors
- `row: 1` and `row: 2` included on voucher postings (avoiding the row-0 trap that cost a prior run 1 wasted call)
- `dimensionIndex` correctly derived from the dimension create response (returned `1`)
- Account IDs resolved via `GET /ledger/account?number=7140,1920&fields=*` and compared numerically
- Voucher linked "Forskning" via `freeAccountingDimension1: { id: 19270 }` using the correct dimension slot

**What went poorly:**
- Nothing. This was a clean, optimal execution.

**Mistakes:**
- None.

## Call Efficiency

**Verdict: Minimal-call. 5 calls, 0 errors.**

| # | Method | Endpoint | Status | Purpose |
|---|--------|----------|--------|---------|
| 1 | POST | /ledger/accountingDimensionName | 201 | Create "Prosjekttype" |
| 2 | POST | /ledger/accountingDimensionValue | 201 | Create "Eksternt" |
| 3 | POST | /ledger/accountingDimensionValue | 201 | Create "Forskning" |
| 4 | GET | /ledger/account?number=7140,1920&fields=* | 200 | Resolve account IDs |
| 5 | POST | /ledger/voucher | 201 | Book balanced voucher |

**Wasted calls:** 0

**Lower-call path:** None exists. 5 calls is the proven minimum for the 2-value dimension + voucher task shape:
- Batch value creation is not supported (sandbox-verified: `/ledger/accountingDimensionValue/list` is PUT-only, array body on POST returns 422)
- Number-only account refs on voucher postings return 422 (sandbox-verified across accounts 7000, 6590, 6860, 6300, 7300, 6340, 6540)
- Account id resolution via the single decisive GET is mandatory and cannot be bypassed

## Root Causes

No issues to diagnose. The run executed the trusted standard perfectly on the first attempt. This is the 6th consecutive perfect-efficiency production run for this task shape (after Region/Sør-Norge, Kostsenter/IT/HR, Prosjekttype/Utvikling/Internt, Marked/Bedrift/Privat, Prosjekttype/Internt/Utvikling).

## Sandbox Verification

No new sandbox investigation needed. The 5-call path has been extensively verified across prior reflection runs:
- Batch value creation: not supported (400 Method Not Allowed / 422)
- Number-only voucher accounts: not supported (422 across 7 different accounts)
- Number+name voucher accounts: not supported (422)
- Row omission: not supported (422, row 0 is system-reserved)
- Account `7140` is a new account number confirmed working in this production run

The standard is fully stable with 6 consecutive perfect-efficiency production runs across Norwegian, Portuguese, and German prompts.

## Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md` — added 6th production confirmation line (33209af0, Prosjekttype/Eksternt/Forskning/7140/28850, 5 calls 0 errors)
- `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md` — added matching 6th production confirmation line

No AGENTS.md changes needed — the trusted standard table already references this file correctly.

## Commit

- **Hash:** `52c3c2a2` (committed by concurrent reflection process)
- **Message:** `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — ...` (batch commit that included these changes alongside other playbook updates)
- **Files changed:** `trusted-standards/create-free-accounting-dimension-and-book-voucher.md`, `task-playbooks/create-free-accounting-dimension-and-book-voucher.md`

## Reusable Heuristics

1. **This task shape is solved.** 6 consecutive perfect runs across en/nb/nn/pt/de prompts and accounts 6340, 6540, 6590, 7000, 7140 confirm the 5-call standard is language-independent, account-independent, and fully stable.
2. **Always include `row: 1` and `row: 2` on voucher postings.** Row 0 is reserved for system-generated postings; omitting `row` defaults to 0 and triggers 422.
3. **Always derive `freeAccountingDimension{n}` from the returned `dimensionIndex`.** Fresh accounts typically return `1`, but the persistent sandbox has returned `2` and `3`.
4. **Always resolve account IDs via GET before voucher POST.** There is no trusted shortcut using number-only or number+name refs.
5. **Preserve prompt-provided value create order but link the voucher to the prompt-specified value by `displayName`.** The scored value is not always the first or last created — it depends on the prompt.
6. **No further sandbox investigation is needed for this task shape.** Future reflection runs should skip sandbox calls and just record the production confirmation.
