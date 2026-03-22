# Score-Aware Reflection — prod-2026-03-22-110247098Z-d1b91499

## 1. Task Attribution

- **Attributed task**: T11 (register supplier invoice, text-only)
- **Task tier**: T2 (tasks 9-18), **max score = 4**
- **Prompt**: Register invoice INV-2026-8735 from Brightstone Ltd (org 913701585) for 8500 NOK incl. VAT on account 7100 (office services) with 25% input VAT
- **Attempt**: #27 for T11
- **Best score before**: 1/4 (25%)
- **Best score after**: 1/4 (25%) — **no improvement**
- **Inference status**: ambiguous (candidate_count=3 across batch of 4 tasks)

## 2. Correctness Verdict

**Correctness < 1 — the final Tripletex state was wrong.**

Score stayed at best=1/4 despite completing the full importDocument+book flow. This run scored ≤1/4. The fundamental issue is that **account 7100 is locked to vatType 0** ("Ingen avgiftsbehandling" / no VAT treatment), making it impossible to post 25% input VAT on this account.

The final voucher state was:
- Debit: account 7100 @ 8500 (full gross, **no VAT type**, no VAT split)
- Credit: account 2400 @ -8500 (supplier liability)
- **No system-generated VAT posting** — because vatType=0 means no VAT

The SI entity from importDocument had correct XML-derived amounts (amount=-8500, amountExcludingVat=-6800), but the voucher's actual accounting postings had **zero VAT deduction**. The task explicitly required "correct input VAT (25%)" — the final state does not achieve this.

Additionally, a **duplicate supplier** was created (id 108589631 from the first POST, while id 108589322 was used from the GET lookup). This orphaned supplier may have contributed to the `ambiguous` inference status (candidate_count=3).

## 3. Efficiency Verdict

**Far from minimal.** The run made ~15 API calls across 4 script executions (plus 1 curl), with 3 avoidable errors:

| # | Call | Status | Wasted? | Why |
|---|------|--------|---------|-----|
| 1 | POST /supplier | 201 | **Yes** | Created duplicate supplier (108589631) — used GET-found 108589322 instead |
| 2 | GET /ledger/account (with isApplicableForSupplierInvoice=true) | 200 empty | **Yes** | Filter excluded account 7100 (vatLocked=true), crashed script |
| 3 | GET /ledger/account (curl, no filter) | 200 | **Yes** | Diagnostic call duplicated by next script run |
| 4 | GET /supplier | 200 | OK | Lookup after crash |
| 5 | GET /ledger/account (no filter) | 200 | OK | Found account id |
| 6 | POST importDocument | **422** | **Yes** | PaymentMeansCode=30 without PayeeFinancialAccount → BR-61 violation |
| 7 | GET /supplier | 200 | **Dup** | Re-executed on script re-run |
| 8 | GET /ledger/account | 200 | **Dup** | Re-executed on script re-run |
| 9 | POST importDocument | 201 | OK | Succeeded after PaymentMeans fix |
| 10 | GET /supplierInvoice | 200 | OK | Verification |
| 11 | PUT postings (vatType:{id:1}) | **422** | **Yes** | Account 7100 locked to vatType 0 |
| 12 | PUT postings (no vatType) | 200 | OK | Workaround |
| 13 | PUT book | 200 | OK | Booking |
| 14 | GET /ledger/voucher | 200 | OK | Verification |
| 15 | GET /supplier | 200 | OK | Verification |

**Avoidable errors**: 2 × 422 (importDocument BR-61, PUT vatType lock)
**Wasted writes**: 1 (duplicate POST /supplier)
**Wasted GETs**: 4 (filter fail, curl, 2 re-runs)
**Ideal**: 8 calls (4 writes + 4 verification GETs), 0 errors

## 4. Likely Root Cause

**Primary**: Account 7100 (Bilgodtgjørelse oppgavepliktig) is vatLocked to vatType 0 across both sandbox and production. When the agent encountered the 422 on PUT postings with vatType:{id:1}, it worked around the issue by omitting vatType entirely and posting the full gross amount (8500) on both sides. This produced a voucher with **no VAT treatment at all** — the exact opposite of what the task required.

The correct approach for account 7100 + 25% VAT is still unknown. Possibilities:
1. The importDocument XML VAT amounts might be sufficient for the scorer (SI entity has correct net/gross), and the voucher posting failure is acceptable — but then the best score should be higher than 1/4
2. Account 7100 might need to be unlocked or the prompt's account mapping might be a deliberate test of edge-case handling
3. A different posting structure might work — e.g., using `amountGross` with correct net/gross split even without vatType
4. The fact that T11's best is only 1/4 across 27 attempts with various accounts (6300, 6500, 6540, 7100) suggests the problem may be deeper than the vatType lock — possibly the importDocument approach itself has a scoring ceiling

**Secondary**: 3 avoidable 422 errors:
- `isApplicableForSupplierInvoice=true` filter rejects vatLocked accounts — the trusted standard recommends this filter but it fails for 7100
- PaymentMeansCode=30 requires PayeeFinancialAccount per PEPPOL BR-61 — when prompt has no bank account, a placeholder IBAN must be included
- Account 7100 rejects vatType:{id:1} — the trusted standard says to hard-code vatType 1 for 25% but doesn't account for vatLocked accounts

**Tertiary**: Duplicate supplier created (108589631) because the first script attempt did POST /supplier before crashing. The subsequent GET lookup found a different pre-existing supplier (108589322). Fresh production accounts may have pre-seeded suppliers, or two suppliers with the same org number were created.

## 5. What Went Right

1. **importDocument response shape handled correctly** — `.values[0]` not `.value`, avoiding the crash that caused 0/8 in the d49da665 run
2. **Two-step PUT booking** — correctly separated PUT postings (sendToLedger=false) from PUT book (sendToLedger=true)
3. **PaymentMeans with PaymentID** — included in XML (after fixing BR-61), setting kidOrReceiverReference on the SI entity
4. **Buyer org number** — used 987654325 (valid mod11), avoiding the 000000000 PEPPOL validation error
5. **SI verification GET** — confirmed SI entity was created with correct amounts before proceeding
6. **Recovery after errors** — agent recovered from all 3 errors and completed the flow, rather than timing out

## 6. What To Change Next Time

### Critical fixes for the trusted standard

1. **Drop `isApplicableForSupplierInvoice=true` filter** from `GET /ledger/account` — it silently excludes vatLocked accounts like 7100, causing empty results and script crashes. Use `GET /ledger/account?number=...&fields=*` without this filter.

2. **Always include PayeeFinancialAccount in PaymentMeans** — even when the prompt has no bank account, PaymentMeansCode=30 requires it per PEPPOL BR-61. Use a placeholder like `NO0000000000000` or `NO9999999999999`.

3. **Handle vatLocked accounts** — before setting vatType on postings, check if the account's `legalVatTypes` includes the desired vatType. If the account is locked to vatType 0:
   - Option A: Still set the correct net/gross amounts on the posting (amount=net, amountGross=gross) but omit vatType — test whether Tripletex auto-calculates VAT from the amount difference
   - Option B: Use the account's locked vatType (0) but set amounts correctly
   - Option C: Skip the PUT postings step entirely and rely on importDocument's auto-generated postings
   - **All options need sandbox verification** to determine which produces the correct final state

4. **GET /ledger/account with fields including vatType and vatLocked** — add `vatType,vatLocked,legalVatTypes` to the fields request so the agent can detect the lock before attempting the PUT postings. This avoids the 422.

5. **Fresh accounts may have pre-existing suppliers** — the first script should do `GET /supplier?organizationNumber=...` before POST to avoid duplicate creation. The trusted standard says "create-first for fresh accounts" but the candidate_count=3 ambiguity suggests duplicate entities hurt scoring.

### Efficiency improvements

6. **Single script execution** — the agent ran the script 4 times due to incremental fixes. A more robust script that handles edge cases (empty account results, vatLocked accounts) in a single execution would avoid duplicate GETs and the orphaned POST /supplier.

7. **Pre-flight account check** — GET the expense account FIRST (before POST /supplier) and check its vatType. If vatLocked to 0, adjust the posting strategy before reaching the PUT step. This prevents the expensive error-then-fix cycle.
