# TASK OVERRIDE — Task 22: Register Receipt Expense Voucher

**You are running Task 22. The task is already identified. Do not classify.**

## What this task is

Register one manual voucher from an attached receipt (PDF), book it to the correct expense account with correct VAT treatment, on a named department, and upload the receipt as attachment. The prompt will:
- Name one receipt line to book (e.g., "Togbillett", "Kontorstoler", "Kaffemøte", "Forretningslunsj")
- Name a department (e.g., "Administrasjon")
- Ask for correct expense account and VAT treatment
- Provide a receipt PDF attachment

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-receipt-expense-voucher.md`
2. The trusted standard has complete payload templates for all 4 branches. Identify the branch from the receipt line keyword, fill in the values, and run.
3. **Immediately write and execute** with `bun`. Do NOT read AGENTS.md, openapi.json, or playbooks.

## The 4 branches — pick ONE based on receipt line keyword

| Receipt keyword | Branch | Account | VAT | vatType id |
|---|---|---|---|---|
| **Forretningslunsj**, **Kundemøte lunsj**, business lunch | A | 7360 | 0% (vatLocked) | don't send |
| **Kontorstoler**, **Whiteboard**, **Tastatur**, **Skrivebordlampe** | B | 6540 | 25% | from account |
| **Togbillett**, **Flybillett**, **Overnatting** | C | 7140 | **12%** (lav sats) | from account (typ. 12) |
| **Kaffemøte**, coffee meeting, course, seminar | D | 6860 | 25% | from account |

## CRITICAL: Receipt amounts are GROSS (VAT-inclusive)

**Use the receipt line amount DIRECTLY as `amountGross`. Do NOT multiply by 1.25 or 1.12.**

The receipts show "herav MVA 25%: X" meaning VAT is ALREADY INCLUDED. Production run e89025d1 multiplied 6900 × 1.25 = 8625 and failed Check 3. Correct: use 6900 directly.

## The 3 scored API calls

1. **POST /department** — create or GET existing (exact-name filter — the GET is substring search)
2. **POST /ledger/voucher?sendToLedger=true** — the voucher with 2 postings (expense row:1 + bank row:2). `sendToLedger=true` is MANDATORY — without it, voucher stays DRAFT and scorer finds nothing.
3. **POST /ledger/voucher/{id}/attachment** — upload the receipt PDF

Plus free verification GETs after each write.

## Known traps that have caused 0/10

- Missing `?sendToLedger=true` → voucher stays DRAFT → 0/10
- `department: { name: "X" }` on postings → silently null → Check 4 fails. Use `{ id: <id> }`
- `account: { number: N }` → 422. Use `{ id: <id> }`
- Account 7360 for Kaffemøte → 0/10. Kaffemøte = 6860 (meeting), NOT 7360 (representation)
- Omitting vatType on Branch B/C/D → defaults to code 0 (no VAT) → Check 3 fails
- vatType 1 (25%) on Togbillett/Overnatting → wrong VAT rate → Check 3 fails. Use account's default (12%)
- Amounts multiplied by 1.25 → Check 3 fails. Use receipt amount directly.

## If the prompt doesn't match

If the incoming prompt is NOT about booking a single receipt line as an expense voucher with department and attachment, say so and stop.
