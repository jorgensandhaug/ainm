# Codex Reflection — Run 564307fb

## Task

Create and send an invoice to the customer Blueshore Ltd (org no. 987928921) for 40600 NOK excluding VAT. The invoice is for Maintenance.

## Reflection

**What went well:**
- Correctly identified this as a "create and send" task and matched the right trusted standard (`create-and-send-customer-invoice.md`)
- Correctly identified existing customer via English definite article "the customer"
- Used description-only line (no product numbers in prompt) — no product lookup needed
- Parallelized customer + VAT reads
- Correctly resolved 25% outgoing VAT (vatType.id=3)
- Bank-account repair retained customer.id and vatType.id in memory — no re-reads
- Final state correct: amountExcludingVatCurrency=40600, amountCurrency=50750 (40600×1.25)

**What went poorly:**
- Read wrong trusted standard first (`create-customer-invoice.md` instead of `create-and-send-customer-invoice.md`), then playbook, then AGENTS.md — wasted context/time
- AGENTS.md line 36 explicitly warns: "After reading the matched standard, immediately write and execute the script. Do not also read AGENTS.md, openapi.json, the playbook, or any other file."
- Used reactive bank-account repair per the (outdated) create-and-send standard advice, producing 1 avoidable 422 error + 1 extra write

## Call Efficiency

**The run was NOT minimal-write.** It used 3 writes and 1 error when proactive bank-account check would have achieved 2 writes and 0 errors.

### Actual run (reactive — 7 calls, 3 writes, 1 error):
1. `GET /customer?organizationNumber=987928921&fields=*` → 200 (free, parallel)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` → 200 (free, parallel)
3. `POST /invoice?sendToCustomer=true` → 422 (bank account missing) — **WASTED WRITE + ERROR**
4. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free)
5. `PUT /ledger/account/498367178` → 200 (write)
6. `POST /invoice?sendToCustomer=true` → 201 (write)
7. `GET /invoice/{id}?fields=*,...` → 200 (free verification)

### Optimal path (proactive — 6 calls, 2 writes, 0 errors):
1. `GET /customer?organizationNumber=987928921&fields=*` → 200 (free, parallel)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` → 200 (free, parallel)
3. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free, parallel)
4. `PUT /ledger/account/{id}` → 200 (write, conditional — only if bankAccountNumber falsy)
5. `POST /invoice?sendToCustomer=true` → 201 (write — succeeds on first try)
6. `GET /invoice/{id}?fields=*,...` → 200 (free verification)

**Savings: 1 fewer write, 1 fewer error, 1 fewer total call.**

## Root Causes

1. **Outdated standard advice**: The create-and-send trusted standard (line 103) said "do not preemptively add GET /ledger/account" based on a 2026-03-21 analysis that counted GETs as non-free calls. Under the current scoring rules (GETs are free, 4xx errors cost penalty), the proactive approach is strictly better or equal in all cases.

2. **Standard inconsistency**: The create-only invoice standard already recommended proactive bank-account check (updated 2026-03-22), but the create-and-send standard still recommended reactive. Both standards now recommend proactive.

3. **Reading wrong standard first**: The agent read `create-customer-invoice.md` before realizing the task said "send". The AGENTS.md table clearly maps "send" keywords → `create-and-send-customer-invoice.md`.

## Sandbox Verification

- **Proactive 3-way parallel**: `[GET /customer, GET /ledger/vatType, GET /ledger/account]` completed in 434ms
- Bank account already configured in sandbox (from prior runs) — no PUT needed
- `POST /invoice?sendToCustomer=true` succeeded on first try (201)
- Invoice: id=2147694983, invoiceNumber=603, amountExcludingVatCurrency=12345, amountCurrency=15431.25
- Sandbox now has full VAT types: 3(25%), 31(15%), 32(12%), 5(0%), 52(0%), 6(0%)
- `isSent` field does not exist on invoice response — confirmed via `fields=*` readback; send is confirmed by successful POST with `sendToCustomer=true`

## Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `./trusted-standards/create-and-send-customer-invoice.md` | Added step 3b (proactive bank-account check) to Standard Flow; reversed line 103 advice from "don't preemptive" to "DO proactive"; added Blueshore Ltd production confirmation; updated sandbox status section |
| `./task-playbooks/create-and-send-customer-invoice.md` | Replaced "Key Finding: Company Bank Account Registration Is A Repair Branch" with "Key Finding: Proactive Bank-Account Check (Preferred)" + reactive fallback; added step 2b to Minimal Flow; reversed pitfall about preemptive checking; updated Spanish no-VAT example with optimal proactive path |
| `./AGENTS.md` | Added proactive bank-account check bullet for create-and-send tasks; updated fresh-account canonical path to include parallel GET /ledger/account |

## Commit

```
dbe6c0f9 tripletex playbook: create-and-send invoice — proactive bank-account check now recommended (Run 564307fb)
```

## Reusable Heuristics

1. **GETs-are-free makes proactive checking strictly dominant**: When GETs are free from scoring and 4xx errors cost penalty, any "check before write" pattern that adds only free GETs is worth it. This applies to bank-account checks and potentially to other validation-first patterns.

2. **Proactive bank-account check for ALL invoice flows**: Both create-only and create-and-send invoice standards now recommend proactive bank-account check. The pattern is always: parallelize `GET /ledger/account?isBankAccount=true&fields=*` with other reads → conditional `PUT` if `bankAccountNumber` is falsy → then `POST /invoice`. This saves 1 write + 1 error in ~70% of fresh-account production runs.

3. **Standard disambiguation matters**: Reading the wrong standard wastes context and time. For "send" tasks, always check the AGENTS.md table first: any prompt containing "send" / "envíe" / "envie" / "envoyez" / "senden" → `create-and-send-customer-invoice.md`, not the create-only standard.

4. **Don't over-read**: After finding the matching trusted standard, read it and immediately write the script. Don't also read AGENTS.md, playbooks, or openapi.json. Two production runs scored 0% by spending the entire 300s budget on file reading.

5. **`isSent` field doesn't exist**: The invoice object has no `isSent` field. Treat a successful `POST /invoice` with `sendToCustomer=true` as confirmation of sending. Don't waste time trying to verify the send via readback.
