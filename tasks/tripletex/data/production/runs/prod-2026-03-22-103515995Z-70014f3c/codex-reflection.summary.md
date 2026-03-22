# Reflection Summary — Run 70014f3c

## 1. Task

Register a Forretningslunsj (business lunch) receipt expense of 13200 kr in department Salg with correct expense account (7360) and VAT treatment (non-deductible, 0%). Attach the receipt PDF. Receipt dated 2026-03-09 from Olivia, Drammen.

## 2. Reflection

**What went well:**
- Correctly identified Branch A (Forretningslunsj → account 7360, vatLocked, no VAT deduction)
- Used receipt line amount 13200 directly as amountGross — no multiplication
- Did not send vatType (correct for Branch A where vatLocked=true)
- Department created via POST with `{ id }` reference on posting (not name)
- Account IDs resolved via GET before voucher creation
- `?sendToLedger=true` included on POST
- All row fields correct (row:1 expense, row:2 bank)
- Receipt PDF attached successfully
- Verification GETs confirmed all 5 scored fields

**What went poorly:**
- Nothing. This was a clean execution with 0 errors.

**Mistakes:**
- None. The agent read the trusted standard, identified the branch, wrote the script correctly on first attempt, and all API calls succeeded.

## 3. Call Efficiency

**The run was minimal-call.** No wasted calls.

| Call # | Method | Endpoint | Scored? | Result |
|---|---|---|---|---|
| 1 | POST | /department | Yes (write) | 201 — created "Salg" |
| 2 | GET | /ledger/account?number=7360,1920 | No (free) | 200 — resolved IDs |
| 3 | POST | /ledger/voucher?sendToLedger=true | Yes (write) | 201 — voucher booked |
| 4 | GET | /ledger/voucher/{id} | No (free) | 200 — verification |
| 5 | POST | /ledger/voucher/{id}/attachment | Yes (write) | 201 — PDF attached |
| 6 | GET | /ledger/voucher/{id} | No (free) | 200 — attachment verified |

**Scored calls: 3 writes. Free calls: 3 GETs. Total: 6 calls, 0 errors.**

**Lower-call path:** Not possible. The 3 writes (POST department, POST voucher, POST attachment) are irreducible — each creates a distinct entity. The GET for account IDs is required because `account: { number: 7360 }` returns 422.

**Prior documentation issue fixed:** The trusted standard header said "4 Write Calls" but only 3 are writes (Call 2 is a free GET). Updated to "3 Scored Writes + Free GETs".

## 4. Root Causes

No failures in this run. For reference, previous runs' root causes:
- Missing `?sendToLedger=true` (3 runs → 0/10)
- Multiplying receipt amounts by 1.25 (2 runs → 7/10)
- Wrong account for Kaffemøte (1 run → 0/10)

This run avoided all documented pitfalls by following the trusted standard exactly.

## 5. Sandbox Verification

Confirmed in sandbox:
- `account: { number: 7360 }` → 422 ("account.name: Kan ikke være null") — GET for account IDs is mandatory
- Full Branch A flow (7360, no vatType, all 4 amount fields equal) produces correct postings
- Bank reconciliation blocks voucher creation on dates with reconciled statements (sandbox-specific, not relevant to production fresh accounts)

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|---|---|
| `./trusted-standards/register-receipt-expense-voucher.md` | Fixed header "4 Write Calls" → "3 Scored Writes + Free GETs"; added run 70014f3c to production history |
| `./task-playbooks/register-receipt-expense-voucher.md` | Added run 70014f3c to production history |

No AGENTS.md changes needed — the task pattern and trusted standard path are already correctly listed.

## 7. Commit

```
a2613fcc tripletex playbook: receipt voucher — fix header to 3 scored writes + add run 70014f3c (Branch A clean run)
```

## 8. Reusable Heuristics

1. **Branch A is the simplest receipt branch**: No vatType to send, all 4 amount fields identical, no auto-VAT posting. If the receipt line is "Forretningslunsj" or "Kundemøte lunsj", it's always Branch A / account 7360.

2. **Receipt amounts are GROSS**: The line price IS the amountGross. Never multiply. This has been the #1 source of Check 3 failures across all production runs.

3. **3 irreducible writes**: POST department + POST voucher + POST attachment. No way to combine or skip any of these in a fresh account.

4. **GET accounts is mandatory but free**: `account: { number }` gives 422. `department: { name }` silently stores null. Both require prior ID resolution.

5. **Read the trusted standard, then immediately write and run the script**: This run succeeded because the agent read the standard, identified the branch, and executed without reading additional files. Previous runs timed out from reading too many files.

6. **German/multilingual prompts**: The task was in German ("Forretningslunsj-Ausgabe", "Abteilung Salg", "Aufwandskonto", "MwSt.-Behandlung") but the receipt line keyword and department name were Norwegian. Always match on the receipt line keyword, not the prompt language.
